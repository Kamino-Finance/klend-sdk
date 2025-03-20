import { getConnection } from '../utils/connection';
import { getKeypair } from '../utils/keypair';
import { EXAMPLE_USDC_VAULT } from '../utils/constants';
import { getMedianSlotDurationInMsFromLastEpochs, KaminoManager, KaminoVault } from '../../src/lib';

(async () => {
  const connection = getConnection();
  const user = getKeypair();
  const slotDuration = await getMedianSlotDurationInMsFromLastEpochs();

  const kaminoManager = new KaminoManager(connection, slotDuration);

  const vault = new KaminoVault(EXAMPLE_USDC_VAULT);
  const vaultState = await vault.getState(connection);

  // read how many shares an user has in a specific vault
  const userShares = await kaminoManager.getUserSharesBalanceSingleVault(user.publicKey, vault);
  console.log('User shares:', userShares);

  // read how many shares an user has in all vaults
  const userSharesAllVaults = await kaminoManager.getUserSharesBalanceAllVaults(user.publicKey);
  userSharesAllVaults.forEach((shares, vault) => {
    console.log(`User shares in ${vault}:`, shares);
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
