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

export interface SocializeLossArgs {
  liquidityAmount: BN
}

export interface SocializeLossAccounts {
  riskCouncil: TransactionSigner
  obligation: Address
  lendingMarket: Address
  reserve: Address
  instructionSysvarAccount: Address
}

export const layout = borsh.struct([borsh.u64("liquidityAmount")])

export function socializeLoss(
  args: SocializeLossArgs,
  accounts: SocializeLossAccounts,
  programAddress: Address = PROGRAM_ID
) {
  const keys: Array<IAccountMeta | IAccountSignerMeta> = [
    {
      address: accounts.riskCouncil.address,
      role: 2,
      signer: accounts.riskCouncil,
    },
    { address: accounts.obligation, role: 1 },
    { address: accounts.lendingMarket, role: 0 },
    { address: accounts.reserve, role: 1 },
    { address: accounts.instructionSysvarAccount, role: 0 },
  ]
  const identifier = Buffer.from([245, 75, 91, 0, 236, 97, 19, 3])
  const buffer = Buffer.alloc(1000)
  const len = layout.encode(
    {
      liquidityAmount: args.liquidityAmount,
    },
    buffer
  )
  const data = Buffer.concat([identifier, buffer]).slice(0, 8 + len)
  const ix: IInstruction = { accounts: keys, programAddress, data }
  return ix
}
