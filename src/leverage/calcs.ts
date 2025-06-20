import { Address, Slot } from '@solana/kit';
import Decimal from 'decimal.js';
import { collToLamportsDecimal, Kamino, StrategyWithAddress, TokenAmounts } from '@kamino-finance/kliquidity-sdk';
import { KaminoMarket, KaminoObligation, KaminoReserve, toJson } from '../classes';
import { getExpectedTokenBalanceAfterBorrow } from './utils';
import {
  AdjustLeverageCalcsResult,
  DepositLeverageCalcsResult,
  PriceAinBProvider,
  WithdrawLeverageCalcsResult,
} from './types';
import { fuzzyEqual } from '../utils';

const closingPositionDiffTolerance = 0.0001;

export enum LeverageOption {
  deposit = 'Deposit',
  withdraw = 'Withdraw',
  adjust = 'Adjust',
  close = 'Close',
}

export interface LeverageCalcsArgs {
  depositAmount: Decimal;
  withdrawAmount: Decimal;
  deposited: Decimal;
  borrowed: Decimal;
  debtTokenMint: Address;
  selectedTokenMint: Address;
  collTokenMint: Address;
  targetLeverage: Decimal;
  activeLeverageOption: LeverageOption;
  flashLoanFeeRatio: Decimal;
  debtBorrowFactorPct: Decimal;
  priceCollToDebt: Decimal;
  priceDebtToColl: Decimal;
}

export interface LeverageCalcsResult {
  earned: Decimal;
  totalDeposited: Decimal;
  totalBorrowed: Decimal;
  netValue: Decimal;
  netValueUsd: Decimal;
  ltv: Decimal;
}

export async function calculateMultiplyEffects(
  getPriceByTokenMintDecimal: (mint: Address) => Promise<Decimal>,
  {
    depositAmount,
    withdrawAmount,
    deposited,
    borrowed,
    debtTokenMint,
    selectedTokenMint,
    collTokenMint,
    targetLeverage,
    activeLeverageOption,
    flashLoanFeeRatio,
    debtBorrowFactorPct,
    priceCollToDebt,
    priceDebtToColl,
  }: LeverageCalcsArgs,
  logEstimations = false
): Promise<LeverageCalcsResult> {
  // calculate estimations for deposit operation
  const {
    adjustDepositPosition: depositModeEstimatedDepositAmount,
    adjustBorrowPosition: depositModeEstimatedBorrowAmount,
  } = estimateDepositMode({
    priceCollToDebt,
    priceDebtToColl,
    amount: depositAmount,
    targetLeverage,
    selectedTokenMint,
    collTokenMint: collTokenMint,
    flashLoanFee: flashLoanFeeRatio,
  });

  // calculate estimations for withdraw operation
  const {
    adjustDepositPosition: withdrawModeEstimatedDepositTokenWithdrawn,
    adjustBorrowPosition: withdrawModeEstimatedBorrowTokenWithdrawn,
  } = estimateWithdrawMode({
    priceCollToDebt: priceCollToDebt,
    collTokenMint,
    selectedTokenMint,
    amount: withdrawAmount,
    deposited: new Decimal(deposited),
    borrowed: new Decimal(borrowed),
  });

  // calculate estimations for adjust operation
  const {
    adjustDepositPosition: adjustModeEstimatedDepositAmount,
    adjustBorrowPosition: adjustModeEstimateBorrowAmount,
  } = estimateAdjustMode(priceCollToDebt, {
    targetLeverage,
    debtTokenMint,
    collTokenMint,
    totalDeposited: new Decimal(deposited),
    totalBorrowed: new Decimal(borrowed),
    flashLoanFee: flashLoanFeeRatio, // TODO: is this the right flash borrow?
  });

  if (logEstimations) {
    console.log(
      'Estimations',
      toJson({
        activeLeverageOption,
        depositModeEstimatedDepositAmount,
        depositModeEstimatedBorrowAmount,
        withdrawModeEstimatedDepositTokenWithdrawn,
        withdrawModeEstimatedBorrowTokenWithdrawn,
        adjustModeEstimatedDepositAmount,
        adjustModeEstimateBorrowAmount,
      })
    );
  }

  let [isClosingPosition, totalDeposited, totalBorrowed] = [false, new Decimal(0), new Decimal(0)];

  switch (activeLeverageOption) {
    case LeverageOption.deposit: {
      // Deposit and Adjust never clos the position
      isClosingPosition = false;
      totalDeposited = deposited.add(depositModeEstimatedDepositAmount);
      totalBorrowed = borrowed.add(depositModeEstimatedBorrowAmount);
      break;
    }
    case LeverageOption.close:
    case LeverageOption.withdraw: {
      isClosingPosition =
        (withdrawModeEstimatedDepositTokenWithdrawn.gte(new Decimal(deposited)) ||
          withdrawModeEstimatedBorrowTokenWithdrawn.gte(new Decimal(borrowed)) ||
          fuzzyEqual(
            withdrawModeEstimatedDepositTokenWithdrawn,
            new Decimal(deposited),
            closingPositionDiffTolerance
          ) ||
          fuzzyEqual(withdrawModeEstimatedBorrowTokenWithdrawn, new Decimal(borrowed), closingPositionDiffTolerance)) &&
        !fuzzyEqual(withdrawModeEstimatedDepositTokenWithdrawn, new Decimal(0), closingPositionDiffTolerance);

      totalDeposited = isClosingPosition ? new Decimal(0) : deposited.sub(withdrawModeEstimatedDepositTokenWithdrawn);
      totalBorrowed = isClosingPosition ? new Decimal(0) : borrowed.sub(withdrawModeEstimatedBorrowTokenWithdrawn);
      break;
    }
    case LeverageOption.adjust: {
      // Deposit and Adjust never clos the position
      isClosingPosition = false;
      totalDeposited = deposited.add(adjustModeEstimatedDepositAmount);
      totalBorrowed = borrowed.add(adjustModeEstimateBorrowAmount);
      break;
    }
  }

  const borrowTokenPrice = await getPriceByTokenMintDecimal(debtTokenMint);
  const depositTokenPrice = await getPriceByTokenMintDecimal(collTokenMint);

  const totalDepositedUsd = depositTokenPrice.mul(totalDeposited);
  const totalBorrowedUsd = borrowTokenPrice.mul(totalBorrowed);
  const netValueUsd = totalDepositedUsd.minus(totalBorrowedUsd);
  // TODO marius this is bad, do not convert to sol as we don't only do leveraged loops only
  const netValueSol = netValueUsd.div(borrowTokenPrice);
  const ltv = totalBorrowedUsd.mul(debtBorrowFactorPct.div(100)).div(totalDepositedUsd);

  return {
    earned: new Decimal(0),
    totalDeposited,
    totalBorrowed,
    netValue: netValueSol,
    netValueUsd: netValueUsd,
    ltv,
  };
}

/**
 * returns how much borrowToken will be borrowed to reach leverage given initial collateral amount
 * @param depositTokenAmount
 * @param leverage
 * @param priceAToB
 * @param flashBorrowFee
 */
export const calcBorrowAmount = ({
  depositTokenAmount,
  targetLeverage,
  priceCollToDebt,
  flashLoanFeeRatio,
}: {
  depositTokenAmount: Decimal;
  targetLeverage: Decimal;
  priceCollToDebt: Decimal;
  flashLoanFeeRatio: Decimal;
}) => {
  const initialCollAmountInCollToken = depositTokenAmount;

  const finalCollAmountInCollToken = initialCollAmountInCollToken.mul(targetLeverage);
  const finalDebtAmountInCollToken = finalCollAmountInCollToken.sub(initialCollAmountInCollToken);
  const finalDebtAmountInDebtToken = finalDebtAmountInCollToken.mul(priceCollToDebt);

  const flashFeeFactor = new Decimal(1).add(flashLoanFeeRatio);
  const debtTokenToBorrow = finalDebtAmountInDebtToken.mul(flashFeeFactor);

  return debtTokenToBorrow;
};

interface UseEstimateWithdrawAmountsProps {
  priceCollToDebt: Decimal;
  amount: Decimal.Value;
  deposited: Decimal;
  borrowed: Decimal;
  collTokenMint: Address;
  selectedTokenMint: Address;
}

export const estimateWithdrawMode = (props: UseEstimateWithdrawAmountsProps) => {
  const { amount, collTokenMint, selectedTokenMint, deposited, borrowed, priceCollToDebt } = props;

  return calcWithdrawAmounts({
    selectedTokenMint,
    collTokenMint,
    withdrawAmount: new Decimal(amount),
    priceCollToDebt,
    currentBorrowPosition: borrowed,
    currentDepositPosition: deposited,
  });
};

export interface WithdrawParams {
  currentBorrowPosition: Decimal;
  currentDepositPosition: Decimal;
  priceCollToDebt: Decimal;
  withdrawAmount: Decimal;
  selectedTokenMint: Address;
  collTokenMint: Address;
}

interface WithdrawResult {
  adjustDepositPosition: Decimal;
  adjustBorrowPosition: Decimal;
}

export function calcWithdrawAmounts(params: WithdrawParams): WithdrawResult {
  const {
    currentBorrowPosition,
    currentDepositPosition,
    priceCollToDebt,
    withdrawAmount,
    selectedTokenMint,
    collTokenMint,
  } = params;

  // MSOL/SOL
  const currentDepositInCollateralToken = currentDepositPosition;
  const currentDebtInCollateralToken = currentBorrowPosition.div(priceCollToDebt);
  const currentNetPositionInCollateralToken = currentDepositInCollateralToken.minus(currentDebtInCollateralToken);
  const targetLeverage = currentDepositInCollateralToken.div(currentNetPositionInCollateralToken);

  const initialDepositInCollateralToken = currentDepositPosition.minus(currentBorrowPosition.div(priceCollToDebt));

  const amountToWithdrawDepositToken =
    selectedTokenMint === collTokenMint ? withdrawAmount : withdrawAmount.div(priceCollToDebt);

  const targetDeposit = initialDepositInCollateralToken.minus(amountToWithdrawDepositToken).mul(targetLeverage);

  const targetBorrow = calcBorrowAmount({
    depositTokenAmount: initialDepositInCollateralToken.minus(amountToWithdrawDepositToken),
    priceCollToDebt: new Decimal(priceCollToDebt),
    targetLeverage: new Decimal(targetLeverage),
    flashLoanFeeRatio: new Decimal(0),
  });

  const adjustDepositPosition = currentDepositPosition.minus(targetDeposit);
  const adjustBorrowPosition = currentBorrowPosition.minus(targetBorrow);

  // TODO: add flashLoan fee here in final values
  return {
    adjustDepositPosition,
    adjustBorrowPosition,
  };
}

interface UseEstimateAdjustAmountsProps {
  targetLeverage: Decimal;
  debtTokenMint: Address;
  collTokenMint: Address;
  totalDeposited: Decimal;
  totalBorrowed: Decimal;
  flashLoanFee: Decimal;
}

/**
 * Calculate how much token will be deposited or withdrawn in case of position adjustment
 * @param leverage
 * @param totalDeposited
 * @param totalBorrowed
 */
export const estimateAdjustMode = (
  priceCollToDebt: Decimal,
  { targetLeverage, totalDeposited, totalBorrowed, flashLoanFee }: UseEstimateAdjustAmountsProps
) => {
  return calcAdjustAmounts({
    currentBorrowPosition: totalBorrowed,
    currentDepositPosition: totalDeposited,
    priceCollToDebt,
    targetLeverage,
    flashLoanFee,
  });
};

export interface AdjustLeverageParams {
  targetLeverage: Decimal;
  currentBorrowPosition: Decimal;
  currentDepositPosition: Decimal;
  priceCollToDebt: Decimal;
  flashLoanFee: Decimal;
}

interface AdjustLeverageResult {
  adjustDepositPosition: Decimal;
  adjustBorrowPosition: Decimal;
}

/**
 * Calculates the amounts of tokenA to deposit/withdraw and tokenB to borrow/repay proportionally to adjust the leverage of a position.
 *
 * @param {AdjustLeverageParams} params - Parameters for the calculation
 * @param {number} params.targetLeverage - The target leverage for the position
 * @param {Decimal} params.currentPositionTokenA - The current amount of tokenA in the position
 * @param {Decimal} params.currentPositionTokenB - The current amount of borrowed tokenB in the position
 * @param {number} params.priceAtoB - The conversion rate from tokenA to tokenB (tokenA price = tokenB price * priceAtoB)
 * @returns {AdjustLeverageResult} An object containing the amounts of tokenA to deposit/withdraw and tokenB to borrow/repay
 */
export function calcAdjustAmounts({
  targetLeverage,
  currentBorrowPosition,
  currentDepositPosition,
  priceCollToDebt,
  flashLoanFee,
}: AdjustLeverageParams): AdjustLeverageResult {
  const initialDeposit = currentDepositPosition.minus(currentBorrowPosition.div(priceCollToDebt));
  const targetDeposit = initialDeposit.mul(targetLeverage);

  const targetBorrow = calcBorrowAmount({
    depositTokenAmount: initialDeposit,
    priceCollToDebt: new Decimal(priceCollToDebt),
    targetLeverage: new Decimal(targetLeverage),
    flashLoanFeeRatio: flashLoanFee,
  });

  const adjustDepositPosition = targetDeposit.minus(currentDepositPosition);
  const adjustBorrowPosition = targetBorrow.minus(currentBorrowPosition);

  return {
    adjustDepositPosition,
    adjustBorrowPosition,
  };
}

interface UseTransactionInfoStats {
  priceCollToDebt: Decimal;
  priceDebtToColl: Decimal;
  amount: Decimal;
  targetLeverage: Decimal;
  selectedTokenMint: Address;
  collTokenMint: Address;
  flashLoanFee: Decimal;
  slippagePct?: Decimal;
}

// Given a deposit amount of Deposit|Borrow token
// and a target leverage, calculate final { collateral, debt } value
export const estimateDepositMode = ({
  priceCollToDebt,
  priceDebtToColl,
  amount,
  targetLeverage,
  selectedTokenMint,
  collTokenMint,
  flashLoanFee,
  slippagePct = new Decimal(0),
}: UseTransactionInfoStats) => {
  const isDepositingCollToken = selectedTokenMint === collTokenMint;

  const finalCollTokenAmount = isDepositingCollToken
    ? new Decimal(amount).mul(targetLeverage).toNumber()
    : new Decimal(amount).mul(priceDebtToColl).mul(targetLeverage).toNumber();

  const depositCollTokenAmount = isDepositingCollToken ? amount : amount.mul(priceDebtToColl);
  const borrowAmount = calcBorrowAmount({
    depositTokenAmount: depositCollTokenAmount,
    targetLeverage: new Decimal(targetLeverage),
    priceCollToDebt: new Decimal(priceCollToDebt),
    flashLoanFeeRatio: new Decimal(flashLoanFee),
  });

  const slippageFactor = new Decimal(1).add(slippagePct.div(new Decimal(100)));
  const borrowAmountWithSlippage = borrowAmount.mul(slippageFactor);

  return {
    adjustDepositPosition: finalCollTokenAmount,
    adjustBorrowPosition: borrowAmountWithSlippage.toNumber(),
  };
};

/**
 * Given an amount of ktokens, returns the estimated amount of token A and token B that need to be deposited
 * The amount of A and B may result in less ktokens being minted, the actual amount of ktokens minted is returned as well
 * @param kamino
 * @param strategy
 * @param mintAmount - desired amount of ktokens to mint
 * @param strategyHoldings - optional strategy holdings, if not provided will be fetched from the blockchain
 * @returns [tokenA, tokenB, actualMintAmount]
 */
export async function simulateMintKToken(
  kamino: Kamino,
  strategy: StrategyWithAddress,
  mintAmount: Decimal,
  strategyHoldings?: TokenAmounts
): Promise<[Decimal, Decimal, Decimal]> {
  let holdings = strategyHoldings;
  if (!holdings) {
    holdings = await kamino.getStrategyTokensHoldings(strategy, 'DEPOSIT');
  }
  const sharesIssuedDecimal = new Decimal(strategy.strategy.sharesIssued.toString()).div(
    10 ** strategy.strategy.sharesMintDecimals.toNumber()
  );

  // Add 1 because the sdk doesn't round up where the SC will
  const strategyA = holdings.a.div(10 ** strategy.strategy.tokenAMintDecimals.toNumber());
  const strategyB = holdings.b.div(10 ** strategy.strategy.tokenBMintDecimals.toNumber());
  const aPerShare = strategyA.div(sharesIssuedDecimal);
  const bPerShare = strategyB.div(sharesIssuedDecimal);

  const requiredA = aPerShare.mul(mintAmount);
  const requiredB = bPerShare.mul(mintAmount);
  const pxAInB = strategyB.div(strategyA);

  console.info(
    `Estimating kToken mint of ${mintAmount} ktokens on strategy ${strategy.address.toString()} requires: estimated A: ${requiredA}, estimated B: ${requiredB}. Current pool state:\n${toJson(
      { ...holdings, sharesIssued: sharesIssuedDecimal, poolPxAInB: pxAInB }
    )}`
  );

  // If we deposited with this exact ratio - how many ktokens do we actually get from the program?
  const RustDecimal = Decimal.clone({ precision: 18, rounding: Decimal.ROUND_FLOOR });

  const usA = new RustDecimal(holdings.a);
  const usB = new RustDecimal(holdings.b);
  const uA = new RustDecimal(requiredA.mul(10 ** strategy.strategy.tokenAMintDecimals.toNumber()).ceil());
  const uB = new RustDecimal(requiredB.mul(10 ** strategy.strategy.tokenBMintDecimals.toNumber()).ceil());

  const ratio = usA.div(usB);
  const depositableB = uA.div(ratio).floor();
  let actualA, actualB;
  if (depositableB.lte(uB)) {
    actualA = depositableB.mul(ratio).floor();
    actualB = uB;
  } else {
    actualA = uB.mul(ratio).floor();
    actualB = actualA.div(ratio).floor();
  }
  const actualMintFromA = actualA.mul(strategy.strategy.sharesIssued.toString()).div(holdings.a).floor();
  const actualMintFromB = actualB.mul(strategy.strategy.sharesIssued.toString()).div(holdings.b).floor();
  const actualMint = Decimal.min(actualMintFromA, actualMintFromB).div(
    10 ** strategy.strategy.sharesMintDecimals.toNumber()
  );
  console.log(`Actual deposit amounts: A: ${actualA}, B: ${actualB}, kTokens to mint: ${actualMint}`);

  return [requiredA, requiredB, actualMint];
}

export const depositLeverageCalcs = (props: {
  depositAmount: Decimal;
  depositTokenIsCollToken: boolean;
  depositTokenIsSol: boolean;
  priceDebtToColl: Decimal;
  targetLeverage: Decimal;
  slippagePct: Decimal;
  flashLoanFee: Decimal;
}): DepositLeverageCalcsResult => {
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
      flashBorrowInDebtTokenKtokenOnly: new Decimal(0),
      singleSidedDepositKtokenOnly: new Decimal(0),
      requiredCollateralKtokenOnly: new Decimal(0),
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
      flashBorrowInDebtTokenKtokenOnly: new Decimal(0),
      singleSidedDepositKtokenOnly: new Decimal(0),
      requiredCollateralKtokenOnly: new Decimal(0),
    };
  }
};

export const depositLeverageKtokenCalcs = async (props: {
  kamino: Kamino;
  strategy: StrategyWithAddress;
  debtTokenMint: Address;
  depositAmount: Decimal;
  depositTokenIsCollToken: boolean;
  depositTokenIsSol: boolean;
  priceDebtToColl: Decimal;
  targetLeverage: Decimal;
  slippagePct: Decimal;
  flashLoanFee: Decimal;
  priceAinB: PriceAinBProvider;
  strategyHoldings?: TokenAmounts;
}): Promise<DepositLeverageCalcsResult> => {
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
      flashBorrowInCollToken: new Decimal(0),
      initDepositInSol,
      collTokenToDeposit,
      debtTokenToBorrow,
      swapDebtTokenIn: new Decimal(0),
      swapCollTokenExpectedOut: new Decimal(0),
      flashBorrowInDebtTokenKtokenOnly: flashBorrowInDebtToken,
      requiredCollateralKtokenOnly: collTokenToDeposit.sub(depositAmount), // Assuming netValue is requiredCollateral, adjust as needed
      singleSidedDepositKtokenOnly: flashBorrowInDebtToken,
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
      strategy,
      finalColl,
      strategyHoldings
    );
    const { tokenAMint, tokenBMint } = strategy.strategy;
    const pxAinB = await priceAinB(tokenAMint, tokenBMint);
    const isTokenADeposit = tokenAMint === debtTokenMint;
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
      flashBorrowInCollToken: new Decimal(0),
      initDepositInSol,
      collTokenToDeposit,
      debtTokenToBorrow,
      swapDebtTokenIn: new Decimal(0),
      swapCollTokenExpectedOut: new Decimal(0),
      flashBorrowInDebtTokenKtokenOnly: flashBorrowInDebtToken,
      singleSidedDepositKtokenOnly: singleSidedDeposit,
      requiredCollateralKtokenOnly: collTokenToDeposit, // Assuming collTokenToDeposit is requiredCollateral, adjust as needed
    };
  }
};

export function withdrawLeverageCalcs(
  market: KaminoMarket,
  collReserve: KaminoReserve,
  debtReserve: KaminoReserve,
  priceCollToDebt: Decimal,
  withdrawAmount: Decimal,
  deposited: Decimal,
  borrowed: Decimal,
  currentSlot: Slot,
  isClosingPosition: boolean,
  selectedTokenIsCollToken: boolean,
  selectedTokenMint: Address,
  obligation: KaminoObligation,
  flashLoanFee: Decimal,
  slippagePct: Decimal
): WithdrawLeverageCalcsResult {
  // 1. Calculate coll_amount and debt_amount to repay such that we maintain leverage and we withdraw to
  // the wallet `amountInDepositTokenToWithdrawToWallet` amount of collateral token
  // We need to withdraw withdrawAmountInDepositToken coll tokens
  // and repay repayAmountInBorrowToken debt tokens
  const { adjustDepositPosition: withdrawAmountCalculated, adjustBorrowPosition: initialRepayAmount } =
    isClosingPosition
      ? { adjustDepositPosition: deposited, adjustBorrowPosition: borrowed }
      : calcWithdrawAmounts({
          collTokenMint: collReserve.getLiquidityMint(),
          priceCollToDebt: new Decimal(priceCollToDebt),
          currentDepositPosition: deposited,
          currentBorrowPosition: borrowed,
          withdrawAmount: new Decimal(withdrawAmount),
          selectedTokenMint: selectedTokenMint,
        });

  // Add slippage for the accrued interest rate amount
  const irSlippageBpsForDebt = obligation!
    .estimateObligationInterestRate(market, debtReserve!, obligation?.state.borrows[0]!, currentSlot)
    .toDecimalPlaces(debtReserve?.getMintDecimals()!, Decimal.ROUND_CEIL);
  // add 0.1 to irSlippageBpsForDebt because we don't want to estimate slightly less than SC and end up not repaying enough
  const repayAmount = initialRepayAmount
    .mul(irSlippageBpsForDebt.add('0.1').div('10_000').add('1'))
    .toDecimalPlaces(debtReserve?.getMintDecimals()!, Decimal.ROUND_CEIL);

  // 6. Get swap ixs
  // 5. Get swap estimations to understand how much we need to borrow from borrow reserve
  // prevent withdrawing more then deposited if we close position
  const depositTokenWithdrawAmount = !isClosingPosition
    ? withdrawAmountCalculated.mul(new Decimal(1).plus(flashLoanFee))
    : withdrawAmountCalculated;

  // We are swapping debt token
  // When withdrawing coll, it means we just need to swap enough to pay for the flash borrow
  const swapAmountIfWithdrawingColl = repayAmount
    .mul(new Decimal(1).plus(flashLoanFee))
    .mul(new Decimal(1).plus(slippagePct.div(100)))
    .div(priceCollToDebt);

  // When withdrawing debt, it means we need to swap just the collateral we are withdrwaing
  // enough to cover the debt we are repaying, leaving the remaining in the wallet
  const swapAmountIfWithdrawingDebt = withdrawAmountCalculated;

  const collTokenSwapIn = selectedTokenIsCollToken ? swapAmountIfWithdrawingColl : swapAmountIfWithdrawingDebt;
  const debtTokenExpectedSwapOut = collTokenSwapIn.mul(priceCollToDebt).div(new Decimal(1).add(slippagePct.div(100)));

  return {
    withdrawAmount: withdrawAmountCalculated,
    repayAmount,
    collTokenSwapIn,
    debtTokenExpectedSwapOut,
    depositTokenWithdrawAmount,
  };
}

export async function adjustDepositLeverageCalcs(
  market: KaminoMarket,
  owner: Address,
  debtReserve: KaminoReserve,
  adjustDepositPosition: Decimal,
  adjustBorrowPosition: Decimal,
  priceDebtToColl: Decimal,
  flashLoanFee: Decimal,
  slippagePct: Decimal,
  collIsKtoken: boolean
): Promise<AdjustLeverageCalcsResult> {
  // used if coll is Ktoken and we borrow debt token instead
  const amountToFlashBorrowDebt = adjustDepositPosition
    .div(priceDebtToColl)
    .mul(new Decimal(new Decimal(1).add(slippagePct.div(100))))
    .toDecimalPlaces(debtReserve!.stats.decimals, Decimal.ROUND_UP);

  const borrowAmount = adjustDepositPosition
    .mul(new Decimal(1).plus(flashLoanFee))
    .mul(new Decimal(new Decimal(1).add(slippagePct.div(100))))
    .div(priceDebtToColl);

  const expectedDebtTokenAtaBalance = await getExpectedTokenBalanceAfterBorrow(
    market.getRpc(),
    debtReserve.getLiquidityMint(),
    owner,
    collToLamportsDecimal(!collIsKtoken ? borrowAmount : amountToFlashBorrowDebt, debtReserve!.stats.decimals).floor(),
    debtReserve!.state.liquidity.mintDecimals.toNumber()
  );

  return {
    adjustDepositPosition,
    adjustBorrowPosition,
    amountToFlashBorrowDebt,
    borrowAmount,
    expectedDebtTokenAtaBalance,
    withdrawAmountWithSlippageAndFlashLoanFee: new Decimal(0),
  };
}

export function adjustWithdrawLeverageCalcs(
  adjustDepositPosition: Decimal,
  adjustBorrowPosition: Decimal,
  flashLoanFee: Decimal,
  slippagePct: Decimal
): AdjustLeverageCalcsResult {
  // used if coll is Ktoken and we borrow debt token instead
  const withdrawAmountWithSlippageAndFlashLoanFee = Decimal.abs(adjustDepositPosition)
    .mul(new Decimal(1).plus(flashLoanFee))
    .mul(new Decimal(1).add(slippagePct.div(100)));

  return {
    adjustDepositPosition,
    adjustBorrowPosition,
    amountToFlashBorrowDebt: new Decimal(0),
    borrowAmount: new Decimal(0),
    expectedDebtTokenAtaBalance: new Decimal(0),
    withdrawAmountWithSlippageAndFlashLoanFee,
  };
}
