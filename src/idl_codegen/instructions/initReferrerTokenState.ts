import { TransactionInstruction, PublicKey, AccountMeta } from "@solana/web3.js" // eslint-disable-line @typescript-eslint/no-unused-vars
import BN from "bn.js" // eslint-disable-line @typescript-eslint/no-unused-vars
import * as borsh from "@coral-xyz/borsh" // eslint-disable-line @typescript-eslint/no-unused-vars
import * as types from "../types" // eslint-disable-line @typescript-eslint/no-unused-vars
import { PROGRAM_ID } from "../programId"

export interface InitReferrerTokenStateAccounts {
  payer: PublicKey
  lendingMarket: PublicKey
  reserve: PublicKey
  referrer: PublicKey
  referrerTokenState: PublicKey
  rent: PublicKey
  systemProgram: PublicKey
}

export function initReferrerTokenState(
  accounts: InitReferrerTokenStateAccounts,
  programId: PublicKey = PROGRAM_ID
) {
  const keys: Array<AccountMeta> = [
    { pubkey: accounts.payer, isSigner: true, isWritable: true },
    { pubkey: accounts.lendingMarket, isSigner: false, isWritable: false },
    { pubkey: accounts.reserve, isSigner: false, isWritable: false },
    { pubkey: accounts.referrer, isSigner: false, isWritable: false },
    { pubkey: accounts.referrerTokenState, isSigner: false, isWritable: true },
    { pubkey: accounts.rent, isSigner: false, isWritable: false },
    { pubkey: accounts.systemProgram, isSigner: false, isWritable: false },
  ]
  const identifier = Buffer.from([116, 45, 66, 148, 58, 13, 218, 115])
  const data = identifier
  const ix = new TransactionInstruction({ keys, programId, data })
  return ix
}
