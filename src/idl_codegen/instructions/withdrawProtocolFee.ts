import { TransactionInstruction, PublicKey, AccountMeta } from "@solana/web3.js" // eslint-disable-line @typescript-eslint/no-unused-vars
import BN from "bn.js" // eslint-disable-line @typescript-eslint/no-unused-vars
import * as borsh from "@coral-xyz/borsh" // eslint-disable-line @typescript-eslint/no-unused-vars
import * as types from "../types" // eslint-disable-line @typescript-eslint/no-unused-vars
import { PROGRAM_ID } from "../programId"

export interface WithdrawProtocolFeeArgs {
  amount: BN
}

export interface WithdrawProtocolFeeAccounts {
  lendingMarketOwner: PublicKey
  lendingMarket: PublicKey
  reserve: PublicKey
  reserveLiquidityMint: PublicKey
  lendingMarketAuthority: PublicKey
  feeVault: PublicKey
  lendingMarketOwnerAta: PublicKey
  tokenProgram: PublicKey
}

export const layout = borsh.struct([borsh.u64("amount")])

export function withdrawProtocolFee(
  args: WithdrawProtocolFeeArgs,
  accounts: WithdrawProtocolFeeAccounts,
  programId: PublicKey = PROGRAM_ID
) {
  const keys: Array<AccountMeta> = [
    { pubkey: accounts.lendingMarketOwner, isSigner: true, isWritable: false },
    { pubkey: accounts.lendingMarket, isSigner: false, isWritable: false },
    { pubkey: accounts.reserve, isSigner: false, isWritable: false },
    {
      pubkey: accounts.reserveLiquidityMint,
      isSigner: false,
      isWritable: true,
    },
    {
      pubkey: accounts.lendingMarketAuthority,
      isSigner: false,
      isWritable: false,
    },
    { pubkey: accounts.feeVault, isSigner: false, isWritable: true },
    {
      pubkey: accounts.lendingMarketOwnerAta,
      isSigner: false,
      isWritable: true,
    },
    { pubkey: accounts.tokenProgram, isSigner: false, isWritable: false },
  ]
  const identifier = Buffer.from([158, 201, 158, 189, 33, 93, 162, 103])
  const buffer = Buffer.alloc(1000)
  const len = layout.encode(
    {
      amount: args.amount,
    },
    buffer
  )
  const data = Buffer.concat([identifier, buffer]).slice(0, 8 + len)
  const ix = new TransactionInstruction({ keys, programId, data })
  return ix
}
