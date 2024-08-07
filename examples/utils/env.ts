import { Connection } from '@solana/web3.js';

export function getEnvOrThrow(envVarName: string) {
  if (envVarName in process.env) {
    return process.env[envVarName] as string;
  }
  throw Error(`${envVarName} environment variable does not exist`);
}
