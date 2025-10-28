import { Address, GetAccountInfoApi, GetSlotApi, Instruction, Rpc, Slot, TransactionSigner } from '@solana/kit';
import {
  fetchAddressLookupTable,
  findAddressLookupTablePda,
  getCloseLookupTableInstruction,
  getCreateLookupTableInstruction,
  getDeactivateLookupTableInstruction,
  getExtendLookupTableInstruction,
} from '@solana-program/address-lookup-table';
import { DEFAULT_PUBLIC_KEY } from './pubkey';
import { SYSTEM_PROGRAM_ADDRESS } from '@solana-program/system';

export async function printAddressLookupTable(rpc: Rpc<GetAccountInfoApi>, lookupTablePk: Address): Promise<void> {
  const lookupTableAccount = (await fetchAddressLookupTable(rpc, lookupTablePk)).data;
  if (!lookupTableAccount) {
    console.error('Lookup table is not found');
  }
  console.log(`Lookup table account, ${lookupTablePk.toString()}`);
  lookupTableAccount.addresses.forEach((address: Address, index: number) => {
    console.log(`Address: ${address.toString()} at index ${index}`);
  });
}

export async function createLookupTableIx(
  connection: Rpc<GetSlotApi>,
  authority: TransactionSigner
): Promise<[Instruction, Address]> {
  const recentSlot = await connection.getSlot({ commitment: 'finalized' }).send();
  return initLookupTableIx(authority, recentSlot);
}

export function extendLookupTableChunkIx(
  authority: TransactionSigner,
  lookupTablePk: Address,
  keys: Address[],
  payer: TransactionSigner = authority
): Instruction {
  return getExtendLookupTableInstruction({
    authority,
    payer,
    address: lookupTablePk,
    addresses: keys,
  });
}

export const extendLookupTableIxs = (
  authority: TransactionSigner,
  table: Address,
  keys: Address[],
  payer: TransactionSigner = authority
): Instruction[] => {
  const chunkSize = 25;
  const extendLookupIxs: Instruction[] = [];
  for (let i = 0; i < keys.length; i += chunkSize) {
    const chunk = keys.slice(i, i + chunkSize);
    extendLookupIxs.push(extendLookupTableChunkIx(authority, table, chunk, payer));
  }
  return extendLookupIxs;
};

/**
 * This method returns an instruction that creates a lookup table, alongside the pubkey of the lookup table
 * @param authority - the owner of the lookup table
 * @param recentSlot - the current slot
 * @returns - the instruction to create the lookup table and its address
 */
export async function initLookupTableIx(
  authority: TransactionSigner,
  recentSlot: Slot
): Promise<[Instruction, Address]> {
  const address = await findAddressLookupTablePda({ authority: authority.address, recentSlot });
  const createLookupTableIx = getCreateLookupTableInstruction({
    authority,
    payer: authority,
    recentSlot,
    address,
  });
  return [createLookupTableIx, address[0]];
}

/**
 * This method retuns an instruction that deactivates a lookup table, which is needed to close it
 * @param authority - the owner of the lookup table
 * @param lookupTable - the lookup table to deactivate
 * @returns - the instruction to deactivate the lookup table
 */
export function deactivateLookupTableIx(authority: TransactionSigner, lookupTable: Address): Instruction {
  return getDeactivateLookupTableInstruction({
    authority,
    address: lookupTable,
  });
}

/**
 * This method returns an instruction that closes a lookup table. That lookup table needs to be disabled at least 500 blocks before closing it.
 * @param authority - the owner of the lookup table
 * @param lookupTable - the lookup table to close
 * @returns - the instruction to close the lookup table
 */
/// this require the LUT to be deactivated at least 500 blocks before
export function closeLookupTableIx(authority: TransactionSigner, lookupTable: Address): Instruction {
  return getCloseLookupTableInstruction({
    authority,
    address: lookupTable,
    recipient: authority.address,
  });
}

/**
 * Returns the accounts in a lookup table
 * @param rpc
 * @param lookupTable - lookup table to get the accounts from
 * @returns - an array of accounts in the lookup table or an empty array if the lookup table does not exist
 */
export async function getAccountsInLut(rpc: Rpc<GetAccountInfoApi>, lookupTable: Address): Promise<Address[]> {
  try {
    const lutState = await fetchAddressLookupTable(rpc, lookupTable);
    return lutState.data.addresses;
  } catch (error) {
    console.error(`Error fetching accounts in lookup table ${lookupTable.toString()}`, error);
    return [];
  }
}
/**
 * This method inserts the missing keys from the provided keys into an existent lookup table
 * @param authority - payer wallet pubkey
 * @param lookupTable - lookup table to insert the keys into
 * @param keys - keys to insert into the lookup table
 * @param [accountsInLut] - the existent accounts in the lookup table. Optional. If provided, the function will not fetch the accounts in the lookup table
 * @returns - an array of instructions to insert the missing keys into the lookup table
 */
export async function insertIntoLookupTableIxs(
  rpc: Rpc<GetAccountInfoApi>,
  authority: TransactionSigner,
  lookupTable: Address,
  keys: Address[],
  accountsInLut?: Address[]
): Promise<Instruction[]> {
  let lutContentsList = accountsInLut;
  if (!accountsInLut) {
    lutContentsList = await getAccountsInLut(rpc, lookupTable);
  } else {
    lutContentsList = accountsInLut;
  }

  const lutContents = new Set<Address>(lutContentsList);

  const missingAccounts = keys.filter((key) => !lutContents.has(key) && key !== DEFAULT_PUBLIC_KEY);
  // deduplicate missing accounts and remove default accounts and convert it back to an array
  const missingAccountsList = [...new Set<Address>(missingAccounts)];

  const chunkSize = 20;
  const ixs: Instruction[] = [];

  for (let i = 0; i < missingAccountsList.length; i += chunkSize) {
    const chunk = missingAccountsList.slice(i, i + chunkSize);
    ixs.push(
      getExtendLookupTableInstruction({
        payer: authority,
        authority,
        address: lookupTable,
        systemProgram: SYSTEM_PROGRAM_ADDRESS,
        addresses: chunk,
      })
    );
  }

  return ixs;
}
