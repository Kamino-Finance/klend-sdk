/* eslint-disable @typescript-eslint/no-unused-vars */
import {
  Address,
  isSome,
  AccountMeta,
  AccountSignerMeta,
  Instruction,
  Option,
  TransactionSigner,
} from "@solana/kit"
/* eslint-enable @typescript-eslint/no-unused-vars */
import BN from "bn.js" // eslint-disable-line @typescript-eslint/no-unused-vars
import * as borsh from "@coral-xyz/borsh" // eslint-disable-line @typescript-eslint/no-unused-vars
import { borshAddress } from "../utils" // eslint-disable-line @typescript-eslint/no-unused-vars
import * as types from "../types" // eslint-disable-line @typescript-eslint/no-unused-vars
import { PROGRAM_ID } from "../programId"

export const DISCRIMINATOR = Buffer.from([77, 79, 85, 150, 33, 217, 52, 106])

export interface InitVaultAccounts {
  adminAuthority: TransactionSigner
  vaultState: Address
  baseVaultAuthority: Address
  tokenVault: Address
  baseTokenMint: Address
  sharesMint: Address
  adminTokenAccount: Address
  systemProgram: Address
  rent: Address
  tokenProgram: Address
  sharesTokenProgram: Address
}

export function initVault(
  accounts: InitVaultAccounts,
  remainingAccounts: Array<AccountMeta | AccountSignerMeta> = [],
  programAddress: Address = PROGRAM_ID
) {
  const keys: Array<AccountMeta | AccountSignerMeta> = [
    {
      address: accounts.adminAuthority.address,
      role: 3,
      signer: accounts.adminAuthority,
    },
    { address: accounts.vaultState, role: 1 },
    { address: accounts.baseVaultAuthority, role: 0 },
    { address: accounts.tokenVault, role: 1 },
    { address: accounts.baseTokenMint, role: 0 },
    { address: accounts.sharesMint, role: 1 },
    { address: accounts.adminTokenAccount, role: 1 },
    { address: accounts.systemProgram, role: 0 },
    { address: accounts.rent, role: 0 },
    { address: accounts.tokenProgram, role: 0 },
    { address: accounts.sharesTokenProgram, role: 0 },
    ...remainingAccounts,
  ]
  const data = DISCRIMINATOR
  const ix: Instruction = { accounts: keys, programAddress, data }
  return ix
}
