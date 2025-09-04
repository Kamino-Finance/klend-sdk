export type CustomError =
  | IntegerOverflow
  | ConversionFailed
  | StakePoolError
  | InvalidStakePoolAccounts
  | StakePoolDeserializeError
  | InvalidStakePoolProgram
  | InvalidStakePoolSize
  | InvalidStakeAccountProgram
  | InvalidStakeAccountSize
  | InvalidStakeAccountCandidate
  | UnexpectedSolToDestake
  | UnexpectedSolToCollect
  | InvalidStakedSolProgram
  | CannotDepositZeroStakedSol
  | CannotMintZeroShares
  | CannotBurnZeroShares
  | CannotCollectZeroSol
  | NotEnoughWsol
  | NotEnoughSharesIssued
  | NotEnoughSharesInTicket
  | NotEnoughStakedSolToDeposit
  | PoolFeeCannotBe100Percent
  | LessSharesThanExpected
  | LessWsolThanExpected
  | InvalidFeeAccount
  | UnsupportedFeeAccountExtension
  | CannotBurnBeforeTicketAllows
  | WrongTicketAuthority
  | InvalidPendingAdmin
  | CollectingMoreThanUnstaking
  | CannotSplitZeroShares
  | WrongTicketPoolState

export class IntegerOverflow extends Error {
  static readonly code = 8000
  readonly code = 8000
  readonly name = "IntegerOverflow"
  readonly msg = "IntegerOverflow"

  constructor(readonly logs?: string[]) {
    super("8000: IntegerOverflow")
  }
}

export class ConversionFailed extends Error {
  static readonly code = 8001
  readonly code = 8001
  readonly name = "ConversionFailed"
  readonly msg = "ConversionFailed"

  constructor(readonly logs?: string[]) {
    super("8001: ConversionFailed")
  }
}

export class StakePoolError extends Error {
  static readonly code = 8002
  readonly code = 8002
  readonly name = "StakePoolError"
  readonly msg = "Stake pool specific error"

  constructor(readonly logs?: string[]) {
    super("8002: Stake pool specific error")
  }
}

export class InvalidStakePoolAccounts extends Error {
  static readonly code = 8003
  readonly code = 8003
  readonly name = "InvalidStakePoolAccounts"
  readonly msg = "Passed stake pool accounts are not valid"

  constructor(readonly logs?: string[]) {
    super("8003: Passed stake pool accounts are not valid")
  }
}

export class StakePoolDeserializeError extends Error {
  static readonly code = 8004
  readonly code = 8004
  readonly name = "StakePoolDeserializeError"
  readonly msg = "Stake pool deserialization error"

  constructor(readonly logs?: string[]) {
    super("8004: Stake pool deserialization error")
  }
}

export class InvalidStakePoolProgram extends Error {
  static readonly code = 8005
  readonly code = 8005
  readonly name = "InvalidStakePoolProgram"
  readonly msg = "Stake pool invalid program"

  constructor(readonly logs?: string[]) {
    super("8005: Stake pool invalid program")
  }
}

export class InvalidStakePoolSize extends Error {
  static readonly code = 8006
  readonly code = 8006
  readonly name = "InvalidStakePoolSize"
  readonly msg = "Stake pool invalid size"

  constructor(readonly logs?: string[]) {
    super("8006: Stake pool invalid size")
  }
}

export class InvalidStakeAccountProgram extends Error {
  static readonly code = 8007
  readonly code = 8007
  readonly name = "InvalidStakeAccountProgram"
  readonly msg = "Stake account invalid program"

  constructor(readonly logs?: string[]) {
    super("8007: Stake account invalid program")
  }
}

export class InvalidStakeAccountSize extends Error {
  static readonly code = 8008
  readonly code = 8008
  readonly name = "InvalidStakeAccountSize"
  readonly msg = "Stake account invalid size"

  constructor(readonly logs?: string[]) {
    super("8008: Stake account invalid size")
  }
}

export class InvalidStakeAccountCandidate extends Error {
  static readonly code = 8009
  readonly code = 8009
  readonly name = "InvalidStakeAccountCandidate"
  readonly msg = "Stake account candidates should be uninitialized accounts"

  constructor(readonly logs?: string[]) {
    super("8009: Stake account candidates should be uninitialized accounts")
  }
}

export class UnexpectedSolToDestake extends Error {
  static readonly code = 8010
  readonly code = 8010
  readonly name = "UnexpectedSolToDestake"
  readonly msg =
    "Simulation and actual cpi call have different results for withdrawing sol from stake pool"

  constructor(readonly logs?: string[]) {
    super(
      "8010: Simulation and actual cpi call have different results for withdrawing sol from stake pool"
    )
  }
}

export class UnexpectedSolToCollect extends Error {
  static readonly code = 8011
  readonly code = 8011
  readonly name = "UnexpectedSolToCollect"
  readonly msg =
    "Simulation and actual cpi call have different results for collecting sol from stake account"

  constructor(readonly logs?: string[]) {
    super(
      "8011: Simulation and actual cpi call have different results for collecting sol from stake account"
    )
  }
}

export class InvalidStakedSolProgram extends Error {
  static readonly code = 8012
  readonly code = 8012
  readonly name = "InvalidStakedSolProgram"
  readonly msg = "Staked sol program not support"

  constructor(readonly logs?: string[]) {
    super("8012: Staked sol program not support")
  }
}

export class CannotDepositZeroStakedSol extends Error {
  static readonly code = 8013
  readonly code = 8013
  readonly name = "CannotDepositZeroStakedSol"
  readonly msg = "Cannot deposit 0 staked sol"

  constructor(readonly logs?: string[]) {
    super("8013: Cannot deposit 0 staked sol")
  }
}

export class CannotMintZeroShares extends Error {
  static readonly code = 8014
  readonly code = 8014
  readonly name = "CannotMintZeroShares"
  readonly msg = "Cannot mint 0 shares"

  constructor(readonly logs?: string[]) {
    super("8014: Cannot mint 0 shares")
  }
}

export class CannotBurnZeroShares extends Error {
  static readonly code = 8015
  readonly code = 8015
  readonly name = "CannotBurnZeroShares"
  readonly msg = "Cannot burn 0 shares"

  constructor(readonly logs?: string[]) {
    super("8015: Cannot burn 0 shares")
  }
}

export class CannotCollectZeroSol extends Error {
  static readonly code = 8016
  readonly code = 8016
  readonly name = "CannotCollectZeroSol"
  readonly msg = "Cannot collect 0"

  constructor(readonly logs?: string[]) {
    super("8016: Cannot collect 0")
  }
}

export class NotEnoughWsol extends Error {
  static readonly code = 8017
  readonly code = 8017
  readonly name = "NotEnoughWsol"
  readonly msg = "Not enough wsol in vault"

  constructor(readonly logs?: string[]) {
    super("8017: Not enough wsol in vault")
  }
}

export class NotEnoughSharesIssued extends Error {
  static readonly code = 8018
  readonly code = 8018
  readonly name = "NotEnoughSharesIssued"
  readonly msg = "Not enough shares issued"

  constructor(readonly logs?: string[]) {
    super("8018: Not enough shares issued")
  }
}

export class NotEnoughSharesInTicket extends Error {
  static readonly code = 8019
  readonly code = 8019
  readonly name = "NotEnoughSharesInTicket"
  readonly msg = "Not enough shares left for ticket"

  constructor(readonly logs?: string[]) {
    super("8019: Not enough shares left for ticket")
  }
}

export class NotEnoughStakedSolToDeposit extends Error {
  static readonly code = 8020
  readonly code = 8020
  readonly name = "NotEnoughStakedSolToDeposit"
  readonly msg =
    "Not enough staked sol to deposit (must be at least equivalent to minimum pool delegation)"

  constructor(readonly logs?: string[]) {
    super(
      "8020: Not enough staked sol to deposit (must be at least equivalent to minimum pool delegation)"
    )
  }
}

export class PoolFeeCannotBe100Percent extends Error {
  static readonly code = 8021
  readonly code = 8021
  readonly name = "PoolFeeCannotBe100Percent"
  readonly msg = "We cannot compute the inverse with fee when value is 100%"

  constructor(readonly logs?: string[]) {
    super("8021: We cannot compute the inverse with fee when value is 100%")
  }
}

export class LessSharesThanExpected extends Error {
  static readonly code = 8022
  readonly code = 8022
  readonly name = "LessSharesThanExpected"
  readonly msg = "Received less shares than minimum expected"

  constructor(readonly logs?: string[]) {
    super("8022: Received less shares than minimum expected")
  }
}

export class LessWsolThanExpected extends Error {
  static readonly code = 8023
  readonly code = 8023
  readonly name = "LessWsolThanExpected"
  readonly msg = "Received less wsol than minimum expected"

  constructor(readonly logs?: string[]) {
    super("8023: Received less wsol than minimum expected")
  }
}

export class InvalidFeeAccount extends Error {
  static readonly code = 8024
  readonly code = 8024
  readonly name = "InvalidFeeAccount"
  readonly msg =
    "Manager fee account passed is not valid (wrong token program / account not initialized / wrong mint)"

  constructor(readonly logs?: string[]) {
    super(
      "8024: Manager fee account passed is not valid (wrong token program / account not initialized / wrong mint)"
    )
  }
}

export class UnsupportedFeeAccountExtension extends Error {
  static readonly code = 8025
  readonly code = 8025
  readonly name = "UnsupportedFeeAccountExtension"
  readonly msg =
    "Manager fee account passed has unsupported extensions by standard stake pool"

  constructor(readonly logs?: string[]) {
    super(
      "8025: Manager fee account passed has unsupported extensions by standard stake pool"
    )
  }
}

export class CannotBurnBeforeTicketAllows extends Error {
  static readonly code = 8026
  readonly code = 8026
  readonly name = "CannotBurnBeforeTicketAllows"
  readonly msg = "Cannot burn shares before unstake ticket allows"

  constructor(readonly logs?: string[]) {
    super("8026: Cannot burn shares before unstake ticket allows")
  }
}

export class WrongTicketAuthority extends Error {
  static readonly code = 8027
  readonly code = 8027
  readonly name = "WrongTicketAuthority"
  readonly msg =
    "Cannot burn shares from a ticket if user is not the burn authority"

  constructor(readonly logs?: string[]) {
    super(
      "8027: Cannot burn shares from a ticket if user is not the burn authority"
    )
  }
}

export class InvalidPendingAdmin extends Error {
  static readonly code = 8028
  readonly code = 8028
  readonly name = "InvalidPendingAdmin"
  readonly msg = "Invalid pending admin"

  constructor(readonly logs?: string[]) {
    super("8028: Invalid pending admin")
  }
}

export class CollectingMoreThanUnstaking extends Error {
  static readonly code = 8029
  readonly code = 8029
  readonly name = "CollectingMoreThanUnstaking"
  readonly msg = "We are trying to collect more SOL than there is unstaking"

  constructor(readonly logs?: string[]) {
    super("8029: We are trying to collect more SOL than there is unstaking")
  }
}

export class CannotSplitZeroShares extends Error {
  static readonly code = 8030
  readonly code = 8030
  readonly name = "CannotSplitZeroShares"
  readonly msg = "Cannot split 0 shares"

  constructor(readonly logs?: string[]) {
    super("8030: Cannot split 0 shares")
  }
}

export class WrongTicketPoolState extends Error {
  static readonly code = 8031
  readonly code = 8031
  readonly name = "WrongTicketPoolState"
  readonly msg =
    "Cannot burn shares from a ticket if it's not linked to the pool"

  constructor(readonly logs?: string[]) {
    super(
      "8031: Cannot burn shares from a ticket if it's not linked to the pool"
    )
  }
}

export function fromCode(code: number, logs?: string[]): CustomError | null {
  switch (code) {
    case 8000:
      return new IntegerOverflow(logs)
    case 8001:
      return new ConversionFailed(logs)
    case 8002:
      return new StakePoolError(logs)
    case 8003:
      return new InvalidStakePoolAccounts(logs)
    case 8004:
      return new StakePoolDeserializeError(logs)
    case 8005:
      return new InvalidStakePoolProgram(logs)
    case 8006:
      return new InvalidStakePoolSize(logs)
    case 8007:
      return new InvalidStakeAccountProgram(logs)
    case 8008:
      return new InvalidStakeAccountSize(logs)
    case 8009:
      return new InvalidStakeAccountCandidate(logs)
    case 8010:
      return new UnexpectedSolToDestake(logs)
    case 8011:
      return new UnexpectedSolToCollect(logs)
    case 8012:
      return new InvalidStakedSolProgram(logs)
    case 8013:
      return new CannotDepositZeroStakedSol(logs)
    case 8014:
      return new CannotMintZeroShares(logs)
    case 8015:
      return new CannotBurnZeroShares(logs)
    case 8016:
      return new CannotCollectZeroSol(logs)
    case 8017:
      return new NotEnoughWsol(logs)
    case 8018:
      return new NotEnoughSharesIssued(logs)
    case 8019:
      return new NotEnoughSharesInTicket(logs)
    case 8020:
      return new NotEnoughStakedSolToDeposit(logs)
    case 8021:
      return new PoolFeeCannotBe100Percent(logs)
    case 8022:
      return new LessSharesThanExpected(logs)
    case 8023:
      return new LessWsolThanExpected(logs)
    case 8024:
      return new InvalidFeeAccount(logs)
    case 8025:
      return new UnsupportedFeeAccountExtension(logs)
    case 8026:
      return new CannotBurnBeforeTicketAllows(logs)
    case 8027:
      return new WrongTicketAuthority(logs)
    case 8028:
      return new InvalidPendingAdmin(logs)
    case 8029:
      return new CollectingMoreThanUnstaking(logs)
    case 8030:
      return new CannotSplitZeroShares(logs)
    case 8031:
      return new WrongTicketPoolState(logs)
  }

  return null
}
