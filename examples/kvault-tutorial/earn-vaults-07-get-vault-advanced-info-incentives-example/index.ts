import { createSolanaRpc, address } from '@solana/kit';
import { KaminoManager, KaminoVault } from '@kamino-finance/klend-sdk';
import { Farms } from '@kamino-finance/farms-sdk';
import { Decimal } from 'decimal.js';

const rpc = createSolanaRpc('https://api.mainnet-beta.solana.com');
const vault = new KaminoVault(
  rpc,
  address('HDsayqAsDWy3QvANGqh2yNraqcD8Fnjgh73Mhb3WRS5E') // USDC vault
);

const kaminoManager = new KaminoManager(rpc);

const vaultTokenPrice = new Decimal(1.0); // as it is an USDC vault the token price is 1
const slot = await rpc.getSlot().send();
const vaultState = await vault.getState();
const vaultReservesMap = await kaminoManager.loadVaultReserves(vaultState);
const kaminoMarkets = await kaminoManager.loadKaminoMarketsForVaultReserves(vaultReservesMap);
const farmsMap = await kaminoManager.loadVaultFarmStates([vaultState], vaultReservesMap);
const farmsClient = new Farms(rpc);
const globalConfig = await kaminoManager.loadKVaultGlobalConfig();
const vaultOverview = await kaminoManager.getVaultOverview(
  vault,
  vaultTokenPrice,
  slot,
  vaultReservesMap,
  kaminoMarkets,
  farmsMap,
  farmsClient,
  globalConfig,
  slot
);

console.log('vaultOverview', vaultOverview);
console.log('delegated farm incentives', vaultOverview.delegatedFarmIncentives);
console.log('reserves farm incentives', vaultOverview.reservesFarmsIncentives);
console.log('vault farm incentives', vaultOverview.vaultFarmIncentives);
