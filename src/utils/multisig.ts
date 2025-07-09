import { Address } from '@solana/kit';

const SQUADS_API_BASE_URL = 'https://4fnetmviidiqkjzenwxe66vgoa0soerr.lambda-url.us-east-1.on.aws';

export async function walletIsSquadsMultisig(wallet: Address) {
  const response = await fetch(`${SQUADS_API_BASE_URL}/isSquad/${wallet}`);
  const data = await response.json();
  const squadsResponse = data as SquadsMultisigResponse;
  return squadsResponse.isSquad;
}

export async function getSquadsMultisigAdminsAndThreshold(wallet: Address): Promise<{
  adminsNumber: number;
  threshold: number;
}> {
  const response = await fetch(`${SQUADS_API_BASE_URL}/multisig/${wallet}`);
  const data = await response.json();
  try {
    const squadsResponse = data as SquadsV4MultisigAccountResponse;
    return {
      adminsNumber: squadsResponse.account.members.length,
      threshold: squadsResponse.account.threshold,
    };
  } catch (e) {
    const squadsResponse = data as SquadsV3MultisigAccountResponse;
    return {
      adminsNumber: squadsResponse.keys.length,
      threshold: squadsResponse.threshold,
    };
  }
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

export type SquadsV4MultisigAccountResponse = {
  account: {
    bump: number;
    configAuthority: string;
    createKey: string;
    members: number[][];
    rentCollector: string;
    staleTransactionIndex: string;
    threshold: number;
    timeLock: number;
    total_signers: number;
    transactionIndex: string;
  };
  address: string;
  defaultVault: string;
  metadata: { version: string };
};

export type SquadsV3MultisigAccountResponse = {
  allow_external_execute: boolean;
  authority_index: number;
  bump: number;
  create_key: string;
  keys: number[][];
  ms_change_index: number;
  threshold: number;
  transaction_index: number;
};
