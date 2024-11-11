import { TransactionInstruction, PublicKey, AccountMeta } from "@solana/web3.js" // eslint-disable-line @typescript-eslint/no-unused-vars
import BN from "bn.js" // eslint-disable-line @typescript-eslint/no-unused-vars
import * as borsh from "@coral-xyz/borsh" // eslint-disable-line @typescript-eslint/no-unused-vars
import * as types from "../types" // eslint-disable-line @typescript-eslint/no-unused-vars
import { PROGRAM_ID } from "../programId"

export interface InitializeSharesMetadataArgs {
  name: string
  symbol: string
  uri: string
}

export interface InitializeSharesMetadataAccounts {
  adminAuthority: PublicKey
  vaultState: PublicKey
  sharesMint: PublicKey
  baseVaultAuthority: PublicKey
  sharesMetadata: PublicKey
  systemProgram: PublicKey
  rent: PublicKey
  metadataProgram: PublicKey
}

export const layout = borsh.struct([
  borsh.str("name"),
  borsh.str("symbol"),
  borsh.str("uri"),
])

export function initializeSharesMetadata(
  args: InitializeSharesMetadataArgs,
  accounts: InitializeSharesMetadataAccounts,
  programId: PublicKey = PROGRAM_ID
) {
  const keys: Array<AccountMeta> = [
    { pubkey: accounts.adminAuthority, isSigner: true, isWritable: true },
    { pubkey: accounts.vaultState, isSigner: false, isWritable: false },
    { pubkey: accounts.sharesMint, isSigner: false, isWritable: false },
    { pubkey: accounts.baseVaultAuthority, isSigner: false, isWritable: false },
    { pubkey: accounts.sharesMetadata, isSigner: false, isWritable: true },
    { pubkey: accounts.systemProgram, isSigner: false, isWritable: false },
    { pubkey: accounts.rent, isSigner: false, isWritable: false },
    { pubkey: accounts.metadataProgram, isSigner: false, isWritable: false },
  ]
  const identifier = Buffer.from([3, 15, 172, 114, 200, 0, 131, 32])
  const buffer = Buffer.alloc(1000)
  const len = layout.encode(
    {
      name: args.name,
      symbol: args.symbol,
      uri: args.uri,
    },
    buffer
  )
  const data = Buffer.concat([identifier, buffer]).slice(0, 8 + len)
  const ix = new TransactionInstruction({ keys, programId, data })
  return ix
}
