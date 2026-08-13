export function maxBigInt(...values: bigint[]): bigint {
  return values.reduce((max, current) => (current > max ? current : max), values[0]);
}

export function minBigInt(...values: bigint[]): bigint {
  return values.reduce((min, current) => (current < min ? current : min), values[0]);
}
