import { TransactionInstruction, PublicKey, AccountMeta } from "@solana/web3.js" // eslint-disable-line @typescript-eslint/no-unused-vars
import BN from "bn.js" // eslint-disable-line @typescript-eslint/no-unused-vars
import * as borsh from "@coral-xyz/borsh" // eslint-disable-line @typescript-eslint/no-unused-vars
import * as types from "../types" // eslint-disable-line @typescript-eslint/no-unused-vars
import { PROGRAM_ID } from "../programId"

export interface RequestElevationGroupArgs {
  elevationGroup: number
}

export interface RequestElevationGroupAccounts {
  owner: PublicKey
  obligation: PublicKey
  lendingMarket: PublicKey
}

export const layout = borsh.struct([borsh.u8("elevationGroup")])

export function requestElevationGroup(
  args: RequestElevationGroupArgs,
  accounts: RequestElevationGroupAccounts,
  programId: PublicKey = PROGRAM_ID
) {
  const keys: Array<AccountMeta> = [
    { pubkey: accounts.owner, isSigner: true, isWritable: false },
    { pubkey: accounts.obligation, isSigner: false, isWritable: true },
    { pubkey: accounts.lendingMarket, isSigner: false, isWritable: false },
  ]
  const identifier = Buffer.from([36, 119, 251, 129, 34, 240, 7, 147])
  const buffer = Buffer.alloc(1000)
  const len = layout.encode(
    {
      elevationGroup: args.elevationGroup,
    },
    buffer
  )
  const data = Buffer.concat([identifier, buffer]).slice(0, 8 + len)
  const ix = new TransactionInstruction({ keys, programId, data })
  return ix
}
