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

/**
 * This method retuns an instruction that creates a lookup table, alongside the pubkey of the lookup table
 * @param payer - the owner of the lookup table
 * @param slot - the current slot
 * @returns - the instruction to create the lookup table and its address
 */
export function initLookupTableIx(payer: PublicKey, slot: number): [TransactionInstruction, PublicKey] {
  const [ixn, address] = AddressLookupTableProgram.createLookupTable({
    authority: payer,
    payer,
    recentSlot: slot,
  });

  return [ixn, address];
}

/**
 * This method retuns an instruction that deactivates a lookup table, which is needed to close it
 * @param payer - the owner of the lookup table
 * @param lookupTable - the lookup table to deactivate
 * @returns - the instruction to deactivate the lookup table
 */
export function deactivateLookupTableIx(payer: PublicKey, lookupTable: PublicKey): TransactionInstruction {
  const ixn = AddressLookupTableProgram.deactivateLookupTable({
    authority: payer,
    lookupTable: lookupTable,
  });

  return ixn;
}

/**
 * This method returns an instruction that closes a lookup table. That lookup table needs to be disabled at least 500 blocks before closing it.
 * @param payer - the owner of the lookup table
 * @param lookupTable - the lookup table to close
 * @returns - the instruction to close the lookup table
 */
/// this require the LUT to be deactivated at least 500 blocks before
export function closeLookupTableIx(payer: PublicKey, lookupTable: PublicKey): TransactionInstruction {
  const ixn = AddressLookupTableProgram.closeLookupTable({
    authority: payer,
    recipient: payer,
    lookupTable: lookupTable,
  });

  return ixn;
}

/**
 * Returns the accounts in a lookup table
 * @param lookupTable - lookup table to get the accounts from
 * @returns - an array of accounts in the lookup table
 */
export async function getAccountsInLUT(connection: Connection, lookupTable: PublicKey): Promise<PublicKey[]> {
  const lutState = await connection.getAddressLookupTable(lookupTable);
  if (!lutState || !lutState.value) {
    throw new Error(`Lookup table ${lookupTable} not found`);
  }

  return lutState.value.state.addresses;
}
