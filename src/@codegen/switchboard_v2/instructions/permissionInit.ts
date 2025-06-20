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

export interface PermissionInitArgs {
  params: types.PermissionInitParamsFields
}

export interface PermissionInitAccounts {
  permission: Address
  authority: Address
  granter: Address
  grantee: Address
  payer: TransactionSigner
  systemProgram: Address
}

export const layout = borsh.struct([
  types.PermissionInitParams.layout("params"),
])

export function permissionInit(
  args: PermissionInitArgs,
  accounts: PermissionInitAccounts,
  programAddress: Address = PROGRAM_ID
) {
  const keys: Array<IAccountMeta | IAccountSignerMeta> = [
    { address: accounts.permission, role: 1 },
    { address: accounts.authority, role: 0 },
    { address: accounts.granter, role: 0 },
    { address: accounts.grantee, role: 0 },
    { address: accounts.payer.address, role: 3, signer: accounts.payer },
    { address: accounts.systemProgram, role: 0 },
  ]
  const identifier = Buffer.from([177, 116, 201, 233, 16, 2, 11, 179])
  const buffer = Buffer.alloc(1000)
  const len = layout.encode(
    {
      params: types.PermissionInitParams.toEncodable(args.params),
    },
    buffer
  )
  const data = Buffer.concat([identifier, buffer]).slice(0, 8 + len)
  const ix: IInstruction = { accounts: keys, programAddress, data }
  return ix
}
