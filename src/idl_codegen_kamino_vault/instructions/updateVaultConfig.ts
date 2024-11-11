import { TransactionInstruction, PublicKey, AccountMeta } from "@solana/web3.js" // eslint-disable-line @typescript-eslint/no-unused-vars
import BN from "bn.js" // eslint-disable-line @typescript-eslint/no-unused-vars
import * as borsh from "@coral-xyz/borsh" // eslint-disable-line @typescript-eslint/no-unused-vars
import * as types from "../types" // eslint-disable-line @typescript-eslint/no-unused-vars
import { PROGRAM_ID } from "../programId"

export interface UpdateVaultConfigArgs {
  entry: types.VaultConfigFieldKind
  data: Uint8Array
}

export interface UpdateVaultConfigAccounts {
  adminAuthority: PublicKey
  vaultState: PublicKey
  klendProgram: PublicKey
}

export const layout = borsh.struct([
  types.VaultConfigField.layout("entry"),
  borsh.vecU8("data"),
])

export function updateVaultConfig(
  args: UpdateVaultConfigArgs,
  accounts: UpdateVaultConfigAccounts,
  programId: PublicKey = PROGRAM_ID
) {
  const keys: Array<AccountMeta> = [
    { pubkey: accounts.adminAuthority, isSigner: true, isWritable: false },
    { pubkey: accounts.vaultState, isSigner: false, isWritable: true },
    { pubkey: accounts.klendProgram, isSigner: false, isWritable: false },
  ]
  const identifier = Buffer.from([122, 3, 21, 222, 158, 255, 238, 157])
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
  const data = Buffer.concat([identifier, buffer]).slice(0, 8 + len)
  const ix = new TransactionInstruction({ keys, programId, data })
  return ix
}
