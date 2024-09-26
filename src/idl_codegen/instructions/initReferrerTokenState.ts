import { TransactionInstruction, PublicKey, AccountMeta } from "@solana/web3.js" // eslint-disable-line @typescript-eslint/no-unused-vars
import BN from "bn.js" // eslint-disable-line @typescript-eslint/no-unused-vars
import * as borsh from "@coral-xyz/borsh" // eslint-disable-line @typescript-eslint/no-unused-vars
import * as types from "../types" // eslint-disable-line @typescript-eslint/no-unused-vars
import { PROGRAM_ID } from "../programId"

export interface InitReferrerTokenStateArgs {
  referrer: PublicKey
}

export interface InitReferrerTokenStateAccounts {
  payer: PublicKey
  lendingMarket: PublicKey
  reserve: PublicKey
  referrerTokenState: PublicKey
  rent: PublicKey
  systemProgram: PublicKey
}

export const layout = borsh.struct([borsh.publicKey("referrer")])

export function initReferrerTokenState(
  args: InitReferrerTokenStateArgs,
  accounts: InitReferrerTokenStateAccounts,
  programId: PublicKey = PROGRAM_ID
) {
  const keys: Array<AccountMeta> = [
    { pubkey: accounts.payer, isSigner: true, isWritable: true },
    { pubkey: accounts.lendingMarket, isSigner: false, isWritable: false },
    { pubkey: accounts.reserve, isSigner: false, isWritable: false },
    { pubkey: accounts.referrerTokenState, isSigner: false, isWritable: true },
    { pubkey: accounts.rent, isSigner: false, isWritable: false },
    { pubkey: accounts.systemProgram, isSigner: false, isWritable: false },
  ]
  const identifier = Buffer.from([116, 45, 66, 148, 58, 13, 218, 115])
  const buffer = Buffer.alloc(1000)
  const len = layout.encode(
    {
      referrer: args.referrer,
    },
    buffer
  )
  const data = Buffer.concat([identifier, buffer]).slice(0, 8 + len)
  const ix = new TransactionInstruction({ keys, programId, data })
  return ix
}
