import { Address, Rpc, GetMultipleAccountsApi, GetAccountInfoApi, isSome } from '@solana/kit';
import { fetchAllMaybeMint, type Extension } from '@solana-program/token-2022';
import Decimal from 'decimal.js';

/**
 * Extracts the effective scaledUiAmount multiplier from a mint's extensions.
 * Returns 1 if the mint does not have the ScaledUiAmountConfig extension.
 *
 * The multiplier accounts for scheduled updates: if `newMultiplierEffectiveTimestamp`
 * has passed, `newMultiplier` is used instead of `multiplier`.
 */
function getScaledUiAmountMultiplierFromExtensions(extensions: Extension[]): Decimal {
  for (const ext of extensions) {
    if (ext.__kind === 'ScaledUiAmountConfig') {
      const now = Math.floor(Date.now() / 1000);
      const effectiveTimestamp = Number(ext.newMultiplierEffectiveTimestamp);
      if (effectiveTimestamp > 0 && now >= effectiveTimestamp) {
        return new Decimal(ext.newMultiplier);
      }
      return new Decimal(ext.multiplier);
    }
  }
  return new Decimal(1);
}

/**
 * Batch-fetches mint accounts for the given addresses and returns a map of
 * mint address → scaledUiAmount multiplier. Only Token-2022 mints with
 * the ScaledUiAmountConfig extension will have multiplier !== 1.
 *
 * Mints that fail to fetch are silently skipped (multiplier defaults to 1).
 */
export async function fetchScaledUiAmountMultipliers(
  rpc: Rpc<GetMultipleAccountsApi & GetAccountInfoApi>,
  mintAddresses: Address[]
): Promise<Map<Address, Decimal>> {
  const result = new Map<Address, Decimal>();

  if (mintAddresses.length === 0) {
    return result;
  }

  const mintAccounts = await fetchAllMaybeMint(rpc, mintAddresses);

  for (let i = 0; i < mintAccounts.length; i++) {
    const account = mintAccounts[i];
    if (!account.exists) {
      continue;
    }

    const extensions = account.data.extensions;
    if (isSome(extensions)) {
      const multiplier = getScaledUiAmountMultiplierFromExtensions(extensions.value);
      if (!multiplier.eq(1)) {
        result.set(mintAddresses[i], multiplier);
      }
    }
  }

  return result;
}
