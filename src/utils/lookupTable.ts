import { AddressLookupTableProgram, Connection, PublicKey, TransactionInstruction } from '@solana/web3.js';

export async function printAddressLookupTable(connection: Connection, lookupTablePk: PublicKey) {
  const lookupTableAccount = (await connection.getAddressLookupTable(lookupTablePk)).value;
  if (!lookupTableAccount) {
    console.error('Lookup table is not found');
  }
  console.log(`Lookup table account, ${lookupTablePk.toString()}`);
  lookupTableAccount?.state.addresses.forEach((address: PublicKey, index: number) => {
    console.log(`Address: ${address.toString()} at index ${index}`);
  });
}

export async function createLookupTableIx(
  connection: Connection,
  wallet: PublicKey
): Promise<[TransactionInstruction, PublicKey]> {
  const [createLookupTableIxs, lookupTableAddress] = AddressLookupTableProgram.createLookupTable({
    authority: wallet,
    payer: wallet,
    recentSlot: await connection.getSlot('confirmed'),
  });

  return [createLookupTableIxs, lookupTableAddress];
}

export function extendLookupTableChunkIx(
  wallet: PublicKey,
  lookupTablePk: PublicKey,
  keys: PublicKey[],
  payer: PublicKey = PublicKey.default
): TransactionInstruction {
  return AddressLookupTableProgram.extendLookupTable({
    authority: wallet,
    payer: payer.equals(PublicKey.default) ? wallet : payer,
    lookupTable: lookupTablePk,
    addresses: keys,
  });
}

export const extendLookupTableIxs = (
  wallet: PublicKey,
  table: PublicKey,
  keys: PublicKey[],
  payer: PublicKey = PublicKey.default
): TransactionInstruction[] => {
  const chunkSize = 25;
  const extendLookupIxs: TransactionInstruction[] = [];
  for (let i = 0; i < keys.length; i += chunkSize) {
    const chunk = keys.slice(i, i + chunkSize);
    extendLookupIxs.push(extendLookupTableChunkIx(wallet, table, chunk, payer));
  }

  return extendLookupIxs;
};
