import { TransactionInstruction } from '@solana/web3.js';
import Decimal from 'decimal.js/decimal';

/** the populateLUTIxs should be executed in a separate transaction as we cannot create and populate a lookup table in the same tx */
export type InitVaultIxs = {
  createAtaIfNeededIxs: TransactionInstruction[];
  initVaultIxs: TransactionInstruction[];
  createLUTIx: TransactionInstruction;
  populateLUTIxs: TransactionInstruction[];
  cleanupIxs: TransactionInstruction[];
  initSharesMetadataIx: TransactionInstruction;
};

export type AcceptVaultOwnershipIxs = {
  acceptVaultOwnershipIx: TransactionInstruction;
  initNewLUTIx: TransactionInstruction;
  updateLUTIxs: TransactionInstruction[]; // this has to be executed in a transaction after the initNewLUTIx is executed
};

export type UpdateReserveAllocationIxs = {
  updateReserveAllocationIx: TransactionInstruction;
  updateLUTIxs: TransactionInstruction[];
};

export type WithdrawAndBlockReserveIxs = {
  updateReserveAllocationIxs: TransactionInstruction[];
  investIxs: TransactionInstruction[];
};

export type UpdateVaultConfigIxs = {
  updateVaultConfigIx: TransactionInstruction;
  updateLUTIxs: TransactionInstruction[];
};

/** If there are ixs to setup the LUT it means it doesn't already exist and it needs to be created in a separate tx before inserting into it */
export type SyncVaultLUTIxs = {
  setupLUTIfNeededIxs: TransactionInstruction[];
  syncLUTIxs: TransactionInstruction[];
};

/** If the stakeInFarmIfNeededIxs exist they have to be executed after the deposit so the shares received from the deposit are staked in the vault farm */
export type DepositIxs = {
  depositIxs: TransactionInstruction[];
  stakeInFarmIfNeededIxs: TransactionInstruction[];
};

/** the ixs to unstake shares from farm and withdraw them from the vault. The `unstakeFromFarmIfNeededIxs` should be in the tx before `withdrawIxs`*/
export type WithdrawIxs = {
  unstakeFromFarmIfNeededIxs: TransactionInstruction[];
  withdrawIxs: TransactionInstruction[];
  postWithdrawIxs: TransactionInstruction[]; // wSOL ATA close ix
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
