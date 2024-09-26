import Decimal from 'decimal.js';

import {
  AddressLookupTableAccount,
  Commitment,
  ComputeBudgetProgram,
  Connection,
  Keypair,
  PublicKey,
  SendOptions,
  Signer,
  Transaction,
  TransactionInstruction,
  TransactionMessage,
  TransactionResponse,
  TransactionSignature,
  VersionedTransaction,
  VersionedTransactionResponse,
} from '@solana/web3.js';
import { fromTxError } from '../idl_codegen/errors';
import { sleep } from '../classes/utils';
import { batchFetch } from '@kamino-finance/kliquidity-sdk';

export async function buildAndSendTxnWithLogs(
  c: Connection,
  tx: VersionedTransaction,
  owner: Keypair,
  signers: Signer[],
  withLogsIfSuccess: boolean = false,
  withDescription: string = ''
): Promise<TransactionSignature> {
  tx.sign([owner, ...signers]);

  try {
    const sig: string = await sendAndConfirmVersionedTransaction(c, tx, 'confirmed', {
      preflightCommitment: 'processed',
    });
    console.log('Transaction Hash:', withDescription, sig);
    if (withLogsIfSuccess) {
      await sleep(5000);
      const res = await c.getTransaction(sig, {
        commitment: 'confirmed',
        maxSupportedTransactionVersion: 6,
      });
      console.log('Transaction Logs:\n', res?.meta?.logMessages);
    }
    return sig;
  } catch (e: any) {
    console.log(e);
    process.stdout.write(e.logs.toString());
    await sleep(5000);
    const sig = e.toString().split(' failed ')[0].split('Transaction ')[1];
    const res: VersionedTransactionResponse | null = await c.getTransaction(sig, {
      commitment: 'confirmed',
      maxSupportedTransactionVersion: 6,
    });
    console.log('Txn', res!.meta!.logMessages);
    return sig;
  }
}

export async function buildAndSendTxn(
  c: Connection,
  owner: Keypair,
  ixns: TransactionInstruction[],
  signers: Signer[],
  lutAddresses: PublicKey[] = [],
  description: string = ''
): Promise<TransactionSignature> {
  const tx = await buildVersionedTransaction(c, owner.publicKey, ixns, lutAddresses);

  return await buildAndSendTxnWithLogs(c, tx, owner, signers, true, description);
}

export async function sendAndConfirmVersionedTransaction(
  c: Connection,
  tx: VersionedTransaction,
  commitment: Commitment = 'confirmed',
  sendTransactionOptions: SendOptions = { preflightCommitment: 'processed' }
) {
  const defaultOptions: SendOptions = { skipPreflight: true };
  const txId = await c.sendTransaction(tx, { ...defaultOptions, ...sendTransactionOptions });

  const latestBlockHash = await c.getLatestBlockhash('finalized');
  const t = await c.confirmTransaction(
    {
      blockhash: latestBlockHash.blockhash,
      lastValidBlockHeight: latestBlockHash.lastValidBlockHeight,
      signature: txId,
    },
    commitment
  );
  if (t.value && t.value.err) {
    const txDetails = await c.getTransaction(txId, {
      maxSupportedTransactionVersion: 0,
      commitment: 'confirmed',
    });
    if (txDetails) {
      throw { err: txDetails.meta?.err, logs: txDetails.meta?.logMessages || [] };
    }
    throw t.value.err;
  }
  return txId;
}

export async function simulateTxn(c: Connection, tx: Transaction, owner: Keypair, signers: Signer[]) {
  const { blockhash } = await c.getLatestBlockhash();
  tx.recentBlockhash = blockhash;
  tx.feePayer = owner.publicKey;

  try {
    const simulation = await c.simulateTransaction(tx, [owner, ...signers]);
    console.log('Transaction Hash:', simulation);
  } catch (e: any) {
    console.log(e);
    process.stdout.write(e.logs.toString());
    await sleep(5000);
    const sig = e.toString().split(' failed ')[0].split('Transaction ')[1];
    const res: TransactionResponse | null = await c.getTransaction(sig, {
      commitment: 'confirmed',
    });
    console.log('Txn', res!.meta!.logMessages);
    return sig;
  }
}

export function buildComputeBudgetIx(units: number): TransactionInstruction {
  return ComputeBudgetProgram.setComputeUnitLimit({ units });
}

/**
 * Send a transaction with optional address lookup tables
 * Translates anchor errors into anchor error types
 * @param connection
 * @param payer
 * @param instructions
 * @param lookupTables
 */
export async function sendTransactionV0(
  connection: Connection,
  payer: Keypair,
  instructions: TransactionInstruction[],
  lookupTables: AddressLookupTableAccount[] | undefined = undefined,
  options?: SendOptions
): Promise<string> {
  const recentBlockhash = (await connection.getLatestBlockhash()).blockhash;

  const messageV0 = new TransactionMessage({
    payerKey: payer.publicKey,
    recentBlockhash,
    instructions,
  }).compileToV0Message(lookupTables);

  const tx = new VersionedTransaction(messageV0);
  tx.sign([payer]);
  try {
    return await connection.sendTransaction(tx, options);
  } catch (err) {
    throw fromTxError(err) ?? err;
  }
}

export async function simulateTransactionV0(
  connection: Connection,
  payer: Keypair,
  instructions: TransactionInstruction[],
  lookupTables: AddressLookupTableAccount[] | undefined = undefined
) {
  const recentBlockhash = (await connection.getLatestBlockhash()).blockhash;

  const messageV0 = new TransactionMessage({
    payerKey: payer.publicKey,
    recentBlockhash,
    instructions,
  }).compileToV0Message(lookupTables);

  const tx = new VersionedTransaction(messageV0);
  tx.sign([payer]);
  try {
    return await connection.simulateTransaction(tx);
  } catch (err) {
    throw fromTxError(err) ?? err;
  }
}

export const buildVersionedTransaction = async (
  connection: Connection,
  payer: PublicKey,
  instructions: TransactionInstruction[],
  lookupTables: PublicKey[] = []
): Promise<VersionedTransaction> => {
  const blockhash = await connection.getLatestBlockhash('confirmed').then((res) => res.blockhash);

  const lookupTablesAccounts = await Promise.all(
    lookupTables.map((address) => {
      return getLookupTableAccount(connection, address);
    })
  );

  const messageV0 = new TransactionMessage({
    payerKey: payer,
    recentBlockhash: blockhash,
    instructions,
  }).compileToV0Message(lookupTablesAccounts.filter(notEmpty));

  return new VersionedTransaction(messageV0);
};

export const getLookupTableAccount = async (connection: Connection, address: PublicKey) => {
  return connection.getAddressLookupTable(address).then((res) => res.value);
};

export async function getLookupTableAccounts(
  connection: Connection,
  addresses: PublicKey[]
): Promise<AddressLookupTableAccount[]> {
  const lookupTableAccounts: AddressLookupTableAccount[] = [];
  const accountInfos = await batchFetch(addresses, (batch) => connection.getMultipleAccountsInfo(batch));
  for (let i = 0; i < addresses.length; i++) {
    const info = accountInfos[i];
    if (!info) {
      throw new Error(`Lookup table ${addresses[i]} is not found`);
    }
    lookupTableAccounts.push(
      new AddressLookupTableAccount({
        key: addresses[i],
        state: AddressLookupTableAccount.deserialize(info.data),
      })
    );
  }
  return lookupTableAccounts;
}

export const getComputeBudgetAndPriorityFeeIxns = (
  units: number,
  priorityFeeLamports?: Decimal
): TransactionInstruction[] => {
  const ixns: TransactionInstruction[] = [];
  ixns.push(ComputeBudgetProgram.setComputeUnitLimit({ units }));

  if (priorityFeeLamports && priorityFeeLamports.gt(0)) {
    const unitPrice = priorityFeeLamports.mul(10 ** 6).div(units);
    ixns.push(ComputeBudgetProgram.setComputeUnitPrice({ microLamports: BigInt(unitPrice.floor().toString()) }));
  }

  return ixns;
};

// filters null values from array and make typescript happy
export function notEmpty<TValue>(value: TValue | null | undefined): value is TValue {
  if (value === null || value === undefined) {
    return false;
  }
  //
  // eslint-disable-next-line no-unused-vars,@typescript-eslint/no-unused-vars
  const testDummy: TValue = value;
  return true;
}
