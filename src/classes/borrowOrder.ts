import { Address } from '@solana/kit';
import BN from 'bn.js';
import { Obligation } from '../@codegen/klend/accounts';
import { BorrowOrder, BorrowOrderConfigArgs } from '../@codegen/klend/types';

/** How many borrow orders an obligation holds, as returned by {@link borrowOrdersFromObligationState}. */
export const MAX_BORROW_ORDERS = 3;

/**
 * The borrow-order slots an obligation holds, active or not. Their count is fixed by the account layout - one head
 * order and a two-element tail array.
 */
export type BorrowOrderSlots<T> = readonly [T, T, T];

/**
 * The obligation's borrow orders in the index order the on-chain instructions use: the head order followed by the
 * tail ones.
 */
export function borrowOrdersFromObligationState(obligation: Obligation): BorrowOrderSlots<BorrowOrder> {
  const [firstTailOrder, secondTailOrder] = obligation.tailBorrowOrders;
  return [obligation.headBorrowOrder, firstTailOrder, secondTailOrder];
}

/**
 * Wrapper class for working with borrow orders on obligations.
 * Borrow orders allow users to request fixed-term loans with specific parameters.
 */
export class KaminoBorrowOrder {
  constructor(
    public readonly debtLiquidityMint: Address,
    public readonly remainingDebtAmount: BN,
    public readonly filledDebtDestination: Address,
    public readonly minDebtTermSeconds: BN,
    public readonly fillableUntilTimestamp: BN,
    public readonly maxBorrowRateBps: number,
    public readonly enableAutoRolloverOnFilledBorrows?: boolean,
    public readonly placedAtTimestamp?: BN,
    public readonly lastUpdatedAtTimestamp?: BN,
    public readonly requestedDebtAmount?: BN
  ) {}

  /**
   * Creates a borrow order config args for setting on an obligation
   */
  toConfigArgs(): BorrowOrderConfigArgs {
    return new BorrowOrderConfigArgs({
      remainingDebtAmount: this.remainingDebtAmount,
      maxBorrowRateBps: this.maxBorrowRateBps,
      minDebtTermSeconds: this.minDebtTermSeconds,
      fillableUntilTimestamp: this.fillableUntilTimestamp,
      enableAutoRolloverOnFilledBorrows: this.enableAutoRolloverOnFilledBorrows ?? false,
    });
  }

  /**
   * Creates a KaminoBorrowOrder from existing borrow order state
   */
  static fromExistingBorrowOrderState(borrowOrder: BorrowOrder): KaminoBorrowOrder {
    return new KaminoBorrowOrder(
      borrowOrder.debtLiquidityMint,
      borrowOrder.remainingDebtAmount,
      borrowOrder.filledDebtDestination,
      borrowOrder.minDebtTermSeconds,
      borrowOrder.fillableUntilTimestamp,
      borrowOrder.maxBorrowRateBps,
      borrowOrder.enableAutoRolloverOnFilledBorrows !== 0,
      borrowOrder.placedAtTimestamp,
      borrowOrder.lastUpdatedAtTimestamp,
      borrowOrder.requestedDebtAmount
    );
  }

  /**
   * Creates a fixed-term borrow order with common parameters
   */
  static createFixedTermBorrowOrder(params: {
    debtMint: Address;
    amount: BN;
    destination: Address;
    termSeconds: BN;
    expirySeconds: BN;
    maxRateBps: number;
    enableAutoRolloverOnFilledBorrows?: boolean;
  }): KaminoBorrowOrder {
    const now = Math.floor(Date.now() / 1000);
    const expiryTimestamp = new BN(now).add(params.expirySeconds);

    return new KaminoBorrowOrder(
      params.debtMint,
      params.amount,
      params.destination,
      params.termSeconds,
      expiryTimestamp,
      params.maxRateBps,
      params.enableAutoRolloverOnFilledBorrows
    );
  }

  /**
   * Creates an open-term borrow order
   */
  static createOpenTermBorrowOrder(params: {
    debtMint: Address;
    amount: BN;
    destination: Address;
    expirySeconds: BN;
  }): KaminoBorrowOrder {
    const now = Math.floor(Date.now() / 1000);
    const expiryTimestamp = new BN(now).add(params.expirySeconds);

    return new KaminoBorrowOrder(
      params.debtMint,
      params.amount,
      params.destination,
      new BN(0),
      expiryTimestamp,
      0xffffffff,
      false
    );
  }

  /**
   * Creates a cancel order from an existing borrow order.
   * This removes the existing order
   */
  static createCancelBorrowOrder(existing: KaminoBorrowOrder): KaminoBorrowOrder {
    return new KaminoBorrowOrder(
      existing.debtLiquidityMint,
      new BN(0),
      existing.filledDebtDestination,
      new BN(0),
      new BN(0),
      0
    );
  }

  /**
   * Check if the borrow order is active (has remaining debt to be filled)
   */
  isActive(): boolean {
    return this.remainingDebtAmount.gtn(0);
  }

  /**
   * Check if the borrow order is fixed-term (has a non-zero minimum debt term), as opposed to open-term.
   */
  isFixedTerm(): boolean {
    return this.minDebtTermSeconds.gtn(0);
  }

  /**
   * Check if the borrow order has expired
   */
  isExpired(currentTimestamp: BN): boolean {
    return currentTimestamp.gt(this.fillableUntilTimestamp);
  }
}
