import { PublicKey } from '@solana/web3.js';

const SQUADS_API_BASE_URL = 'https://4fnetmviidiqkjzenwxe66vgoa0soerr.lambda-url.us-east-1.on.aws';

export async function walletIsSquadsMultisig(wallet: PublicKey) {
  const response = await fetch(`${SQUADS_API_BASE_URL}/isSquad/${wallet.toBase58()}`);
  const data = await response.json();
  const squadsResponse = data as SquadsMultisigResponse;
  return squadsResponse.isSquad;
}

// todo: find a way to get the admins number and threshold
export async function getSquadsMultisigAdminsAndThreshold(wallet: PublicKey): Promise<{
  adminsNumber: number;
  threshold: number;
}> {
  const response = await fetch(`${SQUADS_API_BASE_URL}/multisig/${wallet.toBase58()}`);
  const data = await response.json();
  const squadsResponse = data as SquadsMultisigAccountResponse;
  return {
    adminsNumber: squadsResponse.keys.length,
    threshold: squadsResponse.threshold,
  };
}

// {"isSquad":true,"version":"v3"}
export type SquadsMultisigResponse = {
  isSquad: boolean;
  version: string;
};

export interface WalletType {
  walletType: 'simpleWallet' | 'squadsMultisig';
  walletAdminsNumber: number;
  walletThreshold: number;
}

export type SquadsMultisigAccountResponse = {
  allow_external_execute: boolean;
  authority_index: number;
  bump: number;
  create_key: string;
  keys: number[][];
  ms_change_index: number;
  threshold: number;
  transaction_index: number;
};
