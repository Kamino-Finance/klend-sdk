import { TransactionInstruction, PublicKey, AccountMeta } from "@solana/web3.js" // eslint-disable-line @typescript-eslint/no-unused-vars
import BN from "bn.js" // eslint-disable-line @typescript-eslint/no-unused-vars
import * as borsh from "@coral-xyz/borsh" // eslint-disable-line @typescript-eslint/no-unused-vars
import * as types from "../types" // eslint-disable-line @typescript-eslint/no-unused-vars
import { PROGRAM_ID } from "../programId"

export interface RemoveAllocationAccounts {
  vaultAdminAuthority: PublicKey
  vaultState: PublicKey
  reserve: PublicKey
}

export function removeAllocation(
  accounts: RemoveAllocationAccounts,
  programId: PublicKey = PROGRAM_ID
) {
  const keys: Array<AccountMeta> = [
    { pubkey: accounts.vaultAdminAuthority, isSigner: true, isWritable: true },
    { pubkey: accounts.vaultState, isSigner: false, isWritable: true },
    { pubkey: accounts.reserve, isSigner: false, isWritable: false },
  ]
  const identifier = Buffer.from([32, 220, 211, 141, 209, 231, 73, 76])
  const data = identifier
  const ix = new TransactionInstruction({ keys, programId, data })
  return ix
}
