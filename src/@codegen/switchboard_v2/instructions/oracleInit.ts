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

export interface OracleInitArgs {
  params: types.OracleInitParamsFields
}

export interface OracleInitAccounts {
  oracle: Address
  oracleAuthority: Address
  wallet: Address
  programState: Address
  queue: Address
  payer: TransactionSigner
  systemProgram: Address
}

export const layout = borsh.struct([types.OracleInitParams.layout("params")])

export function oracleInit(
  args: OracleInitArgs,
  accounts: OracleInitAccounts,
  programAddress: Address = PROGRAM_ID
) {
  const keys: Array<IAccountMeta | IAccountSignerMeta> = [
    { address: accounts.oracle, role: 1 },
    { address: accounts.oracleAuthority, role: 0 },
    { address: accounts.wallet, role: 0 },
    { address: accounts.programState, role: 0 },
    { address: accounts.queue, role: 0 },
    { address: accounts.payer.address, role: 3, signer: accounts.payer },
    { address: accounts.systemProgram, role: 0 },
  ]
  const identifier = Buffer.from([21, 158, 66, 65, 60, 221, 148, 61])
  const buffer = Buffer.alloc(1000)
  const len = layout.encode(
    {
      params: types.OracleInitParams.toEncodable(args.params),
    },
    buffer
  )
  const data = Buffer.concat([identifier, buffer]).slice(0, 8 + len)
  const ix: IInstruction = { accounts: keys, programAddress, data }
  return ix
}
