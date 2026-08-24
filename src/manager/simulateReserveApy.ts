import Decimal from 'decimal.js';
import { KaminoReserve } from '../classes/reserve';
import { calculateAPYFromAPR } from '../classes/utils';
import type { LedgerInstant } from '../utils/ledger';

export type ReserveApySimulation = {
  simulatedApr: number;
  simulatedApy: number;
  computedApr: number;
  computedApy: number;
};

/**
 * The computation behind the manager CLI's `simulate-reserve-apy` command, extracted so that it can be tested: the
 * supply APR/APY as simulated for a no-op deposit and as computed from the reserve's current state.
 *
 * All four values depend on the `recentSlotDurationMs` the given reserve was constructed with (for a `Legacy`
 * reserve, the realized rates scale with the live slot rate) - callers should build the reserve with a *live*
 * duration, not a constant.
 */
export function simulateReserveApy(
  kaminoReserve: KaminoReserve,
  currentLedgerInstant: LedgerInstant
): ReserveApySimulation {
  const amount = new Decimal(0);
  const simulatedApr = kaminoReserve.calcSimulatedSupplyAPR(amount, 'deposit', currentLedgerInstant, 0);
  const simulatedApy = calculateAPYFromAPR(simulatedApr);
  const computedApr = kaminoReserve.calculateSupplyAPR(currentLedgerInstant, 0);
  const computedApy = kaminoReserve.totalSupplyAPY(currentLedgerInstant);
  return { simulatedApr, simulatedApy, computedApr, computedApy };
}
