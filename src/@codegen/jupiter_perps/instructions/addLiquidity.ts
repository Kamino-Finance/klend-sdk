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

export interface AddLiquidityArgs {
  params: types.AddLiquidityParamsFields
}

export interface AddLiquidityAccounts {
  owner: TransactionSigner
  fundingAccount: Address
  lpTokenAccount: Address
  transferAuthority: Address
  perpetuals: Address
  pool: Address
  custody: Address
  custodyOracleAccount: Address
  custodyTokenAccount: Address
  lpTokenMint: Address
  tokenProgram: Address
  eventAuthority: Address
  program: Address
}

export const layout = borsh.struct([types.AddLiquidityParams.layout("params")])

export function addLiquidity(
  args: AddLiquidityArgs,
  accounts: AddLiquidityAccounts,
  programAddress: Address = PROGRAM_ID
) {
  const keys: Array<IAccountMeta | IAccountSignerMeta> = [
    { address: accounts.owner.address, role: 3, signer: accounts.owner },
    { address: accounts.fundingAccount, role: 1 },
    { address: accounts.lpTokenAccount, role: 1 },
    { address: accounts.transferAuthority, role: 0 },
    { address: accounts.perpetuals, role: 0 },
    { address: accounts.pool, role: 1 },
    { address: accounts.custody, role: 1 },
    { address: accounts.custodyOracleAccount, role: 0 },
    { address: accounts.custodyTokenAccount, role: 1 },
    { address: accounts.lpTokenMint, role: 1 },
    { address: accounts.tokenProgram, role: 0 },
    { address: accounts.eventAuthority, role: 0 },
    { address: accounts.program, role: 0 },
  ]
  const identifier = Buffer.from([181, 157, 89, 67, 143, 182, 52, 72])
  const buffer = Buffer.alloc(1000)
  const len = layout.encode(
    {
      params: types.AddLiquidityParams.toEncodable(args.params),
    },
    buffer
  )
  const data = Buffer.concat([identifier, buffer]).slice(0, 8 + len)
  const ix: IInstruction = { accounts: keys, programAddress, data }
  return ix
}
