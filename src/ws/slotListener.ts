/**
 * Listen to real-time slot changes via WebSocket.
 *
 * Cadence: `throttleMs` runs an own trailing-edge timer; `throttleMs +
 * scheduler` joins the scheduler's group at that cadence; `scheduler` alone
 * throws; neither delivers immediately.
 */
import { type RpcSubscriptions, type Slot, type SolanaRpcSubscriptionsApi } from '@solana/kit';

import { createStandaloneSubscription } from './createStandaloneSubscription';
import type { SubscriptionHandle } from './subscriptionHandle';
import type { WsCadenceOptions } from './wsCadenceOptions';
import type { WsListenerObservability } from './wsListenerObservability';

export interface SlotChangeEvent {
  slot: Slot;
}

export type SlotChangeCallback = (event: SlotChangeEvent) => void;

export interface SlotListenerParams extends WsListenerObservability, WsCadenceOptions {
  wsRpc: RpcSubscriptions<SolanaRpcSubscriptionsApi>;
  onChange: SlotChangeCallback;
}

export function listenToSlotChanges(params: SlotListenerParams): SubscriptionHandle {
  return createStandaloneSubscription<SlotChangeEvent, { slot: Slot }>({
    ...params,
    subscribe: (wsRpc, abortSignal) => wsRpc.slotNotifications().subscribe({ abortSignal }),
    toEvent: ({ slot }) => ({ slot }),
    errorPrefix: '[listenToSlotChanges]',
    callSiteName: 'listenToSlotChanges',
  });
}
