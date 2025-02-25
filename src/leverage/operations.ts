import { LAMPORTS_PER_SOL, PublicKey, TransactionInstruction } from '@solana/web3.js';
import Decimal from 'decimal.js';
import {
  KaminoAction,
  KaminoMarket,
  KaminoObligation,
  KaminoReserve,
  lamportsToNumberDecimal as fromLamports,
} from '../classes';
import { getFlashLoanInstructions } from './instructions';

import { numberToLamportsDecimal as toLamports } from '../classes';
import {
  LeverageObligation,
  MultiplyObligation,
  ObligationType,
  ObligationTypeTag,
  SOL_DECIMALS,
  U64_MAX,
  createAtasIdempotent,
  getAssociatedTokenAddress,
  getComputeBudgetAndPriorityFeeIxns,
  getTransferWsolIxns,
  getLookupTableAccount,
  removeBudgetAndAtaIxns,
  uniqueAccounts,
} from '../utils';
import {
  adjustDepositLeverageCalcs,
  adjustWithdrawLeverageCalcs,
  calcAdjustAmounts,
  depositLeverageCalcs,
  depositLeverageKtokenCalcs,
  toJson,
  withdrawLeverageCalcs,
} from './calcs';
import {
  NATIVE_MINT,
  TOKEN_PROGRAM_ID,
  createCloseAccountInstruction,
  getAssociatedTokenAddressSync,
} from '@solana/spl-token';
import { Kamino, StrategyWithAddress } from '@kamino-finance/kliquidity-sdk';
import { getExpectedTokenBalanceAfterBorrow, getKtokenToTokenSwapper, getTokenToKtokenSwapper } from './utils';
import { FullBPS } from '@kamino-finance/kliquidity-sdk/dist/utils/CreationParameters';
import {
  AdjustLeverageCalcsResult,
  AdjustLeverageInitialInputs,
  AdjustLeverageIxsResponse,
  AdjustLeverageProps,
  AdjustLeverageSwapInputsProps,
  DepositLeverageCalcsResult,
  DepositLeverageInitialInputs,
  DepositWithLeverageProps,
  DepositWithLeverageSwapInputsProps,
  DepsoitLeverageIxsResponse,
  PriceAinBProvider,
  SwapInputs,
  SwapIxs,
  SwapIxsProvider,
  WithdrawLeverageCalcsResult,
  WithdrawLeverageInitialInputs,
  WithdrawLeverageIxsResponse,
  WithdrawWithLeverageProps,
  WithdrawWithLeverageSwapInputsProps,
} from './types';

export async function getDepositWithLeverageSwapInputs<QuoteResponse>({
  owner,
  kaminoMarket,
  debtTokenMint,
  collTokenMint,
  depositAmount,
  priceDebtToColl,
  slippagePct,
  obligation,
  referrer,
  currentSlot,
  targetLeverage,
  selectedTokenMint,
  kamino,
  obligationTypeTagOverride,
  scopeFeed,
  budgetAndPriorityFeeIxs,
  quoteBufferBps,
  priceAinB,
  isKtoken,
  quoter,
  elevationGroupOverride,
}: DepositWithLeverageSwapInputsProps<QuoteResponse>): Promise<{
  swapInputs: SwapInputs;
  initialInputs: DepositLeverageInitialInputs<QuoteResponse>;
}> {
  const collReserve = kaminoMarket.getReserveByMint(collTokenMint)!;
  const debtReserve = kaminoMarket.getReserveByMint(debtTokenMint)!;
  const solTokenReserve = kaminoMarket.getReserveByMint(NATIVE_MINT);
  const flashLoanFee = collReserve.getFlashLoanFee() || new Decimal(0);

  const selectedTokenIsCollToken = selectedTokenMint.equals(collTokenMint);
  const depositTokenIsSol = !solTokenReserve ? false : selectedTokenMint.equals(solTokenReserve!.getLiquidityMint());

  const collIsKtoken = await isKtoken(collTokenMint);
  const strategy = collIsKtoken ? (await kamino!.getStrategyByKTokenMint(collTokenMint))! : undefined;

  const calcs = await getDepositWithLeverageCalcs(
    depositAmount,
    selectedTokenIsCollToken,
    collIsKtoken,
    depositTokenIsSol,
    priceDebtToColl,
    targetLeverage,
    slippagePct,
    flashLoanFee,
    kamino,
    strategy,
    debtTokenMint,
    priceAinB,
    debtReserve!
  );

  console.log('Ops Calcs', toJson(calcs));

  let obligationType: ObligationType;
  if (obligationTypeTagOverride === ObligationTypeTag.Multiply) {
    // multiply
    obligationType = new MultiplyObligation(collTokenMint, debtTokenMint, kaminoMarket.programId);
  } else if (obligationTypeTagOverride === ObligationTypeTag.Leverage) {
    // leverage
    obligationType = new LeverageObligation(collTokenMint, debtTokenMint, kaminoMarket.programId);
  } else {
    throw Error('Obligation type tag not supported for leverage, please use 1 - multiply or 3 - leverage');
  }

  // Build the repay & withdraw collateral tx to get the number of accounts
  const klendIxs = await buildDepositWithLeverageIxns(
    kaminoMarket,
    debtReserve,
    collReserve,
    owner,
    obligation ? obligation : obligationType,
    referrer,
    currentSlot,
    depositTokenIsSol,
    scopeFeed,
    calcs,
    budgetAndPriorityFeeIxs,
    {
      preActionIxs: [],
      swapIxs: [],
      lookupTables: [],
    },
    strategy,
    collIsKtoken,
    elevationGroupOverride
  );

  const uniqueKlendAccounts = uniqueAccounts(klendIxs);

  const swapInputAmount = toLamports(
    !collIsKtoken ? calcs.swapDebtTokenIn : calcs.singleSidedDepositKtokenOnly,
    debtReserve.stats.decimals
  ).ceil();

  const swapInputsForQuote: SwapInputs = {
    inputAmountLamports: swapInputAmount.mul(new Decimal(1).add(quoteBufferBps.div(FullBPS))),
    inputMint: debtTokenMint,
    outputMint: collTokenMint,
    amountDebtAtaBalance: new Decimal(0), // Only needed for ktokens swaps
  };

  const swapQuote = await quoter(swapInputsForQuote, uniqueKlendAccounts);

  const quotePriceCalcs = await getDepositWithLeverageCalcs(
    depositAmount,
    selectedTokenIsCollToken,
    collIsKtoken,
    depositTokenIsSol,
    swapQuote.priceAInB,
    targetLeverage,
    slippagePct,
    flashLoanFee,
    kamino,
    strategy,
    debtTokenMint,
    priceAinB,
    debtReserve!
  );

  const swapInputAmountQuotePrice = toLamports(
    !collIsKtoken ? quotePriceCalcs.swapDebtTokenIn : quotePriceCalcs.singleSidedDepositKtokenOnly,
    debtReserve.stats.decimals
  ).ceil();

  let expectedDebtTokenAtaBalance = new Decimal(0);

  if (collIsKtoken) {
    let futureBalanceInAta = new Decimal(0);
    if (debtTokenMint.equals(NATIVE_MINT)) {
      futureBalanceInAta = futureBalanceInAta.add(
        !collIsKtoken ? quotePriceCalcs.initDepositInSol : quotePriceCalcs.initDepositInSol
      );
    }
    futureBalanceInAta = futureBalanceInAta.add(
      !collIsKtoken ? quotePriceCalcs.debtTokenToBorrow : quotePriceCalcs.flashBorrowInDebtTokenKtokenOnly
    );
    expectedDebtTokenAtaBalance = await getExpectedTokenBalanceAfterBorrow(
      kaminoMarket.getConnection(),
      debtTokenMint,
      owner,
      toLamports(futureBalanceInAta.toDecimalPlaces(debtReserve.stats.decimals), debtReserve.stats.decimals),
      debtReserve.state.liquidity.mintDecimals.toNumber()
    );
  }

  return {
    swapInputs: {
      inputAmountLamports: swapInputAmountQuotePrice,
      minOutAmountLamports: toLamports(
        !collIsKtoken ? quotePriceCalcs.flashBorrowInCollToken : quotePriceCalcs.flashBorrowInDebtTokenKtokenOnly,
        !collIsKtoken ? collReserve.stats.decimals : debtReserve.stats.decimals
      ),
      inputMint: debtTokenMint,
      outputMint: collTokenMint,
      amountDebtAtaBalance: expectedDebtTokenAtaBalance,
    },
    initialInputs: {
      calcs: quotePriceCalcs,
      swapQuote,
      currentSlot,
      collIsKtoken,
      strategy,
      obligation: obligation ? obligation : obligationType,
      klendAccounts: uniqueKlendAccounts,
    },
  };
}

async function getDepositWithLeverageCalcs(
  depositAmount: Decimal,
  selectedTokenIsCollToken: boolean,
  collIsKtoken: boolean,
  depositTokenIsSol: boolean,
  priceDebtToColl: Decimal,
  targetLeverage: Decimal,
  slippagePct: Decimal,
  flashLoanFee: Decimal,
  kamino: Kamino | undefined,
  strategy: StrategyWithAddress | undefined,
  debtTokenMint: PublicKey,
  priceAinB: PriceAinBProvider,
  debtReserve: KaminoReserve
): Promise<DepositLeverageCalcsResult> {
  let calcs: DepositLeverageCalcsResult;
  if (!collIsKtoken) {
    calcs = depositLeverageCalcs({
      depositAmount: depositAmount,
      depositTokenIsCollToken: selectedTokenIsCollToken,
      depositTokenIsSol,
      priceDebtToColl,
      targetLeverage,
      slippagePct,
      flashLoanFee,
    });
  } else {
    calcs = await depositLeverageKtokenCalcs({
      kamino: kamino!,
      strategy: strategy!,
      debtTokenMint,
      depositAmount: depositAmount,
      depositTokenIsCollToken: selectedTokenIsCollToken,
      depositTokenIsSol,
      priceDebtToColl,
      targetLeverage,
      slippagePct,
      flashLoanFee,
      priceAinB,
    });
    // Rounding to exact number of decimals so this value is passed through in all calcs without rounding inconsistencies
    calcs.flashBorrowInDebtTokenKtokenOnly = calcs.flashBorrowInDebtTokenKtokenOnly.toDecimalPlaces(
      debtReserve!.state.liquidity.mintDecimals.toNumber()!,
      Decimal.ROUND_CEIL
    );
    calcs.debtTokenToBorrow = calcs.debtTokenToBorrow.toDecimalPlaces(
      debtReserve!.state.liquidity.mintDecimals.toNumber()!,
      Decimal.ROUND_CEIL
    );
    calcs.singleSidedDepositKtokenOnly = calcs.singleSidedDepositKtokenOnly.toDecimalPlaces(
      debtReserve!.state.liquidity.mintDecimals.toNumber()!,
      Decimal.ROUND_CEIL
    );
  }
  return calcs;
}

export async function getDepositWithLeverageIxns<QuoteResponse>({
  owner,
  kaminoMarket,
  debtTokenMint,
  collTokenMint,
  depositAmount,
  priceDebtToColl,
  slippagePct,
  obligation,
  referrer,
  currentSlot,
  targetLeverage,
  selectedTokenMint,
  kamino,
  obligationTypeTagOverride,
  scopeFeed,
  budgetAndPriorityFeeIxs,
  quoteBufferBps,
  priceAinB,
  isKtoken,
  quoter,
  swapper,
  elevationGroupOverride,
}: DepositWithLeverageProps<QuoteResponse>): Promise<DepsoitLeverageIxsResponse<QuoteResponse>> {
  const { swapInputs, initialInputs } = await getDepositWithLeverageSwapInputs({
    owner,
    kaminoMarket,
    debtTokenMint,
    collTokenMint,
    depositAmount,
    priceDebtToColl,
    slippagePct,
    obligation,
    referrer,
    currentSlot,
    targetLeverage,
    selectedTokenMint,
    kamino,
    obligationTypeTagOverride,
    scopeFeed,
    budgetAndPriorityFeeIxs,
    quoteBufferBps,
    priceAinB,
    isKtoken,
    quoter,
  });

  let depositSwapper: SwapIxsProvider<QuoteResponse>;

  if (!initialInputs.collIsKtoken) {
    depositSwapper = swapper;
  } else {
    if (kamino === undefined) {
      throw Error('Ktoken use as collateral for leverage without Kamino instance');
    }
    depositSwapper = await getTokenToKtokenSwapper(kaminoMarket, kamino, owner, slippagePct, swapper, priceAinB, false);
  }

  const { swapIxs, lookupTables } = await depositSwapper(
    swapInputs,
    initialInputs.klendAccounts,
    initialInputs.swapQuote
  );

  if (initialInputs.collIsKtoken) {
    if (initialInputs.strategy!.strategy.strategyLookupTable) {
      const strategyLut = await getLookupTableAccount(
        kaminoMarket.getConnection(),
        initialInputs.strategy!.strategy.strategyLookupTable!
      );
      lookupTables.push(strategyLut!);
    } else {
      console.log('Strategy lookup table not found');
    }
  }

  const collReserve = kaminoMarket.getReserveByMint(collTokenMint);
  const debtReserve = kaminoMarket.getReserveByMint(debtTokenMint);
  const solTokenReserve = kaminoMarket.getReserveByMint(NATIVE_MINT);
  const depositTokenIsSol = !solTokenReserve ? false : selectedTokenMint.equals(solTokenReserve!.getLiquidityMint());

  const ixs = await buildDepositWithLeverageIxns(
    kaminoMarket,
    debtReserve!,
    collReserve!,
    owner,
    initialInputs.obligation,
    referrer,
    currentSlot,
    depositTokenIsSol,
    scopeFeed,
    initialInputs.calcs,
    budgetAndPriorityFeeIxs,
    {
      preActionIxs: [],
      swapIxs: swapIxs,
      lookupTables: lookupTables,
    },
    initialInputs.strategy,
    initialInputs.collIsKtoken,
    elevationGroupOverride
  );

  return {
    ixs,
    lookupTables,
    swapInputs,
    initialInputs,
  };
}

async function buildDepositWithLeverageIxns(
  market: KaminoMarket,
  debtReserve: KaminoReserve,
  collReserve: KaminoReserve,
  owner: PublicKey,
  obligation: KaminoObligation | ObligationType | undefined,
  referrer: PublicKey,
  currentSlot: number,
  depositTokenIsSol: boolean,
  scopeFeed: string | undefined,
  calcs: DepositLeverageCalcsResult,
  budgetAndPriorityFeeIxs: TransactionInstruction[] | undefined,
  swapQuoteIxs: SwapIxs,
  strategy: StrategyWithAddress | undefined,
  collIsKtoken: boolean,
  elevationGroupOverride?: number
): Promise<TransactionInstruction[]> {
  const budgetIxns = budgetAndPriorityFeeIxs || getComputeBudgetAndPriorityFeeIxns(3000000);
  const collTokenMint = collReserve.getLiquidityMint();
  const debtTokenMint = debtReserve.getLiquidityMint();
  const collTokenAta = getAssociatedTokenAddressSync(
    collTokenMint,
    owner,
    false,
    collReserve.getLiquidityTokenProgram()
  );
  const debtTokenAta = getAssociatedTokenAddressSync(
    debtTokenMint,
    owner,
    false,
    debtReserve.getLiquidityTokenProgram()
  );

  // 1. Create atas & budget txns
  let mintsToCreateAtas: Array<{ mint: PublicKey; tokenProgram: PublicKey }>;
  if (collIsKtoken) {
    const secondTokenAta = strategy!.strategy.tokenAMint.equals(debtTokenMint)
      ? strategy!.strategy.tokenBMint
      : strategy!.strategy.tokenAMint;
    const secondTokenTokenProgarm = strategy!.strategy.tokenAMint.equals(debtTokenMint)
      ? strategy!.strategy.tokenBTokenProgram.equals(PublicKey.default)
        ? TOKEN_PROGRAM_ID
        : strategy!.strategy.tokenBTokenProgram
      : strategy!.strategy.tokenATokenProgram.equals(PublicKey.default)
      ? TOKEN_PROGRAM_ID
      : strategy!.strategy.tokenATokenProgram;
    mintsToCreateAtas = [
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
        tokenProgram: TOKEN_PROGRAM_ID,
      },
      {
        mint: secondTokenAta,
        tokenProgram: secondTokenTokenProgarm,
      },
    ];
  } else {
    mintsToCreateAtas = [
      {
        mint: collTokenMint,
        tokenProgram: collReserve.getLiquidityTokenProgram(),
      },
      {
        mint: debtTokenMint,
        tokenProgram: debtReserve.getLiquidityTokenProgram(),
      },
      {
        mint: collReserve!.getCTokenMint(),
        tokenProgram: TOKEN_PROGRAM_ID,
      },
    ];
  }

  const atasAndCreateIxns = createAtasIdempotent(owner, mintsToCreateAtas);

  const fillWsolAtaIxns: TransactionInstruction[] = [];
  if (depositTokenIsSol) {
    fillWsolAtaIxns.push(
      ...getTransferWsolIxns(
        owner,
        getAssociatedTokenAddressSync(NATIVE_MINT, owner),
        toLamports(calcs.initDepositInSol, SOL_DECIMALS).ceil()
      )
    );
  }

  // 2. Flash borrow & repay the collateral amount needed for given leverage
  // if user deposits coll, then we borrow the diff, else we borrow the entire amount
  const { flashBorrowIxn, flashRepayIxn } = getFlashLoanInstructions({
    borrowIxnIndex: budgetIxns.length + atasAndCreateIxns.length + fillWsolAtaIxns.length,
    walletPublicKey: owner,
    lendingMarketAuthority: market.getLendingMarketAuthority(),
    lendingMarketAddress: market.getAddress(),
    reserve: !collIsKtoken ? collReserve : debtReserve,
    amountLamports: toLamports(
      !collIsKtoken ? calcs.flashBorrowInCollToken : calcs.flashBorrowInDebtTokenKtokenOnly,
      !collIsKtoken ? collReserve.stats.decimals : debtReserve.stats.decimals
    ),
    destinationAta: !collIsKtoken ? collTokenAta : debtTokenAta,
    // TODO(referrals): once we support referrals, we will have to replace the placeholder args below:
    referrerAccount: market.programId,
    referrerTokenState: market.programId,
    programId: market.programId,
  });

  // 3. Deposit initial tokens + borrowed tokens into reserve
  const scopeRefresh = scopeFeed ? { includeScopeRefresh: true, scopeFeed: scopeFeed } : undefined;
  const kaminoDepositAndBorrowAction = await KaminoAction.buildDepositAndBorrowTxns(
    market,
    toLamports(!collIsKtoken ? calcs.collTokenToDeposit : calcs.collTokenToDeposit, collReserve.stats.decimals)
      .floor()
      .toString(),
    collTokenMint,
    toLamports(!collIsKtoken ? calcs.debtTokenToBorrow : calcs.debtTokenToBorrow, debtReserve.stats.decimals)
      .ceil()
      .toString(),
    debtTokenMint,
    owner,
    obligation!,
    0,
    false,
    elevationGroupOverride === 0 ? false : true, // emode
    false, // to be checked and created in a setup tx in the UI
    false, // to be checked and created in a setup tx in the UI
    referrer,
    currentSlot,
    scopeRefresh
  );

  // 4. Swap
  const { swapIxs } = swapQuoteIxs;
  const swapInstructions = removeBudgetAndAtaIxns(swapIxs, []);

  if (!collIsKtoken) {
    return [
      ...budgetIxns,
      ...atasAndCreateIxns.map((x) => x.createAtaIx),
      ...fillWsolAtaIxns,
      ...[flashBorrowIxn],
      ...kaminoDepositAndBorrowAction.setupIxs,
      ...KaminoAction.actionToLendingIxs(kaminoDepositAndBorrowAction),
      ...kaminoDepositAndBorrowAction.cleanupIxs,
      ...swapInstructions,
      ...[flashRepayIxn],
    ];
  } else {
    return [
      ...budgetIxns,
      ...atasAndCreateIxns.map((x) => x.createAtaIx),
      ...fillWsolAtaIxns,
      ...[flashBorrowIxn],
      ...swapInstructions,
      ...kaminoDepositAndBorrowAction.setupIxs,
      ...KaminoAction.actionToLendingIxs(kaminoDepositAndBorrowAction),
      ...kaminoDepositAndBorrowAction.cleanupIxs,
      ...[flashRepayIxn],
    ];
  }
}

export async function getWithdrawWithLeverageSwapInputs<QuoteResponse>({
  owner,
  kaminoMarket,
  debtTokenMint,
  collTokenMint,
  deposited,
  borrowed,
  obligation,
  referrer,
  currentSlot,
  withdrawAmount,
  priceCollToDebt,
  slippagePct,
  isClosingPosition,
  selectedTokenMint,
  budgetAndPriorityFeeIxs,
  kamino,
  scopeFeed,
  quoteBufferBps,
  isKtoken,
  quoter,
}: WithdrawWithLeverageSwapInputsProps<QuoteResponse>): Promise<{
  swapInputs: SwapInputs;
  initialInputs: WithdrawLeverageInitialInputs<QuoteResponse>;
}> {
  const collReserve = kaminoMarket.getReserveByMint(collTokenMint);
  const debtReserve = kaminoMarket.getReserveByMint(debtTokenMint);
  const flashLoanFee = debtReserve!.getFlashLoanFee() || new Decimal(0);
  const selectedTokenIsCollToken = selectedTokenMint.equals(collTokenMint);
  const collIsKtoken = await isKtoken(collTokenMint);
  const strategy = collIsKtoken ? (await kamino!.getStrategyByKTokenMint(collTokenMint))! : undefined;

  const solTokenReserve = kaminoMarket.getReserveByMint(NATIVE_MINT);
  const depositTokenIsSol = !solTokenReserve ? false : selectedTokenMint.equals(solTokenReserve!.getLiquidityMint());

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
    slippagePct
  );

  const klendIxs = await buildWithdrawWithLeverageIxns(
    kaminoMarket,
    debtReserve!,
    collReserve!,
    owner,
    obligation,
    referrer,
    currentSlot,
    isClosingPosition,
    depositTokenIsSol,
    scopeFeed,
    calcs,
    budgetAndPriorityFeeIxs,
    {
      preActionIxs: [],
      swapIxs: [],
      lookupTables: [],
    },
    strategy,
    collIsKtoken
  );

  const uniqueKlendAccounts = uniqueAccounts(klendIxs);

  const swapInputAmount = toLamports(
    calcs.collTokenSwapIn,
    collReserve!.state.liquidity.mintDecimals.toNumber()
  ).ceil();

  const swapInputsForQuote: SwapInputs = {
    inputAmountLamports: swapInputAmount.mul(new Decimal(1).add(quoteBufferBps.div(FullBPS))),
    inputMint: collTokenMint,
    outputMint: debtTokenMint,
    amountDebtAtaBalance: new Decimal(0), // Only needed for ktokens deposits
  };

  const swapQuote = await quoter(swapInputsForQuote, uniqueKlendAccounts);

  const calcsQuotePrice = withdrawLeverageCalcs(
    kaminoMarket,
    collReserve!,
    debtReserve!,
    !collIsKtoken ? swapQuote.priceAInB : priceCollToDebt,
    withdrawAmount,
    deposited,
    borrowed,
    currentSlot,
    isClosingPosition,
    selectedTokenIsCollToken,
    selectedTokenMint,
    obligation,
    flashLoanFee,
    slippagePct
  );

  const swapInputAmountQuotePrice = toLamports(
    calcsQuotePrice.collTokenSwapIn,
    collReserve!.state.liquidity.mintDecimals.toNumber()
  ).ceil();

  return {
    swapInputs: {
      inputAmountLamports: swapInputAmountQuotePrice,
      minOutAmountLamports: calcsQuotePrice.repayAmount,
      inputMint: collTokenMint,
      outputMint: debtTokenMint,
      amountDebtAtaBalance: new Decimal(0), // Only needed for ktokens deposits
    },
    initialInputs: {
      calcs: calcsQuotePrice,
      swapQuote,
      currentSlot,
      collIsKtoken,
      strategy,
      obligation,
      klendAccounts: uniqueKlendAccounts,
    },
  };
}

export async function getWithdrawWithLeverageIxns<QuoteResponse>({
  owner,
  kaminoMarket,
  debtTokenMint,
  collTokenMint,
  obligation,
  deposited,
  borrowed,
  referrer,
  currentSlot,
  withdrawAmount,
  priceCollToDebt,
  slippagePct,
  isClosingPosition,
  selectedTokenMint,
  budgetAndPriorityFeeIxs,
  kamino,
  scopeFeed,
  quoteBufferBps,
  isKtoken,
  quoter,
  swapper,
}: WithdrawWithLeverageProps<QuoteResponse>): Promise<WithdrawLeverageIxsResponse<QuoteResponse>> {
  const collReserve = kaminoMarket.getReserveByMint(collTokenMint);
  const debtReserve = kaminoMarket.getReserveByMint(debtTokenMint);

  const solTokenReserve = kaminoMarket.getReserveByMint(NATIVE_MINT);
  const depositTokenIsSol = !solTokenReserve ? false : selectedTokenMint.equals(solTokenReserve!.getLiquidityMint());
  const { swapInputs, initialInputs } = await getWithdrawWithLeverageSwapInputs({
    owner,
    kaminoMarket,
    debtTokenMint,
    collTokenMint,
    deposited,
    borrowed,
    obligation,
    referrer,
    currentSlot,
    withdrawAmount,
    priceCollToDebt,
    slippagePct,
    isClosingPosition,
    selectedTokenMint,
    budgetAndPriorityFeeIxs,
    kamino,
    scopeFeed,
    quoteBufferBps,
    isKtoken,
    quoter,
  });

  let withdrawSwapper: SwapIxsProvider<QuoteResponse>;

  if (initialInputs.collIsKtoken) {
    if (kamino === undefined) {
      throw Error('Ktoken use as collateral for leverage without Kamino instance');
    }
    withdrawSwapper = await getKtokenToTokenSwapper(kaminoMarket, kamino, owner, swapper);
  } else {
    withdrawSwapper = swapper;
  }

  const { swapIxs, lookupTables } = await withdrawSwapper(
    swapInputs,
    initialInputs.klendAccounts,
    initialInputs.swapQuote
  );

  if (initialInputs.collIsKtoken) {
    if (initialInputs.strategy!.strategy.strategyLookupTable) {
      const strategyLut = await getLookupTableAccount(
        kaminoMarket.getConnection(),
        initialInputs.strategy!.strategy.strategyLookupTable!
      );
      lookupTables.push(strategyLut!);
    } else {
      console.log('Strategy lookup table not found');
    }
  }

  const ixs = await buildWithdrawWithLeverageIxns(
    kaminoMarket,
    debtReserve!,
    collReserve!,
    owner,
    obligation,
    referrer,
    currentSlot,
    isClosingPosition,
    depositTokenIsSol,
    scopeFeed,
    initialInputs.calcs,
    budgetAndPriorityFeeIxs,
    {
      preActionIxs: [],
      swapIxs,
      lookupTables,
    },
    initialInputs.strategy,
    initialInputs.collIsKtoken
  );

  // Send ixns and lookup tables
  return {
    ixs,
    lookupTables,
    swapInputs,
    initialInputs: initialInputs,
  };
}

export async function buildWithdrawWithLeverageIxns(
  market: KaminoMarket,
  debtReserve: KaminoReserve,
  collReserve: KaminoReserve,
  owner: PublicKey,
  obligation: KaminoObligation,
  referrer: PublicKey,
  currentSlot: number,
  isClosingPosition: boolean,
  depositTokenIsSol: boolean,
  scopeFeed: string | undefined,
  calcs: WithdrawLeverageCalcsResult,
  budgetAndPriorityFeeIxs: TransactionInstruction[] | undefined,
  swapQuoteIxs: SwapIxs,
  strategy: StrategyWithAddress | undefined,
  collIsKtoken: boolean
): Promise<TransactionInstruction[]> {
  const collTokenMint = collReserve.getLiquidityMint();
  const debtTokenMint = debtReserve.getLiquidityMint();
  const debtTokenAta = getAssociatedTokenAddressSync(
    debtTokenMint,
    owner,
    false,
    debtReserve.getLiquidityTokenProgram()
  );
  // 1. Create atas & budget txns & user metadata
  let mintsToCreateAtas: Array<{ mint: PublicKey; tokenProgram: PublicKey }>;
  if (collIsKtoken) {
    const secondTokenAta = strategy!.strategy.tokenAMint.equals(debtTokenMint)
      ? strategy!.strategy.tokenBMint
      : strategy!.strategy.tokenAMint;
    const secondTokenTokenProgram = strategy!.strategy.tokenAMint.equals(debtTokenMint)
      ? strategy!.strategy.tokenBTokenProgram.equals(PublicKey.default)
        ? TOKEN_PROGRAM_ID
        : strategy!.strategy.tokenBTokenProgram
      : strategy!.strategy.tokenATokenProgram.equals(PublicKey.default)
      ? TOKEN_PROGRAM_ID
      : strategy!.strategy.tokenATokenProgram;
    mintsToCreateAtas = [
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
        tokenProgram: TOKEN_PROGRAM_ID,
      },
      {
        mint: secondTokenAta,
        tokenProgram: secondTokenTokenProgram,
      },
    ];
  } else {
    mintsToCreateAtas = [
      {
        mint: collTokenMint,
        tokenProgram: collReserve!.getLiquidityTokenProgram(),
      },
      {
        mint: debtTokenMint,
        tokenProgram: debtReserve!.getLiquidityTokenProgram(),
      },
      {
        mint: collReserve!.getCTokenMint(),
        tokenProgram: TOKEN_PROGRAM_ID,
      },
    ];
  }

  const atasAndCreateIxns = createAtasIdempotent(owner, mintsToCreateAtas);

  const closeWsolAtaIxns: TransactionInstruction[] = [];
  if (depositTokenIsSol || debtTokenMint.equals(NATIVE_MINT)) {
    const wsolAta = getAssociatedTokenAddress(NATIVE_MINT, owner, false);
    closeWsolAtaIxns.push(createCloseAccountInstruction(wsolAta, owner, owner, [], TOKEN_PROGRAM_ID));
  }

  const budgetIxns = budgetAndPriorityFeeIxs || getComputeBudgetAndPriorityFeeIxns(3000000);

  // TODO: Might be worth removing as it's only needed for Ktokens
  // This is here so that we have enough wsol to repay in case the kAB swapped to sol after estimates is not enough
  const fillWsolAtaIxns: TransactionInstruction[] = [];
  if (debtTokenMint.equals(NATIVE_MINT)) {
    const halfSolBalance = (await market.getConnection().getBalance(owner)) / LAMPORTS_PER_SOL / 2;
    const balanceToWrap = halfSolBalance < 0.1 ? halfSolBalance : 0.1;
    fillWsolAtaIxns.push(
      ...getTransferWsolIxns(
        owner,
        getAssociatedTokenAddressSync(NATIVE_MINT, owner),
        toLamports(balanceToWrap, SOL_DECIMALS).ceil()
      )
    );
  }

  // 2. Prepare the flash borrow and flash repay amounts and ixns
  // We borrow exactly how much we need to repay
  // and repay that + flash amount fee
  const { flashBorrowIxn, flashRepayIxn } = getFlashLoanInstructions({
    borrowIxnIndex: budgetIxns.length + atasAndCreateIxns.length + fillWsolAtaIxns.length,
    walletPublicKey: owner,
    lendingMarketAuthority: market.getLendingMarketAuthority(),
    lendingMarketAddress: market.getAddress(),
    reserve: debtReserve!,
    amountLamports: toLamports(calcs.repayAmount, debtReserve!.stats.decimals),
    destinationAta: debtTokenAta,
    // TODO(referrals): once we support referrals, we will have to replace the placeholder args below:
    referrerAccount: market.programId,
    referrerTokenState: market.programId,
    programId: market.programId,
  });

  // 6. Repay borrowed tokens and Withdraw tokens from reserve that will be swapped to repay flash loan
  const repayAndWithdrawAction = await KaminoAction.buildRepayAndWithdrawTxns(
    market,
    isClosingPosition ? U64_MAX : toLamports(calcs.repayAmount, debtReserve!.stats.decimals).floor().toString(),
    debtTokenMint,
    isClosingPosition
      ? U64_MAX
      : toLamports(calcs.depositTokenWithdrawAmount, collReserve!.stats.decimals).ceil().toString(),
    collTokenMint,
    owner,
    currentSlot,
    obligation,
    0,
    false,
    false, // to be checked and created in a setup tx in the UI (won't be the case for withdraw anyway as this would be created in deposit)
    false, // to be checked and created in a setup tx in the UI (won't be the case for withdraw anyway as this would be created in deposit)
    isClosingPosition,
    referrer,
    { includeScopeRefresh: true, scopeFeed: scopeFeed! }
  );

  const swapInstructions = removeBudgetAndAtaIxns(swapQuoteIxs.swapIxs, []);

  return [
    ...budgetIxns,
    ...atasAndCreateIxns.map((x) => x.createAtaIx),
    ...fillWsolAtaIxns,
    ...[flashBorrowIxn],
    ...repayAndWithdrawAction.setupIxs,
    ...KaminoAction.actionToLendingIxs(repayAndWithdrawAction),
    ...repayAndWithdrawAction.cleanupIxs,
    ...swapInstructions,
    ...[flashRepayIxn],
    ...closeWsolAtaIxns,
  ];
}

export async function getAdjustLeverageSwapInputs<QuoteResponse>({
  owner,
  kaminoMarket,
  debtTokenMint,
  collTokenMint,
  obligation,
  depositedLamports,
  borrowedLamports,
  referrer,
  currentSlot,
  targetLeverage,
  priceCollToDebt,
  priceDebtToColl,
  slippagePct,
  budgetAndPriorityFeeIxs,
  kamino,
  scopeFeed,
  quoteBufferBps,
  isKtoken,
  quoter,
}: AdjustLeverageSwapInputsProps<QuoteResponse>): Promise<{
  swapInputs: SwapInputs;
  initialInputs: AdjustLeverageInitialInputs<QuoteResponse>;
}> {
  const collReserve = kaminoMarket.getReserveByMint(collTokenMint)!;
  const debtReserve = kaminoMarket.getReserveByMint(debtTokenMint)!;
  const deposited = fromLamports(depositedLamports, collReserve.stats.decimals);
  const borrowed = fromLamports(borrowedLamports, debtReserve.stats.decimals);
  const collIsKtoken = await isKtoken(collTokenMint);
  const strategy = collIsKtoken ? (await kamino!.getStrategyByKTokenMint(collTokenMint))! : undefined;

  // Getting current flash loan fee
  const currentLeverage = obligation.refreshedStats.leverage;
  const isDepositViaLeverage = targetLeverage.gte(new Decimal(currentLeverage));
  let flashLoanFee;
  if (isDepositViaLeverage) {
    flashLoanFee = collReserve.getFlashLoanFee() || new Decimal(0);
  } else {
    flashLoanFee = debtReserve.getFlashLoanFee() || new Decimal(0);
  }

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
    const calcs = await adjustDepositLeverageCalcs(
      kaminoMarket,
      owner,
      debtReserve!,
      adjustDepositPosition,
      adjustBorrowPosition,
      priceDebtToColl,
      flashLoanFee,
      slippagePct,
      collIsKtoken
    );

    // Build the repay & withdraw collateral tx to get the number of accounts
    const klendIxs = await buildIncreaseLeverageIxns(
      owner,
      kaminoMarket,
      collTokenMint,
      debtTokenMint,
      obligation,
      referrer,
      currentSlot,
      calcs,
      strategy,
      scopeFeed,
      collIsKtoken,
      {
        preActionIxs: [],
        swapIxs: [],
        lookupTables: [],
      },
      budgetAndPriorityFeeIxs
    );

    const uniqueKlendAccounts = uniqueAccounts(klendIxs);

    const swapInputAmount = toLamports(
      !collIsKtoken ? calcs.borrowAmount : calcs.amountToFlashBorrowDebt,
      debtReserve.stats.decimals
    ).ceil();

    const swapInputsForQuote: SwapInputs = {
      inputAmountLamports: swapInputAmount.mul(new Decimal(1).add(quoteBufferBps.div(FullBPS))),
      inputMint: debtTokenMint,
      outputMint: collTokenMint,
      amountDebtAtaBalance: new Decimal(0), // Only needed for ktokens swaps
    };

    const swapQuote = await quoter(swapInputsForQuote, uniqueKlendAccounts);

    const {
      adjustDepositPosition: adjustDepositPositionQuotePrice,
      adjustBorrowPosition: adjustBorrowPositionQuotePrice,
    } = calcAdjustAmounts({
      currentDepositPosition: deposited,
      currentBorrowPosition: borrowed,
      targetLeverage: targetLeverage,
      priceCollToDebt: new Decimal(1).div(swapQuote.priceAInB),
      flashLoanFee: new Decimal(flashLoanFee),
    });

    const calcsQuotePrice = await adjustDepositLeverageCalcs(
      kaminoMarket,
      owner,
      debtReserve,
      adjustDepositPositionQuotePrice,
      adjustBorrowPositionQuotePrice,
      swapQuote.priceAInB,
      flashLoanFee,
      slippagePct,
      collIsKtoken
    );

    const swapInputAmountQuotePrice = toLamports(
      !collIsKtoken ? calcsQuotePrice.borrowAmount : calcsQuotePrice.amountToFlashBorrowDebt,
      debtReserve.state.liquidity.mintDecimals.toNumber()
    ).ceil();

    let expectedDebtTokenAtaBalance = new Decimal(0);
    if (collIsKtoken) {
      expectedDebtTokenAtaBalance = await getExpectedTokenBalanceAfterBorrow(
        kaminoMarket.getConnection(),
        debtTokenMint,
        owner,
        toLamports(
          !collIsKtoken ? calcsQuotePrice.borrowAmount : calcsQuotePrice.amountToFlashBorrowDebt,
          debtReserve.stats.decimals
        ).floor(),
        debtReserve.state.liquidity.mintDecimals.toNumber()
      );
    }

    return {
      swapInputs: {
        inputAmountLamports: swapInputAmountQuotePrice,
        minOutAmountLamports: toLamports(
          !collIsKtoken ? calcsQuotePrice.adjustDepositPosition : calcsQuotePrice.amountToFlashBorrowDebt,
          !collIsKtoken ? collReserve.stats.decimals : debtReserve!.stats.decimals
        ),
        inputMint: debtTokenMint,
        outputMint: collTokenMint,
        amountDebtAtaBalance: expectedDebtTokenAtaBalance,
      },
      initialInputs: {
        calcs: calcsQuotePrice,
        swapQuote,
        currentSlot,
        collIsKtoken,
        strategy,
        obligation: obligation,
        klendAccounts: uniqueKlendAccounts,
        isDeposit: isDeposit,
      },
    };
  } else {
    const calcs = adjustWithdrawLeverageCalcs(adjustDepositPosition, adjustBorrowPosition, flashLoanFee, slippagePct);

    const klendIxs = await buildDecreaseLeverageIxns(
      owner,
      kaminoMarket,
      collTokenMint,
      debtTokenMint,
      obligation,
      referrer,
      currentSlot,
      calcs,
      strategy,
      scopeFeed,
      collIsKtoken,
      {
        preActionIxs: [],
        swapIxs: [],
        lookupTables: [],
      },
      budgetAndPriorityFeeIxs
    );

    const uniqueKlendAccounts = uniqueAccounts(klendIxs);

    const swapInputAmount = toLamports(
      calcs.withdrawAmountWithSlippageAndFlashLoanFee,
      collReserve.state.liquidity.mintDecimals.toNumber()
    ).ceil();

    const swapInputsForQuote: SwapInputs = {
      inputAmountLamports: swapInputAmount.mul(new Decimal(1).add(quoteBufferBps.div(FullBPS))),
      inputMint: collTokenMint,
      outputMint: debtTokenMint,
      amountDebtAtaBalance: new Decimal(0), // Only needed for ktokens deposits
    };

    const swapQuote = await quoter(swapInputsForQuote, uniqueKlendAccounts);

    const {
      adjustDepositPosition: adjustDepositPositionQuotePrice,
      adjustBorrowPosition: adjustBorrowPositionQuotePrice,
    } = calcAdjustAmounts({
      currentDepositPosition: deposited,
      currentBorrowPosition: borrowed,
      targetLeverage: targetLeverage,
      priceCollToDebt: swapQuote.priceAInB,
      flashLoanFee: new Decimal(flashLoanFee),
    });

    const calcsQuotePrice = adjustWithdrawLeverageCalcs(
      adjustDepositPositionQuotePrice,
      adjustBorrowPositionQuotePrice,
      flashLoanFee,
      slippagePct
    );

    const swapInputAmountQuotePrice = toLamports(
      calcsQuotePrice.withdrawAmountWithSlippageAndFlashLoanFee,
      collReserve.state.liquidity.mintDecimals.toNumber()
    ).ceil();

    return {
      swapInputs: {
        inputAmountLamports: swapInputAmountQuotePrice,
        minOutAmountLamports: toLamports(calcsQuotePrice.adjustBorrowPosition.abs(), debtReserve.stats.decimals),
        inputMint: collTokenMint,
        outputMint: debtTokenMint,
        amountDebtAtaBalance: new Decimal(0), // Only needed for ktokens deposits
      },
      initialInputs: {
        calcs: calcsQuotePrice,
        swapQuote,
        currentSlot,
        collIsKtoken,
        strategy,
        obligation,
        klendAccounts: uniqueKlendAccounts,
        isDeposit,
      },
    };
  }
}

export async function getAdjustLeverageIxns<QuoteResponse>({
  owner,
  kaminoMarket,
  debtTokenMint,
  collTokenMint,
  obligation,
  depositedLamports,
  borrowedLamports,
  referrer,
  currentSlot,
  targetLeverage,
  priceCollToDebt,
  priceDebtToColl,
  slippagePct,
  budgetAndPriorityFeeIxs,
  kamino,
  scopeFeed,
  quoteBufferBps,
  priceAinB,
  isKtoken,
  quoter,
  swapper,
}: AdjustLeverageProps<QuoteResponse>): Promise<AdjustLeverageIxsResponse<QuoteResponse>> {
  const { swapInputs, initialInputs } = await getAdjustLeverageSwapInputs({
    owner,
    kaminoMarket,
    debtTokenMint,
    collTokenMint,
    obligation,
    depositedLamports,
    borrowedLamports,
    referrer,
    currentSlot,
    targetLeverage,
    priceCollToDebt,
    priceDebtToColl,
    slippagePct,
    budgetAndPriorityFeeIxs,
    kamino,
    scopeFeed,
    quoteBufferBps,
    priceAinB,
    isKtoken,
    quoter,
  });

  // leverage increased so we need to deposit and borrow more
  if (initialInputs.isDeposit) {
    let depositSwapper: SwapIxsProvider<QuoteResponse>;

    if (initialInputs.collIsKtoken) {
      if (kamino === undefined) {
        throw Error('Ktoken use as collateral for leverage without Kamino instance');
      }
      depositSwapper = await getTokenToKtokenSwapper(
        kaminoMarket,
        kamino,
        owner,
        slippagePct,
        swapper,
        priceAinB,
        false
      );
    } else {
      depositSwapper = swapper;
    }

    const { swapIxs, lookupTables } = await depositSwapper(
      swapInputs,
      initialInputs.klendAccounts,
      initialInputs.swapQuote
    );

    // TODO: marius why are we not using both adjustDepositPosition & adjustBorrowPosition
    const ixs = await buildIncreaseLeverageIxns(
      owner,
      kaminoMarket,
      collTokenMint,
      debtTokenMint,
      obligation,
      referrer,
      currentSlot,
      initialInputs.calcs,
      initialInputs.strategy,
      scopeFeed,
      initialInputs.collIsKtoken,
      {
        preActionIxs: [],
        swapIxs,
        lookupTables,
      },
      budgetAndPriorityFeeIxs
    );
    return {
      ixs,
      lookupTables,
      swapInputs,
      initialInputs,
    };
  } else {
    console.log('Decreasing leverage');

    let withdrawSwapper: SwapIxsProvider<QuoteResponse>;

    if (initialInputs.collIsKtoken) {
      if (kamino === undefined) {
        throw Error('Ktoken use as collateral for leverage without Kamino instance');
      }
      withdrawSwapper = await getKtokenToTokenSwapper(kaminoMarket, kamino, owner, swapper);
    } else {
      withdrawSwapper = swapper;
    }

    // 5. Get swap ixns
    const { swapIxs, lookupTables } = await withdrawSwapper(
      swapInputs,
      initialInputs.klendAccounts,
      initialInputs.swapQuote
    );

    const ixs = await buildDecreaseLeverageIxns(
      owner,
      kaminoMarket,
      collTokenMint,
      debtTokenMint,
      obligation,
      referrer,
      currentSlot,
      initialInputs.calcs,
      initialInputs.strategy,
      scopeFeed,
      initialInputs.collIsKtoken,
      {
        preActionIxs: [],
        swapIxs,
        lookupTables,
      },
      budgetAndPriorityFeeIxs
    );

    return {
      ixs,
      lookupTables,
      swapInputs,
      initialInputs,
    };
  }
}

/**
 * Deposit and borrow tokens if leverage increased
 */
async function buildIncreaseLeverageIxns(
  owner: PublicKey,
  kaminoMarket: KaminoMarket,
  collTokenMint: PublicKey,
  debtTokenMint: PublicKey,
  obligation: KaminoObligation,
  referrer: PublicKey,
  currentSlot: number,
  calcs: AdjustLeverageCalcsResult,
  strategy: StrategyWithAddress | undefined,
  scopeFeed: string | undefined,
  collIsKtoken: boolean,
  swapQuoteIxs: SwapIxs,
  budgetAndPriorityFeeIxns: TransactionInstruction[] | undefined
): Promise<TransactionInstruction[]> {
  const collReserve = kaminoMarket.getReserveByMint(collTokenMint);
  const debtReserve = kaminoMarket.getReserveByMint(debtTokenMint);
  const debtTokenAta = getAssociatedTokenAddressSync(
    debtTokenMint,
    owner,
    false,
    debtReserve!.getLiquidityTokenProgram()
  );
  const collTokenAta = getAssociatedTokenAddressSync(
    collTokenMint,
    owner,
    false,
    collReserve!.getLiquidityTokenProgram()
  );

  // 1. Create atas & budget txns
  const budgetIxns = budgetAndPriorityFeeIxns || getComputeBudgetAndPriorityFeeIxns(3000000);
  let mintsToCreateAtas: Array<{ mint: PublicKey; tokenProgram: PublicKey }>;
  if (collIsKtoken) {
    const secondTokenAta = strategy!.strategy.tokenAMint.equals(debtTokenMint)
      ? strategy!.strategy.tokenBMint
      : strategy!.strategy.tokenAMint;
    const secondTokenTokenProgarm = strategy?.strategy.tokenAMint.equals(debtTokenMint)
      ? strategy!.strategy.tokenBTokenProgram.equals(PublicKey.default)
        ? TOKEN_PROGRAM_ID
        : strategy!.strategy.tokenBTokenProgram
      : strategy!.strategy.tokenATokenProgram.equals(PublicKey.default)
      ? TOKEN_PROGRAM_ID
      : strategy!.strategy.tokenATokenProgram;
    mintsToCreateAtas = [
      {
        mint: collTokenMint,
        tokenProgram: collReserve!.getLiquidityTokenProgram(),
      },
      {
        mint: debtTokenMint,
        tokenProgram: debtReserve!.getLiquidityTokenProgram(),
      },
      {
        mint: collReserve!.getCTokenMint(),
        tokenProgram: TOKEN_PROGRAM_ID,
      },
      {
        mint: secondTokenAta,
        tokenProgram: secondTokenTokenProgarm,
      },
    ];
  } else {
    mintsToCreateAtas = [
      {
        mint: collTokenMint,
        tokenProgram: collReserve!.getLiquidityTokenProgram(),
      },
      {
        mint: debtTokenMint,
        tokenProgram: debtReserve!.getLiquidityTokenProgram(),
      },
      {
        mint: collReserve!.getCTokenMint(),
        tokenProgram: TOKEN_PROGRAM_ID,
      },
    ];
  }

  const atasAndCreateIxns = createAtasIdempotent(owner, mintsToCreateAtas);

  // 2. Create borrow flash loan instruction
  const { flashBorrowIxn, flashRepayIxn } = getFlashLoanInstructions({
    borrowIxnIndex: budgetIxns.length + atasAndCreateIxns.length, // TODO: how about user metadata ixns
    walletPublicKey: owner,
    lendingMarketAuthority: kaminoMarket.getLendingMarketAuthority(),
    lendingMarketAddress: kaminoMarket.getAddress(),
    reserve: !collIsKtoken ? collReserve! : debtReserve!,
    amountLamports: toLamports(
      !collIsKtoken ? calcs.adjustDepositPosition : calcs.amountToFlashBorrowDebt,
      !collIsKtoken ? collReserve!.stats.decimals : debtReserve!.stats.decimals
    ),
    destinationAta: !collIsKtoken ? collTokenAta : debtTokenAta,
    // TODO(referrals): once we support referrals, we will have to replace the placeholder args below:
    referrerAccount: kaminoMarket.programId,
    referrerTokenState: kaminoMarket.programId,
    programId: kaminoMarket.programId,
  });

  const depositAction = await KaminoAction.buildDepositTxns(
    kaminoMarket,
    toLamports(calcs.adjustDepositPosition, collReserve!.stats.decimals).floor().toString(),
    collTokenMint,
    owner,
    obligation,
    0,
    false,
    false,
    false, // to be checked and create in a setup tx in the UI (won't be the case for adjust anyway as this would be created in deposit)
    false, // to be checked and create in a setup tx in the UI (won't be the case for adjust anyway as this would be created in deposit)
    referrer,
    currentSlot,
    { includeScopeRefresh: true, scopeFeed: scopeFeed! }
  );

  // 4. Borrow tokens in borrow token reserve that will be swapped to repay flash loan
  const borrowAction = await KaminoAction.buildBorrowTxns(
    kaminoMarket,
    toLamports(calcs.borrowAmount, debtReserve!.stats.decimals).ceil().toString(),
    debtTokenMint,
    owner,
    obligation,
    0,
    false,
    false,
    false, // to be checked and create in a setup tx in the UI (won't be the case for adjust anyway as this would be created in deposit)
    false, // to be checked and create in a setup tx in the UI (won't be the case for adjust anyway as this would be created in deposit)
    referrer,
    currentSlot,
    { includeScopeRefresh: true, scopeFeed: scopeFeed! }
  );

  const swapInstructions = removeBudgetAndAtaIxns(swapQuoteIxs.swapIxs, []);

  const ixs = !collIsKtoken
    ? [
        ...budgetIxns,
        ...atasAndCreateIxns.map((x) => x.createAtaIx),
        ...[flashBorrowIxn],
        ...depositAction.setupIxs,
        ...depositAction.lendingIxs,
        ...depositAction.cleanupIxs,
        ...borrowAction.setupIxs,
        ...borrowAction.lendingIxs,
        ...borrowAction.cleanupIxs,
        ...swapInstructions,
        ...[flashRepayIxn],
      ]
    : [
        ...budgetIxns,
        ...atasAndCreateIxns.map((x) => x.createAtaIx),
        ...[flashBorrowIxn],
        ...swapInstructions,
        ...depositAction.setupIxs,
        ...depositAction.lendingIxs,
        ...depositAction.cleanupIxs,
        ...borrowAction.setupIxs,
        ...borrowAction.lendingIxs,
        ...borrowAction.cleanupIxs,
        ...[flashRepayIxn],
      ];

  return ixs;
}

/**
 * Withdraw and repay tokens if leverage decreased
 */
async function buildDecreaseLeverageIxns(
  owner: PublicKey,
  kaminoMarket: KaminoMarket,
  collTokenMint: PublicKey,
  debtTokenMint: PublicKey,
  obligation: KaminoObligation,
  referrer: PublicKey,
  currentSlot: number,
  calcs: AdjustLeverageCalcsResult,
  strategy: StrategyWithAddress | undefined,
  scopeFeed: string | undefined,
  collIsKtoken: boolean,
  swapQuoteIxs: SwapIxs,
  budgetAndPriorityFeeIxns: TransactionInstruction[] | undefined
): Promise<TransactionInstruction[]> {
  const collReserve = kaminoMarket.getReserveByMint(collTokenMint);
  const debtReserve = kaminoMarket.getReserveByMint(debtTokenMint);
  const debtTokenAta = getAssociatedTokenAddressSync(
    debtTokenMint,
    owner,
    false,
    debtReserve!.getLiquidityTokenProgram()
  );

  // 1. Create atas & budget txns
  const budgetIxns = budgetAndPriorityFeeIxns || getComputeBudgetAndPriorityFeeIxns(3000000);
  let mintsToCreateAtas: Array<{ mint: PublicKey; tokenProgram: PublicKey }>;
  if (collIsKtoken) {
    const secondTokenAta = strategy!.strategy.tokenAMint.equals(debtTokenMint)
      ? strategy!.strategy.tokenBMint
      : strategy!.strategy.tokenAMint;
    const secondTokenTokenProgarm = strategy?.strategy.tokenAMint.equals(debtTokenMint)
      ? strategy!.strategy.tokenBTokenProgram.equals(PublicKey.default)
        ? TOKEN_PROGRAM_ID
        : strategy!.strategy.tokenBTokenProgram
      : strategy!.strategy.tokenATokenProgram.equals(PublicKey.default)
      ? TOKEN_PROGRAM_ID
      : strategy!.strategy.tokenATokenProgram;
    mintsToCreateAtas = [
      {
        mint: collTokenMint,
        tokenProgram: collReserve!.getLiquidityTokenProgram(),
      },
      {
        mint: debtTokenMint,
        tokenProgram: debtReserve!.getLiquidityTokenProgram(),
      },
      {
        mint: collReserve!.getCTokenMint(),
        tokenProgram: TOKEN_PROGRAM_ID,
      },
      {
        mint: secondTokenAta,
        tokenProgram: secondTokenTokenProgarm,
      },
    ];
  } else {
    mintsToCreateAtas = [
      {
        mint: collTokenMint,
        tokenProgram: collReserve!.getLiquidityTokenProgram(),
      },
      {
        mint: debtTokenMint,
        tokenProgram: debtReserve!.getLiquidityTokenProgram(),
      },
      {
        mint: collReserve!.getCTokenMint(),
        tokenProgram: TOKEN_PROGRAM_ID,
      },
    ];
  }
  const atasAndCreateIxns = createAtasIdempotent(owner, mintsToCreateAtas);

  // TODO: Mihai/Marius check if we can improve this logic and not convert any SOL
  // This is here so that we have enough wsol to repay in case the kAB swapped to sol after estimates is not enough
  const closeWsolAtaIxns: TransactionInstruction[] = [];
  const fillWsolAtaIxns: TransactionInstruction[] = [];
  if (debtTokenMint.equals(NATIVE_MINT)) {
    const wsolAta = getAssociatedTokenAddress(NATIVE_MINT, owner, false);

    closeWsolAtaIxns.push(createCloseAccountInstruction(wsolAta, owner, owner, [], TOKEN_PROGRAM_ID));

    const halfSolBalance = (await kaminoMarket.getConnection().getBalance(owner)) / LAMPORTS_PER_SOL / 2;
    const balanceToWrap = halfSolBalance < 0.1 ? halfSolBalance : 0.1;
    fillWsolAtaIxns.push(
      ...getTransferWsolIxns(owner, wsolAta, toLamports(balanceToWrap, debtReserve!.stats.decimals).ceil())
    );
  }

  // 3. Flash borrow & repay amount to repay (debt)
  const { flashBorrowIxn, flashRepayIxn } = getFlashLoanInstructions({
    borrowIxnIndex: budgetIxns.length + atasAndCreateIxns.length + fillWsolAtaIxns.length,
    walletPublicKey: owner,
    lendingMarketAuthority: kaminoMarket.getLendingMarketAuthority(),
    lendingMarketAddress: kaminoMarket.getAddress(),
    reserve: debtReserve!,
    amountLamports: toLamports(Decimal.abs(calcs.adjustBorrowPosition), debtReserve!.stats.decimals),
    destinationAta: debtTokenAta,
    // TODO(referrals): once we support referrals, we will have to replace the placeholder args below:
    referrerAccount: kaminoMarket.programId,
    referrerTokenState: kaminoMarket.programId,
    programId: kaminoMarket.programId,
  });

  // 4. Actually do the repay of the flash borrowed amounts
  const scopeRefresh = scopeFeed ? { includeScopeRefresh: true, scopeFeed: scopeFeed } : undefined;
  const repayAction = await KaminoAction.buildRepayTxns(
    kaminoMarket,
    toLamports(Decimal.abs(calcs.adjustBorrowPosition), debtReserve!.stats.decimals).floor().toString(),
    debtTokenMint,
    owner,
    obligation,
    currentSlot,
    undefined,
    0,
    false,
    false,
    false, // to be checked and create in a setup tx in the UI (won't be the case for adjust anyway as this would be created in deposit)
    false, // to be checked and create in a setup tx in the UI (won't be the case for adjust anyway as this would be created in deposit)
    referrer,
    scopeRefresh
  );

  // 6. Withdraw collateral (a little bit more to be able to pay for the slippage on swap)
  const withdrawAction = await KaminoAction.buildWithdrawTxns(
    kaminoMarket,
    toLamports(calcs.withdrawAmountWithSlippageAndFlashLoanFee, collReserve!.stats.decimals).ceil().toString(),
    collTokenMint,
    owner,
    obligation,
    0,
    false,
    false,
    false, // to be checked and create in a setup tx in the UI (won't be the case for adjust anyway as this would be created in deposit)
    false, // to be checked and create in a setup tx in the UI (won't be the case for adjust anyway as this would be created in deposit)
    referrer,
    currentSlot,
    { includeScopeRefresh: true, scopeFeed: scopeFeed! }
  );

  const swapInstructions = removeBudgetAndAtaIxns(swapQuoteIxs.swapIxs, []);

  const ixns = [
    ...budgetIxns,
    ...atasAndCreateIxns.map((x) => x.createAtaIx),
    ...fillWsolAtaIxns,
    ...[flashBorrowIxn],
    ...repayAction.setupIxs,
    ...repayAction.lendingIxs,
    ...repayAction.cleanupIxs,
    ...withdrawAction.setupIxs,
    ...withdrawAction.lendingIxs,
    ...withdrawAction.cleanupIxs,
    ...swapInstructions,
    ...[flashRepayIxn],
    ...closeWsolAtaIxns,
  ];

  return ixns;
}
