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

export interface VrfPoolAddArgs {
  params: types.VrfPoolAddParamsFields
}

export interface VrfPoolAddAccounts {
  authority: Address
  vrfPool: Address
  vrfLite: Address
  queue: Address
  permission: Address
}

export const layout = borsh.struct([types.VrfPoolAddParams.layout("params")])

export function vrfPoolAdd(
  args: VrfPoolAddArgs,
  accounts: VrfPoolAddAccounts,
  programAddress: Address = PROGRAM_ID
) {
  const keys: Array<IAccountMeta | IAccountSignerMeta> = [
    { address: accounts.authority, role: 0 },
    { address: accounts.vrfPool, role: 1 },
    { address: accounts.vrfLite, role: 1 },
    { address: accounts.queue, role: 0 },
    { address: accounts.permission, role: 0 },
  ]
  const identifier = Buffer.from([234, 143, 61, 230, 212, 57, 8, 234])
  const buffer = Buffer.alloc(1000)
  const len = layout.encode(
    {
      params: types.VrfPoolAddParams.toEncodable(args.params),
    },
    buffer
  )
  const data = Buffer.concat([identifier, buffer]).slice(0, 8 + len)
  const ix: IInstruction = { accounts: keys, programAddress, data }
  return ix
}
