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

export interface VrfPoolRequestArgs {
  params: types.VrfPoolRequestParamsFields
}

export interface VrfPoolRequestAccounts {
  authority: TransactionSigner
  vrfPool: Address
  escrow: Address
  mint: Address
  queue: Address
  queueAuthority: Address
  dataBuffer: Address
  recentBlockhashes: Address
  programState: Address
  tokenProgram: Address
}

export const layout = borsh.struct([
  types.VrfPoolRequestParams.layout("params"),
])

export function vrfPoolRequest(
  args: VrfPoolRequestArgs,
  accounts: VrfPoolRequestAccounts,
  programAddress: Address = PROGRAM_ID
) {
  const keys: Array<IAccountMeta | IAccountSignerMeta> = [
    {
      address: accounts.authority.address,
      role: 2,
      signer: accounts.authority,
    },
    { address: accounts.vrfPool, role: 1 },
    { address: accounts.escrow, role: 1 },
    { address: accounts.mint, role: 0 },
    { address: accounts.queue, role: 1 },
    { address: accounts.queueAuthority, role: 0 },
    { address: accounts.dataBuffer, role: 0 },
    { address: accounts.recentBlockhashes, role: 0 },
    { address: accounts.programState, role: 0 },
    { address: accounts.tokenProgram, role: 0 },
  ]
  const identifier = Buffer.from([67, 49, 182, 255, 222, 161, 116, 238])
  const buffer = Buffer.alloc(1000)
  const len = layout.encode(
    {
      params: types.VrfPoolRequestParams.toEncodable(args.params),
    },
    buffer
  )
  const data = Buffer.concat([identifier, buffer]).slice(0, 8 + len)
  const ix: IInstruction = { accounts: keys, programAddress, data }
  return ix
}
