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

export interface JobInitArgs {
  params: types.JobInitParamsFields
}

export interface JobInitAccounts {
  job: TransactionSigner
  authority: TransactionSigner
  programState: Address
  payer: TransactionSigner
  systemProgram: Address
}

export const layout = borsh.struct([types.JobInitParams.layout("params")])

export function jobInit(
  args: JobInitArgs,
  accounts: JobInitAccounts,
  programAddress: Address = PROGRAM_ID
) {
  const keys: Array<IAccountMeta | IAccountSignerMeta> = [
    { address: accounts.job.address, role: 3, signer: accounts.job },
    {
      address: accounts.authority.address,
      role: 2,
      signer: accounts.authority,
    },
    { address: accounts.programState, role: 0 },
    { address: accounts.payer.address, role: 3, signer: accounts.payer },
    { address: accounts.systemProgram, role: 0 },
  ]
  const identifier = Buffer.from([101, 86, 105, 192, 34, 201, 147, 159])
  const buffer = Buffer.alloc(1000)
  const len = layout.encode(
    {
      params: types.JobInitParams.toEncodable(args.params),
    },
    buffer
  )
  const data = Buffer.concat([identifier, buffer]).slice(0, 8 + len)
  const ix: IInstruction = { accounts: keys, programAddress, data }
  return ix
}
