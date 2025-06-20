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

export interface BufferRelayerInitArgs {
  params: types.BufferRelayerInitParamsFields
}

export interface BufferRelayerInitAccounts {
  bufferRelayer: Address
  escrow: Address
  authority: Address
  queue: Address
  job: Address
  programState: Address
  mint: Address
  payer: TransactionSigner
  tokenProgram: Address
  associatedTokenProgram: Address
  systemProgram: Address
  rent: Address
}

export const layout = borsh.struct([
  types.BufferRelayerInitParams.layout("params"),
])

export function bufferRelayerInit(
  args: BufferRelayerInitArgs,
  accounts: BufferRelayerInitAccounts,
  programAddress: Address = PROGRAM_ID
) {
  const keys: Array<IAccountMeta | IAccountSignerMeta> = [
    { address: accounts.bufferRelayer, role: 1 },
    { address: accounts.escrow, role: 1 },
    { address: accounts.authority, role: 0 },
    { address: accounts.queue, role: 0 },
    { address: accounts.job, role: 0 },
    { address: accounts.programState, role: 0 },
    { address: accounts.mint, role: 0 },
    { address: accounts.payer.address, role: 3, signer: accounts.payer },
    { address: accounts.tokenProgram, role: 0 },
    { address: accounts.associatedTokenProgram, role: 0 },
    { address: accounts.systemProgram, role: 0 },
    { address: accounts.rent, role: 0 },
  ]
  const identifier = Buffer.from([127, 205, 59, 151, 4, 47, 164, 82])
  const buffer = Buffer.alloc(1000)
  const len = layout.encode(
    {
      params: types.BufferRelayerInitParams.toEncodable(args.params),
    },
    buffer
  )
  const data = Buffer.concat([identifier, buffer]).slice(0, 8 + len)
  const ix: IInstruction = { accounts: keys, programAddress, data }
  return ix
}
