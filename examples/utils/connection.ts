import { Connection } from '@solana/web3.js';
import { getEnvOrThrow } from './env';

export function getConnection() {
  const RPC_ENDPOINT = getEnvOrThrow('RPC_ENDPOINT');
  return new Connection(RPC_ENDPOINT);
}
