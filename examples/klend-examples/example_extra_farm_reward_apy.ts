import { address } from '@solana/kit';
import { getExtraFarms, loadReserveData } from '../utils/helpers';
import { getConnectionPool } from '../utils/connection';
import { MAIN_MARKET, PYUSD_MINT } from '../utils/constants';
import { Scope } from '@kamino-finance/scope-sdk';
import { FarmState } from '@kamino-finance/farms-sdk';
import { lamportsToNumberDecimal } from '../../src';
import Decimal from 'decimal.js/decimal';
import { getRewardPerTimeUnitSecond } from '../../src/classes/farm_utils';

(async () => {
  const c = getConnectionPool();
  console.log(`fetching data for market ${MAIN_MARKET.toString()} reserve for ${PYUSD_MINT.toString()}`);
  const extraFarms = await getExtraFarms();
  const xbtcMint = address('CtzPWv73Sn1dMGVU3ZtLv9yWSyUAanBni19YWDaznnkn');
  const xbtcReserveAddress = address('4Hyrqb9Mq7y1wkq4YoqHkPdPx3VQyFY3mxMj67naC1Cb');
  const { market, reserve } = await loadReserveData({
    rpc: c.rpc,
    marketPubkey: MAIN_MARKET,
    reserveAddress: xbtcReserveAddress,
  });
  const scope = new Scope('mainnet-beta', c.rpc);
  const oraclePrices = await scope.getSingleOraclePrices({ feed: 'hubble' });

  const usdcTokenDecimals = 6;
  const xbtcUSdcFarm = address('7z2CBG2eafj6p41gctUPQ9fBD2L6kM6DW8V5SeN34uvK');
  // Find farm per farm address. Farm can also be determined by coll/debt mint pair.
  const farm = extraFarms.find((f) => f.farm === xbtcUSdcFarm);

  if (!farm) {
    throw new Error('Farm not found');
  }

  const farmState = await FarmState.fetch(c.rpc, address(farm.farm));

  if (!farmState) {
    throw new Error('Farm state not found');
  }

  const totalStaked = lamportsToNumberDecimal(farmState?.totalStakedAmount.toString(), usdcTokenDecimals); // this is how much debt there is against the collateral (xBTC)

  const rewardsPerSecond = getRewardPerTimeUnitSecond(
    farmState.rewardInfos[0],
    new Decimal(farmState?.totalStakedAmount.toString())
  );
  const hasAvailableRewards = farmState.rewardInfos[0].rewardsAvailable.gtn(0);
  if (!hasAvailableRewards) {
    console.log('No available rewards');
    return;
  }

  // We get the token price from scope.
  // We need to read the ID from the scope price chain, configured in the reserve.
  const btcOraclePriceEntry = reserve.state.config.tokenInfo.scopeConfiguration.priceChain[0];

  // Based on the entry ID, we can then fetch the price for the respective token.
  // We can skip this calculation when dealing with stablecoins (USDC), and just consider the rewards per second as USD.
  const rewardTokenPrice = new Decimal(oraclePrices.prices[btcOraclePriceEntry].price.value.toString()).div(
    new Decimal(10).pow(oraclePrices.prices[btcOraclePriceEntry].price.exp.toString())
  );

  const rewardsPerSecondUsd = rewardsPerSecond.mul(rewardTokenPrice);
  const secondsPerDay = 60 * 60 * 24;

  const dailyRewards = rewardsPerSecondUsd.mul(secondsPerDay);
  const dailyRewardsApr = dailyRewards.dividedBy(totalStaked);

  const rewardsApy = Decimal.pow(new Decimal(1).plus(dailyRewardsApr), 365).minus(1).toNumber();

  console.log('Rewards APY', rewardsApy);
})().catch(async (e) => {
  console.error(e);
});
