import { getConnectionPool } from '../utils/connection';
import { getKeypair } from '../utils/keypair';
import { MAIN_MARKET, PYUSD_RESERVE_MAIN_MARKET } from '../utils/constants';
import { loadReserveData } from '../utils/helpers';
import { Farms } from '@kamino-finance/farms-sdk';
import { sendAndConfirmTx } from '../utils/tx';

(async () => {
  const c = getConnectionPool();
  const wallet = await getKeypair();

  const farm = new Farms(c.rpc);

  const { reserve: pyusdReserve } = await loadReserveData({
    rpc: c.rpc,
    marketPubkey: MAIN_MARKET,
    reserveAddress: PYUSD_RESERVE_MAIN_MARKET,
  });

  // Get all farms that the user is eligible to harvest rewards from
  let txInstructions = await farm.claimForUserForFarmAllRewardsIx(wallet, pyusdReserve.state.farmCollateral, true);

  const txHash = await sendAndConfirmTx(c, wallet, txInstructions, [], [], 'harvestReward');
  console.log('txHash', txHash);
})().catch(async (e) => {
  console.error(e);
});
