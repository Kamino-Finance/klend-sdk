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
  171, 118, 121, 201, 233, 140, 23, 228,
])

export interface WithdrawReferrerFeesAccounts {
  referrer: TransactionSigner
  referrerTokenState: Address
  reserve: Address
  reserveLiquidityMint: Address
  reserveSupplyLiquidity: Address
  referrerTokenAccount: Address
  lendingMarket: Address
  lendingMarketAuthority: Address
  tokenProgram: Address
}

export function withdrawReferrerFees(
  accounts: WithdrawReferrerFeesAccounts,
  remainingAccounts: Array<AccountMeta | AccountSignerMeta> = [],
  programAddress: Address = PROGRAM_ID
) {
  const keys: Array<AccountMeta | AccountSignerMeta> = [
    { address: accounts.referrer.address, role: 3, signer: accounts.referrer },
    { address: accounts.referrerTokenState, role: 1 },
    { address: accounts.reserve, role: 1 },
    { address: accounts.reserveLiquidityMint, role: 0 },
    { address: accounts.reserveSupplyLiquidity, role: 1 },
    { address: accounts.referrerTokenAccount, role: 1 },
    { address: accounts.lendingMarket, role: 0 },
    { address: accounts.lendingMarketAuthority, role: 0 },
    { address: accounts.tokenProgram, role: 0 },
    ...remainingAccounts,
  ]
  const data = DISCRIMINATOR
  const ix: Instruction = { accounts: keys, programAddress, data }
  return ix
}
