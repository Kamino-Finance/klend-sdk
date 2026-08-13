import {
  AdjustDepositDebtFlashCalcsResult,
  AdjustLeverageCalcsResult,
  AdjustWithdrawCollFlashCalcsResult,
  DepositLeverageCalcsResult,
  DepositLeverageDebtFlashCalcsResult,
  WithdrawLeverageCalcsResult,
  WithdrawLeverageCollFlashCalcsResult,
} from './types';

type AdjustCalcs = AdjustLeverageCalcsResult | AdjustDepositDebtFlashCalcsResult | AdjustWithdrawCollFlashCalcsResult;

export function assertDepositCollFlashCalcs(
  calcs: DepositLeverageCalcsResult | DepositLeverageDebtFlashCalcsResult
): asserts calcs is DepositLeverageCalcsResult {
  if (!('flashBorrowInCollToken' in calcs)) {
    throw new Error('Expected DepositLeverageCalcsResult for coll flash deposit path');
  }
}

export function assertDepositDebtFlashCalcs(
  calcs: DepositLeverageCalcsResult | DepositLeverageDebtFlashCalcsResult
): asserts calcs is DepositLeverageDebtFlashCalcsResult {
  if (!('flashBorrowInDebtToken' in calcs)) {
    throw new Error('Expected DepositLeverageDebtFlashCalcsResult for debt flash deposit path');
  }
}

export function assertWithdrawDebtFlashCalcs(
  calcs: WithdrawLeverageCalcsResult | WithdrawLeverageCollFlashCalcsResult
): asserts calcs is WithdrawLeverageCalcsResult {
  // WithdrawLeverageCalcsResult is the legacy/bare debt-flash shape; coll flash is the only withdraw variant
  // with an explicit discriminator field today.
  if ('flashBorrowInCollToken' in calcs) {
    throw new Error('Expected WithdrawLeverageCalcsResult for debt flash withdraw path');
  }
}

export function assertWithdrawCollFlashCalcs(
  calcs: WithdrawLeverageCalcsResult | WithdrawLeverageCollFlashCalcsResult
): asserts calcs is WithdrawLeverageCollFlashCalcsResult {
  if (!('flashBorrowInCollToken' in calcs)) {
    throw new Error('Expected WithdrawLeverageCollFlashCalcsResult for coll flash withdraw path');
  }
}

function assertAdjustLeverageCalcs(calcs: AdjustCalcs, message: string): asserts calcs is AdjustLeverageCalcsResult {
  if (!('borrowAmount' in calcs)) {
    throw new Error(message);
  }
}

export function assertAdjustIncreaseCollFlashCalcs(calcs: AdjustCalcs): asserts calcs is AdjustLeverageCalcsResult {
  assertAdjustLeverageCalcs(calcs, 'Expected AdjustLeverageCalcsResult for coll flash increase path');
}

export function assertAdjustIncreaseDebtFlashCalcs(
  calcs: AdjustCalcs
): asserts calcs is AdjustDepositDebtFlashCalcsResult {
  if (!('flashBorrowInDebtToken' in calcs)) {
    throw new Error('Expected AdjustDepositDebtFlashCalcsResult for debt flash increase path');
  }
}

export function assertAdjustDecreaseDebtFlashCalcs(calcs: AdjustCalcs): asserts calcs is AdjustLeverageCalcsResult {
  assertAdjustLeverageCalcs(calcs, 'Expected AdjustLeverageCalcsResult for debt flash decrease path');
}

export function assertAdjustDecreaseCollFlashCalcs(
  calcs: AdjustCalcs
): asserts calcs is AdjustWithdrawCollFlashCalcsResult {
  if (!('flashBorrowInCollToken' in calcs)) {
    throw new Error('Expected AdjustWithdrawCollFlashCalcsResult for coll flash decrease path');
  }
}
