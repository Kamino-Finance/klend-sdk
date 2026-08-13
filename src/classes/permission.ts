import BN from 'bn.js';

/**
 * Permission operation encodings matching the Rust PermissionedOp bitflags
 */
export class PermissionedOp {
  private bitfield: BN;

  /** Canonical zero bitfield. The string form is obtained via `toString()`. */
  private static readonly NONE: BN = new BN(0);

  // On-chain Rust: pub struct PermissionedOp: u64 { DEPOSIT=1<<0; BORROW=1<<1; LIQUIDATE=1<<2; }
  // REPAY and WITHDRAW are never permissioned.
  private static readonly BIT_INDEX_MAP = new Map<string, number>([
    ['DEPOSIT', 0],
    ['BORROW', 1],
    ['LIQUIDATE', 2],
  ]);

  /** PermissionedOp with no flags set. */
  static empty(): PermissionedOp {
    return new PermissionedOp(PermissionedOp.NONE);
  }

  /**
   * PermissionedOp with every known flag set.
   */
  static allValid(): PermissionedOp {
    return PermissionedOp.fromBN(PermissionedOp.allValidBN());
  }

  /**
   * Single-bit mask (as a BN) for a single operation name (case-insensitive).
   */
  private static toBitMask(op: string): BN {
    const operation = op.toUpperCase();
    const bitIndex = this.BIT_INDEX_MAP.get(operation);
    if (bitIndex === undefined) {
      throw new Error(`Unknown operation: ${op}`);
    }
    return new BN(1).shln(bitIndex);
  }

  /**
   * Build a PermissionedOp from a pipe-separated op list (e.g., "DEPOSIT|BORROW").
   * Empty string or "NONE" (case-insensitive) yields a zero bitfield.
   */
  static fromString(ops: string): PermissionedOp {
    return new PermissionedOp(ops);
  }

  /**
   * Build a PermissionedOp from a raw BN bitfield. Unknown bits are masked off.
   */
  static fromBN(bitfield: BN): PermissionedOp {
    return new PermissionedOp(bitfield);
  }

  /**
   * Build a PermissionedOp from an unknown input, accepting only `string`, `BN`, or `undefined`.
   * `undefined` yields a zero (NONE) bitfield.
   */
  static fromUnknown(input: unknown): PermissionedOp {
    if (input === undefined) {
      return PermissionedOp.empty();
    }
    if (typeof input !== 'string' && !BN.isBN(input)) {
      throw new Error(`PermissionedOp.fromUnknown: expected string, BN, or undefined, got ${typeof input}`);
    }
    return new PermissionedOp(input as string | BN);
  }

  /**
   * BN with every known flag set. Internal helper used for masking,
   */
  private static allValidBN(): BN {
    let result = new BN(0);
    for (const bitIndex of this.BIT_INDEX_MAP.values()) {
      result = result.or(new BN(1).shln(bitIndex));
    }
    return result;
  }

  /**
   * Create a PermissionedOp from a human-readable op string (e.g., "DEPOSIT|BORROW")
   * or a raw BN bitfield. Unknown bits in a BN input are masked off.
   */
  constructor(input: string | BN) {
    if (typeof input !== 'string') {
      this.bitfield = input.and(PermissionedOp.allValidBN());
      return;
    }
    const normalized = input.trim().toUpperCase();
    if (normalized === '' || normalized === PermissionedOp.empty().toString()) {
      this.bitfield = PermissionedOp.NONE;
      return;
    }
    let bits = new BN(0);
    normalized.split('|').forEach((operation) => {
      bits = bits.or(PermissionedOp.toBitMask(operation.trim()));
    });
    this.bitfield = bits;
  }

  /**
   * Underlying bitfield as a BN.
   */
  toBN(): BN {
    return this.bitfield;
  }

  /**
   * Human-readable form, e.g. "DEPOSIT|BORROW", or "NONE" when the bitfield is zero.
   */
  toString(): string {
    const operations: string[] = [];
    for (const [operation, bitIndex] of PermissionedOp.BIT_INDEX_MAP.entries()) {
      const mask = new BN(1).shln(bitIndex);
      if (!this.bitfield.and(mask).isZero()) {
        operations.push(operation);
      }
    }
    return operations.length > 0 ? operations.join('|') : 'NONE';
  }

  /** True if this PermissionedOp has the same bitfield as `other`. */
  equals(other: PermissionedOp): boolean {
    return this.bitfield.eq(other.bitfield);
  }

  /** True if this PermissionedOp has no flags set. */
  isEmpty(): boolean {
    return this.equals(PermissionedOp.empty());
  }

  /**
   * Returns true if any bit set in `other` is also set in this bitfield.
   */
  intersects(other: PermissionedOp): boolean {
    return !this.bitfield.and(other.bitfield).isZero();
  }
}
