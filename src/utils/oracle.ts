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

export type ScopePriceRefreshConfig = {
  scope: Scope;
  scopeConfigurations: [Address, Configuration][];
};

export function getTokenOracleDataSync(allOracleAccounts: AllOracleAccounts, reserves: ReserveWithAddress[]) {
  const tokenOracleDataForReserves: Array<[Reserve, TokenOracleData | undefined]> = [];
  const pythCache = new Map<Address, PythPrices>();
  const switchboardCache = new Map<Address, CandidatePrice>();
  const scopeCache = new Map<Address, OraclePrices>();
  for (const { address, state: reserve } of reserves) {
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
      const switchboardPrice = cacheOrGetSwitchboardPrice(
        oracle.switchboardFeedAddress,
        switchboardCache,
        allOracleAccounts
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
      const reserveSymbol = parseTokenSymbol(reserve.config.tokenInfo.name);
      console.error(
        `No price found for reserve: ${reserveSymbol ?? 'unknown'} (${address}) in market: ${reserve.lendingMarket}`
      );
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

// TODO: Add freshness of the latest price to match sc logic
export async function getTokenOracleData(
  rpc: Rpc<GetMultipleAccountsApi>,
  reserves: ReserveWithAddress[],
  oracleAccounts?: AllOracleAccounts
): Promise<Array<[Reserve, TokenOracleData | undefined]>> {
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
        console.error('Unrecognized switchboard owner address: ', info.programAddress);
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
  oracle: Address,
  scopeCache: Map<Address, OraclePrices>,
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
    const owner = info.programAddress;
    if (owner === getScopeAddress()) {
      const prices = OraclePrices.decode(Buffer.from(info.data[0], 'base64'));
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
  const valid = scopePx.timestamp.gt('0'); // scope prices are pre-validated
  return {
    price: scopePx.price,
    timestamp: BigInt(scopePx.timestamp.toString()),
    valid,
  };
}
