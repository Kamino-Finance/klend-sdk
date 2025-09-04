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

export interface BurnArgs {
  sharesToBurn: BN
  minWsolToReceive: BN
}

export interface BurnAccounts {
  user: TransactionSigner
  userWsolToken: Address
  userUnstakingSolToken: Address
  wsolVault: Address
  wsolMint: Address
  poolState: Address
  unstakeTicket: Address
  unstakingSolMint: Address
  basePoolAuthority: Address
  tokenProgram: Address
}

export const layout = borsh.struct([
  borsh.u64("sharesToBurn"),
  borsh.u64("minWsolToReceive"),
])

export function burn(
  args: BurnArgs,
  accounts: BurnAccounts,
  programAddress: Address = PROGRAM_ID
) {
  const keys: Array<IAccountMeta | IAccountSignerMeta> = [
    { address: accounts.user.address, role: 3, signer: accounts.user },
    { address: accounts.userWsolToken, role: 1 },
    { address: accounts.userUnstakingSolToken, role: 1 },
    { address: accounts.wsolVault, role: 1 },
    { address: accounts.wsolMint, role: 1 },
    { address: accounts.poolState, role: 1 },
    { address: accounts.unstakeTicket, role: 1 },
    { address: accounts.unstakingSolMint, role: 1 },
    { address: accounts.basePoolAuthority, role: 0 },
    { address: accounts.tokenProgram, role: 0 },
  ]
  const identifier = Buffer.from([116, 110, 29, 56, 107, 219, 42, 93])
  const buffer = Buffer.alloc(1000)
  const len = layout.encode(
    {
      sharesToBurn: args.sharesToBurn,
      minWsolToReceive: args.minWsolToReceive,
    },
    buffer
  )
  const data = Buffer.concat([identifier, buffer]).slice(0, 8 + len)
  const ix: IInstruction = { accounts: keys, programAddress, data }
  return ix
}
