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

export interface InitObligationFarmsForReserveArgs {
  mode: number
}

export interface InitObligationFarmsForReserveAccounts {
  payer: TransactionSigner
  owner: Address
  obligation: Address
  lendingMarketAuthority: Address
  reserve: Address
  reserveFarmState: Address
  obligationFarm: Address
  lendingMarket: Address
  farmsProgram: Address
  rent: Address
  systemProgram: Address
}

export const layout = borsh.struct([borsh.u8("mode")])

export function initObligationFarmsForReserve(
  args: InitObligationFarmsForReserveArgs,
  accounts: InitObligationFarmsForReserveAccounts,
  programAddress: Address = PROGRAM_ID
) {
  const keys: Array<IAccountMeta | IAccountSignerMeta> = [
    { address: accounts.payer.address, role: 3, signer: accounts.payer },
    { address: accounts.owner, role: 0 },
    { address: accounts.obligation, role: 1 },
    { address: accounts.lendingMarketAuthority, role: 0 },
    { address: accounts.reserve, role: 1 },
    { address: accounts.reserveFarmState, role: 1 },
    { address: accounts.obligationFarm, role: 1 },
    { address: accounts.lendingMarket, role: 0 },
    { address: accounts.farmsProgram, role: 0 },
    { address: accounts.rent, role: 0 },
    { address: accounts.systemProgram, role: 0 },
  ]
  const identifier = Buffer.from([136, 63, 15, 186, 211, 152, 168, 164])
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
