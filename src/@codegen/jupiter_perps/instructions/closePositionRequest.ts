/* eslint-disable @typescript-eslint/no-unused-vars */
import {
  Address,
  isSome,
  AccountMeta,
  AccountSignerMeta,
  Instruction,
  Option,
  TransactionSigner,
} from "@solana/kit"
/* eslint-enable @typescript-eslint/no-unused-vars */
import BN from "bn.js" // eslint-disable-line @typescript-eslint/no-unused-vars
import * as borsh from "@coral-xyz/borsh" // eslint-disable-line @typescript-eslint/no-unused-vars
import { borshAddress } from "../utils" // eslint-disable-line @typescript-eslint/no-unused-vars
import * as types from "../types" // eslint-disable-line @typescript-eslint/no-unused-vars
import { PROGRAM_ID } from "../programId"

export const DISCRIMINATOR = Buffer.from([40, 105, 217, 188, 220, 45, 109, 110])

export interface ClosePositionRequestArgs {
  params: types.ClosePositionRequestParamsFields
}

export interface ClosePositionRequestAccounts {
  keeper: Option<TransactionSigner>
  owner: Address
  ownerAta: Option<Address>
  pool: Address
  positionRequest: Address
  positionRequestAta: Address
  position: Address
  tokenProgram: Address
  eventAuthority: Address
  program: Address
}

export const layout = borsh.struct<ClosePositionRequestArgs>([
  types.ClosePositionRequestParams.layout("params"),
])

export function closePositionRequest(
  args: ClosePositionRequestArgs,
  accounts: ClosePositionRequestAccounts,
  remainingAccounts: Array<AccountMeta | AccountSignerMeta> = [],
  programAddress: Address = PROGRAM_ID
) {
  const keys: Array<AccountMeta | AccountSignerMeta> = [
    isSome(accounts.keeper)
      ? {
          address: accounts.keeper.value.address,
          role: 2,
          signer: accounts.keeper.value,
        }
      : { address: programAddress, role: 0 },
    { address: accounts.owner, role: 1 },
    isSome(accounts.ownerAta)
      ? { address: accounts.ownerAta.value, role: 1 }
      : { address: programAddress, role: 0 },
    { address: accounts.pool, role: 1 },
    { address: accounts.positionRequest, role: 1 },
    { address: accounts.positionRequestAta, role: 1 },
    { address: accounts.position, role: 0 },
    { address: accounts.tokenProgram, role: 0 },
    { address: accounts.eventAuthority, role: 0 },
    { address: accounts.program, role: 0 },
    ...remainingAccounts,
  ]
  const buffer = Buffer.alloc(1000)
  const len = layout.encode(
    {
      params: types.ClosePositionRequestParams.toEncodable(args.params),
    },
    buffer
  )
  const data = Buffer.concat([DISCRIMINATOR, buffer]).slice(0, 8 + len)
  const ix: Instruction = { accounts: keys, programAddress, data }
  return ix
}
