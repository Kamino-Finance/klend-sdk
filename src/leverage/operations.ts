import { Address, Instruction, Slot, Option, none, TransactionSigner, lamports } from '@solana/kit';
import Decimal from 'decimal.js';
import {
  KaminoAction,
  KaminoMarket,
  KaminoObligation,
  KaminoReserve,
  lamportsToNumberDecimal as fromLamports,
  getTokenIdsForScopeRefresh,
  isKaminoObligation,
  toJson,
} from '../classes';
import { getFlashLoanInstructions } from './instructions';
import {
  assertAdjustDecreaseCollFlashCalcs,
  assertAdjustDecreaseDebtFlashCalcs,
  assertAdjustIncreaseCollFlashCalcs,
  assertAdjustIncreaseDebtFlashCalcs,
  assertDepositCollFlashCalcs,
  assertDepositDebtFlashCalcs,
  assertWithdrawCollFlashCalcs,
  assertWithdrawDebtFlashCalcs,
} from './operationGuards';

import { numberToLamportsDecimal as toLamports } from '../classes';
import {
  LeverageObligation,
  MultiplyObligation,
  ObligationType,
  ObligationTypeTag,
  SOL_DECIMALS,
  ScopePriceRefreshConfig,
  U64_MAX,
  createAtasIdempotent,
  getAssociatedTokenAddress,
  getComputeBudgetAndPriorityFeeIxs,
  getTransferWsolIxs,
  KlendAccountsResult,
  removeBudgetIxs,
  toKlendAccountsResult,
  uniqueAccountsWithProgramIds,
  WRAPPED_SOL_MINT,
  MultiplyObligationFixedRate,
  LeverageObligationFixedRate,
} from '../utils';
import {
  adjustDepositLeverageCalcs,
  adjustDepositLeverageCalcsDebtFlash,
  adjustWithdrawLeverageCalcs,
  adjustWithdrawLeverageCalcsCollFlash,
  calcAdjustAmounts,
  calcCollFlashLegLamports,
  depositLeverageCalcs,
  depositLeverageCalcsDebtFlash,
  withdrawLeverageCalcs,
  withdrawLeverageCalcsCollFlash,
} from './calcs';
import { assertPositiveFiniteDecimal } from '../lending_operations/swap_calcs';
import { calcFlashLoanFees } from '../lending_operations/repay_with_collateral_calcs';
import { FullBPS } from '@kamino-finance/kliquidity-sdk/dist/utils/CreationParameters';
import {
  AdjustDepositDebtFlashCalcsResult,
  AdjustLeverageCalcsResult,
  AdjustLeverageInitialInputs,
  AdjustLeverageIxsParams,
  AdjustLeverageIxsResponse,
  AdjustLeverageSwapInputsParams,
  AdjustWithdrawCollFlashCalcsResult,
  DepositLeverageCalcsResult,
  DepositLeverageDebtFlashCalcsResult,
  DepositLeverageInitialInputs,
  DepositWithLeverageParams,
  DepositWithLeverageSwapInputsParams,
  DepositLeverageIxsResponse,
  SwapInputs,
  SwapIxs,
  SwapIxsProvider,
  SwapQuoteProvider,
  WithdrawLeverageCalcsResult,
  WithdrawLeverageCollFlashCalcsResult,
  WithdrawLeverageInitialInputs,
  WithdrawLeverageIxsResponse,
  WithdrawWithLeverageParams,
  WithdrawWithLeverageSwapInputsParams,
  LeverageIxsOutput,
  FlashLoanInfo,
} from './types';
import { TOKEN_PROGRAM_ADDRESS } from '@solana-program/token';
import { findAssociatedTokenPda, getCloseAccountInstruction } from '@solana-program/token-2022';
import { LAMPORTS_PER_SOL } from '../utils/consts';
import { DistributiveOmit, requireMatchingLedgerInstant, resolveLedgerInput } from '../utils/ledger';
import { redeemWithdrawAmount, sizeRedeemFundedPull } from '../lending_operations/redeem_drift';

// Offset for the withdraw slot to underestimate the exchange rate. This is the older,
// adjust-path-only mitigation for the same estimated-vs-actual redeem drift addressed by
// `lending_operations/redeem_drift.ts` (which covers the repay/close/migrate paths) — candidate
// for unification onto one mechanism.
export const WITHDRAW_SLOT_OFFSET = 150;

// Sentinel used to short-circuit a `get*WithLeverageSwapInputs` run once it has handed the klend account set to
// the quoter — see `captureLeverageKlendAccounts`.
class KlendAccountsCaptured {
  constructor(public readonly klendAccounts: Array<Address>) {}
}

/**
 * Runs a `get*WithLeverageSwapInputs` flow with a quoter that captures the klend account set the flow passes to it
 * and then aborts — so we learn the exact, final accounts (the value the operation itself uses) without running the
 * external swap. The leverage flows build their klend ixs and compute this set before ever calling the quoter, so
 * the capture is complete and the abort skips only the post-quote sizing/return work.
 */
async function captureLeverageKlendAccounts(
  run: (quoter: SwapQuoteProvider<unknown>) => Promise<unknown>
): Promise<KlendAccountsResult> {
  const capturingQuoter: SwapQuoteProvider<unknown> = (_inputs, klendAccounts) =>
    Promise.reject(new KlendAccountsCaptured(klendAccounts));
  try {
    await run(capturingQuoter);
  } catch (e) {
    if (e instanceof KlendAccountsCaptured) {
      return toKlendAccountsResult(e.klendAccounts);
    }
    throw e;
  }
  throw new Error('klend account discovery did not reach the quoter; cannot determine the klend accounts');
}

/**
 * Inputs for {@link getDepositLeverageKlendAccounts}: the {@link getDepositWithLeverageSwapInputs} props minus the
 * quoter (and logger), since the klend account footprint is discovered without an external swap.
 */
export type DepositLeverageKlendAccountsInputs = DistributiveOmit<
  DepositWithLeverageSwapInputsParams<unknown>,
  'quoter' | 'logger'
>;

/**
 * Light helper: returns the exact, final set of klend accounts (and program ids) a deposit-with-leverage operation
 * with the same inputs would consume, plus their count, WITHOUT running the external swap. This is the same set the
 * operation passes to the quoter (invariant to the swap amounts), so the count is accurate and final — the FE can
 * use it to know how many accounts remain for the external swap within the transaction's account limit.
 */
export function getDepositLeverageKlendAccounts(
  inputs: DepositLeverageKlendAccountsInputs
): Promise<KlendAccountsResult> {
  return captureLeverageKlendAccounts((quoter) => getDepositWithLeverageSwapInputs({ ...inputs, quoter }));
}

/**
 * Inputs for {@link getWithdrawLeverageKlendAccounts}: the {@link getWithdrawWithLeverageSwapInputs} props minus the
 * quoter (and logger).
 */
export type WithdrawLeverageKlendAccountsInputs = DistributiveOmit<
  WithdrawWithLeverageSwapInputsParams<unknown>,
  'quoter' | 'logger'
>;

/** Light helper: the accurate, final klend account footprint of a withdraw-with-leverage operation. See {@link getDepositLeverageKlendAccounts}. */
export function getWithdrawLeverageKlendAccounts(
  inputs: WithdrawLeverageKlendAccountsInputs
): Promise<KlendAccountsResult> {
  return captureLeverageKlendAccounts((quoter) => getWithdrawWithLeverageSwapInputs({ ...inputs, quoter }));
}

/**
 * Inputs for {@link getAdjustLeverageKlendAccounts}: the {@link getAdjustLeverageSwapInputs} props minus the quoter
 * (and logger).
 */
export type AdjustLeverageKlendAccountsInputs = DistributiveOmit<
  AdjustLeverageSwapInputsParams<unknown>,
  'quoter' | 'logger'
>;

/** Light helper: the accurate, final klend account footprint of an adjust-leverage operation. See {@link getDepositLeverageKlendAccounts}. */
export function getAdjustLeverageKlendAccounts(
  inputs: AdjustLeverageKlendAccountsInputs
): Promise<KlendAccountsResult> {
  return captureLeverageKlendAccounts((quoter) => getAdjustLeverageSwapInputs({ ...inputs, quoter }));
}

export async function getDepositWithLeverageSwapInputs<QuoteResponse>({
  owner,
  kaminoMarket,
  debtReserveAddress,
  collReserveAddress,
  depositAmount,
  priceDebtToColl,
  slippagePct,
  obligation,
  referrer,
  currentSlot: suppliedCurrentSlot,
  currentLedgerInstant: suppliedLedgerInstant,
  targetLeverage,
  selectedTokenMint,
  obligationTypeTagOverride,
  scopeRefreshIx,
  budgetAndPriorityFeeIxs,
  quoteBufferBps,
  quoter,
  useV2Ixs,
  elevationGroupOverride,
  flashBorrowType,
  logger,
}: DepositWithLeverageSwapInputsParams<QuoteResponse>): Promise<{
  flashLoanInfo: FlashLoanInfo;
  swapInputs: SwapInputs;
  initialInputs: DepositLeverageInitialInputs<QuoteResponse>;
}> {
  const collReserve = kaminoMarket.getExistingReserveByAddress(collReserveAddress);
  const debtReserve = kaminoMarket.getExistingReserveByAddress(debtReserveAddress);
  const ledger = await resolveLedgerInput(
    kaminoMarket.getRpc(),
    suppliedCurrentSlot,
    suppliedLedgerInstant,
    !debtReserve.state.config.debtMaturityTimestamp.eqn(0),
    'getDepositWithLeverageSwapInputs'
  );
  const { currentSlot, currentLedgerInstant } = ledger;
  const log = logger ?? (() => {});
  const collTokenMint = collReserve.getLiquidityMint();
  const debtTokenMint = debtReserve.getLiquidityMint();
  const solTokenReserve =
    collReserve.getLiquidityMint() === WRAPPED_SOL_MINT
      ? collReserve
      : debtReserve.getLiquidityMint() === WRAPPED_SOL_MINT
      ? debtReserve
      : undefined;

  const selectedTokenIsCollToken = selectedTokenMint === collTokenMint;
  const depositTokenIsSol = !solTokenReserve ? false : selectedTokenMint === solTokenReserve.getLiquidityMint();

  const obligationType = checkObligationType(
    obligationTypeTagOverride,
    collReserve.address,
    debtReserve.address,
    kaminoMarket
  );

  const dummySwapIxs: SwapIxs<QuoteResponse>[] = [
    { preActionIxs: [], swapIxs: [], lookupTables: [], quote: { priceAInB: new Decimal(0), quoteResponse: undefined } },
  ];
  const resolvedObligation = obligation ? obligation : obligationType;

  if (flashBorrowType !== 'debt') {
    // Coll flash path (default): flash borrow coll -> deposit coll -> borrow debt -> swap debt->coll -> flash repay coll
    const flashLoanFee = collReserve.getFlashLoanFee();

    const calcs = depositLeverageCalcs({
      depositAmount: depositAmount,
      depositTokenIsCollToken: selectedTokenIsCollToken,
      depositTokenIsSol,
      priceDebtToColl,
      targetLeverage,
      slippagePct,
      flashLoanFee,
    });

    log('Deposit calcs (coll flash)', toJson(calcs));

    const klendIxs: LeverageIxsOutput = (
      await buildDepositWithLeverageIxsCollFlash(
        kaminoMarket,
        debtReserve,
        collReserve,
        owner,
        resolvedObligation,
        referrer,
        currentSlot,
        depositTokenIsSol,
        scopeRefreshIx,
        calcs,
        budgetAndPriorityFeeIxs,
        dummySwapIxs,
        useV2Ixs,
        elevationGroupOverride
      )
    )[0];

    const uniqueKlendAccounts = uniqueAccountsWithProgramIds(klendIxs.instructions);
    const swapInputAmount = toLamports(calcs.swapDebtTokenIn, debtReserve.stats.decimals).ceil();

    const swapInputsForQuote: SwapInputs = {
      inputAmountLamports: swapInputAmount.mul(new Decimal(1).add(quoteBufferBps.div(FullBPS))),
      inputMint: debtTokenMint,
      outputMint: collTokenMint,
    };

    const swapQuote = await quoter(swapInputsForQuote, uniqueKlendAccounts);

    const quotePriceCalcs = depositLeverageCalcs({
      depositAmount: depositAmount,
      depositTokenIsCollToken: selectedTokenIsCollToken,
      depositTokenIsSol,
      priceDebtToColl: swapQuote.priceAInB,
      targetLeverage,
      slippagePct,
      flashLoanFee,
    });

    const swapInputAmountQuotePrice = toLamports(quotePriceCalcs.swapDebtTokenIn, debtReserve.stats.decimals).ceil();

    // The coll ATA is empty after the exact-spend deposit and the flash repay debits `flashBorrow + fee`
    // (1-lamport minimum included), funded solely by the swap output — so the declared minimum output must be the
    // canonical lamport-domain debit; `flashBorrow` alone leaves a minimum-fill short by the fee. Mirrors the
    // builder's ceil-rounded flash borrow (`buildDepositWithLeverageIxsCollFlash`).
    const depositFlashBorrowLamports = toLamports(
      quotePriceCalcs.flashBorrowInCollToken,
      collReserve.stats.decimals
    ).ceil();
    const depositMinCollOutLamports = calcFlashLoanFees({
      reserve: collReserve,
      referralFeeBps: 0,
      hasReferral: false,
      flashBorrowAmountLamports: depositFlashBorrowLamports,
    }).flashRepayDebitLamports.ceil();

    return {
      swapInputs: {
        inputAmountLamports: swapInputAmountQuotePrice,
        minOutAmountLamports: depositMinCollOutLamports,
        inputMint: debtTokenMint,
        outputMint: collTokenMint,
      },
      flashLoanInfo: klendIxs.flashLoanInfo,
      initialInputs: {
        calcs: quotePriceCalcs,
        swapQuote,
        currentSlot,
        currentLedgerInstant,
        obligation: resolvedObligation,
        klendAccounts: uniqueKlendAccounts,
      },
    };
  } else {
    // Debt flash path: flash borrow debt -> swap debt->coll -> deposit coll -> borrow debt -> flash repay debt
    const flashLoanFee = debtReserve.getFlashLoanFee();

    const calcs = depositLeverageCalcsDebtFlash({
      depositAmount,
      depositTokenIsCollToken: selectedTokenIsCollToken,
      depositTokenIsSol,
      priceDebtToColl,
      targetLeverage,
      slippagePct,
      flashLoanFee,
    });

    log('Deposit calcs (debt flash)', toJson(calcs));

    const klendIxs: LeverageIxsOutput = (
      await buildDepositWithLeverageIxsDebtFlash(
        kaminoMarket,
        debtReserve,
        collReserve,
        owner,
        resolvedObligation,
        referrer,
        currentSlot,
        depositTokenIsSol,
        scopeRefreshIx,
        calcs,
        budgetAndPriorityFeeIxs,
        dummySwapIxs,
        useV2Ixs,
        elevationGroupOverride
      )
    )[0];

    const uniqueKlendAccounts = uniqueAccountsWithProgramIds(klendIxs.instructions);
    const swapInputAmount = toLamports(calcs.swapDebtTokenIn, debtReserve.stats.decimals).ceil();

    const swapInputsForQuote: SwapInputs = {
      inputAmountLamports: swapInputAmount.mul(new Decimal(1).add(quoteBufferBps.div(FullBPS))),
      inputMint: debtTokenMint,
      outputMint: collTokenMint,
    };

    const swapQuote = await quoter(swapInputsForQuote, uniqueKlendAccounts);

    const quotePriceCalcs = depositLeverageCalcsDebtFlash({
      depositAmount,
      depositTokenIsCollToken: selectedTokenIsCollToken,
      depositTokenIsSol,
      priceDebtToColl: swapQuote.priceAInB,
      targetLeverage,
      slippagePct,
      flashLoanFee,
    });

    const swapInputAmountQuotePrice = toLamports(quotePriceCalcs.swapDebtTokenIn, debtReserve.stats.decimals).ceil();

    return {
      swapInputs: {
        inputAmountLamports: swapInputAmountQuotePrice,
        minOutAmountLamports: toLamports(quotePriceCalcs.swapCollTokenExpectedOut, collReserve.stats.decimals),
        inputMint: debtTokenMint,
        outputMint: collTokenMint,
      },
      flashLoanInfo: klendIxs.flashLoanInfo,
      initialInputs: {
        calcs: quotePriceCalcs,
        swapQuote,
        currentSlot,
        currentLedgerInstant,
        obligation: resolvedObligation,
        klendAccounts: uniqueKlendAccounts,
      },
    };
  }
}

export async function getDepositWithLeverageIxs<QuoteResponse>({
  owner,
  kaminoMarket,
  debtReserveAddress,
  collReserveAddress,
  depositAmount,
  priceDebtToColl,
  slippagePct,
  obligation,
  referrer,
  currentSlot: suppliedCurrentSlot,
  currentLedgerInstant: suppliedLedgerInstant,
  targetLeverage,
  selectedTokenMint,
  obligationTypeTagOverride,
  scopeRefreshIx,
  budgetAndPriorityFeeIxs,
  quoteBufferBps,
  quoter,
  swapper,
  elevationGroupOverride,
  useV2Ixs,
  rollOver,
  flashBorrowType,
  logger,
}: DepositWithLeverageParams<QuoteResponse>): Promise<Array<DepositLeverageIxsResponse<QuoteResponse>>> {
  const debtReserve = kaminoMarket.getExistingReserveByAddress(debtReserveAddress);
  const ledger = await resolveLedgerInput(
    kaminoMarket.getRpc(),
    suppliedCurrentSlot,
    suppliedLedgerInstant,
    !debtReserve.state.config.debtMaturityTimestamp.eqn(0),
    'getDepositWithLeverageIxs'
  );
  const { currentSlot, currentLedgerInstant } = ledger;
  const { swapInputs, initialInputs } = await getDepositWithLeverageSwapInputs({
    owner,
    kaminoMarket,
    debtReserveAddress,
    collReserveAddress,
    depositAmount,
    priceDebtToColl,
    slippagePct,
    obligation,
    referrer,
    currentSlot,
    currentLedgerInstant,
    targetLeverage,
    selectedTokenMint,
    obligationTypeTagOverride,
    scopeRefreshIx,
    budgetAndPriorityFeeIxs,
    quoteBufferBps,
    quoter,
    useV2Ixs,
    flashBorrowType,
    logger,
  });

  const depositSwapper: SwapIxsProvider<QuoteResponse> = swapper;

  const swapsArray = await depositSwapper(swapInputs, initialInputs.klendAccounts, initialInputs.swapQuote);

  // Strategy lookup table logic removed

  const collReserve = kaminoMarket.getExistingReserveByAddress(collReserveAddress);
  // Leverage deposit borrows debt; reject up front if the debt is a fixed-term reserve past its maturity (the
  // on-chain borrow would revert with ReserveDebtMaturityReached).
  if (!debtReserve.state.config.debtMaturityTimestamp.eqn(0)) {
    debtReserve.assertCanOriginateDebt(
      Number(requireMatchingLedgerInstant(currentSlot, currentLedgerInstant, 'getDepositWithLeverageIxs').blockTime)
    );
  }
  const solTokenReserve =
    collReserve.getLiquidityMint() === WRAPPED_SOL_MINT
      ? collReserve
      : debtReserve.getLiquidityMint() === WRAPPED_SOL_MINT
      ? debtReserve
      : undefined;
  const depositTokenIsSol = !solTokenReserve ? false : selectedTokenMint === solTokenReserve!.getLiquidityMint();

  const swapIxsArray = swapsArray.map((swap) => {
    return {
      preActionIxs: [] as Instruction[],
      swapIxs: swap.swapIxs,
      lookupTables: swap.lookupTables,
      quote: swap.quote,
    };
  });

  let depositWithLeverageIxs: LeverageIxsOutput[];
  const depositCalcs = initialInputs.calcs;
  if (flashBorrowType !== 'debt') {
    // Coll flash path (default): flash borrow coll -> deposit+borrow -> swap debt->coll -> flash repay coll
    assertDepositCollFlashCalcs(depositCalcs);
    depositWithLeverageIxs = await buildDepositWithLeverageIxsCollFlash(
      kaminoMarket,
      debtReserve!,
      collReserve!,
      owner,
      initialInputs.obligation,
      referrer,
      currentSlot,
      depositTokenIsSol,
      scopeRefreshIx,
      depositCalcs,
      budgetAndPriorityFeeIxs,
      swapIxsArray,
      useV2Ixs,
      elevationGroupOverride,
      rollOver
    );
  } else {
    // Debt flash path: flash borrow debt -> swap debt->coll -> deposit+borrow -> flash repay debt
    assertDepositDebtFlashCalcs(depositCalcs);
    depositWithLeverageIxs = await buildDepositWithLeverageIxsDebtFlash(
      kaminoMarket,
      debtReserve!,
      collReserve!,
      owner,
      initialInputs.obligation,
      referrer,
      currentSlot,
      depositTokenIsSol,
      scopeRefreshIx,
      depositCalcs,
      budgetAndPriorityFeeIxs,
      swapIxsArray,
      useV2Ixs,
      elevationGroupOverride
    );
  }

  // Depositing leverage borrows debt; if the debt reserve is fixed-rate the borrow (re)stamps a fresh term/maturity.
  const reorigination = debtReserve.getFixedTermReorigination();
  return depositWithLeverageIxs.map((depositWithLeverageIxs, index) => {
    return {
      ixs: depositWithLeverageIxs.instructions,
      flashLoanInfo: depositWithLeverageIxs.flashLoanInfo,
      lookupTables: swapsArray[index].lookupTables,
      swapInputs,
      initialInputs,
      quote: swapsArray[index].quote.quoteResponse,
      reorigination,
    };
  });
}

async function buildDepositWithLeverageIxsCollFlash<QuoteResponse>(
  market: KaminoMarket,
  debtReserve: KaminoReserve,
  collReserve: KaminoReserve,
  owner: TransactionSigner,
  obligation: KaminoObligation | ObligationType | undefined,
  referrer: Option<Address>,
  currentSlot: Slot,
  depositTokenIsSol: boolean,
  scopeRefreshIx: Instruction[],
  calcs: DepositLeverageCalcsResult,
  budgetAndPriorityFeeIxs: Instruction[] | undefined,
  swapQuoteIxsArray: SwapIxs<QuoteResponse>[],
  useV2Ixs: boolean,
  elevationGroupOverride?: number,
  rollOver?: boolean
): Promise<LeverageIxsOutput[]> {
  const collTokenMint = collReserve.getLiquidityMint();
  const debtTokenMint = debtReserve.getLiquidityMint();
  const [[collTokenAta]] = await Promise.all([
    findAssociatedTokenPda({
      owner: owner.address,
      mint: collTokenMint,
      tokenProgram: collReserve.getLiquidityTokenProgram(),
    }),
  ]);

  // 1. Create atas & budget ixs
  const { budgetIxs, createAtasIxs } = await getSetupIxs(
    owner,
    collTokenMint,
    collReserve,
    debtTokenMint,
    debtReserve,
    budgetAndPriorityFeeIxs
  );

  const fillWsolAtaIxs: Instruction[] = [];
  if (depositTokenIsSol) {
    fillWsolAtaIxs.push(
      ...getTransferWsolIxs(
        owner,
        await getAssociatedTokenAddress(WRAPPED_SOL_MINT, owner.address),
        lamports(BigInt(toLamports(calcs.initDepositInSol, SOL_DECIMALS).ceil().toString()))
      )
    );
  }

  // 2. Flash borrow & repay the collateral amount needed for given leverage
  // if user deposits coll, then we borrow the diff, else we borrow the entire amount
  const { flashBorrowIx, flashRepayIx } = getFlashLoanInstructions({
    borrowIxIndex: createAtasIxs.length + fillWsolAtaIxs.length + scopeRefreshIx.length,
    userTransferAuthority: owner,
    lendingMarketAuthority: await market.getLendingMarketAuthority(),
    lendingMarketAddress: market.getAddress(),
    reserve: collReserve,
    // Ceil: flash-borrow integer lamports at the call site (the swap/borrow funding leg covers the SC fee). Flooring
    // would under-borrow the deposit bridge by up to 1 lamport.
    amountLamports: toLamports(calcs.flashBorrowInCollToken, collReserve.stats.decimals).ceil(),
    destinationAta: collTokenAta,
    // TODO(referrals): once we support referrals, we will have to replace the placeholder args below:
    referrerAccount: none(),
    referrerTokenState: none(),
    programId: market.programId,
  });

  // 3. Deposit initial tokens + borrowed tokens into reserve
  const kaminoDepositAndBorrowAction = await KaminoAction.buildDepositAndBorrowTxns({
    kaminoMarket: market,
    depositAmount: toLamports(calcs.collTokenToDeposit, collReserve.stats.decimals).floor().toString(),
    depositReserveAddress: collReserve.address,
    borrowAmount: toLamports(calcs.debtTokenToBorrow, debtReserve.stats.decimals).ceil().toString(),
    borrowReserveAddress: debtReserve.address,
    owner,
    obligation: obligation!,
    useV2Ixs,
    scopeRefreshConfig: undefined,
    extraComputeBudget: 0,
    includeAtaIxs: false,
    requestElevationGroup: elevationGroupOverride === 0 ? false : true, // emode
    initUserMetadata: { skipInitialization: true, skipLutCreation: true }, // to be checked and created in a setup tx in the UI
    referrer,
    currentSlot,
    rollOver,
  });

  return swapQuoteIxsArray.map((swapQuoteIxs) => {
    // 4. Swap
    const { swapIxs } = swapQuoteIxs;
    const swapInstructions = removeBudgetIxs(swapIxs);
    const flashBorrowReserve = collReserve;
    const flashLoanInfo = {
      flashBorrowReserve: flashBorrowReserve.address,
      flashLoanFee: flashBorrowReserve.getFlashLoanFee(),
    };

    return {
      flashLoanInfo,
      instructions: [
        ...scopeRefreshIx,
        ...createAtasIxs,
        ...fillWsolAtaIxs,
        ...[flashBorrowIx],
        ...KaminoAction.actionToIxs(kaminoDepositAndBorrowAction),
        ...swapInstructions,
        ...[flashRepayIx],
        ...budgetIxs,
      ],
    };
  });
}

/**
 * Deposit with flash borrow DEBT token.
 * Order: scopeRefresh → createAtas → fillWsol → flashBorrow(DEBT) → swap(debt→coll) → deposit+borrow → flashRepay(DEBT) → budget
 */
async function buildDepositWithLeverageIxsDebtFlash<QuoteResponse>(
  market: KaminoMarket,
  debtReserve: KaminoReserve,
  collReserve: KaminoReserve,
  owner: TransactionSigner,
  obligation: KaminoObligation | ObligationType | undefined,
  referrer: Option<Address>,
  currentSlot: Slot,
  depositTokenIsSol: boolean,
  scopeRefreshIx: Instruction[],
  calcs: DepositLeverageDebtFlashCalcsResult,
  budgetAndPriorityFeeIxs: Instruction[] | undefined,
  swapQuoteIxsArray: SwapIxs<QuoteResponse>[],
  useV2Ixs: boolean,
  elevationGroupOverride?: number
): Promise<LeverageIxsOutput[]> {
  const collTokenMint = collReserve.getLiquidityMint();
  const debtTokenMint = debtReserve.getLiquidityMint();
  const [debtTokenAta] = await findAssociatedTokenPda({
    owner: owner.address,
    mint: debtTokenMint,
    tokenProgram: debtReserve.getLiquidityTokenProgram(),
  });

  // 1. Create atas & budget ixs
  const { budgetIxs, createAtasIxs } = await getSetupIxs(
    owner,
    collTokenMint,
    collReserve,
    debtTokenMint,
    debtReserve,
    budgetAndPriorityFeeIxs
  );

  const fillWsolAtaIxs: Instruction[] = [];
  if (depositTokenIsSol) {
    fillWsolAtaIxs.push(
      ...getTransferWsolIxs(
        owner,
        await getAssociatedTokenAddress(WRAPPED_SOL_MINT, owner.address),
        lamports(BigInt(toLamports(calcs.initDepositInSol, SOL_DECIMALS).ceil().toString()))
      )
    );
  }

  // 2. Flash borrow DEBT token = the exact swap spend (`flashBorrowInDebtToken`).
  // Ceil: this funds the ceil-sized swap exact-in; flooring under-covers it by 1 lamport.
  const flashBorrowDebtLamports = toLamports(calcs.flashBorrowInDebtToken, debtReserve.stats.decimals).ceil();
  // The klend borrow that repays the flash must cover `flashBorrow + SC fee` (1-lamport minimum + referrer split
  // honoured) — size it from the shared helper instead of hand-rolling `flashBorrow*(1+fee)`. fee==0 → borrow == flash.
  const debtBorrowToRepayFlashLamports = calcFlashLoanFees({
    reserve: debtReserve,
    referralFeeBps: 0,
    hasReferral: false, // the flash ixs carry no referrer; the SC fee total is referral-split-independent anyway
    flashBorrowAmountLamports: flashBorrowDebtLamports,
  }).flashRepayDebitLamports.ceil();
  const { flashBorrowIx, flashRepayIx } = getFlashLoanInstructions({
    borrowIxIndex: createAtasIxs.length + fillWsolAtaIxs.length + scopeRefreshIx.length,
    userTransferAuthority: owner,
    lendingMarketAuthority: await market.getLendingMarketAuthority(),
    lendingMarketAddress: market.getAddress(),
    reserve: debtReserve,
    amountLamports: flashBorrowDebtLamports,
    destinationAta: debtTokenAta,
    referrerAccount: none(),
    referrerTokenState: none(),
    programId: market.programId,
  });

  // 3. Deposit coll + borrow debt
  const kaminoDepositAndBorrowAction = await KaminoAction.buildDepositAndBorrowTxns({
    kaminoMarket: market,
    depositAmount: toLamports(calcs.collTokenToDeposit, collReserve.stats.decimals).floor().toString(),
    depositReserveAddress: collReserve.address,
    borrowAmount: debtBorrowToRepayFlashLamports.toString(),
    borrowReserveAddress: debtReserve.address,
    owner,
    obligation: obligation!,
    useV2Ixs,
    scopeRefreshConfig: undefined,
    extraComputeBudget: 0,
    includeAtaIxs: false,
    requestElevationGroup: elevationGroupOverride === 0 ? false : true,
    initUserMetadata: { skipInitialization: true, skipLutCreation: true },
    referrer,
    currentSlot,
  });

  return swapQuoteIxsArray.map((swapQuoteIxs) => {
    const swapInstructions = removeBudgetIxs(swapQuoteIxs.swapIxs);
    const flashBorrowReserve = debtReserve;
    const flashLoanInfo = {
      flashBorrowReserve: flashBorrowReserve.address,
      flashLoanFee: flashBorrowReserve.getFlashLoanFee(),
    };

    // Key difference: swap BEFORE deposit+borrow (we need the coll from the swap to deposit)
    return {
      flashLoanInfo,
      instructions: [
        ...scopeRefreshIx,
        ...createAtasIxs,
        ...fillWsolAtaIxs,
        ...[flashBorrowIx],
        ...swapInstructions,
        ...KaminoAction.actionToIxs(kaminoDepositAndBorrowAction),
        ...[flashRepayIx],
        ...budgetIxs,
      ],
    };
  });
}

export async function getWithdrawWithLeverageSwapInputs<QuoteResponse>({
  owner,
  kaminoMarket,
  debtReserveAddress,
  collReserveAddress,
  deposited,
  borrowed,
  obligation,
  referrer,
  currentSlot: suppliedCurrentSlot,
  currentLedgerInstant: suppliedLedgerInstant,
  withdrawAmount,
  priceCollToDebt,
  slippagePct,
  isClosingPosition,
  selectedTokenMint,
  budgetAndPriorityFeeIxs,
  scopeRefreshIx,
  quoteBufferBps,
  quoter,
  useV2Ixs,
  userSolBalanceLamports,
  flashBorrowType,
  logger,
}: WithdrawWithLeverageSwapInputsParams<QuoteResponse>): Promise<{
  swapInputs: SwapInputs;
  flashLoanInfo: FlashLoanInfo;
  initialInputs: WithdrawLeverageInitialInputs<QuoteResponse>;
}> {
  const collReserve = kaminoMarket.getExistingReserveByAddress(collReserveAddress);
  const debtReserve = kaminoMarket.getExistingReserveByAddress(debtReserveAddress);
  const ledger = await resolveLedgerInput(
    kaminoMarket.getRpc(),
    suppliedCurrentSlot,
    suppliedLedgerInstant,
    debtReserve.getKind().isFixedRate(),
    'getWithdrawWithLeverageSwapInputs'
  );
  const { currentSlot, currentLedgerInstant } = ledger;
  const log = logger ?? (() => {});
  const collTokenMint = collReserve.getLiquidityMint();
  const debtTokenMint = debtReserve.getLiquidityMint();
  const selectedTokenIsCollToken = selectedTokenMint === collTokenMint;
  const inputTokenIsSol = selectedTokenMint === WRAPPED_SOL_MINT;

  // Closing to the debt token swaps the FULL withdrawn collateral: the exact-in is sized from the
  // off-chain estimate of the deposit (`deposited`), while the U64_MAX withdraw redeems the
  // *actual* balance at the execution slot. Haircut such a swap input so estimate drift cannot
  // push it above the redeem output; minOut is untouched (the slippage margin dwarfs the 1e-6
  // haircut). Non-closing withdraws keep their margin via the buffered withdraw in the builders.
  // See `lending_operations/redeem_drift.ts`.
  const sizeSwapInForRedeemDrift = (swapInLamports: Decimal): Decimal =>
    sizeRedeemFundedPull(swapInLamports, isClosingPosition && !selectedTokenIsCollToken);

  const dummySwapIxs: SwapIxs<QuoteResponse>[] = [
    { preActionIxs: [], swapIxs: [], lookupTables: [], quote: { priceAInB: new Decimal(0), quoteResponse: undefined } },
  ];

  if (flashBorrowType !== 'coll') {
    // Debt flash path (default): flash borrow debt -> repay+withdraw -> swap coll->debt -> flash repay debt
    const flashLoanFee = debtReserve!.getFlashLoanFee();

    const calcs = withdrawLeverageCalcs(
      kaminoMarket,
      collReserve!,
      debtReserve!,
      priceCollToDebt,
      withdrawAmount,
      deposited,
      borrowed,
      currentSlot,
      isClosingPosition,
      selectedTokenIsCollToken,
      selectedTokenMint,
      obligation,
      flashLoanFee,
      slippagePct,
      currentLedgerInstant
    );

    log('Withdraw calcs (debt flash)', toJson(calcs));

    const klendIxs = (
      await buildWithdrawWithLeverageIxsDebtFlash(
        kaminoMarket,
        debtReserve!,
        collReserve!,
        owner,
        obligation,
        referrer,
        currentSlot,
        isClosingPosition,
        inputTokenIsSol,
        scopeRefreshIx,
        calcs,
        budgetAndPriorityFeeIxs,
        dummySwapIxs,
        useV2Ixs,
        userSolBalanceLamports
      )
    )[0];

    const uniqueKlendAccounts = uniqueAccountsWithProgramIds(klendIxs.instructions);
    const swapInputAmount = toLamports(calcs.collTokenSwapIn, collReserve!.getMintDecimals()).ceil();

    const swapInputsForQuote: SwapInputs = {
      inputAmountLamports: swapInputAmount.mul(new Decimal(1).add(quoteBufferBps.div(FullBPS))),
      inputMint: collTokenMint,
      outputMint: debtTokenMint,
    };

    const swapQuote = await quoter(swapInputsForQuote, uniqueKlendAccounts);

    const calcsQuotePrice = withdrawLeverageCalcs(
      kaminoMarket,
      collReserve!,
      debtReserve!,
      swapQuote.priceAInB,
      withdrawAmount,
      deposited,
      borrowed,
      currentSlot,
      isClosingPosition,
      selectedTokenIsCollToken,
      selectedTokenMint,
      obligation,
      flashLoanFee,
      slippagePct,
      currentLedgerInstant
    );

    const swapInputAmountQuotePrice = toLamports(
      calcsQuotePrice.collTokenSwapIn,
      collReserve!.getMintDecimals()
    ).ceil();

    return {
      swapInputs: {
        inputAmountLamports: sizeSwapInForRedeemDrift(swapInputAmountQuotePrice),
        minOutAmountLamports: calcsQuotePrice.repayFundingAmount,
        inputMint: collTokenMint,
        outputMint: debtTokenMint,
      },
      flashLoanInfo: klendIxs.flashLoanInfo,
      initialInputs: {
        calcs: calcsQuotePrice,
        swapQuote,
        currentSlot,
        currentLedgerInstant,
        obligation,
        klendAccounts: uniqueKlendAccounts,
      },
    };
  } else {
    // Coll flash path: flash borrow coll -> swap coll->debt -> repay+withdraw -> flash repay coll
    const flashLoanFee = collReserve!.getFlashLoanFee();

    const calcs = withdrawLeverageCalcsCollFlash(
      kaminoMarket,
      collReserve!,
      debtReserve!,
      priceCollToDebt,
      withdrawAmount,
      deposited,
      borrowed,
      currentSlot,
      isClosingPosition,
      selectedTokenIsCollToken,
      selectedTokenMint,
      obligation,
      flashLoanFee,
      slippagePct,
      currentLedgerInstant
    );

    log('Withdraw calcs (coll flash)', toJson(calcs));

    const klendIxs = (
      await buildWithdrawWithLeverageIxsCollFlash(
        kaminoMarket,
        debtReserve!,
        collReserve!,
        owner,
        obligation,
        referrer,
        currentSlot,
        isClosingPosition,
        inputTokenIsSol,
        scopeRefreshIx,
        calcs,
        budgetAndPriorityFeeIxs,
        dummySwapIxs,
        useV2Ixs,
        userSolBalanceLamports
      )
    )[0];

    const uniqueKlendAccounts = uniqueAccountsWithProgramIds(klendIxs.instructions);
    const swapInputAmount = toLamports(calcs.collTokenSwapIn, collReserve!.getMintDecimals()).ceil();

    const swapInputsForQuote: SwapInputs = {
      inputAmountLamports: swapInputAmount.mul(new Decimal(1).add(quoteBufferBps.div(FullBPS))),
      inputMint: collTokenMint,
      outputMint: debtTokenMint,
    };

    const swapQuote = await quoter(swapInputsForQuote, uniqueKlendAccounts);

    const calcsQuotePrice = withdrawLeverageCalcsCollFlash(
      kaminoMarket,
      collReserve!,
      debtReserve!,
      swapQuote.priceAInB,
      withdrawAmount,
      deposited,
      borrowed,
      currentSlot,
      isClosingPosition,
      selectedTokenIsCollToken,
      selectedTokenMint,
      obligation,
      flashLoanFee,
      slippagePct,
      currentLedgerInstant
    );

    const swapInputAmountQuotePrice = toLamports(
      calcsQuotePrice.collTokenSwapIn,
      collReserve!.getMintDecimals()
    ).ceil();

    return {
      swapInputs: {
        inputAmountLamports: sizeSwapInForRedeemDrift(swapInputAmountQuotePrice),
        minOutAmountLamports: calcsQuotePrice.repayFundingAmount,
        inputMint: collTokenMint,
        outputMint: debtTokenMint,
      },
      flashLoanInfo: klendIxs.flashLoanInfo,
      initialInputs: {
        calcs: calcsQuotePrice,
        swapQuote,
        currentSlot,
        currentLedgerInstant,
        obligation,
        klendAccounts: uniqueKlendAccounts,
      },
    };
  }
}

export async function getWithdrawWithLeverageIxs<QuoteResponse>({
  owner,
  kaminoMarket,
  debtReserveAddress,
  collReserveAddress,
  obligation,
  deposited,
  borrowed,
  referrer,
  currentSlot: suppliedCurrentSlot,
  currentLedgerInstant: suppliedLedgerInstant,
  withdrawAmount,
  priceCollToDebt,
  slippagePct,
  isClosingPosition,
  selectedTokenMint,
  budgetAndPriorityFeeIxs,
  scopeRefreshIx,
  quoteBufferBps,
  quoter,
  swapper,
  useV2Ixs,
  userSolBalanceLamports,
  flashBorrowType,
}: WithdrawWithLeverageParams<QuoteResponse>): Promise<Array<WithdrawLeverageIxsResponse<QuoteResponse>>> {
  const collReserve = kaminoMarket.getExistingReserveByAddress(collReserveAddress);
  const debtReserve = kaminoMarket.getExistingReserveByAddress(debtReserveAddress);
  const ledger = await resolveLedgerInput(
    kaminoMarket.getRpc(),
    suppliedCurrentSlot,
    suppliedLedgerInstant,
    debtReserve.getKind().isFixedRate(),
    'getWithdrawWithLeverageIxs'
  );
  const { currentSlot, currentLedgerInstant } = ledger;

  const inputTokenIsSol = selectedTokenMint === WRAPPED_SOL_MINT;
  const { swapInputs, initialInputs } = await getWithdrawWithLeverageSwapInputs({
    owner,
    kaminoMarket,
    debtReserveAddress,
    collReserveAddress,
    deposited,
    borrowed,
    obligation,
    referrer,
    currentSlot,
    currentLedgerInstant,
    withdrawAmount,
    priceCollToDebt,
    slippagePct,
    isClosingPosition,
    selectedTokenMint,
    budgetAndPriorityFeeIxs,
    scopeRefreshIx,
    quoteBufferBps,
    quoter,
    useV2Ixs,
    userSolBalanceLamports,
    flashBorrowType,
  });

  const withdrawSwapper: SwapIxsProvider<QuoteResponse> = swapper;

  const swapsArray = await withdrawSwapper(swapInputs, initialInputs.klendAccounts, initialInputs.swapQuote);

  // Strategy lookup table logic removed

  const swapIxsArray = swapsArray.map((swap) => {
    return {
      preActionIxs: [] as Instruction[],
      swapIxs: swap.swapIxs,
      lookupTables: swap.lookupTables,
      quote: swap.quote,
    };
  });

  let withdrawWithLeverageIxs: LeverageIxsOutput[];
  const withdrawCalcs = initialInputs.calcs;
  if (flashBorrowType !== 'coll') {
    // Debt flash path (default): flash borrow debt -> repay+withdraw -> swap coll->debt -> flash repay debt
    assertWithdrawDebtFlashCalcs(withdrawCalcs);
    withdrawWithLeverageIxs = await buildWithdrawWithLeverageIxsDebtFlash<QuoteResponse>(
      kaminoMarket,
      debtReserve!,
      collReserve!,
      owner,
      obligation,
      referrer,
      currentSlot,
      isClosingPosition,
      inputTokenIsSol,
      scopeRefreshIx,
      withdrawCalcs,
      budgetAndPriorityFeeIxs,
      swapIxsArray,
      useV2Ixs,
      userSolBalanceLamports
    );
  } else {
    // Coll flash path: flash borrow coll -> swap coll->debt -> repay+withdraw -> flash repay coll
    assertWithdrawCollFlashCalcs(withdrawCalcs);
    withdrawWithLeverageIxs = await buildWithdrawWithLeverageIxsCollFlash<QuoteResponse>(
      kaminoMarket,
      debtReserve!,
      collReserve!,
      owner,
      obligation,
      referrer,
      currentSlot,
      isClosingPosition,
      inputTokenIsSol,
      scopeRefreshIx,
      withdrawCalcs,
      budgetAndPriorityFeeIxs,
      swapIxsArray,
      useV2Ixs,
      userSolBalanceLamports
    );
  }

  // Send ixs and lookup tables
  return withdrawWithLeverageIxs.map((ixs, index) => {
    return {
      ixs: ixs.instructions,
      flashLoanInfo: ixs.flashLoanInfo,
      lookupTables: swapsArray[index].lookupTables,
      swapInputs,
      initialInputs: initialInputs,
      quote: swapsArray[index].quote.quoteResponse,
    };
  });
}

export async function buildWithdrawWithLeverageIxsDebtFlash<QuoteResponse>(
  market: KaminoMarket,
  debtReserve: KaminoReserve,
  collReserve: KaminoReserve,
  owner: TransactionSigner,
  obligation: KaminoObligation,
  referrer: Option<Address>,
  currentSlot: Slot,
  isClosingPosition: boolean,
  depositTokenIsSol: boolean,
  scopeRefreshIx: Instruction[],
  calcs: WithdrawLeverageCalcsResult,
  budgetAndPriorityFeeIxs: Instruction[] | undefined,
  swapQuoteIxsArray: SwapIxs<QuoteResponse>[],
  useV2Ixs: boolean,
  userSolBalanceLamports: number
): Promise<LeverageIxsOutput[]> {
  const collTokenMint = collReserve.getLiquidityMint();
  const debtTokenMint = debtReserve.getLiquidityMint();
  const debtTokenAta = await getAssociatedTokenAddress(
    debtTokenMint,
    owner.address,
    debtReserve.getLiquidityTokenProgram()
  );
  // 1. Create atas & budget txns & user metadata

  const { budgetIxs, createAtasIxs } = await getSetupIxs(
    owner,
    collTokenMint,
    collReserve,
    debtTokenMint,
    debtReserve,
    budgetAndPriorityFeeIxs
  );

  const closeWsolAtaIxs: Instruction[] = [];
  if (depositTokenIsSol || debtTokenMint === WRAPPED_SOL_MINT) {
    const wsolAta = await getAssociatedTokenAddress(WRAPPED_SOL_MINT, owner.address);
    closeWsolAtaIxs.push(
      getCloseAccountInstruction(
        {
          owner,
          destination: owner.address,
          account: wsolAta,
        },
        { programAddress: TOKEN_PROGRAM_ADDRESS }
      )
    );
  }

  // TODO: Mihai/Marius check if we can improve this logic and not convert any SOL
  // This is here so that we have enough wsol to repay in case the kAB swapped to sol after estimates is not enough
  const fillWsolAtaIxs: Instruction[] = [];
  if (debtTokenMint === WRAPPED_SOL_MINT) {
    const halfSolBalance = userSolBalanceLamports / LAMPORTS_PER_SOL / 2;
    const balanceToWrap = halfSolBalance < 0.1 ? halfSolBalance : 0.1;
    fillWsolAtaIxs.push(
      ...getTransferWsolIxs(
        owner,
        await getAssociatedTokenAddress(WRAPPED_SOL_MINT, owner.address),
        lamports(BigInt(toLamports(balanceToWrap, SOL_DECIMALS).ceil().toString()))
      )
    );
  }

  // 2. Prepare the flash borrow and flash repay amounts and ixs
  // We borrow exactly how much we need to repay
  // and repay that + flash amount fee
  const { flashBorrowIx, flashRepayIx } = getFlashLoanInstructions({
    borrowIxIndex: createAtasIxs.length + fillWsolAtaIxs.length + scopeRefreshIx.length,
    userTransferAuthority: owner,
    lendingMarketAuthority: await market.getLendingMarketAuthority(),
    lendingMarketAddress: market.getAddress(),
    reserve: debtReserve!,
    // Flash-borrow the funding amount (principal + fixed-term early-repay penalty) so the on-chain repay debit
    // (`repay + penalty`) is covered; the repay instruction below uses the principal only.
    amountLamports: toLamports(calcs.repayFundingAmount, debtReserve!.stats.decimals).ceil(),
    destinationAta: debtTokenAta,
    referrerAccount: none(),
    referrerTokenState: none(),
    programId: market.programId,
  });

  // 3. Repay borrowed tokens and Withdraw tokens from reserve that will be swapped to repay flash loan
  const repayAndWithdrawAction = await KaminoAction.buildRepayAndWithdrawTxns({
    kaminoMarket: market,
    repayAmount: isClosingPosition
      ? U64_MAX
      : toLamports(calcs.repayAmount, debtReserve.stats.decimals).floor().toString(),
    repayReserveAddress: debtReserve.address,
    // Buffered (non-close) so the redeem covers the exact-in swap it funds despite exchange-rate
    // drift — see `lending_operations/redeem_drift.ts`. No cap needed: `depositTokenWithdrawAmount`
    // is a partial slice strictly below the deposit, and near-total withdraws route as closes.
    withdrawAmount: redeemWithdrawAmount(
      toLamports(calcs.depositTokenWithdrawAmount, collReserve!.stats.decimals),
      isClosingPosition
    ),
    withdrawReserveAddress: collReserve.address,
    payer: owner,
    currentSlot,
    obligation,
    useV2Ixs,
    scopeRefreshConfig: undefined,
    extraComputeBudget: 0,
    includeAtaIxs: false,
    requestElevationGroup: false,
    initUserMetadata: { skipInitialization: true, skipLutCreation: true }, // to be checked and created in a setup tx in the UI (won't be the case for withdraw anyway as this would be created in deposit)
    referrer,
  });

  return swapQuoteIxsArray.map((swapQuoteIxs) => {
    const swapInstructions = removeBudgetIxs(swapQuoteIxs.swapIxs);

    return {
      flashLoanInfo: {
        flashLoanFee: debtReserve.getFlashLoanFee(),
        flashBorrowReserve: debtReserve.address,
      },
      instructions: [
        ...scopeRefreshIx,
        ...createAtasIxs,
        ...fillWsolAtaIxs,
        ...[flashBorrowIx],
        ...KaminoAction.actionToIxs(repayAndWithdrawAction),
        ...swapInstructions,
        ...[flashRepayIx],
        ...closeWsolAtaIxs,
        ...budgetIxs,
      ],
    };
  });
}

/**
 * Withdraw with flash borrow COLLATERAL token.
 * Order: scopeRefresh → createAtas → fillWsol → flashBorrow(COLL) → swap(coll→debt) → repay+withdraw → flashRepay(COLL) → closeWsol → budget
 */
async function buildWithdrawWithLeverageIxsCollFlash<QuoteResponse>(
  market: KaminoMarket,
  debtReserve: KaminoReserve,
  collReserve: KaminoReserve,
  owner: TransactionSigner,
  obligation: KaminoObligation,
  referrer: Option<Address>,
  currentSlot: Slot,
  isClosingPosition: boolean,
  depositTokenIsSol: boolean,
  scopeRefreshIx: Instruction[],
  calcs: WithdrawLeverageCollFlashCalcsResult,
  budgetAndPriorityFeeIxs: Instruction[] | undefined,
  swapQuoteIxsArray: SwapIxs<QuoteResponse>[],
  useV2Ixs: boolean,
  userSolBalanceLamports: number
): Promise<LeverageIxsOutput[]> {
  const collTokenMint = collReserve.getLiquidityMint();
  const debtTokenMint = debtReserve.getLiquidityMint();
  const [collTokenAta] = await findAssociatedTokenPda({
    owner: owner.address,
    mint: collTokenMint,
    tokenProgram: collReserve.getLiquidityTokenProgram(),
  });

  // 1. Create atas & budget ixs
  const { budgetIxs, createAtasIxs } = await getSetupIxs(
    owner,
    collTokenMint,
    collReserve,
    debtTokenMint,
    debtReserve,
    budgetAndPriorityFeeIxs
  );

  const closeWsolAtaIxs: Instruction[] = [];
  if (depositTokenIsSol || collTokenMint === WRAPPED_SOL_MINT) {
    const wsolAta = await getAssociatedTokenAddress(WRAPPED_SOL_MINT, owner.address);
    closeWsolAtaIxs.push(
      getCloseAccountInstruction(
        {
          owner,
          destination: owner.address,
          account: wsolAta,
        },
        { programAddress: TOKEN_PROGRAM_ADDRESS }
      )
    );
  }

  const fillWsolAtaIxs: Instruction[] = [];
  if (collTokenMint === WRAPPED_SOL_MINT) {
    const halfSolBalance = userSolBalanceLamports / LAMPORTS_PER_SOL / 2;
    const balanceToWrap = halfSolBalance < 0.1 ? halfSolBalance : 0.1;
    fillWsolAtaIxs.push(
      ...getTransferWsolIxs(
        owner,
        await getAssociatedTokenAddress(WRAPPED_SOL_MINT, owner.address),
        lamports(BigInt(toLamports(balanceToWrap, SOL_DECIMALS).ceil().toString()))
      )
    );
  }

  // 2. Flash borrow COLL token = the exact swap spend (`flashBorrowInCollToken`), sized by the canonical
  // `calcCollFlashLegLamports` (shared with the flash-borrow-type selector so viability and execution agree):
  // ceil-rounded borrow (flooring under-covers the exact-in swap by 1 lamport) + the SC flash fee (1-lamport
  // minimum, no referrer) the withdraw leg must fund.
  const collFlashLeg = calcCollFlashLegLamports({
    collReserve,
    flashBorrowCollTokens: calcs.flashBorrowInCollToken,
    redeemBaseCollTokens: calcs.depositTokenWithdrawAmount,
  });
  const { flashBorrowIx, flashRepayIx } = getFlashLoanInstructions({
    borrowIxIndex: createAtasIxs.length + fillWsolAtaIxs.length + scopeRefreshIx.length,
    userTransferAuthority: owner,
    lendingMarketAuthority: await market.getLendingMarketAuthority(),
    lendingMarketAddress: market.getAddress(),
    reserve: collReserve,
    amountLamports: collFlashLeg.flashBorrowLamports,
    destinationAta: collTokenAta,
    referrerAccount: none(),
    referrerTokenState: none(),
    programId: market.programId,
  });

  // 3. Repay debt + withdraw coll. The withdraw pull = user-net base (`depositTokenWithdrawAmount`) + the flash fee, so
  // the ATA holds `flashBorrow + fee` at flash-repay with no reliance on pre-existing dust (close → U64_MAX, fee unused).
  const repayAndWithdrawAction = await KaminoAction.buildRepayAndWithdrawTxns({
    kaminoMarket: market,
    repayAmount: isClosingPosition
      ? U64_MAX
      : toLamports(calcs.repayAmount, debtReserve.stats.decimals).floor().toString(),
    repayReserveAddress: debtReserve.address,
    // Buffered (non-close) so the redeem covers the exact-in swap and the coll flash repay it
    // funds despite exchange-rate drift — see `lending_operations/redeem_drift.ts`. No cap needed:
    // `depositTokenWithdrawAmount` is a partial slice strictly below the deposit, and near-total
    // withdraws route as closes.
    withdrawAmount: redeemWithdrawAmount(collFlashLeg.redeemCollLamports, isClosingPosition),
    withdrawReserveAddress: collReserve.address,
    payer: owner,
    currentSlot,
    obligation,
    useV2Ixs,
    scopeRefreshConfig: undefined,
    extraComputeBudget: 0,
    includeAtaIxs: false,
    requestElevationGroup: false,
    initUserMetadata: { skipInitialization: true, skipLutCreation: true },
    referrer,
  });

  return swapQuoteIxsArray.map((swapQuoteIxs) => {
    const swapInstructions = removeBudgetIxs(swapQuoteIxs.swapIxs);

    // Key difference: swap BEFORE repay+withdraw (we need the debt from the swap to repay)
    return {
      flashLoanInfo: {
        flashLoanFee: collReserve.getFlashLoanFee(),
        flashBorrowReserve: collReserve.address,
      },
      instructions: [
        ...scopeRefreshIx,
        ...createAtasIxs,
        ...fillWsolAtaIxs,
        ...[flashBorrowIx],
        ...swapInstructions,
        ...KaminoAction.actionToIxs(repayAndWithdrawAction),
        ...[flashRepayIx],
        ...closeWsolAtaIxs,
        ...budgetIxs,
      ],
    };
  });
}

export async function getAdjustLeverageSwapInputs<QuoteResponse>({
  owner,
  kaminoMarket,
  debtReserveAddress,
  collReserveAddress,
  obligation,
  depositedLamports,
  borrowedLamports,
  referrer,
  currentSlot: suppliedCurrentSlot,
  currentLedgerInstant: suppliedLedgerInstant,
  targetLeverage,
  priceCollToDebt,
  priceDebtToColl,
  slippagePct,
  budgetAndPriorityFeeIxs,
  scopeRefreshIx,
  quoteBufferBps,
  quoter,
  useV2Ixs,
  withdrawSlotOffset,
  userSolBalanceLamports,
  flashBorrowType,
}: AdjustLeverageSwapInputsParams<QuoteResponse>): Promise<{
  swapInputs: SwapInputs;
  flashLoanInfo: FlashLoanInfo;
  initialInputs: AdjustLeverageInitialInputs<QuoteResponse>;
}> {
  const collReserve = kaminoMarket.getExistingReserveByAddress(collReserveAddress);
  const debtReserve = kaminoMarket.getExistingReserveByAddress(debtReserveAddress);
  const ledger = await resolveLedgerInput(
    kaminoMarket.getRpc(),
    suppliedCurrentSlot,
    suppliedLedgerInstant,
    debtReserve.getKind().isFixedRate() || !debtReserve.state.config.debtMaturityTimestamp.eqn(0),
    'getAdjustLeverageSwapInputs'
  );
  const { currentSlot, currentLedgerInstant } = ledger;
  const collTokenMint = collReserve.getLiquidityMint();
  const debtTokenMint = debtReserve.getLiquidityMint();
  const deposited = fromLamports(depositedLamports, collReserve.stats.decimals);
  const borrowed = fromLamports(borrowedLamports, debtReserve.stats.decimals);

  // Getting current flash loan fee from the reserve we will flash borrow from
  const currentLeverage = obligation.refreshedStats.leverage;
  const isDepositViaLeverage = targetLeverage.gte(new Decimal(currentLeverage));
  // Determine effective flash borrow type: default is coll for increase, debt for decrease
  const effectiveFlashBorrowType = flashBorrowType || (isDepositViaLeverage ? 'coll' : 'debt');
  const flashLoanFee =
    effectiveFlashBorrowType === 'coll' ? collReserve.getFlashLoanFee() : debtReserve.getFlashLoanFee();

  const { adjustDepositPosition, adjustBorrowPosition } = calcAdjustAmounts({
    currentDepositPosition: deposited,
    currentBorrowPosition: borrowed,
    targetLeverage: targetLeverage,
    priceCollToDebt: priceCollToDebt,
    flashLoanFee: new Decimal(flashLoanFee),
  });

  const isDeposit = adjustDepositPosition.gte(0) && adjustBorrowPosition.gte(0);
  if (isDepositViaLeverage !== isDeposit) {
    throw new Error('Invalid target leverage');
  }

  if (isDeposit) {
    const dummySwapIxs: SwapIxs<QuoteResponse>[] = [
      {
        preActionIxs: [],
        swapIxs: [],
        lookupTables: [],
        quote: { priceAInB: new Decimal(0), quoteResponse: undefined },
      },
    ];

    if (effectiveFlashBorrowType !== 'debt') {
      // Coll flash path (default): flash borrow coll -> deposit -> borrow -> swap debt->coll -> flash repay coll
      const calcs = adjustDepositLeverageCalcs(
        debtReserve!,
        adjustDepositPosition,
        adjustBorrowPosition,
        priceDebtToColl,
        flashLoanFee,
        slippagePct
      );

      const klendIxs: LeverageIxsOutput = (
        await buildIncreaseLeverageIxsCollFlash(
          owner,
          kaminoMarket,
          collReserveAddress,
          debtReserveAddress,
          obligation,
          referrer,
          currentSlot,
          calcs,
          scopeRefreshIx,
          dummySwapIxs,
          budgetAndPriorityFeeIxs,
          useV2Ixs
        )
      )[0];

      const uniqueKlendAccounts = uniqueAccountsWithProgramIds(klendIxs.instructions);
      const swapInputAmount = toLamports(calcs.borrowAmount, debtReserve.stats.decimals).ceil();

      const swapInputsForQuote: SwapInputs = {
        inputAmountLamports: swapInputAmount.mul(new Decimal(1).add(quoteBufferBps.div(FullBPS))),
        inputMint: debtTokenMint,
        outputMint: collTokenMint,
      };

      const swapQuote = await quoter(swapInputsForQuote, uniqueKlendAccounts);
      // `priceAInB` is inverted (`1 / priceAInB`) into `priceCollToDebt` below; a non-positive/non-finite quote would
      // feed Infinity/NaN into the adjust sizing. Fail fast at the boundary.
      assertPositiveFiniteDecimal('adjust-leverage swap quote priceAInB', swapQuote.priceAInB);

      const {
        adjustDepositPosition: adjustDepositPositionQuotePrice,
        adjustBorrowPosition: adjustBorrowPositionQuotePrice,
      } = calcAdjustAmounts({
        currentDepositPosition: deposited,
        currentBorrowPosition: borrowed,
        targetLeverage,
        priceCollToDebt: new Decimal(1).div(swapQuote.priceAInB),
        flashLoanFee: new Decimal(flashLoanFee),
      });

      const calcsQuotePrice = adjustDepositLeverageCalcs(
        debtReserve,
        adjustDepositPositionQuotePrice,
        adjustBorrowPositionQuotePrice,
        swapQuote.priceAInB,
        flashLoanFee,
        slippagePct
      );

      const swapInputAmountQuotePrice = toLamports(calcsQuotePrice.borrowAmount, debtReserve.getMintDecimals()).ceil();

      // The coll ATA nets to zero after the flash-borrow-funded deposit and the flash repay debits
      // `flashBorrow + fee` (1-lamport minimum included), funded solely by the swap output — declare the canonical
      // lamport-domain debit as the minimum output. Mirrors the builder's floor-rounded flash borrow
      // (`buildIncreaseLeverageIxsCollFlash` floors to stay in lockstep with the floored deposit).
      const increaseFlashBorrowLamports = toLamports(
        calcsQuotePrice.adjustDepositPosition,
        collReserve.stats.decimals
      ).floor();
      const increaseMinCollOutLamports = calcFlashLoanFees({
        reserve: collReserve,
        referralFeeBps: 0,
        hasReferral: false,
        flashBorrowAmountLamports: increaseFlashBorrowLamports,
      }).flashRepayDebitLamports.ceil();

      return {
        swapInputs: {
          inputAmountLamports: swapInputAmountQuotePrice,
          minOutAmountLamports: increaseMinCollOutLamports,
          inputMint: debtTokenMint,
          outputMint: collTokenMint,
        },
        flashLoanInfo: klendIxs.flashLoanInfo,
        initialInputs: {
          calcs: calcsQuotePrice,
          swapQuote,
          currentSlot,
          currentLedgerInstant,
          obligation,
          klendAccounts: uniqueKlendAccounts,
          isDeposit,
        },
      };
    } else {
      // Debt flash path: flash borrow debt -> swap debt->coll -> deposit -> borrow -> flash repay debt
      const calcs = adjustDepositLeverageCalcsDebtFlash(
        debtReserve!,
        adjustDepositPosition,
        adjustBorrowPosition,
        priceDebtToColl,
        flashLoanFee,
        slippagePct
      );

      const klendIxs: LeverageIxsOutput = (
        await buildIncreaseLeverageIxsDebtFlash(
          owner,
          kaminoMarket,
          collReserveAddress,
          debtReserveAddress,
          obligation,
          referrer,
          currentSlot,
          calcs,
          scopeRefreshIx,
          dummySwapIxs,
          budgetAndPriorityFeeIxs,
          useV2Ixs
        )
      )[0];

      const uniqueKlendAccounts = uniqueAccountsWithProgramIds(klendIxs.instructions);
      const swapInputAmount = toLamports(calcs.swapDebtTokenIn, debtReserve.stats.decimals).ceil();

      const swapInputsForQuote: SwapInputs = {
        inputAmountLamports: swapInputAmount.mul(new Decimal(1).add(quoteBufferBps.div(FullBPS))),
        inputMint: debtTokenMint,
        outputMint: collTokenMint,
      };

      const swapQuote = await quoter(swapInputsForQuote, uniqueKlendAccounts);
      // `priceAInB` is inverted (`1 / priceAInB`) into `priceCollToDebt` below; a non-positive/non-finite quote would
      // feed Infinity/NaN into the adjust sizing. Fail fast at the boundary.
      assertPositiveFiniteDecimal('adjust-leverage swap quote priceAInB', swapQuote.priceAInB);

      const {
        adjustDepositPosition: adjustDepositPositionQuotePrice,
        adjustBorrowPosition: adjustBorrowPositionQuotePrice,
      } = calcAdjustAmounts({
        currentDepositPosition: deposited,
        currentBorrowPosition: borrowed,
        targetLeverage,
        priceCollToDebt: new Decimal(1).div(swapQuote.priceAInB),
        flashLoanFee: new Decimal(flashLoanFee),
      });

      const calcsQuotePrice = adjustDepositLeverageCalcsDebtFlash(
        debtReserve,
        adjustDepositPositionQuotePrice,
        adjustBorrowPositionQuotePrice,
        swapQuote.priceAInB,
        flashLoanFee,
        slippagePct
      );

      const swapInputAmountQuotePrice = toLamports(
        calcsQuotePrice.swapDebtTokenIn,
        debtReserve.getMintDecimals()
      ).ceil();

      return {
        swapInputs: {
          inputAmountLamports: swapInputAmountQuotePrice,
          minOutAmountLamports: toLamports(calcsQuotePrice.adjustDepositPosition, collReserve.stats.decimals),
          inputMint: debtTokenMint,
          outputMint: collTokenMint,
        },
        flashLoanInfo: klendIxs.flashLoanInfo,
        initialInputs: {
          calcs: calcsQuotePrice,
          swapQuote,
          currentSlot,
          currentLedgerInstant,
          obligation,
          klendAccounts: uniqueKlendAccounts,
          isDeposit,
        },
      };
    }
  } else {
    const dummySwapIxs: SwapIxs<QuoteResponse>[] = [
      {
        preActionIxs: [],
        swapIxs: [],
        lookupTables: [],
        quote: { priceAInB: new Decimal(0), quoteResponse: undefined },
      },
    ];

    if (effectiveFlashBorrowType !== 'coll') {
      // Debt flash path (default): flash borrow debt -> repay -> withdraw -> swap coll->debt -> flash repay debt
      const calcs = adjustWithdrawLeverageCalcs(
        adjustDepositPosition,
        adjustBorrowPosition,
        flashLoanFee,
        slippagePct,
        obligation,
        debtReserve,
        currentSlot,
        currentLedgerInstant
      );

      const klendIxs: LeverageIxsOutput = (
        await buildDecreaseLeverageIxsDebtFlash(
          owner,
          kaminoMarket,
          collReserveAddress,
          debtReserveAddress,
          obligation,
          referrer,
          currentSlot,
          calcs,
          scopeRefreshIx,
          dummySwapIxs,
          budgetAndPriorityFeeIxs,
          useV2Ixs,
          withdrawSlotOffset,
          userSolBalanceLamports
        )
      )[0];

      const uniqueKlendAccounts = uniqueAccountsWithProgramIds(klendIxs.instructions);
      const swapInputAmount = toLamports(
        calcs.withdrawAmountWithSlippageAndFlashLoanFee,
        collReserve.state.liquidity.mintDecimals.toNumber()
      ).ceil();

      const swapInputsForQuote: SwapInputs = {
        inputAmountLamports: swapInputAmount.mul(new Decimal(1).add(quoteBufferBps.div(FullBPS))),
        inputMint: collTokenMint,
        outputMint: debtTokenMint,
      };

      const swapQuote = await quoter(swapInputsForQuote, uniqueKlendAccounts);

      const {
        adjustDepositPosition: adjustDepositPositionQuotePrice,
        adjustBorrowPosition: adjustBorrowPositionQuotePrice,
      } = calcAdjustAmounts({
        currentDepositPosition: deposited,
        currentBorrowPosition: borrowed,
        targetLeverage,
        priceCollToDebt: swapQuote.priceAInB,
        flashLoanFee: new Decimal(flashLoanFee),
      });

      const calcsQuotePrice = adjustWithdrawLeverageCalcs(
        adjustDepositPositionQuotePrice,
        adjustBorrowPositionQuotePrice,
        flashLoanFee,
        slippagePct,
        obligation,
        debtReserve,
        currentSlot,
        currentLedgerInstant
      );

      const swapInputAmountQuotePrice = toLamports(
        calcsQuotePrice.withdrawAmountWithSlippageAndFlashLoanFee,
        collReserve.getMintDecimals()
      ).ceil();

      return {
        swapInputs: {
          inputAmountLamports: swapInputAmountQuotePrice,
          // Swap must produce principal + early-repay penalty so the on-chain repay debit succeeds.
          minOutAmountLamports: toLamports(calcsQuotePrice.repayFundingAmount, debtReserve.stats.decimals),
          inputMint: collTokenMint,
          outputMint: debtTokenMint,
        },
        flashLoanInfo: klendIxs.flashLoanInfo,
        initialInputs: {
          calcs: calcsQuotePrice,
          swapQuote,
          currentSlot,
          currentLedgerInstant,
          obligation,
          klendAccounts: uniqueKlendAccounts,
          isDeposit,
        },
      };
    } else {
      // Coll flash path: flash borrow coll -> swap coll->debt -> repay -> withdraw -> flash repay coll
      const calcs = adjustWithdrawLeverageCalcsCollFlash(
        adjustDepositPosition,
        adjustBorrowPosition,
        priceCollToDebt,
        flashLoanFee,
        slippagePct,
        obligation,
        debtReserve,
        currentSlot,
        currentLedgerInstant
      );

      const klendIxs: LeverageIxsOutput = (
        await buildDecreaseLeverageIxsCollFlash(
          owner,
          kaminoMarket,
          collReserveAddress,
          debtReserveAddress,
          obligation,
          referrer,
          currentSlot,
          calcs,
          scopeRefreshIx,
          dummySwapIxs,
          budgetAndPriorityFeeIxs,
          useV2Ixs,
          withdrawSlotOffset,
          userSolBalanceLamports
        )
      )[0];

      const uniqueKlendAccounts = uniqueAccountsWithProgramIds(klendIxs.instructions);
      const swapInputAmount = toLamports(calcs.collTokenSwapIn, collReserve.getMintDecimals()).ceil();

      const swapInputsForQuote: SwapInputs = {
        inputAmountLamports: swapInputAmount.mul(new Decimal(1).add(quoteBufferBps.div(FullBPS))),
        inputMint: collTokenMint,
        outputMint: debtTokenMint,
      };

      const swapQuote = await quoter(swapInputsForQuote, uniqueKlendAccounts);

      const {
        adjustDepositPosition: adjustDepositPositionQuotePrice,
        adjustBorrowPosition: adjustBorrowPositionQuotePrice,
      } = calcAdjustAmounts({
        currentDepositPosition: deposited,
        currentBorrowPosition: borrowed,
        targetLeverage,
        priceCollToDebt: swapQuote.priceAInB,
        flashLoanFee: new Decimal(flashLoanFee),
      });

      const calcsQuotePrice = adjustWithdrawLeverageCalcsCollFlash(
        adjustDepositPositionQuotePrice,
        adjustBorrowPositionQuotePrice,
        swapQuote.priceAInB,
        flashLoanFee,
        slippagePct,
        obligation,
        debtReserve,
        currentSlot,
        currentLedgerInstant
      );

      const swapInputAmountQuotePrice = toLamports(
        calcsQuotePrice.collTokenSwapIn,
        collReserve.getMintDecimals()
      ).ceil();

      return {
        swapInputs: {
          inputAmountLamports: swapInputAmountQuotePrice,
          // Swap must produce principal + early-repay penalty so the on-chain repay debit succeeds.
          minOutAmountLamports: toLamports(calcsQuotePrice.repayFundingAmount, debtReserve.stats.decimals),
          inputMint: collTokenMint,
          outputMint: debtTokenMint,
        },
        flashLoanInfo: klendIxs.flashLoanInfo,
        initialInputs: {
          calcs: calcsQuotePrice,
          swapQuote,
          currentSlot,
          currentLedgerInstant,
          obligation,
          klendAccounts: uniqueKlendAccounts,
          isDeposit,
        },
      };
    }
  }
}

export async function getAdjustLeverageIxs<QuoteResponse>({
  owner,
  kaminoMarket,
  debtReserveAddress,
  collReserveAddress,
  obligation,
  depositedLamports,
  borrowedLamports,
  referrer,
  currentSlot: suppliedCurrentSlot,
  currentLedgerInstant: suppliedLedgerInstant,
  targetLeverage,
  priceCollToDebt,
  priceDebtToColl,
  slippagePct,
  budgetAndPriorityFeeIxs,
  scopeRefreshIx,
  quoteBufferBps,
  quoter,
  swapper,
  useV2Ixs,
  withdrawSlotOffset,
  userSolBalanceLamports,
  flashBorrowType,
  logger,
}: AdjustLeverageIxsParams<QuoteResponse>): Promise<Array<AdjustLeverageIxsResponse<QuoteResponse>>> {
  const debtReserve = kaminoMarket.getExistingReserveByAddress(debtReserveAddress);
  const ledger = await resolveLedgerInput(
    kaminoMarket.getRpc(),
    suppliedCurrentSlot,
    suppliedLedgerInstant,
    debtReserve.getKind().isFixedRate() || !debtReserve.state.config.debtMaturityTimestamp.eqn(0),
    'getAdjustLeverageIxs'
  );
  const { currentSlot, currentLedgerInstant } = ledger;
  const log = logger ?? (() => {});
  const { swapInputs, initialInputs } = await getAdjustLeverageSwapInputs({
    owner,
    kaminoMarket,
    debtReserveAddress,
    collReserveAddress,
    obligation,
    depositedLamports,
    borrowedLamports,
    referrer,
    currentSlot,
    currentLedgerInstant,
    targetLeverage,
    priceCollToDebt,
    priceDebtToColl,
    slippagePct,
    budgetAndPriorityFeeIxs,
    scopeRefreshIx,
    quoteBufferBps,
    quoter,
    useV2Ixs,
    userSolBalanceLamports,
    flashBorrowType,
  });

  const effectiveFlashBorrowType = flashBorrowType || (initialInputs.isDeposit ? 'coll' : 'debt');

  log(initialInputs.isDeposit ? 'Increasing leverage' : 'Decreasing leverage', toJson(initialInputs.calcs));

  // leverage increased so we need to deposit and borrow more
  if (initialInputs.isDeposit) {
    // Increasing leverage borrows more debt; reject up front if the debt is a fixed-term reserve past its maturity
    // (the on-chain borrow would revert with ReserveDebtMaturityReached).
    if (!debtReserve.state.config.debtMaturityTimestamp.eqn(0)) {
      debtReserve.assertCanOriginateDebt(
        Number(requireMatchingLedgerInstant(currentSlot, currentLedgerInstant, 'getAdjustLeverageIxs').blockTime)
      );
    }
    const depositSwapper: SwapIxsProvider<QuoteResponse> = swapper;

    const swapsArray = await depositSwapper(swapInputs, initialInputs.klendAccounts, initialInputs.swapQuote);

    const swapIxsArray = swapsArray.map((swap) => {
      return {
        preActionIxs: [] as Instruction[],
        swapIxs: swap.swapIxs,
        lookupTables: swap.lookupTables,
        quote: swap.quote,
      };
    });

    let increaseLeverageIxs: LeverageIxsOutput[];
    const increaseCalcs = initialInputs.calcs;
    if (effectiveFlashBorrowType !== 'debt') {
      // Coll flash path (default): flash borrow coll -> deposit -> borrow -> swap debt->coll -> flash repay coll
      assertAdjustIncreaseCollFlashCalcs(increaseCalcs);
      increaseLeverageIxs = await buildIncreaseLeverageIxsCollFlash(
        owner,
        kaminoMarket,
        collReserveAddress,
        debtReserveAddress,
        obligation,
        referrer,
        currentSlot,
        increaseCalcs,
        scopeRefreshIx,
        swapIxsArray,
        budgetAndPriorityFeeIxs,
        useV2Ixs
      );
    } else {
      // Debt flash path: flash borrow debt -> swap debt->coll -> deposit -> borrow -> flash repay debt
      assertAdjustIncreaseDebtFlashCalcs(increaseCalcs);
      increaseLeverageIxs = await buildIncreaseLeverageIxsDebtFlash(
        owner,
        kaminoMarket,
        collReserveAddress,
        debtReserveAddress,
        obligation,
        referrer,
        currentSlot,
        increaseCalcs,
        scopeRefreshIx,
        swapIxsArray,
        budgetAndPriorityFeeIxs,
        useV2Ixs
      );
    }

    // Increasing leverage borrows more debt; a fixed-rate debt reserve (re)stamps a fresh term/maturity on the borrow.
    const reorigination = kaminoMarket.getExistingReserveByAddress(debtReserveAddress).getFixedTermReorigination();
    return increaseLeverageIxs.map((ixs, index) => {
      return {
        ixs: ixs.instructions,
        flashLoanInfo: ixs.flashLoanInfo,
        lookupTables: swapsArray[index].lookupTables,
        swapInputs,
        initialInputs,
        quote: swapsArray[index].quote.quoteResponse,
        reorigination,
      };
    });
  } else {
    const withdrawSwapper: SwapIxsProvider<QuoteResponse> = swapper;

    // 5. Get swap ixs
    const swapsArray = await withdrawSwapper(swapInputs, initialInputs.klendAccounts, initialInputs.swapQuote);

    const swapIxsArray = swapsArray.map((swap) => {
      return {
        preActionIxs: [] as Instruction[],
        swapIxs: swap.swapIxs,
        lookupTables: swap.lookupTables,
        quote: swap.quote,
      };
    });

    let decreaseLeverageIxs: LeverageIxsOutput[];
    const decreaseCalcs = initialInputs.calcs;
    if (effectiveFlashBorrowType !== 'coll') {
      // Debt flash path (default): flash borrow debt -> repay -> withdraw -> swap coll->debt -> flash repay debt
      assertAdjustDecreaseDebtFlashCalcs(decreaseCalcs);
      decreaseLeverageIxs = await buildDecreaseLeverageIxsDebtFlash(
        owner,
        kaminoMarket,
        collReserveAddress,
        debtReserveAddress,
        obligation,
        referrer,
        currentSlot,
        decreaseCalcs,
        scopeRefreshIx,
        swapIxsArray,
        budgetAndPriorityFeeIxs,
        useV2Ixs,
        withdrawSlotOffset,
        userSolBalanceLamports
      );
    } else {
      // Coll flash path: flash borrow coll -> swap coll->debt -> repay -> withdraw -> flash repay coll
      assertAdjustDecreaseCollFlashCalcs(decreaseCalcs);
      decreaseLeverageIxs = await buildDecreaseLeverageIxsCollFlash(
        owner,
        kaminoMarket,
        collReserveAddress,
        debtReserveAddress,
        obligation,
        referrer,
        currentSlot,
        decreaseCalcs,
        scopeRefreshIx,
        swapIxsArray,
        budgetAndPriorityFeeIxs,
        useV2Ixs,
        withdrawSlotOffset,
        userSolBalanceLamports
      );
    }

    return decreaseLeverageIxs.map((ixs, index) => {
      return {
        ixs: ixs.instructions,
        flashLoanInfo: ixs.flashLoanInfo,
        lookupTables: swapsArray[index].lookupTables,
        swapInputs,
        initialInputs,
        quote: swapsArray[index].quote.quoteResponse,
      };
    });
  }
}

function buildFlashLeverageOutputs<QuoteResponse>(
  swapQuoteIxsArray: SwapIxs<QuoteResponse>[],
  ixsBeforeSwap: Instruction[],
  ixsAfterSwap: Instruction[],
  budgetIxs: Instruction[],
  flashBorrowReserve: KaminoReserve
): LeverageIxsOutput[] {
  return swapQuoteIxsArray.map((swapQuoteIxs) => ({
    flashLoanInfo: {
      flashBorrowReserve: flashBorrowReserve.address,
      flashLoanFee: flashBorrowReserve.getFlashLoanFee(),
    },
    instructions: [...ixsBeforeSwap, ...removeBudgetIxs(swapQuoteIxs.swapIxs), ...ixsAfterSwap, ...budgetIxs],
  }));
}

/**
 * Deposit and borrow tokens if leverage increased
 */
async function buildIncreaseLeverageIxsCollFlash<QuoteResponse>(
  owner: TransactionSigner,
  kaminoMarket: KaminoMarket,
  collReserveAddress: Address,
  debtReserveAddress: Address,
  obligation: KaminoObligation,
  referrer: Option<Address>,
  currentSlot: Slot,
  calcs: AdjustLeverageCalcsResult,
  scopeRefreshIx: Instruction[],
  swapQuoteIxsArray: SwapIxs<QuoteResponse>[],
  budgetAndPriorityFeeIxs: Instruction[] | undefined,
  useV2Ixs: boolean
): Promise<LeverageIxsOutput[]> {
  const collReserve = kaminoMarket.getExistingReserveByAddress(collReserveAddress);
  const collTokenMint = collReserve.getLiquidityMint();
  const debtReserve = kaminoMarket.getExistingReserveByAddress(debtReserveAddress);
  const debtTokenMint = debtReserve.getLiquidityMint();
  const collTokenAta = await getAssociatedTokenAddress(
    collTokenMint,
    owner.address,
    collReserve.getLiquidityTokenProgram()
  );

  // 1. Create atas & budget txns
  const { budgetIxs, createAtasIxs } = await getSetupIxs(
    owner,
    collTokenMint,
    collReserve,
    debtTokenMint,
    debtReserve,
    budgetAndPriorityFeeIxs
  );

  // 2. Create borrow flash loan instruction
  const { flashBorrowIx, flashRepayIx } = getFlashLoanInstructions({
    borrowIxIndex: createAtasIxs.length + scopeRefreshIx.length, // TODO: how about user metadata ixs
    userTransferAuthority: owner,
    lendingMarketAuthority: await kaminoMarket.getLendingMarketAuthority(),
    lendingMarketAddress: kaminoMarket.getAddress(),
    reserve: collReserve!,
    // Floor (explicit): this flash borrow funds the leveraged deposit, which is itself floored below — borrow exactly
    // what is deposited so the two stay in lockstep. (Unlike the swap-funding flash borrows, which ceil to not
    // under-cover an exact-in swap, this one must equal the deposit; the SC fee is funded by the `borrowAmount` leg.)
    amountLamports: toLamports(calcs.adjustDepositPosition, collReserve!.stats.decimals).floor(),
    destinationAta: collTokenAta,
    // TODO(referrals): once we support referrals, we will have to replace the placeholder args below:
    referrerAccount: none(),
    referrerTokenState: none(),
    programId: kaminoMarket.programId,
  });

  const depositAction = await KaminoAction.buildDepositTxns({
    kaminoMarket,
    amount: toLamports(calcs.adjustDepositPosition, collReserve.stats.decimals).floor().toString(),
    reserveAddress: collReserve.address,
    owner,
    obligation,
    useV2Ixs,
    scopeRefreshConfig: undefined,
    extraComputeBudget: 0,
    includeAtaIxs: false,
    requestElevationGroup: false,
    initUserMetadata: { skipInitialization: true, skipLutCreation: true },
    referrer,
    currentSlot,
  });

  // 4. Borrow tokens in borrow token reserve that will be swapped to repay flash loan
  const borrowAction = await KaminoAction.buildBorrowTxns({
    kaminoMarket,
    amount: toLamports(calcs.borrowAmount, debtReserve.stats.decimals).ceil().toString(),
    reserveAddress: debtReserve.address,
    owner,
    obligation,
    useV2Ixs,
    scopeRefreshConfig: undefined,
    extraComputeBudget: 0,
    includeAtaIxs: false,
    requestElevationGroup: false,
    initUserMetadata: { skipInitialization: true, skipLutCreation: true }, // to be checked and create in a setup tx in the UI (won't be the case for adjust anyway as this would be created in deposit)
    referrer,
    currentSlot,
  });

  return buildFlashLeverageOutputs(
    swapQuoteIxsArray,
    [
      ...scopeRefreshIx,
      ...createAtasIxs,
      ...[flashBorrowIx],
      ...KaminoAction.actionToIxs(depositAction),
      ...KaminoAction.actionToIxs(borrowAction),
    ],
    [flashRepayIx],
    budgetIxs,
    collReserve
  );
}

/**
 * Increase leverage with flash borrow DEBT token.
 * Order: scopeRefresh → createAtas → flashBorrow(DEBT) → swap(debt→coll) → deposit → borrow → flashRepay(DEBT) → budget
 */
async function buildIncreaseLeverageIxsDebtFlash<QuoteResponse>(
  owner: TransactionSigner,
  kaminoMarket: KaminoMarket,
  collReserveAddress: Address,
  debtReserveAddress: Address,
  obligation: KaminoObligation,
  referrer: Option<Address>,
  currentSlot: Slot,
  calcs: AdjustDepositDebtFlashCalcsResult,
  scopeRefreshIx: Instruction[],
  swapQuoteIxsArray: SwapIxs<QuoteResponse>[],
  budgetAndPriorityFeeIxs: Instruction[] | undefined,
  useV2Ixs: boolean
): Promise<LeverageIxsOutput[]> {
  const collReserve = kaminoMarket.getExistingReserveByAddress(collReserveAddress);
  const debtReserve = kaminoMarket.getExistingReserveByAddress(debtReserveAddress);
  const collTokenMint = collReserve.getLiquidityMint();
  const debtTokenMint = debtReserve.getLiquidityMint();
  const [debtTokenAta] = await findAssociatedTokenPda({
    owner: owner.address,
    mint: debtTokenMint,
    tokenProgram: debtReserve.getLiquidityTokenProgram(),
  });

  // 1. Create atas & budget txns
  const { budgetIxs, createAtasIxs } = await getSetupIxs(
    owner,
    collTokenMint,
    collReserve,
    debtTokenMint,
    debtReserve,
    budgetAndPriorityFeeIxs
  );

  // 2. Flash borrow DEBT = the exact swap spend (`flashBorrowInDebtToken`).
  // Ceil: flash-borrow integer lamports at the call site; flooring under-borrows the swap by 1 lamport.
  const flashBorrowDebtLamports = toLamports(calcs.flashBorrowInDebtToken, debtReserve.stats.decimals).ceil();
  // The klend borrow that repays the flash must cover `flashBorrow + SC fee` (1-lamport minimum + referrer split
  // honoured) — size it from the shared helper instead of hand-rolling `flashBorrow*(1+fee)`. fee==0 → borrow == flash.
  const debtBorrowToRepayFlashLamports = calcFlashLoanFees({
    reserve: debtReserve,
    referralFeeBps: 0,
    hasReferral: false, // the flash ixs carry no referrer; the SC fee total is referral-split-independent anyway
    flashBorrowAmountLamports: flashBorrowDebtLamports,
  }).flashRepayDebitLamports.ceil();
  const { flashBorrowIx, flashRepayIx } = getFlashLoanInstructions({
    borrowIxIndex: createAtasIxs.length + scopeRefreshIx.length,
    userTransferAuthority: owner,
    lendingMarketAuthority: await kaminoMarket.getLendingMarketAuthority(),
    lendingMarketAddress: kaminoMarket.getAddress(),
    reserve: debtReserve,
    amountLamports: flashBorrowDebtLamports,
    destinationAta: debtTokenAta,
    referrerAccount: none(),
    referrerTokenState: none(),
    programId: kaminoMarket.programId,
  });

  // 3. Deposit coll
  const depositAction = await KaminoAction.buildDepositTxns({
    kaminoMarket,
    amount: toLamports(calcs.adjustDepositPosition, collReserve.stats.decimals).floor().toString(),
    reserveAddress: collReserve.address,
    owner,
    obligation,
    useV2Ixs,
    scopeRefreshConfig: undefined,
    extraComputeBudget: 0,
    includeAtaIxs: false,
    requestElevationGroup: false,
    initUserMetadata: { skipInitialization: true, skipLutCreation: true },
    referrer,
    currentSlot,
  });

  // 4. Borrow debt to repay flash (= flashBorrow + SC fee, computed via the shared helper above).
  const borrowAction = await KaminoAction.buildBorrowTxns({
    kaminoMarket,
    amount: debtBorrowToRepayFlashLamports.toString(),
    reserveAddress: debtReserve.address,
    owner,
    obligation,
    useV2Ixs,
    scopeRefreshConfig: undefined,
    extraComputeBudget: 0,
    includeAtaIxs: false,
    requestElevationGroup: false,
    initUserMetadata: { skipInitialization: true, skipLutCreation: true },
    referrer,
    currentSlot,
  });

  return buildFlashLeverageOutputs(
    swapQuoteIxsArray,
    [...scopeRefreshIx, ...createAtasIxs, ...[flashBorrowIx]],
    [...KaminoAction.actionToIxs(depositAction), ...KaminoAction.actionToIxs(borrowAction), ...[flashRepayIx]],
    budgetIxs,
    debtReserve
  );
}

/**
 * Withdraw and repay tokens if leverage decreased
 */
async function buildDecreaseLeverageIxsDebtFlash<QuoteResponse>(
  owner: TransactionSigner,
  kaminoMarket: KaminoMarket,
  collReserveAddress: Address,
  debtReserveAddress: Address,
  obligation: KaminoObligation,
  referrer: Option<Address>,
  currentSlot: Slot,
  calcs: AdjustLeverageCalcsResult,
  scopeRefreshIx: Instruction[],
  swapQuoteIxsArray: SwapIxs<QuoteResponse>[],
  budgetAndPriorityFeeIxs: Instruction[] | undefined,
  useV2Ixs: boolean,
  withdrawSlotOffset: number = WITHDRAW_SLOT_OFFSET,
  userSolBalanceLamports: number
): Promise<LeverageIxsOutput[]> {
  const collReserve = kaminoMarket.getExistingReserveByAddress(collReserveAddress);
  const debtReserve = kaminoMarket.getExistingReserveByAddress(debtReserveAddress);
  const collTokenMint = collReserve.getLiquidityMint();
  const debtTokenMint = debtReserve.getLiquidityMint();
  const [debtTokenAta] = await findAssociatedTokenPda({
    owner: owner.address,
    mint: debtTokenMint,
    tokenProgram: debtReserve.getLiquidityTokenProgram(),
  });

  // 1. Create atas & budget txns
  const { budgetIxs, createAtasIxs } = await getSetupIxs(
    owner,
    collTokenMint,
    collReserve,
    debtTokenMint,
    debtReserve,
    budgetAndPriorityFeeIxs
  );

  // TODO: Mihai/Marius check if we can improve this logic and not convert any SOL
  // This is here so that we have enough wsol to repay in case the kAB swapped to sol after estimates is not enough
  const closeWsolAtaIxs: Instruction[] = [];
  const fillWsolAtaIxs: Instruction[] = [];
  if (debtTokenMint === WRAPPED_SOL_MINT) {
    const wsolAta = await getAssociatedTokenAddress(WRAPPED_SOL_MINT, owner.address);

    closeWsolAtaIxs.push(
      getCloseAccountInstruction(
        {
          owner,
          account: wsolAta,
          destination: owner.address,
        },
        { programAddress: TOKEN_PROGRAM_ADDRESS }
      )
    );

    const halfSolBalance = userSolBalanceLamports / LAMPORTS_PER_SOL / 2;
    const balanceToWrap = halfSolBalance < 0.1 ? halfSolBalance : 0.1;
    fillWsolAtaIxs.push(
      ...getTransferWsolIxs(
        owner,
        wsolAta,
        lamports(BigInt(toLamports(balanceToWrap, debtReserve!.stats.decimals).ceil().toString()))
      )
    );
  }

  // 3. Flash borrow & repay amount to repay (debt)
  const { flashBorrowIx, flashRepayIx } = getFlashLoanInstructions({
    borrowIxIndex: createAtasIxs.length + fillWsolAtaIxs.length + scopeRefreshIx.length,
    userTransferAuthority: owner,
    lendingMarketAuthority: await kaminoMarket.getLendingMarketAuthority(),
    lendingMarketAddress: kaminoMarket.getAddress(),
    reserve: debtReserve!,
    // Flash-borrow the funding amount (principal + fixed-term early-repay penalty); the repay instruction below uses
    // the principal only. For open-term debt these coincide (penalty 0).
    amountLamports: toLamports(calcs.repayFundingAmount, debtReserve!.stats.decimals).ceil(),
    destinationAta: debtTokenAta,
    // TODO(referrals): once we support referrals, we will have to replace the placeholder args below:
    referrerAccount: none(),
    referrerTokenState: none(),
    programId: kaminoMarket.programId,
  });

  // 4. Actually do the repay of the flash borrowed amounts
  const repayAction = await KaminoAction.buildRepayTxns({
    kaminoMarket,
    amount: toLamports(Decimal.abs(calcs.adjustBorrowPosition), debtReserve!.stats.decimals).floor().toString(),
    reserveAddress: debtReserve.address,
    owner,
    obligation,
    useV2Ixs,
    scopeRefreshConfig: undefined,
    currentSlot,
    payer: undefined,
    extraComputeBudget: 0,
    includeAtaIxs: false,
    requestElevationGroup: false,
    initUserMetadata: { skipInitialization: true, skipLutCreation: true }, // to be checked and create in a setup tx in the UI (won't be the case for adjust anyway as this would be created in deposit)
    referrer,
  });

  const withdrawSlot = currentSlot - BigInt(withdrawSlotOffset);
  // 6. Withdraw collateral (a little bit more to be able to pay for the slippage on swap)
  const withdrawAction = await KaminoAction.buildWithdrawTxns({
    kaminoMarket,
    amount: toLamports(calcs.withdrawAmountWithSlippageAndFlashLoanFee, collReserve!.stats.decimals).ceil().toString(),
    reserveAddress: collReserve.address,
    owner,
    obligation,
    useV2Ixs,
    scopeRefreshConfig: undefined,
    extraComputeBudget: 0,
    includeAtaIxs: false,
    requestElevationGroup: false,
    initUserMetadata: { skipInitialization: true, skipLutCreation: true }, // to be checked and create in a setup tx in the UI (won't be the case for adjust anyway as this would be created in deposit)
    referrer,
    currentSlot: withdrawSlot,
  });

  return swapQuoteIxsArray.map((swapQuoteIxs) => {
    const swapInstructions = removeBudgetIxs(swapQuoteIxs.swapIxs);

    const ixs = [
      ...scopeRefreshIx,
      ...createAtasIxs,
      ...fillWsolAtaIxs,
      ...[flashBorrowIx],
      ...KaminoAction.actionToIxs(repayAction),
      ...KaminoAction.actionToIxs(withdrawAction),
      ...swapInstructions,
      ...[flashRepayIx],
      ...closeWsolAtaIxs,
      ...budgetIxs,
    ];

    const res: LeverageIxsOutput = {
      flashLoanInfo: {
        flashBorrowReserve: debtReserve!.address,
        flashLoanFee: debtReserve!.getFlashLoanFee(),
      },
      instructions: ixs,
    };

    return res;
  });
}

/**
 * Decrease leverage with flash borrow COLLATERAL token.
 * Order: scopeRefresh → createAtas → fillWsol → flashBorrow(COLL) → swap(coll→debt) → repay → withdraw → flashRepay(COLL) → closeWsol → budget
 */
async function buildDecreaseLeverageIxsCollFlash<QuoteResponse>(
  owner: TransactionSigner,
  kaminoMarket: KaminoMarket,
  collReserveAddress: Address,
  debtReserveAddress: Address,
  obligation: KaminoObligation,
  referrer: Option<Address>,
  currentSlot: Slot,
  calcs: AdjustWithdrawCollFlashCalcsResult,
  scopeRefreshIx: Instruction[],
  swapQuoteIxsArray: SwapIxs<QuoteResponse>[],
  budgetAndPriorityFeeIxs: Instruction[] | undefined,
  useV2Ixs: boolean,
  withdrawSlotOffset: number = WITHDRAW_SLOT_OFFSET,
  userSolBalanceLamports: number
): Promise<LeverageIxsOutput[]> {
  const collReserve = kaminoMarket.getExistingReserveByAddress(collReserveAddress);
  const debtReserve = kaminoMarket.getExistingReserveByAddress(debtReserveAddress);
  const collTokenMint = collReserve.getLiquidityMint();
  const debtTokenMint = debtReserve.getLiquidityMint();
  const [collTokenAta] = await findAssociatedTokenPda({
    owner: owner.address,
    mint: collTokenMint,
    tokenProgram: collReserve.getLiquidityTokenProgram(),
  });

  // 1. Create atas & budget txns
  const { budgetIxs, createAtasIxs } = await getSetupIxs(
    owner,
    collTokenMint,
    collReserve,
    debtTokenMint,
    debtReserve,
    budgetAndPriorityFeeIxs
  );

  const closeWsolAtaIxs: Instruction[] = [];
  const fillWsolAtaIxs: Instruction[] = [];
  if (collTokenMint === WRAPPED_SOL_MINT) {
    const wsolAta = await getAssociatedTokenAddress(WRAPPED_SOL_MINT, owner.address);

    closeWsolAtaIxs.push(
      getCloseAccountInstruction(
        {
          owner,
          account: wsolAta,
          destination: owner.address,
        },
        { programAddress: TOKEN_PROGRAM_ADDRESS }
      )
    );

    const halfSolBalance = userSolBalanceLamports / LAMPORTS_PER_SOL / 2;
    const balanceToWrap = halfSolBalance < 0.1 ? halfSolBalance : 0.1;
    fillWsolAtaIxs.push(
      ...getTransferWsolIxs(
        owner,
        wsolAta,
        lamports(BigInt(toLamports(balanceToWrap, collReserve.stats.decimals).ceil().toString()))
      )
    );
  }

  // 2. Flash borrow COLL = the exact swap spend (`flashBorrowInCollToken`), sized by the canonical
  // `calcCollFlashLegLamports` (shared with the flash-borrow-type selector so viability and execution agree):
  // ceil-rounded borrow + the SC flash fee (1-lamport minimum, no referrer) the withdraw leg below must fund
  // so the ATA holds `flashBorrow + fee` at flash-repay. fee==0 reserves → 0 → withdraw unchanged.
  const collFlashLeg = calcCollFlashLegLamports({
    collReserve,
    flashBorrowCollTokens: calcs.flashBorrowInCollToken,
    redeemBaseCollTokens: calcs.depositTokenWithdrawAmount,
  });
  const { flashBorrowIx, flashRepayIx } = getFlashLoanInstructions({
    borrowIxIndex: createAtasIxs.length + fillWsolAtaIxs.length + scopeRefreshIx.length,
    userTransferAuthority: owner,
    lendingMarketAuthority: await kaminoMarket.getLendingMarketAuthority(),
    lendingMarketAddress: kaminoMarket.getAddress(),
    reserve: collReserve,
    amountLamports: collFlashLeg.flashBorrowLamports,
    destinationAta: collTokenAta,
    referrerAccount: none(),
    referrerTokenState: none(),
    programId: kaminoMarket.programId,
  });

  // 3. Repay debt
  const repayAction = await KaminoAction.buildRepayTxns({
    kaminoMarket,
    amount: toLamports(Decimal.abs(calcs.adjustBorrowPosition), debtReserve.stats.decimals).floor().toString(),
    reserveAddress: debtReserve.address,
    owner,
    obligation,
    useV2Ixs,
    scopeRefreshConfig: undefined,
    currentSlot,
    payer: undefined,
    extraComputeBudget: 0,
    includeAtaIxs: false,
    requestElevationGroup: false,
    initUserMetadata: { skipInitialization: true, skipLutCreation: true },
    referrer,
  });

  // 4. Withdraw coll = the canonical redeem (the swap spend `depositTokenWithdrawAmount` + the flash fee), so the
  //    ATA holds `flashBorrow + fee` at flash-repay (deleverage nets nothing out). fee==0 → unchanged sizing.
  const withdrawSlot = currentSlot - BigInt(withdrawSlotOffset);
  const withdrawAction = await KaminoAction.buildWithdrawTxns({
    kaminoMarket,
    amount: collFlashLeg.redeemCollLamports.toString(),
    reserveAddress: collReserve.address,
    owner,
    obligation,
    useV2Ixs,
    scopeRefreshConfig: undefined,
    extraComputeBudget: 0,
    includeAtaIxs: false,
    requestElevationGroup: false,
    initUserMetadata: { skipInitialization: true, skipLutCreation: true },
    referrer,
    currentSlot: withdrawSlot,
  });

  return swapQuoteIxsArray.map((swapQuoteIxs) => {
    const swapInstructions = removeBudgetIxs(swapQuoteIxs.swapIxs);

    // Key difference: swap BEFORE repay+withdraw
    const ixs = [
      ...scopeRefreshIx,
      ...createAtasIxs,
      ...fillWsolAtaIxs,
      ...[flashBorrowIx],
      ...swapInstructions,
      ...KaminoAction.actionToIxs(repayAction),
      ...KaminoAction.actionToIxs(withdrawAction),
      ...[flashRepayIx],
      ...closeWsolAtaIxs,
      ...budgetIxs,
    ];

    const res: LeverageIxsOutput = {
      flashLoanInfo: {
        flashBorrowReserve: collReserve.address,
        flashLoanFee: collReserve.getFlashLoanFee(),
      },
      instructions: ixs,
    };

    return res;
  });
}

export const getSetupIxs = async (
  owner: TransactionSigner,
  collTokenMint: Address,
  collReserve: KaminoReserve,
  debtTokenMint: Address,
  debtReserve: KaminoReserve,
  budgetAndPriorityFeeIxs: Instruction[] | undefined
) => {
  const budgetIxs = budgetAndPriorityFeeIxs || getComputeBudgetAndPriorityFeeIxs(3000000);

  const mintsWithTokenPrograms = getTokenMintsWithTokenPrograms(collTokenMint, collReserve, debtTokenMint, debtReserve);

  const createAtasIxs = (await createAtasIdempotent(owner, mintsWithTokenPrograms)).map((x) => x.createAtaIx);

  return {
    budgetIxs,
    createAtasIxs,
  };
};

export const getScopeRefreshIxForObligationAndReserves = async (
  market: KaminoMarket,
  collReserve: KaminoReserve,
  debtReserve: KaminoReserve,
  obligation: KaminoObligation | ObligationType | undefined,
  scopeRefreshConfig: ScopePriceRefreshConfig | undefined
): Promise<Instruction[]> => {
  const allReserves =
    obligation && isKaminoObligation(obligation)
      ? [
          ...new Set<Address>([
            ...obligation.getDeposits().map((x) => x.reserveAddress),
            ...obligation.getBorrows().map((x) => x.reserveAddress),
            collReserve.address,
            debtReserve.address,
          ]),
        ]
      : [...new Set<Address>([collReserve.address, debtReserve.address])];

  const scopeRefreshIxs: Instruction[] = [];
  const scopeTokensMap = getTokenIdsForScopeRefresh(market, allReserves);

  if (scopeTokensMap.size > 0 && scopeRefreshConfig) {
    for (const [configPubkey, config] of scopeRefreshConfig.scopeConfigurations) {
      const tokenIds = scopeTokensMap.get(config.oraclePrices);
      if (tokenIds && tokenIds.length > 0) {
        const refreshIx = await scopeRefreshConfig.scope.refreshPriceListIx({ config: configPubkey }, tokenIds);
        if (refreshIx) {
          scopeRefreshIxs.push(refreshIx);
        }
      }
    }
  }

  return scopeRefreshIxs;
};

const checkObligationType = (
  obligationTypeTag: ObligationTypeTag,
  collReserveAddress: Address,
  debtReserveAddress: Address,
  kaminoMarket: KaminoMarket
) => {
  const collReserve = kaminoMarket.getExistingReserveByAddress(collReserveAddress);
  const debtReserve = kaminoMarket.getExistingReserveByAddress(debtReserveAddress);
  const collTokenMint = collReserve.getLiquidityMint();
  const debtTokenMint = debtReserve.getLiquidityMint();
  let obligationType: ObligationType;
  if (obligationTypeTag === ObligationTypeTag.Multiply) {
    // multiply
    obligationType = new MultiplyObligation(collTokenMint, debtTokenMint, kaminoMarket.programId);
  } else if (obligationTypeTag === ObligationTypeTag.Leverage) {
    // leverage
    obligationType = new LeverageObligation(collTokenMint, debtTokenMint, kaminoMarket.programId);
  } else if (obligationTypeTag === ObligationTypeTag.MultiplyFixedRate) {
    // multiply fixed rate
    obligationType = new MultiplyObligationFixedRate(collReserveAddress, debtReserveAddress, kaminoMarket.programId);
  } else if (obligationTypeTag === ObligationTypeTag.LeverageFixedRate) {
    // leverage fixed rate
    obligationType = new LeverageObligationFixedRate(collReserveAddress, debtReserveAddress, kaminoMarket.programId);
  } else {
    throw Error('Obligation type tag not supported for leverage, please use 1 - multiply or 3 - leverage');
  }

  return obligationType;
};

type MintWithTokenProgram = {
  mint: Address;
  tokenProgram: Address;
};

const getTokenMintsWithTokenPrograms = (
  collTokenMint: Address,
  collReserve: KaminoReserve,
  debtTokenMint: Address,
  debtReserve: KaminoReserve
): Array<MintWithTokenProgram> => {
  return [
    {
      mint: collTokenMint,
      tokenProgram: collReserve.getLiquidityTokenProgram(),
    },
    {
      mint: debtTokenMint,
      tokenProgram: debtReserve.getLiquidityTokenProgram(),
    },
    {
      mint: collReserve.getCTokenMint(),
      tokenProgram: TOKEN_PROGRAM_ADDRESS,
    },
  ];
};
