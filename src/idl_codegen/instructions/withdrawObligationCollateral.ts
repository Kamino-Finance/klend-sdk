import { TransactionInstruction, PublicKey, AccountMeta } from "@solana/web3.js" // eslint-disable-line @typescript-eslint/no-unused-vars
import BN from "bn.js" // eslint-disable-line @typescript-eslint/no-unused-vars
import * as borsh from "@coral-xyz/borsh" // eslint-disable-line @typescript-eslint/no-unused-vars
import * as types from "../types" // eslint-disable-line @typescript-eslint/no-unused-vars
import { PROGRAM_ID } from "../programId"

export interface WithdrawObligationCollateralArgs {
  collateralAmount: BN
}

export interface WithdrawObligationCollateralAccounts {
  owner: PublicKey
  obligation: PublicKey
  lendingMarket: PublicKey
  lendingMarketAuthority: PublicKey
  withdrawReserve: PublicKey
  reserveSourceCollateral: PublicKey
  userDestinationCollateral: PublicKey
  tokenProgram: PublicKey
  instructionSysvarAccount: PublicKey
}

export const layout = borsh.struct([borsh.u64("collateralAmount")])

export function withdrawObligationCollateral(
  args: WithdrawObligationCollateralArgs,
  accounts: WithdrawObligationCollateralAccounts,
  programId: PublicKey = PROGRAM_ID
) {
  const keys: Array<AccountMeta> = [
    { pubkey: accounts.owner, isSigner: true, isWritable: false },
    { pubkey: accounts.obligation, isSigner: false, isWritable: true },
    { pubkey: accounts.lendingMarket, isSigner: false, isWritable: false },
    {
      pubkey: accounts.lendingMarketAuthority,
      isSigner: false,
      isWritable: false,
    },
    { pubkey: accounts.withdrawReserve, isSigner: false, isWritable: true },
    {
      pubkey: accounts.reserveSourceCollateral,
      isSigner: false,
      isWritable: true,
    },
    {
      pubkey: accounts.userDestinationCollateral,
      isSigner: false,
      isWritable: true,
    },
    { pubkey: accounts.tokenProgram, isSigner: false, isWritable: false },
    {
      pubkey: accounts.instructionSysvarAccount,
      isSigner: false,
      isWritable: false,
    },
  ]
  const identifier = Buffer.from([37, 116, 205, 103, 243, 192, 92, 198])
  const buffer = Buffer.alloc(1000)
  const len = layout.encode(
    {
      collateralAmount: args.collateralAmount,
    },
    buffer
  )
  const data = Buffer.concat([identifier, buffer]).slice(0, 8 + len)
  const ix = new TransactionInstruction({ keys, programId, data })
  return ix
}
