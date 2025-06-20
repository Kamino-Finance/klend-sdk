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

export interface RefreshReserveAccounts {
  reserve: Address
  lendingMarket: Address
  pythOracle: Option<Address>
  switchboardPriceOracle: Option<Address>
  switchboardTwapOracle: Option<Address>
  scopePrices: Option<Address>
}

export function refreshReserve(
  accounts: RefreshReserveAccounts,
  programAddress: Address = PROGRAM_ID
) {
  const keys: Array<IAccountMeta | IAccountSignerMeta> = [
    { address: accounts.reserve, role: 1 },
    { address: accounts.lendingMarket, role: 0 },
    isSome(accounts.pythOracle)
      ? { address: accounts.pythOracle.value, role: 0 }
      : { address: programAddress, role: 0 },
    isSome(accounts.switchboardPriceOracle)
      ? { address: accounts.switchboardPriceOracle.value, role: 0 }
      : { address: programAddress, role: 0 },
    isSome(accounts.switchboardTwapOracle)
      ? { address: accounts.switchboardTwapOracle.value, role: 0 }
      : { address: programAddress, role: 0 },
    isSome(accounts.scopePrices)
      ? { address: accounts.scopePrices.value, role: 0 }
      : { address: programAddress, role: 0 },
  ]
  const identifier = Buffer.from([2, 218, 138, 235, 79, 201, 25, 102])
  const data = identifier
  const ix: IInstruction = { accounts: keys, programAddress, data }
  return ix
}
