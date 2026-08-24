import { Address, Rpc, SolanaRpcApi } from '@solana/kit';
import { KaminoMarket } from '../../classes';

export async function getMarket(
  rpc: Rpc<SolanaRpcApi>,
  marketAddress: Address,
  programId: Address,
  recentSlotDurationMs: number
) {
  const kaminoMarket = await KaminoMarket.load(rpc, marketAddress, recentSlotDurationMs, programId);
  if (kaminoMarket === null) {
    throw new Error(`${programId.toString()} Kamino market ${marketAddress} not found`);
  }
  return kaminoMarket;
}
