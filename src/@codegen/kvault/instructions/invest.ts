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

export interface InvestAccounts {
  payer: TransactionSigner
  payerTokenAccount: Address
  vaultState: Address
  tokenVault: Address
  tokenMint: Address
  baseVaultAuthority: Address
  ctokenVault: Address
  /** CPI accounts */
  reserve: Address
  lendingMarket: Address
  lendingMarketAuthority: Address
  reserveLiquiditySupply: Address
  reserveCollateralMint: Address
  klendProgram: Address
  reserveCollateralTokenProgram: Address
  tokenProgram: Address
  instructionSysvarAccount: Address
}

export function invest(
  accounts: InvestAccounts,
  programAddress: Address = PROGRAM_ID
) {
  const keys: Array<IAccountMeta | IAccountSignerMeta> = [
    { address: accounts.payer.address, role: 3, signer: accounts.payer },
    { address: accounts.payerTokenAccount, role: 1 },
    { address: accounts.vaultState, role: 1 },
    { address: accounts.tokenVault, role: 1 },
    { address: accounts.tokenMint, role: 1 },
    { address: accounts.baseVaultAuthority, role: 1 },
    { address: accounts.ctokenVault, role: 1 },
    { address: accounts.reserve, role: 1 },
    { address: accounts.lendingMarket, role: 0 },
    { address: accounts.lendingMarketAuthority, role: 0 },
    { address: accounts.reserveLiquiditySupply, role: 1 },
    { address: accounts.reserveCollateralMint, role: 1 },
    { address: accounts.klendProgram, role: 0 },
    { address: accounts.reserveCollateralTokenProgram, role: 0 },
    { address: accounts.tokenProgram, role: 0 },
    { address: accounts.instructionSysvarAccount, role: 0 },
  ]
  const identifier = Buffer.from([13, 245, 180, 103, 254, 182, 121, 4])
  const data = identifier
  const ix: IInstruction = { accounts: keys, programAddress, data }
  return ix
}
