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

export interface SetObligationOrderArgs {
  index: number
  order: types.ObligationOrderFields
}

export interface SetObligationOrderAccounts {
  owner: TransactionSigner
  obligation: Address
  lendingMarket: Address
}

export const layout = borsh.struct([
  borsh.u8("index"),
  types.ObligationOrder.layout("order"),
])

export function setObligationOrder(
  args: SetObligationOrderArgs,
  accounts: SetObligationOrderAccounts,
  programAddress: Address = PROGRAM_ID
) {
  const keys: Array<IAccountMeta | IAccountSignerMeta> = [
    { address: accounts.owner.address, role: 2, signer: accounts.owner },
    { address: accounts.obligation, role: 1 },
    { address: accounts.lendingMarket, role: 0 },
  ]
  const identifier = Buffer.from([81, 1, 99, 156, 211, 83, 78, 46])
  const buffer = Buffer.alloc(1000)
  const len = layout.encode(
    {
      index: args.index,
      order: types.ObligationOrder.toEncodable(args.order),
    },
    buffer
  )
  const data = Buffer.concat([identifier, buffer]).slice(0, 8 + len)
  const ix: IInstruction = { accounts: keys, programAddress, data }
  return ix
}
