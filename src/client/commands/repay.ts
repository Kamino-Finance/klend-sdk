import BN from 'bn.js';
import { getProgramId, VanillaObligation } from '../../utils';
import { getMarket, STAGING_LENDING_MARKET } from '../services/market';
import { KaminoAction } from '../../classes';
import { Scope } from '@kamino-finance/scope-sdk';
import { processTx } from '../tx/processor';
import { CliEnv, SendTxMode } from '../tx/CliEnv';
import { address } from '@solana/kit';

export async function repay(env: CliEnv, mode: SendTxMode, reserveAddress: string, borrowAmount: BN): Promise<void> {
  const signer = await env.getSigner();
  const programId = getProgramId('staging');
  const kaminoMarket = await getMarket(env.c.rpc, programId);
  const scope = new Scope('mainnet-beta', env.c.rpc);
  const kaminoAction = await KaminoAction.buildRepayTxns({
    kaminoMarket,
    amount: borrowAmount,
    reserveAddress: address(reserveAddress),
    owner: signer,
    obligation: new VanillaObligation(STAGING_LENDING_MARKET),
    useV2Ixs: true,
    scopeRefreshConfig: { scope, scopeConfigurations: await scope.getAllConfigurations() },
    currentSlot: await env.c.rpc.getSlot().send(),
  });
  console.log('User obligation', await kaminoAction.getObligationPda());

  console.log('Repay SetupIxs:', kaminoAction.setupIxsLabels);
  console.log('Repay LendingIxs:', kaminoAction.lendingIxsLabels);
  console.log('Repay CleanupIxs:', kaminoAction.cleanupIxsLabels);
  await processTx(env.c, signer, KaminoAction.actionToIxs(kaminoAction), mode);
}
