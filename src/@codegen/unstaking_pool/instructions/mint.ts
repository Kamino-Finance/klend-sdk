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

export interface MintArgs {
  stakedSolToDeposit: BN
  minSharesToReceive: BN
}

export interface MintAccounts {
  user: TransactionSigner
  unstakeTicket: Address
  actionAuthority: TransactionSigner
  userStakedSolToken: Address
  userUnstakingSolToken: Address
  stakedSolMint: Address
  poolState: Address
  unstakingSolMint: Address
  basePoolAuthority: Address
  unstakingTicketAuthority: Address
  systemProgram: Address
  unstakingSolTokenProgram: Address
  stakedSolTokenProgram: Address
}

export const layout = borsh.struct([
  borsh.u64("stakedSolToDeposit"),
  borsh.u64("minSharesToReceive"),
])

export function mint(
  args: MintArgs,
  accounts: MintAccounts,
  programAddress: Address = PROGRAM_ID
) {
  const keys: Array<IAccountMeta | IAccountSignerMeta> = [
    { address: accounts.user.address, role: 3, signer: accounts.user },
    { address: accounts.unstakeTicket, role: 1 },
    {
      address: accounts.actionAuthority.address,
      role: 2,
      signer: accounts.actionAuthority,
    },
    { address: accounts.userStakedSolToken, role: 1 },
    { address: accounts.userUnstakingSolToken, role: 1 },
    { address: accounts.stakedSolMint, role: 1 },
    { address: accounts.poolState, role: 1 },
    { address: accounts.unstakingSolMint, role: 1 },
    { address: accounts.basePoolAuthority, role: 0 },
    { address: accounts.unstakingTicketAuthority, role: 0 },
    { address: accounts.systemProgram, role: 0 },
    { address: accounts.unstakingSolTokenProgram, role: 0 },
    { address: accounts.stakedSolTokenProgram, role: 0 },
  ]
  const identifier = Buffer.from([51, 57, 225, 47, 182, 146, 137, 166])
  const buffer = Buffer.alloc(1000)
  const len = layout.encode(
    {
      stakedSolToDeposit: args.stakedSolToDeposit,
      minSharesToReceive: args.minSharesToReceive,
    },
    buffer
  )
  const data = Buffer.concat([identifier, buffer]).slice(0, 8 + len)
  const ix: IInstruction = { accounts: keys, programAddress, data }
  return ix
}
