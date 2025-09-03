/* eslint-disable @typescript-eslint/no-unused-vars */
import {
  Address,
  isSome,
  AccountMeta,
  AccountSignerMeta,
  Instruction,
  Option,
  TransactionSigner,
} from "@solana/kit"
/* eslint-enable @typescript-eslint/no-unused-vars */
import BN from "bn.js" // eslint-disable-line @typescript-eslint/no-unused-vars
import * as borsh from "@coral-xyz/borsh" // eslint-disable-line @typescript-eslint/no-unused-vars
import { borshAddress } from "../utils" // eslint-disable-line @typescript-eslint/no-unused-vars
import * as types from "../types" // eslint-disable-line @typescript-eslint/no-unused-vars
import { PROGRAM_ID } from "../programId"

export const DISCRIMINATOR = Buffer.from([177, 71, 154, 188, 226, 133, 74, 55])

export interface LiquidateObligationAndRedeemReserveCollateralArgs {
  liquidityAmount: BN
  minAcceptableReceivedLiquidityAmount: BN
  maxAllowedLtvOverridePercent: BN
}

export interface LiquidateObligationAndRedeemReserveCollateralAccounts {
  liquidator: TransactionSigner
  obligation: Address
  lendingMarket: Address
  lendingMarketAuthority: Address
  repayReserve: Address
  repayReserveLiquidityMint: Address
  repayReserveLiquiditySupply: Address
  withdrawReserve: Address
  withdrawReserveLiquidityMint: Address
  withdrawReserveCollateralMint: Address
  withdrawReserveCollateralSupply: Address
  withdrawReserveLiquiditySupply: Address
  withdrawReserveLiquidityFeeReceiver: Address
  userSourceLiquidity: Address
  userDestinationCollateral: Address
  userDestinationLiquidity: Address
  collateralTokenProgram: Address
  repayLiquidityTokenProgram: Address
  withdrawLiquidityTokenProgram: Address
  instructionSysvarAccount: Address
}

export const layout =
  borsh.struct<LiquidateObligationAndRedeemReserveCollateralArgs>([
    borsh.u64("liquidityAmount"),
    borsh.u64("minAcceptableReceivedLiquidityAmount"),
    borsh.u64("maxAllowedLtvOverridePercent"),
  ])

export function liquidateObligationAndRedeemReserveCollateral(
  args: LiquidateObligationAndRedeemReserveCollateralArgs,
  accounts: LiquidateObligationAndRedeemReserveCollateralAccounts,
  remainingAccounts: Array<AccountMeta | AccountSignerMeta> = [],
  programAddress: Address = PROGRAM_ID
) {
  const keys: Array<AccountMeta | AccountSignerMeta> = [
    {
      address: accounts.liquidator.address,
      role: 2,
      signer: accounts.liquidator,
    },
    { address: accounts.obligation, role: 1 },
    { address: accounts.lendingMarket, role: 0 },
    { address: accounts.lendingMarketAuthority, role: 0 },
    { address: accounts.repayReserve, role: 1 },
    { address: accounts.repayReserveLiquidityMint, role: 0 },
    { address: accounts.repayReserveLiquiditySupply, role: 1 },
    { address: accounts.withdrawReserve, role: 1 },
    { address: accounts.withdrawReserveLiquidityMint, role: 0 },
    { address: accounts.withdrawReserveCollateralMint, role: 1 },
    { address: accounts.withdrawReserveCollateralSupply, role: 1 },
    { address: accounts.withdrawReserveLiquiditySupply, role: 1 },
    { address: accounts.withdrawReserveLiquidityFeeReceiver, role: 1 },
    { address: accounts.userSourceLiquidity, role: 1 },
    { address: accounts.userDestinationCollateral, role: 1 },
    { address: accounts.userDestinationLiquidity, role: 1 },
    { address: accounts.collateralTokenProgram, role: 0 },
    { address: accounts.repayLiquidityTokenProgram, role: 0 },
    { address: accounts.withdrawLiquidityTokenProgram, role: 0 },
    { address: accounts.instructionSysvarAccount, role: 0 },
    ...remainingAccounts,
  ]
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
  const data = Buffer.concat([DISCRIMINATOR, buffer]).slice(0, 8 + len)
  const ix: Instruction = { accounts: keys, programAddress, data }
  return ix
}
