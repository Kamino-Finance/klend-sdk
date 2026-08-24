import { address } from '@solana/kit';
import { getConnectionPool } from '../utils/connection';
import { getKeypair } from '../utils/keypair';
import {
  getCurrentLedgerInstant,
  getMedianSlotDurationInMsFromLastEpochs,
  KaminoManager,
  KaminoVault,
} from '@kamino-finance/klend-sdk';
import { sendAndConfirmTx } from '../utils/tx';

(async () => {
  const vaultAddress = address('<vault_address>'); // vault
  const wallet = await getKeypair(); // user

  const c = getConnectionPool();

  const slotDuration = await getMedianSlotDurationInMsFromLastEpochs();
  const kaminoManager = new KaminoManager(c.rpc, slotDuration);
  const vault = new KaminoVault(c.rpc, vaultAddress, slotDuration);
  const vaultState = await vault.getState();

  const vaultReservesMap = await kaminoManager.loadVaultReserves(vaultState);
  const claimRewardsIxs = await kaminoManager.getClaimAllRewardsForVaultIxs(
    wallet,
    vault,
    vaultReservesMap,
    await getCurrentLedgerInstant(c.rpc)
  );
  if (claimRewardsIxs.length > 0) {
    await sendAndConfirmTx(c, wallet, claimRewardsIxs, [], [vaultState.vaultLookupTable], 'Claim Rewards');
  } else {
    console.log('No rewards to claim');
  }
})().catch(async (e) => {
  console.error(e);
});
