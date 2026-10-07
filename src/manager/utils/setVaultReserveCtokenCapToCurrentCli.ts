import { Instruction } from '@solana/kit';
import BN from 'bn.js';
import Decimal from 'decimal.js';

export function getCurrentCtokenAllocationCapLamports(ctokenAllocationLamports: Decimal): BN {
  const ctokenAllocationCapLamports = new BN(ctokenAllocationLamports.toFixed(0));
  if (ctokenAllocationCapLamports.isZero()) {
    throw new Error('Current cToken allocation is zero. A cToken allocation cap of 0 means uncapped.');
  }
  return ctokenAllocationCapLamports;
}

export function buildSetCtokenCapToCurrentIxs(
  updateReserveAllocationIx: Instruction,
  priorityFeeAndCuIxs: Instruction[],
  updateLUTIxs: Instruction[],
  skipLutUpdate: boolean
): Instruction[] {
  return [updateReserveAllocationIx, ...priorityFeeAndCuIxs, ...(skipLutUpdate ? [] : updateLUTIxs)];
}
