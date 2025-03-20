import { getConnection } from '../utils/connection';
import { getKeypair } from '../utils/keypair';
import { EXAMPLE_USDC_VAULT } from '../utils/constants';
import { getMedianSlotDurationInMsFromLastEpochs, KaminoManager, KaminoVault, buildAndSendTxn } from '../../src/lib';

// Note: in the internal impl of `investAllReservesIxs` it will firstly disinvest from the reserve that has more tokens than the desired allocation and then invest
(async () => {
  const connection = getConnection();
  const wallet = getKeypair();
  const slotDuration = await getMedianSlotDurationInMsFromLastEpochs();

  const kaminoManager = new KaminoManager(connection, slotDuration);
  const vault = new KaminoVault(EXAMPLE_USDC_VAULT);

  const investAllResvesIxs = await kaminoManager.investAllReservesIxs(wallet.publicKey, vault);

  // read the vault state so we can use the LUT in the tx
  const vaultState = await vault.getState(connection);

  // Note: for a vault with many reserves this may not fit in a single transaction so you will need to split the instructions into multiple transactions but the transactions must preserve the order of the instructions
  await buildAndSendTxn(
    connection,
    wallet,
    investAllResvesIxs,
    [],
    [vaultState.vaultLookupTable],
    'Invest All Reserves'
  );
})().catch(async (e) => {
  console.error(e);
});
