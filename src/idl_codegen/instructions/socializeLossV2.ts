import { TransactionInstruction, PublicKey, AccountMeta } from "@solana/web3.js" // eslint-disable-line @typescript-eslint/no-unused-vars
import BN from "bn.js" // eslint-disable-line @typescript-eslint/no-unused-vars
import * as borsh from "@coral-xyz/borsh" // eslint-disable-line @typescript-eslint/no-unused-vars
import * as types from "../types" // eslint-disable-line @typescript-eslint/no-unused-vars
import { PROGRAM_ID } from "../programId"

export interface SocializeLossV2Args {
  liquidityAmount: BN
}

export interface SocializeLossV2Accounts {
  socializeLossAccounts: {
    riskCouncil: PublicKey
    obligation: PublicKey
    lendingMarket: PublicKey
    reserve: PublicKey
    instructionSysvarAccount: PublicKey
  }
  farmsAccounts: {
    obligationFarmUserState: PublicKey
    reserveFarmState: PublicKey
  }
  lendingMarketAuthority: PublicKey
  farmsProgram: PublicKey
}

export const layout = borsh.struct([borsh.u64("liquidityAmount")])

export function socializeLossV2(
  args: SocializeLossV2Args,
  accounts: SocializeLossV2Accounts,
  programId: PublicKey = PROGRAM_ID
) {
  const keys: Array<AccountMeta> = [
    {
      pubkey: accounts.socializeLossAccounts.riskCouncil,
      isSigner: true,
      isWritable: false,
    },
    {
      pubkey: accounts.socializeLossAccounts.obligation,
      isSigner: false,
      isWritable: true,
    },
    {
      pubkey: accounts.socializeLossAccounts.lendingMarket,
      isSigner: false,
      isWritable: false,
    },
    {
      pubkey: accounts.socializeLossAccounts.reserve,
      isSigner: false,
      isWritable: true,
    },
    {
      pubkey: accounts.socializeLossAccounts.instructionSysvarAccount,
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
    {
      pubkey: accounts.lendingMarketAuthority,
      isSigner: false,
      isWritable: false,
    },
    { pubkey: accounts.farmsProgram, isSigner: false, isWritable: false },
  ]
  const identifier = Buffer.from([238, 95, 98, 220, 187, 40, 204, 154])
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
