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

export interface ProgramInitArgs {
  params: types.ProgramInitParamsFields
}

export interface ProgramInitAccounts {
  state: Address
  authority: Address
  tokenMint: Address
  vault: Address
  payer: TransactionSigner
  systemProgram: Address
  tokenProgram: Address
  daoMint: Address
}

export const layout = borsh.struct([types.ProgramInitParams.layout("params")])

export function programInit(
  args: ProgramInitArgs,
  accounts: ProgramInitAccounts,
  programAddress: Address = PROGRAM_ID
) {
  const keys: Array<IAccountMeta | IAccountSignerMeta> = [
    { address: accounts.state, role: 1 },
    { address: accounts.authority, role: 0 },
    { address: accounts.tokenMint, role: 1 },
    { address: accounts.vault, role: 1 },
    { address: accounts.payer.address, role: 3, signer: accounts.payer },
    { address: accounts.systemProgram, role: 0 },
    { address: accounts.tokenProgram, role: 0 },
    { address: accounts.daoMint, role: 0 },
  ]
  const identifier = Buffer.from([199, 209, 193, 213, 138, 30, 175, 13])
  const buffer = Buffer.alloc(1000)
  const len = layout.encode(
    {
      params: types.ProgramInitParams.toEncodable(args.params),
    },
    buffer
  )
  const data = Buffer.concat([identifier, buffer]).slice(0, 8 + len)
  const ix: IInstruction = { accounts: keys, programAddress, data }
  return ix
}
