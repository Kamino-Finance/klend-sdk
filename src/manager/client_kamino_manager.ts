import dotenv from 'dotenv';
import { Command } from 'commander';
import { Account, Address, address, generateKeyPairSigner, Instruction, TransactionSigner } from '@solana/kit';
import {
  AssetReserveConfigCli,
  calculateAPYFromAPR,
  CDN_ENDPOINT,
  createLookupTableIx,
  DEFAULT_CU_PER_TX,
  DEFAULT_PUBLIC_KEY,
  DEFAULT_RECENT_SLOT_DURATION_MS,
  encodeTokenName,
  extendLookupTableIxs,
  getKvaultGlobalConfigPda,
  getMedianSlotDurationInMsFromLastEpochs,
  globalConfigPda,
  initLookupTableIx,
  KaminoManager,
  KaminoMarket,
  KaminoReserve,
  KaminoVault,
  KaminoVaultConfig,
  KVaultGlobalConfig,
  lamportsToDecimal,
  LendingMarket,
  type LendingMarketJSON,
  parseBooleanFlag,
  parseTokenSymbol,
  parseZeroPaddedUtf8,
  printKvaultHoldingsLog,
  renderZeroPaddedUtf8,
  programDataPda,
  Reserve,
  ReserveAllocationConfig,
  ReserveConfigUpdateIx,
  ReserveWithAddress,
  sleep,
} from '../lib';
import {
  BorrowRateCurve,
  CurvePointFields,
  PriceHeuristic,
  ReserveConfig,
  ReserveConfigFields,
  ReserveFarmKind,
  ScopeConfiguration,
  TokenInfo,
  WithdrawalCaps,
} from '../@codegen/klend/types';
import { Fraction } from '../classes/fraction';
import { trimPoints } from '../classes/curve';
import { PermissionedOp } from '../classes/permission';
import Decimal from 'decimal.js';
import BN from 'bn.js';
import { PythConfiguration, SwitchboardConfiguration, UpdateReserveWhitelistMode } from '../@codegen/kvault/types';
import { ReserveWhitelistEntry } from '../@codegen/kvault/accounts';
import { getReserveWhitelistEntryPda } from '../classes/vault';
import { getMarketsFromApi } from '../utils/api';
import * as fs from 'fs';
import { MarketWithAddress } from '../utils/managerTypes';
import { ManagementFeeBps, PendingVaultAdmin, PerformanceFeeBps } from '../@codegen/kvault/types/VaultConfigField';
import { getAccountOwner, getCurrentLedgerInstant } from '../utils/rpc';
import { fetchMint, findAssociatedTokenPda } from '@solana-program/token-2022';
import { initEnv, ManagerEnv, SendTxMode } from './tx/ManagerEnv';
import { processTx } from './tx/processor';
import { getPriorityFeeAndCuIxs } from '../client/tx/priorityFee';
import {
  AddressLookupTable,
  fetchAddressLookupTable,
  fetchAllAddressLookupTable,
} from '@solana-program/address-lookup-table';
import { noopSigner, parseKeypairFile } from '../utils/signer';
import { checkReserveWhitelistCommand, printVaultReserveAllocations, printVaultReserveFarmIncentives } from './print';
import { assertCreateMarketLutCliOptions, resolveCreateMarketLutTxSigner } from './utils/createMarketLutCli';
import { getWalletType } from '../utils/wallets';

dotenv.config({
  path: `.env${process.env.ENV ? '.' + process.env.ENV : ''}`,
});

async function loadVaultInstructionParams(kaminoManager: KaminoManager, vault: KaminoVault) {
  const vaultState = await vault.getState();
  const vaultReservesMap = await kaminoManager.loadVaultReserves(vaultState);
  const farmsMap = await kaminoManager.loadVaultFarmStates([vaultState], vaultReservesMap);

  return {
    vaultState,
    vaultReservesMap,
    farmState: farmsMap.get(vaultState.vaultFarm) ?? null,
    flcFarmState: farmsMap.get(vaultState.firstLossCapitalFarm) ?? null,
  };
}

async function loadKVaultGlobalAdminNoopSigner(kaminoManager: KaminoManager): Promise<TransactionSigner> {
  const globalConfig = await kaminoManager.loadKVaultGlobalConfig();
  return noopSigner(address(globalConfig.globalAdmin));
}

function readReserveAddressesFromFile(reservesFile: string): Address[] {
  return fs
    .readFileSync(reservesFile, 'utf-8')
    .split(/[\s,]+/)
    .map((reserve) => reserve.trim())
    .filter((reserve) => reserve.length > 0)
    .map((reserve) => address(reserve));
}

type WhitelistReservesFileCommandArgs = {
  reservesFile: string;
  value: string;
  mode: SendTxMode;
  globalAdmin: string;
  staging?: boolean;
  devnet?: boolean;
  multisig?: string;
  CU?: number | string;
};

type CdnUiVaultMetadata = {
  name?: string;
  tokenSymbol?: string;
};

type CdnUiVaultResources = {
  'mainnet-beta'?: {
    vaults?: Record<string, CdnUiVaultMetadata>;
  };
};

type UiVaultEntry = {
  address: Address;
  metadata?: CdnUiVaultMetadata;
};

type VaultFarmCheckLevel = 'OK' | 'WARN' | 'ERROR';

type VaultFarmCheckResult = {
  level: VaultFarmCheckLevel;
  vault: Address;
  name?: string;
  tokenSymbol?: string;
  hasFarm: boolean;
  vaultFarm?: Address;
  farmAdmin?: Address;
  pendingFarmAdmin?: Address;
  message?: string;
};

async function loadUiVaultsFromCdn(): Promise<UiVaultEntry[]> {
  const response = await fetch(`${CDN_ENDPOINT}/resources.json`);
  if (!response.ok) {
    throw new Error(`Failed to fetch CDN resources: ${response.status} ${response.statusText}`);
  }

  const resources = (await response.json()) as CdnUiVaultResources;
  const vaults = resources['mainnet-beta']?.vaults;
  if (!vaults) {
    throw new Error('CDN resources are missing mainnet-beta.vaults');
  }

  return Object.entries(vaults)
    .map(([vault, metadata]) => ({
      address: address(vault),
      metadata,
    }))
    .sort((a, b) => a.address.localeCompare(b.address));
}

function formatUiVaultName(result: VaultFarmCheckResult): string {
  const name = result.name ?? 'Unnamed vault';
  return result.tokenSymbol ? `${name} (${result.tokenSymbol})` : name;
}

function buildVaultFarmCheckResult(
  vault: KaminoVault,
  farmStates: Awaited<ReturnType<KaminoManager['loadVaultFarmStates']>>,
  metadata?: CdnUiVaultMetadata
): VaultFarmCheckResult {
  if (!vault.state) {
    return {
      level: 'ERROR',
      vault: vault.address,
      name: metadata?.name,
      tokenSymbol: metadata?.tokenSymbol,
      hasFarm: false,
      message: 'vault state not loaded',
    };
  }

  const vaultFarm = vault.state.vaultFarm;
  if (vaultFarm === DEFAULT_PUBLIC_KEY) {
    return {
      level: 'ERROR',
      vault: vault.address,
      name: metadata?.name,
      tokenSymbol: metadata?.tokenSymbol,
      hasFarm: false,
      message: 'vault has no farm configured',
    };
  }

  const farmState = farmStates.get(vaultFarm);
  if (!farmState) {
    return {
      level: 'ERROR',
      vault: vault.address,
      name: metadata?.name,
      tokenSymbol: metadata?.tokenSymbol,
      hasFarm: true,
      vaultFarm,
      message: 'farm account not found',
    };
  }

  const pendingFarmAdminMismatch = farmState.pendingFarmAdmin !== farmState.farmAdmin;
  return {
    level: pendingFarmAdminMismatch ? 'WARN' : 'OK',
    vault: vault.address,
    name: metadata?.name,
    tokenSymbol: metadata?.tokenSymbol,
    hasFarm: true,
    vaultFarm,
    farmAdmin: farmState.farmAdmin,
    pendingFarmAdmin: farmState.pendingFarmAdmin,
    message: pendingFarmAdminMismatch ? 'pending farm admin differs from farm admin' : undefined,
  };
}

async function checkVaultFarms(
  kaminoManager: KaminoManager,
  vaultEntries: UiVaultEntry[]
): Promise<VaultFarmCheckResult[]> {
  const vaultAddresses = vaultEntries.map((vault) => vault.address);
  const loadedVaults = await kaminoManager.getVaults(vaultAddresses);
  const vaultMetadata = new Map(vaultEntries.map((vault) => [vault.address, vault.metadata]));
  const existentVaults = loadedVaults.filter((vault): vault is KaminoVault => vault !== null);
  const existentVaultStates = existentVaults
    .map((vault) => vault.state)
    .filter((vaultState): vaultState is NonNullable<KaminoVault['state']> => vaultState != null);
  const farmStates = await kaminoManager.loadVaultFarmStates(existentVaultStates);

  const results: VaultFarmCheckResult[] = [];
  for (let i = 0; i < loadedVaults.length; i++) {
    const loadedVault = loadedVaults[i];
    const requestedVault = vaultEntries[i];
    const metadata = vaultMetadata.get(requestedVault.address);
    if (!loadedVault) {
      results.push({
        level: 'ERROR',
        vault: requestedVault.address,
        name: metadata?.name,
        tokenSymbol: metadata?.tokenSymbol,
        hasFarm: false,
        message: 'vault account not found',
      });
      continue;
    }

    results.push(buildVaultFarmCheckResult(loadedVault, farmStates, metadata));
  }

  return results;
}

function printVaultFarmCheckResults(results: VaultFarmCheckResult[]): void {
  const total = results.length;
  const okResults = results.filter((result) => result.level === 'OK');
  const warningResults = results.filter((result) => result.level === 'WARN');
  const errorResults = results.filter((result) => result.level === 'ERROR');

  console.log('\nVault farm check summary');
  console.log(`Total UI vaults: ${total}`);
  console.log(`OK: ${okResults.length}`);
  console.log(`Warnings: ${warningResults.length}`);
  console.log(`Errors: ${errorResults.length}`);

  printVaultFarmCheckGroup('Missing or invalid farms', errorResults);
  printVaultFarmCheckGroup('Admin warnings', warningResults);
  printVaultFarmCheckGroup('Configured farms', okResults);
}

function printVaultFarmCheckGroup(title: string, results: VaultFarmCheckResult[]): void {
  console.log(`\n${title} (${results.length})`);
  if (results.length === 0) {
    console.log('  None');
    return;
  }

  for (const result of results) {
    console.log(`- [${result.level}] ${formatUiVaultName(result)}`);
    console.log(`  Vault: ${result.vault}`);
    console.log(`  Has farm: ${result.hasFarm ? 'yes' : 'no'}`);
    if (result.vaultFarm) {
      console.log(`  Vault farm: ${result.vaultFarm}`);
    }
    if (result.farmAdmin) {
      console.log(`  Farm admin: ${result.farmAdmin}`);
    }
    if (result.pendingFarmAdmin) {
      console.log(`  Pending farm admin: ${result.pendingFarmAdmin}`);
    }
    if (result.message) {
      console.log(`  Issue: ${result.message}`);
    }
  }
}

async function processWhitelistReservesFile({
  reservesFile,
  value,
  mode,
  globalAdmin,
  staging,
  devnet,
  multisig,
  CU: cu,
}: WhitelistReservesFileCommandArgs): Promise<void> {
  if (mode === 'multisig' && !multisig) {
    throw new Error('If using multisig mode, multisig pubkey is required');
  }

  const ms = multisig ? address(multisig) : undefined;
  const env = await initEnv(staging, ms, undefined, undefined, devnet);
  const computeUnits = cu ? Number(cu) : DEFAULT_CU_PER_TX;
  const reserveAddresses = readReserveAddressesFromFile(reservesFile);
  const flagValue = parseBooleanFlag(value);

  if (reserveAddresses.length === 0) {
    throw new Error(`No reserve addresses found in ${reservesFile}`);
  }
  if (!Number.isFinite(computeUnits)) {
    throw new Error(`Invalid CU value '${cu}'`);
  }

  console.log(`Processing ${reserveAddresses.length} reserves from ${reservesFile}`);
  console.log(`Whitelist modes: Invest AND AddAllocation (both will be set)`);
  console.log(`Action: ${flagValue ? 'ADD to whitelist' : 'REMOVE from whitelist'}`);

  const kaminoManager = new KaminoManager(
    env.c.rpc,
    DEFAULT_RECENT_SLOT_DURATION_MS,
    env.klendProgramId,
    env.kvaultProgramId,
    undefined,
    env.farmsProgramId
  );

  const globalAdminSigner =
    mode === 'multisig' ? noopSigner(address(globalAdmin)) : await parseKeypairFile(globalAdmin as string);

  const investModeEnum = new UpdateReserveWhitelistMode.Invest([flagValue]);
  const addAllocationModeEnum = new UpdateReserveWhitelistMode.AddAllocation([flagValue]);

  const instructions: Instruction[] = [];
  for (const reserveAddress of reserveAddresses) {
    instructions.push(
      await kaminoManager.addUpdateWhitelistedReserveIx(reserveAddress, investModeEnum, globalAdminSigner)
    );
    instructions.push(
      await kaminoManager.addUpdateWhitelistedReserveIx(reserveAddress, addAllocationModeEnum, globalAdminSigner)
    );
  }

  // Keep multisig messages comfortably small: 6 whitelist instructions = 3 reserves per proposal.
  const batchSize = 6;
  for (let i = 0; i < instructions.length; i += batchSize) {
    const batch = instructions.slice(i, i + batchSize);
    console.log(`Processing batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(instructions.length / batchSize)}`);
    await processTx(
      env.c,
      globalAdminSigner,
      [...batch, ...getPriorityFeeAndCuIxs({ priorityFeeMultiplier: 2500, computeUnits })],
      mode,
      []
    );
  }
}

function selectPrimaryVaultShareFarmStates<
  T extends {
    farmState: Awaited<ReturnType<KaminoManager['loadVaultFarmState']>>;
    flcFarmState: Awaited<ReturnType<KaminoManager['loadVaultFarmState']>>;
  }
>(farmStates: T) {
  if (farmStates.farmState) {
    return {
      farmState: farmStates.farmState,
      flcFarmState: null,
    };
  }

  return {
    farmState: null,
    flcFarmState: farmStates.flcFarmState,
  };
}

async function main() {
  const commands = new Command();

  commands.name('kamino-manager-cli').description('CLI to interact with the kvaults and klend programs');

  commands
    .command('init-kvault-global-config')
    .requiredOption(
      '--mode <string>',
      'simulate|multisig|execute - simulate - to print txn simulation and to get tx simulation link in explorer, execute - execute tx, multisig - to get bs58 tx for multisig usage'
    )
    .option(`--staging`, 'If true, will use the staging programs')
    .option(`--devnet`, 'If true, will use devnet programs and RPC')
    .option(`--multisig <string>`, 'If using multisig mode this is required, otherwise will be ignored')
    .option('--signer-path <string>', 'If set, it will use the provided signer')
    .action(async ({ mode, staging, devnet, multisig, signerPath }) => {
      if (mode === 'multisig' && !multisig) {
        throw new Error('If using multisig mode, multisig is required');
      }
      const ms = multisig ? address(multisig) : undefined;
      const env = await initEnv(staging, ms, signerPath, undefined, devnet);
      const kaminoManager = new KaminoManager(
        env.c.rpc,
        DEFAULT_RECENT_SLOT_DURATION_MS,
        env.klendProgramId,
        env.kvaultProgramId,
        undefined,
        env.farmsProgramId
      );

      let signer: TransactionSigner | undefined = undefined;
      if (signerPath) {
        signer = await parseKeypairFile(signerPath);
      } else {
        const programData = await programDataPda(env.kvaultProgramId);
        const programDataInfo = await env.c.rpc.getAccountInfo(programData).send();
        if (programDataInfo === null) {
          throw new Error('KVault program data not found');
        }
        const programAdmin = programDataInfo.value?.owner.toString();
        if (!programAdmin) {
          throw new Error('Program admin not found');
        }
        signer = noopSigner(address(programAdmin));
      }
      const ix = await kaminoManager.initKvaultGlobalConfigIx(signer);
      await processTx(
        env.c,
        signer,
        [
          ix,
          ...getPriorityFeeAndCuIxs({
            priorityFeeMultiplier: 2500,
          }),
        ],
        mode,
        []
      );
      mode === 'execute' && console.log('KVault global config initialized');
    });

  commands
    .command('update-kvault-global-config')
    .requiredOption(
      '--mode <string>',
      'simulate|multisig|execute - simulate - to print txn simulation and to get tx simulation link in explorer, execute - execute tx, multisig - to get bs58 tx for multisig usage'
    )
    .requiredOption('--field <string>', 'The field to update')
    .requiredOption('--value <string>', 'The value to update the field to')
    .option(`--staging`, 'If true, will use the staging programs')
    .option(`--devnet`, 'If true, will use devnet programs and RPC')
    .option(`--multisig <string>`, 'If using multisig mode this is required, otherwise will be ignored')
    .option('--signer-path <string>', 'If set, it will use the provided signer')
    .action(async ({ mode, field, value, staging, devnet, multisig, signerPath }) => {
      if (mode === 'multisig' && !multisig) {
        throw new Error('If using multisig mode, multisig is required');
      }
      const ms = multisig ? address(multisig) : undefined;
      const env = await initEnv(staging, ms, signerPath, undefined, devnet);
      const kaminoManager = new KaminoManager(
        env.c.rpc,
        DEFAULT_RECENT_SLOT_DURATION_MS,
        env.klendProgramId,
        env.kvaultProgramId,
        undefined,
        env.farmsProgramId
      );
      let signer: TransactionSigner | undefined = undefined;
      if (signerPath) {
        signer = await parseKeypairFile(signerPath);
      } else {
        const globalConfigAddress = await getKvaultGlobalConfigPda(env.kvaultProgramId);
        const globalConfigState = await KVaultGlobalConfig.fetch(env.c.rpc, globalConfigAddress);
        if (!globalConfigState) {
          throw new Error('Global config not found');
        }
        signer = noopSigner(address(globalConfigState.globalAdmin));
      }

      const vaultClient = kaminoManager.getKaminoVaultClient();
      const ix = await vaultClient.updateGlobalConfigIx(field, value);
      await processTx(env.c, signer, [ix, ...getPriorityFeeAndCuIxs({ priorityFeeMultiplier: 2500 })], mode, []);
      mode === 'execute' && console.log(`Global config updated to ${value} for field ${field}`);
    });

  commands
    .command('accept-kvault-global-config-ownership')
    .requiredOption(
      '--mode <string>',
      'simulate|multisig|execute - simulate - to print txn simulation and to get tx simulation link in explorer, execute - execute tx, multisig - to get bs58 tx for multisig usage'
    )
    .option(`--staging`, 'If true, will use the staging programs')
    .option(`--devnet`, 'If true, will use devnet programs and RPC')
    .option(`--multisig <string>`, 'If using multisig mode this is required, otherwise will be ignored')
    .option('--signer-path <string>', 'If set, it will use the provided signer')
    .action(async ({ mode, staging, devnet, multisig, signerPath }) => {
      if (mode === 'multisig' && !multisig) {
        throw new Error('If using multisig mode, multisig is required');
      }
      const ms = multisig ? address(multisig) : undefined;
      const env = await initEnv(staging, ms, undefined, undefined, devnet);
      const kaminoManager = new KaminoManager(
        env.c.rpc,
        DEFAULT_RECENT_SLOT_DURATION_MS,
        env.klendProgramId,
        env.kvaultProgramId,
        undefined,
        env.farmsProgramId
      );
      let signer: TransactionSigner | undefined = undefined;
      if (signerPath) {
        signer = await parseKeypairFile(signerPath);
      } else {
        const globalConfigAddress = await getKvaultGlobalConfigPda(env.kvaultProgramId);
        const globalConfigState = await KVaultGlobalConfig.fetch(env.c.rpc, globalConfigAddress);
        if (!globalConfigState) {
          throw new Error('Global config not found');
        }
        signer = noopSigner(address(globalConfigState.pendingAdmin));
      }

      const vaultClient = kaminoManager.getKaminoVaultClient();
      const ix = await vaultClient.acceptGlobalConfigOwnershipIx(signer);
      await processTx(env.c, signer, [ix, ...getPriorityFeeAndCuIxs({ priorityFeeMultiplier: 2500 })], mode, []);
      mode === 'execute' && console.log('Global config ownership accepted');
    });

  commands
    .command('create-vault')
    .requiredOption('--mint <string>', 'Vault token mint')
    .requiredOption(
      `--mode <string>`,
      'simulate|multisig|execute - simulate - to print txn simulation and to get tx simulation link in explorer, execute - execute tx, multisig - to get bs58 tx for multisig usage'
    )
    .requiredOption('--name <string>', 'The onchain name of the strat')
    .requiredOption('--tokenName <string>', 'The name of the token in the vault')
    .requiredOption('--extraTokenName <string>', 'The extra string appended to the token symbol')
    .option(`--staging`, 'If true, will use the staging programs')
    .option(`--devnet`, 'If true, will use devnet programs and RPC')
    .option(`--multisig <string>`, 'If using multisig mode this is required, otherwise will be ignored')
    .action(async ({ mint, mode, name, tokenName, extraTokenName, staging, devnet, multisig }) => {
      if (mode === 'multisig' && !multisig) {
        throw new Error('If using multisig mode, multisig is required');
      }
      const ms = multisig ? address(multisig) : undefined;
      const env = await initEnv(staging, ms, undefined, undefined, devnet);
      const tokenMint = address(mint);

      const kaminoManager = new KaminoManager(
        env.c.rpc,
        DEFAULT_RECENT_SLOT_DURATION_MS,
        env.klendProgramId,
        env.kvaultProgramId,
        undefined,
        env.farmsProgramId
      );

      const admin = await env.getSigner();
      const tokenProgramID = await getAccountOwner(env.c.rpc, tokenMint);
      const kaminoVaultConfig = new KaminoVaultConfig({
        admin,
        tokenMint: tokenMint,
        tokenMintProgramId: tokenProgramID,
        performanceFeeRatePercentage: new Decimal(0.0),
        managementFeeRatePercentage: new Decimal(0.0),
        name,
        vaultTokenSymbol: tokenName,
        vaultTokenName: extraTokenName,
      });

      const useDevnetFarms = devnet ? true : false;
      const { vault: vaultKp, initVaultIxs: instructions } = await kaminoManager.createVaultIxs(
        kaminoVaultConfig,
        useDevnetFarms
      );

      await processTx(
        env.c,
        admin,
        [
          ...instructions.createAtaIfNeededIxs,
          ...instructions.initVaultIxs,
          instructions.createLUTIx,
          ...getPriorityFeeAndCuIxs({
            priorityFeeMultiplier: 2500,
            computeUnits: 1_400_000,
          }),
        ],
        mode,
        []
      );
      await sleep(2000);
      // create the farms and attach them to the vault
      await processTx(
        env.c,
        admin,
        [
          ...instructions.createVaultFarms.createVaultFarmIxs.setupFarmIxs,
          ...instructions.createVaultFarms.createVaultFarmIxs.updateFarmIxs,
          instructions.setFarmToVaultIxs.setFarmToVaultIx,
        ],
        mode,
        []
      );
      if (instructions.createVaultFarms.createFLCVaultFarmIxs) {
        await processTx(
          env.c,
          admin,
          [
            ...instructions.createVaultFarms.createFLCVaultFarmIxs!.setupFarmIxs,
            ...instructions.createVaultFarms.createFLCVaultFarmIxs!.updateFarmIxs,
            instructions.setFarmToVaultIxs.setFLCFarmToVaultIx!,
          ],
          mode,
          []
        );
      }
      await sleep(2000);

      await processTx(
        env.c,
        admin,
        [
          ...instructions.populateLUTIxs,
          ...instructions.cleanupIxs,
          ...getPriorityFeeAndCuIxs({
            priorityFeeMultiplier: 2500,
          }),
        ],
        mode,
        []
      );

      await processTx(
        env.c,
        admin,
        [
          instructions.initSharesMetadataIx,
          ...getPriorityFeeAndCuIxs({
            priorityFeeMultiplier: 2500,
          }),
        ],
        mode,
        []
      );
      mode === 'execute' && console.log('Vault created:', vaultKp.address);
    });

  commands
    .command('set-shares-metadata')
    .requiredOption('--vault <string>', 'Vault address')
    .requiredOption(
      `--mode <string>`,
      'simulate|multisig|execute - simulate - to print txn simulation and to get tx simulation link in explorer, execute - execute tx, multisig - to get bs58 tx for multisig usage'
    )
    .requiredOption('--symbol <string>', 'The symbol of the kVault token')
    .requiredOption('--extraName <string>', 'The name of the kVault token, appended to the symbol')
    .option(`--staging`, 'If true, will use the staging programs')
    .option(`--CU <number>`, 'The number of compute units to use for the transaction')
    .action(async ({ vault, mode, symbol, extraName, staging, CU: cu }) => {
      const env = await initEnv(undefined, staging);
      const kVault = new KaminoVault(env.c.rpc, address(vault));
      const computeUnits = cu ? cu : DEFAULT_CU_PER_TX;

      const kaminoManager = new KaminoManager(
        env.c.rpc,
        DEFAULT_RECENT_SLOT_DURATION_MS,
        env.klendProgramId,
        env.kvaultProgramId,
        undefined,
        env.farmsProgramId
      );
      const vaultState = await kVault.getState();
      const signer = await env.getSigner({ vaultState });
      const ix = await kaminoManager.getSetSharesMetadataIx(signer, kVault, symbol, extraName);

      await processTx(
        env.c,
        signer,
        [
          ix,
          ...getPriorityFeeAndCuIxs({
            priorityFeeMultiplier: 2500,
            computeUnits,
          }),
        ],
        mode,
        []
      );
    });

  commands
    .command('update-vault-pending-admin')
    .requiredOption('--vault <string>', 'Vault address')
    .requiredOption('--new-admin <string>', 'Pubkey of the new admin')
    .requiredOption(
      `--mode <string>`,
      'simulate|multisig|execute - simulate - to print txn simulation and to get tx simulation link in explorer, execute - execute tx, multisig - to get bs58 tx for multisig usage'
    )
    .option(`--staging`, 'If true, will use the staging programs')
    .option(`--devnet`, 'If true, will use devnet programs and RPC')
    .option(`--CU <number>`, 'The number of compute units to use for the transaction')
    .action(async ({ vault, newAdmin, mode, staging, devnet, CU: cu }) => {
      const env = await initEnv(staging, undefined, undefined, undefined, devnet);
      const vaultAddress = address(vault);
      const computeUnits = cu ? cu : DEFAULT_CU_PER_TX;

      const kaminoManager = new KaminoManager(
        env.c.rpc,
        DEFAULT_RECENT_SLOT_DURATION_MS,
        env.klendProgramId,
        env.kvaultProgramId,
        undefined,
        env.farmsProgramId
      );

      const kaminoVault = new KaminoVault(env.c.rpc, vaultAddress, undefined, env.kvaultProgramId);
      const { vaultState, vaultReservesMap } = await loadVaultInstructionParams(kaminoManager, kaminoVault);
      const signer = await env.getSigner({ vaultState });

      const instructions = await kaminoManager.updateVaultConfigIxs(
        kaminoVault,
        new PendingVaultAdmin(),
        newAdmin,
        vaultReservesMap,
        signer,
        undefined,
        true
      );

      await processTx(
        env.c,
        signer,
        [
          instructions.updateVaultConfigIx,
          ...instructions.extraIxs,
          ...getPriorityFeeAndCuIxs({
            priorityFeeMultiplier: 2500,
            computeUnits,
          }),
        ],
        mode,
        []
      );

      mode === 'execute' && console.log(`Pending admin updated to ${newAdmin}`);
    });

  commands
    .command('update-vault-config')
    .requiredOption('--vault <string>', 'Vault address')
    .requiredOption('--field <string>', 'The field to update')
    .requiredOption('--value <string>', 'The value to update the field to')
    .requiredOption(
      `--mode <string>`,
      'simulate|multisig|execute - simulate - to print txn simulation and to get tx simulation link in explorer, execute - execute tx, multisig - to get bs58 tx for multisig usage'
    )
    .option(`--staging`, 'If true, will use the staging programs')
    .option(`--devnet`, 'If true, will use devnet programs and RPC')
    .option(`--skip-lut-update`, 'If set, it will skip the LUT update')
    .option(
      `--lutSigner <string>`,
      'If set, it will use the provided signer instead of the default one for the LUT update'
    )
    .option(
      `--global-admin [string]`,
      'Use the KVault global admin as signer. Pass a keypair path in execute/simulate modes, or pass the flag without a value in multisig mode to fetch the on-chain global admin and generate the base58 tx'
    )
    .option(`--multisig <string>`, 'If using multisig mode this is required, otherwise will be ignored')
    .option(
      `--error-on-override`,
      'If set, it will throw an error if the vault already has a farm, if you want to override it set errorOnOverride to false'
    )
    .option(`--CU <number>`, 'The number of compute units to use for the transaction')
    .action(
      async ({
        vault,
        field,
        value,
        mode,
        staging,
        devnet,
        skipLutUpdate,
        lutSigner,
        globalAdmin,
        multisig,
        errorOnOverride,
        CU: cu,
      }) => {
        if (mode === 'multisig' && !multisig) {
          throw new Error('If using multisig mode, multisig pubkey is required');
        }

        const ms = multisig ? address(multisig) : undefined;
        const env = await initEnv(staging, ms, undefined, undefined, devnet);
        const computeUnits = cu ? cu : DEFAULT_CU_PER_TX;
        const vaultAddress = address(vault);

        const kaminoManager = new KaminoManager(
          env.c.rpc,
          DEFAULT_RECENT_SLOT_DURATION_MS,
          env.klendProgramId,
          env.kvaultProgramId
        );

        const kaminoVault = new KaminoVault(env.c.rpc, vaultAddress, undefined, env.kvaultProgramId);
        const { vaultState, vaultReservesMap } = await loadVaultInstructionParams(kaminoManager, kaminoVault);

        // Use the current KVault global admin when requested; otherwise fall back to the vault admin.
        let signer: TransactionSigner;
        if (globalAdmin !== undefined) {
          if (mode === 'multisig') {
            signer =
              typeof globalAdmin === 'string'
                ? noopSigner(address(globalAdmin))
                : await loadKVaultGlobalAdminNoopSigner(kaminoManager);
          } else if (typeof globalAdmin === 'string') {
            signer = await parseKeypairFile(globalAdmin);
          } else {
            throw new Error(
              'Bare --global-admin is only supported in multisig mode. Pass the global admin keypair path in execute/simulate modes.'
            );
          }
        } else {
          signer = await env.getSigner({ vaultState });
        }

        let lutSignerOrUndefined = undefined;
        if (lutSigner) {
          lutSignerOrUndefined = await parseKeypairFile(lutSigner as string);
        }

        const shouldSkipLutUpdate = !!skipLutUpdate;
        const instructions = await kaminoManager.updateVaultConfigIxs(
          kaminoVault,
          field,
          value,
          vaultReservesMap,
          signer,
          lutSignerOrUndefined,
          shouldSkipLutUpdate,
          errorOnOverride
        );

        await processTx(
          env.c,
          signer,
          [
            instructions.updateVaultConfigIx,
            ...instructions.updateLUTIxs,
            ...instructions.extraIxs,
            ...getPriorityFeeAndCuIxs({
              priorityFeeMultiplier: 2500,
              computeUnits,
            }),
          ],
          mode,
          []
        );

        mode === 'execute' && console.log('Vault updated');
      }
    );

  commands
    .command('add-update-whitelisted-reserve')
    .requiredOption('--reserve <string>', 'Reserve address to whitelist')
    .requiredOption('--whitelist-mode <string>', 'Whitelist mode: "Invest" or "AddAllocation"')
    .requiredOption(
      '--value <string>',
      'Value: "1" or "true" to add to whitelist, "0" or "false" to remove from whitelist'
    )
    .requiredOption(
      `--mode <string>`,
      'simulate|multisig|execute - simulate - to print txn simulation and to get tx simulation link in explorer, execute - execute tx, multisig - to get bs58 tx for multisig usage'
    )
    .requiredOption(
      '--global-admin <string>',
      'Global admin signer (keypair path in execute/simulate modes, pubkey in multisig mode)'
    )
    .option(`--staging`, 'If true, will use the staging programs')
    .option(`--devnet`, 'If true, will use devnet programs and RPC')
    .option(`--multisig <string>`, 'If using multisig mode this is required, otherwise will be ignored')
    .option(`--CU <number>`, 'The number of compute units to use for the transaction')
    .action(async ({ reserve, whitelistMode, value, mode, globalAdmin, staging, devnet, multisig, CU: cu }) => {
      if (mode === 'multisig' && !multisig) {
        throw new Error('If using multisig mode, multisig pubkey is required');
      }

      const ms = multisig ? address(multisig) : undefined;
      const env = await initEnv(staging, ms, undefined, undefined, devnet);
      const computeUnits = cu ? cu : DEFAULT_CU_PER_TX;
      const reserveAddress = address(reserve);

      const kaminoManager = new KaminoManager(
        env.c.rpc,
        DEFAULT_RECENT_SLOT_DURATION_MS,
        env.klendProgramId,
        env.kvaultProgramId,
        undefined,
        env.farmsProgramId
      );

      // Parse the value (1/true = add, 0/false = remove)
      const flagValue = parseBooleanFlag(value);

      // Parse the whitelist mode
      let whitelistModeEnum;
      if (whitelistMode === 'Invest') {
        whitelistModeEnum = new UpdateReserveWhitelistMode.Invest([flagValue]);
      } else if (whitelistMode === 'AddAllocation') {
        whitelistModeEnum = new UpdateReserveWhitelistMode.AddAllocation([flagValue]);
      } else {
        throw new Error(`Invalid whitelist mode '${whitelistMode}'. Expected 'Invest' or 'AddAllocation'.`);
      }

      let globalAdminSigner;
      if (mode === 'multisig') {
        globalAdminSigner = noopSigner(address(globalAdmin));
      } else {
        globalAdminSigner = await parseKeypairFile(globalAdmin as string);
      }

      const instruction = await kaminoManager.addUpdateWhitelistedReserveIx(
        reserveAddress,
        whitelistModeEnum,
        globalAdminSigner
      );

      await processTx(
        env.c,
        globalAdminSigner,
        [
          instruction,
          ...getPriorityFeeAndCuIxs({
            priorityFeeMultiplier: 2500,
            computeUnits,
          }),
        ],
        mode,
        []
      );

      mode === 'execute' &&
        console.log(
          `Reserve ${reserveAddress} whitelisted for ${whitelistMode} with value ${flagValue ? 'ALLOW' : 'DENY'}`
        );
    });

  commands
    .command('whitelist-reserves')
    .requiredOption(
      '--reserves-file <string>',
      'Path to a file containing newline and/or comma-separated reserve addresses'
    )
    .option(
      '--value <string>',
      'Value: "1" or "true" to add to whitelist, "0" or "false" to remove from whitelist',
      '1'
    )
    .requiredOption(
      `--mode <string>`,
      'simulate|multisig|execute - simulate - to print txn simulation and to get tx simulation link in explorer, execute - execute tx, multisig - to get bs58 tx for multisig usage'
    )
    .requiredOption(
      '--global-admin <string>',
      'Global admin signer (keypair path in execute/simulate modes, pubkey in multisig mode)'
    )
    .option(`--staging`, 'If true, will use the staging programs')
    .option(`--devnet`, 'If true, will use devnet programs and RPC')
    .option(`--multisig <string>`, 'If using multisig mode this is required, otherwise will be ignored')
    .option(`--CU <number>`, 'The number of compute units to use for the transaction')
    .action(processWhitelistReservesFile);

  commands
    .command('unwhitelist-reserves')
    .requiredOption(
      '--reserves-file <string>',
      'Path to a file containing newline and/or comma-separated reserve addresses to remove from the whitelist'
    )
    .requiredOption(
      `--mode <string>`,
      'simulate|multisig|execute - simulate - to print txn simulation and to get tx simulation link in explorer, execute - execute tx, multisig - to get bs58 tx for multisig usage'
    )
    .requiredOption(
      '--global-admin <string>',
      'Global admin signer (keypair path in execute/simulate modes, pubkey in multisig mode)'
    )
    .option(`--staging`, 'If true, will use the staging programs')
    .option(`--devnet`, 'If true, will use devnet programs and RPC')
    .option(`--multisig <string>`, 'If using multisig mode this is required, otherwise will be ignored')
    .option(`--CU <number>`, 'The number of compute units to use for the transaction')
    .action(async (args) => processWhitelistReservesFile({ ...args, value: '0' }));

  commands
    .command('backfill-whitelisted-reserves')
    .option(
      '--value <string>',
      'Value: "1" or "true" to add to whitelist, "0" or "false" to remove from whitelist',
      '1'
    )
    .requiredOption(
      `--mode <string>`,
      'simulate|multisig|execute - simulate - to print txn simulation and to get tx simulation link in explorer, execute - execute tx, multisig - to get bs58 tx for multisig usage'
    )
    .requiredOption(
      '--global-admin <string>',
      'Global admin signer (keypair path in execute/simulate modes, pubkey in multisig mode)'
    )
    .option(
      `--markets <string>`,
      'Comma-separated list of market addresses. If not provided, all markets will be processed'
    )
    .option(`--staging`, 'If true, will use the staging programs')
    .option(`--devnet`, 'If true, will use devnet programs and RPC')
    .option(`--multisig <string>`, 'If using multisig mode this is required, otherwise will be ignored')
    .option(`--CU <number>`, 'The number of compute units to use for the transaction')
    .action(async ({ value, mode, globalAdmin, markets, staging, devnet, multisig, CU: cu }) => {
      if (mode === 'multisig' && !multisig) {
        throw new Error('If using multisig mode, multisig pubkey is required');
      }

      const ms = multisig ? address(multisig) : undefined;
      const env = await initEnv(staging, ms, undefined, undefined, devnet);
      const computeUnits = cu ? cu : DEFAULT_CU_PER_TX;
      const kaminoManager = new KaminoManager(
        env.c.rpc,
        DEFAULT_RECENT_SLOT_DURATION_MS,
        env.klendProgramId,
        env.kvaultProgramId,
        undefined,
        env.farmsProgramId
      );

      let globalAdminSigner;
      if (mode === 'multisig') {
        globalAdminSigner = noopSigner(address(globalAdmin));
      } else {
        globalAdminSigner = await parseKeypairFile(globalAdmin as string);
      }

      // Get markets to process
      let marketsToProcess: KaminoMarket[];
      if (markets) {
        const marketAddresses = markets.split(',').map((m: string) => address(m.trim()));
        console.log(`Processing ${marketAddresses.length} specified markets...`);
        marketsToProcess = await Promise.all(
          marketAddresses.map(async (marketAddress: Address) => {
            const market = await KaminoMarket.load(
              env.c.rpc,
              marketAddress,
              DEFAULT_RECENT_SLOT_DURATION_MS,
              env.klendProgramId
            );
            if (!market) {
              throw new Error(`Market ${marketAddress} not found`);
            }
            return market;
          })
        );
      } else {
        console.log('Fetching all markets...');
        marketsToProcess = await kaminoManager.getAllMarkets(env.klendProgramId);
        console.log(`Found ${marketsToProcess.length} markets`);
      }

      // Collect all reserves from all markets
      const allReserves: Address[] = [];
      for (const market of marketsToProcess) {
        const marketName = parseTokenSymbol(market.state.name);
        const reserveAddresses = Array.from(market.reserves.keys());
        console.log(`Market ${market.getAddress()} (${marketName}): ${reserveAddresses.length} reserves`);
        allReserves.push(...reserveAddresses);
      }

      console.log(`\nTotal reserves to whitelist: ${allReserves.length}`);
      console.log(`Whitelist modes: Invest AND AddAllocation (both will be set)`);

      // Parse the value (1/true = add, 0/false = remove)
      const flagValue = parseBooleanFlag(value);
      console.log(`Action: ${flagValue ? 'ADD to whitelist' : 'REMOVE from whitelist'}`);

      if (mode === 'simulate') {
        console.log('\nSimulation mode - no transactions will be executed');
      }

      // Create whitelist mode enums for both Invest and AddAllocation
      const investModeEnum = new UpdateReserveWhitelistMode.Invest([flagValue]);
      const addAllocationModeEnum = new UpdateReserveWhitelistMode.AddAllocation([flagValue]);

      // Process each reserve with both whitelist modes
      let successCount = 0;
      let errorCount = 0;

      for (const reserveAddress of allReserves) {
        try {
          const investInstruction = await kaminoManager.addUpdateWhitelistedReserveIx(
            reserveAddress,
            investModeEnum,
            globalAdminSigner
          );

          const addAllocationInstruction = await kaminoManager.addUpdateWhitelistedReserveIx(
            reserveAddress,
            addAllocationModeEnum,
            globalAdminSigner
          );

          await processTx(
            env.c,
            globalAdminSigner,
            [
              investInstruction,
              addAllocationInstruction,
              ...getPriorityFeeAndCuIxs({
                priorityFeeMultiplier: 2500,
                computeUnits,
              }),
            ],
            mode,
            []
          );

          successCount++;
          console.log(`✓ [${successCount}/${allReserves.length}] ${reserveAddress} (Invest + AddAllocation)`);
        } catch (error) {
          errorCount++;
          console.error(`✗ Failed to whitelist ${reserveAddress}:`, error);
        }
      }

      console.log(`\nBackfill complete!`);
      console.log(`Success: ${successCount} reserves (both modes set)`);
      console.log(`Errors: ${errorCount}`);
    });

  commands
    .command('remove-all-whiteslists-for-market')
    .requiredOption('--market <string>', 'Market address to inspect and clear reserve whitelist entries for')
    .requiredOption(
      `--mode <string>`,
      'simulate|multisig|execute - simulate - to print txn simulation and to get tx simulation link in explorer, execute - execute tx, multisig - to get bs58 tx for multisig usage'
    )
    .requiredOption(
      '--global-admin <string>',
      'Global admin signer (keypair path in execute/simulate modes, pubkey in multisig mode)'
    )
    .option(`--staging`, 'If true, will use the staging programs')
    .option(`--devnet`, 'If true, will use devnet programs and RPC')
    .option(`--multisig <string>`, 'If using multisig mode this is required, otherwise will be ignored')
    .option(`--CU <number>`, 'The number of compute units to use for the transaction')
    .action(async ({ market, mode, globalAdmin, staging, devnet, multisig, CU: cu }) => {
      if (mode === 'multisig' && !multisig) {
        throw new Error('If using multisig mode, multisig pubkey is required');
      }

      const ms = multisig ? address(multisig) : undefined;
      const env = await initEnv(staging, ms, undefined, undefined, devnet);
      const computeUnits = cu ? cu : DEFAULT_CU_PER_TX;
      const marketAddress = address(market);

      const kaminoManager = new KaminoManager(
        env.c.rpc,
        DEFAULT_RECENT_SLOT_DURATION_MS,
        env.klendProgramId,
        env.kvaultProgramId,
        undefined,
        env.farmsProgramId
      );

      const marketState = await KaminoMarket.load(
        env.c.rpc,
        marketAddress,
        DEFAULT_RECENT_SLOT_DURATION_MS,
        env.klendProgramId
      );
      if (!marketState) {
        throw new Error(`Market ${marketAddress} not found`);
      }

      const reserves = Array.from(marketState.reserves.values());
      const marketName = parseTokenSymbol(marketState.state.name);

      console.log(`Market ${marketAddress} (${marketName})`);
      console.log(`Total reserves in market: ${reserves.length}`);

      if (reserves.length === 0) {
        console.log('No reserves found for this market');
        return;
      }

      const reserveWhitelistEntryPdas = await Promise.all(
        reserves.map((reserve) => getReserveWhitelistEntryPda(reserve.address, env.kvaultProgramId))
      );
      const reserveWhitelistEntries = await ReserveWhitelistEntry.fetchMultiple(
        env.c.rpc,
        reserveWhitelistEntryPdas,
        env.kvaultProgramId
      );

      const whitelistedReserves = reserves
        .map((reserve, index) => {
          const whitelistEntry = reserveWhitelistEntries[index];

          return {
            reserve,
            whitelistEntry,
            whitelistEntryPda: reserveWhitelistEntryPdas[index],
          };
        })
        .filter(
          ({ whitelistEntry }) =>
            whitelistEntry !== null &&
            (whitelistEntry.whitelistInvest !== 0 || whitelistEntry.whitelistAddAllocation !== 0)
        );

      if (whitelistedReserves.length === 0) {
        console.log('No whitelisted reserves found in this market');
        return;
      }

      console.log(`Whitelisted reserves to clear: ${whitelistedReserves.length}`);
      whitelistedReserves.forEach(({ reserve, whitelistEntry, whitelistEntryPda }, index) => {
        console.log(
          `${index + 1}. reserve=${reserve.address} symbol=${
            reserve.symbol
          } mint=${reserve.getLiquidityMint()} pda=${whitelistEntryPda}`
        );
        console.log(
          `   whitelistInvest=${whitelistEntry!.whitelistInvest} whitelistAddAllocation=${
            whitelistEntry!.whitelistAddAllocation
          }`
        );
      });

      let globalAdminSigner: TransactionSigner;
      if (mode === 'multisig') {
        globalAdminSigner = noopSigner(address(globalAdmin));
      } else {
        globalAdminSigner = await parseKeypairFile(globalAdmin as string);
      }

      const batchSize = 3;
      const disableInvestMode = new UpdateReserveWhitelistMode.Invest([0]);
      const disableAddAllocationMode = new UpdateReserveWhitelistMode.AddAllocation([0]);

      for (let batchStart = 0; batchStart < whitelistedReserves.length; batchStart += batchSize) {
        const batch = whitelistedReserves.slice(batchStart, batchStart + batchSize);
        const instructions: Instruction[] = [];

        for (const { reserve } of batch) {
          const disableInvestInstruction = await kaminoManager.addUpdateWhitelistedReserveIx(
            reserve.address,
            disableInvestMode,
            globalAdminSigner
          );
          const disableAddAllocationInstruction = await kaminoManager.addUpdateWhitelistedReserveIx(
            reserve.address,
            disableAddAllocationMode,
            globalAdminSigner
          );

          instructions.push(disableInvestInstruction, disableAddAllocationInstruction);
        }

        console.log(
          `\nBatch ${Math.floor(batchStart / batchSize) + 1}: ${batch.map(({ reserve }) => reserve.address).join(', ')}`
        );

        await processTx(
          env.c,
          globalAdminSigner,
          [
            ...instructions,
            ...getPriorityFeeAndCuIxs({
              priorityFeeMultiplier: 2500,
              computeUnits,
            }),
          ],
          mode,
          []
        );
      }

      mode === 'execute' &&
        console.log(`Removed Invest/AddAllocation whitelist flags for ${whitelistedReserves.length} reserves`);
    });

  commands
    .command('check-reserve-is-whitelisted')
    .requiredOption('--reserve <string>', 'Reserve address to check')
    .option(`--staging`, 'If true, will use the staging programs')
    .option(`--devnet`, 'If true, will use devnet programs and RPC')
    .action(checkReserveWhitelistCommand);

  commands
    .command('check-whitelist-for-mint')
    .requiredOption('--mint <string>', 'Token mint address to check across all UI markets')
    .option(`--staging`, 'If true, will use the staging programs')
    .option(`--devnet`, 'If true, will use devnet programs and RPC')
    .action(async ({ mint, staging, devnet }) => {
      const env = await initEnv(staging, undefined, undefined, undefined, devnet);
      const tokenMint = address(mint);

      const marketsConfig = await getMarketsFromApi({ api: { programId: env.klendProgramId } });
      console.log(`Found ${marketsConfig.length} UI markets from CDN\n`);

      const markets = await Promise.all(
        marketsConfig.map(async (cfg) => {
          const market = await KaminoMarket.load(
            env.c.rpc,
            address(cfg.lendingMarket),
            DEFAULT_RECENT_SLOT_DURATION_MS,
            env.klendProgramId
          );
          return { cfg, market };
        })
      );

      // Collect all reserves for this mint across all markets
      const reserveEntries: { marketName: string; marketAddress: string; reserveAddress: Address; symbol: string }[] =
        [];
      for (const { cfg, market } of markets) {
        if (!market) continue;
        for (const reserve of market.getReservesByMint(tokenMint)) {
          reserveEntries.push({
            marketName: cfg.name,
            marketAddress: cfg.lendingMarket,
            reserveAddress: reserve.address,
            symbol: reserve.symbol,
          });
        }
      }

      if (reserveEntries.length === 0) {
        console.log(`No reserves found for mint ${tokenMint} in any UI market`);
        return;
      }

      // Derive all PDAs and batch-fetch whitelist entries
      const pdas = await Promise.all(
        reserveEntries.map((e) => getReserveWhitelistEntryPda(e.reserveAddress, env.kvaultProgramId))
      );
      const entries = await ReserveWhitelistEntry.fetchMultiple(env.c.rpc, pdas, env.kvaultProgramId);

      let missingCount = 0;
      for (let i = 0; i < reserveEntries.length; i++) {
        const r = reserveEntries[i];
        const entry = entries[i];
        const pda = pdas[i];

        const invest = entry ? entry.whitelistInvest : 0;
        const addAlloc = entry ? entry.whitelistAddAllocation : 0;
        const pdaStatus = entry ? 'initialized' : 'NOT initialized';
        const isMissing = !entry || invest === 0 || addAlloc === 0;

        if (isMissing) {
          missingCount++;
          console.log(
            `[MISSING] ${r.symbol} reserve ${r.reserveAddress} in market "${r.marketName}" (${r.marketAddress})`
          );
          console.log(`  PDA: ${pda} (${pdaStatus})`);
          console.log(`  whitelistInvest: ${invest}`);
          console.log(`  whitelistAddAllocation: ${addAlloc}`);
          console.log('');
        }
      }

      if (missingCount === 0) {
        console.log(
          `All ${reserveEntries.length} reserves for mint ${tokenMint} are fully whitelisted (Invest + AddAllocation)`
        );
      } else {
        console.log(`${missingCount}/${reserveEntries.length} reserves need whitelisting`);
      }
    });

  commands
    .command('update-vault-mgmt-fee')
    .requiredOption('--vault <string>', 'Vault address')
    .requiredOption('--fee-bps <string>', 'Management fee to set (in basis points)')
    .requiredOption(
      `--mode <string>`,
      'simulate|multisig|execute - simulate - to print txn simulation and to get tx simulation link in explorer, execute - execute tx, multisig - to get bs58 tx for multisig usage'
    )
    .option(`--staging`, 'If true, will use the staging programs')
    .option(`--devnet`, 'If true, will use devnet programs and RPC')
    .option(`--CU <number>`, 'The number of compute units to use for the transaction')
    .action(async ({ vault, feeBps, mode, staging, devnet, CU: cu }) => {
      const env = await initEnv(staging, undefined, undefined, undefined, devnet);
      const vaultAddress = address(vault);
      const computeUnits = cu ? cu : DEFAULT_CU_PER_TX;
      const kaminoManager = new KaminoManager(
        env.c.rpc,
        DEFAULT_RECENT_SLOT_DURATION_MS,
        env.klendProgramId,
        env.kvaultProgramId,
        undefined,
        env.farmsProgramId
      );

      const kaminoVault = new KaminoVault(env.c.rpc, vaultAddress, undefined, env.kvaultProgramId);
      const { vaultState, vaultReservesMap } = await loadVaultInstructionParams(kaminoManager, kaminoVault);
      const signer = await env.getSigner({ vaultState });
      const instructions = await kaminoManager.updateVaultConfigIxs(
        kaminoVault,
        new ManagementFeeBps(),
        feeBps,
        vaultReservesMap,
        signer
      );

      await processTx(
        env.c,
        signer,
        [
          instructions.updateVaultConfigIx,
          ...instructions.updateLUTIxs,
          ...instructions.extraIxs,
          ...getPriorityFeeAndCuIxs({
            priorityFeeMultiplier: 2500,
            computeUnits,
          }),
        ],
        mode,
        []
      );

      mode === 'execute' && console.log('Management fee updated');
    });

  commands
    .command('insert-into-lut')
    .requiredOption('--lut <string>', 'Lookup table address')
    .requiredOption('--addresses <string>', 'The addresses to insert into the LUT, space separated')
    .requiredOption(
      `--mode <string>`,
      'simulate|multisig|execute - simulate - to print txn simulation and to get tx simulation link in explorer, execute - execute tx, multisig - to get bs58 tx for multisig usage'
    )
    .option(`--staging`, 'If true, will use the staging programs')
    .option(`--devnet`, 'If true, will use devnet programs and RPC')
    .option(`--multisig <string>`, 'If using multisig mode this is required, otherwise will be ignored')
    .option(`--signer <string>`, 'If set, it will use the provided signer instead of the default one')
    .action(async ({ lut, addresses, mode, staging, devnet, multisig, signer }) => {
      if (mode === 'multisig' && !multisig) {
        throw new Error('If using multisig mode, multisig is required');
      }
      const ms = multisig ? address(multisig) : undefined;
      const env = await initEnv(staging, ms, undefined, undefined, devnet);
      const lutAddress = address(lut);
      let txSigner = await env.getSigner();
      // if the signer is provided (path to a keypair) we use it, otherwise we use the default one
      if (signer) {
        txSigner = await parseKeypairFile(signer as string);
      }
      const addressesArr = addresses.split(' ').map((a: string) => address(a));

      const kaminoManager = new KaminoManager(
        env.c.rpc,
        DEFAULT_RECENT_SLOT_DURATION_MS,
        env.klendProgramId,
        env.kvaultProgramId,
        undefined,
        env.farmsProgramId
      );

      const instructions = await kaminoManager.insertIntoLutIxs(txSigner, lutAddress, addressesArr);

      await processTx(
        env.c,
        txSigner,
        [
          ...instructions,
          ...getPriorityFeeAndCuIxs({
            priorityFeeMultiplier: 2500,
          }),
        ],
        mode,
        []
      );

      mode === 'execute' && console.log('Management fee updated');
    });

  commands.command('create-lut').action(async () => {
    const env = await initEnv(false);
    const signer = await env.getSigner();
    const recentSlot = await env.c.rpc.getSlot({ commitment: 'finalized' }).send();
    const [initLutIx, lutAddress] = await initLookupTableIx(signer, recentSlot);

    await processTx(
      env.c,
      signer,
      [
        initLutIx,
        ...getPriorityFeeAndCuIxs({
          priorityFeeMultiplier: 2500,
        }),
      ],
      'execute',
      []
    );
    console.log(`LUT created: ${lutAddress}`);
  });

  commands
    .command('sync-vault-lut')
    .requiredOption('--vault <string>', 'The vault address to sync')
    .requiredOption(
      `--mode <string>`,
      'simulate|multisig|execute - simulate - to print txn simulation and to get tx simulation link in explorer, execute - execute tx, multisig - to get bs58 tx for multisig usage'
    )
    .option(`--staging`, 'If true, will use the staging programs')
    .option(`--devnet`, 'If true, will use devnet programs and RPC')
    .option(`--signer <string>`, 'If set, it will use the provided signer instead of the default one')
    .action(async ({ vault, mode, staging, devnet, signer }) => {
      const env = await initEnv(staging, undefined, undefined, undefined, devnet);
      const vaultAddress = address(vault);

      const kaminoManager = new KaminoManager(
        env.c.rpc,
        DEFAULT_RECENT_SLOT_DURATION_MS,
        env.klendProgramId,
        env.kvaultProgramId,
        undefined,
        env.farmsProgramId
      );

      const kaminoVault = new KaminoVault(env.c.rpc, vaultAddress, undefined, env.kvaultProgramId);
      const vaultState = await kaminoVault.getState();
      let txSigner = await env.getSigner({ vaultState });
      // if the signer is provided (path to a keypair) we use it, otherwise we use the default one
      if (signer) {
        txSigner = await parseKeypairFile(signer as string);
      }
      const slot = await env.c.rpc.getSlot().send();
      const vaultReservesMap = await kaminoManager.loadVaultReserves(vaultState);
      const syncLUTIxs = await kaminoManager.syncVaultLUTIxs(txSigner, kaminoVault, slot, vaultReservesMap);

      // if we need to create the LUT we have to do that in a separate tx and wait a little bit after
      if (syncLUTIxs.setupLUTIfNeededIxs.length > 0) {
        await processTx(
          env.c,
          txSigner,
          [
            ...syncLUTIxs.setupLUTIfNeededIxs,
            ...getPriorityFeeAndCuIxs({
              priorityFeeMultiplier: 2500,
            }),
          ],
          mode,
          []
        );
        await sleep(2000);
        mode === 'execute' && console.log('LUT created and set to the vault');
      }
      // if there are accounts to be added to the LUT we have to do that in a separate tx
      for (const ix of syncLUTIxs.syncLUTIxs) {
        await processTx(
          env.c,
          txSigner,
          [
            ix,
            ...getPriorityFeeAndCuIxs({
              priorityFeeMultiplier: 2500,
            }),
          ],
          mode,
          []
        );
        mode === 'execute' && console.log('Accounts added to the LUT');
      }
    });

  commands
    .command('update-reserve-farm')
    .requiredOption('--market <string>', 'Lending market address')
    .requiredOption('--reserve <string>', 'Reserve address')
    .requiredOption('--farm-kind <string>', 'collateral | debt')
    .requiredOption('--farm <string>', 'Farm state address to set on the reserve')
    .requiredOption(
      `--mode <string>`,
      'simulate|multisig|execute - simulate - to print txn simulation and to get tx simulation link in explorer, execute - execute tx, multisig - to get bs58 tx for multisig usage'
    )
    .option(`--staging`, 'If true, will use the staging programs')
    .option(`--devnet`, 'If true, will use devnet programs and RPC')
    .option(`--multisig <string>`, 'If using multisig mode this is required, otherwise will be ignored')
    .option(`--signer <string>`, 'If set, it will use the provided signer instead of the default one')
    .action(async ({ market, reserve, farmKind, farm, mode, staging, devnet, multisig, signer }) => {
      if (mode === 'multisig' && !multisig) {
        throw new Error('If using multisig mode, multisig is required');
      }
      if (farmKind !== 'collateral' && farmKind !== 'debt') {
        throw new Error(`Invalid --farm-kind "${farmKind}": expected "collateral" or "debt"`);
      }
      const ms = multisig ? address(multisig) : undefined;
      const env = await initEnv(staging, ms, undefined, undefined, devnet);
      const kaminoManager = new KaminoManager(
        env.c.rpc,
        DEFAULT_RECENT_SLOT_DURATION_MS,
        env.klendProgramId,
        env.kvaultProgramId,
        undefined,
        env.farmsProgramId
      );

      const marketAddress = address(market);
      const kaminoMarket = (await KaminoMarket.load(
        env.c.rpc,
        marketAddress,
        DEFAULT_RECENT_SLOT_DURATION_MS,
        env.klendProgramId,
        false
      ))!;
      const marketWithAddress: MarketWithAddress = { address: marketAddress, state: kaminoMarket.state };

      // the lending market owner must authorize the update: getSigner returns the configured admin when it
      // matches the owner, otherwise a noop signer for the owner (the correct authority for simulate/multisig)
      const txSigner = signer
        ? await parseKeypairFile(signer as string)
        : await env.getSigner({ market: kaminoMarket });

      const kind = farmKind === 'debt' ? new ReserveFarmKind.Debt() : new ReserveFarmKind.Collateral();
      const ix = await kaminoManager.updateReserveFarmIx(
        txSigner,
        marketWithAddress,
        address(reserve),
        kind,
        address(farm)
      );

      await processTx(
        env.c,
        txSigner,
        [
          ix,
          ...getPriorityFeeAndCuIxs({
            priorityFeeMultiplier: 2500,
          }),
        ],
        mode,
        []
      );

      mode === 'execute' && console.log(`Reserve ${reserve} ${farmKind} farm set to ${farm}`);
    });

  commands
    .command('create-market-lut')
    .requiredOption('--market <string>', 'Lending market address')
    .requiredOption(
      `--mode <string>`,
      'simulate|multisig|execute - simulate - to print txn simulation and to get tx simulation link in explorer, execute - execute tx, multisig - to get bs58 tx for multisig usage'
    )
    .option(
      '--existing-lut <string>',
      'Existing market LUT to extend instead of creating a new one (required for --mode multisig)'
    )
    .option(`--staging`, 'If true, will use the staging programs')
    .option(`--devnet`, 'If true, will use devnet programs and RPC')
    .option(`--multisig <string>`, 'Required in multisig mode; sets the LUT authority/payer for generated transactions')
    .option(
      `--signer <string>`,
      'LUT authority/payer keypair for simulate/execute (not allowed with --mode multisig; use --multisig)'
    )
    .action(async ({ market, mode, existingLut, staging, devnet, multisig, signer }) => {
      const sendMode = mode as SendTxMode;
      assertCreateMarketLutCliOptions({
        mode: sendMode,
        multisig,
        existingLut,
        signer,
      });

      const ms = multisig ? address(multisig) : undefined;
      const env = await initEnv(staging, ms, undefined, undefined, devnet);
      const kaminoManager = new KaminoManager(
        env.c.rpc,
        DEFAULT_RECENT_SLOT_DURATION_MS,
        env.klendProgramId,
        env.kvaultProgramId,
        undefined,
        env.farmsProgramId
      );

      const kaminoMarket = (await KaminoMarket.load(
        env.c.rpc,
        address(market),
        DEFAULT_RECENT_SLOT_DURATION_MS,
        env.klendProgramId
      ))!;

      // market LUT is client-owned: multisig mode always uses --multisig (not ADMIN via getSigner)
      const signerOverride = signer ? await parseKeypairFile(signer as string) : undefined;
      const txSigner = resolveCreateMarketLutTxSigner(
        sendMode,
        ms,
        signerOverride,
        sendMode === 'multisig' ? undefined : await env.getSigner()
      );

      const { lut, createLutIx, populateLutIxs } = await kaminoManager.getMarketLookupTableIxs(
        txSigner,
        kaminoMarket,
        existingLut ? address(existingLut) : undefined
      );

      // the create must be confirmed before the populate ixs can extend it, so it goes in its own tx
      if (createLutIx) {
        await processTx(
          env.c,
          txSigner,
          [
            createLutIx,
            ...getPriorityFeeAndCuIxs({
              priorityFeeMultiplier: 2500,
            }),
          ],
          sendMode,
          []
        );

        switch (sendMode) {
          case 'simulate':
            // simulation does not persist the LUT, so populate would fail against a non-existent account
            console.log(
              `Simulated market LUT creation for ${lut}. Skipping populate: simulation does not persist the LUT; run --mode execute to create+populate, or pass --existing-lut to simulate extending an on-chain LUT.`
            );
            return;
          case 'execute': {
            // wait until the new LUT is fetchable rather than guessing with a fixed delay
            let lutVisible = false;
            for (let attempt = 0; attempt < 15 && !lutVisible; attempt++) {
              try {
                await fetchAddressLookupTable(env.c.rpc, lut);
                lutVisible = true;
              } catch {
                await sleep(1000);
              }
            }
            if (!lutVisible) {
              throw new Error(`Market LUT ${lut} not visible on-chain after creation; aborting before extend`);
            }
            console.log(`Market LUT created: ${lut}`);
            break;
          }
          case 'multisig':
            throw new Error(
              'Internal error: fresh LUT create reached process path in multisig mode; --existing-lut is required'
            );
          case 'print':
            break;
          default: {
            const _exhaustive: never = sendMode;
            throw new Error(`Unhandled mode: ${_exhaustive}`);
          }
        }
      }

      for (const ix of populateLutIxs) {
        await processTx(
          env.c,
          txSigner,
          [
            ix,
            ...getPriorityFeeAndCuIxs({
              priorityFeeMultiplier: 2500,
            }),
          ],
          sendMode,
          []
        );
      }

      sendMode === 'execute' && console.log(`Market LUT: ${lut}`);
    });

  commands
    .command('update-vault-perf-fee')
    .requiredOption('--vault <string>', 'Vault address')
    .requiredOption('--fee-bps <string>', 'Performance fee to set (in basis points)')
    .requiredOption(
      `--mode <string>`,
      'simulate|multisig|execute - simulate - to print txn simulation and to get tx simulation link in explorer, execute - execute tx, multisig - to get bs58 tx for multisig usage'
    )
    .option(`--staging`, 'If true, will use the staging programs')
    .option(`--devnet`, 'If true, will use devnet programs and RPC')
    .option(`--CU <number>`, 'The number of compute units to use for the transaction')
    .action(async ({ vault, feeBps, mode, staging, devnet, CU: cu }) => {
      const env = await initEnv(staging, undefined, undefined, undefined, devnet);
      const vaultAddress = address(vault);
      const computeUnits = cu ? cu : DEFAULT_CU_PER_TX;

      const kaminoManager = new KaminoManager(
        env.c.rpc,
        DEFAULT_RECENT_SLOT_DURATION_MS,
        env.klendProgramId,
        env.kvaultProgramId,
        undefined,
        env.farmsProgramId
      );

      const kaminoVault = new KaminoVault(env.c.rpc, vaultAddress, undefined, env.kvaultProgramId);
      const { vaultState, vaultReservesMap } = await loadVaultInstructionParams(kaminoManager, kaminoVault);
      const signer = await env.getSigner({ vaultState });
      const instructions = await kaminoManager.updateVaultConfigIxs(
        kaminoVault,
        new PerformanceFeeBps(),
        feeBps,
        vaultReservesMap,
        signer
      );

      await processTx(
        env.c,
        signer,
        [
          instructions.updateVaultConfigIx,
          ...instructions.updateLUTIxs,
          ...instructions.extraIxs,
          ...getPriorityFeeAndCuIxs({
            priorityFeeMultiplier: 2500,
            computeUnits,
          }),
        ],
        mode,
        []
      );

      mode === 'execute' && console.log('Performance fee updated');
    });

  commands
    .command('accept-vault-ownership')
    .requiredOption('--vault <string>', 'Vault address')
    .requiredOption(
      `--mode <string>`,
      'simulate|multisig|execute - simulate - to print txn simulation and to get tx simulation link in explorer, execute - execute tx, multisig - to get bs58 tx for multisig usage'
    )
    .option(`--staging`, 'If true, will use the staging programs')
    .option(`--devnet`, 'If true, will use devnet programs and RPC')
    .option(`--CU <number>`, 'The number of compute units to use for the transaction')
    .action(async ({ vault, mode, staging, devnet, CU: cu }) => {
      const env = await initEnv(staging, undefined, undefined, undefined, devnet);
      const vaultAddress = address(vault);
      const computeUnits = cu ? cu : DEFAULT_CU_PER_TX;

      const kaminoManager = new KaminoManager(
        env.c.rpc,
        DEFAULT_RECENT_SLOT_DURATION_MS,
        env.klendProgramId,
        env.kvaultProgramId,
        undefined,
        env.farmsProgramId
      );

      const kaminoVault = new KaminoVault(env.c.rpc, vaultAddress, undefined, env.kvaultProgramId);
      const { vaultState, vaultReservesMap } = await loadVaultInstructionParams(kaminoManager, kaminoVault);
      const pendingAdmin = await env.getSigner({
        vaultState,
        useVaultPendingAdmin: true,
      });
      const instructions = await kaminoManager.acceptVaultOwnershipIxs(kaminoVault, vaultReservesMap, pendingAdmin);

      await processTx(
        env.c,
        pendingAdmin,
        [
          instructions.acceptVaultOwnershipIx,
          ...(instructions.acceptFLCFarmOwnershipIx ? [instructions.acceptFLCFarmOwnershipIx] : []),
          ...getPriorityFeeAndCuIxs({
            priorityFeeMultiplier: 2500,
            computeUnits,
          }),
        ],
        mode,
        []
      );

      mode === 'execute' && console.log(`Vault ownership accepted by ${pendingAdmin.address}`);

      await processTx(
        env.c,
        pendingAdmin,
        [
          instructions.initNewLUTIx,
          ...getPriorityFeeAndCuIxs({
            priorityFeeMultiplier: 2500,
          }),
        ],
        mode,
        []
      );

      mode === 'execute' && console.log('Initialized new LUT and updated vault config');

      // send the LUT mgmt ixs one by one
      const lutIxs = [...instructions.updateLUTIxs];
      for (let i = 0; i < lutIxs.length; i++) {
        const lutIxsGroup = lutIxs.slice(i, i + 1);
        await processTx(
          env.c,
          pendingAdmin,
          [
            ...lutIxsGroup,
            ...getPriorityFeeAndCuIxs({
              priorityFeeMultiplier: 2500,
            }),
          ],
          mode,
          []
        );
        mode === 'execute' && console.log('LUT updated');
      }
    });

  commands
    .command('give-up-pending-fees')
    .requiredOption('--vault <string>', 'Vault address')
    .requiredOption('--max-amount-to-give-up <string>', 'Max amount to give up')
    .requiredOption(
      `--mode <string>`,
      'simulate|multisig|execute - simulate - to print txn simulation and to get tx simulation link in explorer, execute - execute tx, multisig - to get bs58 tx for multisig usage'
    )
    .option(`--staging`, 'If true, will use the staging programs')
    .option(`--CU <number>`, 'The number of compute units to use for the transaction')
    .action(async ({ vault, maxAmountToGiveUp, mode, staging, multisig, CU: cu }) => {
      const env = await initEnv(multisig, staging);
      const vaultAddress = address(vault);
      const computeUnits = cu ? cu : DEFAULT_CU_PER_TX;

      const kaminoManager = new KaminoManager(
        env.c.rpc,
        DEFAULT_RECENT_SLOT_DURATION_MS,
        env.klendProgramId,
        env.kvaultProgramId,
        undefined,
        env.farmsProgramId
      );

      const kaminoVault = new KaminoVault(env.c.rpc, vaultAddress, undefined, env.kvaultProgramId);
      const vaultState = await kaminoVault.getState();
      const signer = await env.getSigner({ vaultState });
      const instruction = await kaminoManager.giveUpPendingFeesIx(kaminoVault, new Decimal(maxAmountToGiveUp), signer);

      await processTx(
        env.c,
        signer,
        [
          instruction,
          ...getPriorityFeeAndCuIxs({
            priorityFeeMultiplier: 2500,
            computeUnits,
          }),
        ],
        mode,
        []
      );

      mode === 'execute' && console.log('Gave up pending fees');
    });

  commands
    .command('withdraw-pending-fees')
    .requiredOption('--vault <string>', 'Vault address')
    .requiredOption(
      `--mode <string>`,
      'simulate|multisig|execute - simulate - to print txn simulation and to get tx simulation link in explorer, execute - execute tx, multisig - to get bs58 tx for multisig usage'
    )
    .option(`--staging`, 'If true, will use the staging programs')
    .option(`--devnet`, 'If true, will use devnet programs and RPC')
    .option(`--CU <number>`, 'The number of compute units to use for the transaction')
    .action(async ({ vault, mode, staging, devnet, CU: cu }) => {
      const env = await initEnv(staging, undefined, undefined, undefined, devnet);
      const vaultAddress = address(vault);
      const computeUnits = cu ? cu : DEFAULT_CU_PER_TX;

      const kaminoManager = new KaminoManager(
        env.c.rpc,
        DEFAULT_RECENT_SLOT_DURATION_MS,
        env.klendProgramId,
        env.kvaultProgramId,
        undefined,
        env.farmsProgramId
      );

      const kaminoVault = new KaminoVault(env.c.rpc, vaultAddress, undefined, env.kvaultProgramId);
      const vaultState = await kaminoVault.getState();
      const signer = await env.getSigner({ vaultState });

      const slot = await env.c.rpc.getSlot().send();
      const vaultReservesMap = await kaminoManager.loadVaultReserves(vaultState);
      const instructions = await kaminoManager.withdrawPendingFeesIxs(kaminoVault, slot, vaultReservesMap, signer);

      await processTx(
        env.c,
        signer,
        [
          ...instructions,
          ...getPriorityFeeAndCuIxs({
            priorityFeeMultiplier: 2500,
            computeUnits,
          }),
        ],
        mode,
        []
      );

      mode === 'execute' && console.log('Pending fees withdrawn');
    });

  commands
    .command('remove-vault-allocation')
    .requiredOption('--vault <string>', 'Vault address')
    .requiredOption('--reserve <string>', 'Reserve address')
    .requiredOption(
      `--mode <string>`,
      'simulate|multisig|execute - simulate - to print txn simulation and to get tx simulation link in explorer, execute - execute tx, multisig - to get bs58 tx for multisig usage'
    )
    .option(`--staging`, 'If true, will use the staging programs')
    .option(`--devnet`, 'If true, will use devnet programs and RPC')
    .option(`--CU <number>`, 'The number of compute units to use for the transaction')
    .action(async ({ vault, reserve, mode, staging, devnet, CU: cu }) => {
      const env = await initEnv(staging, undefined, undefined, undefined, devnet);
      const reserveAddress = address(reserve);
      const vaultAddress = address(vault);
      const computeUnits = cu ? cu : DEFAULT_CU_PER_TX;

      const kaminoManager = new KaminoManager(
        env.c.rpc,
        DEFAULT_RECENT_SLOT_DURATION_MS,
        env.klendProgramId,
        env.kvaultProgramId,
        undefined,
        env.farmsProgramId
      );

      const kaminoVault = new KaminoVault(env.c.rpc, vaultAddress, undefined, env.kvaultProgramId);
      const vaultState = await kaminoVault.getState();
      const signer = await env.getSigner({ vaultState });

      const slot = await env.c.rpc.getSlot().send();
      const reserveState = await Reserve.fetch(env.c.rpc, reserveAddress, env.klendProgramId);
      if (!reserveState) {
        throw new Error('Reserve not found');
      }
      const ixs = await kaminoManager.fullRemoveReserveFromVaultIxs(
        signer,
        kaminoVault,
        reserveAddress,
        slot,
        reserveState
      );

      const transactionIxs = [
        ...ixs,
        ...getPriorityFeeAndCuIxs({
          priorityFeeMultiplier: 2500,
          computeUnits,
        }),
      ];

      const lookupTableAddresses = [];
      if (vaultState.vaultLookupTable !== DEFAULT_PUBLIC_KEY) {
        lookupTableAddresses.push(vaultState.vaultLookupTable);
      }
      const lookupTables = await fetchAllAddressLookupTable(env.c.rpc, lookupTableAddresses);

      await processTx(env.c, signer, transactionIxs, mode, lookupTables);
      mode === 'execute' && console.log('Vault allocation removed');
    });

  commands
    .command('stake')
    .requiredOption('--vault <string>', 'Vault address')
    .requiredOption(
      `--mode <string>`,
      'simulate|multisig|execute - simulate - to print txn simulation and to get tx simulation link in explorer, execute - execute tx, multisig - to get bs58 tx for multisig usage'
    )
    .option(`--staging`, 'If true, will use the staging programs')
    .option(`--devnet`, 'If true, will use devnet programs and RPC')
    .option(`--multisig <string>`, 'If using multisig mode this is required, otherwise will be ignored')
    .action(async ({ vault, mode, staging, devnet, multisig }) => {
      if (mode === 'multisig' && !multisig) {
        throw new Error('If using multisig mode, multisig is required');
      }
      const ms = multisig ? address(multisig) : undefined;
      const env = await initEnv(staging, ms, undefined, undefined, devnet);
      const user = await env.getSigner();
      const vaultAddress = address(vault);

      const kaminoVault = new KaminoVault(env.c.rpc, vaultAddress, undefined, env.kvaultProgramId);
      const stakeManager = new KaminoManager(
        env.c.rpc,
        DEFAULT_RECENT_SLOT_DURATION_MS,
        env.klendProgramId,
        env.kvaultProgramId,
        undefined,
        env.farmsProgramId
      );
      const { farmState } = await loadVaultInstructionParams(stakeManager, kaminoVault);
      if (!farmState) {
        throw new Error('Vault farm state is required to stake shares.');
      }
      const stakeIxs = await stakeManager.stakeSharesIxs(user, kaminoVault, undefined, farmState);
      await processTx(
        env.c,
        user,
        [
          ...stakeIxs,
          ...getPriorityFeeAndCuIxs({
            priorityFeeMultiplier: 2500,
          }),
        ],
        mode,
        []
      );

      mode === 'execute' && console.log('Staked into vault farm');
    });

  commands
    .command('update-vault-reserve-allocation')
    .requiredOption('--vault <string>', 'Vault address')
    .requiredOption('--reserve <string>', 'Reserve address')
    .requiredOption(
      `--mode <string>`,
      'simulate|multisig|execute - simulate - to print txn simulation and to get tx simulation link in explorer, execute - execute tx, multisig - to get bs58 tx for multisig usage'
    )
    .option('--allocation-weight <number>', 'Allocation weight')
    .option('--allocation-cap <string>', 'Allocation cap decimal value')
    .option('--ctoken-allocation-cap <string>', 'Ctoken allocation cap in ctoken lamports')
    .option(`--staging`, 'If true, will use the staging programs')
    .option(`--devnet`, 'If true, will use devnet programs and RPC')
    .option(`--multisig <string>`, 'If using multisig mode this is required, otherwise will be ignored')
    .option(`--skip-lut-update`, 'If set, it will skip the LUT update')
    .option(`--use-allocation-admin`, 'Sign as allocationAdmin instead of vault admin')
    .option(`--CU <number>`, 'The number of compute units to use for the transaction')
    .action(
      async ({
        vault,
        reserve,
        mode,
        allocationWeight,
        allocationCap,
        ctokenAllocationCap,
        staging,
        devnet,
        multisig,
        skipLutUpdate,
        useAllocationAdmin,
        CU: cu,
      }) => {
        if (mode === 'multisig' && !multisig) {
          throw new Error('If using multisig mode, multisig is required');
        }
        const ms = multisig ? address(multisig) : undefined;
        const env = await initEnv(staging, ms, undefined, undefined, devnet);
        const reserveAddress = address(reserve);
        const vaultAddress = address(vault);
        const kaminoVault = new KaminoVault(env.c.rpc, vaultAddress, undefined, env.kvaultProgramId);
        const vaultState = await kaminoVault.getState();
        const signer = await env.getSigner({ vaultState, useVaultAllocationAdmin: useAllocationAdmin });
        const shouldUpdateLut = skipLutUpdate ? false : true;
        const computeUnits = cu ? cu : DEFAULT_CU_PER_TX;
        let allocationWeightValue: number;
        let tokenAllocationCapTokens: Decimal;
        let ctokenAllocationCapLamportsBn: BN | undefined;

        const kaminoManager = new KaminoManager(
          env.c.rpc,
          DEFAULT_RECENT_SLOT_DURATION_MS,
          env.klendProgramId,
          env.kvaultProgramId
        );
        const reserveState = await Reserve.fetch(env.c.rpc, reserveAddress, env.klendProgramId);
        if (!reserveState) {
          throw new Error('Reserve not found');
        }

        const existentAllocation = kaminoManager.getVaultAllocations(vaultState).get(reserveAddress);

        if (allocationWeight) {
          allocationWeightValue = Number(allocationWeight);
        } else if (existentAllocation) {
          allocationWeightValue = existentAllocation.targetWeight.toNumber();
        } else {
          throw new Error('Allocation weight is required');
        }

        if (allocationCap) {
          tokenAllocationCapTokens = new Decimal(allocationCap);
        } else if (existentAllocation) {
          tokenAllocationCapTokens = existentAllocation.tokenAllocationCapLamports.div(
            new Decimal(10).pow(Number(vaultState.tokenMintDecimals.toString()))
          );
        } else {
          throw new Error('Allocation cap is required');
        }

        if (ctokenAllocationCap !== undefined) {
          ctokenAllocationCapLamportsBn = new BN(ctokenAllocationCap);
        }

        console.log('allocationWeightValue', allocationWeightValue);
        console.log('tokenAllocationCapTokens', tokenAllocationCapTokens.toString());
        ctokenAllocationCapLamportsBn &&
          console.log('ctokenAllocationCapLamports', ctokenAllocationCapLamportsBn.toString());
        const reserveWithAddress: ReserveWithAddress = {
          address: reserveAddress,
          state: reserveState,
        };
        const firstReserveAllocationConfig = new ReserveAllocationConfig(
          reserveWithAddress,
          allocationWeightValue,
          tokenAllocationCapTokens,
          ctokenAllocationCapLamportsBn
        );

        const instructions = await kaminoManager.updateVaultReserveAllocationIxs(
          kaminoVault,
          firstReserveAllocationConfig,
          signer
        );
        const txInstructions = [
          instructions.updateReserveAllocationIx,
          ...getPriorityFeeAndCuIxs({
            priorityFeeMultiplier: 2500,
            computeUnits,
          }),
        ];
        if (shouldUpdateLut) {
          txInstructions.push(...instructions.updateLUTIxs);
        }

        const lookupTables: Account<AddressLookupTable>[] = [];
        if (vaultState.vaultLookupTable !== DEFAULT_PUBLIC_KEY) {
          const lookupTable = await fetchAddressLookupTable(env.c.rpc, vaultState.vaultLookupTable);
          lookupTables.push(lookupTable);
        }
        await processTx(env.c, signer, txInstructions, mode, lookupTables);

        mode === 'execute' && console.log('Vault allocation updated');
      }
    );

  commands
    .command('deposit')
    .requiredOption('--vault <string>', 'Vault address')
    .requiredOption('--amount <number>', 'Token amount to deposit, in decimals')
    .requiredOption(
      `--mode <string>`,
      'simulate|multisig|execute - simulate - to print txn simulation and to get tx simulation link in explorer, execute - execute tx, multisig - to get bs58 tx for multisig usage'
    )
    .option(`--staging`, 'If true, will use the staging programs')
    .option(`--devnet`, 'If true, will use devnet programs and RPC')
    .option(`--multisig <string>`, 'If using multisig mode this is required, otherwise will be ignored')
    .option(`--CU <number>`, 'The number of compute units to use for the transaction')
    .option(
      `--feePayer <string>`,
      'Path to fee payer keypair file. If provided, this account pays tx fees and ATA rent instead of the user'
    )
    .action(async ({ vault, amount, mode, staging, devnet, multisig, CU: cu, feePayer: feePayerPath }) => {
      if (mode === 'multisig' && !multisig) {
        throw new Error('If using multisig mode, multisig is required');
      }
      const ms = multisig ? address(multisig) : undefined;
      const env = await initEnv(staging, ms, undefined, undefined, devnet);
      const computeUnits = cu ? cu : DEFAULT_CU_PER_TX;
      const vaultAddress = address(vault);

      const kaminoManager = new KaminoManager(
        env.c.rpc,
        DEFAULT_RECENT_SLOT_DURATION_MS,
        env.klendProgramId,
        env.kvaultProgramId,
        undefined,
        env.farmsProgramId
      );

      const kaminoVault = new KaminoVault(env.c.rpc, vaultAddress, undefined, env.kvaultProgramId);
      const user = await env.getSigner();
      const feePayer = feePayerPath ? await parseKeypairFile(feePayerPath) : undefined;
      const txPayer = feePayer ?? user;
      const { vaultReservesMap, farmState, flcFarmState } = await loadVaultInstructionParams(
        kaminoManager,
        kaminoVault
      );
      const selectedFarmStates = selectPrimaryVaultShareFarmStates({ farmState, flcFarmState });
      const depositInstructions = await kaminoManager.depositToVaultIxs(
        user,
        kaminoVault,
        amount,
        vaultReservesMap,
        selectedFarmStates.farmState,
        selectedFarmStates.flcFarmState,
        feePayer
      );
      const stakeIxs =
        depositInstructions.stakeInFarmIfNeededIxs.length > 0
          ? depositInstructions.stakeInFarmIfNeededIxs
          : depositInstructions.stakeInFlcFarmIfNeededIxs;
      const instructions = [...depositInstructions.depositIxs, ...stakeIxs];

      await processTx(
        env.c,
        txPayer,
        [
          ...instructions,
          ...getPriorityFeeAndCuIxs({
            priorityFeeMultiplier: 2500,
            computeUnits,
          }),
        ],
        mode,
        []
      );

      mode === 'execute' && console.log('User deposited');
    });

  commands
    .command('withdraw')
    .requiredOption('--vault <string>', 'Vault address')
    .requiredOption('--amount <number>', 'Shares amount to withdraw')
    .requiredOption(
      `--mode <string>`,
      'simulate|multisig|execute - simulate - to print txn simulation and to get tx simulation link in explorer, execute - execute tx, multisig - to get bs58 tx for multisig usage'
    )
    .option(`--staging`, 'If true, will use the staging programs')
    .option(`--devnet`, 'If true, will use devnet programs and RPC')
    .option(`--multisig <string>`, 'If using multisig mode this is required, otherwise will be ignored')
    .option(`--CU <number>`, 'The number of compute units to use for the transaction')
    .option(
      `--feePayer <string>`,
      'Path to fee payer keypair file. If provided, this account pays tx fees and ATA rent instead of the user'
    )
    .action(async ({ vault, amount, mode, staging, devnet, multisig, CU: cu, feePayer: feePayerPath }) => {
      if (mode === 'multisig' && !multisig) {
        throw new Error('If using multisig mode, multisig is required');
      }
      const ms = multisig ? address(multisig) : undefined;
      const env = await initEnv(staging, ms, undefined, undefined, devnet);
      const computeUnits = cu ? cu : DEFAULT_CU_PER_TX;

      const user = await env.getSigner();
      const feePayer = feePayerPath ? await parseKeypairFile(feePayerPath) : undefined;
      const txPayer = feePayer ?? user;
      const vaultAddress = address(vault);

      const kaminoManager = new KaminoManager(
        env.c.rpc,
        DEFAULT_RECENT_SLOT_DURATION_MS,
        env.klendProgramId,
        env.kvaultProgramId,
        undefined,
        env.farmsProgramId
      );

      const kaminoVault = new KaminoVault(env.c.rpc, vaultAddress, undefined, env.kvaultProgramId);
      const { vaultState, vaultReservesMap, farmState, flcFarmState } = await loadVaultInstructionParams(
        kaminoManager,
        kaminoVault
      );
      const selectedFarmStates = selectPrimaryVaultShareFarmStates({ farmState, flcFarmState });
      const lookupTableAddresses = [];
      if (vaultState.vaultLookupTable !== DEFAULT_PUBLIC_KEY) {
        lookupTableAddresses.push(vaultState.vaultLookupTable);
      }
      const lookupTables = await fetchAllAddressLookupTable(env.c.rpc, lookupTableAddresses);
      const confirmedSlot = await env.c.rpc.getSlot({ commitment: 'confirmed' }).send();
      const withdrawIxs = await kaminoManager.withdrawFromVaultIxs(
        user,
        kaminoVault,
        new Decimal(amount),
        confirmedSlot,
        vaultReservesMap,
        selectedFarmStates.farmState,
        selectedFarmStates.flcFarmState,
        feePayer
      );

      await processTx(
        env.c,
        txPayer,
        [
          ...withdrawIxs.unstakeFromFarmIfNeededIxs,
          ...withdrawIxs.withdrawIxs,
          ...withdrawIxs.postWithdrawIxs,
          ...getPriorityFeeAndCuIxs({
            priorityFeeMultiplier: 2500,
            computeUnits,
          }),
        ],
        mode,
        lookupTables
      );

      mode === 'execute' && console.log('User withdrew');
    });

  commands
    .command('invest-all-reserves')
    .requiredOption('--vault <string>', 'Vault address')
    .requiredOption(
      `--mode <string>`,
      'simulate|multisig|execute - simulate - to print txn simulation and to get tx simulation link in explorer, execute - execute tx, multisig - to get bs58 tx for multisig usage'
    )
    .option(`--staging`, 'If true, will use the staging programs')
    .option(`--devnet`, 'If true, will use devnet programs and RPC')
    .option(`--multisig <string>`, 'If using multisig mode this is required, otherwise will be ignored')
    .option(`--CU <number>`, 'The number of compute units to use for the transaction')
    .action(async ({ vault, mode, staging, devnet, multisig, CU: cu }) => {
      if (mode === 'multisig' && !multisig) {
        throw new Error('If using multisig mode, multisig is required');
      }
      const ms = multisig ? address(multisig) : undefined;
      const env = await initEnv(staging, ms, undefined, undefined, devnet);
      const computeUnits = cu ? cu : DEFAULT_CU_PER_TX;
      const payer = await env.getSigner();
      const vaultAddress = address(vault);

      const kaminoManager = new KaminoManager(
        env.c.rpc,
        DEFAULT_RECENT_SLOT_DURATION_MS,
        env.klendProgramId,
        env.kvaultProgramId,
        undefined,
        env.farmsProgramId
      );

      const slot = await env.c.rpc.getSlot().send();
      const kaminoVault = new KaminoVault(env.c.rpc, vaultAddress, undefined, env.kvaultProgramId);
      await kaminoVault.getState();
      const instructions = await kaminoManager.investAllReservesIxs(payer, kaminoVault, slot, false);

      for (let i = 0; i < instructions.length; i++) {
        const txInstructions: Instruction[] = [];
        txInstructions.push();
        await processTx(
          env.c,
          payer,
          [
            instructions[i],
            ...getPriorityFeeAndCuIxs({
              priorityFeeMultiplier: 2500,
              computeUnits,
            }),
          ],
          mode,
          []
        );
        mode === 'execute' && console.log('Reserves invested');
      }
    });

  commands
    .command('invest-single-reserve')
    .requiredOption('--vault <string>', 'Vault address')
    .requiredOption('--reserve <string>', 'Reserve address')
    .requiredOption(
      `--mode <string>`,
      'simulate|multisig|execute - simulate - to print txn simulation and to get tx simulation link in explorer, execute - execute tx, multisig - to get bs58 tx for multisig usage'
    )
    .option(`--staging`, 'If true, will use the staging programs')
    .option(`--devnet`, 'If true, will use devnet programs and RPC')
    .option(`--multisig <string>`, 'If using multisig mode this is required, otherwise will be ignored')
    .option(`--CU <number>`, 'The number of compute units to use for the transaction')
    .action(async ({ vault, reserve, mode, staging, devnet, multisig, CU: cu }) => {
      if (mode === 'multisig' && !multisig) {
        throw new Error('If using multisig mode, multisig is required');
      }
      const ms = multisig ? address(multisig) : undefined;
      const env = await initEnv(staging, ms, undefined, undefined, devnet);
      const computeUnits = cu ? cu : DEFAULT_CU_PER_TX;
      const vaultAddress = address(vault);

      const kaminoManager = new KaminoManager(
        env.c.rpc,
        DEFAULT_RECENT_SLOT_DURATION_MS,
        env.klendProgramId,
        env.kvaultProgramId,
        undefined,
        env.farmsProgramId
      );

      const kaminoVault = new KaminoVault(env.c.rpc, vaultAddress, undefined, env.kvaultProgramId);

      const reserveAddress = address(reserve);
      const reserveState = await Reserve.fetch(env.c.rpc, reserveAddress, env.klendProgramId);
      if (!reserveState) {
        throw new Error('Reserve not found');
      }

      const reserveWithAddress: ReserveWithAddress = {
        address: reserveAddress,
        state: reserveState,
      };

      const payer = await env.getSigner();
      const vaultState = await kaminoVault.getState();
      const vaultReservesMap = await kaminoManager.loadVaultReserves(vaultState);
      const instructions = await kaminoManager.investSingleReserveIxs(
        payer,
        kaminoVault,
        reserveWithAddress,
        vaultReservesMap
      );
      await processTx(
        env.c,
        payer,
        [
          ...instructions,
          ...getPriorityFeeAndCuIxs({
            priorityFeeMultiplier: 2500,
            computeUnits,
          }),
        ],
        mode,
        []
      );
      mode === 'execute' && console.log(`Reserve ${reserveAddress} invested`);
    });

  // commands
  //   .command('close-vault')
  //   .requiredOption('--vault <string>', 'Vault address')
  //   .option(`--staging`, 'If true, will use the staging programs')
  //   .action(async ({vault, staging}) => {
  //     const env = await initEnv(false, staging);
  //     const vaultAddress = address(vault);

  //     const kaminoManager = new KaminoManager(env.connection, env.klendProgramId, env.kvaultProgramId);

  //     const kaminoVault = new KaminoVault(vaultAddress, undefined, env.kvaultProgramId);
  //     const instructions = await kaminoManager.closeVault(kaminoVault);

  //     const closeVaultSig = await processTxn(env.client, env.payer, [instructions], 'execute', 2500, []);
  //     console.log('Vault closed:', closeVaultSig);
  //   });

  commands
    .command('get-vault-colls')
    .requiredOption('--vault <string>', 'Vault address')
    .option(`--staging`, 'If true, will use the staging programs')
    .option(`--devnet`, 'If true, will use devnet programs and RPC')
    .action(async ({ vault, staging, devnet }) => {
      const env = await initEnv(staging, undefined, undefined, undefined, devnet);
      const slotDuration = await getMedianSlotDurationInMsFromLastEpochs();

      const kaminoManager = new KaminoManager(
        env.c.rpc,
        slotDuration,
        env.klendProgramId,
        env.kvaultProgramId,
        undefined,
        env.farmsProgramId
      );

      const vaultAddress = address(vault);
      const vaultState = await new KaminoVault(env.c.rpc, vaultAddress, undefined, env.kvaultProgramId).getState();
      const confirmedSlot = await env.c.rpc.getSlot({ commitment: 'confirmed' }).send();
      const vaultReservesMap = await kaminoManager.loadVaultReserves(vaultState);
      const kaminoMarkets = await kaminoManager.loadKaminoMarketsForVaultReserves(vaultReservesMap);
      const vaultCollaterals = await kaminoManager.getVaultCollaterals(
        vaultState,
        confirmedSlot,
        vaultReservesMap,
        kaminoMarkets
      );
      vaultCollaterals.forEach((collateral) => {
        console.log('reserve ', collateral.address);
        console.log('market overview', collateral.reservesAsCollateral);
        console.log('min LTV', collateral.minLTVPct);
        console.log('max LTV', collateral.maxLTVPct);
      });
    });

  commands
    .command('get-vault-overview')
    .requiredOption('--vault <string>', 'Vault address')
    .option(`--staging`, 'If true, will use the staging programs')
    .option(`--devnet`, 'If true, will use devnet programs and RPC')
    .requiredOption(`--token-price <number>`, 'Vault token price in USD')
    .action(async ({ vault, staging, devnet, tokenPrice }) => {
      const env = await initEnv(staging, undefined, undefined, undefined, devnet);
      const slotDuration = await getMedianSlotDurationInMsFromLastEpochs();

      const kaminoManager = new KaminoManager(
        env.c.rpc,
        slotDuration,
        env.klendProgramId,
        env.kvaultProgramId,
        undefined,
        env.farmsProgramId
      );

      const vaultAddress = address(vault);
      const kaminoVault = new KaminoVault(env.c.rpc, vaultAddress, undefined, env.kvaultProgramId);
      const kaminoVaultState = await kaminoVault.getState();
      const confirmedSlot = await env.c.rpc.getSlot({ commitment: 'confirmed' }).send();
      const vaultReservesMap = await kaminoManager.loadVaultReserves(kaminoVaultState);
      const kaminoMarkets = await kaminoManager.loadKaminoMarketsForVaultReserves(vaultReservesMap);
      const farmsMap = await kaminoManager.loadVaultFarmStates([kaminoVaultState], vaultReservesMap);
      const { Farms } = await import('@kamino-finance/farms-sdk');
      const farmsClient = new Farms(env.c.rpc, env.farmsProgramId);
      const globalConfig = await kaminoManager.loadKVaultGlobalConfig();
      const vaultOverview = await kaminoManager.getVaultOverview(
        kaminoVault,
        new Decimal(tokenPrice),
        confirmedSlot,
        vaultReservesMap,
        kaminoMarkets,
        farmsMap,
        farmsClient,
        globalConfig,
        confirmedSlot
      );

      console.log('vaultOverview', vaultOverview);
      vaultOverview.reservesFarmsIncentives.reserveFarmsIncentives.forEach((incentive, reserveAddress) => {
        console.log('reserve ', reserveAddress);
        console.log('reserve incentive', incentive);
      });
      console.log('totalIncentivesAPY', vaultOverview.reservesFarmsIncentives.totalIncentivesAPY.toString());
    });

  commands
    .command('get-vault-farm-apy')
    .requiredOption('--vault <string>', 'Vault address')
    .requiredOption('--token-price <number>', 'Vault token price in USD')
    .option(`--staging`, 'If true, will use the staging programs')
    .option(`--devnet`, 'If true, will use devnet programs and RPC')
    .action(async ({ vault, tokenPrice, staging, devnet }) => {
      const env = await initEnv(staging, undefined, undefined, undefined, devnet);
      const slotDuration = await getMedianSlotDurationInMsFromLastEpochs();

      const kaminoManager = new KaminoManager(
        env.c.rpc,
        slotDuration,
        env.klendProgramId,
        env.kvaultProgramId,
        undefined,
        env.farmsProgramId
      );

      const kaminoVault = new KaminoVault(env.c.rpc, address(vault), undefined, env.kvaultProgramId, slotDuration);
      const { vaultReservesMap, farmState } = await loadVaultInstructionParams(kaminoManager, kaminoVault);
      const slot = await env.c.rpc.getSlot().send();
      const { Farms } = await import('@kamino-finance/farms-sdk');
      const farmsClient = new Farms(env.c.rpc, env.farmsProgramId);
      const farmAPY = await kaminoManager.getVaultFarmRewardsAPY(
        kaminoVault,
        new Decimal(tokenPrice),
        slot,
        vaultReservesMap,
        farmsClient,
        farmState,
        slot
      );
      console.log('farmAPY', farmAPY);
    });

  commands
    .command('get-reserve-farms-apy')
    .requiredOption('--reserve <string>', 'Reserve address')
    .requiredOption('--token-price <number>', 'Reserve token price in USD')
    .option(`--staging`, 'If true, will use the staging programs')
    .option(`--devnet`, 'If true, will use devnet programs and RPC')
    .action(async ({ reserve, tokenPrice, staging, devnet }) => {
      const env = await initEnv(staging, undefined, undefined, undefined, devnet);
      const slotDuration = await getMedianSlotDurationInMsFromLastEpochs();

      const kaminoManager = new KaminoManager(
        env.c.rpc,
        slotDuration,
        env.klendProgramId,
        env.kvaultProgramId,
        undefined,
        env.farmsProgramId
      );

      const slot = await env.c.rpc.getSlot().send();
      const reserveState = await Reserve.fetch(env.c.rpc, address(reserve), env.klendProgramId);
      if (!reserveState) {
        throw new Error(`Reserve ${reserve} not found on-chain`);
      }
      const farmAPY = await kaminoManager.getReserveFarmRewardsAPY(
        address(reserve),
        new Decimal(tokenPrice),
        slot,
        reserveState
      );
      console.log('farmAPY', farmAPY);
    });

  commands
    .command('get-vault-all-mints')
    .option(`--staging`, 'If true, will use the staging programs')
    .option(`--devnet`, 'If true, will use devnet programs and RPC')
    .option(`--vault <string>`, 'Vault address')
    .action(async ({ staging, devnet, vault }) => {
      const env = await initEnv(staging, undefined, undefined, undefined, devnet);
      const slotDuration = await getMedianSlotDurationInMsFromLastEpochs();

      const kaminoManager = new KaminoManager(
        env.c.rpc,
        slotDuration,
        env.klendProgramId,
        env.kvaultProgramId,
        undefined,
        env.farmsProgramId
      );

      const vaultAddress = address(vault);
      const kaminoVault = new KaminoVault(env.c.rpc, vaultAddress, undefined, env.kvaultProgramId, slotDuration);

      const kaminoVaultState = await kaminoVault.getState();
      const vaultReservesMap = await kaminoManager.loadVaultReserves(kaminoVaultState);
      const farmsMap = await kaminoManager.loadVaultFarmStates([kaminoVaultState], vaultReservesMap);
      const allVaultsTokenMints = await kaminoManager.getAllVaultsTokenMintsIncludingRewards(
        [kaminoVault],
        vaultReservesMap,
        farmsMap
      );
      console.log('allVaultsTokenMints', allVaultsTokenMints);
    });

  commands
    .command('get-vault-allocation-distribution')
    .requiredOption('--vault <string>', 'Vault address')
    .option(`--staging`, 'If true, will use the staging programs')
    .option(`--devnet`, 'If true, will use devnet programs and RPC')
    .action(async ({ vault, staging, devnet }) => {
      const env = await initEnv(staging, undefined, undefined, undefined, devnet);
      const slotDuration = await getMedianSlotDurationInMsFromLastEpochs();

      const kaminoManager = new KaminoManager(
        env.c.rpc,
        slotDuration,
        env.klendProgramId,
        env.kvaultProgramId,
        undefined,
        env.farmsProgramId
      );

      const vaultAddress = address(vault);
      const vaultState = await new KaminoVault(
        env.c.rpc,
        vaultAddress,
        undefined,
        env.kvaultProgramId,
        slotDuration
      ).getState();
      const allocationDistribution = kaminoManager.getAllocationsDistribuionPct(vaultState);

      allocationDistribution.forEach((allocation, reserveAddress) => {
        console.log('reserve ', reserveAddress);
        console.log('allocation', allocation);
      });
    });

  commands
    .command('print-kvault-holdings-log [encodedLog]')
    .description('Decode a kvault Program data holdings log and print it in human-readable format')
    .option('--encoded-log <string>', 'Base64 holdings payload or full "Program data: <base64>" log line')
    .action(async (encodedLogArg, { encodedLog }) => {
      const encodedLogToPrint = encodedLog ?? encodedLogArg;
      if (!encodedLogToPrint) {
        throw new Error('Encoded holdings log is required');
      }

      printKvaultHoldingsLog(encodedLogToPrint);
    });

  commands
    .command('get-user-shares-for-vault')
    .requiredOption('--vault <string>', 'Vault address')
    .requiredOption('--wallet <string>', 'User wailt address')
    .option(`--staging`, 'If true, will use the staging programs')
    .option(`--devnet`, 'If true, will use devnet programs and RPC')
    .action(async ({ vault, wallet, staging, devnet }) => {
      const env = await initEnv(staging, undefined, undefined, undefined, devnet);
      const slotDuration = await getMedianSlotDurationInMsFromLastEpochs();

      const kaminoManager = new KaminoManager(
        env.c.rpc,
        slotDuration,
        env.klendProgramId,
        env.kvaultProgramId,
        undefined,
        env.farmsProgramId
      );

      const vaultAddress = address(vault);
      const walletAddress = address(wallet);
      const kaminoVault = new KaminoVault(env.c.rpc, vaultAddress, undefined, env.kvaultProgramId, slotDuration);
      const userShares = await kaminoManager.getUserSharesBalanceSingleVault(walletAddress, kaminoVault);
      console.log(
        `User shares for vault ${vaultAddress}: unstaked shares: ${userShares.unstakedShares} staked shares: ${userShares.stakedShares} total shares: ${userShares.totalShares}`
      );
    });

  commands
    .command('get-user-shares-all-vaults')
    .requiredOption('--wallet <string>', 'User wailt address')
    .option(`--staging`, 'If true, will use the staging programs')
    .option(`--devnet`, 'If true, will use devnet programs and RPC')
    .action(async ({ wallet, staging, devnet }) => {
      const env = await initEnv(staging, undefined, undefined, undefined, devnet);
      const slotDuration = await getMedianSlotDurationInMsFromLastEpochs();

      const kaminoManager = new KaminoManager(
        env.c.rpc,
        slotDuration,
        env.klendProgramId,
        env.kvaultProgramId,
        undefined,
        env.farmsProgramId
      );

      const walletAddress = address(wallet);
      const userShares = await kaminoManager.getUserSharesBalanceAllVaults(walletAddress);

      console.log(`${userShares.size} positions for wallet ${walletAddress}`);
      userShares.forEach((userShares, vaultAddress) => {
        console.log(
          `User shares for vault ${vaultAddress}: staked shares ${userShares.stakedShares} unstaked shares ${userShares.unstakedShares} total shares ${userShares.totalShares}`
        );
      });
    });

  commands
    .command('get-tokens-per-share')
    .requiredOption('--vault <string>', 'Vault address')
    .option(`--staging`, 'If true, will use the staging programs')
    .option(`--devnet`, 'If true, will use devnet programs and RPC')
    .action(async ({ vault, staging, devnet }) => {
      const env = await initEnv(staging, undefined, undefined, undefined, devnet);
      const slotDuration = await getMedianSlotDurationInMsFromLastEpochs();

      const kaminoManager = new KaminoManager(
        env.c.rpc,
        slotDuration,
        env.klendProgramId,
        env.kvaultProgramId,
        undefined,
        env.farmsProgramId
      );

      const vaultAddress = address(vault);
      const kaminoVault = new KaminoVault(env.c.rpc, vaultAddress, undefined, env.kvaultProgramId, slotDuration);
      const confirmedSlot = await env.c.rpc.getSlot({ commitment: 'confirmed' }).send();
      const kaminoVaultState = await kaminoVault.getState();
      const vaultReservesMap = await kaminoManager.loadVaultReserves(kaminoVaultState);
      const tokensPerShare = await kaminoManager.getTokensPerShareSingleVault(
        kaminoVault,
        confirmedSlot,
        vaultReservesMap,
        confirmedSlot
      );
      console.log(`Tokens per share for vault ${vaultAddress.toString()}: ${tokensPerShare}`);
    });

  commands
    .command('print-vault')
    .requiredOption('--vault <string>', 'Vault address')
    .option(`--staging`, 'If true, will use the staging programs')
    .option(`--devnet`, 'If true, will use devnet programs and RPC')
    .action(async ({ vault, staging, devnet }) => {
      const env = await initEnv(staging, undefined, undefined, undefined, devnet);
      const slotDuration = await getMedianSlotDurationInMsFromLastEpochs();

      const kaminoManager = new KaminoManager(
        env.c.rpc,
        slotDuration,
        env.klendProgramId,
        env.kvaultProgramId,
        undefined,
        env.farmsProgramId
      );

      const vaultAddress = address(vault);
      const kaminoVault = new KaminoVault(env.c.rpc, vaultAddress, undefined, env.kvaultProgramId, slotDuration);
      const vaultState = await kaminoVault.getState();

      const slot = await env.c.rpc.getSlot({ commitment: 'confirmed' }).send();
      const vaultReservesMap = await kaminoManager.loadVaultReserves(vaultState);
      const tokensPerShare = await kaminoManager.getTokensPerShareSingleVault(
        kaminoVault,
        slot,
        vaultReservesMap,
        slot
      );
      const holdings = await kaminoManager.getVaultHoldings(kaminoVault.state!, slot, vaultReservesMap, slot);

      const sharesIssued = lamportsToDecimal(
        vaultState.sharesIssued.toString(),
        vaultState.sharesMintDecimals.toString()
      );

      const kaminoMarkets = await kaminoManager.loadKaminoMarketsForVaultReserves(vaultReservesMap);
      const farmsMap = await kaminoManager.loadVaultFarmStates([vaultState], vaultReservesMap);
      const { Farms } = await import('@kamino-finance/farms-sdk');
      const farmsClient = new Farms(env.c.rpc, env.farmsProgramId);
      const globalConfig = await kaminoManager.loadKVaultGlobalConfig();
      const vaultOverview = await kaminoManager.getVaultOverview(
        kaminoVault,
        new Decimal(1.0),
        slot,
        vaultReservesMap,
        kaminoMarkets,
        farmsMap,
        farmsClient,
        globalConfig,
        slot
      );

      console.log('farm', vaultState.vaultFarm.toString());
      console.log('vault token mint', vaultState.tokenMint);
      console.log('Name: ', kaminoManager.getDecodedVaultName(kaminoVault.state!));
      console.log('Shares issued: ', sharesIssued);
      holdings.print();
      console.log(`Tokens per share for vault ${vaultAddress}: ${tokensPerShare}`);
      printVaultReserveAllocations(kaminoManager.getVaultAllocations(vaultState), vaultReservesMap);

      for (const [reserveAddress, reserveOverview] of vaultOverview.reservesOverview) {
        console.log(`reserve ${reserveAddress} supplyAPY ${reserveOverview.supplyAPY}`);
      }
      printVaultReserveFarmIncentives(
        vaultOverview.reservesFarmsIncentives.reserveFarmsIncentives,
        vaultOverview.reservesFarmsIncentives.totalIncentivesAPY
      );
    });

  commands.command('get-cumulative-delegated-farms-rewards').action(async () => {
    const env = await initEnv();
    const kaminoManager = new KaminoManager(
      env.c.rpc,
      DEFAULT_RECENT_SLOT_DURATION_MS,
      env.klendProgramId,
      env.kvaultProgramId
    );
    const cumulativeRewards = await kaminoManager.getCumulativeDelegatedFarmsRewardsIssuedForAllVaults();
    cumulativeRewards.forEach((reward, tokenMint) => {
      console.log(`token mint ${tokenMint} rewards issued (lamports) ${reward}`);
    });
  });

  commands.command('get-vaults-with-delegated-farm').action(async () => {
    const env = await initEnv();
    const kaminoManager = new KaminoManager(
      env.c.rpc,
      DEFAULT_RECENT_SLOT_DURATION_MS,
      env.klendProgramId,
      env.kvaultProgramId
    );

    const vaultsWithDelegatedFarm = await kaminoManager.getVaultsWithDelegatedFarm();
    vaultsWithDelegatedFarm.forEach((delegatedFarm, vault) => {
      console.log(`vault ${vault} delegated farm ${delegatedFarm}`);
    });
  });

  commands.command('check-vaults-farms').action(async () => {
    const env = await initEnv();
    const kaminoManager = new KaminoManager(
      env.c.rpc,
      DEFAULT_RECENT_SLOT_DURATION_MS,
      env.klendProgramId,
      env.kvaultProgramId,
      undefined,
      env.farmsProgramId
    );

    const uiVaults = await loadUiVaultsFromCdn();
    console.log(`Checking ${uiVaults.length} UI vaults from ${CDN_ENDPOINT}/resources.json`);
    const results = await checkVaultFarms(kaminoManager, uiVaults);
    printVaultFarmCheckResults(results);
  });

  commands
    .command('check-vault-farm [vault]')
    .option('--vault <string>', 'Vault address')
    .option(`--staging`, 'If true, will use the staging programs')
    .option(`--devnet`, 'If true, will use devnet programs and RPC')
    .action(async (vaultArg, { vault, staging, devnet }) => {
      const vaultAddress = vault ?? vaultArg;
      if (!vaultAddress) {
        throw new Error('Vault address is required. Pass it as an argument or with --vault <address>');
      }

      const env = await initEnv(staging, undefined, undefined, undefined, devnet);
      const kaminoManager = new KaminoManager(
        env.c.rpc,
        DEFAULT_RECENT_SLOT_DURATION_MS,
        env.klendProgramId,
        env.kvaultProgramId,
        undefined,
        env.farmsProgramId
      );

      const results = await checkVaultFarms(kaminoManager, [{ address: address(vaultAddress) }]);
      printVaultFarmCheckResults(results);
    });

  commands
    .command('simulate-reserve-apy')
    .requiredOption('--reserve <string>', 'Reserve address')
    .action(async ({ reserve }) => {
      const env = await initEnv();

      const reserveState = await Reserve.fetch(env.c.rpc, address(reserve), env.klendProgramId);
      if (!reserveState) {
        throw new Error('Reserve not found');
      }

      const kaminoReserve = await KaminoReserve.initializeFromAddress(
        address(reserve),
        env.c.rpc,
        DEFAULT_RECENT_SLOT_DURATION_MS,
        reserveState,
        undefined,
        undefined,
        undefined,
        env.klendProgramId
      );

      const slot = await env.c.rpc.getSlot({ commitment: 'confirmed' }).send();
      const amount = new Decimal(0);
      const simulatedApr = kaminoReserve.calcSimulatedSupplyAPR(amount, 'deposit', slot, 0);
      console.log('simulated apr', simulatedApr);
      const apy = calculateAPYFromAPR(simulatedApr);
      console.log('simulated apy', apy);

      const computedAPR = kaminoReserve.calculateSupplyAPR(slot, 0);
      console.log('computed apr', computedAPR);
      const computedAPY = kaminoReserve.totalSupplyAPY(slot);
      console.log('computed apy', computedAPY);
    });

  commands
    .command('get-oracle-mappings')
    .requiredOption('--lending-market <string>', 'Lending Market Address')
    .option(`--staging`, 'If true, will use the staging programs')
    .option(`--devnet`, 'If true, will use devnet programs and RPC')
    .action(async ({ staging, devnet, lendingMarket }) => {
      const env = await initEnv(staging, undefined, undefined, undefined, devnet);
      const kaminoManager = new KaminoManager(
        env.c.rpc,
        DEFAULT_RECENT_SLOT_DURATION_MS,
        env.klendProgramId,
        env.kvaultProgramId,
        undefined,
        env.farmsProgramId
      );
      const market = await KaminoMarket.load(
        env.c.rpc,
        address(lendingMarket),
        DEFAULT_RECENT_SLOT_DURATION_MS,
        env.klendProgramId
      );
      if (!market) {
        throw Error(`Lending market ${lendingMarket} not found`);
      }

      console.log('Getting  oracle mappings');
      const oracleConfigs = await kaminoManager.getScopeOracleConfigs(market);
      for (const [oraclePrices, configs] of oracleConfigs.entries()) {
        console.log(`OraclePrices pubkey: ${oraclePrices}`, 'Configs:', JSON.parse(JSON.stringify(configs)));
      }
    });

  commands
    .command('get-all-vaults')
    .option(`--staging`, 'If true, will use the staging programs')
    .option(`--devnet`, 'If true, will use devnet programs and RPC')
    .action(async ({ staging, devnet }) => {
      const env = await initEnv(staging, undefined, undefined, undefined, devnet);
      const slotDuration = await getMedianSlotDurationInMsFromLastEpochs();

      const kaminoManager = new KaminoManager(
        env.c.rpc,
        slotDuration,
        env.klendProgramId,
        env.kvaultProgramId,
        undefined,
        env.farmsProgramId
      );
      const allVaults = await kaminoManager.getAllVaults();
      console.log('all vaults', allVaults);
    });

  commands
    .command('get-all-vaults-for-token')
    .requiredOption('--token <string>', 'Token address')
    .option(`--staging`, 'If true, will use the staging programs')
    .option(`--devnet`, 'If true, will use devnet programs and RPC')
    .action(async ({ token, staging, devnet }) => {
      const env = await initEnv(staging, undefined, undefined, undefined, devnet);
      const slotDuration = await getMedianSlotDurationInMsFromLastEpochs();

      const kaminoManager = new KaminoManager(
        env.c.rpc,
        slotDuration,
        env.klendProgramId,
        env.kvaultProgramId,
        undefined,
        env.farmsProgramId
      );
      const allVaults = await kaminoManager.getAllVaultsForToken(address(token));
      console.log('all vaults for token ', token, allVaults);
    });

  commands
    .command('get-all-vaults-pks')
    .option(`--staging`, 'If true, will use the staging programs')
    .option(`--devnet`, 'If true, will use devnet programs and RPC')
    .action(async ({ staging, devnet }) => {
      const env = await initEnv(staging, undefined, undefined, undefined, devnet);
      const kaminoManager = new KaminoManager(
        env.c.rpc,
        DEFAULT_RECENT_SLOT_DURATION_MS,
        env.klendProgramId,
        env.kvaultProgramId,
        undefined,
        env.farmsProgramId
      );

      const allVaults = await kaminoManager.getAllVaults();
      console.log(
        'all vaults',
        allVaults.map((vault) => vault.address)
      );
    });

  commands
    .command('get-simulated-interest-and-fees')
    .requiredOption('--vault <string>', 'Vault address')
    .option(`--staging`, 'If true, will use the staging programs')
    .option(`--devnet`, 'If true, will use devnet programs and RPC')
    .action(async ({ vault, staging, devnet }) => {
      const env = await initEnv(staging, undefined, undefined, undefined, devnet);

      const vaultAddress = address(vault);
      const slotDuration = await getMedianSlotDurationInMsFromLastEpochs();

      const kaminoManager = new KaminoManager(
        env.c.rpc,
        slotDuration,
        env.klendProgramId,
        env.kvaultProgramId,
        undefined,
        env.farmsProgramId
      );
      const vaultState = await new KaminoVault(
        env.c.rpc,
        vaultAddress,
        undefined,
        env.kvaultProgramId,
        slotDuration
      ).getState();

      const currentLedgerInstant = await getCurrentLedgerInstant(env.c.rpc);
      const { slot } = currentLedgerInstant;
      const vaultReservesMap = await kaminoManager.loadVaultReserves(vaultState);
      const simulatedHoldings = await kaminoManager.calculateSimulatedHoldingsWithInterest(
        vaultState,
        slot,
        vaultReservesMap,
        undefined,
        currentLedgerInstant
      );

      console.log('Simulated holdings with interest', simulatedHoldings);
      const simulatedFees = await kaminoManager.calculateSimulatedFees(
        vaultState,
        slot,
        vaultReservesMap,
        simulatedHoldings,
        currentLedgerInstant,
        undefined
      );

      console.log('Simulated fees', simulatedFees);
    });

  commands
    .command('compute-alloc')
    .requiredOption('--vault <string>', 'Vault address')
    .option(`--staging`, 'If true, will use the staging programs')
    .option(`--devnet`, 'If true, will use devnet programs and RPC')
    .action(async ({ vault, staging, devnet }) => {
      const env = await initEnv(staging, undefined, undefined, undefined, devnet);

      const vaultAddress = address(vault);
      const slotDuration = await getMedianSlotDurationInMsFromLastEpochs();

      const kaminoManager = new KaminoManager(
        env.c.rpc,
        slotDuration,
        env.klendProgramId,
        env.kvaultProgramId,
        undefined,
        env.farmsProgramId
      );
      const vaultState = await new KaminoVault(
        env.c.rpc,
        vaultAddress,
        undefined,
        env.kvaultProgramId,
        slotDuration
      ).getState();

      const slot = await env.c.rpc.getSlot().send();
      const vaultReservesMap = await kaminoManager.loadVaultReserves(vaultState);
      const computedAllocation = await kaminoManager.getVaultComputedReservesAllocation(
        vaultState,
        slot,
        vaultReservesMap,
        slot
      );
      console.log('computedAllocation', computedAllocation);
    });

  // example:  yarn kamino-manager get-market-or-vault-admin-info --address A2wsxhA7pF4B2UKVfXocb6TAAP9ipfPJam6oMKgDE5BK
  commands
    .command('check-vault-release-status')
    .requiredOption('--vault <string>', 'Vault address')
    .option(`--staging`, 'If true, will use the staging programs')
    .option(`--devnet`, 'If true, will use devnet programs and RPC')
    .action(async ({ vault, staging, devnet }) => {
      const env = await initEnv(staging, undefined, undefined, undefined, devnet);
      const slotDuration = await getMedianSlotDurationInMsFromLastEpochs();
      const kaminoManager = new KaminoManager(env.c.rpc, slotDuration, env.klendProgramId, env.kvaultProgramId);
      const kaminoVault = new KaminoVault(env.c.rpc, address(vault), undefined, env.kvaultProgramId, slotDuration);

      const result = await kaminoManager.checkVaultReleaseStatus(kaminoVault);

      if (result.errors.length > 0) {
        console.log('\nErrors:');
        for (const error of result.errors) {
          console.log(`  ❌ ${error}`);
        }
      }
      if (result.warnings.length > 0) {
        console.log('\nWarnings:');
        for (const warning of result.warnings) {
          console.log(`  ⚠️  ${warning}`);
        }
      }
      if (result.success) {
        console.log('\n✅ Vault is ready for release');
      } else {
        console.log('\n❌ Vault is NOT ready for release');
      }
    });

  commands
    .command('claim-rewards-for-vault')
    .requiredOption('--vault <string>', 'Vault address')
    .requiredOption(
      `--mode <string>`,
      'simulate|multisig|execute - simulate - to print txn simulation and to get tx simulation link in explorer, execute - execute tx, multisig - to get bs58 tx for multisig usage'
    )
    .option(`--staging`, 'If true, will use the staging programs')
    .option(`--devnet`, 'If true, will use devnet programs and RPC')
    .option(`--user <string>`, 'User address')
    .action(async ({ vault, mode, staging, devnet, user }) => {
      const env = await initEnv(staging, undefined, undefined, undefined, devnet);
      const vaultAddress = address(vault);
      const kaminoVault = new KaminoVault(env.c.rpc, vaultAddress);
      const kaminoManager = new KaminoManager(
        env.c.rpc,
        DEFAULT_RECENT_SLOT_DURATION_MS,
        env.klendProgramId,
        env.kvaultProgramId,
        undefined,
        env.farmsProgramId
      );
      const vaultState = await kaminoVault.getState();
      const vaultReservesMap = await kaminoManager.loadVaultReserves(vaultState);
      const userWallet = user ? noopSigner(address(user)) : await env.getSigner();
      const rewardsIxs = await kaminoManager.getClaimAllRewardsForVaultIxs(userWallet, kaminoVault, vaultReservesMap);

      if (rewardsIxs.length > 0) {
        await processTx(
          env.c,
          userWallet,
          [
            ...rewardsIxs,
            ...getPriorityFeeAndCuIxs({
              priorityFeeMultiplier: 2500,
              computeUnits: 400_000,
            }),
          ],
          mode,
          []
        );
      } else {
        console.log('No rewards to claim');
      }
    });

  commands
    .command('create-market')
    .requiredOption(
      `--mode <string>`,
      'simulate|multisig|execute - simulate - to print txn simulation and to get tx simulation link in explorer, execute - execute tx, multisig - to get bs58 tx for multisig usage'
    )
    .option(`--staging`, 'If true, will use the staging programs')
    .option(`--devnet`, 'If true, will use devnet programs and RPC')
    .option(`--multisig <string>`, 'If using multisig mode this is required, otherwise will be ignored')
    .action(async ({ mode, staging, devnet, multisig }) => {
      if (mode === 'multisig' && !multisig) {
        throw new Error('If using multisig mode, multisig pubkey is required');
      }
      const ms = multisig ? address(multisig) : undefined;
      const env = await initEnv(staging, ms, undefined, undefined, devnet);
      const admin = await env.getSigner();

      const kaminoManager = new KaminoManager(
        env.c.rpc,
        DEFAULT_RECENT_SLOT_DURATION_MS,
        env.klendProgramId,
        env.kvaultProgramId,
        undefined,
        env.farmsProgramId
      );

      const { market: marketKp, ixs: createMarketIxs } = await kaminoManager.createMarketIxs({
        admin,
      });

      await processTx(
        env.c,
        admin,
        [
          ...createMarketIxs,
          ...getPriorityFeeAndCuIxs({
            priorityFeeMultiplier: 2500,
          }),
        ],
        mode,
        []
      );

      mode === 'execute' && console.log('Market created:', marketKp.address);
    });

  commands
    .command('add-asset-to-market')
    .requiredOption('--market <string>', 'Market address to add asset to')
    .requiredOption('--mint <string>', 'Reserve liquidity token mint')
    .requiredOption('--reserve-config-path <string>', 'Path for the reserve config')
    .requiredOption(
      `--mode <string>`,
      'simulate|multisig|execute - simulate - to print txn simulation and to get tx simulation link in explorer, execute - execute tx, multisig - to get bs58 tx for multisig usage'
    )
    .option(
      '--global-admin <string>',
      'Global admin signer (keypair path in execute/simulate modes, pubkey in multisig mode)'
    )
    .option('--reserve-key-path <string>', 'Path to the reserve key pair file')
    .option(`--staging`, 'If true, will use the staging programs')
    .option(`--multisig <string>`, 'If using multisig mode this is required, otherwise will be ignored')
    .action(async ({ market, mint, reserveConfigPath, mode, staging, globalAdmin, multisig, reserveKeyPath }) => {
      if (mode === 'multisig' && !multisig) {
        throw new Error('If using multisig mode, multisig pubkey is required');
      }
      const ms = multisig ? address(multisig) : undefined;
      const env = await initEnv(staging, ms);
      const tokenMint = address(mint);
      const marketAddress = address(market);
      const existingMarket = await KaminoMarket.load(
        env.c.rpc,
        marketAddress,
        DEFAULT_RECENT_SLOT_DURATION_MS,
        env.klendProgramId,
        false
      );
      if (existingMarket === null) {
        throw new Error(`Market ${marketAddress} does not exist`);
      }
      const signer = await env.getSigner({ market: existingMarket });
      const mintAccount = await fetchMint(env.c.rpc, mint);
      const tokenMintProgramId = mintAccount.programAddress;
      const kaminoManager = new KaminoManager(
        env.c.rpc,
        DEFAULT_RECENT_SLOT_DURATION_MS,
        env.klendProgramId,
        env.kvaultProgramId,
        undefined,
        env.farmsProgramId
      );

      const reserveConfigFromFile = JSON.parse(fs.readFileSync(reserveConfigPath, 'utf8'));

      const reserveConfig = parseReserveConfigFromFile(reserveConfigFromFile);
      const assetConfig = new AssetReserveConfigCli(tokenMint, tokenMintProgramId, reserveConfig);

      const [adminAta] = await findAssociatedTokenPda({
        mint: tokenMint,
        owner: signer.address,
        tokenProgram: tokenMintProgramId,
      });

      let globalAdminSigner: TransactionSigner | undefined = undefined;
      if (globalAdmin) {
        globalAdminSigner =
          mode === 'multisig' ? noopSigner(address(globalAdmin)) : await parseKeypairFile(globalAdmin as string);
      }

      let reserveKeypair: TransactionSigner | undefined = undefined;
      if (reserveKeyPath) {
        reserveKeypair = await parseKeypairFile(reserveKeyPath);
      } else {
        reserveKeypair = await generateKeyPairSigner();
      }

      const { createReserveIxs, configUpdateIxs } = await kaminoManager.addAssetToMarketIxs({
        admin: signer,
        adminLiquiditySource: adminAta,
        marketAddress: marketAddress,
        assetConfig: assetConfig,
        reserveKeypair,
        globalAdminSigner,
      });

      console.log('reserve: ', reserveKeypair.address);

      await processTx(
        env.c,
        signer,
        [
          ...createReserveIxs,
          ...getPriorityFeeAndCuIxs({
            priorityFeeMultiplier: 2500,
          }),
        ],
        mode,
        []
      );

      const [lut, createLutIxs] = await createUpdateReserveConfigLutIxs(env, marketAddress, reserveKeypair.address);

      await processTx(
        env.c,
        signer,
        [
          ...createLutIxs,
          ...getPriorityFeeAndCuIxs({
            priorityFeeMultiplier: 2500,
          }),
        ],
        mode
      );

      const lutAcc = await fetchAddressLookupTable(env.c.rpc, lut);

      await sendReserveConfigUpdateIxs(env, signer, configUpdateIxs, mode, [lutAcc]);

      mode === 'execute' &&
        console.log(
          'Reserve Created with config:',
          JSON.parse(JSON.stringify(reserveConfig)),
          '\nreserve address:',
          reserveKeypair.address
        );
    });

  commands
    .command('update-reserve-config')
    .requiredOption('--reserve <string>', 'Reserve address')
    .requiredOption('--reserve-config-path <string>', 'Path for the reserve config')
    .requiredOption(
      `--mode <string>`,
      'simulate|multisig|execute - simulate - to print txn simulation and to get tx simulation link in explorer, execute - execute tx, multisig - to get bs58 tx for multisig usage'
    )
    .option(
      '--global-admin <string>',
      'Global admin signer (keypair path in execute/simulate modes, pubkey in multisig mode)'
    )
    .option(`--staging`, 'If true, will use the staging programs')
    .option(`--multisig <string>`, 'If using multisig mode this is required, otherwise will be ignored')
    .action(async ({ reserve, reserveConfigPath, mode, staging, globalAdmin, multisig }) => {
      if (mode === 'multisig' && !multisig) {
        throw new Error('If using multisig mode, multisig pubkey is required');
      }
      const ms = multisig ? address(multisig) : undefined;
      const env = await initEnv(staging, ms);
      const reserveAddress = address(reserve);
      const reserveState = await Reserve.fetch(env.c.rpc, reserveAddress, env.klendProgramId);
      if (reserveState === null) {
        throw new Error(`Reserve ${reserveAddress} not found`);
      }

      const marketAddress = reserveState.lendingMarket;
      const marketState = await KaminoMarket.load(
        env.c.rpc,
        marketAddress,
        DEFAULT_RECENT_SLOT_DURATION_MS,
        env.klendProgramId,
        false
      );
      if (marketState === null) {
        throw new Error(`Market ${marketAddress} not found`);
      }
      const signer = await env.getSigner({ market: marketState });
      const marketWithAddress: MarketWithAddress = {
        address: marketAddress,
        state: marketState.state,
      };

      const kaminoManager = new KaminoManager(
        env.c.rpc,
        DEFAULT_RECENT_SLOT_DURATION_MS,
        env.klendProgramId,
        env.kvaultProgramId,
        undefined,
        env.farmsProgramId
      );

      const reserveConfigFromFile = JSON.parse(fs.readFileSync(reserveConfigPath, 'utf8'));

      const reserveConfig = parseReserveConfigFromFile(reserveConfigFromFile);

      const updateIxs = await kaminoManager.updateReserveIxs(
        signer,
        marketWithAddress,
        reserveAddress,
        reserveConfig,
        reserveState,
        globalAdmin
      );

      if (updateIxs.length === 0) {
        console.log('No changes to reserve config');
        return;
      }

      await sendReserveConfigUpdateIxs(env, signer, updateIxs, mode);
      mode === 'execute' && console.log('Reserve Updated with config -> ', JSON.parse(JSON.stringify(reserveConfig)));
    });

  commands
    .command('download-reserve-config')
    .requiredOption('--reserve <string>', 'Reserve address')
    .option(`--staging`, 'If true, will use the staging programs')
    .action(async ({ reserve, staging }) => {
      const env = await initEnv(undefined, staging);
      const reserveAddress = address(reserve);
      const reserveState = await Reserve.fetch(env.c.rpc, reserveAddress, env.klendProgramId);
      if (!reserveState) {
        throw new Error('Reserve not found');
      }

      fs.mkdirSync('./configs/' + reserveState.lendingMarket, { recursive: true });

      const decoder = new TextDecoder('utf-8');
      const reserveName = decoder.decode(Uint8Array.from(reserveState.config.tokenInfo.name)).replace(/\0/g, '');

      const reserveConfigDisplay = parseReserveConfigToFile(reserveState.config);

      fs.writeFileSync(
        './configs/' + reserveState.lendingMarket + '/' + reserveName + '-' + reserveAddress.toString() + '.json',
        JSON.stringify(reserveConfigDisplay, null, 2)
      );
    });

  commands
    .command('download-lending-market-config')
    .requiredOption('--lending-market <string>', 'Lending Market Address')
    .option(`--staging`, 'If true, will use the staging programs')
    .action(async ({ lendingMarket, staging }) => {
      const env = await initEnv(false, staging);
      const lendingMarketAddress = address(lendingMarket);
      const lendingMarketState = await LendingMarket.fetch(env.c.rpc, lendingMarketAddress, env.klendProgramId);

      if (!lendingMarketState) {
        throw new Error('Lending Market not found');
      }

      fs.mkdirSync('./configs/' + lendingMarketAddress.toString(), { recursive: true });

      const lendingMarketConfigForFile = lendingMarketToConfigFileJSON(lendingMarketState);
      const marketName = parseZeroPaddedUtf8(lendingMarketState.name);

      fs.writeFileSync(
        './configs/' +
          lendingMarketAddress.toString() +
          '/market-' +
          marketName +
          '-' +
          lendingMarketAddress.toString() +
          '.json',
        JSON.stringify(lendingMarketConfigForFile, null, 2)
      );
    });

  commands
    .command('check-vault-release-status')
    .requiredOption('--vault <string>', 'Vault address')
    .option(`--staging`, 'If true, will use the staging programs')
    .option(`--devnet`, 'If true, will use devnet programs and RPC')
    .action(async ({ vault, staging, devnet }) => {
      const env = await initEnv(staging, undefined, undefined, undefined, devnet);
      const slotDuration = await getMedianSlotDurationInMsFromLastEpochs();
      const kaminoManager = new KaminoManager(env.c.rpc, slotDuration, env.klendProgramId, env.kvaultProgramId);
      const kaminoVault = new KaminoVault(env.c.rpc, address(vault), undefined, env.kvaultProgramId, slotDuration);

      const result = await kaminoManager.checkVaultReleaseStatus(kaminoVault);

      if (result.errors.length > 0) {
        console.log('\nErrors:');
        for (const error of result.errors) {
          console.log(`  ❌ ${error}`);
        }
      }
      if (result.warnings.length > 0) {
        console.log('\nWarnings:');
        for (const warning of result.warnings) {
          console.log(`  ⚠️  ${warning}`);
        }
      }
      if (result.success) {
        console.log('\n✅ Vault is ready for release');
      } else {
        console.log('\n❌ Vault is NOT ready for release');
      }
    });

  commands
    .command('claim-rewards-for-vault')
    .requiredOption('--vault <string>', 'Vault address')
    .requiredOption(
      `--mode <string>`,
      'simulate|multisig|execute - simulate - to print txn simulation and to get tx simulation link in explorer, execute - execute tx, multisig - to get bs58 tx for multisig usage'
    )
    .option(`--staging`, 'If true, will use the staging programs')
    .option(`--devnet`, 'If true, will use devnet programs and RPC')
    .option(`--user <string>`, 'User address')
    .action(async ({ vault, mode, staging, devnet, user }) => {
      const env = await initEnv(staging, undefined, undefined, undefined, devnet);
      const vaultAddress = address(vault);
      const kaminoVault = new KaminoVault(env.c.rpc, vaultAddress);
      const kaminoManager = new KaminoManager(
        env.c.rpc,
        DEFAULT_RECENT_SLOT_DURATION_MS,
        env.klendProgramId,
        env.kvaultProgramId,
        undefined,
        env.farmsProgramId
      );
      const userWallet = user ? noopSigner(address(user)) : await env.getSigner();
      const vaultState = await kaminoVault.getState();
      const vaultReservesMap = await kaminoManager.loadVaultReserves(vaultState);
      const rewardsIxs = await kaminoManager.getClaimAllRewardsForVaultIxs(userWallet, kaminoVault, vaultReservesMap);

      if (rewardsIxs.length > 0) {
        await processTx(
          env.c,
          userWallet,
          [
            ...rewardsIxs,
            ...getPriorityFeeAndCuIxs({
              priorityFeeMultiplier: 2500,
              computeUnits: 400_000,
            }),
          ],
          mode,
          []
        );
      } else {
        console.log('No rewards to claim');
      }
    });

  commands
    .command('create-market')
    .requiredOption(
      `--mode <string>`,
      'simulate|multisig|execute - simulate - to print txn simulation and to get tx simulation link in explorer, execute - execute tx, multisig - to get bs58 tx for multisig usage'
    )
    .option(`--staging`, 'If true, will use the staging programs')
    .option(`--devnet`, 'If true, will use devnet programs and RPC')
    .option(`--multisig <string>`, 'If using multisig mode this is required, otherwise will be ignored')
    .action(async ({ mode, staging, devnet, multisig }) => {
      if (mode === 'multisig' && !multisig) {
        throw new Error('If using multisig mode, multisig pubkey is required');
      }
      const ms = multisig ? address(multisig) : undefined;
      const env = await initEnv(staging, ms, undefined, undefined, devnet);
      const admin = await env.getSigner();

      const kaminoManager = new KaminoManager(
        env.c.rpc,
        DEFAULT_RECENT_SLOT_DURATION_MS,
        env.klendProgramId,
        env.kvaultProgramId,
        undefined,
        env.farmsProgramId
      );

      const { market: marketKp, ixs: createMarketIxs } = await kaminoManager.createMarketIxs({
        admin,
      });

      await processTx(
        env.c,
        admin,
        [
          ...createMarketIxs,
          ...getPriorityFeeAndCuIxs({
            priorityFeeMultiplier: 2500,
          }),
        ],
        mode,
        []
      );

      mode === 'execute' && console.log('Market created:', marketKp.address);
    });

  commands
    .command('add-asset-to-market')
    .requiredOption('--market <string>', 'Market address to add asset to')
    .requiredOption('--mint <string>', 'Reserve liquidity token mint')
    .requiredOption('--reserve-config-path <string>', 'Path for the reserve config')
    .requiredOption(
      `--mode <string>`,
      'simulate|multisig|execute - simulate - to print txn simulation and to get tx simulation link in explorer, execute - execute tx, multisig - to get bs58 tx for multisig usage'
    )
    .option(
      '--global-admin <string>',
      'Global admin signer (keypair path in execute/simulate modes, pubkey in multisig mode)'
    )
    .option('--reserve-key-path <string>', 'Path to the reserve key pair file')
    .option(`--staging`, 'If true, will use the staging programs')
    .option(`--multisig <string>`, 'If using multisig mode this is required, otherwise will be ignored')
    .action(async ({ market, mint, reserveConfigPath, mode, staging, globalAdmin, multisig, reserveKeyPath }) => {
      if (mode === 'multisig' && !multisig) {
        throw new Error('If using multisig mode, multisig pubkey is required');
      }
      const ms = multisig ? address(multisig) : undefined;
      const env = await initEnv(staging, ms);
      const tokenMint = address(mint);
      const marketAddress = address(market);
      const existingMarket = await KaminoMarket.load(
        env.c.rpc,
        marketAddress,
        DEFAULT_RECENT_SLOT_DURATION_MS,
        env.klendProgramId,
        false
      );
      if (existingMarket === null) {
        throw new Error(`Market ${marketAddress} does not exist`);
      }
      const signer = await env.getSigner({ market: existingMarket });
      const mintAccount = await fetchMint(env.c.rpc, mint);
      const tokenMintProgramId = mintAccount.programAddress;
      const kaminoManager = new KaminoManager(
        env.c.rpc,
        DEFAULT_RECENT_SLOT_DURATION_MS,
        env.klendProgramId,
        env.kvaultProgramId,
        undefined,
        env.farmsProgramId
      );

      const reserveConfigFromFile = JSON.parse(fs.readFileSync(reserveConfigPath, 'utf8'));

      const reserveConfig = parseReserveConfigFromFile(reserveConfigFromFile);
      const assetConfig = new AssetReserveConfigCli(tokenMint, tokenMintProgramId, reserveConfig);

      const [adminAta] = await findAssociatedTokenPda({
        mint: tokenMint,
        owner: signer.address,
        tokenProgram: tokenMintProgramId,
      });

      let globalAdminSigner: TransactionSigner | undefined = undefined;
      if (globalAdmin) {
        globalAdminSigner =
          mode === 'multisig' ? noopSigner(address(globalAdmin)) : await parseKeypairFile(globalAdmin as string);
      }

      let reserveKeypair: TransactionSigner | undefined = undefined;
      if (reserveKeyPath) {
        reserveKeypair = await parseKeypairFile(reserveKeyPath);
      } else {
        reserveKeypair = await generateKeyPairSigner();
      }

      const { createReserveIxs, configUpdateIxs } = await kaminoManager.addAssetToMarketIxs({
        admin: signer,
        adminLiquiditySource: adminAta,
        marketAddress: marketAddress,
        assetConfig: assetConfig,
        reserveKeypair,
        globalAdminSigner,
      });

      console.log('reserve: ', reserveKeypair.address);

      await processTx(
        env.c,
        signer,
        [
          ...createReserveIxs,
          ...getPriorityFeeAndCuIxs({
            priorityFeeMultiplier: 2500,
          }),
        ],
        mode,
        []
      );

      const [lut, createLutIxs] = await createUpdateReserveConfigLutIxs(env, marketAddress, reserveKeypair.address);

      await processTx(
        env.c,
        signer,
        [
          ...createLutIxs,
          ...getPriorityFeeAndCuIxs({
            priorityFeeMultiplier: 2500,
          }),
        ],
        mode
      );

      const lutAcc = await fetchAddressLookupTable(env.c.rpc, lut);

      await sendReserveConfigUpdateIxs(env, signer, configUpdateIxs, mode, [lutAcc]);

      mode === 'execute' &&
        console.log(
          'Reserve Created with config:',
          JSON.parse(JSON.stringify(reserveConfig)),
          '\nreserve address:',
          reserveKeypair.address
        );
    });

  commands
    .command('update-reserve-config')
    .requiredOption('--reserve <string>', 'Reserve address')
    .requiredOption('--reserve-config-path <string>', 'Path for the reserve config')
    .requiredOption(
      `--mode <string>`,
      'simulate|multisig|execute - simulate - to print txn simulation and to get tx simulation link in explorer, execute - execute tx, multisig - to get bs58 tx for multisig usage'
    )
    .option(
      '--global-admin <string>',
      'Global admin signer (keypair path in execute/simulate modes, pubkey in multisig mode)'
    )
    .option(`--staging`, 'If true, will use the staging programs')
    .option(`--multisig <string>`, 'If using multisig mode this is required, otherwise will be ignored')
    .action(async ({ reserve, reserveConfigPath, mode, staging, globalAdmin, multisig }) => {
      if (mode === 'multisig' && !multisig) {
        throw new Error('If using multisig mode, multisig pubkey is required');
      }
      const ms = multisig ? address(multisig) : undefined;
      const env = await initEnv(staging, ms);
      const reserveAddress = address(reserve);
      const reserveState = await Reserve.fetch(env.c.rpc, reserveAddress, env.klendProgramId);
      if (reserveState === null) {
        throw new Error(`Reserve ${reserveAddress} not found`);
      }

      const marketAddress = reserveState.lendingMarket;
      const marketState = await KaminoMarket.load(
        env.c.rpc,
        marketAddress,
        DEFAULT_RECENT_SLOT_DURATION_MS,
        env.klendProgramId,
        false
      );
      if (marketState === null) {
        throw new Error(`Market ${marketAddress} not found`);
      }
      const signer = await env.getSigner({ market: marketState });
      const marketWithAddress: MarketWithAddress = {
        address: marketAddress,
        state: marketState.state,
      };

      const kaminoManager = new KaminoManager(
        env.c.rpc,
        DEFAULT_RECENT_SLOT_DURATION_MS,
        env.klendProgramId,
        env.kvaultProgramId,
        undefined,
        env.farmsProgramId
      );

      const reserveConfigFromFile = JSON.parse(fs.readFileSync(reserveConfigPath, 'utf8'));

      const reserveConfig = parseReserveConfigFromFile(reserveConfigFromFile);

      const updateIxs = await kaminoManager.updateReserveIxs(
        signer,
        marketWithAddress,
        reserveAddress,
        reserveConfig,
        reserveState,
        globalAdmin
      );

      if (updateIxs.length === 0) {
        console.log('No changes to reserve config');
        return;
      }

      await sendReserveConfigUpdateIxs(env, signer, updateIxs, mode);
      mode === 'execute' && console.log('Reserve Updated with config -> ', JSON.parse(JSON.stringify(reserveConfig)));
    });

  commands
    .command('download-reserve-config')
    .requiredOption('--reserve <string>', 'Reserve address')
    .option(`--staging`, 'If true, will use the staging programs')
    .action(async ({ reserve, staging }) => {
      const env = await initEnv(undefined, staging);
      const reserveAddress = address(reserve);
      const reserveState = await Reserve.fetch(env.c.rpc, reserveAddress, env.klendProgramId);
      if (!reserveState) {
        throw new Error('Reserve not found');
      }

      fs.mkdirSync('./configs/' + reserveState.lendingMarket, { recursive: true });

      const decoder = new TextDecoder('utf-8');
      const reserveName = decoder.decode(Uint8Array.from(reserveState.config.tokenInfo.name)).replace(/\0/g, '');

      const reserveConfigDisplay = parseReserveConfigToFile(reserveState.config);

      fs.writeFileSync(
        './configs/' + reserveState.lendingMarket + '/' + reserveName + '-' + reserveAddress.toString() + '.json',
        JSON.stringify(reserveConfigDisplay, null, 2)
      );
    });

  commands
    .command('download-lending-market-config')
    .requiredOption('--lending-market <string>', 'Lending Market Address')
    .option(`--staging`, 'If true, will use the staging programs')
    .action(async ({ lendingMarket, staging }) => {
      const env = await initEnv(false, staging);
      const lendingMarketAddress = address(lendingMarket);
      const lendingMarketState = await LendingMarket.fetch(env.c.rpc, lendingMarketAddress, env.klendProgramId);

      if (!lendingMarketState) {
        throw new Error('Lending Market not found');
      }

      fs.mkdirSync('./configs/' + lendingMarketAddress.toString(), { recursive: true });

      const lendingMarketConfigForFile = lendingMarketToConfigFileJSON(lendingMarketState);
      const marketName = parseZeroPaddedUtf8(lendingMarketState.name);

      fs.writeFileSync(
        './configs/' +
          lendingMarketAddress.toString() +
          '/market-' +
          marketName +
          '-' +
          lendingMarketAddress.toString() +
          '.json',
        JSON.stringify(lendingMarketConfigForFile, null, 2)
      );
    });

  commands
    .command('download-lending-market-config-and-all-reserves-configs')
    .requiredOption('--lending-market <string>', 'Lending Market Address')
    .option(`--staging`, 'If true, will use the staging programs')
    .action(async ({ lendingMarket, staging }) => {
      const env = await initEnv(false, staging);
      const decoder = new TextDecoder('utf-8');
      const lendingMarketAddress = address(lendingMarket);

      const kaminoMarket = await KaminoMarket.load(
        env.c.rpc,
        lendingMarketAddress,
        DEFAULT_RECENT_SLOT_DURATION_MS,
        env.klendProgramId
      );

      if (!kaminoMarket) {
        throw new Error('Lending Market not found');
      }

      const lendingMarketState = await LendingMarket.fetch(env.c.rpc, lendingMarketAddress, env.klendProgramId);

      if (!lendingMarketState) {
        throw new Error('Lending Market not found');
      }

      fs.mkdirSync('./configs/' + lendingMarketAddress.toString(), { recursive: true });

      const lendingMarketConfigForFile = lendingMarketToConfigFileJSON(lendingMarketState);
      const marketName = parseZeroPaddedUtf8(lendingMarketState.name);

      fs.writeFileSync(
        './configs/' +
          lendingMarketAddress.toString() +
          '/market-' +
          marketName +
          '-' +
          lendingMarketAddress.toString() +
          '.json',
        JSON.stringify(lendingMarketConfigForFile, null, 2)
      );

      kaminoMarket.reserves.forEach(async (reserve) => {
        const reserveState = reserve.state;
        const reserveName = decoder.decode(Uint8Array.from(reserveState.config.tokenInfo.name)).replace(/\0/g, '');

        const reserveConfigDisplay = parseReserveConfigToFile(reserveState.config);

        fs.writeFileSync(
          './configs/' +
            lendingMarketAddress.toString() +
            '/' +
            reserveName +
            '-' +
            reserve.address.toString() +
            '.json',
          JSON.stringify(reserveConfigDisplay, null, 2)
        );
      });
    });

  commands
    .command('update-lending-market-from-config')
    .requiredOption('--lending-market <string>', 'Lending Market address')
    .requiredOption('--lending-market-config-path <string>', 'Path for the market config')
    .requiredOption(
      `--mode <string>`,
      'simulate|multisig|execute - simulate - to print txn simulation and to get tx simulation link in explorer, execute - execute tx, multisig - to get bs58 tx for multisig usage'
    )
    .option(`--staging`, 'If true, will use the staging programs')
    .option(`--devnet`, 'If true, will use devnet programs and RPC')
    .action(async ({ lendingMarket, lendingMarketConfigPath, mode, staging, devnet }) => {
      const env = await initEnv(staging, undefined, undefined, undefined, devnet);
      const lendingMarketAddress = address(lendingMarket);
      const lendingMarketAccount = await KaminoMarket.load(
        env.c.rpc,
        lendingMarketAddress,
        DEFAULT_RECENT_SLOT_DURATION_MS,
        env.klendProgramId,
        false
      );
      if (lendingMarketAccount === null) {
        throw new Error(`Lending market ${lendingMarketAddress} not found`);
      }
      const marketWithAddress = {
        address: lendingMarketAddress,
        state: lendingMarketAccount.state,
      };

      const kaminoManager = new KaminoManager(
        env.c.rpc,
        DEFAULT_RECENT_SLOT_DURATION_MS,
        env.klendProgramId,
        env.kvaultProgramId,
        undefined,
        env.farmsProgramId
      );

      const newLendingMarket = parseLendingMarketConfigFromFile(
        JSON.parse(fs.readFileSync(lendingMarketConfigPath, 'utf8')),
        lendingMarketAccount.state
      );

      const signer = await env.getSigner({ market: lendingMarketAccount });
      const ixs = kaminoManager.updateLendingMarketIxs(signer, marketWithAddress, newLendingMarket);

      // executing 6 ixs in a txn to make sure they fit
      for (let ixIndex = 0; ixIndex < ixs.length; ixIndex += 6) {
        const ixsToExecute = ixs.slice(ixIndex, ixIndex + 6);
        await processTx(
          env.c,
          signer,
          [
            ...ixsToExecute,
            ...getPriorityFeeAndCuIxs({
              priorityFeeMultiplier: 2500,
              computeUnits: 400_000,
            }),
          ],
          mode,
          []
        );
      }

      mode === 'execute' &&
        console.log('Reserve Updated with new config -> ', JSON.parse(JSON.stringify(newLendingMarket)));
    });

  commands
    .command('update-lending-market-owner')
    .requiredOption('--lending-market <string>', 'Lending Market address')
    .requiredOption(
      `--mode <string>`,
      'simulate|multisig|execute - simulate - to print txn simulation and to get tx simulation link in explorer, execute - execute tx, multisig - to get bs58 tx for multisig usage'
    )
    .option(`--staging`, 'If true, will use the staging programs')
    .option(`--devnet`, 'If true, will use devnet programs and RPC')
    .action(async ({ lendingMarket, mode, staging, devnet }) => {
      const env = await initEnv(staging, undefined, undefined, undefined, devnet);
      const lendingMarketAddress = address(lendingMarket);
      const lendingMarketState = await KaminoMarket.load(
        env.c.rpc,
        lendingMarketAddress,
        DEFAULT_RECENT_SLOT_DURATION_MS,
        env.klendProgramId,
        false
      );
      if (lendingMarketState === null) {
        throw new Error('Lending Market not found');
      }
      const marketWithAddress = {
        address: lendingMarketAddress,
        state: lendingMarketState.state,
      };

      const kaminoManager = new KaminoManager(
        env.c.rpc,
        DEFAULT_RECENT_SLOT_DURATION_MS,
        env.klendProgramId,
        env.kvaultProgramId,
        undefined,
        env.farmsProgramId
      );
      const lendingMarketOwnerCached = await env.getSigner({
        market: lendingMarketState,
        useLendingMarketOwnerCached: true,
      });

      const ix = kaminoManager.updateLendingMarketOwnerIxs(marketWithAddress, lendingMarketOwnerCached);

      await processTx(
        env.c,
        lendingMarketOwnerCached,
        [
          ix,
          ...getPriorityFeeAndCuIxs({
            priorityFeeMultiplier: 2500,
            computeUnits: 400_000,
          }),
        ],
        mode,
        []
      );

      mode === 'execute' &&
        console.log('Lending market admin updated to the new admin -> ', lendingMarketOwnerCached.address);
    });

  commands
    .command('update-lending-market-name')
    .requiredOption('--lending-market <string>', 'Lending Market address')
    .requiredOption('--new-name <string>', 'Lending Market address')
    .requiredOption(
      `--mode <string>`,
      'simulate|multisig|execute - simulate - to print txn simulation and to get tx simulation link in explorer, execute - execute tx, multisig - to get bs58 tx for multisig usage'
    )
    .option(`--staging`, 'If true, will use the staging programs')
    .option(`--devnet`, 'If true, will use devnet programs and RPC')
    .action(async ({ lendingMarket, newName, mode, staging, devnet }) => {
      const env = await initEnv(staging, undefined, undefined, undefined, devnet);
      const lendingMarketAddress = address(lendingMarket);
      const lendingMarketState = await KaminoMarket.load(
        env.c.rpc,
        lendingMarketAddress,
        DEFAULT_RECENT_SLOT_DURATION_MS,
        env.klendProgramId,
        false
      );
      if (lendingMarketState === null) {
        throw new Error('Lending Market not found');
      }
      const marketWithAddress = {
        address: lendingMarketAddress,
        state: lendingMarketState.state,
      };

      const kaminoManager = new KaminoManager(
        env.c.rpc,
        DEFAULT_RECENT_SLOT_DURATION_MS,
        env.klendProgramId,
        env.kvaultProgramId,
        undefined,
        env.farmsProgramId
      );

      const currentName = parseZeroPaddedUtf8(lendingMarketState.state.name);
      const newNameEncoded = encodeTokenName(newName);

      console.log('Current name: ', currentName, ' encoded: ', lendingMarketState.state.name);
      console.log('New name: ', newName, ' encoded: ', newNameEncoded);

      const newLendingMarket = new LendingMarket({
        ...lendingMarketState.state,
        name: newNameEncoded,
      });

      const signer = await env.getSigner({ market: lendingMarketState });
      const ixs = kaminoManager.updateLendingMarketIxs(signer, marketWithAddress, newLendingMarket);

      await processTx(
        env.c,
        signer,
        [
          ...ixs,
          ...getPriorityFeeAndCuIxs({
            priorityFeeMultiplier: 2500,
            computeUnits: 400_00,
          }),
        ],
        mode,
        []
      );

      mode === 'execute' &&
        console.log(
          'Lending market name updated to -> ',
          JSON.parse(JSON.stringify(lendingMarketState.state.lendingMarketOwnerCached))
        );
    });

  commands
    .command('update-reserve-config-debt-cap')
    .requiredOption('--reserve <string>', 'Reserve address')
    .requiredOption(
      `--mode <string>`,
      'simulate|multisig|execute - simulate - to print txn simulation and to get tx simulation link in explorer, execute - execute tx, multisig - to get bs58 tx for multisig usage'
    )
    .option(`--staging`, 'If true, will use the staging programs')
    .option(`--devnet`, 'If true, will use devnet programs and RPC')
    .action(async ({ reserve, mode, staging, devnet }) => {
      const env = await initEnv(staging, undefined, undefined, undefined, devnet);
      const reserveAddress = address(reserve);
      const reserveState = await Reserve.fetch(env.c.rpc, reserveAddress, env.klendProgramId);
      if (!reserveState) {
        throw new Error('Reserve not found');
      }

      const lendingMarketAddress = reserveState.lendingMarket;
      const lendingMarketState = await KaminoMarket.load(
        env.c.rpc,
        lendingMarketAddress,
        DEFAULT_RECENT_SLOT_DURATION_MS,
        env.klendProgramId,
        false
      );
      if (lendingMarketState === null) {
        throw new Error('Lending Market not found');
      }

      const marketWithAddress = {
        address: lendingMarketAddress,
        state: lendingMarketState.state,
      };

      const kaminoManager = new KaminoManager(
        env.c.rpc,
        DEFAULT_RECENT_SLOT_DURATION_MS,
        env.klendProgramId,
        env.kvaultProgramId,
        undefined,
        env.farmsProgramId
      );

      const newReserveConfigFields: ReserveConfigFields = {
        ...reserveState.config,
        borrowLimit: new BN(1000),
      };
      const newReserveConfig: ReserveConfig = new ReserveConfig(newReserveConfigFields);

      const admin = await env.getSigner({ market: lendingMarketState });

      const updateIxs = await kaminoManager.updateReserveIxs(
        admin,
        marketWithAddress,
        reserveAddress,
        newReserveConfig
      );

      await sendReserveConfigUpdateIxs(env, admin, updateIxs, mode);

      mode === 'execute' && console.log(`Reserve ${reserveAddress} debt cap updated`);
    });

  // example:  yarn kamino-manager get-market-or-vault-admin-info --address A2wsxhA7pF4B2UKVfXocb6TAAP9ipfPJam6oMKgDE5BK
  commands
    .command('get-market-or-vault-admin-info')
    .requiredOption('--address <string>', 'Address of the market or vault')
    .option(`--staging`, 'If true, will use the staging programs')
    .option(`--devnet`, 'If true, will use devnet programs and RPC')
    .option(`--fordefi-api-token <string>`, 'Fordefi API token; defaults to FORDEFI_API_TOKEN')
    .option(`--fordefi-api-base-url <string>`, 'Fordefi API base URL; defaults to https://api.fordefi.com/api/v1')
    .action(async ({ address: addr, staging, devnet, fordefiApiToken, fordefiApiBaseUrl }) => {
      const env = await initEnv(staging, undefined, undefined, undefined, devnet);
      const adminInfo = await KaminoManager.getMarketOrVaultAdminInfo(env.c.rpc, address(addr), (adminAuthority) =>
        getWalletType(adminAuthority, env.c.rpc, {
          apiToken: fordefiApiToken,
          apiBaseUrl: fordefiApiBaseUrl,
        })
      );
      console.log(adminInfo);
    });

  // example:  yarn kamino-manager get-wallet-type --wallet H5P3cr5wfiE6gKWtnhtCCENn3csyV35dNiYKRUwH9WGJ
  commands
    .command('get-wallet-type')
    .requiredOption('--wallet <string>', 'Wallet address')
    .option(`--staging`, 'If true, will use the staging programs')
    .option(`--devnet`, 'If true, will use devnet programs and RPC')
    .option(`--fordefi-api-token <string>`, 'Fordefi API token; defaults to FORDEFI_API_TOKEN')
    .option(`--fordefi-api-base-url <string>`, 'Fordefi API base URL; defaults to https://api.fordefi.com/api/v1')
    .action(async ({ wallet, staging, devnet, fordefiApiToken, fordefiApiBaseUrl }) => {
      const env = await initEnv(staging, undefined, undefined, undefined, devnet);
      const walletType = await getWalletType(address(wallet), env.c.rpc, {
        apiToken: fordefiApiToken,
        apiBaseUrl: fordefiApiBaseUrl,
      });
      console.log(walletType);
    });

  await commands.parseAsync();
}

main()
  .then(() => {
    process.exit();
  })
  .catch((e) => {
    console.error('\n\nKamino manager CLI exited with error:\n\n', e);
    process.exit(1);
  });

/** JSON for human-edited market configs: no deprecated/reserved/padding blobs (filled from chain in parse). */
function lendingMarketToConfigFileJSON(market: LendingMarket): Record<string, unknown> {
  const j = market.toJSON();
  const {
    reserved0: _r0,
    reserved1: _r1,
    elevationGroupPadding: _egp,
    padding1: _p1,
    elevationGroups,
    name,
    ...top
  } = j;
  return {
    ...top,
    name: parseZeroPaddedUtf8(name),
    permissionedOps: PermissionedOp.fromBN(market.permissionedOps).toString(),
    elevationGroups: elevationGroups.map(({ padding0: _p0, padding1: _gp1, ...g }) => g),
  };
}

const LENDING_MARKET_FILE_IGNORE_TOP = new Set([
  'reserved0',
  'reserved1',
  'elevationGroupPadding',
  'padding1',
  'elevationGroups',
]);

function parseLendingMarketConfigFromFile(fileObj: Record<string, unknown>, fallback: LendingMarket): LendingMarket {
  const base = fallback.toJSON();
  const merged = { ...base } as LendingMarketJSON;

  const mergedMut = merged as unknown as Record<string, unknown>;
  for (const [k, v] of Object.entries(fileObj)) {
    if (LENDING_MARKET_FILE_IGNORE_TOP.has(k)) continue;
    if (k === 'permissionedOps') continue; // handled after fromJSON, see below
    if (k === 'name' && typeof v === 'string') {
      mergedMut[k] = renderZeroPaddedUtf8(v, 32);
    } else {
      mergedMut[k] = v;
    }
  }

  if (fileObj.elevationGroups !== undefined && Array.isArray(fileObj.elevationGroups)) {
    const fileEgs = fileObj.elevationGroups as Array<Record<string, unknown>>;
    merged.elevationGroups = base.elevationGroups.map((baseEg, i) => {
      const feg = fileEgs[i];
      if (!feg || typeof feg !== 'object') return baseEg;
      const { padding0: _p0, padding1: _fp1, ...semantic } = feg;
      return { ...baseEg, ...semantic, padding0: baseEg.padding0, padding1: baseEg.padding1 };
    });
  }

  const result = LendingMarket.fromJSON(merged);
  return new LendingMarket({
    ...result,
    permissionedOps: PermissionedOp.fromUnknown(fileObj.permissionedOps).toBN(),
  });
}

function parseReserveConfigFromFile(reserveConfigFromFile: any): ReserveConfig {
  const reserveConfigFields: ReserveConfigFields = {
    status: reserveConfigFromFile.status,
    loanToValuePct: reserveConfigFromFile.loanToValuePct,
    liquidationThresholdPct: reserveConfigFromFile.liquidationThresholdPct,
    minLiquidationBonusBps: reserveConfigFromFile.minLiquidationBonusBps,
    protocolLiquidationFeePct: reserveConfigFromFile.protocolLiquidationFeePct,
    protocolOrderExecutionFeePct: reserveConfigFromFile.protocolOrderExecutionFeePct,
    protocolTakeRatePct: reserveConfigFromFile.protocolTakeRatePct,
    paddingDeprecatedAssetTier: 0,
    maxLiquidationBonusBps: reserveConfigFromFile.maxLiquidationBonusBps,
    badDebtLiquidationBonusBps: reserveConfigFromFile.badDebtLiquidationBonusBps,
    fees: {
      originationFeeSf: Fraction.fromDecimal(new Decimal(reserveConfigFromFile.fees.borrowFee)).valueSf,
      flashLoanFeeSf: Fraction.fromDecimal(new Decimal(reserveConfigFromFile.fees.flashLoanFee)).valueSf,
      padding: Array(8).fill(0),
    },
    depositLimit: new BN(reserveConfigFromFile.depositLimit),
    borrowLimit: new BN(reserveConfigFromFile.borrowLimit),
    tokenInfo: {
      name: encodeTokenName(reserveConfigFromFile.tokenInfo.name),
      heuristic: new PriceHeuristic({
        lower: new BN(reserveConfigFromFile.tokenInfo.heuristic.lower),
        upper: new BN(reserveConfigFromFile.tokenInfo.heuristic.upper),
        exp: new BN(reserveConfigFromFile.tokenInfo.heuristic.exp),
      }),
      maxTwapDivergenceBps: new BN(reserveConfigFromFile.tokenInfo.maxTwapDivergenceBps),
      maxAgePriceSeconds: new BN(reserveConfigFromFile.tokenInfo.maxAgePriceSeconds),
      maxAgeTwapSeconds: new BN(reserveConfigFromFile.tokenInfo.maxAgeTwapSeconds),
      ...parseOracleConfiguration(reserveConfigFromFile),
      blockPriceUsage: reserveConfigFromFile.tokenInfo.blockPriceUsage,
      reserved: Array(7).fill(0),
      padding: Array(19).fill(new BN(0)),
    } as TokenInfo,
    borrowRateCurve: parseBorrowRateCurve(reserveConfigFromFile),
    depositWithdrawalCap: new WithdrawalCaps({
      configCapacity: new BN(reserveConfigFromFile.depositWithdrawalCap.configCapacity),
      currentTotal: new BN(0),
      lastIntervalStartTimestamp: new BN(0),
      configIntervalLengthSeconds: new BN(reserveConfigFromFile.depositWithdrawalCap.configIntervalLengthSeconds),
    }),
    debtWithdrawalCap: new WithdrawalCaps({
      configCapacity: new BN(reserveConfigFromFile.debtWithdrawalCap.configCapacity),
      currentTotal: new BN(0),
      lastIntervalStartTimestamp: new BN(0),
      configIntervalLengthSeconds: new BN(reserveConfigFromFile.debtWithdrawalCap.configIntervalLengthSeconds),
    }),
    deleveragingMarginCallPeriodSecs: new BN(reserveConfigFromFile.deleveragingMarginCallPeriodSecs),
    borrowFactorPct: new BN(reserveConfigFromFile.borrowFactorPct),
    elevationGroups: reserveConfigFromFile.elevationGroups,
    deleveragingThresholdDecreaseBpsPerDay: new BN(reserveConfigFromFile.deleveragingThresholdDecreaseBpsPerDay),
    disableUsageAsCollOutsideEmode: reserveConfigFromFile.disableUsageAsCollOutsideEmode,
    utilizationLimitBlockBorrowingAbovePct: reserveConfigFromFile.utilizationLimitBlockBorrowingAbovePct,
    hostFixedInterestRateBps: reserveConfigFromFile.hostFixedInterestRateBps,
    autodeleverageEnabled: reserveConfigFromFile.autodeleverageEnabled,
    borrowLimitOutsideElevationGroup: new BN(reserveConfigFromFile.borrowLimitOutsideElevationGroup),
    borrowLimitAgainstThisCollateralInElevationGroup: parseReserveBorrowLimitAgainstCollInEmode(reserveConfigFromFile),
    deleveragingBonusIncreaseBpsPerDay: new BN(reserveConfigFromFile.deleveragingBonusIncreaseBpsPerDay),
    reserved1: Array(6).fill(0),
    minDeleveragingBonusBps: reserveConfigFromFile.minDeleveragingBonusBps,
    proposerAuthorityLocked: 0,
    blockCtokenUsage: 0,
    debtMaturityTimestamp: new BN(reserveConfigFromFile.debtMaturityTimestamp),
    debtTermSeconds: new BN(reserveConfigFromFile.debtTermSeconds),
    earlyRepayRemainingInterestPct: reserveConfigFromFile.earlyRepayRemainingInterestPct,
    emergencyMode: reserveConfigFromFile.emergencyMode ?? 0,
    rewardsAmountPerSlot: new BN(reserveConfigFromFile.rewardsAmountPerSlot ?? 0),
    permissionedOps: PermissionedOp.fromUnknown(reserveConfigFromFile.permissionedOps).toBN(),
  };

  return new ReserveConfig(reserveConfigFields);
}

function parseOracleConfiguration(reserveConfigFromFile: any): {
  pythConfiguration: PythConfiguration;
  switchboardConfiguration: SwitchboardConfiguration;
  scopeConfiguration: ScopeConfiguration;
} {
  const pythConfiguration = new PythConfiguration({
    price: address(reserveConfigFromFile.tokenInfo.pythConfiguration.price),
  });
  const switchboardConfiguration = new SwitchboardConfiguration({
    priceAggregator: address(reserveConfigFromFile.tokenInfo.switchboardConfiguration.priceAggregator),
    twapAggregator: address(reserveConfigFromFile.tokenInfo.switchboardConfiguration.twapAggregator),
  });
  const priceChain = [65535, 65535, 65535, 65535];
  const twapChain = [65535, 65535, 65535, 65535];

  const priceChainFromFile: number[] = reserveConfigFromFile.tokenInfo.scopeConfiguration.priceChain;
  const twapChainFromFile: number[] = reserveConfigFromFile.tokenInfo.scopeConfiguration.twapChain;

  priceChainFromFile.forEach((value, index) => (priceChain[index] = value));
  twapChainFromFile.forEach((value, index) => (twapChain[index] = value));

  const scopeConfiguration = new ScopeConfiguration({
    priceFeed: address(reserveConfigFromFile.tokenInfo.scopeConfiguration.priceFeed),
    priceChain: priceChain,
    twapChain: twapChain,
  });

  return {
    pythConfiguration,
    switchboardConfiguration,
    scopeConfiguration,
  };
}

function parseBorrowRateCurve(reserveConfigFromFile: any): BorrowRateCurve {
  const curvePoints: CurvePointFields[] = [];

  reserveConfigFromFile.borrowRateCurve.points.forEach((curvePoint: { utilizationRateBps: any; borrowRateBps: any }) =>
    curvePoints.push({
      utilizationRateBps: curvePoint.utilizationRateBps,
      borrowRateBps: curvePoint.borrowRateBps,
    })
  );

  const finalCurvePoints: CurvePointFields[] = Array(11).fill(curvePoints[curvePoints.length - 1]);

  curvePoints.forEach((curvePoint, index) => (finalCurvePoints[index] = curvePoint));

  const borrowRateCurve = new BorrowRateCurve({ points: finalCurvePoints });

  return borrowRateCurve;
}

function parseReserveBorrowLimitAgainstCollInEmode(reserveConfigFromFile: any): BN[] {
  const reserveBorrowLimitAgainstCollInEmode: BN[] = Array(32).fill(new BN(0));

  reserveConfigFromFile.borrowLimitAgainstThisCollateralInElevationGroup.forEach(
    (limit: any, index: number) => (reserveBorrowLimitAgainstCollInEmode[index] = new BN(limit))
  );

  return reserveBorrowLimitAgainstCollInEmode;
}

function parseReserveConfigToFile(reserveConfig: ReserveConfig) {
  const decoder = new TextDecoder('utf-8');

  return {
    status: reserveConfig.status,
    hostFixedInterestRateBps: reserveConfig.hostFixedInterestRateBps,
    minDeleveragingBonusBps: reserveConfig.minDeleveragingBonusBps,
    blockCtokenUsage: reserveConfig.blockCtokenUsage,
    loanToValuePct: reserveConfig.loanToValuePct,
    liquidationThresholdPct: reserveConfig.liquidationThresholdPct,
    minLiquidationBonusBps: reserveConfig.minLiquidationBonusBps,
    protocolLiquidationFeePct: reserveConfig.protocolLiquidationFeePct,
    protocolOrderExecutionFeePct: reserveConfig.protocolOrderExecutionFeePct,
    protocolTakeRatePct: reserveConfig.protocolTakeRatePct,
    maxLiquidationBonusBps: reserveConfig.maxLiquidationBonusBps,
    badDebtLiquidationBonusBps: reserveConfig.badDebtLiquidationBonusBps,
    fees: {
      borrowFee: new Fraction(reserveConfig.fees.originationFeeSf).toDecimal().toString(),
      flashLoanFee: new Fraction(reserveConfig.fees.flashLoanFeeSf).toDecimal().toString(),
    },
    depositLimit: reserveConfig.depositLimit.toString(),
    borrowLimit: reserveConfig.borrowLimit.toString(),
    tokenInfo: {
      name: decoder.decode(Uint8Array.from(reserveConfig.tokenInfo.name)).replace(/\0/g, ''),
      heuristic: {
        exp: reserveConfig.tokenInfo.heuristic.exp.toString(),
        lower: reserveConfig.tokenInfo.heuristic.lower.toString(),
        upper: reserveConfig.tokenInfo.heuristic.upper.toString(),
      },
      maxTwapDivergenceBps: reserveConfig.tokenInfo.maxTwapDivergenceBps.toString(),
      maxAgePriceSeconds: reserveConfig.tokenInfo.maxAgePriceSeconds.toString(),
      maxAgeTwapSeconds: reserveConfig.tokenInfo.maxAgeTwapSeconds.toString(),
      scopeConfiguration: reserveConfig.tokenInfo.scopeConfiguration,
      switchboardConfiguration: reserveConfig.tokenInfo.switchboardConfiguration,
      pythConfiguration: reserveConfig.tokenInfo.pythConfiguration,
      blockPriceUsage: reserveConfig.tokenInfo.blockPriceUsage,
    },
    borrowRateCurve: {
      points: trimPoints(reserveConfig.borrowRateCurve.points),
    },
    depositWithdrawalCap: reserveConfig.depositWithdrawalCap,
    debtWithdrawalCap: reserveConfig.debtWithdrawalCap,
    deleveragingMarginCallPeriodSecs: reserveConfig.deleveragingMarginCallPeriodSecs.toString(),
    borrowFactorPct: reserveConfig.borrowFactorPct.toString(),
    elevationGroups: reserveConfig.elevationGroups,
    deleveragingThresholdDecreaseBpsPerDay: reserveConfig.deleveragingThresholdDecreaseBpsPerDay.toString(),
    disableUsageAsCollOutsideEmode: reserveConfig.disableUsageAsCollOutsideEmode,
    utilizationLimitBlockBorrowingAbovePct: reserveConfig.utilizationLimitBlockBorrowingAbovePct,
    autodeleverageEnabled: reserveConfig.autodeleverageEnabled,
    proposerAuthorityLocked: reserveConfig.proposerAuthorityLocked,
    borrowLimitOutsideElevationGroup: reserveConfig.borrowLimitOutsideElevationGroup.toString(),
    borrowLimitAgainstThisCollateralInElevationGroup:
      reserveConfig.borrowLimitAgainstThisCollateralInElevationGroup.map((entry) => entry.toString()),
    deleveragingBonusIncreaseBpsPerDay: reserveConfig.deleveragingBonusIncreaseBpsPerDay.toString(),
    debtMaturityTimestamp: reserveConfig.debtMaturityTimestamp.toString(),
    debtTermSeconds: reserveConfig.debtTermSeconds.toString(),
    earlyRepayRemainingInterestPct: reserveConfig.earlyRepayRemainingInterestPct,
    permissionedOps: PermissionedOp.fromBN(reserveConfig.permissionedOps).toString(),
    reserved1: reserveConfig.reserved1,
  };
}

/**
 * Sends reserve config updates in chunks: a whole config's worth of them exceeds what a single transaction can
 * carry, so they are split rather than sent as one batch.
 */
async function sendReserveConfigUpdateIxs(
  env: ManagerEnv,
  signer: TransactionSigner,
  updateIxs: ReserveConfigUpdateIx[],
  mode: SendTxMode,
  luts: Account<AddressLookupTable>[] = []
): Promise<void> {
  // Each update scans the whole transaction for a durable-nonce instruction, so batching them costs more per
  // update the bigger the batch: six comfortably fit in the 400k requested below, eight measured 399k.
  const CHUNK_SIZE = 6;
  for (let i = 0; i < updateIxs.length; i += CHUNK_SIZE) {
    const chunk = updateIxs.slice(i, i + CHUNK_SIZE);
    await processTx(
      env.c,
      signer,
      [
        ...chunk.map((ix) => ix.ix),
        ...getPriorityFeeAndCuIxs({
          priorityFeeMultiplier: 2500,
          computeUnits: 400_000,
        }),
      ],
      mode,
      luts
    );
  }
}

async function createUpdateReserveConfigLutIxs(
  env: ManagerEnv,
  lendingMarketAddress: Address,
  reserveAddress: Address
): Promise<[Address, Instruction[]]> {
  const globalConfigAddress = await globalConfigPda(env.klendProgramId);
  const contents = [globalConfigAddress, lendingMarketAddress, reserveAddress];
  const signer = await env.getSigner();
  const [createIx, lut] = await createLookupTableIx(env.c.rpc, signer);
  const extendIxs = extendLookupTableIxs(signer, lut, contents);
  return [lut, [createIx, ...extendIxs]];
}
