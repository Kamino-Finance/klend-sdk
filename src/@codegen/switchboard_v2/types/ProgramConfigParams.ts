import { address, Address } from "@solana/kit" // eslint-disable-line @typescript-eslint/no-unused-vars
import BN from "bn.js" // eslint-disable-line @typescript-eslint/no-unused-vars
import * as types from "../types" // eslint-disable-line @typescript-eslint/no-unused-vars
import * as borsh from "@coral-xyz/borsh"
import { borshAddress } from "../utils"

export interface ProgramConfigParamsFields {
  token: Address
  bump: number
  daoMint: Address
}

export interface ProgramConfigParamsJSON {
  token: string
  bump: number
  daoMint: string
}

export class ProgramConfigParams {
  readonly token: Address
  readonly bump: number
  readonly daoMint: Address

  constructor(fields: ProgramConfigParamsFields) {
    this.token = fields.token
    this.bump = fields.bump
    this.daoMint = fields.daoMint
  }

  static layout(property?: string) {
    return borsh.struct(
      [borshAddress("token"), borsh.u8("bump"), borshAddress("daoMint")],
      property
    )
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  static fromDecoded(obj: any) {
    return new ProgramConfigParams({
      token: obj.token,
      bump: obj.bump,
      daoMint: obj.daoMint,
    })
  }

  static toEncodable(fields: ProgramConfigParamsFields) {
    return {
      token: fields.token,
      bump: fields.bump,
      daoMint: fields.daoMint,
    }
  }

  toJSON(): ProgramConfigParamsJSON {
    return {
      token: this.token,
      bump: this.bump,
      daoMint: this.daoMint,
    }
  }

  static fromJSON(obj: ProgramConfigParamsJSON): ProgramConfigParams {
    return new ProgramConfigParams({
      token: address(obj.token),
      bump: obj.bump,
      daoMint: address(obj.daoMint),
    })
  }

  toEncodable() {
    return ProgramConfigParams.toEncodable(this)
  }
}
