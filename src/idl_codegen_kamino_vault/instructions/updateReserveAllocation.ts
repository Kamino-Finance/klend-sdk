import { TransactionInstruction, PublicKey, AccountMeta } from "@solana/web3.js" // eslint-disable-line @typescript-eslint/no-unused-vars
import BN from "bn.js" // eslint-disable-line @typescript-eslint/no-unused-vars
import * as borsh from "@coral-xyz/borsh" // eslint-disable-line @typescript-eslint/no-unused-vars
import * as types from "../types" // eslint-disable-line @typescript-eslint/no-unused-vars
import { PROGRAM_ID } from "../programId"

export interface UpdateReserveAllocationArgs {
  weight: BN
  cap: BN
}

export interface UpdateReserveAllocationAccounts {
  adminAuthority: PublicKey
  vaultState: PublicKey
  baseVaultAuthority: PublicKey
  reserveCollateralMint: PublicKey
  reserve: PublicKey
  ctokenVault: PublicKey
  reserveCollateralTokenProgram: PublicKey
  systemProgram: PublicKey
  rent: PublicKey
}

export const layout = borsh.struct([borsh.u64("weight"), borsh.u64("cap")])

export function updateReserveAllocation(
  args: UpdateReserveAllocationArgs,
  accounts: UpdateReserveAllocationAccounts,
  programId: PublicKey = PROGRAM_ID
) {
  const keys: Array<AccountMeta> = [
    { pubkey: accounts.adminAuthority, isSigner: true, isWritable: true },
    { pubkey: accounts.vaultState, isSigner: false, isWritable: true },
    { pubkey: accounts.baseVaultAuthority, isSigner: false, isWritable: false },
    {
      pubkey: accounts.reserveCollateralMint,
      isSigner: false,
      isWritable: true,
    },
    { pubkey: accounts.reserve, isSigner: false, isWritable: false },
    { pubkey: accounts.ctokenVault, isSigner: false, isWritable: true },
    {
      pubkey: accounts.reserveCollateralTokenProgram,
      isSigner: false,
      isWritable: false,
    },
    { pubkey: accounts.systemProgram, isSigner: false, isWritable: false },
    { pubkey: accounts.rent, isSigner: false, isWritable: false },
  ]
  const identifier = Buffer.from([5, 54, 213, 112, 75, 232, 117, 37])
  const buffer = Buffer.alloc(1000)
  const len = layout.encode(
    {
      weight: args.weight,
      cap: args.cap,
    },
    buffer
  )
  const data = Buffer.concat([identifier, buffer]).slice(0, 8 + len)
  const ix = new TransactionInstruction({ keys, programId, data })
  return ix
}
