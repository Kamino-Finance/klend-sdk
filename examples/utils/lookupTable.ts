import { Address, Instruction, TransactionSigner } from '@solana/kit';
import { fetchAllAddressLookupTable } from '@solana-program/address-lookup-table';
import {
  createLookupTableIx,
  DEFAULT_PUBLIC_KEY,
  DEFAULT_RECENT_SLOT_DURATION_MS,
  extendLookupTableIxs,
  sleep,
} from '@kamino-finance/klend-sdk';
import { ConnectionPool } from './connection';
import { getCompiledTransactionSize, sendAndConfirmTx } from './tx';

export async function getAccountsFromIxs(ixs: Instruction[]): Promise<Address[]> {
  return [
    ...new Set<Address>(
      ixs.flatMap((ix) => [ix.programAddress, ...(ix.accounts?.map((account) => account.address) ?? [])])
    ),
  ];
}

export async function ensureTransactionFitsWithLookupTable(
  connection: ConnectionPool,
  payer: TransactionSigner,
  ixs: Instruction[],
  existingLookupTableAddresses: Address[]
): Promise<Address[]> {
  const lookupTableAddresses = [
    ...new Set(existingLookupTableAddresses.filter((lookupTable) => lookupTable !== DEFAULT_PUBLIC_KEY)),
  ];
  const lookupTables =
    lookupTableAddresses.length === 0 ? [] : await fetchAllAddressLookupTable(connection.rpc, lookupTableAddresses);
  if (getCompiledTransactionSize(payer.address, ixs, lookupTables).fitsPacketLimit) {
    return lookupTableAddresses;
  }

  const coveredAddresses = new Set(lookupTables.flatMap((lookupTable) => lookupTable.data.addresses));
  const addressesToAdd = (await getAccountsFromIxs(ixs)).filter(
    (account) => account !== DEFAULT_PUBLIC_KEY && !coveredAddresses.has(account)
  );
  if (addressesToAdd.length === 0) {
    throw new Error('The transaction exceeds 1,232 bytes, but a supplemental lookup table cannot reduce its size');
  }

  const [createIx, supplementalLookupTable] = await createLookupTableIx(connection.rpc, payer);
  await sendAndConfirmTx(connection, payer, [createIx], [], [], 'CreateSupplementalLookupTable');
  for (const extendIx of extendLookupTableIxs(payer, supplementalLookupTable, addressesToAdd)) {
    await sendAndConfirmTx(connection, payer, [extendIx], [], [], 'ExtendSupplementalLookupTable');
  }

  const lastExtensionSlot = await connection.rpc.getSlot().send();
  let currentSlot = lastExtensionSlot;
  while (currentSlot <= lastExtensionSlot) {
    await sleep(DEFAULT_RECENT_SLOT_DURATION_MS);
    currentSlot = await connection.rpc.getSlot().send();
  }

  lookupTableAddresses.push(supplementalLookupTable);
  const updatedLookupTables = await fetchAllAddressLookupTable(connection.rpc, lookupTableAddresses);
  const updatedSize = getCompiledTransactionSize(payer.address, ixs, updatedLookupTables);
  if (!updatedSize.fitsPacketLimit) {
    throw new Error(
      `The transaction is ${updatedSize.rawBytes} raw bytes after lookup-table compression; the Solana limit is 1,232 bytes`
    );
  }

  return lookupTableAddresses;
}
