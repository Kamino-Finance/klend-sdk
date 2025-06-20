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

export interface WithdrawObligationCollateralArgs {
  collateralAmount: BN
}

export interface WithdrawObligationCollateralAccounts {
  owner: TransactionSigner
  obligation: Address
  lendingMarket: Address
  lendingMarketAuthority: Address
  withdrawReserve: Address
  reserveSourceCollateral: Address
  userDestinationCollateral: Address
  tokenProgram: Address
  instructionSysvarAccount: Address
}

export const layout = borsh.struct([borsh.u64("collateralAmount")])

export function withdrawObligationCollateral(
  args: WithdrawObligationCollateralArgs,
  accounts: WithdrawObligationCollateralAccounts,
  programAddress: Address = PROGRAM_ID
) {
  const keys: Array<IAccountMeta | IAccountSignerMeta> = [
    { address: accounts.owner.address, role: 2, signer: accounts.owner },
    { address: accounts.obligation, role: 1 },
    { address: accounts.lendingMarket, role: 0 },
    { address: accounts.lendingMarketAuthority, role: 0 },
    { address: accounts.withdrawReserve, role: 1 },
    { address: accounts.reserveSourceCollateral, role: 1 },
    { address: accounts.userDestinationCollateral, role: 1 },
    { address: accounts.tokenProgram, role: 0 },
    { address: accounts.instructionSysvarAccount, role: 0 },
  ]
  const identifier = Buffer.from([37, 116, 205, 103, 243, 192, 92, 198])
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
