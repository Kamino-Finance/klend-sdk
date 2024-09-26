import { TransactionInstruction, PublicKey, AccountMeta } from "@solana/web3.js" // eslint-disable-line @typescript-eslint/no-unused-vars
import BN from "bn.js" // eslint-disable-line @typescript-eslint/no-unused-vars
import * as borsh from "@coral-xyz/borsh" // eslint-disable-line @typescript-eslint/no-unused-vars
import * as types from "../types" // eslint-disable-line @typescript-eslint/no-unused-vars
import { PROGRAM_ID } from "../programId"

export interface FlashRepayReserveLiquidityArgs {
  liquidityAmount: BN
  borrowInstructionIndex: number
}

export interface FlashRepayReserveLiquidityAccounts {
  userTransferAuthority: PublicKey
  lendingMarketAuthority: PublicKey
  lendingMarket: PublicKey
  reserve: PublicKey
  reserveLiquidityMint: PublicKey
  reserveDestinationLiquidity: PublicKey
  userSourceLiquidity: PublicKey
  reserveLiquidityFeeReceiver: PublicKey
  referrerTokenState: PublicKey
  referrerAccount: PublicKey
  sysvarInfo: PublicKey
  tokenProgram: PublicKey
}

export const layout = borsh.struct([
  borsh.u64("liquidityAmount"),
  borsh.u8("borrowInstructionIndex"),
])

export function flashRepayReserveLiquidity(
  args: FlashRepayReserveLiquidityArgs,
  accounts: FlashRepayReserveLiquidityAccounts,
  programId: PublicKey = PROGRAM_ID
) {
  const keys: Array<AccountMeta> = [
    {
      pubkey: accounts.userTransferAuthority,
      isSigner: true,
      isWritable: false,
    },
    {
      pubkey: accounts.lendingMarketAuthority,
      isSigner: false,
      isWritable: false,
    },
    { pubkey: accounts.lendingMarket, isSigner: false, isWritable: false },
    { pubkey: accounts.reserve, isSigner: false, isWritable: true },
    {
      pubkey: accounts.reserveLiquidityMint,
      isSigner: false,
      isWritable: false,
    },
    {
      pubkey: accounts.reserveDestinationLiquidity,
      isSigner: false,
      isWritable: true,
    },
    { pubkey: accounts.userSourceLiquidity, isSigner: false, isWritable: true },
    {
      pubkey: accounts.reserveLiquidityFeeReceiver,
      isSigner: false,
      isWritable: true,
    },
    { pubkey: accounts.referrerTokenState, isSigner: false, isWritable: true },
    { pubkey: accounts.referrerAccount, isSigner: false, isWritable: true },
    { pubkey: accounts.sysvarInfo, isSigner: false, isWritable: false },
    { pubkey: accounts.tokenProgram, isSigner: false, isWritable: false },
  ]
  const identifier = Buffer.from([185, 117, 0, 203, 96, 245, 180, 186])
  const buffer = Buffer.alloc(1000)
  const len = layout.encode(
    {
      liquidityAmount: args.liquidityAmount,
      borrowInstructionIndex: args.borrowInstructionIndex,
    },
    buffer
  )
  const data = Buffer.concat([identifier, buffer]).slice(0, 8 + len)
  const ix = new TransactionInstruction({ keys, programId, data })
  return ix
}
