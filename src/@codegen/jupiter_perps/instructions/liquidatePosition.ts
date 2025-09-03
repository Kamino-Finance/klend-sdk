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

export const DISCRIMINATOR = Buffer.from([187, 74, 229, 149, 102, 81, 221, 68])

export interface LiquidatePositionArgs {
  params: types.LiquidatePositionParamsFields
}

export interface LiquidatePositionAccounts {
  signer: TransactionSigner
  receivingAccount: Address
  rewardReceivingAccount: Address
  transferAuthority: Address
  perpetuals: Address
  pool: Address
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

export const layout = borsh.struct<LiquidatePositionArgs>([
  types.LiquidatePositionParams.layout("params"),
])

export function liquidatePosition(
  args: LiquidatePositionArgs,
  accounts: LiquidatePositionAccounts,
  remainingAccounts: Array<AccountMeta | AccountSignerMeta> = [],
  programAddress: Address = PROGRAM_ID
) {
  const keys: Array<AccountMeta | AccountSignerMeta> = [
    { address: accounts.signer.address, role: 3, signer: accounts.signer },
    { address: accounts.receivingAccount, role: 1 },
    { address: accounts.rewardReceivingAccount, role: 1 },
    { address: accounts.transferAuthority, role: 0 },
    { address: accounts.perpetuals, role: 0 },
    { address: accounts.pool, role: 1 },
    { address: accounts.position, role: 1 },
    { address: accounts.custody, role: 1 },
    { address: accounts.custodyOracleAccount, role: 0 },
    { address: accounts.collateralCustody, role: 1 },
    { address: accounts.collateralCustodyOracleAccount, role: 0 },
    { address: accounts.collateralCustodyTokenAccount, role: 1 },
    { address: accounts.tokenProgram, role: 0 },
    { address: accounts.eventAuthority, role: 0 },
    { address: accounts.program, role: 0 },
    ...remainingAccounts,
  ]
  const buffer = Buffer.alloc(1000)
  const len = layout.encode(
    {
      params: types.LiquidatePositionParams.toEncodable(args.params),
    },
    buffer
  )
  const data = Buffer.concat([DISCRIMINATOR, buffer]).slice(0, 8 + len)
  const ix: Instruction = { accounts: keys, programAddress, data }
  return ix
}
