import { TransactionInstruction, PublicKey, AccountMeta } from "@solana/web3.js" // eslint-disable-line @typescript-eslint/no-unused-vars
import BN from "bn.js" // eslint-disable-line @typescript-eslint/no-unused-vars
import * as borsh from "@coral-xyz/borsh" // eslint-disable-line @typescript-eslint/no-unused-vars
import * as types from "../types" // eslint-disable-line @typescript-eslint/no-unused-vars
import { PROGRAM_ID } from "../programId"

export interface InitUserMetadataArgs {
  userLookupTable: PublicKey
}

export interface InitUserMetadataAccounts {
  owner: PublicKey
  feePayer: PublicKey
  userMetadata: PublicKey
  referrerUserMetadata: PublicKey
  rent: PublicKey
  systemProgram: PublicKey
}

export const layout = borsh.struct([borsh.publicKey("userLookupTable")])

export function initUserMetadata(
  args: InitUserMetadataArgs,
  accounts: InitUserMetadataAccounts,
  programId: PublicKey = PROGRAM_ID
) {
  const keys: Array<AccountMeta> = [
    { pubkey: accounts.owner, isSigner: true, isWritable: false },
    { pubkey: accounts.feePayer, isSigner: true, isWritable: true },
    { pubkey: accounts.userMetadata, isSigner: false, isWritable: true },
    {
      pubkey: accounts.referrerUserMetadata,
      isSigner: false,
      isWritable: false,
    },
    { pubkey: accounts.rent, isSigner: false, isWritable: false },
    { pubkey: accounts.systemProgram, isSigner: false, isWritable: false },
  ]
  const identifier = Buffer.from([117, 169, 176, 69, 197, 23, 15, 162])
  const buffer = Buffer.alloc(1000)
  const len = layout.encode(
    {
      userLookupTable: args.userLookupTable,
    },
    buffer
  )
  const data = Buffer.concat([identifier, buffer]).slice(0, 8 + len)
  const ix = new TransactionInstruction({ keys, programId, data })
  return ix
}
