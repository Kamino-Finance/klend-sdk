import { Instruction } from '@solana/kit';
import {
  COMPUTE_BUDGET_PROGRAM_ADDRESS,
  getSetComputeUnitLimitInstruction,
  getSetComputeUnitPriceInstruction,
} from '@solana-program/compute-budget';

const microLamport = 10 ** 6; // 1 lamport

export function getPriorityFeeAndCuIxs({
  priorityFeeMultiplier,
  computeUnits = 200_000,
}: {
  priorityFeeMultiplier: number;
  computeUnits?: number;
}): Instruction[] {
  const microLamportsPrioritizationFee = microLamport / computeUnits;
  return [
    getSetComputeUnitLimitInstruction({ units: computeUnits }),
    getSetComputeUnitPriceInstruction({
      microLamports: Math.round(microLamportsPrioritizationFee * priorityFeeMultiplier),
    }),
  ];
}

export function removeComputeBudgetProgramInstructions(ixs: Instruction[]): Instruction[] {
  const filteredIxs = ixs.filter((ix) => {
    if (ix.programAddress === COMPUTE_BUDGET_PROGRAM_ADDRESS) {
      return false;
    }
    return true;
  });
  return filteredIxs;
}
