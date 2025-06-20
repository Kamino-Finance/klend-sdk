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

export interface OracleWithdrawArgs {
  params: types.OracleWithdrawParamsFields
}

export interface OracleWithdrawAccounts {
  oracle: Address
  oracleAuthority: TransactionSigner
  tokenAccount: Address
  withdrawAccount: Address
  oracleQueue: Address
  permission: Address
  tokenProgram: Address
  programState: Address
  payer: TransactionSigner
  systemProgram: Address
}

export const layout = borsh.struct([
  types.OracleWithdrawParams.layout("params"),
])

export function oracleWithdraw(
  args: OracleWithdrawArgs,
  accounts: OracleWithdrawAccounts,
  programAddress: Address = PROGRAM_ID
) {
  const keys: Array<IAccountMeta | IAccountSignerMeta> = [
    { address: accounts.oracle, role: 1 },
    {
      address: accounts.oracleAuthority.address,
      role: 2,
      signer: accounts.oracleAuthority,
    },
    { address: accounts.tokenAccount, role: 1 },
    { address: accounts.withdrawAccount, role: 1 },
    { address: accounts.oracleQueue, role: 1 },
    { address: accounts.permission, role: 1 },
    { address: accounts.tokenProgram, role: 0 },
    { address: accounts.programState, role: 0 },
    { address: accounts.payer.address, role: 3, signer: accounts.payer },
    { address: accounts.systemProgram, role: 0 },
  ]
  const identifier = Buffer.from([43, 4, 200, 132, 96, 150, 124, 48])
  const buffer = Buffer.alloc(1000)
  const len = layout.encode(
    {
      params: types.OracleWithdrawParams.toEncodable(args.params),
    },
    buffer
  )
  const data = Buffer.concat([identifier, buffer]).slice(0, 8 + len)
  const ix: IInstruction = { accounts: keys, programAddress, data }
  return ix
}
