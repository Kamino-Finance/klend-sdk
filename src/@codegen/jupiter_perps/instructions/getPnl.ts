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

export interface GetPnlArgs {
  params: types.GetPnlAndFeeParamsFields
}

export interface GetPnlAccounts {
  perpetuals: Address
  pool: Address
  position: Address
  custody: Address
  custodyOracleAccount: Address
  collateralCustody: Address
}

export const layout = borsh.struct([types.GetPnlAndFeeParams.layout("params")])

export function getPnl(
  args: GetPnlArgs,
  accounts: GetPnlAccounts,
  programAddress: Address = PROGRAM_ID
) {
  const keys: Array<IAccountMeta | IAccountSignerMeta> = [
    { address: accounts.perpetuals, role: 0 },
    { address: accounts.pool, role: 0 },
    { address: accounts.position, role: 0 },
    { address: accounts.custody, role: 0 },
    { address: accounts.custodyOracleAccount, role: 0 },
    { address: accounts.collateralCustody, role: 0 },
  ]
  const identifier = Buffer.from([106, 212, 3, 250, 195, 224, 64, 160])
  const buffer = Buffer.alloc(1000)
  const len = layout.encode(
    {
      params: types.GetPnlAndFeeParams.toEncodable(args.params),
    },
    buffer
  )
  const data = Buffer.concat([identifier, buffer]).slice(0, 8 + len)
  const ix: IInstruction = { accounts: keys, programAddress, data }
  return ix
}
