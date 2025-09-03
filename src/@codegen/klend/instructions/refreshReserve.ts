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

export const DISCRIMINATOR = Buffer.from([2, 218, 138, 235, 79, 201, 25, 102])

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
  remainingAccounts: Array<AccountMeta | AccountSignerMeta> = [],
  programAddress: Address = PROGRAM_ID
) {
  const keys: Array<AccountMeta | AccountSignerMeta> = [
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
    ...remainingAccounts,
  ]
  const data = DISCRIMINATOR
  const ix: Instruction = { accounts: keys, programAddress, data }
  return ix
}
