/**
 * Listen to real-time obligation changes via WebSocket.
 * Decodes + hydrates via {@link KaminoObligation.fromAccountData}.
 */
import { type Address, type Base58EncodedBytes, type Commitment, type Slot } from '@solana/kit';

import { Obligation } from '../@codegen/klend/accounts';
import { PROGRAM_ID } from '../@codegen/klend/programId';

import { type AccountSubscriptionManager, type ProgramFilter } from './accountSubscriptionManager';
import { ANCHOR_DISCRIMINATOR_BYTES } from './anchorConstants';
import { createManagerSubscription } from './createManagerSubscription';
import type { KaminoMarket } from '../classes/market';
import { KaminoObligation } from '../classes/obligation';
import type { SubscriptionHandle } from './subscriptionHandle';
import type { UpdateScheduler } from './wsUpdateScheduler';

const OBLIGATION_ACCOUNT_SIZE = BigInt(Obligation.layout.span + ANCHOR_DISCRIMINATOR_BYTES);

export interface ObligationChangeEvent {
  obligation: KaminoObligation;
  address: Address;
  slot: Slot;
}

export type ObligationChangeCallback = (event: ObligationChangeEvent) => void;

export interface ObligationListenerParams {
  manager: AccountSubscriptionManager;
  /** Map (eager) or getter (lazy) for market lookup during hydration.
   *
   *  **Perf contract:** the getter form is invoked ONCE PER WS NOTIFICATION.
   *  Make it cheap — a constant-time read of an already-built map (e.g.
   *  `() => this.markets`) or a memoized value. Do NOT rebuild market
   *  state inside the getter; high-throughput obligation streams would
   *  pay that cost on every event. */
  markets: Map<Address, KaminoMarket> | (() => Map<Address, KaminoMarket>);
  owner: Address;
  onChange: ObligationChangeCallback;
  onError?: (error: unknown) => void;
  programId?: Address;
  commitment?: Commitment;
  /** Default: no throttle — obligations are low-frequency, user-action-driven. */
  throttleMs?: number;
  /** Requires `throttleMs`. */
  scheduler?: UpdateScheduler;
}

export function buildObligationFilters(owner: Address): ProgramFilter[] {
  return [
    { dataSize: OBLIGATION_ACCOUNT_SIZE },
    { memcmp: { offset: 64n, bytes: owner.toString() as Base58EncodedBytes, encoding: 'base58' } },
  ];
}

export function listenToObligationChanges(params: ObligationListenerParams): SubscriptionHandle {
  const getMarkets =
    typeof params.markets === 'function' ? params.markets : () => params.markets as Map<Address, KaminoMarket>;

  return createManagerSubscription<ObligationChangeEvent>({
    manager: params.manager,
    programId: params.programId ?? PROGRAM_ID,
    filters: buildObligationFilters(params.owner),
    // Obligations are low-frequency — use 'processed' for instant delivery.
    commitment: params.commitment ?? 'processed',
    throttleMs: params.throttleMs,
    scheduler: params.scheduler,
    decode: (address, buffer, slot) => {
      const obligation = KaminoObligation.fromAccountData(getMarkets(), address, buffer, slot);
      // `undefined` is honored by createManagerSubscription — no event fires, no error.
      if (!obligation) return undefined;
      return { obligation, address, slot };
    },
    onChange: params.onChange,
    onError: params.onError,
    errorPrefix: '[listenToObligationChanges]',
  });
}
