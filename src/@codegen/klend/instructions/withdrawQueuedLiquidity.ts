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

export const DISCRIMINATOR = Buffer.from([66, 149, 187, 201, 74, 191, 174, 120])

export interface WithdrawQueuedLiquidityAccounts {
  payer: TransactionSigner
  lendingMarket: Address
  lendingMarketAuthority: Address
  reserve: Address
  reserveLiquidityMint: Address
  reserveCollateralMint: Address
  reserveLiquiditySupply: Address
  ownerQueuedCollateralVault: Address
  userDestinationLiquidity: Address
  collateralTokenProgram: Address
  liquidityTokenProgram: Address
  withdrawTicket: Address
  withdrawTicketOwner: Address
  associatedTokenProgram: Address
  systemProgram: Address
  progressCallbackProgram: Option<Address>
  progressCallbackCustomAccount0: Option<Address>
  progressCallbackCustomAccount1: Option<Address>
  instructionSysvarAccount: Address
}

export function withdrawQueuedLiquidity(
  accounts: WithdrawQueuedLiquidityAccounts,
  remainingAccounts: Array<AccountMeta | AccountSignerMeta> = [],
  programAddress: Address = PROGRAM_ID
) {
  const keys: Array<AccountMeta | AccountSignerMeta> = [
    { address: accounts.payer.address, role: 3, signer: accounts.payer },
    { address: accounts.lendingMarket, role: 0 },
    { address: accounts.lendingMarketAuthority, role: 0 },
    { address: accounts.reserve, role: 1 },
    { address: accounts.reserveLiquidityMint, role: 0 },
    { address: accounts.reserveCollateralMint, role: 1 },
    { address: accounts.reserveLiquiditySupply, role: 1 },
    { address: accounts.ownerQueuedCollateralVault, role: 1 },
    { address: accounts.userDestinationLiquidity, role: 1 },
    { address: accounts.collateralTokenProgram, role: 0 },
    { address: accounts.liquidityTokenProgram, role: 0 },
    { address: accounts.withdrawTicket, role: 1 },
    { address: accounts.withdrawTicketOwner, role: 1 },
    { address: accounts.associatedTokenProgram, role: 0 },
    { address: accounts.systemProgram, role: 0 },
    isSome(accounts.progressCallbackProgram)
      ? { address: accounts.progressCallbackProgram.value, role: 0 }
      : { address: programAddress, role: 0 },
    isSome(accounts.progressCallbackCustomAccount0)
      ? { address: accounts.progressCallbackCustomAccount0.value, role: 0 }
      : { address: programAddress, role: 0 },
    isSome(accounts.progressCallbackCustomAccount1)
      ? { address: accounts.progressCallbackCustomAccount1.value, role: 0 }
      : { address: programAddress, role: 0 },
    { address: accounts.instructionSysvarAccount, role: 0 },
    ...remainingAccounts,
  ]
  const data = DISCRIMINATOR
  const ix: Instruction = { accounts: keys, programAddress, data }
  return ix
}
