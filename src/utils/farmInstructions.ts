import {
  decodeUserState,
  FarmState,
  Farms,
  getCloseEmptyUserStateInstruction,
  getCurrentTimeUnit,
  getHarvestRewardInstruction,
  getTreasuryVaultPDA,
  getUserStatePDA,
  TimeUnit,
  UserState,
} from '@kamino-finance/farms-sdk';
import { Address, fetchEncodedAccount, Instruction, Rpc, SolanaRpcApi, TransactionSigner } from '@solana/kit';
import { SYSTEM_PROGRAM_ADDRESS } from '@solana-program/system';
import Decimal from 'decimal.js/decimal';
import type { LedgerInstant } from './ledger';
import { DEFAULT_PUBLIC_KEY } from './pubkey';
import { createAtasIdempotent } from './ata';

/**
 * Builds the Farms instruction that closes an empty user state account.
 * For a non-delegated farm, the user must sign and must receive the account rent lamports.
 */
export function getCloseEmptyUserStateIx(
  signer: TransactionSigner,
  userState: Address,
  farmState: Address,
  rentReceiver: Address,
  farmsProgramId?: Address
) {
  return getCloseEmptyUserStateInstruction(
    {
      signer,
      userState,
      farmState,
      rentReceiver,
      systemProgram: SYSTEM_PROGRAM_ADDRESS,
    },
    farmsProgramId ? { programAddress: farmsProgramId } : undefined
  );
}

function canEmptyUndelegatedUserStateAfterFullUnstake(
  userState: UserState,
  farmState: FarmState,
  willFullyUnstakeUserState: boolean
): boolean {
  const activeStakeWillBeZero =
    userState.activeStakeScaled === 0n || (willFullyUnstakeUserState && farmState.withdrawalCooldownPeriod === 0);

  return (
    farmState.delegateAuthority === DEFAULT_PUBLIC_KEY &&
    activeStakeWillBeZero &&
    userState.pendingWithdrawalUnstakeScaled === 0n &&
    userState.pendingDepositStakeScaled === 0n
  );
}

type CloseUserStateCandidate = {
  farmClient: Farms;
  userStateAddress: Address;
  userState: UserState;
};

async function getCloseUserStateCandidate(
  rpc: Rpc<SolanaRpcApi>,
  user: TransactionSigner,
  farmAddress: Address,
  farmState: FarmState,
  willFullyUnstakeUserState: boolean,
  farmsProgramId?: Address
): Promise<CloseUserStateCandidate | null> {
  const farmClient = new Farms(rpc, farmsProgramId);
  const userStateAddress = await getUserStatePDA(farmClient.getProgramID(), farmAddress, user.address);
  const userStateAccount = await fetchEncodedAccount(rpc, userStateAddress);
  if (!userStateAccount.exists || userStateAccount.programAddress !== farmClient.getProgramID()) {
    return null;
  }

  const userState = decodeUserState(userStateAccount).data;
  if (userState.owner !== user.address || userState.farmState !== farmAddress) {
    return null;
  }

  if (!canEmptyUndelegatedUserStateAfterFullUnstake(userState, farmState, willFullyUnstakeUserState)) {
    return null;
  }

  return { farmClient, userStateAddress, userState };
}

/**
 * Returns a close instruction when the user state is empty or a full unstake will make it empty.
 * An active position must have no configured rewards. This prevents the unstake from creating reward lamports.
 */
export async function getCloseEmptyUserStateIxIfPossible(
  rpc: Rpc<SolanaRpcApi>,
  user: TransactionSigner,
  farmAddress: Address,
  farmState: FarmState,
  currentLedgerInstant: LedgerInstant,
  willFullyUnstakeUserState: boolean,
  farmsProgramId?: Address
): Promise<Instruction | null> {
  const candidate = await getCloseUserStateCandidate(
    rpc,
    user,
    farmAddress,
    farmState,
    willFullyUnstakeUserState,
    farmsProgramId
  );
  if (!candidate) {
    return null;
  }

  const { userStateAddress, userState } = candidate;
  const hasPendingRewardLamports = userState.rewardsIssuedUnclaimed.some((amountLamports) => amountLamports !== 0n);
  if (hasPendingRewardLamports) {
    return null;
  }

  if (userState.activeStakeScaled !== 0n) {
    if (farmState.numRewardTokens !== 0n) {
      return null;
    }

    // A Scope-adjusted farm needs oracle data to calculate accrued rewards. Without it, the SDK cannot prove
    // that the full unstake will leave zero unclaimed reward lamports.
    if (farmState.scopePrices !== DEFAULT_PUBLIC_KEY) {
      return null;
    }

    await getValidatedFarmRewardTimeUnit(farmAddress, farmState, currentLedgerInstant);
  }

  return getCloseEmptyUserStateIx(user, userStateAddress, farmAddress, user.address, farmsProgramId);
}

export type AtomicCloseEmptyUserStateIxs = {
  preUnstakeIxs: Instruction[];
  closeUserStateIx: Instruction;
};

/**
 * Builds reward-collection instructions and an atomic user-state close.
 * Execute `preUnstakeIxs` before a full unstake. Execute `closeUserStateIx` after the KVault withdrawal.
 * Returns `null` when the user state cannot become empty or a required reward is not claimable.
 * @param willFullyUnstakeUserState - Set this to true only when the same transaction removes all active farm stake.
 */
export async function getAtomicCloseEmptyUserStateIxsIfPossible(
  rpc: Rpc<SolanaRpcApi>,
  user: TransactionSigner,
  farmAddress: Address,
  farmState: FarmState,
  currentLedgerInstant: LedgerInstant,
  willFullyUnstakeUserState: boolean,
  payer?: TransactionSigner,
  farmsProgramId?: Address
): Promise<AtomicCloseEmptyUserStateIxs | null> {
  const candidate = await getCloseUserStateCandidate(
    rpc,
    user,
    farmAddress,
    farmState,
    willFullyUnstakeUserState,
    farmsProgramId
  );
  if (!candidate) {
    return null;
  }

  const { farmClient, userStateAddress, userState } = candidate;
  const rewardCount = Number(farmState.numRewardTokens);
  if (!Number.isSafeInteger(rewardCount) || rewardCount < 0 || rewardCount > farmState.rewardInfos.length) {
    return null;
  }
  if (userState.rewardsIssuedUnclaimed.slice(rewardCount).some((amountLamports) => amountLamports !== 0n)) {
    return null;
  }

  const harvestAllRewards = userState.activeStakeScaled !== 0n;
  const rewardIndexes: number[] = [];
  for (let rewardIndex = 0; rewardIndex < rewardCount; rewardIndex++) {
    if (harvestAllRewards || userState.rewardsIssuedUnclaimed[rewardIndex] !== 0n) {
      rewardIndexes.push(rewardIndex);
    }
  }

  if (rewardIndexes.length === 0) {
    return {
      preUnstakeIxs: [],
      closeUserStateIx: getCloseEmptyUserStateIx(user, userStateAddress, farmAddress, user.address, farmsProgramId),
    };
  }

  const currentTimeUnit = await getValidatedFarmRewardTimeUnit(farmAddress, farmState, currentLedgerInstant);
  for (const rewardIndex of rewardIndexes) {
    const rewardInfo = farmState.rewardInfos[rewardIndex];
    const elapsedTimeUnits = currentTimeUnit.sub(userState.lastClaimTs[rewardIndex].toString());
    if (elapsedTimeUnits.lt(rewardInfo.minClaimDurationSeconds.toString())) {
      return null;
    }

    // Claiming rewards in the farm stake token would change the shares to withdraw after planning.
    if (rewardInfo.token.mint === farmState.token.mint) {
      return null;
    }
  }

  const rewardAtas = await createAtasIdempotent(
    user,
    rewardIndexes.map((rewardIndex) => farmState.rewardInfos[rewardIndex].token),
    payer
  );
  const harvestRewardIxs = await Promise.all(
    rewardIndexes.map(async (rewardIndex, index) => {
      const rewardInfo = farmState.rewardInfos[rewardIndex];
      const rewardsTreasuryVault = await getTreasuryVaultPDA(
        farmClient.getProgramID(),
        farmState.globalConfig,
        rewardInfo.token.mint
      );
      return getHarvestRewardInstruction(
        {
          payer: user,
          userState: userStateAddress,
          farmState: farmAddress,
          globalConfig: farmState.globalConfig,
          rewardMint: rewardInfo.token.mint,
          userRewardTokenAccount: rewardAtas[index].ata,
          rewardsVault: rewardInfo.rewardsVault,
          rewardsTreasuryVault,
          farmVaultsAuthority: farmState.farmVaultsAuthority,
          scopePrices: farmState.scopePrices === DEFAULT_PUBLIC_KEY ? undefined : farmState.scopePrices,
          tokenProgram: rewardInfo.token.tokenProgram,
          rewardIndex,
        },
        farmsProgramId ? { programAddress: farmsProgramId } : undefined
      );
    })
  );

  return {
    preUnstakeIxs: [...rewardAtas.map(({ createAtaIx }) => createAtaIx), ...harvestRewardIxs],
    closeUserStateIx: getCloseEmptyUserStateIx(user, userStateAddress, farmAddress, user.address, farmsProgramId),
  };
}

export async function getValidatedFarmRewardTimeUnit(
  farm: Address,
  farmState: FarmState,
  currentLedgerInstant: LedgerInstant
): Promise<Decimal> {
  let timeUnitName: 'block time' | 'slot';
  switch (farmState.timeUnit) {
    case TimeUnit.Seconds:
      timeUnitName = 'block time';
      break;
    case TimeUnit.Slots:
      timeUnitName = 'slot';
      break;
    default:
      throw new Error(`Farm ${farm} has unsupported time unit ${farmState.timeUnit}`);
  }

  const currentTimeUnit = await getCurrentTimeUnit(
    farmState,
    currentLedgerInstant.slot,
    currentLedgerInstant.blockTime
  );
  let latestRewardIssuanceTimeUnit = 0n;
  for (const rewardInfo of farmState.rewardInfos) {
    if (rewardInfo.lastIssuanceTs > latestRewardIssuanceTimeUnit) {
      latestRewardIssuanceTimeUnit = rewardInfo.lastIssuanceTs;
    }
  }

  if (currentTimeUnit.lt(latestRewardIssuanceTimeUnit.toString())) {
    throw new Error(
      `Ledger instant ${timeUnitName} ${currentTimeUnit.toString()} predates farm ${farm} reward state ${timeUnitName} ${latestRewardIssuanceTimeUnit.toString()}. Fetch a newer ledger instant and retry.`
    );
  }

  return currentTimeUnit;
}
