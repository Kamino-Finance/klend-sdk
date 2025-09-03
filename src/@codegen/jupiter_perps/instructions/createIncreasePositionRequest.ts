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

export const DISCRIMINATOR = Buffer.from([8, 160, 201, 226, 217, 74, 228, 137])

export interface CreateIncreasePositionRequestArgs {
  params: types.CreateIncreasePositionRequestParamsFields
}

export interface CreateIncreasePositionRequestAccounts {
  owner: TransactionSigner
  fundingAccount: Address
  perpetuals: Address
  pool: Address
  position: Address
  positionRequest: Address
  positionRequestAta: Address
  custody: Address
  custodyOracleAccount: Address
  collateralCustody: Address
  inputMint: Address
  referral: Option<Address>
  tokenProgram: Address
  associatedTokenProgram: Address
  systemProgram: Address
  eventAuthority: Address
  program: Address
}

export const layout = borsh.struct([
  types.CreateIncreasePositionRequestParams.layout("params"),
])

export function createIncreasePositionRequest(
  args: CreateIncreasePositionRequestArgs,
  accounts: CreateIncreasePositionRequestAccounts,
  remainingAccounts: Array<AccountMeta | AccountSignerMeta> = [],
  programAddress: Address = PROGRAM_ID
) {
  const keys: Array<AccountMeta | AccountSignerMeta> = [
    { address: accounts.owner.address, role: 3, signer: accounts.owner },
    { address: accounts.fundingAccount, role: 1 },
    { address: accounts.perpetuals, role: 0 },
    { address: accounts.pool, role: 0 },
    { address: accounts.position, role: 1 },
    { address: accounts.positionRequest, role: 1 },
    { address: accounts.positionRequestAta, role: 1 },
    { address: accounts.custody, role: 0 },
    { address: accounts.custodyOracleAccount, role: 0 },
    { address: accounts.collateralCustody, role: 0 },
    { address: accounts.inputMint, role: 0 },
    isSome(accounts.referral)
      ? { address: accounts.referral.value, role: 0 }
      : { address: programAddress, role: 0 },
    { address: accounts.tokenProgram, role: 0 },
    { address: accounts.associatedTokenProgram, role: 0 },
    { address: accounts.systemProgram, role: 0 },
    { address: accounts.eventAuthority, role: 0 },
    { address: accounts.program, role: 0 },
    ...remainingAccounts,
  ]
  const buffer = Buffer.alloc(1000)
  const len = layout.encode(
    {
      params: types.CreateIncreasePositionRequestParams.toEncodable(
        args.params
      ),
    },
    buffer
  )
  const data = Buffer.concat([DISCRIMINATOR, buffer]).slice(0, 8 + len)
  const ix: Instruction = { accounts: keys, programAddress, data }
  return ix
}
