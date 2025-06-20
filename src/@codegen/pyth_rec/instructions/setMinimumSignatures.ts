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

export interface SetMinimumSignaturesArgs {
  minimumSignatures: number
}

export interface SetMinimumSignaturesAccounts {
  payer: TransactionSigner
  config: Address
}

export const layout = borsh.struct([borsh.u8("minimumSignatures")])

export function setMinimumSignatures(
  args: SetMinimumSignaturesArgs,
  accounts: SetMinimumSignaturesAccounts,
  programAddress: Address = PROGRAM_ID
) {
  const keys: Array<IAccountMeta | IAccountSignerMeta> = [
    { address: accounts.payer.address, role: 2, signer: accounts.payer },
    { address: accounts.config, role: 1 },
  ]
  const identifier = Buffer.from([5, 210, 206, 124, 43, 68, 104, 149])
  const buffer = Buffer.alloc(1000)
  const len = layout.encode(
    {
      minimumSignatures: args.minimumSignatures,
    },
    buffer
  )
  const data = Buffer.concat([identifier, buffer]).slice(0, 8 + len)
  const ix: IInstruction = { accounts: keys, programAddress, data }
  return ix
}
