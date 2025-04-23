import { AddressLookupTableAccount, PublicKey, TransactionInstruction } from '@solana/web3.js';
import Decimal from 'decimal.js';
import { KaminoMarket, KaminoObligation } from '../classes';
import { Kamino, StrategyWithAddress } from '@kamino-finance/kliquidity-sdk';
import { ObligationType, ObligationTypeTag, ScopePriceRefreshConfig } from '../utils';

export type SwapQuoteProvider<QuoteResponse> = (
  inputs: SwapInputs,
  klendAccounts: Array<PublicKey>
) => Promise<SwapQuote<QuoteResponse>>;

export type SwapIxsProvider<QuoteResponse> = (
  inputs: SwapInputs,
  klendAccounts: Array<PublicKey>,
  quote: SwapQuote<QuoteResponse>
) => Promise<SwapIxs>;

export type SwapQuote<QuoteResponse> = {
  priceAInB: Decimal;
  quoteResponse?: QuoteResponse;
};

export type SwapIxs = {
  preActionIxs: TransactionInstruction[];
  swapIxs: TransactionInstruction[];
  lookupTables: AddressLookupTableAccount[];
};

export type PriceAinBProvider = (mintA: PublicKey, mintB: PublicKey) => Promise<Decimal>;

export type IsKtokenProvider = (token: PublicKey | string) => Promise<boolean>;

export type FlashLoanInfo = {
  flashBorrowReserve: PublicKey;
  flashLoanFee: Decimal;
};

export type LeverageIxsOutput = {
  instructions: TransactionInstruction[];
  flashLoanInfo: FlashLoanInfo;
};

export type SwapInputs = {
  inputAmountLamports: Decimal;
  minOutAmountLamports?: Decimal;
  inputMint: PublicKey;
  outputMint: PublicKey;
  amountDebtAtaBalance: Decimal | undefined;
};

export type BaseLeverageIxsResponse = {
  ixs: TransactionInstruction[];
  lookupTables: AddressLookupTableAccount[];
  swapInputs: SwapInputs;
  flashLoanInfo: FlashLoanInfo;
};

export type LeverageInitialInputs<LeverageCalcsResult, QuoteResponse> = {
  calcs: LeverageCalcsResult;
  swapQuote: SwapQuote<QuoteResponse>;
  currentSlot: number;
  klendAccounts: Array<PublicKey>;
  collIsKtoken: boolean;
  obligation: KaminoObligation | ObligationType | undefined;
  strategy: StrategyWithAddress | undefined;
};

export interface BaseLeverageSwapInputsProps<QuoteResponse> {
  owner: PublicKey;
  kaminoMarket: KaminoMarket;
  debtTokenMint: PublicKey;
  collTokenMint: PublicKey;
  referrer: PublicKey;
  currentSlot: number;
  slippagePct: Decimal;
  budgetAndPriorityFeeIxs?: TransactionInstruction[];
  kamino: Kamino | undefined;
  scopeRefreshConfig?: ScopePriceRefreshConfig;
  quoteBufferBps: Decimal;
  isKtoken: IsKtokenProvider;
  quoter: SwapQuoteProvider<QuoteResponse>;
  useV2Ixs: boolean;
}

export type DepositLeverageIxsResponse<QuoteResponse> = BaseLeverageIxsResponse & {
  initialInputs: LeverageInitialInputs<DepositLeverageCalcsResult, QuoteResponse>;
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

export interface DepositWithLeverageSwapInputsProps<QuoteResponse> extends BaseLeverageSwapInputsProps<QuoteResponse> {
  obligation: KaminoObligation | null;
  obligationTypeTagOverride: ObligationTypeTag;
  depositAmount: Decimal;
  priceDebtToColl: Decimal;
  targetLeverage: Decimal;
  selectedTokenMint: PublicKey;
  priceAinB: PriceAinBProvider;
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
  flashBorrowInDebtTokenKtokenOnly: Decimal;
  singleSidedDepositKtokenOnly: Decimal;
  requiredCollateralKtokenOnly: Decimal;
};

export type WithdrawLeverageIxsResponse<QuoteResponse> = BaseLeverageIxsResponse & {
  initialInputs: LeverageInitialInputs<WithdrawLeverageCalcsResult, QuoteResponse>;
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

export interface WithdrawWithLeverageSwapInputsProps<QuoteResponse> extends BaseLeverageSwapInputsProps<QuoteResponse> {
  obligation: KaminoObligation;
  deposited: Decimal;
  borrowed: Decimal;
  withdrawAmount: Decimal;
  priceCollToDebt: Decimal;
  isClosingPosition: boolean;
  selectedTokenMint: PublicKey;
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

export type AdjustLeverageIxsResponse<QuoteResponse> = BaseLeverageIxsResponse & {
  initialInputs: LeverageInitialInputs<AdjustLeverageCalcsResult, QuoteResponse> & {
    isDeposit: boolean;
  };
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

export interface AdjustLeverageSwapInputsProps<QuoteResponse> extends BaseLeverageSwapInputsProps<QuoteResponse> {
  obligation: KaminoObligation;
  depositedLamports: Decimal;
  borrowedLamports: Decimal;
  targetLeverage: Decimal;
  priceCollToDebt: Decimal;
  priceDebtToColl: Decimal;
  priceAinB: PriceAinBProvider;
}

export interface AdjustLeverageProps<QuoteResponse> extends AdjustLeverageSwapInputsProps<QuoteResponse> {
  swapper: SwapIxsProvider<QuoteResponse>;
}

export type AdjustLeverageCalcsResult = {
  adjustDepositPosition: Decimal;
  adjustBorrowPosition: Decimal;
  amountToFlashBorrowDebt: Decimal;
  borrowAmount: Decimal;
  expectedDebtTokenAtaBalance: Decimal;
  withdrawAmountWithSlippageAndFlashLoanFee: Decimal;
};
