import { Address, Slot } from '@solana/kit';
import Decimal from 'decimal.js';
import { KaminoMarket, KaminoObligation, KaminoReserve, toJson } from '../classes';
import { AdjustLeverageCalcsResult, DepositLeverageCalcsResult, WithdrawLeverageCalcsResult } from './types';
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

export function adjustDepositLeverageCalcs(
  debtReserve: KaminoReserve,
  adjustDepositPosition: Decimal,
  adjustBorrowPosition: Decimal,
  priceDebtToColl: Decimal,
  flashLoanFee: Decimal,
  slippagePct: Decimal
): AdjustLeverageCalcsResult {
  const amountToFlashBorrowDebt = adjustDepositPosition
    .div(priceDebtToColl)
    .mul(new Decimal(new Decimal(1).add(slippagePct.div(100))))
    .toDecimalPlaces(debtReserve!.stats.decimals, Decimal.ROUND_UP);

  const borrowAmount = adjustDepositPosition
    .mul(new Decimal(1).plus(flashLoanFee))
    .mul(new Decimal(new Decimal(1).add(slippagePct.div(100))))
    .div(priceDebtToColl);

  return {
    adjustDepositPosition,
    adjustBorrowPosition,
    amountToFlashBorrowDebt,
    borrowAmount,
    withdrawAmountWithSlippageAndFlashLoanFee: new Decimal(0),
  };
}

export function adjustWithdrawLeverageCalcs(
  adjustDepositPosition: Decimal,
  adjustBorrowPosition: Decimal,
  flashLoanFee: Decimal,
  slippagePct: Decimal
): AdjustLeverageCalcsResult {
  const withdrawAmountWithSlippageAndFlashLoanFee = Decimal.abs(adjustDepositPosition)
    .mul(new Decimal(1).plus(flashLoanFee))
    .mul(new Decimal(1).add(slippagePct.div(100)));

  return {
    adjustDepositPosition,
    adjustBorrowPosition,
    amountToFlashBorrowDebt: new Decimal(0),
    borrowAmount: new Decimal(0),
    withdrawAmountWithSlippageAndFlashLoanFee,
  };
}
