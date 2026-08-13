import { CDN_ENDPOINT } from '../utils/constants';

/**
 * CDN data structure containing Kamino resources for different networks
 */
export interface AllKaminoCdnData {
  'mainnet-beta': KaminoCdnData;
  devnet: KaminoCdnData;
}

/**
 * Kamino CDN data structure
 * This type can be extended with additional fields as needed
 */
export interface KaminoCdnData {
  /**
   * List of deprecated reserve addresses (pubkeys as strings)
   * Note: This field is named 'deprecatedAssets' in the CDN but represents deprecated reserves
   */
  deprecatedAssets: string[];
  // Additional fields can be added here as they become relevant
  [key: string]: unknown;
}

export type CdnCluster = 'mainnet-beta' | 'devnet';

const DEFAULT_CDN_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

export interface KaminoCdnClientOptions {
  cluster?: CdnCluster;
  ttlMs?: number;
}

/**
 * Client for fetching and caching Kamino CDN resources.
 * Lazily loads data on first access. Concurrent calls share a single in-flight request.
 * Cached data expires after a configurable TTL (default 5 minutes).
 */
export class KaminoCdnClient {
  private data: KaminoCdnData | undefined;
  private loadedAt = 0;
  private loadPromise: Promise<void> | undefined;
  private readonly cluster: CdnCluster;
  private readonly ttlMs: number;

  constructor(options: KaminoCdnClientOptions = {}) {
    this.cluster = options.cluster ?? 'mainnet-beta';
    this.ttlMs = options.ttlMs ?? DEFAULT_CDN_CACHE_TTL_MS;
  }

  /** Returns the full CDN data for the configured cluster, lazily fetching if needed */
  async getData(): Promise<KaminoCdnData | undefined> {
    await this.ensureLoaded();
    return this.data;
  }

  /** Clears the cached data, forcing a fresh fetch on next access */
  clear(): void {
    this.data = undefined;
    this.loadedAt = 0;
    this.loadPromise = undefined;
  }

  private async ensureLoaded(): Promise<void> {
    if (this.data && Date.now() - this.loadedAt < this.ttlMs) return;
    if (this.loadPromise) {
      await this.loadPromise;
      return;
    }

    this.loadPromise = (async () => {
      try {
        const url = `${CDN_ENDPOINT}/resources.json`;
        const response = await fetch(url);
        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }
        const text = await response.text();
        const parsed: AllKaminoCdnData = JSON.parse(text);
        this.data = parsed[this.cluster];
        this.loadedAt = Date.now();
      } catch {
        // leave data as undefined, allow retry on next call
      } finally {
        this.loadPromise = undefined;
      }
    })();

    await this.loadPromise;
  }
}

/** Default shared client instance for mainnet-beta */
export const kaminoCdn = new KaminoCdnClient();
