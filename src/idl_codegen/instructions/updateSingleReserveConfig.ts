import { TransactionInstruction, PublicKey, AccountMeta } from "@solana/web3.js" // eslint-disable-line @typescript-eslint/no-unused-vars
import BN from "bn.js" // eslint-disable-line @typescript-eslint/no-unused-vars
import * as borsh from "@coral-xyz/borsh" // eslint-disable-line @typescript-eslint/no-unused-vars
import * as types from "../types" // eslint-disable-line @typescript-eslint/no-unused-vars
import { PROGRAM_ID } from "../programId"

export interface UpdateSingleReserveConfigArgs {
  mode: BN
  value: Array<number>
  skipValidation: boolean
}

export interface UpdateSingleReserveConfigAccounts {
  lendingMarketOwner: PublicKey
  lendingMarket: PublicKey
  reserve: PublicKey
}

export const layout = borsh.struct([
  borsh.u64("mode"),
  borsh.array(borsh.u8(), 32, "value"),
  borsh.bool("skipValidation"),
])

export function updateSingleReserveConfig(
  args: UpdateSingleReserveConfigArgs,
  accounts: UpdateSingleReserveConfigAccounts,
  programId: PublicKey = PROGRAM_ID
) {
  const keys: Array<AccountMeta> = [
    { pubkey: accounts.lendingMarketOwner, isSigner: true, isWritable: false },
    { pubkey: accounts.lendingMarket, isSigner: false, isWritable: false },
    { pubkey: accounts.reserve, isSigner: false, isWritable: true },
  ]
  const identifier = Buffer.from([248, 195, 192, 90, 204, 42, 162, 233])
  const buffer = Buffer.alloc(1000)
  const len = layout.encode(
    {
      mode: args.mode,
      value: args.value,
      skipValidation: args.skipValidation,
    },
    buffer
  )
  const data = Buffer.concat([identifier, buffer]).slice(0, 8 + len)
  const ix = new TransactionInstruction({ keys, programId, data })
  return ix
}
