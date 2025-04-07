import Decimal from 'decimal.js';
import {
  DeleverageAllDebt,
  DeleverageDebtAmount,
  KaminoObligationOrder,
  OrderCondition,
  OrderOpportunity,
} from '../classes/obligationOrder';
import { checkThat, getSingleElement } from '../utils/validations';
import { ONE_HUNDRED_PCT_IN_BPS } from '../utils';
import { OrderAction, OrderActionType, OrderContext, OrderSpecification, OrderType } from './common';

// These methods are exported, buy only used internally within the obligation orders utils:

export function toOrderIndex(orderType: OrderType): number {
  switch (orderType) {
    case OrderType.StopLoss:
      return 0;
    case OrderType.TakeProfit:
      return 1;
  }
}

export function createConditionBasedOrder<C>(
  context: OrderContext,
  condition: OrderCondition,
  specification: OrderSpecification<C>
): KaminoObligationOrder {
  checkThat(condition.evaluate(context.kaminoObligation) === null, `cannot create an immediately-triggered order`);
  const opportunity = toOrderOpportunity(context, specification.action);
  const [minExecutionBonusRate, maxExecutionBonusRate] = toExecutionBonusRates(specification.executionBonusBpsRange);
  return new KaminoObligationOrder(condition, opportunity, minExecutionBonusRate, maxExecutionBonusRate);
}

export function readTriggerBasedOrder<T>(kaminoOrder: KaminoObligationOrder, trigger: T): OrderSpecification<T> {
  return {
    trigger,
    action: toAction(kaminoOrder.opportunity),
    executionBonusBpsRange: toExecutionBonusBps(kaminoOrder.minExecutionBonusRate, kaminoOrder.maxExecutionBonusRate),
  };
}

// Only internals below:

function toOrderOpportunity(context: OrderContext, action: OrderAction): OrderOpportunity {
  switch (action.type) {
    case OrderActionType.FullRepay:
      return new DeleverageAllDebt();
    case OrderActionType.PartialRepay:
      const { repayDebtAmountLamports } = action;
      checkThat(repayDebtAmountLamports.gt(0), `repay amount must be positive; got ${repayDebtAmountLamports}`);
      const availableDebtAmountLamports = getSingleElement(context.kaminoObligation.getBorrows(), 'borrow').amount;
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
