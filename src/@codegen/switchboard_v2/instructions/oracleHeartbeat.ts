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

export interface OracleHeartbeatArgs {
  params: types.OracleHeartbeatParamsFields
}

export interface OracleHeartbeatAccounts {
  oracle: Address
  oracleAuthority: TransactionSigner
  tokenAccount: Address
  gcOracle: Address
  oracleQueue: Address
  permission: Address
  dataBuffer: Address
}

export const layout = borsh.struct([
  types.OracleHeartbeatParams.layout("params"),
])

export function oracleHeartbeat(
  args: OracleHeartbeatArgs,
  accounts: OracleHeartbeatAccounts,
  programAddress: Address = PROGRAM_ID
) {
  const keys: Array<IAccountMeta | IAccountSignerMeta> = [
    { address: accounts.oracle, role: 1 },
    {
      address: accounts.oracleAuthority.address,
      role: 2,
      signer: accounts.oracleAuthority,
    },
    { address: accounts.tokenAccount, role: 0 },
    { address: accounts.gcOracle, role: 1 },
    { address: accounts.oracleQueue, role: 1 },
    { address: accounts.permission, role: 0 },
    { address: accounts.dataBuffer, role: 1 },
  ]
  const identifier = Buffer.from([10, 175, 217, 130, 111, 35, 117, 54])
  const buffer = Buffer.alloc(1000)
  const len = layout.encode(
    {
      params: types.OracleHeartbeatParams.toEncodable(args.params),
    },
    buffer
  )
  const data = Buffer.concat([identifier, buffer]).slice(0, 8 + len)
  const ix: IInstruction = { accounts: keys, programAddress, data }
  return ix
}
