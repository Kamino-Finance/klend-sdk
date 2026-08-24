import { KaminoAction, KaminoMarket, KaminoObligation, KaminoReserve } from '../classes';
// Import from specific sub-modules instead of the `../leverage` barrel so we don't pull in
// `flashBorrowType.ts` (which in turn imports back into `repay_with_collateral_calcs.ts` → here),
// which would form an import cycle and leave intent-helper exports undefined at evaluation time.
import { getFlashLoanInstructions } from '../leverage/instructions';
import { isFlashLoanEnabled } from '../leverage/utils';
import {
  FlashBorrowType,
  FlashLoanInfo,
  LeverageIxsOutput,
  SwapInputs,
  SwapIxs,
  SwapIxsProvider,
  SwapQuote,
  SwapQuoteProvider,
} from '../leverage/types';
import {
  createAtasIdempotent,
  getComputeBudgetAndPriorityFeeIxs,
  KlendAccountsResult,
  removeBudgetIxs,
  toKlendAccountsResult,
  U64_MAX,
  uniqueAccountsWithProgramIds,
} from '../utils';
import { AddressLookupTable } from '@solana-program/address-lookup-table';
import { Account, Address, Instruction, none, Option, TransactionSigner } from '@solana/kit';
import Decimal from 'decimal.js';
import { bufferWithdrawForRedeemDrift } from './redeem_drift';
import type { LedgerInstant } from '../utils/ledger';
import {
  calcMaxWithdrawCollateral,
  calcRepayAmountWithSlippage,
  calcRepayWithCollCollFlashSwap,
  getMaxCollateralFromRepayAmount,
  getMaxWithdrawLtvCheck,
  MaxWithdrawLtvCheck,
  validateCollFlashWithdrawCap,
} from './repay_with_collateral_calcs';
import { assertPositiveFiniteDecimal, getSlippageFactor } from './swap_calcs';

export type RepayWithCollIxsResponse<QuoteResponse> = {
  ixs: Instruction[];
  lookupTables: Account<AddressLookupTable>[];
  flashLoanInfo: FlashLoanInfo;
  swapInputs: SwapInputs;
  initialInputs: RepayWithCollInitialInputs<QuoteResponse>;
  quote?: QuoteResponse;
};

interface RepayWithCollInitialInputsCommon<QuoteResponse> {
  /** Debt-token-denominated amount being repaid to the obligation (the on-chain repay `liquidity_amount`, principal only). */
  debtRepayAmountLamports: Decimal;
  /**
   * Fixed-term early-repay penalty (debt lamports) charged on-chain in addition to the repay. Zero for open-term /
   * matured / untracked borrows. Surfaced for clients; additive funding only, NOT part of the repay instruction amount.
   */
  earlyRepayPenaltyLamports: Decimal;
  /** Debt that must be made available to the repay step = `debtRepayAmountLamports` + `earlyRepayPenaltyLamports`. */
  debtFundingLamports: Decimal;
  /**
   * Flash-loan repay amount in the lamports of the FLASH-BORROWED reserve.
   *  - debt-flash: debt lamports = `debtRepayAmountLamports` + flash fee.
   *  - coll-flash: coll lamports = `collSwapInLamports * (1 + collFlashLoanFee)`.
   * Use the `flashBorrowType` discriminant on the parent type to know which denomination.
   */
  flashRepayAmountLamports: Decimal;
  /**
   * The amount of collateral available to withdraw, if this is less than the swap input amount, then the swap may fail due to slippage, or tokens may be debited from the user's ATA, so the caller needs to check this
   */
  maxCollateralWithdrawLamports: Decimal;
  /**
   * The quote from the provided quoter
   */
  swapQuote: SwapQuote<QuoteResponse>;
  /** The ledger instant (slot + block time) used consistently for interest and term calculations. */
  currentLedgerInstant: LedgerInstant;
  klendAccounts: Array<Address>;
}

export interface DebtFlashRepayWithCollInitialInputs<QuoteResponse>
  extends RepayWithCollInitialInputsCommon<QuoteResponse> {
  flashBorrowType: 'debt';
}

export interface CollFlashRepayWithCollInitialInputs<QuoteResponse>
  extends RepayWithCollInitialInputsCommon<QuoteResponse> {
  flashBorrowType: 'coll';
}

export type RepayWithCollInitialInputs<QuoteResponse> =
  | DebtFlashRepayWithCollInitialInputs<QuoteResponse>
  | CollFlashRepayWithCollInitialInputs<QuoteResponse>;

export interface RepayWithCollSwapInputsProps<QuoteResponse> {
  kaminoMarket: KaminoMarket;
  debtReserveAddress: Address;
  collReserveAddress: Address;
  owner: TransactionSigner;
  obligation: KaminoObligation;
  referrer: Option<Address>;
  /** The ledger instant (slot + block time) the position estimates are evaluated at. */
  currentLedgerInstant: LedgerInstant;
  repayAmount: Decimal;
  isClosingPosition: boolean;
  budgetAndPriorityFeeIxs?: Instruction[];
  scopeRefreshIx: Instruction[]; // no longer optional, can be empty
  useV2Ixs: boolean;
  quoter: SwapQuoteProvider<QuoteResponse>;
  /**
   * The user's max-acceptable swap slippage, expressed as a percent (e.g. `0.5` for 0.5%).
   *
   * Contract: callers pass a SIMULATED (mid) `priceAInB` from the quoter — the SDK applies this
   * value as the sizing buffer when computing the flash-borrow / swap-input lamports, so the
   * worst-case real fill still satisfies the on-chain repay / flash-repay constraint. Conceptually
   * a separate knob from the on-chain swap `min_out` (which the swapper sets); in the future this
   * could be a smaller, capped value.
   */
  slippagePct: Decimal;
  /**
   * Which side to flash borrow on:
   *  - `'debt'` (default): flash borrow debt → repay+withdraw → swap coll→debt → flash repay debt.
   *  - `'coll'`: flash borrow coll → swap coll→debt → repay+withdraw → flash repay coll.
   * Useful when the default reserve has flash loans disabled or insufficient liquidity.
   */
  flashBorrowType?: FlashBorrowType;
}

export type RepayWithCollSwapInputsParams<QuoteResponse> = RepayWithCollSwapInputsProps<QuoteResponse>;

/**
 * Inputs for {@link getRepayWithCollKlendAccounts}: the subset of {@link getRepayWithCollSwapInputs}'s props that
 * the klend account footprint depends on. Derived from {@link RepayWithCollSwapInputsProps} (so the two never drift)
 * by dropping only the fields account discovery does not use: the quoter and the slippage. Unlike the swap-coll /
 * swap-debt families, `flashBorrowType` is KEPT, because the two repay routes flash-borrow different reserves
 * (debt vs coll) and so reference a different reserve fee-vault — the account set is NOT invariant to the side.
 */
export type RepayWithCollKlendAccountsInputs = Omit<RepayWithCollSwapInputsParams<unknown>, 'quoter' | 'slippagePct'>;

/**
 * Account-discovery prefix shared by {@link getRepayWithCollSwapInputs} and the light
 * {@link getRepayWithCollKlendAccounts}: resolve reserves, size the repay, and build the klend ixs for the requested
 * `flashBorrowType` to collect their unique accounts. The repay/withdraw footprint is shared between routes, but the
 * flash-loan side references the flash reserve's fee vault, so the builder must match the actual route — this is
 * exactly the set the operation passes to the quoter.
 */
async function computeRepayWithCollKlendAccounts({
  kaminoMarket,
  debtReserveAddress,
  collReserveAddress,
  owner,
  obligation,
  referrer,
  currentLedgerInstant,
  repayAmount,
  isClosingPosition,
  budgetAndPriorityFeeIxs,
  scopeRefreshIx,
  useV2Ixs,
  flashBorrowType,
}: RepayWithCollKlendAccountsInputs): Promise<{
  collReserve: KaminoReserve;
  debtReserve: KaminoReserve;
  collTokenMint: Address;
  debtTokenMint: Address;
  repayAmountLamports: Decimal;
  earlyRepayPenaltyLamports: Decimal;
  repayFundingLamports: Decimal;
  flashRepayAmountLamports: Decimal;
  maxWithdrawableCollLamports: Decimal;
  inputAmountLamports: Decimal;
  klendIxs: LeverageIxsOutput;
  uniqueKlendAccounts: Array<Address>;
}> {
  const collReserve = kaminoMarket.getExistingReserveByAddress(collReserveAddress);
  const debtReserve = kaminoMarket.getExistingReserveByAddress(debtReserveAddress);
  const collTokenMint = collReserve.getLiquidityMint();
  const debtTokenMint = debtReserve.getLiquidityMint();

  const {
    repayAmountLamports,
    earlyRepayPenaltyLamports,
    repayFundingLamports,
    flashRepayAmountLamports,
    repayAmount: finalRepayAmount,
  } = calcRepayAmountWithSlippage(kaminoMarket, debtReserve, currentLedgerInstant, obligation, repayAmount, referrer);

  const debtPosition = obligation.getBorrowByReserve(debtReserve.address);
  const collPosition = obligation.getDepositByReserve(collReserve.address);
  if (!debtPosition) {
    throw new Error(
      `Debt position not found for ${debtReserve.stats.symbol} reserve ${debtReserve.address} in obligation ${obligation.obligationAddress}`
    );
  }
  if (!collPosition) {
    throw new Error(
      `Collateral position not found for ${collReserve.stats.symbol} reserve ${collReserve.address} in obligation ${obligation.obligationAddress}`
    );
  }
  const { maxWithdrawableCollLamports } = calcMaxWithdrawCollateral(
    kaminoMarket,
    obligation,
    collReserve.address,
    debtReserve.address,
    repayAmountLamports
  );

  const maxCollNeededFromOracle = getMaxCollateralFromRepayAmount(finalRepayAmount, debtReserve, collReserve);
  const inputAmountLamports = Decimal.min(maxWithdrawableCollLamports, maxCollNeededFromOracle);

  // Build the klend ixs for the requested route to discover its accounts. The repay/withdraw footprint is shared,
  // but the flash-loan side references the flash reserve's fee vault — debt-flash flashes the debt reserve,
  // coll-flash the coll reserve — so the discovered set differs by exactly that one account. Swap amounts are
  // placeholders here (the set is invariant to them); only the flash *reserve* must match the real route.
  const placeholderSwapIxs: SwapIxs<unknown>[] = [
    {
      preActionIxs: [],
      swapIxs: [],
      lookupTables: [],
      quote: {} as SwapQuote<unknown>,
    },
  ];
  const klendIxs: LeverageIxsOutput = (
    flashBorrowType === 'coll'
      ? await buildRepayWithCollateralIxsCollFlash(
          kaminoMarket,
          debtReserve,
          collReserve,
          owner,
          obligation,
          referrer,
          currentLedgerInstant,
          budgetAndPriorityFeeIxs,
          scopeRefreshIx,
          placeholderSwapIxs,
          isClosingPosition,
          repayAmountLamports,
          inputAmountLamports,
          inputAmountLamports,
          useV2Ixs
        )
      : await buildRepayWithCollateralIxsDebtFlash(
          kaminoMarket,
          debtReserve,
          collReserve,
          owner,
          obligation,
          referrer,
          currentLedgerInstant,
          budgetAndPriorityFeeIxs,
          scopeRefreshIx,
          placeholderSwapIxs,
          isClosingPosition,
          repayAmountLamports,
          repayFundingLamports,
          inputAmountLamports,
          useV2Ixs
        )
  )[0];
  const uniqueKlendAccounts = uniqueAccountsWithProgramIds(klendIxs.instructions);

  return {
    collReserve,
    debtReserve,
    collTokenMint,
    debtTokenMint,
    repayAmountLamports,
    earlyRepayPenaltyLamports,
    repayFundingLamports,
    flashRepayAmountLamports,
    maxWithdrawableCollLamports,
    inputAmountLamports,
    klendIxs,
    uniqueKlendAccounts,
  };
}

/**
 * Light helper: returns the exact, final set of klend accounts (and program ids) a repay-with-collateral operation
 * with the same inputs would consume, plus their count, WITHOUT calling the quoter/swapper. This is the same set the
 * operation passes to the quoter (invariant to the swap amounts), so the count is accurate and final — the FE can use
 * it to know how many accounts remain for the external swap. Pass the same `flashBorrowType` the operation will use:
 * the debt-flash and coll-flash routes flash different reserves and so reference a different fee vault.
 */
export async function getRepayWithCollKlendAccounts(
  inputs: RepayWithCollKlendAccountsInputs
): Promise<KlendAccountsResult> {
  const { uniqueKlendAccounts } = await computeRepayWithCollKlendAccounts({
    ...inputs,
  });
  return toKlendAccountsResult(uniqueKlendAccounts);
}

export async function getRepayWithCollSwapInputs<QuoteResponse>({
  collReserveAddress,
  currentLedgerInstant,
  debtReserveAddress,
  kaminoMarket,
  owner,
  obligation,
  quoter,
  referrer,
  repayAmount,
  isClosingPosition,
  budgetAndPriorityFeeIxs,
  scopeRefreshIx,
  useV2Ixs,
  slippagePct,
  flashBorrowType,
}: RepayWithCollSwapInputsParams<QuoteResponse>): Promise<{
  swapInputs: SwapInputs;
  flashLoanInfo: FlashLoanInfo;
  initialInputs: RepayWithCollInitialInputs<QuoteResponse>;
}> {
  // Preserve fail-fast validation before the compatibility path performs any RPC lookup.
  getSlippageFactor(slippagePct);
  const debtReserveForSizing = kaminoMarket.getExistingReserveByAddress(debtReserveAddress);
  // Flash-borrow side default when the caller omits `flashBorrowType`. The established default is DEBT-flash (simpler:
  // no in-tx collateral redeem) — callers and `cross_validates...` rely on that. We only fall back to COLL-flash when
  // the debt reserve cannot actually serve the flash borrow (e.g. a thin fixed-rate debt reserve), which would
  // otherwise revert with InsufficientLiquidity (#6008). This is intentionally debt-primary, distinct from the
  // coll-primary `determineRepayWithCollFlashBorrowType` selector (which higher-level callers may use explicitly).
  let resolvedFlashBorrowType = flashBorrowType;
  if (resolvedFlashBorrowType === undefined) {
    const debtReserveForDefault = debtReserveForSizing;
    // Debt-flash borrows the on-chain repay debit (`repay + fixed-term early-repay penalty`); size the viability
    // check against that funding amount, exactly as the builder does, so we don't greenlight a reserve that covers
    // only the bare principal.
    const { repayFundingLamports: debtFlashRequiredLamports } = calcRepayAmountWithSlippage(
      kaminoMarket,
      debtReserveForDefault,
      currentLedgerInstant,
      obligation,
      repayAmount,
      referrer
    );
    const debtFlashViable =
      isFlashLoanEnabled(debtReserveForDefault) &&
      debtReserveForDefault.getLiquidityAvailableAmount().gte(debtFlashRequiredLamports);
    resolvedFlashBorrowType = debtFlashViable ? 'debt' : 'coll';
  }

  const {
    collReserve,
    debtReserve,
    collTokenMint,
    debtTokenMint,
    repayAmountLamports,
    earlyRepayPenaltyLamports,
    repayFundingLamports,
    flashRepayAmountLamports,
    maxWithdrawableCollLamports,
    inputAmountLamports,
    klendIxs,
    uniqueKlendAccounts,
  } = await computeRepayWithCollKlendAccounts({
    kaminoMarket,
    debtReserveAddress,
    collReserveAddress,
    owner,
    obligation,
    referrer,
    currentLedgerInstant,
    repayAmount,
    isClosingPosition,
    budgetAndPriorityFeeIxs,
    scopeRefreshIx,
    useV2Ixs,
    flashBorrowType: resolvedFlashBorrowType,
  });

  const swapQuoteInputs: SwapInputs = {
    inputAmountLamports,
    inputMint: collTokenMint,
    outputMint: debtTokenMint,
  };

  const swapQuote = await quoter(swapQuoteInputs, uniqueKlendAccounts);

  const swapQuotePxDebtToColl = swapQuote.priceAInB;
  // The coll→debt swap-quote price divides the coll-swap sizing below; a non-positive/non-finite quote would yield
  // Infinity/NaN/negative lamports. Fail fast at the boundary.
  assertPositiveFiniteDecimal('repay-with-coll swap quote priceAInB (coll→debt)', swapQuotePxDebtToColl);

  // SDK sizing buffer: pad the coll-swap input so the swap output covers `repayAmountLamports`
  // even when the real fill comes in at the worst-case `priceAInB × (1 - swapSizingBufferPct/100)`.
  // Currently == slippagePct, future-cappable.
  const swapSizingBufferPct = slippagePct;

  if (resolvedFlashBorrowType === 'coll') {
    // Coll-flash sizing: swap exactly the flash-borrowed coll → at least `repayFundingLamports` debt (principal +
    // fixed-term early-repay penalty) after slippage; withdraw flashBorrow * (1 + collFlashFee) coll to repay the
    // flash loan. The repay instruction amount stays the principal (`repayAmountLamports`).
    const { collSwapInLamports, debtMinOutLamports, collWithdrawForFlashRepayLamports } =
      calcRepayWithCollCollFlashSwap({
        repayAmountLamports: repayFundingLamports,
        swapPriceCollToDebt: swapQuotePxDebtToColl,
        slippagePct: swapSizingBufferPct,
        collReserve,
        debtMintFactor: debtReserve.getMintFactor(),
      });
    return {
      swapInputs: {
        inputAmountLamports: collSwapInLamports,
        minOutAmountLamports: debtMinOutLamports,
        inputMint: collTokenMint,
        outputMint: debtTokenMint,
      },
      flashLoanInfo: {
        flashBorrowReserve: collReserve.address,
        flashLoanFee: collReserve.getFlashLoanFee(),
      },
      initialInputs: {
        flashBorrowType: 'coll',
        debtRepayAmountLamports: repayAmountLamports,
        earlyRepayPenaltyLamports,
        debtFundingLamports: repayFundingLamports,
        flashRepayAmountLamports: collWithdrawForFlashRepayLamports,
        maxCollateralWithdrawLamports: maxWithdrawableCollLamports,
        swapQuote,
        currentLedgerInstant,
        klendAccounts: uniqueKlendAccounts,
      },
    };
  }

  // Debt-flash sizing (default): swap enough coll to produce flashRepayAmountLamports of debt
  // even at the worst-case fill. priceAInB is mid; divide by `(1 - swapSizingBufferPct/100)` so
  // `collSwapIn × priceAInB × (1 - buffer) ≥ flashRepayLamports`.
  const swapSizingBufferDivisor = getSlippageFactor(swapSizingBufferPct);
  const collSwapInLamports = flashRepayAmountLamports
    .div(debtReserve.getMintFactor())
    .div(swapQuotePxDebtToColl)
    .div(swapSizingBufferDivisor)
    .mul(collReserve.getMintFactor())
    .ceil();

  return {
    swapInputs: {
      inputAmountLamports: collSwapInLamports,
      minOutAmountLamports: flashRepayAmountLamports,
      inputMint: collTokenMint,
      outputMint: debtTokenMint,
    },
    flashLoanInfo: klendIxs.flashLoanInfo,
    initialInputs: {
      flashBorrowType: 'debt',
      debtRepayAmountLamports: repayAmountLamports,
      earlyRepayPenaltyLamports,
      debtFundingLamports: repayFundingLamports,
      flashRepayAmountLamports,
      maxCollateralWithdrawLamports: maxWithdrawableCollLamports,
      swapQuote,
      currentLedgerInstant,
      klendAccounts: uniqueKlendAccounts,
    },
  };
}

type RepayWithCollIxsProps<QuoteResponse> = RepayWithCollSwapInputsParams<QuoteResponse> & {
  swapper: SwapIxsProvider<QuoteResponse>;
  logger?: (msg: string, ...extra: any[]) => void;
};

export async function getRepayWithCollIxs<QuoteResponse>({
  repayAmount,
  isClosingPosition,
  budgetAndPriorityFeeIxs,
  collReserveAddress,
  currentLedgerInstant,
  debtReserveAddress,
  kaminoMarket,
  owner,
  obligation,
  quoter,
  swapper,
  referrer,
  scopeRefreshIx,
  useV2Ixs,
  slippagePct,
  flashBorrowType,
  logger = console.log,
}: RepayWithCollIxsProps<QuoteResponse>): Promise<Array<RepayWithCollIxsResponse<QuoteResponse>>> {
  getSlippageFactor(slippagePct);
  const debtReserve = kaminoMarket.getExistingReserveByAddress(debtReserveAddress);
  const { swapInputs, initialInputs } = await getRepayWithCollSwapInputs({
    collReserveAddress,
    currentLedgerInstant,
    debtReserveAddress,
    kaminoMarket,
    owner,
    obligation,
    quoter,
    referrer,
    repayAmount,
    isClosingPosition,
    budgetAndPriorityFeeIxs,
    scopeRefreshIx,
    useV2Ixs,
    slippagePct,
    flashBorrowType,
  });
  const { debtRepayAmountLamports, flashRepayAmountLamports, maxCollateralWithdrawLamports, swapQuote } = initialInputs;
  const { inputAmountLamports: collSwapInLamports } = swapInputs;

  const collReserve = kaminoMarket.getExistingReserveByAddress(collReserveAddress);
  if (initialInputs.flashBorrowType === 'coll') {
    // `flashRepayAmountLamports` on the coll-flash variant is the realised coll withdrawal.
    validateCollFlashWithdrawCap({
      collWithdrawLamports: flashRepayAmountLamports,
      maxCollateralWithdrawLamports,
    });
  } else if (collSwapInLamports.greaterThan(maxCollateralWithdrawLamports)) {
    // Debt-flash: silently clamping the swap input would leave `flashRepayAmountLamports` /
    // `minOutAmountLamports` sized to the original amount, producing an inconsistent tx that
    // either fails on flash-repay or consumes pre-existing debt tokens from the user ATA. Throw
    // so the caller can reduce the repay amount or fall back to the coll-flash route.
    throw new Error(
      `Collateral swap in amount ${collSwapInLamports} exceeds max withdrawable collateral ${maxCollateralWithdrawLamports}. ` +
        `Reduce the repay amount or use \`flashBorrowType: 'coll'\`.`
    );
  }

  if (initialInputs.flashBorrowType === 'coll') {
    logger(
      `Expected to swap in: ${collSwapInLamports.div(collReserve.getMintFactor())} ${
        collReserve.symbol
      }, repay debt: ${debtRepayAmountLamports.div(debtReserve.getMintFactor())} ${
        debtReserve.symbol
      }, flash repay: ${flashRepayAmountLamports.div(collReserve.getMintFactor())} ${collReserve.symbol}, quoter px: ${
        swapQuote.priceAInB
      } ${debtReserve.symbol}/${collReserve.symbol}, required px: ${debtRepayAmountLamports
        .div(debtReserve.getMintFactor())
        .div(collSwapInLamports.div(collReserve.getMintFactor()))} ${debtReserve.symbol}/${collReserve.symbol}`
    );
  } else {
    logger(
      `Expected to swap in: ${collSwapInLamports.div(collReserve.getMintFactor())} ${
        collReserve.symbol
      }, for: ${flashRepayAmountLamports.div(debtReserve.getMintFactor())} ${debtReserve.symbol}, quoter px: ${
        swapQuote.priceAInB
      } ${debtReserve.symbol}/${collReserve.symbol}, required px: ${flashRepayAmountLamports
        .div(debtReserve.getMintFactor())
        .div(collSwapInLamports.div(collReserve.getMintFactor()))} ${debtReserve.symbol}/${collReserve.symbol}`
    );
  }

  const swapResponses = await swapper(swapInputs, initialInputs.klendAccounts, swapQuote);

  // Debt-flash: the exact-in swap pulls `collSwapInLamports` from the coll ATA, funded by the
  // withdraw's redeem — buffer the withdraw so the floor-rounded redeem (at the actual
  // execution-slot exchange rate) always covers it; the dust surplus stays in the user's ATA.
  // The guard above already ensured `collSwapInLamports <= maxCollateralWithdrawLamports`, so the
  // clamped buffer is never below the swap input. See `redeem_drift.ts`.
  const collWithdrawLamports = bufferWithdrawForRedeemDrift(collSwapInLamports, maxCollateralWithdrawLamports);
  // Coll-flash: the flash-repay ix pulls exactly `flashRepayAmountLamports`
  // (= flashBorrow * (1 + fee)) from the coll ATA, funded by the withdraw's redeem — same
  // protection. `validateCollFlashWithdrawCap` above already ensured
  // `flashRepayAmountLamports <= maxCollateralWithdrawLamports`. Only the withdraw is buffered;
  // flash-loan sizing and swap inputs are untouched.
  const collFlashWithdrawLamports = bufferWithdrawForRedeemDrift(
    flashRepayAmountLamports,
    maxCollateralWithdrawLamports
  );

  const repayWithCollateralIxs = await (initialInputs.flashBorrowType === 'coll'
    ? buildRepayWithCollateralIxsCollFlash(
        kaminoMarket,
        debtReserve,
        collReserve,
        owner,
        obligation,
        referrer,
        currentLedgerInstant,
        budgetAndPriorityFeeIxs,
        scopeRefreshIx,
        swapResponses,
        isClosingPosition,
        debtRepayAmountLamports,
        collSwapInLamports,
        collFlashWithdrawLamports,
        useV2Ixs
      )
    : buildRepayWithCollateralIxsDebtFlash(
        kaminoMarket,
        debtReserve,
        collReserve,
        owner,
        obligation,
        referrer,
        currentLedgerInstant,
        budgetAndPriorityFeeIxs,
        scopeRefreshIx,
        swapResponses,
        isClosingPosition,
        debtRepayAmountLamports,
        initialInputs.debtFundingLamports,
        collWithdrawLamports,
        useV2Ixs
      ));

  return repayWithCollateralIxs.map((ixs, index) => {
    return {
      ixs: ixs.instructions,
      lookupTables: swapResponses[index].lookupTables,
      swapInputs,
      flashLoanInfo: ixs.flashLoanInfo,
      initialInputs,
      quote: swapResponses[index].quote.quoteResponse,
    };
  });
}

/**
 * Debt-flash repay-with-collateral builder (default).
 *
 * Instruction order:
 *   scopeRefresh → createAtas → flashBorrow(DEBT) → repay+withdraw → swap(coll→debt) → flashRepay(DEBT) → budget
 *
 * Used when `flashBorrowType` is `'debt'` or omitted. The flash-borrowed debt is paid into the
 * obligation immediately; the withdrawn collateral is then swapped back to debt to repay the flash.
 */
async function buildRepayWithCollateralIxsDebtFlash<QuoteResponse>(
  market: KaminoMarket,
  debtReserve: KaminoReserve,
  collReserve: KaminoReserve,
  owner: TransactionSigner,
  obligation: KaminoObligation,
  referrer: Option<Address>,
  currentLedgerInstant: LedgerInstant,
  budgetAndPriorityFeeIxs: Instruction[] | undefined,
  scopeRefreshIx: Instruction[],
  swapQuoteIxsArray: SwapIxs<QuoteResponse>[],
  isClosingPosition: boolean,
  debtRepayAmountLamports: Decimal,
  debtFlashBorrowAmountLamports: Decimal,
  collWithdrawLamports: Decimal,
  useV2Ixs: boolean
): Promise<LeverageIxsOutput[]> {
  // 1. Create atas & budget txns
  const budgetIxs = budgetAndPriorityFeeIxs || getComputeBudgetAndPriorityFeeIxs(1_400_000);

  const atas = [
    { mint: collReserve.getLiquidityMint(), tokenProgram: collReserve.getLiquidityTokenProgram() },
    { mint: debtReserve.getLiquidityMint(), tokenProgram: debtReserve.getLiquidityTokenProgram() },
  ];

  const atasAndIxs = await createAtasIdempotent(owner, atas);
  const [, { ata: debtTokenAta }] = atasAndIxs;

  // 2. Flash borrow enough debt to cover repay + fixed-term early-repay penalty (the on-chain repay debits
  // `repay + penalty`). The repay instruction below uses the principal only; for open-term debt the flash-borrow and
  // the principal coincide.
  const { flashBorrowIx, flashRepayIx } = getFlashLoanInstructions({
    borrowIxIndex: atasAndIxs.length + scopeRefreshIx.length,
    userTransferAuthority: owner,
    lendingMarketAuthority: await market.getLendingMarketAuthority(),
    lendingMarketAddress: market.getAddress(),
    reserve: debtReserve,
    amountLamports: debtFlashBorrowAmountLamports,
    destinationAta: debtTokenAta,
    // TODO(referrals): once we support referrals, we will have to replace the placeholder args below:
    referrerAccount: none(),
    referrerTokenState: none(),
    programId: market.programId,
  });

  const requestElevationGroup = !isClosingPosition && obligation.state.elevationGroup !== 0;

  const maxWithdrawLtvCheck = getMaxWithdrawLtvCheck(
    obligation,
    debtRepayAmountLamports,
    debtReserve,
    collWithdrawLamports,
    collReserve
  );

  // 3. Repay using the flash borrowed funds & withdraw collateral to swap and pay the flash loan
  let repayAndWithdrawAction;
  if (maxWithdrawLtvCheck === MaxWithdrawLtvCheck.MAX_LTV) {
    repayAndWithdrawAction = await KaminoAction.buildRepayAndWithdrawTxns({
      kaminoMarket: market,
      repayAmount: isClosingPosition ? U64_MAX : debtRepayAmountLamports.toString(),
      repayReserveAddress: debtReserve.address,
      withdrawAmount: isClosingPosition ? U64_MAX : collWithdrawLamports.toString(),
      withdrawReserveAddress: collReserve.address,
      payer: owner,
      currentLedgerInstant,
      obligation,
      useV2Ixs,
      scopeRefreshConfig: undefined,
      extraComputeBudget: 0,
      includeAtaIxs: false,
      requestElevationGroup,
      initUserMetadata: undefined,
      referrer,
    });
  } else {
    repayAndWithdrawAction = await KaminoAction.buildRepayAndWithdrawV2Txns({
      kaminoMarket: market,
      repayAmount: isClosingPosition ? U64_MAX : debtRepayAmountLamports.toString(),
      repayReserveAddress: debtReserve.address,
      withdrawAmount: isClosingPosition ? U64_MAX : collWithdrawLamports.toString(),
      withdrawReserveAddress: collReserve.address,
      payer: owner,
      currentLedgerInstant,
      obligation,
      scopeRefreshConfig: undefined,
      extraComputeBudget: 0,
      includeAtaIxs: false,
      requestElevationGroup,
      initUserMetadata: undefined,
      referrer,
    });
  }

  // 4. Swap collateral to debt to repay flash loan
  return swapQuoteIxsArray.map((swapQuoteIxs) => {
    const { preActionIxs, swapIxs } = swapQuoteIxs;
    const swapInstructions = removeBudgetIxs(swapIxs);

    const ixs = [
      ...scopeRefreshIx,
      ...atasAndIxs.map((x) => x.createAtaIx),
      flashBorrowIx,
      ...preActionIxs,
      ...KaminoAction.actionToIxs(repayAndWithdrawAction),
      ...swapInstructions,
      flashRepayIx,
      ...budgetIxs,
    ];

    const res: LeverageIxsOutput = {
      flashLoanInfo: {
        flashBorrowReserve: debtReserve.address,
        flashLoanFee: debtReserve.getFlashLoanFee(),
      },
      instructions: ixs,
    };

    return res;
  });
}

/**
 * Coll-flash repay-with-collateral builder.
 *
 * Instruction order:
 *   scopeRefresh → createAtas → flashBorrow(COLL) → swap(coll→debt) → repay+withdraw → flashRepay(COLL) → budget
 *
 * Vs the default debt-flash builder, the swap runs BEFORE repay+withdraw because the swap
 * output (debt) is what gets repaid to the obligation. The withdrawn coll is then used to
 * repay the flash loan.
 */
async function buildRepayWithCollateralIxsCollFlash<QuoteResponse>(
  market: KaminoMarket,
  debtReserve: KaminoReserve,
  collReserve: KaminoReserve,
  owner: TransactionSigner,
  obligation: KaminoObligation,
  referrer: Option<Address>,
  currentLedgerInstant: LedgerInstant,
  budgetAndPriorityFeeIxs: Instruction[] | undefined,
  scopeRefreshIx: Instruction[],
  swapQuoteIxsArray: SwapIxs<QuoteResponse>[],
  isClosingPosition: boolean,
  debtRepayAmountLamports: Decimal,
  flashBorrowInCollLamports: Decimal,
  collWithdrawForFlashRepayLamports: Decimal,
  useV2Ixs: boolean
): Promise<LeverageIxsOutput[]> {
  // 1. Create atas & budget txns
  const budgetIxs = budgetAndPriorityFeeIxs || getComputeBudgetAndPriorityFeeIxs(1_400_000);

  const atas = [
    { mint: collReserve.getLiquidityMint(), tokenProgram: collReserve.getLiquidityTokenProgram() },
    { mint: debtReserve.getLiquidityMint(), tokenProgram: debtReserve.getLiquidityTokenProgram() },
  ];

  const atasAndIxs = await createAtasIdempotent(owner, atas);
  const [{ ata: collTokenAta }] = atasAndIxs;

  // 2. Flash borrow the same amount of coll we will feed into the swap. The withdrawal that
  // funds the flash repay (`collWithdrawForFlashRepayLamports`) is computed once in
  // `calcRepayWithCollCollFlashSwap` and threaded down — keeps sizing logic colocated.
  const { flashBorrowIx, flashRepayIx } = getFlashLoanInstructions({
    borrowIxIndex: atasAndIxs.length + scopeRefreshIx.length,
    userTransferAuthority: owner,
    lendingMarketAuthority: await market.getLendingMarketAuthority(),
    lendingMarketAddress: market.getAddress(),
    reserve: collReserve,
    amountLamports: flashBorrowInCollLamports,
    destinationAta: collTokenAta,
    referrerAccount: none(),
    referrerTokenState: none(),
    programId: market.programId,
  });

  const requestElevationGroup = !isClosingPosition && obligation.state.elevationGroup !== 0;

  const maxWithdrawLtvCheck = getMaxWithdrawLtvCheck(
    obligation,
    debtRepayAmountLamports,
    debtReserve,
    collWithdrawForFlashRepayLamports,
    collReserve
  );

  // 3. Repay obligation debt with the swapped output, then withdraw coll to repay the flash loan.
  let repayAndWithdrawAction;
  if (maxWithdrawLtvCheck === MaxWithdrawLtvCheck.MAX_LTV) {
    repayAndWithdrawAction = await KaminoAction.buildRepayAndWithdrawTxns({
      kaminoMarket: market,
      repayAmount: isClosingPosition ? U64_MAX : debtRepayAmountLamports.toString(),
      repayReserveAddress: debtReserve.address,
      withdrawAmount: isClosingPosition ? U64_MAX : collWithdrawForFlashRepayLamports.toString(),
      withdrawReserveAddress: collReserve.address,
      payer: owner,
      currentLedgerInstant,
      obligation,
      useV2Ixs,
      scopeRefreshConfig: undefined,
      extraComputeBudget: 0,
      includeAtaIxs: false,
      requestElevationGroup,
      initUserMetadata: undefined,
      referrer,
    });
  } else {
    repayAndWithdrawAction = await KaminoAction.buildRepayAndWithdrawV2Txns({
      kaminoMarket: market,
      repayAmount: isClosingPosition ? U64_MAX : debtRepayAmountLamports.toString(),
      repayReserveAddress: debtReserve.address,
      withdrawAmount: isClosingPosition ? U64_MAX : collWithdrawForFlashRepayLamports.toString(),
      withdrawReserveAddress: collReserve.address,
      payer: owner,
      currentLedgerInstant,
      obligation,
      scopeRefreshConfig: undefined,
      extraComputeBudget: 0,
      includeAtaIxs: false,
      requestElevationGroup,
      initUserMetadata: undefined,
      referrer,
    });
  }

  return swapQuoteIxsArray.map((swapQuoteIxs) => {
    const { preActionIxs, swapIxs } = swapQuoteIxs;
    const swapInstructions = removeBudgetIxs(swapIxs);

    // Key difference vs debt-flash: swap BEFORE repay+withdraw (the swap output is what we repay).
    const ixs = [
      ...scopeRefreshIx,
      ...atasAndIxs.map((x) => x.createAtaIx),
      flashBorrowIx,
      ...preActionIxs,
      ...swapInstructions,
      ...KaminoAction.actionToIxs(repayAndWithdrawAction),
      flashRepayIx,
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
