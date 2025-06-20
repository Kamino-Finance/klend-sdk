import {
  Address,
  Rpc,
  GetProgramAccountsApi,
  fetchEncodedAccount,
  GetAccountInfoApi,
  GetProgramAccountsDatasizeFilter,
  GetProgramAccountsMemcmpFilter,
  Account,
} from '@solana/kit';
import { Buffer } from 'buffer';
import { ZSTDDecoder } from 'zstddec';
import type {
  AccountInfoBase,
  AccountInfoWithBase64EncodedZStdCompressedData,
  AccountInfoWithPubkey,
} from '@solana/rpc-types';
import { DataSlice } from '@solana/rpc-types/dist/types/account-filters';

const decoder = new ZSTDDecoder();
(async () => {
  await decoder.init();
})();

/**
 * Uses zstd compression when fetching all accounts owned by a program for a smaller response size
 * Uses axios instead of node-fetch to work around a bug in node-fetch that causes subsequent requests with different encoding to fail
 * @param rpc
 * @param programId
 * @param structSize - the size of the decompressed account data struct
 * @param filters
 * @param dataSlice
 */
export async function getProgramAccounts(
  rpc: Rpc<GetProgramAccountsApi>,
  programId: Address,
  structSize: number,
  filters: (GetProgramAccountsDatasizeFilter | GetProgramAccountsMemcmpFilter)[],
  dataSlice?: DataSlice
): Promise<Account<Buffer>[]> {
  const res = await rpc
    .getProgramAccounts(programId, {
      encoding: 'base64+zstd',
      filters,
      dataSlice,
    })
    .send();
  const deser = res.map(async (account) => await deserializeAccountInfo(account, structSize));
  const x = await Promise.all(deser);
  return x;
}

export async function getAccountOwner(rpc: Rpc<GetAccountInfoApi>, address: Address): Promise<Address> {
  const acc = await fetchEncodedAccount(rpc, address);
  if (!acc.exists) {
    throw Error(`Could not fetch mint ${address.toString()}`);
  }
  return acc.programAddress;
}

async function deserializeAccountInfo(
  accountInfo: AccountInfoWithPubkey<AccountInfoBase & AccountInfoWithBase64EncodedZStdCompressedData>,
  size: number
): Promise<Account<Buffer>> {
  const data = decoder.decode(Buffer.from(accountInfo.account.data[0], 'base64'), size);
  return {
    programAddress: accountInfo.account.owner,
    lamports: accountInfo.account.lamports,
    executable: accountInfo.account.executable,
    space: accountInfo.account.space,
    address: accountInfo.pubkey,
    data: Buffer.from(data),
  };
}
