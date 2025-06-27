import {
  Account,
  AccountRole,
  Address,
  AddressesByLookupTableAddress,
  addSignersToTransactionMessage,
  appendTransactionMessageInstructions,
  Blockhash,
  compileTransaction,
  compressTransactionMessageUsingAddressLookupTables,
  createTransactionMessage,
  getBase64EncodedWireTransaction,
  GetLatestBlockhashApi,
  GetMultipleAccountsApi,
  getSignatureFromTransaction,
  IAccountSignerMeta,
  IInstruction,
  pipe,
  Rpc,
  sendAndConfirmTransactionFactory,
  setTransactionMessageFeePayer,
  setTransactionMessageFeePayerSigner,
  setTransactionMessageLifetimeUsingBlockhash,
  Signature,
  signTransactionMessageWithSigners,
  SimulateTransactionApi,
  TransactionSigner,
} from '@solana/kit';
import { AddressLookupTable, fetchAllAddressLookupTable } from '@solana-program/address-lookup-table';
import { ConnectionPool } from './connection';

export type SimulationResponse = ReturnType<SimulateTransactionApi['simulateTransaction']>;

export const INVALID_BUT_SUFFICIENT_FOR_COMPILATION_BLOCKHASH: BlockhashWithHeight = {
  blockhash: '11111111111111111111111111111111' as Blockhash,
  lastValidBlockHeight: 0n,
  slot: 0n,
};

export async function sendAndConfirmTx(
  { rpc, wsRpc }: ConnectionPool,
  payer: TransactionSigner,
  ixs: IInstruction[],
  signers: TransactionSigner[] = [],
  luts: Address[] = [],
  withDescription: string = ''
): Promise<Signature> {
  const blockhash = await fetchBlockhash(rpc);

  const lutsByAddress: AddressesByLookupTableAddress = {};
  if (luts.length > 0) {
    const lutAccs = await fetchAllAddressLookupTable(rpc, luts);
    for (const acc of lutAccs) {
      lutsByAddress[acc.address] = acc.data.addresses;
    }
  }

  const tx = await pipe(
    createTransactionMessage({ version: 0 }),
    (tx) => appendTransactionMessageInstructions(ixs, tx),
    (tx) => setTransactionMessageFeePayerSigner(payer, tx),
    (tx) => setTransactionMessageLifetimeUsingBlockhash(blockhash, tx),
    (tx) => compressTransactionMessageUsingAddressLookupTables(tx, lutsByAddress),
    (tx) => addSignersToTransactionMessage(signers, tx),
    (tx) => signTransactionMessageWithSigners(tx)
  );

  const sig = getSignatureFromTransaction(tx);
  try {
    await sendAndConfirmTransactionFactory({ rpc, rpcSubscriptions: wsRpc })(tx, {
      commitment: 'processed',
      preflightCommitment: 'processed',
      skipPreflight: true,
    });
    console.log(`(${withDescription}) Transaction Hash: ${sig}`);
  } catch (e) {
    console.error(`(${withDescription}) Transaction ${sig} failed:`, e);
    let tx;
    try {
      tx = await rpc
        .getTransaction(sig, { maxSupportedTransactionVersion: 0, commitment: 'confirmed', encoding: 'json' })
        .send();
    } catch (e2) {
      console.log(`(${withDescription}) Error fetching transaction logs:`, e2);
      throw e;
    }
    if (tx && tx.meta?.logMessages) {
      console.log(`(${withDescription}) Transaction logs:`, tx.meta.logMessages);
    } else {
      console.log(`(${withDescription}) Transaction logs not found`);
    }
    throw e;
  }

  return sig;
}

export type BlockhashWithHeight = { blockhash: Blockhash; lastValidBlockHeight: bigint; slot: bigint };

export async function simulateTx(
  rpc: Rpc<GetMultipleAccountsApi & SimulateTransactionApi>,
  payer: Address,
  ixs: IInstruction[],
  luts: Account<AddressLookupTable>[]
): Promise<SimulationResponse> {
  const lutsByAddress: AddressesByLookupTableAddress = {};
  if (luts.length > 0) {
    for (const acc of luts) {
      lutsByAddress[acc.address] = acc.data.addresses;
    }
  }

  const transactionMessage = pipe(
    createTransactionMessage({ version: 0 }),
    (tx) => setTransactionMessageFeePayer(payer, tx),
    (tx) => appendTransactionMessageInstructions(ixs, tx),
    (tx) => compressTransactionMessageUsingAddressLookupTables(tx, lutsByAddress),
    (tx) => setTransactionMessageLifetimeUsingBlockhash(INVALID_BUT_SUFFICIENT_FOR_COMPILATION_BLOCKHASH, tx)
  );

  const compiledTransaction = compileTransaction(transactionMessage);
  const wireTransactionBytes = getBase64EncodedWireTransaction(compiledTransaction);

  const res = await rpc
    .simulateTransaction(wireTransactionBytes, {
      encoding: 'base64',
      replaceRecentBlockhash: true,
      sigVerify: false,
    })
    .send();

  return res;
}

export async function fetchBlockhash(rpc: Rpc<GetLatestBlockhashApi>): Promise<BlockhashWithHeight> {
  const res = await rpc.getLatestBlockhash({ commitment: 'finalized' }).send();
  return {
    blockhash: res.value.blockhash,
    lastValidBlockHeight: res.value.lastValidBlockHeight,
    slot: res.context.slot,
  };
}
