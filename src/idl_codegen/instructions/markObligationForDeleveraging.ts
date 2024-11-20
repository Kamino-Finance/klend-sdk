import { TransactionInstruction, PublicKey, AccountMeta } from "@solana/web3.js" // eslint-disable-line @typescript-eslint/no-unused-vars
import BN from "bn.js" // eslint-disable-line @typescript-eslint/no-unused-vars
import * as borsh from "@coral-xyz/borsh" // eslint-disable-line @typescript-eslint/no-unused-vars
import * as types from "../types" // eslint-disable-line @typescript-eslint/no-unused-vars
import { PROGRAM_ID } from "../programId"

export interface MarkObligationForDeleveragingArgs {
  autodeleverageTargetLtvPct: number
}

export interface MarkObligationForDeleveragingAccounts {
  riskCouncil: PublicKey
  obligation: PublicKey
  lendingMarket: PublicKey
}

export const layout = borsh.struct([borsh.u8("autodeleverageTargetLtvPct")])

export function markObligationForDeleveraging(
  args: MarkObligationForDeleveragingArgs,
  accounts: MarkObligationForDeleveragingAccounts,
  programId: PublicKey = PROGRAM_ID
) {
  const keys: Array<AccountMeta> = [
    { pubkey: accounts.riskCouncil, isSigner: true, isWritable: false },
    { pubkey: accounts.obligation, isSigner: false, isWritable: true },
    { pubkey: accounts.lendingMarket, isSigner: false, isWritable: false },
  ]
  const identifier = Buffer.from([164, 35, 182, 19, 0, 116, 243, 127])
  const buffer = Buffer.alloc(1000)
  const len = layout.encode(
    {
      autodeleverageTargetLtvPct: args.autodeleverageTargetLtvPct,
    },
    buffer
  )
  const data = Buffer.concat([identifier, buffer]).slice(0, 8 + len)
  const ix = new TransactionInstruction({ keys, programId, data })
  return ix
}
