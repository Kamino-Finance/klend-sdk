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

export interface GetExactOutSwapAmountAndFeesArgs {
  params: types.GetExactOutSwapAmountAndFeesParamsFields
}

export interface GetExactOutSwapAmountAndFeesAccounts {
  perpetuals: Address
  pool: Address
  receivingCustody: Address
  receivingCustodyOracleAccount: Address
  dispensingCustody: Address
  dispensingCustodyOracleAccount: Address
}

export const layout = borsh.struct([
  types.GetExactOutSwapAmountAndFeesParams.layout("params"),
])

export function getExactOutSwapAmountAndFees(
  args: GetExactOutSwapAmountAndFeesArgs,
  accounts: GetExactOutSwapAmountAndFeesAccounts,
  programAddress: Address = PROGRAM_ID
) {
  const keys: Array<IAccountMeta | IAccountSignerMeta> = [
    { address: accounts.perpetuals, role: 0 },
    { address: accounts.pool, role: 0 },
    { address: accounts.receivingCustody, role: 0 },
    { address: accounts.receivingCustodyOracleAccount, role: 0 },
    { address: accounts.dispensingCustody, role: 0 },
    { address: accounts.dispensingCustodyOracleAccount, role: 0 },
  ]
  const identifier = Buffer.from([196, 32, 218, 118, 151, 233, 43, 56])
  const buffer = Buffer.alloc(1000)
  const len = layout.encode(
    {
      params: types.GetExactOutSwapAmountAndFeesParams.toEncodable(args.params),
    },
    buffer
  )
  const data = Buffer.concat([identifier, buffer]).slice(0, 8 + len)
  const ix: IInstruction = { accounts: keys, programAddress, data }
  return ix
}
