import Decimal from 'decimal.js';
import { KswapSdk } from '@kamino-finance/kswap-sdk';
import { determineSwapDebtFlashBorrowType, getSwapDebtIxs, SwapDebtFlashBorrowToken } from '@kamino-finance/klend-sdk';
import { none } from '@solana/kit';
import { MAIN_MARKET } from '../utils/constants';
import {
  getAddressArg,
  getAddressListArg,
  getDecimalArg,
  getNumberArg,
  getStringArg,
  hasFlag,
  maybePrintHelp,
  parseArgs,
  requireAddressArg,
  resolveKeypairPath,
  resolveRpcUrl,
} from '../utils/cli';
import { getKswapQuoter, getKswapSwapper, getTokenPriceFromBirdeye, KSWAP_API } from '../utils/kswap_utils';
import {
  executeBestSimulatingRoute,
  getMarketLookupTableAddress,
  getPositionAmountOrThrow,
  getScopeRefreshIxs,
  getSwapPairLookupTableAddressesForMints,
  loadSwapExampleContext,
  printObligationSummary,
  printSimulationDetails,
  setupUserLookupTable,
} from '../utils/swap_examples';
import { getFlashBorrowTypeFromEnv } from '../utils/env';

const usage = `
Usage:
  yarn swap-debt -- \\
    --obligation <OBLIGATION> \\
    --keypair <KEYPAIR> \\
    --source-debt-reserve <SOURCE_DEBT_RESERVE> \\
    --target-debt-reserve <TARGET_DEBT_RESERVE> \\
    [--amount <TOKEN_AMOUNT> | --close-source-debt] \\
    [--flash-borrow-token targetDebt|sourceDebt] \\
    [--new-elevation-group <ID>] \\
    [--slippage-bps <BPS>] \\
    [--rpc <RPC>] \\
    [--market <MARKET>] \\
    [--lookup-table <LUT1,LUT2>] \\
    [--send]

Defaults:
  --flash-borrow-token auto-selects targetDebt/sourceDebt unless explicitly passed
  FLASH_BORROW_TYPE=debt maps to targetDebt; FLASH_BORROW_TYPE=coll maps to sourceDebt
  --slippage-bps 100
  --new-elevation-group current obligation group
  dry-run simulation unless --send is present
  swaps are routed with KSwap
  LUTs are merged from: KLend market LUT, user LUT, swap pair API LUTs, find-minimal LUTs, manual --lookup-table
`;

(async () => {
  const args = parseArgs();
  maybePrintHelp(args, usage);
  const send = hasFlag(args, 'send');

  const sourceDebtReserveAddress = requireAddressArg(args, 'source-debt-reserve');
  const targetDebtReserveAddress = requireAddressArg(args, 'target-debt-reserve');
  const explicitFlashBorrowToken = getStringArg(args, 'flash-borrow-token') as SwapDebtFlashBorrowToken | undefined;
  const isClosingSourceDebt = hasFlag(args, 'close-source-debt');

  if (
    explicitFlashBorrowToken &&
    explicitFlashBorrowToken !== 'targetDebt' &&
    explicitFlashBorrowToken !== 'sourceDebt'
  ) {
    throw new Error(`Invalid --flash-borrow-token ${explicitFlashBorrowToken}; expected targetDebt or sourceDebt`);
  }

  const ctx = await loadSwapExampleContext({
    rpcUrl: resolveRpcUrl(args),
    keypairPath: resolveKeypairPath(args),
    obligationAddress: requireAddressArg(args, 'obligation'),
    marketAddress: getAddressArg(args, 'market') ?? MAIN_MARKET,
  });

  const sourceDebtReserve = ctx.market.getExistingReserveByAddress(sourceDebtReserveAddress, 'Source debt');
  const targetDebtReserve = ctx.market.getExistingReserveByAddress(targetDebtReserveAddress, 'Target debt');
  const sourceDebtLiquidityMint = sourceDebtReserve.getLiquidityMint();
  const targetDebtLiquidityMint = targetDebtReserve.getLiquidityMint();
  const amount =
    getDecimalArg(args, 'amount') ??
    (isClosingSourceDebt
      ? getPositionAmountOrThrow({ obligation: ctx.obligation, reserve: sourceDebtReserve, kind: 'borrow' })
      : undefined);

  if (!amount) {
    throw new Error('Pass --amount or --close-source-debt');
  }

  const lookupTableMints = [sourceDebtLiquidityMint, targetDebtLiquidityMint];
  const userLookupTableAddress = await setupUserLookupTable({
    connection: ctx.connection,
    wallet: ctx.wallet,
    market: ctx.market,
    obligation: ctx.obligation,
    reserves: [sourceDebtReserveAddress, targetDebtReserveAddress],
    sendSetupTransactions: send,
  });

  const scopeRefreshIx = await getScopeRefreshIxs({
    market: ctx.market,
    obligation: ctx.obligation,
    reserveA: sourceDebtReserve,
    reserveB: targetDebtReserve,
    rpc: ctx.connection.rpc,
    scopeCluster: getStringArg(args, 'scope-cluster'),
  });

  const slippageBps = getNumberArg(args, 'slippage-bps', 100);
  const kswapSdk = new KswapSdk(KSWAP_API, ctx.connection.rpc, ctx.connection.wsRpc);
  const priceSourceToTarget = await getTokenPriceFromBirdeye(
    kswapSdk,
    sourceDebtLiquidityMint,
    targetDebtLiquidityMint
  );
  // Resolve overrides first so that an invalid market state (e.g. neither side has flash-borrow liquidity for the
  // close-sized loan) doesn't block an explicit --flash-borrow-token / FLASH_BORROW_TYPE choice.
  const envFlashBorrowType = getFlashBorrowTypeFromEnv();
  const overrideFlashBorrowToken: SwapDebtFlashBorrowToken | undefined =
    explicitFlashBorrowToken ??
    (envFlashBorrowType === 'coll' ? 'sourceDebt' : envFlashBorrowType === 'debt' ? 'targetDebt' : undefined);
  const flashBorrowToken: SwapDebtFlashBorrowToken =
    overrideFlashBorrowToken ??
    determineSwapDebtFlashBorrowType({
      kaminoMarket: ctx.market,
      obligation: ctx.obligation,
      sourceDebtReserveAddress,
      targetDebtReserveAddress,
      amount,
      isClosingSourceDebt,
      priceSourceToTarget: new Decimal(priceSourceToTarget),
      slippagePct: new Decimal(slippageBps).div(100),
      // Required as of the fixed-rate penalty-sizing change: the selector sizes the fixed-term early-repay penalty,
      // which needs the current slot (breaking API change).
      currentSlot: ctx.currentSlot,
      currentLedgerInstant: ctx.currentLedgerInstant,
    });

  console.log(
    explicitFlashBorrowToken
      ? `Using --flash-borrow-token override: ${flashBorrowToken}`
      : envFlashBorrowType
      ? `Using FLASH_BORROW_TYPE=${envFlashBorrowType} override: ${flashBorrowToken}`
      : `SDK selected flash-borrow token: ${flashBorrowToken}`
  );

  const outputs = await getSwapDebtIxs({
    owner: ctx.wallet,
    market: ctx.market,
    obligation: ctx.obligation,
    sourceDebtSwapAmount: amount,
    isClosingSourceDebt,
    sourceDebtReserveAddress,
    targetDebtReserveAddress,
    flashBorrowToken,
    newElevationGroup: getNumberArg(args, 'new-elevation-group', ctx.obligation.state.elevationGroup),
    slippagePct: new Decimal(slippageBps).div(100),
    referrer: none(),
    currentSlot: ctx.currentSlot,
    currentLedgerInstant: ctx.currentLedgerInstant,
    quoter: getKswapQuoter(kswapSdk, ctx.wallet.address, slippageBps, targetDebtReserve, sourceDebtReserve),
    swapper: getKswapSwapper(kswapSdk, ctx.wallet.address, slippageBps),
    useV2Ixs: true,
    scopeRefreshIx,
  });

  printObligationSummary(ctx.market, ctx.obligation);
  await executeBestSimulatingRoute({
    connection: ctx.connection,
    wallet: ctx.wallet,
    routes: outputs,
    marketLookupTableAddress: getMarketLookupTableAddress(ctx.market.getAddress()),
    userLookupTableAddress,
    swapPairLookupTableAddresses: await getSwapPairLookupTableAddressesForMints(lookupTableMints),
    extraLookupTables: getAddressListArg(args, 'lookup-table'),
    send,
    description: 'swapDebt',
    scoreRoute: (route) => route.simulationDetails.externalSwap.swapOutAmount,
    printRoute: (route) => {
      printSimulationDetails(route.simulationDetails);
    },
  });
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
