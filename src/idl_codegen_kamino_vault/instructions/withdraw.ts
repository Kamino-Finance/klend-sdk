import { TransactionInstruction, PublicKey, AccountMeta } from "@solana/web3.js" // eslint-disable-line @typescript-eslint/no-unused-vars
import BN from "bn.js" // eslint-disable-line @typescript-eslint/no-unused-vars
import * as borsh from "@coral-xyz/borsh" // eslint-disable-line @typescript-eslint/no-unused-vars
import * as types from "../types" // eslint-disable-line @typescript-eslint/no-unused-vars
import { PROGRAM_ID } from "../programId"

export interface WithdrawArgs {
  sharesAmount: BN
}

export interface WithdrawAccounts {
  withdrawFromAvailable: {
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
  withdrawFromReserveAccounts: {
    vaultState: PublicKey
    reserve: PublicKey
    ctokenVault: PublicKey
    lendingMarket: PublicKey
    lendingMarketAuthority: PublicKey
    reserveLiquiditySupply: PublicKey
    reserveCollateralMint: PublicKey
    reserveCollateralTokenProgram: PublicKey
    instructionSysvarAccount: PublicKey
  }
}

export const layout = borsh.struct([borsh.u64("sharesAmount")])

export function withdraw(
  args: WithdrawArgs,
  accounts: WithdrawAccounts,
  programId: PublicKey = PROGRAM_ID
) {
  const keys: Array<AccountMeta> = [
    {
      pubkey: accounts.withdrawFromAvailable.user,
      isSigner: true,
      isWritable: true,
    },
    {
      pubkey: accounts.withdrawFromAvailable.vaultState,
      isSigner: false,
      isWritable: true,
    },
    {
      pubkey: accounts.withdrawFromAvailable.tokenVault,
      isSigner: false,
      isWritable: true,
    },
    {
      pubkey: accounts.withdrawFromAvailable.baseVaultAuthority,
      isSigner: false,
      isWritable: false,
    },
    {
      pubkey: accounts.withdrawFromAvailable.userTokenAta,
      isSigner: false,
      isWritable: true,
    },
    {
      pubkey: accounts.withdrawFromAvailable.tokenMint,
      isSigner: false,
      isWritable: true,
    },
    {
      pubkey: accounts.withdrawFromAvailable.userSharesAta,
      isSigner: false,
      isWritable: true,
    },
    {
      pubkey: accounts.withdrawFromAvailable.sharesMint,
      isSigner: false,
      isWritable: true,
    },
    {
      pubkey: accounts.withdrawFromAvailable.tokenProgram,
      isSigner: false,
      isWritable: false,
    },
    {
      pubkey: accounts.withdrawFromAvailable.sharesTokenProgram,
      isSigner: false,
      isWritable: false,
    },
    {
      pubkey: accounts.withdrawFromAvailable.klendProgram,
      isSigner: false,
      isWritable: false,
    },
    {
      pubkey: accounts.withdrawFromReserveAccounts.vaultState,
      isSigner: false,
      isWritable: true,
    },
    {
      pubkey: accounts.withdrawFromReserveAccounts.reserve,
      isSigner: false,
      isWritable: true,
    },
    {
      pubkey: accounts.withdrawFromReserveAccounts.ctokenVault,
      isSigner: false,
      isWritable: true,
    },
    {
      pubkey: accounts.withdrawFromReserveAccounts.lendingMarket,
      isSigner: false,
      isWritable: false,
    },
    {
      pubkey: accounts.withdrawFromReserveAccounts.lendingMarketAuthority,
      isSigner: false,
      isWritable: false,
    },
    {
      pubkey: accounts.withdrawFromReserveAccounts.reserveLiquiditySupply,
      isSigner: false,
      isWritable: true,
    },
    {
      pubkey: accounts.withdrawFromReserveAccounts.reserveCollateralMint,
      isSigner: false,
      isWritable: true,
    },
    {
      pubkey:
        accounts.withdrawFromReserveAccounts.reserveCollateralTokenProgram,
      isSigner: false,
      isWritable: false,
    },
    {
      pubkey: accounts.withdrawFromReserveAccounts.instructionSysvarAccount,
      isSigner: false,
      isWritable: false,
    },
  ]
  const identifier = Buffer.from([183, 18, 70, 156, 148, 109, 161, 34])
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
