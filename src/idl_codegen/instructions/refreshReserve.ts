import { TransactionInstruction, PublicKey, AccountMeta } from "@solana/web3.js" // eslint-disable-line @typescript-eslint/no-unused-vars
import BN from "bn.js" // eslint-disable-line @typescript-eslint/no-unused-vars
import * as borsh from "@coral-xyz/borsh" // eslint-disable-line @typescript-eslint/no-unused-vars
import * as types from "../types" // eslint-disable-line @typescript-eslint/no-unused-vars
import { PROGRAM_ID } from "../programId"

export interface RefreshReserveAccounts {
  reserve: PublicKey
  lendingMarket: PublicKey
  pythOracle: PublicKey
  switchboardPriceOracle: PublicKey
  switchboardTwapOracle: PublicKey
  scopePrices: PublicKey
}

export function refreshReserve(
  accounts: RefreshReserveAccounts,
  programId: PublicKey = PROGRAM_ID
) {
  const keys: Array<AccountMeta> = [
    { pubkey: accounts.reserve, isSigner: false, isWritable: true },
    { pubkey: accounts.lendingMarket, isSigner: false, isWritable: false },
    { pubkey: accounts.pythOracle, isSigner: false, isWritable: false },
    {
      pubkey: accounts.switchboardPriceOracle,
      isSigner: false,
      isWritable: false,
    },
    {
      pubkey: accounts.switchboardTwapOracle,
      isSigner: false,
      isWritable: false,
    },
    { pubkey: accounts.scopePrices, isSigner: false, isWritable: false },
  ]
  const identifier = Buffer.from([2, 218, 138, 235, 79, 201, 25, 102])
  const data = identifier
  const ix = new TransactionInstruction({ keys, programId, data })
  return ix
}
