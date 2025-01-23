import { TransactionInstruction, PublicKey, AccountMeta } from "@solana/web3.js" // eslint-disable-line @typescript-eslint/no-unused-vars
import BN from "bn.js" // eslint-disable-line @typescript-eslint/no-unused-vars
import * as borsh from "@coral-xyz/borsh" // eslint-disable-line @typescript-eslint/no-unused-vars
import * as types from "../types" // eslint-disable-line @typescript-eslint/no-unused-vars
import { PROGRAM_ID } from "../programId"

export interface WithdrawObligationCollateralAndRedeemReserveCollateralV2Args {
  collateralAmount: BN
}

export interface WithdrawObligationCollateralAndRedeemReserveCollateralV2Accounts {
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
  farmsAccounts: {
    obligationFarmUserState: PublicKey
    reserveFarmState: PublicKey
  }
  farmsProgram: PublicKey
}

export const layout = borsh.struct([borsh.u64("collateralAmount")])

export function withdrawObligationCollateralAndRedeemReserveCollateralV2(
  args: WithdrawObligationCollateralAndRedeemReserveCollateralV2Args,
  accounts: WithdrawObligationCollateralAndRedeemReserveCollateralV2Accounts,
  programId: PublicKey = PROGRAM_ID
) {
  const keys: Array<AccountMeta> = [
    {
      pubkey: accounts.withdrawAccounts.owner,
      isSigner: true,
      isWritable: false,
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
      isWritable: true,
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
      pubkey: accounts.farmsAccounts.obligationFarmUserState,
      isSigner: false,
      isWritable: true,
    },
    {
      pubkey: accounts.farmsAccounts.reserveFarmState,
      isSigner: false,
      isWritable: true,
    },
    { pubkey: accounts.farmsProgram, isSigner: false, isWritable: false },
  ]
  const identifier = Buffer.from([235, 52, 119, 152, 149, 197, 20, 7])
  const buffer = Buffer.alloc(1000)
  const len = layout.encode(
    {
      collateralAmount: args.collateralAmount,
    },
    buffer
  )
  const data = Buffer.concat([identifier, buffer]).slice(0, 8 + len)
  const ix = new TransactionInstruction({ keys, programId, data })
  return ix
}
