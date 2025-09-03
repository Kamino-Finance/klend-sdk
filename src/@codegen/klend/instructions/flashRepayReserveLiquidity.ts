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

export const DISCRIMINATOR = Buffer.from([185, 117, 0, 203, 96, 245, 180, 186])

export interface FlashRepayReserveLiquidityArgs {
  liquidityAmount: BN
  borrowInstructionIndex: number
}

export interface FlashRepayReserveLiquidityAccounts {
  userTransferAuthority: TransactionSigner
  lendingMarketAuthority: Address
  lendingMarket: Address
  reserve: Address
  reserveLiquidityMint: Address
  reserveDestinationLiquidity: Address
  userSourceLiquidity: Address
  reserveLiquidityFeeReceiver: Address
  referrerTokenState: Option<Address>
  referrerAccount: Option<Address>
  sysvarInfo: Address
  tokenProgram: Address
}

export const layout = borsh.struct<FlashRepayReserveLiquidityArgs>([
  borsh.u64("liquidityAmount"),
  borsh.u8("borrowInstructionIndex"),
])

export function flashRepayReserveLiquidity(
  args: FlashRepayReserveLiquidityArgs,
  accounts: FlashRepayReserveLiquidityAccounts,
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
    { address: accounts.reserveDestinationLiquidity, role: 1 },
    { address: accounts.userSourceLiquidity, role: 1 },
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
      borrowInstructionIndex: args.borrowInstructionIndex,
    },
    buffer
  )
  const data = Buffer.concat([DISCRIMINATOR, buffer]).slice(0, 8 + len)
  const ix: Instruction = { accounts: keys, programAddress, data }
  return ix
}
