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

export const DISCRIMINATOR = Buffer.from([116, 45, 66, 148, 58, 13, 218, 115])

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
  remainingAccounts: Array<AccountMeta | AccountSignerMeta> = [],
  programAddress: Address = PROGRAM_ID
) {
  const keys: Array<AccountMeta | AccountSignerMeta> = [
    { address: accounts.payer.address, role: 3, signer: accounts.payer },
    { address: accounts.lendingMarket, role: 0 },
    { address: accounts.reserve, role: 0 },
    { address: accounts.referrer, role: 0 },
    { address: accounts.referrerTokenState, role: 1 },
    { address: accounts.rent, role: 0 },
    { address: accounts.systemProgram, role: 0 },
    ...remainingAccounts,
  ]
  const data = DISCRIMINATOR
  const ix: Instruction = { accounts: keys, programAddress, data }
  return ix
}
