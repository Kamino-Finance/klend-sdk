import { TransactionInstruction, PublicKey, AccountMeta } from "@solana/web3.js" // eslint-disable-line @typescript-eslint/no-unused-vars
import BN from "bn.js" // eslint-disable-line @typescript-eslint/no-unused-vars
import * as borsh from "@coral-xyz/borsh" // eslint-disable-line @typescript-eslint/no-unused-vars
import * as types from "../types" // eslint-disable-line @typescript-eslint/no-unused-vars
import { PROGRAM_ID } from "../programId"

export interface WithdrawFromAvailableArgs {
  sharesAmount: BN
}

export interface WithdrawFromAvailableAccounts {
  user: PublicKey
  vaultState: PublicKey
  tokenVault: PublicKey
  baseVaultAuthority: PublicKey
  userTokenAta: PublicKey
  tokenMint: PublicKey
  userSharesAta: PublicKey
  sharesMint: PublicKey
  tokenProgram: PublicKey
  sharesTokenProgram: PublicKey
  klendProgram: PublicKey
}

export const layout = borsh.struct([borsh.u64("sharesAmount")])

export function withdrawFromAvailable(
  args: WithdrawFromAvailableArgs,
  accounts: WithdrawFromAvailableAccounts,
  programId: PublicKey = PROGRAM_ID
) {
  const keys: Array<AccountMeta> = [
    { pubkey: accounts.user, isSigner: true, isWritable: true },
    { pubkey: accounts.vaultState, isSigner: false, isWritable: true },
    { pubkey: accounts.tokenVault, isSigner: false, isWritable: true },
    { pubkey: accounts.baseVaultAuthority, isSigner: false, isWritable: false },
    { pubkey: accounts.userTokenAta, isSigner: false, isWritable: true },
    { pubkey: accounts.tokenMint, isSigner: false, isWritable: true },
    { pubkey: accounts.userSharesAta, isSigner: false, isWritable: true },
    { pubkey: accounts.sharesMint, isSigner: false, isWritable: true },
    { pubkey: accounts.tokenProgram, isSigner: false, isWritable: false },
    { pubkey: accounts.sharesTokenProgram, isSigner: false, isWritable: false },
    { pubkey: accounts.klendProgram, isSigner: false, isWritable: false },
  ]
  const identifier = Buffer.from([19, 131, 112, 155, 170, 220, 34, 57])
  const buffer = Buffer.alloc(1000)
  const len = layout.encode(
    {
      sharesAmount: args.sharesAmount,
    },
    buffer
  )
  const data = Buffer.concat([identifier, buffer]).slice(0, 8 + len)
  const ix = new TransactionInstruction({ keys, programId, data })
  return ix
}
