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

export interface VrfLiteInitArgs {
  params: types.VrfLiteInitParamsFields
}

export interface VrfLiteInitAccounts {
  authority: Address
  vrf: TransactionSigner
  mint: Address
  escrow: Address
  queueAuthority: Address
  queue: Address
  permission: Address
  programState: Address
  payer: TransactionSigner
  tokenProgram: Address
  associatedTokenProgram: Address
  systemProgram: Address
  rent: Address
}

export const layout = borsh.struct([types.VrfLiteInitParams.layout("params")])

export function vrfLiteInit(
  args: VrfLiteInitArgs,
  accounts: VrfLiteInitAccounts,
  programAddress: Address = PROGRAM_ID
) {
  const keys: Array<IAccountMeta | IAccountSignerMeta> = [
    { address: accounts.authority, role: 0 },
    { address: accounts.vrf.address, role: 3, signer: accounts.vrf },
    { address: accounts.mint, role: 0 },
    { address: accounts.escrow, role: 1 },
    { address: accounts.queueAuthority, role: 0 },
    { address: accounts.queue, role: 0 },
    { address: accounts.permission, role: 1 },
    { address: accounts.programState, role: 0 },
    { address: accounts.payer.address, role: 3, signer: accounts.payer },
    { address: accounts.tokenProgram, role: 0 },
    { address: accounts.associatedTokenProgram, role: 0 },
    { address: accounts.systemProgram, role: 0 },
    { address: accounts.rent, role: 0 },
  ]
  const identifier = Buffer.from([144, 40, 147, 33, 238, 92, 88, 46])
  const buffer = Buffer.alloc(1000)
  const len = layout.encode(
    {
      params: types.VrfLiteInitParams.toEncodable(args.params),
    },
    buffer
  )
  const data = Buffer.concat([identifier, buffer]).slice(0, 8 + len)
  const ix: IInstruction = { accounts: keys, programAddress, data }
  return ix
}
