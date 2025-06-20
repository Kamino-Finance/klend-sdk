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

export interface LeaseInitArgs {
  params: types.LeaseInitParamsFields
}

export interface LeaseInitAccounts {
  lease: Address
  queue: Address
  aggregator: Address
  funder: Address
  payer: TransactionSigner
  systemProgram: Address
  tokenProgram: Address
  owner: TransactionSigner
  escrow: Address
  programState: Address
  mint: Address
}

export const layout = borsh.struct([types.LeaseInitParams.layout("params")])

export function leaseInit(
  args: LeaseInitArgs,
  accounts: LeaseInitAccounts,
  programAddress: Address = PROGRAM_ID
) {
  const keys: Array<IAccountMeta | IAccountSignerMeta> = [
    { address: accounts.lease, role: 1 },
    { address: accounts.queue, role: 1 },
    { address: accounts.aggregator, role: 0 },
    { address: accounts.funder, role: 1 },
    { address: accounts.payer.address, role: 3, signer: accounts.payer },
    { address: accounts.systemProgram, role: 0 },
    { address: accounts.tokenProgram, role: 0 },
    { address: accounts.owner.address, role: 3, signer: accounts.owner },
    { address: accounts.escrow, role: 1 },
    { address: accounts.programState, role: 0 },
    { address: accounts.mint, role: 0 },
  ]
  const identifier = Buffer.from([168, 190, 157, 252, 159, 226, 241, 89])
  const buffer = Buffer.alloc(1000)
  const len = layout.encode(
    {
      params: types.LeaseInitParams.toEncodable(args.params),
    },
    buffer
  )
  const data = Buffer.concat([identifier, buffer]).slice(0, 8 + len)
  const ix: IInstruction = { accounts: keys, programAddress, data }
  return ix
}
