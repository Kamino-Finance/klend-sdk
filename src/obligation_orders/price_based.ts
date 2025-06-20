import { KaminoMarket } from '../classes';
import Decimal from 'decimal.js';
import {
  DebtCollPriceRatioAbove,
  DebtCollPriceRatioBelow,
  ObligationOrderAtIndex,
  OrderCondition,
} from '../classes/obligationOrder';
import { Address } from '@solana/kit';
import { checkThat, getSingleElement } from '../utils/validations';
import { OrderContext, OrderSpecification, OrderType } from './common';
import { createConditionBasedOrder, readTriggerBasedOrder, toOrderIndex } from './internal';

/**
 * Creates a price-based {@link ObligationOrderAtIndex} based on the given stop-loss or take-profit specification.
 *
 * The returned object can then be passed directly to {@link KaminoAction.buildSetObligationOrderIxn()} to build an
 * instruction which replaces (or cancels, if the specification is `null`) the given obligation's stop-loss or
 * take-profit order on-chain.
 *
 * The given obligation is expected to be a "price-based position" - a single-debt, single-coll obligation which either
 * deposits or borrows a stablecoin (i.e. a long or short position of some token against a stablecoin).
 */
export function createPriceBasedOrder(
  context: PriceBasedOrderContext,
  orderType: OrderType,
  specification: PriceBasedOrderSpecification | null
): ObligationOrderAtIndex {
  const positionType = resolvePositionType(context); // resolving this first has an intentional side effect of validating the obligation being compatible
  const index = toOrderIndex(orderType);
  if (specification === null) {
    return ObligationOrderAtIndex.empty(index);
  }
  const condition = toOrderCondition(positionType, orderType, specification.trigger);
  return createConditionBasedOrder(context, condition, specification).atIndex(index);
}

/**
 * Parses an {@link PriceBasedOrderSpecification} from the selected stop-loss or take-profit order of the given obligation.
 *
 * The given obligation is expected to be a "price-based position" - a single-debt, single-coll obligation which either
 * deposits or borrows a stablecoin (i.e. a long or short position of some token against a stablecoin).
 *
 * The selected order is expected to be of matching type (i.e. as if it was created using the
 * {@link createPriceBasedOrder()}).
 */
export function readPriceBasedOrder(
  context: PriceBasedOrderContext,
  orderType: OrderType
): PriceBasedOrderSpecification | null {
  const positionType = resolvePositionType(context); // resolving this first has an intentional side effect of validating the obligation being compatible
  const kaminoOrder = context.kaminoObligation.getOrders()[toOrderIndex(orderType)];
  if (kaminoOrder === null) {
    return null;
  }
  const trigger = toTrigger(positionType, kaminoOrder.condition, orderType);
  return readTriggerBasedOrder(kaminoOrder, trigger);
}

/**
 * An extended {@link OrderContext} needed to interpret orders on "price-based position" obligations.
 */
export type PriceBasedOrderContext = OrderContext & {
  stablecoins: SymbolOrMintAddress[];
};

/**
 * A convenient multi-way of specifying a token.
 */
export type SymbolOrMintAddress = string | Address;

/**
 * A high-level specification of a price-based order.
 */
export type PriceBasedOrderSpecification = OrderSpecification<PriceBasedOrderTrigger>;

/**
 * A discriminator enum for {@link PriceBasedOrderTrigger};
 */
export enum PriceBasedOrderTriggerType {
  LongStopLoss = 'LongStopLoss',
  LongTakeProfit = 'LongTakeProfit',
  ShortStopLoss = 'ShortStopLoss',
  ShortTakeProfit = 'ShortTakeProfit',
}

/**
 * One of possible triggers depending on the obligation's type and the price bracket's side.
 */
export type PriceBasedOrderTrigger = LongStopLoss | LongTakeProfit | ShortStopLoss | ShortTakeProfit;

/**
 * A trigger for a stop-loss on a long position.
 */
export type LongStopLoss = {
  type: PriceBasedOrderTriggerType.LongStopLoss;
  whenCollateralPriceBelow: Decimal;
};

/**
 * A trigger for a take-profit on a long position.
 */
export type LongTakeProfit = {
  type: PriceBasedOrderTriggerType.LongTakeProfit;
  whenCollateralPriceAbove: Decimal;
};

/**
 * A trigger for a stop-loss on a short position.
 */
export type ShortStopLoss = {
  type: PriceBasedOrderTriggerType.ShortStopLoss;
  whenDebtPriceAbove: Decimal;
};

/**
 * A trigger for a take-profit on a short position.
 */
export type ShortTakeProfit = {
  type: PriceBasedOrderTriggerType.ShortTakeProfit;
  whenDebtPriceBelow: Decimal;
};

// Only internals below:

function toOrderCondition(
  positionType: PositionType,
  orderType: OrderType,
  trigger: PriceBasedOrderTrigger
): OrderCondition {
  switch (positionType) {
    case PositionType.Long:
      switch (orderType) {
        case OrderType.StopLoss:
          if (trigger.type === PriceBasedOrderTriggerType.LongStopLoss) {
            return new DebtCollPriceRatioAbove(invertPriceRatio(trigger.whenCollateralPriceBelow));
          }
          break;
        case OrderType.TakeProfit:
          if (trigger.type === PriceBasedOrderTriggerType.LongTakeProfit) {
            return new DebtCollPriceRatioBelow(invertPriceRatio(trigger.whenCollateralPriceAbove));
          }
          break;
      }
      break;
    case PositionType.Short:
      switch (orderType) {
        case OrderType.StopLoss:
          if (trigger.type === PriceBasedOrderTriggerType.ShortStopLoss) {
            return new DebtCollPriceRatioAbove(trigger.whenDebtPriceAbove);
          }
          break;
        case OrderType.TakeProfit:
          if (trigger.type === PriceBasedOrderTriggerType.ShortTakeProfit) {
            return new DebtCollPriceRatioBelow(trigger.whenDebtPriceBelow);
          }
          break;
      }
      break;
  }
  throw new Error(`a ${orderType} order on a ${positionType} position cannot use ${trigger.type} condition`);
}

function toTrigger(
  positionType: PositionType,
  condition: OrderCondition,
  orderType: OrderType
): PriceBasedOrderTrigger {
  switch (positionType) {
    case PositionType.Long:
      switch (orderType) {
        case OrderType.StopLoss:
          if (condition instanceof DebtCollPriceRatioAbove) {
            return {
              type: PriceBasedOrderTriggerType.LongStopLoss,
              whenCollateralPriceBelow: invertPriceRatio(condition.minDebtCollPriceRatioExclusive),
            };
          }
          break;
        case OrderType.TakeProfit:
          if (condition instanceof DebtCollPriceRatioBelow) {
            return {
              type: PriceBasedOrderTriggerType.LongTakeProfit,
              whenCollateralPriceAbove: invertPriceRatio(condition.maxDebtCollPriceRatioExclusive),
            };
          }
          break;
      }
      break;
    case PositionType.Short:
      switch (orderType) {
        case OrderType.StopLoss:
          if (condition instanceof DebtCollPriceRatioAbove) {
            return {
              type: PriceBasedOrderTriggerType.ShortStopLoss,
              whenDebtPriceAbove: condition.minDebtCollPriceRatioExclusive,
            };
          }
          break;
        case OrderType.TakeProfit:
          if (condition instanceof DebtCollPriceRatioBelow) {
            return {
              type: PriceBasedOrderTriggerType.ShortTakeProfit,
              whenDebtPriceBelow: condition.maxDebtCollPriceRatioExclusive,
            };
          }
          break;
      }
      break;
  }
  throw new Error(
    `a ${orderType} order on a ${positionType} position has an incompatible on-chain condition ${condition.constructor.name}`
  );
}

function invertPriceRatio(priceRatio: Decimal): Decimal {
  return new Decimal(1).div(priceRatio);
}

enum PositionType {
  Long = 'Long',
  Short = 'Short',
}

function resolvePositionType(context: PriceBasedOrderContext): PositionType {
  const collateralReserveAddress = getSingleElement(context.kaminoObligation.deposits.keys(), 'deposit');
  const debtReserveAddress = getSingleElement(context.kaminoObligation.borrows.keys(), 'borrow');
  const stablecoinReserveAddresses = collectReserveAddresses(context.kaminoMarket, context.stablecoins);
  if (stablecoinReserveAddresses.has(collateralReserveAddress)) {
    checkThat(
      !stablecoinReserveAddresses.has(debtReserveAddress),
      'cannot resolve long vs short position from all-stablecoins obligation'
    );
    return PositionType.Short;
  } else {
    checkThat(
      stablecoinReserveAddresses.has(debtReserveAddress),
      'cannot resolve long vs short position from no-stablecoins obligation'
    );
    return PositionType.Long;
  }
}

function collectReserveAddresses(
  kaminoMarket: KaminoMarket,
  symbolOrMintAddresses: SymbolOrMintAddress[]
): Set<Address> {
  return new Set<Address>(
    symbolOrMintAddresses.map((symbolOrMintAddress) =>
      typeof symbolOrMintAddress === 'string'
        ? kaminoMarket.getExistingReserveBySymbol(symbolOrMintAddress).address
        : kaminoMarket.getExistingReserveByMint(symbolOrMintAddress).address
    )
  );
}
