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

export interface GetRemoveLiquidityAmountAndFeeArgs {
  params: types.GetRemoveLiquidityAmountAndFeeParamsFields
}

export interface GetRemoveLiquidityAmountAndFeeAccounts {
  perpetuals: Address
  pool: Address
  custody: Address
  custodyOracleAccount: Address
  lpTokenMint: Address
}

export const layout = borsh.struct([
  types.GetRemoveLiquidityAmountAndFeeParams.layout("params"),
])

export function getRemoveLiquidityAmountAndFee(
  args: GetRemoveLiquidityAmountAndFeeArgs,
  accounts: GetRemoveLiquidityAmountAndFeeAccounts,
  programAddress: Address = PROGRAM_ID
) {
  const keys: Array<IAccountMeta | IAccountSignerMeta> = [
    { address: accounts.perpetuals, role: 0 },
    { address: accounts.pool, role: 0 },
    { address: accounts.custody, role: 0 },
    { address: accounts.custodyOracleAccount, role: 0 },
    { address: accounts.lpTokenMint, role: 0 },
  ]
  const identifier = Buffer.from([194, 226, 233, 102, 14, 21, 196, 7])
  const buffer = Buffer.alloc(1000)
  const len = layout.encode(
    {
      params: types.GetRemoveLiquidityAmountAndFeeParams.toEncodable(
        args.params
      ),
    },
    buffer
  )
  const data = Buffer.concat([identifier, buffer]).slice(0, 8 + len)
  const ix: IInstruction = { accounts: keys, programAddress, data }
  return ix
}
