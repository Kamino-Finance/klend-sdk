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

export const DISCRIMINATOR = Buffer.from([183, 18, 70, 156, 148, 109, 161, 34])

export interface WithdrawArgs {
  sharesAmount: BN
}

export interface WithdrawAccounts {
  withdrawFromAvailable: {
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
  withdrawFromReserveAccounts: {
    vaultState: Address
    reserve: Address
    ctokenVault: Address
    lendingMarket: Address
    lendingMarketAuthority: Address
    reserveLiquiditySupply: Address
    reserveCollateralMint: Address
    reserveCollateralTokenProgram: Address
    instructionSysvarAccount: Address
  }
  eventAuthority: Address
  program: Address
}

export const layout = borsh.struct<WithdrawArgs>([borsh.u64("sharesAmount")])

export function withdraw(
  args: WithdrawArgs,
  accounts: WithdrawAccounts,
  remainingAccounts: Array<AccountMeta | AccountSignerMeta> = [],
  programAddress: Address = PROGRAM_ID
) {
  const keys: Array<AccountMeta | AccountSignerMeta> = [
    {
      address: accounts.withdrawFromAvailable.user.address,
      role: 3,
      signer: accounts.withdrawFromAvailable.user,
    },
    { address: accounts.withdrawFromAvailable.vaultState, role: 1 },
    { address: accounts.withdrawFromAvailable.tokenVault, role: 1 },
    { address: accounts.withdrawFromAvailable.baseVaultAuthority, role: 0 },
    { address: accounts.withdrawFromAvailable.userTokenAta, role: 1 },
    { address: accounts.withdrawFromAvailable.tokenMint, role: 1 },
    { address: accounts.withdrawFromAvailable.userSharesAta, role: 1 },
    { address: accounts.withdrawFromAvailable.sharesMint, role: 1 },
    { address: accounts.withdrawFromAvailable.tokenProgram, role: 0 },
    { address: accounts.withdrawFromAvailable.sharesTokenProgram, role: 0 },
    { address: accounts.withdrawFromAvailable.klendProgram, role: 0 },
    { address: accounts.withdrawFromAvailable.eventAuthority, role: 0 },
    { address: accounts.withdrawFromAvailable.program, role: 0 },
    { address: accounts.withdrawFromReserveAccounts.vaultState, role: 1 },
    { address: accounts.withdrawFromReserveAccounts.reserve, role: 1 },
    { address: accounts.withdrawFromReserveAccounts.ctokenVault, role: 1 },
    { address: accounts.withdrawFromReserveAccounts.lendingMarket, role: 0 },
    {
      address: accounts.withdrawFromReserveAccounts.lendingMarketAuthority,
      role: 0,
    },
    {
      address: accounts.withdrawFromReserveAccounts.reserveLiquiditySupply,
      role: 1,
    },
    {
      address: accounts.withdrawFromReserveAccounts.reserveCollateralMint,
      role: 1,
    },
    {
      address:
        accounts.withdrawFromReserveAccounts.reserveCollateralTokenProgram,
      role: 0,
    },
    {
      address: accounts.withdrawFromReserveAccounts.instructionSysvarAccount,
      role: 0,
    },
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
