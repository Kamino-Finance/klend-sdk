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

export const DISCRIMINATOR = Buffer.from([85, 30, 155, 225, 224, 186, 141, 148])

export interface RolloverFixedTermBorrowAccounts {
  rolloverAccounts: {
    payer: TransactionSigner
    obligation: Address
    lendingMarket: Address
    lendingMarketAuthority: Address
    sourceBorrowReserve: Address
    targetBorrowReserve: Address
    liquidityMint: Address
    sourceBorrowReserveLiquidity: Address
    targetBorrowReserveLiquidity: Address
    tokenProgram: Address
  }
  sourceFarmsAccounts: {
    obligationFarmUserState: Option<Address>
    reserveFarmState: Option<Address>
  }
  targetFarmsAccounts: {
    obligationFarmUserState: Option<Address>
    reserveFarmState: Option<Address>
  }
  farmsProgram: Address
}

export function rolloverFixedTermBorrow(
  accounts: RolloverFixedTermBorrowAccounts,
  remainingAccounts: Array<AccountMeta | AccountSignerMeta> = [],
  programAddress: Address = PROGRAM_ID
) {
  const keys: Array<AccountMeta | AccountSignerMeta> = [
    {
      address: accounts.rolloverAccounts.payer.address,
      role: 2,
      signer: accounts.rolloverAccounts.payer,
    },
    { address: accounts.rolloverAccounts.obligation, role: 1 },
    { address: accounts.rolloverAccounts.lendingMarket, role: 0 },
    { address: accounts.rolloverAccounts.lendingMarketAuthority, role: 0 },
    { address: accounts.rolloverAccounts.sourceBorrowReserve, role: 1 },
    { address: accounts.rolloverAccounts.targetBorrowReserve, role: 1 },
    { address: accounts.rolloverAccounts.liquidityMint, role: 0 },
    {
      address: accounts.rolloverAccounts.sourceBorrowReserveLiquidity,
      role: 1,
    },
    {
      address: accounts.rolloverAccounts.targetBorrowReserveLiquidity,
      role: 1,
    },
    { address: accounts.rolloverAccounts.tokenProgram, role: 0 },
    isSome(accounts.sourceFarmsAccounts.obligationFarmUserState)
      ? {
          address: accounts.sourceFarmsAccounts.obligationFarmUserState.value,
          role: 1,
        }
      : { address: programAddress, role: 0 },
    isSome(accounts.sourceFarmsAccounts.reserveFarmState)
      ? {
          address: accounts.sourceFarmsAccounts.reserveFarmState.value,
          role: 1,
        }
      : { address: programAddress, role: 0 },
    isSome(accounts.targetFarmsAccounts.obligationFarmUserState)
      ? {
          address: accounts.targetFarmsAccounts.obligationFarmUserState.value,
          role: 1,
        }
      : { address: programAddress, role: 0 },
    isSome(accounts.targetFarmsAccounts.reserveFarmState)
      ? {
          address: accounts.targetFarmsAccounts.reserveFarmState.value,
          role: 1,
        }
      : { address: programAddress, role: 0 },
    { address: accounts.farmsProgram, role: 0 },
    ...remainingAccounts,
  ]
  const data = DISCRIMINATOR
  const ix: Instruction = { accounts: keys, programAddress, data }
  return ix
}
