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

export interface SwapExactOutArgs {
  params: types.SwapExactOutParamsFields
}

export interface SwapExactOutAccounts {
  owner: TransactionSigner
  fundingAccount: Address
  receivingAccount: Address
  transferAuthority: Address
  perpetuals: Address
  pool: Address
  receivingCustody: Address
  receivingCustodyOracleAccount: Address
  receivingCustodyTokenAccount: Address
  dispensingCustody: Address
  dispensingCustodyOracleAccount: Address
  dispensingCustodyTokenAccount: Address
  tokenProgram: Address
  eventAuthority: Address
  program: Address
}

export const layout = borsh.struct([types.SwapExactOutParams.layout("params")])

export function swapExactOut(
  args: SwapExactOutArgs,
  accounts: SwapExactOutAccounts,
  programAddress: Address = PROGRAM_ID
) {
  const keys: Array<IAccountMeta | IAccountSignerMeta> = [
    { address: accounts.owner.address, role: 3, signer: accounts.owner },
    { address: accounts.fundingAccount, role: 1 },
    { address: accounts.receivingAccount, role: 1 },
    { address: accounts.transferAuthority, role: 0 },
    { address: accounts.perpetuals, role: 0 },
    { address: accounts.pool, role: 1 },
    { address: accounts.receivingCustody, role: 1 },
    { address: accounts.receivingCustodyOracleAccount, role: 0 },
    { address: accounts.receivingCustodyTokenAccount, role: 1 },
    { address: accounts.dispensingCustody, role: 1 },
    { address: accounts.dispensingCustodyOracleAccount, role: 0 },
    { address: accounts.dispensingCustodyTokenAccount, role: 1 },
    { address: accounts.tokenProgram, role: 0 },
    { address: accounts.eventAuthority, role: 0 },
    { address: accounts.program, role: 0 },
  ]
  const identifier = Buffer.from([250, 73, 101, 33, 38, 207, 75, 184])
  const buffer = Buffer.alloc(1000)
  const len = layout.encode(
    {
      params: types.SwapExactOutParams.toEncodable(args.params),
    },
    buffer
  )
  const data = Buffer.concat([identifier, buffer]).slice(0, 8 + len)
  const ix: IInstruction = { accounts: keys, programAddress, data }
  return ix
}
