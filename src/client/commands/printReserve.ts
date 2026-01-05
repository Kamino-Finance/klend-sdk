import { getProgramId } from '../../utils';
import { getMarket } from '../services/market';
import { address, Rpc, SolanaRpcApi } from '@solana/kit';

export async function printReserve(rpc: Rpc<SolanaRpcApi>, reserve?: string, symbol?: string): Promise<void> {
  const programId = getProgramId('staging');
  const kaminoMarket = await getMarket(rpc, programId);
  const result = reserve
    ? kaminoMarket.getReserveByAddress(address(reserve))
    : kaminoMarket.getReserveBySymbol(symbol!);
  console.log(result);
  console.log(result?.stats?.reserveDepositLimit.toString());
}
