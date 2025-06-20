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

export interface InitGlobalConfigAccounts {
  payer: TransactionSigner
  globalConfig: Address
  programData: Address
  systemProgram: Address
  rent: Address
}

export function initGlobalConfig(
  accounts: InitGlobalConfigAccounts,
  programAddress: Address = PROGRAM_ID
) {
  const keys: Array<IAccountMeta | IAccountSignerMeta> = [
    { address: accounts.payer.address, role: 3, signer: accounts.payer },
    { address: accounts.globalConfig, role: 1 },
    { address: accounts.programData, role: 0 },
    { address: accounts.systemProgram, role: 0 },
    { address: accounts.rent, role: 0 },
  ]
  const identifier = Buffer.from([140, 136, 214, 48, 87, 0, 120, 255])
  const data = identifier
  const ix: IInstruction = { accounts: keys, programAddress, data }
  return ix
}
