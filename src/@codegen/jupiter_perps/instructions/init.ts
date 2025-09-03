/* eslint-disable @typescript-eslint/no-unused-vars */
import {
  Address,
  isSome,
  AccountMeta,
  AccountSignerMeta,
  Instruction,
  Option,
  TransactionSigner,
} from "@solana/kit"
/* eslint-enable @typescript-eslint/no-unused-vars */
import BN from "bn.js" // eslint-disable-line @typescript-eslint/no-unused-vars
import * as borsh from "@coral-xyz/borsh" // eslint-disable-line @typescript-eslint/no-unused-vars
import { borshAddress } from "../utils" // eslint-disable-line @typescript-eslint/no-unused-vars
import * as types from "../types" // eslint-disable-line @typescript-eslint/no-unused-vars
import { PROGRAM_ID } from "../programId"

export const DISCRIMINATOR = Buffer.from([220, 59, 207, 236, 108, 250, 47, 100])

export interface InitArgs {
  params: types.InitParamsFields
}

export interface InitAccounts {
  upgradeAuthority: TransactionSigner
  admin: Address
  transferAuthority: Address
  perpetuals: Address
  perpetualsProgram: Address
  perpetualsProgramData: Address
  systemProgram: Address
  tokenProgram: Address
}

export const layout = borsh.struct<InitArgs>([
  types.InitParams.layout("params"),
])

export function init(
  args: InitArgs,
  accounts: InitAccounts,
  remainingAccounts: Array<AccountMeta | AccountSignerMeta> = [],
  programAddress: Address = PROGRAM_ID
) {
  const keys: Array<AccountMeta | AccountSignerMeta> = [
    {
      address: accounts.upgradeAuthority.address,
      role: 3,
      signer: accounts.upgradeAuthority,
    },
    { address: accounts.admin, role: 0 },
    { address: accounts.transferAuthority, role: 1 },
    { address: accounts.perpetuals, role: 1 },
    { address: accounts.perpetualsProgram, role: 0 },
    { address: accounts.perpetualsProgramData, role: 0 },
    { address: accounts.systemProgram, role: 0 },
    { address: accounts.tokenProgram, role: 0 },
    ...remainingAccounts,
  ]
  const buffer = Buffer.alloc(1000)
  const len = layout.encode(
    {
      params: types.InitParams.toEncodable(args.params),
    },
    buffer
  )
  const data = Buffer.concat([DISCRIMINATOR, buffer]).slice(0, 8 + len)
  const ix: Instruction = { accounts: keys, programAddress, data }
  return ix
}
