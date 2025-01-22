import { pubkeyHashMapToJson } from './utils';
import { VaultHoldings, VaultHoldingsWithUSDValue, VaultOverview } from './vault';

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

export function printHoldingsWithUSDValue(holdings: VaultHoldingsWithUSDValue) {
  console.log('Holdings with USD value:');
  console.log('  Available:', holdings.availableUSD.toString());
  console.log('  Invested:', holdings.investedUSD.toString());
  console.log('  Total:', holdings.totalUSD.toString());
  console.log('  Invested in reserves:', pubkeyHashMapToJson(holdings.investedInReservesUSD));
}

export function printVaultOverview(vaultOverview: VaultOverview) {
  console.log('Vault overview:');
  printHoldingsWithUSDValue(vaultOverview.holdingsUSD);
  console.log('  Theoretical Supply APY:', vaultOverview.theoreticalSupplyAPY.toString());
  console.log('  Utilization ratio:', vaultOverview.utilizationRatio.toString());
  console.log('  Total supplied:', vaultOverview.totalSupplied.toString());
  console.log('  Borrowed amount:', vaultOverview.totalBorrowed.toString());

  vaultOverview.reservesOverview.forEach((reserveOverview, pubkey) => {
    console.log('  Reserve:', pubkey.toString());
    console.log('    Total borrowed from reserve:', reserveOverview.totalBorrowedAmount.toString());
    console.log('    Supplied:', reserveOverview.suppliedAmount.toString());
    console.log('    Utilization ratio:', reserveOverview.utilizationRatio.toString());
    console.log('    Liquidation Threshold Pct:', reserveOverview.liquidationThresholdPct.toString());
    console.log('    Supply APY:', reserveOverview.supplyAPY.toString());
    console.log('    Lending market:', reserveOverview.market.toString());
  });
}
