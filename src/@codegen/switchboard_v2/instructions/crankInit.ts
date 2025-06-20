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

export interface CrankInitArgs {
  params: types.CrankInitParamsFields
}

export interface CrankInitAccounts {
  crank: TransactionSigner
  queue: Address
  buffer: Address
  payer: TransactionSigner
  systemProgram: Address
}

export const layout = borsh.struct([types.CrankInitParams.layout("params")])

export function crankInit(
  args: CrankInitArgs,
  accounts: CrankInitAccounts,
  programAddress: Address = PROGRAM_ID
) {
  const keys: Array<IAccountMeta | IAccountSignerMeta> = [
    { address: accounts.crank.address, role: 3, signer: accounts.crank },
    { address: accounts.queue, role: 0 },
    { address: accounts.buffer, role: 1 },
    { address: accounts.payer.address, role: 3, signer: accounts.payer },
    { address: accounts.systemProgram, role: 0 },
  ]
  const identifier = Buffer.from([57, 179, 94, 136, 82, 79, 25, 185])
  const buffer = Buffer.alloc(1000)
  const len = layout.encode(
    {
      params: types.CrankInitParams.toEncodable(args.params),
    },
    buffer
  )
  const data = Buffer.concat([identifier, buffer]).slice(0, 8 + len)
  const ix: IInstruction = { accounts: keys, programAddress, data }
  return ix
}
