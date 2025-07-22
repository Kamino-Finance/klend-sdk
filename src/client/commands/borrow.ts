import BN from 'bn.js';
import { getProgramId, VanillaObligation } from '../../utils';
import { getMarket, STAGING_LENDING_MARKET } from '../services/market';
import { KaminoAction } from '../../classes';
import { Scope } from '@kamino-finance/scope-sdk';
import { CliEnv, SendTxMode } from '../tx/CliEnv';
import { processTx } from '../tx/processor';

export async function borrow(env: CliEnv, mode: SendTxMode, token: string, borrowAmount: BN): Promise<void> {
  const signer = await env.getSigner();
  const programId = getProgramId('staging');
  const kaminoMarket = await getMarket(env.c.rpc, programId);
  const scope = new Scope('mainnet-beta', env.c.rpc);
  const kaminoAction = await KaminoAction.buildBorrowTxns(
    kaminoMarket,
    borrowAmount,
    kaminoMarket.getReserveBySymbol(token)!.getLiquidityMint(),
    signer,
    new VanillaObligation(STAGING_LENDING_MARKET),
    true,
    { scope, scopeConfigurations: await scope.getAllConfigurations() }
  );
  console.log('User obligation', await kaminoAction.getObligationPda());

  console.log('Borrow SetupIxs:', kaminoAction.setupIxsLabels);
  console.log('Borrow LendingIxs:', kaminoAction.lendingIxsLabels);
  console.log('Borrow CleanupIxs:', kaminoAction.cleanupIxsLabels);
  await processTx(env.c, signer, KaminoAction.actionToIxs(kaminoAction), mode);
}
