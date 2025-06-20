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

export interface VrfInitArgs {
  params: types.VrfInitParamsFields
}

export interface VrfInitAccounts {
  vrf: Address
  authority: Address
  oracleQueue: Address
  escrow: Address
  programState: Address
  tokenProgram: Address
}

export const layout = borsh.struct([types.VrfInitParams.layout("params")])

export function vrfInit(
  args: VrfInitArgs,
  accounts: VrfInitAccounts,
  programAddress: Address = PROGRAM_ID
) {
  const keys: Array<IAccountMeta | IAccountSignerMeta> = [
    { address: accounts.vrf, role: 1 },
    { address: accounts.authority, role: 0 },
    { address: accounts.oracleQueue, role: 0 },
    { address: accounts.escrow, role: 1 },
    { address: accounts.programState, role: 0 },
    { address: accounts.tokenProgram, role: 0 },
  ]
  const identifier = Buffer.from([241, 76, 92, 234, 230, 240, 164, 0])
  const buffer = Buffer.alloc(1000)
  const len = layout.encode(
    {
      params: types.VrfInitParams.toEncodable(args.params),
    },
    buffer
  )
  const data = Buffer.concat([identifier, buffer]).slice(0, 8 + len)
  const ix: IInstruction = { accounts: keys, programAddress, data }
  return ix
}
