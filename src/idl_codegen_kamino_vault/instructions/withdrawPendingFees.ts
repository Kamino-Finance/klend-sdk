import { TransactionInstruction, PublicKey, AccountMeta } from "@solana/web3.js" // eslint-disable-line @typescript-eslint/no-unused-vars
import BN from "bn.js" // eslint-disable-line @typescript-eslint/no-unused-vars
import * as borsh from "@coral-xyz/borsh" // eslint-disable-line @typescript-eslint/no-unused-vars
import * as types from "../types" // eslint-disable-line @typescript-eslint/no-unused-vars
import { PROGRAM_ID } from "../programId"

export interface WithdrawPendingFeesAccounts {
  adminAuthority: PublicKey
  vaultState: PublicKey
  reserve: PublicKey
  tokenVault: PublicKey
  ctokenVault: PublicKey
  baseVaultAuthority: PublicKey
  tokenAta: PublicKey
  tokenMint: PublicKey
  /** CPI accounts */
  lendingMarket: PublicKey
  lendingMarketAuthority: PublicKey
  reserveLiquiditySupply: PublicKey
  reserveCollateralMint: PublicKey
  klendProgram: PublicKey
  tokenProgram: PublicKey
  reserveCollateralTokenProgram: PublicKey
  instructionSysvarAccount: PublicKey
}

export function withdrawPendingFees(
  accounts: WithdrawPendingFeesAccounts,
  programId: PublicKey = PROGRAM_ID
) {
  const keys: Array<AccountMeta> = [
    { pubkey: accounts.adminAuthority, isSigner: true, isWritable: true },
    { pubkey: accounts.vaultState, isSigner: false, isWritable: true },
    { pubkey: accounts.reserve, isSigner: false, isWritable: true },
    { pubkey: accounts.tokenVault, isSigner: false, isWritable: true },
    { pubkey: accounts.ctokenVault, isSigner: false, isWritable: true },
    { pubkey: accounts.baseVaultAuthority, isSigner: false, isWritable: true },
    { pubkey: accounts.tokenAta, isSigner: false, isWritable: true },
    { pubkey: accounts.tokenMint, isSigner: false, isWritable: true },
    { pubkey: accounts.lendingMarket, isSigner: false, isWritable: false },
    {
      pubkey: accounts.lendingMarketAuthority,
      isSigner: false,
      isWritable: false,
    },
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
    { pubkey: accounts.klendProgram, isSigner: false, isWritable: false },
    { pubkey: accounts.tokenProgram, isSigner: false, isWritable: false },
    {
      pubkey: accounts.reserveCollateralTokenProgram,
      isSigner: false,
      isWritable: false,
    },
    {
      pubkey: accounts.instructionSysvarAccount,
      isSigner: false,
      isWritable: false,
    },
  ]
  const identifier = Buffer.from([131, 194, 200, 140, 175, 244, 217, 183])
  const data = identifier
  const ix = new TransactionInstruction({ keys, programId, data })
  return ix
}
