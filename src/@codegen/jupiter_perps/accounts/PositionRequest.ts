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

export interface PositionRequestFields {
  owner: Address
  pool: Address
  custody: Address
  position: Address
  mint: Address
  openTime: BN
  updateTime: BN
  sizeUsdDelta: BN
  collateralDelta: BN
  requestChange: types.RequestChangeKind
  requestType: types.RequestTypeKind
  side: types.SideKind
  priceSlippage: BN | null
  jupiterMinimumOut: BN | null
  preSwapAmount: BN | null
  triggerPrice: BN | null
  triggerAboveThreshold: boolean | null
  entirePosition: boolean | null
  executed: boolean
  counter: BN
  bump: number
  referral: Address | null
}

export interface PositionRequestJSON {
  owner: string
  pool: string
  custody: string
  position: string
  mint: string
  openTime: string
  updateTime: string
  sizeUsdDelta: string
  collateralDelta: string
  requestChange: types.RequestChangeJSON
  requestType: types.RequestTypeJSON
  side: types.SideJSON
  priceSlippage: string | null
  jupiterMinimumOut: string | null
  preSwapAmount: string | null
  triggerPrice: string | null
  triggerAboveThreshold: boolean | null
  entirePosition: boolean | null
  executed: boolean
  counter: string
  bump: number
  referral: string | null
}

export class PositionRequest {
  readonly owner: Address
  readonly pool: Address
  readonly custody: Address
  readonly position: Address
  readonly mint: Address
  readonly openTime: BN
  readonly updateTime: BN
  readonly sizeUsdDelta: BN
  readonly collateralDelta: BN
  readonly requestChange: types.RequestChangeKind
  readonly requestType: types.RequestTypeKind
  readonly side: types.SideKind
  readonly priceSlippage: BN | null
  readonly jupiterMinimumOut: BN | null
  readonly preSwapAmount: BN | null
  readonly triggerPrice: BN | null
  readonly triggerAboveThreshold: boolean | null
  readonly entirePosition: boolean | null
  readonly executed: boolean
  readonly counter: BN
  readonly bump: number
  readonly referral: Address | null

  static readonly discriminator = Buffer.from([
    12, 38, 250, 199, 46, 154, 32, 216,
  ])

  static readonly layout = borsh.struct<PositionRequest>([
    borshAddress("owner"),
    borshAddress("pool"),
    borshAddress("custody"),
    borshAddress("position"),
    borshAddress("mint"),
    borsh.i64("openTime"),
    borsh.i64("updateTime"),
    borsh.u64("sizeUsdDelta"),
    borsh.u64("collateralDelta"),
    types.RequestChange.layout("requestChange"),
    types.RequestType.layout("requestType"),
    types.Side.layout("side"),
    borsh.option(borsh.u64(), "priceSlippage"),
    borsh.option(borsh.u64(), "jupiterMinimumOut"),
    borsh.option(borsh.u64(), "preSwapAmount"),
    borsh.option(borsh.u64(), "triggerPrice"),
    borsh.option(borsh.bool(), "triggerAboveThreshold"),
    borsh.option(borsh.bool(), "entirePosition"),
    borsh.bool("executed"),
    borsh.u64("counter"),
    borsh.u8("bump"),
    borsh.option(borshAddress(), "referral"),
  ])

  constructor(fields: PositionRequestFields) {
    this.owner = fields.owner
    this.pool = fields.pool
    this.custody = fields.custody
    this.position = fields.position
    this.mint = fields.mint
    this.openTime = fields.openTime
    this.updateTime = fields.updateTime
    this.sizeUsdDelta = fields.sizeUsdDelta
    this.collateralDelta = fields.collateralDelta
    this.requestChange = fields.requestChange
    this.requestType = fields.requestType
    this.side = fields.side
    this.priceSlippage = fields.priceSlippage
    this.jupiterMinimumOut = fields.jupiterMinimumOut
    this.preSwapAmount = fields.preSwapAmount
    this.triggerPrice = fields.triggerPrice
    this.triggerAboveThreshold = fields.triggerAboveThreshold
    this.entirePosition = fields.entirePosition
    this.executed = fields.executed
    this.counter = fields.counter
    this.bump = fields.bump
    this.referral = fields.referral
  }

  static async fetch(
    rpc: Rpc<GetAccountInfoApi>,
    address: Address,
    programId: Address = PROGRAM_ID
  ): Promise<PositionRequest | null> {
    const info = await fetchEncodedAccount(rpc, address)

    if (!info.exists) {
      return null
    }
    if (info.programAddress !== programId) {
      throw new Error("account doesn't belong to this program")
    }

    return this.decode(Buffer.from(info.data))
  }

  static async fetchMultiple(
    rpc: Rpc<GetMultipleAccountsApi>,
    addresses: Address[],
    programId: Address = PROGRAM_ID
  ): Promise<Array<PositionRequest | null>> {
    const infos = await fetchEncodedAccounts(rpc, addresses)

    return infos.map((info) => {
      if (!info.exists) {
        return null
      }
      if (info.programAddress !== programId) {
        throw new Error("account doesn't belong to this program")
      }

      return this.decode(Buffer.from(info.data))
    })
  }

  static decode(data: Buffer): PositionRequest {
    if (!data.slice(0, 8).equals(PositionRequest.discriminator)) {
      throw new Error("invalid account discriminator")
    }

    const dec = PositionRequest.layout.decode(data.slice(8))

    return new PositionRequest({
      owner: dec.owner,
      pool: dec.pool,
      custody: dec.custody,
      position: dec.position,
      mint: dec.mint,
      openTime: dec.openTime,
      updateTime: dec.updateTime,
      sizeUsdDelta: dec.sizeUsdDelta,
      collateralDelta: dec.collateralDelta,
      requestChange: types.RequestChange.fromDecoded(dec.requestChange),
      requestType: types.RequestType.fromDecoded(dec.requestType),
      side: types.Side.fromDecoded(dec.side),
      priceSlippage: dec.priceSlippage,
      jupiterMinimumOut: dec.jupiterMinimumOut,
      preSwapAmount: dec.preSwapAmount,
      triggerPrice: dec.triggerPrice,
      triggerAboveThreshold: dec.triggerAboveThreshold,
      entirePosition: dec.entirePosition,
      executed: dec.executed,
      counter: dec.counter,
      bump: dec.bump,
      referral: dec.referral,
    })
  }

  toJSON(): PositionRequestJSON {
    return {
      owner: this.owner,
      pool: this.pool,
      custody: this.custody,
      position: this.position,
      mint: this.mint,
      openTime: this.openTime.toString(),
      updateTime: this.updateTime.toString(),
      sizeUsdDelta: this.sizeUsdDelta.toString(),
      collateralDelta: this.collateralDelta.toString(),
      requestChange: this.requestChange.toJSON(),
      requestType: this.requestType.toJSON(),
      side: this.side.toJSON(),
      priceSlippage:
        (this.priceSlippage && this.priceSlippage.toString()) || null,
      jupiterMinimumOut:
        (this.jupiterMinimumOut && this.jupiterMinimumOut.toString()) || null,
      preSwapAmount:
        (this.preSwapAmount && this.preSwapAmount.toString()) || null,
      triggerPrice: (this.triggerPrice && this.triggerPrice.toString()) || null,
      triggerAboveThreshold: this.triggerAboveThreshold,
      entirePosition: this.entirePosition,
      executed: this.executed,
      counter: this.counter.toString(),
      bump: this.bump,
      referral: this.referral,
    }
  }

  static fromJSON(obj: PositionRequestJSON): PositionRequest {
    return new PositionRequest({
      owner: address(obj.owner),
      pool: address(obj.pool),
      custody: address(obj.custody),
      position: address(obj.position),
      mint: address(obj.mint),
      openTime: new BN(obj.openTime),
      updateTime: new BN(obj.updateTime),
      sizeUsdDelta: new BN(obj.sizeUsdDelta),
      collateralDelta: new BN(obj.collateralDelta),
      requestChange: types.RequestChange.fromJSON(obj.requestChange),
      requestType: types.RequestType.fromJSON(obj.requestType),
      side: types.Side.fromJSON(obj.side),
      priceSlippage: (obj.priceSlippage && new BN(obj.priceSlippage)) || null,
      jupiterMinimumOut:
        (obj.jupiterMinimumOut && new BN(obj.jupiterMinimumOut)) || null,
      preSwapAmount: (obj.preSwapAmount && new BN(obj.preSwapAmount)) || null,
      triggerPrice: (obj.triggerPrice && new BN(obj.triggerPrice)) || null,
      triggerAboveThreshold: obj.triggerAboveThreshold,
      entirePosition: obj.entirePosition,
      executed: obj.executed,
      counter: new BN(obj.counter),
      bump: obj.bump,
      referral: (obj.referral && address(obj.referral)) || null,
    })
  }
}
