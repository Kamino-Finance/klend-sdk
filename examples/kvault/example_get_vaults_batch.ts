import { getConnectionPool } from '../utils/connection';
import { getKeypair } from '../utils/keypair';
import { EXAMPLE_USDC_VAULT } from '../utils/constants';
import { getMedianSlotDurationInMsFromLastEpochs, KaminoManager, KaminoVault } from '@kamino-finance/klend-sdk';

(async () => {
  const c = getConnectionPool();
  const user = await getKeypair();

  const slotDuration = await getMedianSlotDurationInMsFromLastEpochs();
  const kaminoManager = new KaminoManager(c.rpc, slotDuration);

  const vault = new KaminoVault(EXAMPLE_USDC_VAULT);
  const vaultState = await vault.getState(c.rpc);

  // read all vaults
  const vaults = await kaminoManager.getAllVaults();
  vaults.forEach((vault) => {
    console.log(`Vault pubkey:`, vault.address.toString());
    console.log(`Vault state:`, vault.state);
  });

  // read all vaults for a specific owner
  const userVaults = await kaminoManager.getAllVaultsForOwner(user.address);
  userVaults.forEach((vault) => {
    console.log(`Vault pubkey:`, vault.address.toString());
    console.log(`Vault state:`, vault.state);
  });

  // get all token accounts that hold shares for a specific vault
  const tokenAccounts = await kaminoManager.getShareTokenAccounts(vaultState.sharesMint);
  tokenAccounts.forEach((tokenAccount) => {
    console.log(`Token account pubkey:`, tokenAccount.pubkey.toString());
    console.log(`Token account state:`, tokenAccount.account);
  });

  // get all vault holders for a vault, alongside their balance
  const vaultHolders = await kaminoManager.getVaultHolders(vault);
  vaultHolders.forEach((balance, holder) => {
    console.log(`Holder pubkey:`, holder.toString());
    console.log(`Balance:`, balance.amount);
  });
})().catch(async (e) => {
  console.error(e);
});
