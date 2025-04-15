import { PublicKey } from '@solana/web3.js';

const SQUADS_API_BASE_URL = 'https://4fnetmviidiqkjzenwxe66vgoa0soerr.lambda-url.us-east-1.on.aws/';

export async function walletIsSquadsMultisig(wallet: PublicKey) {
  const response = await fetch(`${SQUADS_API_BASE_URL}/is-multisig?wallet=${wallet.toBase58()}`);
  const data = await response.json();
  const squadsResponse = data as SquadsMultisigResponse;
  return squadsResponse.isSquad;
}

// todo: find a way to get the admins number and threshold
export async function getSquadsMultisigAdminsAndThreshold(_wallet: PublicKey): Promise<{
  adminsNumber: number;
  threshold: number;
}> {
  return {
    adminsNumber: 1,
    threshold: 1,
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
