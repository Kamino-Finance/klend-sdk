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

export interface WithdrawObligationCollateralAndRedeemReserveCollateralV2Args {
  collateralAmount: BN
}

export interface WithdrawObligationCollateralAndRedeemReserveCollateralV2Accounts {
  withdrawAccounts: {
    owner: TransactionSigner
    obligation: Address
    lendingMarket: Address
    lendingMarketAuthority: Address
    withdrawReserve: Address
    reserveLiquidityMint: Address
    reserveSourceCollateral: Address
    reserveCollateralMint: Address
    reserveLiquiditySupply: Address
    userDestinationLiquidity: Address
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

export const layout = borsh.struct([borsh.u64("collateralAmount")])

export function withdrawObligationCollateralAndRedeemReserveCollateralV2(
  args: WithdrawObligationCollateralAndRedeemReserveCollateralV2Args,
  accounts: WithdrawObligationCollateralAndRedeemReserveCollateralV2Accounts,
  programAddress: Address = PROGRAM_ID
) {
  const keys: Array<IAccountMeta | IAccountSignerMeta> = [
    {
      address: accounts.withdrawAccounts.owner.address,
      role: 3,
      signer: accounts.withdrawAccounts.owner,
    },
    { address: accounts.withdrawAccounts.obligation, role: 1 },
    { address: accounts.withdrawAccounts.lendingMarket, role: 0 },
    { address: accounts.withdrawAccounts.lendingMarketAuthority, role: 0 },
    { address: accounts.withdrawAccounts.withdrawReserve, role: 1 },
    { address: accounts.withdrawAccounts.reserveLiquidityMint, role: 0 },
    { address: accounts.withdrawAccounts.reserveSourceCollateral, role: 1 },
    { address: accounts.withdrawAccounts.reserveCollateralMint, role: 1 },
    { address: accounts.withdrawAccounts.reserveLiquiditySupply, role: 1 },
    { address: accounts.withdrawAccounts.userDestinationLiquidity, role: 1 },
    isSome(accounts.withdrawAccounts.placeholderUserDestinationCollateral)
      ? {
          address:
            accounts.withdrawAccounts.placeholderUserDestinationCollateral
              .value,
          role: 0,
        }
      : { address: programAddress, role: 0 },
    { address: accounts.withdrawAccounts.collateralTokenProgram, role: 0 },
    { address: accounts.withdrawAccounts.liquidityTokenProgram, role: 0 },
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
  ]
  const identifier = Buffer.from([235, 52, 119, 152, 149, 197, 20, 7])
  const buffer = Buffer.alloc(1000)
  const len = layout.encode(
    {
      collateralAmount: args.collateralAmount,
    },
    buffer
  )
  const data = Buffer.concat([identifier, buffer]).slice(0, 8 + len)
  const ix: IInstruction = { accounts: keys, programAddress, data }
  return ix
}
