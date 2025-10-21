import { getConnectionPool } from '../utils/connection';
import { getKeypair } from '../utils/keypair';
import { EXAMPLE_USDC_VAULT, USDC_RESERVE_JLP_MARKET } from '../utils/constants';
import {
  KaminoManager,
  KaminoVault,
  getMedianSlotDurationInMsFromLastEpochs,
  DEFAULT_PUBLIC_KEY,
} from '@kamino-finance/klend-sdk';
import { sendAndConfirmTx } from '../utils/tx';
import { Address } from '@solana/kit';

// to remove a reserve from the allocation, set the weight to 0
(async () => {
  const c = getConnectionPool();
  const wallet = await getKeypair();
  const slotDuration = await getMedianSlotDurationInMsFromLastEpochs();
  const kaminoManager = new KaminoManager(c.rpc, slotDuration);
  const vault = new KaminoVault(c.rpc, EXAMPLE_USDC_VAULT);

  const ixs = await kaminoManager.fullRemoveReserveFromVaultIxs(wallet, vault, USDC_RESERVE_JLP_MARKET);

  const vaultState = await vault.getState();
  const lookupTableAddresses: Address[] = [];
  if (vaultState.vaultLookupTable !== DEFAULT_PUBLIC_KEY) {
    lookupTableAddresses.push(vaultState.vaultLookupTable);
  }

  await sendAndConfirmTx(c, wallet, ixs, [], lookupTableAddresses, 'RemoveVaultAllocation');
  console.log('Vault allocation removed');
})().catch(async (e) => {
  console.error(e);
});
