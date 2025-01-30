import { PubkeyHashMap, SLOTS_PER_SECOND, SLOTS_PER_YEAR } from '../utils';
import Decimal from 'decimal.js';
import { AccountInfo, PublicKey } from '@solana/web3.js';
import { MarketOverview, ReserveOverview, SOL_MINTS } from '../lib';
import { AccountLayout } from '@solana/spl-token';
import { ReserveAllocationOverview } from './types';

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

export function sameLengthArrayEquals(left: Array<number>, right: Array<number>): boolean {
  if (left.length != right.length) {
    throw new Error(`Not same length: ${left.length} != ${left.length}`);
  }
  return left.every((value, index) => value === right[index]);
}

export function getTokenBalanceFromAccountInfoLamports(accountInfo: AccountInfo<Buffer>): Decimal {
  // Decode the buffer using the AccountLayout from @solana/spl-token
  const tokenAccountData = AccountLayout.decode(accountInfo.data);

  // Extract the balance from the `amount` field, which is a 64-bit unsigned integer
  const balance = tokenAccountData.amount;

  return new Decimal(balance.toString());
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

export function pubkeyHashMapToJson(map: PubkeyHashMap<PublicKey, any>): { [key: string]: string } {
  const obj: { [key: string]: any } = {};
  map.forEach((value, key) => {
    obj[key.toBase58()] = value.toString();
  });
  return obj;
}

export function printPubkeyHashMap<V>(map: PubkeyHashMap<PublicKey, V>) {
  console.log(pubkeyHashMapToJson(map));
}

export function printReservesOverviewMap(map: PubkeyHashMap<PublicKey, ReserveOverview>) {
  map.forEach((value, key) => {
    console.log('Reserve:', key.toString());
    printReserveOverview(value);
  });
}

export function printReserveOverview(reserveOverview: ReserveOverview) {
  console.log('Total borrowed from reserve:', reserveOverview.totalBorrowedAmount.toString());
  console.log('Borrowed from the supplied amount:', reserveOverview.amountBorrowedFromSupplied.toString());
  console.log('Supplied:', reserveOverview.suppliedAmount.toString());
  console.log('Utilization ratio:', reserveOverview.utilizationRatio.toString());
  console.log('Liquidation Threshold Pct:', reserveOverview.liquidationThresholdPct.toString());
  console.log('Supply APY:', reserveOverview.supplyAPY.toString());
  console.log('Lending market:', reserveOverview.market.toString());
}

export function printMarketsOverviewMap(map: PubkeyHashMap<PublicKey, MarketOverview>) {
  map.forEach((value, key) => {
    console.log('Reserve:', key.toString());
    printMarketOverview(value);
  });
}

export function printMarketOverview(marketOverview: MarketOverview) {
  console.log('Market overview:');
  console.log('  Address:', marketOverview.address.toString());
  console.log('  Min LTV percentage:', marketOverview.minLTVPct.toString());
  console.log('  Max LTV percentage:', marketOverview.maxLTVPct.toString());
  marketOverview.reservesAsCollateral.forEach((reserve, _) => {
    console.log('    Liquidation LTV percentage:', reserve.liquidationLTVPct.toString());
  });
}

export function printReservesAllocationOverviewMap(map: PubkeyHashMap<PublicKey, ReserveAllocationOverview>) {
  map.forEach((value, key) => {
    console.log('Reserve:', key.toString());
    printReserveAllocationOverview(value);
  });
}

export function printReserveAllocationOverview(reserveAllocationOverview: ReserveAllocationOverview) {
  console.log('Reserve allocation overview:');
  console.log('  Target weight:', reserveAllocationOverview.targetWeight.toString());
  console.log('  Token allocation cap:', reserveAllocationOverview.tokenAllocationCap.toString());
  console.log('  Ctoken allocation:', reserveAllocationOverview.ctokenAllocation.toString());
}

export function assertNever(x: never): never {
  throw new Error('Unexpected object: ' + x);
}
