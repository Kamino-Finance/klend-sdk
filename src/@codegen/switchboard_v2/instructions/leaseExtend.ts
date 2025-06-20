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

export interface LeaseExtendArgs {
  params: types.LeaseExtendParamsFields
}

export interface LeaseExtendAccounts {
  lease: Address
  aggregator: Address
  queue: Address
  funder: Address
  owner: TransactionSigner
  escrow: Address
  tokenProgram: Address
  programState: Address
  mint: Address
}

export const layout = borsh.struct([types.LeaseExtendParams.layout("params")])

export function leaseExtend(
  args: LeaseExtendArgs,
  accounts: LeaseExtendAccounts,
  programAddress: Address = PROGRAM_ID
) {
  const keys: Array<IAccountMeta | IAccountSignerMeta> = [
    { address: accounts.lease, role: 1 },
    { address: accounts.aggregator, role: 0 },
    { address: accounts.queue, role: 0 },
    { address: accounts.funder, role: 1 },
    { address: accounts.owner.address, role: 3, signer: accounts.owner },
    { address: accounts.escrow, role: 1 },
    { address: accounts.tokenProgram, role: 0 },
    { address: accounts.programState, role: 0 },
    { address: accounts.mint, role: 0 },
  ]
  const identifier = Buffer.from([202, 70, 141, 29, 136, 142, 230, 118])
  const buffer = Buffer.alloc(1000)
  const len = layout.encode(
    {
      params: types.LeaseExtendParams.toEncodable(args.params),
    },
    buffer
  )
  const data = Buffer.concat([identifier, buffer]).slice(0, 8 + len)
  const ix: IInstruction = { accounts: keys, programAddress, data }
  return ix
}
