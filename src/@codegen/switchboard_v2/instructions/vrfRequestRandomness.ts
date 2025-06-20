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

export interface VrfRequestRandomnessArgs {
  params: types.VrfRequestRandomnessParamsFields
}

export interface VrfRequestRandomnessAccounts {
  authority: TransactionSigner
  vrf: Address
  oracleQueue: Address
  queueAuthority: Address
  dataBuffer: Address
  permission: Address
  escrow: Address
  payerWallet: Address
  payerAuthority: TransactionSigner
  recentBlockhashes: Address
  programState: Address
  tokenProgram: Address
}

export const layout = borsh.struct([
  types.VrfRequestRandomnessParams.layout("params"),
])

export function vrfRequestRandomness(
  args: VrfRequestRandomnessArgs,
  accounts: VrfRequestRandomnessAccounts,
  programAddress: Address = PROGRAM_ID
) {
  const keys: Array<IAccountMeta | IAccountSignerMeta> = [
    {
      address: accounts.authority.address,
      role: 2,
      signer: accounts.authority,
    },
    { address: accounts.vrf, role: 1 },
    { address: accounts.oracleQueue, role: 1 },
    { address: accounts.queueAuthority, role: 0 },
    { address: accounts.dataBuffer, role: 0 },
    { address: accounts.permission, role: 1 },
    { address: accounts.escrow, role: 1 },
    { address: accounts.payerWallet, role: 1 },
    {
      address: accounts.payerAuthority.address,
      role: 2,
      signer: accounts.payerAuthority,
    },
    { address: accounts.recentBlockhashes, role: 0 },
    { address: accounts.programState, role: 0 },
    { address: accounts.tokenProgram, role: 0 },
  ]
  const identifier = Buffer.from([230, 121, 14, 164, 28, 222, 117, 118])
  const buffer = Buffer.alloc(1000)
  const len = layout.encode(
    {
      params: types.VrfRequestRandomnessParams.toEncodable(args.params),
    },
    buffer
  )
  const data = Buffer.concat([identifier, buffer]).slice(0, 8 + len)
  const ix: IInstruction = { accounts: keys, programAddress, data }
  return ix
}
