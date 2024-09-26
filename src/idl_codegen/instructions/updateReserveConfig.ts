import { TransactionInstruction, PublicKey, AccountMeta } from "@solana/web3.js" // eslint-disable-line @typescript-eslint/no-unused-vars
import BN from "bn.js" // eslint-disable-line @typescript-eslint/no-unused-vars
import * as borsh from "@coral-xyz/borsh" // eslint-disable-line @typescript-eslint/no-unused-vars
import * as types from "../types" // eslint-disable-line @typescript-eslint/no-unused-vars
import { PROGRAM_ID } from "../programId"

export interface UpdateReserveConfigArgs {
  mode: BN
  value: Uint8Array
  skipValidation: boolean
}

export interface UpdateReserveConfigAccounts {
  lendingMarketOwner: PublicKey
  lendingMarket: PublicKey
  reserve: PublicKey
}

export const layout = borsh.struct([
  borsh.u64("mode"),
  borsh.vecU8("value"),
  borsh.bool("skipValidation"),
])

export function updateReserveConfig(
  args: UpdateReserveConfigArgs,
  accounts: UpdateReserveConfigAccounts,
  programId: PublicKey = PROGRAM_ID
) {
  const keys: Array<AccountMeta> = [
    { pubkey: accounts.lendingMarketOwner, isSigner: true, isWritable: false },
    { pubkey: accounts.lendingMarket, isSigner: false, isWritable: false },
    { pubkey: accounts.reserve, isSigner: false, isWritable: true },
  ]
  const identifier = Buffer.from([61, 148, 100, 70, 143, 107, 17, 13])
  const buffer = Buffer.alloc(1000)
  const len = layout.encode(
    {
      mode: args.mode,
      value: Buffer.from(
        args.value.buffer,
        args.value.byteOffset,
        args.value.length
      ),
      skipValidation: args.skipValidation,
    },
    buffer
  )
  const data = Buffer.concat([identifier, buffer]).slice(0, 8 + len)
  const ix = new TransactionInstruction({ keys, programId, data })
  return ix
}
