import { TransactionInstruction, PublicKey, AccountMeta } from "@solana/web3.js" // eslint-disable-line @typescript-eslint/no-unused-vars
import BN from "bn.js" // eslint-disable-line @typescript-eslint/no-unused-vars
import * as borsh from "@coral-xyz/borsh" // eslint-disable-line @typescript-eslint/no-unused-vars
import * as types from "../types" // eslint-disable-line @typescript-eslint/no-unused-vars
import { PROGRAM_ID } from "../programId"

export interface RepayAndWithdrawAndRedeemV2Args {
  repayAmount: BN
  withdrawCollateralAmount: BN
}

export interface RepayAndWithdrawAndRedeemV2Accounts {
  repayAndWithdrawAccounts: {
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

export function repayAndWithdrawAndRedeemV2(
  args: RepayAndWithdrawAndRedeemV2Args,
  accounts: RepayAndWithdrawAndRedeemV2Accounts,
  programId: PublicKey = PROGRAM_ID
) {
  const keys: Array<AccountMeta> = [
    {
      pubkey: accounts.repayAndWithdrawAccounts.repayAccounts.owner,
      isSigner: true,
      isWritable: false,
    },
    {
      pubkey: accounts.repayAndWithdrawAccounts.repayAccounts.obligation,
      isSigner: false,
      isWritable: true,
    },
    {
      pubkey: accounts.repayAndWithdrawAccounts.repayAccounts.lendingMarket,
      isSigner: false,
      isWritable: false,
    },
    {
      pubkey: accounts.repayAndWithdrawAccounts.repayAccounts.repayReserve,
      isSigner: false,
      isWritable: true,
    },
    {
      pubkey:
        accounts.repayAndWithdrawAccounts.repayAccounts.reserveLiquidityMint,
      isSigner: false,
      isWritable: true,
    },
    {
      pubkey:
        accounts.repayAndWithdrawAccounts.repayAccounts
          .reserveDestinationLiquidity,
      isSigner: false,
      isWritable: true,
    },
    {
      pubkey:
        accounts.repayAndWithdrawAccounts.repayAccounts.userSourceLiquidity,
      isSigner: false,
      isWritable: true,
    },
    {
      pubkey: accounts.repayAndWithdrawAccounts.repayAccounts.tokenProgram,
      isSigner: false,
      isWritable: false,
    },
    {
      pubkey:
        accounts.repayAndWithdrawAccounts.repayAccounts
          .instructionSysvarAccount,
      isSigner: false,
      isWritable: false,
    },
    {
      pubkey: accounts.repayAndWithdrawAccounts.withdrawAccounts.owner,
      isSigner: true,
      isWritable: false,
    },
    {
      pubkey: accounts.repayAndWithdrawAccounts.withdrawAccounts.obligation,
      isSigner: false,
      isWritable: true,
    },
    {
      pubkey: accounts.repayAndWithdrawAccounts.withdrawAccounts.lendingMarket,
      isSigner: false,
      isWritable: false,
    },
    {
      pubkey:
        accounts.repayAndWithdrawAccounts.withdrawAccounts
          .lendingMarketAuthority,
      isSigner: false,
      isWritable: false,
    },
    {
      pubkey:
        accounts.repayAndWithdrawAccounts.withdrawAccounts.withdrawReserve,
      isSigner: false,
      isWritable: true,
    },
    {
      pubkey:
        accounts.repayAndWithdrawAccounts.withdrawAccounts.reserveLiquidityMint,
      isSigner: false,
      isWritable: true,
    },
    {
      pubkey:
        accounts.repayAndWithdrawAccounts.withdrawAccounts
          .reserveSourceCollateral,
      isSigner: false,
      isWritable: true,
    },
    {
      pubkey:
        accounts.repayAndWithdrawAccounts.withdrawAccounts
          .reserveCollateralMint,
      isSigner: false,
      isWritable: true,
    },
    {
      pubkey:
        accounts.repayAndWithdrawAccounts.withdrawAccounts
          .reserveLiquiditySupply,
      isSigner: false,
      isWritable: true,
    },
    {
      pubkey:
        accounts.repayAndWithdrawAccounts.withdrawAccounts
          .userDestinationLiquidity,
      isSigner: false,
      isWritable: true,
    },
    {
      pubkey:
        accounts.repayAndWithdrawAccounts.withdrawAccounts
          .placeholderUserDestinationCollateral,
      isSigner: false,
      isWritable: false,
    },
    {
      pubkey:
        accounts.repayAndWithdrawAccounts.withdrawAccounts
          .collateralTokenProgram,
      isSigner: false,
      isWritable: false,
    },
    {
      pubkey:
        accounts.repayAndWithdrawAccounts.withdrawAccounts
          .liquidityTokenProgram,
      isSigner: false,
      isWritable: false,
    },
    {
      pubkey:
        accounts.repayAndWithdrawAccounts.withdrawAccounts
          .instructionSysvarAccount,
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
  const identifier = Buffer.from([111, 173, 148, 121, 105, 221, 159, 99])
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
