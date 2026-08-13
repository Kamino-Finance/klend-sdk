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

export const DISCRIMINATOR = Buffer.from([82, 152, 213, 69, 250, 0, 157, 188])

export interface UpdateObligationConfigArgs {
  mode: types.UpdateObligationConfigModeKind
  value: Uint8Array
}

export interface UpdateObligationConfigAccounts {
  owner: TransactionSigner
  obligation: Address
  borrowReserve: Option<Address>
  depositReserve: Option<Address>
  lendingMarket: Address
}

export const layout = borsh.struct([
  types.UpdateObligationConfigMode.layout("mode"),
  borsh.vecU8("value"),
])

export function updateObligationConfig(
  args: UpdateObligationConfigArgs,
  accounts: UpdateObligationConfigAccounts,
  remainingAccounts: Array<AccountMeta | AccountSignerMeta> = [],
  programAddress: Address = PROGRAM_ID
) {
  const keys: Array<AccountMeta | AccountSignerMeta> = [
    { address: accounts.owner.address, role: 2, signer: accounts.owner },
    { address: accounts.obligation, role: 1 },
    isSome(accounts.borrowReserve)
      ? { address: accounts.borrowReserve.value, role: 0 }
      : { address: programAddress, role: 0 },
    isSome(accounts.depositReserve)
      ? { address: accounts.depositReserve.value, role: 0 }
      : { address: programAddress, role: 0 },
    { address: accounts.lendingMarket, role: 0 },
    ...remainingAccounts,
  ]
  const buffer = Buffer.alloc(1000)
  const len = layout.encode(
    {
      mode: args.mode.toEncodable(),
      value: Buffer.from(
        args.value.buffer,
        args.value.byteOffset,
        args.value.length
      ),
    },
    buffer
  )
  const data = Buffer.concat([DISCRIMINATOR, buffer]).slice(0, 8 + len)
  const ix: Instruction = { accounts: keys, programAddress, data }
  return ix
}
