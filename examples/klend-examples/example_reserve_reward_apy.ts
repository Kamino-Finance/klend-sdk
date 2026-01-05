import { loadReserveData } from '../utils/helpers';
import { getConnectionPool } from '../utils/connection';
import { MAIN_MARKET, PYUSD_MINT } from '../utils/constants';
import { Scope } from '@kamino-finance/scope-sdk/dist/Scope';
import { Address } from '@solana/kit';
import { OraclePrices } from '@kamino-finance/scope-sdk/dist/@codegen/scope/accounts/OraclePrices';

(async () => {
  const c = getConnectionPool();
  console.log(`fetching data for market ${MAIN_MARKET.toString()} reserve for ${PYUSD_MINT.toString()}`);
  const { market, reserve } = await loadReserveData({
    rpc: c.rpc,
    marketPubkey: MAIN_MARKET,
    mintPubkey: PYUSD_MINT,
  });
  const scope = new Scope('mainnet-beta', c.rpc);
  const oraclePrices = await scope.getMultipleOraclePrices(Array.from(market.scopeFeeds));
  const oraclePricesMap = new Map<Address, OraclePrices>();
  for (const [pubkey, oracle] of oraclePrices) {
    oraclePricesMap.set(pubkey, oracle);
  }
  const prices = await market.getAllScopePrices(scope, oraclePricesMap);
  const rewardApys = await reserve.getRewardYields(prices);
  for (const rewardApy of rewardApys) {
    console.log(
      `reward token ${rewardApy.rewardInfo.token.mint.toString()} APY`,
      rewardApy.apy.toNumber(),
      'APR',
      rewardApy.apr.toNumber()
    );
  }
})().catch(async (e) => {
  console.error(e);
});
