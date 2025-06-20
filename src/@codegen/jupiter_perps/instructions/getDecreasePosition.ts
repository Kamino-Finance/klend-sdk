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

export interface GetDecreasePositionArgs {
  params: types.GetDecreasePositionParamsFields
}

export interface GetDecreasePositionAccounts {
  perpetuals: Address
  pool: Address
  position: Address
  custody: Address
  custodyOracleAccount: Address
  collateralCustody: Address
  collateralCustodyOracleAccount: Address
}

export const layout = borsh.struct([
  types.GetDecreasePositionParams.layout("params"),
])

export function getDecreasePosition(
  args: GetDecreasePositionArgs,
  accounts: GetDecreasePositionAccounts,
  programAddress: Address = PROGRAM_ID
) {
  const keys: Array<IAccountMeta | IAccountSignerMeta> = [
    { address: accounts.perpetuals, role: 0 },
    { address: accounts.pool, role: 0 },
    { address: accounts.position, role: 0 },
    { address: accounts.custody, role: 0 },
    { address: accounts.custodyOracleAccount, role: 0 },
    { address: accounts.collateralCustody, role: 0 },
    { address: accounts.collateralCustodyOracleAccount, role: 0 },
  ]
  const identifier = Buffer.from([106, 31, 146, 195, 103, 108, 48, 250])
  const buffer = Buffer.alloc(1000)
  const len = layout.encode(
    {
      params: types.GetDecreasePositionParams.toEncodable(args.params),
    },
    buffer
  )
  const data = Buffer.concat([identifier, buffer]).slice(0, 8 + len)
  const ix: IInstruction = { accounts: keys, programAddress, data }
  return ix
}
