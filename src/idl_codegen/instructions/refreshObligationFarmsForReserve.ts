import { TransactionInstruction, PublicKey, AccountMeta } from "@solana/web3.js" // eslint-disable-line @typescript-eslint/no-unused-vars
import BN from "bn.js" // eslint-disable-line @typescript-eslint/no-unused-vars
import * as borsh from "@coral-xyz/borsh" // eslint-disable-line @typescript-eslint/no-unused-vars
import * as types from "../types" // eslint-disable-line @typescript-eslint/no-unused-vars
import { PROGRAM_ID } from "../programId"

export interface RefreshObligationFarmsForReserveArgs {
  mode: number
}

export interface RefreshObligationFarmsForReserveAccounts {
  crank: PublicKey
  obligation: PublicKey
  lendingMarketAuthority: PublicKey
  reserve: PublicKey
  reserveFarmState: PublicKey
  obligationFarmUserState: PublicKey
  lendingMarket: PublicKey
  farmsProgram: PublicKey
  rent: PublicKey
  systemProgram: PublicKey
}

export const layout = borsh.struct([borsh.u8("mode")])

export function refreshObligationFarmsForReserve(
  args: RefreshObligationFarmsForReserveArgs,
  accounts: RefreshObligationFarmsForReserveAccounts,
  programId: PublicKey = PROGRAM_ID
) {
  const keys: Array<AccountMeta> = [
    { pubkey: accounts.crank, isSigner: true, isWritable: true },
    { pubkey: accounts.obligation, isSigner: false, isWritable: false },
    {
      pubkey: accounts.lendingMarketAuthority,
      isSigner: false,
      isWritable: true,
    },
    { pubkey: accounts.reserve, isSigner: false, isWritable: false },
    { pubkey: accounts.reserveFarmState, isSigner: false, isWritable: true },
    {
      pubkey: accounts.obligationFarmUserState,
      isSigner: false,
      isWritable: true,
    },
    { pubkey: accounts.lendingMarket, isSigner: false, isWritable: false },
    { pubkey: accounts.farmsProgram, isSigner: false, isWritable: false },
    { pubkey: accounts.rent, isSigner: false, isWritable: false },
    { pubkey: accounts.systemProgram, isSigner: false, isWritable: false },
  ]
  const identifier = Buffer.from([140, 144, 253, 21, 10, 74, 248, 3])
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
