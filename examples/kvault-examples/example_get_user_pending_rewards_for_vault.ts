import { getConnectionPool } from '../utils/connection';
import { address } from '@solana/kit';
import { getMedianSlotDurationInMsFromLastEpochs, KaminoManager, KaminoVault } from '@kamino-finance/klend-sdk';

/// there are 3 types of rewards and here we have example of reading all of them
/// 1. vault farm where the vault shares are staked
/// 2. vault delegated farm
/// 3. farms of the reserves into which the vault is allocated
(async () => {
  const user = address('Ej51XVghq4KyzVCBT7butTPqGjJFns7zSqUR8sH6GdAA'); // user address
  const vaultAddress = address('A2wsxhA7pF4B2UKVfXocb6TAAP9ipfPJam6oMKgDE5BK'); // vault address

  const c = getConnectionPool();
  const slotDuration = await getMedianSlotDurationInMsFromLastEpochs();
  const kaminoManager = new KaminoManager(c.rpc, slotDuration);

  const vault = new KaminoVault(c.rpc, vaultAddress);

  const pendingRewards = await kaminoManager.getAllPendingRewardsForUserInVault(user, vault);
  console.log('Total pending rewards:', pendingRewards.totalPendingRewards);
  console.log('Pending rewards in vault farm:', pendingRewards.pendingRewardsInVaultFarm);
  console.log('Pending rewards in vault delegated farm:', pendingRewards.pendingRewardsInVaultDelegatedFarm);
  console.log('Pending rewards in vault reserves farms:', pendingRewards.pendingRewardsInVaultReservesFarms);
})().catch(console.error);
