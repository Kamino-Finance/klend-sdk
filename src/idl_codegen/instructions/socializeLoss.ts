import { TransactionInstruction, PublicKey, AccountMeta } from "@solana/web3.js" // eslint-disable-line @typescript-eslint/no-unused-vars
import BN from "bn.js" // eslint-disable-line @typescript-eslint/no-unused-vars
import * as borsh from "@coral-xyz/borsh" // eslint-disable-line @typescript-eslint/no-unused-vars
import * as types from "../types" // eslint-disable-line @typescript-eslint/no-unused-vars
import { PROGRAM_ID } from "../programId"

export interface SocializeLossArgs {
  liquidityAmount: BN
}

export interface SocializeLossAccounts {
  riskCouncil: PublicKey
  obligation: PublicKey
  lendingMarket: PublicKey
  reserve: PublicKey
  instructionSysvarAccount: PublicKey
}

export const layout = borsh.struct([borsh.u64("liquidityAmount")])

export function socializeLoss(
  args: SocializeLossArgs,
  accounts: SocializeLossAccounts,
  programId: PublicKey = PROGRAM_ID
) {
  const keys: Array<AccountMeta> = [
    { pubkey: accounts.riskCouncil, isSigner: true, isWritable: false },
    { pubkey: accounts.obligation, isSigner: false, isWritable: true },
    { pubkey: accounts.lendingMarket, isSigner: false, isWritable: false },
    { pubkey: accounts.reserve, isSigner: false, isWritable: true },
    {
      pubkey: accounts.instructionSysvarAccount,
      isSigner: false,
      isWritable: false,
    },
  ]
  const identifier = Buffer.from([245, 75, 91, 0, 236, 97, 19, 3])
  const buffer = Buffer.alloc(1000)
  const len = layout.encode(
    {
      liquidityAmount: args.liquidityAmount,
    },
    buffer
  )
  const data = Buffer.concat([identifier, buffer]).slice(0, 8 + len)
  const ix = new TransactionInstruction({ keys, programId, data })
  return ix
}
