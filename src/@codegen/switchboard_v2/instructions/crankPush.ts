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

export interface CrankPushArgs {
  params: types.CrankPushParamsFields
}

export interface CrankPushAccounts {
  crank: Address
  aggregator: Address
  oracleQueue: Address
  queueAuthority: Address
  permission: Address
  lease: Address
  escrow: Address
  programState: Address
  dataBuffer: Address
}

export const layout = borsh.struct([types.CrankPushParams.layout("params")])

export function crankPush(
  args: CrankPushArgs,
  accounts: CrankPushAccounts,
  programAddress: Address = PROGRAM_ID
) {
  const keys: Array<IAccountMeta | IAccountSignerMeta> = [
    { address: accounts.crank, role: 1 },
    { address: accounts.aggregator, role: 1 },
    { address: accounts.oracleQueue, role: 1 },
    { address: accounts.queueAuthority, role: 0 },
    { address: accounts.permission, role: 0 },
    { address: accounts.lease, role: 1 },
    { address: accounts.escrow, role: 1 },
    { address: accounts.programState, role: 0 },
    { address: accounts.dataBuffer, role: 1 },
  ]
  const identifier = Buffer.from([155, 175, 160, 18, 7, 147, 249, 16])
  const buffer = Buffer.alloc(1000)
  const len = layout.encode(
    {
      params: types.CrankPushParams.toEncodable(args.params),
    },
    buffer
  )
  const data = Buffer.concat([identifier, buffer]).slice(0, 8 + len)
  const ix: IInstruction = { accounts: keys, programAddress, data }
  return ix
}
