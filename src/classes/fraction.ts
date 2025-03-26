import BN from 'bn.js';
import Decimal from 'decimal.js';
import { roundNearest } from './utils';

export class Fraction {
  static MAX_SIZE_F = 128;
  static MAX_SIZE_BF = 256;
  static FRACTIONS = 60;
  static MULTIPLIER = new Decimal(2).pow(Fraction.FRACTIONS);

  static MAX_F_BN = new BN(2).pow(new BN(Fraction.MAX_SIZE_F)).sub(new BN(1));
  static MAX_BF_BN = new BN(2).pow(new BN(Fraction.MAX_SIZE_BF)).sub(new BN(1));
  static MIN_BN = new BN(0);

  valueSf: BN;

  constructor(valueSf: BN) {
    if (valueSf.lt(Fraction.MIN_BN) || valueSf.gt(Fraction.MAX_BF_BN)) {
      throw new Error('Number out of range');
    }

    this.valueSf = valueSf;
  }

  toDecimal(): Decimal {
    return new Decimal(this.valueSf.toString()).div(Fraction.MULTIPLIER);
  }

  static fromDecimal(n: Decimal | number): Fraction {
    const scaledDecimal = new Decimal(n).mul(Fraction.MULTIPLIER);
    const roundedScaledDecimal = roundNearest(scaledDecimal);
    // Note: the `Decimal.toString()` can return exponential notation (e.g. "1e9") for large numbers. This notation is
    // not accepted by `BN` constructor (i.e. invalid character "e"). Hence, we use `Decimal.toFixed()` (which is
    // different than `number.toFixed()` - it will not do any rounding, just render a normal notation).
    const scaledValue = new BN(roundedScaledDecimal.toFixed());
    return new Fraction(scaledValue);
  }

  static fromBps(n: Decimal | number): Fraction {
    const decimal = new Decimal(n).div(10000);
    return Fraction.fromDecimal(decimal);
  }

  static fromPercent(n: Decimal | number): Fraction {
    const decimal = new Decimal(n).div(100);
    return Fraction.fromDecimal(decimal);
  }

  getValue(): BN {
    return this.valueSf;
  }

  gt(x: Fraction): boolean {
    return this.valueSf.gt(x.getValue());
  }

  lt(x: Fraction): boolean {
    return this.valueSf.lt(x.getValue());
  }

  gte(x: Fraction): boolean {
    return this.valueSf.gte(x.getValue());
  }

  lte(x: Fraction): boolean {
    return this.valueSf.lte(x.getValue());
  }

  eq(x: Fraction): boolean {
    return this.valueSf.eq(x.getValue());
  }
}

export const ZERO_FRACTION = new Fraction(new BN(0));
