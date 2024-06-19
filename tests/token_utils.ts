import { Keypair, PublicKey, TransactionInstruction, TransactionSignature } from '@solana/web3.js';
import * as anchor from '@coral-xyz/anchor';

import {
  buildAndSendTxnWithLogs,
  buildVersionedTransaction,
  createAssociatedTokenAccountIdempotentInstruction,
} from '../src';
import { Env } from './setup_utils';
import {
  TOKEN_PROGRAM_ID,
  createBurnInstruction,
  createInitializeMintInstruction,
  createMintToInstruction,
} from '@solana/spl-token';

export async function createMint(
  env: Env,
  authority: PublicKey,
  decimals: number = 6,
  mintOverride?: Keypair,
  tokenProgram: PublicKey = TOKEN_PROGRAM_ID
): Promise<PublicKey> {
  const mint = mintOverride || anchor.web3.Keypair.generate();
  return await createMintFromKeypair(env, authority, mint, decimals, tokenProgram);
}

export async function createMintFromKeypair(
  env: Env,
  authority: PublicKey,
  mint: Keypair,
  decimals: number = 6,
  tokenProgramId: PublicKey = TOKEN_PROGRAM_ID
): Promise<PublicKey> {
  const instructions = await createMintInstructions(env, authority, mint.publicKey, decimals, tokenProgramId);

  const tx = await buildVersionedTransaction(env.provider.connection, env.wallet.payer.publicKey, instructions);

  await buildAndSendTxnWithLogs(env.provider.connection, tx, env.wallet.payer, [mint]);
  return mint.publicKey;
}

async function createMintInstructions(
  env: Env,
  authority: PublicKey,
  mint: PublicKey,
  decimals: number,
  tokenProgramId: PublicKey = TOKEN_PROGRAM_ID
): Promise<TransactionInstruction[]> {
  return [
    anchor.web3.SystemProgram.createAccount({
      fromPubkey: env.wallet.publicKey,
      newAccountPubkey: mint,
      space: 82,
      lamports: await env.provider.connection.getMinimumBalanceForRentExemption(82),
      programId: tokenProgramId,
    }),
    createInitializeMintInstruction(mint, decimals, authority, null, tokenProgramId),
  ];
}

export async function createAta(
  env: Env,
  owner: PublicKey,
  mint: PublicKey,
  tokenProgram: PublicKey = TOKEN_PROGRAM_ID
): Promise<[TransactionSignature, PublicKey]> {
  const [ata, ix] = createAssociatedTokenAccountIdempotentInstruction(owner, mint, env.admin.publicKey, tokenProgram);

  const tx = await buildVersionedTransaction(env.provider.connection, env.admin.publicKey, [ix]);

  const sig = await buildAndSendTxnWithLogs(env.provider.connection, tx, env.admin, []);
  return [sig, ata];
}

export function getMintToIx(
  authority: PublicKey,
  mintPubkey: PublicKey,
  tokenAccount: PublicKey,
  amount: number,
  tokenProgram: PublicKey = TOKEN_PROGRAM_ID
): TransactionInstruction {
  return createMintToInstruction(mintPubkey, tokenAccount, authority, amount, [], tokenProgram);
}

export function getBurnFromIx(
  signer: PublicKey,
  mintPubkey: PublicKey,
  tokenAccount: PublicKey,
  amount: number,
  tokenProgram: PublicKey = TOKEN_PROGRAM_ID
): TransactionInstruction {
  console.log(`burnFrom ${tokenAccount.toString()} mint ${mintPubkey.toString()} amount ${amount}`);
  return createBurnInstruction(tokenAccount, mintPubkey, signer, amount, [], tokenProgram);
}

export async function mintTo(
  env: Env,
  mint: PublicKey,
  recipient: PublicKey,
  amount: number,
  createAtaIxns: TransactionInstruction[] = [],
  tokenProgram: PublicKey = TOKEN_PROGRAM_ID
): Promise<TransactionSignature> {
  const instruction = getMintToIx(env.admin.publicKey, mint, recipient, amount, tokenProgram);

  const tx = await buildVersionedTransaction(env.provider.connection, env.wallet.payer.publicKey, [
    ...createAtaIxns,
    instruction,
  ]);

  const sig = await buildAndSendTxnWithLogs(env.provider.connection, tx, env.wallet.payer, []);
  return sig;
}
