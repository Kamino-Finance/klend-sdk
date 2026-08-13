import {
  FlashBorrowType,
  MultiplyObligation,
  PROGRAM_ID,
  RepayWithCollIxsResponse,
  determineRepayWithCollFlashBorrowType,
  getComputeBudgetAndPriorityFeeIxs,
  getRepayWithCollIxs,
  getScopeRefreshIxForObligationAndReserves,
  getUserLutAddressAndSetupIxs,
  getCurrentLedgerInstant,
} from '@kamino-finance/klend-sdk';
import { KswapSdk, RouteOutput } from '@kamino-finance/kswap-sdk';
import { Account, address, Address, none, Rpc, SolanaRpcApi } from '@solana/kit';
import { AddressLookupTable, fetchAllAddressLookupTable } from '@solana-program/address-lookup-table';
import Decimal from 'decimal.js';
import { Scope } from '@kamino-finance/scope-sdk/';

import { getConnectionPool } from '../utils/connection';
import {
  JLP_MARKET,
  JLP_MARKET_LUT,
  JLP_MINT,
  JLP_RESERVE_JLP_MARKET,
  USDC_MINT,
  USDC_RESERVE_JLP_MARKET,
} from '../utils/constants';
import { getFlashBorrowTypeFromEnv } from '../utils/env';
import { executeUserSetupLutsTransactions, getMarket } from '../utils/helpers';
import { getKaminoResources } from '../utils/kamino_resources';
import { getKeypair } from '../utils/keypair';
import { getKswapQuoter, getKswapSwapper, getTokenPriceFromBirdeye, KSWAP_API } from '../utils/kswap_utils';
import { sendAndConfirmTx, simulateTx } from '../utils/tx';

/**
 * Repay-with-collateral on the JLP/USDC market via KSwap, supporting both flash-borrow paths:
 *
 *  - `'debt'`: flash borrow USDC → repay USDC debt → withdraw JLP → swap JLP→USDC → flash repay USDC.
 *  - `'coll'`: flash borrow JLP  → swap JLP→USDC → repay USDC debt → withdraw JLP → flash repay JLP.
 *
 * The SDK picks a viable side automatically via `determineRepayWithCollFlashBorrowType` — it
 * verifies `isFlashLoanEnabled` and per-side required liquidity for the repay amount, then
 * prefers coll when both are viable. Set `FLASH_BORROW_TYPE=coll|debt` to override for testing.
 *
 * Account-list optimisation:
 *  - User lookup table (`getUserLutAddressAndSetupIxs`), extended with the JLP/USDC reserve pair.
 *  - Market-wide `JLP_MARKET_LUT`.
 *  - Repay-with-coll pair LUTs from the Kamino CDN (`kaminoResources.repayWithCollLUTs`).
 *
 * Best-route selection: KSwap returns multiple routes; we simulate each (klend LUTs attached) and
 * pick the one with the highest realised price.
 */

function getRepayWithCollLuts(
  repayWithCollLUTs: Record<string, string>,
  collMint: Address,
  debtMint: Address
): Address[] {
  const collDebtKey = `${collMint}-${debtMint}`;
  const debtCollKey = `${debtMint}-${collMint}`;
  const luts: Address[] = [];
  if (repayWithCollLUTs[collDebtKey]) {
    luts.push(address(repayWithCollLUTs[collDebtKey]));
  }
  if (repayWithCollLUTs[debtCollKey]) {
    luts.push(address(repayWithCollLUTs[debtCollKey]));
  }
  return luts;
}

type SimulatedRoute = {
  route: RepayWithCollIxsResponse<RouteOutput>;
  routerType: string;
  lutAddresses: Address[];
};

async function simulateAndSelectBestRoute(
  rpc: Rpc<SolanaRpcApi>,
  wallet: Address,
  routes: RepayWithCollIxsResponse<RouteOutput>[],
  klendLutKeys: Address[],
  klendLutAccounts: Account<AddressLookupTable>[]
): Promise<SimulatedRoute> {
  console.log(`\nSimulating ${routes.length} route(s)...`);

  const results = await Promise.all(
    routes.map(async (route, i) => {
      const routerType = route.quote?.routerType ?? 'unknown';
      const allLuts = [...route.lookupTables, ...klendLutAccounts];
      try {
        const sim = await simulateTx(rpc, wallet, route.ixs, allLuts);
        if (!sim || sim.value.err) {
          console.log(`  [${i}] ${routerType}: FAILED — ${JSON.stringify(sim?.value?.err)}`);
          return undefined;
        }
        console.log(`  [${i}] ${routerType}: passed`);
        return {
          route,
          routerType,
          lutAddresses: [...route.lookupTables.map((l) => l.address), ...klendLutKeys],
        } as SimulatedRoute;
      } catch (e) {
        // Stringify carefully — errors may carry BigInt fields that break default toString.
        const msg = e instanceof Error ? e.message : String(e);
        console.log(`  [${i}] ${routerType}: ERROR — ${msg}`);
        return undefined;
      }
    })
  );

  const passing = results.filter((r): r is SimulatedRoute => r !== undefined);
  if (passing.length === 0) {
    throw new Error(
      'No KSwap route passed simulation. Common causes:\n' +
        '  - Tx > 1232 bytes after LUT compression: try `FLASH_BORROW_TYPE=coll` (different ix layout),\n' +
        '    or set a smaller `preferredMaxAccounts` on the swapper.\n' +
        '  - "TooManyAccountLocks": the chosen router adds too many writable accounts; the next-best\n' +
        '    router should still pass if it returned a route.\n' +
        '  - Slippage too tight relative to current pool depth: bump `slippageBps`.'
    );
  }

  // Pick the best route by realised price (output/input).
  const best = passing.reduce((bestSoFar, candidate) => {
    const bq = bestSoFar.route.quote;
    const cq = candidate.route.quote;
    if (!bq || !cq) return bestSoFar;
    const bestPx = new Decimal(bq.amountsExactIn.amountOut.toString()).div(bq.amountsExactIn.amountIn.toString());
    const candidatePx = new Decimal(cq.amountsExactIn.amountOut.toString()).div(cq.amountsExactIn.amountIn.toString());
    return candidatePx.gt(bestPx) ? candidate : bestSoFar;
  });

  console.log(`Selected: ${best.routerType}`);
  return best;
}

(async () => {
  const c = getConnectionPool();
  const wallet = await getKeypair();

  const market = await getMarket({ rpc: c.rpc, marketPubkey: JLP_MARKET });
  const scope = new Scope('mainnet-beta', c.rpc);
  const kswapSdk = new KswapSdk(KSWAP_API, c.rpc, c.wsRpc);

  // ---- Pair config ----
  const collTokenMint = JLP_MINT;
  const debtTokenMint = USDC_MINT;
  const collReserveAddress = JLP_RESERVE_JLP_MARKET;
  const debtReserveAddress = USDC_RESERVE_JLP_MARKET;
  const slippageBps = 30;

  // Set to true to close the position entirely (repays all debt, withdraws all collateral).
  const isClosingPosition = false;

  const collTokenReserve = market.getExistingReserveByAddress(collReserveAddress);
  const debtTokenReserve = market.getExistingReserveByAddress(debtReserveAddress);

  // ---- Obligation resolution ----
  // Repay-with-coll requires an existing obligation. Use the multiply PDA so a leveraged
  // JLP/USDC position created by the multiply example is repayable through this one.
  const obligationType = new MultiplyObligation(collTokenMint, debtTokenMint, PROGRAM_ID);
  const obligationAddress = await obligationType.toPda(market.getAddress(), wallet.address);
  const obligation = await market.getObligationByAddress(obligationAddress);
  if (!obligation) {
    throw new Error(`No obligation found for ${wallet.address} on the JLP market — create a multiply position first.`);
  }

  const debtPosition = obligation.getBorrowByReserve(debtReserveAddress);
  const collPosition = obligation.getDepositByReserve(collReserveAddress);
  if (!debtPosition) {
    throw new Error(`No USDC debt in obligation ${obligationAddress}`);
  }
  if (!collPosition) {
    throw new Error(`No JLP collateral in obligation ${obligationAddress}`);
  }
  console.log(`Current debt: ${debtPosition.amount.div(debtTokenReserve.getMintFactor())} ${debtTokenReserve.symbol}`);
  console.log(
    `Current collateral: ${collPosition.amount.div(collTokenReserve.getMintFactor())} ${collTokenReserve.symbol}`
  );

  // Amount to repay (in debt token units, not lamports). Closing-position overrides this.
  // `debtPosition.amount` is lamports; convert to token units before handing to the SDK.
  const repayAmount = isClosingPosition ? debtPosition.amount.div(debtTokenReserve.getMintFactor()) : new Decimal(1); // 1 USDC

  // ---- User LUT setup ----
  // Ensure the user metadata + LUT are initialised, extended to cover the JLP/USDC reserve pair.
  const [userLookupTable, setupTxIxs] = await getUserLutAddressAndSetupIxs(
    market,
    wallet,
    none(),
    true, // extend LUT
    [{ coll: collReserveAddress, debt: debtReserveAddress }], // multiply reserve pair
    []
  );
  await executeUserSetupLutsTransactions(c, wallet, setupTxIxs);

  // ---- Scope refresh + price ----
  const scopeConfiguration = { scope, scopeConfigurations: await scope.getAllConfigurations() };
  const scopeRefreshIx = await getScopeRefreshIxForObligationAndReserves(
    market,
    collTokenReserve,
    debtTokenReserve,
    obligation,
    scopeConfiguration
  );
  const priceCollToDebt = await getTokenPriceFromBirdeye(kswapSdk, collTokenMint, debtTokenMint);
  console.log(`Price ${collTokenReserve.symbol}->${debtTokenReserve.symbol}: ${priceCollToDebt}`);
  const currentLedgerInstant = await getCurrentLedgerInstant(c.rpc, 'processed');
  const currentSlot = currentLedgerInstant.slot;

  // ---- Pick the flash-borrow side ----
  // The client expresses intent only: which obligation, which reserves, repay amount, price.
  // The SDK helper computes the required-lamport size for each side and verifies:
  //   - `isFlashLoanEnabled(reserve)` (raw flashLoanFeeSf != U64_MAX), AND
  //   - reserve has enough available liquidity for the required size,
  // preferring coll when both are viable.
  // An explicit `FLASH_BORROW_TYPE=coll|debt` env var still overrides for testing.
  const envOverride = getFlashBorrowTypeFromEnv();
  const flashBorrowType: FlashBorrowType =
    envOverride ??
    determineRepayWithCollFlashBorrowType({
      kaminoMarket: market,
      obligation,
      debtReserveAddress,
      collReserveAddress,
      repayAmount,
      priceCollToDebt: new Decimal(priceCollToDebt),
      slippagePct: new Decimal(slippageBps / 100),
      currentSlot,
      currentLedgerInstant,
      referrer: none(),
    });
  console.log(`flashBorrowType: ${flashBorrowType}${envOverride ? ' (env override)' : ' (SDK pick)'}`);

  // ---- KSwap quoter + swapper ----
  // For repay-with-coll the swap is always coll → debt regardless of flashBorrowType.
  const preferredMaxAccounts = 20;
  const quoter = getKswapQuoter(kswapSdk, wallet.address, slippageBps, collTokenReserve, debtTokenReserve);
  const swapper = getKswapSwapper(kswapSdk, wallet.address, slippageBps, preferredMaxAccounts);

  const computeIxs = getComputeBudgetAndPriorityFeeIxs(1_400_000, new Decimal(500000));

  // ---- Build routes ----
  const repayRoutes = await getRepayWithCollIxs<RouteOutput>({
    kaminoMarket: market,
    debtReserveAddress,
    collReserveAddress,
    owner: wallet,
    obligation,
    referrer: none(),
    currentSlot,
    currentLedgerInstant,
    repayAmount,
    isClosingPosition,
    budgetAndPriorityFeeIxs: computeIxs,
    scopeRefreshIx,
    useV2Ixs: true,
    quoter,
    swapper,
    slippagePct: new Decimal(slippageBps / 100),
    flashBorrowType,
  });

  // ---- Gather klend LUTs ----
  const kaminoResources = await getKaminoResources();
  const klendLutKeys: Address[] = [];
  if (userLookupTable) {
    klendLutKeys.push(userLookupTable);
  }
  klendLutKeys.push(JLP_MARKET_LUT);
  klendLutKeys.push(...getRepayWithCollLuts(kaminoResources.repayWithCollLUTs, collTokenMint, debtTokenMint));
  const klendLutAccounts = klendLutKeys.length > 0 ? await fetchAllAddressLookupTable(c.rpc, klendLutKeys) : [];

  // ---- Simulate + pick best route ----
  const best = await simulateAndSelectBestRoute(c.rpc, wallet.address, repayRoutes, klendLutKeys, klendLutAccounts);
  const { ixs, swapInputs, initialInputs, flashLoanInfo } = best.route;

  console.log(`\n--- Tx Summary ---`);
  console.log(`Router:           ${best.routerType}`);
  console.log(`Flash borrow:     ${flashLoanInfo.flashBorrowReserve} (fee: ${flashLoanInfo.flashLoanFee})`);
  console.log(`Repay amount:     ${repayAmount} ${debtTokenReserve.symbol}`);
  console.log(
    `Swap in:          ${swapInputs.inputAmountLamports.div(collTokenReserve.getMintFactor())} ${
      collTokenReserve.symbol
    }`
  );
  console.log(
    `Swap min-out:     ${swapInputs.minOutAmountLamports!.div(debtTokenReserve.getMintFactor())} ${
      debtTokenReserve.symbol
    }`
  );
  console.log(
    `Max withdrawable: ${initialInputs.maxCollateralWithdrawLamports.div(collTokenReserve.getMintFactor())} ${
      collTokenReserve.symbol
    }`
  );
  console.log(`Instructions:     ${ixs.length}`);
  console.log(`Lookup tables:    ${best.lutAddresses.length} (${best.lutAddresses.join(', ')})`);

  // ---- Send ----
  console.log('\nSending transaction...');
  const txHash = await sendAndConfirmTx(c, wallet, ixs, [], best.lutAddresses, 'repayWithCollateralJlpUsdc');
  console.log('\n--- Success ---');
  console.log(`tx: ${txHash}`);
  console.log(`https://solscan.io/tx/${txHash}`);
})().catch(async (e) => {
  console.error('Error:', e);
  process.exit(1);
});
