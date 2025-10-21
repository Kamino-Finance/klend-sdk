import { getConnectionPool } from '../utils/connection';
import { getKeypair } from '../utils/keypair';
import { EXAMPLE_USDC_VAULT, USDC_RESERVE_JLP_MARKET } from '../utils/constants';
import {
  KaminoManager,
  ReserveWithAddress,
  Reserve,
  KaminoVault,
  getMedianSlotDurationInMsFromLastEpochs,
} from '@kamino-finance/klend-sdk';
import { sendAndConfirmTx } from '../utils/tx';

// Note: if the reserve allocation require funds to be invested that need to be disinvested from anoter result you will need to disinvest that one first or use `investAllReservesIxs`
(async () => {
  const c = getConnectionPool();
  const wallet = await getKeypair();
  const slotDuration = await getMedianSlotDurationInMsFromLastEpochs();
  const kaminoManager = new KaminoManager(c.rpc, slotDuration);

  const vault = new KaminoVault(c.rpc, EXAMPLE_USDC_VAULT);

  const usdcJlpMarketReserveState = await Reserve.fetch(c.rpc, USDC_RESERVE_JLP_MARKET);
  if (!usdcJlpMarketReserveState) {
    throw new Error(`USDC Reserve ${USDC_RESERVE_JLP_MARKET} not found`);
  }
  const usdcReserveToInvestWithAddress: ReserveWithAddress = {
    address: USDC_RESERVE_JLP_MARKET,
    state: usdcJlpMarketReserveState,
  };

  const investInReserveIxs = await kaminoManager.investSingleReserveIxs(wallet, vault, usdcReserveToInvestWithAddress);

  // read the vault state so we can use the LUT in the tx
  const vaultState = await vault.getState();

  await sendAndConfirmTx(c, wallet, investInReserveIxs, [], [vaultState.vaultLookupTable], 'Invest Single Reserve');
})().catch(async (e) => {
  console.error(e);
});
