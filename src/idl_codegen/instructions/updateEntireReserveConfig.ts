import { TransactionInstruction, PublicKey, AccountMeta } from "@solana/web3.js" // eslint-disable-line @typescript-eslint/no-unused-vars
import BN from "bn.js" // eslint-disable-line @typescript-eslint/no-unused-vars
import * as borsh from "@coral-xyz/borsh" // eslint-disable-line @typescript-eslint/no-unused-vars
import * as types from "../types" // eslint-disable-line @typescript-eslint/no-unused-vars
import { PROGRAM_ID } from "../programId"

export interface UpdateEntireReserveConfigArgs {
  mode: BN
  value: Array<number>
}

export interface UpdateEntireReserveConfigAccounts {
  lendingMarketOwner: PublicKey
  lendingMarket: PublicKey
  reserve: PublicKey
}

export const layout = borsh.struct([
  borsh.u64("mode"),
  borsh.array(borsh.u8(), 648, "value"),
])

export function updateEntireReserveConfig(
  args: UpdateEntireReserveConfigArgs,
  accounts: UpdateEntireReserveConfigAccounts,
  programId: PublicKey = PROGRAM_ID
) {
  const keys: Array<AccountMeta> = [
    { pubkey: accounts.lendingMarketOwner, isSigner: true, isWritable: false },
    { pubkey: accounts.lendingMarket, isSigner: false, isWritable: false },
    { pubkey: accounts.reserve, isSigner: false, isWritable: true },
  ]
  const identifier = Buffer.from([157, 46, 186, 160, 197, 57, 11, 253])
  const buffer = Buffer.alloc(1000)
  const len = layout.encode(
    {
      mode: args.mode,
      value: args.value,
    },
    buffer
  )
  const data = Buffer.concat([identifier, buffer]).slice(0, 8 + len)
  const ix = new TransactionInstruction({ keys, programId, data })
  return ix
}
