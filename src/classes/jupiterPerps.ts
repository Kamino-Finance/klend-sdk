import { Rpc, Address, GetAccountInfoApi } from '@solana/kit';
import { Pool } from '../@codegen/jupiter_perps/accounts/Pool';

export async function getJLPApr(connection: Rpc<GetAccountInfoApi>, poolAddress: Address): Promise<number> {
  const jlpPool = await Pool.fetch(connection, poolAddress);

  if (!jlpPool) {
    throw new Error('JLP pool not found');
  }

  const poolApr = jlpPool.poolApr;

  return poolApr.feeAprBps.toNumber() / 100;
}
