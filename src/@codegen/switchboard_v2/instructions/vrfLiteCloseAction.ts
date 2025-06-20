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

export interface VrfLiteCloseActionArgs {
  params: types.VrfLiteCloseParamsFields
}

export interface VrfLiteCloseActionAccounts {
  authority: TransactionSigner
  vrfLite: Address
  permission: Address
  queue: Address
  queueAuthority: Address
  programState: Address
  escrow: Address
  solDest: Address
  escrowDest: Address
  tokenProgram: Address
}

export const layout = borsh.struct([types.VrfLiteCloseParams.layout("params")])

export function vrfLiteCloseAction(
  args: VrfLiteCloseActionArgs,
  accounts: VrfLiteCloseActionAccounts,
  programAddress: Address = PROGRAM_ID
) {
  const keys: Array<IAccountMeta | IAccountSignerMeta> = [
    {
      address: accounts.authority.address,
      role: 2,
      signer: accounts.authority,
    },
    { address: accounts.vrfLite, role: 1 },
    { address: accounts.permission, role: 1 },
    { address: accounts.queue, role: 0 },
    { address: accounts.queueAuthority, role: 0 },
    { address: accounts.programState, role: 0 },
    { address: accounts.escrow, role: 1 },
    { address: accounts.solDest, role: 0 },
    { address: accounts.escrowDest, role: 1 },
    { address: accounts.tokenProgram, role: 0 },
  ]
  const identifier = Buffer.from([200, 82, 160, 32, 59, 80, 50, 137])
  const buffer = Buffer.alloc(1000)
  const len = layout.encode(
    {
      params: types.VrfLiteCloseParams.toEncodable(args.params),
    },
    buffer
  )
  const data = Buffer.concat([identifier, buffer]).slice(0, 8 + len)
  const ix: IInstruction = { accounts: keys, programAddress, data }
  return ix
}
