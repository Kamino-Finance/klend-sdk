/**
 * Listen to real-time Scope oracle price changes via WebSocket.
 *
 * One reconnect loop per address — NOT N TCP connections, since
 * `@solana/kit`'s RpcSubscriptions multiplexes every `.subscribe()` over a
 * single shared WebSocket.
 */
import {
  type Address,
  type Commitment,
  type RpcSubscriptions,
  type Slot,
  type SolanaRpcSubscriptionsApi,
} from '@solana/kit';
import { Buffer } from 'buffer';
import { OraclePrices } from '@kamino-finance/scope-sdk/dist/@codegen/scope/accounts/OraclePrices';

import { createBufferedDispatcher } from './bufferedDispatcher';
import { makeSubscriptionHandle, type SubscriptionHandle } from './subscriptionHandle';
import type { WsCadenceOptions } from './wsCadenceOptions';
import { makeWsErrorReporter } from './wsErrorReporter';
import type { RpcNotification, WsListenerObservability } from './wsListenerObservability';
import { runReconnectLoop } from './wsReconnectLoop';

export interface OraclePriceChangeEvent {
  address: Address;
  oraclePrices: OraclePrices;
  slot: Slot;
}

export type OraclePriceChangeCallback = (event: OraclePriceChangeEvent) => void;

export interface OracleListenerParams extends WsListenerObservability, WsCadenceOptions {
  wsRpc: RpcSubscriptions<SolanaRpcSubscriptionsApi>;
  oracleAddresses: Address[];
  onChange: OraclePriceChangeCallback;
  /** Defaults to 'confirmed'. */
  commitment?: Commitment;
}

/**
 * `onBeforeReconnect` fires once per address. Scope normally stores all
 * prices in a single OraclePrices account so the array is usually length 1
 * — but if you subscribe to several, dedupe at the consumer.
 */
export function listenToOraclePriceChanges(params: OracleListenerParams): SubscriptionHandle {
  const commitment = params.commitment ?? 'confirmed';

  const dispatcher = createBufferedDispatcher<OraclePriceChangeEvent, Address>({
    scheduler: params.scheduler,
    throttleMs: params.throttleMs,
    keyOf: (event) => event.address,
    onDeliver: params.onChange,
    onError: params.onError,
    errorPrefix: '[listenToOraclePriceChanges]',
    callSiteName: 'listenToOraclePriceChanges',
  });

  // Decode runs inside runReconnectLoop's onMessage — BEFORE the buffered
  // dispatcher — so a decode throw was being attributed to the reconnect
  // loop's default '[ws-reconnect-loop]' prefix instead of this listener.
  // Route decode failures through a listener-specific reporter so error
  // attribution is correct (and the user's onError still sees them).
  const decodeErrorReporter = makeWsErrorReporter('[listenToOraclePriceChanges]', params.onError);

  const stopAddressLoops = params.oracleAddresses.map((oracleAddress) =>
    runReconnectLoop<RpcNotification<{ data: [string, string] }>>({
      wsRpc: params.wsRpc,
      reconnectDelayMs: params.reconnectDelayMs,
      onError: params.onError,
      onLog: params.onLog,
      onBeforeReconnect: params.onBeforeReconnect,
      subscribe: (wsRpc, abortSignal) =>
        wsRpc.accountNotifications(oracleAddress, { commitment, encoding: 'base64' }).subscribe({ abortSignal }),
      onMessage: ({ context, value }) => {
        const [base64Data] = value.data;
        let oraclePrices: OraclePrices;
        try {
          oraclePrices = OraclePrices.decode(Buffer.from(base64Data, 'base64'));
        } catch (e) {
          decodeErrorReporter.reportError(e);
          return;
        }
        dispatcher.push({
          address: oracleAddress,
          oraclePrices,
          slot: context.slot,
        });
      },
    })
  );

  return makeSubscriptionHandle(
    () => {
      dispatcher.unsubscribe();
      stopAddressLoops.forEach((stopLoop) => stopLoop());
    },
    () => dispatcher.flush()
  );
}
