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

export interface VrfPoolRemoveArgs {
  params: types.VrfPoolRemoveParamsFields
}

export interface VrfPoolRemoveAccounts {
  authority: TransactionSigner
  vrfPool: Address
  queue: Address
}

export const layout = borsh.struct([types.VrfPoolRemoveParams.layout("params")])

export function vrfPoolRemove(
  args: VrfPoolRemoveArgs,
  accounts: VrfPoolRemoveAccounts,
  programAddress: Address = PROGRAM_ID
) {
  const keys: Array<IAccountMeta | IAccountSignerMeta> = [
    {
      address: accounts.authority.address,
      role: 2,
      signer: accounts.authority,
    },
    { address: accounts.vrfPool, role: 1 },
    { address: accounts.queue, role: 0 },
  ]
  const identifier = Buffer.from([15, 73, 86, 124, 75, 183, 20, 199])
  const buffer = Buffer.alloc(1000)
  const len = layout.encode(
    {
      params: types.VrfPoolRemoveParams.toEncodable(args.params),
    },
    buffer
  )
  const data = Buffer.concat([identifier, buffer]).slice(0, 8 + len)
  const ix: IInstruction = { accounts: keys, programAddress, data }
  return ix
}
