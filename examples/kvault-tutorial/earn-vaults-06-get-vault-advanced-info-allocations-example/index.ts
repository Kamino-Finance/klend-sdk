import { createSolanaRpc, address } from '@solana/kit';
import { KaminoVault } from '@kamino-finance/klend-sdk';

const vault = new KaminoVault(
  createSolanaRpc('https://api.mainnet-beta.solana.com'), // RPC
  address('HDsayqAsDWy3QvANGqh2yNraqcD8Fnjgh73Mhb3WRS5E') // USDC vault
);

const allocations = await vault.getVaultAllocations();

for (const [address, overview] of allocations) {
  console.log(
    `Reserve: ${address}: weight ${overview.targetWeight.toString()}, allocation: ${overview.ctokenAllocation.toString()}`
  );
}
