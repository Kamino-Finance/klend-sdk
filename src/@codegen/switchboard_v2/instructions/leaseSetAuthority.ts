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

export interface LeaseSetAuthorityArgs {
  params: types.LeaseSetAuthorityParamsFields
}

export interface LeaseSetAuthorityAccounts {
  lease: Address
  withdrawAuthority: TransactionSigner
  newAuthority: Address
}

export const layout = borsh.struct([
  types.LeaseSetAuthorityParams.layout("params"),
])

export function leaseSetAuthority(
  args: LeaseSetAuthorityArgs,
  accounts: LeaseSetAuthorityAccounts,
  programAddress: Address = PROGRAM_ID
) {
  const keys: Array<IAccountMeta | IAccountSignerMeta> = [
    { address: accounts.lease, role: 1 },
    {
      address: accounts.withdrawAuthority.address,
      role: 2,
      signer: accounts.withdrawAuthority,
    },
    { address: accounts.newAuthority, role: 0 },
  ]
  const identifier = Buffer.from([255, 4, 88, 2, 213, 175, 87, 22])
  const buffer = Buffer.alloc(1000)
  const len = layout.encode(
    {
      params: types.LeaseSetAuthorityParams.toEncodable(args.params),
    },
    buffer
  )
  const data = Buffer.concat([identifier, buffer]).slice(0, 8 + len)
  const ix: IInstruction = { accounts: keys, programAddress, data }
  return ix
}
