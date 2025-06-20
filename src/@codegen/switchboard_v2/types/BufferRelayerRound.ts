import { address, Address } from "@solana/kit" // eslint-disable-line @typescript-eslint/no-unused-vars
import BN from "bn.js" // eslint-disable-line @typescript-eslint/no-unused-vars
import * as types from "../types" // eslint-disable-line @typescript-eslint/no-unused-vars
import * as borsh from "@coral-xyz/borsh"
import { borshAddress } from "../utils"

export interface BufferRelayerRoundFields {
  numSuccess: number
  numError: number
  roundOpenSlot: BN
  roundOpenTimestamp: BN
  oraclePubkey: Address
}

export interface BufferRelayerRoundJSON {
  numSuccess: number
  numError: number
  roundOpenSlot: string
  roundOpenTimestamp: string
  oraclePubkey: string
}

export class BufferRelayerRound {
  readonly numSuccess: number
  readonly numError: number
  readonly roundOpenSlot: BN
  readonly roundOpenTimestamp: BN
  readonly oraclePubkey: Address

  constructor(fields: BufferRelayerRoundFields) {
    this.numSuccess = fields.numSuccess
    this.numError = fields.numError
    this.roundOpenSlot = fields.roundOpenSlot
    this.roundOpenTimestamp = fields.roundOpenTimestamp
    this.oraclePubkey = fields.oraclePubkey
  }

  static layout(property?: string) {
    return borsh.struct(
      [
        borsh.u32("numSuccess"),
        borsh.u32("numError"),
        borsh.u64("roundOpenSlot"),
        borsh.i64("roundOpenTimestamp"),
        borshAddress("oraclePubkey"),
      ],
      property
    )
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  static fromDecoded(obj: any) {
    return new BufferRelayerRound({
      numSuccess: obj.numSuccess,
      numError: obj.numError,
      roundOpenSlot: obj.roundOpenSlot,
      roundOpenTimestamp: obj.roundOpenTimestamp,
      oraclePubkey: obj.oraclePubkey,
    })
  }

  static toEncodable(fields: BufferRelayerRoundFields) {
    return {
      numSuccess: fields.numSuccess,
      numError: fields.numError,
      roundOpenSlot: fields.roundOpenSlot,
      roundOpenTimestamp: fields.roundOpenTimestamp,
      oraclePubkey: fields.oraclePubkey,
    }
  }

  toJSON(): BufferRelayerRoundJSON {
    return {
      numSuccess: this.numSuccess,
      numError: this.numError,
      roundOpenSlot: this.roundOpenSlot.toString(),
      roundOpenTimestamp: this.roundOpenTimestamp.toString(),
      oraclePubkey: this.oraclePubkey,
    }
  }

  static fromJSON(obj: BufferRelayerRoundJSON): BufferRelayerRound {
    return new BufferRelayerRound({
      numSuccess: obj.numSuccess,
      numError: obj.numError,
      roundOpenSlot: new BN(obj.roundOpenSlot),
      roundOpenTimestamp: new BN(obj.roundOpenTimestamp),
      oraclePubkey: address(obj.oraclePubkey),
    })
  }

  toEncodable() {
    return BufferRelayerRound.toEncodable(this)
  }
}
