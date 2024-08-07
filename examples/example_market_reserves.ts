import { getConnection } from './utils/connection';
import { MAIN_MARKET } from './utils/constants';
import { getMarket } from './utils/helpers';

(async () => {
  const connection = getConnection();
  const market = await getMarket({ connection, marketPubkey: MAIN_MARKET });
  const reserves = market.getReserves();
  console.log(
    `found market ${MAIN_MARKET.toString()} reserves:\n\n${reserves.map((x) => x.address.toString()).join('\n')}`
  );
})().catch(async (e) => {
  console.error(e);
});
