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

export interface DepositObligationCollateralArgs {
  collateralAmount: BN
}

export interface DepositObligationCollateralAccounts {
  owner: TransactionSigner
  obligation: Address
  lendingMarket: Address
  depositReserve: Address
  reserveDestinationCollateral: Address
  userSourceCollateral: Address
  tokenProgram: Address
  instructionSysvarAccount: Address
}

export const layout = borsh.struct([borsh.u64("collateralAmount")])

export function depositObligationCollateral(
  args: DepositObligationCollateralArgs,
  accounts: DepositObligationCollateralAccounts,
  programAddress: Address = PROGRAM_ID
) {
  const keys: Array<IAccountMeta | IAccountSignerMeta> = [
    { address: accounts.owner.address, role: 2, signer: accounts.owner },
    { address: accounts.obligation, role: 1 },
    { address: accounts.lendingMarket, role: 0 },
    { address: accounts.depositReserve, role: 1 },
    { address: accounts.reserveDestinationCollateral, role: 1 },
    { address: accounts.userSourceCollateral, role: 1 },
    { address: accounts.tokenProgram, role: 0 },
    { address: accounts.instructionSysvarAccount, role: 0 },
  ]
  const identifier = Buffer.from([108, 209, 4, 72, 21, 22, 118, 133])
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
