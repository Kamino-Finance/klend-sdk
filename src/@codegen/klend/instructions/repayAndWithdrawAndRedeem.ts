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

export const DISCRIMINATOR = Buffer.from([2, 54, 152, 3, 148, 96, 109, 218])

export interface RepayAndWithdrawAndRedeemArgs {
  repayAmount: BN
  withdrawCollateralAmount: BN
}

export interface RepayAndWithdrawAndRedeemAccounts {
  repayAccounts: {
    owner: TransactionSigner
    obligation: Address
    lendingMarket: Address
    repayReserve: Address
    reserveLiquidityMint: Address
    reserveDestinationLiquidity: Address
    userSourceLiquidity: Address
    tokenProgram: Address
    instructionSysvarAccount: Address
  }
  withdrawAccounts: {
    owner: TransactionSigner
    obligation: Address
    lendingMarket: Address
    lendingMarketAuthority: Address
    withdrawReserve: Address
    reserveLiquidityMint: Address
    reserveSourceCollateral: Address
    reserveCollateralMint: Address
    reserveLiquiditySupply: Address
    userDestinationLiquidity: Address
    placeholderUserDestinationCollateral: Option<Address>
    collateralTokenProgram: Address
    liquidityTokenProgram: Address
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

export const layout = borsh.struct<RepayAndWithdrawAndRedeemArgs>([
  borsh.u64("repayAmount"),
  borsh.u64("withdrawCollateralAmount"),
])

export function repayAndWithdrawAndRedeem(
  args: RepayAndWithdrawAndRedeemArgs,
  accounts: RepayAndWithdrawAndRedeemAccounts,
  remainingAccounts: Array<AccountMeta | AccountSignerMeta> = [],
  programAddress: Address = PROGRAM_ID
) {
  const keys: Array<AccountMeta | AccountSignerMeta> = [
    {
      address: accounts.repayAccounts.owner.address,
      role: 2,
      signer: accounts.repayAccounts.owner,
    },
    { address: accounts.repayAccounts.obligation, role: 1 },
    { address: accounts.repayAccounts.lendingMarket, role: 0 },
    { address: accounts.repayAccounts.repayReserve, role: 1 },
    { address: accounts.repayAccounts.reserveLiquidityMint, role: 0 },
    { address: accounts.repayAccounts.reserveDestinationLiquidity, role: 1 },
    { address: accounts.repayAccounts.userSourceLiquidity, role: 1 },
    { address: accounts.repayAccounts.tokenProgram, role: 0 },
    { address: accounts.repayAccounts.instructionSysvarAccount, role: 0 },
    {
      address: accounts.withdrawAccounts.owner.address,
      role: 3,
      signer: accounts.withdrawAccounts.owner,
    },
    { address: accounts.withdrawAccounts.obligation, role: 1 },
    { address: accounts.withdrawAccounts.lendingMarket, role: 0 },
    { address: accounts.withdrawAccounts.lendingMarketAuthority, role: 0 },
    { address: accounts.withdrawAccounts.withdrawReserve, role: 1 },
    { address: accounts.withdrawAccounts.reserveLiquidityMint, role: 0 },
    { address: accounts.withdrawAccounts.reserveSourceCollateral, role: 1 },
    { address: accounts.withdrawAccounts.reserveCollateralMint, role: 1 },
    { address: accounts.withdrawAccounts.reserveLiquiditySupply, role: 1 },
    { address: accounts.withdrawAccounts.userDestinationLiquidity, role: 1 },
    isSome(accounts.withdrawAccounts.placeholderUserDestinationCollateral)
      ? {
          address:
            accounts.withdrawAccounts.placeholderUserDestinationCollateral
              .value,
          role: 0,
        }
      : { address: programAddress, role: 0 },
    { address: accounts.withdrawAccounts.collateralTokenProgram, role: 0 },
    { address: accounts.withdrawAccounts.liquidityTokenProgram, role: 0 },
    { address: accounts.withdrawAccounts.instructionSysvarAccount, role: 0 },
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
      repayAmount: args.repayAmount,
      withdrawCollateralAmount: args.withdrawCollateralAmount,
    },
    buffer
  )
  const data = Buffer.concat([DISCRIMINATOR, buffer]).slice(0, 8 + len)
  const ix: Instruction = { accounts: keys, programAddress, data }
  return ix
}
