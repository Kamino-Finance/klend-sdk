import { TransactionInstruction, PublicKey, AccountMeta } from "@solana/web3.js" // eslint-disable-line @typescript-eslint/no-unused-vars
import BN from "bn.js" // eslint-disable-line @typescript-eslint/no-unused-vars
import * as borsh from "@coral-xyz/borsh" // eslint-disable-line @typescript-eslint/no-unused-vars
import * as types from "../types" // eslint-disable-line @typescript-eslint/no-unused-vars
import { PROGRAM_ID } from "../programId"

export interface DepositObligationCollateralArgs {
  collateralAmount: BN
}

export interface DepositObligationCollateralAccounts {
  owner: PublicKey
  obligation: PublicKey
  lendingMarket: PublicKey
  depositReserve: PublicKey
  reserveDestinationCollateral: PublicKey
  userSourceCollateral: PublicKey
  tokenProgram: PublicKey
  instructionSysvarAccount: PublicKey
}

export const layout = borsh.struct([borsh.u64("collateralAmount")])

export function depositObligationCollateral(
  args: DepositObligationCollateralArgs,
  accounts: DepositObligationCollateralAccounts,
  programId: PublicKey = PROGRAM_ID
) {
  const keys: Array<AccountMeta> = [
    { pubkey: accounts.owner, isSigner: true, isWritable: false },
    { pubkey: accounts.obligation, isSigner: false, isWritable: true },
    { pubkey: accounts.lendingMarket, isSigner: false, isWritable: false },
    { pubkey: accounts.depositReserve, isSigner: false, isWritable: true },
    {
      pubkey: accounts.reserveDestinationCollateral,
      isSigner: false,
      isWritable: true,
    },
    {
      pubkey: accounts.userSourceCollateral,
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
  const identifier = Buffer.from([108, 209, 4, 72, 21, 22, 118, 133])
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
