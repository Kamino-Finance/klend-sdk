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

export interface UpdatePoolConfigArgs {
  entry: types.PoolConfigFieldKind
  data: Uint8Array
}

export interface UpdatePoolConfigAccounts {
  admin: TransactionSigner
  poolState: Address
}

export const layout = borsh.struct([
  types.PoolConfigField.layout("entry"),
  borsh.vecU8("data"),
])

export function updatePoolConfig(
  args: UpdatePoolConfigArgs,
  accounts: UpdatePoolConfigAccounts,
  programAddress: Address = PROGRAM_ID
) {
  const keys: Array<IAccountMeta | IAccountSignerMeta> = [
    { address: accounts.admin.address, role: 2, signer: accounts.admin },
    { address: accounts.poolState, role: 1 },
  ]
  const identifier = Buffer.from([68, 236, 203, 122, 179, 62, 234, 252])
  const buffer = Buffer.alloc(1000)
  const len = layout.encode(
    {
      entry: args.entry.toEncodable(),
      data: Buffer.from(
        args.data.buffer,
        args.data.byteOffset,
        args.data.length
      ),
    },
    buffer
  )
  const data = Buffer.concat([identifier, buffer]).slice(0, 8 + len)
  const ix: IInstruction = { accounts: keys, programAddress, data }
  return ix
}
