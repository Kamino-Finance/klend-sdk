export type CustomError =
  | DepositAmountsZero
  | SharesIssuedAmountDoesNotMatch
  | MathOverflow
  | IntegerOverflow
  | WithdrawAmountBelowMinimum
  | TooMuchLiquidityToWithdraw
  | ReserveAlreadyExists
  | ReserveNotPartOfAllocations
  | CouldNotDeserializeAccountAsReserve
  | ReserveNotProvidedInTheAccounts
  | ReserveAccountAndKeyMismatch
  | OutOfRangeOfReserveIndex
  | CannotFindReserveInAllocations
  | InvestAmountBelowMinimum
  | AdminAuthorityIncorrect
  | BaseVaultAuthorityIncorrect
  | BaseVaultAuthorityBumpIncorrect
  | TokenMintIncorrect
  | TokenMintDecimalsIncorrect
  | TokenVaultIncorrect
  | SharesMintDecimalsIncorrect
  | SharesMintIncorrect
  | InitialAccountintIncorrect
  | ReserveIsStale
  | NotEnoughLiquidityDisinvestedToSendToUser
  | BPSValueTooBig
  | DepositAmountBelowMinimum
  | ReserveSpaceExhausted
  | CannotWithdrawFromEmptyVault
  | TokensDepositedAmountDoesNotMatch
  | AmountToWithdrawDoesNotMatch
  | LiquidityToWithdrawDoesNotMatch
  | UserReceivedAmountDoesNotMatch
  | SharesBurnedAmountDoesNotMatch
  | DisinvestedLiquidityAmountDoesNotMatch
  | SharesMintedAmountDoesNotMatch
  | AUMDecreasedAfterInvest
  | AUMBelowPendingFees

export class DepositAmountsZero extends Error {
  static readonly code = 6000
  readonly code = 6000
  readonly name = "DepositAmountsZero"
  readonly msg = "DepositAmountsZero"

  constructor(readonly logs?: string[]) {
    super("6000: DepositAmountsZero")
  }
}

export class SharesIssuedAmountDoesNotMatch extends Error {
  static readonly code = 6001
  readonly code = 6001
  readonly name = "SharesIssuedAmountDoesNotMatch"
  readonly msg = "SharesIssuedAmountDoesNotMatch"

  constructor(readonly logs?: string[]) {
    super("6001: SharesIssuedAmountDoesNotMatch")
  }
}

export class MathOverflow extends Error {
  static readonly code = 6002
  readonly code = 6002
  readonly name = "MathOverflow"
  readonly msg = "MathOverflow"

  constructor(readonly logs?: string[]) {
    super("6002: MathOverflow")
  }
}

export class IntegerOverflow extends Error {
  static readonly code = 6003
  readonly code = 6003
  readonly name = "IntegerOverflow"
  readonly msg = "IntegerOverflow"

  constructor(readonly logs?: string[]) {
    super("6003: IntegerOverflow")
  }
}

export class WithdrawAmountBelowMinimum extends Error {
  static readonly code = 6004
  readonly code = 6004
  readonly name = "WithdrawAmountBelowMinimum"
  readonly msg = "Withdrawn amount is below minimum"

  constructor(readonly logs?: string[]) {
    super("6004: Withdrawn amount is below minimum")
  }
}

export class TooMuchLiquidityToWithdraw extends Error {
  static readonly code = 6005
  readonly code = 6005
  readonly name = "TooMuchLiquidityToWithdraw"
  readonly msg = "TooMuchLiquidityToWithdraw"

  constructor(readonly logs?: string[]) {
    super("6005: TooMuchLiquidityToWithdraw")
  }
}

export class ReserveAlreadyExists extends Error {
  static readonly code = 6006
  readonly code = 6006
  readonly name = "ReserveAlreadyExists"
  readonly msg = "ReserveAlreadyExists"

  constructor(readonly logs?: string[]) {
    super("6006: ReserveAlreadyExists")
  }
}

export class ReserveNotPartOfAllocations extends Error {
  static readonly code = 6007
  readonly code = 6007
  readonly name = "ReserveNotPartOfAllocations"
  readonly msg = "ReserveNotPartOfAllocations"

  constructor(readonly logs?: string[]) {
    super("6007: ReserveNotPartOfAllocations")
  }
}

export class CouldNotDeserializeAccountAsReserve extends Error {
  static readonly code = 6008
  readonly code = 6008
  readonly name = "CouldNotDeserializeAccountAsReserve"
  readonly msg = "CouldNotDeserializeAccountAsReserve"

  constructor(readonly logs?: string[]) {
    super("6008: CouldNotDeserializeAccountAsReserve")
  }
}

export class ReserveNotProvidedInTheAccounts extends Error {
  static readonly code = 6009
  readonly code = 6009
  readonly name = "ReserveNotProvidedInTheAccounts"
  readonly msg = "ReserveNotProvidedInTheAccounts"

  constructor(readonly logs?: string[]) {
    super("6009: ReserveNotProvidedInTheAccounts")
  }
}

export class ReserveAccountAndKeyMismatch extends Error {
  static readonly code = 6010
  readonly code = 6010
  readonly name = "ReserveAccountAndKeyMismatch"
  readonly msg = "ReserveAccountAndKeyMismatch"

  constructor(readonly logs?: string[]) {
    super("6010: ReserveAccountAndKeyMismatch")
  }
}

export class OutOfRangeOfReserveIndex extends Error {
  static readonly code = 6011
  readonly code = 6011
  readonly name = "OutOfRangeOfReserveIndex"
  readonly msg = "OutOfRangeOfReserveIndex"

  constructor(readonly logs?: string[]) {
    super("6011: OutOfRangeOfReserveIndex")
  }
}

export class CannotFindReserveInAllocations extends Error {
  static readonly code = 6012
  readonly code = 6012
  readonly name = "CannotFindReserveInAllocations"
  readonly msg = "OutOfRangeOfReserveIndex"

  constructor(readonly logs?: string[]) {
    super("6012: OutOfRangeOfReserveIndex")
  }
}

export class InvestAmountBelowMinimum extends Error {
  static readonly code = 6013
  readonly code = 6013
  readonly name = "InvestAmountBelowMinimum"
  readonly msg = "Invested amount is below minimum"

  constructor(readonly logs?: string[]) {
    super("6013: Invested amount is below minimum")
  }
}

export class AdminAuthorityIncorrect extends Error {
  static readonly code = 6014
  readonly code = 6014
  readonly name = "AdminAuthorityIncorrect"
  readonly msg = "AdminAuthorityIncorrect"

  constructor(readonly logs?: string[]) {
    super("6014: AdminAuthorityIncorrect")
  }
}

export class BaseVaultAuthorityIncorrect extends Error {
  static readonly code = 6015
  readonly code = 6015
  readonly name = "BaseVaultAuthorityIncorrect"
  readonly msg = "BaseVaultAuthorityIncorrect"

  constructor(readonly logs?: string[]) {
    super("6015: BaseVaultAuthorityIncorrect")
  }
}

export class BaseVaultAuthorityBumpIncorrect extends Error {
  static readonly code = 6016
  readonly code = 6016
  readonly name = "BaseVaultAuthorityBumpIncorrect"
  readonly msg = "BaseVaultAuthorityBumpIncorrect"

  constructor(readonly logs?: string[]) {
    super("6016: BaseVaultAuthorityBumpIncorrect")
  }
}

export class TokenMintIncorrect extends Error {
  static readonly code = 6017
  readonly code = 6017
  readonly name = "TokenMintIncorrect"
  readonly msg = "TokenMintIncorrect"

  constructor(readonly logs?: string[]) {
    super("6017: TokenMintIncorrect")
  }
}

export class TokenMintDecimalsIncorrect extends Error {
  static readonly code = 6018
  readonly code = 6018
  readonly name = "TokenMintDecimalsIncorrect"
  readonly msg = "TokenMintDecimalsIncorrect"

  constructor(readonly logs?: string[]) {
    super("6018: TokenMintDecimalsIncorrect")
  }
}

export class TokenVaultIncorrect extends Error {
  static readonly code = 6019
  readonly code = 6019
  readonly name = "TokenVaultIncorrect"
  readonly msg = "TokenVaultIncorrect"

  constructor(readonly logs?: string[]) {
    super("6019: TokenVaultIncorrect")
  }
}

export class SharesMintDecimalsIncorrect extends Error {
  static readonly code = 6020
  readonly code = 6020
  readonly name = "SharesMintDecimalsIncorrect"
  readonly msg = "SharesMintDecimalsIncorrect"

  constructor(readonly logs?: string[]) {
    super("6020: SharesMintDecimalsIncorrect")
  }
}

export class SharesMintIncorrect extends Error {
  static readonly code = 6021
  readonly code = 6021
  readonly name = "SharesMintIncorrect"
  readonly msg = "SharesMintIncorrect"

  constructor(readonly logs?: string[]) {
    super("6021: SharesMintIncorrect")
  }
}

export class InitialAccountintIncorrect extends Error {
  static readonly code = 6022
  readonly code = 6022
  readonly name = "InitialAccountintIncorrect"
  readonly msg = "InitialAccountintIncorrect"

  constructor(readonly logs?: string[]) {
    super("6022: InitialAccountintIncorrect")
  }
}

export class ReserveIsStale extends Error {
  static readonly code = 6023
  readonly code = 6023
  readonly name = "ReserveIsStale"
  readonly msg = "Reserve is stale and must be refreshed before any operation"

  constructor(readonly logs?: string[]) {
    super("6023: Reserve is stale and must be refreshed before any operation")
  }
}

export class NotEnoughLiquidityDisinvestedToSendToUser extends Error {
  static readonly code = 6024
  readonly code = 6024
  readonly name = "NotEnoughLiquidityDisinvestedToSendToUser"
  readonly msg = "Not enough liquidity disinvested to send to user"

  constructor(readonly logs?: string[]) {
    super("6024: Not enough liquidity disinvested to send to user")
  }
}

export class BPSValueTooBig extends Error {
  static readonly code = 6025
  readonly code = 6025
  readonly name = "BPSValueTooBig"
  readonly msg = "BPS value is greater than 10000"

  constructor(readonly logs?: string[]) {
    super("6025: BPS value is greater than 10000")
  }
}

export class DepositAmountBelowMinimum extends Error {
  static readonly code = 6026
  readonly code = 6026
  readonly name = "DepositAmountBelowMinimum"
  readonly msg = "Deposited amount is below minimum"

  constructor(readonly logs?: string[]) {
    super("6026: Deposited amount is below minimum")
  }
}

export class ReserveSpaceExhausted extends Error {
  static readonly code = 6027
  readonly code = 6027
  readonly name = "ReserveSpaceExhausted"
  readonly msg = "Vault have no space for new reserves"

  constructor(readonly logs?: string[]) {
    super("6027: Vault have no space for new reserves")
  }
}

export class CannotWithdrawFromEmptyVault extends Error {
  static readonly code = 6028
  readonly code = 6028
  readonly name = "CannotWithdrawFromEmptyVault"
  readonly msg = "Cannot withdraw from empty vault"

  constructor(readonly logs?: string[]) {
    super("6028: Cannot withdraw from empty vault")
  }
}

export class TokensDepositedAmountDoesNotMatch extends Error {
  static readonly code = 6029
  readonly code = 6029
  readonly name = "TokensDepositedAmountDoesNotMatch"
  readonly msg = "TokensDepositedAmountDoesNotMatch"

  constructor(readonly logs?: string[]) {
    super("6029: TokensDepositedAmountDoesNotMatch")
  }
}

export class AmountToWithdrawDoesNotMatch extends Error {
  static readonly code = 6030
  readonly code = 6030
  readonly name = "AmountToWithdrawDoesNotMatch"
  readonly msg = "Amount to withdraw does not match"

  constructor(readonly logs?: string[]) {
    super("6030: Amount to withdraw does not match")
  }
}

export class LiquidityToWithdrawDoesNotMatch extends Error {
  static readonly code = 6031
  readonly code = 6031
  readonly name = "LiquidityToWithdrawDoesNotMatch"
  readonly msg = "Liquidity to withdraw does not match"

  constructor(readonly logs?: string[]) {
    super("6031: Liquidity to withdraw does not match")
  }
}

export class UserReceivedAmountDoesNotMatch extends Error {
  static readonly code = 6032
  readonly code = 6032
  readonly name = "UserReceivedAmountDoesNotMatch"
  readonly msg = "User received amount does not match"

  constructor(readonly logs?: string[]) {
    super("6032: User received amount does not match")
  }
}

export class SharesBurnedAmountDoesNotMatch extends Error {
  static readonly code = 6033
  readonly code = 6033
  readonly name = "SharesBurnedAmountDoesNotMatch"
  readonly msg = "Shares burned amount does not match"

  constructor(readonly logs?: string[]) {
    super("6033: Shares burned amount does not match")
  }
}

export class DisinvestedLiquidityAmountDoesNotMatch extends Error {
  static readonly code = 6034
  readonly code = 6034
  readonly name = "DisinvestedLiquidityAmountDoesNotMatch"
  readonly msg = "Disinvested liquidity amount does not match"

  constructor(readonly logs?: string[]) {
    super("6034: Disinvested liquidity amount does not match")
  }
}

export class SharesMintedAmountDoesNotMatch extends Error {
  static readonly code = 6035
  readonly code = 6035
  readonly name = "SharesMintedAmountDoesNotMatch"
  readonly msg = "SharesMintedAmountDoesNotMatch"

  constructor(readonly logs?: string[]) {
    super("6035: SharesMintedAmountDoesNotMatch")
  }
}

export class AUMDecreasedAfterInvest extends Error {
  static readonly code = 6036
  readonly code = 6036
  readonly name = "AUMDecreasedAfterInvest"
  readonly msg = "AUM decreased after invest"

  constructor(readonly logs?: string[]) {
    super("6036: AUM decreased after invest")
  }
}

export class AUMBelowPendingFees extends Error {
  static readonly code = 6037
  readonly code = 6037
  readonly name = "AUMBelowPendingFees"
  readonly msg = "AUM is below pending fees"

  constructor(readonly logs?: string[]) {
    super("6037: AUM is below pending fees")
  }
}

export function fromCode(code: number, logs?: string[]): CustomError | null {
  switch (code) {
    case 6000:
      return new DepositAmountsZero(logs)
    case 6001:
      return new SharesIssuedAmountDoesNotMatch(logs)
    case 6002:
      return new MathOverflow(logs)
    case 6003:
      return new IntegerOverflow(logs)
    case 6004:
      return new WithdrawAmountBelowMinimum(logs)
    case 6005:
      return new TooMuchLiquidityToWithdraw(logs)
    case 6006:
      return new ReserveAlreadyExists(logs)
    case 6007:
      return new ReserveNotPartOfAllocations(logs)
    case 6008:
      return new CouldNotDeserializeAccountAsReserve(logs)
    case 6009:
      return new ReserveNotProvidedInTheAccounts(logs)
    case 6010:
      return new ReserveAccountAndKeyMismatch(logs)
    case 6011:
      return new OutOfRangeOfReserveIndex(logs)
    case 6012:
      return new CannotFindReserveInAllocations(logs)
    case 6013:
      return new InvestAmountBelowMinimum(logs)
    case 6014:
      return new AdminAuthorityIncorrect(logs)
    case 6015:
      return new BaseVaultAuthorityIncorrect(logs)
    case 6016:
      return new BaseVaultAuthorityBumpIncorrect(logs)
    case 6017:
      return new TokenMintIncorrect(logs)
    case 6018:
      return new TokenMintDecimalsIncorrect(logs)
    case 6019:
      return new TokenVaultIncorrect(logs)
    case 6020:
      return new SharesMintDecimalsIncorrect(logs)
    case 6021:
      return new SharesMintIncorrect(logs)
    case 6022:
      return new InitialAccountintIncorrect(logs)
    case 6023:
      return new ReserveIsStale(logs)
    case 6024:
      return new NotEnoughLiquidityDisinvestedToSendToUser(logs)
    case 6025:
      return new BPSValueTooBig(logs)
    case 6026:
      return new DepositAmountBelowMinimum(logs)
    case 6027:
      return new ReserveSpaceExhausted(logs)
    case 6028:
      return new CannotWithdrawFromEmptyVault(logs)
    case 6029:
      return new TokensDepositedAmountDoesNotMatch(logs)
    case 6030:
      return new AmountToWithdrawDoesNotMatch(logs)
    case 6031:
      return new LiquidityToWithdrawDoesNotMatch(logs)
    case 6032:
      return new UserReceivedAmountDoesNotMatch(logs)
    case 6033:
      return new SharesBurnedAmountDoesNotMatch(logs)
    case 6034:
      return new DisinvestedLiquidityAmountDoesNotMatch(logs)
    case 6035:
      return new SharesMintedAmountDoesNotMatch(logs)
    case 6036:
      return new AUMDecreasedAfterInvest(logs)
    case 6037:
      return new AUMBelowPendingFees(logs)
  }

  return null
}
