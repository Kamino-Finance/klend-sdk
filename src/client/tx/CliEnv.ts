import { address, Address, TransactionSigner } from '@solana/kit';
import { CliConnectionPool } from './CliConnectionPool';
import { PROGRAM_ID as KLEND_PROGRAM_ID } from '../../@codegen/klend/programId';
import { PROGRAM_ID as FARMS_PROGRAM_ID } from '@kamino-finance/farms-sdk/dist/@codegen/farms/programId';
import { noopSigner, parseKeypairFile } from './keypair';
import { Chain } from './rpc';
import { KaminoMarket } from '../../classes';
import { FARMS_GLOBAL_CONFIG_MAINNET } from '../../classes/farm_utils';

export type Cluster = 'localnet' | 'devnet' | 'mainnet-beta';

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
  signerConfig: SignerConfig;
  klendProgramId: Address;
  farmsProgramId: Address;
  farmsGlobalConfig: Address;

  constructor(
    c: CliConnectionPool,
    cluster: Cluster,
    signerConfig: SignerConfig,
    klendProgramId: Address,
    farmsProgramId: Address,
    farmsGlobalConfig: Address
  ) {
    this.c = c;
    this.cluster = cluster;
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

export async function initEnv(
  rpcUrl: string,
  adminKeypairPath?: string,
  multisig: boolean = false,
  programConfig?: ProgramConfig
): Promise<CliEnv> {
  const config: Required<ProgramConfig> = {
    klendProgramId: programConfig?.klendProgramId ?? KLEND_PROGRAM_ID,
    farmsProgramId: programConfig?.farmsProgramId ?? FARMS_PROGRAM_ID,
    farmsGlobalConfig: programConfig?.farmsGlobalConfig ?? FARMS_GLOBAL_CONFIG_MAINNET,
  };

  let resolvedUrl: string;
  if (rpcUrl) {
    resolvedUrl = rpcUrl;
  } else {
    throw 'Must specify an RPC URL';
  }

  let resolvedAdmin: TransactionSigner | undefined = undefined;
  if (adminKeypairPath) {
    resolvedAdmin = await parseKeypairFile(adminKeypairPath);
  }

  const rpcChain = parseRpcChain(rpcUrl);

  const c = new CliConnectionPool(rpcChain);
  const env: CliEnv = new CliEnv(
    c,
    rpcChain.name,
    {
      admin: resolvedAdmin,
      multisig,
    },
    config.klendProgramId,
    config.farmsProgramId,
    config.farmsGlobalConfig
  );

  console.log('\nSettings ⚙️');
  console.log(`Multisig: ${multisig}`);
  console.log('Program ID:', env.klendProgramId);
  console.log('Admin:', resolvedAdmin);
  console.log('Cluster:', resolvedUrl);

  return env;
}

function parseRpcChain(rpcUrl: string): Chain {
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
