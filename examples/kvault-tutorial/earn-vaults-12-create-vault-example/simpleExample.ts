import { createSolanaRpc, address, createNoopSigner } from '@solana/kit';
import {
  KaminoManager,
  KaminoVaultConfig,
  getMedianSlotDurationInMsFromLastEpochs
} from '@kamino-finance/klend-sdk';
import { TOKEN_PROGRAM_ADDRESS } from '@solana-program/token';
import { Decimal } from 'decimal.js';

// Initialize RPC and Kamino manager
const rpc = createSolanaRpc('https://api.mainnet-beta.solana.com');
const slotDuration = await getMedianSlotDurationInMsFromLastEpochs();
const kaminoManager = new KaminoManager(rpc, slotDuration);

// Create admin signer (no-op for example purposes)
const adminAddress = address('YourAdminAddressHere11111111111111111111111');
const adminSigner = createNoopSigner(adminAddress);

// Configure vault
const kaminoVaultConfig = new KaminoVaultConfig({
  admin: adminSigner,
  tokenMint: address('EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v'), // USDC
  tokenMintProgramId: TOKEN_PROGRAM_ADDRESS,
  performanceFeeRatePercentage: new Decimal(15.0),
  managementFeeRatePercentage: new Decimal(2.0),
  name: 'SunnyDayCustomVault',
  vaultTokenSymbol: 'USDC',
  vaultTokenName: 'SunnyDayCustomVaultToken', // Customize and make it unique for your vault
  minDepositAmount: new Decimal(1000000), // 1 USDC (6 decimals)
  minWithdrawAmount: new Decimal(1000000),
  minInvestAmount: new Decimal(1000000),
  minInvestDelaySlots: 150,
  unallocatedWeight: 500,
  unallocatedTokensCap: new Decimal(2000000), // 2 USDC
} as any);

// Generate vault instructions
const { vault: vaultSigner, initVaultIxs: instructions } =
  await kaminoManager.createVaultIxs(kaminoVaultConfig);

const allInstructions = [
  ...instructions.createAtaIfNeededIxs,
  ...instructions.initVaultIxs,
  instructions.createLUTIx,
  instructions.initSharesMetadataIx,
];

console.log('Vault Address:', vaultSigner.address);
console.log('Vault Creation Instructions:', allInstructions);
