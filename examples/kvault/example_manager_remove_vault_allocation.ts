import { getConnectionPool } from '../utils/connection';
import { getKeypair } from '../utils/keypair';
import { EXAMPLE_USDC_VAULT, USDC_RESERVE_JLP_MARKET } from '../utils/constants';
import Decimal from 'decimal.js/decimal';
import {
  KaminoManager,
  ReserveWithAddress,
  Reserve,
  ReserveAllocationConfig,
  KaminoVault,
  getMedianSlotDurationInMsFromLastEpochs,
} from '@kamino-finance/klend-sdk';
import { sendAndConfirmTx } from '../utils/tx';

// to remove a reserve from the allocation, set the weight to 0
(async () => {
  const c = getConnectionPool();
  const wallet = await getKeypair();
  const slotDuration = await getMedianSlotDurationInMsFromLastEpochs();
  const kaminoManager = new KaminoManager(c.rpc, slotDuration);
  const vault = new KaminoVault(EXAMPLE_USDC_VAULT);

  // Update reserve allocation (add new reserve into the allocation)
  const usdcJlpMarketReserveState = await Reserve.fetch(c.rpc, USDC_RESERVE_JLP_MARKET);
  if (!usdcJlpMarketReserveState) {
    throw new Error(`USDC Reserve ${USDC_RESERVE_JLP_MARKET} not found`);
  }
  const usdcReserveWithAddress: ReserveWithAddress = {
    address: USDC_RESERVE_JLP_MARKET,
    state: usdcJlpMarketReserveState,
  };

  // create a config with weight 0 to remove the reserve from the allocation
  const removeReserveAllocationConfig = new ReserveAllocationConfig(usdcReserveWithAddress, 0, new Decimal(0));

  const setReserveAllocationIxs = await kaminoManager.updateVaultReserveAllocationIxs(
    vault,
    removeReserveAllocationConfig
  );

  // send the transaction to remove the vault allocation
  const _updateTxSignature = await sendAndConfirmTx(
    c,
    wallet,
    [setReserveAllocationIxs.updateReserveAllocationIx, ...setReserveAllocationIxs.updateLUTIxs],
    [],
    [],
    'UpdateVaultReserveAllocation'
  );
})().catch(async (e) => {
  console.error(e);
});
