import {
  Address,
  createKeyPairSignerFromBytes,
  KeyPairSigner,
  SignatureDictionary,
  TransactionPartialSigner,
  TransactionSigner,
} from '@solana/kit';

export async function parseKeypairFile(path: string): Promise<KeyPairSigner> {
  const wallet = Buffer.from(JSON.parse(require('fs').readFileSync(path)));
  return await createKeyPairSignerFromBytes(wallet);
}

export function noopSigner(address: Address): TransactionSigner {
  const signer: TransactionPartialSigner = {
    address,
    async signTransactions(): // transactions: readonly Transaction[],
    // config?: TransactionPartialSignerConfig,
    Promise<readonly SignatureDictionary[]> {
      // Return an array of empty SignatureDictionary objects — one per transaction
      return [];
    },
  };
  return signer;
}
