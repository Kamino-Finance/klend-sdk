import { Keypair } from '@solana/web3.js';
import { getEnvOrThrow } from './env';
import { readFileSync } from 'fs';

export function getKeypair() {
  const FILE_PATH = getEnvOrThrow('KEYPAIR_FILE');
  const fileContent = readFileSync(FILE_PATH);
  return Keypair.fromSecretKey(Buffer.from(JSON.parse(fileContent.toString())));
}
