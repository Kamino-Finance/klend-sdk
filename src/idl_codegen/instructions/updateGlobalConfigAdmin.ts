import { TransactionInstruction, PublicKey, AccountMeta } from "@solana/web3.js" // eslint-disable-line @typescript-eslint/no-unused-vars
import BN from "bn.js" // eslint-disable-line @typescript-eslint/no-unused-vars
import * as borsh from "@coral-xyz/borsh" // eslint-disable-line @typescript-eslint/no-unused-vars
import * as types from "../types" // eslint-disable-line @typescript-eslint/no-unused-vars
import { PROGRAM_ID } from "../programId"

export interface UpdateGlobalConfigAdminAccounts {
  pendingAdmin: PublicKey
  globalConfig: PublicKey
}

export function updateGlobalConfigAdmin(
  accounts: UpdateGlobalConfigAdminAccounts,
  programId: PublicKey = PROGRAM_ID
) {
  const keys: Array<AccountMeta> = [
    { pubkey: accounts.pendingAdmin, isSigner: true, isWritable: false },
    { pubkey: accounts.globalConfig, isSigner: false, isWritable: true },
  ]
  const identifier = Buffer.from([184, 87, 23, 193, 156, 238, 175, 119])
  const data = identifier
  const ix = new TransactionInstruction({ keys, programId, data })
  return ix
}
