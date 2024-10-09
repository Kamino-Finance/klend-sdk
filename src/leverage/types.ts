import { AddressLookupTableAccount, PublicKey, TransactionInstruction } from '@solana/web3.js';
import Decimal from 'decimal.js';
import { KaminoMarket, KaminoObligation } from '../classes';
import { InstructionsWithLookupTables, Kamino, StrategyWithAddress } from '@kamino-finance/kliquidity-sdk';
import { ObligationType, ObligationTypeTag } from '../utils';

export type SwapQuoteProvider<QuoteResponse> = (
  inputs: SwapInputs,
  klendAccounts: Array<PublicKey>
) => Promise<SwapQuote<QuoteResponse>>;

export type SwapQuoteIxsProvider<QuoteResponse> = (
  inputs: SwapInputs,
  klendAccounts: Array<PublicKey>,
  quote: SwapQuote<QuoteResponse>
) => Promise<SwapQuoteIxs>;

export type SwapQuote<QuoteResponse> = {
  priceAInB: Decimal;
  quoteResponse?: QuoteResponse;
};

export type SwapQuoteIxs = {
  preActionIxs: TransactionInstruction[];
  swapIxs: TransactionInstruction[];
  lookupTables: AddressLookupTableAccount[];
};

export type PriceAinBProvider = (mintA: PublicKey, mintB: PublicKey) => Promise<Decimal>;

export type IsKtokenProvider = (token: PublicKey | string) => Promise<boolean>;

export type SwapInputs = {
  inputAmountLamports: Decimal;
  inputMint: PublicKey;
  outputMint: PublicKey;
  amountDebtAtaBalance: Decimal | undefined;
};

export type KaminoDepositSwapOverride = (
  kaminoMarket: KaminoMarket,
  kamino: Kamino,
  depositor: PublicKey,
  amountInMint: PublicKey,
  amountOutMint: PublicKey,
  amountIn: Decimal,
  slippageFactor: Decimal,
  amountDebtAtaBalance: Decimal
) => Promise<InstructionsWithLookupTables>;

export type DepsoitLeverageIxsResponse<QuoteResponse> = {
  ixs: TransactionInstruction[];
  lookupTables: AddressLookupTableAccount[];
  swapInputs: SwapInputs;
  initialInputs: DepositLeverageInitialInputs<QuoteResponse>;
};

export type DepositLeverageInitialInputs<QuoteResponse> = {
  calcs: DepositLeverageCalcsResult;
  swapQuote: SwapQuote<QuoteResponse>;
  currentSlot: number;
  klendAccounts: Array<PublicKey>;
  collIsKtoken: boolean;
  obligation: KaminoObligation | ObligationType | undefined;
  strategy: StrategyWithAddress | undefined;
};

export interface DepositWithLeverageSwapInputsProps<QuoteResponse> {
  owner: PublicKey;
  kaminoMarket: KaminoMarket;
  debtTokenMint: PublicKey;
  collTokenMint: PublicKey;
  obligation: KaminoObligation | null;
  obligationTypeTagOverride: ObligationTypeTag;
  referrer: PublicKey;
  currentSlot: number;
  depositAmount: Decimal;
  priceDebtToColl: Decimal;
  slippagePct: Decimal;
  targetLeverage: Decimal;
  selectedTokenMint: PublicKey;
  budgetAndPriorityFeeIxs?: TransactionInstruction[];
  kamino: Kamino | undefined;
  scopeFeed: string | undefined;
  quoteBufferBps: Decimal;
  priceAinB: PriceAinBProvider;
  isKtoken: IsKtokenProvider;
  quoter: SwapQuoteProvider<QuoteResponse>;
}

export interface DepositWithLeverageProps<QuoteResponse> extends DepositWithLeverageSwapInputsProps<QuoteResponse> {
  swapper: SwapQuoteIxsProvider<QuoteResponse>;
}

export type DepositLeverageCalcsResult = {
  flashBorrowInCollToken: Decimal;
  initDepositInSol: Decimal;
  debtTokenToBorrow: Decimal;
  collTokenToDeposit: Decimal;
  swapDebtTokenIn: Decimal;
  swapCollTokenExpectedOut: Decimal;
  flashBorrowInDebtTokenKtokenOnly: Decimal;
  singleSidedDepositKtokenOnly: Decimal;
  requiredCollateralKtokenOnly: Decimal;
};

export type WithdrawLeverageIxsResponse<QuoteResponse> = {
  ixs: TransactionInstruction[];
  lookupTables: AddressLookupTableAccount[];
  swapInputs: SwapInputs;
  initialInputs: WithdrawLeverageInitialInputs<QuoteResponse>;
};

export type WithdrawLeverageInitialInputs<QuoteResponse> = {
  calcs: WithdrawLeverageCalcsResult;
  swapQuote: SwapQuote<QuoteResponse>;
  currentSlot: number;
  klendAccounts: Array<PublicKey>;
  collIsKtoken: boolean;
  obligation: KaminoObligation | ObligationType | undefined;
  strategy: StrategyWithAddress | undefined;
};

export interface WithdrawWithLeverageSwapInputsProps<QuoteResponse> {
  owner: PublicKey;
  kaminoMarket: KaminoMarket;
  debtTokenMint: PublicKey;
  collTokenMint: PublicKey;
  obligation: KaminoObligation;
  deposited: Decimal;
  borrowed: Decimal;
  referrer: PublicKey;
  currentSlot: number;
  withdrawAmount: Decimal;
  priceCollToDebt: Decimal;
  slippagePct: Decimal;
  isClosingPosition: boolean;
  selectedTokenMint: PublicKey;
  budgetAndPriorityFeeIxs?: TransactionInstruction[];
  kamino: Kamino | undefined;
  scopeFeed: string | undefined;
  quoteBufferBps: Decimal;
  isKtoken: IsKtokenProvider;
  quoter: SwapQuoteProvider<QuoteResponse>;
}

export interface WithdrawWithLeverageProps<QuoteResponse> extends WithdrawWithLeverageSwapInputsProps<QuoteResponse> {
  swapper: SwapQuoteIxsProvider<QuoteResponse>;
}

export type WithdrawLeverageCalcsResult = {
  withdrawAmount: Decimal;
  repayAmount: Decimal;
  collTokenSwapIn: Decimal;
  depositTokenWithdrawAmount: Decimal;
  debtTokenExpectedSwapOut: Decimal;
};

export type AdjustLeverageIxsResponse<QuoteResponse> = {
  ixs: TransactionInstruction[];
  lookupTables: AddressLookupTableAccount[];
  swapInputs: SwapInputs;
  initialInputs: AdjustLeverageInitialInputs<QuoteResponse>;
};

export type AdjustLeverageInitialInputs<QuoteResponse> = {
  calcs: AdjustLeverageCalcsResult;
  swapQuote: SwapQuote<QuoteResponse>;
  currentSlot: number;
  klendAccounts: Array<PublicKey>;
  isDeposit: boolean;
  collIsKtoken: boolean;
  obligation: KaminoObligation | ObligationType | undefined;
  strategy: StrategyWithAddress | undefined;
};

export interface AdjustLeverageSwapInputsProps<QuoteResponse> {
  owner: PublicKey;
  kaminoMarket: KaminoMarket;
  debtTokenMint: PublicKey;
  collTokenMint: PublicKey;
  obligation: KaminoObligation;
  depositedLamports: Decimal;
  borrowedLamports: Decimal;
  referrer: PublicKey;
  currentSlot: number;
  targetLeverage: Decimal;
  priceCollToDebt: Decimal;
  priceDebtToColl: Decimal;
  slippagePct: Decimal;
  budgetAndPriorityFeeIxs?: TransactionInstruction[];
  kamino: Kamino | undefined;
  scopeFeed: string | undefined;
  quoteBufferBps: Decimal;
  priceAinB: PriceAinBProvider;
  isKtoken: IsKtokenProvider;
  quoter: SwapQuoteProvider<QuoteResponse>;
}

export interface AdjustLeverageProps<QuoteResponse> extends AdjustLeverageSwapInputsProps<QuoteResponse> {
  swapper: SwapQuoteIxsProvider<QuoteResponse>;
}

export type AdjustLeverageCalcsResult = {
  adjustDepositPosition: Decimal;
  adjustBorrowPosition: Decimal;
  amountToFlashBorrowDebt: Decimal;
  borrowAmount: Decimal;
  expectedDebtTokenAtaBalance: Decimal;
  withdrawAmountWithSlippageAndFlashLoanFee: Decimal;
};
