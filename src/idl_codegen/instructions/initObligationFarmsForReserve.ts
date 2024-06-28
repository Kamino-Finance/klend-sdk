import { TransactionInstruction, PublicKey, AccountMeta } from "@solana/web3.js" // eslint-disable-line @typescript-eslint/no-unused-vars
import BN from "bn.js" // eslint-disable-line @typescript-eslint/no-unused-vars
import * as borsh from "@coral-xyz/borsh" // eslint-disable-line @typescript-eslint/no-unused-vars
import * as types from "../types" // eslint-disable-line @typescript-eslint/no-unused-vars
import { PROGRAM_ID } from "../programId"

export interface InitObligationFarmsForReserveArgs {
  mode: number
}

export interface InitObligationFarmsForReserveAccounts {
  payer: PublicKey
  owner: PublicKey
  obligation: PublicKey
  lendingMarketAuthority: PublicKey
  reserve: PublicKey
  reserveFarmState: PublicKey
  obligationFarm: PublicKey
  lendingMarket: PublicKey
  farmsProgram: PublicKey
  rent: PublicKey
  systemProgram: PublicKey
}

export const layout = borsh.struct([borsh.u8("mode")])

export function initObligationFarmsForReserve(
  args: InitObligationFarmsForReserveArgs,
  accounts: InitObligationFarmsForReserveAccounts,
  programId: PublicKey = PROGRAM_ID
) {
  const keys: Array<AccountMeta> = [
    { pubkey: accounts.payer, isSigner: true, isWritable: true },
    { pubkey: accounts.owner, isSigner: false, isWritable: false },
    { pubkey: accounts.obligation, isSigner: false, isWritable: true },
    {
      pubkey: accounts.lendingMarketAuthority,
      isSigner: false,
      isWritable: true,
    },
    { pubkey: accounts.reserve, isSigner: false, isWritable: true },
    { pubkey: accounts.reserveFarmState, isSigner: false, isWritable: true },
    { pubkey: accounts.obligationFarm, isSigner: false, isWritable: true },
    { pubkey: accounts.lendingMarket, isSigner: false, isWritable: false },
    { pubkey: accounts.farmsProgram, isSigner: false, isWritable: false },
    { pubkey: accounts.rent, isSigner: false, isWritable: false },
    { pubkey: accounts.systemProgram, isSigner: false, isWritable: false },
  ]
  const identifier = Buffer.from([136, 63, 15, 186, 211, 152, 168, 164])
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
