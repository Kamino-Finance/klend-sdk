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

export interface GetOraclePriceAccounts {
  perpetuals: Address
  pool: Address
  custody: Address
  custodyOracleAccount: Address
}

export function getOraclePrice(
  accounts: GetOraclePriceAccounts,
  programAddress: Address = PROGRAM_ID
) {
  const keys: Array<IAccountMeta | IAccountSignerMeta> = [
    { address: accounts.perpetuals, role: 0 },
    { address: accounts.pool, role: 0 },
    { address: accounts.custody, role: 0 },
    { address: accounts.custodyOracleAccount, role: 0 },
  ]
  const identifier = Buffer.from([200, 20, 0, 106, 56, 210, 230, 140])
  const data = identifier
  const ix: IInstruction = { accounts: keys, programAddress, data }
  return ix
}
