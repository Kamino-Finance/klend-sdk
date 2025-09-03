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

export const DISCRIMINATOR = Buffer.from([19, 131, 112, 155, 170, 220, 34, 57])

export interface WithdrawFromAvailableArgs {
  sharesAmount: BN
}

export interface WithdrawFromAvailableAccounts {
  user: TransactionSigner
  vaultState: Address
  tokenVault: Address
  baseVaultAuthority: Address
  userTokenAta: Address
  tokenMint: Address
  userSharesAta: Address
  sharesMint: Address
  tokenProgram: Address
  sharesTokenProgram: Address
  klendProgram: Address
  eventAuthority: Address
  program: Address
}

export const layout = borsh.struct<WithdrawFromAvailableArgs>([
  borsh.u64("sharesAmount"),
])

export function withdrawFromAvailable(
  args: WithdrawFromAvailableArgs,
  accounts: WithdrawFromAvailableAccounts,
  remainingAccounts: Array<AccountMeta | AccountSignerMeta> = [],
  programAddress: Address = PROGRAM_ID
) {
  const keys: Array<AccountMeta | AccountSignerMeta> = [
    { address: accounts.user.address, role: 3, signer: accounts.user },
    { address: accounts.vaultState, role: 1 },
    { address: accounts.tokenVault, role: 1 },
    { address: accounts.baseVaultAuthority, role: 0 },
    { address: accounts.userTokenAta, role: 1 },
    { address: accounts.tokenMint, role: 1 },
    { address: accounts.userSharesAta, role: 1 },
    { address: accounts.sharesMint, role: 1 },
    { address: accounts.tokenProgram, role: 0 },
    { address: accounts.sharesTokenProgram, role: 0 },
    { address: accounts.klendProgram, role: 0 },
    { address: accounts.eventAuthority, role: 0 },
    { address: accounts.program, role: 0 },
    ...remainingAccounts,
  ]
  const buffer = Buffer.alloc(1000)
  const len = layout.encode(
    {
      sharesAmount: args.sharesAmount,
    },
    buffer
  )
  const data = Buffer.concat([DISCRIMINATOR, buffer]).slice(0, 8 + len)
  const ix: Instruction = { accounts: keys, programAddress, data }
  return ix
}
