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

export interface SplitTicketArgs {
  usolToSplit: BN
}

export interface SplitTicketAccounts {
  authority: TransactionSigner
  sourceTicket: Address
  destinationTicket: Address
  newAuthority: Address
  systemProgram: Address
}

export const layout = borsh.struct([borsh.u64("usolToSplit")])

export function splitTicket(
  args: SplitTicketArgs,
  accounts: SplitTicketAccounts,
  programAddress: Address = PROGRAM_ID
) {
  const keys: Array<IAccountMeta | IAccountSignerMeta> = [
    {
      address: accounts.authority.address,
      role: 3,
      signer: accounts.authority,
    },
    { address: accounts.sourceTicket, role: 1 },
    { address: accounts.destinationTicket, role: 1 },
    { address: accounts.newAuthority, role: 0 },
    { address: accounts.systemProgram, role: 0 },
  ]
  const identifier = Buffer.from([173, 106, 65, 21, 245, 135, 145, 79])
  const buffer = Buffer.alloc(1000)
  const len = layout.encode(
    {
      usolToSplit: args.usolToSplit,
    },
    buffer
  )
  const data = Buffer.concat([identifier, buffer]).slice(0, 8 + len)
  const ix: IInstruction = { accounts: keys, programAddress, data }
  return ix
}
