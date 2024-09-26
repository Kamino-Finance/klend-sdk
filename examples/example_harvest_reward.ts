import {
  buildVersionedTransaction,
  sendAndConfirmVersionedTransaction,
} from '@kamino-finance/klend-sdk';
import { getConnection } from './utils/connection';
import { getKeypair } from './utils/keypair';
import { MAIN_MARKET, PYUSD_MINT } from './utils/constants';
import { loadReserveData } from './utils/helpers';
import { Farms } from '@kamino-finance/farms-sdk';

(async () => {
  const connection = getConnection();
  const wallet = getKeypair();

  const farm = new Farms(connection);

  const { market, reserve: pyusdReserve } = await loadReserveData({
    connection,
    marketPubkey: MAIN_MARKET,
    mintPubkey: PYUSD_MINT,
  });

  // Get all farms that the user is eligible to harvest rewards from
  let txInstructions = await farm.claimForUserForFarmAllRewardsIx(
    wallet.publicKey,
    pyusdReserve.state.farmCollateral,
    true
  );

  const tx = await buildVersionedTransaction(connection, wallet.publicKey, [...txInstructions]);

  tx.sign([wallet]);

  const txHash = await sendAndConfirmVersionedTransaction(connection, tx, 'processed', { skipPreflight: true });
  console.log('txHash', txHash);
})().catch(async (e) => {
  console.error(e);
});
