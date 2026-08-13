import { Address, GetMultipleAccountsApi, Rpc } from '@solana/kit';
import { LendingMarket } from '../@codegen/klend/accounts';
import { PROGRAM_ID } from '../@codegen/klend/programId';

/**
 * Fetches each distinct lending market once and returns its `LendingMarket::reserveRewardsMaxAprBps`,
 * keyed by market address, so that reserve loading can stamp the market-level rewards cap onto every
 * `KaminoReserve` it builds.
 *
 * Throws if any of the market accounts does not exist.
 */
export async function fetchReserveRewardsMaxAprBpsByMarket(
  rpc: Rpc<GetMultipleAccountsApi>,
  lendingMarkets: Iterable<Address>,
  programId: Address = PROGRAM_ID
): Promise<Map<Address, number>> {
  const marketAddresses = [...new Set(lendingMarkets)];
  const result = new Map<Address, number>();
  if (marketAddresses.length === 0) {
    return result;
  }
  const markets = await LendingMarket.fetchMultiple(rpc, marketAddresses, programId);
  for (let i = 0; i < marketAddresses.length; i++) {
    const market = markets[i];
    if (market === null) {
      throw new Error(`Lending market account ${marketAddresses[i]} does not exist`);
    }
    result.set(marketAddresses[i], market.reserveRewardsMaxAprBps);
  }
  return result;
}

/** Single-market convenience over {@link fetchReserveRewardsMaxAprBpsByMarket}. */
export async function fetchReserveRewardsMaxAprBps(
  rpc: Rpc<GetMultipleAccountsApi>,
  lendingMarket: Address,
  programId: Address = PROGRAM_ID
): Promise<number> {
  const byMarket = await fetchReserveRewardsMaxAprBpsByMarket(rpc, [lendingMarket], programId);
  return byMarket.get(lendingMarket)!;
}
