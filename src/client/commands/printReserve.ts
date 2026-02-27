import { getMarket } from '../services/market';
import { address, Address, Rpc, SolanaRpcApi } from '@solana/kit';

export async function printReserve(
  rpc: Rpc<SolanaRpcApi>,
  marketAddress: Address,
  programId: Address,
  reserve?: string,
  symbol?: string
): Promise<void> {
  const kaminoMarket = await getMarket(rpc, marketAddress, programId);
  const result = reserve
    ? kaminoMarket.getReserveByAddress(address(reserve))
    : kaminoMarket.getReserveBySymbol(symbol!);
  console.log(result);
  console.log(result?.stats?.reserveDepositLimit.toString());
}
