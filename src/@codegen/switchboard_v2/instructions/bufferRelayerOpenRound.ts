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

export interface BufferRelayerOpenRoundArgs {
  params: types.BufferRelayerOpenRoundParamsFields
}

export interface BufferRelayerOpenRoundAccounts {
  bufferRelayer: Address
  oracleQueue: Address
  dataBuffer: Address
  permission: Address
  escrow: Address
  programState: Address
}

export const layout = borsh.struct([
  types.BufferRelayerOpenRoundParams.layout("params"),
])

export function bufferRelayerOpenRound(
  args: BufferRelayerOpenRoundArgs,
  accounts: BufferRelayerOpenRoundAccounts,
  programAddress: Address = PROGRAM_ID
) {
  const keys: Array<IAccountMeta | IAccountSignerMeta> = [
    { address: accounts.bufferRelayer, role: 1 },
    { address: accounts.oracleQueue, role: 1 },
    { address: accounts.dataBuffer, role: 1 },
    { address: accounts.permission, role: 1 },
    { address: accounts.escrow, role: 1 },
    { address: accounts.programState, role: 0 },
  ]
  const identifier = Buffer.from([192, 42, 231, 189, 35, 172, 51, 9])
  const buffer = Buffer.alloc(1000)
  const len = layout.encode(
    {
      params: types.BufferRelayerOpenRoundParams.toEncodable(args.params),
    },
    buffer
  )
  const data = Buffer.concat([identifier, buffer]).slice(0, 8 + len)
  const ix: IInstruction = { accounts: keys, programAddress, data }
  return ix
}
