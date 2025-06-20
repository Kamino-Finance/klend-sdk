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

export interface IncreasePositionPreSwapArgs {
  params: types.IncreasePositionPreSwapParamsFields
}

export interface IncreasePositionPreSwapAccounts {
  keeper: TransactionSigner
  keeperAta: Address
  positionRequest: Address
  positionRequestAta: Address
  position: Address
  collateralCustody: Address
  collateralCustodyTokenAccount: Address
  instruction: Address
  tokenProgram: Address
  eventAuthority: Address
  program: Address
}

export const layout = borsh.struct([
  types.IncreasePositionPreSwapParams.layout("params"),
])

export function increasePositionPreSwap(
  args: IncreasePositionPreSwapArgs,
  accounts: IncreasePositionPreSwapAccounts,
  programAddress: Address = PROGRAM_ID
) {
  const keys: Array<IAccountMeta | IAccountSignerMeta> = [
    { address: accounts.keeper.address, role: 2, signer: accounts.keeper },
    { address: accounts.keeperAta, role: 1 },
    { address: accounts.positionRequest, role: 1 },
    { address: accounts.positionRequestAta, role: 1 },
    { address: accounts.position, role: 0 },
    { address: accounts.collateralCustody, role: 0 },
    { address: accounts.collateralCustodyTokenAccount, role: 0 },
    { address: accounts.instruction, role: 0 },
    { address: accounts.tokenProgram, role: 0 },
    { address: accounts.eventAuthority, role: 0 },
    { address: accounts.program, role: 0 },
  ]
  const identifier = Buffer.from([26, 136, 225, 217, 22, 21, 83, 20])
  const buffer = Buffer.alloc(1000)
  const len = layout.encode(
    {
      params: types.IncreasePositionPreSwapParams.toEncodable(args.params),
    },
    buffer
  )
  const data = Buffer.concat([identifier, buffer]).slice(0, 8 + len)
  const ix: IInstruction = { accounts: keys, programAddress, data }
  return ix
}
