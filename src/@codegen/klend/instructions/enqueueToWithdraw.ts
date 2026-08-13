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

export const DISCRIMINATOR = Buffer.from([134, 113, 160, 207, 90, 75, 213, 219])

export interface EnqueueToWithdrawArgs {
  collateralAmount: BN
  progressCallbackType: types.ProgressCallbackTypeKind
}

export interface EnqueueToWithdrawAccounts {
  owner: TransactionSigner
  lendingMarket: Address
  lendingMarketAuthority: Address
  reserve: Address
  userSourceCollateralTa: Address
  userDestinationLiquidityTa: Address
  reserveLiquidityMint: Address
  reserveCollateralMint: Address
  collateralTokenProgram: Address
  withdrawTicket: Address
  ownerQueuedCollateralVault: Address
  systemProgram: Address
  progressCallbackCustomAccount0: Option<Address>
  progressCallbackCustomAccount1: Option<Address>
  instructionSysvarAccount: Address
}

export const layout = borsh.struct([
  borsh.u64("collateralAmount"),
  types.ProgressCallbackType.layout("progressCallbackType"),
])

export function enqueueToWithdraw(
  args: EnqueueToWithdrawArgs,
  accounts: EnqueueToWithdrawAccounts,
  remainingAccounts: Array<AccountMeta | AccountSignerMeta> = [],
  programAddress: Address = PROGRAM_ID
) {
  const keys: Array<AccountMeta | AccountSignerMeta> = [
    { address: accounts.owner.address, role: 3, signer: accounts.owner },
    { address: accounts.lendingMarket, role: 0 },
    { address: accounts.lendingMarketAuthority, role: 0 },
    { address: accounts.reserve, role: 1 },
    { address: accounts.userSourceCollateralTa, role: 1 },
    { address: accounts.userDestinationLiquidityTa, role: 0 },
    { address: accounts.reserveLiquidityMint, role: 0 },
    { address: accounts.reserveCollateralMint, role: 0 },
    { address: accounts.collateralTokenProgram, role: 0 },
    { address: accounts.withdrawTicket, role: 1 },
    { address: accounts.ownerQueuedCollateralVault, role: 1 },
    { address: accounts.systemProgram, role: 0 },
    isSome(accounts.progressCallbackCustomAccount0)
      ? { address: accounts.progressCallbackCustomAccount0.value, role: 0 }
      : { address: programAddress, role: 0 },
    isSome(accounts.progressCallbackCustomAccount1)
      ? { address: accounts.progressCallbackCustomAccount1.value, role: 0 }
      : { address: programAddress, role: 0 },
    { address: accounts.instructionSysvarAccount, role: 0 },
    ...remainingAccounts,
  ]
  const buffer = Buffer.alloc(1000)
  const len = layout.encode(
    {
      collateralAmount: args.collateralAmount,
      progressCallbackType: args.progressCallbackType.toEncodable(),
    },
    buffer
  )
  const data = Buffer.concat([DISCRIMINATOR, buffer]).slice(0, 8 + len)
  const ix: Instruction = { accounts: keys, programAddress, data }
  return ix
}
