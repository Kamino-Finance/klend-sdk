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

export interface GetAddLiquidityAmountAndFeeArgs {
  params: types.GetAddLiquidityAmountAndFeeParamsFields
}

export interface GetAddLiquidityAmountAndFeeAccounts {
  perpetuals: Address
  pool: Address
  custody: Address
  custodyOracleAccount: Address
  lpTokenMint: Address
}

export const layout = borsh.struct([
  types.GetAddLiquidityAmountAndFeeParams.layout("params"),
])

export function getAddLiquidityAmountAndFee(
  args: GetAddLiquidityAmountAndFeeArgs,
  accounts: GetAddLiquidityAmountAndFeeAccounts,
  programAddress: Address = PROGRAM_ID
) {
  const keys: Array<IAccountMeta | IAccountSignerMeta> = [
    { address: accounts.perpetuals, role: 0 },
    { address: accounts.pool, role: 0 },
    { address: accounts.custody, role: 0 },
    { address: accounts.custodyOracleAccount, role: 0 },
    { address: accounts.lpTokenMint, role: 0 },
  ]
  const identifier = Buffer.from([172, 150, 249, 181, 233, 241, 78, 139])
  const buffer = Buffer.alloc(1000)
  const len = layout.encode(
    {
      params: types.GetAddLiquidityAmountAndFeeParams.toEncodable(args.params),
    },
    buffer
  )
  const data = Buffer.concat([identifier, buffer]).slice(0, 8 + len)
  const ix: IInstruction = { accounts: keys, programAddress, data }
  return ix
}
