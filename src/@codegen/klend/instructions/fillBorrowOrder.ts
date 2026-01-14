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

export const DISCRIMINATOR = Buffer.from([102, 4, 167, 76, 131, 170, 93, 19])

export interface FillBorrowOrderAccounts {
  borrowAccounts: {
    payer: TransactionSigner
    /** The obligation with a [BorrowOrder]. */
    obligation: Address
    /** The [Self::obligation]'s market - needed for borrowing-related configuration. */
    lendingMarket: Address
    /** The [Self::lending_market]'s authority, needed to transfer the newly-borrowed funds out of the [Self::reserve_source_liquidity]. */
    lendingMarketAuthority: Address
    /** The reserve to borrow from.  Its mint must match the asset requested by the [BorrowOrder::debt_liquidity_mint]. */
    borrowReserve: Address
    /** The mint of [Self::borrow_reserve] - needed to execute the transfer. */
    borrowReserveLiquidityMint: Address
    /** The vault of [Self::borrow_reserve], from which the funds are transferred. */
    reserveSourceLiquidity: Address
    /** The fee vault of [Self::borrow_reserve], to which the fees are transferred. */
    borrowReserveLiquidityFeeReceiver: Address
    /** The destination token account that should receive the newly borrowed funds.  It must match [BorrowOrder::filled_debt_destination], owner and mint.  **Warning:** An altered destination account will prevent an order from being filled. */
    userDestinationLiquidity: Address
    /** The referrer's account, for accumulating fees - needed if the [Obligation::has_referrer]. */
    referrerTokenState: Option<Address>
    /** The token program of [Self::borrow_reserve] - needed to execute the transfer. */
    tokenProgram: Address
  }
  farmsAccounts: {
    obligationFarmUserState: Option<Address>
    reserveFarmState: Option<Address>
  }
  farmsProgram: Address
  eventAuthority: Address
  program: Address
}

export function fillBorrowOrder(
  accounts: FillBorrowOrderAccounts,
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
  const data = DISCRIMINATOR
  const ix: Instruction = { accounts: keys, programAddress, data }
  return ix
}
