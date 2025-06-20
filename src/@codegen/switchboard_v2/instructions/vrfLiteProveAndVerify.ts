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

export interface VrfLiteProveAndVerifyArgs {
  params: types.VrfLiteProveAndVerifyParamsFields
}

export interface VrfLiteProveAndVerifyAccounts {
  vrfLite: Address
  callbackPid: Address
  tokenProgram: Address
  escrow: Address
  programState: Address
  oracle: Address
  oracleAuthority: TransactionSigner
  oracleWallet: Address
  instructionsSysvar: Address
}

export const layout = borsh.struct([
  types.VrfLiteProveAndVerifyParams.layout("params"),
])

export function vrfLiteProveAndVerify(
  args: VrfLiteProveAndVerifyArgs,
  accounts: VrfLiteProveAndVerifyAccounts,
  programAddress: Address = PROGRAM_ID
) {
  const keys: Array<IAccountMeta | IAccountSignerMeta> = [
    { address: accounts.vrfLite, role: 1 },
    { address: accounts.callbackPid, role: 0 },
    { address: accounts.tokenProgram, role: 0 },
    { address: accounts.escrow, role: 1 },
    { address: accounts.programState, role: 0 },
    { address: accounts.oracle, role: 0 },
    {
      address: accounts.oracleAuthority.address,
      role: 2,
      signer: accounts.oracleAuthority,
    },
    { address: accounts.oracleWallet, role: 1 },
    { address: accounts.instructionsSysvar, role: 0 },
  ]
  const identifier = Buffer.from([191, 68, 209, 152, 10, 94, 165, 11])
  const buffer = Buffer.alloc(1000)
  const len = layout.encode(
    {
      params: types.VrfLiteProveAndVerifyParams.toEncodable(args.params),
    },
    buffer
  )
  const data = Buffer.concat([identifier, buffer]).slice(0, 8 + len)
  const ix: IInstruction = { accounts: keys, programAddress, data }
  return ix
}
