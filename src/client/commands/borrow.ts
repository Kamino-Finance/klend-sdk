import BN from 'bn.js';
import { getCurrentLedgerInstant } from '../../utils/rpc';
import { VanillaObligation } from '../../utils';
import { KaminoAction } from '../../classes';
import { Scope } from '@kamino-finance/scope-sdk';
import { CliEnv, SendTxMode } from '../tx/CliEnv';
import { getMarket } from '../services/market';
import { getMedianSlotDurationInMsFromLastEpochs } from '../../classes/utils';
import { processTx } from '../tx/processor';
import { address, Address } from '@solana/kit';

export async function borrow(
  env: CliEnv,
  mode: SendTxMode,
  reserveAddress: string,
  borrowAmount: BN,
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
  const currentLedgerInstant = await getCurrentLedgerInstant(env.c.rpc);
  const kaminoAction = await KaminoAction.buildBorrowTxns({
    kaminoMarket,
    amount: borrowAmount,
    reserveAddress: address(reserveAddress),
    owner: signer,
    obligation: new VanillaObligation(marketAddress),
    useV2Ixs: true,
    scopeRefreshConfig: { scope, scopeConfigurations: await scope.getAllConfigurations() },
    currentLedgerInstant,
  });
  console.log('User obligation', await kaminoAction.getObligationPda());

  console.log('Borrow SetupIxs:', kaminoAction.setupIxsLabels);
  console.log('Borrow LendingIxs:', kaminoAction.lendingIxsLabels);
  console.log('Borrow CleanupIxs:', kaminoAction.cleanupIxsLabels);
  await processTx(env.c, signer, KaminoAction.actionToIxs(kaminoAction), mode);
}
