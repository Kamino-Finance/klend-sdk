/**
 * Listen to real-time reserve changes via WebSocket.
 *
 * Returns raw {@link Reserve} (not KaminoReserve) — KaminoReserve needs
 * oracle prices and an RPC connection that aren't available from the WS
 * notification alone. The consumer hydrates using its market context.
 */
import { type Address, type Base58EncodedBytes, type Commitment, type Slot, getBase58Decoder } from '@solana/kit';

import { Reserve } from '../@codegen/klend/accounts';
import { PROGRAM_ID } from '../@codegen/klend/programId';

import { type AccountSubscriptionManager, type ProgramFilter } from './accountSubscriptionManager';
import { ANCHOR_DISCRIMINATOR_BYTES } from './anchorConstants';
import { createManagerSubscription } from './createManagerSubscription';
import type { SubscriptionHandle } from './subscriptionHandle';
import { toBuffer } from './utils';
import type { UpdateScheduler } from './wsUpdateScheduler';

const RESERVE_ACCOUNT_SIZE = BigInt(Reserve.layout.span + ANCHOR_DISCRIMINATOR_BYTES);
const RESERVE_DISCRIMINATOR_BASE58 = getBase58Decoder().decode(Reserve.discriminator) as Base58EncodedBytes;

export interface ReserveChangeEvent {
  reserve: Reserve;
  address: Address;
  slot: Slot;
}

export type ReserveChangeCallback = (event: ReserveChangeEvent) => void;

export interface ReserveListenerParams {
  manager: AccountSubscriptionManager;
  marketAddress: Address;
  onChange: ReserveChangeCallback;
  onError?: (error: unknown) => void;
  programId?: Address;
  /** Defaults to 'confirmed' — reserves update every slot, throttling
   *  prevents excessive re-renders. */
  commitment?: Commitment;
  throttleMs?: number;
  /** Requires `throttleMs`. */
  scheduler?: UpdateScheduler;
}

export function buildReserveFilters(marketAddress: Address): ProgramFilter[] {
  return [
    { dataSize: RESERVE_ACCOUNT_SIZE },
    { memcmp: { offset: 32n, bytes: marketAddress.toString() as Base58EncodedBytes, encoding: 'base58' } },
    // Match Reserve's 8-byte Anchor discriminator so uninitialized klend-owned
    // accounts with the same 8624-byte layout (e.g. pre-allocated placeholders
    // awaiting init_reserve) don't trigger spurious decode errors.
    { memcmp: { offset: 0n, bytes: RESERVE_DISCRIMINATOR_BASE58, encoding: 'base58' } },
  ];
}

export function listenToReserveChanges(params: ReserveListenerParams): SubscriptionHandle {
  return createManagerSubscription<ReserveChangeEvent>({
    manager: params.manager,
    programId: params.programId ?? PROGRAM_ID,
    filters: buildReserveFilters(params.marketAddress),
    commitment: params.commitment ?? 'confirmed',
    throttleMs: params.throttleMs,
    scheduler: params.scheduler,
    decode: (address, buffer, slot) => ({
      reserve: Reserve.decode(toBuffer(buffer)),
      address,
      slot,
    }),
    onChange: params.onChange,
    onError: params.onError,
    errorPrefix: '[listenToReserveChanges]',
  });
}
