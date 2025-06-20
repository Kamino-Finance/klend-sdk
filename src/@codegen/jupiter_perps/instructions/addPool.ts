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

export interface AddPoolArgs {
  params: types.AddPoolParamsFields
}

export interface AddPoolAccounts {
  admin: TransactionSigner
  transferAuthority: Address
  perpetuals: Address
  pool: Address
  lpTokenMint: Address
  systemProgram: Address
  tokenProgram: Address
  rent: Address
}

export const layout = borsh.struct([types.AddPoolParams.layout("params")])

export function addPool(
  args: AddPoolArgs,
  accounts: AddPoolAccounts,
  programAddress: Address = PROGRAM_ID
) {
  const keys: Array<IAccountMeta | IAccountSignerMeta> = [
    { address: accounts.admin.address, role: 3, signer: accounts.admin },
    { address: accounts.transferAuthority, role: 0 },
    { address: accounts.perpetuals, role: 1 },
    { address: accounts.pool, role: 1 },
    { address: accounts.lpTokenMint, role: 1 },
    { address: accounts.systemProgram, role: 0 },
    { address: accounts.tokenProgram, role: 0 },
    { address: accounts.rent, role: 0 },
  ]
  const identifier = Buffer.from([115, 230, 212, 211, 175, 49, 39, 169])
  const buffer = Buffer.alloc(1000)
  const len = layout.encode(
    {
      params: types.AddPoolParams.toEncodable(args.params),
    },
    buffer
  )
  const data = Buffer.concat([identifier, buffer]).slice(0, 8 + len)
  const ix: IInstruction = { accounts: keys, programAddress, data }
  return ix
}
