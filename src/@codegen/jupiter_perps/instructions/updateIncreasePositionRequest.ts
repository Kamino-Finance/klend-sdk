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

export interface UpdateIncreasePositionRequestArgs {
  params: types.UpdateIncreasePositionRequestParamsFields
}

export interface UpdateIncreasePositionRequestAccounts {
  owner: TransactionSigner
  perpetuals: Address
  pool: Address
  position: Address
  positionRequest: Address
  custody: Address
  custodyOracleAccount: Address
}

export const layout = borsh.struct([
  types.UpdateIncreasePositionRequestParams.layout("params"),
])

export function updateIncreasePositionRequest(
  args: UpdateIncreasePositionRequestArgs,
  accounts: UpdateIncreasePositionRequestAccounts,
  programAddress: Address = PROGRAM_ID
) {
  const keys: Array<IAccountMeta | IAccountSignerMeta> = [
    { address: accounts.owner.address, role: 3, signer: accounts.owner },
    { address: accounts.perpetuals, role: 0 },
    { address: accounts.pool, role: 0 },
    { address: accounts.position, role: 0 },
    { address: accounts.positionRequest, role: 1 },
    { address: accounts.custody, role: 0 },
    { address: accounts.custodyOracleAccount, role: 0 },
  ]
  const identifier = Buffer.from([100, 110, 83, 102, 86, 7, 105, 157])
  const buffer = Buffer.alloc(1000)
  const len = layout.encode(
    {
      params: types.UpdateIncreasePositionRequestParams.toEncodable(
        args.params
      ),
    },
    buffer
  )
  const data = Buffer.concat([identifier, buffer]).slice(0, 8 + len)
  const ix: IInstruction = { accounts: keys, programAddress, data }
  return ix
}
