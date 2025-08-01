import BN from 'bn.js';
import Decimal from 'decimal.js';
import { roundNearest } from './utils';
import { BigFractionBytes } from '../lib';

/**
 * The higher-precision {@link Decimal} counterpart that *must* be used by all operations within {@link Fraction}.
 *
 * ## How to use it?
 * Simply do `new FractionDecimal(x)` instead of `new Decimal(x)`.
 *
 * ## Why is this needed?
 * The default {@link Decimal.precision} is 20.
 * Some fractions on which we operate (most notably: the {@link Fraction.MAX_F_BN}) have more than 20 significant
 * digits, and at the same time they must encode to exact representation (e.g. because the smart contract expects an
 * exact `0xffff...ff` which has a speciyaal meaning, like "withdraw *all*").
 *
 * ## Why was this *not* needed before?
 * Some vibe-coded libraries that we use (e.g. `@orca-so/whirlpool-sdk`) statically initialize the global
 * `Decimal.set({ precision: ... })` when loaded. A previous, fortunate import order allowed our {@link Fraction}'s
 * constants to be computed using a sufficiently-high precision. This of course was broken by a random, unrelated
 * refactor, and from that point on we decided to not rely on the thoughtful Orca developers.
 */
const FractionDecimal = Decimal.clone({ precision: 40 });

export class Fraction {
  static MAX_SIZE_F = 128;
  static MAX_SIZE_BF = 256;
  static FRACTIONS = 60;
  static MULTIPLIER = new FractionDecimal(2).pow(Fraction.FRACTIONS);

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
    return new FractionDecimal(this.valueSf.toString()).div(Fraction.MULTIPLIER);
  }

  static fromDecimal(n: Decimal | number): Fraction {
    const scaledDecimal = new FractionDecimal(n).mul(Fraction.MULTIPLIER);
    const roundedScaledDecimal = roundNearest(scaledDecimal);
    // Note: the `Decimal.toString()` can return exponential notation (e.g. "1e9") for large numbers. This notation is
    // not accepted by `BN` constructor (i.e. invalid character "e"). Hence, we use `Decimal.toFixed()` (which is
    // different than `number.toFixed()` - it will not do any rounding, just render a normal notation).
    const scaledValue = new BN(roundedScaledDecimal.toFixed());
    return new Fraction(scaledValue);
  }

  static fromBps(n: Decimal | number): Fraction {
    const decimal = new FractionDecimal(n).div(10000);
    return Fraction.fromDecimal(decimal);
  }

  static fromPercent(n: Decimal | number): Fraction {
    const decimal = new FractionDecimal(n).div(100);
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

export function bfToDecimal(x: BigFractionBytes): Decimal {
  const bsf = x.value;
  const accSf = bsf.reduce((acc, curr, i) => acc.add(curr.shln(i * 64)), new BN(0));
  return new Fraction(accSf).toDecimal();
}
