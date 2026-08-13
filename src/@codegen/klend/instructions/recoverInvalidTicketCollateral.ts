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

export const DISCRIMINATOR = Buffer.from([28, 48, 176, 102, 159, 206, 210, 246])

export interface RecoverInvalidTicketCollateralArgs {
  ticketSequenceNumber: BN
}

export interface RecoverInvalidTicketCollateralAccounts {
  payer: TransactionSigner
  lendingMarket: Address
  lendingMarketAuthority: Address
  reserve: Address
  reserveCollateralMint: Address
  ownerQueuedCollateralVault: Address
  userSourceCollateral: Address
  collateralTokenProgram: Address
  withdrawTicket: Address
  withdrawTicketOwner: Address
  instructionSysvarAccount: Address
}

export const layout = borsh.struct<RecoverInvalidTicketCollateralArgs>([
  borsh.u64("ticketSequenceNumber"),
])

export function recoverInvalidTicketCollateral(
  args: RecoverInvalidTicketCollateralArgs,
  accounts: RecoverInvalidTicketCollateralAccounts,
  remainingAccounts: Array<AccountMeta | AccountSignerMeta> = [],
  programAddress: Address = PROGRAM_ID
) {
  const keys: Array<AccountMeta | AccountSignerMeta> = [
    { address: accounts.payer.address, role: 2, signer: accounts.payer },
    { address: accounts.lendingMarket, role: 0 },
    { address: accounts.lendingMarketAuthority, role: 0 },
    { address: accounts.reserve, role: 0 },
    { address: accounts.reserveCollateralMint, role: 0 },
    { address: accounts.ownerQueuedCollateralVault, role: 1 },
    { address: accounts.userSourceCollateral, role: 1 },
    { address: accounts.collateralTokenProgram, role: 0 },
    { address: accounts.withdrawTicket, role: 1 },
    { address: accounts.withdrawTicketOwner, role: 1 },
    { address: accounts.instructionSysvarAccount, role: 0 },
    ...remainingAccounts,
  ]
  const buffer = Buffer.alloc(1000)
  const len = layout.encode(
    {
      ticketSequenceNumber: args.ticketSequenceNumber,
    },
    buffer
  )
  const data = Buffer.concat([DISCRIMINATOR, buffer]).slice(0, 8 + len)
  const ix: Instruction = { accounts: keys, programAddress, data }
  return ix
}
