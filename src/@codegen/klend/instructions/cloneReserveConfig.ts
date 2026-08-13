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

export const DISCRIMINATOR = Buffer.from([244, 5, 198, 113, 17, 10, 71, 33])

export interface CloneReserveConfigArgs {
  customizations: types.ReserveConfigCustomizationArgsFields
}

export interface CloneReserveConfigAccounts {
  signer: TransactionSigner
  targetLendingMarket: Address
  sourceReserve: Address
  targetReserve: Address
  instructionSysvarAccount: Address
}

export const layout = borsh.struct<CloneReserveConfigArgs>([
  types.ReserveConfigCustomizationArgs.layout("customizations"),
])

export function cloneReserveConfig(
  args: CloneReserveConfigArgs,
  accounts: CloneReserveConfigAccounts,
  remainingAccounts: Array<AccountMeta | AccountSignerMeta> = [],
  programAddress: Address = PROGRAM_ID
) {
  const keys: Array<AccountMeta | AccountSignerMeta> = [
    { address: accounts.signer.address, role: 2, signer: accounts.signer },
    { address: accounts.targetLendingMarket, role: 0 },
    { address: accounts.sourceReserve, role: 0 },
    { address: accounts.targetReserve, role: 1 },
    { address: accounts.instructionSysvarAccount, role: 0 },
    ...remainingAccounts,
  ]
  const buffer = Buffer.alloc(1000)
  const len = layout.encode(
    {
      customizations: types.ReserveConfigCustomizationArgs.toEncodable(
        args.customizations
      ),
    },
    buffer
  )
  const data = Buffer.concat([DISCRIMINATOR, buffer]).slice(0, 8 + len)
  const ix: Instruction = { accounts: keys, programAddress, data }
  return ix
}
