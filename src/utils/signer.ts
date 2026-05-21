import { Address, SignatureDictionary, TransactionPartialSigner, TransactionSigner } from '@solana/kit';

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
