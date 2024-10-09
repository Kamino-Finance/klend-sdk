import Decimal from 'decimal.js';

export function fuzzyEqual(a: Decimal.Value, b: Decimal.Value, epsilon = 0.0001) {
  return new Decimal(a).sub(b).abs().lte(epsilon);
}
