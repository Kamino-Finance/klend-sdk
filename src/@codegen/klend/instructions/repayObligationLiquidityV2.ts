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

export interface RepayObligationLiquidityV2Args {
  liquidityAmount: BN
}

export interface RepayObligationLiquidityV2Accounts {
  repayAccounts: {
    owner: TransactionSigner
    obligation: Address
    lendingMarket: Address
    repayReserve: Address
    reserveLiquidityMint: Address
    reserveDestinationLiquidity: Address
    userSourceLiquidity: Address
    tokenProgram: Address
    instructionSysvarAccount: Address
  }
  farmsAccounts: {
    obligationFarmUserState: Option<Address>
    reserveFarmState: Option<Address>
  }
  lendingMarketAuthority: Address
  farmsProgram: Address
}

export const layout = borsh.struct([borsh.u64("liquidityAmount")])

export function repayObligationLiquidityV2(
  args: RepayObligationLiquidityV2Args,
  accounts: RepayObligationLiquidityV2Accounts,
  programAddress: Address = PROGRAM_ID
) {
  const keys: Array<IAccountMeta | IAccountSignerMeta> = [
    {
      address: accounts.repayAccounts.owner.address,
      role: 2,
      signer: accounts.repayAccounts.owner,
    },
    { address: accounts.repayAccounts.obligation, role: 1 },
    { address: accounts.repayAccounts.lendingMarket, role: 0 },
    { address: accounts.repayAccounts.repayReserve, role: 1 },
    { address: accounts.repayAccounts.reserveLiquidityMint, role: 0 },
    { address: accounts.repayAccounts.reserveDestinationLiquidity, role: 1 },
    { address: accounts.repayAccounts.userSourceLiquidity, role: 1 },
    { address: accounts.repayAccounts.tokenProgram, role: 0 },
    { address: accounts.repayAccounts.instructionSysvarAccount, role: 0 },
    isSome(accounts.farmsAccounts.obligationFarmUserState)
      ? {
          address: accounts.farmsAccounts.obligationFarmUserState.value,
          role: 1,
        }
      : { address: programAddress, role: 0 },
    isSome(accounts.farmsAccounts.reserveFarmState)
      ? { address: accounts.farmsAccounts.reserveFarmState.value, role: 1 }
      : { address: programAddress, role: 0 },
    { address: accounts.lendingMarketAuthority, role: 0 },
    { address: accounts.farmsProgram, role: 0 },
  ]
  const identifier = Buffer.from([116, 174, 213, 76, 180, 53, 210, 144])
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
