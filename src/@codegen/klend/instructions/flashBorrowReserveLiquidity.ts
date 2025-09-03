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

export const DISCRIMINATOR = Buffer.from([135, 231, 52, 167, 7, 52, 212, 193])

export interface FlashBorrowReserveLiquidityArgs {
  liquidityAmount: BN
}

export interface FlashBorrowReserveLiquidityAccounts {
  userTransferAuthority: TransactionSigner
  lendingMarketAuthority: Address
  lendingMarket: Address
  reserve: Address
  reserveLiquidityMint: Address
  reserveSourceLiquidity: Address
  userDestinationLiquidity: Address
  reserveLiquidityFeeReceiver: Address
  referrerTokenState: Option<Address>
  referrerAccount: Option<Address>
  sysvarInfo: Address
  tokenProgram: Address
}

export const layout = borsh.struct<FlashBorrowReserveLiquidityArgs>([
  borsh.u64("liquidityAmount"),
])

export function flashBorrowReserveLiquidity(
  args: FlashBorrowReserveLiquidityArgs,
  accounts: FlashBorrowReserveLiquidityAccounts,
  remainingAccounts: Array<AccountMeta | AccountSignerMeta> = [],
  programAddress: Address = PROGRAM_ID
) {
  const keys: Array<AccountMeta | AccountSignerMeta> = [
    {
      address: accounts.userTransferAuthority.address,
      role: 2,
      signer: accounts.userTransferAuthority,
    },
    { address: accounts.lendingMarketAuthority, role: 0 },
    { address: accounts.lendingMarket, role: 0 },
    { address: accounts.reserve, role: 1 },
    { address: accounts.reserveLiquidityMint, role: 0 },
    { address: accounts.reserveSourceLiquidity, role: 1 },
    { address: accounts.userDestinationLiquidity, role: 1 },
    { address: accounts.reserveLiquidityFeeReceiver, role: 1 },
    isSome(accounts.referrerTokenState)
      ? { address: accounts.referrerTokenState.value, role: 1 }
      : { address: programAddress, role: 0 },
    isSome(accounts.referrerAccount)
      ? { address: accounts.referrerAccount.value, role: 1 }
      : { address: programAddress, role: 0 },
    { address: accounts.sysvarInfo, role: 0 },
    { address: accounts.tokenProgram, role: 0 },
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
