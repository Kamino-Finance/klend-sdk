import { createKeyPairSignerFromBytes, KeyPairSigner } from '@solana/kit';
import { getEnvOrThrow } from './env';
import { readFileSync } from 'fs';
import { existsSync } from 'node:fs';

export function getKeypair(): Promise<KeyPairSigner> {
  const FILE_PATH = getEnvOrThrow('KEYPAIR_FILE');
  return readKeypairFile(FILE_PATH);
}

export async function readKeypairFile(path: string): Promise<KeyPairSigner> {
  if (!existsSync(path)) {
    throw new Error(`Wallet file not found at ${path}`);
  }
  const wallet = Buffer.from(JSON.parse(readFileSync(path).toString()));
  return await createKeyPairSignerFromBytes(wallet);
}
