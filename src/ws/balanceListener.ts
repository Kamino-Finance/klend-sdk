/**
 * Listen to real-time token and native SOL balance changes via WebSocket.
 *
 * Token balances go through {@link AccountSubscriptionManager}
 * (programNotifications); native SOL goes through {@link runReconnectLoop}
 * directly since the manager only supports programNotifications.
 */
import {
  type Address,
  type Base58EncodedBytes,
  type Commitment,
  type RpcSubscriptions,
  type Slot,
  type SolanaRpcSubscriptionsApi,
} from '@solana/kit';

import { type AccountSubscriptionManager, type ProgramFilter } from './accountSubscriptionManager';
import { createManagerSubscription } from './createManagerSubscription';
import { createStandaloneSubscription } from './createStandaloneSubscription';
import type { SubscriptionHandle } from './subscriptionHandle';
import type { WsCadenceOptions } from './wsCadenceOptions';
import type { RpcNotification, WsListenerObservability } from './wsListenerObservability';

export interface TokenBalanceEvent {
  ataAddress: Address;
  /** Raw lamports, not decimal-adjusted. */
  amount: bigint;
  /** Raw 32-byte mint pubkey from the token account data. */
  mintBytes: Uint8Array;
  slot: Slot;
}

export interface NativeSolBalanceEvent {
  lamports: bigint;
  slot: Slot;
}

export type TokenBalanceCallback = (event: TokenBalanceEvent) => void;
export type NativeSolBalanceCallback = (event: NativeSolBalanceEvent) => void;

export interface BalanceListenerParams extends WsCadenceOptions {
  manager: AccountSubscriptionManager;
  owner: Address;
  /** MUST be the SPL Token program ID or the Token-2022 program ID. The
   *  decode path assumes that account-data layout (amount at offset 64,
   *  32-byte mint at offset 0). Passing any other program ID — even one
   *  whose accounts happen to satisfy the owner memcmp filter — will
   *  decode unrelated bytes as a token amount and surface garbage. */
  tokenProgramId: Address;
  onBalanceChange: TokenBalanceCallback;
  onError?: (error: unknown) => void;
  /** Refresh balances via HTTP after WS downtime — without it, balances
   *  stay frozen at the last WS value until the next change. */
  onReconnect?: () => void | Promise<void>;
}

export interface NativeSolListenerParams extends WsListenerObservability, WsCadenceOptions {
  wsRpc: RpcSubscriptions<SolanaRpcSubscriptionsApi>;
  owner: Address;
  onBalanceChange: NativeSolBalanceCallback;
  /** Defaults to 'confirmed'. */
  commitment?: Commitment;
}

/** u64 amount at SPL Token offset 64. */
export function decodeTokenAccountAmount(data: Uint8Array): bigint {
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  return view.getBigUint64(64, true);
}

/** 32-byte mint at SPL Token offset 0. */
export function extractTokenAccountMintBytes(data: Uint8Array): Uint8Array {
  return data.slice(0, 32);
}

/**
 * Owner memcmp only (no dataSize) so this matches both standard SPL Token
 * accounts (165 bytes) and Token-2022 accounts with extensions. Owner is at
 * offset 32 in both layouts.
 */
export function buildTokenBalanceFilters(owner: Address): ProgramFilter[] {
  return [{ memcmp: { offset: 32n, bytes: owner.toString() as Base58EncodedBytes, encoding: 'base58' } }];
}

/**
 * TODO: Monitor whether programSubscribe on the Token Program causes
 * connection instability under high server-side write volume — if so,
 * fall back to per-ATA accountSubscribe.
 */
export function listenToTokenBalanceChanges(params: BalanceListenerParams): SubscriptionHandle {
  return createManagerSubscription<TokenBalanceEvent>({
    manager: params.manager,
    programId: params.tokenProgramId,
    filters: buildTokenBalanceFilters(params.owner),
    commitment: 'confirmed',
    onReconnect: params.onReconnect,
    throttleMs: params.throttleMs,
    scheduler: params.scheduler,
    decode: (ataAddress, buffer, slot) => ({
      ataAddress,
      amount: decodeTokenAccountAmount(buffer),
      mintBytes: extractTokenAccountMintBytes(buffer),
      slot,
    }),
    onChange: params.onBalanceChange,
    onError: params.onError,
    errorPrefix: '[listenToTokenBalanceChanges]',
  });
}

export function listenToNativeSolBalance(params: NativeSolListenerParams): SubscriptionHandle {
  const commitment = params.commitment ?? 'confirmed';

  return createStandaloneSubscription<NativeSolBalanceEvent, RpcNotification<{ lamports: bigint }>>({
    ...params,
    onChange: params.onBalanceChange,
    subscribe: (wsRpc, abortSignal) =>
      wsRpc.accountNotifications(params.owner, { commitment, encoding: 'base64' }).subscribe({ abortSignal }),
    toEvent: ({ context, value }) => ({ lamports: value.lamports, slot: context.slot }),
    errorPrefix: '[listenToNativeSolBalance]',
    callSiteName: 'listenToNativeSolBalance',
  });
}
