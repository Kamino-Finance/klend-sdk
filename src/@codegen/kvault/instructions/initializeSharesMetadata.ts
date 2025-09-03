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

export const DISCRIMINATOR = Buffer.from([3, 15, 172, 114, 200, 0, 131, 32])

export interface InitializeSharesMetadataArgs {
  name: string
  symbol: string
  uri: string
}

export interface InitializeSharesMetadataAccounts {
  vaultAdminAuthority: TransactionSigner
  vaultState: Address
  sharesMint: Address
  baseVaultAuthority: Address
  sharesMetadata: Address
  systemProgram: Address
  rent: Address
  metadataProgram: Address
}

export const layout = borsh.struct<InitializeSharesMetadataArgs>([
  borsh.str("name"),
  borsh.str("symbol"),
  borsh.str("uri"),
])

export function initializeSharesMetadata(
  args: InitializeSharesMetadataArgs,
  accounts: InitializeSharesMetadataAccounts,
  remainingAccounts: Array<AccountMeta | AccountSignerMeta> = [],
  programAddress: Address = PROGRAM_ID
) {
  const keys: Array<AccountMeta | AccountSignerMeta> = [
    {
      address: accounts.vaultAdminAuthority.address,
      role: 3,
      signer: accounts.vaultAdminAuthority,
    },
    { address: accounts.vaultState, role: 0 },
    { address: accounts.sharesMint, role: 0 },
    { address: accounts.baseVaultAuthority, role: 0 },
    { address: accounts.sharesMetadata, role: 1 },
    { address: accounts.systemProgram, role: 0 },
    { address: accounts.rent, role: 0 },
    { address: accounts.metadataProgram, role: 0 },
    ...remainingAccounts,
  ]
  const buffer = Buffer.alloc(1000)
  const len = layout.encode(
    {
      name: args.name,
      symbol: args.symbol,
      uri: args.uri,
    },
    buffer
  )
  const data = Buffer.concat([DISCRIMINATOR, buffer]).slice(0, 8 + len)
  const ix: Instruction = { accounts: keys, programAddress, data }
  return ix
}
