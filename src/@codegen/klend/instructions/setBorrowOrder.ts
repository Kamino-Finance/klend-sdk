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

export const DISCRIMINATOR = Buffer.from([177, 186, 45, 61, 235, 91, 68, 139])

export interface SetBorrowOrderArgs {
  orderConfig: types.BorrowOrderConfigArgsFields
  minExpectedCurrentRemainingDebtAmount: BN
}

export interface SetBorrowOrderAccounts {
  /** The [Self::obligation]'s owner. */
  owner: TransactionSigner
  /** The obligation to set the [BorrowOrder] on. */
  obligation: Address
  /** The [Self::obligation]'s market - needed only to validate the borrow orders' feature flag. */
  lendingMarket: Address
  /**
   * The [BorrowOrder::filled_debt_destination] to set on order creation. Not editable on order
   * updates.
   * Ignored when cancelling the order.
   */
  filledDebtDestination: Address
  /**
   * The [BorrowOrder::debt_liquidity_mint] to set on order creation. Not editable on order
   * updates.
   * Ignored when cancelling the order.
   */
  debtLiquidityMint: Address
  eventAuthority: Address
  program: Address
}

export const layout = borsh.struct<SetBorrowOrderArgs>([
  types.BorrowOrderConfigArgs.layout("orderConfig"),
  borsh.u64("minExpectedCurrentRemainingDebtAmount"),
])

export function setBorrowOrder(
  args: SetBorrowOrderArgs,
  accounts: SetBorrowOrderAccounts,
  remainingAccounts: Array<AccountMeta | AccountSignerMeta> = [],
  programAddress: Address = PROGRAM_ID
) {
  const keys: Array<AccountMeta | AccountSignerMeta> = [
    { address: accounts.owner.address, role: 2, signer: accounts.owner },
    { address: accounts.obligation, role: 1 },
    { address: accounts.lendingMarket, role: 0 },
    { address: accounts.filledDebtDestination, role: 0 },
    { address: accounts.debtLiquidityMint, role: 0 },
    { address: accounts.eventAuthority, role: 0 },
    { address: accounts.program, role: 0 },
    ...remainingAccounts,
  ]
  const buffer = Buffer.alloc(1000)
  const len = layout.encode(
    {
      orderConfig: types.BorrowOrderConfigArgs.toEncodable(args.orderConfig),
      minExpectedCurrentRemainingDebtAmount:
        args.minExpectedCurrentRemainingDebtAmount,
    },
    buffer
  )
  const data = Buffer.concat([DISCRIMINATOR, buffer]).slice(0, 8 + len)
  const ix: Instruction = { accounts: keys, programAddress, data }
  return ix
}
