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

export const DISCRIMINATOR = Buffer.from([161, 128, 143, 245, 171, 199, 194, 6])

export interface BorrowObligationLiquidityV2Args {
  liquidityAmount: BN
}

export interface BorrowObligationLiquidityV2Accounts {
  borrowAccounts: {
    owner: TransactionSigner
    obligation: Address
    lendingMarket: Address
    lendingMarketAuthority: Address
    borrowReserve: Address
    borrowReserveLiquidityMint: Address
    reserveSourceLiquidity: Address
    borrowReserveLiquidityFeeReceiver: Address
    userDestinationLiquidity: Address
    referrerTokenState: Option<Address>
    tokenProgram: Address
    instructionSysvarAccount: Address
  }
  farmsAccounts: {
    obligationFarmUserState: Option<Address>
    reserveFarmState: Option<Address>
  }
  farmsProgram: Address
}

export const layout = borsh.struct<BorrowObligationLiquidityV2Args>([
  borsh.u64("liquidityAmount"),
])

export function borrowObligationLiquidityV2(
  args: BorrowObligationLiquidityV2Args,
  accounts: BorrowObligationLiquidityV2Accounts,
  remainingAccounts: Array<AccountMeta | AccountSignerMeta> = [],
  programAddress: Address = PROGRAM_ID
) {
  const keys: Array<AccountMeta | AccountSignerMeta> = [
    {
      address: accounts.borrowAccounts.owner.address,
      role: 2,
      signer: accounts.borrowAccounts.owner,
    },
    { address: accounts.borrowAccounts.obligation, role: 1 },
    { address: accounts.borrowAccounts.lendingMarket, role: 0 },
    { address: accounts.borrowAccounts.lendingMarketAuthority, role: 0 },
    { address: accounts.borrowAccounts.borrowReserve, role: 1 },
    { address: accounts.borrowAccounts.borrowReserveLiquidityMint, role: 0 },
    { address: accounts.borrowAccounts.reserveSourceLiquidity, role: 1 },
    {
      address: accounts.borrowAccounts.borrowReserveLiquidityFeeReceiver,
      role: 1,
    },
    { address: accounts.borrowAccounts.userDestinationLiquidity, role: 1 },
    isSome(accounts.borrowAccounts.referrerTokenState)
      ? { address: accounts.borrowAccounts.referrerTokenState.value, role: 1 }
      : { address: programAddress, role: 0 },
    { address: accounts.borrowAccounts.tokenProgram, role: 0 },
    { address: accounts.borrowAccounts.instructionSysvarAccount, role: 0 },
    isSome(accounts.farmsAccounts.obligationFarmUserState)
      ? {
          address: accounts.farmsAccounts.obligationFarmUserState.value,
          role: 1,
        }
      : { address: programAddress, role: 0 },
    isSome(accounts.farmsAccounts.reserveFarmState)
      ? { address: accounts.farmsAccounts.reserveFarmState.value, role: 1 }
      : { address: programAddress, role: 0 },
    { address: accounts.farmsProgram, role: 0 },
    ...remainingAccounts,
  ]
  const buffer = Buffer.alloc(1000)
  const len = layout.encode(
    {
      liquidityAmount: args.liquidityAmount,
    },
    buffer
  )
  const data = Buffer.concat([DISCRIMINATOR, buffer]).slice(0, 8 + len)
  const ix: Instruction = { accounts: keys, programAddress, data }
  return ix
}
