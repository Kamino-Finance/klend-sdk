import {
  Instruction,
  pipe,
  createTransactionMessage,
  setTransactionMessageFeePayer,
  appendTransactionMessageInstructions,
  compressTransactionMessageUsingAddressLookupTables,
  AddressesByLookupTableAddress,
  setTransactionMessageLifetimeUsingBlockhash,
  Blockhash,
  compileTransaction,
  getBase64EncodedWireTransaction,
  getCompiledTransactionMessageEncoder,
  compileTransactionMessage,
  TransactionSigner,
  Account,
} from '@solana/kit';
import { AddressLookupTable } from '@solana-program/address-lookup-table';
import { BlockhashWithHeight } from './tx';
import { ManagerConnectionPool } from './ManagerConnectionPool';

export const INVALID_BUT_SUFFICIENT_FOR_COMPILATION_BLOCKHASH: BlockhashWithHeight = {
  blockhash: '11111111111111111111111111111111' as Blockhash,
  lastValidBlockHeight: 0n,
  slot: 0n,
};

export async function printSimulateTx(
  c: ManagerConnectionPool,
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

  const transactionMessage = pipe(
    createTransactionMessage({ version: 0 }),
    (tx) => setTransactionMessageFeePayer(payer.address, tx),
    (tx) => appendTransactionMessageInstructions(ixs, tx),
    (tx) => compressTransactionMessageUsingAddressLookupTables(tx, lutsByAddress),
    (tx) => setTransactionMessageLifetimeUsingBlockhash(INVALID_BUT_SUFFICIENT_FOR_COMPILATION_BLOCKHASH, tx)
  );

  const compiledTransaction = compileTransaction(transactionMessage);
  const wireTransactionBytes = getBase64EncodedWireTransaction(compiledTransaction);

  const compiled = compileTransactionMessage(transactionMessage);
  const encodedMessageBytes = getCompiledTransactionMessageEncoder().encode(compiled);

  const encodedTxMessage = Buffer.from(encodedMessageBytes).toString('base64');

  const simulationUrl = `https://explorer.solana.com/tx/inspector?message=${encodeURIComponent(
    encodedTxMessage
  )}&signatures=${encodeURIComponent(`[${payer.address}]`)}`;

  console.log('Simulation URL:', simulationUrl);

  const res = await c.rpc
    .simulateTransaction(wireTransactionBytes, {
      encoding: 'base64',
      replaceRecentBlockhash: true,
      sigVerify: false,
    })
    .send();

  console.log('Simulate Response:', res);
  console.log('');
}
