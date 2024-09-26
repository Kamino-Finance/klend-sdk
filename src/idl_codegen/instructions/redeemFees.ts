import { TransactionInstruction, PublicKey, AccountMeta } from "@solana/web3.js" // eslint-disable-line @typescript-eslint/no-unused-vars
import BN from "bn.js" // eslint-disable-line @typescript-eslint/no-unused-vars
import * as borsh from "@coral-xyz/borsh" // eslint-disable-line @typescript-eslint/no-unused-vars
import * as types from "../types" // eslint-disable-line @typescript-eslint/no-unused-vars
import { PROGRAM_ID } from "../programId"

export interface RedeemFeesAccounts {
  reserve: PublicKey
  reserveLiquidityMint: PublicKey
  reserveLiquidityFeeReceiver: PublicKey
  reserveSupplyLiquidity: PublicKey
  lendingMarket: PublicKey
  lendingMarketAuthority: PublicKey
  tokenProgram: PublicKey
}

export function redeemFees(
  accounts: RedeemFeesAccounts,
  programId: PublicKey = PROGRAM_ID
) {
  const keys: Array<AccountMeta> = [
    { pubkey: accounts.reserve, isSigner: false, isWritable: true },
    {
      pubkey: accounts.reserveLiquidityMint,
      isSigner: false,
      isWritable: true,
    },
    {
      pubkey: accounts.reserveLiquidityFeeReceiver,
      isSigner: false,
      isWritable: true,
    },
    {
      pubkey: accounts.reserveSupplyLiquidity,
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
  const identifier = Buffer.from([215, 39, 180, 41, 173, 46, 248, 220])
  const data = identifier
  const ix = new TransactionInstruction({ keys, programId, data })
  return ix
}
