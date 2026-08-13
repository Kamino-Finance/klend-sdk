import Decimal from 'decimal.js';
import { Address } from '@solana/kit';
import { lamportsToCollDecimal } from '@kamino-finance/farms-sdk';
import type { ReserveAllocationOverview } from '../classes/vault_types';

export type ReserveAllocationForCompute = {
  /** Target allocation weight; unitless relative weight. */
  targetWeight: Decimal;
  /** Token allocation cap after converting raw vault-token lamports to token units. */
  tokenAllocationCapTokens: Decimal;
  /** Current cToken allocation, kept as raw ctoken lamports from vault state. */
  ctokenAllocationLamports: Decimal;
  /** Optional finite ctoken cap converted into underlying liquidity token units. */
  ctokenAllocationCapLiquidityTokens?: Decimal;
};

export interface VaultAllocationResult {
  /** Target unallocated amount in token units, not lamports. */
  targetUnallocatedAmount: Decimal;
  /** Target amount per reserve in token units, not lamports. */
  targetReservesAllocation: Map<Address, Decimal>;
}

const ZERO = new Decimal(0);
const U64_MAX_DECIMAL = new Decimal('18446744073709551615');

export function isCtokenAllocationCapUncapped(ctokenAllocationCap: Decimal.Value | undefined): boolean {
  if (ctokenAllocationCap === undefined) {
    return true;
  }

  const cap = new Decimal(ctokenAllocationCap);
  return cap.eq(ZERO) || cap.eq(U64_MAX_DECIMAL);
}

/** Converts a finite ctoken allocation cap from ctoken lamports into underlying liquidity lamports. */
export function ctokenAllocationCapLamportsToLiquidityLamports(
  ctokenAllocationCapLamports: Decimal.Value | undefined,
  collateralExchangeRate: Decimal.Value
): Decimal | undefined {
  if (isCtokenAllocationCapUncapped(ctokenAllocationCapLamports)) {
    return undefined;
  }

  const exchangeRate = new Decimal(collateralExchangeRate);
  if (exchangeRate.lte(ZERO)) {
    throw new Error(`Invalid collateral exchange rate ${exchangeRate.toString()}`);
  }

  return Decimal.min(new Decimal(ctokenAllocationCapLamports!).div(exchangeRate), U64_MAX_DECIMAL);
}

/**
 * Returns the min of token cap and converted ctoken cap.
 * Both inputs must already be expressed in the same underlying liquidity unit:
 * either vault-token lamports or token units.
 */
export function getEffectiveLiquidityAllocationCap(
  tokenAllocationCapLiquidity: Decimal.Value,
  ctokenAllocationCapLiquidity?: Decimal.Value
): Decimal {
  if (ctokenAllocationCapLiquidity === undefined) {
    return new Decimal(tokenAllocationCapLiquidity);
  }

  return Decimal.min(new Decimal(tokenAllocationCapLiquidity), new Decimal(ctokenAllocationCapLiquidity));
}

export function toReserveAllocationForCompute(
  allocation: ReserveAllocationOverview,
  vaultTokenDecimals: number,
  collateralExchangeRate?: Decimal.Value
): ReserveAllocationForCompute {
  let ctokenAllocationCapLiquidityTokens: Decimal | undefined;
  if (!isCtokenAllocationCapUncapped(allocation.ctokenAllocationCapLamports)) {
    if (collateralExchangeRate === undefined) {
      throw new Error('Collateral exchange rate is required for finite ctoken allocation cap');
    }

    const capInLiquidityLamports = ctokenAllocationCapLamportsToLiquidityLamports(
      allocation.ctokenAllocationCapLamports,
      collateralExchangeRate
    );
    ctokenAllocationCapLiquidityTokens =
      capInLiquidityLamports === undefined
        ? undefined
        : lamportsToCollDecimal(capInLiquidityLamports, vaultTokenDecimals);
  }

  return {
    targetWeight: allocation.targetWeight,
    tokenAllocationCapTokens: lamportsToCollDecimal(allocation.tokenAllocationCapLamports, vaultTokenDecimals),
    ctokenAllocationCapLiquidityTokens,
    ctokenAllocationLamports: allocation.ctokenAllocationLamports,
  };
}

/**
 * Computes the allocation of vault funds across reserves based on weights and caps.
 * @param vaultAUMInvestableInReserves - Total AUM of the vault, in tokens, that can be invested in reserves.
 * @param vaultUnallocatedWeight - Weight for unallocated funds
 * @param vaultUnallocatedCap - Maximum amount that can remain unallocated. `0` means uncapped — on-chain `VaultState::refresh_target_allocations` maps `unallocated_tokens_cap == 0` to `u64::MAX` for backwards compatibility
 * @param initialVaultAllocations - Map of reserve addresses to their allocation configurations
 * @param vaultTokenDecimals - The number of decimals of the vault token, needed to avoid dust transfers.
 * @returns Object containing target unallocated amount and target allocations per reserve, in tokens
 */
export function computeReservesAllocation(
  vaultAUMInvestableInReserves: Decimal,
  vaultUnallocatedWeight: Decimal,
  vaultUnallocatedCap: Decimal,
  initialVaultAllocations: Map<Address, ReserveAllocationForCompute>,
  vaultTokenDecimals: number
): VaultAllocationResult {
  let totalAllocation = new Decimal(0);
  const reserves = Array.from(initialVaultAllocations.keys());
  const expectedHoldingsDistribution = new Map<Address, Decimal>();

  reserves.forEach((reserve) => {
    const allocation = initialVaultAllocations.get(reserve)!;
    expectedHoldingsDistribution.set(reserve, ZERO);
    if (allocation.tokenAllocationCapTokens.gt(ZERO)) {
      totalAllocation = totalAllocation.add(allocation.targetWeight);
    }
  });

  let totalLeftToInvest = vaultAUMInvestableInReserves;
  const totalAllocationsIncludingUnallocated = totalAllocation.add(vaultUnallocatedWeight);
  if (totalAllocationsIncludingUnallocated.lte(ZERO)) {
    return {
      targetUnallocatedAmount: totalLeftToInvest,
      targetReservesAllocation: expectedHoldingsDistribution,
    };
  }

  // Calculate initial unallocated amount
  let unallocatedAllocation = totalLeftToInvest.mul(vaultUnallocatedWeight).div(totalAllocationsIncludingUnallocated);
  // A cap of 0 means uncapped (backwards-compat alias for u64::MAX on-chain), so only clamp when the cap is set.
  if (vaultUnallocatedCap.gt(ZERO) && unallocatedAllocation.gt(vaultUnallocatedCap)) {
    unallocatedAllocation = vaultUnallocatedCap;
  }
  totalLeftToInvest = totalLeftToInvest.sub(unallocatedAllocation);

  let currentAllocationSum = totalAllocation;

  const reservesCount = reserves.length;
  const maxRemainedUninvestedLamports = lamportsToCollDecimal(new Decimal(reservesCount), vaultTokenDecimals); // invest only if the AUM has more lamports than the number of reserves

  // Allocate in proportional rounds. Reserves that hit a cap are removed from
  // the next round and their unused share is redistributed across the rest.
  while (totalLeftToInvest.gt(maxRemainedUninvestedLamports) && currentAllocationSum.gt(ZERO)) {
    const activeReserves = reserves.filter((reserve) => {
      const allocation = initialVaultAllocations.get(reserve);
      if (!allocation) {
        return false;
      }

      const effectiveLiquidityAllocationCapTokens = getEffectiveLiquidityAllocationCap(
        allocation.tokenAllocationCapTokens,
        allocation.ctokenAllocationCapLiquidityTokens
      );
      if (allocation.targetWeight.lte(ZERO) || effectiveLiquidityAllocationCapTokens.lte(ZERO)) {
        return false;
      }

      return expectedHoldingsDistribution.get(reserve)!.lt(effectiveLiquidityAllocationCapTokens);
    });

    currentAllocationSum = activeReserves.reduce(
      (sum, reserve) => sum.add(initialVaultAllocations.get(reserve)!.targetWeight),
      ZERO
    );

    if (currentAllocationSum.lte(ZERO)) {
      break;
    }

    const totalLeftover = totalLeftToInvest;
    let allocatedThisRound = ZERO;

    for (const reserve of activeReserves) {
      const reserveWithWeight = initialVaultAllocations.get(reserve)!;
      const targetAllocation = reserveWithWeight.targetWeight.mul(totalLeftover).div(currentAllocationSum);
      const currentReserveAllocation = expectedHoldingsDistribution.get(reserve)!;
      const remainingCapacityTokens = getEffectiveLiquidityAllocationCap(
        reserveWithWeight.tokenAllocationCapTokens,
        reserveWithWeight.ctokenAllocationCapLiquidityTokens
      ).sub(currentReserveAllocation);
      const amountToInvest = Decimal.min(targetAllocation, remainingCapacityTokens);

      allocatedThisRound = allocatedThisRound.add(amountToInvest);
      expectedHoldingsDistribution.set(reserve, currentReserveAllocation.add(amountToInvest));
    }

    if (allocatedThisRound.lte(ZERO)) {
      break;
    }

    totalLeftToInvest = totalLeftToInvest.sub(allocatedThisRound);
  }

  return {
    targetUnallocatedAmount: unallocatedAllocation.add(totalLeftToInvest),
    targetReservesAllocation: expectedHoldingsDistribution,
  };
}
