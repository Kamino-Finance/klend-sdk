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

export interface InitFarmsForReserveArgs {
  mode: number
}

export interface InitFarmsForReserveAccounts {
  lendingMarketOwner: TransactionSigner
  lendingMarket: Address
  lendingMarketAuthority: Address
  reserve: Address
  farmsProgram: Address
  farmsGlobalConfig: Address
  farmState: Address
  farmsVaultAuthority: Address
  rent: Address
  systemProgram: Address
}

export const layout = borsh.struct([borsh.u8("mode")])

export function initFarmsForReserve(
  args: InitFarmsForReserveArgs,
  accounts: InitFarmsForReserveAccounts,
  programAddress: Address = PROGRAM_ID
) {
  const keys: Array<IAccountMeta | IAccountSignerMeta> = [
    {
      address: accounts.lendingMarketOwner.address,
      role: 3,
      signer: accounts.lendingMarketOwner,
    },
    { address: accounts.lendingMarket, role: 0 },
    { address: accounts.lendingMarketAuthority, role: 0 },
    { address: accounts.reserve, role: 1 },
    { address: accounts.farmsProgram, role: 0 },
    { address: accounts.farmsGlobalConfig, role: 0 },
    { address: accounts.farmState, role: 1 },
    { address: accounts.farmsVaultAuthority, role: 0 },
    { address: accounts.rent, role: 0 },
    { address: accounts.systemProgram, role: 0 },
  ]
  const identifier = Buffer.from([218, 6, 62, 233, 1, 33, 232, 82])
  const buffer = Buffer.alloc(1000)
  const len = layout.encode(
    {
      mode: args.mode,
    },
    buffer
  )
  const data = Buffer.concat([identifier, buffer]).slice(0, 8 + len)
  const ix: IInstruction = { accounts: keys, programAddress, data }
  return ix
}
