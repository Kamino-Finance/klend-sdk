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

export interface LeaseWithdrawArgs {
  params: types.LeaseWithdrawParamsFields
}

export interface LeaseWithdrawAccounts {
  lease: Address
  escrow: Address
  aggregator: Address
  queue: Address
  withdrawAuthority: TransactionSigner
  withdrawAccount: Address
  tokenProgram: Address
  programState: Address
  mint: Address
}

export const layout = borsh.struct([types.LeaseWithdrawParams.layout("params")])

export function leaseWithdraw(
  args: LeaseWithdrawArgs,
  accounts: LeaseWithdrawAccounts,
  programAddress: Address = PROGRAM_ID
) {
  const keys: Array<IAccountMeta | IAccountSignerMeta> = [
    { address: accounts.lease, role: 1 },
    { address: accounts.escrow, role: 1 },
    { address: accounts.aggregator, role: 0 },
    { address: accounts.queue, role: 0 },
    {
      address: accounts.withdrawAuthority.address,
      role: 2,
      signer: accounts.withdrawAuthority,
    },
    { address: accounts.withdrawAccount, role: 1 },
    { address: accounts.tokenProgram, role: 0 },
    { address: accounts.programState, role: 0 },
    { address: accounts.mint, role: 0 },
  ]
  const identifier = Buffer.from([186, 41, 100, 248, 234, 81, 61, 169])
  const buffer = Buffer.alloc(1000)
  const len = layout.encode(
    {
      params: types.LeaseWithdrawParams.toEncodable(args.params),
    },
    buffer
  )
  const data = Buffer.concat([identifier, buffer]).slice(0, 8 + len)
  const ix: IInstruction = { accounts: keys, programAddress, data }
  return ix
}
