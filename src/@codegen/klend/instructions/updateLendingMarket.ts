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

export interface UpdateLendingMarketArgs {
  mode: BN
  value: Array<number>
}

export interface UpdateLendingMarketAccounts {
  lendingMarketOwner: TransactionSigner
  lendingMarket: Address
}

export const layout = borsh.struct([
  borsh.u64("mode"),
  borsh.array(borsh.u8(), 72, "value"),
])

export function updateLendingMarket(
  args: UpdateLendingMarketArgs,
  accounts: UpdateLendingMarketAccounts,
  programAddress: Address = PROGRAM_ID
) {
  const keys: Array<IAccountMeta | IAccountSignerMeta> = [
    {
      address: accounts.lendingMarketOwner.address,
      role: 2,
      signer: accounts.lendingMarketOwner,
    },
    { address: accounts.lendingMarket, role: 1 },
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
  const ix: IInstruction = { accounts: keys, programAddress, data }
  return ix
}
