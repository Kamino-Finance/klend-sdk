import { address, Address } from "@solana/kit" // eslint-disable-line @typescript-eslint/no-unused-vars
import BN from "bn.js" // eslint-disable-line @typescript-eslint/no-unused-vars
import * as types from "../types" // eslint-disable-line @typescript-eslint/no-unused-vars
import * as borsh from "@coral-xyz/borsh"
import { borshAddress } from "../utils"

export interface FixedTermRolloverEnabledJSON {
  kind: "FixedTermRolloverEnabled"
}

export class FixedTermRolloverEnabled {
  static readonly discriminator = 0
  static readonly kind = "FixedTermRolloverEnabled"
  readonly discriminator = 0
  readonly kind = "FixedTermRolloverEnabled"

  toJSON(): FixedTermRolloverEnabledJSON {
    return {
      kind: "FixedTermRolloverEnabled",
    }
  }

  toEncodable() {
    return {
      FixedTermRolloverEnabled: {},
    }
  }
}

export interface FixedTermRolloverMaxBorrowRateBpsJSON {
  kind: "FixedTermRolloverMaxBorrowRateBps"
}

export class FixedTermRolloverMaxBorrowRateBps {
  static readonly discriminator = 1
  static readonly kind = "FixedTermRolloverMaxBorrowRateBps"
  readonly discriminator = 1
  readonly kind = "FixedTermRolloverMaxBorrowRateBps"

  toJSON(): FixedTermRolloverMaxBorrowRateBpsJSON {
    return {
      kind: "FixedTermRolloverMaxBorrowRateBps",
    }
  }

  toEncodable() {
    return {
      FixedTermRolloverMaxBorrowRateBps: {},
    }
  }
}

export interface FixedTermRolloverMinDebtTermSecondsJSON {
  kind: "FixedTermRolloverMinDebtTermSeconds"
}

export class FixedTermRolloverMinDebtTermSeconds {
  static readonly discriminator = 2
  static readonly kind = "FixedTermRolloverMinDebtTermSeconds"
  readonly discriminator = 2
  readonly kind = "FixedTermRolloverMinDebtTermSeconds"

  toJSON(): FixedTermRolloverMinDebtTermSecondsJSON {
    return {
      kind: "FixedTermRolloverMinDebtTermSeconds",
    }
  }

  toEncodable() {
    return {
      FixedTermRolloverMinDebtTermSeconds: {},
    }
  }
}

export interface FixedTermRolloverOpenTermAllowedJSON {
  kind: "FixedTermRolloverOpenTermAllowed"
}

export class FixedTermRolloverOpenTermAllowed {
  static readonly discriminator = 3
  static readonly kind = "FixedTermRolloverOpenTermAllowed"
  readonly discriminator = 3
  readonly kind = "FixedTermRolloverOpenTermAllowed"

  toJSON(): FixedTermRolloverOpenTermAllowedJSON {
    return {
      kind: "FixedTermRolloverOpenTermAllowed",
    }
  }

  toEncodable() {
    return {
      FixedTermRolloverOpenTermAllowed: {},
    }
  }
}

export interface MigrationToFixedEnabledJSON {
  kind: "MigrationToFixedEnabled"
}

export class MigrationToFixedEnabled {
  static readonly discriminator = 4
  static readonly kind = "MigrationToFixedEnabled"
  readonly discriminator = 4
  readonly kind = "MigrationToFixedEnabled"

  toJSON(): MigrationToFixedEnabledJSON {
    return {
      kind: "MigrationToFixedEnabled",
    }
  }

  toEncodable() {
    return {
      MigrationToFixedEnabled: {},
    }
  }
}

export interface FixedTermRolloverWindowDurationDaysJSON {
  kind: "FixedTermRolloverWindowDurationDays"
}

export class FixedTermRolloverWindowDurationDays {
  static readonly discriminator = 5
  static readonly kind = "FixedTermRolloverWindowDurationDays"
  readonly discriminator = 5
  readonly kind = "FixedTermRolloverWindowDurationDays"

  toJSON(): FixedTermRolloverWindowDurationDaysJSON {
    return {
      kind: "FixedTermRolloverWindowDurationDays",
    }
  }

  toEncodable() {
    return {
      FixedTermRolloverWindowDurationDays: {},
    }
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function fromDecoded(obj: any): types.UpdateObligationConfigModeKind {
  if (typeof obj !== "object") {
    throw new Error("Invalid enum object")
  }

  if ("FixedTermRolloverEnabled" in obj) {
    return new FixedTermRolloverEnabled()
  }
  if ("FixedTermRolloverMaxBorrowRateBps" in obj) {
    return new FixedTermRolloverMaxBorrowRateBps()
  }
  if ("FixedTermRolloverMinDebtTermSeconds" in obj) {
    return new FixedTermRolloverMinDebtTermSeconds()
  }
  if ("FixedTermRolloverOpenTermAllowed" in obj) {
    return new FixedTermRolloverOpenTermAllowed()
  }
  if ("MigrationToFixedEnabled" in obj) {
    return new MigrationToFixedEnabled()
  }
  if ("FixedTermRolloverWindowDurationDays" in obj) {
    return new FixedTermRolloverWindowDurationDays()
  }

  throw new Error("Invalid enum object")
}

export function fromJSON(
  obj: types.UpdateObligationConfigModeJSON
): types.UpdateObligationConfigModeKind {
  switch (obj.kind) {
    case "FixedTermRolloverEnabled": {
      return new FixedTermRolloverEnabled()
    }
    case "FixedTermRolloverMaxBorrowRateBps": {
      return new FixedTermRolloverMaxBorrowRateBps()
    }
    case "FixedTermRolloverMinDebtTermSeconds": {
      return new FixedTermRolloverMinDebtTermSeconds()
    }
    case "FixedTermRolloverOpenTermAllowed": {
      return new FixedTermRolloverOpenTermAllowed()
    }
    case "MigrationToFixedEnabled": {
      return new MigrationToFixedEnabled()
    }
    case "FixedTermRolloverWindowDurationDays": {
      return new FixedTermRolloverWindowDurationDays()
    }
  }
}

export function layout(property?: string) {
  const ret = borsh.rustEnum([
    borsh.struct([], "FixedTermRolloverEnabled"),
    borsh.struct([], "FixedTermRolloverMaxBorrowRateBps"),
    borsh.struct([], "FixedTermRolloverMinDebtTermSeconds"),
    borsh.struct([], "FixedTermRolloverOpenTermAllowed"),
    borsh.struct([], "MigrationToFixedEnabled"),
    borsh.struct([], "FixedTermRolloverWindowDurationDays"),
  ])
  if (property !== undefined) {
    return ret.replicate(property)
  }
  return ret
}
