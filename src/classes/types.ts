import { TransactionInstruction } from '@solana/web3.js';
import Decimal from 'decimal.js/decimal';

/** the populateLUTIxs should be executed in a separate transaction as we cannot create and populate a lookup table in the same tx */
export type InitVaultIxs = {
  initVaultIxs: TransactionInstruction[];
  populateLUTIxs: TransactionInstruction[];
};

export type AcceptVaultOwnershipIxs = {
  acceptVaultOwnershipIx: TransactionInstruction;
  updateLUTIxs: TransactionInstruction[];
};

export type UpdateReserveAllocationIxs = {
  updateReserveAllocationIx: TransactionInstruction;
  updateLUTIxs: TransactionInstruction[];
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

export type DepositIxs = {
  depositIxs: TransactionInstruction[];
  stakeInFarmIfNeededIxs: TransactionInstruction[];
};

export type WithdrawIxs = {
  unstakeFromFarmIfNeededIxs: TransactionInstruction[];
  withdrawIxs: TransactionInstruction[];
};

/** The shares an user has in a vault (staked and unstaked), in tokens */
export type UserSharesForVault = {
  unstakedShares: Decimal;
  stakedShares: Decimal;
};
