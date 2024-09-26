import { TransactionInstruction, PublicKey, AccountMeta } from "@solana/web3.js" // eslint-disable-line @typescript-eslint/no-unused-vars
import BN from "bn.js" // eslint-disable-line @typescript-eslint/no-unused-vars
import * as borsh from "@coral-xyz/borsh" // eslint-disable-line @typescript-eslint/no-unused-vars
import * as types from "../types" // eslint-disable-line @typescript-eslint/no-unused-vars
import { PROGRAM_ID } from "../programId"

export interface RefreshObligationAccounts {
  lendingMarket: PublicKey
  obligation: PublicKey
}

export function refreshObligation(
  accounts: RefreshObligationAccounts,
  programId: PublicKey = PROGRAM_ID
) {
  const keys: Array<AccountMeta> = [
    { pubkey: accounts.lendingMarket, isSigner: false, isWritable: false },
    { pubkey: accounts.obligation, isSigner: false, isWritable: true },
  ]
  const identifier = Buffer.from([33, 132, 147, 228, 151, 192, 72, 89])
  const data = identifier
  const ix = new TransactionInstruction({ keys, programId, data })
  return ix
}
