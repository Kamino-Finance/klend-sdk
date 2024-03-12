import { Connection, LAMPORTS_PER_SOL, PublicKey, TransactionInstruction } from '@solana/web3.js';
import Decimal from 'decimal.js';
import { KaminoAction, KaminoMarket, KaminoObligation, lamportsToNumberDecimal as fromLamports } from '../classes';
import { getFlashLoanInstructions } from './instructions';

import { numberToLamportsDecimal as toLamports } from '../classes';
import {
  LeverageObligation,
  MultiplyObligation,
  ObligationType,
  ObligationTypeTag,
  U64_MAX,
  WRAPPED_SOL_MINT,
  getAssociatedTokenAddress,
  getAtasWithCreateIxnsIfMissing,
  getComputeBudgetAndPriorityFeeIxns,
  getDepositWsolIxns,
  removeBudgetAndAtaIxns,
} from '../utils';
import { calcAdjustAmounts, calcWithdrawAmounts, simulateMintKToken, toJson } from './calcs';
import { TOKEN_PROGRAM_ID, Token } from '@solana/spl-token';
import { Kamino, InstructionsWithLookupTables, StrategyWithAddress, TokenAmounts } from '@hubbleprotocol/kamino-sdk';
import { getExpectedTokenBalanceAfterBorrow, getKtokenToTokenSwapper, getTokenToKtokenSwapper } from './utils';

export type SwapIxnsProvider = (
  amountInLamports: number,
  amountInMint: PublicKey,
  amountOutMint: PublicKey,
  slippagePct: number,
  amountDebtAtaBalance?: Decimal
) => Promise<[TransactionInstruction[], PublicKey[]]>;

export type PriceAinBProvider = (mintA: PublicKey, mintB: PublicKey) => Promise<Decimal>;

export type IsKtokenProvider = (token: PublicKey | string) => Promise<boolean>;

export type SwapInputs = {
  inputAmountLamports: number;
  inputMint: PublicKey;
  outputMint: PublicKey;
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

export const depositLeverageCalcs = (props: {
  depositAmount: Decimal;
  depositTokenIsCollToken: boolean;
  depositTokenIsSol: boolean;
  priceDebtToColl: Decimal;
  targetLeverage: Decimal;
  slippagePct: Decimal;
  flashLoanFee: Decimal;
}): {
  flashBorrowInCollToken: Decimal;
  initDepositInSol: Decimal;
  debtTokenToBorrow: Decimal;
  collTokenToDeposit: Decimal;
  swapDebtTokenIn: Decimal;
  swapCollTokenExpectedOut: Decimal;
} => {
  // Initialize local variables from the props object
  const {
    depositAmount,
    depositTokenIsCollToken,
    depositTokenIsSol,
    priceDebtToColl,
    targetLeverage,
    slippagePct,
    flashLoanFee,
  } = props;
  const slippage = slippagePct.div('100');

  const initDepositInSol = depositTokenIsSol ? depositAmount : new Decimal(0);

  // Core logic
  if (depositTokenIsCollToken) {
    const y = targetLeverage.mul(priceDebtToColl);
    const x = flashLoanFee.add('1').mul(slippage.add('1')).div(priceDebtToColl);
    const finalColl = depositAmount.mul(x).div(x.sub(targetLeverage.sub('1').div(y)));
    const debt = finalColl.sub(depositAmount).mul(x);
    const flashBorrowColl = finalColl.sub(depositAmount).mul(flashLoanFee.add('1'));

    return {
      flashBorrowInCollToken: flashBorrowColl,
      initDepositInSol,
      debtTokenToBorrow: debt,
      collTokenToDeposit: finalColl,
      swapDebtTokenIn: debt,
      swapCollTokenExpectedOut: finalColl.sub(depositAmount),
    };
  } else {
    const y = targetLeverage.mul(priceDebtToColl);
    const x = flashLoanFee.add('1').mul(slippage.add('1')).div(priceDebtToColl);
    const finalColl = depositAmount.div(x.sub(targetLeverage.sub('1').div(y)));
    const flashBorrowColl = finalColl.mul(flashLoanFee.add('1'));
    const debt = targetLeverage.sub('1').mul(finalColl).div(y);

    return {
      flashBorrowInCollToken: flashBorrowColl,
      initDepositInSol,
      debtTokenToBorrow: debt,
      collTokenToDeposit: finalColl,
      swapDebtTokenIn: debt.add(depositAmount),
      swapCollTokenExpectedOut: finalColl,
    };
  }
};

export const depositLeverageKtokenCalcs = async (props: {
  kamino: Kamino;
  strategy: StrategyWithAddress;
  debtTokenMint: PublicKey;
  depositAmount: Decimal;
  depositTokenIsCollToken: boolean;
  depositTokenIsSol: boolean;
  priceDebtToColl: Decimal;
  targetLeverage: Decimal;
  slippagePct: Decimal;
  flashLoanFee: Decimal;
  priceAinB: PriceAinBProvider;
  strategyHoldings?: TokenAmounts;
}): Promise<{
  flashBorrowInDebtToken: Decimal;
  initDepositInSol: Decimal;
  collTokenToDeposit: Decimal;
  debtTokenToBorrow: Decimal; // debtTokenToBorrow = flashBorrowInDebtToken + flashLoanFee
  requiredCollateral: Decimal;
  singleSidedDeposit: Decimal;
}> => {
  const {
    kamino,
    strategy,
    debtTokenMint,
    depositAmount,
    depositTokenIsCollToken,
    depositTokenIsSol,
    priceDebtToColl,
    targetLeverage,
    slippagePct,
    flashLoanFee,
    priceAinB,
    strategyHoldings,
  } = props;
  const initDepositInSol = depositTokenIsSol ? depositAmount : new Decimal(0);
  const slippage = slippagePct.div('100');

  let flashBorrowInDebtToken: Decimal;
  let collTokenToDeposit: Decimal;
  let debtTokenToBorrow: Decimal;

  if (depositTokenIsCollToken) {
    const x = slippage.add('1').div(priceDebtToColl);
    const y = flashLoanFee.add('1').mul(priceDebtToColl);
    const z = targetLeverage.mul(y).div(targetLeverage.sub(1));
    flashBorrowInDebtToken = depositAmount.div(z.minus(new Decimal(1).div(x)));
    collTokenToDeposit = depositAmount.add(flashBorrowInDebtToken.div(x));
    debtTokenToBorrow = flashBorrowInDebtToken.mul(new Decimal(1).add(flashLoanFee));

    return {
      flashBorrowInDebtToken,
      initDepositInSol,
      collTokenToDeposit,
      debtTokenToBorrow,
      requiredCollateral: collTokenToDeposit.sub(depositAmount), // Assuming netValue is requiredCollateral, adjust as needed
      singleSidedDeposit: flashBorrowInDebtToken,
    };
  } else {
    const y = targetLeverage.mul(priceDebtToColl);
    // although we will only swap ~half of the debt token, we account for the slippage on the entire amount as we are working backwards from the minimum collateral and do not know the exact swap proportion in advance
    // This also allows for some variation in the pool ratios between calculation + submitting the tx
    const x = flashLoanFee.add('1').mul(slippage.add('1')).div(priceDebtToColl);
    // Calculate the amount of collateral tokens we will deposit in order to achieve the desired leverage after swapping a portion of the debt token and flash loan fees
    const finalColl = depositAmount.div(x.sub(targetLeverage.sub('1').div(y)));
    // Calculate how many A and B tokens we will need to actually mint the desired amount of ktoken collateral
    // The actual amount of ktokens received may be less than the finalColl due to smart proportional contract logic
    // So we use the actualColl as the amount we will deposit
    const [estimatedA, estimatedB, actualColl] = await simulateMintKToken(
      kamino!,
      strategy!,
      finalColl,
      strategyHoldings
    );
    const pxAinB = await priceAinB(strategy!.strategy.tokenAMint, strategy!.strategy.tokenBMint);
    const isTokenADeposit = strategy.strategy.tokenAMint.equals(debtTokenMint);
    // Calculate the amount we need to flash borrow by combining value of A and B into the debt token
    const singleSidedDepositAmount = isTokenADeposit
      ? estimatedA.add(estimatedB.div(pxAinB))
      : estimatedB.add(estimatedA.mul(pxAinB));

    // Add slippage to the entire amount, add flash loan fee to part we will flash borrow
    flashBorrowInDebtToken = singleSidedDepositAmount
      .div(new Decimal('1').sub(slippage))
      .sub(depositAmount)
      .div(new Decimal('1').sub(flashLoanFee));
    // Deposit the min ktoken amount we calculated at the beginning
    // Any slippage will be left in the user's wallet as ktokens
    collTokenToDeposit = actualColl;
    debtTokenToBorrow = flashBorrowInDebtToken.div(new Decimal('1').sub(flashLoanFee));
    // Add slippage to ensure we try to swap/deposit as much as possible after flash loan fees
    const singleSidedDeposit = singleSidedDepositAmount.div(new Decimal('1').sub(slippage));

    return {
      flashBorrowInDebtToken,
      initDepositInSol,
      collTokenToDeposit,
      debtTokenToBorrow,
      requiredCollateral: collTokenToDeposit, // Assuming collTokenToDeposit is requiredCollateral, adjust as needed
      singleSidedDeposit,
    };
  }
};

export const getDepositWithLeverageSwapInputs = (props: {
  depositAmount: Decimal;
  priceDebtToColl: Decimal;
  slippagePct: Decimal;
  targetLeverage: Decimal;
  kaminoMarket: KaminoMarket;
  selectedTokenMint: PublicKey;
  debtTokenMint: PublicKey;
  collTokenMint: PublicKey;
}): {
  swapInputs: SwapInputs;
} => {
  const {
    depositAmount,
    priceDebtToColl,
    slippagePct,
    targetLeverage,
    kaminoMarket,
    selectedTokenMint,
    debtTokenMint,
    collTokenMint,
  } = props;
  const debtReserve = kaminoMarket.getReserveByMint(debtTokenMint);
  const selectedTokenIsCollToken = selectedTokenMint.equals(collTokenMint);
  const solTokenReserve = kaminoMarket.getReserveByMint(WRAPPED_SOL_MINT);
  const depositTokenIsSol = !solTokenReserve ? false : selectedTokenMint.equals(solTokenReserve!.getLiquidityMint());
  const flashLoanFee = debtReserve?.getFlashLoanFee() || new Decimal(0);

  const calcs = depositLeverageCalcs({
    depositAmount,
    depositTokenIsCollToken: selectedTokenIsCollToken,
    depositTokenIsSol,
    priceDebtToColl,
    targetLeverage,
    slippagePct,
    flashLoanFee,
  });

  return {
    swapInputs: {
      inputAmountLamports: toLamports(calcs.swapDebtTokenIn, debtReserve!.state.liquidity.mintDecimals.toNumber())
        .ceil()
        .toNumber(),
      inputMint: debtTokenMint,
      outputMint: collTokenMint,
    },
  };
};

export const getDepositWithLeverageIxns = async (props: {
  connection: Connection;
  budgetAndPriorityFeeIxns?: TransactionInstruction[];
  user: PublicKey;
  amount: Decimal;
  selectedTokenMint: PublicKey;
  collTokenMint: PublicKey;
  debtTokenMint: PublicKey;
  targetLeverage: Decimal;
  kaminoMarket: KaminoMarket;
  slippagePct: Decimal;
  priceDebtToColl: Decimal;
  swapper: SwapIxnsProvider;
  referrer: PublicKey;
  isKtoken: IsKtokenProvider;
  priceAinB: PriceAinBProvider;
  kamino: Kamino | undefined;
  obligationTypeTagOverride: ObligationTypeTag;
  obligation: KaminoObligation | null;
}): Promise<{ ixns: TransactionInstruction[]; lookupTablesAddresses: PublicKey[]; swapInputs: SwapInputs }> => {
  const {
    connection,
    budgetAndPriorityFeeIxns,
    user,
    amount,
    selectedTokenMint,
    collTokenMint,
    debtTokenMint,
    targetLeverage,
    kaminoMarket,
    slippagePct,
    priceDebtToColl,
    swapper,
    referrer,
    isKtoken,
    priceAinB,
    kamino,
    obligationTypeTagOverride = 1,
    obligation,
  } = props;
  const collReserve = kaminoMarket.getReserveByMint(collTokenMint);
  const debtReserve = kaminoMarket.getReserveByMint(debtTokenMint);
  const solTokenReserve = kaminoMarket.getReserveByMint(WRAPPED_SOL_MINT);
  const flashLoanFee = collReserve?.getFlashLoanFee() || new Decimal(0);

  const selectedTokenIsCollToken = selectedTokenMint.equals(collTokenMint);
  const depositTokenIsSol = !solTokenReserve ? false : selectedTokenMint.equals(solTokenReserve!.getLiquidityMint());

  const collIsKtoken = await isKtoken(collTokenMint);
  const strategy = collIsKtoken ? (await kamino!.getStrategyByKTokenMint(collTokenMint))! : undefined;

  const calcs = depositLeverageCalcs({
    depositAmount: amount,
    depositTokenIsCollToken: selectedTokenIsCollToken,
    depositTokenIsSol,
    priceDebtToColl,
    targetLeverage,
    slippagePct,
    flashLoanFee,
  });
  let calcsKtoken;
  if (collIsKtoken) {
    calcsKtoken = await depositLeverageKtokenCalcs({
      kamino: kamino!,
      strategy: strategy!,
      debtTokenMint,
      depositAmount: amount,
      depositTokenIsCollToken: selectedTokenIsCollToken,
      depositTokenIsSol,
      priceDebtToColl,
      targetLeverage,
      slippagePct,
      flashLoanFee,
      priceAinB,
    });
    // Rounding to exact number of decimals so this value is passed through in all calcs without rounding inconsistencies
    calcsKtoken.flashBorrowInDebtToken = calcsKtoken.flashBorrowInDebtToken.toDecimalPlaces(
      debtReserve?.state.liquidity.mintDecimals.toNumber()!,
      Decimal.ROUND_CEIL
    );
    calcsKtoken.debtTokenToBorrow = calcsKtoken.debtTokenToBorrow.toDecimalPlaces(
      debtReserve?.state.liquidity.mintDecimals.toNumber()!,
      Decimal.ROUND_CEIL
    );
    calcsKtoken.singleSidedDeposit = calcsKtoken.singleSidedDeposit.toDecimalPlaces(
      debtReserve?.state.liquidity.mintDecimals.toNumber()!,
      Decimal.ROUND_CEIL
    );
  }

  console.log('Ops Calcs', toJson(!collIsKtoken ? calcs : calcsKtoken));
  console.log(
    'Infos',
    toJson({
      depositTokenIsSol,
      selectedTokenIsCollToken,
      initDepositInSol: calcs.initDepositInSol,
    })
  );

  // // 1. Create atas & budget txns
  let mintsToCreateAtas: PublicKey[] = [];
  if (collIsKtoken) {
    const secondTokenAta = strategy!.strategy.tokenAMint.equals(debtTokenMint)
      ? strategy!.strategy.tokenBMint!
      : strategy!.strategy.tokenAMint!;
    mintsToCreateAtas = [collTokenMint, debtTokenMint, collReserve!.getCTokenMint(), secondTokenAta];
  } else {
    mintsToCreateAtas = [collTokenMint, debtTokenMint, collReserve!.getCTokenMint()];
  }

  const budgetIxns = budgetAndPriorityFeeIxns || getComputeBudgetAndPriorityFeeIxns(3000000);
  const {
    atas: [collTokenAta, debtTokenAta],
    createAtasIxns,
    closeAtasIxns,
  } = await getAtasWithCreateIxnsIfMissing(connection, user, mintsToCreateAtas);

  // TODO: this needs to work the other way around also
  // TODO: marius test this with shorting leverage and with leverage looping
  const fillWsolAtaIxns: TransactionInstruction[] = [];
  if (depositTokenIsSol) {
    fillWsolAtaIxns.push(
      ...getDepositWsolIxns(
        user,
        selectedTokenIsCollToken ? collTokenAta : debtTokenAta,
        toLamports(calcs.initDepositInSol, solTokenReserve!.stats.decimals).ceil()
      )
    );
  }

  // 1. Flash borrow & repay the collateral amount needed for given leverage
  // if user deposits coll, then we borrow the diff, else we borrow the entire amount
  const { flashBorrowIxn, flashRepayIxn } = getFlashLoanInstructions({
    borrowIxnIndex: budgetIxns.length + createAtasIxns.length + fillWsolAtaIxns.length,
    walletPublicKey: user,
    lendingMarketAuthority: kaminoMarket.getLendingMarketAuthority(),
    lendingMarketAddress: kaminoMarket.getAddress(),
    reserve: !collIsKtoken ? collReserve! : debtReserve!,
    amountLamports: toLamports(
      !collIsKtoken ? calcs.flashBorrowInCollToken : calcsKtoken.flashBorrowInDebtToken,
      !collIsKtoken ? collReserve!.stats.decimals : debtReserve!.stats.decimals
    ),
    destinationAta: !collIsKtoken ? collTokenAta : debtTokenAta,
    referrerAccount: kaminoMarket.programId,
    referrerTokenState: kaminoMarket.programId,
  });

  console.log(
    'Borrowing: ',
    toLamports(!collIsKtoken ? calcs.debtTokenToBorrow : calcsKtoken.debtTokenToBorrow, debtReserve!.stats.decimals)
      .ceil()
      .toString()
  );
  // 3. Deposit initial tokens + borrowed tokens into reserve
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

  const kaminoDepositAndBorrowAction = await KaminoAction.buildDepositAndBorrowTxns(
    kaminoMarket,
    toLamports(!collIsKtoken ? calcs.collTokenToDeposit : calcsKtoken.collTokenToDeposit, collReserve!.stats.decimals)
      .floor()
      .toString(),
    collTokenMint,
    toLamports(!collIsKtoken ? calcs.debtTokenToBorrow : calcsKtoken.debtTokenToBorrow, debtReserve!.stats.decimals)
      .ceil()
      .toString(),
    debtTokenMint,
    user,
    obligation ? obligation : obligationType,
    0,
    false,
    true, // emode
    false, // to be checked and created in a setup tx in the UI
    referrer
  );

  console.log(
    'Expected to swap in',
    !collIsKtoken ? calcs.swapDebtTokenIn.toNumber().toString() : calcsKtoken.singleSidedDeposit.toNumber().toString(),
    'debt for',
    !collIsKtoken ? calcs.swapCollTokenExpectedOut.toString() : calcsKtoken.requiredCollateral.toNumber().toString(),
    'coll'
  );

  let depositSwapper: SwapIxnsProvider;
  let expectedDebtTokenAtaBalance: Decimal = new Decimal(0); // only needed for kTokens

  if (!collIsKtoken) {
    depositSwapper = swapper;
  } else {
    if (kamino === undefined) {
      throw Error('Ktoken use as collateral for leverage without Kamino instance');
    }
    depositSwapper = await getTokenToKtokenSwapper(connection, kaminoMarket, kamino, user, swapper, priceAinB, false);

    let futureBalanceInAta = new Decimal(0);
    if (debtTokenMint.equals(WRAPPED_SOL_MINT)) {
      futureBalanceInAta = futureBalanceInAta.add(
        !collIsKtoken ? calcs.initDepositInSol : calcsKtoken.initDepositInSol
      );
    }
    futureBalanceInAta = futureBalanceInAta.add(
      !collIsKtoken ? calcs.debtTokenToBorrow : calcsKtoken.flashBorrowInDebtToken
    );
    expectedDebtTokenAtaBalance = await getExpectedTokenBalanceAfterBorrow(
      connection,
      debtTokenMint,
      user,
      toLamports(futureBalanceInAta.toDecimalPlaces(debtReserve!.stats.decimals), debtReserve!.stats.decimals),
      debtReserve!.state.liquidity.mintDecimals.toNumber()
    );
  }

  const swapInputs: SwapInputs = {
    inputAmountLamports: toLamports(
      !collIsKtoken ? calcs.swapDebtTokenIn : calcsKtoken.singleSidedDeposit,
      debtReserve!.stats.decimals
    )
      .ceil()
      .toNumber(),
    inputMint: debtTokenMint,
    outputMint: collTokenMint,
  };

  const [swapIxns, lookupTablesAddresses] = await depositSwapper(
    swapInputs.inputAmountLamports,
    swapInputs.inputMint,
    swapInputs.outputMint,
    slippagePct.toNumber(),
    expectedDebtTokenAtaBalance
  );

  if (collIsKtoken) {
    if (strategy?.strategy.strategyLookupTable) {
      lookupTablesAddresses.push(strategy?.strategy.strategyLookupTable!);
    } else {
      console.log('Strategy lookup table not found');
    }
  }

  const swapInstructions = removeBudgetAndAtaIxns(swapIxns, []);

  if (!collIsKtoken) {
    return {
      ixns: [
        ...budgetIxns,
        ...createAtasIxns,
        ...fillWsolAtaIxns,
        ...[flashBorrowIxn],
        ...kaminoDepositAndBorrowAction.setupIxs,
        ...[kaminoDepositAndBorrowAction.lendingIxs[0]],
        ...kaminoDepositAndBorrowAction.inBetweenIxs,
        ...[kaminoDepositAndBorrowAction.lendingIxs[1]],
        ...kaminoDepositAndBorrowAction.cleanupIxs,
        ...swapInstructions,
        ...[flashRepayIxn],
        ...closeAtasIxns,
      ],
      lookupTablesAddresses,
      swapInputs,
    };
  } else {
    return {
      ixns: [
        ...budgetIxns,
        ...createAtasIxns,
        ...fillWsolAtaIxns,
        ...[flashBorrowIxn],
        ...swapInstructions,
        ...kaminoDepositAndBorrowAction.setupIxs,
        ...[kaminoDepositAndBorrowAction.lendingIxs[0]],
        ...kaminoDepositAndBorrowAction.inBetweenIxs,
        ...[kaminoDepositAndBorrowAction.lendingIxs[1]],
        ...kaminoDepositAndBorrowAction.cleanupIxs,
        ...[flashRepayIxn],
        ...closeAtasIxns,
      ],
      lookupTablesAddresses,
      swapInputs,
    };
  }
};

export const getWithdrawWithLeverageSwapInputs = (props: {
  amount: Decimal;
  deposited: Decimal;
  borrowed: Decimal;
  priceCollToDebt: Decimal;
  slippagePct: number;
  isClosingPosition: boolean;
  kaminoMarket: KaminoMarket;
  selectedTokenMint: PublicKey;
  debtTokenMint: PublicKey;
  collTokenMint: PublicKey;
  userObligation: KaminoObligation;
  currentSlot: number;
}): {
  swapInputs: SwapInputs;
} => {
  const {
    amount,
    deposited,
    borrowed,
    priceCollToDebt,
    slippagePct,
    isClosingPosition,
    kaminoMarket,
    selectedTokenMint,
    debtTokenMint,
    collTokenMint,
    userObligation,
    currentSlot,
  } = props;
  const collReserve = kaminoMarket.getReserveByMint(collTokenMint);
  const debtReserve = kaminoMarket.getReserveByMint(debtTokenMint);
  const flashLoanFee = debtReserve?.getFlashLoanFee() || new Decimal(0);
  const selectedTokenIsCollToken = selectedTokenMint.equals(collTokenMint);

  const { adjustDepositPosition: withdrawAmount, adjustBorrowPosition: initialRepayAmount } = isClosingPosition
    ? { adjustDepositPosition: deposited, adjustBorrowPosition: borrowed }
    : calcWithdrawAmounts({
        collTokenMint: collTokenMint,
        priceCollToDebt: new Decimal(priceCollToDebt),
        currentDepositPosition: fromLamports(deposited, collReserve!.stats.decimals),
        currentBorrowPosition: fromLamports(borrowed, debtReserve!.stats.decimals),
        withdrawAmount: new Decimal(amount),
        selectedTokenMint: selectedTokenMint,
      });

  const irSlippageBpsForDebt = userObligation
    .estimateObligationInterestRate(debtReserve!, userObligation.state.borrows[0]!, currentSlot)
    .toDecimalPlaces(debtReserve?.state.liquidity.mintDecimals.toNumber()!, Decimal.ROUND_CEIL);

  const repayAmount = initialRepayAmount
    .mul(irSlippageBpsForDebt.add('0.1').div('10_000').add('1'))
    .toDecimalPlaces(debtReserve?.state.liquidity.mintDecimals.toNumber()!, Decimal.ROUND_CEIL);

  const swapAmountIfWithdrawingColl = repayAmount
    .mul(new Decimal(1).plus(flashLoanFee))
    .mul(new Decimal(1 + slippagePct / 100))
    .div(priceCollToDebt);

  const swapAmountIfWithdrawingDebt = withdrawAmount;

  const collTokenSwapIn = selectedTokenIsCollToken ? swapAmountIfWithdrawingColl : swapAmountIfWithdrawingDebt;

  return {
    swapInputs: {
      inputAmountLamports: toLamports(collTokenSwapIn, collReserve!.state.liquidity.mintDecimals.toNumber())
        .ceil()
        .toNumber(),
      inputMint: collTokenMint,
      outputMint: debtTokenMint,
    },
  };
};

export const getWithdrawWithLeverageIxns = async (props: {
  connection: Connection;
  budgetAndPriorityFeeIxns: TransactionInstruction[];
  user: PublicKey;
  amount: Decimal;
  deposited: Decimal;
  borrowed: Decimal;
  collTokenMint: PublicKey;
  debtTokenMint: PublicKey;
  priceCollToDebt: Decimal;
  selectedTokenMint: PublicKey;
  isClosingPosition: boolean;
  kaminoMarket: KaminoMarket;
  slippagePct: number;
  swapper: SwapIxnsProvider;
  referrer: PublicKey;
  isKtoken: IsKtokenProvider;
  kamino: Kamino | undefined;
  obligationTypeTagOverride: ObligationTypeTag;
  obligation: KaminoObligation | null;
}): Promise<{ ixns: TransactionInstruction[]; lookupTablesAddresses: PublicKey[]; swapInputs: SwapInputs }> => {
  const {
    connection,
    budgetAndPriorityFeeIxns,
    user,
    amount,
    deposited,
    borrowed,
    collTokenMint,
    debtTokenMint,
    priceCollToDebt,
    selectedTokenMint,
    isClosingPosition,
    kaminoMarket,
    slippagePct,
    swapper,
    referrer,
    isKtoken,
    kamino,
    obligationTypeTagOverride,
    obligation,
  } = props;

  const collReserve = kaminoMarket.getReserveByMint(collTokenMint);
  const debtReserve = kaminoMarket.getReserveByMint(debtTokenMint);
  const flashLoanFee = debtReserve?.getFlashLoanFee() || new Decimal(0);
  const collIsKtoken = await isKtoken(collTokenMint);

  const solTokenReserve = kaminoMarket.getReserveByMint(WRAPPED_SOL_MINT);
  const selectedTokenIsCollToken = selectedTokenMint.equals(collTokenMint);
  const depositTokenIsSol = !solTokenReserve ? false : selectedTokenMint.equals(solTokenReserve!.getLiquidityMint());

  let obligationType: ObligationType;
  if (obligationTypeTagOverride == ObligationTypeTag.Multiply) {
    // multiply
    obligationType = new MultiplyObligation(collTokenMint, debtTokenMint, kaminoMarket.programId);
  } else if (obligationTypeTagOverride == ObligationTypeTag.Leverage) {
    // leverage
    obligationType = new LeverageObligation(collTokenMint, debtTokenMint, kaminoMarket.programId);
  } else {
    throw Error(
      `Obligation type tag ${obligationTypeTagOverride} not supported for leverage, please use multiply (1) or leverage (3) obligation type`
    );
  }

  // 1. Calculate coll_amount and debt_amount to repay such that we maintain leverage and we withdraw to
  // the wallet `amountInDepositTokenToWithdrawToWallet` amount of collateral token
  // We need to withdraw withdrawAmountInDepositToken coll tokens
  // and repay repayAmountInBorrowToken debt tokens
  // TODO marius: do the same in useDeposit
  const { adjustDepositPosition: withdrawAmount, adjustBorrowPosition: initialRepayAmount } = isClosingPosition
    ? { adjustDepositPosition: deposited, adjustBorrowPosition: borrowed }
    : calcWithdrawAmounts({
        collTokenMint: collTokenMint,
        priceCollToDebt: new Decimal(priceCollToDebt),
        currentDepositPosition: deposited,
        currentBorrowPosition: borrowed,
        withdrawAmount: new Decimal(amount),
        selectedTokenMint: selectedTokenMint,
      });

  // Add slippage for the accrued interest rate amount
  const currentSlot = await kaminoMarket.getConnection().getSlot();
  const userObligation = obligation
    ? obligation
    : await kaminoMarket.getObligationByAddress(obligationType.toPda(kaminoMarket.getAddress(), user));
  const irSlippageBpsForDebt = userObligation!
    .estimateObligationInterestRate(debtReserve!, userObligation?.state.borrows[0]!, currentSlot)
    .toDecimalPlaces(debtReserve?.state.liquidity.mintDecimals.toNumber()!, Decimal.ROUND_CEIL);
  // add 0.1 to irSlippageBpsForDebt because we don't want to estimate slightly less than SC and end up not reapying enough
  const repayAmount = initialRepayAmount
    .mul(irSlippageBpsForDebt.add('0.1').div('10_000').add('1'))
    .toDecimalPlaces(debtReserve?.state.liquidity.mintDecimals.toNumber()!, Decimal.ROUND_CEIL);

  // 6. Get swap ixns
  // 5. Get swap estimations to understand how much we need to borrow from borrow reserve
  // prevent withdrawing more then deposited if we close position
  const depositTokenWithdrawAmount = !isClosingPosition
    ? withdrawAmount.mul(new Decimal(1).plus(flashLoanFee))
    : withdrawAmount;

  // We are swapping debt token
  // When withdrawing coll, it means we just need to swap enough to pay for the flash borrow
  const swapAmountIfWithdrawingColl = repayAmount
    .mul(new Decimal(1).plus(flashLoanFee))
    .mul(new Decimal(1 + slippagePct / 100))
    .div(priceCollToDebt);

  // When withdrawing debt, it means we need to swap just the collateral we are withdrwaing
  // enough to cover the debt we are repaying, leaving the remaining in the wallet
  const swapAmountIfWithdrawingDebt = withdrawAmount;

  const collTokenSwapIn = selectedTokenIsCollToken ? swapAmountIfWithdrawingColl : swapAmountIfWithdrawingDebt;
  const debtTokenExpectedSwapOut = collTokenSwapIn.mul(priceCollToDebt).div(new Decimal(1 + slippagePct / 100));

  const strategy = collIsKtoken ? await kamino?.getStrategyByKTokenMint(collTokenMint) : undefined;

  console.log('Expecting to swap', collTokenSwapIn.toString(), 'coll for', debtTokenExpectedSwapOut.toString(), 'debt');
  // 1. Create atas & budget txns & user metadata
  let mintsToCreateAtas: PublicKey[] = [];
  if (collIsKtoken) {
    const secondTokenAta = strategy?.strategy.tokenAMint.equals(debtTokenMint)
      ? strategy?.strategy.tokenBMint!
      : strategy?.strategy.tokenAMint!;
    mintsToCreateAtas = [collTokenMint, debtTokenMint, collReserve!.getCTokenMint(), secondTokenAta];
  } else {
    mintsToCreateAtas = [collTokenMint, debtTokenMint, collReserve!.getCTokenMint()];
  }

  const {
    atas: [, debtTokenAta],
    createAtasIxns,
    closeAtasIxns,
  } = await getAtasWithCreateIxnsIfMissing(connection, user, mintsToCreateAtas);

  const closeWsolAtaIxns: TransactionInstruction[] = [];
  if (depositTokenIsSol || debtTokenMint.equals(WRAPPED_SOL_MINT)) {
    const wsolAta = await getAssociatedTokenAddress(WRAPPED_SOL_MINT, user, false);
    closeWsolAtaIxns.push(Token.createCloseAccountInstruction(TOKEN_PROGRAM_ID, wsolAta, user, user, []));
  }
  closeAtasIxns.push(...closeWsolAtaIxns);

  const budgetIxns = budgetAndPriorityFeeIxns || getComputeBudgetAndPriorityFeeIxns(3000000);

  // TODO: marius test this with shorting leverage and with leverage looping
  // This is here so that we have enough wsol to repay in case the kAB swapped to sol after estimates is not enough
  const fillWsolAtaIxns: TransactionInstruction[] = [];
  if (debtTokenMint.equals(WRAPPED_SOL_MINT)) {
    const halfSolBalance = (await connection.getBalance(user)) / LAMPORTS_PER_SOL / 2;
    const balanceToWrap = halfSolBalance < 0.1 ? halfSolBalance : 0.1;
    fillWsolAtaIxns.push(
      ...getDepositWsolIxns(user, debtTokenAta, toLamports(balanceToWrap, solTokenReserve!.stats.decimals).ceil())
    );
  }

  // 2. Prepare the flash borrow and flash repay amounts and ixns
  // We borrow exactly how much we need to repay
  // and repay that + flash amount fee

  const { flashBorrowIxn, flashRepayIxn } = getFlashLoanInstructions({
    borrowIxnIndex: budgetIxns.length + createAtasIxns.length + fillWsolAtaIxns.length,
    walletPublicKey: user,
    lendingMarketAuthority: kaminoMarket.getLendingMarketAuthority(),
    lendingMarketAddress: kaminoMarket.getAddress(),
    reserve: debtReserve!,
    amountLamports: toLamports(repayAmount, debtReserve!.stats.decimals),
    destinationAta: debtTokenAta,
    referrerAccount: kaminoMarket.programId,
    referrerTokenState: kaminoMarket.programId,
  });

  let withdrawSwapper: SwapIxnsProvider;

  if (collIsKtoken) {
    if (kamino === undefined) {
      throw Error('Ktoken use as collateral for leverage without Kamino instance');
    }
    withdrawSwapper = await getKtokenToTokenSwapper(kaminoMarket, kamino, user, swapper);
  } else {
    withdrawSwapper = swapper;
  }

  const swapInputs: SwapInputs = {
    inputAmountLamports: toLamports(collTokenSwapIn, collReserve!.stats.decimals).ceil().toNumber(),
    inputMint: collTokenMint,
    outputMint: debtTokenMint,
  };

  const [swapIxns, lookupTablesAddresses] = await withdrawSwapper(
    swapInputs.inputAmountLamports,
    swapInputs.inputMint,
    swapInputs.outputMint,
    slippagePct
  );

  // TODO MARIUS: remove first instruction that is setBudget ixn

  // 6. Repay borrowed tokens and Withdraw tokens from reserve that will be swapped to repay flash loan
  const repayAndWithdrawAction = await KaminoAction.buildRepayAndWithdrawTxns(
    kaminoMarket,
    isClosingPosition ? U64_MAX : toLamports(repayAmount, debtReserve!.stats.decimals).floor().toString(),
    debtTokenMint,
    isClosingPosition ? U64_MAX : toLamports(depositTokenWithdrawAmount, collReserve!.stats.decimals).ceil().toString(),
    collTokenMint,
    user,
    userObligation ? userObligation : obligationType,
    0,
    false,
    false,
    false, // to be checked and created in a setup tx in the UI (won't be the case for withdraw anyway as this would be created in deposit)
    isClosingPosition,
    referrer
  );

  if (collIsKtoken) {
    if (strategy?.strategy.strategyLookupTable) {
      lookupTablesAddresses.push(strategy?.strategy.strategyLookupTable!);
    } else {
      console.log('Strategy lookup table not found');
    }
  }

  const swapInstructions = removeBudgetAndAtaIxns(swapIxns, []);

  const ixns = [
    ...budgetIxns,
    ...createAtasIxns,
    ...fillWsolAtaIxns,
    ...[flashBorrowIxn],
    ...repayAndWithdrawAction.setupIxs,
    ...[repayAndWithdrawAction.lendingIxs[0]],
    ...repayAndWithdrawAction.inBetweenIxs,
    ...[repayAndWithdrawAction.lendingIxs[1]],
    ...repayAndWithdrawAction.cleanupIxs,
    ...swapInstructions,
    ...[flashRepayIxn],
    ...closeAtasIxns,
  ];

  // Send ixns and lookup tables
  return {
    ixns,
    lookupTablesAddresses,
    swapInputs,
  };
};

export const getAdjustLeverageSwapInputs = (props: {
  deposited: Decimal;
  borrowed: Decimal;
  priceCollToDebt: Decimal;
  priceDebtToColl: Decimal;
  slippagePct: number;
  targetLeverage: Decimal;
  kaminoMarket: KaminoMarket;
  debtTokenMint: PublicKey;
  collTokenMint: PublicKey;
}): {
  swapInputs: SwapInputs;
} => {
  const {
    deposited,
    borrowed,
    priceCollToDebt,
    priceDebtToColl,
    slippagePct,
    targetLeverage,
    kaminoMarket,
    debtTokenMint,
    collTokenMint,
  } = props;
  const collReserve = kaminoMarket.getReserveByMint(collTokenMint);
  const debtReserve = kaminoMarket.getReserveByMint(debtTokenMint);
  const flashLoanFee = debtReserve?.getFlashLoanFee() || new Decimal(0);

  console.log('depositSwapInput', deposited, borrowed, targetLeverage, priceCollToDebt, new Decimal(flashLoanFee));

  const { adjustDepositPosition, adjustBorrowPosition } = calcAdjustAmounts({
    currentDepositPosition: fromLamports(deposited, collReserve!.stats.decimals),
    currentBorrowPosition: fromLamports(borrowed, debtReserve!.stats.decimals),
    targetLeverage: targetLeverage,
    priceCollToDebt: priceCollToDebt,
    flashLoanFee: new Decimal(flashLoanFee),
  });
  const isDeposit = adjustDepositPosition.gte(0) && adjustBorrowPosition.gte(0);

  if (isDeposit) {
    const borrowAmount = adjustDepositPosition
      .mul(new Decimal(1).plus(flashLoanFee))
      .mul(new Decimal(1 + slippagePct / 100))
      .div(priceDebtToColl);

    return {
      swapInputs: {
        inputAmountLamports: toLamports(borrowAmount, debtReserve!.state.liquidity.mintDecimals.toNumber())
          .ceil()
          .toNumber(),
        inputMint: debtTokenMint,
        outputMint: collTokenMint,
      },
    };
  } else {
    const withdrawAmountWithSlippageAndFlashLoanFee = Decimal.abs(adjustDepositPosition)
      .mul(new Decimal(1).plus(flashLoanFee))
      .mul(1 + slippagePct / 100);

    return {
      swapInputs: {
        inputAmountLamports: toLamports(
          withdrawAmountWithSlippageAndFlashLoanFee,
          collReserve!.state.liquidity.mintDecimals.toNumber()
        )
          .ceil()
          .toNumber(),
        inputMint: collTokenMint,
        outputMint: debtTokenMint,
      },
    };
  }
};

export const getAdjustLeverageIxns = async (props: {
  connection: Connection;
  budgetAndPriorityFeeIxns: TransactionInstruction[];
  user: PublicKey;
  kaminoMarket: KaminoMarket;
  priceDebtToColl: Decimal;
  priceCollToDebt: Decimal;
  targetLeverage: Decimal;
  slippagePct: number;
  depositedLamports: Decimal;
  borrowedLamports: Decimal;
  collTokenMint: PublicKey;
  debtTokenMint: PublicKey;
  swapper: SwapIxnsProvider;
  referrer: PublicKey;
  isKtoken: IsKtokenProvider;
  priceAinB: PriceAinBProvider;
  kamino: Kamino | undefined;
  obligationTypeTagOverride: ObligationTypeTag;
  obligation: KaminoObligation | null;
}) => {
  const {
    connection,
    budgetAndPriorityFeeIxns,
    user,
    kaminoMarket,
    priceDebtToColl,
    priceCollToDebt,
    targetLeverage,
    slippagePct,
    depositedLamports,
    borrowedLamports,
    collTokenMint,
    debtTokenMint,
    swapper,
    referrer,
    isKtoken,
    priceAinB,
    kamino,
    obligationTypeTagOverride,
    obligation,
  } = props;

  const collReserve = kaminoMarket.getReserveByMint(collTokenMint);
  const debtReserve = kaminoMarket.getReserveByMint(debtTokenMint);

  const deposited = fromLamports(depositedLamports, collReserve!.stats.decimals);
  const borrowed = fromLamports(borrowedLamports, debtReserve!.stats.decimals);
  const userObligation = obligation
    ? obligation
    : (await kaminoMarket.getUserObligationsByTag(obligationTypeTagOverride, user)).filter(
        (obligation: KaminoObligation) =>
          obligation.getBorrowByMint(debtReserve!.getLiquidityMint()) !== undefined &&
          obligation.getDepositByMint(collReserve!.getLiquidityMint()) !== undefined
      )[0];
  const currentLeverage = userObligation!.refreshedStats.leverage;
  const isDepositViaLeverage = targetLeverage.gte(new Decimal(currentLeverage));

  let flashLoanFee = new Decimal(0);
  if (isDepositViaLeverage) {
    flashLoanFee = collReserve?.getFlashLoanFee() || new Decimal(0);
  } else {
    flashLoanFee = debtReserve?.getFlashLoanFee() || new Decimal(0);
  }

  console.log('depositSwapInput', deposited, borrowed, targetLeverage, priceCollToDebt, new Decimal(flashLoanFee));

  const { adjustDepositPosition, adjustBorrowPosition } = calcAdjustAmounts({
    currentDepositPosition: deposited,
    currentBorrowPosition: borrowed,
    targetLeverage: targetLeverage,
    priceCollToDebt: priceCollToDebt,
    flashLoanFee: new Decimal(flashLoanFee),
  });

  let ixns: TransactionInstruction[] = [];
  let lookupTablesAddresses: PublicKey[] = [];
  let swapInputs: SwapInputs;

  const isDeposit = adjustDepositPosition.gte(0) && adjustBorrowPosition.gte(0);
  if (isDepositViaLeverage !== isDeposit) {
    throw new Error('Invalid target leverage');
  }

  // leverage increased so we need to deposit and borrow more
  if (isDeposit) {
    console.log('Increasing leaverage');
    // TODO: marius why are we not using both adjustDepositPosition & adjustBorrowPosition
    const res = await getIncreaseLeverageIxns({
      connection,
      budgetAndPriorityFeeIxns,
      user,
      kaminoMarket,
      depositAmount: adjustDepositPosition,
      collTokenMint,
      debtTokenMint,
      slippagePct,
      priceDebtToColl,
      priceCollToDebt,
      swapper,
      referrer,
      isKtoken,
      priceAinB,
      kamino,
      obligationTypeTagOverride,
      obligation: userObligation,
    });
    ixns = res.ixns;
    lookupTablesAddresses = res.lookupTablesAddresses;
    swapInputs = res.swapInputs;
  } else {
    console.log('Decreasing leverage');
    const res = await getDecreaseLeverageIxns({
      connection,
      budgetAndPriorityFeeIxns,
      user,
      kaminoMarket,
      withdrawAmount: Decimal.abs(adjustDepositPosition),
      repayAmount: Decimal.abs(adjustBorrowPosition),
      collTokenMint,
      debtTokenMint,
      slippagePct,
      swapper,
      referrer,
      isKtoken,
      kamino,
      obligationTypeTagOverride,
      obligation: userObligation,
    });
    ixns = res.ixns;
    lookupTablesAddresses = res.lookupTablesAddresses;
    swapInputs = res.swapInputs;
  }

  return {
    ixns,
    lookupTablesAddresses,
    swapInputs,
  };
};

/**
 * Deposit and borrow tokens if leverage increased
 */
export const getIncreaseLeverageIxns = async (props: {
  connection: Connection;
  budgetAndPriorityFeeIxns: TransactionInstruction[];
  user: PublicKey;
  kaminoMarket: KaminoMarket;
  depositAmount: Decimal;
  collTokenMint: PublicKey;
  debtTokenMint: PublicKey;
  slippagePct: number;
  priceDebtToColl: Decimal;
  priceCollToDebt: Decimal;
  swapper: SwapIxnsProvider;
  referrer: PublicKey;
  isKtoken: IsKtokenProvider;
  priceAinB: PriceAinBProvider;
  kamino: Kamino | undefined;
  obligationTypeTagOverride: ObligationTypeTag;
  obligation: KaminoObligation | null;
}) => {
  const {
    connection,
    budgetAndPriorityFeeIxns,
    user,
    kaminoMarket,
    depositAmount,
    collTokenMint,
    debtTokenMint,
    slippagePct,
    priceDebtToColl,
    priceCollToDebt,
    swapper,
    referrer,
    isKtoken,
    priceAinB,
    kamino,
    obligationTypeTagOverride = 1,
    obligation,
  } = props;
  const collReserve = kaminoMarket.getReserveByMint(collTokenMint);
  const debtReserve = kaminoMarket.getReserveByMint(debtTokenMint);
  const collIsKtoken = await isKtoken(collTokenMint);

  const flashLoanFee = collReserve?.getFlashLoanFee() || new Decimal(0);

  if (!priceDebtToColl || !priceCollToDebt) {
    throw new Error('Price is not loaded. Please, reload the page and try again');
  }

  // TODO: why are we recalculating here again
  const strategy = collIsKtoken ? await kamino?.getStrategyByKTokenMint(collTokenMint) : undefined;

  // 1. Create atas & budget txns
  const budgetIxns = budgetAndPriorityFeeIxns || getComputeBudgetAndPriorityFeeIxns(3000000);
  let mintsToCreateAtas: PublicKey[] = [];
  if (collIsKtoken) {
    const secondTokenAta = strategy?.strategy.tokenAMint.equals(debtTokenMint)
      ? strategy?.strategy.tokenBMint!
      : strategy?.strategy.tokenAMint!;
    mintsToCreateAtas = [collTokenMint, debtTokenMint, collReserve!.getCTokenMint(), secondTokenAta];
  } else {
    mintsToCreateAtas = [collTokenMint, debtTokenMint, collReserve!.getCTokenMint()];
  }

  const {
    atas: [collTokenAta, debtTokenAta],
    createAtasIxns,
    closeAtasIxns,
  } = await getAtasWithCreateIxnsIfMissing(connection, user, mintsToCreateAtas);

  // 2. Create borrow flash loan instruction

  // used if coll is Ktoken and we borrow debt token instead
  const amountToFashBorrowDebt = depositAmount
    .div(priceDebtToColl)
    .mul(new Decimal(1 + slippagePct / 100))
    .toDecimalPlaces(debtReserve!.stats.decimals, Decimal.ROUND_UP);
  // .toDecimalPlaces(debtReserve?.state.liquidity.mintDecimals.toNumber());

  const { flashBorrowIxn, flashRepayIxn } = getFlashLoanInstructions({
    borrowIxnIndex: budgetIxns.length + createAtasIxns.length, // TODO: how about user metadata ixns
    walletPublicKey: user,
    lendingMarketAuthority: kaminoMarket.getLendingMarketAuthority(),
    lendingMarketAddress: kaminoMarket.getAddress(),
    reserve: !collIsKtoken ? collReserve! : debtReserve!,
    amountLamports: toLamports(
      !collIsKtoken ? depositAmount : amountToFashBorrowDebt,
      !collIsKtoken ? collReserve!.stats.decimals : debtReserve!.stats.decimals
    ),
    destinationAta: !collIsKtoken ? collTokenAta : debtTokenAta,
    referrerAccount: kaminoMarket.programId,
    referrerTokenState: kaminoMarket.programId,
  });

  // 3. Deposit initial tokens +  borrowed tokens into reserve
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

  const depositAction = await KaminoAction.buildDepositTxns(
    kaminoMarket,
    toLamports(depositAmount, collReserve!.stats.decimals).floor().toString(),
    collTokenMint,
    user,
    obligation ? obligation : obligationType,
    0,
    false,
    false,
    false, // to be checked and create in a setup tx in the UI (won't be the case for adjust anyway as this would be created in deposit)
    referrer
  );

  // 4. Get swap estimations to understand how much we need to borrow from borrow reserve
  const borrowAmount = depositAmount
    .mul(new Decimal(1).plus(flashLoanFee))
    .mul(new Decimal(1 + slippagePct / 100))
    .div(priceDebtToColl);

  const _collTokenExpectedSwapOut = depositAmount.mul(new Decimal(1).plus(flashLoanFee));

  // 5. Borrow tokens in borrow token reserve that will be swapped to repay flash loan
  const borrowAction = await KaminoAction.buildBorrowTxns(
    kaminoMarket,
    toLamports(borrowAmount, debtReserve!.stats.decimals).ceil().toString(),
    debtTokenMint,
    user,
    obligation ? obligation : obligationType,
    0,
    false,
    false,
    false, // to be checked and create in a setup tx in the UI (won't be the case for adjust anyway as this would be created in deposit)
    referrer,
    debtTokenAta
  );

  let depositSwapper: SwapIxnsProvider;
  let expectedDebtTokenAtaBalance = new Decimal(0);

  if (collIsKtoken) {
    if (kamino === undefined) {
      throw Error('Ktoken use as collateral for leverage without Kamino instance');
    }
    depositSwapper = await getTokenToKtokenSwapper(connection, kaminoMarket, kamino, user, swapper, priceAinB, false);

    expectedDebtTokenAtaBalance = await getExpectedTokenBalanceAfterBorrow(
      connection,
      debtTokenMint,
      user,
      toLamports(!collIsKtoken ? borrowAmount : amountToFashBorrowDebt, debtReserve!.stats.decimals).floor(),
      debtReserve!.state.liquidity.mintDecimals.toNumber()
    );
  } else {
    depositSwapper = swapper;
  }

  const swapInputs: SwapInputs = {
    inputAmountLamports: toLamports(!collIsKtoken ? borrowAmount : amountToFashBorrowDebt, debtReserve!.stats.decimals)
      .ceil()
      .toNumber(),
    inputMint: debtTokenMint,
    outputMint: collTokenMint,
  };

  const [swapIxns, lookupTablesAddresses] = await depositSwapper(
    swapInputs.inputAmountLamports,
    swapInputs.inputMint,
    swapInputs.outputMint,
    slippagePct,
    expectedDebtTokenAtaBalance
  );

  const swapInstructions = removeBudgetAndAtaIxns(swapIxns, []);

  const ixns = !collIsKtoken
    ? [
        ...budgetIxns,
        ...createAtasIxns,
        ...[flashBorrowIxn],
        ...depositAction.setupIxs,
        ...depositAction.lendingIxs,
        ...depositAction.cleanupIxs,
        ...borrowAction.setupIxs,
        ...borrowAction.lendingIxs,
        ...borrowAction.cleanupIxs,
        ...swapInstructions,
        ...[flashRepayIxn],
        ...closeAtasIxns,
      ]
    : [
        ...budgetIxns,
        ...createAtasIxns,
        ...[flashBorrowIxn],
        ...swapInstructions,
        ...depositAction.setupIxs,
        ...depositAction.lendingIxs,
        ...depositAction.cleanupIxs,
        ...borrowAction.setupIxs,
        ...borrowAction.lendingIxs,
        ...borrowAction.cleanupIxs,
        ...[flashRepayIxn],
        ...closeAtasIxns,
      ];

  ixns.forEach((ixn, i) => {
    console.log(`ixn ${i + 1}: ${ixn.programId.toString()}`);
  });

  // Create and send transaction
  if (collIsKtoken) {
    if (strategy?.strategy.strategyLookupTable) {
      lookupTablesAddresses.push(strategy?.strategy.strategyLookupTable!);
    } else {
      console.log('Strategy lookup table not found');
    }
  }
  return {
    ixns,
    lookupTablesAddresses,
    swapInputs,
  };
};

/**
 * Withdraw and repay tokens if leverage decreased
 */
export const getDecreaseLeverageIxns = async (props: {
  connection: Connection;
  budgetAndPriorityFeeIxns: TransactionInstruction[];
  user: PublicKey;
  kaminoMarket: KaminoMarket;
  withdrawAmount: Decimal;
  repayAmount: Decimal;
  collTokenMint: PublicKey;
  debtTokenMint: PublicKey;
  slippagePct: number;
  swapper: SwapIxnsProvider;
  referrer: PublicKey;
  isKtoken: IsKtokenProvider;
  kamino: Kamino | undefined;
  obligationTypeTagOverride: ObligationTypeTag;
  obligation: KaminoObligation | null;
}) => {
  const {
    connection,
    budgetAndPriorityFeeIxns,
    user,
    kaminoMarket,
    withdrawAmount,
    repayAmount,
    collTokenMint,
    debtTokenMint,
    slippagePct,
    swapper,
    referrer,
    isKtoken,
    kamino,
    obligationTypeTagOverride = 1,
    obligation,
  } = props;

  console.log(
    'getDecreaseLeverageIxns',
    toJson({ withdrawAmount, repayAmount, collTokenMint, debtTokenMint, slippagePct })
  );
  const collReserve = kaminoMarket.getReserveByMint(collTokenMint);
  const debtReserve = kaminoMarket.getReserveByMint(debtTokenMint);
  const collIsKtoken = await isKtoken(collTokenMint);

  const flashLoanFee = debtReserve?.getFlashLoanFee() || new Decimal(0);

  const strategy = collIsKtoken ? await kamino?.getStrategyByKTokenMint(collTokenMint) : undefined;

  // 1. Create atas & budget txns
  const budgetIxns = budgetAndPriorityFeeIxns || getComputeBudgetAndPriorityFeeIxns(3000000);
  let mintsToCreateAtas: PublicKey[] = [];
  if (collIsKtoken) {
    const secondTokenAta = strategy?.strategy.tokenAMint.equals(debtTokenMint)
      ? strategy?.strategy.tokenBMint!
      : strategy?.strategy.tokenAMint!;
    mintsToCreateAtas = [collTokenMint, debtTokenMint, collReserve!.getCTokenMint(), secondTokenAta];
  } else {
    mintsToCreateAtas = [collTokenMint, debtTokenMint, collReserve!.getCTokenMint()];
  }
  const {
    atas: [, debtTokenAta],
    createAtasIxns,
    closeAtasIxns,
  } = await getAtasWithCreateIxnsIfMissing(connection, user, mintsToCreateAtas);

  // TODO: Mihai/Marius check if we can improve this logic and not convert any SOL
  // This is here so that we have enough wsol to repay in case the kAB swapped to sol after estimates is not enough
  const closeWsolAtaIxns: TransactionInstruction[] = [];
  if (debtTokenMint.equals(WRAPPED_SOL_MINT)) {
    const wsolAta = await getAssociatedTokenAddress(WRAPPED_SOL_MINT, user, false);
    closeWsolAtaIxns.push(Token.createCloseAccountInstruction(TOKEN_PROGRAM_ID, wsolAta, user, user, []));
  }
  closeAtasIxns.push(...closeWsolAtaIxns);

  const fillWsolAtaIxns: TransactionInstruction[] = [];
  if (debtTokenMint.equals(WRAPPED_SOL_MINT)) {
    const halfSolBalance = (await connection.getBalance(user)) / LAMPORTS_PER_SOL / 2;
    const balanceToWrap = halfSolBalance < 0.1 ? halfSolBalance : 0.1;
    fillWsolAtaIxns.push(
      ...getDepositWsolIxns(user, debtTokenAta, toLamports(balanceToWrap, debtReserve!.stats.decimals).ceil())
    );
  }

  // 3. Flash borrow & repay amount to repay (debt)
  const { flashBorrowIxn, flashRepayIxn } = getFlashLoanInstructions({
    borrowIxnIndex: budgetIxns.length + createAtasIxns.length + fillWsolAtaIxns.length,
    walletPublicKey: user,
    lendingMarketAuthority: kaminoMarket.getLendingMarketAuthority(),
    lendingMarketAddress: kaminoMarket.getAddress(),
    reserve: debtReserve!,
    amountLamports: toLamports(repayAmount, debtReserve!.stats.decimals),
    destinationAta: debtTokenAta,
    referrerAccount: kaminoMarket.programId,
    referrerTokenState: kaminoMarket.programId,
  });

  // 4. Actually do the repay of the flash borrowed amounts
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

  const repayAction = await KaminoAction.buildRepayTxns(
    kaminoMarket,
    toLamports(repayAmount, debtReserve!.stats.decimals).floor().toString(),
    debtTokenMint,
    user,
    obligation ? obligation : obligationType,
    undefined,
    0,
    false,
    false,
    false, // to be checked and create in a setup tx in the UI (won't be the case for adjust anyway as this would be created in deposit)
    referrer
  );

  // 6. Withdraw collateral (a little bit more to be able to pay for the slippage on swap)
  const withdrawAmountWithSlippageAndFlashLoanFee = withdrawAmount
    .mul(new Decimal(1).plus(flashLoanFee))
    .mul(1 + slippagePct / 100);
  const _debtTokenExpectedSwapOut = repayAmount.mul(new Decimal(1).plus(flashLoanFee));

  const withdrawAction = await KaminoAction.buildWithdrawTxns(
    kaminoMarket,
    toLamports(withdrawAmountWithSlippageAndFlashLoanFee, collReserve!.stats.decimals).ceil().toString(),
    collTokenMint,
    user,
    obligation ? obligation : obligationType,
    0,
    false,
    false,
    false, // to be checked and create in a setup tx in the UI (won't be the case for adjust anyway as this would be created in deposit)
    referrer
  );

  let withdrawSwapper: SwapIxnsProvider;

  if (collIsKtoken) {
    if (kamino === undefined) {
      throw Error('Ktoken use as collateral for leverage without Kamino instance');
    }
    withdrawSwapper = await getKtokenToTokenSwapper(kaminoMarket, kamino, user, swapper);
  } else {
    withdrawSwapper = swapper;
  }

  const swapInputs: SwapInputs = {
    inputAmountLamports: toLamports(withdrawAmountWithSlippageAndFlashLoanFee, collReserve!.stats.decimals)
      .ceil()
      .toNumber(),
    inputMint: collTokenMint,
    outputMint: debtTokenMint,
  };

  // 5. Get swap ixns
  const [swapIxns, lookupTablesAddresses] = await withdrawSwapper(
    swapInputs.inputAmountLamports,
    swapInputs.inputMint,
    swapInputs.outputMint,
    slippagePct
  );

  const swapInstructions = removeBudgetAndAtaIxns(swapIxns, []);

  const ixns = [
    ...budgetIxns,
    ...createAtasIxns,
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
    ...closeAtasIxns,
  ];

  ixns.forEach((ixn, i) => {
    console.log(`ixn ${i + 1}: ${ixn.programId.toString()}`);
  });

  if (collIsKtoken) {
    if (strategy?.strategy.strategyLookupTable) {
      lookupTablesAddresses.push(strategy?.strategy.strategyLookupTable!);
    } else {
      console.log('Strategy lookup table not found');
    }
  }
  // Create and send transaction
  return {
    ixns,
    lookupTablesAddresses,
    swapInputs,
  };
};
