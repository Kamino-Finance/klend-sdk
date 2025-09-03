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
  /** Pubkey of the referrer/owner */
  referrer: Address
  /** Token mint for the account */
  mint: Address
  /** Amount that has been accumulated and not claimed yet -> available to claim (scaled fraction) */
  amountUnclaimedSf: BN
  /** Amount that has been accumulated in total -> both already claimed and unclaimed (scaled fraction) */
  amountCumulativeSf: BN
  /** Referrer token state bump, used for address validation */
  bump: BN
  padding: Array<BN>
}

export interface ReferrerTokenStateJSON {
  /** Pubkey of the referrer/owner */
  referrer: string
  /** Token mint for the account */
  mint: string
  /** Amount that has been accumulated and not claimed yet -> available to claim (scaled fraction) */
  amountUnclaimedSf: string
  /** Amount that has been accumulated in total -> both already claimed and unclaimed (scaled fraction) */
  amountCumulativeSf: string
  /** Referrer token state bump, used for address validation */
  bump: string
  padding: Array<string>
}

/** Referrer account -> each owner can have multiple accounts for specific reserves */
export class ReferrerTokenState {
  /** Pubkey of the referrer/owner */
  readonly referrer: Address
  /** Token mint for the account */
  readonly mint: Address
  /** Amount that has been accumulated and not claimed yet -> available to claim (scaled fraction) */
  readonly amountUnclaimedSf: BN
  /** Amount that has been accumulated in total -> both already claimed and unclaimed (scaled fraction) */
  readonly amountCumulativeSf: BN
  /** Referrer token state bump, used for address validation */
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
