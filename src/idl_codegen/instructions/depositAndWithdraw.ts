import { TransactionInstruction, PublicKey, AccountMeta } from "@solana/web3.js" // eslint-disable-line @typescript-eslint/no-unused-vars
import BN from "bn.js" // eslint-disable-line @typescript-eslint/no-unused-vars
import * as borsh from "@coral-xyz/borsh" // eslint-disable-line @typescript-eslint/no-unused-vars
import * as types from "../types" // eslint-disable-line @typescript-eslint/no-unused-vars
import { PROGRAM_ID } from "../programId"

export interface DepositAndWithdrawArgs {
  liquidityAmount: BN
  withdrawCollateralAmount: BN
}

export interface DepositAndWithdrawAccounts {
  depositAccounts: {
    owner: PublicKey
    obligation: PublicKey
    lendingMarket: PublicKey
    lendingMarketAuthority: PublicKey
    reserve: PublicKey
    reserveLiquidityMint: PublicKey
    reserveLiquiditySupply: PublicKey
    reserveCollateralMint: PublicKey
    reserveDestinationDepositCollateral: PublicKey
    userSourceLiquidity: PublicKey
    placeholderUserDestinationCollateral: PublicKey
    collateralTokenProgram: PublicKey
    liquidityTokenProgram: PublicKey
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
  depositFarmsAccounts: {
    obligationFarmUserState: PublicKey
    reserveFarmState: PublicKey
  }
  withdrawFarmsAccounts: {
    obligationFarmUserState: PublicKey
    reserveFarmState: PublicKey
  }
  farmsProgram: PublicKey
}

export const layout = borsh.struct([
  borsh.u64("liquidityAmount"),
  borsh.u64("withdrawCollateralAmount"),
])

export function depositAndWithdraw(
  args: DepositAndWithdrawArgs,
  accounts: DepositAndWithdrawAccounts,
  programId: PublicKey = PROGRAM_ID
) {
  const keys: Array<AccountMeta> = [
    {
      pubkey: accounts.depositAccounts.owner,
      isSigner: true,
      isWritable: true,
    },
    {
      pubkey: accounts.depositAccounts.obligation,
      isSigner: false,
      isWritable: true,
    },
    {
      pubkey: accounts.depositAccounts.lendingMarket,
      isSigner: false,
      isWritable: false,
    },
    {
      pubkey: accounts.depositAccounts.lendingMarketAuthority,
      isSigner: false,
      isWritable: false,
    },
    {
      pubkey: accounts.depositAccounts.reserve,
      isSigner: false,
      isWritable: true,
    },
    {
      pubkey: accounts.depositAccounts.reserveLiquidityMint,
      isSigner: false,
      isWritable: false,
    },
    {
      pubkey: accounts.depositAccounts.reserveLiquiditySupply,
      isSigner: false,
      isWritable: true,
    },
    {
      pubkey: accounts.depositAccounts.reserveCollateralMint,
      isSigner: false,
      isWritable: true,
    },
    {
      pubkey: accounts.depositAccounts.reserveDestinationDepositCollateral,
      isSigner: false,
      isWritable: true,
    },
    {
      pubkey: accounts.depositAccounts.userSourceLiquidity,
      isSigner: false,
      isWritable: true,
    },
    {
      pubkey: accounts.depositAccounts.placeholderUserDestinationCollateral,
      isSigner: false,
      isWritable: false,
    },
    {
      pubkey: accounts.depositAccounts.collateralTokenProgram,
      isSigner: false,
      isWritable: false,
    },
    {
      pubkey: accounts.depositAccounts.liquidityTokenProgram,
      isSigner: false,
      isWritable: false,
    },
    {
      pubkey: accounts.depositAccounts.instructionSysvarAccount,
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
      pubkey: accounts.depositFarmsAccounts.obligationFarmUserState,
      isSigner: false,
      isWritable: true,
    },
    {
      pubkey: accounts.depositFarmsAccounts.reserveFarmState,
      isSigner: false,
      isWritable: true,
    },
    {
      pubkey: accounts.withdrawFarmsAccounts.obligationFarmUserState,
      isSigner: false,
      isWritable: true,
    },
    {
      pubkey: accounts.withdrawFarmsAccounts.reserveFarmState,
      isSigner: false,
      isWritable: true,
    },
    { pubkey: accounts.farmsProgram, isSigner: false, isWritable: false },
  ]
  const identifier = Buffer.from([141, 153, 39, 15, 64, 61, 88, 84])
  const buffer = Buffer.alloc(1000)
  const len = layout.encode(
    {
      liquidityAmount: args.liquidityAmount,
      withdrawCollateralAmount: args.withdrawCollateralAmount,
    },
    buffer
  )
  const data = Buffer.concat([identifier, buffer]).slice(0, 8 + len)
  const ix = new TransactionInstruction({ keys, programId, data })
  return ix
}
