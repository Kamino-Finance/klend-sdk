import { address } from '@solana/kit';
import { getConnectionPool } from '../utils/connection';
import { getKeypair } from '../utils/keypair';
import { getMedianSlotDurationInMsFromLastEpochs, KaminoManager, KaminoVault } from '@kamino-finance/klend-sdk';
import { sendAndConfirmTx } from '../utils/tx';

(async () => {
  const vaultAddress = address('<vault_address>'); // vault
  const wallet = await getKeypair(); // user

  const c = getConnectionPool();

  const slotDuration = await getMedianSlotDurationInMsFromLastEpochs();
  const kaminoManager = new KaminoManager(c.rpc, slotDuration);
  const vault = new KaminoVault(c.rpc, vaultAddress);
  const vaultState = await vault.getState();

  const claimRewardsIxs = await kaminoManager.getClaimAllRewardsForVaultIxs(wallet, vault);
  if (claimRewardsIxs.length > 0) {
    await sendAndConfirmTx(c, wallet, claimRewardsIxs, [], [vaultState.vaultLookupTable], 'Claim Rewards');
  } else {
    console.log('No rewards to claim');
  }
})().catch(async (e) => {
  console.error(e);
});
