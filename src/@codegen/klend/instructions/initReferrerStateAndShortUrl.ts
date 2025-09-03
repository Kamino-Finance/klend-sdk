/* eslint-disable @typescript-eslint/no-unused-vars */
import {
  Address,
  isSome,
  AccountMeta,
  AccountSignerMeta,
  Instruction,
  Option,
  TransactionSigner,
} from "@solana/kit"
/* eslint-enable @typescript-eslint/no-unused-vars */
import BN from "bn.js" // eslint-disable-line @typescript-eslint/no-unused-vars
import * as borsh from "@coral-xyz/borsh" // eslint-disable-line @typescript-eslint/no-unused-vars
import { borshAddress } from "../utils" // eslint-disable-line @typescript-eslint/no-unused-vars
import * as types from "../types" // eslint-disable-line @typescript-eslint/no-unused-vars
import { PROGRAM_ID } from "../programId"

export const DISCRIMINATOR = Buffer.from([165, 19, 25, 127, 100, 55, 31, 90])

export interface InitReferrerStateAndShortUrlArgs {
  shortUrl: string
}

export interface InitReferrerStateAndShortUrlAccounts {
  referrer: TransactionSigner
  referrerState: Address
  referrerShortUrl: Address
  referrerUserMetadata: Address
  rent: Address
  systemProgram: Address
}

export const layout = borsh.struct<InitReferrerStateAndShortUrlArgs>([
  borsh.str("shortUrl"),
])

export function initReferrerStateAndShortUrl(
  args: InitReferrerStateAndShortUrlArgs,
  accounts: InitReferrerStateAndShortUrlAccounts,
  remainingAccounts: Array<AccountMeta | AccountSignerMeta> = [],
  programAddress: Address = PROGRAM_ID
) {
  const keys: Array<AccountMeta | AccountSignerMeta> = [
    { address: accounts.referrer.address, role: 3, signer: accounts.referrer },
    { address: accounts.referrerState, role: 1 },
    { address: accounts.referrerShortUrl, role: 1 },
    { address: accounts.referrerUserMetadata, role: 0 },
    { address: accounts.rent, role: 0 },
    { address: accounts.systemProgram, role: 0 },
    ...remainingAccounts,
  ]
  const buffer = Buffer.alloc(1000)
  const len = layout.encode(
    {
      shortUrl: args.shortUrl,
    },
    buffer
  )
  const data = Buffer.concat([DISCRIMINATOR, buffer]).slice(0, 8 + len)
  const ix: Instruction = { accounts: keys, programAddress, data }
  return ix
}
