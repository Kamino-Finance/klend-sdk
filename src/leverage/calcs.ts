import { PublicKey } from '@solana/web3.js';
import Decimal from 'decimal.js';
import { Kamino, StrategyWithAddress, TokenAmounts } from '@hubbleprotocol/kamino-sdk';

export const toJson = (object: any): string => {
  return JSON.stringify(object, null, 2);
};

const closingPositionDiffTolerance = 0.0001;

export enum FormTabs {
  deposit = 'Deposit',
  withdraw = 'Withdraw',
  adjust = 'Adjust',
  close = 'Close',
}

export interface LeverageFormsCalcsArgs {
  depositAmount: Decimal;
  withdrawAmount: Decimal;
  deposited: Decimal;
  borrowed: Decimal;
  debtTokenMint: PublicKey;
  selectedTokenMint: PublicKey;
  collTokenMint: PublicKey;
  targetLeverage: Decimal;
  activeTab: FormTabs;
  flashBorrowReserveFlashLoanFeePercentage: Decimal;
  debtBorrowFactorPct: Decimal;
  priceCollToDebt: Decimal;
  priceDebtToColl: Decimal;
}

export interface FormsCalcsResult {
  earned: Decimal;
  totalDeposited: Decimal;
  totalBorrowed: Decimal;
  netValue: Decimal;
  netValueUsd: Decimal;
  ltv: Decimal;
}

export async function calculateMultiplyEffects(
  getPriceByTokenMintDecimal: (mint: PublicKey | string) => Promise<Decimal>,
  {
    depositAmount,
    withdrawAmount,
    deposited,
    borrowed,
    debtTokenMint,
    selectedTokenMint,
    collTokenMint,
    targetLeverage,
    activeTab,
    flashBorrowReserveFlashLoanFeePercentage,
    debtBorrowFactorPct,
    priceCollToDebt,
    priceDebtToColl,
  }: LeverageFormsCalcsArgs
): Promise<FormsCalcsResult> {
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
    flashLoanFee: flashBorrowReserveFlashLoanFeePercentage,
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
    flashLoanFee: flashBorrowReserveFlashLoanFeePercentage, // TODO: is this the right flash borrow?
  });

  console.log(
    'Estimations',
    toJson({
      activeTab,
      depositModeEstimatedDepositAmount,
      depositModeEstimatedBorrowAmount,
      withdrawModeEstimatedDepositTokenWithdrawn,
      withdrawModeEstimatedBorrowTokenWithdrawn,
      adjustModeEstimatedDepositAmount,
      adjustModeEstimateBorrowAmount,
    })
  );

  let [isClosingPosition, totalDeposited, totalBorrowed] = [false, new Decimal(0), new Decimal(0)];

  switch (activeTab) {
    case FormTabs.deposit: {
      // Deposit and Adjust never clos the position
      isClosingPosition = false;
      totalDeposited = deposited.add(depositModeEstimatedDepositAmount);
      totalBorrowed = borrowed.add(depositModeEstimatedBorrowAmount);
      break;
    }
    case FormTabs.close:
    case FormTabs.withdraw: {
      isClosingPosition =
        (withdrawModeEstimatedDepositTokenWithdrawn.gte(new Decimal(deposited)) ||
          withdrawModeEstimatedBorrowTokenWithdrawn.gte(new Decimal(borrowed)) ||
          fuzzyEq(withdrawModeEstimatedDepositTokenWithdrawn, new Decimal(deposited), closingPositionDiffTolerance) ||
          fuzzyEq(withdrawModeEstimatedBorrowTokenWithdrawn, new Decimal(borrowed), closingPositionDiffTolerance)) &&
        !fuzzyEq(withdrawModeEstimatedDepositTokenWithdrawn, new Decimal(0), closingPositionDiffTolerance);

      totalDeposited = isClosingPosition ? new Decimal(0) : deposited.sub(withdrawModeEstimatedDepositTokenWithdrawn);
      totalBorrowed = isClosingPosition ? new Decimal(0) : borrowed.sub(withdrawModeEstimatedBorrowTokenWithdrawn);
      break;
    }
    case FormTabs.adjust: {
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
  flashBorrowFee,
}: {
  depositTokenAmount: Decimal;
  targetLeverage: Decimal;
  priceCollToDebt: Decimal;
  flashBorrowFee: Decimal;
}) => {
  const initialCollAmountInCollToken = depositTokenAmount;

  const finalCollAmountInCollToken = initialCollAmountInCollToken.mul(targetLeverage);
  const finalDebtAmountInCollToken = finalCollAmountInCollToken.sub(initialCollAmountInCollToken);
  const finalDebtAmountInDebtToken = finalDebtAmountInCollToken.mul(priceCollToDebt);

  const flashFeeFactor = new Decimal(1).add(flashBorrowFee);
  const debtTokenToBorrow = finalDebtAmountInDebtToken.mul(flashFeeFactor);

  return debtTokenToBorrow;
};

interface UseEstimateWithdrawAmountsProps {
  priceCollToDebt: Decimal;
  amount: Decimal.Value;
  deposited: Decimal;
  borrowed: Decimal;
  collTokenMint: PublicKey;
  selectedTokenMint: PublicKey;
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
  selectedTokenMint: PublicKey;
  collTokenMint: PublicKey;
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

  const amountToWithdrawDepositToken = selectedTokenMint.equals(collTokenMint)
    ? withdrawAmount
    : withdrawAmount.div(priceCollToDebt);

  const targetDeposit = initialDepositInCollateralToken.minus(amountToWithdrawDepositToken).mul(targetLeverage);

  const targetBorrow = calcBorrowAmount({
    depositTokenAmount: initialDepositInCollateralToken.minus(amountToWithdrawDepositToken),
    priceCollToDebt: new Decimal(priceCollToDebt),
    targetLeverage: new Decimal(targetLeverage),
    flashBorrowFee: new Decimal(0),
  });

  const adjustDepositPosition = currentDepositPosition.minus(targetDeposit);
  const adjustBorrowPosition = currentBorrowPosition.minus(targetBorrow);

  // TODO: add flashLoan fee here in final values
  return {
    adjustDepositPosition,
    adjustBorrowPosition,
  };
}

export const fuzzyEq = (a: Decimal.Value, b: Decimal.Value, epsilon = 0.0001) => {
  return new Decimal(a).sub(b).abs().lte(epsilon);
};

interface UseEstimateAdjustAmountsProps {
  targetLeverage: Decimal;
  debtTokenMint: PublicKey;
  collTokenMint: PublicKey;
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
    flashBorrowFee: flashLoanFee,
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
  selectedTokenMint: PublicKey;
  collTokenMint: PublicKey;
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
  const isDepositingCollToken = selectedTokenMint.equals(collTokenMint);

  const finalCollTokenAmount = isDepositingCollToken
    ? new Decimal(amount).mul(targetLeverage).toNumber()
    : new Decimal(amount).mul(priceDebtToColl).mul(targetLeverage).toNumber();

  const depositCollTokenAmount = isDepositingCollToken ? amount : amount.mul(priceDebtToColl);
  const borrowAmount = calcBorrowAmount({
    depositTokenAmount: depositCollTokenAmount,
    targetLeverage: new Decimal(targetLeverage),
    priceCollToDebt: new Decimal(priceCollToDebt),
    flashBorrowFee: new Decimal(flashLoanFee),
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
