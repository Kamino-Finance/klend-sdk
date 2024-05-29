import {
  AccountInfo,
  Commitment,
  Connection,
  GetProgramAccountsConfig,
  GetProgramAccountsResponse,
  PublicKey,
  SolanaJSONRPCError,
} from '@solana/web3.js';
import { Buffer } from 'buffer';
import axios from 'axios';
import * as fzstd from 'fzstd';

interface ZstdDecoder {
  decompress: (data: Buffer) => Promise<Buffer>;
}

class JsZstdDecoder implements ZstdDecoder {
  decompress(data: Buffer): Promise<Buffer> {
    return Promise.resolve(Buffer.from(fzstd.decompress(data)));
  }
}

let zstdDecoder: ZstdDecoder = new JsZstdDecoder();

export function setZstdDecoder(decoder: ZstdDecoder) {
  zstdDecoder = decoder;
}

const COMMON_HTTP_HEADERS: Record<string, string> = {
  'solana-client': `@kamino-finance/klend-sdk-${process.env.npm_package_version ?? 'UNKNOWN'}`,
};

/**
 * Uses zstd compression when fetching all accounts owned by a program for a smaller response size
 * Uses axios instead of node-fetch to work around a bug in node-fetch that causes subsequent requests with different encoding to fail
 * @param connection
 * @param programId
 * @param configOrCommitment
 * @param additionalHeaders
 */
export async function getProgramAccounts(
  connection: Connection,
  programId: PublicKey,
  configOrCommitment?: GetProgramAccountsConfig | Commitment,
  additionalHeaders: Record<string, string> = {}
): Promise<GetProgramAccountsResponse> {
  const programIdStr = programId.toBase58();
  const { commitment, config } = extractCommitmentFromConfig(configOrCommitment);
  const { encoding: _encoding, ...configWithoutEncoding } = config || {};
  // Use axios here to work around a bug in node fetch that causes subsequent requests with different encoding to fail
  // https://github.com/node-fetch/node-fetch/issues/1767
  const response = await axios.post(
    connection.rpcEndpoint,
    {
      method: 'getProgramAccounts',
      jsonrpc: '2.0',
      params: [
        programIdStr,
        {
          encoding: 'base64+zstd',
          commitment,
          ...configWithoutEncoding,
        },
      ],
      id: crypto.randomUUID(),
    },
    {
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        ...COMMON_HTTP_HEADERS,
        ...additionalHeaders,
      },
    }
  );

  const unsafeRes = response.data;
  if ('error' in unsafeRes) {
    throw new SolanaJSONRPCError(unsafeRes.error, `Failed to get accounts owned by program: ${[programIdStr]}`);
  }

  const res = unsafeRes as RpcResult;
  const deser = res.result.map(async (account) => ({
    account: await deserializeAccountInfo(account.account),
    pubkey: new PublicKey(account.pubkey),
  }));
  const x = await Promise.all(deser);
  return x as GetProgramAccountsResponse;
}

async function deserializeAccountInfo(accountInfo: AccountInfo<string[]>): Promise<AccountInfo<Buffer>> {
  const data = await zstdDecoder.decompress(Buffer.from(accountInfo.data[0], 'base64'));
  return {
    owner: accountInfo.owner,
    lamports: accountInfo.lamports,
    executable: accountInfo.executable,
    rentEpoch: accountInfo.rentEpoch,
    data: data,
  };
}

function extractCommitmentFromConfig<TConfig>(
  commitmentOrConfig?: Commitment | ({ commitment?: Commitment } & TConfig)
) {
  let commitment: Commitment | undefined;
  let config: Omit<TConfig, 'commitment'> | undefined;
  if (typeof commitmentOrConfig === 'string') {
    commitment = commitmentOrConfig;
  } else if (commitmentOrConfig) {
    const { commitment: specifiedCommitment, ...specifiedConfig } = commitmentOrConfig;
    commitment = specifiedCommitment;
    config = specifiedConfig;
  }
  return { commitment, config };
}

interface RpcResult {
  jsonrpc: string;
  result: Result;
}

export type Result = readonly Readonly<{
  account: AccountInfo<string[]>;
  /** the account Pubkey as base-58 encoded string */
  pubkey: string;
}>[];
