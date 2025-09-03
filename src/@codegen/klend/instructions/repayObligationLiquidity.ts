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

export const DISCRIMINATOR = Buffer.from([145, 178, 13, 225, 76, 240, 147, 72])

export interface RepayObligationLiquidityArgs {
  liquidityAmount: BN
}

export interface RepayObligationLiquidityAccounts {
  owner: TransactionSigner
  obligation: Address
  lendingMarket: Address
  repayReserve: Address
  reserveLiquidityMint: Address
  reserveDestinationLiquidity: Address
  userSourceLiquidity: Address
  tokenProgram: Address
  instructionSysvarAccount: Address
}

export const layout = borsh.struct<RepayObligationLiquidityArgs>([
  borsh.u64("liquidityAmount"),
])

export function repayObligationLiquidity(
  args: RepayObligationLiquidityArgs,
  accounts: RepayObligationLiquidityAccounts,
  remainingAccounts: Array<AccountMeta | AccountSignerMeta> = [],
  programAddress: Address = PROGRAM_ID
) {
  const keys: Array<AccountMeta | AccountSignerMeta> = [
    { address: accounts.owner.address, role: 2, signer: accounts.owner },
    { address: accounts.obligation, role: 1 },
    { address: accounts.lendingMarket, role: 0 },
    { address: accounts.repayReserve, role: 1 },
    { address: accounts.reserveLiquidityMint, role: 0 },
    { address: accounts.reserveDestinationLiquidity, role: 1 },
    { address: accounts.userSourceLiquidity, role: 1 },
    { address: accounts.tokenProgram, role: 0 },
    { address: accounts.instructionSysvarAccount, role: 0 },
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
