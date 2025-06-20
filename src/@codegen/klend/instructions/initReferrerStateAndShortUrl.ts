/* eslint-disable @typescript-eslint/no-unused-vars */
import {
  Address,
  isSome,
  IAccountMeta,
  IAccountSignerMeta,
  IInstruction,
  Option,
  TransactionSigner,
} from "@solana/kit"
/* eslint-enable @typescript-eslint/no-unused-vars */
import BN from "bn.js" // eslint-disable-line @typescript-eslint/no-unused-vars
import * as borsh from "@coral-xyz/borsh" // eslint-disable-line @typescript-eslint/no-unused-vars
import { borshAddress } from "../utils" // eslint-disable-line @typescript-eslint/no-unused-vars
import * as types from "../types" // eslint-disable-line @typescript-eslint/no-unused-vars
import { PROGRAM_ID } from "../programId"

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

export const layout = borsh.struct([borsh.str("shortUrl")])

export function initReferrerStateAndShortUrl(
  args: InitReferrerStateAndShortUrlArgs,
  accounts: InitReferrerStateAndShortUrlAccounts,
  programAddress: Address = PROGRAM_ID
) {
  const keys: Array<IAccountMeta | IAccountSignerMeta> = [
    { address: accounts.referrer.address, role: 3, signer: accounts.referrer },
    { address: accounts.referrerState, role: 1 },
    { address: accounts.referrerShortUrl, role: 1 },
    { address: accounts.referrerUserMetadata, role: 0 },
    { address: accounts.rent, role: 0 },
    { address: accounts.systemProgram, role: 0 },
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
  const ix: IInstruction = { accounts: keys, programAddress, data }
  return ix
}
