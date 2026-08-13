import { address, Address } from "@solana/kit" // eslint-disable-line @typescript-eslint/no-unused-vars
import BN from "bn.js" // eslint-disable-line @typescript-eslint/no-unused-vars
import * as types from "../types" // eslint-disable-line @typescript-eslint/no-unused-vars
import * as borsh from "@coral-xyz/borsh"
import { borshAddress } from "../utils"

export interface NoneJSON {
  kind: "None"
}

export class None {
  static readonly discriminator = 0
  static readonly kind = "None"
  readonly discriminator = 0
  readonly kind = "None"

  toJSON(): NoneJSON {
    return {
      kind: "None",
    }
  }

  toEncodable() {
    return {
      None: {},
    }
  }
}

export interface KlendQueueAccountingHandlerOnKvaultJSON {
  kind: "KlendQueueAccountingHandlerOnKvault"
}

export class KlendQueueAccountingHandlerOnKvault {
  static readonly discriminator = 1
  static readonly kind = "KlendQueueAccountingHandlerOnKvault"
  readonly discriminator = 1
  readonly kind = "KlendQueueAccountingHandlerOnKvault"

  toJSON(): KlendQueueAccountingHandlerOnKvaultJSON {
    return {
      kind: "KlendQueueAccountingHandlerOnKvault",
    }
  }

  toEncodable() {
    return {
      KlendQueueAccountingHandlerOnKvault: {},
    }
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function fromDecoded(obj: any): types.ProgressCallbackTypeKind {
  if (typeof obj !== "object") {
    throw new Error("Invalid enum object")
  }

  if ("None" in obj) {
    return new None()
  }
  if ("KlendQueueAccountingHandlerOnKvault" in obj) {
    return new KlendQueueAccountingHandlerOnKvault()
  }

  throw new Error("Invalid enum object")
}

export function fromJSON(
  obj: types.ProgressCallbackTypeJSON
): types.ProgressCallbackTypeKind {
  switch (obj.kind) {
    case "None": {
      return new None()
    }
    case "KlendQueueAccountingHandlerOnKvault": {
      return new KlendQueueAccountingHandlerOnKvault()
    }
  }
}

export function layout(property?: string) {
  const ret = borsh.rustEnum([
    borsh.struct([], "None"),
    borsh.struct([], "KlendQueueAccountingHandlerOnKvault"),
  ])
  if (property !== undefined) {
    return ret.replicate(property)
  }
  return ret
}
