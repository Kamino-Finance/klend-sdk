import { address, Address, Rpc, SolanaRpcApi } from '@solana/kit';
import { STAGING_PROGRAM_ID } from '../../utils';
import { PROGRAM_ID } from '../../@codegen/klend/programId';
import { DEFAULT_RECENT_SLOT_DURATION_MS, KaminoMarket } from '../../classes';

export const STAGING_LENDING_MARKET: Address = address('6WVSwDQXrBZeQVnu6hpnsRZhodaJTZBUaC334SiiBKdb');
export const MAINNET_LENDING_MARKET: Address = address('7u3HeHxYDLhnCoErrtycNokbQYbWGzLs6JSDqGAv5PfF');

export async function getMarket(rpc: Rpc<SolanaRpcApi>, programId: Address) {
  let marketAddress: Address;
  if (programId === STAGING_PROGRAM_ID) {
    marketAddress = STAGING_LENDING_MARKET;
  } else if (programId === PROGRAM_ID) {
    marketAddress = MAINNET_LENDING_MARKET;
  } else {
    throw new Error(`Unknown program id: ${programId.toString()}`);
  }
  const kaminoMarket = await KaminoMarket.load(rpc, marketAddress, DEFAULT_RECENT_SLOT_DURATION_MS, programId);
  if (kaminoMarket === null) {
    throw new Error(`${programId.toString()} Kamino market ${marketAddress} not found`);
  }
  return kaminoMarket;
}
