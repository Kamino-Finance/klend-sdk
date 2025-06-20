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

export interface OracleQueueInitArgs {
  params: types.OracleQueueInitParamsFields
}

export interface OracleQueueInitAccounts {
  oracleQueue: TransactionSigner
  authority: Address
  buffer: Address
  payer: TransactionSigner
  systemProgram: Address
  mint: Address
}

export const layout = borsh.struct([
  types.OracleQueueInitParams.layout("params"),
])

export function oracleQueueInit(
  args: OracleQueueInitArgs,
  accounts: OracleQueueInitAccounts,
  programAddress: Address = PROGRAM_ID
) {
  const keys: Array<IAccountMeta | IAccountSignerMeta> = [
    {
      address: accounts.oracleQueue.address,
      role: 3,
      signer: accounts.oracleQueue,
    },
    { address: accounts.authority, role: 0 },
    { address: accounts.buffer, role: 1 },
    { address: accounts.payer.address, role: 3, signer: accounts.payer },
    { address: accounts.systemProgram, role: 0 },
    { address: accounts.mint, role: 0 },
  ]
  const identifier = Buffer.from([250, 226, 231, 111, 158, 164, 27, 136])
  const buffer = Buffer.alloc(1000)
  const len = layout.encode(
    {
      params: types.OracleQueueInitParams.toEncodable(args.params),
    },
    buffer
  )
  const data = Buffer.concat([identifier, buffer]).slice(0, 8 + len)
  const ix: IInstruction = { accounts: keys, programAddress, data }
  return ix
}
