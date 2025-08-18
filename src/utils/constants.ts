import Decimal from 'decimal.js';
import { PROGRAM_ID } from '../@codegen/klend/programId';
import { address, Address } from '@solana/kit';
import BN from 'bn.js';

export const STAGING_PROGRAM_ID: Address = address('SLendK7ySfcEzyaFqy93gDnD3RtrpXJcnRwb6zFHJSh');
export const DEFAULT_KLEND_PROGRAM_ID: string = PROGRAM_ID.toString();
export const U64_MAX = '18446744073709551615';
const INITIAL_COLLATERAL_RATIO = 1;
export const INITIAL_COLLATERAL_RATE = new Decimal(INITIAL_COLLATERAL_RATIO);

export const SECONDS_PER_YEAR = 365.242_199 * 24.0 * 60.0 * 60.0;

export const TOTAL_NUMBER_OF_IDS_TO_CHECK = 25;

export type ENV = 'mainnet-beta' | 'devnet' | 'localnet';

export function isENV(value: any): value is ENV {
  return value === 'mainnet-beta' || value === 'devnet' || value === 'localnet';
}

export function getApiEndpoint(programId: Address, apiBaseUrl: string = 'https://api.kamino.finance') {
  if (programId === PROGRAM_ID) {
    return `${apiBaseUrl}/v2/kamino-market`;
  } else {
    return `${apiBaseUrl}/v2/kamino-market/?programId=${programId.toString()}`;
  }
}

export const CDN_ENDPOINT = 'https://cdn.kamino.finance';

export const ONE_HUNDRED_PCT_IN_BPS = 10_000;

export function getProgramId(env: 'mainnet-beta' | 'staging' = 'mainnet-beta') {
  if (env === 'mainnet-beta') {
    return PROGRAM_ID;
  } else {
    return STAGING_PROGRAM_ID;
  }
}

/**
 * Number of slots per second
 */
export const SLOTS_PER_SECOND = 2;

/**
 * Number of slots per minute
 * 2 (slots per second) * 60 = 120
 */
export const SLOTS_PER_MINUTE = SLOTS_PER_SECOND * 60;

/**
 * Number of slots per hour
 * 2 (slots per second) * 60 * 60 = 7200
 */
export const SLOTS_PER_HOUR = SLOTS_PER_MINUTE * 60;

/**
 * Number of slots per day
 * 2 (slots per second) * 60 * 60 * 24 = 172800
 */
export const SLOTS_PER_DAY = SLOTS_PER_HOUR * 24;

/**
 * Number of slots per year
 * 2 (slots per second) * 60 * 60 * 24 * 365 = 63072000
 */
export const SLOTS_PER_YEAR = SLOTS_PER_DAY * 365;

/**
 * Minimum bonus for autodeleverage liquidations in bps
 */
export const MIN_AUTODELEVERAGE_BONUS_BPS = 50;

export const SOL_DECIMALS = 9;

export const BORROWS_LIMIT = 5;
export const DEPOSITS_LIMIT = 8;

export const DEFAULT_MAX_COMPUTE_UNITS = 1_400_000;

/**
 * Padding for safe interest calculations
 */
export const SOL_PADDING_FOR_INTEREST = new BN('1000000');

/**
 * Minimum initial deposit required for the initialization of a reserve
 */
export const MIN_INITIAL_DEPOSIT = 100_000;
export const MIN_VAULT_INITIAL_DEPOSIT = 1_000_000_000;

export const VAULT_INITIAL_DEPOSIT = 1000;
