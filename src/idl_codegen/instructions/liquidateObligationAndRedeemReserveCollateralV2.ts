import { TransactionInstruction, PublicKey, AccountMeta } from "@solana/web3.js" // eslint-disable-line @typescript-eslint/no-unused-vars
import BN from "bn.js" // eslint-disable-line @typescript-eslint/no-unused-vars
import * as borsh from "@coral-xyz/borsh" // eslint-disable-line @typescript-eslint/no-unused-vars
import * as types from "../types" // eslint-disable-line @typescript-eslint/no-unused-vars
import { PROGRAM_ID } from "../programId"

export interface LiquidateObligationAndRedeemReserveCollateralV2Args {
  liquidityAmount: BN
  minAcceptableReceivedLiquidityAmount: BN
  maxAllowedLtvOverridePercent: BN
}

export interface LiquidateObligationAndRedeemReserveCollateralV2Accounts {
  liquidationAccounts: {
    liquidator: PublicKey
    obligation: PublicKey
    lendingMarket: PublicKey
    lendingMarketAuthority: PublicKey
    repayReserve: PublicKey
    repayReserveLiquidityMint: PublicKey
    repayReserveLiquiditySupply: PublicKey
    withdrawReserve: PublicKey
    withdrawReserveLiquidityMint: PublicKey
    withdrawReserveCollateralMint: PublicKey
    withdrawReserveCollateralSupply: PublicKey
    withdrawReserveLiquiditySupply: PublicKey
    withdrawReserveLiquidityFeeReceiver: PublicKey
    userSourceLiquidity: PublicKey
    userDestinationCollateral: PublicKey
    userDestinationLiquidity: PublicKey
    collateralTokenProgram: PublicKey
    repayLiquidityTokenProgram: PublicKey
    withdrawLiquidityTokenProgram: PublicKey
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
  borsh.u64("liquidityAmount"),
  borsh.u64("minAcceptableReceivedLiquidityAmount"),
  borsh.u64("maxAllowedLtvOverridePercent"),
])

export function liquidateObligationAndRedeemReserveCollateralV2(
  args: LiquidateObligationAndRedeemReserveCollateralV2Args,
  accounts: LiquidateObligationAndRedeemReserveCollateralV2Accounts,
  programId: PublicKey = PROGRAM_ID
) {
  const keys: Array<AccountMeta> = [
    {
      pubkey: accounts.liquidationAccounts.liquidator,
      isSigner: true,
      isWritable: false,
    },
    {
      pubkey: accounts.liquidationAccounts.obligation,
      isSigner: false,
      isWritable: true,
    },
    {
      pubkey: accounts.liquidationAccounts.lendingMarket,
      isSigner: false,
      isWritable: false,
    },
    {
      pubkey: accounts.liquidationAccounts.lendingMarketAuthority,
      isSigner: false,
      isWritable: false,
    },
    {
      pubkey: accounts.liquidationAccounts.repayReserve,
      isSigner: false,
      isWritable: true,
    },
    {
      pubkey: accounts.liquidationAccounts.repayReserveLiquidityMint,
      isSigner: false,
      isWritable: true,
    },
    {
      pubkey: accounts.liquidationAccounts.repayReserveLiquiditySupply,
      isSigner: false,
      isWritable: true,
    },
    {
      pubkey: accounts.liquidationAccounts.withdrawReserve,
      isSigner: false,
      isWritable: true,
    },
    {
      pubkey: accounts.liquidationAccounts.withdrawReserveLiquidityMint,
      isSigner: false,
      isWritable: true,
    },
    {
      pubkey: accounts.liquidationAccounts.withdrawReserveCollateralMint,
      isSigner: false,
      isWritable: true,
    },
    {
      pubkey: accounts.liquidationAccounts.withdrawReserveCollateralSupply,
      isSigner: false,
      isWritable: true,
    },
    {
      pubkey: accounts.liquidationAccounts.withdrawReserveLiquiditySupply,
      isSigner: false,
      isWritable: true,
    },
    {
      pubkey: accounts.liquidationAccounts.withdrawReserveLiquidityFeeReceiver,
      isSigner: false,
      isWritable: true,
    },
    {
      pubkey: accounts.liquidationAccounts.userSourceLiquidity,
      isSigner: false,
      isWritable: true,
    },
    {
      pubkey: accounts.liquidationAccounts.userDestinationCollateral,
      isSigner: false,
      isWritable: true,
    },
    {
      pubkey: accounts.liquidationAccounts.userDestinationLiquidity,
      isSigner: false,
      isWritable: true,
    },
    {
      pubkey: accounts.liquidationAccounts.collateralTokenProgram,
      isSigner: false,
      isWritable: false,
    },
    {
      pubkey: accounts.liquidationAccounts.repayLiquidityTokenProgram,
      isSigner: false,
      isWritable: false,
    },
    {
      pubkey: accounts.liquidationAccounts.withdrawLiquidityTokenProgram,
      isSigner: false,
      isWritable: false,
    },
    {
      pubkey: accounts.liquidationAccounts.instructionSysvarAccount,
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
  const identifier = Buffer.from([162, 161, 35, 143, 30, 187, 185, 103])
  const buffer = Buffer.alloc(1000)
  const len = layout.encode(
    {
      liquidityAmount: args.liquidityAmount,
      minAcceptableReceivedLiquidityAmount:
        args.minAcceptableReceivedLiquidityAmount,
      maxAllowedLtvOverridePercent: args.maxAllowedLtvOverridePercent,
    },
    buffer
  )
  const data = Buffer.concat([identifier, buffer]).slice(0, 8 + len)
  const ix = new TransactionInstruction({ keys, programId, data })
  return ix
}
