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

export const DISCRIMINATOR = Buffer.from([180, 83, 122, 44, 120, 211, 47, 22])

export interface CancelWithdrawTicketArgs {
  ticketSequenceNumber: BN
  collateralAmountToCancel: BN
}

export interface CancelWithdrawTicketAccounts {
  owner: TransactionSigner
  lendingMarket: Address
  lendingMarketAuthority: Address
  reserve: Address
  reserveCollateralMint: Address
  ownerQueuedCollateralVault: Address
  userDestinationCollateral: Address
  collateralTokenProgram: Address
  withdrawTicket: Address
}

export const layout = borsh.struct<CancelWithdrawTicketArgs>([
  borsh.u64("ticketSequenceNumber"),
  borsh.u64("collateralAmountToCancel"),
])

export function cancelWithdrawTicket(
  args: CancelWithdrawTicketArgs,
  accounts: CancelWithdrawTicketAccounts,
  remainingAccounts: Array<AccountMeta | AccountSignerMeta> = [],
  programAddress: Address = PROGRAM_ID
) {
  const keys: Array<AccountMeta | AccountSignerMeta> = [
    { address: accounts.owner.address, role: 2, signer: accounts.owner },
    { address: accounts.lendingMarket, role: 0 },
    { address: accounts.lendingMarketAuthority, role: 0 },
    { address: accounts.reserve, role: 1 },
    { address: accounts.reserveCollateralMint, role: 0 },
    { address: accounts.ownerQueuedCollateralVault, role: 1 },
    { address: accounts.userDestinationCollateral, role: 1 },
    { address: accounts.collateralTokenProgram, role: 0 },
    { address: accounts.withdrawTicket, role: 1 },
    ...remainingAccounts,
  ]
  const buffer = Buffer.alloc(1000)
  const len = layout.encode(
    {
      ticketSequenceNumber: args.ticketSequenceNumber,
      collateralAmountToCancel: args.collateralAmountToCancel,
    },
    buffer
  )
  const data = Buffer.concat([DISCRIMINATOR, buffer]).slice(0, 8 + len)
  const ix: Instruction = { accounts: keys, programAddress, data }
  return ix
}
