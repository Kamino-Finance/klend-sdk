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

export interface CollectAccounts {
  payer: TransactionSigner
  stakeAccount: Address
  poolState: Address
  basePoolAuthority: Address
  wsolVault: Address
  wsolMint: Address
  tokenProgram: Address
  systemProgram: Address
  clockProgramId: Address
  stakeProgramId: Address
  stakeHistoryProgramId: Address
}

export function collect(
  accounts: CollectAccounts,
  programAddress: Address = PROGRAM_ID
) {
  const keys: Array<IAccountMeta | IAccountSignerMeta> = [
    { address: accounts.payer.address, role: 3, signer: accounts.payer },
    { address: accounts.stakeAccount, role: 1 },
    { address: accounts.poolState, role: 1 },
    { address: accounts.basePoolAuthority, role: 1 },
    { address: accounts.wsolVault, role: 1 },
    { address: accounts.wsolMint, role: 0 },
    { address: accounts.tokenProgram, role: 0 },
    { address: accounts.systemProgram, role: 0 },
    { address: accounts.clockProgramId, role: 0 },
    { address: accounts.stakeProgramId, role: 0 },
    { address: accounts.stakeHistoryProgramId, role: 0 },
  ]
  const identifier = Buffer.from([208, 47, 194, 155, 17, 98, 82, 236])
  const data = identifier
  const ix: IInstruction = { accounts: keys, programAddress, data }
  return ix
}
