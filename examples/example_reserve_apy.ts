import { ReserveArgs } from './utils/models';
import Decimal from 'decimal.js';
import { FarmState, RewardInfo } from '@hubbleprotocol/farms-sdk';
import { Scope } from '@hubbleprotocol/scope-sdk';
import { PublicKey } from '@solana/web3.js';
import { getConnection } from './utils/connection';
import { MAIN_MARKET, PYUSD_RESERVE } from './utils/constants';
import { getReserveRewardsApy, loadReserveData } from './utils/helpers';

/**
 * Get current reserve APY (supply/borrow APY + rewards APY)
 */
export async function getReserveApy(args: ReserveArgs) {
  const { reserve, currentSlot } = await loadReserveData(args);
  const supplyApy = reserve.totalSupplyAPY(currentSlot);
  const borrowApy = reserve.totalBorrowAPY(currentSlot);
  const rewardApys = await getReserveRewardsApy(args);
  return { supplyApy, borrowApy, rewardApys };
}

(async () => {
  const connection = getConnection();
  console.log(`fetching data for market ${MAIN_MARKET.toString()} reserve ${PYUSD_RESERVE.toString()}`);
  const { borrowApy, rewardApys, supplyApy } = await getReserveApy({
    connection,
    marketPubkey: MAIN_MARKET,
    reservePubkey: PYUSD_RESERVE,
  });
  console.log('borrow APY:', borrowApy);
  console.log('supply APY', supplyApy);
  for (const rewardApy of rewardApys) {
    console.log(`reward token ${rewardApy.rewardInfo.token.mint.toString()} APY`, rewardApy.rewardApy.toNumber());
  }
})().catch(async (e) => {
  console.error(e);
});
