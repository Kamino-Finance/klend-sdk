import { TransactionInstruction, PublicKey, AccountMeta } from "@solana/web3.js" // eslint-disable-line @typescript-eslint/no-unused-vars
import BN from "bn.js" // eslint-disable-line @typescript-eslint/no-unused-vars
import * as borsh from "@coral-xyz/borsh" // eslint-disable-line @typescript-eslint/no-unused-vars
import * as types from "../types" // eslint-disable-line @typescript-eslint/no-unused-vars
import { PROGRAM_ID } from "../programId"

export interface RepayObligationLiquidityArgs {
  liquidityAmount: BN
}

export interface RepayObligationLiquidityAccounts {
  owner: PublicKey
  obligation: PublicKey
  lendingMarket: PublicKey
  repayReserve: PublicKey
  reserveLiquidityMint: PublicKey
  reserveDestinationLiquidity: PublicKey
  userSourceLiquidity: PublicKey
  tokenProgram: PublicKey
  instructionSysvarAccount: PublicKey
}

export const layout = borsh.struct([borsh.u64("liquidityAmount")])

export function repayObligationLiquidity(
  args: RepayObligationLiquidityArgs,
  accounts: RepayObligationLiquidityAccounts,
  programId: PublicKey = PROGRAM_ID
) {
  const keys: Array<AccountMeta> = [
    { pubkey: accounts.owner, isSigner: true, isWritable: false },
    { pubkey: accounts.obligation, isSigner: false, isWritable: true },
    { pubkey: accounts.lendingMarket, isSigner: false, isWritable: false },
    { pubkey: accounts.repayReserve, isSigner: false, isWritable: true },
    {
      pubkey: accounts.reserveLiquidityMint,
      isSigner: false,
      isWritable: true,
    },
    {
      pubkey: accounts.reserveDestinationLiquidity,
      isSigner: false,
      isWritable: true,
    },
    { pubkey: accounts.userSourceLiquidity, isSigner: false, isWritable: true },
    { pubkey: accounts.tokenProgram, isSigner: false, isWritable: false },
    {
      pubkey: accounts.instructionSysvarAccount,
      isSigner: false,
      isWritable: false,
    },
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
  const ix = new TransactionInstruction({ keys, programId, data })
  return ix
}
