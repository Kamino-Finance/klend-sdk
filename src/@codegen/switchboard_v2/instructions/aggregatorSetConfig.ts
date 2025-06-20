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

export interface AggregatorSetConfigArgs {
  params: types.AggregatorSetConfigParamsFields
}

export interface AggregatorSetConfigAccounts {
  aggregator: Address
  authority: TransactionSigner
}

export const layout = borsh.struct([
  types.AggregatorSetConfigParams.layout("params"),
])

export function aggregatorSetConfig(
  args: AggregatorSetConfigArgs,
  accounts: AggregatorSetConfigAccounts,
  programAddress: Address = PROGRAM_ID
) {
  const keys: Array<IAccountMeta | IAccountSignerMeta> = [
    { address: accounts.aggregator, role: 1 },
    {
      address: accounts.authority.address,
      role: 2,
      signer: accounts.authority,
    },
  ]
  const identifier = Buffer.from([236, 77, 162, 17, 192, 67, 224, 217])
  const buffer = Buffer.alloc(1000)
  const len = layout.encode(
    {
      params: types.AggregatorSetConfigParams.toEncodable(args.params),
    },
    buffer
  )
  const data = Buffer.concat([identifier, buffer]).slice(0, 8 + len)
  const ix: IInstruction = { accounts: keys, programAddress, data }
  return ix
}
