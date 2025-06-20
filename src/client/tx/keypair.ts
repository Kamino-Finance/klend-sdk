import {
  Address,
  createKeyPairSignerFromBytes,
  KeyPairSigner,
  SignatureDictionary,
  Transaction,
  TransactionPartialSigner,
  TransactionPartialSignerConfig,
  TransactionSigner,
} from '@solana/kit';

export async function parseKeypairFile(path: string): Promise<KeyPairSigner> {
  const wallet = Buffer.from(JSON.parse(require('fs').readFileSync(path)));
  return await createKeyPairSignerFromBytes(wallet);
}

export function noopSigner(address: Address): TransactionSigner {
  const signer: TransactionPartialSigner = {
    address,
    async signTransactions(
      _transactions: readonly Transaction[],
      _config?: TransactionPartialSignerConfig
    ): Promise<readonly SignatureDictionary[]> {
      // Return an array of empty SignatureDictionary objects — one per transaction
      return [];
    },
  };
  return signer;
}
