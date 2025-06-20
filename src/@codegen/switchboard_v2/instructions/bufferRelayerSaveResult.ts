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

export interface BufferRelayerSaveResultArgs {
  params: types.BufferRelayerSaveResultParamsFields
}

export interface BufferRelayerSaveResultAccounts {
  bufferRelayer: Address
  oracleAuthority: TransactionSigner
  oracle: Address
  oracleQueue: Address
  dataBuffer: Address
  queueAuthority: Address
  permission: Address
  escrow: Address
  oracleWallet: Address
  programState: Address
  tokenProgram: Address
}

export const layout = borsh.struct([
  types.BufferRelayerSaveResultParams.layout("params"),
])

export function bufferRelayerSaveResult(
  args: BufferRelayerSaveResultArgs,
  accounts: BufferRelayerSaveResultAccounts,
  programAddress: Address = PROGRAM_ID
) {
  const keys: Array<IAccountMeta | IAccountSignerMeta> = [
    { address: accounts.bufferRelayer, role: 1 },
    {
      address: accounts.oracleAuthority.address,
      role: 2,
      signer: accounts.oracleAuthority,
    },
    { address: accounts.oracle, role: 0 },
    { address: accounts.oracleQueue, role: 1 },
    { address: accounts.dataBuffer, role: 1 },
    { address: accounts.queueAuthority, role: 0 },
    { address: accounts.permission, role: 1 },
    { address: accounts.escrow, role: 1 },
    { address: accounts.oracleWallet, role: 1 },
    { address: accounts.programState, role: 0 },
    { address: accounts.tokenProgram, role: 0 },
  ]
  const identifier = Buffer.from([253, 170, 164, 84, 155, 112, 1, 46])
  const buffer = Buffer.alloc(1000)
  const len = layout.encode(
    {
      params: types.BufferRelayerSaveResultParams.toEncodable(args.params),
    },
    buffer
  )
  const data = Buffer.concat([identifier, buffer]).slice(0, 8 + len)
  const ix: IInstruction = { accounts: keys, programAddress, data }
  return ix
}
