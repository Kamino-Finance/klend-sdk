import { TransactionInstruction, PublicKey, AccountMeta } from "@solana/web3.js" // eslint-disable-line @typescript-eslint/no-unused-vars
import BN from "bn.js" // eslint-disable-line @typescript-eslint/no-unused-vars
import * as borsh from "@coral-xyz/borsh" // eslint-disable-line @typescript-eslint/no-unused-vars
import * as types from "../types" // eslint-disable-line @typescript-eslint/no-unused-vars
import { PROGRAM_ID } from "../programId"

export interface RepayObligationLiquidityV2Args {
  liquidityAmount: BN
}

export interface RepayObligationLiquidityV2Accounts {
  repayAccounts: {
    owner: PublicKey
    obligation: PublicKey
    lendingMarket: PublicKey
    repayReserve: PublicKey
    reserveLiquidityMint: PublicKey
    reserveDestinationLiquidity: PublicKey
    userSourceLiquidity: PublicKey
    tokenProgram: PublicKey
    instructionSysvarAccount: PublicKey
  }
  farmsAccounts: {
    obligationFarmUserState: PublicKey
    reserveFarmState: PublicKey
  }
  lendingMarketAuthority: PublicKey
  farmsProgram: PublicKey
}

export const layout = borsh.struct([borsh.u64("liquidityAmount")])

export function repayObligationLiquidityV2(
  args: RepayObligationLiquidityV2Args,
  accounts: RepayObligationLiquidityV2Accounts,
  programId: PublicKey = PROGRAM_ID
) {
  const keys: Array<AccountMeta> = [
    { pubkey: accounts.repayAccounts.owner, isSigner: true, isWritable: false },
    {
      pubkey: accounts.repayAccounts.obligation,
      isSigner: false,
      isWritable: true,
    },
    {
      pubkey: accounts.repayAccounts.lendingMarket,
      isSigner: false,
      isWritable: false,
    },
    {
      pubkey: accounts.repayAccounts.repayReserve,
      isSigner: false,
      isWritable: true,
    },
    {
      pubkey: accounts.repayAccounts.reserveLiquidityMint,
      isSigner: false,
      isWritable: true,
    },
    {
      pubkey: accounts.repayAccounts.reserveDestinationLiquidity,
      isSigner: false,
      isWritable: true,
    },
    {
      pubkey: accounts.repayAccounts.userSourceLiquidity,
      isSigner: false,
      isWritable: true,
    },
    {
      pubkey: accounts.repayAccounts.tokenProgram,
      isSigner: false,
      isWritable: false,
    },
    {
      pubkey: accounts.repayAccounts.instructionSysvarAccount,
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
    {
      pubkey: accounts.lendingMarketAuthority,
      isSigner: false,
      isWritable: false,
    },
    { pubkey: accounts.farmsProgram, isSigner: false, isWritable: false },
  ]
  const identifier = Buffer.from([116, 174, 213, 76, 180, 53, 210, 144])
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
