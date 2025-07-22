import BN from 'bn.js';
import { getProgramId, VanillaObligation } from '../../utils';
import { getMarket, STAGING_LENDING_MARKET } from '../services/market';
import { KaminoAction } from '../../classes';
import { Scope } from '@kamino-finance/scope-sdk';
import { processTx } from '../tx/processor';
import { CliEnv, SendTxMode } from '../tx/CliEnv';

export async function repay(env: CliEnv, mode: SendTxMode, token: string, borrowAmount: BN): Promise<void> {
  const signer = await env.getSigner();
  const programId = getProgramId('staging');
  const kaminoMarket = await getMarket(env.c.rpc, programId);
  const scope = new Scope('mainnet-beta', env.c.rpc);
  const kaminoAction = await KaminoAction.buildRepayTxns(
    kaminoMarket,
    borrowAmount,
    kaminoMarket.getReserveBySymbol(token)!.getLiquidityMint(),
    signer,
    new VanillaObligation(STAGING_LENDING_MARKET),
    true,
    { scope, scopeConfigurations: await scope.getAllConfigurations() },
    await env.c.rpc.getSlot().send()
  );
  console.log('User obligation', await kaminoAction.getObligationPda());

  console.log('Repay SetupIxs:', kaminoAction.setupIxsLabels);
  console.log('Repay LendingIxs:', kaminoAction.lendingIxsLabels);
  console.log('Repay CleanupIxs:', kaminoAction.cleanupIxsLabels);
  await processTx(env.c, signer, KaminoAction.actionToIxs(kaminoAction), mode);
}
