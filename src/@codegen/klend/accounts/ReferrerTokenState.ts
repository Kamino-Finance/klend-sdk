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

export interface ReferrerTokenStateFields {
  referrer: Address
  mint: Address
  amountUnclaimedSf: BN
  amountCumulativeSf: BN
  bump: BN
  padding: Array<BN>
}

export interface ReferrerTokenStateJSON {
  referrer: string
  mint: string
  amountUnclaimedSf: string
  amountCumulativeSf: string
  bump: string
  padding: Array<string>
}

export class ReferrerTokenState {
  readonly referrer: Address
  readonly mint: Address
  readonly amountUnclaimedSf: BN
  readonly amountCumulativeSf: BN
  readonly bump: BN
  readonly padding: Array<BN>

  static readonly discriminator = Buffer.from([
    39, 15, 208, 77, 32, 195, 105, 56,
  ])

  static readonly layout = borsh.struct<ReferrerTokenState>([
    borshAddress("referrer"),
    borshAddress("mint"),
    borsh.u128("amountUnclaimedSf"),
    borsh.u128("amountCumulativeSf"),
    borsh.u64("bump"),
    borsh.array(borsh.u64(), 31, "padding"),
  ])

  constructor(fields: ReferrerTokenStateFields) {
    this.referrer = fields.referrer
    this.mint = fields.mint
    this.amountUnclaimedSf = fields.amountUnclaimedSf
    this.amountCumulativeSf = fields.amountCumulativeSf
    this.bump = fields.bump
    this.padding = fields.padding
  }

  static async fetch(
    rpc: Rpc<GetAccountInfoApi>,
    address: Address,
    programId: Address = PROGRAM_ID
  ): Promise<ReferrerTokenState | null> {
    const info = await fetchEncodedAccount(rpc, address)

    if (!info.exists) {
      return null
    }
    if (info.programAddress !== programId) {
      throw new Error(
        `ReferrerTokenStateFields account ${address} belongs to wrong program ${info.programAddress}, expected ${programId}`
      )
    }

    return this.decode(Buffer.from(info.data))
  }

  static async fetchMultiple(
    rpc: Rpc<GetMultipleAccountsApi>,
    addresses: Address[],
    programId: Address = PROGRAM_ID
  ): Promise<Array<ReferrerTokenState | null>> {
    const infos = await fetchEncodedAccounts(rpc, addresses)

    return infos.map((info) => {
      if (!info.exists) {
        return null
      }
      if (info.programAddress !== programId) {
        throw new Error(
          `ReferrerTokenStateFields account ${info.address} belongs to wrong program ${info.programAddress}, expected ${programId}`
        )
      }

      return this.decode(Buffer.from(info.data))
    })
  }

  static decode(data: Buffer): ReferrerTokenState {
    if (!data.slice(0, 8).equals(ReferrerTokenState.discriminator)) {
      throw new Error("invalid account discriminator")
    }

    const dec = ReferrerTokenState.layout.decode(data.slice(8))

    return new ReferrerTokenState({
      referrer: dec.referrer,
      mint: dec.mint,
      amountUnclaimedSf: dec.amountUnclaimedSf,
      amountCumulativeSf: dec.amountCumulativeSf,
      bump: dec.bump,
      padding: dec.padding,
    })
  }

  toJSON(): ReferrerTokenStateJSON {
    return {
      referrer: this.referrer,
      mint: this.mint,
      amountUnclaimedSf: this.amountUnclaimedSf.toString(),
      amountCumulativeSf: this.amountCumulativeSf.toString(),
      bump: this.bump.toString(),
      padding: this.padding.map((item) => item.toString()),
    }
  }

  static fromJSON(obj: ReferrerTokenStateJSON): ReferrerTokenState {
    return new ReferrerTokenState({
      referrer: address(obj.referrer),
      mint: address(obj.mint),
      amountUnclaimedSf: new BN(obj.amountUnclaimedSf),
      amountCumulativeSf: new BN(obj.amountCumulativeSf),
      bump: new BN(obj.bump),
      padding: obj.padding.map((item) => new BN(item)),
    })
  }
}
