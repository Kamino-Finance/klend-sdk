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

export interface UpdateReserveAllocationArgs {
  weight: BN
  cap: BN
}

export interface UpdateReserveAllocationAccounts {
  signer: TransactionSigner
  vaultState: Address
  baseVaultAuthority: Address
  reserveCollateralMint: Address
  reserve: Address
  ctokenVault: Address
  reserveCollateralTokenProgram: Address
  systemProgram: Address
  rent: Address
}

export const layout = borsh.struct([borsh.u64("weight"), borsh.u64("cap")])

export function updateReserveAllocation(
  args: UpdateReserveAllocationArgs,
  accounts: UpdateReserveAllocationAccounts,
  programAddress: Address = PROGRAM_ID
) {
  const keys: Array<IAccountMeta | IAccountSignerMeta> = [
    { address: accounts.signer.address, role: 3, signer: accounts.signer },
    { address: accounts.vaultState, role: 1 },
    { address: accounts.baseVaultAuthority, role: 0 },
    { address: accounts.reserveCollateralMint, role: 1 },
    { address: accounts.reserve, role: 0 },
    { address: accounts.ctokenVault, role: 1 },
    { address: accounts.reserveCollateralTokenProgram, role: 0 },
    { address: accounts.systemProgram, role: 0 },
    { address: accounts.rent, role: 0 },
  ]
  const identifier = Buffer.from([5, 54, 213, 112, 75, 232, 117, 37])
  const buffer = Buffer.alloc(1000)
  const len = layout.encode(
    {
      weight: args.weight,
      cap: args.cap,
    },
    buffer
  )
  const data = Buffer.concat([identifier, buffer]).slice(0, 8 + len)
  const ix: IInstruction = { accounts: keys, programAddress, data }
  return ix
}
