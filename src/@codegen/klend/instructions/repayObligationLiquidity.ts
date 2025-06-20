/* eslint-disable @typescript-eslint/no-unused-vars */
import {
  Address,
  isSome,
  IAccountMeta,
  IAccountSignerMeta,
  IInstruction,
  Option,
  TransactionSigner,
} from "@solana/kit"
/* eslint-enable @typescript-eslint/no-unused-vars */
import BN from "bn.js" // eslint-disable-line @typescript-eslint/no-unused-vars
import * as borsh from "@coral-xyz/borsh" // eslint-disable-line @typescript-eslint/no-unused-vars
import { borshAddress } from "../utils" // eslint-disable-line @typescript-eslint/no-unused-vars
import * as types from "../types" // eslint-disable-line @typescript-eslint/no-unused-vars
import { PROGRAM_ID } from "../programId"

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

export const layout = borsh.struct([borsh.u64("liquidityAmount")])

export function repayObligationLiquidity(
  args: RepayObligationLiquidityArgs,
  accounts: RepayObligationLiquidityAccounts,
  programAddress: Address = PROGRAM_ID
) {
  const keys: Array<IAccountMeta | IAccountSignerMeta> = [
    { address: accounts.owner.address, role: 2, signer: accounts.owner },
    { address: accounts.obligation, role: 1 },
    { address: accounts.lendingMarket, role: 0 },
    { address: accounts.repayReserve, role: 1 },
    { address: accounts.reserveLiquidityMint, role: 0 },
    { address: accounts.reserveDestinationLiquidity, role: 1 },
    { address: accounts.userSourceLiquidity, role: 1 },
    { address: accounts.tokenProgram, role: 0 },
    { address: accounts.instructionSysvarAccount, role: 0 },
  ]
  const identifier = Buffer.from([145, 178, 13, 225, 76, 240, 147, 72])
  const buffer = Buffer.alloc(1000)
  const len = layout.encode(
    {
      liquidityAmount: args.liquidityAmount,
    },
    buffer
  )
  const data = Buffer.concat([identifier, buffer]).slice(0, 8 + len)
  const ix: IInstruction = { accounts: keys, programAddress, data }
  return ix
}
