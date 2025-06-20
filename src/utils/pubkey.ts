import { address, Address } from '@solana/kit';

export const DEFAULT_PUBLIC_KEY: Address = address('11111111111111111111111111111111');
export const WRAPPED_SOL_MINT: Address = address('So11111111111111111111111111111111111111112');
export const NULL_PUBKEY: Address = address('nu11111111111111111111111111111111111111111');
export const COMPUTE_BUDGET_PROGRAM_ID: Address = address('ComputeBudget111111111111111111111111111111');

/**
 * Helper function to check if a configured pubkey is null or default.
 * @param pubkey
 * @returns {boolean}
 */
export function isNotNullPubkey(pubkey: Address): boolean {
  return pubkey && pubkey !== NULL_PUBKEY && pubkey !== DEFAULT_PUBLIC_KEY;
}
