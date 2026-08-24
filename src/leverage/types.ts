import { Account, Address, Instruction, Option, TransactionSigner } from '@solana/kit';
import Decimal from 'decimal.js';
import { FixedTermReorigination, KaminoMarket, KaminoObligation } from '../classes';
import { ObligationType, ObligationTypeTag } from '../utils';
import { AddressLookupTable } from '@solana-program/address-lookup-table';
import type { LedgerInstant } from '../utils/ledger';

export type SwapQuoteProvider<QuoteResponse> = (
  inputs: SwapInputs,
  klendAccounts: Array<Address>
) => Promise<SwapQuote<QuoteResponse>>;

export type SwapIxsProvider<QuoteResponse> = (
  inputs: SwapInputs,
  klendAccounts: Array<Address>,
  quote: SwapQuote<QuoteResponse>
) => Promise<Array<SwapIxs<QuoteResponse>>>;

export type SwapQuote<QuoteResponse> = {
  /**
   * The SIMULATED (mid) exchange rate `amountOut / amountIn` (token B per token A), BEFORE slippage.
   * Both the quoter AND the swapper must return the mid price here: the SDK applies its own slippage sizing
   * buffer (`getSlippageFactor(slippagePct)`) on top of it. Returning a slippage-baked (guaranteed / min-out)
   * price double-applies slippage and mis-sizes the swap input and the resulting deposit.
   */
  priceAInB: Decimal;
  quoteResponse?: QuoteResponse;
};

export type SwapIxs<QuoteResponse> = {
  preActionIxs: Instruction[];
  swapIxs: Instruction[];
  lookupTables: Account<AddressLookupTable>[];
  quote: SwapQuote<QuoteResponse>;
};

export type PriceAinBProvider = (mintA: Address, mintB: Address) => Promise<Decimal>;

export type FlashBorrowType = 'coll' | 'debt';

export type FlashLoanInfo = {
  flashBorrowReserve: Address;
  flashLoanFee: Decimal;
};

export type LeverageIxsOutput = {
  instructions: Instruction[];
  flashLoanInfo: FlashLoanInfo;
};

export type SwapInputs = {
  inputAmountLamports: Decimal;
  minOutAmountLamports?: Decimal;
  inputMint: Address;
  outputMint: Address;
};

export type BaseLeverageIxsResponse<QuoteResponse> = {
  ixs: Instruction[];
  lookupTables: Account<AddressLookupTable>[];
  swapInputs: SwapInputs;
  flashLoanInfo: FlashLoanInfo;
  quote?: QuoteResponse;
  /**
   * When the debt reserve is fixed-rate, the terms the (re)originated debt is stamped with. Set on flows that borrow
   * fixed-term debt (deposit/increase, and the re-borrow these flows perform); a fresh borrow resets the term clock
   * and drops any prior auto-rollover config. Undefined for open-term debt. The early-repay penalty on decrease/close
   * flows is surfaced separately via `initialInputs.calcs.earlyRepayPenaltyAmount`.
   */
  reorigination?: FixedTermReorigination;
};

export type LeverageInitialInputs<LeverageCalcsResult, QuoteResponse> = {
  calcs: LeverageCalcsResult;
  swapQuote: SwapQuote<QuoteResponse>;
  /** The ledger instant (slot + block time) used consistently for interest, term, and maturity calculations. */
  currentLedgerInstant: LedgerInstant;
  klendAccounts: Array<Address>;
  obligation: KaminoObligation | ObligationType | undefined;
};

export interface BaseLeverageSwapInputsProps<QuoteResponse> {
  owner: TransactionSigner;
  kaminoMarket: KaminoMarket;
  debtReserveAddress: Address;
  collReserveAddress: Address;
  referrer: Option<Address>;
  /** The ledger instant (slot + block time) the position estimates are evaluated at. */
  currentLedgerInstant: LedgerInstant;
  slippagePct: Decimal;
  budgetAndPriorityFeeIxs?: Instruction[];
  scopeRefreshIx: Instruction[]; // no longer optional as we always pass an array (can be empty)
  quoteBufferBps: Decimal;
  quoter: SwapQuoteProvider<QuoteResponse>;
  useV2Ixs: boolean;
  flashBorrowType?: FlashBorrowType;
  logger?: (msg: string, ...extra: unknown[]) => void;
}

export type BaseLeverageSwapInputsParams<QuoteResponse> = BaseLeverageSwapInputsProps<QuoteResponse>;

export type DepositLeverageIxsResponse<QuoteResponse> = BaseLeverageIxsResponse<QuoteResponse> & {
  initialInputs: LeverageInitialInputs<DepositLeverageCalcsResult | DepositLeverageDebtFlashCalcsResult, QuoteResponse>;
};

export type DepositLeverageInitialInputs<QuoteResponse> = {
  calcs: DepositLeverageCalcsResult | DepositLeverageDebtFlashCalcsResult;
  swapQuote: SwapQuote<QuoteResponse>;
  currentLedgerInstant: LedgerInstant;
  klendAccounts: Array<Address>;
  obligation: KaminoObligation | ObligationType | undefined;
};

export interface DepositWithLeverageSwapInputsProps<QuoteResponse> extends BaseLeverageSwapInputsProps<QuoteResponse> {
  obligation: KaminoObligation | null;
  obligationTypeTagOverride: ObligationTypeTag;
  depositAmount: Decimal;
  priceDebtToColl: Decimal;
  targetLeverage: Decimal;
  selectedTokenMint: Address;
  // currently only used to disable requesting elevation group when this value is 0
  // to be implemented properly in the future
  elevationGroupOverride?: number;
}

export interface DepositWithLeverageProps<QuoteResponse> extends DepositWithLeverageSwapInputsProps<QuoteResponse> {
  swapper: SwapIxsProvider<QuoteResponse>;
  rollOver?: boolean;
}

export type DepositWithLeverageSwapInputsParams<QuoteResponse> = DepositWithLeverageSwapInputsProps<QuoteResponse>;

export type DepositWithLeverageParams<QuoteResponse> = DepositWithLeverageProps<QuoteResponse>;

type BaseDepositLeverageCalcsResult = {
  initDepositInSol: Decimal;
  debtTokenToBorrow: Decimal;
  collTokenToDeposit: Decimal;
  swapDebtTokenIn: Decimal;
  swapCollTokenExpectedOut: Decimal;
};

export type DepositLeverageCalcsResult = BaseDepositLeverageCalcsResult & {
  flashBorrowInCollToken: Decimal;
};

export type DepositLeverageDebtFlashCalcsResult = BaseDepositLeverageCalcsResult & {
  flashBorrowInDebtToken: Decimal;
};

export type WithdrawLeverageIxsResponse<QuoteResponse> = BaseLeverageIxsResponse<QuoteResponse> & {
  initialInputs: LeverageInitialInputs<
    WithdrawLeverageCalcsResult | WithdrawLeverageCollFlashCalcsResult,
    QuoteResponse
  >;
};

export type WithdrawLeverageInitialInputs<QuoteResponse> = {
  calcs: WithdrawLeverageCalcsResult | WithdrawLeverageCollFlashCalcsResult;
  swapQuote: SwapQuote<QuoteResponse>;
  currentLedgerInstant: LedgerInstant;
  klendAccounts: Array<Address>;
  obligation: KaminoObligation | ObligationType | undefined;
};

export interface WithdrawWithLeverageSwapInputsProps<QuoteResponse> extends BaseLeverageSwapInputsProps<QuoteResponse> {
  obligation: KaminoObligation;
  deposited: Decimal;
  borrowed: Decimal;
  withdrawAmount: Decimal;
  priceCollToDebt: Decimal;
  isClosingPosition: boolean;
  selectedTokenMint: Address;
  userSolBalanceLamports: number;
}

export interface WithdrawWithLeverageProps<QuoteResponse> extends WithdrawWithLeverageSwapInputsProps<QuoteResponse> {
  swapper: SwapIxsProvider<QuoteResponse>;
}

export type WithdrawWithLeverageSwapInputsParams<QuoteResponse> = WithdrawWithLeverageSwapInputsProps<QuoteResponse>;

export type WithdrawWithLeverageParams<QuoteResponse> = WithdrawWithLeverageProps<QuoteResponse>;

export type WithdrawLeverageCalcsResult = {
  withdrawAmount: Decimal;
  /** Debt principal repaid to the obligation (the on-chain repay `liquidity_amount`; token units). */
  repayAmount: Decimal;
  /**
   * Fixed-term early-repay penalty (debt token units) charged on-chain in addition to the repay. Zero for open-term
   * reserves / matured / untracked borrows. Additive funding only — it is NOT part of the repay instruction amount.
   */
  earlyRepayPenaltyAmount: Decimal;
  /** Debt that must be produced/flash-borrowed to cover the repay debit = `repayAmount` + `earlyRepayPenaltyAmount`. */
  repayFundingAmount: Decimal;
  collTokenSwapIn: Decimal;
  depositTokenWithdrawAmount: Decimal;
  debtTokenExpectedSwapOut: Decimal;
};

export type WithdrawLeverageCollFlashCalcsResult = WithdrawLeverageCalcsResult & {
  flashBorrowInCollToken: Decimal;
};

export type AdjustLeverageIxsResponse<QuoteResponse> = BaseLeverageIxsResponse<QuoteResponse> & {
  initialInputs: LeverageInitialInputs<
    AdjustLeverageCalcsResult | AdjustDepositDebtFlashCalcsResult | AdjustWithdrawCollFlashCalcsResult,
    QuoteResponse
  > & {
    isDeposit: boolean;
  };
};

export type AdjustLeverageInitialInputs<QuoteResponse> = {
  calcs: AdjustLeverageCalcsResult | AdjustDepositDebtFlashCalcsResult | AdjustWithdrawCollFlashCalcsResult;
  swapQuote: SwapQuote<QuoteResponse>;
  currentLedgerInstant: LedgerInstant;
  klendAccounts: Array<Address>;
  isDeposit: boolean;
  obligation: KaminoObligation | ObligationType | undefined;
};

export interface AdjustLeverageSwapInputsProps<QuoteResponse> extends BaseLeverageSwapInputsProps<QuoteResponse> {
  obligation: KaminoObligation;
  depositedLamports: Decimal;
  borrowedLamports: Decimal;
  targetLeverage: Decimal;
  priceCollToDebt: Decimal;
  priceDebtToColl: Decimal;
  withdrawSlotOffset?: number;
  userSolBalanceLamports: number;
}

export interface AdjustLeverageProps<QuoteResponse> extends AdjustLeverageSwapInputsProps<QuoteResponse> {
  swapper: SwapIxsProvider<QuoteResponse>;
}

export type AdjustLeverageSwapInputsParams<QuoteResponse> = AdjustLeverageSwapInputsProps<QuoteResponse>;

export type AdjustLeverageIxsParams<QuoteResponse> = AdjustLeverageProps<QuoteResponse>;

export type AdjustLeverageCalcsResult = {
  adjustDepositPosition: Decimal;
  adjustBorrowPosition: Decimal;
  // Used when flash borrowing debt (current decrease path)
  amountToFlashBorrowDebt: Decimal;
  // Used when flash borrowing coll (current increase path)
  borrowAmount: Decimal;
  // Used when flash borrowing debt for decrease
  withdrawAmountWithSlippageAndFlashLoanFee: Decimal;
  // Fixed-term early-repay penalty (debt token units); 0 for open-term / increase. Additive funding only.
  earlyRepayPenaltyAmount: Decimal;
  // Debt to flash-borrow on a decrease = |adjustBorrowPosition| + penalty (the repay-ix amount stays the principal).
  repayFundingAmount: Decimal;
};

type BaseAdjustAltFlashCalcsResult = {
  adjustDepositPosition: Decimal;
  adjustBorrowPosition: Decimal;
};

export type AdjustDepositDebtFlashCalcsResult = BaseAdjustAltFlashCalcsResult & {
  flashBorrowInDebtToken: Decimal;
  debtTokenToBorrow: Decimal;
  swapDebtTokenIn: Decimal;
  swapCollTokenExpectedOut: Decimal;
};

export type AdjustWithdrawCollFlashCalcsResult = BaseAdjustAltFlashCalcsResult & {
  flashBorrowInCollToken: Decimal;
  collTokenSwapIn: Decimal;
  debtTokenExpectedSwapOut: Decimal;
  depositTokenWithdrawAmount: Decimal;
  // Fixed-term early-repay penalty (debt token units); 0 for open-term. Additive funding only.
  earlyRepayPenaltyAmount: Decimal;
  // Debt the coll→debt swap must produce = |adjustBorrowPosition| + penalty (repay-ix amount stays the principal).
  repayFundingAmount: Decimal;
};
