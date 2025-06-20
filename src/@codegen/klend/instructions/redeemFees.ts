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

export interface RedeemFeesAccounts {
  reserve: Address
  reserveLiquidityMint: Address
  reserveLiquidityFeeReceiver: Address
  reserveSupplyLiquidity: Address
  lendingMarket: Address
  lendingMarketAuthority: Address
  tokenProgram: Address
}

export function redeemFees(
  accounts: RedeemFeesAccounts,
  programAddress: Address = PROGRAM_ID
) {
  const keys: Array<IAccountMeta | IAccountSignerMeta> = [
    { address: accounts.reserve, role: 1 },
    { address: accounts.reserveLiquidityMint, role: 0 },
    { address: accounts.reserveLiquidityFeeReceiver, role: 1 },
    { address: accounts.reserveSupplyLiquidity, role: 1 },
    { address: accounts.lendingMarket, role: 0 },
    { address: accounts.lendingMarketAuthority, role: 0 },
    { address: accounts.tokenProgram, role: 0 },
  ]
  const identifier = Buffer.from([215, 39, 180, 41, 173, 46, 248, 220])
  const data = identifier
  const ix: IInstruction = { accounts: keys, programAddress, data }
  return ix
}
