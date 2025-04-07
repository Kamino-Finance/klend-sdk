import Decimal from 'decimal.js';
import { ObligationOrderAtIndex, OrderCondition, UserLtvAbove, UserLtvBelow } from '../classes/obligationOrder';
import { checkThat } from '../utils/validations';
import { OrderContext, OrderSpecification, OrderType } from './common';
import { createConditionBasedOrder, readTriggerBasedOrder, toOrderIndex } from './internal';

/**
 * Creates an LTV-based {@link ObligationOrderAtIndex} based on the given stop-loss or take-profit specification.
 *
 * The returned object can then be passed directly to {@link KaminoAction.buildSetObligationOrderIxn()} to build an
 * instruction which replaces (or cancels, if the specification is `null`) the given obligation's stop-loss or
 * take-profit order on-chain.
 *
 * The given obligation cannot use 0-LTV collaterals (see {@link checkObligationCompatible()} for rationale).
 */
export function createLtvBasedOrder(
  context: OrderContext,
  orderType: OrderType,
  specification: LtvBasedOrderSpecification | null
): ObligationOrderAtIndex {
  checkObligationCompatible(context);
  const index = toOrderIndex(orderType);
  if (specification === null) {
    return ObligationOrderAtIndex.empty(index);
  }
  const condition = toOrderCondition(orderType, specification.trigger);
  checkThat(
    condition.threshold().gte(MIN_LTV_THRESHOLD) && condition.threshold().lte(MAX_LTV_THRESHOLD),
    `LTV-based trigger outside valid range [${MIN_LTV_THRESHOLD}%; ${MAX_LTV_THRESHOLD}%]: ${condition.threshold()}%`
  );
  return createConditionBasedOrder(context, condition, specification).atIndex(index);
}

/**
 * Parses an {@link OrderSpecification} from the selected stop-loss or take-profit order of the given obligation.
 *
 * The given obligation cannot use 0-LTV collaterals (see {@link checkObligationCompatible()} for rationale).
 *
 * The selected order is expected to be of matching type (i.e. as if it was created using the
 * {@link createLtvBasedOrder()}).
 */
export function readLtvBasedOrder(context: OrderContext, orderType: OrderType): LtvBasedOrderSpecification | null {
  checkObligationCompatible(context);
  const kaminoOrder = context.kaminoObligation.getOrders()[toOrderIndex(orderType)];
  if (kaminoOrder === null) {
    return null;
  }
  const trigger = toTrigger(kaminoOrder.condition, orderType);
  return readTriggerBasedOrder(kaminoOrder, trigger);
}

/**
 * A high-level specification of an LTV-based order.
 */
export type LtvBasedOrderSpecification = OrderSpecification<LtvBasedOrderTrigger>;

/**
 * A discriminator enum for {@link LtvBasedOrderTrigger};
 */
export enum LtvBasedOrderTriggerType {
  StopLoss = 'StopLoss',
  TakeProfit = 'TakeProfit',
}

/**
 * One of possible triggers depending on the obligation's type and the price bracket's side.
 */
export type LtvBasedOrderTrigger = StopLoss | TakeProfit;

/**
 * A trigger for a stop-loss on LTV.
 */
export type StopLoss = {
  type: LtvBasedOrderTriggerType.StopLoss;
  whenLtvPctAbove: number;
};

/**
 * A trigger for a take-profit on LTV.
 */
export type TakeProfit = {
  type: LtvBasedOrderTriggerType.TakeProfit;
  whenLtvPctBelow: number;
};

// Only internals below:

const FULL_PCT = 100;
const MIN_LTV_THRESHOLD = 0.01;
const MAX_LTV_THRESHOLD = 0.99;

function checkObligationCompatible({ kaminoMarket, kaminoObligation }: OrderContext) {
  for (const depositReserveAddress of kaminoObligation.deposits.keys()) {
    const depositReserve = kaminoMarket.getExistingReserveByAddress(depositReserveAddress);
    // Note: the seemingly over-cautious requirement below ensures that the user-facing LTV calculation gives the same
    // result as on the Klend SC side (they differ in the handling of 0-LTV collaterals; see
    // `KaminoObligation.loanToValue()` doc for details). We may unify the 0-LTV handling some day and remove this.
    checkThat(
      depositReserve.state.config.loanToValuePct !== 0,
      `LTV-based orders cannot be used with a 0-LTV collateral: ${depositReserve.symbol}`
    );
  }
}

function toOrderCondition(orderType: OrderType, trigger: LtvBasedOrderTrigger): OrderCondition {
  switch (orderType) {
    case OrderType.StopLoss:
      if (trigger.type === LtvBasedOrderTriggerType.StopLoss) {
        return new UserLtvAbove(new Decimal(trigger.whenLtvPctAbove).div(FULL_PCT));
      }
      break;
    case OrderType.TakeProfit:
      if (trigger.type === LtvBasedOrderTriggerType.TakeProfit) {
        return new UserLtvBelow(new Decimal(trigger.whenLtvPctBelow).div(FULL_PCT));
      }
      break;
  }
  throw new Error(`an LTV-based ${orderType} order cannot use ${trigger.type} condition`);
}

function toTrigger(condition: OrderCondition, orderType: OrderType): LtvBasedOrderTrigger {
  switch (orderType) {
    case OrderType.StopLoss:
      if (condition instanceof UserLtvAbove) {
        return {
          type: LtvBasedOrderTriggerType.StopLoss,
          whenLtvPctAbove: condition.minUserLtvExclusive.mul(FULL_PCT).toNumber(),
        };
      }
      break;
    case OrderType.TakeProfit:
      if (condition instanceof UserLtvBelow) {
        return {
          type: LtvBasedOrderTriggerType.TakeProfit,
          whenLtvPctBelow: condition.maxUserLtvExclusive.mul(FULL_PCT).toNumber(),
        };
      }
      break;
  }
  throw new Error(
    `an LTV-based ${orderType} order has an incompatible on-chain condition ${condition.constructor.name}`
  );
}
