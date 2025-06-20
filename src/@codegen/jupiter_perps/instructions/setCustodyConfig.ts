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

export interface SetCustodyConfigArgs {
  params: types.SetCustodyConfigParamsFields
}

export interface SetCustodyConfigAccounts {
  admin: TransactionSigner
  perpetuals: Address
  custody: Address
}

export const layout = borsh.struct([
  types.SetCustodyConfigParams.layout("params"),
])

export function setCustodyConfig(
  args: SetCustodyConfigArgs,
  accounts: SetCustodyConfigAccounts,
  programAddress: Address = PROGRAM_ID
) {
  const keys: Array<IAccountMeta | IAccountSignerMeta> = [
    { address: accounts.admin.address, role: 3, signer: accounts.admin },
    { address: accounts.perpetuals, role: 0 },
    { address: accounts.custody, role: 1 },
  ]
  const identifier = Buffer.from([133, 97, 130, 143, 215, 229, 36, 176])
  const buffer = Buffer.alloc(1000)
  const len = layout.encode(
    {
      params: types.SetCustodyConfigParams.toEncodable(args.params),
    },
    buffer
  )
  const data = Buffer.concat([identifier, buffer]).slice(0, 8 + len)
  const ix: IInstruction = { accounts: keys, programAddress, data }
  return ix
}
