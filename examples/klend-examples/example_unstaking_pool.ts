import { getConnectionPool } from '../utils/connection';
import { StakeAccountInfo, UnstakingPool } from '@kamino-finance/klend-sdk';
import { address } from '@solana/kit';

(async () => {
  // 1. Fetch unstaking pool by address
  const c = getConnectionPool();
  const unstakingPoolPk = address('7p6q43mnCorpgJKYdCvLPiq56Qs2aNPC7wyQghxko5XK');
  let unstakingPool = new UnstakingPool(unstakingPoolPk);
  await unstakingPool.reloadState(c.rpc);
  if (unstakingPool.state) {
    console.log(
      `fetched unstaking pool with address ${unstakingPoolPk.toString()} with unstaking mint ${unstakingPool.state.unstakingSolMint.toString()} and base vault authority ${unstakingPool.state.basePoolAuthority.toString()}`
    );
  }
  const stakeAccounts: Array<StakeAccountInfo> = await unstakingPool.getStakeAccountsForPool(c.rpc);
  console.log(
    `Fetched ${stakeAccounts.length} stake accounts with first ${stakeAccounts[0].pk} having type ${
      stakeAccounts[0].stakeAccount.type
    } staker/withdrawer ${stakeAccounts[0].stakeAccount.info.meta.authorizedStaker}/${
      stakeAccounts[0].stakeAccount.info.meta.authorizedWithdrawer
    } and ${
      stakeAccounts[0].lamports
    } lamports. Deactivating at ${stakeAccounts[0].stakeAccount.info.stake.delegationDeactivationEpoch.toString()}`
  );
})().catch(async (e) => {
  console.error(e);
});
