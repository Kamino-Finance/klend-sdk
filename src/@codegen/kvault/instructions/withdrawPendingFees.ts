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

export const DISCRIMINATOR = Buffer.from([
  131, 194, 200, 140, 175, 244, 217, 183,
])

export interface WithdrawPendingFeesAccounts {
  vaultAdminAuthority: TransactionSigner
  vaultState: Address
  reserve: Address
  tokenVault: Address
  ctokenVault: Address
  baseVaultAuthority: Address
  tokenAta: Address
  tokenMint: Address
  /** CPI accounts */
  lendingMarket: Address
  lendingMarketAuthority: Address
  reserveLiquiditySupply: Address
  reserveCollateralMint: Address
  klendProgram: Address
  tokenProgram: Address
  reserveCollateralTokenProgram: Address
  instructionSysvarAccount: Address
}

export function withdrawPendingFees(
  accounts: WithdrawPendingFeesAccounts,
  remainingAccounts: Array<AccountMeta | AccountSignerMeta> = [],
  programAddress: Address = PROGRAM_ID
) {
  const keys: Array<AccountMeta | AccountSignerMeta> = [
    {
      address: accounts.vaultAdminAuthority.address,
      role: 3,
      signer: accounts.vaultAdminAuthority,
    },
    { address: accounts.vaultState, role: 1 },
    { address: accounts.reserve, role: 1 },
    { address: accounts.tokenVault, role: 1 },
    { address: accounts.ctokenVault, role: 1 },
    { address: accounts.baseVaultAuthority, role: 1 },
    { address: accounts.tokenAta, role: 1 },
    { address: accounts.tokenMint, role: 1 },
    { address: accounts.lendingMarket, role: 0 },
    { address: accounts.lendingMarketAuthority, role: 0 },
    { address: accounts.reserveLiquiditySupply, role: 1 },
    { address: accounts.reserveCollateralMint, role: 1 },
    { address: accounts.klendProgram, role: 0 },
    { address: accounts.tokenProgram, role: 0 },
    { address: accounts.reserveCollateralTokenProgram, role: 0 },
    { address: accounts.instructionSysvarAccount, role: 0 },
    ...remainingAccounts,
  ]
  const data = DISCRIMINATOR
  const ix: Instruction = { accounts: keys, programAddress, data }
  return ix
}
