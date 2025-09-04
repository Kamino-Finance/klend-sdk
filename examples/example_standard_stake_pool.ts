import { PublicKey } from '@solana/web3.js';
import { getConnectionPool } from './utils/connection';
import {
  findStakeProgramAddress,
  findTransientStakeProgramAddress,
  getStandardPoolState,
  getValidatorList,
  maybeGetStakedPoolByMint,
} from '@kamino-finance/klend-sdk';
import assert from 'assert';
import BN from 'bn.js';
import { getWithdrawCandidates } from '@kamino-finance/klend-sdk/dist';
import { address } from '@solana/kit';
import { STAKE_POOL_PROGRAM_ID } from '../src/classes/standardStakePool';
import { fromLegacyPublicKey } from '@solana/compat';

(async () => {
  // 1. Fetch stake pool by address
  const c = getConnectionPool();
  const jitoStakePool = address('Jito4APyf642JPZPx3hGc6WWJ8zPKtRbRs4P815Awbb');
  const jitoMint = address('J1toso1uCk3RLmjorhTtrVwY9HJ7X8V9yYac6Y7kGCPn');
  let stakePool = await getStandardPoolState(c.rpc, jitoStakePool);
  console.log(`fetched stake pool with address ${jitoStakePool.toString()} and data ${stakePool.poolMint.toString()}`);
  assert(jitoMint == fromLegacyPublicKey(stakePool.poolMint));
  // 2. Fetch stake pool by mint
  let maybeStakePool = await maybeGetStakedPoolByMint(c.rpc, jitoMint);
  assert(maybeStakePool !== undefined);
  assert(jitoMint == fromLegacyPublicKey(maybeStakePool![0].poolMint));
  assert(jitoStakePool == maybeStakePool![1]);
  // 3. Fetch validator list and print top 5
  let validatorList = await getValidatorList(c.rpc, fromLegacyPublicKey(stakePool.validatorList));
  let activeValidators = 0;
  for (let [i, validator] of validatorList.validators.entries()) {
    if (i < 5 || validator.voteAccountAddress.equals(new PublicKey('J1to2NAwajc8hD6E6kujdQiPn1Bbt2mGKKZLY9kSQKdB'))) {
      let stakeAccount = await findStakeProgramAddress(
        STAKE_POOL_PROGRAM_ID,
        fromLegacyPublicKey(validator.voteAccountAddress),
        jitoStakePool,
        validator.transientSeedSuffixStart.toNumber()
      );
      let stakeBalance = await c.rpc.getBalance(stakeAccount).send();
      let transientAccount = await findTransientStakeProgramAddress(
        STAKE_POOL_PROGRAM_ID,
        fromLegacyPublicKey(validator.voteAccountAddress),
        jitoStakePool,
        validator.transientSeedSuffixEnd
      );
      let transientBalance = await c.rpc.getBalance(transientAccount).send();
      console.log(
        `Validator ${
          i + 1
        }:\n   voteAccount = ${validator.voteAccountAddress.toString()}\n   stakeAccount = ${stakeAccount.toString()}\n   stakeBalance = ${
          stakeBalance.value
        }\n   activeStakeLamports = ${validator.activeStakeLamports.toString()}\n   transientStakeAccount = ${transientAccount.toString()}\n   transientBalance = ${
          transientBalance.value
        }\n   transientStakeLamports = ${validator.transientStakeLamports.toString()}\n   status = ${validator.status.toString()}`
      );
    }
    if (validator.status.toString() === '0') {
      activeValidators += 1;
    }
  }
  console.log(
    `fetched validator list ${stakePool.validatorList.toString()} with ${activeValidators}/${
      validatorList.validators.length
    } active validators`
  );
  assert(validatorList.validators.length >= 1000);
  // 4. Get withdraw candidates when unstaking 1M JITOSOL
  let jitoSolToDeposit = 1_000_000_000_000_000; // 1M JITOSOL
  let withdrawCandidates = await getWithdrawCandidates(c.rpc, stakePool, jitoStakePool, new BN(jitoSolToDeposit));
  console.log(`Got ${withdrawCandidates.length} candidates for withdrawing ${jitoSolToDeposit / 1e9} JITOSOL`);
  for (let [i, candidate] of withdrawCandidates.entries()) {
    let balance = await c.rpc.getBalance(candidate).send();
    console.log(`Candidate ${i} has ${new BN(balance.value.toString()).div(new BN(1e9))} SOL in account ${candidate}`);
  }
})().catch(async (e) => {
  console.error(e);
});
