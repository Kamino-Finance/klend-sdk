export type CustomError =
  | MathOverflow
  | UnsupportedOracle
  | InvalidOracleAccount
  | StaleOraclePrice
  | InvalidOraclePrice
  | InvalidEnvironment
  | InvalidCollateralAccount
  | InvalidCollateralAmount
  | CollateralSlippage
  | InvalidPositionState
  | InvalidPerpetualsConfig
  | InvalidPoolConfig
  | InvalidInstruction
  | InvalidCustodyConfig
  | InvalidCustodyBalance
  | InvalidArgument
  | InvalidPositionRequest
  | InvalidPositionRequestInputAta
  | InvalidMint
  | InsufficientTokenAmount
  | InsufficientAmountReturned
  | MaxPriceSlippage
  | MaxLeverage
  | CustodyAmountLimit
  | PoolAmountLimit
  | PersonalPoolAmountLimit
  | UnsupportedToken
  | InstructionNotAllowed
  | JupiterProgramMismatch
  | ProgramMismatch
  | AddressMismatch
  | KeeperATAMissing
  | SwapAmountMismatch
  | CPINotAllowed
  | InvalidKeeper
  | ExceedExecutionPeriod
  | InvalidRequestType
  | InvalidTriggerPrice
  | TriggerPriceSlippage
  | MissingTriggerPrice
  | MissingPriceSlippage
  | InvalidPriceCalcMode

export class MathOverflow extends Error {
  static readonly code = 6000
  readonly code = 6000
  readonly name = "MathOverflow"
  readonly msg = "Overflow in arithmetic operation"

  constructor(readonly logs?: string[]) {
    super("6000: Overflow in arithmetic operation")
  }
}

export class UnsupportedOracle extends Error {
  static readonly code = 6001
  readonly code = 6001
  readonly name = "UnsupportedOracle"
  readonly msg = "Unsupported price oracle"

  constructor(readonly logs?: string[]) {
    super("6001: Unsupported price oracle")
  }
}

export class InvalidOracleAccount extends Error {
  static readonly code = 6002
  readonly code = 6002
  readonly name = "InvalidOracleAccount"
  readonly msg = "Invalid oracle account"

  constructor(readonly logs?: string[]) {
    super("6002: Invalid oracle account")
  }
}

export class StaleOraclePrice extends Error {
  static readonly code = 6003
  readonly code = 6003
  readonly name = "StaleOraclePrice"
  readonly msg = "Stale oracle price"

  constructor(readonly logs?: string[]) {
    super("6003: Stale oracle price")
  }
}

export class InvalidOraclePrice extends Error {
  static readonly code = 6004
  readonly code = 6004
  readonly name = "InvalidOraclePrice"
  readonly msg = "Invalid oracle price"

  constructor(readonly logs?: string[]) {
    super("6004: Invalid oracle price")
  }
}

export class InvalidEnvironment extends Error {
  static readonly code = 6005
  readonly code = 6005
  readonly name = "InvalidEnvironment"
  readonly msg = "Instruction is not allowed in production"

  constructor(readonly logs?: string[]) {
    super("6005: Instruction is not allowed in production")
  }
}

export class InvalidCollateralAccount extends Error {
  static readonly code = 6006
  readonly code = 6006
  readonly name = "InvalidCollateralAccount"
  readonly msg = "Invalid collateral account"

  constructor(readonly logs?: string[]) {
    super("6006: Invalid collateral account")
  }
}

export class InvalidCollateralAmount extends Error {
  static readonly code = 6007
  readonly code = 6007
  readonly name = "InvalidCollateralAmount"
  readonly msg = "Invalid collateral amount"

  constructor(readonly logs?: string[]) {
    super("6007: Invalid collateral amount")
  }
}

export class CollateralSlippage extends Error {
  static readonly code = 6008
  readonly code = 6008
  readonly name = "CollateralSlippage"
  readonly msg = "Collateral slippage"

  constructor(readonly logs?: string[]) {
    super("6008: Collateral slippage")
  }
}

export class InvalidPositionState extends Error {
  static readonly code = 6009
  readonly code = 6009
  readonly name = "InvalidPositionState"
  readonly msg = "Invalid position state"

  constructor(readonly logs?: string[]) {
    super("6009: Invalid position state")
  }
}

export class InvalidPerpetualsConfig extends Error {
  static readonly code = 6010
  readonly code = 6010
  readonly name = "InvalidPerpetualsConfig"
  readonly msg = "Invalid perpetuals config"

  constructor(readonly logs?: string[]) {
    super("6010: Invalid perpetuals config")
  }
}

export class InvalidPoolConfig extends Error {
  static readonly code = 6011
  readonly code = 6011
  readonly name = "InvalidPoolConfig"
  readonly msg = "Invalid pool config"

  constructor(readonly logs?: string[]) {
    super("6011: Invalid pool config")
  }
}

export class InvalidInstruction extends Error {
  static readonly code = 6012
  readonly code = 6012
  readonly name = "InvalidInstruction"
  readonly msg = "Invalid instruction"

  constructor(readonly logs?: string[]) {
    super("6012: Invalid instruction")
  }
}

export class InvalidCustodyConfig extends Error {
  static readonly code = 6013
  readonly code = 6013
  readonly name = "InvalidCustodyConfig"
  readonly msg = "Invalid custody config"

  constructor(readonly logs?: string[]) {
    super("6013: Invalid custody config")
  }
}

export class InvalidCustodyBalance extends Error {
  static readonly code = 6014
  readonly code = 6014
  readonly name = "InvalidCustodyBalance"
  readonly msg = "Invalid custody balance"

  constructor(readonly logs?: string[]) {
    super("6014: Invalid custody balance")
  }
}

export class InvalidArgument extends Error {
  static readonly code = 6015
  readonly code = 6015
  readonly name = "InvalidArgument"
  readonly msg = "Invalid argument"

  constructor(readonly logs?: string[]) {
    super("6015: Invalid argument")
  }
}

export class InvalidPositionRequest extends Error {
  static readonly code = 6016
  readonly code = 6016
  readonly name = "InvalidPositionRequest"
  readonly msg = "Invalid position request"

  constructor(readonly logs?: string[]) {
    super("6016: Invalid position request")
  }
}

export class InvalidPositionRequestInputAta extends Error {
  static readonly code = 6017
  readonly code = 6017
  readonly name = "InvalidPositionRequestInputAta"
  readonly msg = "Invalid position request input ata"

  constructor(readonly logs?: string[]) {
    super("6017: Invalid position request input ata")
  }
}

export class InvalidMint extends Error {
  static readonly code = 6018
  readonly code = 6018
  readonly name = "InvalidMint"
  readonly msg = "Invalid mint"

  constructor(readonly logs?: string[]) {
    super("6018: Invalid mint")
  }
}

export class InsufficientTokenAmount extends Error {
  static readonly code = 6019
  readonly code = 6019
  readonly name = "InsufficientTokenAmount"
  readonly msg = "Insufficient token amount"

  constructor(readonly logs?: string[]) {
    super("6019: Insufficient token amount")
  }
}

export class InsufficientAmountReturned extends Error {
  static readonly code = 6020
  readonly code = 6020
  readonly name = "InsufficientAmountReturned"
  readonly msg = "Insufficient token amount returned"

  constructor(readonly logs?: string[]) {
    super("6020: Insufficient token amount returned")
  }
}

export class MaxPriceSlippage extends Error {
  static readonly code = 6021
  readonly code = 6021
  readonly name = "MaxPriceSlippage"
  readonly msg = "Price slippage limit exceeded"

  constructor(readonly logs?: string[]) {
    super("6021: Price slippage limit exceeded")
  }
}

export class MaxLeverage extends Error {
  static readonly code = 6022
  readonly code = 6022
  readonly name = "MaxLeverage"
  readonly msg = "Position leverage limit exceeded"

  constructor(readonly logs?: string[]) {
    super("6022: Position leverage limit exceeded")
  }
}

export class CustodyAmountLimit extends Error {
  static readonly code = 6023
  readonly code = 6023
  readonly name = "CustodyAmountLimit"
  readonly msg = "Custody amount limit exceeded"

  constructor(readonly logs?: string[]) {
    super("6023: Custody amount limit exceeded")
  }
}

export class PoolAmountLimit extends Error {
  static readonly code = 6024
  readonly code = 6024
  readonly name = "PoolAmountLimit"
  readonly msg = "Pool amount limit exceeded"

  constructor(readonly logs?: string[]) {
    super("6024: Pool amount limit exceeded")
  }
}

export class PersonalPoolAmountLimit extends Error {
  static readonly code = 6025
  readonly code = 6025
  readonly name = "PersonalPoolAmountLimit"
  readonly msg = "Personal pool amount limit exceeded"

  constructor(readonly logs?: string[]) {
    super("6025: Personal pool amount limit exceeded")
  }
}

export class UnsupportedToken extends Error {
  static readonly code = 6026
  readonly code = 6026
  readonly name = "UnsupportedToken"
  readonly msg = "Token is not supported"

  constructor(readonly logs?: string[]) {
    super("6026: Token is not supported")
  }
}

export class InstructionNotAllowed extends Error {
  static readonly code = 6027
  readonly code = 6027
  readonly name = "InstructionNotAllowed"
  readonly msg = "Instruction is not allowed at this time"

  constructor(readonly logs?: string[]) {
    super("6027: Instruction is not allowed at this time")
  }
}

export class JupiterProgramMismatch extends Error {
  static readonly code = 6028
  readonly code = 6028
  readonly name = "JupiterProgramMismatch"
  readonly msg = "Jupiter Program ID mismatch"

  constructor(readonly logs?: string[]) {
    super("6028: Jupiter Program ID mismatch")
  }
}

export class ProgramMismatch extends Error {
  static readonly code = 6029
  readonly code = 6029
  readonly name = "ProgramMismatch"
  readonly msg = "Program ID mismatch"

  constructor(readonly logs?: string[]) {
    super("6029: Program ID mismatch")
  }
}

export class AddressMismatch extends Error {
  static readonly code = 6030
  readonly code = 6030
  readonly name = "AddressMismatch"
  readonly msg = "Address mismatch"

  constructor(readonly logs?: string[]) {
    super("6030: Address mismatch")
  }
}

export class KeeperATAMissing extends Error {
  static readonly code = 6031
  readonly code = 6031
  readonly name = "KeeperATAMissing"
  readonly msg = "Missing keeper ATA"

  constructor(readonly logs?: string[]) {
    super("6031: Missing keeper ATA")
  }
}

export class SwapAmountMismatch extends Error {
  static readonly code = 6032
  readonly code = 6032
  readonly name = "SwapAmountMismatch"
  readonly msg = "Swap amount mismatch"

  constructor(readonly logs?: string[]) {
    super("6032: Swap amount mismatch")
  }
}

export class CPINotAllowed extends Error {
  static readonly code = 6033
  readonly code = 6033
  readonly name = "CPINotAllowed"
  readonly msg = "CPI not allowed"

  constructor(readonly logs?: string[]) {
    super("6033: CPI not allowed")
  }
}

export class InvalidKeeper extends Error {
  static readonly code = 6034
  readonly code = 6034
  readonly name = "InvalidKeeper"
  readonly msg = "Invalid Keeper"

  constructor(readonly logs?: string[]) {
    super("6034: Invalid Keeper")
  }
}

export class ExceedExecutionPeriod extends Error {
  static readonly code = 6035
  readonly code = 6035
  readonly name = "ExceedExecutionPeriod"
  readonly msg = "Exceed execution period"

  constructor(readonly logs?: string[]) {
    super("6035: Exceed execution period")
  }
}

export class InvalidRequestType extends Error {
  static readonly code = 6036
  readonly code = 6036
  readonly name = "InvalidRequestType"
  readonly msg = "Invalid Request Type"

  constructor(readonly logs?: string[]) {
    super("6036: Invalid Request Type")
  }
}

export class InvalidTriggerPrice extends Error {
  static readonly code = 6037
  readonly code = 6037
  readonly name = "InvalidTriggerPrice"
  readonly msg = "Invalid Trigger Price"

  constructor(readonly logs?: string[]) {
    super("6037: Invalid Trigger Price")
  }
}

export class TriggerPriceSlippage extends Error {
  static readonly code = 6038
  readonly code = 6038
  readonly name = "TriggerPriceSlippage"
  readonly msg = "Trigger Price Slippage"

  constructor(readonly logs?: string[]) {
    super("6038: Trigger Price Slippage")
  }
}

export class MissingTriggerPrice extends Error {
  static readonly code = 6039
  readonly code = 6039
  readonly name = "MissingTriggerPrice"
  readonly msg = "Missing Trigger Price"

  constructor(readonly logs?: string[]) {
    super("6039: Missing Trigger Price")
  }
}

export class MissingPriceSlippage extends Error {
  static readonly code = 6040
  readonly code = 6040
  readonly name = "MissingPriceSlippage"
  readonly msg = "Missing Price Slippage"

  constructor(readonly logs?: string[]) {
    super("6040: Missing Price Slippage")
  }
}

export class InvalidPriceCalcMode extends Error {
  static readonly code = 6041
  readonly code = 6041
  readonly name = "InvalidPriceCalcMode"
  readonly msg = "Invalid price calc mode"

  constructor(readonly logs?: string[]) {
    super("6041: Invalid price calc mode")
  }
}

export function fromCode(code: number, logs?: string[]): CustomError | null {
  switch (code) {
    case 6000:
      return new MathOverflow(logs)
    case 6001:
      return new UnsupportedOracle(logs)
    case 6002:
      return new InvalidOracleAccount(logs)
    case 6003:
      return new StaleOraclePrice(logs)
    case 6004:
      return new InvalidOraclePrice(logs)
    case 6005:
      return new InvalidEnvironment(logs)
    case 6006:
      return new InvalidCollateralAccount(logs)
    case 6007:
      return new InvalidCollateralAmount(logs)
    case 6008:
      return new CollateralSlippage(logs)
    case 6009:
      return new InvalidPositionState(logs)
    case 6010:
      return new InvalidPerpetualsConfig(logs)
    case 6011:
      return new InvalidPoolConfig(logs)
    case 6012:
      return new InvalidInstruction(logs)
    case 6013:
      return new InvalidCustodyConfig(logs)
    case 6014:
      return new InvalidCustodyBalance(logs)
    case 6015:
      return new InvalidArgument(logs)
    case 6016:
      return new InvalidPositionRequest(logs)
    case 6017:
      return new InvalidPositionRequestInputAta(logs)
    case 6018:
      return new InvalidMint(logs)
    case 6019:
      return new InsufficientTokenAmount(logs)
    case 6020:
      return new InsufficientAmountReturned(logs)
    case 6021:
      return new MaxPriceSlippage(logs)
    case 6022:
      return new MaxLeverage(logs)
    case 6023:
      return new CustodyAmountLimit(logs)
    case 6024:
      return new PoolAmountLimit(logs)
    case 6025:
      return new PersonalPoolAmountLimit(logs)
    case 6026:
      return new UnsupportedToken(logs)
    case 6027:
      return new InstructionNotAllowed(logs)
    case 6028:
      return new JupiterProgramMismatch(logs)
    case 6029:
      return new ProgramMismatch(logs)
    case 6030:
      return new AddressMismatch(logs)
    case 6031:
      return new KeeperATAMissing(logs)
    case 6032:
      return new SwapAmountMismatch(logs)
    case 6033:
      return new CPINotAllowed(logs)
    case 6034:
      return new InvalidKeeper(logs)
    case 6035:
      return new ExceedExecutionPeriod(logs)
    case 6036:
      return new InvalidRequestType(logs)
    case 6037:
      return new InvalidTriggerPrice(logs)
    case 6038:
      return new TriggerPriceSlippage(logs)
    case 6039:
      return new MissingTriggerPrice(logs)
    case 6040:
      return new MissingPriceSlippage(logs)
    case 6041:
      return new InvalidPriceCalcMode(logs)
  }

  return null
}
