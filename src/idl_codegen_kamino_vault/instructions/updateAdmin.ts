import { TransactionInstruction, PublicKey, AccountMeta } from "@solana/web3.js" // eslint-disable-line @typescript-eslint/no-unused-vars
import BN from "bn.js" // eslint-disable-line @typescript-eslint/no-unused-vars
import * as borsh from "@coral-xyz/borsh" // eslint-disable-line @typescript-eslint/no-unused-vars
import * as types from "../types" // eslint-disable-line @typescript-eslint/no-unused-vars
import { PROGRAM_ID } from "../programId"

export interface UpdateAdminAccounts {
  pendingAdmin: PublicKey
  vaultState: PublicKey
}

export function updateAdmin(
  accounts: UpdateAdminAccounts,
  programId: PublicKey = PROGRAM_ID
) {
  const keys: Array<AccountMeta> = [
    { pubkey: accounts.pendingAdmin, isSigner: true, isWritable: true },
    { pubkey: accounts.vaultState, isSigner: false, isWritable: true },
  ]
  const identifier = Buffer.from([161, 176, 40, 213, 60, 184, 179, 228])
  const data = identifier
  const ix = new TransactionInstruction({ keys, programId, data })
  return ix
}
