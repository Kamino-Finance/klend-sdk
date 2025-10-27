import { createSolanaRpc, address, createNoopSigner } from '@solana/kit';
import { KaminoVault } from '@kamino-finance/klend-sdk';
import { Decimal } from 'decimal.js';

const vault = new KaminoVault(
  createSolanaRpc('https://api.mainnet-beta.solana.com'), // RPC
  address('HDsayqAsDWy3QvANGqh2yNraqcD8Fnjgh73Mhb3WRS5E') // USDC vault
);

const depositIxs = await vault.depositIxs(
  createNoopSigner(address('EZC9wzVCvihCsCHEMGADYdsRhcpdRYWzSCZAVegSCfqY')), // user
  new Decimal(100.0)
);

console.log('Deposit Instructions:', depositIxs); // from here the instructions have to be sent, check examples/kvault-examples/example_user_deposit.ts for transaction sending
