import { SLOTS_PER_SECOND, SLOTS_PER_YEAR } from '../utils';
import Decimal from 'decimal.js';
import { PublicKey } from '@solana/web3.js';
import { SOL_MINTS } from '../lib';

type ObligationFarmScoreType = {
  obligationId: string;
  balance: string;
  debt: string;
  score: string;
  lastSlot: number;
  tokenMint: string;
  side: 'supply' | 'borrow';
};

type RewardRate = {
  beginningSlot: number;
  rewardRate: string;
  name?: string;
};

function getLatestRewardRate(
  rewardRates: Array<{
    beginningSlot: number;
    rewardRate: string;
    name?: string;
  }>,
  slot: number
) {
  return rewardRates
    .filter((rr) => slot >= rr.beginningSlot)
    .reduce((v1, v2) => (v1.beginningSlot > v2.beginningSlot ? v1 : v2), {
      beginningSlot: 0,
      rewardRate: '0',
    });
}

export const calculateNewScore = (
  rewardStat: {
    lastSlot: number;
    rewardRates: Array<RewardRate>;
    rewardsPerShare: string;
    totalBalance: string;
  },
  pool: ObligationFarmScoreType,
  rewardRate: string,
  endSlot: number,
  startSlot: number
) => {
  const { balance, debt, score } = pool;
  const { rewardsPerShare, totalBalance } = rewardStat;

  const oldDebt = new Decimal(debt);
  const oldScore = new Decimal(score);
  const oldRewardsPerShare = new Decimal(rewardsPerShare);
  const oldBalance = new Decimal(balance);
  const totalBalanceVal = new Decimal(totalBalance);

  const newRewardsPerShare = !totalBalanceVal.isZero()
    ? oldRewardsPerShare.plus(
        new Decimal(endSlot)
          .minus(new Decimal(startSlot.toString()))
          .times(new Decimal(rewardRate))
          .div(totalBalanceVal)
          .div(new Decimal(SLOTS_PER_YEAR))
      )
    : new Decimal(0);

  return oldScore.plus(newRewardsPerShare.times(oldBalance).minus(oldDebt));
};

export const estimateCurrentScore = (
  rewardStat: {
    lastSlot: number;
    rewardRates: Array<RewardRate>;
    rewardsPerShare: string;
    totalBalance: string;
  },
  rewardScore: ObligationFarmScoreType,
  mostRecentSlot: number,
  mostRecentSlotTime: number
) => {
  const { lastSlot, rewardRates } = rewardStat;

  const estimatedCurrentSlot = mostRecentSlot + SLOTS_PER_SECOND * (Date.now() / 1000 - mostRecentSlotTime);

  const { rewardRate } = getLatestRewardRate(rewardRates, estimatedCurrentSlot);

  const currentScore = calculateNewScore(rewardStat, rewardScore, rewardRate, estimatedCurrentSlot, lastSlot);

  return currentScore;
};

export const interpolate = (x: number, x0: number, x1: number, y0: number, y1: number) => {
  if (x > x1) {
    throw 'Cannot do extrapolation';
  }

  return y0 + ((x - x0) * (y1 - y0)) / (x1 - x0);
};

export const getBorrowRate = (currentUtilization: number, curve: [number, number][]): number => {
  let [x0, y0, x1, y1] = [0, 0, 0, 0];

  if (curve.length < 2) {
    throw 'Invalid borrow rate curve, only one point';
  }

  if (currentUtilization > 1) {
    currentUtilization = 1;
  }

  for (let i = 1; i < curve.length; i++) {
    const [pointUtilization, pointRate] = curve[i];
    if (pointUtilization === currentUtilization) {
      return pointRate;
    }

    if (currentUtilization <= pointUtilization) {
      x0 = curve[i - 1][0];
      y0 = curve[i - 1][1];
      x1 = curve[i][0];
      y1 = curve[i][1];
      break;
    }
  }

  if (x0 === 0 && y0 === 0 && x1 === 0 && y1 === 0) {
    console.log('All are 0');
    throw 'Invalid borrow rate curve, could not identify the interpolation points.';
  }

  if (x0 >= x1 || y0 > y1) {
    console.log('(x0, y0), (x1, y1)', x0, y0, x1, y1);
    throw 'Invalid borrow rate curve, curve is not uniformly increasing';
  }

  return interpolate(currentUtilization, x0, x1, y0, y1);
};

export const parseTokenSymbol = (tokenSymbol: number[]): string => {
  return String.fromCharCode(...tokenSymbol.filter((x) => x > 0));
};

export function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function numberToLamportsDecimal(amount: Decimal.Value, decimals: number): Decimal {
  const factor = 10 ** decimals;
  return new Decimal(amount).mul(factor);
}

export function lamportsToNumberDecimal(amount: Decimal.Value, decimals: number): Decimal {
  const factor = 10 ** decimals;
  return new Decimal(amount).div(factor);
}

export const isSolMint = (mint: PublicKey): boolean => {
  return SOL_MINTS.filter((m) => m.equals(mint)).length > 0;
};

export const valueOrZero = (value: Decimal): Decimal => {
  const zero = new Decimal(0);
  if (value.isNaN() || !value.isFinite()) {
    return zero;
  } else {
    return value;
  }
};

export const isEmptyObject = (obj: any) => {
  return Object.keys(obj).length === 0 && obj.constructor === Object;
};

export const positiveOrZero = (value: Decimal): Decimal => {
  const zero = new Decimal(0);
  return Decimal.max(value, zero);
};

export function calculateAPYFromAPR(apr: number) {
  const apy = new Decimal(1).plus(new Decimal(apr).dividedBy(SLOTS_PER_YEAR)).toNumber() ** SLOTS_PER_YEAR - 1;
  return apy;
}

export function calculateAPRFromAPY(apy: Decimal.Value) {
  return new Decimal(apy)
    .plus(1)
    .pow(1 / SLOTS_PER_YEAR)
    .minus(1)
    .times(SLOTS_PER_YEAR);
}
