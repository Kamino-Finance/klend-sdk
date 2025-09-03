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

export const DISCRIMINATOR = Buffer.from([
  155, 34, 122, 165, 245, 137, 147, 107,
])

export interface UpdateSharesMetadataArgs {
  name: string
  symbol: string
  uri: string
}

export interface UpdateSharesMetadataAccounts {
  vaultAdminAuthority: TransactionSigner
  vaultState: Address
  baseVaultAuthority: Address
  sharesMetadata: Address
  metadataProgram: Address
}

export const layout = borsh.struct<UpdateSharesMetadataArgs>([
  borsh.str("name"),
  borsh.str("symbol"),
  borsh.str("uri"),
])

export function updateSharesMetadata(
  args: UpdateSharesMetadataArgs,
  accounts: UpdateSharesMetadataAccounts,
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
    { address: accounts.baseVaultAuthority, role: 0 },
    { address: accounts.sharesMetadata, role: 1 },
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
