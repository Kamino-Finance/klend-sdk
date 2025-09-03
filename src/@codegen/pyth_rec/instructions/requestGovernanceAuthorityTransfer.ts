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

export const DISCRIMINATOR = Buffer.from([92, 18, 67, 156, 27, 151, 183, 224])

export interface RequestGovernanceAuthorityTransferArgs {
  targetGovernanceAuthority: Address
}

export interface RequestGovernanceAuthorityTransferAccounts {
  payer: TransactionSigner
  config: Address
}

export const layout = borsh.struct<RequestGovernanceAuthorityTransferArgs>([
  borshAddress("targetGovernanceAuthority"),
])

export function requestGovernanceAuthorityTransfer(
  args: RequestGovernanceAuthorityTransferArgs,
  accounts: RequestGovernanceAuthorityTransferAccounts,
  remainingAccounts: Array<AccountMeta | AccountSignerMeta> = [],
  programAddress: Address = PROGRAM_ID
) {
  const keys: Array<AccountMeta | AccountSignerMeta> = [
    { address: accounts.payer.address, role: 2, signer: accounts.payer },
    { address: accounts.config, role: 1 },
    ...remainingAccounts,
  ]
  const buffer = Buffer.alloc(1000)
  const len = layout.encode(
    {
      targetGovernanceAuthority: args.targetGovernanceAuthority,
    },
    buffer
  )
  const data = Buffer.concat([DISCRIMINATOR, buffer]).slice(0, 8 + len)
  const ix: Instruction = { accounts: keys, programAddress, data }
  return ix
}
