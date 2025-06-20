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

export interface AggregatorSetAuthorityArgs {
  params: types.AggregatorSetAuthorityParamsFields
}

export interface AggregatorSetAuthorityAccounts {
  aggregator: Address
  authority: TransactionSigner
  newAuthority: Address
}

export const layout = borsh.struct([
  types.AggregatorSetAuthorityParams.layout("params"),
])

export function aggregatorSetAuthority(
  args: AggregatorSetAuthorityArgs,
  accounts: AggregatorSetAuthorityAccounts,
  programAddress: Address = PROGRAM_ID
) {
  const keys: Array<IAccountMeta | IAccountSignerMeta> = [
    { address: accounts.aggregator, role: 1 },
    {
      address: accounts.authority.address,
      role: 2,
      signer: accounts.authority,
    },
    { address: accounts.newAuthority, role: 0 },
  ]
  const identifier = Buffer.from([140, 176, 3, 173, 23, 2, 4, 81])
  const buffer = Buffer.alloc(1000)
  const len = layout.encode(
    {
      params: types.AggregatorSetAuthorityParams.toEncodable(args.params),
    },
    buffer
  )
  const data = Buffer.concat([identifier, buffer]).slice(0, 8 + len)
  const ix: IInstruction = { accounts: keys, programAddress, data }
  return ix
}
