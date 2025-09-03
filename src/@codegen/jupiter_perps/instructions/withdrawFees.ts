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

export const DISCRIMINATOR = Buffer.from([
  198, 212, 171, 109, 144, 215, 174, 89,
])

export interface WithdrawFeesArgs {
  params: types.WithdrawFeesParamsFields
}

export interface WithdrawFeesAccounts {
  keeper: TransactionSigner
  transferAuthority: Address
  perpetuals: Address
  pool: Address
  custody: Address
  custodyTokenAccount: Address
  custodyOracleAccount: Address
  receivingTokenAccount: Address
  tokenProgram: Address
}

export const layout = borsh.struct<WithdrawFeesArgs>([
  types.WithdrawFeesParams.layout("params"),
])

export function withdrawFees(
  args: WithdrawFeesArgs,
  accounts: WithdrawFeesAccounts,
  remainingAccounts: Array<AccountMeta | AccountSignerMeta> = [],
  programAddress: Address = PROGRAM_ID
) {
  const keys: Array<AccountMeta | AccountSignerMeta> = [
    { address: accounts.keeper.address, role: 2, signer: accounts.keeper },
    { address: accounts.transferAuthority, role: 0 },
    { address: accounts.perpetuals, role: 0 },
    { address: accounts.pool, role: 1 },
    { address: accounts.custody, role: 1 },
    { address: accounts.custodyTokenAccount, role: 1 },
    { address: accounts.custodyOracleAccount, role: 0 },
    { address: accounts.receivingTokenAccount, role: 1 },
    { address: accounts.tokenProgram, role: 0 },
    ...remainingAccounts,
  ]
  const buffer = Buffer.alloc(1000)
  const len = layout.encode(
    {
      params: types.WithdrawFeesParams.toEncodable(args.params),
    },
    buffer
  )
  const data = Buffer.concat([DISCRIMINATOR, buffer]).slice(0, 8 + len)
  const ix: Instruction = { accounts: keys, programAddress, data }
  return ix
}
