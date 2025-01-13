import { pubkeyHashMapToJson } from './utils';
import { VaultHoldings } from './vault';

export function holdingsToJson(holdings: VaultHoldings) {
  return {
    available: holdings.available.toString(),
    invested: holdings.invested.toString(),
    total: holdings.total.toString(),
    investedInReserves: pubkeyHashMapToJson(holdings.investedInReserves),
  };
}

export function printHoldings(holdings: VaultHoldings) {
  console.log('Holdings:');
  console.log('  Available:', holdings.available.toString());
  console.log('  Invested:', holdings.invested.toString());
  console.log('  Total:', holdings.total.toString());
  console.log('  Invested in reserves:', pubkeyHashMapToJson(holdings.investedInReserves));
}
