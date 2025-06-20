export type CustomError =
  | InvalidWormholeMessage
  | DeserializeMessageFailed
  | InvalidPriceUpdate
  | UnsupportedMessageType
  | InvalidDataSource
  | InsufficientFunds
  | WrongWriteAuthority
  | WrongVaaOwner
  | DeserializeVaaFailed
  | InsufficientGuardianSignatures
  | InvalidVaaVersion
  | GuardianSetMismatch
  | InvalidGuardianOrder
  | InvalidGuardianIndex
  | InvalidSignature
  | InvalidGuardianKeyRecovery
  | WrongGuardianSetOwner
  | InvalidGuardianSetPda
  | GuardianSetExpired
  | GovernanceAuthorityMismatch
  | TargetGovernanceAuthorityMismatch
  | NonexistentGovernanceAuthorityTransferRequest

export class InvalidWormholeMessage extends Error {
  static readonly code = 6000
  readonly code = 6000
  readonly name = "InvalidWormholeMessage"
  readonly msg = "Received an invalid wormhole message"

  constructor(readonly logs?: string[]) {
    super("6000: Received an invalid wormhole message")
  }
}

export class DeserializeMessageFailed extends Error {
  static readonly code = 6001
  readonly code = 6001
  readonly name = "DeserializeMessageFailed"
  readonly msg = "An error occurred when deserializing the message"

  constructor(readonly logs?: string[]) {
    super("6001: An error occurred when deserializing the message")
  }
}

export class InvalidPriceUpdate extends Error {
  static readonly code = 6002
  readonly code = 6002
  readonly name = "InvalidPriceUpdate"
  readonly msg = "Received an invalid price update"

  constructor(readonly logs?: string[]) {
    super("6002: Received an invalid price update")
  }
}

export class UnsupportedMessageType extends Error {
  static readonly code = 6003
  readonly code = 6003
  readonly name = "UnsupportedMessageType"
  readonly msg = "This type of message is not supported currently"

  constructor(readonly logs?: string[]) {
    super("6003: This type of message is not supported currently")
  }
}

export class InvalidDataSource extends Error {
  static readonly code = 6004
  readonly code = 6004
  readonly name = "InvalidDataSource"
  readonly msg =
    "The tuple emitter chain, emitter doesn't match one of the valid data sources."

  constructor(readonly logs?: string[]) {
    super(
      "6004: The tuple emitter chain, emitter doesn't match one of the valid data sources."
    )
  }
}

export class InsufficientFunds extends Error {
  static readonly code = 6005
  readonly code = 6005
  readonly name = "InsufficientFunds"
  readonly msg = "Funds are insufficient to pay the receiving fee"

  constructor(readonly logs?: string[]) {
    super("6005: Funds are insufficient to pay the receiving fee")
  }
}

export class WrongWriteAuthority extends Error {
  static readonly code = 6006
  readonly code = 6006
  readonly name = "WrongWriteAuthority"
  readonly msg = "This signer can't write to price update account"

  constructor(readonly logs?: string[]) {
    super("6006: This signer can't write to price update account")
  }
}

export class WrongVaaOwner extends Error {
  static readonly code = 6007
  readonly code = 6007
  readonly name = "WrongVaaOwner"
  readonly msg = "The posted VAA account has the wrong owner."

  constructor(readonly logs?: string[]) {
    super("6007: The posted VAA account has the wrong owner.")
  }
}

export class DeserializeVaaFailed extends Error {
  static readonly code = 6008
  readonly code = 6008
  readonly name = "DeserializeVaaFailed"
  readonly msg = "An error occurred when deserializing the VAA."

  constructor(readonly logs?: string[]) {
    super("6008: An error occurred when deserializing the VAA.")
  }
}

export class InsufficientGuardianSignatures extends Error {
  static readonly code = 6009
  readonly code = 6009
  readonly name = "InsufficientGuardianSignatures"
  readonly msg = "The number of guardian signatures is below the minimum"

  constructor(readonly logs?: string[]) {
    super("6009: The number of guardian signatures is below the minimum")
  }
}

export class InvalidVaaVersion extends Error {
  static readonly code = 6010
  readonly code = 6010
  readonly name = "InvalidVaaVersion"
  readonly msg = "Invalid VAA version"

  constructor(readonly logs?: string[]) {
    super("6010: Invalid VAA version")
  }
}

export class GuardianSetMismatch extends Error {
  static readonly code = 6011
  readonly code = 6011
  readonly name = "GuardianSetMismatch"
  readonly msg =
    "Guardian set version in the VAA doesn't match the guardian set passed"

  constructor(readonly logs?: string[]) {
    super(
      "6011: Guardian set version in the VAA doesn't match the guardian set passed"
    )
  }
}

export class InvalidGuardianOrder extends Error {
  static readonly code = 6012
  readonly code = 6012
  readonly name = "InvalidGuardianOrder"
  readonly msg = "Guardian signature indices must be increasing"

  constructor(readonly logs?: string[]) {
    super("6012: Guardian signature indices must be increasing")
  }
}

export class InvalidGuardianIndex extends Error {
  static readonly code = 6013
  readonly code = 6013
  readonly name = "InvalidGuardianIndex"
  readonly msg = "Guardian index exceeds the number of guardians in the set"

  constructor(readonly logs?: string[]) {
    super("6013: Guardian index exceeds the number of guardians in the set")
  }
}

export class InvalidSignature extends Error {
  static readonly code = 6014
  readonly code = 6014
  readonly name = "InvalidSignature"
  readonly msg = "A VAA signature is invalid"

  constructor(readonly logs?: string[]) {
    super("6014: A VAA signature is invalid")
  }
}

export class InvalidGuardianKeyRecovery extends Error {
  static readonly code = 6015
  readonly code = 6015
  readonly name = "InvalidGuardianKeyRecovery"
  readonly msg =
    "The recovered guardian public key doesn't match the guardian set"

  constructor(readonly logs?: string[]) {
    super(
      "6015: The recovered guardian public key doesn't match the guardian set"
    )
  }
}

export class WrongGuardianSetOwner extends Error {
  static readonly code = 6016
  readonly code = 6016
  readonly name = "WrongGuardianSetOwner"
  readonly msg = "The guardian set account is owned by the wrong program"

  constructor(readonly logs?: string[]) {
    super("6016: The guardian set account is owned by the wrong program")
  }
}

export class InvalidGuardianSetPda extends Error {
  static readonly code = 6017
  readonly code = 6017
  readonly name = "InvalidGuardianSetPda"
  readonly msg = "The Guardian Set account doesn't match the PDA derivation"

  constructor(readonly logs?: string[]) {
    super("6017: The Guardian Set account doesn't match the PDA derivation")
  }
}

export class GuardianSetExpired extends Error {
  static readonly code = 6018
  readonly code = 6018
  readonly name = "GuardianSetExpired"
  readonly msg = "The Guardian Set is expired"

  constructor(readonly logs?: string[]) {
    super("6018: The Guardian Set is expired")
  }
}

export class GovernanceAuthorityMismatch extends Error {
  static readonly code = 6019
  readonly code = 6019
  readonly name = "GovernanceAuthorityMismatch"
  readonly msg =
    "The signer is not authorized to perform this governance action"

  constructor(readonly logs?: string[]) {
    super(
      "6019: The signer is not authorized to perform this governance action"
    )
  }
}

export class TargetGovernanceAuthorityMismatch extends Error {
  static readonly code = 6020
  readonly code = 6020
  readonly name = "TargetGovernanceAuthorityMismatch"
  readonly msg =
    "The signer is not authorized to accept the governance authority"

  constructor(readonly logs?: string[]) {
    super(
      "6020: The signer is not authorized to accept the governance authority"
    )
  }
}

export class NonexistentGovernanceAuthorityTransferRequest extends Error {
  static readonly code = 6021
  readonly code = 6021
  readonly name = "NonexistentGovernanceAuthorityTransferRequest"
  readonly msg = "The governance authority needs to request a transfer first"

  constructor(readonly logs?: string[]) {
    super("6021: The governance authority needs to request a transfer first")
  }
}

export function fromCode(code: number, logs?: string[]): CustomError | null {
  switch (code) {
    case 6000:
      return new InvalidWormholeMessage(logs)
    case 6001:
      return new DeserializeMessageFailed(logs)
    case 6002:
      return new InvalidPriceUpdate(logs)
    case 6003:
      return new UnsupportedMessageType(logs)
    case 6004:
      return new InvalidDataSource(logs)
    case 6005:
      return new InsufficientFunds(logs)
    case 6006:
      return new WrongWriteAuthority(logs)
    case 6007:
      return new WrongVaaOwner(logs)
    case 6008:
      return new DeserializeVaaFailed(logs)
    case 6009:
      return new InsufficientGuardianSignatures(logs)
    case 6010:
      return new InvalidVaaVersion(logs)
    case 6011:
      return new GuardianSetMismatch(logs)
    case 6012:
      return new InvalidGuardianOrder(logs)
    case 6013:
      return new InvalidGuardianIndex(logs)
    case 6014:
      return new InvalidSignature(logs)
    case 6015:
      return new InvalidGuardianKeyRecovery(logs)
    case 6016:
      return new WrongGuardianSetOwner(logs)
    case 6017:
      return new InvalidGuardianSetPda(logs)
    case 6018:
      return new GuardianSetExpired(logs)
    case 6019:
      return new GovernanceAuthorityMismatch(logs)
    case 6020:
      return new TargetGovernanceAuthorityMismatch(logs)
    case 6021:
      return new NonexistentGovernanceAuthorityTransferRequest(logs)
  }

  return null
}
