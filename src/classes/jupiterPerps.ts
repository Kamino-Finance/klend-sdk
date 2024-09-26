import { Connection, PublicKey } from '@solana/web3.js';
import { Pool } from '../idl_codegen_jupiter_perps/accounts/Pool';

export async function getJLPApr(connection: Connection, poolAddress: PublicKey): Promise<number> {
  const jlpPool = await Pool.fetch(connection, poolAddress);

  if (!jlpPool) {
    throw new Error('JLP pool not found');
  }

  const poolApr = jlpPool.poolApr;

  return poolApr.feeAprBps.toNumber() / 100;
}
