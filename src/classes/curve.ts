import { BorrowRateCurve, CurvePointFields } from '../@codegen/klend/types';

export const CURVE_POINTS_LENGTH = 11;

/**
 * Create a new curve with a flat borrow rate
 * Useful for testing
 * @param borrowRateBps - the flat borrow rate in bps
 * @return BorrowRateCurve - the serializable flat curve configuration
 */
export function newFlat(borrowRateBps: number): BorrowRateCurve {
  const points: CurvePointFields[] = padPoints([
    { borrowRateBps, utilizationRateBps: 0 },
    { borrowRateBps, utilizationRateBps: 10_000 },
  ]);
  return new BorrowRateCurve({
    points,
  });
}

/**
 * Pad the remainder with the final point
 * @param points - un-padded points
 * @returns points - the padded points
 */
export function padPoints(points: CurvePointFields[]): CurvePointFields[] {
  points.push(...Array(CURVE_POINTS_LENGTH - points.length).fill(points[points.length - 1]));
  return points;
}
