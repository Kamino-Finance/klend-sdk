import { ReserveHistoryArgs, ReserveHistoryResponse } from './utils/models';
import axios from 'axios';
import { getConnection } from './utils/connection';
import { MAIN_MARKET, PYUSD_RESERVE } from './utils/constants';
import { getReserveApy } from './example_reserve_apy';

/**
 * Fetch supply/borrow APY history of a reserve
 */
export async function getReserveApyHistory({ marketPubkey, reservePubkey, start, end }: ReserveHistoryArgs) {
  const baseURL = `https://api.kamino.finance/kamino-market/${marketPubkey.toString()}/reserves/${reservePubkey.toString()}/metrics/history`;

  const params = {
    env: 'mainnet-beta',
    start: start.toISOString(),
    end: end.toISOString(),
    frequency: 'day',
  };

  const config = {
    method: 'get',
    maxBodyLength: Infinity,
    url: baseURL,
    headers: { 'User-Agent': 'node-fetch' },
    params: params,
  };

  const response = await axios.request<ReserveHistoryResponse>(config);
  return response.data.history.map((x) => ({
    timestamp: new Date(x.timestamp),
    borrowApy: x.metrics.borrowInterestAPY,
    supplyApy: x.metrics.supplyInterestAPY,
  }));
}

(async () => {
  console.log(`fetching historical reserve (${PYUSD_RESERVE}) APY for July 2024`);
  const history = await getReserveApyHistory({
    marketPubkey: MAIN_MARKET,
    reservePubkey: PYUSD_RESERVE,
    start: new Date('2024-07-01T00:00Z'),
    end: new Date('2024-08-01T00:00Z'),
  });
  for (const { borrowApy, supplyApy, timestamp } of history) {
    console.log('timestamp:', timestamp.toISOString(), `borrow APY:`, borrowApy, 'supply APY:', supplyApy);
  }
})().catch(async (e) => {
  console.error(e);
});
