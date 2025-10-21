import { createSolanaRpc, address } from '@solana/kit';
import { KaminoVault } from '@kamino-finance/klend-sdk';

const vault = new KaminoVault(
  createSolanaRpc('https://api.mainnet-beta.solana.com'), // RPC
  address('HDsayqAsDWy3QvANGqh2yNraqcD8Fnjgh73Mhb3WRS5E') // USDC vault
);

const user = address('EZC9wzVCvihCsCHEMGADYdsRhcpdRYWzSCZAVegSCfqY');

const shares = await vault.getUserShares(user);
const rate = await vault.getExchangeRate();

console.log({
  shares: shares.totalShares.toString(),
  tokens: shares.totalShares.mul(rate).toString(), // the user's position in tokens
});
