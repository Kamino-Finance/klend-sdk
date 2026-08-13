import { GetBlockTimeApi, Rpc, Slot, UnixTimestamp } from '@solana/kit';

/** A coherent ledger snapshot: block time and slot fetched at the same commitment. */
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
 * Public input shape for APIs that accept either the legacy slot or a pre-fetched coherent ledger instant.
 * Both forms may be supplied together; runtime validation then requires their slots to match.
 */
export type LedgerInstantInput<SlotKey extends string = 'currentSlot'> =
  | ({ [K in SlotKey]: Slot } & { currentLedgerInstant?: LedgerInstant })
  | ({ [K in SlotKey]?: Slot } & { currentLedgerInstant: LedgerInstant });

/**
 * Adds an instant-only call form without changing a released, extensible legacy interface whose slot is required.
 */
export type LedgerInstantCompatible<T extends { currentSlot: Slot; currentLedgerInstant?: LedgerInstant }> =
  | T
  | (Omit<T, 'currentSlot'> & { currentSlot?: Slot; currentLedgerInstant: LedgerInstant });

/** `Omit` distributed across a union, preserving the required-one-of branches in {@link LedgerInstantInput}. */
export type DistributiveOmit<T, Keys extends PropertyKey> = T extends unknown ? Omit<T, Keys> : never;

export type ResolvedLedgerInput = {
  currentSlot: Slot;
  currentLedgerInstant?: LedgerInstant;
};

/**
 * Normalizes a public slot/instant input without adding an RPC dependency to legacy variable-rate flows.
 * Fixed-term callers set `requiresLedgerInstant`; only those paths resolve block time for a legacy slot.
 */
export async function resolveLedgerInput(
  rpc: unknown,
  currentSlot: Slot | undefined,
  currentLedgerInstant: LedgerInstant | undefined,
  requiresLedgerInstant: boolean,
  caller: string
): Promise<ResolvedLedgerInput> {
  if (currentLedgerInstant !== undefined || requiresLedgerInstant) {
    const resolvedInstant = await resolveLedgerInstantForSlot(rpc, currentSlot, currentLedgerInstant, caller);
    return { currentSlot: resolvedInstant.slot, currentLedgerInstant: resolvedInstant };
  }
  if (currentSlot === undefined) {
    throw new Error(`${caller}: either currentSlot or currentLedgerInstant is required`);
  }
  return { currentSlot };
}

/**
 * Resolves the block time for an already-selected slot. This keeps legacy `currentSlot` callers source-compatible
 * while production builders use one coherent {@link LedgerInstant} internally.
 *
 * Callers that already fetched a ledger instant should pass it as `currentLedgerInstant`; when both values are
 * supplied, their slots must match.
 */
export async function resolveLedgerInstantForSlot(
  rpc: unknown,
  currentSlot: Slot | undefined,
  currentLedgerInstant: LedgerInstant | undefined,
  caller: string
): Promise<LedgerInstant> {
  if (currentLedgerInstant !== undefined) {
    if (currentSlot !== undefined && currentLedgerInstant.slot !== currentSlot) {
      throw new Error(
        `${caller}: currentLedgerInstant.slot ${currentLedgerInstant.slot} does not match currentSlot ${currentSlot}`
      );
    }
    return currentLedgerInstant;
  }
  if (currentSlot === undefined) {
    throw new Error(`${caller}: either currentSlot or currentLedgerInstant is required`);
  }

  if (!isGetBlockTimeRpc(rpc)) {
    throw new Error(`${caller}: the RPC client must support getBlockTime when only currentSlot is supplied`);
  }
  const blockTime = await rpc.getBlockTime(currentSlot).send();
  if (blockTime === null) {
    throw new Error(`${caller}: block time not found for currentSlot ${currentSlot}`);
  }
  return { slot: currentSlot, blockTime };
}

/**
 * Returns a supplied ledger instant after checking it matches the legacy slot. Fixed-term synchronous calculation
 * paths cannot fetch block time themselves, so they fail closed when only a slot is supplied.
 */
export function requireMatchingLedgerInstant(
  currentSlot: Slot | undefined,
  currentLedgerInstant: LedgerInstant | undefined,
  caller: string
): LedgerInstant {
  if (currentLedgerInstant === undefined) {
    throw new Error(
      `${caller}: currentLedgerInstant is required for fixed-term debt; fetch slot and blockTime from the same RPC snapshot`
    );
  }
  if (currentSlot !== undefined && currentLedgerInstant.slot !== currentSlot) {
    throw new Error(
      `${caller}: currentLedgerInstant.slot ${currentLedgerInstant.slot} does not match currentSlot ${currentSlot}`
    );
  }
  return currentLedgerInstant;
}

/** Normalizes the old positional `Slot` argument and the new `LedgerInstant` form used by synchronous calculations. */
export function normalizeLedgerInstantArgument(
  currentSlotOrLedgerInstant: Slot | LedgerInstant,
  currentLedgerInstant: LedgerInstant | undefined,
  caller: string
): { currentSlot: Slot; currentLedgerInstant?: LedgerInstant } {
  const positionalInstant = typeof currentSlotOrLedgerInstant === 'bigint' ? undefined : currentSlotOrLedgerInstant;
  const currentSlot =
    typeof currentSlotOrLedgerInstant === 'bigint' ? currentSlotOrLedgerInstant : currentSlotOrLedgerInstant.slot;
  const resolvedInstant = currentLedgerInstant ?? positionalInstant;
  if (resolvedInstant !== undefined && resolvedInstant.slot !== currentSlot) {
    throw new Error(
      `${caller}: currentLedgerInstant.slot ${resolvedInstant.slot} does not match currentSlot ${currentSlot}`
    );
  }
  return { currentSlot, currentLedgerInstant: resolvedInstant };
}
