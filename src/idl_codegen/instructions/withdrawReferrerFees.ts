import { TransactionInstruction, PublicKey, AccountMeta } from "@solana/web3.js" // eslint-disable-line @typescript-eslint/no-unused-vars
import BN from "bn.js" // eslint-disable-line @typescript-eslint/no-unused-vars
import * as borsh from "@coral-xyz/borsh" // eslint-disable-line @typescript-eslint/no-unused-vars
import * as types from "../types" // eslint-disable-line @typescript-eslint/no-unused-vars
import { PROGRAM_ID } from "../programId"

export interface WithdrawReferrerFeesAccounts {
  referrer: PublicKey
  referrerTokenState: PublicKey
  reserve: PublicKey
  reserveLiquidityMint: PublicKey
  reserveSupplyLiquidity: PublicKey
  referrerTokenAccount: PublicKey
  lendingMarket: PublicKey
  lendingMarketAuthority: PublicKey
  tokenProgram: PublicKey
}

export function withdrawReferrerFees(
  accounts: WithdrawReferrerFeesAccounts,
  programId: PublicKey = PROGRAM_ID
) {
  const keys: Array<AccountMeta> = [
    { pubkey: accounts.referrer, isSigner: true, isWritable: true },
    { pubkey: accounts.referrerTokenState, isSigner: false, isWritable: true },
    { pubkey: accounts.reserve, isSigner: false, isWritable: true },
    {
      pubkey: accounts.reserveLiquidityMint,
      isSigner: false,
      isWritable: true,
    },
    {
      pubkey: accounts.reserveSupplyLiquidity,
      isSigner: false,
      isWritable: true,
    },
    {
      pubkey: accounts.referrerTokenAccount,
      isSigner: false,
      isWritable: true,
    },
    { pubkey: accounts.lendingMarket, isSigner: false, isWritable: false },
    {
      pubkey: accounts.lendingMarketAuthority,
      isSigner: false,
      isWritable: false,
    },
    { pubkey: accounts.tokenProgram, isSigner: false, isWritable: false },
  ]
  const identifier = Buffer.from([171, 118, 121, 201, 233, 140, 23, 228])
  const data = identifier
  const ix = new TransactionInstruction({ keys, programId, data })
  return ix
}
