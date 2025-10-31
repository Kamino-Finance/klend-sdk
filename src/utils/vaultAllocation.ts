import Decimal from 'decimal.js';
import { Address } from '@solana/kit';
import { lamportsToCollDecimal } from '@kamino-finance/farms-sdk';

export interface ReserveAllocationOverview {
  targetWeight: Decimal;
  tokenAllocationCap: Decimal;
  ctokenAllocation: Decimal;
}

export interface VaultAllocationResult {
  targetUnallocatedAmount: Decimal;
  targetReservesAllocation: Map<Address, Decimal>;
}

const ZERO = new Decimal(0);

/**
 * Computes the allocation of vault funds across reserves based on weights and caps
 * @param vaultAUM - Total AUM of the vault, in tokens
 * @param vaultUnallocatedWeight - Weight for unallocated funds
 * @param vaultUnallocatedCap - Maximum amount that can remain unallocated
 * @param initialVaultAllocations - Map of reserve addresses to their allocation configurations
 * @param vaultTokenDecimals - The number of decimals of the vault token, needed to compute the min amount
 * @returns Object containing target unallocated amount and target allocations per reserve, in tokens
 */
export function computeReservesAllocation(
  vaultAUM: Decimal,
  vaultUnallocatedWeight: Decimal,
  vaultUnallocatedCap: Decimal,
  initialVaultAllocations: Map<Address, ReserveAllocationOverview>,
  vaultTokenDecimals: number
): VaultAllocationResult {
  let totalAllocation = new Decimal(0);
  const allReserves = Array.from(initialVaultAllocations.keys());
  const expectedHoldingsDistribution = new Map<Address, Decimal>();

  // Initialize reserve allocations and calculate total weight
  allReserves.forEach((reserve) => {
    expectedHoldingsDistribution.set(reserve, ZERO);
    totalAllocation = totalAllocation.add(initialVaultAllocations.get(reserve)!.targetWeight);
  });

  let totalLeftToInvest = vaultAUM;
  const totalAllocationsIncludingUnallocated = totalAllocation.add(vaultUnallocatedWeight);

  // Calculate initial unallocated amount
  let unallocatedAllocation = totalLeftToInvest.mul(vaultUnallocatedWeight).div(totalAllocationsIncludingUnallocated);
  if (unallocatedAllocation.gt(vaultUnallocatedCap)) {
    unallocatedAllocation = vaultUnallocatedCap;
  }
  totalLeftToInvest = totalLeftToInvest.sub(unallocatedAllocation);

  let currentAllocationSum = totalAllocation;

  const reservesCount = allReserves.length;
  const maxRemainedUninvestedLamports = lamportsToCollDecimal(new Decimal(reservesCount), vaultTokenDecimals); // invest only if the AUM has more lamports than the number of reserves
  // Iteratively allocate funds to reserves based on weights and caps
  while (totalLeftToInvest.gt(maxRemainedUninvestedLamports) && currentAllocationSum.gt(ZERO)) {
    const totalLeftover = totalLeftToInvest;

    for (const reserve of allReserves) {
      const reserveWithWeight = initialVaultAllocations.get(reserve);
      if (!reserveWithWeight) continue;

      const targetAllocation = reserveWithWeight.targetWeight.mul(totalLeftover).div(currentAllocationSum);
      const reserveCap = reserveWithWeight.tokenAllocationCap;
      let amountToInvest = Decimal.min(targetAllocation, totalLeftToInvest);

      // Handle reserve caps
      if (reserveCap.gt(ZERO)) {
        const currentReserveAllocation = expectedHoldingsDistribution.get(reserve)!;
        const remainingCapacity = reserveCap.sub(currentReserveAllocation);
        amountToInvest = Decimal.min(amountToInvest, remainingCapacity);
      } else if (reserveCap.eq(ZERO)) {
        // Zero cap means no investment allowed
        amountToInvest = ZERO;
      }

      totalLeftToInvest = totalLeftToInvest.sub(amountToInvest);

      // Check if reserve is now capped and should be removed from future allocations
      const newReserveAllocation = expectedHoldingsDistribution.get(reserve)!.add(amountToInvest);
      if (reserveCap.eq(ZERO) || (reserveCap.gt(ZERO) && newReserveAllocation.gte(reserveCap))) {
        currentAllocationSum = currentAllocationSum.sub(reserveWithWeight.targetWeight);
      }

      // Update reserve allocation
      expectedHoldingsDistribution.set(reserve, newReserveAllocation);
    }
  }

  return {
    targetUnallocatedAmount: unallocatedAllocation.add(totalLeftToInvest),
    targetReservesAllocation: expectedHoldingsDistribution,
  };
}
