/* eslint-disable @typescript-eslint/no-unused-vars */
import {
  Address,
  isSome,
  AccountMeta,
  AccountSignerMeta,
  Instruction,
  Option,
  TransactionSigner,
} from "@solana/kit"
/* eslint-enable @typescript-eslint/no-unused-vars */
import BN from "bn.js" // eslint-disable-line @typescript-eslint/no-unused-vars
import * as borsh from "@coral-xyz/borsh" // eslint-disable-line @typescript-eslint/no-unused-vars
import { borshAddress } from "../utils" // eslint-disable-line @typescript-eslint/no-unused-vars
import * as types from "../types" // eslint-disable-line @typescript-eslint/no-unused-vars
import { PROGRAM_ID } from "../programId"

export const DISCRIMINATOR = Buffer.from([196, 32, 218, 118, 151, 233, 43, 56])

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

export const layout = borsh.struct<GetExactOutSwapAmountAndFeesArgs>([
  types.GetExactOutSwapAmountAndFeesParams.layout("params"),
])

export function getExactOutSwapAmountAndFees(
  args: GetExactOutSwapAmountAndFeesArgs,
  accounts: GetExactOutSwapAmountAndFeesAccounts,
  remainingAccounts: Array<AccountMeta | AccountSignerMeta> = [],
  programAddress: Address = PROGRAM_ID
) {
  const keys: Array<AccountMeta | AccountSignerMeta> = [
    { address: accounts.perpetuals, role: 0 },
    { address: accounts.pool, role: 0 },
    { address: accounts.receivingCustody, role: 0 },
    { address: accounts.receivingCustodyOracleAccount, role: 0 },
    { address: accounts.dispensingCustody, role: 0 },
    { address: accounts.dispensingCustodyOracleAccount, role: 0 },
    ...remainingAccounts,
  ]
  const buffer = Buffer.alloc(1000)
  const len = layout.encode(
    {
      params: types.GetExactOutSwapAmountAndFeesParams.toEncodable(args.params),
    },
    buffer
  )
  const data = Buffer.concat([DISCRIMINATOR, buffer]).slice(0, 8 + len)
  const ix: Instruction = { accounts: keys, programAddress, data }
  return ix
}
