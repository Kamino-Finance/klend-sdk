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
  | InitialAccountingIncorrect
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
  | DepositAmountsZeroShares
  | WithdrawResultsInZeroShares
  | CannotWithdrawZeroShares
  | ManagementFeeGreaterThanMaxAllowed
  | VaultAUMZero
  | MissingReserveForBatchRefresh
  | MinWithdrawAmountTooBig
  | InvestTooSoon
  | WrongAdminOrAllocationAdmin
  | ReserveHasNonZeroAllocationOrCTokens
  | DepositAmountGreaterThanRequestedAmount

export class DepositAmountsZero extends Error {
  static readonly code = 7000
  readonly code = 7000
  readonly name = "DepositAmountsZero"
  readonly msg = "DepositAmountsZero"

  constructor(readonly logs?: string[]) {
    super("7000: DepositAmountsZero")
  }
}

export class SharesIssuedAmountDoesNotMatch extends Error {
  static readonly code = 7001
  readonly code = 7001
  readonly name = "SharesIssuedAmountDoesNotMatch"
  readonly msg = "SharesIssuedAmountDoesNotMatch"

  constructor(readonly logs?: string[]) {
    super("7001: SharesIssuedAmountDoesNotMatch")
  }
}

export class MathOverflow extends Error {
  static readonly code = 7002
  readonly code = 7002
  readonly name = "MathOverflow"
  readonly msg = "MathOverflow"

  constructor(readonly logs?: string[]) {
    super("7002: MathOverflow")
  }
}

export class IntegerOverflow extends Error {
  static readonly code = 7003
  readonly code = 7003
  readonly name = "IntegerOverflow"
  readonly msg = "IntegerOverflow"

  constructor(readonly logs?: string[]) {
    super("7003: IntegerOverflow")
  }
}

export class WithdrawAmountBelowMinimum extends Error {
  static readonly code = 7004
  readonly code = 7004
  readonly name = "WithdrawAmountBelowMinimum"
  readonly msg = "Withdrawn amount is below minimum"

  constructor(readonly logs?: string[]) {
    super("7004: Withdrawn amount is below minimum")
  }
}

export class TooMuchLiquidityToWithdraw extends Error {
  static readonly code = 7005
  readonly code = 7005
  readonly name = "TooMuchLiquidityToWithdraw"
  readonly msg = "TooMuchLiquidityToWithdraw"

  constructor(readonly logs?: string[]) {
    super("7005: TooMuchLiquidityToWithdraw")
  }
}

export class ReserveAlreadyExists extends Error {
  static readonly code = 7006
  readonly code = 7006
  readonly name = "ReserveAlreadyExists"
  readonly msg = "ReserveAlreadyExists"

  constructor(readonly logs?: string[]) {
    super("7006: ReserveAlreadyExists")
  }
}

export class ReserveNotPartOfAllocations extends Error {
  static readonly code = 7007
  readonly code = 7007
  readonly name = "ReserveNotPartOfAllocations"
  readonly msg = "ReserveNotPartOfAllocations"

  constructor(readonly logs?: string[]) {
    super("7007: ReserveNotPartOfAllocations")
  }
}

export class CouldNotDeserializeAccountAsReserve extends Error {
  static readonly code = 7008
  readonly code = 7008
  readonly name = "CouldNotDeserializeAccountAsReserve"
  readonly msg = "CouldNotDeserializeAccountAsReserve"

  constructor(readonly logs?: string[]) {
    super("7008: CouldNotDeserializeAccountAsReserve")
  }
}

export class ReserveNotProvidedInTheAccounts extends Error {
  static readonly code = 7009
  readonly code = 7009
  readonly name = "ReserveNotProvidedInTheAccounts"
  readonly msg = "ReserveNotProvidedInTheAccounts"

  constructor(readonly logs?: string[]) {
    super("7009: ReserveNotProvidedInTheAccounts")
  }
}

export class ReserveAccountAndKeyMismatch extends Error {
  static readonly code = 7010
  readonly code = 7010
  readonly name = "ReserveAccountAndKeyMismatch"
  readonly msg = "ReserveAccountAndKeyMismatch"

  constructor(readonly logs?: string[]) {
    super("7010: ReserveAccountAndKeyMismatch")
  }
}

export class OutOfRangeOfReserveIndex extends Error {
  static readonly code = 7011
  readonly code = 7011
  readonly name = "OutOfRangeOfReserveIndex"
  readonly msg = "OutOfRangeOfReserveIndex"

  constructor(readonly logs?: string[]) {
    super("7011: OutOfRangeOfReserveIndex")
  }
}

export class CannotFindReserveInAllocations extends Error {
  static readonly code = 7012
  readonly code = 7012
  readonly name = "CannotFindReserveInAllocations"
  readonly msg = "OutOfRangeOfReserveIndex"

  constructor(readonly logs?: string[]) {
    super("7012: OutOfRangeOfReserveIndex")
  }
}

export class InvestAmountBelowMinimum extends Error {
  static readonly code = 7013
  readonly code = 7013
  readonly name = "InvestAmountBelowMinimum"
  readonly msg = "Invested amount is below minimum"

  constructor(readonly logs?: string[]) {
    super("7013: Invested amount is below minimum")
  }
}

export class AdminAuthorityIncorrect extends Error {
  static readonly code = 7014
  readonly code = 7014
  readonly name = "AdminAuthorityIncorrect"
  readonly msg = "AdminAuthorityIncorrect"

  constructor(readonly logs?: string[]) {
    super("7014: AdminAuthorityIncorrect")
  }
}

export class BaseVaultAuthorityIncorrect extends Error {
  static readonly code = 7015
  readonly code = 7015
  readonly name = "BaseVaultAuthorityIncorrect"
  readonly msg = "BaseVaultAuthorityIncorrect"

  constructor(readonly logs?: string[]) {
    super("7015: BaseVaultAuthorityIncorrect")
  }
}

export class BaseVaultAuthorityBumpIncorrect extends Error {
  static readonly code = 7016
  readonly code = 7016
  readonly name = "BaseVaultAuthorityBumpIncorrect"
  readonly msg = "BaseVaultAuthorityBumpIncorrect"

  constructor(readonly logs?: string[]) {
    super("7016: BaseVaultAuthorityBumpIncorrect")
  }
}

export class TokenMintIncorrect extends Error {
  static readonly code = 7017
  readonly code = 7017
  readonly name = "TokenMintIncorrect"
  readonly msg = "TokenMintIncorrect"

  constructor(readonly logs?: string[]) {
    super("7017: TokenMintIncorrect")
  }
}

export class TokenMintDecimalsIncorrect extends Error {
  static readonly code = 7018
  readonly code = 7018
  readonly name = "TokenMintDecimalsIncorrect"
  readonly msg = "TokenMintDecimalsIncorrect"

  constructor(readonly logs?: string[]) {
    super("7018: TokenMintDecimalsIncorrect")
  }
}

export class TokenVaultIncorrect extends Error {
  static readonly code = 7019
  readonly code = 7019
  readonly name = "TokenVaultIncorrect"
  readonly msg = "TokenVaultIncorrect"

  constructor(readonly logs?: string[]) {
    super("7019: TokenVaultIncorrect")
  }
}

export class SharesMintDecimalsIncorrect extends Error {
  static readonly code = 7020
  readonly code = 7020
  readonly name = "SharesMintDecimalsIncorrect"
  readonly msg = "SharesMintDecimalsIncorrect"

  constructor(readonly logs?: string[]) {
    super("7020: SharesMintDecimalsIncorrect")
  }
}

export class SharesMintIncorrect extends Error {
  static readonly code = 7021
  readonly code = 7021
  readonly name = "SharesMintIncorrect"
  readonly msg = "SharesMintIncorrect"

  constructor(readonly logs?: string[]) {
    super("7021: SharesMintIncorrect")
  }
}

export class InitialAccountingIncorrect extends Error {
  static readonly code = 7022
  readonly code = 7022
  readonly name = "InitialAccountingIncorrect"
  readonly msg = "InitialAccountingIncorrect"

  constructor(readonly logs?: string[]) {
    super("7022: InitialAccountingIncorrect")
  }
}

export class ReserveIsStale extends Error {
  static readonly code = 7023
  readonly code = 7023
  readonly name = "ReserveIsStale"
  readonly msg = "Reserve is stale and must be refreshed before any operation"

  constructor(readonly logs?: string[]) {
    super("7023: Reserve is stale and must be refreshed before any operation")
  }
}

export class NotEnoughLiquidityDisinvestedToSendToUser extends Error {
  static readonly code = 7024
  readonly code = 7024
  readonly name = "NotEnoughLiquidityDisinvestedToSendToUser"
  readonly msg = "Not enough liquidity disinvested to send to user"

  constructor(readonly logs?: string[]) {
    super("7024: Not enough liquidity disinvested to send to user")
  }
}

export class BPSValueTooBig extends Error {
  static readonly code = 7025
  readonly code = 7025
  readonly name = "BPSValueTooBig"
  readonly msg = "BPS value is greater than 10000"

  constructor(readonly logs?: string[]) {
    super("7025: BPS value is greater than 10000")
  }
}

export class DepositAmountBelowMinimum extends Error {
  static readonly code = 7026
  readonly code = 7026
  readonly name = "DepositAmountBelowMinimum"
  readonly msg = "Deposited amount is below minimum"

  constructor(readonly logs?: string[]) {
    super("7026: Deposited amount is below minimum")
  }
}

export class ReserveSpaceExhausted extends Error {
  static readonly code = 7027
  readonly code = 7027
  readonly name = "ReserveSpaceExhausted"
  readonly msg = "Vault have no space for new reserves"

  constructor(readonly logs?: string[]) {
    super("7027: Vault have no space for new reserves")
  }
}

export class CannotWithdrawFromEmptyVault extends Error {
  static readonly code = 7028
  readonly code = 7028
  readonly name = "CannotWithdrawFromEmptyVault"
  readonly msg = "Cannot withdraw from empty vault"

  constructor(readonly logs?: string[]) {
    super("7028: Cannot withdraw from empty vault")
  }
}

export class TokensDepositedAmountDoesNotMatch extends Error {
  static readonly code = 7029
  readonly code = 7029
  readonly name = "TokensDepositedAmountDoesNotMatch"
  readonly msg = "TokensDepositedAmountDoesNotMatch"

  constructor(readonly logs?: string[]) {
    super("7029: TokensDepositedAmountDoesNotMatch")
  }
}

export class AmountToWithdrawDoesNotMatch extends Error {
  static readonly code = 7030
  readonly code = 7030
  readonly name = "AmountToWithdrawDoesNotMatch"
  readonly msg = "Amount to withdraw does not match"

  constructor(readonly logs?: string[]) {
    super("7030: Amount to withdraw does not match")
  }
}

export class LiquidityToWithdrawDoesNotMatch extends Error {
  static readonly code = 7031
  readonly code = 7031
  readonly name = "LiquidityToWithdrawDoesNotMatch"
  readonly msg = "Liquidity to withdraw does not match"

  constructor(readonly logs?: string[]) {
    super("7031: Liquidity to withdraw does not match")
  }
}

export class UserReceivedAmountDoesNotMatch extends Error {
  static readonly code = 7032
  readonly code = 7032
  readonly name = "UserReceivedAmountDoesNotMatch"
  readonly msg = "User received amount does not match"

  constructor(readonly logs?: string[]) {
    super("7032: User received amount does not match")
  }
}

export class SharesBurnedAmountDoesNotMatch extends Error {
  static readonly code = 7033
  readonly code = 7033
  readonly name = "SharesBurnedAmountDoesNotMatch"
  readonly msg = "Shares burned amount does not match"

  constructor(readonly logs?: string[]) {
    super("7033: Shares burned amount does not match")
  }
}

export class DisinvestedLiquidityAmountDoesNotMatch extends Error {
  static readonly code = 7034
  readonly code = 7034
  readonly name = "DisinvestedLiquidityAmountDoesNotMatch"
  readonly msg = "Disinvested liquidity amount does not match"

  constructor(readonly logs?: string[]) {
    super("7034: Disinvested liquidity amount does not match")
  }
}

export class SharesMintedAmountDoesNotMatch extends Error {
  static readonly code = 7035
  readonly code = 7035
  readonly name = "SharesMintedAmountDoesNotMatch"
  readonly msg = "SharesMintedAmountDoesNotMatch"

  constructor(readonly logs?: string[]) {
    super("7035: SharesMintedAmountDoesNotMatch")
  }
}

export class AUMDecreasedAfterInvest extends Error {
  static readonly code = 7036
  readonly code = 7036
  readonly name = "AUMDecreasedAfterInvest"
  readonly msg = "AUM decreased after invest"

  constructor(readonly logs?: string[]) {
    super("7036: AUM decreased after invest")
  }
}

export class AUMBelowPendingFees extends Error {
  static readonly code = 7037
  readonly code = 7037
  readonly name = "AUMBelowPendingFees"
  readonly msg = "AUM is below pending fees"

  constructor(readonly logs?: string[]) {
    super("7037: AUM is below pending fees")
  }
}

export class DepositAmountsZeroShares extends Error {
  static readonly code = 7038
  readonly code = 7038
  readonly name = "DepositAmountsZeroShares"
  readonly msg = "Deposit amount results in 0 shares"

  constructor(readonly logs?: string[]) {
    super("7038: Deposit amount results in 0 shares")
  }
}

export class WithdrawResultsInZeroShares extends Error {
  static readonly code = 7039
  readonly code = 7039
  readonly name = "WithdrawResultsInZeroShares"
  readonly msg = "Withdraw amount results in 0 shares"

  constructor(readonly logs?: string[]) {
    super("7039: Withdraw amount results in 0 shares")
  }
}

export class CannotWithdrawZeroShares extends Error {
  static readonly code = 7040
  readonly code = 7040
  readonly name = "CannotWithdrawZeroShares"
  readonly msg = "Cannot withdraw zero shares"

  constructor(readonly logs?: string[]) {
    super("7040: Cannot withdraw zero shares")
  }
}

export class ManagementFeeGreaterThanMaxAllowed extends Error {
  static readonly code = 7041
  readonly code = 7041
  readonly name = "ManagementFeeGreaterThanMaxAllowed"
  readonly msg = "Management fee is greater than maximum allowed"

  constructor(readonly logs?: string[]) {
    super("7041: Management fee is greater than maximum allowed")
  }
}

export class VaultAUMZero extends Error {
  static readonly code = 7042
  readonly code = 7042
  readonly name = "VaultAUMZero"
  readonly msg = "Vault assets under management are empty"

  constructor(readonly logs?: string[]) {
    super("7042: Vault assets under management are empty")
  }
}

export class MissingReserveForBatchRefresh extends Error {
  static readonly code = 7043
  readonly code = 7043
  readonly name = "MissingReserveForBatchRefresh"
  readonly msg = "Missing reserve for batch refresh"

  constructor(readonly logs?: string[]) {
    super("7043: Missing reserve for batch refresh")
  }
}

export class MinWithdrawAmountTooBig extends Error {
  static readonly code = 7044
  readonly code = 7044
  readonly name = "MinWithdrawAmountTooBig"
  readonly msg = "Min withdraw amount is too big"

  constructor(readonly logs?: string[]) {
    super("7044: Min withdraw amount is too big")
  }
}

export class InvestTooSoon extends Error {
  static readonly code = 7045
  readonly code = 7045
  readonly name = "InvestTooSoon"
  readonly msg = "Invest is called too soon after last invest"

  constructor(readonly logs?: string[]) {
    super("7045: Invest is called too soon after last invest")
  }
}

export class WrongAdminOrAllocationAdmin extends Error {
  static readonly code = 7046
  readonly code = 7046
  readonly name = "WrongAdminOrAllocationAdmin"
  readonly msg = "Wrong admin or allocation admin"

  constructor(readonly logs?: string[]) {
    super("7046: Wrong admin or allocation admin")
  }
}

export class ReserveHasNonZeroAllocationOrCTokens extends Error {
  static readonly code = 7047
  readonly code = 7047
  readonly name = "ReserveHasNonZeroAllocationOrCTokens"
  readonly msg =
    "Reserve has non-zero allocation or ctokens so cannot be removed"

  constructor(readonly logs?: string[]) {
    super(
      "7047: Reserve has non-zero allocation or ctokens so cannot be removed"
    )
  }
}

export class DepositAmountGreaterThanRequestedAmount extends Error {
  static readonly code = 7048
  readonly code = 7048
  readonly name = "DepositAmountGreaterThanRequestedAmount"
  readonly msg = "Deposit amount is greater than requested amount"

  constructor(readonly logs?: string[]) {
    super("7048: Deposit amount is greater than requested amount")
  }
}

export function fromCode(code: number, logs?: string[]): CustomError | null {
  switch (code) {
    case 7000:
      return new DepositAmountsZero(logs)
    case 7001:
      return new SharesIssuedAmountDoesNotMatch(logs)
    case 7002:
      return new MathOverflow(logs)
    case 7003:
      return new IntegerOverflow(logs)
    case 7004:
      return new WithdrawAmountBelowMinimum(logs)
    case 7005:
      return new TooMuchLiquidityToWithdraw(logs)
    case 7006:
      return new ReserveAlreadyExists(logs)
    case 7007:
      return new ReserveNotPartOfAllocations(logs)
    case 7008:
      return new CouldNotDeserializeAccountAsReserve(logs)
    case 7009:
      return new ReserveNotProvidedInTheAccounts(logs)
    case 7010:
      return new ReserveAccountAndKeyMismatch(logs)
    case 7011:
      return new OutOfRangeOfReserveIndex(logs)
    case 7012:
      return new CannotFindReserveInAllocations(logs)
    case 7013:
      return new InvestAmountBelowMinimum(logs)
    case 7014:
      return new AdminAuthorityIncorrect(logs)
    case 7015:
      return new BaseVaultAuthorityIncorrect(logs)
    case 7016:
      return new BaseVaultAuthorityBumpIncorrect(logs)
    case 7017:
      return new TokenMintIncorrect(logs)
    case 7018:
      return new TokenMintDecimalsIncorrect(logs)
    case 7019:
      return new TokenVaultIncorrect(logs)
    case 7020:
      return new SharesMintDecimalsIncorrect(logs)
    case 7021:
      return new SharesMintIncorrect(logs)
    case 7022:
      return new InitialAccountingIncorrect(logs)
    case 7023:
      return new ReserveIsStale(logs)
    case 7024:
      return new NotEnoughLiquidityDisinvestedToSendToUser(logs)
    case 7025:
      return new BPSValueTooBig(logs)
    case 7026:
      return new DepositAmountBelowMinimum(logs)
    case 7027:
      return new ReserveSpaceExhausted(logs)
    case 7028:
      return new CannotWithdrawFromEmptyVault(logs)
    case 7029:
      return new TokensDepositedAmountDoesNotMatch(logs)
    case 7030:
      return new AmountToWithdrawDoesNotMatch(logs)
    case 7031:
      return new LiquidityToWithdrawDoesNotMatch(logs)
    case 7032:
      return new UserReceivedAmountDoesNotMatch(logs)
    case 7033:
      return new SharesBurnedAmountDoesNotMatch(logs)
    case 7034:
      return new DisinvestedLiquidityAmountDoesNotMatch(logs)
    case 7035:
      return new SharesMintedAmountDoesNotMatch(logs)
    case 7036:
      return new AUMDecreasedAfterInvest(logs)
    case 7037:
      return new AUMBelowPendingFees(logs)
    case 7038:
      return new DepositAmountsZeroShares(logs)
    case 7039:
      return new WithdrawResultsInZeroShares(logs)
    case 7040:
      return new CannotWithdrawZeroShares(logs)
    case 7041:
      return new ManagementFeeGreaterThanMaxAllowed(logs)
    case 7042:
      return new VaultAUMZero(logs)
    case 7043:
      return new MissingReserveForBatchRefresh(logs)
    case 7044:
      return new MinWithdrawAmountTooBig(logs)
    case 7045:
      return new InvestTooSoon(logs)
    case 7046:
      return new WrongAdminOrAllocationAdmin(logs)
    case 7047:
      return new ReserveHasNonZeroAllocationOrCTokens(logs)
    case 7048:
      return new DepositAmountGreaterThanRequestedAmount(logs)
  }

  return null
}
