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

export interface UnstakeTicketFields {
  authority: Address
  poolState: Address
  obligationMetadata: Address
  initialUsol: BN
  remainingUsol: BN
  minimumEpochToBurn: BN
  padding0: Array<BN>
  padding: Array<BN>
}

export interface UnstakeTicketJSON {
  authority: string
  poolState: string
  obligationMetadata: string
  initialUsol: string
  remainingUsol: string
  minimumEpochToBurn: string
  padding0: Array<string>
  padding: Array<string>
}

export class UnstakeTicket {
  readonly authority: Address
  readonly poolState: Address
  readonly obligationMetadata: Address
  readonly initialUsol: BN
  readonly remainingUsol: BN
  readonly minimumEpochToBurn: BN
  readonly padding0: Array<BN>
  readonly padding: Array<BN>

  static readonly discriminator = Buffer.from([
    131, 84, 209, 38, 145, 157, 181, 127,
  ])

  static readonly layout = borsh.struct<UnstakeTicket>([
    borshAddress("authority"),
    borshAddress("poolState"),
    borshAddress("obligationMetadata"),
    borsh.u64("initialUsol"),
    borsh.u64("remainingUsol"),
    borsh.u64("minimumEpochToBurn"),
    borsh.array(borsh.u64(), 1, "padding0"),
    borsh.array(borsh.u128(), 16, "padding"),
  ])

  constructor(fields: UnstakeTicketFields) {
    this.authority = fields.authority
    this.poolState = fields.poolState
    this.obligationMetadata = fields.obligationMetadata
    this.initialUsol = fields.initialUsol
    this.remainingUsol = fields.remainingUsol
    this.minimumEpochToBurn = fields.minimumEpochToBurn
    this.padding0 = fields.padding0
    this.padding = fields.padding
  }

  static async fetch(
    rpc: Rpc<GetAccountInfoApi>,
    address: Address,
    programId: Address = PROGRAM_ID
  ): Promise<UnstakeTicket | null> {
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
  ): Promise<Array<UnstakeTicket | null>> {
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

  static decode(data: Buffer): UnstakeTicket {
    if (!data.slice(0, 8).equals(UnstakeTicket.discriminator)) {
      throw new Error("invalid account discriminator")
    }

    const dec = UnstakeTicket.layout.decode(data.slice(8))

    return new UnstakeTicket({
      authority: dec.authority,
      poolState: dec.poolState,
      obligationMetadata: dec.obligationMetadata,
      initialUsol: dec.initialUsol,
      remainingUsol: dec.remainingUsol,
      minimumEpochToBurn: dec.minimumEpochToBurn,
      padding0: dec.padding0,
      padding: dec.padding,
    })
  }

  toJSON(): UnstakeTicketJSON {
    return {
      authority: this.authority,
      poolState: this.poolState,
      obligationMetadata: this.obligationMetadata,
      initialUsol: this.initialUsol.toString(),
      remainingUsol: this.remainingUsol.toString(),
      minimumEpochToBurn: this.minimumEpochToBurn.toString(),
      padding0: this.padding0.map((item) => item.toString()),
      padding: this.padding.map((item) => item.toString()),
    }
  }

  static fromJSON(obj: UnstakeTicketJSON): UnstakeTicket {
    return new UnstakeTicket({
      authority: address(obj.authority),
      poolState: address(obj.poolState),
      obligationMetadata: address(obj.obligationMetadata),
      initialUsol: new BN(obj.initialUsol),
      remainingUsol: new BN(obj.remainingUsol),
      minimumEpochToBurn: new BN(obj.minimumEpochToBurn),
      padding0: obj.padding0.map((item) => new BN(item)),
      padding: obj.padding.map((item) => new BN(item)),
    })
  }
}
