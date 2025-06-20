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

export interface VaultTransferArgs {
  params: types.VaultTransferParamsFields
}

export interface VaultTransferAccounts {
  state: Address
  authority: TransactionSigner
  to: Address
  vault: Address
  tokenProgram: Address
}

export const layout = borsh.struct([types.VaultTransferParams.layout("params")])

export function vaultTransfer(
  args: VaultTransferArgs,
  accounts: VaultTransferAccounts,
  programAddress: Address = PROGRAM_ID
) {
  const keys: Array<IAccountMeta | IAccountSignerMeta> = [
    { address: accounts.state, role: 0 },
    {
      address: accounts.authority.address,
      role: 2,
      signer: accounts.authority,
    },
    { address: accounts.to, role: 1 },
    { address: accounts.vault, role: 1 },
    { address: accounts.tokenProgram, role: 0 },
  ]
  const identifier = Buffer.from([211, 125, 3, 105, 45, 33, 227, 214])
  const buffer = Buffer.alloc(1000)
  const len = layout.encode(
    {
      params: types.VaultTransferParams.toEncodable(args.params),
    },
    buffer
  )
  const data = Buffer.concat([identifier, buffer]).slice(0, 8 + len)
  const ix: IInstruction = { accounts: keys, programAddress, data }
  return ix
}
