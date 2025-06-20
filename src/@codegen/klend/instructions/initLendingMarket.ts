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

export interface InitLendingMarketArgs {
  quoteCurrency: Array<number>
}

export interface InitLendingMarketAccounts {
  lendingMarketOwner: TransactionSigner
  lendingMarket: Address
  lendingMarketAuthority: Address
  systemProgram: Address
  rent: Address
}

export const layout = borsh.struct([
  borsh.array(borsh.u8(), 32, "quoteCurrency"),
])

export function initLendingMarket(
  args: InitLendingMarketArgs,
  accounts: InitLendingMarketAccounts,
  programAddress: Address = PROGRAM_ID
) {
  const keys: Array<IAccountMeta | IAccountSignerMeta> = [
    {
      address: accounts.lendingMarketOwner.address,
      role: 3,
      signer: accounts.lendingMarketOwner,
    },
    { address: accounts.lendingMarket, role: 1 },
    { address: accounts.lendingMarketAuthority, role: 0 },
    { address: accounts.systemProgram, role: 0 },
    { address: accounts.rent, role: 0 },
  ]
  const identifier = Buffer.from([34, 162, 116, 14, 101, 137, 94, 239])
  const buffer = Buffer.alloc(1000)
  const len = layout.encode(
    {
      quoteCurrency: args.quoteCurrency,
    },
    buffer
  )
  const data = Buffer.concat([identifier, buffer]).slice(0, 8 + len)
  const ix: IInstruction = { accounts: keys, programAddress, data }
  return ix
}
