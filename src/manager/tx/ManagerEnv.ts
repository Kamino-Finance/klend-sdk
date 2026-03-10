import { Address, TransactionSigner } from '@solana/kit';
import { ManagerConnectionPool } from './ManagerConnectionPool';
import { PROGRAM_ID as KLEND_PROGRAM_ID } from '../../@codegen/klend/programId';
import { PROGRAM_ID as KVAULT_PROGRAM_ID } from '../../@codegen/kvault/programId';
import { PROGRAM_ID as FARMS_PROGRAM_ID } from '@kamino-finance/farms-sdk/dist/@codegen/farms/programId';
import { STAGING_PROGRAM_ID as KLEND_STAGING_PROGRAM_ID } from '../../utils/constants';
import { noopSigner, parseKeypairFile } from './keypair';
import { Chain } from './rpc';
import { KaminoMarket } from '../../classes';
import { FARMS_GLOBAL_CONFIG_MAINNET, FARMS_GLOBAL_CONFIG_DEVNET } from '../../classes/farm_utils';
import {
  KVAULT_STAGING_PROGRAM_ID,
  KVAULT_DEVNET_PROGRAM_ID,
  FARMS_STAGING_PROGRAM_ID,
  FARMS_DEVNET_PROGRAM_ID,
} from '../utils/consts';
import { VaultState } from '../../@codegen/kvault/accounts';

export type Cluster = 'localnet' | 'devnet' | 'mainnet-beta';

export type SendTxMode = 'execute' | 'simulate' | 'multisig' | 'print';

export type SignerConfig = {
  multisigSigner?: TransactionSigner;
  admin?: TransactionSigner;
};

export type ProgramConfig = {
  staging?: boolean;
  devnet?: boolean;
  klendProgramId?: Address;
  kvaultProgramId?: Address;
  farmsProgramId?: Address;
  farmsGlobalConfig?: Address;
};

interface GetSignerProps {
  market?: KaminoMarket;
  useLendingMarketOwnerCached?: boolean;
  vaultState?: VaultState;
  useVaultPendingAdmin?: boolean;
}

export class ManagerEnv {
  c: ManagerConnectionPool;
  cluster: Cluster;
  signerConfig: SignerConfig;
  klendProgramId: Address;
  kvaultProgramId: Address;
  farmsProgramId: Address;
  farmsGlobalConfig: Address;

  constructor(
    c: ManagerConnectionPool,
    cluster: Cluster,
    signerConfig: SignerConfig,
    klendProgramId: Address,
    kvaultProgramId: Address,
    farmsProgramId: Address,
    farmsGlobalConfig: Address
  ) {
    this.c = c;
    this.cluster = cluster;
    this.signerConfig = signerConfig;
    this.klendProgramId = klendProgramId;
    this.kvaultProgramId = kvaultProgramId;
    this.farmsProgramId = farmsProgramId;
    this.farmsGlobalConfig = farmsGlobalConfig;
  }

  async getSigner({
    market,
    useLendingMarketOwnerCached,
    vaultState,
    useVaultPendingAdmin,
  }: GetSignerProps = {}): Promise<TransactionSigner> {
    function matchesAdmin(config: SignerConfig, a: Address): boolean {
      return config.admin !== undefined && config.admin.address === a;
    }

    if (vaultState) {
      if (useVaultPendingAdmin) {
        return matchesAdmin(this.signerConfig, vaultState.pendingAdmin)
          ? this.signerConfig.admin!
          : noopSigner(vaultState.pendingAdmin);
      } else {
        return matchesAdmin(this.signerConfig, vaultState.vaultAdminAuthority)
          ? this.signerConfig.admin!
          : noopSigner(vaultState.vaultAdminAuthority);
      }
    } else if (market) {
      if (useLendingMarketOwnerCached) {
        return matchesAdmin(this.signerConfig, market.state.lendingMarketOwnerCached)
          ? this.signerConfig.admin!
          : noopSigner(market.state.lendingMarketOwnerCached);
      } else {
        return matchesAdmin(this.signerConfig, market.state.lendingMarketOwner)
          ? this.signerConfig.admin!
          : noopSigner(market.state.lendingMarketOwner);
      }
    } else if (this.signerConfig.admin) {
      return this.signerConfig.admin;
    } else if (this.signerConfig.multisigSigner) {
      return this.signerConfig.multisigSigner;
    }
    throw new Error(`No signer in config ${JSON.stringify(this.signerConfig)}`);
  }
}

function resolveProgramId(
  explicit: Address | undefined,
  ids: { staging: Address; devnet?: Address; mainnet: Address },
  staging: boolean,
  devnet: boolean
): Address {
  if (explicit) return explicit;
  if (staging) return ids.staging;
  if (devnet && ids.devnet) return ids.devnet;
  return ids.mainnet;
}

function defaultProgramConfig(programConfig: ProgramConfig): Required<ProgramConfig> {
  const staging = programConfig.staging ?? false;
  const devnet = programConfig.devnet ?? false;

  return {
    staging,
    devnet,
    klendProgramId: resolveProgramId(
      programConfig.klendProgramId,
      {
        staging: KLEND_STAGING_PROGRAM_ID,
        mainnet: KLEND_PROGRAM_ID,
        devnet: KLEND_PROGRAM_ID,
      },
      staging,
      devnet
    ),
    kvaultProgramId: resolveProgramId(
      programConfig.kvaultProgramId,
      {
        staging: KVAULT_STAGING_PROGRAM_ID,
        devnet: KVAULT_DEVNET_PROGRAM_ID,
        mainnet: KVAULT_PROGRAM_ID,
      },
      staging,
      devnet
    ),
    farmsProgramId: resolveProgramId(
      programConfig.farmsProgramId,
      {
        staging: FARMS_STAGING_PROGRAM_ID,
        devnet: FARMS_DEVNET_PROGRAM_ID,
        mainnet: FARMS_PROGRAM_ID,
      },
      staging,
      devnet
    ),
    farmsGlobalConfig: resolveProgramId(
      programConfig.farmsGlobalConfig,
      {
        staging: FARMS_GLOBAL_CONFIG_MAINNET,
        devnet: FARMS_GLOBAL_CONFIG_DEVNET,
        mainnet: FARMS_GLOBAL_CONFIG_MAINNET,
      },
      staging,
      devnet
    ),
  };
}

export async function initEnv(
  staging: boolean = false,
  multisig: Address | undefined = undefined,
  adminKeypairPath: string | undefined = undefined,
  rpcUrl: string | undefined = undefined,
  devnet: boolean = false
): Promise<ManagerEnv> {
  if (staging && devnet) {
    throw new Error('Cannot use both --staging and --devnet at the same time');
  }

  const config = defaultProgramConfig({
    staging,
    devnet,
  });

  let resolvedUrl: string;
  if (rpcUrl) {
    resolvedUrl = rpcUrl;
  } else if (devnet && process.env.RPC_DEVNET) {
    resolvedUrl = process.env.RPC_DEVNET;
  } else if (process.env.RPC) {
    resolvedUrl = process.env.RPC;
  } else {
    throw 'Must specify an RPC URL';
  }

  const resolvedAdminPath = adminKeypairPath ?? (devnet ? process.env.ADMIN_DEVNET : process.env.ADMIN);
  let resolvedAdmin: TransactionSigner | undefined = undefined;
  if (resolvedAdminPath) {
    resolvedAdmin = await parseKeypairFile(resolvedAdminPath);
  }

  const rpcChain = parseRpcChain(resolvedUrl, devnet);

  const c = new ManagerConnectionPool(rpcChain);
  const multisigSigner = multisig ? noopSigner(multisig) : undefined;
  const env: ManagerEnv = new ManagerEnv(
    c,
    rpcChain.name,
    {
      admin: resolvedAdmin,
      multisigSigner,
    },
    config.klendProgramId,
    config.kvaultProgramId,
    config.farmsProgramId,
    config.farmsGlobalConfig
  );

  console.log('\nSettings ⚙️');
  console.log(`Multisig: ${multisig}`);
  console.log(`Multisig signer: ${multisigSigner?.address}`);
  console.log(`Admin: ${resolvedAdmin?.address}`);
  console.log(`Rpc: ${resolvedUrl}`);
  console.log(`klendProgramId: ${env.klendProgramId}`);
  console.log(`kvaultProgramId: ${env.kvaultProgramId}`);

  return env;
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
