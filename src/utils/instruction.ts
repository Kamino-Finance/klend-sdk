import Decimal from 'decimal.js';

import { Address, Instruction, Rpc, GetMultipleAccountsApi, Account, isAddress } from '@solana/kit';
import { batchFetch } from '@kamino-finance/kliquidity-sdk';
import { getSetComputeUnitLimitInstruction, getSetComputeUnitPriceInstruction } from '@solana-program/compute-budget';
import { AddressLookupTable, fetchAllAddressLookupTable } from '@solana-program/address-lookup-table';
import { COMPUTE_BUDGET_PROGRAM_ID } from './pubkey';

export function buildComputeBudgetIx(units: number): Instruction {
  return getSetComputeUnitLimitInstruction({ units });
}

export async function getLookupTableAccounts(
  rpc: Rpc<GetMultipleAccountsApi>,
  addresses: Address[]
): Promise<Account<AddressLookupTable>[]> {
  return batchFetch(addresses, (batch) => fetchAllAddressLookupTable(rpc, batch));
}

export const getComputeBudgetAndPriorityFeeIxs = (units: number, priorityFeeLamports?: Decimal): Instruction[] => {
  const ixs: Instruction[] = [];
  ixs.push(getSetComputeUnitLimitInstruction({ units }));

  if (priorityFeeLamports && priorityFeeLamports.gt(0)) {
    const unitPrice = priorityFeeLamports.mul(10 ** 6).div(units);
    ixs.push(getSetComputeUnitPriceInstruction({ microLamports: BigInt(unitPrice.floor().toString()) }));
  }

  return ixs;
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

export function uniqueAccountsWithProgramIds(
  ixs: Instruction[],
  addressLookupTables: Address[] | Account<AddressLookupTable>[] = []
): Array<Address> {
  let luts: Address[];
  if (
    addressLookupTables.length > 0 &&
    typeof addressLookupTables[0] === 'string' &&
    isAddress(addressLookupTables[0])
  ) {
    luts = addressLookupTables as Address[];
  } else {
    luts = (addressLookupTables as Account<AddressLookupTable>[]).map((lut) => lut.address);
  }

  const uniqueAccounts = new Set<Address>(luts);
  ixs.forEach((ix) => {
    uniqueAccounts.add(ix.programAddress);
    (ix.accounts || []).forEach((key) => {
      uniqueAccounts.add(key.address);
    });
  });

  return [...uniqueAccounts];
}

export function removeBudgetIxs(ixs: Instruction[]): Instruction[] {
  return ixs.filter(({ programAddress }) => {
    return programAddress !== COMPUTE_BUDGET_PROGRAM_ID;
  });
}
