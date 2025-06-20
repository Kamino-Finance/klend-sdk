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

export interface BorrowObligationLiquidityArgs {
  liquidityAmount: BN
}

export interface BorrowObligationLiquidityAccounts {
  owner: TransactionSigner
  obligation: Address
  lendingMarket: Address
  lendingMarketAuthority: Address
  borrowReserve: Address
  borrowReserveLiquidityMint: Address
  reserveSourceLiquidity: Address
  borrowReserveLiquidityFeeReceiver: Address
  userDestinationLiquidity: Address
  referrerTokenState: Option<Address>
  tokenProgram: Address
  instructionSysvarAccount: Address
}

export const layout = borsh.struct([borsh.u64("liquidityAmount")])

export function borrowObligationLiquidity(
  args: BorrowObligationLiquidityArgs,
  accounts: BorrowObligationLiquidityAccounts,
  programAddress: Address = PROGRAM_ID
) {
  const keys: Array<IAccountMeta | IAccountSignerMeta> = [
    { address: accounts.owner.address, role: 2, signer: accounts.owner },
    { address: accounts.obligation, role: 1 },
    { address: accounts.lendingMarket, role: 0 },
    { address: accounts.lendingMarketAuthority, role: 0 },
    { address: accounts.borrowReserve, role: 1 },
    { address: accounts.borrowReserveLiquidityMint, role: 0 },
    { address: accounts.reserveSourceLiquidity, role: 1 },
    { address: accounts.borrowReserveLiquidityFeeReceiver, role: 1 },
    { address: accounts.userDestinationLiquidity, role: 1 },
    isSome(accounts.referrerTokenState)
      ? { address: accounts.referrerTokenState.value, role: 1 }
      : { address: programAddress, role: 0 },
    { address: accounts.tokenProgram, role: 0 },
    { address: accounts.instructionSysvarAccount, role: 0 },
  ]
  const identifier = Buffer.from([121, 127, 18, 204, 73, 245, 225, 65])
  const buffer = Buffer.alloc(1000)
  const len = layout.encode(
    {
      liquidityAmount: args.liquidityAmount,
    },
    buffer
  )
  const data = Buffer.concat([identifier, buffer]).slice(0, 8 + len)
  const ix: IInstruction = { accounts: keys, programAddress, data }
  return ix
}
