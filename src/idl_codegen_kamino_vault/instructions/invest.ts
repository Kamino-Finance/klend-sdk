import { TransactionInstruction, PublicKey, AccountMeta } from "@solana/web3.js" // eslint-disable-line @typescript-eslint/no-unused-vars
import BN from "bn.js" // eslint-disable-line @typescript-eslint/no-unused-vars
import * as borsh from "@coral-xyz/borsh" // eslint-disable-line @typescript-eslint/no-unused-vars
import * as types from "../types" // eslint-disable-line @typescript-eslint/no-unused-vars
import { PROGRAM_ID } from "../programId"

export interface InvestAccounts {
  payer: PublicKey
  payerTokenAccount: PublicKey
  vaultState: PublicKey
  tokenVault: PublicKey
  tokenMint: PublicKey
  baseVaultAuthority: PublicKey
  ctokenVault: PublicKey
  /** CPI accounts */
  reserve: PublicKey
  lendingMarket: PublicKey
  lendingMarketAuthority: PublicKey
  reserveLiquiditySupply: PublicKey
  reserveCollateralMint: PublicKey
  klendProgram: PublicKey
  reserveCollateralTokenProgram: PublicKey
  tokenProgram: PublicKey
  instructionSysvarAccount: PublicKey
}

export function invest(
  accounts: InvestAccounts,
  programId: PublicKey = PROGRAM_ID
) {
  const keys: Array<AccountMeta> = [
    { pubkey: accounts.payer, isSigner: true, isWritable: true },
    { pubkey: accounts.payerTokenAccount, isSigner: false, isWritable: true },
    { pubkey: accounts.vaultState, isSigner: false, isWritable: true },
    { pubkey: accounts.tokenVault, isSigner: false, isWritable: true },
    { pubkey: accounts.tokenMint, isSigner: false, isWritable: true },
    { pubkey: accounts.baseVaultAuthority, isSigner: false, isWritable: true },
    { pubkey: accounts.ctokenVault, isSigner: false, isWritable: true },
    { pubkey: accounts.reserve, isSigner: false, isWritable: true },
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
    {
      pubkey: accounts.reserveCollateralTokenProgram,
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
  const identifier = Buffer.from([13, 245, 180, 103, 254, 182, 121, 4])
  const data = identifier
  const ix = new TransactionInstruction({ keys, programId, data })
  return ix
}
