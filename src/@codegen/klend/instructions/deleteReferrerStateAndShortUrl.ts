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

export interface DeleteReferrerStateAndShortUrlAccounts {
  referrer: TransactionSigner
  referrerState: Address
  shortUrl: Address
  rent: Address
  systemProgram: Address
}

export function deleteReferrerStateAndShortUrl(
  accounts: DeleteReferrerStateAndShortUrlAccounts,
  programAddress: Address = PROGRAM_ID
) {
  const keys: Array<IAccountMeta | IAccountSignerMeta> = [
    { address: accounts.referrer.address, role: 3, signer: accounts.referrer },
    { address: accounts.referrerState, role: 1 },
    { address: accounts.shortUrl, role: 1 },
    { address: accounts.rent, role: 0 },
    { address: accounts.systemProgram, role: 0 },
  ]
  const identifier = Buffer.from([153, 185, 99, 28, 228, 179, 187, 150])
  const data = identifier
  const ix: IInstruction = { accounts: keys, programAddress, data }
  return ix
}
