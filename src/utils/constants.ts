import Decimal from 'decimal.js';
import { PROGRAM_ID } from '../idl_codegen/programId';
import { PublicKey } from '@solana/web3.js';

export const STAGING_PROGRAM_ID: PublicKey = new PublicKey('SLendK7ySfcEzyaFqy93gDnD3RtrpXJcnRwb6zFHJSh');
export const DEFAULT_KLEND_PROGRAM_ID: string = PROGRAM_ID.toString();
export const U64_MAX = '18446744073709551615';
const INITIAL_COLLATERAL_RATIO = 1;
export const INITIAL_COLLATERAL_RATE = new Decimal(INITIAL_COLLATERAL_RATIO);

export type ENV = 'mainnet-beta' | 'devnet' | 'localnet';

export function isENV(value: any): value is ENV {
  return value === 'mainnet-beta' || value === 'devnet' || value === 'localnet';
}

export function getApiEndpoint(programId: PublicKey) {
  if (programId.equals(PROGRAM_ID)) {
    return 'https://api.hubbleprotocol.io/v2/kamino-market';
  } else {
    return `https://api.hubbleprotocol.io/v2/kamino-market/?programId=${programId.toString()}`;
  }
}

export const CDN_ENDPOINT = 'https://cdn.kamino.finance/kamino_lend_config_v2.json';

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

/**
 * WSOL Mint
 */
export const WRAPPED_SOL_MINT = new PublicKey('So11111111111111111111111111111111111111112');

/**
 * USDC Mint
 */
export const USDC_MAINNET_MINT = new PublicKey('EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v');
