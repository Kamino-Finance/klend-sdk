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

export const DISCRIMINATOR = Buffer.from([238, 95, 98, 220, 187, 40, 204, 154])

export interface SocializeLossV2Args {
  liquidityAmount: BN
}

export interface SocializeLossV2Accounts {
  socializeLossAccounts: {
    riskCouncil: TransactionSigner
    obligation: Address
    lendingMarket: Address
    reserve: Address
    instructionSysvarAccount: Address
  }
  farmsAccounts: {
    obligationFarmUserState: Option<Address>
    reserveFarmState: Option<Address>
  }
  lendingMarketAuthority: Address
  farmsProgram: Address
}

export const layout = borsh.struct<SocializeLossV2Args>([
  borsh.u64("liquidityAmount"),
])

export function socializeLossV2(
  args: SocializeLossV2Args,
  accounts: SocializeLossV2Accounts,
  remainingAccounts: Array<AccountMeta | AccountSignerMeta> = [],
  programAddress: Address = PROGRAM_ID
) {
  const keys: Array<AccountMeta | AccountSignerMeta> = [
    {
      address: accounts.socializeLossAccounts.riskCouncil.address,
      role: 2,
      signer: accounts.socializeLossAccounts.riskCouncil,
    },
    { address: accounts.socializeLossAccounts.obligation, role: 1 },
    { address: accounts.socializeLossAccounts.lendingMarket, role: 0 },
    { address: accounts.socializeLossAccounts.reserve, role: 1 },
    {
      address: accounts.socializeLossAccounts.instructionSysvarAccount,
      role: 0,
    },
    isSome(accounts.farmsAccounts.obligationFarmUserState)
      ? {
          address: accounts.farmsAccounts.obligationFarmUserState.value,
          role: 1,
        }
      : { address: programAddress, role: 0 },
    isSome(accounts.farmsAccounts.reserveFarmState)
      ? { address: accounts.farmsAccounts.reserveFarmState.value, role: 1 }
      : { address: programAddress, role: 0 },
    { address: accounts.lendingMarketAuthority, role: 0 },
    { address: accounts.farmsProgram, role: 0 },
    ...remainingAccounts,
  ]
  const buffer = Buffer.alloc(1000)
  const len = layout.encode(
    {
      liquidityAmount: args.liquidityAmount,
    },
    buffer
  )
  const data = Buffer.concat([DISCRIMINATOR, buffer]).slice(0, 8 + len)
  const ix: Instruction = { accounts: keys, programAddress, data }
  return ix
}
