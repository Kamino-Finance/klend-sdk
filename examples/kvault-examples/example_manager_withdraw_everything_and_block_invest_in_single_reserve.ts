import { getConnectionPool } from '../utils/connection';
import { getKeypair } from '../utils/keypair';
import { EXAMPLE_USDC_VAULT } from '../utils/constants';
import { getMedianSlotDurationInMsFromLastEpochs, KaminoManager, KaminoVault } from '@kamino-finance/klend-sdk';
import { address } from '@solana/kit';
import { sendAndConfirmTx } from '../utils/tx';

(async () => {
  const c = getConnectionPool();
  const investor = await getKeypair();
  const slotDuration = await getMedianSlotDurationInMsFromLastEpochs();
  const kaminoManager = new KaminoManager(c.rpc, slotDuration);
  const kaminoVault = new KaminoVault(c.rpc, EXAMPLE_USDC_VAULT);
  const reserveToDisinvestFrom = address('Ga4rZytCpq1unD4DbEJ5bkHeUz9g3oh9AAFEi6vSauXp');

  const withdrawAllAndBlockReserveIxs = await kaminoManager.withdrawEverythingAndBlockInvestReserve(
    kaminoVault,
    reserveToDisinvestFrom,
    investor
  );

  // first send tx set weight and cap to 0
  await sendAndConfirmTx(
    c,
    investor,
    withdrawAllAndBlockReserveIxs.updateReserveAllocationIxs,
    [],
    [],
    'Set weight and cap to 0'
  );

  // then send tx to withdraw everything
  await sendAndConfirmTx(c, investor, withdrawAllAndBlockReserveIxs.investIxs, [], [], 'Disinvest all from reserve');
})().catch(async (e) => {
  console.error(e);
});
