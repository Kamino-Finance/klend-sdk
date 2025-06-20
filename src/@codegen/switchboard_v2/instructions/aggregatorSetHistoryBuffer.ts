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

export interface AggregatorSetHistoryBufferArgs {
  params: types.AggregatorSetHistoryBufferParamsFields
}

export interface AggregatorSetHistoryBufferAccounts {
  aggregator: Address
  authority: TransactionSigner
  buffer: Address
}

export const layout = borsh.struct([
  types.AggregatorSetHistoryBufferParams.layout("params"),
])

export function aggregatorSetHistoryBuffer(
  args: AggregatorSetHistoryBufferArgs,
  accounts: AggregatorSetHistoryBufferAccounts,
  programAddress: Address = PROGRAM_ID
) {
  const keys: Array<IAccountMeta | IAccountSignerMeta> = [
    { address: accounts.aggregator, role: 1 },
    {
      address: accounts.authority.address,
      role: 2,
      signer: accounts.authority,
    },
    { address: accounts.buffer, role: 1 },
  ]
  const identifier = Buffer.from([88, 49, 214, 242, 229, 44, 171, 52])
  const buffer = Buffer.alloc(1000)
  const len = layout.encode(
    {
      params: types.AggregatorSetHistoryBufferParams.toEncodable(args.params),
    },
    buffer
  )
  const data = Buffer.concat([identifier, buffer]).slice(0, 8 + len)
  const ix: IInstruction = { accounts: keys, programAddress, data }
  return ix
}
