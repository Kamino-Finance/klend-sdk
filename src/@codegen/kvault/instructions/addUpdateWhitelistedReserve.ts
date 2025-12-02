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

export const DISCRIMINATOR = Buffer.from([219, 139, 95, 204, 7, 183, 118, 45])

export interface AddUpdateWhitelistedReserveArgs {
  update: types.UpdateReserveWhitelistModeKind
}

export interface AddUpdateWhitelistedReserveAccounts {
  globalAdmin: TransactionSigner
  globalConfig: Address
  reserve: Address
  reserveWhitelistEntry: Address
  systemProgram: Address
}

export const layout = borsh.struct([
  types.UpdateReserveWhitelistMode.layout("update"),
])

export function addUpdateWhitelistedReserve(
  args: AddUpdateWhitelistedReserveArgs,
  accounts: AddUpdateWhitelistedReserveAccounts,
  remainingAccounts: Array<AccountMeta | AccountSignerMeta> = [],
  programAddress: Address = PROGRAM_ID
) {
  const keys: Array<AccountMeta | AccountSignerMeta> = [
    {
      address: accounts.globalAdmin.address,
      role: 3,
      signer: accounts.globalAdmin,
    },
    { address: accounts.globalConfig, role: 0 },
    { address: accounts.reserve, role: 0 },
    { address: accounts.reserveWhitelistEntry, role: 1 },
    { address: accounts.systemProgram, role: 0 },
    ...remainingAccounts,
  ]
  const buffer = Buffer.alloc(1000)
  const len = layout.encode(
    {
      update: args.update.toEncodable(),
    },
    buffer
  )
  const data = Buffer.concat([DISCRIMINATOR, buffer]).slice(0, 8 + len)
  const ix: Instruction = { accounts: keys, programAddress, data }
  return ix
}
