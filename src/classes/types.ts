import { TransactionInstruction } from "@solana/web3.js"


/** the populateLUTIxs should be executed in a separate transaction as we cannot create and populate a lookup table in the same tx */
export type InitVaultIxs = {
    initVaultIxs: TransactionInstruction[];
    populateLUTIxs: TransactionInstruction[];
}

export type AcceptVaultOwnershipIxs = {
    acceptVaultOwnershipIx: TransactionInstruction;
    updateLUTIxs: TransactionInstruction[];
}

export type UpdateReserveAllocationIxs = {
    updateReserveAllocationIx: TransactionInstruction;
    updateLUTIxs: TransactionInstruction[];
}

export type UpdateVaultConfigIxs = {
    updateVaultConfigIx: TransactionInstruction;
    updateLUTIxs: TransactionInstruction[];
}

export type SyncVaultLUTIxs = {
    setupLUTIfNeededIxs: TransactionInstruction[];
    syncLUTIxs: TransactionInstruction[];
}
