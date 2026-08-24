import BN from 'bn.js';
import { getCurrentLedgerInstant } from '../../utils/rpc';
import { VanillaObligation } from '../../utils';
import { KaminoAction } from '../../classes';
import { Scope } from '@kamino-finance/scope-sdk';
import { processTx } from '../tx/processor';
import { CliEnv, SendTxMode } from '../tx/CliEnv';
import { getMarket } from '../services/market';
import { getMedianSlotDurationInMsFromLastEpochs } from '../../classes/utils';
import { address, Address } from '@solana/kit';

export async function repay(
  env: CliEnv,
  mode: SendTxMode,
  reserveAddress: string,
  repayAmount: BN,
  marketAddress: Address
): Promise<void> {
  const signer = await env.getSigner();
  const kaminoMarket = await getMarket(
    env.c.rpc,
    marketAddress,
    env.klendProgramId,
    await getMedianSlotDurationInMsFromLastEpochs()
  );
  const scope = new Scope(env.cluster, env.c.rpc);
  const kaminoAction = await KaminoAction.buildRepayTxns({
    kaminoMarket,
    amount: repayAmount,
    reserveAddress: address(reserveAddress),
    owner: signer,
    obligation: new VanillaObligation(marketAddress),
    useV2Ixs: true,
    scopeRefreshConfig: { scope, scopeConfigurations: await scope.getAllConfigurations() },
    currentLedgerInstant: await getCurrentLedgerInstant(env.c.rpc),
  });
  console.log('User obligation', await kaminoAction.getObligationPda());

  console.log('Repay SetupIxs:', kaminoAction.setupIxsLabels);
  console.log('Repay LendingIxs:', kaminoAction.lendingIxsLabels);
  console.log('Repay CleanupIxs:', kaminoAction.cleanupIxsLabels);
  await processTx(env.c, signer, KaminoAction.actionToIxs(kaminoAction), mode);
}
