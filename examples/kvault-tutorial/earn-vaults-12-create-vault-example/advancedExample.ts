import 'dotenv/config';
import {
  createSolanaRpc,
  address,
  pipe,
  createTransactionMessage,
  setTransactionMessageFeePayerSigner,
  setTransactionMessageLifetimeUsingBlockhash,
  appendTransactionMessageInstructions,
  signTransactionMessageWithSigners,
  sendTransactionWithoutConfirmingFactory,
  getSignatureFromTransaction
} from '@solana/kit';
import {
  KaminoManager,
  KaminoVaultConfig,
  getMedianSlotDurationInMsFromLastEpochs
} from '@kamino-finance/klend-sdk';
import { TOKEN_PROGRAM_ADDRESS } from '@solana-program/token';
import { Decimal } from 'decimal.js';
import { getKeypair } from '../../utils/keypair';
import { confirmTransactionViaPolling } from '../../utils/tx';

(async () => {
  // Load admin keypair from file
  const adminSigner = await getKeypair();

  // Initialize RPC and Kamino manager
  const rpc = createSolanaRpc('https://api.mainnet-beta.solana.com');
  const slotDuration = await getMedianSlotDurationInMsFromLastEpochs();
  const kaminoManager = new KaminoManager(rpc, slotDuration);

  // IMPORTANT: Customize the vault name below to make it unique
  const kaminoVaultConfig = new KaminoVaultConfig({
    admin: adminSigner,
    tokenMint: address('EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v'), // USDC
    tokenMintProgramId: TOKEN_PROGRAM_ADDRESS,
    performanceFeeRatePercentage: new Decimal(15.0),
    managementFeeRatePercentage: new Decimal(2.0),
    name: 'SunnyDayCustomVault', // Customize and make it unique for your vault
    vaultTokenSymbol: 'USDC',
    vaultTokenName: 'SunnyDayCustomVaultToken',
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

  // Prepare vault creation instructions
  const allInstructions = [
    ...instructions.createAtaIfNeededIxs,
    ...instructions.initVaultIxs,
    instructions.createLUTIx,
    instructions.initSharesMetadataIx,
  ];

  // Get fresh blockhash
  const { value: latestBlockhash } = await rpc.getLatestBlockhash({
    commitment: 'finalized'
  }).send();

  // Build transaction using functional pipe pattern
  const transactionMessage = pipe(
    createTransactionMessage({ version: 0 }),
    tx => setTransactionMessageFeePayerSigner(adminSigner, tx),
    tx => setTransactionMessageLifetimeUsingBlockhash(latestBlockhash, tx),
    tx => appendTransactionMessageInstructions(allInstructions, tx)
  );

  // Sign transaction
  const signedTransaction = await signTransactionMessageWithSigners(transactionMessage);

  // Get signature before sending
  const signature = getSignatureFromTransaction(signedTransaction);

  // Send transaction
  const sendTransaction = sendTransactionWithoutConfirmingFactory({ rpc });
  await sendTransaction(signedTransaction, {
    commitment: 'confirmed',
    skipPreflight: true,
    maxRetries: 3n
  });

  // Confirm transaction
  await confirmTransactionViaPolling(rpc, signature);

  console.log('Vault creation successful! Vault ID:', vaultSigner.address);

  // Populate LUT in background (optional but recommended)
  setImmediate(async () => {
    try {
      await new Promise(resolve => setTimeout(resolve, 2000));

      // Get fresh blockhash for LUT
      const { value: lutBlockhash } = await rpc.getLatestBlockhash({
        commitment: 'finalized'
      }).send();

      // Build LUT population transaction
      const lutMessage = pipe(
        createTransactionMessage({ version: 0 }),
        tx => setTransactionMessageFeePayerSigner(adminSigner, tx),
        tx => setTransactionMessageLifetimeUsingBlockhash(lutBlockhash, tx),
        tx => appendTransactionMessageInstructions(instructions.populateLUTIxs, tx)
      );

      // Sign and send LUT transaction
      const signedLutTx = await signTransactionMessageWithSigners(lutMessage);
      const lutSignature = getSignatureFromTransaction(signedLutTx);

      const sendLutTx = sendTransactionWithoutConfirmingFactory({ rpc });
      await sendLutTx(signedLutTx, {
        commitment: 'confirmed',
        skipPreflight: true,
        maxRetries: 3n
      });

      await confirmTransactionViaPolling(rpc, lutSignature);
    } catch (error) {
      // LUT population failure doesn't affect vault functionality
    }
  });
})().catch(async (e) => {
  console.error(e);
});
