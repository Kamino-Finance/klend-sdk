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

export const DISCRIMINATOR = Buffer.from([57, 125, 21, 59, 200, 137, 179, 108])

export interface DecreasePositionArgs {
  params: types.DecreasePositionParamsFields
}

export interface DecreasePositionAccounts {
  keeper: TransactionSigner
  keeperAta: Option<Address>
  owner: Address
  transferAuthority: Address
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
  instruction: Address
  tokenProgram: Address
  eventAuthority: Address
  program: Address
}

export const layout = borsh.struct<DecreasePositionArgs>([
  types.DecreasePositionParams.layout("params"),
])

export function decreasePosition(
  args: DecreasePositionArgs,
  accounts: DecreasePositionAccounts,
  remainingAccounts: Array<AccountMeta | AccountSignerMeta> = [],
  programAddress: Address = PROGRAM_ID
) {
  const keys: Array<AccountMeta | AccountSignerMeta> = [
    { address: accounts.keeper.address, role: 2, signer: accounts.keeper },
    isSome(accounts.keeperAta)
      ? { address: accounts.keeperAta.value, role: 1 }
      : { address: programAddress, role: 0 },
    { address: accounts.owner, role: 1 },
    { address: accounts.transferAuthority, role: 0 },
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
    { address: accounts.instruction, role: 0 },
    { address: accounts.tokenProgram, role: 0 },
    { address: accounts.eventAuthority, role: 0 },
    { address: accounts.program, role: 0 },
    ...remainingAccounts,
  ]
  const buffer = Buffer.alloc(1000)
  const len = layout.encode(
    {
      params: types.DecreasePositionParams.toEncodable(args.params),
    },
    buffer
  )
  const data = Buffer.concat([DISCRIMINATOR, buffer]).slice(0, 8 + len)
  const ix: Instruction = { accounts: keys, programAddress, data }
  return ix
}
