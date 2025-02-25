import { TransactionInstruction, PublicKey, AccountMeta } from "@solana/web3.js" // eslint-disable-line @typescript-eslint/no-unused-vars
import BN from "bn.js" // eslint-disable-line @typescript-eslint/no-unused-vars
import * as borsh from "@coral-xyz/borsh" // eslint-disable-line @typescript-eslint/no-unused-vars
import * as types from "../types" // eslint-disable-line @typescript-eslint/no-unused-vars
import { PROGRAM_ID } from "../programId"

export interface BorrowObligationLiquidityV2Args {
  liquidityAmount: BN
}

export interface BorrowObligationLiquidityV2Accounts {
  borrowAccounts: {
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
  farmsAccounts: {
    obligationFarmUserState: PublicKey
    reserveFarmState: PublicKey
  }
  farmsProgram: PublicKey
}

export const layout = borsh.struct([borsh.u64("liquidityAmount")])

export function borrowObligationLiquidityV2(
  args: BorrowObligationLiquidityV2Args,
  accounts: BorrowObligationLiquidityV2Accounts,
  programId: PublicKey = PROGRAM_ID
) {
  const keys: Array<AccountMeta> = [
    {
      pubkey: accounts.borrowAccounts.owner,
      isSigner: true,
      isWritable: false,
    },
    {
      pubkey: accounts.borrowAccounts.obligation,
      isSigner: false,
      isWritable: true,
    },
    {
      pubkey: accounts.borrowAccounts.lendingMarket,
      isSigner: false,
      isWritable: false,
    },
    {
      pubkey: accounts.borrowAccounts.lendingMarketAuthority,
      isSigner: false,
      isWritable: false,
    },
    {
      pubkey: accounts.borrowAccounts.borrowReserve,
      isSigner: false,
      isWritable: true,
    },
    {
      pubkey: accounts.borrowAccounts.borrowReserveLiquidityMint,
      isSigner: false,
      isWritable: false,
    },
    {
      pubkey: accounts.borrowAccounts.reserveSourceLiquidity,
      isSigner: false,
      isWritable: true,
    },
    {
      pubkey: accounts.borrowAccounts.borrowReserveLiquidityFeeReceiver,
      isSigner: false,
      isWritable: true,
    },
    {
      pubkey: accounts.borrowAccounts.userDestinationLiquidity,
      isSigner: false,
      isWritable: true,
    },
    {
      pubkey: accounts.borrowAccounts.referrerTokenState,
      isSigner: false,
      isWritable: true,
    },
    {
      pubkey: accounts.borrowAccounts.tokenProgram,
      isSigner: false,
      isWritable: false,
    },
    {
      pubkey: accounts.borrowAccounts.instructionSysvarAccount,
      isSigner: false,
      isWritable: false,
    },
    {
      pubkey: accounts.farmsAccounts.obligationFarmUserState,
      isSigner: false,
      isWritable: true,
    },
    {
      pubkey: accounts.farmsAccounts.reserveFarmState,
      isSigner: false,
      isWritable: true,
    },
    { pubkey: accounts.farmsProgram, isSigner: false, isWritable: false },
  ]
  const identifier = Buffer.from([161, 128, 143, 245, 171, 199, 194, 6])
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
