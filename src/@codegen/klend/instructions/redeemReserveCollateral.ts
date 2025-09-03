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
  234, 117, 181, 125, 185, 142, 220, 29,
])

export interface RedeemReserveCollateralArgs {
  collateralAmount: BN
}

export interface RedeemReserveCollateralAccounts {
  owner: TransactionSigner
  lendingMarket: Address
  reserve: Address
  lendingMarketAuthority: Address
  reserveLiquidityMint: Address
  reserveCollateralMint: Address
  reserveLiquiditySupply: Address
  userSourceCollateral: Address
  userDestinationLiquidity: Address
  collateralTokenProgram: Address
  liquidityTokenProgram: Address
  instructionSysvarAccount: Address
}

export const layout = borsh.struct<RedeemReserveCollateralArgs>([
  borsh.u64("collateralAmount"),
])

export function redeemReserveCollateral(
  args: RedeemReserveCollateralArgs,
  accounts: RedeemReserveCollateralAccounts,
  remainingAccounts: Array<AccountMeta | AccountSignerMeta> = [],
  programAddress: Address = PROGRAM_ID
) {
  const keys: Array<AccountMeta | AccountSignerMeta> = [
    { address: accounts.owner.address, role: 2, signer: accounts.owner },
    { address: accounts.lendingMarket, role: 0 },
    { address: accounts.reserve, role: 1 },
    { address: accounts.lendingMarketAuthority, role: 0 },
    { address: accounts.reserveLiquidityMint, role: 0 },
    { address: accounts.reserveCollateralMint, role: 1 },
    { address: accounts.reserveLiquiditySupply, role: 1 },
    { address: accounts.userSourceCollateral, role: 1 },
    { address: accounts.userDestinationLiquidity, role: 1 },
    { address: accounts.collateralTokenProgram, role: 0 },
    { address: accounts.liquidityTokenProgram, role: 0 },
    { address: accounts.instructionSysvarAccount, role: 0 },
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
