import { TransactionInstruction, PublicKey, AccountMeta } from "@solana/web3.js" // eslint-disable-line @typescript-eslint/no-unused-vars
import BN from "bn.js" // eslint-disable-line @typescript-eslint/no-unused-vars
import * as borsh from "@coral-xyz/borsh" // eslint-disable-line @typescript-eslint/no-unused-vars
import * as types from "../types" // eslint-disable-line @typescript-eslint/no-unused-vars
import { PROGRAM_ID } from "../programId"

export interface DepositReserveLiquidityAndObligationCollateralArgs {
  liquidityAmount: BN
}

export interface DepositReserveLiquidityAndObligationCollateralAccounts {
  owner: PublicKey
  obligation: PublicKey
  lendingMarket: PublicKey
  lendingMarketAuthority: PublicKey
  reserve: PublicKey
  reserveLiquiditySupply: PublicKey
  reserveCollateralMint: PublicKey
  reserveDestinationDepositCollateral: PublicKey
  userSourceLiquidity: PublicKey
  placeholderUserDestinationCollateral: PublicKey
  tokenProgram: PublicKey
  instructionSysvarAccount: PublicKey
}

export const layout = borsh.struct([borsh.u64("liquidityAmount")])

export function depositReserveLiquidityAndObligationCollateral(
  args: DepositReserveLiquidityAndObligationCollateralArgs,
  accounts: DepositReserveLiquidityAndObligationCollateralAccounts,
  programId: PublicKey = PROGRAM_ID
) {
  const keys: Array<AccountMeta> = [
    { pubkey: accounts.owner, isSigner: true, isWritable: true },
    { pubkey: accounts.obligation, isSigner: false, isWritable: true },
    { pubkey: accounts.lendingMarket, isSigner: false, isWritable: false },
    {
      pubkey: accounts.lendingMarketAuthority,
      isSigner: false,
      isWritable: false,
    },
    { pubkey: accounts.reserve, isSigner: false, isWritable: true },
    {
      pubkey: accounts.reserveLiquiditySupply,
      isSigner: false,
      isWritable: true,
    },
    {
      pubkey: accounts.reserveCollateralMint,
      isSigner: false,
      isWritable: true,
    },
    {
      pubkey: accounts.reserveDestinationDepositCollateral,
      isSigner: false,
      isWritable: true,
    },
    { pubkey: accounts.userSourceLiquidity, isSigner: false, isWritable: true },
    {
      pubkey: accounts.placeholderUserDestinationCollateral,
      isSigner: false,
      isWritable: false,
    },
    { pubkey: accounts.tokenProgram, isSigner: false, isWritable: false },
    {
      pubkey: accounts.instructionSysvarAccount,
      isSigner: false,
      isWritable: false,
    },
  ]
  const identifier = Buffer.from([129, 199, 4, 2, 222, 39, 26, 46])
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
