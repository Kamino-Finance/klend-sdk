import { LoanArgs, MarketArgs, ReserveArgs } from './models';
import {
  DEFAULT_RECENT_SLOT_DURATION_MS,
  KaminoMarket,
  KaminoReserve,
  lamportsToNumberDecimal,
} from '@kamino-finance/klend-sdk';
import Decimal from 'decimal.js';
import { FarmState, RewardInfo } from '@hubbleprotocol/farms-sdk';
import { Scope } from '@hubbleprotocol/scope-sdk';
import { aprToApy, KaminoPrices } from '@kamino-finance/kliquidity-sdk';
import { PublicKey } from '@solana/web3.js';

/**
 * Get Kamino Lending Market
 * @param connection
 * @param marketPubkey
 */
export async function getMarket({ connection, marketPubkey }: MarketArgs) {
  const market = await KaminoMarket.load(connection, marketPubkey, DEFAULT_RECENT_SLOT_DURATION_MS);
  if (!market) {
    throw Error(`Could not load market ${marketPubkey.toString()}`);
  }
  return market;
}

/**
 * Get loan for loan (obligation) public key
 * @param args
 */
export async function getLoan(args: LoanArgs) {
  const market = await getMarket(args);
  return market.getObligationByAddress(args.obligationPubkey);
}

export async function loadReserveData({ connection, marketPubkey, reservePubkey }: ReserveArgs) {
  const market = await getMarket({ connection, marketPubkey });
  const reserve = market.getReserveByAddress(reservePubkey);
  if (!reserve) {
    throw Error(`Could not load reserve ${reservePubkey.toString()}`);
  }
  const currentSlot = await connection.getSlot();

  return { market, reserve, currentSlot };
}

/**
 * Get reserve rewards APY
 */
export async function getReserveRewardsApy(args: ReserveArgs) {
  const { market, reserve } = await loadReserveData(args);
  const rewardApys: { rewardApy: Decimal; rewardInfo: RewardInfo }[] = [];

  const oraclePrices = await new Scope('mainnet-beta', args.connection).getOraclePrices();
  const prices = await market.getAllScopePrices(oraclePrices);

  const isDebtReward = reserve.state.farmDebt.equals(args.reservePubkey);
  const farmStates = await FarmState.fetchMultiple(args.connection, [
    reserve.state.farmDebt,
    reserve.state.farmCollateral,
  ]);
  for (const farmState of farmStates.filter((x) => x !== null)) {
    for (const rewardInfo of farmState!.rewardInfos.filter((x) => !x.token.mint.equals(PublicKey.default))) {
      const { apy } = calculateRewardApy(prices, reserve, rewardInfo, isDebtReward);
      rewardApys.push({ rewardApy: apy, rewardInfo });
    }
  }
  return rewardApys;
}

/**
 * Get APY/APR of a farm with rewards
 * @param prices
 * @param reserve
 * @param rewardInfo
 * @param isDebtReward
 */
export function calculateRewardApy(
  prices: KaminoPrices,
  reserve: KaminoReserve,
  rewardInfo: RewardInfo,
  isDebtReward: boolean
) {
  const { decimals } = reserve.stats;
  const totalBorrows = reserve.getBorrowedAmount();
  const totalSupply = reserve.getTotalSupply();
  const mintAddress = reserve.getLiquidityMint();
  const totalAmount = isDebtReward
    ? lamportsToNumberDecimal(totalBorrows, decimals)
    : lamportsToNumberDecimal(totalSupply, decimals);
  const totalValue = totalAmount.mul(prices.spot[mintAddress.toString()].price);
  const rewardPerTimeUnitSecond = getRewardPerTimeUnitSecond(rewardInfo);
  const rewardsInYear = rewardPerTimeUnitSecond.mul(60 * 60 * 24 * 365);
  const rewardsInYearValue = rewardsInYear.mul(prices.spot[rewardInfo.token.mint.toString()].price);
  const apr = rewardsInYearValue.div(totalValue);
  return { apr, apy: aprToApy(apr, 1) };
}

function getRewardPerTimeUnitSecond(reward: RewardInfo) {
  const now = new Decimal(new Date().getTime()).div(1000);
  let rewardPerTimeUnitSecond = new Decimal(0);
  for (let i = 0; i < reward.rewardScheduleCurve.points.length - 1; i++) {
    const { tsStart: tsStartThisPoint, rewardPerTimeUnit } = reward.rewardScheduleCurve.points[i];
    const { tsStart: tsStartNextPoint } = reward.rewardScheduleCurve.points[i + 1];

    const thisPeriodStart = new Decimal(tsStartThisPoint.toString());
    const thisPeriodEnd = new Decimal(tsStartNextPoint.toString());
    const rps = new Decimal(rewardPerTimeUnit.toString());
    if (thisPeriodStart <= now && thisPeriodEnd >= now) {
      rewardPerTimeUnitSecond = rps;
      break;
    } else if (thisPeriodStart > now && thisPeriodEnd > now) {
      rewardPerTimeUnitSecond = rps;
      break;
    }
  }

  const rewardTokenDecimals = reward.token.decimals.toNumber();
  const rewardAmountPerUnitDecimals = new Decimal(10).pow(reward.rewardsPerSecondDecimals.toString());
  const rewardAmountPerUnitLamports = new Decimal(10).pow(rewardTokenDecimals.toString());

  const rpsAdjusted = new Decimal(rewardPerTimeUnitSecond.toString())
    .div(rewardAmountPerUnitDecimals)
    .div(rewardAmountPerUnitLamports);

  return rewardPerTimeUnitSecond ? rpsAdjusted : new Decimal(0);
}
