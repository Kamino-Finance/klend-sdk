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

export interface RequestElevationGroupArgs {
  elevationGroup: number
}

export interface RequestElevationGroupAccounts {
  owner: TransactionSigner
  obligation: Address
  lendingMarket: Address
}

export const layout = borsh.struct([borsh.u8("elevationGroup")])

export function requestElevationGroup(
  args: RequestElevationGroupArgs,
  accounts: RequestElevationGroupAccounts,
  programAddress: Address = PROGRAM_ID
) {
  const keys: Array<IAccountMeta | IAccountSignerMeta> = [
    { address: accounts.owner.address, role: 2, signer: accounts.owner },
    { address: accounts.obligation, role: 1 },
    { address: accounts.lendingMarket, role: 0 },
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
  const ix: IInstruction = { accounts: keys, programAddress, data }
  return ix
}
