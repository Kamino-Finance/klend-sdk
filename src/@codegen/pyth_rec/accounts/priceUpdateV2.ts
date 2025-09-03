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

export interface priceUpdateV2Fields {
  writeAuthority: Address
  verificationLevel: types.VerificationLevelKind
  priceMessage: types.PriceFeedMessageFields
  postedSlot: BN
}

export interface priceUpdateV2JSON {
  writeAuthority: string
  verificationLevel: types.VerificationLevelJSON
  priceMessage: types.PriceFeedMessageJSON
  postedSlot: string
}

export class priceUpdateV2 {
  readonly writeAuthority: Address
  readonly verificationLevel: types.VerificationLevelKind
  readonly priceMessage: types.PriceFeedMessage
  readonly postedSlot: BN

  static readonly discriminator = Buffer.from([
    34, 241, 35, 99, 157, 126, 244, 205,
  ])

  static readonly layout = borsh.struct<priceUpdateV2>([
    borshAddress("writeAuthority"),
    types.VerificationLevel.layout("verificationLevel"),
    types.PriceFeedMessage.layout("priceMessage"),
    borsh.u64("postedSlot"),
  ])

  constructor(fields: priceUpdateV2Fields) {
    this.writeAuthority = fields.writeAuthority
    this.verificationLevel = fields.verificationLevel
    this.priceMessage = new types.PriceFeedMessage({ ...fields.priceMessage })
    this.postedSlot = fields.postedSlot
  }

  static async fetch(
    rpc: Rpc<GetAccountInfoApi>,
    address: Address,
    programId: Address = PROGRAM_ID
  ): Promise<priceUpdateV2 | null> {
    const info = await fetchEncodedAccount(rpc, address)

    if (!info.exists) {
      return null
    }
    if (info.programAddress !== programId) {
      throw new Error(
        `priceUpdateV2Fields account ${address} belongs to wrong program ${info.programAddress}, expected ${programId}`
      )
    }

    return this.decode(Buffer.from(info.data))
  }

  static async fetchMultiple(
    rpc: Rpc<GetMultipleAccountsApi>,
    addresses: Address[],
    programId: Address = PROGRAM_ID
  ): Promise<Array<priceUpdateV2 | null>> {
    const infos = await fetchEncodedAccounts(rpc, addresses)

    return infos.map((info) => {
      if (!info.exists) {
        return null
      }
      if (info.programAddress !== programId) {
        throw new Error(
          `priceUpdateV2Fields account ${info.address} belongs to wrong program ${info.programAddress}, expected ${programId}`
        )
      }

      return this.decode(Buffer.from(info.data))
    })
  }

  static decode(data: Buffer): priceUpdateV2 {
    if (!data.slice(0, 8).equals(priceUpdateV2.discriminator)) {
      throw new Error("invalid account discriminator")
    }

    const dec = priceUpdateV2.layout.decode(data.slice(8))

    return new priceUpdateV2({
      writeAuthority: dec.writeAuthority,
      verificationLevel: types.VerificationLevel.fromDecoded(
        dec.verificationLevel
      ),
      priceMessage: types.PriceFeedMessage.fromDecoded(dec.priceMessage),
      postedSlot: dec.postedSlot,
    })
  }

  toJSON(): priceUpdateV2JSON {
    return {
      writeAuthority: this.writeAuthority,
      verificationLevel: this.verificationLevel.toJSON(),
      priceMessage: this.priceMessage.toJSON(),
      postedSlot: this.postedSlot.toString(),
    }
  }

  static fromJSON(obj: priceUpdateV2JSON): priceUpdateV2 {
    return new priceUpdateV2({
      writeAuthority: address(obj.writeAuthority),
      verificationLevel: types.VerificationLevel.fromJSON(
        obj.verificationLevel
      ),
      priceMessage: types.PriceFeedMessage.fromJSON(obj.priceMessage),
      postedSlot: new BN(obj.postedSlot),
    })
  }
}
