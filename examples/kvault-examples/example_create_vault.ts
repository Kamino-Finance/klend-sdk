import { getConnectionPool } from '../utils/connection';
import { getKeypair } from '../utils/keypair';
import { KaminoVaultConfig } from '../../src/classes/vault';
import { USDC_MINT } from '../utils/constants';
import Decimal from 'decimal.js/decimal';
import { getMedianSlotDurationInMsFromLastEpochs, KaminoManager, sleep } from '@kamino-finance/klend-sdk';
import { TOKEN_PROGRAM_ADDRESS } from '@solana-program/token';
import { sendAndConfirmTx } from '../utils/tx';

(async () => {
  const c = getConnectionPool();
  const wallet = await getKeypair();
  const slotDuration = await getMedianSlotDurationInMsFromLastEpochs();

  const kaminoManager = new KaminoManager(c.rpc, slotDuration);

  // Initial vault configuration
  const kaminoVaultConfig = new KaminoVaultConfig({
    admin: wallet,
    tokenMint: USDC_MINT,
    tokenMintProgramId: TOKEN_PROGRAM_ADDRESS, // the token program for the token mint above
    performanceFeeRatePercentage: new Decimal(1.0),
    managementFeeRatePercentage: new Decimal(2.0),
    name: 'example',
    vaultTokenSymbol: 'USDC',
    vaultTokenName: 'Example',
  });

  const { initVaultIxs: instructions } = await kaminoManager.createVaultIxs(kaminoVaultConfig);

  // initialize vault, lookup table for the vault and shares metadata
  await sendAndConfirmTx(
    c,
    wallet,
    [
      ...instructions.createAtaIfNeededIxs,
      ...instructions.initVaultIxs,
      instructions.createLUTIx,
      instructions.initSharesMetadataIx,
    ],
    [],
    [],
    'InitVault'
  );
  // sleep a little bit so the vault and LUT are created
  await sleep(2000);

  // create the farms and attach them to the vault
  await sendAndConfirmTx(
    c,
    wallet,
    [
      ...instructions.createVaultFarms.createVaultFarmIxs.setupFarmIxs,
      ...instructions.createVaultFarms.createVaultFarmIxs.updateFarmIxs,
      instructions.setFarmToVaultIxs.setFarmToVaultIx,
    ],
    [],
    [],
    'CreateVaultFarm'
  );
  if (instructions.createVaultFarms.createFLCVaultFarmIxs) {
    await sendAndConfirmTx(
      c,
      wallet,
      [
        ...instructions.createVaultFarms.createFLCVaultFarmIxs!.setupFarmIxs,
        ...instructions.createVaultFarms.createFLCVaultFarmIxs!.updateFarmIxs,
        instructions.setFarmToVaultIxs.setFLCFarmToVaultIx!,
      ],
      [],
      [],
      'CreateFLCVaultFarm'
    );
  }
  // populate the LUT
  await sendAndConfirmTx(c, wallet, instructions.populateLUTIxs, [], [], 'PopulateLUT');
})().catch(async (e) => {
  console.error(e);
});
