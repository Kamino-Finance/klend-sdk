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

export interface SetDataSourcesArgs {
  validDataSources: Array<types.DataSourceFields>
}

export interface SetDataSourcesAccounts {
  payer: TransactionSigner
  config: Address
}

export const layout = borsh.struct([
  borsh.vec(types.DataSource.layout(), "validDataSources"),
])

export function setDataSources(
  args: SetDataSourcesArgs,
  accounts: SetDataSourcesAccounts,
  programAddress: Address = PROGRAM_ID
) {
  const keys: Array<IAccountMeta | IAccountSignerMeta> = [
    { address: accounts.payer.address, role: 2, signer: accounts.payer },
    { address: accounts.config, role: 1 },
  ]
  const identifier = Buffer.from([107, 73, 15, 119, 195, 116, 91, 210])
  const buffer = Buffer.alloc(1000)
  const len = layout.encode(
    {
      validDataSources: args.validDataSources.map((item) =>
        types.DataSource.toEncodable(item)
      ),
    },
    buffer
  )
  const data = Buffer.concat([identifier, buffer]).slice(0, 8 + len)
  const ix: IInstruction = { accounts: keys, programAddress, data }
  return ix
}
