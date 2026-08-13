import {
  Address,
  Base58EncodedBytes,
  fetchEncodedAccount,
  getAddressDecoder,
  getAddressEncoder,
  getBase58Decoder,
  getProgramDerivedAddress,
  GetAccountInfoApi,
  GetProgramAccountsApi,
  Rpc,
  address,
} from '@solana/kit';
import { Buffer } from 'buffer';
import { raceSettledValues } from './promise';

const SQUADS_API_BASE_URL = 'https://4fnetmviidiqkjzenwxe66vgoa0soerr.lambda-url.us-east-1.on.aws';
const FORDEFI_API_BASE_URL = 'https://api.fordefi.com/api/v1';
const FORDEFI_VAULT_PAGE_SIZE = 100;
export const DEFAULT_REALMS_GOVERNANCE_PROGRAM_IDS = [
  address('GovER5Lthms3bLBqWub97yVrMmEogzX7xNjdXpPPCVZw'),
  address('GTesTBiEWE32WHXXE2S4XbZvA5CrEc4xs6ZgRe895dP'),
];

const NATIVE_TREASURY_SEED = 'native-treasury';
const REALM_V1_ACCOUNT_TYPE = 1;
const TOKEN_OWNER_RECORD_V1_ACCOUNT_TYPE = 2;
const GOVERNANCE_V1_ACCOUNT_TYPES = [3, 4, 9, 10];
const REALM_V2_ACCOUNT_TYPE = 16;
const TOKEN_OWNER_RECORD_V2_ACCOUNT_TYPE = 17;
const GOVERNANCE_V2_ACCOUNT_TYPES = [18, 19, 20, 21];
const REALMS_GOVERNANCE_ACCOUNT_TYPES = [...GOVERNANCE_V1_ACCOUNT_TYPES, ...GOVERNANCE_V2_ACCOUNT_TYPES];
const REALMS_TOKEN_OWNER_RECORD_ACCOUNT_TYPES = [
  TOKEN_OWNER_RECORD_V1_ACCOUNT_TYPE,
  TOKEN_OWNER_RECORD_V2_ACCOUNT_TYPE,
];
const addressDecoder = getAddressDecoder();
const addressEncoder = getAddressEncoder();
const base58Decoder = getBase58Decoder();

type RealmsRpc = Rpc<GetAccountInfoApi & GetProgramAccountsApi>;

export async function getWalletType(
  wallet: Address,
  rpc?: RealmsRpc,
  fordefiApiConfig?: FordefiApiConfig
): Promise<WalletType> {
  const walletType = await raceSettledValues([
    getSquadsWalletType(wallet),
    rpc ? getRealmsWalletType(rpc, wallet) : Promise.resolve(undefined),
    getFordefiWalletType(wallet, fordefiApiConfig),
  ]);

  return walletType ?? { walletType: 'simpleWallet' };
}

export async function isSupportedAdminWallet(rpc: RealmsRpc, authority: Address): Promise<boolean> {
  const isSupported = await raceSettledValues([
    walletIsSquadsMultisig(authority).then((isSquadsMultisig) => (isSquadsMultisig ? true : undefined)),
    walletIsRealmsMultisig(rpc, authority).then((isRealmsMultisig) => (isRealmsMultisig ? true : undefined)),
    walletIsFordefiWallet(authority).then((isFordefiWallet) => (isFordefiWallet ? true : undefined)),
  ]);

  return isSupported ?? false;
}

async function getSquadsWalletType(wallet: Address): Promise<WalletType | undefined> {
  if (!(await walletIsSquadsMultisig(wallet))) {
    return undefined;
  }

  const { adminsNumber, threshold } = await getSquadsMultisigAdminsAndThreshold(wallet);
  return {
    walletType: 'squadsMultisig',
    walletAdminsNumber: adminsNumber,
    walletThreshold: threshold,
  };
}

async function getRealmsWalletType(rpc: RealmsRpc, wallet: Address): Promise<WalletType | undefined> {
  const info = await getRealmsMultisigInfo(rpc, wallet);
  if (!info) {
    return undefined;
  }

  return {
    walletType: 'realmsMultisig',
    walletAdminsNumber: info.adminsNumber,
    walletThreshold: info.threshold,
  };
}

async function getFordefiWalletType(
  wallet: Address,
  fordefiApiConfig?: FordefiApiConfig
): Promise<WalletType | undefined> {
  const info = await getFordefiWalletInfo(wallet, fordefiApiConfig);
  if (!info) {
    return undefined;
  }

  return {
    walletType: 'fordefiWallet',
    walletName: info.vaultName,
    walletId: info.vaultId,
  };
}

export async function walletIsSquadsMultisig(wallet: Address) {
  const response = await fetch(`${SQUADS_API_BASE_URL}/isSquad/${wallet}`);
  const data = await response.json();
  const squadsResponse = data as SquadsMultisigResponse;
  return squadsResponse.isSquad;
}

export async function getSquadsMultisigAdminsAndThreshold(wallet: Address): Promise<{
  adminsNumber: number;
  threshold: number;
}> {
  const response = await fetch(`${SQUADS_API_BASE_URL}/multisig/${wallet}`);
  const data = await response.json();
  try {
    const squadsResponse = data as SquadsV4MultisigAccountResponse;
    return {
      adminsNumber: squadsResponse.account.members.length,
      threshold: squadsResponse.account.threshold,
    };
  } catch (e) {
    const squadsResponse = data as SquadsV3MultisigAccountResponse;
    return {
      adminsNumber: squadsResponse.keys.length,
      threshold: squadsResponse.threshold,
    };
  }
}

export async function walletIsFordefiWallet(wallet: Address, config?: FordefiApiConfig) {
  return (await getFordefiWalletInfo(wallet, config)) !== undefined;
}

export async function getFordefiWalletInfo(
  wallet: Address,
  config?: FordefiApiConfig
): Promise<FordefiWalletInfo | undefined> {
  const apiToken = config?.apiToken ?? process.env.FORDEFI_API_TOKEN;
  if (!apiToken) {
    return undefined;
  }

  const apiBaseUrl = trimTrailingSlash(config?.apiBaseUrl ?? process.env.FORDEFI_API_BASE_URL ?? FORDEFI_API_BASE_URL);
  const maxPages = config?.maxPages ?? 100;
  const walletAddress = wallet.toString();

  for (let page = 1; page <= maxPages; page++) {
    const url = new URL(`${apiBaseUrl}/vaults`);
    url.searchParams.set('page', page.toString());
    url.searchParams.set('size', FORDEFI_VAULT_PAGE_SIZE.toString());
    url.searchParams.append('vault_types', 'solana');

    const response = await fetch(url.toString(), {
      headers: {
        accept: 'application/json',
        authorization: `Bearer ${apiToken}`,
      },
    });

    if (!response.ok) {
      throw new Error(`Failed to query Fordefi vaults: ${response.status} ${await response.text()}`);
    }

    const data = (await response.json()) as FordefiListVaultsResponse;
    const vaults = Array.isArray(data.vaults) ? data.vaults : [];
    const matchingVault = vaults.find(
      (vault) => vault.type === 'solana' && typeof vault.address === 'string' && vault.address === walletAddress
    );

    if (matchingVault) {
      return toFordefiWalletInfo(wallet, matchingVault);
    }

    const total = typeof data.total === 'number' ? data.total : vaults.length;
    const pageSize = typeof data.size === 'number' && data.size > 0 ? data.size : FORDEFI_VAULT_PAGE_SIZE;
    if (vaults.length === 0 || page * pageSize >= total) {
      break;
    }
  }

  return undefined;
}

function toFordefiWalletInfo(wallet: Address, vault: FordefiVault): FordefiWalletInfo {
  return {
    wallet,
    vaultId: vault.id,
    vaultName: vault.name,
  };
}

function trimTrailingSlash(value: string) {
  return value.endsWith('/') ? value.slice(0, -1) : value;
}

export async function walletIsRealmsMultisig(rpc: RealmsRpc, wallet: Address) {
  return (await getRealmsMultisigInfo(rpc, wallet)) !== undefined;
}

export async function getRealmsMultisigAdminsAndThreshold(
  rpc: RealmsRpc,
  wallet: Address
): Promise<{
  adminsNumber: number;
  threshold: number;
}> {
  const realmsMultisigInfo = await getRealmsMultisigInfo(rpc, wallet);
  if (!realmsMultisigInfo) {
    throw new Error(`${wallet} is not a Realms multisig`);
  }

  return {
    adminsNumber: realmsMultisigInfo.adminsNumber,
    threshold: realmsMultisigInfo.threshold,
  };
}

export async function getRealmsMultisigInfo(
  rpc: RealmsRpc,
  wallet: Address,
  programIds: Address[] = DEFAULT_REALMS_GOVERNANCE_PROGRAM_IDS
): Promise<RealmsMultisigInfo | undefined> {
  const walletAccount = await fetchEncodedAccount(rpc, wallet);
  const programIdsToCheck =
    walletAccount.exists && programIds.some((programId) => programId === walletAccount.programAddress)
      ? [walletAccount.programAddress]
      : programIds;

  const results = await Promise.allSettled(
    programIdsToCheck.map(async (programId) => {
      const realmInfo = await getRealmsInfoForRealmAddress(rpc, wallet, programId);
      if (realmInfo) {
        return realmInfo;
      }

      const governanceInfo = await getRealmsGovernanceForWallet(rpc, wallet, programId);
      if (!governanceInfo) {
        return undefined;
      }

      return getRealmsInfoForGovernance(rpc, wallet, programId, governanceInfo);
    })
  );

  let fulfilledResult = false;
  let firstRejectedReason: unknown = undefined;
  for (const result of results) {
    if (result.status === 'fulfilled') {
      fulfilledResult = true;
      if (result.value) {
        return result.value;
      }
    } else {
      firstRejectedReason = firstRejectedReason ?? result.reason;
    }
  }

  if (!fulfilledResult && firstRejectedReason) {
    throw firstRejectedReason;
  }

  return undefined;
}

async function getRealmsInfoForRealmAddress(
  rpc: RealmsRpc,
  realmAddress: Address,
  programId: Address
): Promise<RealmsMultisigInfo | undefined> {
  const realmAccount = await fetchEncodedAccount(rpc, realmAddress);
  if (!realmAccount.exists || realmAccount.programAddress !== programId) {
    return undefined;
  }

  let realm: RealmsRealm;
  try {
    realm = decodeRealmsRealmAccount(Buffer.from(realmAccount.data));
  } catch (e) {
    return undefined;
  }

  const governanceAccounts = await getAllRealmsGovernanceAccounts(
    rpc,
    programId,
    realmAddress,
    getRealmsGovernanceAccountTypes(realm)
  );
  return getRealmsInfoForRealm(rpc, realmAddress, programId, realmAddress, realm, governanceAccounts);
}

async function getRealmsInfoForGovernance(
  rpc: RealmsRpc,
  wallet: Address,
  programId: Address,
  governanceInfo: RealmsGovernanceLookup
): Promise<RealmsMultisigInfo | undefined> {
  const realmAccount = await fetchEncodedAccount(rpc, governanceInfo.governance.realm);
  if (!realmAccount.exists || realmAccount.programAddress !== programId) {
    return undefined;
  }

  const realm = decodeRealmsRealmAccount(Buffer.from(realmAccount.data));
  return getRealmsInfoForRealm(rpc, wallet, programId, governanceInfo.governance.realm, realm, [governanceInfo]);
}

async function getRealmsInfoForRealm(
  rpc: RealmsRpc,
  wallet: Address,
  programId: Address,
  realmAddress: Address,
  realm: RealmsRealm,
  governanceAccounts: RealmsGovernanceLookup[]
): Promise<RealmsMultisigInfo | undefined> {
  if (governanceAccounts.length === 0) {
    return undefined;
  }

  const votingPopulations = governanceAccounts.map((governanceInfo) => ({
    governanceInfo,
    votingPopulation: getRealmsVotingPopulation(realm, governanceInfo.governance.config),
  }));
  const uniqueGoverningTokenMints = Array.from(
    new Set(
      votingPopulations
        .map(({ votingPopulation }) => votingPopulation?.governingTokenMint)
        .filter((governingTokenMint): governingTokenMint is Address => governingTokenMint !== undefined)
    )
  );
  const adminsNumberEntries = await Promise.all(
    uniqueGoverningTokenMints.map(async (governingTokenMint) => {
      const tokenOwnerRecords = await getRealmsTokenOwnerRecords(
        rpc,
        programId,
        realmAddress,
        governingTokenMint,
        getRealmsTokenOwnerRecordAccountTypes(realm)
      );
      const adminsNumber = tokenOwnerRecords.filter((record) => record.governingTokenDepositAmount > 0n).length;
      return [governingTokenMint, adminsNumber] as const;
    })
  );
  const adminsNumberByMint = new Map<Address, number>(adminsNumberEntries);

  let bestInfo: RealmsMultisigInfo | undefined = undefined;
  for (const { governanceInfo, votingPopulation } of votingPopulations) {
    if (!votingPopulation) {
      bestInfo = bestInfo ?? {
        wallet,
        programId,
        governance: governanceInfo.governanceAddress,
        nativeTreasury: governanceInfo.nativeTreasury,
        realm: realmAddress,
        adminsNumber: 0,
        threshold: 0,
        thresholdPercentage: 0,
      };
      continue;
    }

    const governingTokenMint = votingPopulation.governingTokenMint;
    const adminsNumber = adminsNumberByMint.get(governingTokenMint) ?? 0;
    const threshold = adminsNumber === 0 ? 0 : Math.ceil((adminsNumber * votingPopulation.thresholdPercentage) / 100);
    const info = {
      wallet,
      programId,
      governance: governanceInfo.governanceAddress,
      nativeTreasury: governanceInfo.nativeTreasury,
      realm: realmAddress,
      governingTokenMint,
      adminsNumber,
      threshold,
      thresholdPercentage: votingPopulation.thresholdPercentage,
    };

    if (!bestInfo || info.threshold > bestInfo.threshold) {
      bestInfo = info;
    }
  }

  return bestInfo;
}

async function getRealmsGovernanceForWallet(
  rpc: RealmsRpc,
  wallet: Address,
  programId: Address
): Promise<RealmsGovernanceLookup | undefined> {
  const directGovernance = await getRealmsGovernanceAccount(rpc, wallet, programId);
  if (directGovernance) {
    return {
      governanceAddress: wallet,
      governance: directGovernance,
      nativeTreasury: await getRealmsNativeTreasury(programId, wallet),
    };
  }

  const governanceAccounts = await getAllRealmsGovernanceAccounts(rpc, programId);
  for (const governanceAccount of governanceAccounts) {
    if (governanceAccount.nativeTreasury === wallet) {
      return governanceAccount;
    }
  }

  return undefined;
}

async function getRealmsGovernanceAccount(
  rpc: RealmsRpc,
  governanceAddress: Address,
  programId: Address
): Promise<RealmsGovernance | undefined> {
  const governanceAccount = await fetchEncodedAccount(rpc, governanceAddress);
  if (!governanceAccount.exists || governanceAccount.programAddress !== programId) {
    return undefined;
  }

  try {
    return decodeRealmsGovernanceAccount(Buffer.from(governanceAccount.data));
  } catch (e) {
    return undefined;
  }
}

async function getAllRealmsGovernanceAccounts(
  rpc: RealmsRpc,
  programId: Address,
  realm?: Address,
  accountTypes: number[] = REALMS_GOVERNANCE_ACCOUNT_TYPES
): Promise<RealmsGovernanceLookup[]> {
  const governanceAccountsByType = await Promise.all(
    accountTypes.map(async (accountType) => {
      const filters = [
        {
          memcmp: {
            offset: 0n,
            bytes: accountTypeMemcmpBytes(accountType),
            encoding: 'base58' as const,
          },
        },
        ...(realm
          ? [
              {
                memcmp: {
                  offset: 1n,
                  bytes: realm.toString() as Base58EncodedBytes,
                  encoding: 'base58' as const,
                },
              },
            ]
          : []),
      ];
      const accounts = await rpc
        .getProgramAccounts(programId, {
          filters,
          encoding: 'base64',
        })
        .send();

      const governanceAccounts = await Promise.all(
        accounts.map(async (account): Promise<RealmsGovernanceLookup | undefined> => {
          try {
            return {
              governanceAddress: account.pubkey,
              governance: decodeRealmsGovernanceAccount(Buffer.from(account.account.data[0], 'base64')),
              nativeTreasury: await getRealmsNativeTreasury(programId, account.pubkey),
            };
          } catch (e) {
            return undefined;
          }
        })
      );

      return governanceAccounts.filter(
        (governanceAccount): governanceAccount is RealmsGovernanceLookup => governanceAccount !== undefined
      );
    })
  );

  return governanceAccountsByType.flat();
}

async function getRealmsTokenOwnerRecords(
  rpc: RealmsRpc,
  programId: Address,
  realm: Address,
  governingTokenMint: Address,
  accountTypes: number[] = REALMS_TOKEN_OWNER_RECORD_ACCOUNT_TYPES
): Promise<RealmsTokenOwnerRecord[]> {
  const tokenOwnerRecordsByType = await Promise.all(
    accountTypes.map(async (accountType) => {
      const accounts = await rpc
        .getProgramAccounts(programId, {
          filters: [
            {
              memcmp: {
                offset: 0n,
                bytes: accountTypeMemcmpBytes(accountType),
                encoding: 'base58',
              },
            },
            {
              memcmp: {
                offset: 1n,
                bytes: realm.toString() as Base58EncodedBytes,
                encoding: 'base58',
              },
            },
            {
              memcmp: {
                offset: 33n,
                bytes: governingTokenMint.toString() as Base58EncodedBytes,
                encoding: 'base58',
              },
            },
          ],
          encoding: 'base64',
        })
        .send();

      return accounts
        .map((account) => {
          try {
            return decodeRealmsTokenOwnerRecord(Buffer.from(account.account.data[0], 'base64'));
          } catch (e) {
            return undefined;
          }
        })
        .filter((record): record is RealmsTokenOwnerRecord => record !== undefined);
    })
  );

  return tokenOwnerRecordsByType.flat();
}

async function getRealmsNativeTreasury(programId: Address, governance: Address): Promise<Address> {
  const [nativeTreasury] = await getProgramDerivedAddress({
    programAddress: programId,
    seeds: [Buffer.from(NATIVE_TREASURY_SEED), addressEncoder.encode(governance)],
  });
  return nativeTreasury;
}

function getRealmsVotingPopulation(
  realm: RealmsRealm,
  governanceConfig: RealmsGovernanceConfig
): RealmsVotingPopulation | undefined {
  const councilThresholdPercentage = getVoteThresholdPercentage(governanceConfig.councilVoteThreshold);
  if (realm.councilMint && councilThresholdPercentage !== undefined) {
    return {
      governingTokenMint: realm.councilMint,
      thresholdPercentage: councilThresholdPercentage,
    };
  }

  const communityThresholdPercentage = getVoteThresholdPercentage(governanceConfig.communityVoteThreshold);
  if (communityThresholdPercentage !== undefined) {
    return {
      governingTokenMint: realm.communityMint,
      thresholdPercentage: communityThresholdPercentage,
    };
  }

  return undefined;
}

function getRealmsGovernanceAccountTypes(realm: RealmsRealm): number[] {
  return realm.accountType === REALM_V1_ACCOUNT_TYPE ? GOVERNANCE_V1_ACCOUNT_TYPES : GOVERNANCE_V2_ACCOUNT_TYPES;
}

function getRealmsTokenOwnerRecordAccountTypes(realm: RealmsRealm): number[] {
  return realm.accountType === REALM_V1_ACCOUNT_TYPE
    ? [TOKEN_OWNER_RECORD_V1_ACCOUNT_TYPE]
    : [TOKEN_OWNER_RECORD_V2_ACCOUNT_TYPE];
}

function getVoteThresholdPercentage(voteThreshold: RealmsVoteThreshold): number | undefined {
  return voteThreshold.kind === 'yesVotePercentage' || voteThreshold.kind === 'quorumPercentage'
    ? voteThreshold.percentage
    : undefined;
}

function decodeRealmsRealmAccount(data: Buffer): RealmsRealm {
  const reader = new BorshReader(data);
  const accountType = reader.readU8();
  if (accountType !== REALM_V1_ACCOUNT_TYPE && accountType !== REALM_V2_ACCOUNT_TYPE) {
    throw new Error(`Unexpected Realms realm account type: ${accountType}`);
  }

  const communityMint = reader.readAddress();
  const config = decodeRealmsRealmConfig(reader);

  return {
    accountType,
    communityMint,
    councilMint: config.councilMint,
  };
}

function decodeRealmsRealmConfig(reader: BorshReader): RealmsRealmConfig {
  reader.readU8(); // legacy1
  reader.readU8(); // legacy2
  reader.skip(6); // reserved
  reader.readU64(); // min_community_weight_to_create_governance
  decodeRealmsMintMaxVoterWeightSource(reader);
  const councilMint = reader.readOptionAddress();

  return {
    councilMint,
  };
}

function decodeRealmsGovernanceAccount(data: Buffer): RealmsGovernance {
  const reader = new BorshReader(data);
  const accountType = reader.readU8();
  if (!REALMS_GOVERNANCE_ACCOUNT_TYPES.includes(accountType)) {
    throw new Error(`Unexpected Realms governance account type: ${accountType}`);
  }

  const realm = reader.readAddress();
  const governedAccount = reader.readAddress();
  reader.readU32(); // reserved1 in v2, proposals_count in v1
  const config = decodeRealmsGovernanceConfig(reader);

  return {
    accountType,
    realm,
    governedAccount,
    config,
  };
}

function decodeRealmsGovernanceConfig(reader: BorshReader): RealmsGovernanceConfig {
  const communityVoteThreshold = decodeRealmsVoteThreshold(reader);
  reader.readU64(); // min_community_weight_to_create_proposal
  reader.readU32(); // min_transaction_hold_up_time
  reader.readU32(); // voting_base_time
  reader.readU8(); // community_vote_tipping
  const councilVoteThreshold = decodeRealmsVoteThreshold(reader);
  decodeRealmsVoteThreshold(reader); // council_veto_vote_threshold
  reader.readU64(); // min_council_weight_to_create_proposal
  reader.readU8(); // council_vote_tipping
  decodeRealmsVoteThreshold(reader); // community_veto_vote_threshold
  reader.readU32(); // voting_cool_off_time
  reader.readU8(); // deposit_exempt_proposal_count

  return {
    communityVoteThreshold,
    councilVoteThreshold,
  };
}

function decodeRealmsVoteThreshold(reader: BorshReader): RealmsVoteThreshold {
  const kind = reader.readU8();
  switch (kind) {
    case 0:
      return { kind: 'yesVotePercentage', percentage: reader.readU8() };
    case 1:
      return { kind: 'quorumPercentage', percentage: reader.readU8() };
    case 2:
      return { kind: 'disabled' };
    default:
      throw new Error(`Unexpected Realms vote threshold type: ${kind}`);
  }
}

function decodeRealmsMintMaxVoterWeightSource(reader: BorshReader) {
  const kind = reader.readU8();
  switch (kind) {
    case 0:
    case 1:
      reader.readU64();
      break;
    default:
      throw new Error(`Unexpected Realms max voter weight source type: ${kind}`);
  }
}

function decodeRealmsTokenOwnerRecord(data: Buffer): RealmsTokenOwnerRecord {
  const reader = new BorshReader(data);
  const accountType = reader.readU8();
  if (!REALMS_TOKEN_OWNER_RECORD_ACCOUNT_TYPES.includes(accountType)) {
    throw new Error(`Unexpected Realms token owner record account type: ${accountType}`);
  }

  const realm = reader.readAddress();
  const governingTokenMint = reader.readAddress();
  const governingTokenOwner = reader.readAddress();
  const governingTokenDepositAmount = reader.readU64();

  return {
    realm,
    governingTokenMint,
    governingTokenOwner,
    governingTokenDepositAmount,
  };
}

function accountTypeMemcmpBytes(accountType: number): Base58EncodedBytes {
  return base58Decoder.decode(Buffer.from([accountType])) as Base58EncodedBytes;
}

class BorshReader {
  private offset = 0;

  constructor(private readonly data: Buffer) {}

  readU8(): number {
    const value = this.data.readUInt8(this.offset);
    this.offset += 1;
    return value;
  }

  readU32(): number {
    const value = this.data.readUInt32LE(this.offset);
    this.offset += 4;
    return value;
  }

  readU64(): bigint {
    const value = this.data.readBigUInt64LE(this.offset);
    this.offset += 8;
    return value;
  }

  readAddress(): Address {
    const value = addressDecoder.decode(this.data.subarray(this.offset, this.offset + 32)) as Address;
    this.offset += 32;
    return value;
  }

  readOptionAddress(): Address | undefined {
    const option = this.readU8();
    if (option === 0) {
      return undefined;
    }
    if (option !== 1) {
      throw new Error(`Unexpected optional address tag: ${option}`);
    }
    return this.readAddress();
  }

  skip(length: number) {
    this.offset += length;
  }
}

// {"isSquad":true,"version":"v3"}
export type SquadsMultisigResponse = {
  isSquad: boolean;
  version: string;
};

export interface WalletType {
  walletType: 'simpleWallet' | 'squadsMultisig' | 'realmsMultisig' | 'fordefiWallet';
  walletAdminsNumber?: number;
  walletThreshold?: number;
  walletName?: string;
  walletId?: string;
}

export interface RealmsMultisigInfo {
  wallet: Address;
  programId: Address;
  governance: Address;
  nativeTreasury: Address;
  realm: Address;
  governingTokenMint?: Address;
  adminsNumber: number;
  threshold: number;
  thresholdPercentage: number;
}

export interface FordefiApiConfig {
  apiToken?: string;
  apiBaseUrl?: string;
  maxPages?: number;
}

export interface FordefiWalletInfo {
  wallet: Address;
  vaultId: string;
  vaultName: string;
}

type FordefiListVaultsResponse = {
  total: number;
  page: number;
  size: number;
  vaults: FordefiVault[];
};

type FordefiVault = {
  id: string;
  name: string;
  type: string;
  address?: string;
};

type RealmsGovernanceLookup = {
  governanceAddress: Address;
  governance: RealmsGovernance;
  nativeTreasury: Address;
};

type RealmsGovernance = {
  accountType: number;
  realm: Address;
  governedAccount: Address;
  config: RealmsGovernanceConfig;
};

type RealmsGovernanceConfig = {
  communityVoteThreshold: RealmsVoteThreshold;
  councilVoteThreshold: RealmsVoteThreshold;
};

type RealmsVoteThreshold =
  | { kind: 'yesVotePercentage'; percentage: number }
  | { kind: 'quorumPercentage'; percentage: number }
  | { kind: 'disabled' };

type RealmsRealm = {
  accountType: number;
  communityMint: Address;
  councilMint?: Address;
};

type RealmsRealmConfig = {
  councilMint?: Address;
};

type RealmsVotingPopulation = {
  governingTokenMint: Address;
  thresholdPercentage: number;
};

type RealmsTokenOwnerRecord = {
  realm: Address;
  governingTokenMint: Address;
  governingTokenOwner: Address;
  governingTokenDepositAmount: bigint;
};

export type SquadsV4MultisigAccountResponse = {
  account: {
    bump: number;
    configAuthority: string;
    createKey: string;
    members: number[][];
    rentCollector: string;
    staleTransactionIndex: string;
    threshold: number;
    timeLock: number;
    total_signers: number;
    transactionIndex: string;
  };
  address: string;
  defaultVault: string;
  metadata: { version: string };
};

export type SquadsV3MultisigAccountResponse = {
  allow_external_execute: boolean;
  authority_index: number;
  bump: number;
  create_key: string;
  keys: number[][];
  ms_change_index: number;
  threshold: number;
  transaction_index: number;
};
