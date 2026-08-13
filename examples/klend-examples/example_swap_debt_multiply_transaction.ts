import Decimal from 'decimal.js';
import { KswapSdk } from '@kamino-finance/kswap-sdk';
import {
  getSwapDebtIxs,
  getSwapDebtObligationsPreview,
  MultiplyObligation,
  PROGRAM_ID,
  SwapDebtFlashBorrowToken,
  SwapDebtObligationsPreview,
} from '@kamino-finance/klend-sdk';
import { none } from '@solana/kit';
import { JLP_MARKET, JLP_MINT, USDC_MINT, USDC_RESERVE_JLP_MARKET, USDG_RESERVE_JLP_MARKET } from '../utils/constants';
import {
  getAddressArg,
  getAddressListArg,
  getNumberArg,
  getStringArg,
  hasFlag,
  maybePrintHelp,
  parseArgs,
  resolveKeypairPath,
  resolveRpcUrl,
} from '../utils/cli';
import { readKeypairFile } from '../utils/keypair';
import { getKswapQuoter, getKswapSwapper, KSWAP_API } from '../utils/kswap_utils';
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

const usage = `
Swap the debt of a MULTIPLY obligation — full (100%) or partial.

A multiply obligation's PDA is derived from (collateral mint, debt mint), so the debt cannot be changed in place:
the position is migrated into a multiply obligation of the same type seeded with the new debt. The SDK detects the
variable-rate Multiply tag automatically and dispatches to the cross-obligation flow. The migrated/target
obligation's elevation group is auto-selected for the (collateral, new debt) pair when it is new (highest-LTV common
group, or group 0); an existing target keeps its current group.

  --portion 100 (default): FULL swap — repays the whole old debt, withdraws all collateral, empties the old
                           obligation, and creates/grows the (collateral, new debt) obligation.
  --portion <100:          PARTIAL swap — repays that fraction of the old debt and moves the SAME fraction of the
                           collateral (LTV preserved on both sides). The old obligation stays alive (smaller); the
                           target obligation is created (if new) or grown (if it already exists).

Run this AFTER 'yarn multiply-deposit', which creates the JLP/USDC multiply position this example then swaps to
JLP/USDG.

Usage:
  yarn swap-debt-multiply -- \\
    --keypair <KEYPAIR> \\
    [--obligation <MULTIPLY_OBLIGATION>] \\
    [--source-debt-reserve <SOURCE_DEBT_RESERVE>] \\
    [--target-debt-reserve <TARGET_DEBT_RESERVE>] \\
    [--flash-borrow-token sourceDebt|targetDebt] \\
    [--portion <PCT>] \\
    [--slippage-bps <BPS>] \\
    [--rpc <RPC>] \\
    [--market <MARKET>] \\
    [--lookup-table <LUT1,LUT2>] \\
    [--send]

Defaults:
  --obligation           derived from the wallet + JLP collateral + USDC debt (the multiply-deposit position)
  --market               JLP market (${JLP_MARKET})
  --source-debt-reserve  JLP-market USDC reserve (the multiply-deposit example's debt)
  --target-debt-reserve  JLP-market USDG reserve
  --flash-borrow-token   sourceDebt (flash-borrow the old debt, swap late); 'targetDebt' flash-borrows the new debt
                         and swaps early — pick whichever reserve has the deeper flash-loan liquidity
  --portion              100 (full swap). Pass e.g. 50 for a partial swap of half the old debt + half the collateral.
  --slippage-bps         100
  dry-run simulation unless --send is present
  swaps are routed with KSwap
  a per-obligation preview (projected deposits/borrows, LTV, net value) is printed before simulating
`;

function printSwapDebtPreview(preview: SwapDebtObligationsPreview): void {
  const fmt = (d: Decimal) => d.toSignificantDigits(8).toString();
  const sideLine = (s: { stats: SwapDebtObligationsPreview['old']['stats'] }) =>
    `deposit=${fmt(s.stats.userTotalDeposit)} USD, borrow=${fmt(s.stats.userTotalBorrow)} USD, ` +
    `LTV=${fmt(s.stats.loanToValue.mul(100))}%, net=${fmt(s.stats.netAccountValue)} USD`;
  console.log('--- swap-debt preview (projected post-op) ---');
  console.log(`  OLD obligation${preview.old.closed ? ' [closed by full swap]' : ''}: ${sideLine(preview.old)}`);
  console.log(
    `  NEW obligation ${preview.new.address.toString()} [${preview.new.isNew ? 'created' : 'grown'}]: ${sideLine(
      preview.new
    )}`
  );
  console.log(
    `  moved: collateral=${fmt(preview.moved.collateralLamports)} lamports, ` +
      `oldDebtRepaid=${fmt(preview.moved.oldDebtRepaidLamports)} lamports, ` +
      `newDebtBorrowed≈${fmt(preview.moved.newDebtBorrowedLamports)} lamports (oracle estimate)`
  );
}

(async () => {
  const args = parseArgs();
  maybePrintHelp(args, usage);
  const send = hasFlag(args, 'send');

  const sourceDebtReserveAddress = getAddressArg(args, 'source-debt-reserve') ?? USDC_RESERVE_JLP_MARKET;
  const targetDebtReserveAddress = getAddressArg(args, 'target-debt-reserve') ?? USDG_RESERVE_JLP_MARKET;

  const flashBorrowToken = (getStringArg(args, 'flash-borrow-token') ?? 'sourceDebt') as SwapDebtFlashBorrowToken;
  if (flashBorrowToken !== 'sourceDebt' && flashBorrowToken !== 'targetDebt') {
    throw new Error(`Invalid --flash-borrow-token ${flashBorrowToken}; expected sourceDebt or targetDebt`);
  }
  // Elevation group the target should end in: `undefined` = default selection (auto-pick the best common group for a
  // new target, keep the current group for an existing one). The builder and the preview below MUST use the same
  // value (and the same flashBorrowToken) or the preview will project a different position than execution produces.
  const newElevationGroup: number | undefined = undefined;

  const marketAddress = getAddressArg(args, 'market') ?? JLP_MARKET;
  const keypairPath = resolveKeypairPath(args);
  const wallet = await readKeypairFile(keypairPath);

  // The multiply obligation PDA is deterministic from (collateral mint, debt mint, owner). By default we target the
  // JLP/USDC multiply position the multiply-deposit example creates, derived from the hardcoded coll/debt mints +
  // the wallet — so no address needs to be passed. Use --obligation only to target a different position.
  const obligationAddress =
    getAddressArg(args, 'obligation') ??
    (await new MultiplyObligation(JLP_MINT, USDC_MINT, PROGRAM_ID).toPda(marketAddress, wallet.address));

  const ctx = await loadSwapExampleContext({
    rpcUrl: resolveRpcUrl(args),
    keypairPath,
    obligationAddress,
    marketAddress,
  });

  const sourceDebtReserve = ctx.market.getExistingReserveByAddress(sourceDebtReserveAddress, 'Source debt');
  const targetDebtReserve = ctx.market.getExistingReserveByAddress(targetDebtReserveAddress, 'Target debt');
  const sourceDebtLiquidityMint = sourceDebtReserve.getLiquidityMint();
  const targetDebtLiquidityMint = targetDebtReserve.getLiquidityMint();

  // The collateral stays the same; it is migrated to the new obligation. Its reserve goes into the user-LUT pairs
  // below (which cover the obligation accounts); it does NOT need to go into the swap-pair LUT lookup.
  const collateralReserveAddresses = ctx.obligation.getDeposits().map((d) => d.reserveAddress);

  // Outstanding old debt (token units). A full swap (--portion 100) repays all of it; a partial swap repays
  // `portionPct`% of it and moves the same fraction of collateral (LTV preserved on both sides).
  const outstandingSourceDebt = getPositionAmountOrThrow({
    obligation: ctx.obligation,
    reserve: sourceDebtReserve,
    kind: 'borrow',
  });
  const portionPct = getNumberArg(args, 'portion', 100);
  if (portionPct <= 0 || portionPct > 100) {
    throw new Error(`Invalid --portion ${portionPct}; expected a percentage in (0, 100]`);
  }
  const isClosingSourceDebt = portionPct >= 100;
  const sourceDebtSwapAmount = isClosingSourceDebt
    ? outstandingSourceDebt
    : outstandingSourceDebt.mul(portionPct).div(100);

  // Swap-pair LUTs only concern the two tokens actually being swapped (the old and new debt). Including the
  // collateral mint here makes getSwapPairLookupTableAddressesForMints cross-product all 3 mints into many
  // irrelevant pair LUTs; the collateral's accounts are already covered by the user-LUT pairs below.
  const lookupTableMints = [sourceDebtLiquidityMint, targetDebtLiquidityMint];
  // Extend the user LUT with BOTH multiply obligations involved in the migration — the old (coll, source debt) and
  // the NEW (coll, target debt). getUserLutAddressAndSetupIxs derives each pair's multiply-obligation PDA +
  // obligation-farm-user-states into the LUT; the new obligation's accounts MUST be covered or the migration
  // transaction exceeds the 1232-byte message limit.
  const multiplyReservePairs = collateralReserveAddresses.flatMap((coll) => [
    { coll, debt: sourceDebtReserveAddress },
    { coll, debt: targetDebtReserveAddress },
  ]);
  const userLookupTableAddress = await setupUserLookupTable({
    connection: ctx.connection,
    wallet: ctx.wallet,
    market: ctx.market,
    obligation: ctx.obligation,
    reservePairs: multiplyReservePairs,
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
  // Ask KSwap to prefer routes with fewer accounts so the dense migration tx (two obligations + flash loan + swap)
  // stays under the 64-account-lock limit. An array requests options at each budget; the best-simulating one wins.
  const preferredMaxAccounts = [16, 26, 36];

  const outputs = await getSwapDebtIxs({
    owner: ctx.wallet,
    market: ctx.market,
    obligation: ctx.obligation,
    sourceDebtSwapAmount,
    isClosingSourceDebt, // 100% => full swap (empties the old obligation); <100% => partial swap (keeps it alive)
    sourceDebtReserveAddress,
    targetDebtReserveAddress,
    // Honoured for multiply: 'sourceDebt' flash-borrows the old debt (swap late); 'targetDebt' the new debt (swap early).
    flashBorrowToken,
    // `undefined` uses the default selection: a NEW target auto-picks the best common elevation group for the
    // (collateral, new debt) pair, an existing target keeps its current group. Pass a number (incl. 0 = no emode) to
    // request a specific group instead.
    newElevationGroup,
    slippagePct: new Decimal(slippageBps).div(100),
    referrer: none(),
    currentSlot: ctx.currentSlot,
    currentLedgerInstant: ctx.currentLedgerInstant,
    // Swap the new (target) debt back into the old (source) debt to repay the flash loan.
    quoter: getKswapQuoter(kswapSdk, ctx.wallet.address, slippageBps, targetDebtReserve, sourceDebtReserve),
    swapper: getKswapSwapper(kswapSdk, ctx.wallet.address, slippageBps, preferredMaxAccounts),
    useV2Ixs: true,
    scopeRefreshIx,
  });

  printObligationSummary(ctx.market, ctx.obligation);

  // Preview what BOTH obligations will look like after the swap, before sending. Shares the builder's planning core,
  // so passing the SAME flashBorrowToken and newElevationGroup makes the projection match execution (the new-debt
  // amount is still an oracle-price estimate, so the executed amount differs by the live swap quote).
  const preview = await getSwapDebtObligationsPreview({
    market: ctx.market,
    obligation: ctx.obligation,
    sourceDebtReserveAddress,
    targetDebtReserveAddress,
    sourceDebtSwapAmount,
    isClosingSourceDebt,
    flashBorrowToken,
    newElevationGroup,
    slot: ctx.currentSlot,
    currentLedgerInstant: ctx.currentLedgerInstant,
    referrer: none(),
    slippagePct: new Decimal(slippageBps).div(100),
  });
  printSwapDebtPreview(preview);

  console.log('Target multiply obligation:', outputs[0]?.simulationDetails.newObligationAddress?.toString());
  await executeBestSimulatingRoute({
    connection: ctx.connection,
    wallet: ctx.wallet,
    routes: outputs,
    marketLookupTableAddress: getMarketLookupTableAddress(ctx.market.getAddress()),
    userLookupTableAddress,
    swapPairLookupTableAddresses: [], //await getSwapPairLookupTableAddressesForMints(lookupTableMints),
    extraLookupTables: getAddressListArg(args, 'lookup-table'),
    send,
    description: 'swapDebtMultiply',
    scoreRoute: (route) => route.simulationDetails.externalSwap.swapOutAmount,
    printRoute: (route) => {
      printSimulationDetails(route.simulationDetails);
    },
  });
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
