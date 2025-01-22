import { getConnection } from '../utils/connection';
import { getKeypair } from '../utils/keypair';
import { EXAMPLE_USDC_VAULT, USDC_RESERVE_JLP_MARKET } from '../utils/constants';
import { KaminoManager, ReserveWithAddress, Reserve, KaminoVault, buildAndSendTxn } from '../../src/lib';

// Note: if the reserve allocation require funds to be invested that need to be disinvested from anoter result you will need to disinvest that one first or use `investAllReservesIxs`
(async () => {
  const connection = getConnection();
  const wallet = getKeypair();

  const kaminoManager = new KaminoManager(connection);
  const vault = new KaminoVault(EXAMPLE_USDC_VAULT);

  const usdcJlpMarketReserveState = await Reserve.fetch(connection, USDC_RESERVE_JLP_MARKET);
  if (!usdcJlpMarketReserveState) {
    throw new Error(`USDC Reserve ${USDC_RESERVE_JLP_MARKET} not found`);
  }
  const usdcReserveToInvestWithAddress: ReserveWithAddress = {
    address: USDC_RESERVE_JLP_MARKET,
    state: usdcJlpMarketReserveState,
  };

  const investInReserveIxs = await kaminoManager.investSingleReserveIxs(
    wallet.publicKey,
    vault,
    usdcReserveToInvestWithAddress
  );

  // read the vault state so we can use the LUT in the tx
  const vaultState = await vault.getState(connection);

  await buildAndSendTxn(
    connection,
    wallet,
    investInReserveIxs,
    [],
    [vaultState.vaultLookupTable],
    'Invest Single Reserve'
  );
})().catch(async (e) => {
  console.error(e);
});
