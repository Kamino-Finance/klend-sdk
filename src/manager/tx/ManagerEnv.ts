import { address, Address, TransactionSigner } from '@solana/kit';
import { ManagerConnectionPool } from './ManagerConnectionPool';
import { PROGRAM_ID as KLEND_PROGRAM_ID } from '../../@codegen/klend/programId';
import { PROGRAM_ID as KVAULT_PROGRAM_ID } from '../../@codegen/kvault/programId';
import { PROGRAM_ID as FARMS_PROGRAM_ID } from '@kamino-finance/farms-sdk/dist/@codegen/farms/programId';
import { STAGING_PROGRAM_ID as KLEND_STAGING_PROGRAM_ID } from '../../utils/constants';
import { noopSigner, parseKeypairFile } from './keypair';
import { Chain } from './rpc';
import { KaminoMarket } from '../../classes';
import { FARMS_GLOBAL_CONFIG_MAINNET } from '../../classes/farm_utils';
import { KVAULT_STAGING_PROGRAM_ID } from '../utils/consts';
import { VaultState } from '../../@codegen/kvault/accounts';

export type Cluster = 'localnet' | 'devnet' | 'mainnet-beta';

export type SendTxMode = 'execute' | 'simulate' | 'multisig' | 'print';

export type SignerConfig = {
  multisigSigner?: TransactionSigner;
  admin?: TransactionSigner;
};

export type ProgramConfig = {
  staging?: boolean;
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

function defaultProgramConfig(programConfig: {
  klendProgramId?: Address | undefined;
  kvaultProgramId?: Address | undefined;
  farmsProgramId?: Address | undefined;
  farmsGlobalConfig?: Address | undefined;
  staging?: boolean | undefined;
}): Required<ProgramConfig> {
  const stagingOpt = programConfig.staging ?? false;
  const config: Required<ProgramConfig> = {
    staging: stagingOpt,
    klendProgramId: programConfig?.klendProgramId ?? (stagingOpt ? KLEND_STAGING_PROGRAM_ID : KLEND_PROGRAM_ID),
    kvaultProgramId: programConfig.kvaultProgramId ?? (stagingOpt ? KVAULT_STAGING_PROGRAM_ID : KVAULT_PROGRAM_ID),
    farmsProgramId: programConfig?.farmsProgramId ?? FARMS_PROGRAM_ID,
    farmsGlobalConfig: programConfig?.farmsGlobalConfig ?? FARMS_GLOBAL_CONFIG_MAINNET,
  };
  return config;
}

export async function initEnv(
  staging: boolean = false,
  multisig: Address | undefined = undefined,
  adminKeypairPath: string | undefined = process.env.ADMIN,
  rpcUrl: string | undefined = process.env.RPC
): Promise<ManagerEnv> {
  const config = defaultProgramConfig({
    staging,
    klendProgramId: staging ? envAddress('KLEND_PROGRAM_ID_STAGING') : envAddress('KLEND_PROGRAM_ID_MAINNET'),
    kvaultProgramId: staging ? envAddress('KVAULT_PROGRAM_ID_STAGING') : envAddress('KVAULT_PROGRAM_ID_MAINNET'),
  });

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

function envAddress(env: string): Address | undefined {
  if (process.env[env]) {
    return address(process.env[env]);
  }
  return undefined;
}
