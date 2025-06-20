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

export interface OracleQueueSetConfigArgs {
  params: types.OracleQueueSetConfigParamsFields
}

export interface OracleQueueSetConfigAccounts {
  queue: Address
  authority: TransactionSigner
}

export const layout = borsh.struct([
  types.OracleQueueSetConfigParams.layout("params"),
])

export function oracleQueueSetConfig(
  args: OracleQueueSetConfigArgs,
  accounts: OracleQueueSetConfigAccounts,
  programAddress: Address = PROGRAM_ID
) {
  const keys: Array<IAccountMeta | IAccountSignerMeta> = [
    { address: accounts.queue, role: 1 },
    {
      address: accounts.authority.address,
      role: 2,
      signer: accounts.authority,
    },
  ]
  const identifier = Buffer.from([239, 87, 216, 48, 119, 222, 83, 220])
  const buffer = Buffer.alloc(1000)
  const len = layout.encode(
    {
      params: types.OracleQueueSetConfigParams.toEncodable(args.params),
    },
    buffer
  )
  const data = Buffer.concat([identifier, buffer]).slice(0, 8 + len)
  const ix: IInstruction = { accounts: keys, programAddress, data }
  return ix
}
