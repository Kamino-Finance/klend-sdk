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

export interface AggregatorSaveResultV2Args {
  params: types.AggregatorSaveResultParamsFields
}

export interface AggregatorSaveResultV2Accounts {
  aggregator: Address
  oracle: Address
  oracleAuthority: TransactionSigner
  oracleQueue: Address
  queueAuthority: Address
  feedPermission: Address
  oraclePermission: Address
  lease: Address
  escrow: Address
  tokenProgram: Address
  programState: Address
  historyBuffer: Address
  mint: Address
}

export const layout = borsh.struct([
  types.AggregatorSaveResultParams.layout("params"),
])

export function aggregatorSaveResultV2(
  args: AggregatorSaveResultV2Args,
  accounts: AggregatorSaveResultV2Accounts,
  programAddress: Address = PROGRAM_ID
) {
  const keys: Array<IAccountMeta | IAccountSignerMeta> = [
    { address: accounts.aggregator, role: 1 },
    { address: accounts.oracle, role: 1 },
    {
      address: accounts.oracleAuthority.address,
      role: 2,
      signer: accounts.oracleAuthority,
    },
    { address: accounts.oracleQueue, role: 0 },
    { address: accounts.queueAuthority, role: 0 },
    { address: accounts.feedPermission, role: 1 },
    { address: accounts.oraclePermission, role: 0 },
    { address: accounts.lease, role: 1 },
    { address: accounts.escrow, role: 1 },
    { address: accounts.tokenProgram, role: 0 },
    { address: accounts.programState, role: 0 },
    { address: accounts.historyBuffer, role: 1 },
    { address: accounts.mint, role: 0 },
  ]
  const identifier = Buffer.from([33, 3, 188, 52, 185, 222, 0, 4])
  const buffer = Buffer.alloc(1000)
  const len = layout.encode(
    {
      params: types.AggregatorSaveResultParams.toEncodable(args.params),
    },
    buffer
  )
  const data = Buffer.concat([identifier, buffer]).slice(0, 8 + len)
  const ix: IInstruction = { accounts: keys, programAddress, data }
  return ix
}
