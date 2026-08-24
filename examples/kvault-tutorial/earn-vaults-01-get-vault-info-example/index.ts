import { createSolanaRpc, address } from '@solana/kit';
import {
  KaminoVault,
  getCurrentLedgerInstant,
  getMedianSlotDurationInMsFromLastEpochs,
} from '@kamino-finance/klend-sdk';

const vault = new KaminoVault(
  createSolanaRpc('https://api.mainnet-beta.solana.com'), // RPC
  address('HDsayqAsDWy3QvANGqh2yNraqcD8Fnjgh73Mhb3WRS5E'), // USDC vault
  await getMedianSlotDurationInMsFromLastEpochs()
);
const currentLedgerInstant = await getCurrentLedgerInstant(vault.client.getConnection());

console.log({
  holdings: (await vault.getVaultHoldings(currentLedgerInstant)).asJSON(),
  apys: await vault.getAPYs(currentLedgerInstant),
  exchangeRate: (await vault.getExchangeRate(currentLedgerInstant)).toString(),
});
