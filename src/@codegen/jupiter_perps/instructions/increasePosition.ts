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

export interface IncreasePositionArgs {
  params: types.IncreasePositionParamsFields
}

export interface IncreasePositionAccounts {
  keeper: TransactionSigner
  perpetuals: Address
  pool: Address
  positionRequest: Address
  positionRequestAta: Address
  position: Address
  custody: Address
  custodyOracleAccount: Address
  collateralCustody: Address
  collateralCustodyOracleAccount: Address
  collateralCustodyTokenAccount: Address
  tokenProgram: Address
  eventAuthority: Address
  program: Address
}

export const layout = borsh.struct([
  types.IncreasePositionParams.layout("params"),
])

export function increasePosition(
  args: IncreasePositionArgs,
  accounts: IncreasePositionAccounts,
  programAddress: Address = PROGRAM_ID
) {
  const keys: Array<IAccountMeta | IAccountSignerMeta> = [
    { address: accounts.keeper.address, role: 2, signer: accounts.keeper },
    { address: accounts.perpetuals, role: 0 },
    { address: accounts.pool, role: 1 },
    { address: accounts.positionRequest, role: 1 },
    { address: accounts.positionRequestAta, role: 1 },
    { address: accounts.position, role: 1 },
    { address: accounts.custody, role: 1 },
    { address: accounts.custodyOracleAccount, role: 0 },
    { address: accounts.collateralCustody, role: 1 },
    { address: accounts.collateralCustodyOracleAccount, role: 0 },
    { address: accounts.collateralCustodyTokenAccount, role: 1 },
    { address: accounts.tokenProgram, role: 0 },
    { address: accounts.eventAuthority, role: 0 },
    { address: accounts.program, role: 0 },
  ]
  const identifier = Buffer.from([253, 234, 128, 104, 192, 188, 45, 91])
  const buffer = Buffer.alloc(1000)
  const len = layout.encode(
    {
      params: types.IncreasePositionParams.toEncodable(args.params),
    },
    buffer
  )
  const data = Buffer.concat([identifier, buffer]).slice(0, 8 + len)
  const ix: IInstruction = { accounts: keys, programAddress, data }
  return ix
}
