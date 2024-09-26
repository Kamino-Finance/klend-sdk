import { TransactionInstruction, PublicKey, AccountMeta } from "@solana/web3.js" // eslint-disable-line @typescript-eslint/no-unused-vars
import BN from "bn.js" // eslint-disable-line @typescript-eslint/no-unused-vars
import * as borsh from "@coral-xyz/borsh" // eslint-disable-line @typescript-eslint/no-unused-vars
import * as types from "../types" // eslint-disable-line @typescript-eslint/no-unused-vars
import { PROGRAM_ID } from "../programId"

export interface InitFarmsForReserveArgs {
  mode: number
}

export interface InitFarmsForReserveAccounts {
  lendingMarketOwner: PublicKey
  lendingMarket: PublicKey
  lendingMarketAuthority: PublicKey
  reserve: PublicKey
  farmsProgram: PublicKey
  farmsGlobalConfig: PublicKey
  farmState: PublicKey
  farmsVaultAuthority: PublicKey
  rent: PublicKey
  systemProgram: PublicKey
}

export const layout = borsh.struct([borsh.u8("mode")])

export function initFarmsForReserve(
  args: InitFarmsForReserveArgs,
  accounts: InitFarmsForReserveAccounts,
  programId: PublicKey = PROGRAM_ID
) {
  const keys: Array<AccountMeta> = [
    { pubkey: accounts.lendingMarketOwner, isSigner: true, isWritable: true },
    { pubkey: accounts.lendingMarket, isSigner: false, isWritable: false },
    {
      pubkey: accounts.lendingMarketAuthority,
      isSigner: false,
      isWritable: true,
    },
    { pubkey: accounts.reserve, isSigner: false, isWritable: true },
    { pubkey: accounts.farmsProgram, isSigner: false, isWritable: false },
    { pubkey: accounts.farmsGlobalConfig, isSigner: false, isWritable: false },
    { pubkey: accounts.farmState, isSigner: false, isWritable: true },
    {
      pubkey: accounts.farmsVaultAuthority,
      isSigner: false,
      isWritable: false,
    },
    { pubkey: accounts.rent, isSigner: false, isWritable: false },
    { pubkey: accounts.systemProgram, isSigner: false, isWritable: false },
  ]
  const identifier = Buffer.from([218, 6, 62, 233, 1, 33, 232, 82])
  const buffer = Buffer.alloc(1000)
  const len = layout.encode(
    {
      mode: args.mode,
    },
    buffer
  )
  const data = Buffer.concat([identifier, buffer]).slice(0, 8 + len)
  const ix = new TransactionInstruction({ keys, programId, data })
  return ix
}
