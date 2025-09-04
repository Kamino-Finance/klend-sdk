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

export interface UpdateAdminAccounts {
  pendingAdmin: TransactionSigner
  poolState: Address
}

export function updateAdmin(
  accounts: UpdateAdminAccounts,
  programAddress: Address = PROGRAM_ID
) {
  const keys: Array<IAccountMeta | IAccountSignerMeta> = [
    {
      address: accounts.pendingAdmin.address,
      role: 2,
      signer: accounts.pendingAdmin,
    },
    { address: accounts.poolState, role: 1 },
  ]
  const identifier = Buffer.from([161, 176, 40, 213, 60, 184, 179, 228])
  const data = identifier
  const ix: IInstruction = { accounts: keys, programAddress, data }
  return ix
}
