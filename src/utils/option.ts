import { Address, isNone, Option } from '@solana/kit';
import { DEFAULT_PUBLIC_KEY } from './pubkey';

export function defaultPubkeyIfNone(address: Option<Address>): Address {
  if (isNone(address)) {
    return DEFAULT_PUBLIC_KEY;
  }
  return address.value;
}
