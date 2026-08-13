import BN from 'bn.js';
import { KaminoReserve } from '../classes/reserve';

/**
 * Base class for reserve kind identification.
 * Since a market can have multiple reserves for the same mint (with different terms),
 * this kind specifies which reserve to select.
 */
export abstract class ReserveKind {
  /**
   * Checks if a reserve matches this reserve kind's criteria
   */
  abstract matches(reserve: KaminoReserve): boolean;

  /**
   * Returns a human-readable string representation
   */
  abstract toString(): string;

  /**
   * Type check: returns true if this is an open-term reserve
   */
  abstract isFloatRate(): boolean;

  /**
   * Type check: returns true if this is a fixed-term reserve
   */
  abstract isFixedRate(): boolean;

  /**
   * Type check: returns true if this is a maturity-timestamp reserve
   */
  abstract isMaturityTimestampKind(): boolean;
}

/**
 * Represents an open-term reserve with no fixed maturity.
 */
export class FloatRateReserveKind extends ReserveKind {
  /**
   * Checks if a reserve matches this open-term reserve kind
   */
  matches(reserve: KaminoReserve): boolean {
    return reserve.state.config.debtTermSeconds.eqn(0) && reserve.state.config.debtMaturityTimestamp.eqn(0);
  }

  toString(): string {
    return 'FloatRate';
  }

  isFloatRate(): boolean {
    return true;
  }

  isFixedRate(): boolean {
    return false;
  }

  isMaturityTimestampKind(): boolean {
    return false;
  }
}

/**
 * Represents a fixed-term reserve with specific loan parameters.
 */
export class FixedRateReserveKind extends ReserveKind {
  /**
   * @param debtTermSeconds The debt term in seconds (e.g., new BN(30 * 24 * 60 * 60) for 30 days)
   * @param borrowRateBps The maximum borrow rate in basis points (e.g., 500 for 5%)
   */
  constructor(public readonly debtTermSeconds: BN, public readonly borrowRateBps: number) {
    super();
  }

  /**
   * Checks if a reserve matches this fixed-term reserve kind
   */
  matches(reserve: KaminoReserve): boolean {
    // Check debt term matches
    if (!reserve.state.config.debtTermSeconds.eq(this.debtTermSeconds)) {
      return false;
    }

    // For fixed-term reserves, all points on the borrow rate curve should have the same rate
    const curvePoints = reserve.state.config.borrowRateCurve.points;

    // Check if all points have the expected borrow rate
    return curvePoints.every((point) => point.borrowRateBps === this.borrowRateBps);
  }

  toString(): string {
    return `FixedRate(term=${this.debtTermSeconds.toString()}s, rate=${this.borrowRateBps}bps)`;
  }

  isFloatRate(): boolean {
    return false;
  }

  isFixedRate(): boolean {
    return true;
  }

  isMaturityTimestampKind(): boolean {
    return false;
  }
}

/**
 * Represents a reserve with a fixed maturity timestamp at which all debts become liquidatable.
 */
export class MaturityTimestampReserveKind extends ReserveKind {
  /**
   * @param debtMaturityTimestamp The unix timestamp at which all debts from this reserve become liquidatable
   */
  constructor(public readonly debtMaturityTimestamp: BN) {
    super();
  }

  /**
   * Checks if a reserve matches this maturity timestamp reserve kind
   */
  matches(reserve: KaminoReserve): boolean {
    return reserve.state.config.debtMaturityTimestamp.eq(this.debtMaturityTimestamp);
  }

  toString(): string {
    return `MaturityTimestamp(ts=${this.debtMaturityTimestamp.toString()})`;
  }

  isFloatRate(): boolean {
    return false;
  }

  isFixedRate(): boolean {
    return false;
  }

  isMaturityTimestampKind(): boolean {
    return true;
  }
}
