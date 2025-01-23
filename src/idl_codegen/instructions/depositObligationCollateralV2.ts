import { TransactionInstruction, PublicKey, AccountMeta } from "@solana/web3.js" // eslint-disable-line @typescript-eslint/no-unused-vars
import BN from "bn.js" // eslint-disable-line @typescript-eslint/no-unused-vars
import * as borsh from "@coral-xyz/borsh" // eslint-disable-line @typescript-eslint/no-unused-vars
import * as types from "../types" // eslint-disable-line @typescript-eslint/no-unused-vars
import { PROGRAM_ID } from "../programId"

export interface DepositObligationCollateralV2Args {
  collateralAmount: BN
}

export interface DepositObligationCollateralV2Accounts {
  depositAccounts: {
    owner: PublicKey
    obligation: PublicKey
    lendingMarket: PublicKey
    depositReserve: PublicKey
    reserveDestinationCollateral: PublicKey
    userSourceCollateral: PublicKey
    tokenProgram: PublicKey
    instructionSysvarAccount: PublicKey
  }
  lendingMarketAuthority: PublicKey
  farmsAccounts: {
    obligationFarmUserState: PublicKey
    reserveFarmState: PublicKey
  }
  farmsProgram: PublicKey
}

export const layout = borsh.struct([borsh.u64("collateralAmount")])

export function depositObligationCollateralV2(
  args: DepositObligationCollateralV2Args,
  accounts: DepositObligationCollateralV2Accounts,
  programId: PublicKey = PROGRAM_ID
) {
  const keys: Array<AccountMeta> = [
    {
      pubkey: accounts.depositAccounts.owner,
      isSigner: true,
      isWritable: false,
    },
    {
      pubkey: accounts.depositAccounts.obligation,
      isSigner: false,
      isWritable: true,
    },
    {
      pubkey: accounts.depositAccounts.lendingMarket,
      isSigner: false,
      isWritable: false,
    },
    {
      pubkey: accounts.depositAccounts.depositReserve,
      isSigner: false,
      isWritable: true,
    },
    {
      pubkey: accounts.depositAccounts.reserveDestinationCollateral,
      isSigner: false,
      isWritable: true,
    },
    {
      pubkey: accounts.depositAccounts.userSourceCollateral,
      isSigner: false,
      isWritable: true,
    },
    {
      pubkey: accounts.depositAccounts.tokenProgram,
      isSigner: false,
      isWritable: false,
    },
    {
      pubkey: accounts.depositAccounts.instructionSysvarAccount,
      isSigner: false,
      isWritable: false,
    },
    {
      pubkey: accounts.lendingMarketAuthority,
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
  const identifier = Buffer.from([137, 145, 151, 94, 167, 113, 4, 145])
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
