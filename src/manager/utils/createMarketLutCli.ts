import { Address, TransactionSigner } from '@solana/kit';
import { SendTxMode } from '../tx/ManagerEnv';
import { noopSigner } from '../../utils/signer';

export type CreateMarketLutCliOptions = {
  mode: SendTxMode;
  multisig?: string;
  existingLut?: string;
  signer?: string;
};

/**
 * Validate create-market-lut CLI option combinations before env/RPC setup.
 * Multisig mode may only extend an existing LUT (createLookupTable recentSlot expires before approval)
 * and always uses --multisig as authority/payer (not --signer / ADMIN).
 */
export function assertCreateMarketLutCliOptions(opts: CreateMarketLutCliOptions): void {
  if (opts.mode !== 'multisig') {
    return;
  }
  if (!opts.multisig) {
    throw new Error('If using multisig mode, multisig is required');
  }
  if (!opts.existingLut) {
    throw new Error(
      'mode=multisig requires --existing-lut for an existing LUT already controlled by --multisig: createLookupTable recentSlot can expire before multisig approval, and a LUT created with --mode execute can have a different authority'
    );
  }
  if (opts.signer) {
    throw new Error('--signer cannot be used with --mode multisig; --multisig selects the LUT authority/payer');
  }
}

/**
 * Resolve the LUT authority/payer for create-market-lut.
 * In multisig mode this is always the --multisig address (noop signer).
 */
export function resolveCreateMarketLutTxSigner(
  mode: SendTxMode,
  multisig: Address | undefined,
  signerOverride: TransactionSigner | undefined,
  defaultSigner: TransactionSigner | undefined
): TransactionSigner {
  switch (mode) {
    case 'multisig':
      if (!multisig) {
        throw new Error('If using multisig mode, multisig is required');
      }
      return noopSigner(multisig);
    case 'simulate':
    case 'execute':
    case 'print':
      if (signerOverride) {
        return signerOverride;
      }
      if (!defaultSigner) {
        throw new Error('No signer available for create-market-lut');
      }
      return defaultSigner;
    default: {
      const _exhaustive: never = mode;
      throw new Error(`Unhandled mode: ${_exhaustive}`);
    }
  }
}
