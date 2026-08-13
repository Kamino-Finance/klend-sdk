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

export const DISCRIMINATOR = Buffer.from([197, 85, 193, 139, 40, 94, 194, 143])

export interface FillBorrowOrderV2Args {
  orderIdx: number
}

export interface FillBorrowOrderV2Accounts {
  borrowAccounts: {
    payer: TransactionSigner
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
  eventAuthority: Address
  program: Address
}

export const layout = borsh.struct([borsh.u8("orderIdx")])

export function fillBorrowOrderV2(
  args: FillBorrowOrderV2Args,
  accounts: FillBorrowOrderV2Accounts,
  remainingAccounts: Array<AccountMeta | AccountSignerMeta> = [],
  programAddress: Address = PROGRAM_ID
) {
  const keys: Array<AccountMeta | AccountSignerMeta> = [
    {
      address: accounts.borrowAccounts.payer.address,
      role: 2,
      signer: accounts.borrowAccounts.payer,
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
    { address: accounts.eventAuthority, role: 0 },
    { address: accounts.program, role: 0 },
    ...remainingAccounts,
  ]
  const buffer = Buffer.alloc(1000)
  const len = layout.encode(
    {
      orderIdx: args.orderIdx,
    },
    buffer
  )
  const data = Buffer.concat([DISCRIMINATOR, buffer]).slice(0, 8 + len)
  const ix: Instruction = { accounts: keys, programAddress, data }
  return ix
}
