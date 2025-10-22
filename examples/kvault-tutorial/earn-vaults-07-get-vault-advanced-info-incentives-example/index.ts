import { createSolanaRpc, address } from '@solana/kit';
import { KaminoManager, KaminoVault } from '@kamino-finance/klend-sdk';
import { Decimal } from 'decimal.js';

const rpc = createSolanaRpc('https://api.mainnet-beta.solana.com');
const vault = new KaminoVault(
  rpc,
  address('HDsayqAsDWy3QvANGqh2yNraqcD8Fnjgh73Mhb3WRS5E') // USDC vault
);

const kaminoManager = new KaminoManager(rpc);

const vaultTokenPrice = new Decimal(1.0); // as it is an USDC vault the token price is 1
const vaultOverview = await kaminoManager.getVaultOverview(vault, vaultTokenPrice);

console.log('vaultOverview', vaultOverview);
console.log('delegated farm incentives', vaultOverview.delegatedFarmIncentives);
console.log('reserves farm incentives', vaultOverview.reservesFarmsIncentives);
console.log('vault farm incentives', vaultOverview.vaultFarmIncentives);
