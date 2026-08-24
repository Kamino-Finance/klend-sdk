import { KswapSdk } from '@kamino-finance/kswap-sdk';
import { getKswapQuoter, getKswapSwapper, getTokenPriceFromBirdeye, KSWAP_API } from '../utils/kswap_utils';
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
import { MAIN_MARKET } from '../utils/constants';
import {
  determineSwapCollateralFlashBorrowType,
  getSwapCollIxs,
  SwapCollFlashBorrowToken,
  SwapCollLiquidityFlashBorrowToken,
} from '@kamino-finance/klend-sdk';
import { none } from '@solana/kit';
import { getFlashBorrowTypeFromEnv } from '../utils/env';
import Decimal from 'decimal.js';

const usage = `
Usage:
  yarn swap-collateral -- \\
    --obligation <OBLIGATION> \\
    --keypair <KEYPAIR> \\
    --source-coll-reserve <SOURCE_COLL_RESERVE> \\
    --target-coll-reserve <TARGET_COLL_RESERVE> \\
    [--amount <TOKEN_AMOUNT> | --close-source-coll] \\
    [--flash-borrow-token targetColl|sourceColl|debt] \\
    [--debt-reserve <DEBT_RESERVE>] \\
    [--new-elevation-group <ID>] \\
    [--slippage-bps <BPS>] \\
    [--rpc <RPC>] \\
    [--market <MARKET>] \\
    [--lookup-table <LUT1,LUT2>] \\
    [--send]

Defaults:
  --flash-borrow-token auto-selects targetColl/sourceColl unless explicitly passed
  FLASH_BORROW_TYPE=debt overrides auto-selection to the via-debt path
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

  const sourceCollReserveAddress = requireAddressArg(args, 'source-coll-reserve');
  const targetCollReserveAddress = requireAddressArg(args, 'target-coll-reserve');
  const explicitFlashBorrowToken = getStringArg(args, 'flash-borrow-token') as SwapCollFlashBorrowToken | undefined;
  const isClosingSourceColl = hasFlag(args, 'close-source-coll');

  if (
    explicitFlashBorrowToken &&
    explicitFlashBorrowToken !== 'sourceColl' &&
    explicitFlashBorrowToken !== 'targetColl' &&
    explicitFlashBorrowToken !== 'debt'
  ) {
    throw new Error(
      `Invalid --flash-borrow-token ${explicitFlashBorrowToken}; expected sourceColl, targetColl, or debt`
    );
  }

  const debtReserveAddress = getAddressArg(args, 'debt-reserve');

  const ctx = await loadSwapExampleContext({
    rpcUrl: resolveRpcUrl(args),
    keypairPath: resolveKeypairPath(args),
    obligationAddress: requireAddressArg(args, 'obligation'),
    marketAddress: getAddressArg(args, 'market') ?? MAIN_MARKET,
  });

  const sourceCollReserve = ctx.market.getExistingReserveByAddress(sourceCollReserveAddress, 'Source collateral');
  const targetCollReserve = ctx.market.getExistingReserveByAddress(targetCollReserveAddress, 'Target collateral');
  const debtReserve = debtReserveAddress
    ? ctx.market.getExistingReserveByAddress(debtReserveAddress, 'Debt')
    : undefined;
  const sourceCollLiquidityMint = sourceCollReserve.getLiquidityMint();
  const targetCollLiquidityMint = targetCollReserve.getLiquidityMint();
  const debtLiquidityMint = debtReserve?.getLiquidityMint();
  const amount =
    getDecimalArg(args, 'amount') ??
    (isClosingSourceColl
      ? getPositionAmountOrThrow({ obligation: ctx.obligation, reserve: sourceCollReserve, kind: 'deposit' })
      : undefined);

  if (!amount) {
    throw new Error('Pass --amount or --close-source-coll');
  }

  const lookupTableMints = debtLiquidityMint
    ? [sourceCollLiquidityMint, targetCollLiquidityMint, debtLiquidityMint]
    : [sourceCollLiquidityMint, targetCollLiquidityMint];
  const lookupTableReserves = debtReserve
    ? [sourceCollReserve.address, targetCollReserve.address, debtReserve.address]
    : [sourceCollReserve.address, targetCollReserve.address];
  const userLookupTableAddress = await setupUserLookupTable({
    connection: ctx.connection,
    wallet: ctx.wallet,
    market: ctx.market,
    obligation: ctx.obligation,
    reserves: lookupTableReserves,
    sendSetupTransactions: send,
  });

  const scopeRefreshIx = await getScopeRefreshIxs({
    market: ctx.market,
    obligation: ctx.obligation,
    reserveA: sourceCollReserve,
    reserveB: targetCollReserve,
    rpc: ctx.connection.rpc,
    scopeCluster: getStringArg(args, 'scope-cluster'),
  });

  const newElevationGroup = getNumberArg(args, 'new-elevation-group', ctx.obligation.state.elevationGroup);
  const slippageBps = getNumberArg(args, 'slippage-bps', 100);
  const kswapSdk = new KswapSdk(KSWAP_API, ctx.connection.rpc, ctx.connection.wsRpc);
  const priceSourceToTarget = await getTokenPriceFromBirdeye(
    kswapSdk,
    sourceCollLiquidityMint,
    targetCollLiquidityMint
  );
  // Resolve overrides first so an unviable picker (e.g. a target reserve with no flash-borrow liquidity) doesn't
  // block an explicit --flash-borrow-token / FLASH_BORROW_TYPE choice.
  const envFlashBorrowType = getFlashBorrowTypeFromEnv();
  const overrideFlashBorrowToken: SwapCollFlashBorrowToken | undefined =
    explicitFlashBorrowToken ?? (envFlashBorrowType === 'debt' ? 'debt' : undefined);
  const flashBorrowToken: SwapCollFlashBorrowToken =
    overrideFlashBorrowToken ??
    determineSwapCollateralFlashBorrowType({
      kaminoMarket: ctx.market,
      obligation: ctx.obligation,
      sourceCollReserveAddress,
      targetCollReserveAddress,
      amount,
      priceSourceToTarget: new Decimal(priceSourceToTarget),
      slippagePct: new Decimal(slippageBps).div(100),
    });

  if (flashBorrowToken === 'debt' && !debtReserveAddress) {
    throw new Error('--debt-reserve is required when --flash-borrow-token debt or FLASH_BORROW_TYPE=debt');
  }
  console.log(
    explicitFlashBorrowToken
      ? `Using --flash-borrow-token override: ${flashBorrowToken}`
      : envFlashBorrowType
      ? `Using FLASH_BORROW_TYPE=${envFlashBorrowType} override: ${flashBorrowToken}`
      : `SDK selected flash-borrow token: ${flashBorrowToken}`
  );

  const outputs = await getSwapCollIxs({
    owner: ctx.wallet,
    market: ctx.market,
    obligation: ctx.obligation,
    sourceCollSwapAmount: amount,
    isClosingSourceColl,
    sourceCollReserveAddress,
    targetCollReserveAddress,
    newElevationGroup,
    flashBorrowToken,
    debtReserveAddress,
    referrer: none(),
    currentLedgerInstant: ctx.currentLedgerInstant,
    quoter: getKswapQuoter(kswapSdk, ctx.wallet.address, slippageBps, sourceCollReserve, targetCollReserve),
    swapper: getKswapSwapper(kswapSdk, ctx.wallet.address, slippageBps),
    useV2Ixs: true,
    scopeRefreshIx,
    slippagePct: new Decimal(slippageBps).div(100),
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
    description: 'swapCollateral',
    scoreRoute: (route) => route.simulationDetails.externalSwap.swapOutAmount,
    printRoute: (route) => {
      printSimulationDetails(route.simulationDetails);
    },
  });
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
