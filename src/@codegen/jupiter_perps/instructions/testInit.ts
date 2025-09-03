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

export const DISCRIMINATOR = Buffer.from([48, 51, 92, 122, 81, 19, 112, 41])

export interface TestInitArgs {
  params: types.TestInitParamsFields
}

export interface TestInitAccounts {
  upgradeAuthority: TransactionSigner
  admin: Address
  transferAuthority: Address
  perpetuals: Address
  systemProgram: Address
  tokenProgram: Address
}

export const layout = borsh.struct<TestInitArgs>([
  types.TestInitParams.layout("params"),
])

export function testInit(
  args: TestInitArgs,
  accounts: TestInitAccounts,
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
    { address: accounts.systemProgram, role: 0 },
    { address: accounts.tokenProgram, role: 0 },
    ...remainingAccounts,
  ]
  const buffer = Buffer.alloc(1000)
  const len = layout.encode(
    {
      params: types.TestInitParams.toEncodable(args.params),
    },
    buffer
  )
  const data = Buffer.concat([DISCRIMINATOR, buffer]).slice(0, 8 + len)
  const ix: Instruction = { accounts: keys, programAddress, data }
  return ix
}
