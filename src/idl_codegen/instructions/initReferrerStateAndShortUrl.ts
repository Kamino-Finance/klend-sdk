import { TransactionInstruction, PublicKey, AccountMeta } from "@solana/web3.js" // eslint-disable-line @typescript-eslint/no-unused-vars
import BN from "bn.js" // eslint-disable-line @typescript-eslint/no-unused-vars
import * as borsh from "@coral-xyz/borsh" // eslint-disable-line @typescript-eslint/no-unused-vars
import * as types from "../types" // eslint-disable-line @typescript-eslint/no-unused-vars
import { PROGRAM_ID } from "../programId"

export interface InitReferrerStateAndShortUrlArgs {
  shortUrl: string
}

export interface InitReferrerStateAndShortUrlAccounts {
  referrer: PublicKey
  referrerState: PublicKey
  referrerShortUrl: PublicKey
  referrerUserMetadata: PublicKey
  rent: PublicKey
  systemProgram: PublicKey
}

export const layout = borsh.struct([borsh.str("shortUrl")])

export function initReferrerStateAndShortUrl(
  args: InitReferrerStateAndShortUrlArgs,
  accounts: InitReferrerStateAndShortUrlAccounts,
  programId: PublicKey = PROGRAM_ID
) {
  const keys: Array<AccountMeta> = [
    { pubkey: accounts.referrer, isSigner: true, isWritable: true },
    { pubkey: accounts.referrerState, isSigner: false, isWritable: true },
    { pubkey: accounts.referrerShortUrl, isSigner: false, isWritable: true },
    {
      pubkey: accounts.referrerUserMetadata,
      isSigner: false,
      isWritable: false,
    },
    { pubkey: accounts.rent, isSigner: false, isWritable: false },
    { pubkey: accounts.systemProgram, isSigner: false, isWritable: false },
  ]
  const identifier = Buffer.from([165, 19, 25, 127, 100, 55, 31, 90])
  const buffer = Buffer.alloc(1000)
  const len = layout.encode(
    {
      shortUrl: args.shortUrl,
    },
    buffer
  )
  const data = Buffer.concat([identifier, buffer]).slice(0, 8 + len)
  const ix = new TransactionInstruction({ keys, programId, data })
  return ix
}
