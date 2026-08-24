import { createSolanaRpc, address } from '@solana/kit';
import { KaminoManager, getMedianSlotDurationInMsFromLastEpochs } from '@kamino-finance/klend-sdk';

const manager = new KaminoManager(
  createSolanaRpc('https://api.mainnet-beta.solana.com'),
  await getMedianSlotDurationInMsFromLastEpochs()
);

const user = address('EZC9wzVCvihCsCHEMGADYdsRhcpdRYWzSCZAVegSCfqY');
const userSharesAllVaults = await manager.getUserSharesBalanceAllVaults(user);

userSharesAllVaults.forEach((shares, vault) => {
  console.log(`User shares in ${vault}:`, shares);
});
