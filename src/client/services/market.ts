import { Address, Rpc, SolanaRpcApi } from '@solana/kit';
import { DEFAULT_RECENT_SLOT_DURATION_MS, KaminoMarket } from '../../classes';

export async function getMarket(
  rpc: Rpc<SolanaRpcApi>,
  marketAddress: Address,
  programId: Address
) {
  const kaminoMarket = await KaminoMarket.load(rpc, marketAddress, DEFAULT_RECENT_SLOT_DURATION_MS, programId);
  if (kaminoMarket === null) {
    throw new Error(`${programId.toString()} Kamino market ${marketAddress} not found`);
  }
  return kaminoMarket;
}
