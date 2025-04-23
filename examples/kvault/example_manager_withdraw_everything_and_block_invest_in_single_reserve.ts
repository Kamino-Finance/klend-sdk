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

  const withdrawAllAndBlockReserveIxs = await kaminoManager.withdrawEverythingAndBlockInvestReserve(
    kaminoVault,
    reserveToDisinvestFrom,
    investor.publicKey
  );

  // first send tx set weight and cap to 0
  await buildAndSendTxn(
    connection,
    investor,
    withdrawAllAndBlockReserveIxs.updateReserveAllocationIxs,
    [],
    [],
    'Set weight and cap to 0'
  );

  // then send tx to withdraw everything
  await buildAndSendTxn(
    connection,
    investor,
    withdrawAllAndBlockReserveIxs.investIxs,
    [],
    [],
    'Disinvest all from reserve'
  );
})().catch(async (e) => {
  console.error(e);
});
