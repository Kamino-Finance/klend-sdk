import { getConnection } from '../utils/connection';
import { getKeypair } from '../utils/keypair';
import { EXAMPLE_USDC_VAULT } from '../utils/constants';
import { PublicKey } from '@solana/web3.js';
import {
  buildAndSendTxn,
  getMedianSlotDurationInMsFromLastEpochs,
  KaminoManager,
  KaminoVault,
  VaultConfigField,
} from '@kamino-finance/klend-sdk';

(async () => {
  const connection = getConnection();
  const investor = getKeypair();
  const slotDuration = await getMedianSlotDurationInMsFromLastEpochs();
  const kaminoManager = new KaminoManager(connection, slotDuration);
  const kaminoVault = new KaminoVault(EXAMPLE_USDC_VAULT);
  const reserveToDisinvestFrom = new PublicKey('Ga4rZytCpq1unD4DbEJ5bkHeUz9g3oh9AAFEi6vSauXp');

  const withdrawAllAndBlockReserveIxs = await kaminoManager.withdrawEverythingFromAllReservesAndBlockInvest(
    kaminoVault,
    undefined,
    investor.publicKey
  );

  // send update alloc instructions in batches of 2
  for (let i = 0; i < withdrawAllAndBlockReserveIxs.updateReserveAllocationIxs.length; i += 2) {
    const ixs = [withdrawAllAndBlockReserveIxs.updateReserveAllocationIxs[i]];
    if (i + 1 < withdrawAllAndBlockReserveIxs.updateReserveAllocationIxs.length) {
      ixs.push(withdrawAllAndBlockReserveIxs.updateReserveAllocationIxs[i + 1]);
    }
    await buildAndSendTxn(connection, investor, ixs, [], [], 'Update alloc');
  }

  // disinvest all from all reserves in batches of 2
  for (let i = 0; i < withdrawAllAndBlockReserveIxs.investIxs.length; i += 2) {
    const ixs = [withdrawAllAndBlockReserveIxs.investIxs[i]];
    if (i + 1 < withdrawAllAndBlockReserveIxs.investIxs.length) {
      ixs.push(withdrawAllAndBlockReserveIxs.investIxs[i + 1]);
    }
    await buildAndSendTxn(connection, investor, ixs, [], [], 'Disinvest all from all reserves');
  }

  // then send tx to block invest
})().catch(async (e) => {
  console.error(e);
});
