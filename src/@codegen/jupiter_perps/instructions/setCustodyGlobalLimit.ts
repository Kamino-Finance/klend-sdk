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

export interface SetCustodyGlobalLimitArgs {
  params: types.SetCustodyGlobalLimitParamsFields
}

export interface SetCustodyGlobalLimitAccounts {
  keeper: TransactionSigner
  custody: Address
}

export const layout = borsh.struct([
  types.SetCustodyGlobalLimitParams.layout("params"),
])

export function setCustodyGlobalLimit(
  args: SetCustodyGlobalLimitArgs,
  accounts: SetCustodyGlobalLimitAccounts,
  programAddress: Address = PROGRAM_ID
) {
  const keys: Array<IAccountMeta | IAccountSignerMeta> = [
    { address: accounts.keeper.address, role: 2, signer: accounts.keeper },
    { address: accounts.custody, role: 1 },
  ]
  const identifier = Buffer.from([94, 82, 154, 177, 193, 205, 141, 76])
  const buffer = Buffer.alloc(1000)
  const len = layout.encode(
    {
      params: types.SetCustodyGlobalLimitParams.toEncodable(args.params),
    },
    buffer
  )
  const data = Buffer.concat([identifier, buffer]).slice(0, 8 + len)
  const ix: IInstruction = { accounts: keys, programAddress, data }
  return ix
}
