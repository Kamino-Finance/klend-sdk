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

export const DISCRIMINATOR = Buffer.from([146, 21, 51, 121, 187, 208, 7, 69])

export interface CreateDecreasePositionRequestArgs {
  params: types.CreateDecreasePositionRequestParamsFields
}

export interface CreateDecreasePositionRequestAccounts {
  owner: TransactionSigner
  receivingAccount: Address
  perpetuals: Address
  pool: Address
  position: Address
  positionRequest: Address
  positionRequestAta: Address
  custody: Address
  custodyOracleAccount: Address
  collateralCustody: Address
  desiredMint: Address
  referral: Option<Address>
  tokenProgram: Address
  associatedTokenProgram: Address
  systemProgram: Address
  eventAuthority: Address
  program: Address
}

export const layout = borsh.struct([
  types.CreateDecreasePositionRequestParams.layout("params"),
])

export function createDecreasePositionRequest(
  args: CreateDecreasePositionRequestArgs,
  accounts: CreateDecreasePositionRequestAccounts,
  remainingAccounts: Array<AccountMeta | AccountSignerMeta> = [],
  programAddress: Address = PROGRAM_ID
) {
  const keys: Array<AccountMeta | AccountSignerMeta> = [
    { address: accounts.owner.address, role: 3, signer: accounts.owner },
    { address: accounts.receivingAccount, role: 1 },
    { address: accounts.perpetuals, role: 0 },
    { address: accounts.pool, role: 1 },
    { address: accounts.position, role: 0 },
    { address: accounts.positionRequest, role: 1 },
    { address: accounts.positionRequestAta, role: 1 },
    { address: accounts.custody, role: 0 },
    { address: accounts.custodyOracleAccount, role: 0 },
    { address: accounts.collateralCustody, role: 0 },
    { address: accounts.desiredMint, role: 0 },
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
      params: types.CreateDecreasePositionRequestParams.toEncodable(
        args.params
      ),
    },
    buffer
  )
  const data = Buffer.concat([DISCRIMINATOR, buffer]).slice(0, 8 + len)
  const ix: Instruction = { accounts: keys, programAddress, data }
  return ix
}
