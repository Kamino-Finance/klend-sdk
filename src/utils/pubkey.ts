import { PublicKey } from '@solana/web3.js';
import BN from 'bn.js';

export const NULL_PUBKEY = new PublicKey('nu11111111111111111111111111111111111111111');
export const COMPUTE_BUDGET_PROGRAM_ID = new PublicKey('ComputeBudget111111111111111111111111111111');

/**
 * Helper function to check if a configured pubkey is null or default.
 * @param pubkey
 * @returns {boolean}
 */
export function isNotNullPubkey(pubkey: PublicKey): boolean {
  return pubkey && !pubkey.equals(NULL_PUBKEY) && !pubkey.equals(PublicKey.default);
}

/**
 * Custom set implementation for PublicKey
 * Calling toString() on a PublicKey is pretty slow and pubkeys do not support `SameValueZero` comparison, so we use a custom set implementation where keys are compared with `PublicKey.equals(PublicKey)`
 */
export class PublicKeySet<T extends PublicKey> {
  private items: T[] = [];

  constructor(items: Array<T>) {
    items.forEach((item) => this.add(item));
  }

  add(item: T): void {
    if (!this.contains(item)) {
      this.items.push(item);
    }
  }

  contains(item: T): boolean {
    return this.items.some((existingItem) => this.equals(existingItem, item));
  }

  private equals(item1: T, item2: T): boolean {
    return item1.equals(item2);
  }

  isEmpty(): boolean {
    return this.items.length === 0;
  }

  toArray(): T[] {
    return this.items.slice(); // Return a copy of the array to prevent external modifications
  }
}

/**
 * Custom map implementation for PublicKey, backed by a list for o(n) lookup speed
 * Calling toString() on a PublicKey is pretty slow and pubkeys do not support `SameValueZero` comparison, so we use a custom map implementation where keys are compared with `PublicKey.equals(PublicKey)`
 */
export class PublicKeyMap<K extends PublicKey, V> {
  private record: { key: K; value: V }[] = [];

  set(key: K, value: V): void {
    const index = this.findIndex(key);
    if (index !== -1) {
      // Update existing entry
      this.record[index].value = value;
    } else {
      // Add new entry
      this.record.push({ key, value });
    }
  }

  get(key: K): V | undefined {
    const index = this.findIndex(key);
    return index !== -1 ? this.record[index].value : undefined;
  }

  has(key: K): boolean {
    return this.findIndex(key) !== -1;
  }

  delete(key: K): void {
    const index = this.findIndex(key);
    if (index !== -1) {
      this.record.splice(index, 1);
    }
  }

  private findIndex(key: K): number {
    return this.record.findIndex((entry) => entry.key.equals(key));
  }

  clear(): void {
    this.record = [];
  }

  forEach(callback: (value: V, key: K) => void): void {
    this.record.forEach((entry) => {
      callback(entry.value, entry.key);
    });
  }

  keys(): K[] {
    return this.record.map((entry) => entry.key);
  }

  values(): V[] {
    return this.record.map((entry) => entry.value);
  }

  entries(): [K, V][] {
    return this.record.map((entry) => [entry.key, entry.value]);
  }

  isEmpty(): boolean {
    return this.record.length === 0;
  }
}

/**
 * Custom map implementation for PublicKey, backed by a hashmap for o(1) lookup speed
 * Calling toString() on a PublicKey is pretty slow and pubkeys do not support `SameValueZero` comparison, so we use a custom map implementation where keys are compared with `PublicKey.equals(PublicKey)`, and a hash is derived from the final 32 bits of the public key
 */
export class PubkeyHashMap<K extends PublicKey, V> implements Map<K, V> {
  private buckets: Map<
    number,
    {
      key: K;
      value: V;
    }[]
  >;
  size: number;

  constructor(entries?: readonly (readonly [K, V])[] | null) {
    this.buckets = new Map();
    this.size = 0;
    if (entries) {
      for (const [key, value] of entries) {
        this.set(key, value);
      }
    }
  }

  *[Symbol.iterator](): IterableIterator<[K, V]> {
    for (const [, bucket] of this.buckets) {
      for (const { key, value } of bucket) {
        yield [key, value];
      }
    }
  }

  [Symbol.toStringTag]: string = 'PubkeyHashMap';

  set(key: K, value: V): this {
    const hash = new HashablePublicKey(key).hashCode();
    const bucket = this.buckets.get(hash);
    if (!bucket) {
      this.buckets.set(hash, [{ key, value }]);
      this.size++;
    } else {
      const entry = bucket.find((entry) => entry.key.equals(key));
      if (entry) {
        entry.value = value;
      } else {
        bucket.push({ key, value });
        this.size++;
      }
    }
    return this;
  }

  get(key: K): V | undefined {
    const hash = new HashablePublicKey(key).hashCode();
    const bucket = this.buckets.get(hash);
    if (!bucket) {
      return undefined;
    }
    const entry = bucket.find((entry) => entry.key.equals(key));
    return entry ? entry.value : undefined;
  }

  has(key: K): boolean {
    const hash = new HashablePublicKey(key).hashCode();
    const bucket = this.buckets.get(hash);
    if (!bucket) {
      return false;
    }
    const entry = bucket.find((entry) => entry.key.equals(key));
    return !!entry;
  }

  delete(key: K): boolean {
    const hash = new HashablePublicKey(key).hashCode();
    const bucket = this.buckets.get(hash);
    if (!bucket) {
      return false;
    }
    const index = bucket.findIndex((entry) => entry.key.equals(key));
    if (index === -1) {
      return false;
    }
    bucket.splice(index, 1);
    if (bucket.length === 0) {
      this.buckets.delete(hash);
    }
    this.size--;
    return true;
  }

  clear(): void {
    this.buckets = new Map();
    this.size = 0;
  }

  isEmpty(): boolean {
    return this.size === 0;
  }

  forEach(callbackfn: (value: V, key: K, map: Map<K, V>) => void, thisArg?: any): void {
    this.buckets.forEach((bucket) => {
      bucket.forEach((entry) => {
        callbackfn(entry.value, entry.key, this);
      }, thisArg);
    }, thisArg);
  }

  *keys(): IterableIterator<K> {
    for (const [key] of this) {
      yield key;
    }
  }

  *values(): IterableIterator<V> {
    for (const [, value] of this) {
      yield value;
    }
  }

  entries(): IterableIterator<[K, V]> {
    return this[Symbol.iterator]();
  }
}

export class HashablePublicKey extends PublicKey implements IEquality<HashablePublicKey> {
  // We only use the last 32 bits of the public key for hashing
  static MASK = new BN(1).shln(32).subn(1);
  constructor(value: PublicKey | string | Buffer | Uint8Array | Array<number>) {
    super(value);
  }

  hashCode(): number {
    let hash = 13;
    hash = hash * 7 + this.getBN().clone().iuand(HashablePublicKey.MASK).toNumber();
    return hash;
  }

  private getBN(): BN {
    //@ts-ignore
    return this._bn;
  }
}

interface IEquality<T extends IEquality<T>> {
  equals(other: T): boolean;
  hashCode(): number;
}
