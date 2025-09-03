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

export const DISCRIMINATOR = Buffer.from([117, 169, 176, 69, 197, 23, 15, 162])

export interface InitUserMetadataArgs {
  userLookupTable: Address
}

export interface InitUserMetadataAccounts {
  owner: TransactionSigner
  feePayer: TransactionSigner
  userMetadata: Address
  referrerUserMetadata: Option<Address>
  rent: Address
  systemProgram: Address
}

export const layout = borsh.struct<InitUserMetadataArgs>([
  borshAddress("userLookupTable"),
])

export function initUserMetadata(
  args: InitUserMetadataArgs,
  accounts: InitUserMetadataAccounts,
  remainingAccounts: Array<AccountMeta | AccountSignerMeta> = [],
  programAddress: Address = PROGRAM_ID
) {
  const keys: Array<AccountMeta | AccountSignerMeta> = [
    { address: accounts.owner.address, role: 2, signer: accounts.owner },
    { address: accounts.feePayer.address, role: 3, signer: accounts.feePayer },
    { address: accounts.userMetadata, role: 1 },
    isSome(accounts.referrerUserMetadata)
      ? { address: accounts.referrerUserMetadata.value, role: 0 }
      : { address: programAddress, role: 0 },
    { address: accounts.rent, role: 0 },
    { address: accounts.systemProgram, role: 0 },
    ...remainingAccounts,
  ]
  const buffer = Buffer.alloc(1000)
  const len = layout.encode(
    {
      userLookupTable: args.userLookupTable,
    },
    buffer
  )
  const data = Buffer.concat([DISCRIMINATOR, buffer]).slice(0, 8 + len)
  const ix: Instruction = { accounts: keys, programAddress, data }
  return ix
}
