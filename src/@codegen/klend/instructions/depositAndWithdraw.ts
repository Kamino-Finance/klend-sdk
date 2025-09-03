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

export const DISCRIMINATOR = Buffer.from([141, 153, 39, 15, 64, 61, 88, 84])

export interface DepositAndWithdrawArgs {
  liquidityAmount: BN
  withdrawCollateralAmount: BN
}

export interface DepositAndWithdrawAccounts {
  depositAccounts: {
    owner: TransactionSigner
    obligation: Address
    lendingMarket: Address
    lendingMarketAuthority: Address
    reserve: Address
    reserveLiquidityMint: Address
    reserveLiquiditySupply: Address
    reserveCollateralMint: Address
    reserveDestinationDepositCollateral: Address
    userSourceLiquidity: Address
    placeholderUserDestinationCollateral: Option<Address>
    collateralTokenProgram: Address
    liquidityTokenProgram: Address
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
  depositFarmsAccounts: {
    obligationFarmUserState: Option<Address>
    reserveFarmState: Option<Address>
  }
  withdrawFarmsAccounts: {
    obligationFarmUserState: Option<Address>
    reserveFarmState: Option<Address>
  }
  farmsProgram: Address
}

export const layout = borsh.struct<DepositAndWithdrawArgs>([
  borsh.u64("liquidityAmount"),
  borsh.u64("withdrawCollateralAmount"),
])

export function depositAndWithdraw(
  args: DepositAndWithdrawArgs,
  accounts: DepositAndWithdrawAccounts,
  remainingAccounts: Array<AccountMeta | AccountSignerMeta> = [],
  programAddress: Address = PROGRAM_ID
) {
  const keys: Array<AccountMeta | AccountSignerMeta> = [
    {
      address: accounts.depositAccounts.owner.address,
      role: 3,
      signer: accounts.depositAccounts.owner,
    },
    { address: accounts.depositAccounts.obligation, role: 1 },
    { address: accounts.depositAccounts.lendingMarket, role: 0 },
    { address: accounts.depositAccounts.lendingMarketAuthority, role: 0 },
    { address: accounts.depositAccounts.reserve, role: 1 },
    { address: accounts.depositAccounts.reserveLiquidityMint, role: 0 },
    { address: accounts.depositAccounts.reserveLiquiditySupply, role: 1 },
    { address: accounts.depositAccounts.reserveCollateralMint, role: 1 },
    {
      address: accounts.depositAccounts.reserveDestinationDepositCollateral,
      role: 1,
    },
    { address: accounts.depositAccounts.userSourceLiquidity, role: 1 },
    isSome(accounts.depositAccounts.placeholderUserDestinationCollateral)
      ? {
          address:
            accounts.depositAccounts.placeholderUserDestinationCollateral.value,
          role: 0,
        }
      : { address: programAddress, role: 0 },
    { address: accounts.depositAccounts.collateralTokenProgram, role: 0 },
    { address: accounts.depositAccounts.liquidityTokenProgram, role: 0 },
    { address: accounts.depositAccounts.instructionSysvarAccount, role: 0 },
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
    isSome(accounts.depositFarmsAccounts.obligationFarmUserState)
      ? {
          address: accounts.depositFarmsAccounts.obligationFarmUserState.value,
          role: 1,
        }
      : { address: programAddress, role: 0 },
    isSome(accounts.depositFarmsAccounts.reserveFarmState)
      ? {
          address: accounts.depositFarmsAccounts.reserveFarmState.value,
          role: 1,
        }
      : { address: programAddress, role: 0 },
    isSome(accounts.withdrawFarmsAccounts.obligationFarmUserState)
      ? {
          address: accounts.withdrawFarmsAccounts.obligationFarmUserState.value,
          role: 1,
        }
      : { address: programAddress, role: 0 },
    isSome(accounts.withdrawFarmsAccounts.reserveFarmState)
      ? {
          address: accounts.withdrawFarmsAccounts.reserveFarmState.value,
          role: 1,
        }
      : { address: programAddress, role: 0 },
    { address: accounts.farmsProgram, role: 0 },
    ...remainingAccounts,
  ]
  const buffer = Buffer.alloc(1000)
  const len = layout.encode(
    {
      liquidityAmount: args.liquidityAmount,
      withdrawCollateralAmount: args.withdrawCollateralAmount,
    },
    buffer
  )
  const data = Buffer.concat([DISCRIMINATOR, buffer]).slice(0, 8 + len)
  const ix: Instruction = { accounts: keys, programAddress, data }
  return ix
}
