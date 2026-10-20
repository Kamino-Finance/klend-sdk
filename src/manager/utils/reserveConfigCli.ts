import { Address } from '@solana/kit';
import { SYSTEM_PROGRAM_ADDRESS } from '@solana-program/system';
import { Buffer } from 'buffer';
import { Reserve } from '../../@codegen/klend/accounts';
import { UpdateConfigMode, UpdateConfigModeKind } from '../../@codegen/klend/types';
import { normalizeScopeChain } from '../../classes/reserve';
import { type ReserveAuthorityType } from '../../classes/manager';
import { DEFAULT_PUBLIC_KEY } from '../../utils';

export {
  assertInitializedReserveMatchesTarget,
  type InitializedReserveIdentity,
  type ReserveAuthorityType,
} from '../../classes/manager';
export type ReserveCommandTxMode = 'execute' | 'simulate' | 'multisig';

export function validateReserveAccountCreationOptions({
  reserveKeyPath,
  reserveSeed,
  executeReserveAccountCreation,
}: {
  reserveKeyPath?: string;
  reserveSeed?: string;
  executeReserveAccountCreation?: boolean;
}): boolean {
  const hasReserveSeed = reserveSeed !== undefined;
  if (reserveKeyPath && hasReserveSeed) {
    throw new Error('--reserve-key-path and --reserve-seed cannot be used together');
  }
  if (hasReserveSeed && reserveSeed.length === 0) {
    throw new Error('--reserve-seed must not be empty');
  }
  if (hasReserveSeed && new TextEncoder().encode(reserveSeed).length > 32) {
    throw new Error('--reserve-seed must be at most 32 UTF-8 bytes');
  }
  if (hasReserveSeed && executeReserveAccountCreation) {
    throw new Error('--execute-reserve-account-creation is not used with --reserve-seed');
  }
  return hasReserveSeed;
}

export type ReserveConfigCopyStrategy =
  | { kind: 'clone' }
  | {
      kind: 'template';
      scopePriceFeed: Address;
      scopePriceChain: readonly number[];
      scopeTwapChain?: readonly number[];
      targetTokenName: string;
    };

export function selectReserveConfigCopyStrategy({
  sourceMint,
  targetMint,
  mode,
  allowMintMismatch = false,
  scopePriceFeed,
  scopePriceChain,
  scopeTwapChain,
  targetTokenName,
}: {
  sourceMint: Address;
  targetMint: Address;
  mode: ReserveCommandTxMode;
  allowMintMismatch?: boolean;
  scopePriceFeed?: Address;
  scopePriceChain?: readonly number[];
  scopeTwapChain?: readonly number[];
  targetTokenName?: string;
}): ReserveConfigCopyStrategy {
  if (sourceMint === targetMint) {
    return { kind: 'clone' };
  }
  if (!allowMintMismatch) {
    throw new Error('Different mints require --allow-mint-mismatch');
  }
  if (!scopePriceFeed || scopePriceFeed === DEFAULT_PUBLIC_KEY) {
    throw new Error('Cross-mint config copy requires --scope-price-feed');
  }
  if (!scopePriceChain) {
    throw new Error('Cross-mint config copy requires --scope-price-chain');
  }
  const normalizedTargetTokenName = targetTokenName?.trim();
  if (!normalizedTargetTokenName) {
    throw new Error('Cross-mint config copy requires --token-name');
  }
  if (new TextEncoder().encode(normalizedTargetTokenName).length > 32) {
    throw new Error('--token-name must be at most 32 UTF-8 bytes');
  }
  if (mode === 'simulate') {
    throw new Error('Cross-mint config copy does not support simulate mode because initialization does not persist');
  }

  return scopeTwapChain
    ? { kind: 'template', scopePriceFeed, scopePriceChain, scopeTwapChain, targetTokenName: normalizedTargetTokenName }
    : { kind: 'template', scopePriceFeed, scopePriceChain, targetTokenName: normalizedTargetTokenName };
}

export type MarketReserveConfigFile = {
  reserveAddress: Address;
  configFile: string;
};

export type MarketReserveConfigSelectionOptions = {
  allowPartial?: boolean;
  marketAddress?: Address;
};

type InstructionWithProgramAddress = {
  programAddress: Address;
};

export type ReserveAccountCreationIxs<T extends InstructionWithProgramAddress> = {
  createReserveAccountIx: T;
  initReserveIx: T;
};

export type ReserveAccountSetupIxs<T extends InstructionWithProgramAddress> = {
  createReserveAccountIx?: T;
  initReserveIx: T;
};

export type ReserveAccountCreationAction = 'create' | 'resume' | 'initialized';

export type ReserveAccountInfo = {
  owner: Address;
  data: Uint8Array;
};

export async function resolveReserveLiquidityTokenProgram(
  strategy: ReserveConfigCopyStrategy,
  sourceTokenProgram: Address,
  fetchTargetTokenProgram: () => Promise<Address>
): Promise<Address> {
  if (strategy.kind === 'clone') {
    return sourceTokenProgram;
  }

  return fetchTargetTokenProgram();
}

export function assertReserveMintsMatch(sourceMint: Address, targetMint: Address): void {
  if (sourceMint !== targetMint) {
    throw new Error('Source and target reserves must use the same liquidity mint');
  }
}

/** Keeps account creation before reserve initialization for the multisig flow. */
export function splitReserveAccountCreationIxs<T extends InstructionWithProgramAddress>(
  instructions: readonly T[],
  reserveProgramId: Address
): ReserveAccountCreationIxs<T> | undefined {
  if (instructions.length === 0) {
    return undefined;
  }
  if (instructions.length !== 2) {
    throw new Error('Reserve account creation must contain exactly two instructions');
  }

  const [createReserveAccountIx, initReserveIx] = instructions;
  if (createReserveAccountIx.programAddress !== SYSTEM_PROGRAM_ADDRESS) {
    throw new Error('Reserve account creation must contain the system create-account instruction first');
  }
  if (initReserveIx.programAddress !== reserveProgramId) {
    throw new Error('Reserve account creation must contain the init-reserve instruction second');
  }

  return { createReserveAccountIx, initReserveIx };
}

export function splitReserveAccountSetupIxs<T extends InstructionWithProgramAddress>(
  instructions: readonly T[],
  reserveProgramId: Address
): ReserveAccountSetupIxs<T> | undefined {
  if (instructions.length === 0) {
    return undefined;
  }
  if (instructions.length === 1) {
    const [initReserveIx] = instructions;
    if (initReserveIx.programAddress !== reserveProgramId) {
      throw new Error('Reserve account resume must contain the init-reserve instruction');
    }
    return { initReserveIx };
  }

  return splitReserveAccountCreationIxs(instructions, reserveProgramId);
}

export function planAddAssetMultisigReserveSetupIxs<T extends InstructionWithProgramAddress>(
  instructions: readonly T[],
  reserveProgramId: Address,
  keepAccountCreationInMultisig: boolean
): { immediateIxs: T[]; multisigIxs: T[] } {
  const setupIxs = splitReserveAccountSetupIxs(instructions, reserveProgramId);
  if (!setupIxs) {
    return { immediateIxs: [], multisigIxs: [] };
  }

  const createReserveAccountIx = setupIxs.createReserveAccountIx;
  if (keepAccountCreationInMultisig) {
    return {
      immediateIxs: [],
      multisigIxs: [...(createReserveAccountIx ? [createReserveAccountIx] : []), setupIxs.initReserveIx],
    };
  }

  return {
    immediateIxs: createReserveAccountIx ? [createReserveAccountIx] : [],
    multisigIxs: [setupIxs.initReserveIx],
  };
}

export function planReserveAccountSetupIxs<T extends InstructionWithProgramAddress>(
  action: ReserveAccountCreationAction,
  createReserveAccountIx: T,
  initReserveIx: T,
  createReserveAccountInMainTransaction: boolean
): T[] {
  if (action === 'initialized') {
    return [];
  }

  return [
    ...(action === 'create' && createReserveAccountInMainTransaction ? [createReserveAccountIx] : []),
    initReserveIx,
  ];
}

export function planInitReserveAndCloneConfigIxs<T extends InstructionWithProgramAddress>(
  mode: ReserveCommandTxMode,
  createReserveAccountIx: T,
  initReserveIx: T,
  cloneReserveConfigIx: T,
  reserveProgramId: Address,
  options: {
    includeCreateReserveAccount?: boolean;
    includeInitReserve?: boolean;
    createReserveAccountInMainTransaction?: boolean;
    postCloneIxs?: readonly T[];
  } = {}
): { immediateIxs: T[]; mainTransactionIxs: T[] } {
  const creationIxs = splitReserveAccountCreationIxs([createReserveAccountIx, initReserveIx], reserveProgramId);
  if (!creationIxs) {
    throw new Error('Reserve account creation instructions are missing');
  }

  const includeCreateReserveAccount = options.includeCreateReserveAccount ?? true;
  const includeInitReserve = options.includeInitReserve ?? true;
  const createReserveAccountInMainTransaction = options.createReserveAccountInMainTransaction ?? false;
  const postCloneIxs = options.postCloneIxs ?? [];
  if (mode === 'multisig') {
    return {
      immediateIxs:
        includeCreateReserveAccount && !createReserveAccountInMainTransaction
          ? [creationIxs.createReserveAccountIx]
          : [],
      mainTransactionIxs: [
        ...(includeCreateReserveAccount && createReserveAccountInMainTransaction
          ? [creationIxs.createReserveAccountIx]
          : []),
        ...(includeInitReserve ? [creationIxs.initReserveIx] : []),
        cloneReserveConfigIx,
        ...postCloneIxs,
      ],
    };
  }

  return {
    immediateIxs: [],
    mainTransactionIxs: [
      ...(includeCreateReserveAccount ? [creationIxs.createReserveAccountIx] : []),
      ...(includeInitReserve ? [creationIxs.initReserveIx] : []),
      cloneReserveConfigIx,
      ...postCloneIxs,
    ],
  };
}

export function parseScopePriceChain(value: string): number[] {
  return parseScopeChain(value, '--scope-price-chain');
}

export function parseScopeTwapChain(value: string): number[] {
  return parseScopeChain(value, '--scope-twap-chain');
}

function parseScopeChain(value: string, optionName: string): number[] {
  const entries = value.split(',').map((entry) => entry.trim());
  if (entries.length < 1 || entries.length > 4 || entries.some((entry) => entry.length === 0)) {
    throw new Error(`${optionName} must contain one to four comma-separated integer u16 values`);
  }

  const parsedEntries = entries.map((entry) => {
    if (!/^\d+$/.test(entry)) {
      throw new Error(`${optionName} values must be integer u16 values`);
    }
    const parsed = Number(entry);
    if (!Number.isSafeInteger(parsed) || parsed > 0xffff) {
      throw new Error(`${optionName} values must be integer u16 values`);
    }
    return parsed;
  });

  return normalizeScopeChain(parsedEntries);
}

/** Determines whether an interrupted multisig setup can safely resume. */
export function getReserveAccountCreationAction(
  account: ReserveAccountInfo | null,
  reserveProgramId: Address,
  expectedAccountSize: number
): ReserveAccountCreationAction {
  if (!account) {
    return 'create';
  }
  if (account.owner !== reserveProgramId) {
    throw new Error('Existing reserve account is not owned by the klend program');
  }
  if (account.data.length !== expectedAccountSize) {
    throw new Error(`Existing reserve account has size ${account.data.length}; expected size ${expectedAccountSize}`);
  }
  if (account.data.every((byte) => byte === 0)) {
    return 'resume';
  }

  try {
    Reserve.decode(Buffer.from(account.data));
    return 'initialized';
  } catch {
    throw new Error('Existing reserve account is already initialized or has non-zero data but is not valid');
  }
}

export function parseReserveCommandTxMode(value: string): ReserveCommandTxMode {
  if (value === 'execute' || value === 'simulate' || value === 'multisig') {
    return value;
  }
  throw new Error(`Invalid reserve transaction mode: ${value}`);
}

export function resolveReserveAuthorityType(
  requestedType: string | undefined,
  proposerAuthority: Address
): ReserveAuthorityType {
  if (
    requestedType !== undefined &&
    requestedType !== 'lending-market-owner' &&
    requestedType !== 'proposer-authority'
  ) {
    throw new Error(`Unknown reserve authority type: ${requestedType}`);
  }

  const proposerAuthorityIsSet = proposerAuthority !== DEFAULT_PUBLIC_KEY;
  if (requestedType === 'proposer-authority' && !proposerAuthorityIsSet) {
    throw new Error('The proposer authority cannot be selected because it is not set on the lending market');
  }

  if (requestedType !== undefined) {
    return requestedType;
  }

  return proposerAuthorityIsSet ? 'proposer-authority' : 'lending-market-owner';
}

/** Selects clone authority while respecting the target reserve's proposer lock. */
export function resolveCloneReserveAuthorityType(
  requestedType: string | undefined,
  proposerAuthority: Address,
  proposerAuthorityLocked: number
): ReserveAuthorityType {
  const proposerAuthorityIsLocked = proposerAuthorityLocked !== 0;
  if (requestedType === 'proposer-authority' && proposerAuthorityIsLocked) {
    throw new Error('The proposer authority cannot be selected because the target reserve is locked');
  }
  if (requestedType === undefined && proposerAuthorityIsLocked) {
    return 'lending-market-owner';
  }

  return resolveReserveAuthorityType(requestedType, proposerAuthority);
}

export function parseReserveConfigForceFields(
  value: string | undefined,
  supportsMode: (mode: UpdateConfigModeKind) => boolean
): UpdateConfigModeKind[] {
  if (value === undefined) {
    return [];
  }

  const names = value.split(',').map((name) => name.trim());
  if (names.some((name) => name.length === 0)) {
    throw new Error('Empty reserve config force field is not allowed');
  }

  const modesByKind = new Map<string, UpdateConfigModeKind>();
  for (const name of names) {
    let mode: UpdateConfigModeKind;
    try {
      mode = UpdateConfigMode.fromDecoded({ [name]: {} });
    } catch {
      throw new Error(`Unknown reserve config update mode: ${name}`);
    }

    if (!supportsMode(mode)) {
      throw new Error(`Reserve config update mode ${name} is not supported by the field-by-field updater`);
    }
    modesByKind.set(mode.kind, mode);
  }

  return [...modesByKind.values()];
}

export function findReserveConfigFile(files: readonly string[], reserveAddress: Address): string | undefined {
  const expectedSuffix = `-${reserveAddress}.json`;
  const matchingFiles = files.filter((file) => file.endsWith(expectedSuffix));
  if (matchingFiles.length > 1) {
    throw new Error(`Multiple reserve config files match ${reserveAddress}: ${matchingFiles.join(', ')}`);
  }
  return matchingFiles[0];
}

export function selectMarketReserveConfigFiles(
  files: readonly string[],
  reserveAddresses: readonly Address[],
  options: MarketReserveConfigSelectionOptions = {}
): MarketReserveConfigFile[] {
  const selectedFiles: MarketReserveConfigFile[] = [];
  const matchedFileNames = new Set<string>();
  const missingReserveAddresses: Address[] = [];

  for (const reserveAddress of reserveAddresses) {
    const configFile = findReserveConfigFile(files, reserveAddress);
    if (!configFile) {
      missingReserveAddresses.push(reserveAddress);
      continue;
    }
    selectedFiles.push({ reserveAddress, configFile });
    matchedFileNames.add(configFile);
  }

  const marketConfigSuffix = options.marketAddress ? `-${options.marketAddress}.json` : undefined;
  const unmatchedConfigFiles = files.filter((file) => {
    if (!file.endsWith('.json') || matchedFileNames.has(file)) {
      return false;
    }
    return !(marketConfigSuffix && file.startsWith('market-') && file.endsWith(marketConfigSuffix));
  });
  if (unmatchedConfigFiles.length > 0) {
    throw new Error(`Unmatched reserve config files: ${unmatchedConfigFiles.join(', ')}`);
  }

  if (!options.allowPartial && missingReserveAddresses.length > 0) {
    throw new Error(`Missing reserve config files for: ${missingReserveAddresses.join(', ')}`);
  }

  return selectedFiles;
}
