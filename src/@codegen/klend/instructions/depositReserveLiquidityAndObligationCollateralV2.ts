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
  216, 224, 191, 27, 204, 151, 102, 175,
])

export interface DepositReserveLiquidityAndObligationCollateralV2Args {
  liquidityAmount: BN
}

export interface DepositReserveLiquidityAndObligationCollateralV2Accounts {
  depositAccounts: {
    owner: TransactionSigner
    obligation: Address
    lendingMarket: Address
    lendingMarketAuthority: Address
    reserve: Address
    reserveLiquidityMint: Address
    reserveLiquiditySupply: Address
    reserveCollateralMint: Address
    reserveDestinationDepositCollateral: Address
    userSourceLiquidity: Address
    placeholderUserDestinationCollateral: Option<Address>
    collateralTokenProgram: Address
    liquidityTokenProgram: Address
    instructionSysvarAccount: Address
  }
  farmsAccounts: {
    obligationFarmUserState: Option<Address>
    reserveFarmState: Option<Address>
  }
  farmsProgram: Address
}

export const layout =
  borsh.struct<DepositReserveLiquidityAndObligationCollateralV2Args>([
    borsh.u64("liquidityAmount"),
  ])

export function depositReserveLiquidityAndObligationCollateralV2(
  args: DepositReserveLiquidityAndObligationCollateralV2Args,
  accounts: DepositReserveLiquidityAndObligationCollateralV2Accounts,
  remainingAccounts: Array<AccountMeta | AccountSignerMeta> = [],
  programAddress: Address = PROGRAM_ID
) {
  const keys: Array<AccountMeta | AccountSignerMeta> = [
    {
      address: accounts.depositAccounts.owner.address,
      role: 3,
      signer: accounts.depositAccounts.owner,
    },
    { address: accounts.depositAccounts.obligation, role: 1 },
    { address: accounts.depositAccounts.lendingMarket, role: 0 },
    { address: accounts.depositAccounts.lendingMarketAuthority, role: 0 },
    { address: accounts.depositAccounts.reserve, role: 1 },
    { address: accounts.depositAccounts.reserveLiquidityMint, role: 0 },
    { address: accounts.depositAccounts.reserveLiquiditySupply, role: 1 },
    { address: accounts.depositAccounts.reserveCollateralMint, role: 1 },
    {
      address: accounts.depositAccounts.reserveDestinationDepositCollateral,
      role: 1,
    },
    { address: accounts.depositAccounts.userSourceLiquidity, role: 1 },
    isSome(accounts.depositAccounts.placeholderUserDestinationCollateral)
      ? {
          address:
            accounts.depositAccounts.placeholderUserDestinationCollateral.value,
          role: 0,
        }
      : { address: programAddress, role: 0 },
    { address: accounts.depositAccounts.collateralTokenProgram, role: 0 },
    { address: accounts.depositAccounts.liquidityTokenProgram, role: 0 },
    { address: accounts.depositAccounts.instructionSysvarAccount, role: 0 },
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
      liquidityAmount: args.liquidityAmount,
    },
    buffer
  )
  const data = Buffer.concat([DISCRIMINATOR, buffer]).slice(0, 8 + len)
  const ix: Instruction = { accounts: keys, programAddress, data }
  return ix
}
