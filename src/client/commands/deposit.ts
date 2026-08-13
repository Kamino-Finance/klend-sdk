import BN from 'bn.js';
import { VanillaObligation } from '../../utils';
import { KaminoAction } from '../../classes';
import { Scope } from '@kamino-finance/scope-sdk';
import { CliEnv, SendTxMode } from '../tx/CliEnv';
import { getMarket } from '../services/market';
import { processTx } from '../tx/processor';
import { address, Address } from '@solana/kit';

export async function deposit(
  env: CliEnv,
  mode: SendTxMode,
  reserveAddress: string,
  depositAmount: BN,
  marketAddress: Address
): Promise<void> {
  const signer = await env.getSigner();
  const kaminoMarket = await getMarket(env.c.rpc, marketAddress, env.klendProgramId);
  const scope = new Scope(env.cluster, env.c.rpc);
  const currentSlot = await env.c.rpc.getSlot().send();
  const kaminoAction = await KaminoAction.buildDepositTxns({
    kaminoMarket,
    amount: depositAmount,
    reserveAddress: address(reserveAddress),
    owner: signer,
    obligation: new VanillaObligation(marketAddress),
    useV2Ixs: true,
    scopeRefreshConfig: { scope, scopeConfigurations: await scope.getAllConfigurations() },
    currentSlot,
  });
  console.log('User obligation', await kaminoAction.getObligationPda());

  console.log('Deposit SetupIxs:', kaminoAction.setupIxsLabels);
  console.log('Deposit LendingIxs:', kaminoAction.lendingIxsLabels);
  console.log('Deposit CleanupIxs:', kaminoAction.cleanupIxsLabels);
  await processTx(env.c, signer, KaminoAction.actionToIxs(kaminoAction), mode);
}
