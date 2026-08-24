import { GetBlockTimeApi, Rpc, Slot, UnixTimestamp } from '@solana/kit';

/**
 * A coherent ledger snapshot: block time and slot fetched at the same commitment.
 *
 * Every reserve/obligation estimate is evaluated at such an instant: interest and rewards accrue per second on a
 * `TrueApr` reserve (per slot on a `Legacy` one), so a bare slot is not enough to place "now" on the ledger. Obtain
 * one from `getCurrentLedgerInstant()` (utils/rpc.ts) at the same commitment as the loaded account state.
 */
export type LedgerInstant = {
  slot: Slot;
  blockTime: UnixTimestamp;
};

type GetBlockTimeRpc = Pick<Rpc<GetBlockTimeApi>, 'getBlockTime'>;

function isGetBlockTimeRpc(value: unknown): value is GetBlockTimeRpc {
  const canHaveMethods = (typeof value === 'object' && value !== null) || typeof value === 'function';
  return canHaveMethods && typeof (value as { getBlockTime?: unknown }).getBlockTime === 'function';
}

/**
 * Resolves the {@link LedgerInstant} of an already-selected slot (e.g. the `context.slot` an account was fetched at)
 * by reading its block time from the RPC.
 */
export async function resolveLedgerInstantForSlot(rpc: unknown, slot: Slot, caller: string): Promise<LedgerInstant> {
  if (!isGetBlockTimeRpc(rpc)) {
    throw new Error(`${caller}: the RPC client must support getBlockTime`);
  }
  const blockTime = await rpc.getBlockTime(slot).send();
  if (blockTime === null) {
    throw new Error(`${caller}: block time not found for slot ${slot}`);
  }
  return { slot, blockTime };
}
