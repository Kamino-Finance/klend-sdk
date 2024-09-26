import { TransactionInstruction, PublicKey, AccountMeta } from "@solana/web3.js" // eslint-disable-line @typescript-eslint/no-unused-vars
import BN from "bn.js" // eslint-disable-line @typescript-eslint/no-unused-vars
import * as borsh from "@coral-xyz/borsh" // eslint-disable-line @typescript-eslint/no-unused-vars
import * as types from "../types" // eslint-disable-line @typescript-eslint/no-unused-vars
import { PROGRAM_ID } from "../programId"

export interface DeleteReferrerStateAndShortUrlAccounts {
  referrer: PublicKey
  referrerState: PublicKey
  shortUrl: PublicKey
  rent: PublicKey
  systemProgram: PublicKey
}

export function deleteReferrerStateAndShortUrl(
  accounts: DeleteReferrerStateAndShortUrlAccounts,
  programId: PublicKey = PROGRAM_ID
) {
  const keys: Array<AccountMeta> = [
    { pubkey: accounts.referrer, isSigner: true, isWritable: true },
    { pubkey: accounts.referrerState, isSigner: false, isWritable: true },
    { pubkey: accounts.shortUrl, isSigner: false, isWritable: true },
    { pubkey: accounts.rent, isSigner: false, isWritable: false },
    { pubkey: accounts.systemProgram, isSigner: false, isWritable: false },
  ]
  const identifier = Buffer.from([153, 185, 99, 28, 228, 179, 187, 150])
  const data = identifier
  const ix = new TransactionInstruction({ keys, programId, data })
  return ix
}
