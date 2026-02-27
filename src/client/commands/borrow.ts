import BN from 'bn.js';
import { VanillaObligation } from '../../utils';
import { KaminoAction } from '../../classes';
import { Scope } from '@kamino-finance/scope-sdk';
import { CliEnv, SendTxMode } from '../tx/CliEnv';
import { getMarket } from '../services/market';
import { processTx } from '../tx/processor';
import { Address } from '@solana/kit';

export async function borrow(
  env: CliEnv,
  mode: SendTxMode,
  token: string,
  borrowAmount: BN,
  marketAddress: Address
): Promise<void> {
  const signer = await env.getSigner();
  const kaminoMarket = await getMarket(env.c.rpc, marketAddress, env.klendProgramId);
  const scope = new Scope(env.cluster, env.c.rpc);
  const kaminoAction = await KaminoAction.buildBorrowTxns(
    kaminoMarket,
    borrowAmount,
    kaminoMarket.getReserveBySymbol(token)!.getLiquidityMint(),
    signer,
    new VanillaObligation(marketAddress),
    true,
    { scope, scopeConfigurations: await scope.getAllConfigurations() }
  );
  console.log('User obligation', await kaminoAction.getObligationPda());

  console.log('Borrow SetupIxs:', kaminoAction.setupIxsLabels);
  console.log('Borrow LendingIxs:', kaminoAction.lendingIxsLabels);
  console.log('Borrow CleanupIxs:', kaminoAction.cleanupIxsLabels);
  await processTx(env.c, signer, KaminoAction.actionToIxs(kaminoAction), mode);
}
