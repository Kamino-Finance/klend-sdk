import { getConnection } from '../utils/connection';
import { getKeypair } from '../utils/keypair';
import { KaminoVaultConfig } from '../../src/classes/vault';
import { USDC_MINT } from '../utils/constants';
import { TOKEN_PROGRAM_ID } from '@solana/spl-token';
import Decimal from 'decimal.js/decimal';
import {
  buildAndSendTxn,
  getMedianSlotDurationInMsFromLastEpochs,
  KaminoManager,
  sleep,
} from '@kamino-finance/klend-sdk';

(async () => {
  const connection = getConnection();
  const wallet = getKeypair();
  const slotDuration = await getMedianSlotDurationInMsFromLastEpochs();

  const kaminoManager = new KaminoManager(connection, slotDuration);

  // Initial vault configuration
  const kaminoVaultConfig = new KaminoVaultConfig({
    admin: wallet.publicKey,
    tokenMint: USDC_MINT,
    tokenMintProgramId: TOKEN_PROGRAM_ID, // the token program for the token mint above
    performanceFeeRatePercentage: new Decimal(1.0),
    managementFeeRatePercentage: new Decimal(2.0),
    name: 'example',
    vaultTokenSymbol: 'USDC',
    vaultTokenName: 'Example',
  });

  const { vault: vaultKp, initVaultIxs: instructions } = await kaminoManager.createVaultIxs(kaminoVaultConfig);

  // initialize vault, lookup table for the vault and shares metadata
  await buildAndSendTxn(
    connection,
    wallet,
    [...instructions.initVaultIxs, instructions.createLUTIx, instructions.initSharesMetadataIx],
    [vaultKp],
    [],
    'InitVault'
  );
  // sleep a little bit so the LUT is created
  await sleep(2000);

  // populate the LUT
  await buildAndSendTxn(connection, wallet, instructions.populateLUTIxs, [], [], 'PopulateLUT');
})().catch(async (e) => {
  console.error(e);
});
