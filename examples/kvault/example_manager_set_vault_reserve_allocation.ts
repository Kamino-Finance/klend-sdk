import { getConnectionPool } from '../utils/connection';
import { getKeypair } from '../utils/keypair';
import { USDC_MINT, USDC_RESERVE_JLP_MARKET } from '../utils/constants';
import Decimal from 'decimal.js/decimal';
import {
  KaminoVaultConfig,
  KaminoManager,
  ReserveWithAddress,
  sleep,
  Reserve,
  ReserveAllocationConfig,
  KaminoVault,
  getMedianSlotDurationInMsFromLastEpochs,
} from '@kamino-finance/klend-sdk';
import { TOKEN_PROGRAM_ADDRESS } from '@solana-program/token';
import { sendAndConfirmTx } from '../utils/tx';

(async () => {
  const c = getConnectionPool();
  const wallet = await getKeypair();
  const slotDuration = await getMedianSlotDurationInMsFromLastEpochs();
  const kaminoManager = new KaminoManager(c.rpc, slotDuration);

  // Init vault
  const kaminoVaultConfig = new KaminoVaultConfig({
    admin: wallet,
    tokenMint: USDC_MINT,
    tokenMintProgramId: TOKEN_PROGRAM_ADDRESS, // the token program for the token mint above
    performanceFeeRatePercentage: new Decimal(1.0),
    managementFeeRatePercentage: new Decimal(2.0),
    name: 'example vault',
    vaultTokenSymbol: 'USDC',
    vaultTokenName: 'Example',
  });
  const { vault: vaultKp, initVaultIxs: instructions } = await kaminoManager.createVaultIxs(kaminoVaultConfig);

  const vault = new KaminoVault(vaultKp.address);

  // initialize vault, lookup table for the vault and shares metadata
  await sendAndConfirmTx(
    c,
    wallet,
    [...instructions.initVaultIxs, instructions.createLUTIx, instructions.initSharesMetadataIx],
    [vaultKp],
    [],
    'InitVault'
  );
  // sleep a little bit so the LUT is created
  await sleep(2000);

  // populate the LUT
  await sendAndConfirmTx(c, wallet, instructions.populateLUTIxs, [], [], 'PopulateLUT');

  // Update reserve allocation (add new reserve into the allocation)
  const usdcJlpMarketReserveState = await Reserve.fetch(c.rpc, USDC_RESERVE_JLP_MARKET);
  if (!usdcJlpMarketReserveState) {
    throw new Error(`USDC Reserve ${USDC_RESERVE_JLP_MARKET} not found`);
  }
  const usdcReserveWithAddress: ReserveWithAddress = {
    address: USDC_RESERVE_JLP_MARKET,
    state: usdcJlpMarketReserveState,
  };

  // a reserve config is the reserveStateWithAddress and the weight (which is relative to the other reserves) this reserve gets into the vault allocation; this operation is idempotent, if the reserve is already part of the allocation only the weight will get changed
  const firstReserveAllocationConfig = new ReserveAllocationConfig(usdcReserveWithAddress, 100, new Decimal(100));

  const setReserveAllocationIxs = await kaminoManager.updateVaultReserveAllocationIxs(
    vault,
    firstReserveAllocationConfig
  );

  // send the transaction to update the vault allocation and sync the lookup table; if the lookup table is not initialized yet it will need prior initialization
  const _updateTxSignature = await sendAndConfirmTx(
    c,
    wallet,
    [setReserveAllocationIxs.updateReserveAllocationIx, ...setReserveAllocationIxs.updateLUTIxs],
    [],
    [],
    'UpdateVaultReserveAllocation'
  );

  // update the allocation for the same reserve
  const secondReserveAllocationConfig = new ReserveAllocationConfig(usdcReserveWithAddress, 100, new Decimal(200));

  const updateReserveAllocationIxs = await kaminoManager.updateVaultReserveAllocationIxs(
    vault,
    secondReserveAllocationConfig
  );

  // send the transaction to update the vault allocation and sync the lookup table; now only the weight will get updated as the reserve is already part of the allocation
  const _updateTxSignature2 = await sendAndConfirmTx(
    c,
    wallet,
    [updateReserveAllocationIxs.updateReserveAllocationIx, ...updateReserveAllocationIxs.updateLUTIxs],
    [],
    [],
    'UpdateVaultReserveAllocation'
  );
})().catch(async (e) => {
  console.error(e);
});
