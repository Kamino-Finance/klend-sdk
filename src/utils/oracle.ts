import { Account, address, Address, Base64EncodedDataResponse, GetMultipleAccountsApi, Rpc } from '@solana/kit';
import Decimal from 'decimal.js';
import { Scope } from '@kamino-finance/scope-sdk';
import { OraclePrices } from '@kamino-finance/scope-sdk/dist/@codegen/scope/accounts/OraclePrices';
import { isNotNullPubkey } from './pubkey';
import { parseTokenSymbol, ReserveWithAddress } from '../classes';
import { Reserve } from '../lib';
import { batchFetch } from '@kamino-finance/kliquidity-sdk';
import BN from 'bn.js';
import { priceUpdateV2 } from '../@codegen/pyth_rec/accounts';
import { AggregatorAccountData } from '../@codegen/switchboard_v2/accounts';
import { ScopeConfiguration } from '../@codegen/klend/types';
import { Fraction } from '../classes/fraction';
import { Buffer } from 'buffer';
import { getLatestAggregatorValue } from './switchboard';
import { PROGRAM_ID as SWITCHBOARD_V2_PROGRAM_ID } from '../@codegen/switchboard_v2/programId';
import { Configuration } from '@kamino-finance/scope-sdk/dist/@codegen/scope/accounts/Configuration';

// validate price confidence - confidence/price ratio should be less than 2%
export const MAX_CONFIDENCE_PERCENTAGE: Decimal = new Decimal('2');

/// Confidence factor is used to scale the confidence value to a value that can be compared to the price.
export const CONFIDENCE_FACTOR: Decimal = new Decimal('100').div(MAX_CONFIDENCE_PERCENTAGE);

const getScopeAddress = () => {
  return address('HFn8GnPADiny6XqUoWE8uRPPxb29ikn4yTuPa9MF2fWJ');
};

export type TokenOracleData = {
  mintAddress: Address;
  decimals: Decimal;
  price: Decimal;
  timestamp: bigint;
  valid: boolean;
};

export type CandidatePrice = {
  price: Decimal;
  timestamp: bigint;
  valid: boolean;
};

/**
 * A single price source's readings: the spot price, and - when the source has one configured - its twap.
 */
export type CandidateFeed = {
  spot: CandidatePrice;
  twap?: CandidatePrice;
};

export type ScopePriceRefreshConfig = {
  scope: Scope;
  scopeConfigurations: [Address, Configuration][];
};

export function hasOracleConfigured(reserve: Reserve): boolean {
  const scopeConfiguration = reserve.config.tokenInfo.scopeConfiguration;
  return (
    isNotNullPubkey(reserve.config.tokenInfo.pythConfiguration.price) ||
    isNotNullPubkey(reserve.config.tokenInfo.switchboardConfiguration.priceAggregator) ||
    (isNotNullPubkey(scopeConfiguration.priceFeed) && Scope.isScopeChainValid(scopeConfiguration.priceChain))
  );
}

export function getUnconfiguredOracleReserveMessage(reserveAddress: Address, reserve: Reserve): string {
  return `${parseTokenSymbol(reserve.config.tokenInfo.name) || 'unknown'} (${reserveAddress}) reserve in market ${
    reserve.lendingMarket
  }: reserve has no oracle configured`;
}

export function getTokenOracleDataSync(
  allOracleAccounts: AllOracleAccounts,
  reserves: ReserveWithAddress[]
): Array<[ReserveWithAddress, TokenOracleData | undefined]> {
  const tokenOracleDataForReserves: Array<[ReserveWithAddress, TokenOracleData | undefined]> = [];
  const pythCache = new Map<Address, PythPrices>();
  const switchboardCache = new Map<Address, CandidatePrice>();
  const scopeCache = new Map<Address, OraclePrices>();
  for (const reserveWithAddress of reserves) {
    const { address, state: reserve } = reserveWithAddress;
    const tokenInfo = reserve.config.tokenInfo;
    const twapEnabled = tokenInfo.maxTwapDivergenceBps.gtn(0);
    const oracle = {
      pythAddress: tokenInfo.pythConfiguration.price,
      switchboardFeedAddress: tokenInfo.switchboardConfiguration.priceAggregator,
      switchboardTwapAddress: tokenInfo.switchboardConfiguration.twapAggregator,
      scopeOracleAddress: tokenInfo.scopeConfiguration.priceFeed,
    };
    const feeds: CandidateFeed[] = [];
    if (isNotNullPubkey(oracle.pythAddress)) {
      const pythPrices = cacheOrGetPythPrices(oracle.pythAddress, pythCache, allOracleAccounts);
      if (pythPrices && pythPrices.spot) {
        feeds.push({ spot: pythPrices.spot, twap: pythPrices.twap });
      }
    }
    if (isNotNullPubkey(oracle.switchboardFeedAddress)) {
      const switchboardFeed = getSwitchboardFeed(
        oracle.switchboardFeedAddress,
        // The program reads the twap feed only when the twap check is enabled for the token:
        twapEnabled ? oracle.switchboardTwapAddress : undefined,
        switchboardCache,
        allOracleAccounts
      );
      if (switchboardFeed) {
        feeds.push(switchboardFeed);
      }
    }

    if (isNotNullPubkey(oracle.scopeOracleAddress)) {
      const scopeFeed = cacheOrGetScopeFeed(
        oracle.scopeOracleAddress,
        scopeCache,
        allOracleAccounts,
        tokenInfo.scopeConfiguration
      );
      if (scopeFeed) {
        feeds.push(scopeFeed);
      }
    }

    let currentBest = selectBestOracleCandidate(feeds, twapEnabled);
    if (currentBest === undefined && feeds.length > 0) {
      // Every configured feed produced only zeroed readings - a refresh miss; keep the reserve's cached price,
      // like the program does. A wholly-missing feed set (`feeds` empty) stays an error for the caller, though.
      currentBest = cachedReservePriceCandidate(reserve);
    }

    if (!currentBest) {
      if (hasOracleConfigured(reserve)) {
        const reserveSymbol = parseTokenSymbol(reserve.config.tokenInfo.name);
        console.error(
          `No price found for reserve: ${reserveSymbol ?? 'unknown'} (${address}) in market: ${reserve.lendingMarket}`
        );
      }
      tokenOracleDataForReserves.push([reserveWithAddress, undefined]);
      continue;
    }
    const tokenOracleData: TokenOracleData = {
      mintAddress: reserve.liquidity.mintPubkey,
      decimals: Decimal.pow(10, reserve.liquidity.mintDecimals.toString()),
      price: new Decimal(currentBest.price),
      timestamp: currentBest.timestamp,
      valid: currentBest.valid,
    };
    tokenOracleDataForReserves.push([reserveWithAddress, tokenOracleData]);
  }
  return tokenOracleDataForReserves;
}

// TODO: Add freshness of the latest price to match sc logic
export async function getTokenOracleData(
  rpc: Rpc<GetMultipleAccountsApi>,
  reserves: ReserveWithAddress[],
  oracleAccounts?: AllOracleAccounts
): Promise<Array<[ReserveWithAddress, TokenOracleData | undefined]>> {
  const allOracleAccounts =
    oracleAccounts ??
    (await getAllOracleAccounts(
      rpc,
      reserves.map((r) => r.state)
    ));
  return getTokenOracleDataSync(allOracleAccounts, reserves);
}

export type AllOracleAccounts = Map<Address, Account<Base64EncodedDataResponse>>;

export async function getAllOracleAccounts(
  rpc: Rpc<GetMultipleAccountsApi>,
  reserves: Reserve[]
): Promise<AllOracleAccounts> {
  const allAccounts: Address[] = [];
  reserves.forEach((reserve) => {
    if (isNotNullPubkey(reserve.config.tokenInfo.pythConfiguration.price)) {
      allAccounts.push(reserve.config.tokenInfo.pythConfiguration.price);
    }
    if (isNotNullPubkey(reserve.config.tokenInfo.switchboardConfiguration.priceAggregator)) {
      allAccounts.push(reserve.config.tokenInfo.switchboardConfiguration.priceAggregator);
    }
    if (isNotNullPubkey(reserve.config.tokenInfo.switchboardConfiguration.twapAggregator)) {
      allAccounts.push(reserve.config.tokenInfo.switchboardConfiguration.twapAggregator);
    }
    if (isNotNullPubkey(reserve.config.tokenInfo.scopeConfiguration.priceFeed)) {
      allAccounts.push(reserve.config.tokenInfo.scopeConfiguration.priceFeed);
    }
  });
  const allAccountsDeduped = dedupKeys(allAccounts);
  const allAccs = await batchFetch(
    allAccountsDeduped,
    async (chunk) => (await rpc.getMultipleAccounts(chunk).send()).value
  );
  const allAccsMap = new Map<Address, Account<Base64EncodedDataResponse>>();
  allAccs.forEach((acc, i) => {
    if (acc !== null) {
      allAccsMap.set(allAccountsDeduped[i], { ...acc, programAddress: acc.owner, address: allAccountsDeduped[i] });
    }
  });
  return allAccsMap;
}

function dedupKeys(keys: Address[]): Address[] {
  return [...new Set<Address>(keys)];
}

export type PythPrices = {
  spot?: CandidatePrice;
  twap?: CandidatePrice;
};

/**
 * Get pyth price from cache or fetch if not available
 * @param oracle oracle address
 * @param cache pyth cache
 * @param oracleAccounts all oracle accounts
 */
export function cacheOrGetPythPrices(
  oracle: Address,
  cache: Map<Address, PythPrices>,
  oracleAccounts: AllOracleAccounts
): PythPrices | null {
  const prices: PythPrices = {};
  const cached = cache.get(oracle);
  if (cached) {
    return cached;
  } else {
    const result = oracleAccounts.get(oracle);
    if (result) {
      try {
        const { priceMessage } = priceUpdateV2.decode(Buffer.from(result.data[0], 'base64'));
        const { price, exponent, conf: confidence, publishTime: timestamp, emaPrice } = priceMessage;
        if (price) {
          const px = new Decimal(price.toString()).div(10 ** Math.abs(exponent));
          const conf = new Decimal(confidence.toString());
          prices.spot = {
            price: px,
            timestamp: BigInt(timestamp.toString()),
            valid: validatePythPx(px, conf),
          };
        }
        if (emaPrice !== undefined && emaPrice !== null) {
          const emaPx = new Decimal(emaPrice.toString()).div(10 ** Math.abs(exponent));
          prices.twap = {
            price: emaPx,
            timestamp: BigInt(timestamp.toString()),
            valid: true,
          };
        }
        if (prices.spot || prices.twap) {
          cache.set(oracle, prices);
        }
      } catch (error) {
        console.error(`Error parsing pyth price account ${oracle.toString()} data`, error);
        return null;
      }
    } else {
      return null;
    }
  }
  return prices;
}

/**
 * Get switchboard price from cache or fetch if not available
 * @param oracle oracle address
 * @param switchboardCache cache for oracle prices
 * @param oracleAccounts all oracle accounts
 */
export function cacheOrGetSwitchboardPrice(
  oracle: Address,
  switchboardCache: Map<Address, CandidatePrice>,
  oracleAccounts: AllOracleAccounts
): CandidatePrice | null {
  const cached = switchboardCache.get(oracle);
  if (cached) {
    return cached;
  } else {
    const info = oracleAccounts.get(oracle);
    if (info) {
      if (info.programAddress === SWITCHBOARD_V2_PROGRAM_ID) {
        const agg = AggregatorAccountData.decode(Buffer.from(info.data[0], 'base64'));
        const result = getLatestAggregatorValue(agg);
        if (result !== undefined && result !== null) {
          const latestRoundTimestamp: BN = agg.latestConfirmedRound.roundOpenTimestamp;
          const ts = BigInt(latestRoundTimestamp.toString());
          return switchboardValueToCandidate(new Decimal(result.toString()), ts, validateSwitchboardV2Px(agg));
        }
      } else {
        console.error('Unrecognized switchboard owner address: ', info.programAddress);
        return null;
      }
    }
  }
  return null;
}

/**
 * Interpret a raw Switchboard aggregator value as a price candidate.
 *
 * Like the program, a negative reading is rejected outright (the feed contributes nothing), while a zero reading is
 * kept as a parsed candidate - the zeroed-feed exclusion belongs to {@link selectBestOracleCandidate}.
 */
export function switchboardValueToCandidate(value: Decimal, timestamp: bigint, valid: boolean): CandidatePrice | null {
  if (value.isNegative()) {
    console.error('Switchboard oracle price is negative which is not allowed');
    return null;
  }
  return {
    price: value,
    timestamp,
    valid,
  };
}

/**
 * Read a Switchboard feed: the spot aggregator, and - when `twapOracle` is given (i.e. the twap check is enabled for
 * the token) - the twap aggregator next to it.
 *
 * Mirroring the program's `get_switchboard_price_and_twap()`: a failed spot read means no feed at all, and a fetched
 * twap account which fails to parse (e.g. a negative reading) drops the whole feed, while a twap account that was not
 * fetched at all just leaves the feed without a twap.
 */
function getSwitchboardFeed(
  spotOracle: Address,
  twapOracle: Address | undefined,
  switchboardCache: Map<Address, CandidatePrice>,
  oracleAccounts: AllOracleAccounts
): CandidateFeed | null {
  const spot = cacheOrGetSwitchboardPrice(spotOracle, switchboardCache, oracleAccounts);
  if (!spot) {
    return null;
  }
  if (twapOracle !== undefined && isNotNullPubkey(twapOracle) && oracleAccounts.has(twapOracle)) {
    const twap = cacheOrGetSwitchboardPrice(twapOracle, switchboardCache, oracleAccounts);
    if (!twap) {
      return null;
    }
    return { spot, twap };
  }
  return { spot };
}

/**
 * Get scope price from cache or fetch if not available
 * @param oracle oracle address
 * @param scopeCache cache for oracle prices
 * @param allOracleAccounts all oracle accounts
 * @param chain scope chain
 */
export function cacheOrGetScopePrice(
  oracle: Address,
  scopeCache: Map<Address, OraclePrices>,
  allOracleAccounts: AllOracleAccounts,
  chain: number[]
): CandidatePrice | null {
  if (!chain || !Scope.isScopeChainValid(chain)) {
    return null;
  }
  const scopePrices = cacheOrGetScopeOraclePrices(oracle, scopeCache, allOracleAccounts);
  if (!scopePrices) {
    return null;
  }
  return scopeChainToCandidatePrice(chain, scopePrices);
}

/**
 * Read a Scope feed: the spot price chain, and - when one is configured - the twap chain next to it.
 */
function cacheOrGetScopeFeed(
  oracle: Address,
  scopeCache: Map<Address, OraclePrices>,
  allOracleAccounts: AllOracleAccounts,
  scopeConfiguration: ScopeConfiguration
): CandidateFeed | null {
  if (!Scope.isScopeChainValid(scopeConfiguration.priceChain)) {
    return null;
  }
  const scopePrices = cacheOrGetScopeOraclePrices(oracle, scopeCache, allOracleAccounts);
  if (!scopePrices) {
    return null;
  }
  const spot = scopeChainToCandidatePrice(scopeConfiguration.priceChain, scopePrices);
  // The raw chain is evaluated as configured - 0 is a valid price ID and only `U16_MAX` marks unused links; the
  // validity check (not all-`U16_MAX`, not all-0) mirrors the program's `ScopeConfiguration::has_twap()`.
  const twap = Scope.isScopeChainValid(scopeConfiguration.twapChain)
    ? scopeChainToCandidatePrice(scopeConfiguration.twapChain, scopePrices)
    : undefined;
  return { spot, twap };
}

function cacheOrGetScopeOraclePrices(
  oracle: Address,
  scopeCache: Map<Address, OraclePrices>,
  allOracleAccounts: AllOracleAccounts
): OraclePrices | null {
  if (!isNotNullPubkey(oracle)) {
    return null;
  }
  const scopePrices = scopeCache.get(oracle);
  if (scopePrices) {
    return scopePrices;
  }
  const info = allOracleAccounts.get(oracle);
  if (info) {
    const owner = info.programAddress;
    if (owner === getScopeAddress()) {
      try {
        const prices = OraclePrices.decode(Buffer.from(info.data[0], 'base64'));
        scopeCache.set(oracle, prices);
        return prices;
      } catch (error) {
        console.debug(`Error parsing scope price account ${oracle.toString()} data`, error);
        return null;
      }
    } else {
      console.error('Unrecognized scope owner address: ', owner);
    }
  }

  return null;
}

/**
 * Select the price to use among the given sources' readings.
 *
 * This mirrors the program's `get_most_recent_price_and_twap()` (klend >= 1.25.0): a zeroed feed - a zero spot price,
 * or a zero reading on a *present* twap when the twap check is enabled - takes no part in the selection, so that it
 * cannot win over a healthy alternate source (while a twap missing altogether does not exclude its feed). Among the
 * remaining candidates, the freshest valid one wins. `undefined` means no healthy feed exists - on such a refresh
 * miss the program keeps the reserve's cached price, and so does the caller here (see `getTokenOracleDataSync()`).
 */
export function selectBestOracleCandidate(feeds: CandidateFeed[], twapEnabled: boolean): CandidatePrice | undefined {
  let currentBest: CandidatePrice | undefined = undefined;
  for (const feed of feeds) {
    if (isSpotOrTwapZeroed(feed, twapEnabled)) {
      continue;
    }
    currentBest = getBestPrice(currentBest, feed.spot);
  }
  return currentBest;
}

/**
 * The reserve's cached price (the one refreshed on-chain by the last successful `refresh_reserve`), as a price
 * candidate: the program keeps using it when every configured feed is zeroed, so the SDK does the same. It is zero
 * only for a reserve which was never refreshed with a live price (e.g. right after `init_reserve`, before its
 * Scope-computed feed's first crank) - flagged invalid then, since the program would refuse to *use* a zero price.
 */
function cachedReservePriceCandidate(reserve: Reserve): CandidatePrice {
  const cachedPrice = new Fraction(reserve.liquidity.marketPriceSf).toDecimal();
  return {
    price: cachedPrice,
    timestamp: BigInt(reserve.liquidity.marketPriceLastUpdatedTs.toString()),
    valid: !cachedPrice.isZero(),
  };
}

/**
 * Whether the feed's spot price, or its twap when one is required, is zeroed - the program's `is_spot_or_twap_zeroed()`.
 */
function isSpotOrTwapZeroed(feed: CandidateFeed, twapEnabled: boolean): boolean {
  return feed.spot.price.isZero() || (twapEnabled && feed.twap !== undefined && feed.twap.price.isZero());
}

function getBestPrice(current: CandidatePrice | undefined, next: CandidatePrice): CandidatePrice | undefined {
  if (isBetterPrice(current, next)) {
    return next;
  }
  return current;
}

function isBetterPrice(current: CandidatePrice | undefined, next: CandidatePrice): boolean {
  if (!current) {
    return true;
  }
  if (current.valid && !next.valid) {
    return false;
  }
  if (!current.valid && next.valid) {
    return true;
  }
  return next.timestamp > current.timestamp;
}

function validatePythPx(price: Decimal, confidence: Decimal): boolean {
  const conf50x = confidence.mul(CONFIDENCE_FACTOR);
  return !price.isZero() && price.gt(conf50x);
}

function validateSwitchboardV2Px(agg: AggregatorAccountData): boolean {
  const pxMantissa = new Decimal(agg.latestConfirmedRound.result.mantissa.toString());
  const pxScale = new Decimal(agg.latestConfirmedRound.result.scale.toString());
  const stDevMantissa = new Decimal(agg.latestConfirmedRound.stdDeviation.mantissa.toString());
  const stDevScale = new Decimal(agg.latestConfirmedRound.stdDeviation.scale.toString());
  let conf50xScaled: Decimal;
  if (pxScale.gte(stDevScale)) {
    const scalingFactor = pxScale.sub(stDevScale);
    const conf50x = stDevMantissa.mul(CONFIDENCE_FACTOR);
    conf50xScaled = conf50x.mul(scalingFactor);
  } else {
    const scalingFactor = stDevScale.sub(pxScale);
    const conf50x = stDevMantissa.mul(CONFIDENCE_FACTOR);
    conf50xScaled = conf50x.div(scalingFactor);
  }
  return conf50xScaled.gte(pxMantissa);
}

function scopeChainToCandidatePrice(chain: number[], prices: OraclePrices): CandidatePrice {
  const scopePx = Scope.getPriceFromScopeChain(chain, prices);
  // Scope prices are pre-validated; a zeroed reading (e.g. a zero link anywhere in the chain zeroing the whole
  // product) is instead excluded from the selection by `selectBestOracleCandidate()`, like the program does.
  const valid = scopePx.timestamp.gt('0');
  return {
    price: scopePx.price,
    timestamp: BigInt(scopePx.timestamp.toString()),
    valid,
  };
}
