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

export const DISCRIMINATOR = Buffer.from([169, 201, 30, 126, 6, 205, 102, 68])

export interface DepositReserveLiquidityArgs {
  liquidityAmount: BN
}

export interface DepositReserveLiquidityAccounts {
  owner: TransactionSigner
  reserve: Address
  lendingMarket: Address
  lendingMarketAuthority: Address
  reserveLiquidityMint: Address
  reserveLiquiditySupply: Address
  reserveCollateralMint: Address
  userSourceLiquidity: Address
  userDestinationCollateral: Address
  collateralTokenProgram: Address
  liquidityTokenProgram: Address
  instructionSysvarAccount: Address
}

export const layout = borsh.struct<DepositReserveLiquidityArgs>([
  borsh.u64("liquidityAmount"),
])

export function depositReserveLiquidity(
  args: DepositReserveLiquidityArgs,
  accounts: DepositReserveLiquidityAccounts,
  remainingAccounts: Array<AccountMeta | AccountSignerMeta> = [],
  programAddress: Address = PROGRAM_ID
) {
  const keys: Array<AccountMeta | AccountSignerMeta> = [
    { address: accounts.owner.address, role: 2, signer: accounts.owner },
    { address: accounts.reserve, role: 1 },
    { address: accounts.lendingMarket, role: 0 },
    { address: accounts.lendingMarketAuthority, role: 0 },
    { address: accounts.reserveLiquidityMint, role: 0 },
    { address: accounts.reserveLiquiditySupply, role: 1 },
    { address: accounts.reserveCollateralMint, role: 1 },
    { address: accounts.userSourceLiquidity, role: 1 },
    { address: accounts.userDestinationCollateral, role: 1 },
    { address: accounts.collateralTokenProgram, role: 0 },
    { address: accounts.liquidityTokenProgram, role: 0 },
    { address: accounts.instructionSysvarAccount, role: 0 },
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
