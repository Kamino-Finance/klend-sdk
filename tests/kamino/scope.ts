import { OracleType, Scope, U16_MAX } from '@hubbleprotocol/scope-sdk';
import { PublicKey } from '@solana/web3.js';
import { StrategyWithAddress } from '@kamino-finance/kliquidity-sdk';
import Decimal from 'decimal.js';
import { getPriceAcc, Price, PriceFeed } from './price';
import { Env } from '../setup_utils';
import { isNotNullPubkey } from '../../src';

export async function crankAndFetchScopePrice(env: Env, scope: Scope, chain: number[]): Promise<Decimal> {
  const trimmed: number[] = [...chain];
  const start = trimmed.indexOf(U16_MAX);
  if (start !== -1) {
    trimmed.splice(start, trimmed.length - start);
  }
  const refreshTx = await scope.refreshPriceList(env.admin, { feed: env.testCase }, trimmed);
  console.log(`Refreshed scope price chain ${chain} with tx ${refreshTx}`);
  const padded = chain.concat(Array(4 - chain.length).fill(U16_MAX));
  const datedPrice = await scope.getPriceFromChain(padded, await scope.getOraclePrices({ feed: env.testCase }));
  return datedPrice.price;
}

export async function createScopeFeed(env: Env, scope: Scope): Promise<PublicKey> {
  const [txHash, { configuration, oraclePrices, oracleMappings }] = await scope.initialise(env.admin, env.testCase);
  console.log(
    `Created scope feed ${
      env.testCase
    }, config: ${configuration.toBase58()}, prices: ${oraclePrices.toBase58()}, mappings: ${oracleMappings.toBase58()} with tx ${txHash}`
  );
  return oraclePrices;
}

export async function addScopePriceMapping(env: Env, scope: Scope, token: string, price: Price): Promise<number[]> {
  const indexes = await scope.getOracleMappings({ feed: env.testCase });
  for (let i = 0; i < indexes.priceInfoAccounts.length; i += 1) {
    const value = indexes.priceInfoAccounts[i];
    if (!isNotNullPubkey(value)) {
      const priceAcc = getPriceAcc(price);
      console.log(
        `Setting scope price for ${token} at index ${i} with price ${priceAcc.price.toBase58()} ${priceAcc.type.kind}`
      );
      await scope.updateFeedMapping(env.admin, env.testCase, i, priceAcc.type, priceAcc.price);
      await scope.refreshPriceList(env.admin, { feed: env.testCase }, [i]);
      return [i];
    }
  }
  throw new Error(`No empty price info accounts found to set scope price for ${token}`);
}

export async function addKTokenScopePriceMapping(
  env: Env,
  scope: Scope,
  token: string,
  strategy: StrategyWithAddress
): Promise<PriceFeed> {
  const [config, configAccount] = await scope.getFeedConfiguration({ feed: env.testCase });
  const indexes = await scope.getOracleMappings({ config });
  for (let i = 0; i < indexes.priceInfoAccounts.length; i += 1) {
    const value = indexes.priceInfoAccounts[i];
    if (!isNotNullPubkey(value)) {
      console.log(`Setting scope price for ${token} kToken strategy ${strategy.address.toBase58()} at index ${i}`);
      try {
        await scope.updateFeedMapping(env.admin, env.testCase, i, new OracleType.KToken(), strategy.address);
        await scope.refreshPriceList(env.admin, { feed: env.testCase }, [i]);
      } catch (e) {
        console.error(e);
        throw e;
      }
      const prices = await scope.getOraclePrices({ feed: env.testCase });
      console.log(
        `Current price for ${token} kToken strategy ${strategy.address.toBase58()} at index ${i} is $${(
          await scope.getPriceFromChain([i], prices)
        ).price.toNumber()}`
      );
      return {
        type: new OracleType.KToken(),
        price: configAccount.oraclePrices,
        chain: [i].concat(Array(3).fill(U16_MAX)),
      };
    }
  }
  throw new Error(`No empty price info accounts found to set scope price for ${token}`);
}
