import { Address, Instruction, TransactionSigner } from '@solana/kit';
import Decimal from 'decimal.js/decimal';

/** the populateLUTIxs should be executed in a separate transaction as we cannot create and populate a lookup table in the same tx */
export type InitVaultIxs = {
  createAtaIfNeededIxs: Instruction[];
  initVaultIxs: Instruction[];
  createLUTIx: Instruction;
  populateLUTIxs: Instruction[];
  cleanupIxs: Instruction[];
  initSharesMetadataIx: Instruction;
  createVaultFarm: CreateVaultFarm;
  setFarmToVaultIx: Instruction;
};

export type AcceptVaultOwnershipIxs = {
  acceptVaultOwnershipIx: Instruction;
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
};

export type VaultComputedAllocation = {
  targetUnallocatedAmount: Decimal;
  targetReservesAllocation: Map<Address, Decimal>;
};

/** If there are ixs to setup the LUT it means it doesn't already exist and it needs to be created in a separate tx before inserting into it */
export type SyncVaultLUTIxs = {
  setupLUTIfNeededIxs: Instruction[];
  syncLUTIxs: Instruction[];
};

/** If the stakeInFarmIfNeededIxs exist they have to be executed after the deposit so the shares received from the deposit are staked in the vault farm */
export type DepositIxs = {
  depositIxs: Instruction[];
  stakeInFarmIfNeededIxs: Instruction[];
};

/** the ixs to unstake shares from farm and withdraw them from the vault. The `unstakeFromFarmIfNeededIxs` should be in the tx before `withdrawIxs`*/
export type WithdrawIxs = {
  unstakeFromFarmIfNeededIxs: Instruction[];
  withdrawIxs: Instruction[];
  postWithdrawIxs: Instruction[]; // if needed: wSOL ATA close ix + share ATA close ix
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

export type CreateVaultFarm = {
  farm: TransactionSigner;
  setupFarmIxs: Instruction[];
  updateFarmIxs: Instruction[];
};
