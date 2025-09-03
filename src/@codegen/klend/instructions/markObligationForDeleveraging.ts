/* eslint-disable @typescript-eslint/no-unused-vars */
import {
  Address,
  isSome,
  AccountMeta,
  AccountSignerMeta,
  Instruction,
  Option,
  TransactionSigner,
} from "@solana/kit"
/* eslint-enable @typescript-eslint/no-unused-vars */
import BN from "bn.js" // eslint-disable-line @typescript-eslint/no-unused-vars
import * as borsh from "@coral-xyz/borsh" // eslint-disable-line @typescript-eslint/no-unused-vars
import { borshAddress } from "../utils" // eslint-disable-line @typescript-eslint/no-unused-vars
import * as types from "../types" // eslint-disable-line @typescript-eslint/no-unused-vars
import { PROGRAM_ID } from "../programId"

export const DISCRIMINATOR = Buffer.from([164, 35, 182, 19, 0, 116, 243, 127])

export interface MarkObligationForDeleveragingArgs {
  autodeleverageTargetLtvPct: number
}

export interface MarkObligationForDeleveragingAccounts {
  riskCouncil: TransactionSigner
  obligation: Address
  lendingMarket: Address
}

export const layout = borsh.struct<MarkObligationForDeleveragingArgs>([
  borsh.u8("autodeleverageTargetLtvPct"),
])

export function markObligationForDeleveraging(
  args: MarkObligationForDeleveragingArgs,
  accounts: MarkObligationForDeleveragingAccounts,
  remainingAccounts: Array<AccountMeta | AccountSignerMeta> = [],
  programAddress: Address = PROGRAM_ID
) {
  const keys: Array<AccountMeta | AccountSignerMeta> = [
    {
      address: accounts.riskCouncil.address,
      role: 2,
      signer: accounts.riskCouncil,
    },
    { address: accounts.obligation, role: 1 },
    { address: accounts.lendingMarket, role: 0 },
    ...remainingAccounts,
  ]
  const buffer = Buffer.alloc(1000)
  const len = layout.encode(
    {
      autodeleverageTargetLtvPct: args.autodeleverageTargetLtvPct,
    },
    buffer
  )
  const data = Buffer.concat([DISCRIMINATOR, buffer]).slice(0, 8 + len)
  const ix: Instruction = { accounts: keys, programAddress, data }
  return ix
}
