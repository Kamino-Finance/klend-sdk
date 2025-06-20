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

export interface UpdateLendingMarketOwnerAccounts {
  lendingMarketOwnerCached: TransactionSigner
  lendingMarket: Address
}

export function updateLendingMarketOwner(
  accounts: UpdateLendingMarketOwnerAccounts,
  programAddress: Address = PROGRAM_ID
) {
  const keys: Array<IAccountMeta | IAccountSignerMeta> = [
    {
      address: accounts.lendingMarketOwnerCached.address,
      role: 2,
      signer: accounts.lendingMarketOwnerCached,
    },
    { address: accounts.lendingMarket, role: 1 },
  ]
  const identifier = Buffer.from([118, 224, 10, 62, 196, 230, 184, 89])
  const data = identifier
  const ix: IInstruction = { accounts: keys, programAddress, data }
  return ix
}
