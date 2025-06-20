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

export interface InitReserveAccounts {
  lendingMarketOwner: TransactionSigner
  lendingMarket: Address
  lendingMarketAuthority: Address
  reserve: Address
  reserveLiquidityMint: Address
  reserveLiquiditySupply: Address
  feeReceiver: Address
  reserveCollateralMint: Address
  reserveCollateralSupply: Address
  initialLiquiditySource: Address
  rent: Address
  liquidityTokenProgram: Address
  collateralTokenProgram: Address
  systemProgram: Address
}

export function initReserve(
  accounts: InitReserveAccounts,
  programAddress: Address = PROGRAM_ID
) {
  const keys: Array<IAccountMeta | IAccountSignerMeta> = [
    {
      address: accounts.lendingMarketOwner.address,
      role: 3,
      signer: accounts.lendingMarketOwner,
    },
    { address: accounts.lendingMarket, role: 0 },
    { address: accounts.lendingMarketAuthority, role: 0 },
    { address: accounts.reserve, role: 1 },
    { address: accounts.reserveLiquidityMint, role: 0 },
    { address: accounts.reserveLiquiditySupply, role: 1 },
    { address: accounts.feeReceiver, role: 1 },
    { address: accounts.reserveCollateralMint, role: 1 },
    { address: accounts.reserveCollateralSupply, role: 1 },
    { address: accounts.initialLiquiditySource, role: 1 },
    { address: accounts.rent, role: 0 },
    { address: accounts.liquidityTokenProgram, role: 0 },
    { address: accounts.collateralTokenProgram, role: 0 },
    { address: accounts.systemProgram, role: 0 },
  ]
  const identifier = Buffer.from([138, 245, 71, 225, 153, 4, 3, 43])
  const data = identifier
  const ix: IInstruction = { accounts: keys, programAddress, data }
  return ix
}
