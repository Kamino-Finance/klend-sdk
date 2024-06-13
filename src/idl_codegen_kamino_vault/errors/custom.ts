export type CustomError =
  | DepositAmountsZero
  | SharesIssuedAmountDoesNotMatch
  | MathOverflow
  | IntegerOverflow
  | CannotWithdrawZeroAmount
  | TooMuchLiquidityToWithdraw
  | ReserveAlreadyExists
  | ReserveNotPartOfAllocations
  | CouldNotDeserializeAccountAsReserve
  | ReserveNotProvidedInTheAccounts
  | ReserveAccountAndKeyMismatch
  | OutOfRangeOfReserveIndex
  | CannotFindReserveInAllocations
  | CannotInvestZeroAmount
  | SlotDecreased
  | AdminAuthorityIncorrect
  | BaseVaultAuthorityIncorrect
  | BaseVaultAuthorityBumpIncorrect
  | TokenMintIncorrect
  | TokenMintDecimalsIncorrect
  | TokenVaultIncorrect
  | SharesMintDecimalsIncorrect
  | SharesMintIncorrect
  | InitialAccountintIncorrect;

export class DepositAmountsZero extends Error {
  static readonly code = 6000;
  readonly code = 6000;
  readonly name = 'DepositAmountsZero';
  readonly msg = 'DepositAmountsZero';

  constructor(readonly logs?: string[]) {
    super('6000: DepositAmountsZero');
  }
}

export class SharesIssuedAmountDoesNotMatch extends Error {
  static readonly code = 6001;
  readonly code = 6001;
  readonly name = 'SharesIssuedAmountDoesNotMatch';
  readonly msg = 'SharesIssuedAmountDoesNotMatch';

  constructor(readonly logs?: string[]) {
    super('6001: SharesIssuedAmountDoesNotMatch');
  }
}

export class MathOverflow extends Error {
  static readonly code = 6002;
  readonly code = 6002;
  readonly name = 'MathOverflow';
  readonly msg = 'MathOverflow';

  constructor(readonly logs?: string[]) {
    super('6002: MathOverflow');
  }
}

export class IntegerOverflow extends Error {
  static readonly code = 6003;
  readonly code = 6003;
  readonly name = 'IntegerOverflow';
  readonly msg = 'IntegerOverflow';

  constructor(readonly logs?: string[]) {
    super('6003: IntegerOverflow');
  }
}

export class CannotWithdrawZeroAmount extends Error {
  static readonly code = 6004;
  readonly code = 6004;
  readonly name = 'CannotWithdrawZeroAmount';
  readonly msg = 'CannotWithdrawZeroAmount';

  constructor(readonly logs?: string[]) {
    super('6004: CannotWithdrawZeroAmount');
  }
}

export class TooMuchLiquidityToWithdraw extends Error {
  static readonly code = 6005;
  readonly code = 6005;
  readonly name = 'TooMuchLiquidityToWithdraw';
  readonly msg = 'TooMuchLiquidityToWithdraw';

  constructor(readonly logs?: string[]) {
    super('6005: TooMuchLiquidityToWithdraw');
  }
}

export class ReserveAlreadyExists extends Error {
  static readonly code = 6006;
  readonly code = 6006;
  readonly name = 'ReserveAlreadyExists';
  readonly msg = 'ReserveAlreadyExists';

  constructor(readonly logs?: string[]) {
    super('6006: ReserveAlreadyExists');
  }
}

export class ReserveNotPartOfAllocations extends Error {
  static readonly code = 6007;
  readonly code = 6007;
  readonly name = 'ReserveNotPartOfAllocations';
  readonly msg = 'ReserveNotPartOfAllocations';

  constructor(readonly logs?: string[]) {
    super('6007: ReserveNotPartOfAllocations');
  }
}

export class CouldNotDeserializeAccountAsReserve extends Error {
  static readonly code = 6008;
  readonly code = 6008;
  readonly name = 'CouldNotDeserializeAccountAsReserve';
  readonly msg = 'CouldNotDeserializeAccountAsReserve';

  constructor(readonly logs?: string[]) {
    super('6008: CouldNotDeserializeAccountAsReserve');
  }
}

export class ReserveNotProvidedInTheAccounts extends Error {
  static readonly code = 6009;
  readonly code = 6009;
  readonly name = 'ReserveNotProvidedInTheAccounts';
  readonly msg = 'ReserveNotProvidedInTheAccounts';

  constructor(readonly logs?: string[]) {
    super('6009: ReserveNotProvidedInTheAccounts');
  }
}

export class ReserveAccountAndKeyMismatch extends Error {
  static readonly code = 6010;
  readonly code = 6010;
  readonly name = 'ReserveAccountAndKeyMismatch';
  readonly msg = 'ReserveAccountAndKeyMismatch';

  constructor(readonly logs?: string[]) {
    super('6010: ReserveAccountAndKeyMismatch');
  }
}

export class OutOfRangeOfReserveIndex extends Error {
  static readonly code = 6011;
  readonly code = 6011;
  readonly name = 'OutOfRangeOfReserveIndex';
  readonly msg = 'OutOfRangeOfReserveIndex';

  constructor(readonly logs?: string[]) {
    super('6011: OutOfRangeOfReserveIndex');
  }
}

export class CannotFindReserveInAllocations extends Error {
  static readonly code = 6012;
  readonly code = 6012;
  readonly name = 'CannotFindReserveInAllocations';
  readonly msg = 'OutOfRangeOfReserveIndex';

  constructor(readonly logs?: string[]) {
    super('6012: OutOfRangeOfReserveIndex');
  }
}

export class CannotInvestZeroAmount extends Error {
  static readonly code = 6013;
  readonly code = 6013;
  readonly name = 'CannotInvestZeroAmount';
  readonly msg = 'CannotInvestZeroAmount';

  constructor(readonly logs?: string[]) {
    super('6013: CannotInvestZeroAmount');
  }
}

export class SlotDecreased extends Error {
  static readonly code = 6014;
  readonly code = 6014;
  readonly name = 'SlotDecreased';
  readonly msg = 'SlotDecreased';

  constructor(readonly logs?: string[]) {
    super('6014: SlotDecreased');
  }
}

export class AdminAuthorityIncorrect extends Error {
  static readonly code = 6015;
  readonly code = 6015;
  readonly name = 'AdminAuthorityIncorrect';
  readonly msg = 'AdminAuthorityIncorrect';

  constructor(readonly logs?: string[]) {
    super('6015: AdminAuthorityIncorrect');
  }
}

export class BaseVaultAuthorityIncorrect extends Error {
  static readonly code = 6016;
  readonly code = 6016;
  readonly name = 'BaseVaultAuthorityIncorrect';
  readonly msg = 'BaseVaultAuthorityIncorrect';

  constructor(readonly logs?: string[]) {
    super('6016: BaseVaultAuthorityIncorrect');
  }
}

export class BaseVaultAuthorityBumpIncorrect extends Error {
  static readonly code = 6017;
  readonly code = 6017;
  readonly name = 'BaseVaultAuthorityBumpIncorrect';
  readonly msg = 'BaseVaultAuthorityBumpIncorrect';

  constructor(readonly logs?: string[]) {
    super('6017: BaseVaultAuthorityBumpIncorrect');
  }
}

export class TokenMintIncorrect extends Error {
  static readonly code = 6018;
  readonly code = 6018;
  readonly name = 'TokenMintIncorrect';
  readonly msg = 'TokenMintIncorrect';

  constructor(readonly logs?: string[]) {
    super('6018: TokenMintIncorrect');
  }
}

export class TokenMintDecimalsIncorrect extends Error {
  static readonly code = 6019;
  readonly code = 6019;
  readonly name = 'TokenMintDecimalsIncorrect';
  readonly msg = 'TokenMintDecimalsIncorrect';

  constructor(readonly logs?: string[]) {
    super('6019: TokenMintDecimalsIncorrect');
  }
}

export class TokenVaultIncorrect extends Error {
  static readonly code = 6020;
  readonly code = 6020;
  readonly name = 'TokenVaultIncorrect';
  readonly msg = 'TokenVaultIncorrect';

  constructor(readonly logs?: string[]) {
    super('6020: TokenVaultIncorrect');
  }
}

export class SharesMintDecimalsIncorrect extends Error {
  static readonly code = 6021;
  readonly code = 6021;
  readonly name = 'SharesMintDecimalsIncorrect';
  readonly msg = 'SharesMintDecimalsIncorrect';

  constructor(readonly logs?: string[]) {
    super('6021: SharesMintDecimalsIncorrect');
  }
}

export class SharesMintIncorrect extends Error {
  static readonly code = 6022;
  readonly code = 6022;
  readonly name = 'SharesMintIncorrect';
  readonly msg = 'SharesMintIncorrect';

  constructor(readonly logs?: string[]) {
    super('6022: SharesMintIncorrect');
  }
}

export class InitialAccountintIncorrect extends Error {
  static readonly code = 6023;
  readonly code = 6023;
  readonly name = 'InitialAccountintIncorrect';
  readonly msg = 'InitialAccountintIncorrect';

  constructor(readonly logs?: string[]) {
    super('6023: InitialAccountintIncorrect');
  }
}

export function fromCode(code: number, logs?: string[]): CustomError | null {
  switch (code) {
    case 6000:
      return new DepositAmountsZero(logs);
    case 6001:
      return new SharesIssuedAmountDoesNotMatch(logs);
    case 6002:
      return new MathOverflow(logs);
    case 6003:
      return new IntegerOverflow(logs);
    case 6004:
      return new CannotWithdrawZeroAmount(logs);
    case 6005:
      return new TooMuchLiquidityToWithdraw(logs);
    case 6006:
      return new ReserveAlreadyExists(logs);
    case 6007:
      return new ReserveNotPartOfAllocations(logs);
    case 6008:
      return new CouldNotDeserializeAccountAsReserve(logs);
    case 6009:
      return new ReserveNotProvidedInTheAccounts(logs);
    case 6010:
      return new ReserveAccountAndKeyMismatch(logs);
    case 6011:
      return new OutOfRangeOfReserveIndex(logs);
    case 6012:
      return new CannotFindReserveInAllocations(logs);
    case 6013:
      return new CannotInvestZeroAmount(logs);
    case 6014:
      return new SlotDecreased(logs);
    case 6015:
      return new AdminAuthorityIncorrect(logs);
    case 6016:
      return new BaseVaultAuthorityIncorrect(logs);
    case 6017:
      return new BaseVaultAuthorityBumpIncorrect(logs);
    case 6018:
      return new TokenMintIncorrect(logs);
    case 6019:
      return new TokenMintDecimalsIncorrect(logs);
    case 6020:
      return new TokenVaultIncorrect(logs);
    case 6021:
      return new SharesMintDecimalsIncorrect(logs);
    case 6022:
      return new SharesMintIncorrect(logs);
    case 6023:
      return new InitialAccountintIncorrect(logs);
  }

  return null;
}
