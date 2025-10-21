import { createSolanaRpc, address } from '@solana/kit';
import { KaminoManager } from '@kamino-finance/klend-sdk';

const manager = new KaminoManager(createSolanaRpc('https://api.mainnet-beta.solana.com'));

const user = address('EZC9wzVCvihCsCHEMGADYdsRhcpdRYWzSCZAVegSCfqY');
const userSharesAllVaults = await manager.getUserSharesBalanceAllVaults(user);

userSharesAllVaults.forEach((shares, vault) => {
  console.log(`User shares in ${vault}:`, shares);
});
