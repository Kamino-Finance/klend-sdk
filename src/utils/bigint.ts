export function maxBigInt(...values: bigint[]): bigint {
  return values.reduce((max, current) => (current > max ? current : max), values[0]);
}
