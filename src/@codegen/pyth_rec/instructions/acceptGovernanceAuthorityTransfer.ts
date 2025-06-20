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

export interface AcceptGovernanceAuthorityTransferAccounts {
  payer: TransactionSigner
  config: Address
}

export function acceptGovernanceAuthorityTransfer(
  accounts: AcceptGovernanceAuthorityTransferAccounts,
  programAddress: Address = PROGRAM_ID
) {
  const keys: Array<IAccountMeta | IAccountSignerMeta> = [
    { address: accounts.payer.address, role: 2, signer: accounts.payer },
    { address: accounts.config, role: 1 },
  ]
  const identifier = Buffer.from([254, 39, 222, 79, 64, 217, 205, 127])
  const data = identifier
  const ix: IInstruction = { accounts: keys, programAddress, data }
  return ix
}
