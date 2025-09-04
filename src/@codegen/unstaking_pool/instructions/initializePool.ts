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

export interface InitializePoolAccounts {
  admin: TransactionSigner
  poolState: Address
  unstakingSolMint: Address
  wsolMint: Address
  basePoolAuthority: Address
  wsolVault: Address
  systemProgram: Address
  rent: Address
  tokenProgram: Address
}

export function initializePool(
  accounts: InitializePoolAccounts,
  programAddress: Address = PROGRAM_ID
) {
  const keys: Array<IAccountMeta | IAccountSignerMeta> = [
    { address: accounts.admin.address, role: 3, signer: accounts.admin },
    { address: accounts.poolState, role: 1 },
    { address: accounts.unstakingSolMint, role: 1 },
    { address: accounts.wsolMint, role: 0 },
    { address: accounts.basePoolAuthority, role: 0 },
    { address: accounts.wsolVault, role: 1 },
    { address: accounts.systemProgram, role: 0 },
    { address: accounts.rent, role: 0 },
    { address: accounts.tokenProgram, role: 0 },
  ]
  const identifier = Buffer.from([95, 180, 10, 172, 84, 174, 232, 40])
  const data = identifier
  const ix: IInstruction = { accounts: keys, programAddress, data }
  return ix
}
