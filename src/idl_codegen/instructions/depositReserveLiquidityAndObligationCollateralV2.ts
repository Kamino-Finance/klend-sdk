import { TransactionInstruction, PublicKey, AccountMeta } from "@solana/web3.js" // eslint-disable-line @typescript-eslint/no-unused-vars
import BN from "bn.js" // eslint-disable-line @typescript-eslint/no-unused-vars
import * as borsh from "@coral-xyz/borsh" // eslint-disable-line @typescript-eslint/no-unused-vars
import * as types from "../types" // eslint-disable-line @typescript-eslint/no-unused-vars
import { PROGRAM_ID } from "../programId"

export interface DepositReserveLiquidityAndObligationCollateralV2Args {
  liquidityAmount: BN
}

export interface DepositReserveLiquidityAndObligationCollateralV2Accounts {
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
  farmsAccounts: {
    obligationFarmUserState: PublicKey
    reserveFarmState: PublicKey
  }
  farmsProgram: PublicKey
}

export const layout = borsh.struct([borsh.u64("liquidityAmount")])

export function depositReserveLiquidityAndObligationCollateralV2(
  args: DepositReserveLiquidityAndObligationCollateralV2Args,
  accounts: DepositReserveLiquidityAndObligationCollateralV2Accounts,
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
      isWritable: true,
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
  const identifier = Buffer.from([216, 224, 191, 27, 204, 151, 102, 175])
  const buffer = Buffer.alloc(1000)
  const len = layout.encode(
    {
      liquidityAmount: args.liquidityAmount,
    },
    buffer
  )
  const data = Buffer.concat([identifier, buffer]).slice(0, 8 + len)
  const ix = new TransactionInstruction({ keys, programId, data })
  return ix
}
