import { TransactionInstruction, PublicKey, AccountMeta } from "@solana/web3.js" // eslint-disable-line @typescript-eslint/no-unused-vars
import BN from "bn.js" // eslint-disable-line @typescript-eslint/no-unused-vars
import * as borsh from "@coral-xyz/borsh" // eslint-disable-line @typescript-eslint/no-unused-vars
import * as types from "../types" // eslint-disable-line @typescript-eslint/no-unused-vars
import { PROGRAM_ID } from "../programId"

export interface RedeemReserveCollateralArgs {
  collateralAmount: BN
}

export interface RedeemReserveCollateralAccounts {
  owner: PublicKey
  lendingMarket: PublicKey
  reserve: PublicKey
  lendingMarketAuthority: PublicKey
  reserveLiquidityMint: PublicKey
  reserveCollateralMint: PublicKey
  reserveLiquiditySupply: PublicKey
  userSourceCollateral: PublicKey
  userDestinationLiquidity: PublicKey
  collateralTokenProgram: PublicKey
  liquidityTokenProgram: PublicKey
  instructionSysvarAccount: PublicKey
}

export const layout = borsh.struct([borsh.u64("collateralAmount")])

export function redeemReserveCollateral(
  args: RedeemReserveCollateralArgs,
  accounts: RedeemReserveCollateralAccounts,
  programId: PublicKey = PROGRAM_ID
) {
  const keys: Array<AccountMeta> = [
    { pubkey: accounts.owner, isSigner: true, isWritable: false },
    { pubkey: accounts.lendingMarket, isSigner: false, isWritable: false },
    { pubkey: accounts.reserve, isSigner: false, isWritable: true },
    {
      pubkey: accounts.lendingMarketAuthority,
      isSigner: false,
      isWritable: false,
    },
    {
      pubkey: accounts.reserveLiquidityMint,
      isSigner: false,
      isWritable: true,
    },
    {
      pubkey: accounts.reserveCollateralMint,
      isSigner: false,
      isWritable: true,
    },
    {
      pubkey: accounts.reserveLiquiditySupply,
      isSigner: false,
      isWritable: true,
    },
    {
      pubkey: accounts.userSourceCollateral,
      isSigner: false,
      isWritable: true,
    },
    {
      pubkey: accounts.userDestinationLiquidity,
      isSigner: false,
      isWritable: true,
    },
    {
      pubkey: accounts.collateralTokenProgram,
      isSigner: false,
      isWritable: false,
    },
    {
      pubkey: accounts.liquidityTokenProgram,
      isSigner: false,
      isWritable: false,
    },
    {
      pubkey: accounts.instructionSysvarAccount,
      isSigner: false,
      isWritable: false,
    },
  ]
  const identifier = Buffer.from([234, 117, 181, 125, 185, 142, 220, 29])
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
