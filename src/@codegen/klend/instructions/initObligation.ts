/* eslint-disable @typescript-eslint/no-unused-vars */
import {
  Address,
  isSome,
  IAccountMeta,
  IAccountSignerMeta,
  IInstruction,
  Option,
  TransactionSigner,
} from "@solana/kit"
/* eslint-enable @typescript-eslint/no-unused-vars */
import BN from "bn.js" // eslint-disable-line @typescript-eslint/no-unused-vars
import * as borsh from "@coral-xyz/borsh" // eslint-disable-line @typescript-eslint/no-unused-vars
import { borshAddress } from "../utils" // eslint-disable-line @typescript-eslint/no-unused-vars
import * as types from "../types" // eslint-disable-line @typescript-eslint/no-unused-vars
import { PROGRAM_ID } from "../programId"

export interface InitObligationArgs {
  args: types.InitObligationArgsFields
}

export interface InitObligationAccounts {
  obligationOwner: TransactionSigner
  feePayer: TransactionSigner
  obligation: Address
  lendingMarket: Address
  seed1Account: Address
  seed2Account: Address
  ownerUserMetadata: Address
  rent: Address
  systemProgram: Address
}

export const layout = borsh.struct([types.InitObligationArgs.layout("args")])

export function initObligation(
  args: InitObligationArgs,
  accounts: InitObligationAccounts,
  programAddress: Address = PROGRAM_ID
) {
  const keys: Array<IAccountMeta | IAccountSignerMeta> = [
    {
      address: accounts.obligationOwner.address,
      role: 2,
      signer: accounts.obligationOwner,
    },
    { address: accounts.feePayer.address, role: 3, signer: accounts.feePayer },
    { address: accounts.obligation, role: 1 },
    { address: accounts.lendingMarket, role: 0 },
    { address: accounts.seed1Account, role: 0 },
    { address: accounts.seed2Account, role: 0 },
    { address: accounts.ownerUserMetadata, role: 0 },
    { address: accounts.rent, role: 0 },
    { address: accounts.systemProgram, role: 0 },
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
  const ix: IInstruction = { accounts: keys, programAddress, data }
  return ix
}
