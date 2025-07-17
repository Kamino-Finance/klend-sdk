import { Address, IInstruction } from '@solana/kit';
import Decimal from 'decimal.js/decimal';

/** the populateLUTIxs should be executed in a separate transaction as we cannot create and populate a lookup table in the same tx */
export type InitVaultIxs = {
  createAtaIfNeededIxs: IInstruction[];
  initVaultIxs: IInstruction[];
  createLUTIx: IInstruction;
  populateLUTIxs: IInstruction[];
  cleanupIxs: IInstruction[];
  initSharesMetadataIx: IInstruction;
};

export type AcceptVaultOwnershipIxs = {
  acceptVaultOwnershipIx: IInstruction;
  initNewLUTIx: IInstruction;
  updateLUTIxs: IInstruction[]; // this has to be executed in a transaction after the initNewLUTIx is executed
};

export type UpdateReserveAllocationIxs = {
  updateReserveAllocationIx: IInstruction;
  updateLUTIxs: IInstruction[];
};

export type WithdrawAndBlockReserveIxs = {
  updateReserveAllocationIxs: IInstruction[];
  investIxs: IInstruction[];
};

export type DisinvestAllReservesIxs = {
  updateReserveAllocationIxs: IInstruction[];
  investIxs: IInstruction[];
};

export type UpdateVaultConfigIxs = {
  updateVaultConfigIx: IInstruction;
  updateLUTIxs: IInstruction[];
};

export type VaultComputedAllocation = {
  targetUnallocatedAmount: Decimal;
  targetReservesAllocation: Map<Address, Decimal>;
};

/** If there are ixs to setup the LUT it means it doesn't already exist and it needs to be created in a separate tx before inserting into it */
export type SyncVaultLUTIxs = {
  setupLUTIfNeededIxs: IInstruction[];
  syncLUTIxs: IInstruction[];
};

/** If the stakeInFarmIfNeededIxs exist they have to be executed after the deposit so the shares received from the deposit are staked in the vault farm */
export type DepositIxs = {
  depositIxs: IInstruction[];
  stakeInFarmIfNeededIxs: IInstruction[];
};

/** the ixs to unstake shares from farm and withdraw them from the vault. The `unstakeFromFarmIfNeededIxs` should be in the tx before `withdrawIxs`*/
export type WithdrawIxs = {
  unstakeFromFarmIfNeededIxs: IInstruction[];
  withdrawIxs: IInstruction[];
  postWithdrawIxs: IInstruction[]; // if needed: wSOL ATA close ix + share ATA close ix
};

/** The shares an user has in a vault (staked and unstaked), in tokens */
export type UserSharesForVault = {
  unstakedShares: Decimal;
  stakedShares: Decimal;
  totalShares: Decimal;
};

export type ReserveAllocationOverview = {
  targetWeight: Decimal;
  tokenAllocationCap: Decimal;
  ctokenAllocation: Decimal;
};

export type APYs = {
  grossAPY: Decimal;
  netAPY: Decimal;
};
