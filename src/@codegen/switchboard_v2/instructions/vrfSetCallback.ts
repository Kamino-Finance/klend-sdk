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

export interface VrfSetCallbackArgs {
  params: types.VrfSetCallbackParamsFields
}

export interface VrfSetCallbackAccounts {
  vrf: Address
  authority: TransactionSigner
}

export const layout = borsh.struct([
  types.VrfSetCallbackParams.layout("params"),
])

export function vrfSetCallback(
  args: VrfSetCallbackArgs,
  accounts: VrfSetCallbackAccounts,
  programAddress: Address = PROGRAM_ID
) {
  const keys: Array<IAccountMeta | IAccountSignerMeta> = [
    { address: accounts.vrf, role: 1 },
    {
      address: accounts.authority.address,
      role: 2,
      signer: accounts.authority,
    },
  ]
  const identifier = Buffer.from([121, 167, 168, 191, 180, 247, 251, 78])
  const buffer = Buffer.alloc(1000)
  const len = layout.encode(
    {
      params: types.VrfSetCallbackParams.toEncodable(args.params),
    },
    buffer
  )
  const data = Buffer.concat([identifier, buffer]).slice(0, 8 + len)
  const ix: IInstruction = { accounts: keys, programAddress, data }
  return ix
}
