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

export interface GetIncreasePositionArgs {
  params: types.GetIncreasePositionParamsFields
}

export interface GetIncreasePositionAccounts {
  perpetuals: Address
  pool: Address
  position: Option<Address>
  custody: Address
  custodyOracleAccount: Address
  collateralCustody: Address
  collateralCustodyOracleAccount: Address
}

export const layout = borsh.struct([
  types.GetIncreasePositionParams.layout("params"),
])

export function getIncreasePosition(
  args: GetIncreasePositionArgs,
  accounts: GetIncreasePositionAccounts,
  programAddress: Address = PROGRAM_ID
) {
  const keys: Array<IAccountMeta | IAccountSignerMeta> = [
    { address: accounts.perpetuals, role: 0 },
    { address: accounts.pool, role: 0 },
    isSome(accounts.position)
      ? { address: accounts.position.value, role: 0 }
      : { address: programAddress, role: 0 },
    { address: accounts.custody, role: 0 },
    { address: accounts.custodyOracleAccount, role: 0 },
    { address: accounts.collateralCustody, role: 0 },
    { address: accounts.collateralCustodyOracleAccount, role: 0 },
  ]
  const identifier = Buffer.from([101, 131, 0, 32, 246, 54, 251, 101])
  const buffer = Buffer.alloc(1000)
  const len = layout.encode(
    {
      params: types.GetIncreasePositionParams.toEncodable(args.params),
    },
    buffer
  )
  const data = Buffer.concat([identifier, buffer]).slice(0, 8 + len)
  const ix: IInstruction = { accounts: keys, programAddress, data }
  return ix
}
