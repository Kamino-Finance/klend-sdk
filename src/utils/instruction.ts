import Decimal from 'decimal.js';

import { Address, Instruction, Rpc, GetMultipleAccountsApi, Account, isAddress } from '@solana/kit';
import { batchFetch } from '@kamino-finance/kliquidity-sdk';
import { getSetComputeUnitLimitInstruction, getSetComputeUnitPriceInstruction } from '@solana-program/compute-budget';
import { AddressLookupTable, fetchAllAddressLookupTable } from '@solana-program/address-lookup-table';
import { COMPUTE_BUDGET_PROGRAM_ID } from './pubkey';
// Type-only import: erased at compile time, so it introduces no runtime dependency on (and no import cycle with)
// the higher-level leverage module — these stubs are values but their provider TYPES live there.
import type { SwapIxsProvider, SwapQuoteProvider } from '../leverage/types';

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

/**
 * The set of unique accounts (including program ids) the klend instructions of a flash-loan + swap operation
 * consume, plus their count. This is the exact footprint the operation reserves for its klend side, so an
 * external swap provider knows how many accounts remain available within the transaction's account limit.
 *
 * Returned by the light `get*KlendAccounts` helpers (one per operation family) so the FE can size an operation's
 * klend footprint without running the quoter/swapper. The count is accurate and final: the operations compute
 * `klendAccounts` from their klend ixs *before* quoting and pass that same set to the quoter, and the set is
 * invariant to the (still-unknown) swap amounts — it depends only on the routing, reserves and obligation.
 *
 * Note: "routing" includes the flash-borrow side where that changes which reserve is flashed. For
 * repay-with-collateral the debt-flash and coll-flash routes flash different reserves (and so reference a
 * different fee vault), so its helper takes `flashBorrowType`; pass the same value the operation will use.
 */
export type KlendAccountsResult = {
  /** `klendAccounts.length`, surfaced explicitly for convenience. */
  count: number;
  /** The unique klend accounts (and program ids) the operation uses. */
  klendAccounts: Array<Address>;
};

/** Wraps a unique-accounts list into the {@link KlendAccountsResult} the light `get*KlendAccounts` helpers return. */
export function toKlendAccountsResult(klendAccounts: Array<Address>): KlendAccountsResult {
  return { count: klendAccounts.length, klendAccounts };
}

// The quoter/swapper are never invoked while discovering the klend account footprint (the operations compute the
// account set before quoting); these shared stubs satisfy the operation's `quoter`/`swapper` params and throw if
// that contract is ever broken. Used by the swap-coll and swap-debt light `get*KlendAccounts` helpers.
export const ACCOUNT_DISCOVERY_QUOTER: SwapQuoteProvider<unknown> = () => {
  throw new Error('quoter is not used for klend account discovery');
};
export const ACCOUNT_DISCOVERY_SWAPPER: SwapIxsProvider<unknown> = () => {
  throw new Error('swapper is not used for klend account discovery');
};

export function removeBudgetIxs(ixs: Instruction[]): Instruction[] {
  return ixs.filter(({ programAddress }) => {
    return programAddress !== COMPUTE_BUDGET_PROGRAM_ID;
  });
}
