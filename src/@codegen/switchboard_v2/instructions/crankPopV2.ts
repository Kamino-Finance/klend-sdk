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

export interface CrankPopV2Args {
  params: types.CrankPopParamsV2Fields
}

export interface CrankPopV2Accounts {
  crank: Address
  oracleQueue: Address
  queueAuthority: Address
  programState: Address
  payoutWallet: Address
  tokenProgram: Address
  crankDataBuffer: Address
  queueDataBuffer: Address
  mint: Address
}

export const layout = borsh.struct([types.CrankPopParamsV2.layout("params")])

export function crankPopV2(
  args: CrankPopV2Args,
  accounts: CrankPopV2Accounts,
  programAddress: Address = PROGRAM_ID
) {
  const keys: Array<IAccountMeta | IAccountSignerMeta> = [
    { address: accounts.crank, role: 1 },
    { address: accounts.oracleQueue, role: 1 },
    { address: accounts.queueAuthority, role: 0 },
    { address: accounts.programState, role: 0 },
    { address: accounts.payoutWallet, role: 1 },
    { address: accounts.tokenProgram, role: 0 },
    { address: accounts.crankDataBuffer, role: 1 },
    { address: accounts.queueDataBuffer, role: 0 },
    { address: accounts.mint, role: 0 },
  ]
  const identifier = Buffer.from([153, 122, 177, 151, 240, 86, 240, 213])
  const buffer = Buffer.alloc(1000)
  const len = layout.encode(
    {
      params: types.CrankPopParamsV2.toEncodable(args.params),
    },
    buffer
  )
  const data = Buffer.concat([identifier, buffer]).slice(0, 8 + len)
  const ix: IInstruction = { accounts: keys, programAddress, data }
  return ix
}
