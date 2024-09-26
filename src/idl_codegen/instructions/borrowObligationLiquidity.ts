import { TransactionInstruction, PublicKey, AccountMeta } from "@solana/web3.js" // eslint-disable-line @typescript-eslint/no-unused-vars
import BN from "bn.js" // eslint-disable-line @typescript-eslint/no-unused-vars
import * as borsh from "@coral-xyz/borsh" // eslint-disable-line @typescript-eslint/no-unused-vars
import * as types from "../types" // eslint-disable-line @typescript-eslint/no-unused-vars
import { PROGRAM_ID } from "../programId"

export interface BorrowObligationLiquidityArgs {
  liquidityAmount: BN
}

export interface BorrowObligationLiquidityAccounts {
  owner: PublicKey
  obligation: PublicKey
  lendingMarket: PublicKey
  lendingMarketAuthority: PublicKey
  borrowReserve: PublicKey
  borrowReserveLiquidityMint: PublicKey
  reserveSourceLiquidity: PublicKey
  borrowReserveLiquidityFeeReceiver: PublicKey
  userDestinationLiquidity: PublicKey
  referrerTokenState: PublicKey
  tokenProgram: PublicKey
  instructionSysvarAccount: PublicKey
}

export const layout = borsh.struct([borsh.u64("liquidityAmount")])

export function borrowObligationLiquidity(
  args: BorrowObligationLiquidityArgs,
  accounts: BorrowObligationLiquidityAccounts,
  programId: PublicKey = PROGRAM_ID
) {
  const keys: Array<AccountMeta> = [
    { pubkey: accounts.owner, isSigner: true, isWritable: false },
    { pubkey: accounts.obligation, isSigner: false, isWritable: true },
    { pubkey: accounts.lendingMarket, isSigner: false, isWritable: false },
    {
      pubkey: accounts.lendingMarketAuthority,
      isSigner: false,
      isWritable: false,
    },
    { pubkey: accounts.borrowReserve, isSigner: false, isWritable: true },
    {
      pubkey: accounts.borrowReserveLiquidityMint,
      isSigner: false,
      isWritable: true,
    },
    {
      pubkey: accounts.reserveSourceLiquidity,
      isSigner: false,
      isWritable: true,
    },
    {
      pubkey: accounts.borrowReserveLiquidityFeeReceiver,
      isSigner: false,
      isWritable: true,
    },
    {
      pubkey: accounts.userDestinationLiquidity,
      isSigner: false,
      isWritable: true,
    },
    { pubkey: accounts.referrerTokenState, isSigner: false, isWritable: true },
    { pubkey: accounts.tokenProgram, isSigner: false, isWritable: false },
    {
      pubkey: accounts.instructionSysvarAccount,
      isSigner: false,
      isWritable: false,
    },
  ]
  const identifier = Buffer.from([121, 127, 18, 204, 73, 245, 225, 65])
  const buffer = Buffer.alloc(1000)
  const len = layout.encode(
    {
      liquidityAmount: args.liquidityAmount,
    },
    buffer
  )
  const data = Buffer.concat([identifier, buffer]).slice(0, 8 + len)
  const ix = new TransactionInstruction({ keys, programId, data })
  return ix
}
