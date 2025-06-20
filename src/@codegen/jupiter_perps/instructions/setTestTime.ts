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

export interface SetTestTimeArgs {
  params: types.SetTestTimeParamsFields
}

export interface SetTestTimeAccounts {
  admin: TransactionSigner
  perpetuals: Address
}

export const layout = borsh.struct([types.SetTestTimeParams.layout("params")])

export function setTestTime(
  args: SetTestTimeArgs,
  accounts: SetTestTimeAccounts,
  programAddress: Address = PROGRAM_ID
) {
  const keys: Array<IAccountMeta | IAccountSignerMeta> = [
    { address: accounts.admin.address, role: 2, signer: accounts.admin },
    { address: accounts.perpetuals, role: 1 },
  ]
  const identifier = Buffer.from([242, 231, 177, 251, 126, 145, 159, 104])
  const buffer = Buffer.alloc(1000)
  const len = layout.encode(
    {
      params: types.SetTestTimeParams.toEncodable(args.params),
    },
    buffer
  )
  const data = Buffer.concat([identifier, buffer]).slice(0, 8 + len)
  const ix: IInstruction = { accounts: keys, programAddress, data }
  return ix
}
