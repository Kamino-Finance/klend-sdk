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

export interface VrfCloseActionArgs {
  params: types.VrfCloseParamsFields
}

export interface VrfCloseActionAccounts {
  authority: TransactionSigner
  vrf: Address
  permission: Address
  oracleQueue: Address
  queueAuthority: Address
  programState: Address
  escrow: Address
  solDest: Address
  escrowDest: Address
  tokenProgram: Address
}

export const layout = borsh.struct([types.VrfCloseParams.layout("params")])

export function vrfCloseAction(
  args: VrfCloseActionArgs,
  accounts: VrfCloseActionAccounts,
  programAddress: Address = PROGRAM_ID
) {
  const keys: Array<IAccountMeta | IAccountSignerMeta> = [
    {
      address: accounts.authority.address,
      role: 2,
      signer: accounts.authority,
    },
    { address: accounts.vrf, role: 1 },
    { address: accounts.permission, role: 1 },
    { address: accounts.oracleQueue, role: 0 },
    { address: accounts.queueAuthority, role: 0 },
    { address: accounts.programState, role: 0 },
    { address: accounts.escrow, role: 1 },
    { address: accounts.solDest, role: 0 },
    { address: accounts.escrowDest, role: 1 },
    { address: accounts.tokenProgram, role: 0 },
  ]
  const identifier = Buffer.from([97, 172, 124, 16, 175, 10, 246, 147])
  const buffer = Buffer.alloc(1000)
  const len = layout.encode(
    {
      params: types.VrfCloseParams.toEncodable(args.params),
    },
    buffer
  )
  const data = Buffer.concat([identifier, buffer]).slice(0, 8 + len)
  const ix: IInstruction = { accounts: keys, programAddress, data }
  return ix
}
