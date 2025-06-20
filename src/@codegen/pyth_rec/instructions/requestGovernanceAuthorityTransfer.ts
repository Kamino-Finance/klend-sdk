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

export interface RequestGovernanceAuthorityTransferArgs {
  targetGovernanceAuthority: Address
}

export interface RequestGovernanceAuthorityTransferAccounts {
  payer: TransactionSigner
  config: Address
}

export const layout = borsh.struct([borshAddress("targetGovernanceAuthority")])

export function requestGovernanceAuthorityTransfer(
  args: RequestGovernanceAuthorityTransferArgs,
  accounts: RequestGovernanceAuthorityTransferAccounts,
  programAddress: Address = PROGRAM_ID
) {
  const keys: Array<IAccountMeta | IAccountSignerMeta> = [
    { address: accounts.payer.address, role: 2, signer: accounts.payer },
    { address: accounts.config, role: 1 },
  ]
  const identifier = Buffer.from([92, 18, 67, 156, 27, 151, 183, 224])
  const buffer = Buffer.alloc(1000)
  const len = layout.encode(
    {
      targetGovernanceAuthority: args.targetGovernanceAuthority,
    },
    buffer
  )
  const data = Buffer.concat([identifier, buffer]).slice(0, 8 + len)
  const ix: IInstruction = { accounts: keys, programAddress, data }
  return ix
}
