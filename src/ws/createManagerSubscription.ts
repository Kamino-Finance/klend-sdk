/**
 * Composes {@link makeWsErrorReporter} + decode-then-fire +
 * {@link AccountSubscriptionManager.subscribeProgramAccounts} for token /
 * reserve / obligation listeners.
 */

import type { Address, Commitment, Slot } from '@solana/kit';

import {
  type AccountSubscriptionManager,
  type ProgramFilter,
  type SubscribeProgramAccountsOptions,
} from './accountSubscriptionManager';
import type { SubscriptionHandle } from './subscriptionHandle';
import type { WsCadenceOptions } from './wsCadenceOptions';
import { makeWsErrorReporter } from './wsErrorReporter';

export interface ManagerSubscriptionOptions<TEvent> extends WsCadenceOptions {
  manager: AccountSubscriptionManager;
  programId: Address;
  filters: readonly ProgramFilter[];
  commitment?: Commitment;
  onReconnect?: () => void | Promise<void>;
  /**
   * Return `undefined` to skip a notification (e.g. fail-soft on unknown discriminator), or an array when one
   * notification carries several changes — {@link onChange} then fires once per element, in order.
   */
  decode: (address: Address, buffer: Uint8Array, slot: Slot) => TEvent | TEvent[] | undefined;
  onChange: (event: TEvent) => void;
  onError?: (error: unknown) => void;
  /** Prefix for the default `console.error` fallback (e.g. `'[listenToReserveChanges]'`). */
  errorPrefix: string;
}

export function createManagerSubscription<TEvent>(opts: ManagerSubscriptionOptions<TEvent>): SubscriptionHandle {
  const errorReporter = makeWsErrorReporter(opts.errorPrefix, opts.onError);

  const subscribeOptions: SubscribeProgramAccountsOptions = {
    commitment: opts.commitment,
    onReconnect: opts.onReconnect,
    throttleMs: opts.throttleMs,
    scheduler: opts.scheduler,
  };

  return opts.manager.subscribeProgramAccounts(
    opts.programId,
    opts.filters,
    (address, buffer, slot) => {
      try {
        const decoded = opts.decode(address, buffer, slot);
        if (decoded === undefined) return;
        for (const event of Array.isArray(decoded) ? decoded : [decoded]) {
          opts.onChange(event);
        }
      } catch (e) {
        errorReporter.reportError(e);
      }
    },
    subscribeOptions
  );
}
