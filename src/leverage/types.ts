import { Account, Address, Instruction, Option, Slot, TransactionSigner } from '@solana/kit';
import Decimal from 'decimal.js';
import { KaminoMarket, KaminoObligation } from '../classes';
import { ObligationType, ObligationTypeTag } from '../utils';
import { AddressLookupTable } from '@solana-program/address-lookup-table';

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
};

export type LeverageInitialInputs<LeverageCalcsResult, QuoteResponse> = {
  calcs: LeverageCalcsResult;
  swapQuote: SwapQuote<QuoteResponse>;
  currentSlot: Slot;
  klendAccounts: Array<Address>;
  obligation: KaminoObligation | ObligationType | undefined;
};

export interface BaseLeverageSwapInputsProps<QuoteResponse> {
  owner: TransactionSigner;
  kaminoMarket: KaminoMarket;
  debtTokenMint: Address;
  collTokenMint: Address;
  referrer: Option<Address>;
  currentSlot: Slot;
  slippagePct: Decimal;
  budgetAndPriorityFeeIxs?: Instruction[];
  scopeRefreshIx: Instruction[]; // no longer optional as we always pass an array (can be empty)
  quoteBufferBps: Decimal;
  quoter: SwapQuoteProvider<QuoteResponse>;
  useV2Ixs: boolean;
}

export type DepositLeverageIxsResponse<QuoteResponse> = BaseLeverageIxsResponse<QuoteResponse> & {
  initialInputs: LeverageInitialInputs<DepositLeverageCalcsResult, QuoteResponse>;
};

export type DepositLeverageInitialInputs<QuoteResponse> = {
  calcs: DepositLeverageCalcsResult;
  swapQuote: SwapQuote<QuoteResponse>;
  currentSlot: Slot;
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
}

export type DepositLeverageCalcsResult = {
  flashBorrowInCollToken: Decimal;
  initDepositInSol: Decimal;
  debtTokenToBorrow: Decimal;
  collTokenToDeposit: Decimal;
  swapDebtTokenIn: Decimal;
  swapCollTokenExpectedOut: Decimal;
};

export type WithdrawLeverageIxsResponse<QuoteResponse> = BaseLeverageIxsResponse<QuoteResponse> & {
  initialInputs: LeverageInitialInputs<WithdrawLeverageCalcsResult, QuoteResponse>;
};

export type WithdrawLeverageInitialInputs<QuoteResponse> = {
  calcs: WithdrawLeverageCalcsResult;
  swapQuote: SwapQuote<QuoteResponse>;
  currentSlot: Slot;
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

export type WithdrawLeverageCalcsResult = {
  withdrawAmount: Decimal;
  repayAmount: Decimal;
  collTokenSwapIn: Decimal;
  depositTokenWithdrawAmount: Decimal;
  debtTokenExpectedSwapOut: Decimal;
};

export type AdjustLeverageIxsResponse<QuoteResponse> = BaseLeverageIxsResponse<QuoteResponse> & {
  initialInputs: LeverageInitialInputs<AdjustLeverageCalcsResult, QuoteResponse> & {
    isDeposit: boolean;
  };
};

export type AdjustLeverageInitialInputs<QuoteResponse> = {
  calcs: AdjustLeverageCalcsResult;
  swapQuote: SwapQuote<QuoteResponse>;
  currentSlot: Slot;
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

export type AdjustLeverageCalcsResult = {
  adjustDepositPosition: Decimal;
  adjustBorrowPosition: Decimal;
  amountToFlashBorrowDebt: Decimal;
  borrowAmount: Decimal;
  withdrawAmountWithSlippageAndFlashLoanFee: Decimal;
};
