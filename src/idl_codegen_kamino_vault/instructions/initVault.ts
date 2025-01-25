import { TransactionInstruction, PublicKey, AccountMeta } from "@solana/web3.js" // eslint-disable-line @typescript-eslint/no-unused-vars
import BN from "bn.js" // eslint-disable-line @typescript-eslint/no-unused-vars
import * as borsh from "@coral-xyz/borsh" // eslint-disable-line @typescript-eslint/no-unused-vars
import * as types from "../types" // eslint-disable-line @typescript-eslint/no-unused-vars
import { PROGRAM_ID } from "../programId"

export interface InitVaultAccounts {
  adminAuthority: PublicKey
  vaultState: PublicKey
  baseVaultAuthority: PublicKey
  tokenVault: PublicKey
  baseTokenMint: PublicKey
  sharesMint: PublicKey
  systemProgram: PublicKey
  rent: PublicKey
  tokenProgram: PublicKey
  sharesTokenProgram: PublicKey
}

export function initVault(
  accounts: InitVaultAccounts,
  programId: PublicKey = PROGRAM_ID
) {
  const keys: Array<AccountMeta> = [
    { pubkey: accounts.adminAuthority, isSigner: true, isWritable: true },
    { pubkey: accounts.vaultState, isSigner: false, isWritable: true },
    { pubkey: accounts.baseVaultAuthority, isSigner: false, isWritable: false },
    { pubkey: accounts.tokenVault, isSigner: false, isWritable: true },
    { pubkey: accounts.baseTokenMint, isSigner: false, isWritable: false },
    { pubkey: accounts.sharesMint, isSigner: false, isWritable: true },
    { pubkey: accounts.systemProgram, isSigner: false, isWritable: false },
    { pubkey: accounts.rent, isSigner: false, isWritable: false },
    { pubkey: accounts.tokenProgram, isSigner: false, isWritable: false },
    { pubkey: accounts.sharesTokenProgram, isSigner: false, isWritable: false },
  ]
  const identifier = Buffer.from([77, 79, 85, 150, 33, 217, 52, 106])
  const data = identifier
  const ix = new TransactionInstruction({ keys, programId, data })
  return ix
}
