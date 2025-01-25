import { TransactionInstruction, PublicKey, AccountMeta } from "@solana/web3.js" // eslint-disable-line @typescript-eslint/no-unused-vars
import BN from "bn.js" // eslint-disable-line @typescript-eslint/no-unused-vars
import * as borsh from "@coral-xyz/borsh" // eslint-disable-line @typescript-eslint/no-unused-vars
import * as types from "../types" // eslint-disable-line @typescript-eslint/no-unused-vars
import { PROGRAM_ID } from "../programId"

export interface GiveUpPendingFeesArgs {
  maxAmountToGiveUp: BN
}

export interface GiveUpPendingFeesAccounts {
  adminAuthority: PublicKey
  vaultState: PublicKey
  klendProgram: PublicKey
}

export const layout = borsh.struct([borsh.u64("maxAmountToGiveUp")])

export function giveUpPendingFees(
  args: GiveUpPendingFeesArgs,
  accounts: GiveUpPendingFeesAccounts,
  programId: PublicKey = PROGRAM_ID
) {
  const keys: Array<AccountMeta> = [
    { pubkey: accounts.adminAuthority, isSigner: true, isWritable: true },
    { pubkey: accounts.vaultState, isSigner: false, isWritable: true },
    { pubkey: accounts.klendProgram, isSigner: false, isWritable: false },
  ]
  const identifier = Buffer.from([177, 200, 120, 134, 110, 217, 147, 81])
  const buffer = Buffer.alloc(1000)
  const len = layout.encode(
    {
      maxAmountToGiveUp: args.maxAmountToGiveUp,
    },
    buffer
  )
  const data = Buffer.concat([identifier, buffer]).slice(0, 8 + len)
  const ix = new TransactionInstruction({ keys, programId, data })
  return ix
}
