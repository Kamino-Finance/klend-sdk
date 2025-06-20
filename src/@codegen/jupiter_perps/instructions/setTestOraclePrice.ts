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

export interface SetTestOraclePriceArgs {
  params: types.SetTestOraclePriceParamsFields
}

export interface SetTestOraclePriceAccounts {
  admin: TransactionSigner
  perpetuals: Address
  pool: Address
  custody: Address
  oracleAccount: Address
  systemProgram: Address
}

export const layout = borsh.struct([
  types.SetTestOraclePriceParams.layout("params"),
])

export function setTestOraclePrice(
  args: SetTestOraclePriceArgs,
  accounts: SetTestOraclePriceAccounts,
  programAddress: Address = PROGRAM_ID
) {
  const keys: Array<IAccountMeta | IAccountSignerMeta> = [
    { address: accounts.admin.address, role: 3, signer: accounts.admin },
    { address: accounts.perpetuals, role: 0 },
    { address: accounts.pool, role: 0 },
    { address: accounts.custody, role: 0 },
    { address: accounts.oracleAccount, role: 1 },
    { address: accounts.systemProgram, role: 0 },
  ]
  const identifier = Buffer.from([44, 111, 165, 185, 58, 14, 249, 249])
  const buffer = Buffer.alloc(1000)
  const len = layout.encode(
    {
      params: types.SetTestOraclePriceParams.toEncodable(args.params),
    },
    buffer
  )
  const data = Buffer.concat([identifier, buffer]).slice(0, 8 + len)
  const ix: IInstruction = { accounts: keys, programAddress, data }
  return ix
}
