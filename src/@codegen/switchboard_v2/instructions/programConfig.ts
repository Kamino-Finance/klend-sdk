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

export interface ProgramConfigArgs {
  params: types.ProgramConfigParamsFields
}

export interface ProgramConfigAccounts {
  authority: TransactionSigner
  programState: Address
  daoMint: Address
}

export const layout = borsh.struct([types.ProgramConfigParams.layout("params")])

export function programConfig(
  args: ProgramConfigArgs,
  accounts: ProgramConfigAccounts,
  programAddress: Address = PROGRAM_ID
) {
  const keys: Array<IAccountMeta | IAccountSignerMeta> = [
    {
      address: accounts.authority.address,
      role: 2,
      signer: accounts.authority,
    },
    { address: accounts.programState, role: 1 },
    { address: accounts.daoMint, role: 0 },
  ]
  const identifier = Buffer.from([62, 123, 20, 150, 56, 109, 209, 145])
  const buffer = Buffer.alloc(1000)
  const len = layout.encode(
    {
      params: types.ProgramConfigParams.toEncodable(args.params),
    },
    buffer
  )
  const data = Buffer.concat([identifier, buffer]).slice(0, 8 + len)
  const ix: IInstruction = { accounts: keys, programAddress, data }
  return ix
}
