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

export interface AggregatorSetResolutionModeArgs {
  params: types.AggregatorSetResolutionModeParamsFields
}

export interface AggregatorSetResolutionModeAccounts {
  aggregator: Address
  authority: TransactionSigner
  slidingWindow: Address
  payer: TransactionSigner
  systemProgram: Address
}

export const layout = borsh.struct([
  types.AggregatorSetResolutionModeParams.layout("params"),
])

export function aggregatorSetResolutionMode(
  args: AggregatorSetResolutionModeArgs,
  accounts: AggregatorSetResolutionModeAccounts,
  programAddress: Address = PROGRAM_ID
) {
  const keys: Array<IAccountMeta | IAccountSignerMeta> = [
    { address: accounts.aggregator, role: 1 },
    {
      address: accounts.authority.address,
      role: 2,
      signer: accounts.authority,
    },
    { address: accounts.slidingWindow, role: 1 },
    { address: accounts.payer.address, role: 3, signer: accounts.payer },
    { address: accounts.systemProgram, role: 0 },
  ]
  const identifier = Buffer.from([194, 248, 179, 97, 237, 24, 9, 110])
  const buffer = Buffer.alloc(1000)
  const len = layout.encode(
    {
      params: types.AggregatorSetResolutionModeParams.toEncodable(args.params),
    },
    buffer
  )
  const data = Buffer.concat([identifier, buffer]).slice(0, 8 + len)
  const ix: IInstruction = { accounts: keys, programAddress, data }
  return ix
}
