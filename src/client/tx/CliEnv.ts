import { address, Address, TransactionSigner } from '@solana/kit';
import { CliConnectionPool } from './CliConnectionPool';
import { PROGRAM_ID as KLEND_PROGRAM_ID } from '../../@codegen/klend/programId';
import { PROGRAM_ID as FARMS_PROGRAM_ID } from '@kamino-finance/farms-sdk/dist/@codegen/farms/programId';
import { STAGING_PROGRAM_ID as KLEND_STAGING_PROGRAM_ID } from '../../utils/constants';
import { noopSigner, parseKeypairFile } from './keypair';
import { Chain } from './rpc';
import { KaminoMarket } from '../../classes';
import { FARMS_GLOBAL_CONFIG_MAINNET, FARMS_GLOBAL_CONFIG_DEVNET } from '../../classes/farm_utils';
import { FARMS_STAGING_PROGRAM_ID, FARMS_DEVNET_PROGRAM_ID } from '../../manager/utils/consts';

export type Cluster = 'localnet' | 'devnet' | 'mainnet-beta';

export type Env = 'mainnet-beta' | 'staging' | 'devnet';

export const sendTxModes = ['execute', 'simulate', 'multisig', 'print'] as const;
export type SendTxMode = (typeof sendTxModes)[number];

export type SignerConfig = {
  multisig: boolean;
  admin?: TransactionSigner;
};

export type ProgramConfig = {
  klendProgramId?: Address;
  farmsProgramId?: Address;
  farmsGlobalConfig?: Address;
};

export class CliEnv {
  c: CliConnectionPool;
  cluster: Cluster;
  env: Env;
  signerConfig: SignerConfig;
  klendProgramId: Address;
  farmsProgramId: Address;
  farmsGlobalConfig: Address;

  constructor(
    c: CliConnectionPool,
    cluster: Cluster,
    env: Env,
    signerConfig: SignerConfig,
    klendProgramId: Address,
    farmsProgramId: Address,
    farmsGlobalConfig: Address
  ) {
    this.c = c;
    this.cluster = cluster;
    this.env = env;
    this.signerConfig = signerConfig;
    this.klendProgramId = klendProgramId;
    this.farmsProgramId = farmsProgramId;
    this.farmsGlobalConfig = farmsGlobalConfig;
  }

  async getSigner(market?: KaminoMarket): Promise<TransactionSigner> {
    if (this.signerConfig.multisig) {
      if (market) {
        return noopSigner(market.state.lendingMarketOwner);
      } else if (process.env.MULTISIG) {
        return noopSigner(address(process.env.MULTISIG));
      } else {
        throw new Error('Multisig signer could not be detected consider setting the MULTISIG env var');
      }
    }
    if (this.signerConfig.admin) {
      return this.signerConfig.admin;
    } else if (market) {
      return noopSigner(market.state.lendingMarketOwner);
    } else if (process.env.MULTISIG) {
      return noopSigner(address(process.env.MULTISIG));
    }
    throw new Error(`No signer in config ${JSON.stringify(this.signerConfig)}`);
  }
}

export function parseEnv(env: string | undefined): Env {
  if (!env || env === 'mainnet-beta') {
    return 'mainnet-beta';
  }
  if (env === 'staging') {
    return 'staging';
  }
  if (env === 'devnet') {
    return 'devnet';
  }
  throw new Error(`Invalid --env value: '${env}'. Must be one of: mainnet-beta, staging, devnet`);
}

function defaultProgramConfig(env: Env, programConfig?: ProgramConfig): Required<ProgramConfig> & { env: Env } {
  const isStaging = env === 'staging';
  const isDevnet = env === 'devnet';

  return {
    env,
    klendProgramId:
      programConfig?.klendProgramId ??
      envAddress(isStaging ? 'KLEND_PROGRAM_ID_STAGING' : 'KLEND_PROGRAM_ID_MAINNET') ??
      (isStaging ? KLEND_STAGING_PROGRAM_ID : KLEND_PROGRAM_ID),
    farmsProgramId:
      programConfig?.farmsProgramId ??
      (isStaging ? FARMS_STAGING_PROGRAM_ID : isDevnet ? FARMS_DEVNET_PROGRAM_ID : FARMS_PROGRAM_ID),
    farmsGlobalConfig:
      programConfig?.farmsGlobalConfig ?? (isDevnet ? FARMS_GLOBAL_CONFIG_DEVNET : FARMS_GLOBAL_CONFIG_MAINNET),
  };
}

export async function initEnv(
  env: Env,
  adminKeypairPath?: string,
  multisig: boolean = false,
  programConfig?: ProgramConfig,
  rpcUrl?: string
): Promise<CliEnv> {
  const isDevnet = env === 'devnet';

  const config = defaultProgramConfig(env, programConfig);

  let resolvedUrl: string;
  if (rpcUrl) {
    resolvedUrl = rpcUrl;
  } else if (isDevnet && process.env.RPC_DEVNET) {
    resolvedUrl = process.env.RPC_DEVNET;
  } else if (process.env.RPC) {
    resolvedUrl = process.env.RPC;
  } else {
    throw new Error('Must specify an RPC URL (provide --rpc, or set RPC/RPC_DEVNET env var)');
  }

  const resolvedAdminPath = adminKeypairPath ?? (isDevnet ? process.env.ADMIN_DEVNET : process.env.ADMIN);
  let resolvedAdmin: TransactionSigner | undefined = undefined;
  if (resolvedAdminPath) {
    resolvedAdmin = await parseKeypairFile(resolvedAdminPath);
  }

  const rpcChain = parseRpcChain(resolvedUrl, isDevnet);

  const c = new CliConnectionPool(rpcChain);
  const cliEnv: CliEnv = new CliEnv(
    c,
    rpcChain.name,
    env,
    {
      admin: resolvedAdmin,
      multisig,
    },
    config.klendProgramId,
    config.farmsProgramId,
    config.farmsGlobalConfig
  );

  console.log('\nSettings ⚙️');
  console.log(`Env: ${env}`);
  console.log(`Multisig: ${multisig}`);
  console.log(`Cluster: ${cliEnv.cluster}`);
  console.log(`Rpc: ${resolvedUrl}`);
  console.log(`klendProgramId: ${cliEnv.klendProgramId}`);
  console.log(`farmsProgramId: ${cliEnv.farmsProgramId}`);
  console.log(`Admin: ${resolvedAdmin?.address}`);

  return cliEnv;
}

function parseRpcChain(rpcUrl: string, devnet: boolean = false): Chain {
  let chain: Chain;
  if (rpcUrl === 'localnet') {
    chain = {
      name: 'localnet',
      endpoint: {
        url: 'http://127.0.0.1:8899',
        name: 'localnet',
      },
      wsEndpoint: {
        name: 'localnet',
        url: 'ws://127.0.0.1:8900',
      },
      multicastEndpoints: [],
    };
  } else if (devnet) {
    chain = {
      name: 'devnet',
      endpoint: {
        url: rpcUrl,
        name: 'devnet',
      },
      wsEndpoint: {
        url: rpcUrl.replace('https:', 'wss:'),
        name: 'devnet-ws',
      },
      multicastEndpoints: [],
    };
  } else {
    chain = {
      name: 'mainnet-beta',
      endpoint: {
        url: rpcUrl,
        name: 'mainnet-beta',
      },
      wsEndpoint: {
        url: rpcUrl.replace('https:', 'wss:') + '/whirligig',
        name: 'mainnet-beta-ws',
      },
      multicastEndpoints: [],
    };
  }
  return chain;
}

function envAddress(envVar: string): Address | undefined {
  if (process.env[envVar]) {
    return address(process.env[envVar]);
  }
  return undefined;
}
