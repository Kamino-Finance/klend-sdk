import { KaminoMarket, KaminoObligation } from '../classes';
import Decimal from 'decimal.js';

/**
 * A basic context needed to interpret orders.
 */
export type OrderContext = {
  kaminoMarket: KaminoMarket;
  kaminoObligation: KaminoObligation;
};

/**
 * A type of order for obligations that follow the "one optional stop-loss and one optional take-profit" convention.
 */
export enum OrderType {
  StopLoss = 'StopLoss',
  TakeProfit = 'TakeProfit',
}

/**
 * A discriminator enum for {@link OrderAction};
 */
export enum OrderActionType {
  FullRepay = 'FullRepay',
  PartialRepay = 'PartialRepay',
}

/**
 * One of possible actions to take on a price-based order.
 */
export type OrderAction = FullRepay | PartialRepay;

/**
 * An action repaying entire obligation debt.
 */
export type FullRepay = {
  type: OrderActionType.FullRepay;
};

/**
 * An action repaying the given amount of the debt.
 */
export type PartialRepay = {
  type: OrderActionType.PartialRepay;
  repayDebtAmountLamports: Decimal;
};

/**
 * A high-level specification of an order.
 * The trigger type `T` depends on the order's flavour (e.g. price-based or LTV-based).
 */
export type OrderSpecification<T> = {
  /**
   * The condition that makes the {@link action} available to be executed.
   */
  trigger: T;

  /**
   * The action that may be executed.
   */
  action: OrderAction;

  /**
   * The minimum and maximum bonus for an executor of the action, in bps.
   *
   * The minimum is paid when the order condition is "barely met", and then the bonus grows towards maximum as the
   * condition gets exceeded more and more.
   */
  executionBonusBpsRange: [number, number];
};
