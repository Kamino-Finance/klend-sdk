import { TransactionInstruction, PublicKey, AccountMeta } from "@solana/web3.js" // eslint-disable-line @typescript-eslint/no-unused-vars
import BN from "bn.js" // eslint-disable-line @typescript-eslint/no-unused-vars
import * as borsh from "@coral-xyz/borsh" // eslint-disable-line @typescript-eslint/no-unused-vars
import * as types from "../types" // eslint-disable-line @typescript-eslint/no-unused-vars
import { PROGRAM_ID } from "../programId"

export interface InitObligationArgs {
  args: types.InitObligationArgsFields
}

export interface InitObligationAccounts {
  obligationOwner: PublicKey
  feePayer: PublicKey
  obligation: PublicKey
  lendingMarket: PublicKey
  seed1Account: PublicKey
  seed2Account: PublicKey
  ownerUserMetadata: PublicKey
  rent: PublicKey
  systemProgram: PublicKey
}

export const layout = borsh.struct([types.InitObligationArgs.layout("args")])

export function initObligation(
  args: InitObligationArgs,
  accounts: InitObligationAccounts,
  programId: PublicKey = PROGRAM_ID
) {
  const keys: Array<AccountMeta> = [
    { pubkey: accounts.obligationOwner, isSigner: true, isWritable: false },
    { pubkey: accounts.feePayer, isSigner: true, isWritable: true },
    { pubkey: accounts.obligation, isSigner: false, isWritable: true },
    { pubkey: accounts.lendingMarket, isSigner: false, isWritable: false },
    { pubkey: accounts.seed1Account, isSigner: false, isWritable: false },
    { pubkey: accounts.seed2Account, isSigner: false, isWritable: false },
    { pubkey: accounts.ownerUserMetadata, isSigner: false, isWritable: false },
    { pubkey: accounts.rent, isSigner: false, isWritable: false },
    { pubkey: accounts.systemProgram, isSigner: false, isWritable: false },
  ]
  const identifier = Buffer.from([251, 10, 231, 76, 27, 11, 159, 96])
  const buffer = Buffer.alloc(1000)
  const len = layout.encode(
    {
      args: types.InitObligationArgs.toEncodable(args.args),
    },
    buffer
  )
  const data = Buffer.concat([identifier, buffer]).slice(0, 8 + len)
  const ix = new TransactionInstruction({ keys, programId, data })
  return ix
}
