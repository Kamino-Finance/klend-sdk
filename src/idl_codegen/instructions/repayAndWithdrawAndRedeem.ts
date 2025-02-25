import { TransactionInstruction, PublicKey, AccountMeta } from "@solana/web3.js" // eslint-disable-line @typescript-eslint/no-unused-vars
import BN from "bn.js" // eslint-disable-line @typescript-eslint/no-unused-vars
import * as borsh from "@coral-xyz/borsh" // eslint-disable-line @typescript-eslint/no-unused-vars
import * as types from "../types" // eslint-disable-line @typescript-eslint/no-unused-vars
import { PROGRAM_ID } from "../programId"

export interface RepayAndWithdrawAndRedeemArgs {
  repayAmount: BN
  withdrawCollateralAmount: BN
}

export interface RepayAndWithdrawAndRedeemAccounts {
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
  withdrawAccounts: {
    owner: PublicKey
    obligation: PublicKey
    lendingMarket: PublicKey
    lendingMarketAuthority: PublicKey
    withdrawReserve: PublicKey
    reserveLiquidityMint: PublicKey
    reserveSourceCollateral: PublicKey
    reserveCollateralMint: PublicKey
    reserveLiquiditySupply: PublicKey
    userDestinationLiquidity: PublicKey
    placeholderUserDestinationCollateral: PublicKey
    collateralTokenProgram: PublicKey
    liquidityTokenProgram: PublicKey
    instructionSysvarAccount: PublicKey
  }
  collateralFarmsAccounts: {
    obligationFarmUserState: PublicKey
    reserveFarmState: PublicKey
  }
  debtFarmsAccounts: {
    obligationFarmUserState: PublicKey
    reserveFarmState: PublicKey
  }
  farmsProgram: PublicKey
}

export const layout = borsh.struct([
  borsh.u64("repayAmount"),
  borsh.u64("withdrawCollateralAmount"),
])

export function repayAndWithdrawAndRedeem(
  args: RepayAndWithdrawAndRedeemArgs,
  accounts: RepayAndWithdrawAndRedeemAccounts,
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
      isWritable: false,
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
      pubkey: accounts.withdrawAccounts.owner,
      isSigner: true,
      isWritable: true,
    },
    {
      pubkey: accounts.withdrawAccounts.obligation,
      isSigner: false,
      isWritable: true,
    },
    {
      pubkey: accounts.withdrawAccounts.lendingMarket,
      isSigner: false,
      isWritable: false,
    },
    {
      pubkey: accounts.withdrawAccounts.lendingMarketAuthority,
      isSigner: false,
      isWritable: false,
    },
    {
      pubkey: accounts.withdrawAccounts.withdrawReserve,
      isSigner: false,
      isWritable: true,
    },
    {
      pubkey: accounts.withdrawAccounts.reserveLiquidityMint,
      isSigner: false,
      isWritable: false,
    },
    {
      pubkey: accounts.withdrawAccounts.reserveSourceCollateral,
      isSigner: false,
      isWritable: true,
    },
    {
      pubkey: accounts.withdrawAccounts.reserveCollateralMint,
      isSigner: false,
      isWritable: true,
    },
    {
      pubkey: accounts.withdrawAccounts.reserveLiquiditySupply,
      isSigner: false,
      isWritable: true,
    },
    {
      pubkey: accounts.withdrawAccounts.userDestinationLiquidity,
      isSigner: false,
      isWritable: true,
    },
    {
      pubkey: accounts.withdrawAccounts.placeholderUserDestinationCollateral,
      isSigner: false,
      isWritable: false,
    },
    {
      pubkey: accounts.withdrawAccounts.collateralTokenProgram,
      isSigner: false,
      isWritable: false,
    },
    {
      pubkey: accounts.withdrawAccounts.liquidityTokenProgram,
      isSigner: false,
      isWritable: false,
    },
    {
      pubkey: accounts.withdrawAccounts.instructionSysvarAccount,
      isSigner: false,
      isWritable: false,
    },
    {
      pubkey: accounts.collateralFarmsAccounts.obligationFarmUserState,
      isSigner: false,
      isWritable: true,
    },
    {
      pubkey: accounts.collateralFarmsAccounts.reserveFarmState,
      isSigner: false,
      isWritable: true,
    },
    {
      pubkey: accounts.debtFarmsAccounts.obligationFarmUserState,
      isSigner: false,
      isWritable: true,
    },
    {
      pubkey: accounts.debtFarmsAccounts.reserveFarmState,
      isSigner: false,
      isWritable: true,
    },
    { pubkey: accounts.farmsProgram, isSigner: false, isWritable: false },
  ]
  const identifier = Buffer.from([2, 54, 152, 3, 148, 96, 109, 218])
  const buffer = Buffer.alloc(1000)
  const len = layout.encode(
    {
      repayAmount: args.repayAmount,
      withdrawCollateralAmount: args.withdrawCollateralAmount,
    },
    buffer
  )
  const data = Buffer.concat([identifier, buffer]).slice(0, 8 + len)
  const ix = new TransactionInstruction({ keys, programId, data })
  return ix
}
