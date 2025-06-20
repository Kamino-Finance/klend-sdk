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

export interface WithdrawObligationCollateralAndRedeemReserveCollateralArgs {
  collateralAmount: BN
}

export interface WithdrawObligationCollateralAndRedeemReserveCollateralAccounts {
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

export const layout = borsh.struct([borsh.u64("collateralAmount")])

export function withdrawObligationCollateralAndRedeemReserveCollateral(
  args: WithdrawObligationCollateralAndRedeemReserveCollateralArgs,
  accounts: WithdrawObligationCollateralAndRedeemReserveCollateralAccounts,
  programAddress: Address = PROGRAM_ID
) {
  const keys: Array<IAccountMeta | IAccountSignerMeta> = [
    { address: accounts.owner.address, role: 3, signer: accounts.owner },
    { address: accounts.obligation, role: 1 },
    { address: accounts.lendingMarket, role: 0 },
    { address: accounts.lendingMarketAuthority, role: 0 },
    { address: accounts.withdrawReserve, role: 1 },
    { address: accounts.reserveLiquidityMint, role: 0 },
    { address: accounts.reserveSourceCollateral, role: 1 },
    { address: accounts.reserveCollateralMint, role: 1 },
    { address: accounts.reserveLiquiditySupply, role: 1 },
    { address: accounts.userDestinationLiquidity, role: 1 },
    isSome(accounts.placeholderUserDestinationCollateral)
      ? {
          address: accounts.placeholderUserDestinationCollateral.value,
          role: 0,
        }
      : { address: programAddress, role: 0 },
    { address: accounts.collateralTokenProgram, role: 0 },
    { address: accounts.liquidityTokenProgram, role: 0 },
    { address: accounts.instructionSysvarAccount, role: 0 },
  ]
  const identifier = Buffer.from([75, 93, 93, 220, 34, 150, 218, 196])
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
