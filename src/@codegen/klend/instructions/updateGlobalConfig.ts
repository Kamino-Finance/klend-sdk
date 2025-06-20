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

export interface UpdateGlobalConfigArgs {
  mode: types.UpdateGlobalConfigModeKind
  value: Uint8Array
}

export interface UpdateGlobalConfigAccounts {
  globalAdmin: TransactionSigner
  globalConfig: Address
}

export const layout = borsh.struct([
  types.UpdateGlobalConfigMode.layout("mode"),
  borsh.vecU8("value"),
])

export function updateGlobalConfig(
  args: UpdateGlobalConfigArgs,
  accounts: UpdateGlobalConfigAccounts,
  programAddress: Address = PROGRAM_ID
) {
  const keys: Array<IAccountMeta | IAccountSignerMeta> = [
    {
      address: accounts.globalAdmin.address,
      role: 2,
      signer: accounts.globalAdmin,
    },
    { address: accounts.globalConfig, role: 1 },
  ]
  const identifier = Buffer.from([164, 84, 130, 189, 111, 58, 250, 200])
  const buffer = Buffer.alloc(1000)
  const len = layout.encode(
    {
      mode: args.mode.toEncodable(),
      value: Buffer.from(
        args.value.buffer,
        args.value.byteOffset,
        args.value.length
      ),
    },
    buffer
  )
  const data = Buffer.concat([identifier, buffer]).slice(0, 8 + len)
  const ix: IInstruction = { accounts: keys, programAddress, data }
  return ix
}
