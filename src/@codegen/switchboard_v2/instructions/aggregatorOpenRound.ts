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

export interface AggregatorOpenRoundArgs {
  params: types.AggregatorOpenRoundParamsFields
}

export interface AggregatorOpenRoundAccounts {
  aggregator: Address
  lease: Address
  oracleQueue: Address
  queueAuthority: Address
  permission: Address
  escrow: Address
  programState: Address
  payoutWallet: Address
  tokenProgram: Address
  dataBuffer: Address
  mint: Address
}

export const layout = borsh.struct([
  types.AggregatorOpenRoundParams.layout("params"),
])

export function aggregatorOpenRound(
  args: AggregatorOpenRoundArgs,
  accounts: AggregatorOpenRoundAccounts,
  programAddress: Address = PROGRAM_ID
) {
  const keys: Array<IAccountMeta | IAccountSignerMeta> = [
    { address: accounts.aggregator, role: 1 },
    { address: accounts.lease, role: 1 },
    { address: accounts.oracleQueue, role: 1 },
    { address: accounts.queueAuthority, role: 0 },
    { address: accounts.permission, role: 1 },
    { address: accounts.escrow, role: 1 },
    { address: accounts.programState, role: 0 },
    { address: accounts.payoutWallet, role: 1 },
    { address: accounts.tokenProgram, role: 0 },
    { address: accounts.dataBuffer, role: 0 },
    { address: accounts.mint, role: 0 },
  ]
  const identifier = Buffer.from([239, 69, 229, 179, 156, 246, 118, 191])
  const buffer = Buffer.alloc(1000)
  const len = layout.encode(
    {
      params: types.AggregatorOpenRoundParams.toEncodable(args.params),
    },
    buffer
  )
  const data = Buffer.concat([identifier, buffer]).slice(0, 8 + len)
  const ix: IInstruction = { accounts: keys, programAddress, data }
  return ix
}
