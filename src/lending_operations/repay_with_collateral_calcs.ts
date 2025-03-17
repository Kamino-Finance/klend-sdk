import Decimal from 'decimal.js';
import { KaminoMarket, KaminoObligation, KaminoReserve, numberToLamportsDecimal } from '../classes';
import { PublicKey } from '@solana/web3.js';
import { lamportsToDecimal } from '../classes/utils';
import { MaxWithdrawLtvCheck, getMaxWithdrawLtvCheck } from './repay_with_collateral_operations';

export function calcRepayAmountWithSlippage(
  kaminoMarket: KaminoMarket,
  debtReserve: KaminoReserve,
  currentSlot: number,
  obligation: KaminoObligation,
  amount: Decimal,
  referrer: PublicKey
): {
  repayAmount: Decimal;
  repayAmountLamports: Decimal;
  flashRepayAmountLamports: Decimal;
} {
  const irSlippageBpsForDebt = obligation
    .estimateObligationInterestRate(
      kaminoMarket,
      debtReserve,
      obligation.state.borrows.find((borrow) => borrow.borrowReserve.equals(debtReserve.address))!,
      currentSlot
    )
    .toDecimalPlaces(debtReserve.state.liquidity.mintDecimals.toNumber(), Decimal.ROUND_CEIL);
  // add 0.1% to irSlippageBpsForDebt because we don't want to estimate slightly less than SC and end up not reapying enough
  const repayAmountIrAdjusted = amount
    .mul(irSlippageBpsForDebt.mul(new Decimal('1.001')))
    .toDecimalPlaces(debtReserve.state.liquidity.mintDecimals.toNumber(), Decimal.ROUND_CEIL);

  let repayAmount: Decimal;
  // Ensure when repaying close to the full amount, we repay the full amount as otherwise we might end up having a small amount left
  if (
    repayAmountIrAdjusted.greaterThanOrEqualTo(
      lamportsToDecimal(
        obligation.borrows.get(debtReserve.address)?.amount || new Decimal(0),
        debtReserve.stats.decimals
      )
    )
  ) {
    repayAmount = repayAmountIrAdjusted;
  } else {
    repayAmount = amount;
  }

  const repayAmountLamports = numberToLamportsDecimal(repayAmount, debtReserve.stats.decimals);

  const { flashRepayAmountLamports } = calcFlashRepayAmount({
    reserve: debtReserve,
    referralFeeBps: kaminoMarket.state.referralFeeBps,
    hasReferral: !referrer.equals(PublicKey.default),
    flashBorrowAmountLamports: repayAmountLamports,
  });
  return { repayAmount, repayAmountLamports, flashRepayAmountLamports };
}

export const calcFlashRepayAmount = (props: {
  reserve: KaminoReserve;
  referralFeeBps: number;
  hasReferral: boolean;
  flashBorrowAmountLamports: Decimal;
}): {
  flashRepayAmountLamports: Decimal;
} => {
  const { reserve, referralFeeBps, hasReferral, flashBorrowAmountLamports } = props;
  const { referrerFees, protocolFees } = reserve.calculateFlashLoanFees(
    flashBorrowAmountLamports,
    referralFeeBps,
    hasReferral
  );
  const flashRepayAmountLamports = flashBorrowAmountLamports.add(referrerFees).add(protocolFees);

  return {
    flashRepayAmountLamports,
  };
};

export function calcMaxWithdrawCollateral(
  market: KaminoMarket,
  obligation: KaminoObligation,
  collReserveAddr: PublicKey,
  debtReserveAddr: PublicKey,
  repayAmountLamports: Decimal
): {
  repayAmountLamports: Decimal;
  withdrawableCollLamports: Decimal;
  canWithdrawAllColl: boolean;
  repayingAllDebt: boolean;
} {
  const deposit = obligation.getDepositByReserve(collReserveAddr)!;
  const borrow = obligation.getBorrowByReserve(debtReserveAddr)!;
  const depositReserve = market.getReserveByAddress(deposit.reserveAddress)!;
  const debtReserve = market.getReserveByAddress(borrow.reserveAddress)!;
  const depositTotalLamports = deposit.amount.floor();

  const remainingBorrowLamports = borrow.amount.sub(repayAmountLamports).ceil();
  const remainingBorrowAmount = remainingBorrowLamports.div(debtReserve.getMintFactor());
  let remainingBorrowsValue = remainingBorrowAmount.mul(debtReserve.getOracleMarketPrice());
  if (obligation.getBorrows().length > 1) {
    remainingBorrowsValue = obligation
      .getBorrows()
      .filter((p) => !p.reserveAddress.equals(borrow.reserveAddress))
      .reduce((acc, b) => acc.add(b.marketValueRefreshed), new Decimal('0'));
  }
  const maxWithdrawLtvCheck = getMaxWithdrawLtvCheck(obligation);

  let remainingDepositsValueWithLtv = new Decimal('0');
  if (obligation.getDeposits().length > 1) {
    remainingDepositsValueWithLtv = obligation
      .getDeposits()
      .filter((p) => !p.reserveAddress.equals(deposit.reserveAddress))
      .reduce((acc, d) => {
        const { maxLtv, liquidationLtv } = obligation.getLtvForReserve(
          market,
          market.getReserveByAddress(d.reserveAddress)!
        );
        const maxWithdrawLtv =
          maxWithdrawLtvCheck === MaxWithdrawLtvCheck.LIQUIDATION_THRESHOLD ? liquidationLtv : maxLtv;
        return acc.add(d.marketValueRefreshed.mul(maxWithdrawLtv));
      }, new Decimal('0'));
  }

  // can withdraw all coll
  if (remainingDepositsValueWithLtv.gte(remainingBorrowsValue)) {
    return {
      repayAmountLamports: repayAmountLamports,
      withdrawableCollLamports: depositTotalLamports,
      canWithdrawAllColl: true,
      repayingAllDebt: repayAmountLamports.gte(borrow.amount),
    };
  } else {
    const { maxLtv: collMaxLtv, liquidationLtv: collLiquidationLtv } = obligation.getLtvForReserve(
      market,
      market.getReserveByAddress(depositReserve.address)!
    );
    const maxWithdrawLtv =
      maxWithdrawLtvCheck === MaxWithdrawLtvCheck.LIQUIDATION_THRESHOLD ? collLiquidationLtv : collMaxLtv;
    const numerator = deposit.marketValueRefreshed
      .mul(maxWithdrawLtv)
      .add(remainingDepositsValueWithLtv)
      .sub(remainingBorrowsValue);

    const denominator = depositReserve.getOracleMarketPrice().mul(maxWithdrawLtv);
    const maxCollWithdrawAmount = numerator.div(denominator);
    const withdrawableCollLamports = maxCollWithdrawAmount.mul(depositReserve.getMintFactor()).floor();

    return {
      repayAmountLamports: repayAmountLamports,
      withdrawableCollLamports,
      canWithdrawAllColl: false,
      repayingAllDebt: repayAmountLamports.gte(borrow.amount),
    };
  }
}

export function estimateDebtRepaymentWithColl(props: {
  collAmount: Decimal; // in decimals
  priceDebtToColl: Decimal;
  slippagePct: Decimal;
  flashBorrowReserveFlashLoanFeePercentage: Decimal;
  kaminoMarket: KaminoMarket;
  debtTokenMint: PublicKey;
  obligation: KaminoObligation;
  currentSlot: number;
}): Decimal {
  const {
    collAmount,
    priceDebtToColl,
    slippagePct,
    flashBorrowReserveFlashLoanFeePercentage,
    kaminoMarket,
    debtTokenMint,
    obligation,
    currentSlot,
  } = props;
  const slippage = slippagePct.div('100');
  const flashLoanFee = flashBorrowReserveFlashLoanFeePercentage.div('100');
  const debtReserve = kaminoMarket.getReserveByMint(debtTokenMint);
  if (debtReserve === undefined) {
    throw new Error('Debt reserve not found');
  }

  const debtAfterSwap = collAmount.div(new Decimal(1.0).add(slippage)).div(priceDebtToColl);
  const debtAfterFlashLoanRepay = debtAfterSwap.div(new Decimal(1.0).add(flashLoanFee));

  const irSlippageBpsForDebt = obligation
    .estimateObligationInterestRate(
      kaminoMarket,
      debtReserve,
      obligation?.state.borrows.find((borrow) => borrow.borrowReserve?.equals(debtReserve.address))!,
      currentSlot
    )
    .toDecimalPlaces(debtReserve.state.liquidity.mintDecimals.toNumber(), Decimal.ROUND_CEIL);

  // Estimate slightly more, by adding 1% to IR in order to avoid the case where UI users can repay the max we allow them
  const debtIrAdjusted = debtAfterFlashLoanRepay
    .div(irSlippageBpsForDebt.mul(new Decimal('1.01')))
    .toDecimalPlaces(debtReserve.state.liquidity.mintDecimals.toNumber(), Decimal.ROUND_CEIL);

  return debtIrAdjusted;
}

export function estimateCollNeededForDebtRepayment(props: {
  debtAmount: Decimal; // in decimals
  priceDebtToColl: Decimal;
  slippagePct: Decimal;
  flashBorrowReserveFlashLoanFeePercentage: Decimal;
}): Decimal {
  const {
    debtAmount, // in decimals
    priceDebtToColl,
    slippagePct,
    flashBorrowReserveFlashLoanFeePercentage,
  } = props;
  const slippage = slippagePct.div('100');
  const flashLoanFee = flashBorrowReserveFlashLoanFeePercentage.div('100');

  const debtFlashLoanRepay = debtAmount.mul(new Decimal(1.0).add(flashLoanFee));
  const collToSwap = debtFlashLoanRepay.mul(new Decimal(1.0).add(slippage)).mul(priceDebtToColl);

  return collToSwap;
}
