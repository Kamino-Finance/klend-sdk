import { TransactionInstruction, PublicKey, AccountMeta } from "@solana/web3.js" // eslint-disable-line @typescript-eslint/no-unused-vars
import BN from "bn.js" // eslint-disable-line @typescript-eslint/no-unused-vars
import * as borsh from "@coral-xyz/borsh" // eslint-disable-line @typescript-eslint/no-unused-vars
import * as types from "../types" // eslint-disable-line @typescript-eslint/no-unused-vars
import { PROGRAM_ID } from "../programId"

export interface UpdateLendingMarketOwnerAccounts {
  lendingMarketOwnerCached: PublicKey
  lendingMarket: PublicKey
}

export function updateLendingMarketOwner(
  accounts: UpdateLendingMarketOwnerAccounts,
  programId: PublicKey = PROGRAM_ID
) {
  const keys: Array<AccountMeta> = [
    {
      pubkey: accounts.lendingMarketOwnerCached,
      isSigner: true,
      isWritable: false,
    },
    { pubkey: accounts.lendingMarket, isSigner: false, isWritable: true },
  ]
  const identifier = Buffer.from([118, 224, 10, 62, 196, 230, 184, 89])
  const data = identifier
  const ix = new TransactionInstruction({ keys, programId, data })
  return ix
}
