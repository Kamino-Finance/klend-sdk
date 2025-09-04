import {
  STAKE_POOL_PROGRAM_ID as STAKE_POOL_PROGRAM_ID_LEGACY,
  ValidatorList,
  ValidatorListLayout,
} from '@solana/spl-stake-pool';
import { StakePool, StakePoolLayout } from '@solana/spl-stake-pool';
import { CLOCK_PROGRAM_ID, STAKE_POOL_SIZE, STAKE_PROGRAM_ID } from './unstakingPool';
import * as borsh from '@coral-xyz/borsh'; // eslint-disable-line @typescript-eslint/no-unused-vars
import BN from 'bn.js';
import assert from 'assert';
import {
  Address,
  Base58EncodedBytes,
  fetchEncodedAccount,
  fetchEncodedAccounts,
  generateKeyPairSigner,
  GetAccountInfoApi,
  getAddressEncoder,
  GetBalanceApi,
  GetMultipleAccountsApi,
  GetProgramAccountsApi,
  getProgramDerivedAddress,
  AccountMeta,
  AccountSignerMeta,
  KeyPairSigner,
  Rpc,
} from '@solana/kit';
import { fromLegacyPublicKey } from '@solana/compat';
import { getProgramAccounts } from '../utils';
import { getSolBalanceInLamports } from '@kamino-finance/farms-sdk/dist/utils';
import { borshAddress } from '../@codegen/unstaking_pool/utils';

export const TRANSIENT_STAKE_SEED_PREFIX = Buffer.from('transient');
export const STAKE_ACCOUNT_RENT_EXEMPTION: BN = new BN(2_282_880);
export const STAKE_POOL_PROGRAM_ID: Address = fromLegacyPublicKey(STAKE_POOL_PROGRAM_ID_LEGACY);
const MINIMUM_ACTIVE_STAKE: BN = new BN(1_000_000);
// This represents the minimum each validator stake account must have and cannot be withdrawn
const TRANSIENT_STAKE_ACCOUNT_RENT_EXEMPTION: BN = STAKE_ACCOUNT_RENT_EXEMPTION.add(MINIMUM_ACTIVE_STAKE);

export async function getStandardPoolState(rpc: Rpc<GetAccountInfoApi>, address: Address): Promise<StakePool> {
  const accountInfo = await fetchEncodedAccount(rpc, address);
  if (!accountInfo.exists) {
    throw new Error(`Cannot fetch standard stake pool account ${address.toString()}`);
  }
  return StakePoolLayout.decode(Buffer.from(accountInfo.data));
}

export async function getValidatorList(rpc: Rpc<GetAccountInfoApi>, address: Address): Promise<ValidatorList> {
  const accountInfo = await fetchEncodedAccount(rpc, address);
  if (!accountInfo.exists) {
    throw new Error(`Cannot fetch standard stake pool account ${address.toString()}`);
  }
  return ValidatorListLayout.decode(Buffer.from(accountInfo.data));
}

export async function maybeGetStakedPoolByMint(
  rpc: Rpc<GetProgramAccountsApi>,
  mint: Address
): Promise<[StakePool, Address] | undefined> {
  const results = await getProgramAccounts(rpc, STAKE_POOL_PROGRAM_ID, STAKE_POOL_SIZE, [
    { memcmp: { offset: 162n, bytes: mint.toString() as Base58EncodedBytes, encoding: 'base58' } },
  ]);
  // There should be only 1 stake pool for mint
  if (results.length === 0) {
    return undefined;
  }
  if (results.length === 1) {
    return [StakePoolLayout.decode(results[0].data), results[0].address];
  }
  // This should not happen
  throw new Error(`Got ${results.length} stake pools for mint ${mint.toString()} and not sure which one is correct.`);
}

export async function getStandardPoolMintRemainingAccounts(
  rpc: Rpc<GetAccountInfoApi & GetMultipleAccountsApi & GetBalanceApi>,
  stakedSolPool: StakePool,
  stakedSolPoolPk: Address,
  stakedSolToDeposit: BN
): Promise<[Array<AccountMeta | AccountSignerMeta>, Array<KeyPairSigner>]> {
  const withdrawAuthority = await findWithdrawAuthorityProgramAddress(STAKE_POOL_PROGRAM_ID, stakedSolPoolPk);
  const remainingAccounts: Array<AccountMeta | AccountSignerMeta> = [
    { address: stakedSolPoolPk, role: 1 },
    { address: fromLegacyPublicKey(stakedSolPool.validatorList), role: 1 },
    { address: withdrawAuthority, role: 1 },
    { address: fromLegacyPublicKey(stakedSolPool.managerFeeAccount), role: 1 },
    { address: CLOCK_PROGRAM_ID, role: 0 },
    { address: STAKE_PROGRAM_ID, role: 0 },
    { address: STAKE_POOL_PROGRAM_ID, role: 0 },
  ];
  const withdrawCandidates = await getWithdrawCandidates(rpc, stakedSolPool, stakedSolPoolPk, stakedSolToDeposit);
  // Each withdraw candidate should also create a new keypair for the stake account
  const withdrawCandidatesTo: KeyPairSigner[] = [];
  for (const withdrawCandidateFrom of withdrawCandidates) {
    remainingAccounts.push({ address: withdrawCandidateFrom, role: 1 });
    const withdrawCandidateTo = await generateKeyPairSigner();
    remainingAccounts.push({ address: withdrawCandidateTo.address, signer: withdrawCandidateTo, role: 3 });
    withdrawCandidatesTo.push(withdrawCandidateTo);
  }
  return [remainingAccounts, withdrawCandidatesTo];
}

async function getAllWithdrawCandidatesSorted(
  rpc: Rpc<GetAccountInfoApi & GetMultipleAccountsApi & GetBalanceApi>,
  stakedSolPool: StakePool,
  stakedSolPoolPk: Address
): Promise<Array<{ isPreferred: boolean; balance: BN; pk: Address }>> {
  const reserveStake = fromLegacyPublicKey(stakedSolPool.reserveStake);
  const activeValidators: { isPreferred: boolean; balance: BN; pk: Address }[] = [];
  const transientValidators: { isPreferred: boolean; balance: BN; pk: Address }[] = [];
  const validatorList = await getValidatorList(rpc, fromLegacyPublicKey(stakedSolPool.validatorList));
  const accountsToFetch: Address[] = [];
  // Add all accounts to be fetched to an array so that we can use getMultipleAccounts
  for (const validator of validatorList.validators) {
    const stakeAccount = await findStakeProgramAddress(
      STAKE_POOL_PROGRAM_ID,
      fromLegacyPublicKey(validator.voteAccountAddress),
      stakedSolPoolPk,
      validator.transientSeedSuffixStart.toNumber()
    );
    const transientAccount = await findTransientStakeProgramAddress(
      STAKE_POOL_PROGRAM_ID,
      fromLegacyPublicKey(validator.voteAccountAddress),
      stakedSolPoolPk,
      validator.transientSeedSuffixEnd
    );
    accountsToFetch.push(stakeAccount);
    accountsToFetch.push(transientAccount);
  }
  let accountsBalances: Array<BN> = [];
  // TODO: if this is still too slow we can also start all getMultipleAccounts in parallel and do Promise.all
  for (let i = 0; i < accountsToFetch.length; i += 100) {
    const accountInfos = await fetchEncodedAccounts(rpc, accountsToFetch.slice(i, i + 100));
    accountsBalances = accountsBalances.concat(
      accountInfos.map((accountInfo) => (accountInfo.exists ? new BN(accountInfo.lamports.toString()) : new BN(0)))
    );
  }
  assert(accountsBalances.length === accountsToFetch.length);
  let i = 0;
  for (const validator of validatorList.validators) {
    const isPreferred = stakedSolPool.preferredWithdrawValidatorVoteAddress
      ? validator.voteAccountAddress.equals(stakedSolPool.preferredWithdrawValidatorVoteAddress)
      : false;
    const stakeAccount = accountsToFetch[i];
    const stakeAccountBalance = accountsBalances[i].sub(TRANSIENT_STAKE_ACCOUNT_RENT_EXEMPTION);
    if (stakeAccountBalance.gt(new BN(0))) {
      activeValidators.push({ isPreferred, balance: stakeAccountBalance, pk: stakeAccount });
    }
    const transientAccount = accountsToFetch[i + 1];
    const transientAccountBalance = accountsBalances[i + 1].sub(TRANSIENT_STAKE_ACCOUNT_RENT_EXEMPTION);
    if (transientAccountBalance.gt(new BN(0))) {
      transientValidators.push({ isPreferred, balance: transientAccountBalance, pk: transientAccount });
    }
    i += 2;
  }
  // Sorting descending based on balance, but preferred validators should always be used first
  const byPreferrenceAndBalance = (
    a: { isPreferred: boolean; balance: BN; pk: Address },
    b: { isPreferred: boolean; balance: BN; pk: Address }
  ) => {
    // First, sort by isPreferred (preferred validators come first)
    if (a.isPreferred !== b.isPreferred) {
      return a.isPreferred ? -1 : 1;
    }

    // If both have the same preference status, sort by balance (descending)
    return b.balance.cmp(a.balance);
  };
  activeValidators.sort(byPreferrenceAndBalance);
  transientValidators.sort(byPreferrenceAndBalance);
  const allCandidates = activeValidators.concat(transientValidators);

  // Add reserve stake account at the end as that should be used only if no validators have enough stake
  const reserveStakeBalance = new BN(await getSolBalanceInLamports(rpc, reserveStake)).sub(
    STAKE_ACCOUNT_RENT_EXEMPTION
  );
  if (reserveStakeBalance.gt(new BN(0))) {
    allCandidates.push({
      isPreferred: false,
      balance: reserveStakeBalance,
      pk: reserveStake,
    });
  }
  return allCandidates;
}

export async function getWithdrawCandidates(
  rpc: Rpc<GetAccountInfoApi & GetMultipleAccountsApi & GetBalanceApi>,
  stakedSolPool: StakePool,
  stakedSolPoolPk: Address,
  stakedSolToDeposit: BN
): Promise<Array<Address>> {
  const allCandidates = await getAllWithdrawCandidatesSorted(rpc, stakedSolPool, stakedSolPoolPk);

  let stakedSolRemaining = stakedSolToDeposit;
  let solToWithdraw = new BN(0);
  const withdrawCandidates: Array<Address> = [];

  const reserveStake = fromLegacyPublicKey(stakedSolPool.reserveStake);
  // Try to withdraw all of the SOL from validators' active/transient accounts
  for (const candidate of allCandidates) {
    if (stakedSolRemaining.isZero()) {
      break;
    }

    // See how much the validator balance is worth in staked sol
    // but limit to amount of needed stake sol
    let stakedSolAmountToWithdraw = BN.min(
      stakedSolRemaining,
      solToStakePoolTokensWithInverseFee(stakedSolPool, new BN(candidate.balance))
    );
    // Convert it back to staked sol so we get the real amount
    let actualSolAmount = calcLamportsWithdrawAmount(stakedSolPool, stakedSolAmountToWithdraw);

    const remainingSolAmount = calcLamportsWithdrawAmount(
      stakedSolPool,
      stakedSolRemaining.sub(stakedSolAmountToWithdraw)
    );

    // If the current validator uses up all of the remaining staked sol except some minimum that we need
    // in order to split_stake, then leave at least the minimum required to be consumed by another validator
    if (!remainingSolAmount.isZero() && remainingSolAmount < new BN(MINIMUM_ACTIVE_STAKE)) {
      stakedSolAmountToWithdraw = stakedSolAmountToWithdraw.sub(
        solToStakePoolTokensWithInverseFee(stakedSolPool, new BN(MINIMUM_ACTIVE_STAKE))
      );
      actualSolAmount = calcLamportsWithdrawAmount(stakedSolPool, stakedSolAmountToWithdraw);
    }

    if (actualSolAmount < new BN(MINIMUM_ACTIVE_STAKE) && candidate.pk != reserveStake) {
      // Skip if the amount to withdraw is less than the minimum required for a valid stake
      continue;
    }

    // Update stake_pool so simulation stays true to what happens on chain
    stakedSolRemaining = stakedSolRemaining.sub(stakedSolAmountToWithdraw);
    solToWithdraw = solToWithdraw.add(actualSolAmount);
    stakedSolPool.totalLamports = stakedSolPool.totalLamports.sub(actualSolAmount);
    stakedSolPool.poolTokenSupply = stakedSolPool.poolTokenSupply.sub(
      stakePoolTokensMinusFee(stakedSolPool, stakedSolAmountToWithdraw)
    );
    withdrawCandidates.push(candidate.pk);
  }

  return withdrawCandidates;
}

function calcPoolTokensStakeWithdrawalFee(stakedSolPool: StakePool, stakedSolAmountToWithdraw: BN): BN {
  const denominator = stakedSolPool.stakeWithdrawalFee.denominator;
  if (denominator.isZero()) {
    return new BN(0);
  }
  const numerator = stakedSolAmountToWithdraw.mul(stakedSolPool.stakeWithdrawalFee.numerator);
  const poolTokens = numerator.add(denominator).sub(new BN(1)).div(denominator);
  return poolTokens;
}

function stakePoolTokensMinusFee(stakedSolPool: StakePool, stakedSolAmountToWithdraw: BN): BN {
  const stakedSolFee = calcPoolTokensStakeWithdrawalFee(stakedSolPool, stakedSolAmountToWithdraw);
  return stakedSolAmountToWithdraw.sub(stakedSolFee);
}

function solToStakePoolTokensWithInverseFee(stakedSolPool: StakePool, sol: BN): BN {
  let poolTokens = calcPoolTokensForDeposit(stakedSolPool, sol);
  if (!stakedSolPool.stakeWithdrawalFee.numerator.isZero()) {
    const numerator = poolTokens.mul(stakedSolPool.stakeWithdrawalFee.denominator);
    const denominator = stakedSolPool.stakeWithdrawalFee.denominator.sub(stakedSolPool.stakeWithdrawalFee.numerator);
    if (denominator.isZero()) {
      // If the pool has 100% fee for some reason just fail it, we cannot compute the inverse
      throw new Error('Pool fee cannot be 100%');
    }
    poolTokens = numerator.div(denominator);
  }
  return poolTokens;
}

// Below functions/types are not exported from spl-stake-pool

const addressEncoder = getAddressEncoder();
/**
 * Generates the withdraw authority program address for the stake pool
 */
export async function findWithdrawAuthorityProgramAddress(programId: Address, stakePoolAddress: Address) {
  const [publicKey] = await getProgramDerivedAddress({
    seeds: [addressEncoder.encode(stakePoolAddress), Buffer.from('withdraw')],
    programAddress: programId,
  });
  return publicKey;
}

export async function findStakeProgramAddress(
  programId: Address,
  voteAccountAddress: Address,
  stakedSolPoolPk: Address,
  seed: number
): Promise<Address> {
  const [publicKey] = await getProgramDerivedAddress({
    seeds: [
      addressEncoder.encode(voteAccountAddress),
      addressEncoder.encode(stakedSolPoolPk),
      seed ? new BN(seed).toArrayLike(Buffer, 'le', 4) : Buffer.alloc(0),
    ],
    programAddress: programId,
  });
  return publicKey;
}

export async function findTransientStakeProgramAddress(
  programId: Address,
  voteAccountAddress: Address,
  stakePoolAddress: Address,
  seed: BN
) {
  const [publicKey] = await getProgramDerivedAddress({
    seeds: [
      TRANSIENT_STAKE_SEED_PREFIX,
      addressEncoder.encode(voteAccountAddress),
      addressEncoder.encode(stakePoolAddress),
      seed.toArrayLike(Buffer, 'le', 8),
    ],
    programAddress: programId,
  });
  return publicKey;
}

function calcPoolTokensForDeposit(stakePool: StakePool, stakeLamports: BN): BN {
  if (stakePool.poolTokenSupply.isZero() || stakePool.totalLamports.isZero()) {
    return stakeLamports;
  }
  const numerator = stakeLamports.mul(stakePool.poolTokenSupply);
  return numerator.div(stakePool.totalLamports);
}

export function calcLamportsWithdrawAmount(stakePool: StakePool, poolTokens: BN): BN {
  const numerator = poolTokens.mul(stakePool.totalLamports);
  const denominator = stakePool.poolTokenSupply;
  if (numerator.lt(denominator)) {
    return new BN(0);
  }
  return numerator.div(denominator);
}

export class StakeMeta {
  readonly rentExemptReserve: BN;
  readonly authorizedStaker: Address;
  readonly authorizedWithdrawer: Address;
  readonly lockupUnixTimestamp: BN;
  readonly lockupEpoch: BN;
  readonly lockupCustodian: Address;

  static layout(property?: string) {
    return borsh.struct<StakeMeta>(
      [
        borsh.u64('rentExemptReserve'),
        borshAddress('authorizedStaker'),
        borshAddress('authorizedWithdrawer'),
        borsh.i64('lockupUnixTimestamp'),
        borsh.u64('lockupEpoch'),
        borshAddress('lockupCustodian'),
      ],
      property
    );
  }

  constructor(fields: {
    rentExemptReserve: BN;
    authorizedStaker: Address;
    authorizedWithdrawer: Address;
    lockupUnixTimestamp: BN;
    lockupEpoch: BN;
    lockupCustodian: Address;
  }) {
    this.rentExemptReserve = fields.rentExemptReserve;
    this.authorizedStaker = fields.authorizedStaker;
    this.authorizedWithdrawer = fields.authorizedWithdrawer;
    this.lockupUnixTimestamp = fields.lockupUnixTimestamp;
    this.lockupEpoch = fields.lockupEpoch;
    this.lockupCustodian = fields.lockupCustodian;
  }

  static decode(data: Buffer): StakeMeta {
    const dec = StakeMeta.layout().decode(data);

    return new StakeMeta({
      rentExemptReserve: dec.rentExemptReserve,
      authorizedStaker: dec.authorizedStaker,
      authorizedWithdrawer: dec.authorizedWithdrawer,
      lockupUnixTimestamp: dec.lockupUnixTimestamp,
      lockupEpoch: dec.lockupEpoch,
      lockupCustodian: dec.lockupCustodian,
    });
  }
}

export class StakeInfo {
  readonly delegationVoter: Address;
  readonly delegationStake: BN;
  readonly delegationActivationEpoch: BN;
  readonly delegationDeactivationEpoch: BN;
  readonly delegationWarmupCooldownRate: number;
  readonly creditsObserved: BN;

  static layout(property?: string) {
    return borsh.struct<StakeInfo>(
      [
        borshAddress('delegationVoter'),
        borsh.u64('delegationStake'),
        borsh.u64('delegationActivationEpoch'),
        borsh.u64('delegationDeactivationEpoch'),
        borsh.f64('delegationWarmupCooldownRate'),
        borsh.u64('creditsObserved'),
      ],
      property
    );
  }

  constructor(fields: {
    delegationVoter: Address;
    delegationStake: BN;
    delegationActivationEpoch: BN;
    delegationDeactivationEpoch: BN;
    delegationWarmupCooldownRate: number;
    creditsObserved: BN;
  }) {
    this.delegationVoter = fields.delegationVoter;
    this.delegationStake = fields.delegationStake;
    this.delegationActivationEpoch = fields.delegationActivationEpoch;
    this.delegationDeactivationEpoch = fields.delegationDeactivationEpoch;
    this.delegationWarmupCooldownRate = fields.delegationWarmupCooldownRate;
    this.creditsObserved = fields.creditsObserved;
  }

  static decode(data: Buffer): StakeInfo {
    const dec = StakeInfo.layout().decode(data);

    return new StakeInfo({
      delegationVoter: dec.delegationVoter,
      delegationStake: dec.delegationStake,
      delegationActivationEpoch: dec.delegationActivationEpoch,
      delegationDeactivationEpoch: dec.delegationDeactivationEpoch,
      delegationWarmupCooldownRate: dec.delegationWarmupCooldownRate,
      creditsObserved: dec.creditsObserved,
    });
  }
}

export class SmallStakeAccountInfo {
  readonly meta: StakeMeta;
  readonly stake: StakeInfo;

  static layout(property?: string) {
    return borsh.struct<SmallStakeAccountInfo>([StakeMeta.layout('meta'), StakeInfo.layout('stake')], property);
  }

  constructor(fields: { meta: StakeMeta; stake: StakeInfo }) {
    this.meta = fields.meta;
    this.stake = fields.stake;
  }

  static decode(data: Buffer): SmallStakeAccountInfo {
    const dec = SmallStakeAccountInfo.layout().decode(data);

    return new SmallStakeAccountInfo({
      meta: dec.meta,
      stake: dec.stake,
    });
  }
}

export class StakeAccount {
  readonly type: number;
  readonly info: SmallStakeAccountInfo;

  static readonly layout = borsh.struct<StakeAccount>([borsh.u32('type'), SmallStakeAccountInfo.layout('info')]);

  constructor(fields: { type: number; info: SmallStakeAccountInfo }) {
    this.type = fields.type;
    this.info = fields.info;
  }

  static decode(data: Buffer): StakeAccount {
    const dec = StakeAccount.layout.decode(data);

    return new StakeAccount({
      type: dec.type,
      info: dec.info,
    });
  }
}
