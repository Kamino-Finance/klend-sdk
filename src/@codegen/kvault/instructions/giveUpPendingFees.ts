/* eslint-disable @typescript-eslint/no-unused-vars */
import {
  Address,
  isSome,
  IAccountMeta,
  IAccountSignerMeta,
  IInstruction,
  Option,
  TransactionSigner,
} from "@solana/kit"
/* eslint-enable @typescript-eslint/no-unused-vars */
import BN from "bn.js" // eslint-disable-line @typescript-eslint/no-unused-vars
import * as borsh from "@coral-xyz/borsh" // eslint-disable-line @typescript-eslint/no-unused-vars
import { borshAddress } from "../utils" // eslint-disable-line @typescript-eslint/no-unused-vars
import * as types from "../types" // eslint-disable-line @typescript-eslint/no-unused-vars
import { PROGRAM_ID } from "../programId"

export interface GiveUpPendingFeesArgs {
  maxAmountToGiveUp: BN
}

export interface GiveUpPendingFeesAccounts {
  vaultAdminAuthority: TransactionSigner
  vaultState: Address
  klendProgram: Address
}

export const layout = borsh.struct([borsh.u64("maxAmountToGiveUp")])

export function giveUpPendingFees(
  args: GiveUpPendingFeesArgs,
  accounts: GiveUpPendingFeesAccounts,
  programAddress: Address = PROGRAM_ID
) {
  const keys: Array<IAccountMeta | IAccountSignerMeta> = [
    {
      address: accounts.vaultAdminAuthority.address,
      role: 3,
      signer: accounts.vaultAdminAuthority,
    },
    { address: accounts.vaultState, role: 1 },
    { address: accounts.klendProgram, role: 0 },
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
  const ix: IInstruction = { accounts: keys, programAddress, data }
  return ix
}
