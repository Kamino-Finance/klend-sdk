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

const user = address('EZC9wzVCvihCsCHEMGADYdsRhcpdRYWzSCZAVegSCfqY');

const shares = await vault.getUserShares(user);
const currentLedgerInstant = await getCurrentLedgerInstant(vault.client.getConnection());
const rate = await vault.getExchangeRate(currentLedgerInstant);

console.log({
  shares: shares.totalShares.toString(),
  tokens: shares.totalShares.mul(rate).toString(), // the user's position in tokens
});
