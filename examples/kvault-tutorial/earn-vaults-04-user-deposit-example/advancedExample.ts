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
import { KaminoVault } from '@kamino-finance/klend-sdk';
import { Decimal } from 'decimal.js';
import { getKeypair } from '../../utils/keypair';
import { confirmTransactionViaPolling } from '../../utils/tx';

(async () => {
  // Load keypair from file
  const signer = await getKeypair();

  // Initialize RPC and vault
  const rpc = createSolanaRpc('https://api.mainnet-beta.solana.com');
  const vault = new KaminoVault(
    rpc,
    address('HDsayqAsDWy3QvANGqh2yNraqcD8Fnjgh73Mhb3WRS5E') // USDC vault
  );

  // Build deposit instructions (includes optional staking)
  const depositAmount = new Decimal(1.0);
  const bundle = await vault.depositIxs(signer, depositAmount);
  const instructions = [...(bundle.depositIxs || []), ...(bundle.stakeInFarmIfNeededIxs || [])];

  if (!instructions.length) {
    throw new Error('No instructions returned by Kamino SDK');
  }

  // Build and sign transaction using functional pipe pattern
  const { value: latestBlockhash } = await rpc.getLatestBlockhash().send();

  const transactionMessage = pipe(
    createTransactionMessage({ version: 0 }),
    tx => setTransactionMessageFeePayerSigner(signer, tx),
    tx => setTransactionMessageLifetimeUsingBlockhash(latestBlockhash, tx),
    tx => appendTransactionMessageInstructions(instructions, tx)
  );

  const signedTransaction = await signTransactionMessageWithSigners(transactionMessage);

  // Send transaction to network
  const signature = getSignatureFromTransaction(signedTransaction);

  const sendTransaction = sendTransactionWithoutConfirmingFactory({ rpc });
  await sendTransaction(signedTransaction, { commitment: 'confirmed', skipPreflight: true });

  // Confirm transaction using HTTP polling
  await confirmTransactionViaPolling(rpc, signature);

  console.log('Deposit successful! Signature:', signature);
  
})().catch(async (e) => {
  console.error(e);
});