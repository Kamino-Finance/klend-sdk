import { TransactionInstruction, PublicKey, AccountMeta } from "@solana/web3.js" // eslint-disable-line @typescript-eslint/no-unused-vars
import BN from "bn.js" // eslint-disable-line @typescript-eslint/no-unused-vars
import * as borsh from "@coral-xyz/borsh" // eslint-disable-line @typescript-eslint/no-unused-vars
import * as types from "../types" // eslint-disable-line @typescript-eslint/no-unused-vars
import { PROGRAM_ID } from "../programId"

export interface RefreshReservesBatchArgs {
  skipPriceUpdates: boolean
}

export const layout = borsh.struct([borsh.bool("skipPriceUpdates")])

export function refreshReservesBatch(
  args: RefreshReservesBatchArgs,
  programId: PublicKey = PROGRAM_ID
) {
  const keys: Array<AccountMeta> = []
  const identifier = Buffer.from([144, 110, 26, 103, 162, 204, 252, 147])
  const buffer = Buffer.alloc(1000)
  const len = layout.encode(
    {
      skipPriceUpdates: args.skipPriceUpdates,
    },
    buffer
  )
  const data = Buffer.concat([identifier, buffer]).slice(0, 8 + len)
  const ix = new TransactionInstruction({ keys, programId, data })
  return ix
}
