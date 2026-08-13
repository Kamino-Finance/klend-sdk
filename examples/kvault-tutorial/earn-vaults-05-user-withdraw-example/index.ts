import { createSolanaRpc, address, createNoopSigner } from '@solana/kit';
import { KaminoManager, KaminoVault } from '@kamino-finance/klend-sdk';
import { Decimal } from 'decimal.js';

const rpc = createSolanaRpc('https://api.mainnet-beta.solana.com');
const vault = new KaminoVault(
  rpc,
  address('HDsayqAsDWy3QvANGqh2yNraqcD8Fnjgh73Mhb3WRS5E') // USDC vault
);

const kaminoManager = new KaminoManager(rpc);
const vaultState = await vault.getState();
const vaultReservesMap = await kaminoManager.loadVaultReserves(vaultState);
const farmState = await kaminoManager.loadVaultFarmState(vaultState);
const slot = await rpc.getSlot().send();

const withdrawIxs = await vault.withdrawIxs(
  createNoopSigner(address('EZC9wzVCvihCsCHEMGADYdsRhcpdRYWzSCZAVegSCfqY')), // user
  new Decimal(1.5), // withdraw 1.5 shares
  slot,
  vaultReservesMap,
  farmState,
  null // flcFarmState
);

console.log('Withdraw Instructions:', withdrawIxs); // from here the instructions have to be sent, check examples/kvault-examples/example_user_withdraw.ts for transaction sending
