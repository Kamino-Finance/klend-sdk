import { createSolanaRpc, address } from '@solana/kit';
import { KaminoVault } from '@kamino-finance/klend-sdk';

const vault = new KaminoVault(
  createSolanaRpc('https://api.mainnet-beta.solana.com'), // RPC
  address('HDsayqAsDWy3QvANGqh2yNraqcD8Fnjgh73Mhb3WRS5E') // USDC vault
);
const slot = await vault.client.getConnection().getSlot().send();

console.log({
  holdings: (await vault.getVaultHoldings(slot)).asJSON(),
  apys: await vault.getAPYs(slot),
  exchangeRate: (await vault.getExchangeRate(slot)).toString(),
});
