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

export interface WithdrawTicketFields {
  sequenceNumber: BN
  owner: Address
  reserve: Address
  userDestinationLiquidityTa: Address
  queuedCollateralAmount: BN
  createdAtTimestamp: BN
  invalid: number
  progressCallbackType: number
  alignmentPadding: Array<number>
  progressCallbackCustomAccounts: Array<Address>
  endPadding: Array<BN>
}

export interface WithdrawTicketJSON {
  sequenceNumber: string
  owner: string
  reserve: string
  userDestinationLiquidityTa: string
  queuedCollateralAmount: string
  createdAtTimestamp: string
  invalid: number
  progressCallbackType: number
  alignmentPadding: Array<number>
  progressCallbackCustomAccounts: Array<string>
  endPadding: Array<string>
}

export class WithdrawTicket {
  readonly sequenceNumber: BN
  readonly owner: Address
  readonly reserve: Address
  readonly userDestinationLiquidityTa: Address
  readonly queuedCollateralAmount: BN
  readonly createdAtTimestamp: BN
  readonly invalid: number
  readonly progressCallbackType: number
  readonly alignmentPadding: Array<number>
  readonly progressCallbackCustomAccounts: Array<Address>
  readonly endPadding: Array<BN>

  static readonly discriminator = Buffer.from([
    237, 23, 164, 58, 53, 248, 240, 94,
  ])

  static readonly layout = borsh.struct<WithdrawTicket>([
    borsh.u64("sequenceNumber"),
    borshAddress("owner"),
    borshAddress("reserve"),
    borshAddress("userDestinationLiquidityTa"),
    borsh.u64("queuedCollateralAmount"),
    borsh.u64("createdAtTimestamp"),
    borsh.u8("invalid"),
    borsh.u8("progressCallbackType"),
    borsh.array(borsh.u8(), 6, "alignmentPadding"),
    borsh.array(borshAddress(), 2, "progressCallbackCustomAccounts"),
    borsh.array(borsh.u64(), 40, "endPadding"),
  ])

  constructor(fields: WithdrawTicketFields) {
    this.sequenceNumber = fields.sequenceNumber
    this.owner = fields.owner
    this.reserve = fields.reserve
    this.userDestinationLiquidityTa = fields.userDestinationLiquidityTa
    this.queuedCollateralAmount = fields.queuedCollateralAmount
    this.createdAtTimestamp = fields.createdAtTimestamp
    this.invalid = fields.invalid
    this.progressCallbackType = fields.progressCallbackType
    this.alignmentPadding = fields.alignmentPadding
    this.progressCallbackCustomAccounts = fields.progressCallbackCustomAccounts
    this.endPadding = fields.endPadding
  }

  static async fetch(
    rpc: Rpc<GetAccountInfoApi>,
    address: Address,
    programId: Address = PROGRAM_ID
  ): Promise<WithdrawTicket | null> {
    const info = await fetchEncodedAccount(rpc, address)

    if (!info.exists) {
      return null
    }
    if (info.programAddress !== programId) {
      throw new Error(
        `WithdrawTicketFields account ${address} belongs to wrong program ${info.programAddress}, expected ${programId}`
      )
    }

    return this.decode(Buffer.from(info.data))
  }

  static async fetchMultiple(
    rpc: Rpc<GetMultipleAccountsApi>,
    addresses: Address[],
    programId: Address = PROGRAM_ID
  ): Promise<Array<WithdrawTicket | null>> {
    const infos = await fetchEncodedAccounts(rpc, addresses)

    return infos.map((info) => {
      if (!info.exists) {
        return null
      }
      if (info.programAddress !== programId) {
        throw new Error(
          `WithdrawTicketFields account ${info.address} belongs to wrong program ${info.programAddress}, expected ${programId}`
        )
      }

      return this.decode(Buffer.from(info.data))
    })
  }

  static decode(data: Buffer): WithdrawTicket {
    if (!data.slice(0, 8).equals(WithdrawTicket.discriminator)) {
      throw new Error("invalid account discriminator")
    }

    const dec = WithdrawTicket.layout.decode(data.slice(8))

    return new WithdrawTicket({
      sequenceNumber: dec.sequenceNumber,
      owner: dec.owner,
      reserve: dec.reserve,
      userDestinationLiquidityTa: dec.userDestinationLiquidityTa,
      queuedCollateralAmount: dec.queuedCollateralAmount,
      createdAtTimestamp: dec.createdAtTimestamp,
      invalid: dec.invalid,
      progressCallbackType: dec.progressCallbackType,
      alignmentPadding: dec.alignmentPadding,
      progressCallbackCustomAccounts: dec.progressCallbackCustomAccounts,
      endPadding: dec.endPadding,
    })
  }

  toJSON(): WithdrawTicketJSON {
    return {
      sequenceNumber: this.sequenceNumber.toString(),
      owner: this.owner,
      reserve: this.reserve,
      userDestinationLiquidityTa: this.userDestinationLiquidityTa,
      queuedCollateralAmount: this.queuedCollateralAmount.toString(),
      createdAtTimestamp: this.createdAtTimestamp.toString(),
      invalid: this.invalid,
      progressCallbackType: this.progressCallbackType,
      alignmentPadding: this.alignmentPadding,
      progressCallbackCustomAccounts: this.progressCallbackCustomAccounts,
      endPadding: this.endPadding.map((item) => item.toString()),
    }
  }

  static fromJSON(obj: WithdrawTicketJSON): WithdrawTicket {
    return new WithdrawTicket({
      sequenceNumber: new BN(obj.sequenceNumber),
      owner: address(obj.owner),
      reserve: address(obj.reserve),
      userDestinationLiquidityTa: address(obj.userDestinationLiquidityTa),
      queuedCollateralAmount: new BN(obj.queuedCollateralAmount),
      createdAtTimestamp: new BN(obj.createdAtTimestamp),
      invalid: obj.invalid,
      progressCallbackType: obj.progressCallbackType,
      alignmentPadding: obj.alignmentPadding,
      progressCallbackCustomAccounts: obj.progressCallbackCustomAccounts.map(
        (item) => address(item)
      ),
      endPadding: obj.endPadding.map((item) => new BN(item)),
    })
  }
}
