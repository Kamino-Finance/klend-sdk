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

export interface RemoveAllocationAccounts {
  vaultAdminAuthority: TransactionSigner
  vaultState: Address
  reserve: Address
}

export function removeAllocation(
  accounts: RemoveAllocationAccounts,
  programAddress: Address = PROGRAM_ID
) {
  const keys: Array<IAccountMeta | IAccountSignerMeta> = [
    {
      address: accounts.vaultAdminAuthority.address,
      role: 3,
      signer: accounts.vaultAdminAuthority,
    },
    { address: accounts.vaultState, role: 1 },
    { address: accounts.reserve, role: 0 },
  ]
  const identifier = Buffer.from([32, 220, 211, 141, 209, 231, 73, 76])
  const data = identifier
  const ix: IInstruction = { accounts: keys, programAddress, data }
  return ix
}
