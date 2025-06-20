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

export const layout = borsh.struct([types.TestInitParams.layout("params")])

export function testInit(
  args: TestInitArgs,
  accounts: TestInitAccounts,
  programAddress: Address = PROGRAM_ID
) {
  const keys: Array<IAccountMeta | IAccountSignerMeta> = [
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
  ]
  const identifier = Buffer.from([48, 51, 92, 122, 81, 19, 112, 41])
  const buffer = Buffer.alloc(1000)
  const len = layout.encode(
    {
      params: types.TestInitParams.toEncodable(args.params),
    },
    buffer
  )
  const data = Buffer.concat([identifier, buffer]).slice(0, 8 + len)
  const ix: IInstruction = { accounts: keys, programAddress, data }
  return ix
}
