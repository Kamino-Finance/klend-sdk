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

export interface InitReferrerTokenStateAccounts {
  payer: TransactionSigner
  lendingMarket: Address
  reserve: Address
  referrer: Address
  referrerTokenState: Address
  rent: Address
  systemProgram: Address
}

export function initReferrerTokenState(
  accounts: InitReferrerTokenStateAccounts,
  programAddress: Address = PROGRAM_ID
) {
  const keys: Array<IAccountMeta | IAccountSignerMeta> = [
    { address: accounts.payer.address, role: 3, signer: accounts.payer },
    { address: accounts.lendingMarket, role: 0 },
    { address: accounts.reserve, role: 0 },
    { address: accounts.referrer, role: 0 },
    { address: accounts.referrerTokenState, role: 1 },
    { address: accounts.rent, role: 0 },
    { address: accounts.systemProgram, role: 0 },
  ]
  const identifier = Buffer.from([116, 45, 66, 148, 58, 13, 218, 115])
  const data = identifier
  const ix: IInstruction = { accounts: keys, programAddress, data }
  return ix
}
