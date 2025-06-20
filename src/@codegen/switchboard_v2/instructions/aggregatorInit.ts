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

export interface AggregatorInitArgs {
  params: types.AggregatorInitParamsFields
}

export interface AggregatorInitAccounts {
  aggregator: Address
  authority: Address
  queue: Address
  programState: Address
}

export const layout = borsh.struct([
  types.AggregatorInitParams.layout("params"),
])

export function aggregatorInit(
  args: AggregatorInitArgs,
  accounts: AggregatorInitAccounts,
  programAddress: Address = PROGRAM_ID
) {
  const keys: Array<IAccountMeta | IAccountSignerMeta> = [
    { address: accounts.aggregator, role: 1 },
    { address: accounts.authority, role: 0 },
    { address: accounts.queue, role: 0 },
    { address: accounts.programState, role: 0 },
  ]
  const identifier = Buffer.from([200, 41, 88, 11, 36, 21, 181, 110])
  const buffer = Buffer.alloc(1000)
  const len = layout.encode(
    {
      params: types.AggregatorInitParams.toEncodable(args.params),
    },
    buffer
  )
  const data = Buffer.concat([identifier, buffer]).slice(0, 8 + len)
  const ix: IInstruction = { accounts: keys, programAddress, data }
  return ix
}
