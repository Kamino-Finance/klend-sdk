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

export const DISCRIMINATOR = Buffer.from([137, 145, 151, 94, 167, 113, 4, 145])

export interface DepositObligationCollateralV2Args {
  collateralAmount: BN
}

export interface DepositObligationCollateralV2Accounts {
  depositAccounts: {
    owner: TransactionSigner
    obligation: Address
    lendingMarket: Address
    depositReserve: Address
    reserveDestinationCollateral: Address
    userSourceCollateral: Address
    tokenProgram: Address
    instructionSysvarAccount: Address
  }
  lendingMarketAuthority: Address
  farmsAccounts: {
    obligationFarmUserState: Option<Address>
    reserveFarmState: Option<Address>
  }
  farmsProgram: Address
}

export const layout = borsh.struct<DepositObligationCollateralV2Args>([
  borsh.u64("collateralAmount"),
])

export function depositObligationCollateralV2(
  args: DepositObligationCollateralV2Args,
  accounts: DepositObligationCollateralV2Accounts,
  remainingAccounts: Array<AccountMeta | AccountSignerMeta> = [],
  programAddress: Address = PROGRAM_ID
) {
  const keys: Array<AccountMeta | AccountSignerMeta> = [
    {
      address: accounts.depositAccounts.owner.address,
      role: 2,
      signer: accounts.depositAccounts.owner,
    },
    { address: accounts.depositAccounts.obligation, role: 1 },
    { address: accounts.depositAccounts.lendingMarket, role: 0 },
    { address: accounts.depositAccounts.depositReserve, role: 1 },
    { address: accounts.depositAccounts.reserveDestinationCollateral, role: 1 },
    { address: accounts.depositAccounts.userSourceCollateral, role: 1 },
    { address: accounts.depositAccounts.tokenProgram, role: 0 },
    { address: accounts.depositAccounts.instructionSysvarAccount, role: 0 },
    { address: accounts.lendingMarketAuthority, role: 0 },
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
