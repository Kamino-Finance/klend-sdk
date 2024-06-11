import { TransactionInstruction, PublicKey, AccountMeta } from "@solana/web3.js" // eslint-disable-line @typescript-eslint/no-unused-vars
import BN from "bn.js" // eslint-disable-line @typescript-eslint/no-unused-vars
import * as borsh from "@coral-xyz/borsh" // eslint-disable-line @typescript-eslint/no-unused-vars
import * as types from "../types" // eslint-disable-line @typescript-eslint/no-unused-vars
import { PROGRAM_ID } from "../programId"

export interface LiquidateObligationAndRedeemReserveCollateralArgs {
  liquidityAmount: BN
  minAcceptableReceivedLiquidityAmount: BN
  maxAllowedLtvOverridePercent: BN
}

export interface LiquidateObligationAndRedeemReserveCollateralAccounts {
  liquidator: PublicKey
  obligation: PublicKey
  lendingMarket: PublicKey
  lendingMarketAuthority: PublicKey
  repayReserve: PublicKey
  repayReserveLiquiditySupply: PublicKey
  withdrawReserve: PublicKey
  withdrawReserveCollateralMint: PublicKey
  withdrawReserveCollateralSupply: PublicKey
  withdrawReserveLiquiditySupply: PublicKey
  withdrawReserveLiquidityFeeReceiver: PublicKey
  userSourceLiquidity: PublicKey
  userDestinationCollateral: PublicKey
  userDestinationLiquidity: PublicKey
  tokenProgram: PublicKey
  instructionSysvarAccount: PublicKey
}

export const layout = borsh.struct([
  borsh.u64("liquidityAmount"),
  borsh.u64("minAcceptableReceivedLiquidityAmount"),
  borsh.u64("maxAllowedLtvOverridePercent"),
])

export function liquidateObligationAndRedeemReserveCollateral(
  args: LiquidateObligationAndRedeemReserveCollateralArgs,
  accounts: LiquidateObligationAndRedeemReserveCollateralAccounts,
  programId: PublicKey = PROGRAM_ID
) {
  const keys: Array<AccountMeta> = [
    { pubkey: accounts.liquidator, isSigner: true, isWritable: false },
    { pubkey: accounts.obligation, isSigner: false, isWritable: true },
    { pubkey: accounts.lendingMarket, isSigner: false, isWritable: false },
    {
      pubkey: accounts.lendingMarketAuthority,
      isSigner: false,
      isWritable: false,
    },
    { pubkey: accounts.repayReserve, isSigner: false, isWritable: true },
    {
      pubkey: accounts.repayReserveLiquiditySupply,
      isSigner: false,
      isWritable: true,
    },
    { pubkey: accounts.withdrawReserve, isSigner: false, isWritable: true },
    {
      pubkey: accounts.withdrawReserveCollateralMint,
      isSigner: false,
      isWritable: true,
    },
    {
      pubkey: accounts.withdrawReserveCollateralSupply,
      isSigner: false,
      isWritable: true,
    },
    {
      pubkey: accounts.withdrawReserveLiquiditySupply,
      isSigner: false,
      isWritable: true,
    },
    {
      pubkey: accounts.withdrawReserveLiquidityFeeReceiver,
      isSigner: false,
      isWritable: true,
    },
    { pubkey: accounts.userSourceLiquidity, isSigner: false, isWritable: true },
    {
      pubkey: accounts.userDestinationCollateral,
      isSigner: false,
      isWritable: true,
    },
    {
      pubkey: accounts.userDestinationLiquidity,
      isSigner: false,
      isWritable: true,
    },
    { pubkey: accounts.tokenProgram, isSigner: false, isWritable: false },
    {
      pubkey: accounts.instructionSysvarAccount,
      isSigner: false,
      isWritable: false,
    },
  ]
  const identifier = Buffer.from([177, 71, 154, 188, 226, 133, 74, 55])
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
