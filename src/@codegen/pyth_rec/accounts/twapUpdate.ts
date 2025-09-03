/* eslint-disable @typescript-eslint/no-unused-vars */
import {
  address,
  Address,
  fetchEncodedAccount,
  fetchEncodedAccounts,
  GetAccountInfoApi,
  GetMultipleAccountsApi,
  Rpc,
} from "@solana/kit"
/* eslint-enable @typescript-eslint/no-unused-vars */
import BN from "bn.js" // eslint-disable-line @typescript-eslint/no-unused-vars
import * as borsh from "@coral-xyz/borsh" // eslint-disable-line @typescript-eslint/no-unused-vars
import { borshAddress } from "../utils" // eslint-disable-line @typescript-eslint/no-unused-vars
import * as types from "../types" // eslint-disable-line @typescript-eslint/no-unused-vars
import { PROGRAM_ID } from "../programId"

export interface twapUpdateFields {
  writeAuthority: Address
  twap: types.TwapPriceFields
}

export interface twapUpdateJSON {
  writeAuthority: string
  twap: types.TwapPriceJSON
}

export class twapUpdate {
  readonly writeAuthority: Address
  readonly twap: types.TwapPrice

  static readonly discriminator = Buffer.from([
    104, 192, 188, 72, 246, 166, 12, 81,
  ])

  static readonly layout = borsh.struct<twapUpdate>([
    borshAddress("writeAuthority"),
    types.TwapPrice.layout("twap"),
  ])

  constructor(fields: twapUpdateFields) {
    this.writeAuthority = fields.writeAuthority
    this.twap = new types.TwapPrice({ ...fields.twap })
  }

  static async fetch(
    rpc: Rpc<GetAccountInfoApi>,
    address: Address,
    programId: Address = PROGRAM_ID
  ): Promise<twapUpdate | null> {
    const info = await fetchEncodedAccount(rpc, address)

    if (!info.exists) {
      return null
    }
    if (info.programAddress !== programId) {
      throw new Error(
        `twapUpdateFields account ${address} belongs to wrong program ${info.programAddress}, expected ${programId}`
      )
    }

    return this.decode(Buffer.from(info.data))
  }

  static async fetchMultiple(
    rpc: Rpc<GetMultipleAccountsApi>,
    addresses: Address[],
    programId: Address = PROGRAM_ID
  ): Promise<Array<twapUpdate | null>> {
    const infos = await fetchEncodedAccounts(rpc, addresses)

    return infos.map((info) => {
      if (!info.exists) {
        return null
      }
      if (info.programAddress !== programId) {
        throw new Error(
          `twapUpdateFields account ${info.address} belongs to wrong program ${info.programAddress}, expected ${programId}`
        )
      }

      return this.decode(Buffer.from(info.data))
    })
  }

  static decode(data: Buffer): twapUpdate {
    if (!data.slice(0, 8).equals(twapUpdate.discriminator)) {
      throw new Error("invalid account discriminator")
    }

    const dec = twapUpdate.layout.decode(data.slice(8))

    return new twapUpdate({
      writeAuthority: dec.writeAuthority,
      twap: types.TwapPrice.fromDecoded(dec.twap),
    })
  }

  toJSON(): twapUpdateJSON {
    return {
      writeAuthority: this.writeAuthority,
      twap: this.twap.toJSON(),
    }
  }

  static fromJSON(obj: twapUpdateJSON): twapUpdate {
    return new twapUpdate({
      writeAuthority: address(obj.writeAuthority),
      twap: types.TwapPrice.fromJSON(obj.twap),
    })
  }
}
