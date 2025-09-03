import {
  Account,
  AddressesByLookupTableAddress,
  appendTransactionMessageInstructions,
  Blockhash,
  compressTransactionMessageUsingAddressLookupTables,
  createTransactionMessage,
  FullySignedTransaction,
  getBase64EncodedWireTransaction,
  GetEpochInfoApi,
  GetLatestBlockhashApi,
  getSignatureFromTransaction,
  GetSignatureStatusesApi,
  Instruction,
  pipe,
  RpcSubscriptions,
  sendAndConfirmTransactionFactory,
  SendTransactionApi,
  setTransactionMessageFeePayerSigner,
  setTransactionMessageLifetimeUsingBlockhash,
  Signature,
  SignatureNotificationsApi,
  signTransactionMessageWithSigners,
  SlotNotificationsApi,
  TransactionSigner,
  TransactionWithBlockhashLifetime,
} from '@solana/kit';
import { Rpc } from '@solana/kit';
import { AddressLookupTable } from '@solana-program/address-lookup-table';
import { ManagerConnectionPool } from './ManagerConnectionPool';

export async function sendAndConfirmTx(
  c: ManagerConnectionPool,
  payer: TransactionSigner,
  ixs: Instruction[],
  luts: Account<AddressLookupTable>[] = []
): Promise<Signature> {
  const blockhash = await fetchBlockhash(c.rpc);

  const lutsByAddress: AddressesByLookupTableAddress = {};
  if (luts.length > 0) {
    for (const acc of luts) {
      lutsByAddress[acc.address] = acc.data.addresses;
    }
  }

  const tx = await pipe(
    createTransactionMessage({ version: 0 }),
    (tx) => appendTransactionMessageInstructions(ixs, tx),
    (tx) => setTransactionMessageFeePayerSigner(payer, tx),
    (tx) => setTransactionMessageLifetimeUsingBlockhash(blockhash, tx),
    (tx) => compressTransactionMessageUsingAddressLookupTables(tx, lutsByAddress),
    (tx) => signTransactionMessageWithSigners(tx)
  );

  const sig = getSignatureFromTransaction(tx);

  try {
    await sendRpc(c, tx, sig, blockhash);
  } catch (e) {
    console.error(`Transaction ${sig} failed:`, e);
    let tx;
    try {
      tx = await c.rpc
        .getTransaction(sig, {
          maxSupportedTransactionVersion: 0,
          commitment: 'confirmed',
          encoding: 'json',
        })
        .send();
    } catch (e2) {
      console.error('Error fetching transaction logs:', e2);
      throw e;
    }
    if (tx && tx.meta?.logMessages) {
      console.log('Transaction logs:', tx.meta.logMessages);
    } else {
      console.log('Transaction logs not found');
    }
    throw e;
  }

  return sig;
}

export type BlockhashWithHeight = {
  blockhash: Blockhash;
  lastValidBlockHeight: bigint;
  slot: bigint;
};

export async function fetchBlockhash(rpc: Rpc<GetLatestBlockhashApi>): Promise<BlockhashWithHeight> {
  const res = await rpc.getLatestBlockhash({ commitment: 'finalized' }).send();
  return {
    blockhash: res.value.blockhash,
    lastValidBlockHeight: res.value.lastValidBlockHeight,
    slot: res.context.slot,
  };
}

async function sendRpc(
  c: ManagerConnectionPool,
  tx: FullySignedTransaction & TransactionWithBlockhashLifetime,
  sig: Signature,
  blockhash: BlockhashWithHeight
) {
  if (c.shouldSpam) {
    let confirmed = false;
    let intervalId: NodeJS.Timeout | undefined = undefined;
    const stopSendingTx = () => {
      if (intervalId) {
        clearInterval(intervalId);
      }
    };

    const send = () => {
      if (confirmed) {
        return;
      }
      console.log(`Spamming tx ${sig}`);
      sendTx(c.rpc, tx, blockhash).catch((e) => console.log(`Spamming tx failed`, e));
    };

    intervalId = setInterval(() => {
      send();
    }, 2000);

    await sendAndConfirmTxImpl(c, tx, blockhash.slot)
      .then(() => {
        confirmed = true;
        console.log(`Success ${sig}`);
        stopSendingTx();
        return sig;
      })
      .catch((e) => {
        stopSendingTx();
        throw e;
      })
      .finally(() => stopSendingTx());
    return sig;
  } else {
    await sendAndConfirmTxImpl(c, tx, blockhash.slot);
    console.log(`Success ${sig}`);
    return sig;
  }
}

export async function sendAndConfirmTxImpl(
  {
    rpc,
    wsRpc,
  }: {
    rpc: Rpc<GetEpochInfoApi & GetSignatureStatusesApi & SendTransactionApi>;
    wsRpc: RpcSubscriptions<SignatureNotificationsApi & SlotNotificationsApi>;
  },
  tx: FullySignedTransaction & TransactionWithBlockhashLifetime,
  slot: bigint
): Promise<void> {
  await sendAndConfirmTransactionFactory({ rpc, rpcSubscriptions: wsRpc })(tx, {
    commitment: 'confirmed',
    preflightCommitment: 'confirmed',
    maxRetries: 0n,
    skipPreflight: true,
    minContextSlot: slot,
  });
}

async function sendTx(
  rpc: Rpc<SendTransactionApi>,
  tx: FullySignedTransaction,
  blockhash: { blockhash: string; slot: bigint }
): Promise<void> {
  const serialized = getBase64EncodedWireTransaction(tx);
  await rpc
    .sendTransaction(serialized, {
      encoding: 'base64',
      preflightCommitment: 'confirmed',
      maxRetries: 0n,
      skipPreflight: true,
      minContextSlot: blockhash.slot,
    })
    .send();
}
