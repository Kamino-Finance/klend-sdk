import BN from 'bn.js';
import { AccountMeta, Address, Instruction, TransactionSigner, UnixTimestamp } from '@solana/kit';
import { DepositAccounts, WithdrawAccounts, WithdrawFromAvailableAccounts } from '../@codegen/kvault/instructions';
import Decimal from 'decimal.js/decimal';

/** the populateLUTIxs should be executed in a separate transaction as we cannot create and populate a lookup table in the same tx */
export type InitVaultIxs = {
  createAtaIfNeededIxs: Instruction[];
  initVaultIxs: Instruction[];
  createLUTIx: Instruction;
  populateLUTIxs: Instruction[];
  cleanupIxs: Instruction[];
  initSharesMetadataIx: Instruction;
  createVaultFarms: CreateVaultFarms;
  setFarmToVaultIxs: SetFarmsToVaultIxs;
};

export type CreateVaultFarms = {
  createVaultFarmIxs: CreateVaultFarm;
  createFLCVaultFarmIxs?: CreateVaultFarm;
};

export type SetFarmsToVaultIxs = {
  setFarmToVaultIx: Instruction;
  setFLCFarmToVaultIx?: Instruction;
};

export type AcceptVaultOwnershipIxs = {
  acceptVaultOwnershipIx: Instruction;
  acceptFLCFarmOwnershipIx?: Instruction;
  initNewLUTIx: Instruction;
  updateLUTIxs: Instruction[]; // this has to be executed in a transaction after the initNewLUTIx is executed
};

export type UpdateReserveAllocationIxs = {
  updateReserveAllocationIx: Instruction;
  updateLUTIxs: Instruction[];
};

export type WithdrawAndBlockReserveIxs = {
  updateReserveAllocationIxs: Instruction[];
  investIxs: Instruction[];
};

export type DisinvestAllReservesIxs = {
  updateReserveAllocationIxs: Instruction[];
  investIxs: Instruction[];
};

export type UpdateVaultConfigIxs = {
  updateVaultConfigIx: Instruction;
  updateLUTIxs: Instruction[];
  extraIxs: Instruction[];
};

export type VaultComputedAllocation = {
  /** Target unallocated amount in token units, not lamports. */
  targetUnallocatedAmount: Decimal;
  /** Target amount per reserve in token units, not lamports. */
  targetReservesAllocation: Map<Address, Decimal>;
};

/** If there are ixs to setup the LUT it means it doesn't already exist and it needs to be created in a separate tx before inserting into it */
export type SyncVaultLUTIxs = {
  setupLUTIfNeededIxs: Instruction[];
  syncLUTIxs: Instruction[];
};

/** If present, execute exactly one of the stake arrays after deposit so the received shares are staked in the selected farm. */
export type DepositIxs = {
  depositIxs: Instruction[];
  stakeInFarmIfNeededIxs: Instruction[];
  stakeInFlcFarmIfNeededIxs: Instruction[]; // if the vault has a firstLossCapital farm, these ixs will stake the shares in the flc farm
};

/** The ixs to unstake shares from the selected farm and withdraw them from the vault. `unstakeFromFarmIfNeededIxs` should come before `withdrawIxs`. */
export type WithdrawIxs = {
  unstakeFromFarmIfNeededIxs: Instruction[];
  withdrawIxs: Instruction[];
  postWithdrawIxs: Instruction[]; // if needed: wSOL ATA close ix + share ATA close ix
};

export type ShareExitLiquidityPlan = {
  shareLamportsToWithdraw: Decimal;
  grossTokenLamportsToWithdraw: Decimal;
  /**
   * Penalty computed once on the aggregate gross amount. The program charges
   * max(bps * gross, flat lamports) per withdraw instruction, so for exits split across multiple
   * reserves the actual total penalty is higher (up to N * flat for N instructions).
   */
  withdrawalPenaltyLamports: Decimal;
  /** Estimate based on the aggregate penalty; overstates the received amount for split reserve exits. */
  netTokenLamportsToWithdraw: Decimal;
  availableTokenLamportsToWithdraw: Decimal;
  reserveTokenLamportsToWithdraw: Map<Address, Decimal>;
  remainingNetTokenLamportsToWithdraw: Decimal;
  burnAllUserShares: boolean;
  canBurnAllUserShares: boolean;
};

/** The shares an user has in a vault (staked and unstaked), in tokens */
export type UserSharesForVault = {
  unstakedShares: Decimal;
  stakedShares: Decimal;
  totalShares: Decimal;
};

export type ReserveAllocationOverview = {
  /** Target allocation weight; unitless relative weight. */
  targetWeight: Decimal;
  /** Token allocation cap from vault state, in vault-token lamports. */
  tokenAllocationCapLamports: Decimal;
  /** Optional ctoken allocation cap from vault state, in ctoken lamports. */
  ctokenAllocationCapLamports?: Decimal;
  /** Current reserve allocation from vault state, in ctoken lamports. */
  ctokenAllocationLamports: Decimal;
  /** @deprecated use tokenAllocationCapLamports. */
  tokenAllocationCap: Decimal;
  /** @deprecated use ctokenAllocationCapLamports. */
  ctokenAllocationCap?: Decimal;
  /** @deprecated use ctokenAllocationLamports. */
  ctokenAllocation: Decimal;
};

export type APYs = {
  grossAPY: Decimal;
  netAPY: Decimal;
};

/** `prerequisiteIxs` (payer token ATA creation and wSOL wrapping, if any) must be executed before `topupIxs`; `cleanupIxs` (wSOL ATA close, if any) after */
export type TopupVaultRewardsIxs = {
  prerequisiteIxs: Instruction[];
  topupIxs: Instruction[];
  cleanupIxs: Instruction[];
};

/** `prerequisiteIxs` (admin token ATA creation, if any) must be executed before `withdrawIxs`; `cleanupIxs` (wSOL ATA close, if any) after */
export type WithdrawVaultRewardsIxs = {
  prerequisiteIxs: Instruction[];
  withdrawIxs: Instruction[];
  cleanupIxs: Instruction[];
};

/** The vault rewards state; rewards are paid in the vault token and increase the share value */
export type VaultRewardsOverview = {
  /** raw reward rate, in token lamports per second */
  rewardPerSecondLamports: Decimal;
  /** reward rate, in tokens per second */
  rewardPerSecondTokens: Decimal;
  /** rewards topped up and not distributed yet, in tokens */
  rewardsAvailableTokens: Decimal;
  /** rewards distributed to depositors since the vault inception, in tokens */
  cumulativeRewardsDistributedTokens: Decimal;
  /** last on-chain rewards issuance checkpoint (updated on distribution, rate change, and topup) */
  lastIssuanceTs: UnixTimestamp;
  /** yearly reward rate relative to the vault AUM; 0 when the stream is paused (rate is 0 or rewards are depleted — a paused stream distributes nothing and never catches up retroactively) or the vault has no net AUM; for percentage it needs multiplication by 100 */
  apr: Decimal;
  /** fixed-emission annualized yield; equal to APR because the token-per-second stream does not compound as AUM grows; for percentage it needs multiplication by 100 */
  apy: Decimal;
};

export type CreateVaultFarm = {
  farm: TransactionSigner;
  setupFarmIxs: Instruction[];
  updateFarmIxs: Instruction[];
};

/// everything in lamports
// the first refresh obligation may not need the dst reserve for the first refresh, but after the first refresh it does as it borrowed from the first reserve
export type RefreshObligationIxs = {
  firstRefreshObligationIx?: Instruction;
  refreshObligationIx?: Instruction;
};

export type VaultReleaseCheckResult = {
  errors: string[];
  warnings: string[];
  success: boolean;
};

export type AllDepositAccounts = {
  depositAccounts: DepositAccounts;
  remainingAccounts: AccountMeta[];
  stakeSharesIxs?: Instruction[];
  stakeInFlcFarmIxs?: Instruction[];
};

export type AllWithdrawAccounts = {
  withdrawAccounts: WithdrawAccounts | WithdrawFromAvailableAccounts;
  remainingAccounts: AccountMeta[];
  unstakeSharesIxs?: Instruction[];
};

export type RedeemInKindReserveIx = {
  ix: Instruction;
  reserve: Address;
  ctokenAmount: BN;
};

export type RedeemInKindIxs = {
  setupIxs: Instruction[];
  redeemInKindIxs: RedeemInKindReserveIx[];
  cleanupIxs: Instruction[];
  luts: Address[];
};

export type WithdrawAndRedeemInKindIxs = {
  withdrawIxs: WithdrawIxs;
  redeemInKindIxs: RedeemInKindIxs;
  /** Shares that could not be exited after routing as much as possible through
   *  withdraw and redeem-in-kind. Zero when the exit is complete. */
  skippedShares: Decimal;
};

export type EnqueueToWithdrawIxs = {
  setupIxs: Instruction[];
  enqueueIxs: Instruction[];
  cleanupIxs: Instruction[];
};

export type WithdrawRedeemAndEnqueueIxs = {
  withdrawIxs: WithdrawIxs;
  redeemInKindIxs: RedeemInKindIxs;
  enqueueIxs: EnqueueToWithdrawIxs;
  /** Shares that could not be exited after routing as much as possible through
   *  withdraw and redeem-in-kind. Zero when the exit is complete. */
  skippedShares: Decimal;
};
