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

export const DISCRIMINATOR = Buffer.from([
  202, 249, 117, 114, 231, 192, 47, 138,
])

export interface WithdrawObligationCollateralV2Args {
  collateralAmount: BN
}

export interface WithdrawObligationCollateralV2Accounts {
  withdrawAccounts: {
    owner: TransactionSigner
    obligation: Address
    lendingMarket: Address
    lendingMarketAuthority: Address
    withdrawReserve: Address
    reserveSourceCollateral: Address
    userDestinationCollateral: Address
    tokenProgram: Address
    instructionSysvarAccount: Address
  }
  farmsAccounts: {
    obligationFarmUserState: Option<Address>
    reserveFarmState: Option<Address>
  }
  farmsProgram: Address
}

export const layout = borsh.struct<WithdrawObligationCollateralV2Args>([
  borsh.u64("collateralAmount"),
])

export function withdrawObligationCollateralV2(
  args: WithdrawObligationCollateralV2Args,
  accounts: WithdrawObligationCollateralV2Accounts,
  remainingAccounts: Array<AccountMeta | AccountSignerMeta> = [],
  programAddress: Address = PROGRAM_ID
) {
  const keys: Array<AccountMeta | AccountSignerMeta> = [
    {
      address: accounts.withdrawAccounts.owner.address,
      role: 2,
      signer: accounts.withdrawAccounts.owner,
    },
    { address: accounts.withdrawAccounts.obligation, role: 1 },
    { address: accounts.withdrawAccounts.lendingMarket, role: 0 },
    { address: accounts.withdrawAccounts.lendingMarketAuthority, role: 0 },
    { address: accounts.withdrawAccounts.withdrawReserve, role: 1 },
    { address: accounts.withdrawAccounts.reserveSourceCollateral, role: 1 },
    { address: accounts.withdrawAccounts.userDestinationCollateral, role: 1 },
    { address: accounts.withdrawAccounts.tokenProgram, role: 0 },
    { address: accounts.withdrawAccounts.instructionSysvarAccount, role: 0 },
    isSome(accounts.farmsAccounts.obligationFarmUserState)
      ? {
          address: accounts.farmsAccounts.obligationFarmUserState.value,
          role: 1,
        }
      : { address: programAddress, role: 0 },
    isSome(accounts.farmsAccounts.reserveFarmState)
      ? { address: accounts.farmsAccounts.reserveFarmState.value, role: 1 }
      : { address: programAddress, role: 0 },
    { address: accounts.farmsProgram, role: 0 },
    ...remainingAccounts,
  ]
  const buffer = Buffer.alloc(1000)
  const len = layout.encode(
    {
      collateralAmount: args.collateralAmount,
    },
    buffer
  )
  const data = Buffer.concat([DISCRIMINATOR, buffer]).slice(0, 8 + len)
  const ix: Instruction = { accounts: keys, programAddress, data }
  return ix
}
