import { createSolanaRpc, address, createNoopSigner } from '@solana/kit';
import { KaminoManager, KaminoVault, getMedianSlotDurationInMsFromLastEpochs } from '@kamino-finance/klend-sdk';
import { Decimal } from 'decimal.js';

const rpc = createSolanaRpc('https://api.mainnet-beta.solana.com');
const vault = new KaminoVault(
  rpc,
  address('HDsayqAsDWy3QvANGqh2yNraqcD8Fnjgh73Mhb3WRS5E'), // USDC vault
  await getMedianSlotDurationInMsFromLastEpochs()
);

const kaminoManager = new KaminoManager(rpc, await getMedianSlotDurationInMsFromLastEpochs());
const vaultState = await vault.getState();
const vaultReservesMap = await kaminoManager.loadVaultReserves(vaultState);
const farmState = await kaminoManager.loadVaultFarmState(vaultState);

const depositIxs = await vault.depositIxs(
  createNoopSigner(address('EZC9wzVCvihCsCHEMGADYdsRhcpdRYWzSCZAVegSCfqY')), // user
  new Decimal(100.0),
  vaultReservesMap,
  farmState,
  null
);

console.log('Deposit Instructions:', depositIxs); // from here the instructions have to be sent, check examples/kvault-examples/example_user_deposit.ts for transaction sending
