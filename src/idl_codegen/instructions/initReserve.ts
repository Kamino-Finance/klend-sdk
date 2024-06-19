import { TransactionInstruction, PublicKey, AccountMeta } from "@solana/web3.js" // eslint-disable-line @typescript-eslint/no-unused-vars
import BN from "bn.js" // eslint-disable-line @typescript-eslint/no-unused-vars
import * as borsh from "@coral-xyz/borsh" // eslint-disable-line @typescript-eslint/no-unused-vars
import * as types from "../types" // eslint-disable-line @typescript-eslint/no-unused-vars
import { PROGRAM_ID } from "../programId"

export interface InitReserveAccounts {
  lendingMarketOwner: PublicKey
  lendingMarket: PublicKey
  lendingMarketAuthority: PublicKey
  reserve: PublicKey
  reserveLiquidityMint: PublicKey
  reserveLiquiditySupply: PublicKey
  feeReceiver: PublicKey
  reserveCollateralMint: PublicKey
  reserveCollateralSupply: PublicKey
  rent: PublicKey
  liquidityTokenProgram: PublicKey
  collateralTokenProgram: PublicKey
  systemProgram: PublicKey
}

export function initReserve(
  accounts: InitReserveAccounts,
  programId: PublicKey = PROGRAM_ID
) {
  const keys: Array<AccountMeta> = [
    { pubkey: accounts.lendingMarketOwner, isSigner: true, isWritable: true },
    { pubkey: accounts.lendingMarket, isSigner: false, isWritable: false },
    {
      pubkey: accounts.lendingMarketAuthority,
      isSigner: false,
      isWritable: false,
    },
    { pubkey: accounts.reserve, isSigner: false, isWritable: true },
    {
      pubkey: accounts.reserveLiquidityMint,
      isSigner: false,
      isWritable: false,
    },
    {
      pubkey: accounts.reserveLiquiditySupply,
      isSigner: false,
      isWritable: true,
    },
    { pubkey: accounts.feeReceiver, isSigner: false, isWritable: true },
    {
      pubkey: accounts.reserveCollateralMint,
      isSigner: false,
      isWritable: true,
    },
    {
      pubkey: accounts.reserveCollateralSupply,
      isSigner: false,
      isWritable: true,
    },
    { pubkey: accounts.rent, isSigner: false, isWritable: false },
    {
      pubkey: accounts.liquidityTokenProgram,
      isSigner: false,
      isWritable: false,
    },
    {
      pubkey: accounts.collateralTokenProgram,
      isSigner: false,
      isWritable: false,
    },
    { pubkey: accounts.systemProgram, isSigner: false, isWritable: false },
  ]
  const identifier = Buffer.from([138, 245, 71, 225, 153, 4, 3, 43])
  const data = identifier
  const ix = new TransactionInstruction({ keys, programId, data })
  return ix
}
