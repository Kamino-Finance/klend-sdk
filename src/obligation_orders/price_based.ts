import { KaminoMarket, KaminoObligation } from '../classes';
import Decimal from 'decimal.js';
import {
  DebtCollPriceRatioAbove,
  DebtCollPriceRatioBelow,
  DeleverageAllDebt,
  DeleverageDebtAmount,
  KaminoObligationOrder,
  ObligationOrderAtIndex,
  OrderCondition,
  OrderOpportunity,
} from '../classes/obligationOrder';
import { ONE_HUNDRED_PCT_IN_BPS, PublicKeySet } from '../utils';
import { PublicKey } from '@solana/web3.js';
import { checkThat, getSingleElement } from '../utils/validations';

/**
 * Creates an {@link ObligationOrderAtIndex} based on the given stop-loss or take-profit specification.
 *
 * The returned object can then be passed directly to {@link KaminoAction.buildSetObligationOrderIxn()} to build an
 * instruction which replaces (or cancels, if the specification is `null`) the given obligation's stop-loss or
 * take-profit order on-chain.
 *
 * The given obligation is expected to be a "USD position" - a single-debt, single-coll obligation which either
 * deposits or borrows a USD stablecoin (i.e. a long or short position of some token against USD).
 */
export function createPriceBasedOrderForUsdPosition(
  context: OrderContext,
  orderType: OrderType,
  specification: OrderSpecification | null
): ObligationOrderAtIndex {
  const positionType = resolvePositionType(context); // resolving this first has an intentional side effect of validating the obligation being compatible
  const index = toOrderIndex(orderType);
  if (specification === null) {
    return ObligationOrderAtIndex.empty(index);
  }
  const condition = toOrderCondition(positionType, orderType, specification.trigger);
  checkThat(condition.evaluate(context.kaminoObligation) === null, `cannot create an immediately-triggered order`);
  const opportunity = toOrderOpportunity(context, specification.action);
  const [minExecutionBonusRate, maxExecutionBonusRate] = toExecutionBonusRates(specification.executionBonusBpsRange);
  return new KaminoObligationOrder(condition, opportunity, minExecutionBonusRate, maxExecutionBonusRate).atIndex(index);
}

/**
 * Parses an {@link OrderSpecification} from the selected stop-loss or take-profit order of the given obligation.
 *
 * The given obligation is expected to be a "USD position" - a single-debt, single-coll obligation which either
 * deposits or borrows a USD stablecoin (i.e. a long or short position of some token against USD).
 *
 * The selected order is expected to be of matching type (i.e. as if it was created using the
 * {@link createPriceBasedOrderForUsdPosition()}).
 */
export function readPriceBasedOrderForUsdPosition(
  context: OrderContext,
  orderType: OrderType
): OrderSpecification | null {
  const positionType = resolvePositionType(context); // resolving this first has an intentional side effect of validating the obligation being compatible
  const kaminoOrder = context.kaminoObligation.getOrders()[toOrderIndex(orderType)];
  if (kaminoOrder === null) {
    return null;
  }
  return {
    trigger: toTrigger(positionType, kaminoOrder.condition, orderType),
    action: toAction(kaminoOrder.opportunity),
    executionBonusBpsRange: toExecutionBonusBps(kaminoOrder.minExecutionBonusRate, kaminoOrder.maxExecutionBonusRate),
  };
}

/**
 * A basic context needed to interpret orders on "USD position" obligations.
 */
export type OrderContext = {
  kaminoMarket: KaminoMarket;
  kaminoObligation: KaminoObligation;
  stablecoins: SymbolOrMintAddress[];
};

/**
 * A convenient multi-way of specifying a token.
 */
export type SymbolOrMintAddress = string | PublicKey;

/**
 * A type of order supported by "USD position" obligations (an obligation may have one order of each type).
 */
export enum OrderType {
  StopLoss = 'StopLoss',
  TakeProfit = 'TakeProfit',
}

/**
 * High-level specification of a price-based order.
 */
export type OrderSpecification = {
  /**
   * The condition that makes the {@link action} available to be executed.
   */
  trigger: OrderTrigger;

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

/**
 * A discriminator enum for {@literal OrderTrigger};
 */
export enum OrderTriggerType {
  LongStopLoss = 'LongStopLoss',
  LongTakeProfit = 'LongTakeProfit',
  ShortStopLoss = 'ShortStopLoss',
  ShortTakeProfit = 'ShortTakeProfit',
}

/**
 * One of possible triggers depending on the obligation's type and the price bracket's side.
 */
export type OrderTrigger = LongStopLoss | LongTakeProfit | ShortStopLoss | ShortTakeProfit;

/**
 * A trigger for a stop-loss on a long position.
 */
export type LongStopLoss = {
  type: OrderTriggerType.LongStopLoss;
  whenCollateralPriceBelow: Decimal;
};

/**
 * A trigger for a take-profit on a long position.
 */
export type LongTakeProfit = {
  type: OrderTriggerType.LongTakeProfit;
  whenCollateralPriceAbove: Decimal;
};

/**
 * A trigger for a stop-loss on a short position.
 */
export type ShortStopLoss = {
  type: OrderTriggerType.ShortStopLoss;
  whenDebtPriceAbove: Decimal;
};

/**
 * A trigger for a take-profit on a short position.
 */
export type ShortTakeProfit = {
  type: OrderTriggerType.ShortTakeProfit;
  whenDebtPriceBelow: Decimal;
};

/**
 * A discriminator enum for {@literal OrderAction};
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

// Internal conversions from high-level specifications to low-level objects:

function toOrderCondition(positionType: PositionType, orderType: OrderType, trigger: OrderTrigger): OrderCondition {
  switch (positionType) {
    case PositionType.Long:
      switch (orderType) {
        case OrderType.StopLoss:
          if (trigger.type === OrderTriggerType.LongStopLoss) {
            return new DebtCollPriceRatioAbove(invertPriceRatio(trigger.whenCollateralPriceBelow));
          }
          break;
        case OrderType.TakeProfit:
          if (trigger.type === OrderTriggerType.LongTakeProfit) {
            return new DebtCollPriceRatioBelow(invertPriceRatio(trigger.whenCollateralPriceAbove));
          }
          break;
      }
      break;
    case PositionType.Short:
      switch (orderType) {
        case OrderType.StopLoss:
          if (trigger.type === OrderTriggerType.ShortStopLoss) {
            return new DebtCollPriceRatioAbove(trigger.whenDebtPriceAbove);
          }
          break;
        case OrderType.TakeProfit:
          if (trigger.type === OrderTriggerType.ShortTakeProfit) {
            return new DebtCollPriceRatioBelow(trigger.whenDebtPriceBelow);
          }
          break;
      }
      break;
  }
  throw new Error(`a ${orderType} order on a ${positionType} position cannot use ${trigger.type} condition`);
}

function toOrderOpportunity(context: OrderContext, action: OrderAction): OrderOpportunity {
  switch (action.type) {
    case OrderActionType.FullRepay:
      return new DeleverageAllDebt();
    case OrderActionType.PartialRepay:
      const { repayDebtAmountLamports } = action;
      checkThat(repayDebtAmountLamports.gt(0), `repay amount must be positive; got ${repayDebtAmountLamports}`);
      const availableDebtAmountLamports = getSingleElement(context.kaminoObligation.getBorrows()).amount;
      checkThat(
        repayDebtAmountLamports.lte(availableDebtAmountLamports),
        `partial repay amount ${repayDebtAmountLamports} cannot exceed the borrowed amount ${availableDebtAmountLamports}`
      );
      return new DeleverageDebtAmount(action.repayDebtAmountLamports);
  }
}

function toExecutionBonusRates(executionBonusBpsRange: [number, number]): [Decimal, Decimal] {
  const [minExecutionBonusRate, maxExecutionBonusRate] = executionBonusBpsRange.map((bps) =>
    new Decimal(bps).div(ONE_HUNDRED_PCT_IN_BPS)
  );
  checkThat(minExecutionBonusRate.gte(0), `execution bonus rate cannot be negative: ${minExecutionBonusRate}`);
  checkThat(
    maxExecutionBonusRate.gte(minExecutionBonusRate),
    `max execution bonus rate ${maxExecutionBonusRate} cannot be lower than min ${minExecutionBonusRate}`
  );
  return [minExecutionBonusRate, maxExecutionBonusRate];
}

// Internal converters from low-level objects to high-level specifications:

function toOrderIndex(orderType: OrderType): number {
  switch (orderType) {
    case OrderType.StopLoss:
      return 0;
    case OrderType.TakeProfit:
      return 1;
  }
}

function toTrigger(positionType: PositionType, condition: OrderCondition, orderType: OrderType): OrderTrigger {
  switch (positionType) {
    case PositionType.Long:
      switch (orderType) {
        case OrderType.StopLoss:
          if (condition instanceof DebtCollPriceRatioAbove) {
            return {
              type: OrderTriggerType.LongStopLoss,
              whenCollateralPriceBelow: invertPriceRatio(condition.minDebtCollPriceRatioExclusive),
            };
          }
          break;
        case OrderType.TakeProfit:
          if (condition instanceof DebtCollPriceRatioBelow) {
            return {
              type: OrderTriggerType.LongTakeProfit,
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
              type: OrderTriggerType.ShortStopLoss,
              whenDebtPriceAbove: condition.minDebtCollPriceRatioExclusive,
            };
          }
          break;
        case OrderType.TakeProfit:
          if (condition instanceof DebtCollPriceRatioBelow) {
            return {
              type: OrderTriggerType.ShortTakeProfit,
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

function toAction(opportunity: OrderOpportunity): OrderAction {
  if (opportunity instanceof DeleverageAllDebt) {
    return {
      type: OrderActionType.FullRepay,
    };
  }
  if (opportunity instanceof DeleverageDebtAmount) {
    return {
      type: OrderActionType.PartialRepay,
      repayDebtAmountLamports: opportunity.amount,
    };
  }
  throw new Error(`incompatible on-chain opportunity ${opportunity.constructor.name}`);
}

function toExecutionBonusBps(minExecutionBonusRate: Decimal, maxExecutionBonusRate: Decimal): [number, number] {
  return [minExecutionBonusRate, maxExecutionBonusRate].map((rate) =>
    new Decimal(rate).mul(ONE_HUNDRED_PCT_IN_BPS).toNumber()
  ) as [number, number];
}

// Other internal helpers:

function invertPriceRatio(priceRatio: Decimal): Decimal {
  return new Decimal(1).div(priceRatio);
}

enum PositionType {
  Long = 'Long',
  Short = 'Short',
}

function resolvePositionType(context: OrderContext): PositionType {
  const collateralReserveAddress = getSingleElement(context.kaminoObligation.deposits.keys(), 'deposit');
  const debtReserveAddress = getSingleElement(context.kaminoObligation.borrows.keys(), 'borrow');
  const stablecoinReserveAddresses = collectReserveAddresses(context.kaminoMarket, context.stablecoins);
  if (stablecoinReserveAddresses.contains(collateralReserveAddress)) {
    checkThat(
      !stablecoinReserveAddresses.contains(debtReserveAddress),
      'cannot resolve long vs short position from all-stablecoins obligation'
    );
    return PositionType.Short;
  } else {
    checkThat(
      stablecoinReserveAddresses.contains(debtReserveAddress),
      'cannot resolve long vs short position from no-stablecoins obligation'
    );
    return PositionType.Long;
  }
}

function collectReserveAddresses(
  kaminoMarket: KaminoMarket,
  symbolOrMintAddresses: SymbolOrMintAddress[]
): PublicKeySet<PublicKey> {
  return new PublicKeySet(
    symbolOrMintAddresses.map((symbolOrMintAddress) =>
      typeof symbolOrMintAddress === 'string'
        ? kaminoMarket.getExistingReserveBySymbol(symbolOrMintAddress).address
        : kaminoMarket.getExistingReserveByMint(symbolOrMintAddress).address
    )
  );
}
