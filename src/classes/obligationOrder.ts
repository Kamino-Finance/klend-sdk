/* eslint-disable max-classes-per-file */
import { Fraction } from './fraction';
import { ObligationOrder } from '../@codegen/klend/types';
import { orThrow, roundNearest } from './utils';
import Decimal from 'decimal.js';
import BN from 'bn.js';
import { KaminoObligation, Position } from './obligation';
import { TokenAmount } from './shared';
import { ONE_HUNDRED_PCT_IN_BPS } from '../utils';
import { getSingleElement } from '../utils/validations';
import { KaminoMarket } from './market';

// Polymorphic parts of an order:

/**
 * A condition "activating" an order.
 *
 * When a {@link KaminoObligationOrder.condition} is met by an obligation, the corresponding
 * {@link KaminoObligationOrder.opportunity} becomes available to liquidators.
 */
export interface OrderCondition {
  /**
   * An abstract parameter of the condition, meaningful in context of the condition's type.
   */
  threshold(): Decimal;

  /**
   * Returns a potential hit on this condition.
   */
  evaluate(obligation: KaminoObligation): ConditionHit | null;
}

/**
 * An "opportunity" of an order - i.e. a type and size of a trade made available by the order (provided that its
 * {@link KaminoObligationOrder.condition} is met).
 */
export interface OrderOpportunity {
  /**
   * An abstract parameter of the condition, meaningful in context of the condition's type.
   */
  parameter(): Decimal;

  /**
   * Returns the highest-valued {@link TokenAmount} that can be repaid (among the given borrows) using this opportunity.
   */
  getMaxRepay(borrows: Array<Position>): TokenAmount;
}

// All condition types:

/**
 * A condition met when obligation's overall "User LTV" is strictly higher than the given threshold.
 */
export class UserLtvAbove implements OrderCondition {
  readonly minUserLtvExclusive: Decimal;

  constructor(minUserLtvExclusive: Decimal.Value) {
    this.minUserLtvExclusive = new Decimal(minUserLtvExclusive);
  }

  threshold(): Decimal {
    return this.minUserLtvExclusive;
  }

  evaluate(obligation: KaminoObligation): ConditionHit | null {
    // Note: below we deliberately use the LTV-related methods of `KaminoObligation` (instead of the precomputed fields
    // of the `ObligationStats`), since we care about using the same LTV computation as the KLend smart contract.
    // Please see their docs for details.
    return evaluateStopLoss(obligation.loanToValue(), this.minUserLtvExclusive, obligation.liquidationLtv());
  }
}

/**
 * A condition met when obligation's overall "User LTV" is strictly lower than the given threshold.
 */
export class UserLtvBelow implements OrderCondition {
  readonly maxUserLtvExclusive: Decimal;

  constructor(maxUserLtvExclusive: Decimal.Value) {
    this.maxUserLtvExclusive = new Decimal(maxUserLtvExclusive);
  }

  threshold(): Decimal {
    return this.maxUserLtvExclusive;
  }

  evaluate(obligation: KaminoObligation): ConditionHit | null {
    // Note: below we deliberately use the `KaminoObligation.loanToValue()` method (instead of the precomputed field
    // `ObligationStats.loanToValue`), since we care about using the same LTV computation as the KLend smart contract.
    // Please see the method's docs for details.
    return evaluateTakeProfit(obligation.loanToValue(), this.maxUserLtvExclusive);
  }
}

/**
 * A condition met when the obligation's collateral token price (expressed in the debt token) is strictly higher than
 * the given threshold.
 *
 * May only be applied to single-collateral, single-debt obligations.
 */
export class DebtCollPriceRatioAbove implements OrderCondition {
  readonly minDebtCollPriceRatioExclusive: Decimal;

  constructor(minDebtCollPriceRatioExclusive: Decimal.Value) {
    this.minDebtCollPriceRatioExclusive = new Decimal(minDebtCollPriceRatioExclusive);
  }

  threshold(): Decimal {
    return this.minDebtCollPriceRatioExclusive;
  }

  evaluate(obligation: KaminoObligation): ConditionHit | null {
    const priceRatio = calculateDebtCollPriceRatio(obligation);
    return evaluateStopLoss(
      priceRatio,
      this.minDebtCollPriceRatioExclusive,
      // For single-debt-single-coll obligations, the price ratio is directly proportional
      // to LTV - so we can calculate the "liquidation price ratio" simply by scaling the
      // current value by the ratio of unhealthy/current borrow value:
      priceRatio
        .mul(obligation.refreshedStats.borrowLiquidationLimit)
        .div(obligation.refreshedStats.userTotalBorrowBorrowFactorAdjusted)
    );
  }
}

/**
 * A condition met when the obligation's collateral token price (expressed in the debt token) is strictly higher than
 * the given threshold.
 *
 * May only be applied to single-collateral, single-debt obligations.
 */
export class DebtCollPriceRatioBelow implements OrderCondition {
  readonly maxDebtCollPriceRatioExclusive: Decimal;

  constructor(maxDebtCollPriceRatioExclusive: Decimal.Value) {
    this.maxDebtCollPriceRatioExclusive = new Decimal(maxDebtCollPriceRatioExclusive);
  }

  threshold(): Decimal {
    return this.maxDebtCollPriceRatioExclusive;
  }

  evaluate(obligation: KaminoObligation): ConditionHit | null {
    return evaluateTakeProfit(calculateDebtCollPriceRatio(obligation), this.maxDebtCollPriceRatioExclusive);
  }
}

// All opportunity types:

/**
 * An opportunity for repaying the given amount of the obligation's debt token.
 *
 * May only be applied to single-debt obligations.
 */
export class DeleverageDebtAmount implements OrderOpportunity {
  readonly amount: Decimal;

  constructor(amount: Decimal.Value) {
    this.amount = new Decimal(amount);
  }

  parameter(): Decimal {
    return this.amount;
  }

  getMaxRepay(borrows: Array<Position>): TokenAmount {
    const singleBorrow = getSingleElement(borrows, 'borrow');
    return {
      mint: singleBorrow.mintAddress,
      amount: Decimal.min(singleBorrow.amount, this.amount),
    };
  }
}

/**
 * An opportunity for repaying all debt(s) of an obligation.
 */
export class DeleverageAllDebt implements OrderOpportunity {
  /**
   * The only legal value for the {@link parameter()} of this opportunity type.
   */
  static FRACTION_MAX = new Fraction(Fraction.MAX_F_BN).toDecimal();

  constructor(fixed_parameter?: Decimal.Value) {
    if (fixed_parameter !== undefined && !new Decimal(fixed_parameter).eq(DeleverageAllDebt.FRACTION_MAX)) {
      throw new Error(
        `invalid DeleverageAllDebt parameter: ${fixed_parameter} (if given, must be FRACTION_MAX = ${DeleverageAllDebt.FRACTION_MAX})`
      );
    }
  }

  parameter(): Decimal {
    return DeleverageAllDebt.FRACTION_MAX;
  }

  getMaxRepay(borrows: Array<Position>): TokenAmount {
    if (borrows.length === 0) {
      throw new Error(`Opportunity type not valid on obligation with no borrows`);
    }
    const highestValueBorrow = borrows
      .sort((left, right) => left.marketValueRefreshed.comparedTo(right.marketValueRefreshed))
      .at(-1)!;
    return {
      mint: highestValueBorrow.mintAddress,
      amount: highestValueBorrow.amount,
    };
  }
}

// A couple of internal interfaces:

interface OrderConditionConstructor {
  new (threshold: Decimal): OrderCondition;
}

interface OrderOpportunityConstructor {
  new (parameter: Decimal): OrderOpportunity;
}

// Internal type ID mappings:

const CONDITION_TO_TYPE_ID = new Map<OrderConditionConstructor, number>([
  // Note: the special value of 0 (Never) is represented in the SDK by `KaminoObligationOrder === null`.
  [UserLtvAbove, 1],
  [UserLtvBelow, 2],
  [DebtCollPriceRatioAbove, 3],
  [DebtCollPriceRatioBelow, 4],
]);

const OPPORTUNITY_TO_TYPE_ID = new Map<OrderOpportunityConstructor, number>([
  [DeleverageDebtAmount, 0],
  [DeleverageAllDebt, 1],
]);

const TYPE_ID_TO_CONDITION = new Map([...CONDITION_TO_TYPE_ID].map(([type, id]) => [id, type]));
const TYPE_ID_TO_OPPORTUNITY = new Map([...OPPORTUNITY_TO_TYPE_ID].map(([type, id]) => [id, type]));

// Core types:

/**
 * A business wrapper around the on-chain {@link ObligationOrder} account data.
 */
export class KaminoObligationOrder {
  /**
   * An on-chain data representing a `null` order.
   */
  static NULL_STATE = new ObligationOrder({
    conditionType: 0,
    conditionThresholdSf: new BN(0),
    opportunityType: 0,
    opportunityParameterSf: new BN(0),
    minExecutionBonusBps: 0,
    maxExecutionBonusBps: 0,
    padding1: Array(10).fill(0),
    padding2: Array(5).fill(new BN(0)),
  });

  /**
   * The order's condition.
   */
  readonly condition: OrderCondition;

  /**
   * The order's opportunity.
   */
  readonly opportunity: OrderOpportunity;

  /**
   * The minimum bonus rate (e.g. `0.01` meaning "1%") offered to a liquidator executing this order when its condition
   * threshold has been barely crossed.
   */
  readonly minExecutionBonusRate: Decimal;

  /**
   * The maximum bonus rate (e.g. `0.04` meaning "4%") offered to a liquidator executing this order when its condition
   * threshold has already been exceeded by a very large margin (to be specific: maximum possible margin - e.g. for
   * LTV-based stop-loss order, that would be when the obligation's LTV is approaching its liquidation LTV).
   */
  readonly maxExecutionBonusRate: Decimal;

  /**
   * Direct constructor.
   *
   * Please see {@link fromState()} if you are constructing an instance representing existing on-chain data.
   */
  constructor(
    condition: OrderCondition,
    opportunity: OrderOpportunity,
    minExecutionBonusRate: Decimal,
    maxExecutionBonusRate: Decimal = minExecutionBonusRate
  ) {
    this.condition = condition;
    this.opportunity = opportunity;
    this.minExecutionBonusRate = minExecutionBonusRate;
    this.maxExecutionBonusRate = maxExecutionBonusRate;
  }

  /**
   * Returns the highest-valued {@link AvailableOrderExecution} currently offered by this order.
   *
   * May return `undefined` when the order's condition is not met.
   */
  findMaxAvailableExecution(
    kaminoMarket: KaminoMarket,
    obligation: KaminoObligation
  ): AvailableOrderExecution | undefined {
    const conditionHit = this.condition.evaluate(obligation);
    if (conditionHit === null) {
      return undefined; // condition not met - cannot execute
    }
    const maxRepay = this.opportunity.getMaxRepay(obligation.getBorrows());
    const repayBorrow = obligation.getBorrowByMint(maxRepay.mint)!;
    const maxRepayValue = tokenAmountToValue(maxRepay, repayBorrow);
    const executionBonusRate = this.calculateExecutionBonusRate(conditionHit, obligation);
    const executionBonusFactor = new Decimal(1).add(executionBonusRate);
    const maxWithdrawValue = maxRepayValue.mul(executionBonusFactor);

    // The order execution only allows us to pick the lowest-liquidation-LTV deposit for withdrawal (excluding 0-LTV
    // assets, which are never liquidatable), hence we pre-filter the candidate deposits:
    const liquidationLtvsOfDeposits = obligation
      .getDeposits()
      .map((deposit): [Decimal, Position] => [
        obligation.getLtvForReserve(kaminoMarket, deposit.reserveAddress).liquidationLtv,
        deposit,
      ]);
    const liquidatableDeposits = liquidationLtvsOfDeposits.filter(([liquidationLtv, _deposit]) => liquidationLtv.gt(0));
    // Note: in theory, we could use the Obligation's `lowestReserveDepositLiquidationLtv` (cached by SC) here, but it
    // is equally easy to just find the minimum (and avoid any issues related to stale `KaminoObligation` state or
    // `Decimal` rounding/comparison).
    const minLiquidationLtv = Decimal.min(...liquidatableDeposits.map(([liquidationLtv, _deposit]) => liquidationLtv));

    const [actualWithdrawValue, withdrawDeposit] = liquidatableDeposits
      .filter(([liquidationLtv, _deposit]) => liquidationLtv.eq(minLiquidationLtv))
      .map(([_liquidationLtv, deposit]): [Decimal, Position] => {
        const availableWithdrawValue = Decimal.min(deposit.marketValueRefreshed, maxWithdrawValue);
        return [availableWithdrawValue, deposit];
      })
      .sort(([leftValue, leftDeposit], [rightValue, rightDeposit]) => {
        const valueComparison = leftValue.comparedTo(rightValue);
        if (valueComparison !== 0) {
          return valueComparison;
        }
        // Just for deterministic selection in case of multiple equally-good deposits: pick the one with lower mint pubkey (mostly for test stability purposes)
        return leftDeposit.mintAddress.localeCompare(rightDeposit.mintAddress);
      })
      .at(-1)!;
    const actualRepayValue = actualWithdrawValue.div(executionBonusFactor);
    return {
      repay: valueToTokenAmount(actualRepayValue, repayBorrow),
      withdraw: valueToTokenAmount(actualWithdrawValue, withdrawDeposit),
      bonusRate: executionBonusRate,
    };
  }

  /**
   * Constructs an instance based on the given on-chain data.
   *
   * Returns `null` if the input represents just an empty slot in the orders' array.
   */
  static fromState(state: ObligationOrder): KaminoObligationOrder | null {
    if (state.conditionType === KaminoObligationOrder.NULL_STATE.conditionType) {
      return null; // In practice an entire null order is zeroed, but technically the "condition == never" is enough to consider the order "not active"
    }
    const conditionConstructor =
      TYPE_ID_TO_CONDITION.get(state.conditionType) ?? orThrow(`Unknown condition type ${state.conditionType}`);
    const condition = new conditionConstructor(new Fraction(state.conditionThresholdSf).toDecimal());
    const opportunityConstructor =
      TYPE_ID_TO_OPPORTUNITY.get(state.opportunityType) ?? orThrow(`Unknown opportunity type ${state.opportunityType}`);
    const opportunity = new opportunityConstructor(new Fraction(state.opportunityParameterSf).toDecimal());
    const minExecutionBonusRate = Fraction.fromBps(state.minExecutionBonusBps).toDecimal();
    const maxExecutionBonusRate = Fraction.fromBps(state.maxExecutionBonusBps).toDecimal();
    return new KaminoObligationOrder(condition, opportunity, minExecutionBonusRate, maxExecutionBonusRate);
  }

  /**
   * Returns the on-chain state represented by this instance.
   *
   * See {@link NULL_STATE} for the state of a `null` order.
   */
  toState(): ObligationOrder {
    return new ObligationOrder({
      ...KaminoObligationOrder.NULL_STATE.toEncodable(),
      conditionType:
        CONDITION_TO_TYPE_ID.get(Object.getPrototypeOf(this.condition).constructor) ??
        orThrow(`Unknown condition ${this.condition.constructor}`),
      conditionThresholdSf: Fraction.fromDecimal(this.condition.threshold()).getValue(),
      opportunityType:
        OPPORTUNITY_TO_TYPE_ID.get(Object.getPrototypeOf(this.opportunity).constructor) ??
        orThrow(`Unknown opportunity ${this.opportunity.constructor}`),
      opportunityParameterSf: Fraction.fromDecimal(this.opportunity.parameter()).getValue(),
      minExecutionBonusBps: roundNearest(this.minExecutionBonusRate.mul(ONE_HUNDRED_PCT_IN_BPS)).toNumber(),
      maxExecutionBonusBps: roundNearest(this.maxExecutionBonusRate.mul(ONE_HUNDRED_PCT_IN_BPS)).toNumber(),
    });
  }

  /**
   * Binds this order to the given slot.
   *
   * This is just a convenience method for easier interaction with {@link KaminoAction#buildSetObligationOrderIxn()}.
   */
  atIndex(index: number): ObligationOrderAtIndex {
    return new ObligationOrderAtIndex(index, this);
  }

  /**
   * Calculates the given order's actual execution bonus rate.
   *
   * The min-max bonus range is configured by the user on a per-order basis, and the actual value is interpolated based
   * on the given obligation's state at the moment of order execution.
   * In short: the minimum bonus applies if the order is executed precisely at the point when the condition is met.
   * Then, as the distance from condition's threshold grows, the bonus approaches the configured maximum.
   *
   * On top of that, similar to regular liquidation, the bonus cannot exceed the ceiled limit of `1.0 - user_no_bf_ltv`
   * (which ensures that order execution improves LTV).
   */
  private calculateExecutionBonusRate(conditionHit: ConditionHit, obligation: KaminoObligation): Decimal {
    const interpolatedBonusRate = interpolateBonusRate(
      conditionHit.normalizedDistanceFromThreshold,
      this.minExecutionBonusRate,
      this.maxExecutionBonusRate
    );
    // In order to ensure that LTV improves on order execution, we apply the same heuristic formula as for the regular
    // liquidations. Please note that we deliberately use the `obligation.noBfLoanToValue()`, which is consistent with
    // the smart contract's calculation:
    const diffToBadDebt = new Decimal(1).sub(obligation.noBfLoanToValue());
    return Decimal.min(interpolatedBonusRate, diffToBadDebt);
  }
}

/**
 * A single slot within {@link Obligation.orders} (which may contain an order or not).
 *
 * This is used as an argument to {@link KaminoAction.buildSetObligationOrderIxn()} to easily set or cancel an order.
 */
export class ObligationOrderAtIndex {
  index: number;
  order: KaminoObligationOrder | null;

  constructor(index: number, order: KaminoObligationOrder | null) {
    this.index = index;
    this.order = order;
  }

  /**
   * Creates an empty slot representation (suitable for cancelling an order).
   */
  static empty(index: number): ObligationOrderAtIndex {
    return new ObligationOrderAtIndex(index, null);
  }

  /**
   * Returns the on-chain state of the order (potentially a zeroed account data, if the order is not set).
   */
  orderState(): ObligationOrder {
    return this.order !== null ? this.order.toState() : KaminoObligationOrder.NULL_STATE;
  }
}

/**
 * Numeric details on why an order's condition was met.
 */
export type ConditionHit = {
  /**
   * The distance between the current value (e.g. "current LTV") and the condition's
   * threshold (e.g. "when LTV > 70%"), normalized with regard to the most extreme value
   * (e.g. "liquidation LTV = 90%").
   *
   *  Following the above example:
   *  - when current LTV = 70% (i.e. at condition threshold), this normalized distance is `0`,
   *  - when current LTV = 90% (i.e. at liquidation point), this normalized distance is `1`,
   *  - when current LTV = 82% (i.e. some number in-between), this normalized distance is `0.6`.
   *
   *  In other words: this is a `[0; 1]` measure of how hard the condition threshold is crossed.
   */
  normalizedDistanceFromThreshold: Decimal;
};

/**
 * A potential exchange of tokens resulting from order execution.
 */
export type AvailableOrderExecution = {
  /**
   * How much (and of what token) to repay.
   */
  repay: TokenAmount;

  /**
   * How much (and of what other token) can be withdrawn in exchange.
   *
   * Note: This amount already *includes* the execution bonus (see `bonusRate` below), but does *not* take the protocol
   * fee into account (see `ReserveConfig.protocolOrderExecutionFeePct`).
   */
  withdraw: TokenAmount;

  /**
   * The bonus rate (e.g. `0.01` meaning 1%), computed based on the configured execution bonus range and the safety
   * ceiling.
   *
   * Note: this bonus is still subject to the protocol fee.
   */
  bonusRate: Decimal;
};

// Internal calculation functions:

function tokenAmountToValue(tokenAmount: TokenAmount, position: Position): Decimal {
  if (tokenAmount.mint !== position.mintAddress) {
    throw new Error(`Value of token amount ${tokenAmount} cannot be computed using data from ${position}`);
  }
  return tokenAmount.amount.mul(position.marketValueRefreshed).div(position.amount);
}

function valueToTokenAmount(value: Decimal, position: Position): TokenAmount {
  const fractionalAmount = value.mul(position.amount).div(position.marketValueRefreshed);
  return {
    amount: roundNearest(fractionalAmount),
    mint: position.mintAddress,
  };
}

function evaluateStopLoss(
  current_value: Decimal,
  conditionThreshold: Decimal,
  liquidationThreshold: Decimal
): ConditionHit | null {
  if (current_value.lte(conditionThreshold)) {
    return null; // SL not hit
  }
  let normalizedDistanceFromThreshold;
  if (conditionThreshold.gt(liquidationThreshold)) {
    // A theoretically-impossible case (the user may of course set his order's condition
    // threshold that high, but then the current value is above liquidation threshold, so
    // liquidation logic should kick in and never reach this function). Anyway, let's
    // interpret it as maximum distance from threshold:
    normalizedDistanceFromThreshold = new Decimal(1);
  } else {
    // By now we know they are both > 0:
    const currentDistance = current_value.sub(conditionThreshold);
    const maximumDistance = liquidationThreshold.sub(conditionThreshold);
    normalizedDistanceFromThreshold = currentDistance.div(maximumDistance);
  }
  return { normalizedDistanceFromThreshold };
}

function evaluateTakeProfit(currentValue: Decimal, conditionThreshold: Decimal): ConditionHit | null {
  if (currentValue.gte(conditionThreshold)) {
    return null; // TP not hit
  }
  const distanceTowards0 = conditionThreshold.sub(currentValue); // by now we know it is > 0
  return { normalizedDistanceFromThreshold: distanceTowards0.div(conditionThreshold) };
}

function calculateDebtCollPriceRatio(obligation: KaminoObligation): Decimal {
  const singleBorrow = getSingleElement(obligation.getBorrows(), 'borrow');
  const singleDeposit = getSingleElement(obligation.getDeposits(), 'deposit');
  return calculateTokenPrice(singleBorrow).div(calculateTokenPrice(singleDeposit));
}

function calculateTokenPrice(position: Position): Decimal {
  return position.marketValueRefreshed.mul(position.mintFactor).div(position.amount);
}

function interpolateBonusRate(
  normalizedDistanceFromThreshold: Decimal,
  minBonusRate: Decimal,
  maxBonusRate: Decimal
): Decimal {
  return minBonusRate.add(normalizedDistanceFromThreshold.mul(maxBonusRate.sub(minBonusRate)));
}
