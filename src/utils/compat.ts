import { PublicKey, AccountInfo } from '@solana/web3.js';
import { Address, Base64EncodedDataResponse, Account } from '@solana/kit';
import { Buffer } from 'buffer';

export function toLegacyPublicKey(address: Address): PublicKey {
  return new PublicKey(address.toString());
}

export function toAccountInfo(acc: Account<Base64EncodedDataResponse>): AccountInfo<Buffer> {
  return {
    owner: toLegacyPublicKey(acc.programAddress),
    data: Buffer.from(acc.data[0], 'base64'),
    lamports: Number.parseInt(acc.lamports.toString()),
    executable: acc.executable,
    rentEpoch: 0,
  };
}
