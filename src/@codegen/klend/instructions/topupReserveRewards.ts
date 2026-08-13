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

export const DISCRIMINATOR = Buffer.from([63, 255, 130, 211, 110, 216, 88, 173])

export interface TopupReserveRewardsArgs {
  amount: BN
}

export interface TopupReserveRewardsAccounts {
  signer: TransactionSigner
  lendingMarket: Address
  reserve: Address
  reserveLiquidityMint: Address
  reserveLiquiditySupply: Address
  sourceLiquidity: Address
  liquidityTokenProgram: Address
}

export const layout = borsh.struct<TopupReserveRewardsArgs>([
  borsh.u64("amount"),
])

export function topupReserveRewards(
  args: TopupReserveRewardsArgs,
  accounts: TopupReserveRewardsAccounts,
  remainingAccounts: Array<AccountMeta | AccountSignerMeta> = [],
  programAddress: Address = PROGRAM_ID
) {
  const keys: Array<AccountMeta | AccountSignerMeta> = [
    { address: accounts.signer.address, role: 2, signer: accounts.signer },
    { address: accounts.lendingMarket, role: 0 },
    { address: accounts.reserve, role: 1 },
    { address: accounts.reserveLiquidityMint, role: 0 },
    { address: accounts.reserveLiquiditySupply, role: 1 },
    { address: accounts.sourceLiquidity, role: 1 },
    { address: accounts.liquidityTokenProgram, role: 0 },
    ...remainingAccounts,
  ]
  const buffer = Buffer.alloc(1000)
  const len = layout.encode(
    {
      amount: args.amount,
    },
    buffer
  )
  const data = Buffer.concat([DISCRIMINATOR, buffer]).slice(0, 8 + len)
  const ix: Instruction = { accounts: keys, programAddress, data }
  return ix
}
