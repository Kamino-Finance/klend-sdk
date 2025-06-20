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

export interface RefreshObligationFarmsForReserveArgs {
  mode: number
}

export interface RefreshObligationFarmsForReserveAccounts {
  crank: TransactionSigner
  baseAccounts: {
    obligation: Address
    lendingMarketAuthority: Address
    reserve: Address
    reserveFarmState: Address
    obligationFarmUserState: Address
    lendingMarket: Address
  }
  farmsProgram: Address
  rent: Address
  systemProgram: Address
}

export const layout = borsh.struct([borsh.u8("mode")])

export function refreshObligationFarmsForReserve(
  args: RefreshObligationFarmsForReserveArgs,
  accounts: RefreshObligationFarmsForReserveAccounts,
  programAddress: Address = PROGRAM_ID
) {
  const keys: Array<IAccountMeta | IAccountSignerMeta> = [
    { address: accounts.crank.address, role: 2, signer: accounts.crank },
    { address: accounts.baseAccounts.obligation, role: 0 },
    { address: accounts.baseAccounts.lendingMarketAuthority, role: 0 },
    { address: accounts.baseAccounts.reserve, role: 0 },
    { address: accounts.baseAccounts.reserveFarmState, role: 1 },
    { address: accounts.baseAccounts.obligationFarmUserState, role: 1 },
    { address: accounts.baseAccounts.lendingMarket, role: 0 },
    { address: accounts.farmsProgram, role: 0 },
    { address: accounts.rent, role: 0 },
    { address: accounts.systemProgram, role: 0 },
  ]
  const identifier = Buffer.from([140, 144, 253, 21, 10, 74, 248, 3])
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
