import { Keypair, PublicKey } from '@solana/web3.js';
import { Env, createLookupTable } from './setup_utils';
import {
  KaminoMarket,
  KaminoObligation,
  buildVersionedTransaction,
  getRepayWithCollIxns,
  getUserLutAddressAndSetupIxns,
  sendAndConfirmVersionedTransaction,
  sleep,
} from '../src';
import Decimal from 'decimal.js';
import { getLocalSwapper } from './leverage_utils';

export const repayWithCollTestAdapter = async (
  env: Env,
  owner: Keypair,
  kaminoMarket: KaminoMarket,
  amount: Decimal,
  debtTokenMint: PublicKey,
  collTokenMint: PublicKey,
  isClosingPosition: boolean,
  slippagePct: number,
  obligation: KaminoObligation,
  getJupPrice: (inputMint: PublicKey, outputMint: PublicKey) => Promise<number>,
  referrer: PublicKey = PublicKey.default
) => {
  if (!amount) {
    return;
  }

  const priceDebtToColl = new Decimal(await getJupPrice(debtTokenMint, collTokenMint));
  if (!priceDebtToColl) {
    throw new Error('Price is not loaded. Please, reload the page and try again');
  }

  let userLut: PublicKey | undefined = undefined;
  const [userLookupTable, txsIxns] = await getUserLutAddressAndSetupIxns(
    kaminoMarket,
    owner.publicKey,
    referrer,
    false
  );

  userLut = userLookupTable;
  for (const txIxns of txsIxns) {
    const tx = await buildVersionedTransaction(env.provider.connection, owner.publicKey, txIxns);
    tx.sign([owner]);

    const _txid = await sendAndConfirmVersionedTransaction(env.provider.connection, tx, 'confirmed');
    await sleep(1000);
  }

  const { ixns, lookupTablesAddresses, swapInputs } = await getRepayWithCollIxns({
    kaminoMarket,
    amount,
    debtTokenMint,
    collTokenMint,
    owner: owner.publicKey,
    priceDebtToColl,
    slippagePct: new Decimal(slippagePct),
    isClosingPosition,
    obligation,
    referrer,
    swapper: getLocalSwapper(env, kaminoMarket, owner.publicKey),
  });

  // Create lookup table
  const lookupTable = await createLookupTable(
    env,
    ixns
      .map((ixn) => ixn.keys)
      .flat()
      .map((key) => key.pubkey)
  );
  await sleep(2000);

  const lookupTables: PublicKey[] = [...lookupTablesAddresses, lookupTable];
  if (userLut) {
    lookupTables.push(userLut);
  }

  const tx = await buildVersionedTransaction(env.provider.connection, owner.publicKey, ixns, lookupTables);
  tx.sign([owner]);
  tx.sign([env.admin]);

  const txid = await sendAndConfirmVersionedTransaction(env.provider.connection, tx, 'confirmed');
  return {
    txid,
    swapInputs,
  };
};
