import BN from 'bn.js';
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

// Run from examples with:
//   yarn tsx kvault-examples/example_invest_single_reserve_with_max_amount.ts
// or:
//   yarn kvault:invest_single_reserve_with_max_amount
// Build/typecheck examples with:
//   yarn build
(async () => {
  const c = getConnectionPool();
  const wallet = await getKeypair();
  const slotDuration = await getMedianSlotDurationInMsFromLastEpochs();
  const kaminoManager = new KaminoManager(c.rpc, slotDuration);

  const vault = new KaminoVault(c.rpc, EXAMPLE_USDC_VAULT, slotDuration);

  const usdcJlpMarketReserveState = await Reserve.fetch(c.rpc, USDC_RESERVE_JLP_MARKET);
  if (!usdcJlpMarketReserveState) {
    throw new Error(`USDC Reserve ${USDC_RESERVE_JLP_MARKET} not found`);
  }
  const usdcReserveToInvestWithAddress: ReserveWithAddress = {
    address: USDC_RESERVE_JLP_MARKET,
    state: usdcJlpMarketReserveState,
  };

  // Max amount is in lamports. For a 6-decimal USDC vault, 1_000_000 lamports = 1 USDC.
  const maxAmountLamports = new BN(1_000_000);

  // read the vault state so we can use the LUT in the tx
  const vaultState = await vault.getState();
  // pre-load vault reserves once and pass to all methods (avoids redundant RPC calls)
  const vaultReservesMap = await kaminoManager.loadVaultReserves(vaultState);

  const investInReserveIxs = await kaminoManager.investSingleReserveWithMaxAmountIxs(
    wallet,
    vault,
    usdcReserveToInvestWithAddress,
    maxAmountLamports,
    vaultReservesMap
  );

  await sendAndConfirmTx(c, wallet, investInReserveIxs, [], [vaultState.vaultLookupTable], 'Invest With Max Amount');
})().catch(async (e) => {
  console.error(e);
});
