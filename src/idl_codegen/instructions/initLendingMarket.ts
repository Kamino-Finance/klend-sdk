import { TransactionInstruction, PublicKey, AccountMeta } from "@solana/web3.js" // eslint-disable-line @typescript-eslint/no-unused-vars
import BN from "bn.js" // eslint-disable-line @typescript-eslint/no-unused-vars
import * as borsh from "@coral-xyz/borsh" // eslint-disable-line @typescript-eslint/no-unused-vars
import * as types from "../types" // eslint-disable-line @typescript-eslint/no-unused-vars
import { PROGRAM_ID } from "../programId"

export interface InitLendingMarketArgs {
  quoteCurrency: Array<number>
}

export interface InitLendingMarketAccounts {
  lendingMarketOwner: PublicKey
  lendingMarket: PublicKey
  lendingMarketAuthority: PublicKey
  systemProgram: PublicKey
  rent: PublicKey
}

export const layout = borsh.struct([
  borsh.array(borsh.u8(), 32, "quoteCurrency"),
])

export function initLendingMarket(
  args: InitLendingMarketArgs,
  accounts: InitLendingMarketAccounts,
  programId: PublicKey = PROGRAM_ID
) {
  const keys: Array<AccountMeta> = [
    { pubkey: accounts.lendingMarketOwner, isSigner: true, isWritable: true },
    { pubkey: accounts.lendingMarket, isSigner: false, isWritable: true },
    {
      pubkey: accounts.lendingMarketAuthority,
      isSigner: false,
      isWritable: false,
    },
    { pubkey: accounts.systemProgram, isSigner: false, isWritable: false },
    { pubkey: accounts.rent, isSigner: false, isWritable: false },
  ]
  const identifier = Buffer.from([34, 162, 116, 14, 101, 137, 94, 239])
  const buffer = Buffer.alloc(1000)
  const len = layout.encode(
    {
      quoteCurrency: args.quoteCurrency,
    },
    buffer
  )
  const data = Buffer.concat([identifier, buffer]).slice(0, 8 + len)
  const ix = new TransactionInstruction({ keys, programId, data })
  return ix
}
