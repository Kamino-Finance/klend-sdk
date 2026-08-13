import { type Address, type Commitment, type GetProgramAccountsApi, type Rpc, type Slot } from '@solana/kit';
import BN from 'bn.js';

import { Obligation } from '../@codegen/klend/accounts';
import { type BorrowOrder, type ObligationLiquidity } from '../@codegen/klend/types';
import { PROGRAM_ID } from '../@codegen/klend/programId';
import { isNotNullPubkey } from '../utils';

import { borrowOrdersFromObligationState, MAX_BORROW_ORDERS } from '../classes/borrowOrder';
import { Fraction } from '../classes/fraction';
import type { KaminoMarket } from '../classes/market';
import type { KaminoReserve } from '../classes/reserve';
import { type AccountSubscriptionManager } from './accountSubscriptionManager';
import { toBuffer } from './utils';
import { createManagerSubscription } from './createManagerSubscription';
import { buildObligationFilters } from './obligationListener';
import type { SubscriptionHandle } from './subscriptionHandle';

export type BorrowOrderFillType = 'partial' | 'full';

export interface BorrowOrderFillEvent {
  obligation: Obligation;
  /** Which of the obligation's borrow-order slots was filled. */
  orderIdx: number;
  fillType: BorrowOrderFillType;
  debtLiquidityMint: Address;
  filledAmount: BN;
  remainingDebtAmount: BN;
  requestedDebtAmount: BN;
  slot: Slot;
}

export type BorrowOrderFillCallback = (event: BorrowOrderFillEvent) => void;
export type BorrowOrderFillErrorCallback = (error: unknown) => void;

export interface BorrowOrderFillListenerParams {
  /** Shared subscription manager — WS lifecycle is delegated here */
  manager: AccountSubscriptionManager;
  /** HTTP RPC for seeding initial obligation states */
  rpc: Rpc<GetProgramAccountsApi>;
  markets: KaminoMarket[];
  owner: Address;
  onFill: BorrowOrderFillCallback;
  onError?: BorrowOrderFillErrorCallback;
  programId?: Address;
  initialStates?: Map<Address, Obligation>;
  commitment?: Commitment;
}

// --- Fill detection helpers ---

const lamportsToSf = (lamports: BN): BN => lamports.shln(Fraction.FRACTIONS);

/**
 * How much each borrow position grew between the two states, keyed by reserve. Only growth is recorded: a
 * repayment elsewhere must not offset — and so mask — a fill.
 */
function borrowGrowthByReserveSf(
  prevBorrows: ObligationLiquidity[],
  currBorrows: ObligationLiquidity[]
): Map<Address, BN> {
  const growth = new Map<Address, BN>();
  for (const curr of currBorrows) {
    if (!isNotNullPubkey(curr.borrowReserve)) continue;
    const prev = prevBorrows.find((p) => p.borrowReserve === curr.borrowReserve);
    const prevAmountSf = prev && isNotNullPubkey(prev.borrowReserve) ? prev.borrowedAmountSf : new BN(0);
    const deltaSf = curr.borrowedAmountSf.sub(prevAmountSf);
    if (deltaSf.gtn(0)) {
      growth.set(curr.borrowReserve, deltaSf);
    }
  }
  return growth;
}

function buildMarketMap(markets: KaminoMarket[]): Map<Address, KaminoMarket> {
  return new Map(markets.map((market) => [market.getAddress(), market]));
}

async function fetchInitialObligationStates(
  rpc: Rpc<GetProgramAccountsApi>,
  programId: Address,
  owner: Address,
  commitment: Commitment = 'confirmed'
): Promise<Map<Address, Obligation>> {
  const results = await rpc
    .getProgramAccounts(programId, {
      commitment,
      filters: buildObligationFilters(owner),
      encoding: 'base64',
    })
    .send();

  const states = new Map<Address, Obligation>();
  for (const result of results) {
    if (result.account.owner !== programId) continue;
    const obligation = Obligation.decode(Buffer.from(result.account.data[0], 'base64'));
    if (obligation) states.set(result.pubkey, obligation);
  }
  return states;
}

// --- Fill detection logic ---

/**
 * Whether `reserve` could have filled `order`, judged only on the gates which do not depend on when the question is
 * asked: its peak borrow rate is within the order's limit, and its configured debt term covers the order's minimum.
 *
 * A reserve whose term is bounded by a maturity date instead is kept as a possible filler, since how much term it
 * had left is only answerable against a clock — and this runs after the fill, so a maturity passing in the meantime
 * would otherwise discard the true filler and lose the event.
 *
 * Assumes the caller has already narrowed to reserves lending the order's debt mint.
 *
 * @internal exported for tests
 */
export function couldFillBorrowOrder(reserve: KaminoReserve, order: BorrowOrder): boolean {
  if (reserve.getMaxBorrowRateBps() > order.maxBorrowRateBps) {
    return false;
  }
  const { debtTermSeconds, debtMaturityTimestamp } = reserve.state.config;
  if (order.minDebtTermSeconds.eqn(0)) {
    // An open-term order is fillable only from an open-term reserve.
    return debtTermSeconds.eqn(0) && debtMaturityTimestamp.eqn(0);
  }
  // A fixed-term order accepts an open-term reserve, or one whose configured term is long enough.
  return debtTermSeconds.eqn(0) || order.minDebtTermSeconds.lte(debtTermSeconds);
}

/**
 * The largest set of candidates attributable to the observed borrow growth, where each attributed candidate
 * consumes its filled amount from one reserve it could have been filled from.
 *
 * Every assignment is enumerated, which is affordable because an obligation holds at most
 * {@link MAX_BORROW_ORDERS} orders. Where several assignments attribute the same number of candidates, the first
 * one found wins, which favours the earliest orders — which of them actually happened is not knowable from
 * account state alone.
 *
 * @internal exported for tests; the assignment is easier to pin here than through a live subscription.
 */
export function matchOrdersToGrowth<T extends { filledAmount: BN; fillerReserves: Address[] }>(
  candidates: T[],
  growthByReserveSf: Map<Address, BN>
): T[] {
  // One row per candidate, listing that candidate's options: any reserve its order could have been filled from, or
  // `null` for "this order was not filled".
  const choices: (Address | null)[][] = candidates.map((candidate) => [...candidate.fillerReserves, null]);
  while (choices.length < MAX_BORROW_ORDERS) {
    choices.push([null]);
  }

  let best: T[] = [];
  for (const reserveForCandidate0 of choices[0]) {
    for (const reserveForCandidate1 of choices[1]) {
      for (const reserveForCandidate2 of choices[2]) {
        const attributed: T[] = [];
        const consumedByReserve = new Map<Address, BN>();
        [reserveForCandidate0, reserveForCandidate1, reserveForCandidate2].forEach((reserve, candidateIdx) => {
          if (reserve === null || candidateIdx >= candidates.length) return;
          const consumed = consumedByReserve.get(reserve) ?? new BN(0);
          consumedByReserve.set(reserve, consumed.add(lamportsToSf(candidates[candidateIdx].filledAmount)));
          attributed.push(candidates[candidateIdx]);
        });
        if (attributed.length <= best.length) continue;
        const fitsInGrowth = [...consumedByReserve].every(([reserve, consumed]) =>
          growthByReserveSf.get(reserve)!.gte(consumed)
        );
        if (fitsInGrowth) {
          best = attributed;
        }
      }
    }
  }
  return best;
}

/**
 * Detects the borrow-order fills between two states of an obligation.
 *
 * An order's remaining amount shrinking is not on its own a fill: expiry zeroes the whole order, and its owner may
 * cancel or shrink it too. Only a fill also grows the obligation's debt, so every shrunken order has to be matched
 * against that growth to be reported. With several orders open at once the growth has to be *shared out* rather
 * than merely looked up, or one lender's borrow would vouch for every order that happened to shrink.
 *
 * Each shrunken order is therefore matched to a reserve which grew by at least the shrinkage and which lends its
 * debt mint and {@link couldFillBorrowOrder}, by {@link matchOrdersToGrowth}. Orders left unmatched are reported
 * as nothing.
 */
function detectFills(
  current: Obligation,
  previous: Obligation,
  market: KaminoMarket
): Omit<BorrowOrderFillEvent, 'slot'>[] {
  const currentOrders = borrowOrdersFromObligationState(current);
  const shrunkenOrders = borrowOrdersFromObligationState(previous).flatMap((previousOrder, orderIdx) => {
    const previousRemaining = previousOrder.remainingDebtAmount;
    const currentOrder = currentOrders[orderIdx];
    if (previousRemaining.isZero() || !currentOrder.remainingDebtAmount.lt(previousRemaining)) return [];
    const filledAmount = previousRemaining.sub(currentOrder.remainingDebtAmount);
    return [{ orderIdx, previousOrder, currentOrder, filledAmount }];
  });
  if (shrunkenOrders.length === 0) return [];

  const growthByReserveSf = borrowGrowthByReserveSf(previous.borrows, current.borrows);
  const candidates = shrunkenOrders.map((order) => ({
    ...order,
    fillerReserves: market
      .getReservesByMint(order.previousOrder.debtLiquidityMint)
      .filter((reserve) => couldFillBorrowOrder(reserve, order.previousOrder))
      .map((reserve) => reserve.address)
      .filter((address) => growthByReserveSf.has(address)),
  }));

  return matchOrdersToGrowth(candidates, growthByReserveSf).map((candidate) => {
    const remainingDebtAmount = candidate.currentOrder.remainingDebtAmount;
    return {
      obligation: current,
      orderIdx: candidate.orderIdx,
      fillType: remainingDebtAmount.isZero() && candidate.currentOrder.active === 0 ? 'full' : 'partial',
      // a fully filled order is zeroed, so its details survive only in the previous state
      debtLiquidityMint: candidate.previousOrder.debtLiquidityMint,
      filledAmount: candidate.filledAmount,
      remainingDebtAmount,
      requestedDebtAmount: candidate.previousOrder.requestedDebtAmount,
    };
  });
}

/**
 * Listen for borrow order fills via the shared AccountSubscriptionManager.
 *
 * Seeds initial obligation states via HTTP, then subscribes to the manager
 * for real-time notifications. State diffing detects partial and full fills.
 *
 * On WS reconnect, re-fetches obligation states via HTTP to avoid stale diffs
 * (e.g. multiple fills during downtime being misclassified as one).
 */
export async function listenToBorrowOrderFills(params: BorrowOrderFillListenerParams): Promise<SubscriptionHandle> {
  const programId = params.programId ?? PROGRAM_ID;
  const commitment = params.commitment ?? 'confirmed';
  const marketsByAddress = buildMarketMap(params.markets);
  let previousStates =
    params.initialStates ?? (await fetchInitialObligationStates(params.rpc, programId, params.owner, commitment));

  const unknownMarketsReported = new Set<Address>();
  const reportUnknownMarketOnce = (market: Address) => {
    if (unknownMarketsReported.has(market)) return;
    unknownMarketsReported.add(market);
    const error = new Error(
      `[listenToBorrowOrderFills] no borrow order fill can be detected for obligations of ${params.owner} in ` +
        `market ${market}, which was not among the markets passed to the listener`
    );
    if (params.onError) {
      params.onError(error);
    } else {
      console.error(error);
    }
  };

  return createManagerSubscription<BorrowOrderFillEvent>({
    manager: params.manager,
    programId,
    filters: buildObligationFilters(params.owner),
    commitment,
    onReconnect: async () => {
      previousStates = await fetchInitialObligationStates(params.rpc, programId, params.owner, commitment);
    },
    decode: (address, buffer, slot) => {
      // Raw Obligation.decode (not KaminoObligation.fromAccountData) — fill
      // detection only needs borrow positions, not full hydration.
      const current = Obligation.decode(toBuffer(buffer));
      const market = marketsByAddress.get(current.lendingMarket);
      if (!market) {
        // Obligations are selected by owner, so markets the caller did not pass turn up here too. Their fills are
        // undetectable - said once, rather than looking like "no fill happened" on every notification.
        reportUnknownMarketOnce(current.lendingMarket);
        return undefined;
      }
      const previous = previousStates.get(address);
      if (!previous) {
        previousStates.set(address, current);
        return undefined;
      }
      // Stored after the diff, so a throw out of detectFills leaves the window intact for the next notification.
      const fills = detectFills(current, previous, market);
      previousStates.set(address, current);
      return fills.map((fill) => ({ ...fill, slot }));
    },
    onChange: params.onFill,
    onError: params.onError,
    errorPrefix: '[listenToBorrowOrderFills]',
  });
}
