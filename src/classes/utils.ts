import { SLOTS_PER_SECOND, SLOTS_PER_YEAR, WRAPPED_SOL_MINT } from '../utils';
import Decimal from 'decimal.js';
import { Account, Address } from '@solana/kit';
import axios from 'axios';
import { Token } from '@solana-program/token-2022';

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

export function parseZeroPaddedUtf8(utf8Array: number[]): string {
  for (let last = utf8Array.length - 1; last >= 0; last--) {
    const trailing_zero = utf8Array[last];
    if (trailing_zero != 0) {
      const encoding = new Uint8Array(last + 1);
      for (let i = 0; i <= last; i++) {
        encoding[i] = utf8Array[i];
      }
      return new TextDecoder().decode(encoding);
    }
  }
  return '';
}

export function renderZeroPaddedUtf8(str: string, utf8ArrayLength: number): number[] {
  const encoding = new TextEncoder().encode(str);
  const result = new Array<number>(utf8ArrayLength);
  for (let i = 0; i < result.length; i++) {
    result[i] = i < encoding.length ? encoding[i] : 0;
  }
  return result;
}

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

export function lamportsToDecimal(amount: Decimal.Value, decimals: Decimal.Value): Decimal {
  const factor = new Decimal(10).pow(decimals);
  return new Decimal(amount).div(factor);
}

export const isSolMint = (mint: Address): boolean => {
  return WRAPPED_SOL_MINT === mint;
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

export function sameLengthArrayEquals<T>(left: Array<T>, right: Array<T>): boolean {
  if (left.length != right.length) {
    throw new Error(`Not same length: ${left.length} != ${right.length}`);
  }
  return left.every((value, index) => {
    const other = right[index];
    if (value != null && typeof (value as any).eq === 'function') {
      return (value as any).eq(other);
    }
    return value === other;
  });
}

export function getTokenBalanceFromAccountInfoLamports(token: Account<Token>): Decimal {
  return new Decimal(token.data.amount.toString());
}

export function bpsToPct(bps: Decimal): Decimal {
  return bps.div(100);
}

/**
 * Truncate ( not round ) number to keep up to max amount of decimals
 * @param num
 * @param maxDecimals
 */
export function truncateDecimals(num: Decimal.Value, maxDecimals: number): Decimal {
  const factor = new Decimal(10).pow(maxDecimals);
  return new Decimal(num).times(factor).floor().dividedBy(factor);
}

/**Convert an u8 array to a string */
export function decodeVaultName(token: number[]): string {
  const maxArray = new Uint8Array(token);
  let s: string = new TextDecoder().decode(maxArray);
  // Remove trailing zeros and spaces
  s = s.replace(/[\0 ]+$/, '');
  return s;
}

export function pubkeyHashMapToJson(map: Map<Address, any>): { [key: string]: string } {
  const obj: { [key: string]: any } = {};
  map.forEach((value, key) => {
    obj[key] = value.toString();
  });
  return obj;
}

export function toJson(object: any, inline: boolean = false): string {
  const replacer = (key: any, value: any) => (typeof value === 'bigint' ? value.toString() : value);
  return inline ? JSON.stringify(object, replacer) : JSON.stringify(object, replacer, 2);
}

export function assertNever(x: never): never {
  throw new Error('Unexpected object: ' + x);
}

export function orThrow(message: string): never {
  throw new Error(message);
}

export function blobEquals(left: Uint8Array, right: Uint8Array): boolean {
  if (left.length !== right.length) {
    return false;
  }
  for (let i = 0; i < left.length; ++i) {
    if (left[i] !== right[i]) {
      return false;
    }
  }
  return true;
}

/**
 * Returns an integer {@link Decimal} nearest to the given one.
 *
 * NOTE: the `Decimal.round()` should actually be called `.trunc()` (by default, it uses floor rounding). In most cases,
 * we prefer the traditional behavior (as `Math.round()`).
 */
export function roundNearest(decimal: Decimal): Decimal {
  return decimal.toDecimalPlaces(0, Decimal.ROUND_HALF_CEIL);
}

/**
 * Fetch median slot duration in milliseconds from the last 10 epochs
 */
export async function getMedianSlotDurationInMsFromLastEpochs() {
  const response = await axios.get<{ recentSlotDurationInMs: number }>('https://api.kamino.finance/slots/duration');
  return response.data.recentSlotDurationInMs;
}
