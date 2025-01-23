import { TransactionInstruction, PublicKey, AccountMeta } from "@solana/web3.js" // eslint-disable-line @typescript-eslint/no-unused-vars
import BN from "bn.js" // eslint-disable-line @typescript-eslint/no-unused-vars
import * as borsh from "@coral-xyz/borsh" // eslint-disable-line @typescript-eslint/no-unused-vars
import * as types from "../types" // eslint-disable-line @typescript-eslint/no-unused-vars
import { PROGRAM_ID } from "../programId"

export interface WithdrawObligationCollateralV2Args {
  collateralAmount: BN
}

export interface WithdrawObligationCollateralV2Accounts {
  withdrawAccounts: {
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
  farmsAccounts: {
    obligationFarmUserState: PublicKey
    reserveFarmState: PublicKey
  }
  farmsProgram: PublicKey
}

export const layout = borsh.struct([borsh.u64("collateralAmount")])

export function withdrawObligationCollateralV2(
  args: WithdrawObligationCollateralV2Args,
  accounts: WithdrawObligationCollateralV2Accounts,
  programId: PublicKey = PROGRAM_ID
) {
  const keys: Array<AccountMeta> = [
    {
      pubkey: accounts.withdrawAccounts.owner,
      isSigner: true,
      isWritable: false,
    },
    {
      pubkey: accounts.withdrawAccounts.obligation,
      isSigner: false,
      isWritable: true,
    },
    {
      pubkey: accounts.withdrawAccounts.lendingMarket,
      isSigner: false,
      isWritable: false,
    },
    {
      pubkey: accounts.withdrawAccounts.lendingMarketAuthority,
      isSigner: false,
      isWritable: false,
    },
    {
      pubkey: accounts.withdrawAccounts.withdrawReserve,
      isSigner: false,
      isWritable: true,
    },
    {
      pubkey: accounts.withdrawAccounts.reserveSourceCollateral,
      isSigner: false,
      isWritable: true,
    },
    {
      pubkey: accounts.withdrawAccounts.userDestinationCollateral,
      isSigner: false,
      isWritable: true,
    },
    {
      pubkey: accounts.withdrawAccounts.tokenProgram,
      isSigner: false,
      isWritable: false,
    },
    {
      pubkey: accounts.withdrawAccounts.instructionSysvarAccount,
      isSigner: false,
      isWritable: false,
    },
    {
      pubkey: accounts.farmsAccounts.obligationFarmUserState,
      isSigner: false,
      isWritable: true,
    },
    {
      pubkey: accounts.farmsAccounts.reserveFarmState,
      isSigner: false,
      isWritable: true,
    },
    { pubkey: accounts.farmsProgram, isSigner: false, isWritable: false },
  ]
  const identifier = Buffer.from([202, 249, 117, 114, 231, 192, 47, 138])
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
