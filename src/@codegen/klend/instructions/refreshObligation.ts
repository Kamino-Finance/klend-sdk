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

export interface RefreshObligationAccounts {
  lendingMarket: Address
  obligation: Address
}

export function refreshObligation(
  accounts: RefreshObligationAccounts,
  programAddress: Address = PROGRAM_ID
) {
  const keys: Array<IAccountMeta | IAccountSignerMeta> = [
    { address: accounts.lendingMarket, role: 0 },
    { address: accounts.obligation, role: 1 },
  ]
  const identifier = Buffer.from([33, 132, 147, 228, 151, 192, 72, 89])
  const data = identifier
  const ix: IInstruction = { accounts: keys, programAddress, data }
  return ix
}
