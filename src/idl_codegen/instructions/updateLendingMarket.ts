import { TransactionInstruction, PublicKey, AccountMeta } from "@solana/web3.js" // eslint-disable-line @typescript-eslint/no-unused-vars
import BN from "bn.js" // eslint-disable-line @typescript-eslint/no-unused-vars
import * as borsh from "@coral-xyz/borsh" // eslint-disable-line @typescript-eslint/no-unused-vars
import * as types from "../types" // eslint-disable-line @typescript-eslint/no-unused-vars
import { PROGRAM_ID } from "../programId"

export interface UpdateLendingMarketArgs {
  mode: BN
  value: Array<number>
}

export interface UpdateLendingMarketAccounts {
  lendingMarketOwner: PublicKey
  lendingMarket: PublicKey
}

export const layout = borsh.struct([
  borsh.u64("mode"),
  borsh.array(borsh.u8(), 72, "value"),
])

export function updateLendingMarket(
  args: UpdateLendingMarketArgs,
  accounts: UpdateLendingMarketAccounts,
  programId: PublicKey = PROGRAM_ID
) {
  const keys: Array<AccountMeta> = [
    { pubkey: accounts.lendingMarketOwner, isSigner: true, isWritable: false },
    { pubkey: accounts.lendingMarket, isSigner: false, isWritable: true },
  ]
  const identifier = Buffer.from([209, 157, 53, 210, 97, 180, 31, 45])
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
