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

export const DISCRIMINATOR = Buffer.from([162, 161, 35, 143, 30, 187, 185, 103])

export interface LiquidateObligationAndRedeemReserveCollateralV2Args {
  liquidityAmount: BN
  minAcceptableReceivedLiquidityAmount: BN
  maxAllowedLtvOverridePercent: BN
}

export interface LiquidateObligationAndRedeemReserveCollateralV2Accounts {
  liquidationAccounts: {
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
  collateralFarmsAccounts: {
    obligationFarmUserState: Option<Address>
    reserveFarmState: Option<Address>
  }
  debtFarmsAccounts: {
    obligationFarmUserState: Option<Address>
    reserveFarmState: Option<Address>
  }
  farmsProgram: Address
}

export const layout =
  borsh.struct<LiquidateObligationAndRedeemReserveCollateralV2Args>([
    borsh.u64("liquidityAmount"),
    borsh.u64("minAcceptableReceivedLiquidityAmount"),
    borsh.u64("maxAllowedLtvOverridePercent"),
  ])

export function liquidateObligationAndRedeemReserveCollateralV2(
  args: LiquidateObligationAndRedeemReserveCollateralV2Args,
  accounts: LiquidateObligationAndRedeemReserveCollateralV2Accounts,
  remainingAccounts: Array<AccountMeta | AccountSignerMeta> = [],
  programAddress: Address = PROGRAM_ID
) {
  const keys: Array<AccountMeta | AccountSignerMeta> = [
    {
      address: accounts.liquidationAccounts.liquidator.address,
      role: 2,
      signer: accounts.liquidationAccounts.liquidator,
    },
    { address: accounts.liquidationAccounts.obligation, role: 1 },
    { address: accounts.liquidationAccounts.lendingMarket, role: 0 },
    { address: accounts.liquidationAccounts.lendingMarketAuthority, role: 1 },
    { address: accounts.liquidationAccounts.repayReserve, role: 1 },
    {
      address: accounts.liquidationAccounts.repayReserveLiquidityMint,
      role: 0,
    },
    {
      address: accounts.liquidationAccounts.repayReserveLiquiditySupply,
      role: 1,
    },
    { address: accounts.liquidationAccounts.withdrawReserve, role: 1 },
    {
      address: accounts.liquidationAccounts.withdrawReserveLiquidityMint,
      role: 0,
    },
    {
      address: accounts.liquidationAccounts.withdrawReserveCollateralMint,
      role: 1,
    },
    {
      address: accounts.liquidationAccounts.withdrawReserveCollateralSupply,
      role: 1,
    },
    {
      address: accounts.liquidationAccounts.withdrawReserveLiquiditySupply,
      role: 1,
    },
    {
      address: accounts.liquidationAccounts.withdrawReserveLiquidityFeeReceiver,
      role: 1,
    },
    { address: accounts.liquidationAccounts.userSourceLiquidity, role: 1 },
    {
      address: accounts.liquidationAccounts.userDestinationCollateral,
      role: 1,
    },
    { address: accounts.liquidationAccounts.userDestinationLiquidity, role: 1 },
    { address: accounts.liquidationAccounts.collateralTokenProgram, role: 0 },
    {
      address: accounts.liquidationAccounts.repayLiquidityTokenProgram,
      role: 0,
    },
    {
      address: accounts.liquidationAccounts.withdrawLiquidityTokenProgram,
      role: 0,
    },
    { address: accounts.liquidationAccounts.instructionSysvarAccount, role: 0 },
    isSome(accounts.collateralFarmsAccounts.obligationFarmUserState)
      ? {
          address:
            accounts.collateralFarmsAccounts.obligationFarmUserState.value,
          role: 1,
        }
      : { address: programAddress, role: 0 },
    isSome(accounts.collateralFarmsAccounts.reserveFarmState)
      ? {
          address: accounts.collateralFarmsAccounts.reserveFarmState.value,
          role: 1,
        }
      : { address: programAddress, role: 0 },
    isSome(accounts.debtFarmsAccounts.obligationFarmUserState)
      ? {
          address: accounts.debtFarmsAccounts.obligationFarmUserState.value,
          role: 1,
        }
      : { address: programAddress, role: 0 },
    isSome(accounts.debtFarmsAccounts.reserveFarmState)
      ? { address: accounts.debtFarmsAccounts.reserveFarmState.value, role: 1 }
      : { address: programAddress, role: 0 },
    { address: accounts.farmsProgram, role: 0 },
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
