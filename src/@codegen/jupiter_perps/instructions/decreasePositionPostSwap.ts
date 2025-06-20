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

export interface DecreasePositionPostSwapArgs {
  params: types.DecreasePositionPostSwapParamsFields
}

export interface DecreasePositionPostSwapAccounts {
  keeper: TransactionSigner
  positionRequest: Address
  positionRequestAta: Address
  eventAuthority: Address
  program: Address
}

export const layout = borsh.struct([
  types.DecreasePositionPostSwapParams.layout("params"),
])

export function decreasePositionPostSwap(
  args: DecreasePositionPostSwapArgs,
  accounts: DecreasePositionPostSwapAccounts,
  programAddress: Address = PROGRAM_ID
) {
  const keys: Array<IAccountMeta | IAccountSignerMeta> = [
    { address: accounts.keeper.address, role: 2, signer: accounts.keeper },
    { address: accounts.positionRequest, role: 0 },
    { address: accounts.positionRequestAta, role: 0 },
    { address: accounts.eventAuthority, role: 0 },
    { address: accounts.program, role: 0 },
  ]
  const identifier = Buffer.from([75, 246, 208, 7, 203, 66, 106, 91])
  const buffer = Buffer.alloc(1000)
  const len = layout.encode(
    {
      params: types.DecreasePositionPostSwapParams.toEncodable(args.params),
    },
    buffer
  )
  const data = Buffer.concat([identifier, buffer]).slice(0, 8 + len)
  const ix: IInstruction = { accounts: keys, programAddress, data }
  return ix
}
