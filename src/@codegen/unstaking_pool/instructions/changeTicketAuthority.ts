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

export interface ChangeTicketAuthorityAccounts {
  user: TransactionSigner
  newAuthority: Address
  unstakeTicket: Address
}

export function changeTicketAuthority(
  accounts: ChangeTicketAuthorityAccounts,
  programAddress: Address = PROGRAM_ID
) {
  const keys: Array<IAccountMeta | IAccountSignerMeta> = [
    { address: accounts.user.address, role: 2, signer: accounts.user },
    { address: accounts.newAuthority, role: 0 },
    { address: accounts.unstakeTicket, role: 1 },
  ]
  const identifier = Buffer.from([186, 77, 121, 131, 25, 104, 255, 108])
  const data = identifier
  const ix: IInstruction = { accounts: keys, programAddress, data }
  return ix
}
