import { TOKEN_PROGRAM_ID } from '@solana/spl-token';
import { KaminoAction, KaminoMarket, KaminoObligation, KaminoReserve } from '../classes';
import {
  getFlashLoanInstructions,
  SwapInputs,
  SwapQuote,
  SwapQuoteIxs,
  SwapQuoteIxsProvider,
  SwapQuoteProvider,
} from '../leverage';
import {
  createAtasIdempotent,
  getComputeBudgetAndPriorityFeeIxns,
  removeBudgetAndAtaIxns,
  ScopeRefresh,
  U64_MAX,
  uniqueAccounts,
} from '../utils';
import { AddressLookupTableAccount, PublicKey, TransactionInstruction } from '@solana/web3.js';
import Decimal from 'decimal.js';
import { calcMaxWithdrawCollateral, calcRepayAmountWithSlippage } from './repay_with_collateral_calcs';

export type RepayWithCollIxsResponse<QuoteResponse> = {
  ixs: TransactionInstruction[];
  lookupTables: AddressLookupTableAccount[];
  swapInputs: SwapInputs;
  initialInputs: InitialInputs<QuoteResponse>;
};

export type InitialInputs<QuoteResponse> = {
  debtRepayAmountLamports: Decimal;
  flashRepayAmountLamports: Decimal;
  swapQuote: SwapQuote<QuoteResponse>;
  currentSlot: number;
  klendAccounts: Array<PublicKey>;
};

interface RepayWithCollSwapInputsProps<QuoteResponse> {
  kaminoMarket: KaminoMarket;
  debtTokenMint: PublicKey;
  collTokenMint: PublicKey;
  obligation: KaminoObligation;
  referrer: PublicKey;
  currentSlot: number;
  repayAmount: Decimal;
  isClosingPosition: boolean;
  budgetAndPriorityFeeIxs?: TransactionInstruction[];
  scopeRefresh?: ScopeRefresh;
  quoter: SwapQuoteProvider<QuoteResponse>;
}

export async function getRepayWithCollSwapInputs<QuoteResponse>({
  collTokenMint,
  currentSlot,
  debtTokenMint,
  kaminoMarket,
  obligation,
  quoter,
  referrer,
  repayAmount,
  isClosingPosition,
  budgetAndPriorityFeeIxs,
  scopeRefresh,
}: RepayWithCollSwapInputsProps<QuoteResponse>): Promise<{
  swapInputs: SwapInputs;
  initialInputs: InitialInputs<QuoteResponse>;
}> {
  const collReserve = kaminoMarket.getReserveByMint(collTokenMint);
  const debtReserve = kaminoMarket.getReserveByMint(debtTokenMint);
  if (!collReserve) {
    throw new Error(`Collateral reserve with mint ${collReserve} not found in market ${kaminoMarket.getAddress()}`);
  }
  if (!debtReserve) {
    throw new Error(`Debt reserve with mint ${debtReserve} not found in market ${kaminoMarket.getAddress()}`);
  }

  const { repayAmountLamports, flashRepayAmountLamports } = calcRepayAmountWithSlippage(
    kaminoMarket,
    debtReserve,
    currentSlot,
    obligation,
    repayAmount,
    referrer
  );

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
  const { withdrawableCollLamports } = calcMaxWithdrawCollateral(
    kaminoMarket,
    collReserve.address,
    debtReserve.address,
    obligation,
    repayAmountLamports
  );

  const swapQuoteInputs: SwapInputs = {
    inputAmountLamports: withdrawableCollLamports,
    inputMint: collTokenMint,
    outputMint: debtTokenMint,
    amountDebtAtaBalance: new Decimal(0), // only used for kTokens
  };

  // Build the repay & withdraw collateral tx to get the number of accounts
  const klendIxs = await buildRepayWithCollateralIxs(
    kaminoMarket,
    debtReserve,
    collReserve,
    obligation,
    referrer,
    currentSlot,
    budgetAndPriorityFeeIxs,
    scopeRefresh,
    {
      preActionIxs: [],
      swapIxs: [],
      lookupTables: [],
    },
    isClosingPosition,
    repayAmountLamports,
    withdrawableCollLamports
  );
  const uniqueKlendAccounts = uniqueAccounts(klendIxs);
  const swapQuote = await quoter(swapQuoteInputs, uniqueKlendAccounts);

  const swapQuotePxDebtToColl = swapQuote.priceAInB;
  const collSwapInLamports = flashRepayAmountLamports
    .div(debtReserve.getMintFactor())
    .div(swapQuotePxDebtToColl)
    .mul(collReserve.getMintFactor())
    .ceil();

  return {
    swapInputs: {
      inputAmountLamports: collSwapInLamports,
      inputMint: collTokenMint,
      outputMint: debtTokenMint,
      amountDebtAtaBalance: new Decimal(0), // only used for kTokens
    },
    initialInputs: {
      debtRepayAmountLamports: repayAmountLamports,
      flashRepayAmountLamports,
      swapQuote,
      currentSlot,
      klendAccounts: uniqueKlendAccounts,
    },
  };
}

interface RepayWithCollIxsProps<QuoteResponse> extends RepayWithCollSwapInputsProps<QuoteResponse> {
  swapper: SwapQuoteIxsProvider<QuoteResponse>;
  logger?: (msg: string, ...extra: any[]) => void;
}

export async function getRepayWithCollIxs<QuoteResponse>({
  repayAmount,
  isClosingPosition,
  budgetAndPriorityFeeIxs,
  collTokenMint,
  currentSlot,
  debtTokenMint,
  kaminoMarket,
  obligation,
  quoter,
  swapper,
  referrer,
  scopeRefresh,
  logger = console.log,
}: RepayWithCollIxsProps<QuoteResponse>): Promise<RepayWithCollIxsResponse<QuoteResponse>> {
  const { swapInputs, initialInputs } = await getRepayWithCollSwapInputs({
    collTokenMint,
    currentSlot,
    debtTokenMint,
    kaminoMarket,
    obligation,
    quoter,
    referrer,
    repayAmount,
    isClosingPosition,
    budgetAndPriorityFeeIxs,
    scopeRefresh,
  });
  const { debtRepayAmountLamports, flashRepayAmountLamports, swapQuote } = initialInputs;
  const { inputAmountLamports: collSwapInLamports } = swapInputs;

  const collReserve = kaminoMarket.getReserveByMint(collTokenMint)!;
  const debtReserve = kaminoMarket.getReserveByMint(debtTokenMint)!;

  logger(
    `Expected to swap in: ${collSwapInLamports.div(collReserve.getMintFactor())} ${
      collReserve.symbol
    }, for: ${flashRepayAmountLamports.div(debtReserve.getMintFactor())} ${debtReserve.symbol}, quoter px: ${
      swapQuote.priceAInB
    } ${debtReserve.symbol}/${collReserve.symbol}`
  );

  const swapResponse = await swapper(swapInputs, initialInputs.klendAccounts, swapQuote);
  const ixs = await buildRepayWithCollateralIxs(
    kaminoMarket,
    debtReserve,
    collReserve,
    obligation,
    referrer,
    currentSlot,
    budgetAndPriorityFeeIxs,
    scopeRefresh,
    swapResponse,
    isClosingPosition,
    debtRepayAmountLamports,
    swapInputs.inputAmountLamports
  );

  return {
    ixs,
    lookupTables: swapResponse.lookupTables,
    swapInputs,
    initialInputs,
  };
}

async function buildRepayWithCollateralIxs(
  market: KaminoMarket,
  debtReserve: KaminoReserve,
  collReserve: KaminoReserve,
  obligation: KaminoObligation,
  referrer: PublicKey,
  currentSlot: number,
  budgetAndPriorityFeeIxs: TransactionInstruction[] | undefined,
  scopeRefresh: ScopeRefresh | undefined,
  swapQuoteIxs: SwapQuoteIxs,
  isClosingPosition: boolean,
  debtRepayAmountLamports: Decimal,
  collWithdrawLamports: Decimal
): Promise<TransactionInstruction[]> {
  // 1. Create atas & budget txns
  const budgetIxns = budgetAndPriorityFeeIxs || getComputeBudgetAndPriorityFeeIxns(1_400_000);

  const atas = [
    { mint: collReserve.getLiquidityMint(), tokenProgram: collReserve.getLiquidityTokenProgram() },
    { mint: debtReserve.getLiquidityMint(), tokenProgram: debtReserve.getLiquidityTokenProgram() },
    { mint: collReserve.getCTokenMint(), tokenProgram: TOKEN_PROGRAM_ID },
  ];

  const atasAndIxs = createAtasIdempotent(obligation.state.owner, atas);
  const [, { ata: debtTokenAta }] = atasAndIxs;

  // 2. Flash borrow & repay the debt to repay amount needed
  const { flashBorrowIxn, flashRepayIxn } = getFlashLoanInstructions({
    borrowIxnIndex: budgetIxns.length + atasAndIxs.length,
    walletPublicKey: obligation.state.owner,
    lendingMarketAuthority: market.getLendingMarketAuthority(),
    lendingMarketAddress: market.getAddress(),
    reserve: debtReserve,
    amountLamports: debtRepayAmountLamports,
    destinationAta: debtTokenAta,
    referrerAccount: market.programId,
    referrerTokenState: market.programId,
    programId: market.programId,
  });

  const requestElevationGroup = !isClosingPosition && obligation.state.elevationGroup !== 0;

  // 3. Repay using the flash borrowed funds & withdraw collateral to swap and pay the flash loan
  const repayAndWithdrawAction = await KaminoAction.buildRepayAndWithdrawTxns(
    market,
    isClosingPosition ? U64_MAX : debtRepayAmountLamports.toString(),
    debtReserve.getLiquidityMint(),
    isClosingPosition ? U64_MAX : collWithdrawLamports.toString(),
    collReserve.getLiquidityMint(),
    obligation.state.owner,
    currentSlot,
    obligation,
    0,
    false,
    requestElevationGroup,
    undefined,
    isClosingPosition,
    referrer,
    scopeRefresh
  );

  // 4. Swap collateral to debt to repay flash loan
  const { preActionIxs, swapIxs } = swapQuoteIxs;
  const swapInstructions = removeBudgetAndAtaIxns(swapIxs, []);

  return [
    ...budgetIxns,
    ...atasAndIxs.map((x) => x.createAtaIx),
    flashBorrowIxn,
    ...preActionIxs,
    ...KaminoAction.actionToIxs(repayAndWithdrawAction),
    ...swapInstructions,
    flashRepayIxn,
  ];
}
