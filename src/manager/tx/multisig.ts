import {
  Account,
  AddressesByLookupTableAddress,
  appendTransactionMessageInstructions,
  compileTransactionMessage,
  createTransactionMessage,
  getBase58Decoder,
  getCompiledTransactionMessageEncoder,
  Instruction,
  pipe,
  setTransactionMessageFeePayer,
  setTransactionMessageLifetimeUsingBlockhash,
  TransactionSigner,
} from '@solana/kit';
import { INVALID_BUT_SUFFICIENT_FOR_COMPILATION_BLOCKHASH } from './simulate';
import { AddressLookupTable } from '@solana-program/address-lookup-table';
import { removeComputeBudgetProgramInstructions } from './priorityFee';

const base58Decoder = getBase58Decoder();

export async function printMultisigTx(
  payer: TransactionSigner,
  ixs: Instruction[],
  luts: Account<AddressLookupTable>[] = []
) {
  const lutsByAddress: AddressesByLookupTableAddress = {};
  if (luts.length > 0) {
    for (const acc of luts) {
      lutsByAddress[acc.address] = acc.data.addresses;
    }
  }

  const ixsWithoutBudgetAndAtas = removeComputeBudgetProgramInstructions(ixs);

  const transactionMessage = pipe(
    createTransactionMessage({ version: 'legacy' }),
    (tx) => setTransactionMessageFeePayer(payer.address, tx),
    (tx) => appendTransactionMessageInstructions(ixsWithoutBudgetAndAtas, tx),
    (tx) => setTransactionMessageLifetimeUsingBlockhash(INVALID_BUT_SUFFICIENT_FOR_COMPILATION_BLOCKHASH, tx)
  );

  const compiled = compileTransactionMessage(transactionMessage);
  const encodedMessageBytes = getCompiledTransactionMessageEncoder().encode(compiled);

  const base58EncodedMessage = base58Decoder.decode(encodedMessageBytes);
  console.log('Base58 encoded tx:', base58EncodedMessage);
}
