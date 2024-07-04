import { parsePriceData } from '@pythnetwork/client';
import { AccountInfo, Connection, PublicKey } from '@solana/web3.js';
import Decimal from 'decimal.js';
// eslint-disable-next-line import/no-extraneous-dependencies
import { OraclePrices, Scope } from '@hubbleprotocol/scope-sdk';
import { isNotNullPubkey, PubkeyHashMap, PublicKeySet } from './pubkey';
import { parseTokenSymbol } from '../classes';
import SwitchboardProgram from '@switchboard-xyz/sbv2-lite';
import { Reserve } from '../lib';
import { batchFetch } from '@hubbleprotocol/kamino-sdk';
import BN from 'bn.js';

const SWITCHBOARD_V2_PROGRAM_ID = new PublicKey('SW1TCH7qEPTdLsDHRgPuMQjbQxKdH2aBStViMFnt64f');

// validate price confidence - confidence/price ratio should be less than 2%
export const MAX_CONFIDENCE_PERCENTAGE: Decimal = new Decimal('2');

/// Confidence factor is used to scale the confidence value to a value that can be compared to the price.
export const CONFIDENCE_FACTOR: Decimal = new Decimal('100').div(MAX_CONFIDENCE_PERCENTAGE);

const getScopeAddress = () => {
  return 'HFn8GnPADiny6XqUoWE8uRPPxb29ikn4yTuPa9MF2fWJ';
};

export type TokenOracleData = {
  mintAddress: PublicKey;
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

export type ScopeRefresh = {
  includeScopeRefresh: boolean;
  scopeFeed: string;
};

// TODO: Add freshness of the latest price to match sc logic
export async function getTokenOracleData(
  connection: Connection,
  reserves: Reserve[]
): Promise<Array<[Reserve, TokenOracleData | undefined]>> {
  const allOracleAccounts = await getAllOracleAccounts(connection, reserves);
  const tokenOracleDataForReserves: Array<[Reserve, TokenOracleData | undefined]> = [];
  const pythCache = new PubkeyHashMap<PublicKey, PythPrices>();
  const switchboardCache = new PubkeyHashMap<PublicKey, CandidatePrice>();
  const scopeCache = new PubkeyHashMap<PublicKey, OraclePrices>();
  let switchboardV2: SwitchboardProgram | undefined;
  for (const reserve of reserves) {
    let currentBest: CandidatePrice | undefined = undefined;
    const oracle = {
      pythAddress: reserve.config.tokenInfo.pythConfiguration.price,
      switchboardFeedAddress: reserve.config.tokenInfo.switchboardConfiguration.priceAggregator,
      switchboardTwapAddress: reserve.config.tokenInfo.switchboardConfiguration.twapAggregator,
      scopeOracleAddress: reserve.config.tokenInfo.scopeConfiguration.priceFeed,
    };
    if (isNotNullPubkey(oracle.pythAddress)) {
      const pythPrices = cacheOrGetPythPrices(oracle.pythAddress, pythCache, allOracleAccounts);
      if (pythPrices && pythPrices.spot) {
        currentBest = getBestPrice(currentBest, pythPrices.spot);
      }
    }
    if (isNotNullPubkey(oracle.switchboardFeedAddress)) {
      if (!switchboardV2) {
        switchboardV2 = await SwitchboardProgram.loadMainnet(connection);
      }
      const switchboardPrice = cacheOrGetSwitchboardPrice(
        oracle.switchboardFeedAddress,
        switchboardCache,
        allOracleAccounts,
        switchboardV2
      );
      if (switchboardPrice) {
        currentBest = getBestPrice(currentBest, switchboardPrice);
      }
    }

    if (isNotNullPubkey(oracle.scopeOracleAddress)) {
      const scopePrice = cacheOrGetScopePrice(
        oracle.scopeOracleAddress,
        scopeCache,
        allOracleAccounts,
        reserve.config.tokenInfo.scopeConfiguration.priceChain
      );
      if (scopePrice) {
        currentBest = getBestPrice(currentBest, scopePrice);
      }
    }

    if (!currentBest) {
      console.error(`No price found for reserve: ${parseTokenSymbol(reserve.config.tokenInfo.name)}`);
      tokenOracleDataForReserves.push([reserve, undefined]);
      continue;
    }
    const tokenOracleData: TokenOracleData = {
      mintAddress: reserve.liquidity.mintPubkey,
      decimals: Decimal.pow(10, reserve.liquidity.mintDecimals.toString()),
      price: new Decimal(currentBest.price),
      timestamp: currentBest.timestamp,
      valid: currentBest.valid,
    };
    tokenOracleDataForReserves.push([reserve, tokenOracleData]);
  }
  return tokenOracleDataForReserves;
}

export type AllOracleAccounts = PubkeyHashMap<PublicKey, AccountInfo<Buffer>>;

export async function getAllOracleAccounts(connection: Connection, reserves: Reserve[]): Promise<AllOracleAccounts> {
  const allAccounts: PublicKey[] = [];
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
  const allAccs = await batchFetch(allAccountsDeduped, (chunk) => connection.getMultipleAccountsInfo(chunk));
  const allAccsMap = new PubkeyHashMap<PublicKey, AccountInfo<Buffer>>();
  allAccs.forEach((acc, i) => {
    if (acc) {
      allAccsMap.set(allAccountsDeduped[i], acc);
    }
  });
  return allAccsMap;
}

function dedupKeys(keys: PublicKey[]): PublicKey[] {
  return new PublicKeySet(keys).toArray();
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
  oracle: PublicKey,
  cache: Map<PublicKey, PythPrices>,
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
        const { price, timestamp, emaPrice, previousPrice, previousTimestamp, confidence } = parsePriceData(
          result.data
        );
        if (price) {
          const px = new Decimal(price);
          prices.spot = {
            price: px,
            timestamp,
            valid: validatePythPx(px, confidence),
          };
        } else {
          prices.spot = {
            price: new Decimal(previousPrice),
            timestamp: previousTimestamp,
            valid: false,
          };
        }
        if (emaPrice !== undefined && emaPrice !== null) {
          prices.twap = {
            price: new Decimal(emaPrice.value),
            timestamp,
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
 * @param switchboardV2 loaded switchboard program
 */
export function cacheOrGetSwitchboardPrice(
  oracle: PublicKey,
  switchboardCache: Map<PublicKey, CandidatePrice>,
  oracleAccounts: AllOracleAccounts,
  switchboardV2: SwitchboardProgram
): CandidatePrice | null {
  const cached = switchboardCache.get(oracle);
  if (cached) {
    return cached;
  } else {
    const info = oracleAccounts.get(oracle);
    if (info) {
      if (info.owner.equals(SWITCHBOARD_V2_PROGRAM_ID)) {
        const agg = switchboardV2.decodeAggregator(info!);
        // @ts-ignore
        const result: Big.Big | null = switchboardV2.getLatestAggregatorValue(agg);
        if (result !== undefined && result !== null) {
          const switchboardPx = new Decimal(result.toString());
          const latestRoundTimestamp: BN = agg.latestConfirmedRound.roundOpenTimestamp;
          const ts = BigInt(latestRoundTimestamp.toString());
          const valid = validateSwitchboardV2Px(agg);
          return {
            price: switchboardPx,
            timestamp: ts,
            valid,
          };
        }
      } else {
        console.error('Unrecognized switchboard owner address: ', info.owner.toString());
        return null;
      }
    }
  }
  return null;
}

/**
 * Get scope price from cache or fetch if not available
 * @param oracle oracle address
 * @param scopeCache cache for oracle prices
 * @param allOracleAccounts all oracle accounts
 * @param chain scope chain
 */
export function cacheOrGetScopePrice(
  oracle: PublicKey,
  scopeCache: Map<PublicKey, OraclePrices>,
  allOracleAccounts: AllOracleAccounts,
  chain: number[]
): CandidatePrice | null {
  if (!isNotNullPubkey(oracle) || !chain || !Scope.isScopeChainValid(chain)) {
    return null;
  }

  const scopePrices = scopeCache.get(oracle);
  if (scopePrices) {
    return scopeChainToCandidatePrice(chain, scopePrices);
  }
  const info = allOracleAccounts.get(oracle);
  if (info) {
    const owner = info.owner.toString();
    if (owner === getScopeAddress()) {
      const prices = OraclePrices.decode(info.data);
      scopeCache.set(oracle, prices);
      return scopeChainToCandidatePrice(chain, prices);
    } else {
      console.error('Unrecognized scope owner address: ', owner);
    }
  }

  return null;
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

function validatePythPx(price: Decimal, confidence: number | undefined): boolean {
  const conf50x = new Decimal(confidence || 0).mul(CONFIDENCE_FACTOR);
  return price.gt(conf50x);
}

function validateSwitchboardV2Px(agg: any): boolean {
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
  const valid = scopePx.timestamp.gt('0'); // scope prices are pre-validated
  return {
    price: scopePx.price,
    timestamp: BigInt(scopePx.timestamp.toString()),
    valid,
  };
}
