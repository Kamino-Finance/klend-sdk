/**
 * Lightweight, dependency-free helpers for the WS subsystem.
 *
 * These exist as a separate module (rather than importing from
 * `src/classes/utils.ts`) so the WS subsystem doesn't pull in heavy
 * transitive deps (axios, decimal.js, token program) at module load.
 */

/** No-op callback — useful as a default for optional handlers. */
export const noop = (): void => {};

/**
 * JSON.stringify with bigint support. Used to build stable, comparable
 * keys for filter sets that may contain bigint slot offsets etc.
 */
export function toJson(object: unknown, inline = false): string {
  const replacer = (_key: string, value: unknown) => (typeof value === 'bigint' ? value.toString() : value);
  return inline ? JSON.stringify(object, replacer) : JSON.stringify(object, replacer, 2);
}

/**
 * Convert a Uint8Array (possibly a subarray) to a Node Buffer for borsh
 * decode. Listeners call this on the small `data` blob returned by WS
 * notifications before handing it to `*.decode()`.
 */
export function toBuffer(data: Uint8Array): Buffer {
  return Buffer.isBuffer(data) ? data : Buffer.from(data);
}

/** Element-wise equality of two byte arrays (no allocation). */
export function blobEquals(left: Uint8Array, right: Uint8Array): boolean {
  if (left.length !== right.length) {
    return false;
  }
  for (let i = 0; i < left.length; ++i) {
    if (left[i] !== right[i]) {
      return false;
    }
  }
  return true;
}
