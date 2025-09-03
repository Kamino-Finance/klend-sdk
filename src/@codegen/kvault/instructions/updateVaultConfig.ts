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

export const DISCRIMINATOR = Buffer.from([122, 3, 21, 222, 158, 255, 238, 157])

export interface UpdateVaultConfigArgs {
  entry: types.VaultConfigFieldKind
  data: Uint8Array
}

export interface UpdateVaultConfigAccounts {
  vaultAdminAuthority: TransactionSigner
  vaultState: Address
  klendProgram: Address
}

export const layout = borsh.struct([
  types.VaultConfigField.layout("entry"),
  borsh.vecU8("data"),
])

export function updateVaultConfig(
  args: UpdateVaultConfigArgs,
  accounts: UpdateVaultConfigAccounts,
  remainingAccounts: Array<AccountMeta | AccountSignerMeta> = [],
  programAddress: Address = PROGRAM_ID
) {
  const keys: Array<AccountMeta | AccountSignerMeta> = [
    {
      address: accounts.vaultAdminAuthority.address,
      role: 2,
      signer: accounts.vaultAdminAuthority,
    },
    { address: accounts.vaultState, role: 1 },
    { address: accounts.klendProgram, role: 0 },
    ...remainingAccounts,
  ]
  const buffer = Buffer.alloc(1000)
  const len = layout.encode(
    {
      entry: args.entry.toEncodable(),
      data: Buffer.from(
        args.data.buffer,
        args.data.byteOffset,
        args.data.length
      ),
    },
    buffer
  )
  const data = Buffer.concat([DISCRIMINATOR, buffer]).slice(0, 8 + len)
  const ix: Instruction = { accounts: keys, programAddress, data }
  return ix
}
