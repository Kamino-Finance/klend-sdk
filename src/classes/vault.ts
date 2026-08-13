import BN from 'bn.js';
import { getAddMemoInstruction } from '@solana-program/memo';
import {
  Account,
  AccountRole,
  Address,
  address,
  Base58EncodedBytes,
  fetchEncodedAccount,
  generateKeyPairSigner,
  getAddressEncoder,
  getBase58Decoder,
  GetProgramAccountsDatasizeFilter,
  GetProgramAccountsMemcmpFilter,
  getProgramDerivedAddress,
  AccountMeta,
  Instruction,
  lamports,
  ProgramDerivedAddress,
  Rpc,
  Slot,
  SolanaRpcApi,
  TransactionSigner,
  AccountInfoWithPubkey,
  AccountInfoBase,
  AccountInfoWithJsonData,
  Option,
  some,
  none,
  unixTimestamp,
} from '@solana/kit';
import {
  AllOracleAccounts,
  CdnResources,
  CdnResourcesResponse,
  DEFAULT_PUBLIC_KEY,
  DEFAULT_RECENT_SLOT_DURATION_MS,
  getAssociatedTokenAddress,
  getEventAuthorityPda,
  getUnconfiguredOracleReserveMessage,
  hasOracleConfigured,
  getTokenBalanceFromAccountInfoLamports,
  getTokenOracleData,
  getTransferWsolIxs,
  KaminoAction,
  KaminoMarket,
  KaminoObligation,
  KaminoReserve,
  KVaultGlobalConfig,
  lamportsToDecimal,
  Reserve,
  WRAPPED_SOL_MINT,
} from '../lib';
import {
  addUpdateWhitelistedReserve,
  AddUpdateWhitelistedReserveAccounts,
  AddUpdateWhitelistedReserveArgs,
  buy,
  BuyAccounts,
  BuyArgs,
  buyWithMinSharesOut,
  BuyWithMinSharesOutArgs,
  deposit,
  DepositAccounts,
  DepositArgs,
  depositWithMinSharesOut,
  DepositWithMinSharesOutArgs,
  giveUpPendingFees,
  GiveUpPendingFeesAccounts,
  GiveUpPendingFeesArgs,
  initKVaultGlobalConfig,
  initVault,
  InitVaultAccounts,
  invest,
  InvestAccounts,
  investWithMaxAmount,
  removeAllocation,
  RemoveAllocationAccounts,
  sell,
  SellAccounts,
  SellArgs,
  updateAdmin,
  UpdateAdminAccounts,
  updateKVaultGlobalConfig,
  UpdateKVaultGlobalConfigAccounts,
  UpdateKVaultGlobalConfigArgs,
  updateReserveAllocation,
  UpdateReserveAllocationAccounts,
  UpdateReserveAllocationArgs,
  updateReserveAllocationV2,
  UpdateReserveAllocationV2Args,
  updateVaultConfig,
  UpdateVaultConfigAccounts,
  UpdateVaultConfigArgs,
  withdraw,
  WithdrawAccounts,
  WithdrawArgs,
  withdrawFromAvailable,
  WithdrawFromAvailableAccounts,
  WithdrawFromAvailableArgs,
  withdrawPendingFees,
  WithdrawPendingFeesAccounts,
  redeemInKind,
  RedeemInKindAccounts,
  RedeemInKindArgs,
} from '../@codegen/kvault/instructions';
import {
  UpdateGlobalConfigMode,
  UpdateKVaultGlobalConfigModeKind,
  UpdateReserveWhitelistModeKind,
  VaultConfigField,
  VaultConfigFieldKind,
} from '../@codegen/kvault/types';
import { ReserveWhitelistEntry, VaultState } from '../@codegen/kvault/accounts';
import Decimal from 'decimal.js';
import {
  bpsToPct,
  calculateAPYFromAPR,
  decodeVaultName,
  numberToLamportsDecimal,
  parseTokenSymbol,
  pubkeyHashMapToJson,
} from './utils';
import { PROGRAM_ID } from '../@codegen/klend/programId';
import { enqueueToWithdraw, EnqueueToWithdrawAccounts } from '../@codegen/klend/instructions/enqueueToWithdraw';
import { ProgressCallbackType } from '../@codegen/klend/types';
import { ReserveWithAddress } from './reserve';
import { Fraction } from './fraction';
import {
  CDN_ENDPOINT,
  createAtasIdempotent,
  createWsolAtaIfMissing,
  fetchReserveRewardsMaxAprBpsByMarket,
  getAllStandardTokenProgramTokenAccounts,
  getKVaultSharesMetadataPda,
  getTokenAccountAmount,
  getTokenAccountMint,
  lendingMarketAuthPda,
  ownerQueuedCollateralVaultPda,
  parseBooleanFlag,
  programDataPda,
  SECONDS_PER_YEAR,
  U64_MAX,
  VAULT_INITIAL_DEPOSIT,
  withdrawTicketPda,
} from '../utils';
import { getAccountOwner, getProgramAccounts } from '../utils';
import {
  AcceptVaultOwnershipIxs,
  AllDepositAccounts,
  AllWithdrawAccounts,
  APYs,
  CreateVaultFarm,
  DepositIxs,
  DisinvestAllReservesIxs,
  InitVaultIxs,
  RefreshObligationIxs,
  ReserveAllocationOverview,
  SyncVaultLUTIxs,
  UpdateReserveAllocationIxs,
  UpdateVaultConfigIxs,
  UserSharesForVault,
  TopupVaultRewardsIxs,
  VaultComputedAllocation,
  VaultReleaseCheckResult,
  VaultRewardsOverview,
  WithdrawVaultRewardsIxs,
  WithdrawAndBlockReserveIxs,
  WithdrawIxs,
  RedeemInKindIxs,
  WithdrawAndRedeemInKindIxs,
  EnqueueToWithdrawIxs,
  WithdrawRedeemAndEnqueueIxs,
  CreateVaultFarms,
  SetFarmsToVaultIxs,
  ShareExitLiquidityPlan,
} from './vault_types';
import type { LedgerInstant } from '../utils/ledger';
import { batchFetch } from '@kamino-finance/kliquidity-sdk/dist/utils/batch';
import { ZERO } from '@kamino-finance/kliquidity-sdk/dist/utils/math';
import { collToLamportsDecimal } from '@kamino-finance/kliquidity-sdk/dist/utils/utils';
import { FullBPSDecimal } from '@kamino-finance/kliquidity-sdk/dist/utils/CreationParameters';
import {
  FarmConfigOption,
  FarmIncentives,
  FarmState,
  fetchAllMaybeFarmState,
  getUserStatePDA,
  scaleDownWads,
} from '@kamino-finance/farms-sdk/dist';
import { getAccountsInLut, initLookupTableIx, insertIntoLookupTableIxs } from '../utils';
import {
  FARMS_GLOBAL_CONFIG_DEVNET,
  FARMS_GLOBAL_CONFIG_MAINNET,
  fetchFarmStateOrNull,
  getFarmStakeIxs,
  getFarmUnstakeAndWithdrawIxs,
  getSharesInFarmUserPosition,
  getUserPendingRewardsInFarm,
  getUserSharesInTokensStakedInFarm,
} from './farm_utils';
import { getCreateAccountInstruction, SYSTEM_PROGRAM_ADDRESS } from '@solana-program/system';
import { getInitializeKVaultSharesMetadataIx, getUpdateSharesMetadataIx, resolveMetadata } from '../utils/metadata';
import { decodeReserveWhitelistEntry, decodeVaultState } from '../utils/vault';
import { fetchMaybeToken, findAssociatedTokenPda, getCloseAccountInstruction } from '@solana-program/token-2022';
import { TOKEN_PROGRAM_ADDRESS } from '@solana-program/token';
import { SYSVAR_INSTRUCTIONS_ADDRESS, SYSVAR_RENT_ADDRESS } from '@solana/sysvars';
import { noopSigner } from '../utils/signer';
import { Farms, UserState } from '@kamino-finance/farms-sdk';
import {
  computeReservesAllocation,
  ctokenAllocationCapLamportsToLiquidityLamports,
  getEffectiveLiquidityAllocationCap,
  isCtokenAllocationCapUncapped,
  toReserveAllocationForCompute,
} from '../utils/vaultAllocation';
import type { ReserveAllocationForCompute } from '../utils/vaultAllocation';
import { FarmsClient, getFarmIncentivesWithExistentStateForClient, getReserveFarmRewardsAPY } from '../utils/farmUtils';
import { kaminoCdn } from './cdnClient';
import { isSupportedAdminWallet } from '../utils/wallets';
import { RiskManagerInfo } from '../models/cdn';
import {
  updateGlobalConfigAdmin,
  UpdateGlobalConfigAdminAccounts,
} from '../@codegen/kvault/instructions/updateGlobalConfigAdmin';
import { buildTopupVaultRewardsIxs, buildWithdrawVaultRewardsIxs, calculateVaultRewardsAprApy } from './vault_rewards';

export const kaminoVaultId = address('KvauGMspG5k6rtzrqqn7WNn3oZdyKqLKwK2XWQ8FLjd');
export const kaminoVaultStagingId = address('st2Kvh82VyY8JskVJi4PebU9vdnR14VsaEy6TWVzD1r');

const TOKEN_VAULT_SEED = 'token_vault';
const CTOKEN_VAULT_SEED = 'ctoken_vault';
const BASE_VAULT_AUTHORITY_SEED = 'authority';
const SHARES_SEED = 'shares';
export const METADATA_SEED = 'metadata';
const GLOBAL_CONFIG_STATE_SEED = 'global_config';
const WHITELISTED_RESERVES_SEED = 'whitelisted_reserves';

export const METADATA_PROGRAM_ID: Address = address('metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s');

export const INITIAL_DEPOSIT_LAMPORTS = 1000;

export const DEFAULT_CU_PER_TX = 1_400_000;

const RESERVE_WITHDRAW_LIQUIDITY_ROUNDING_BUFFER_LAMPORTS = new Decimal(1);

const FLC_FARM_COOLDOWN = 30 * 24 * 60 * 60; // 30 days in seconds

const addressEncoder = getAddressEncoder();
const base58Decoder = getBase58Decoder();

/**
 * KaminoVaultClient is a class that provides a high-level interface to interact with the Kamino Vault program.
 */
export class KaminoVaultClient {
  private readonly _rpc: Rpc<SolanaRpcApi>;
  private readonly _kaminoVaultProgramId: Address;
  private readonly _kaminoLendProgramId: Address;
  private readonly _farmsProgramId?: Address;
  recentSlotDurationMs: number;

  // CDN cache
  private _cdnResources?: CdnResources;
  private _cdnResourcesPromise?: Promise<CdnResources | undefined>;

  constructor(
    rpc: Rpc<SolanaRpcApi>,
    recentSlotDurationMs: number,
    kaminoVaultprogramId?: Address,
    kaminoLendProgramId?: Address,
    cdnResources?: CdnResources,
    farmsProgramId?: Address
  ) {
    this._rpc = rpc;
    this.recentSlotDurationMs = recentSlotDurationMs;
    this._kaminoVaultProgramId = kaminoVaultprogramId ? kaminoVaultprogramId : kaminoVaultId;
    this._kaminoLendProgramId = kaminoLendProgramId ? kaminoLendProgramId : PROGRAM_ID;
    this._farmsProgramId = farmsProgramId;
    this._cdnResources = cdnResources;
  }

  getConnection() {
    return this._rpc;
  }

  getProgramID() {
    return this._kaminoVaultProgramId;
  }

  getRpc() {
    return this._rpc;
  }

  getKLendProgramID() {
    return this._kaminoLendProgramId;
  }

  hasFarm() {
    return;
  }

  private async loadCdnResourcesOnce(): Promise<CdnResources | undefined> {
    if (this._cdnResources) {
      return this._cdnResources;
    }
    if (this._cdnResourcesPromise) {
      return this._cdnResourcesPromise;
    }

    this._cdnResourcesPromise = (async () => {
      const response = await fetch(`${CDN_ENDPOINT}/resources.json`);
      if (!response.ok) {
        console.error(`Failed to fetch CDN resources: ${response.status} ${response.statusText}`);
        return undefined;
      }

      const raw = (await response.json()) as CdnResourcesResponse;
      const delegatedVaultFarms = raw['mainnet-beta']?.delegatedVaultFarms;
      if (!delegatedVaultFarms) {
        return undefined;
      }

      const riskManagers = raw['mainnet-beta']?.riskManagers ?? {};
      const parsed: CdnResources = { delegatedVaultFarms, riskManagers };
      this._cdnResources = parsed;
      return parsed;
    })();

    return this._cdnResourcesPromise;
  }

  /**
   * Check if a vault has all the needed criteria to be released
   * - owner is multisig
   * - vaultFarm is set and it is a farm that is valid
   * - FLC farm is set and it is a farm that is valid (warning if not)
   * - check shares token metadata is set
   * - Check min deposit is not 0
   * - Check the vault has at least one allocation
   * - Check there are allocations with weight > 0 and cap > 0 (and give warning for each allocation which doesn't have cap == u64::MAX)
   * - Check CDN (using loadCdnResourcesOnce) that the vaultAdmin exists in the list of admins and has a description
   * @param vault - the vault to check
   * @returns - a promise that resolves to the release status of the vault
   */
  async checkVaultReleaseStatus(vault: KaminoVault): Promise<VaultReleaseCheckResult> {
    const result: VaultReleaseCheckResult = {
      errors: [],
      warnings: [],
      success: true,
    };

    const vaultState = await vault.getState();

    // 1. Check owner is multisig
    try {
      const adminWalletIsSupported = await isSupportedAdminWallet(this._rpc, vaultState.vaultAdminAuthority);
      if (!adminWalletIsSupported) {
        result.errors.push(`Vault admin ${vaultState.vaultAdminAuthority} is not a Squads, Realms, or Fordefi wallet`);
      }
    } catch (e) {
      result.errors.push(
        `Failed to check if vault admin ${vaultState.vaultAdminAuthority} is a supported wallet: ${e}`
      );
    }

    // 2. Check vaultFarm is set and valid
    if (vaultState.vaultFarm === DEFAULT_PUBLIC_KEY) {
      result.errors.push('Vault farm is not set');
    } else {
      const farmState = await fetchFarmStateOrNull(this._rpc, vaultState.vaultFarm);
      if (!farmState) {
        result.errors.push(`Vault farm ${vaultState.vaultFarm} could not be fetched (invalid or does not exist)`);
      }
    }

    // 3. Check FLC farm is set and valid (warning if not)
    if (vaultState.firstLossCapitalFarm === DEFAULT_PUBLIC_KEY) {
      result.warnings.push('First loss capital farm is not set');
    } else {
      const flcFarmState = await fetchFarmStateOrNull(this._rpc, vaultState.firstLossCapitalFarm);
      if (!flcFarmState) {
        result.warnings.push(
          `First loss capital farm ${vaultState.firstLossCapitalFarm} could not be fetched (invalid or does not exist)`
        );
      } else {
        if (!(await this.isFlcFarmValid(flcFarmState, vaultState))) {
          result.warnings.push(`First loss capital farm ${vaultState.firstLossCapitalFarm} is not valid`);
        }
      }
    }

    // 4. Check shares token metadata is set
    const [sharesMintMetadata] = await getKVaultSharesMetadataPda(vaultState.sharesMint);
    const metadataAccount = await fetchEncodedAccount(this._rpc, sharesMintMetadata, { commitment: 'processed' });
    if (!metadataAccount.exists) {
      result.errors.push(`Shares token metadata not set for shares mint ${vaultState.sharesMint}`);
    }

    // 5. Check min deposit is not 0
    if (vaultState.minDepositAmount.isZero()) {
      result.errors.push('Min deposit amount is 0');
    }

    // 6. Check the vault has at least one allocation
    const activeAllocations = vaultState.vaultAllocationStrategy.filter(
      (allocation) => allocation.reserve !== DEFAULT_PUBLIC_KEY
    );
    if (activeAllocations.length === 0) {
      result.errors.push('Vault has no allocations');
    }

    // 7. Check allocations have weight > 0 and cap > 0, warn if cap != u64::MAX
    for (const allocation of activeAllocations) {
      if (allocation.targetAllocationWeight.isZero()) {
        result.errors.push(`Allocation for reserve ${allocation.reserve} has weight 0`);
      }
      if (allocation.tokenAllocationCap.isZero()) {
        result.errors.push(`Allocation for reserve ${allocation.reserve} has cap 0`);
      } else if (allocation.tokenAllocationCap.toString() !== U64_MAX) {
        result.warnings.push(
          `Allocation for reserve ${
            allocation.reserve
          } has cap ${allocation.tokenAllocationCap.toString()} (not u64::MAX)`
        );
      }
    }

    // 9. Check CDN that the vault admin exists in riskManagers and has a description
    const cdnResources = await this.loadCdnResourcesOnce();
    if (!cdnResources) {
      result.errors.push('Could not fetch CDN resources to verify vault admin');
    } else {
      const adminEntries = cdnResources.riskManagers[vaultState.vaultAdminAuthority];
      if (!adminEntries || adminEntries.length === 0) {
        result.errors.push(`Vault admin ${vaultState.vaultAdminAuthority} not found in CDN riskManagers`);
      } else {
        const hasDescription = adminEntries.some(
          (entry: RiskManagerInfo) => entry.description && entry.description.trim().length > 0
        );
        if (!hasDescription) {
          result.errors.push(
            `Vault admin ${vaultState.vaultAdminAuthority} found in CDN riskManagers but has no description`
          );
        }
      }
    }

    result.success = result.errors.length === 0;
    return result;
  }

  /**
   * Prints a vault in a human readable form
   * @param vaultPubkey - the address of the vault
   * @param slot - slot to use for vault calculations
   * @param [vaultState] - optional parameter to pass the vault state directly; this will save a network call
   * @returns - void; prints the vault to the console
   */
  async printVault(vaultPubkey: Address, slot: Slot, vaultState?: VaultState) {
    const vault = vaultState
      ? vaultState
      : await VaultState.fetch(this.getConnection(), vaultPubkey, this._kaminoVaultProgramId);

    if (!vault) {
      console.log(`Vault ${vaultPubkey.toString()} not found`);
      return;
    }

    const kaminoVault = KaminoVault.loadWithClientAndState(this, vaultPubkey, vault);
    const vaultName = this.decodeVaultName(vault.name);
    const vaultReservesMap = await this.loadVaultReserves(vault);
    const tokensPerShare = await this.getTokensPerShareSingleVault(kaminoVault, slot, vaultReservesMap, slot);
    const holdings = await this.getVaultHoldings(vault, slot, vaultReservesMap, slot);

    const sharesIssued = new Decimal(vault.sharesIssued.toString()!).div(
      new Decimal(vault.sharesMintDecimals.toString())
    );

    console.log('Name: ', vaultName);
    console.log('Shares issued: ', sharesIssued);
    holdings.print();
    console.log('Tokens per share: ', tokensPerShare);
  }

  /**
   * This method initializes the kvault global config (one off, needs to be signed by program owner)
   * @param admin - the admin of the kvault program
   * @returns - an instruction to initialize the kvault global config
   */
  async initKvaultGlobalConfigIx(admin: TransactionSigner) {
    const globalConfigAddress = await getKvaultGlobalConfigPda(this.getProgramID());

    const programData = await programDataPda(this.getProgramID());
    const ix = initKVaultGlobalConfig(
      {
        payer: admin,
        globalConfig: globalConfigAddress,
        programData: programData,
        systemProgram: SYSTEM_PROGRAM_ADDRESS,
        rent: SYSVAR_RENT_ADDRESS,
      },
      undefined,
      this.getProgramID()
    );
    return ix;
  }

  /**
   * This method updates the kvault global config
   * @param mode - the mode to update the global config with
   * @returns - an instruction to update the global config
   */
  async updateGlobalConfigIx(mode: string, value: string) {
    console.log('in updateGlobalConfigIx');
    let modeEnum: UpdateKVaultGlobalConfigModeKind;
    switch (mode) {
      case 'PendingAdmin': {
        // Ensure value is a valid address string before converting
        if (!value || value.length < 32) {
          throw new Error(`Invalid address value: ${value}`);
        }
        const addr = address(value);
        modeEnum = new UpdateGlobalConfigMode.PendingAdmin([addr]);
        break;
      }
      case 'MinWithdrawalPenaltyLamports': {
        modeEnum = new UpdateGlobalConfigMode.MinWithdrawalPenaltyLamports([new BN(value)]);
        break;
      }
      case 'MinWithdrawalPenaltyBPS': {
        modeEnum = new UpdateGlobalConfigMode.MinWithdrawalPenaltyBPS([new BN(value)]);
        break;
      }
      default:
        throw new Error(`Unknown update mode: ${mode}`);
    }
    const args: UpdateKVaultGlobalConfigArgs = {
      update: modeEnum,
    };

    const globalConfigAddress = await getKvaultGlobalConfigPda(this.getProgramID());
    const globalConfigState = await KVaultGlobalConfig.fetch(this.getConnection(), globalConfigAddress);
    if (!globalConfigState) {
      throw new Error('Global config not found');
    }
    const admin = globalConfigState.globalAdmin;
    const accounts: UpdateKVaultGlobalConfigAccounts = {
      globalAdmin: noopSigner(admin),
      globalConfig: globalConfigAddress,
    };
    return updateKVaultGlobalConfig(args, accounts, undefined, this.getProgramID());
  }

  /**
   * This method accepts the ownership of the global config
   * @param admin - the admin of the transaction
   * @returns - an instruction to accept the ownership of the global config
   */
  async acceptGlobalConfigOwnershipIx(admin: TransactionSigner) {
    const globalConfigAddress = await getKvaultGlobalConfigPda(this.getProgramID());
    const accounts: UpdateGlobalConfigAdminAccounts = {
      pendingAdmin: admin,
      globalConfig: globalConfigAddress,
    };
    return updateGlobalConfigAdmin(accounts, undefined, this.getProgramID());
  }

  /**
   * This method will create a vault with a given config. The config can be changed later on, but it is recommended to set it up correctly from the start
   * @param vaultConfig - the config object used to create a vault
   * @param [useDevnetFarms] - whether to use devnet farms
   * @returns vault: the keypair of the vault, used to sign the initialization transaction; initVaultIxs: a struct with ixs to initialize the vault and its lookup table + populateLUTIxs, a list to populate the lookup table which has to be executed in a separate transaction
   */
  async createVaultIxs(
    vaultConfig: KaminoVaultConfig,
    useDevnetFarms: boolean = false
  ): Promise<{ vault: TransactionSigner; lut: Address; initVaultIxs: InitVaultIxs }> {
    const vaultState = await generateKeyPairSigner();
    const size = BigInt(VaultState.layout.span + 8);

    const createVaultIx = getCreateAccountInstruction({
      payer: vaultConfig.admin,
      space: size,
      lamports: await this.getConnection().getMinimumBalanceForRentExemption(size).send(),
      programAddress: this._kaminoVaultProgramId,
      newAccount: vaultState,
    });

    const [[tokenVault], [baseVaultAuthority], [sharesMint]] = await Promise.all([
      getProgramDerivedAddress({
        seeds: [Buffer.from(TOKEN_VAULT_SEED), addressEncoder.encode(vaultState.address)],
        programAddress: this._kaminoVaultProgramId,
      }),
      getProgramDerivedAddress({
        seeds: [Buffer.from(BASE_VAULT_AUTHORITY_SEED), addressEncoder.encode(vaultState.address)],
        programAddress: this._kaminoVaultProgramId,
      }),
      getProgramDerivedAddress({
        seeds: [Buffer.from(SHARES_SEED), addressEncoder.encode(vaultState.address)],
        programAddress: this._kaminoVaultProgramId,
      }),
    ]);

    let adminTokenAccount: Address;
    const prerequisiteIxs: Instruction[] = [];
    const cleanupIxs: Instruction[] = [];
    if (vaultConfig.tokenMint === WRAPPED_SOL_MINT) {
      const { wsolAta, createAtaIxs, closeAtaIxs } = await createWsolAtaIfMissing(
        this.getConnection(),
        new Decimal(VAULT_INITIAL_DEPOSIT),
        vaultConfig.admin,
        vaultConfig.tokenMintProgramId
      );
      adminTokenAccount = wsolAta;

      prerequisiteIxs.push(...createAtaIxs);
      cleanupIxs.push(...closeAtaIxs);
    } else {
      adminTokenAccount = (
        await findAssociatedTokenPda({
          mint: vaultConfig.tokenMint,
          tokenProgram: vaultConfig.tokenMintProgramId,
          owner: vaultConfig.admin.address,
        })
      )[0];
    }

    const initVaultAccounts: InitVaultAccounts = {
      adminAuthority: vaultConfig.admin,
      vaultState: vaultState.address,
      baseTokenMint: vaultConfig.tokenMint,
      tokenVault,
      baseVaultAuthority,
      sharesMint,
      systemProgram: SYSTEM_PROGRAM_ADDRESS,
      rent: SYSVAR_RENT_ADDRESS,
      tokenProgram: vaultConfig.tokenMintProgramId,
      sharesTokenProgram: TOKEN_PROGRAM_ADDRESS,
      adminTokenAccount,
    };
    const initVaultIx = initVault(initVaultAccounts, undefined, this._kaminoVaultProgramId);

    const createVaultFarm = await this.createVaultFarm(
      vaultConfig.admin,
      vaultState.address,
      sharesMint,
      useDevnetFarms
    );
    const createFLCFarm = await this.createVaultFLCFarm(
      vaultConfig.admin,
      vaultState.address,
      sharesMint,
      useDevnetFarms
    );

    // create and set up the vault lookup table
    const [createLUTIx, lut] = await initLookupTableIx(
      vaultConfig.admin,
      await this.getConnection().getSlot({ commitment: 'finalized' }).send()
    );

    const farmsGlobalConfig = useDevnetFarms ? FARMS_GLOBAL_CONFIG_DEVNET : FARMS_GLOBAL_CONFIG_MAINNET;
    const accountsToBeInserted: Address[] = [
      vaultConfig.admin.address,
      vaultState.address,
      vaultConfig.tokenMint,
      vaultConfig.tokenMintProgramId,
      baseVaultAuthority,
      sharesMint,
      SYSTEM_PROGRAM_ADDRESS,
      SYSVAR_RENT_ADDRESS,
      TOKEN_PROGRAM_ADDRESS,
      this._kaminoLendProgramId,
      SYSVAR_INSTRUCTIONS_ADDRESS,
      createVaultFarm.farm.address,
      createFLCFarm.farm.address,
      farmsGlobalConfig,
    ];
    const insertIntoLUTIxs = await insertIntoLookupTableIxs(
      this.getConnection(),
      vaultConfig.admin,
      lut,
      accountsToBeInserted,
      []
    );

    const setLUTIx = await this.updateUninitialisedVaultConfigIx(
      vaultConfig.admin,
      vaultState.address,
      new VaultConfigField.LookupTable(),
      lut.toString()
    );

    const ixs = [createVaultIx, initVaultIx, setLUTIx];

    if (vaultConfig.getPerformanceFeeBps() > 0) {
      const setPerformanceFeeIx = await this.updateUninitialisedVaultConfigIx(
        vaultConfig.admin,
        vaultState.address,
        new VaultConfigField.PerformanceFeeBps(),
        vaultConfig.getPerformanceFeeBps().toString()
      );
      ixs.push(setPerformanceFeeIx);
    }
    if (vaultConfig.getManagementFeeBps() > 0) {
      const setManagementFeeIx = await this.updateUninitialisedVaultConfigIx(
        vaultConfig.admin,
        vaultState.address,
        new VaultConfigField.ManagementFeeBps(),
        vaultConfig.getManagementFeeBps().toString()
      );
      ixs.push(setManagementFeeIx);
    }
    if (vaultConfig.minDepositAmount > 0) {
      const setMinDepositIx = await this.updateUninitialisedVaultConfigIx(
        vaultConfig.admin,
        vaultState.address,
        new VaultConfigField.MinDepositAmount(),
        vaultConfig.minDepositAmount.toString()
      );
      ixs.push(setMinDepositIx);
    }
    if (vaultConfig.minWithdrawAmount > 0) {
      const setMinWithdrawIx = await this.updateUninitialisedVaultConfigIx(
        vaultConfig.admin,
        vaultState.address,
        new VaultConfigField.MinWithdrawAmount(),
        vaultConfig.minWithdrawAmount.toString()
      );
      ixs.push(setMinWithdrawIx);
    }
    if (vaultConfig.minInvestAmount > 0) {
      const setMinInvestIx = await this.updateUninitialisedVaultConfigIx(
        vaultConfig.admin,
        vaultState.address,
        new VaultConfigField.MinInvestAmount(),
        vaultConfig.minInvestAmount.toString()
      );
      ixs.push(setMinInvestIx);
    }
    if (vaultConfig.minInvestDelaySlots > 0) {
      const setMinInvestDelayIx = await this.updateUninitialisedVaultConfigIx(
        vaultConfig.admin,
        vaultState.address,
        new VaultConfigField.MinInvestDelaySlots(),
        vaultConfig.minInvestDelaySlots.toString()
      );
      ixs.push(setMinInvestDelayIx);
    }
    if (vaultConfig.withdrawalPenaltyBps > 0) {
      const setWithdrawalPenaltyBpsIx = await this.updateUninitialisedVaultConfigIx(
        vaultConfig.admin,
        vaultState.address,
        new VaultConfigField.WithdrawalPenaltyBps(),
        vaultConfig.withdrawalPenaltyBps.toString()
      );
      ixs.push(setWithdrawalPenaltyBpsIx);
    }
    if (vaultConfig.withdrawalPenaltyLamports > 0) {
      const setWithdrawalPenaltyLamportsIx = await this.updateUninitialisedVaultConfigIx(
        vaultConfig.admin,
        vaultState.address,
        new VaultConfigField.WithdrawalPenaltyLamports(),
        vaultConfig.withdrawalPenaltyLamports.toString()
      );
      ixs.push(setWithdrawalPenaltyLamportsIx);
    }
    if (vaultConfig.crankFundFeePerReserve > 0) {
      const setCrankFundFeeIx = await this.updateUninitialisedVaultConfigIx(
        vaultConfig.admin,
        vaultState.address,
        new VaultConfigField.CrankFundFeePerReserve(),
        vaultConfig.crankFundFeePerReserve.toString()
      );
      ixs.push(setCrankFundFeeIx);
    }
    if (vaultConfig.name && vaultConfig.name.length > 0) {
      const setNameIx = await this.updateUninitialisedVaultConfigIx(
        vaultConfig.admin,
        vaultState.address,
        new VaultConfigField.Name(),
        vaultConfig.name
      );
      ixs.push(setNameIx);
    }
    if (vaultConfig.allowAllocationsInWhitelistedReservesOnly) {
      const setAllowAllocationsInWhitelistedReservesOnlyIx = await this.updateUninitialisedVaultConfigIx(
        vaultConfig.admin,
        vaultState.address,
        new VaultConfigField.AllowAllocationsInWhitelistedReservesOnly(),
        vaultConfig.allowAllocationsInWhitelistedReservesOnly ? '1' : '0'
      );
      ixs.push(setAllowAllocationsInWhitelistedReservesOnlyIx);
    }
    if (vaultConfig.allowInvestInWhitelistedReservesOnly) {
      const setAllowInvestInWhitelistedReservesOnlyIx = await this.updateUninitialisedVaultConfigIx(
        vaultConfig.admin,
        vaultState.address,
        new VaultConfigField.AllowInvestInWhitelistedReservesOnly(),
        vaultConfig.allowInvestInWhitelistedReservesOnly ? '1' : '0'
      );
      ixs.push(setAllowInvestInWhitelistedReservesOnlyIx);
    }
    const setFarmIx = await this.updateUninitialisedVaultConfigIx(
      vaultConfig.admin,
      vaultState.address,
      new VaultConfigField.Farm(),
      createVaultFarm.farm.address
    );
    const setFLCFarmIx = await this.updateUninitialisedVaultConfigIx(
      vaultConfig.admin,
      vaultState.address,
      new VaultConfigField.FirstLossCapitalFarm(),
      createFLCFarm.farm.address
    );

    const metadataIx = await this.getSetSharesMetadataIx(
      this.getConnection(),
      vaultConfig.admin,
      vaultState.address,
      sharesMint,
      baseVaultAuthority,
      vaultConfig.vaultTokenSymbol,
      vaultConfig.vaultTokenName,
      undefined,
      this._kaminoVaultProgramId
    );

    const createVaultFarms: CreateVaultFarms = {
      createVaultFarmIxs: createVaultFarm,
      createFLCVaultFarmIxs: createFLCFarm,
    };
    const setFarmToVaultIxs: SetFarmsToVaultIxs = {
      setFarmToVaultIx: setFarmIx,
      setFLCFarmToVaultIx: setFLCFarmIx,
    };
    return {
      vault: vaultState,
      lut,
      initVaultIxs: {
        createAtaIfNeededIxs: prerequisiteIxs,
        initVaultIxs: ixs,
        createLUTIx,
        populateLUTIxs: insertIntoLUTIxs,
        cleanupIxs,
        initSharesMetadataIx: metadataIx,
        createVaultFarms,
        setFarmToVaultIxs,
      },
    };
  }

  /**
   * This method creates a farm for a vault
   * @param signer - the signer of the transaction
   * @param vaultSharesMint - the mint of the vault shares
   * @param vaultAddress - the address of the vault (it doesn't need to be already initialized)
   * @returns a struct with the farm, the setup farm ixs and the update farm ixs
   */
  async createVaultFarm(
    signer: TransactionSigner,
    vaultAddress: Address,
    vaultSharesMint: Address,
    useDevnetFarms: boolean = false
  ): Promise<CreateVaultFarm> {
    const farmsSDK = new Farms(this._rpc, this._farmsProgramId);

    const globalConfig = useDevnetFarms ? FARMS_GLOBAL_CONFIG_DEVNET : FARMS_GLOBAL_CONFIG_MAINNET;
    const farm = await generateKeyPairSigner();
    const ixs = await farmsSDK.createFarmIxs(signer, farm, globalConfig, vaultSharesMint);

    const updateFarmIxs: Instruction[] = [];
    const updateFarmVaultIdIx = await farmsSDK.updateFarmConfigIx(
      signer,
      farm.address,
      DEFAULT_PUBLIC_KEY,
      FarmConfigOption.UpdateVaultId,
      vaultAddress,
      undefined,
      undefined,
      true
    );
    updateFarmIxs.push(updateFarmVaultIdIx);

    return {
      farm,
      setupFarmIxs: ixs,
      updateFarmIxs,
    };
  }

  /**
   * This method creates the first loss capital farm for a vault and configures its cooldown period.
   * @param signer - the signer of the transaction
   * @param vaultAddress - the address of the vault
   * @param vaultSharesMint - the mint of the vault shares
   * @returns a struct with the farm, setup ixs, and update ixs (including cooldown update)
   */
  async createVaultFLCFarm(
    signer: TransactionSigner,
    vaultAddress: Address,
    vaultSharesMint: Address,
    useDevnetFarms: boolean = false
  ): Promise<CreateVaultFarm> {
    const createVaultFarm = await this.createVaultFarm(signer, vaultAddress, vaultSharesMint, useDevnetFarms);
    const farmsSDK = new Farms(this._rpc, this._farmsProgramId);
    const updateCooldownIx = await farmsSDK.updateFarmConfigIx(
      signer,
      createVaultFarm.farm.address,
      DEFAULT_PUBLIC_KEY,
      FarmConfigOption.WithdrawCooldownPeriod,
      FLC_FARM_COOLDOWN,
      undefined,
      undefined,
      true
    );

    return {
      farm: createVaultFarm.farm,
      setupFarmIxs: createVaultFarm.setupFarmIxs,
      updateFarmIxs: [...createVaultFarm.updateFarmIxs, updateCooldownIx],
    };
  }

  /**
   * This method creates an instruction to set the shares metadata for a vault
   * @param rpc
   * @param vaultAdmin
   * @param vault - the vault to set the shares metadata for
   * @param sharesMint
   * @param baseVaultAuthority
   * @param tokenName - the name of the token in the vault (symbol; e.g. "USDC" which becomes "kVUSDC")
   * @param extraName - the extra string appended to the prefix("Kamino Vault USDC <extraName>")
   * @returns - an instruction to set the shares metadata for the vault
   */
  async getSetSharesMetadataIx(
    rpc: Rpc<SolanaRpcApi>,
    vaultAdmin: TransactionSigner,
    vault: Address,
    sharesMint: Address,
    baseVaultAuthority: Address,
    tokenName: string,
    extraName: string,
    metadataProgramId: Address = METADATA_PROGRAM_ID,
    kvaultProgramId?: Address
  ) {
    const kvaultProgramIdToUse = kvaultProgramId ?? this._kaminoVaultProgramId;
    const [sharesMintMetadata] = await getKVaultSharesMetadataPda(sharesMint, metadataProgramId);

    const { name, symbol, uri } = resolveMetadata(sharesMint, extraName, tokenName);

    const ix = !(await fetchEncodedAccount(rpc, sharesMintMetadata, { commitment: 'processed' })).exists
      ? await getInitializeKVaultSharesMetadataIx(
          vaultAdmin,
          vault,
          sharesMint,
          baseVaultAuthority,
          name,
          symbol,
          uri,
          metadataProgramId,
          kvaultProgramIdToUse
        )
      : await getUpdateSharesMetadataIx(
          vaultAdmin,
          vault,
          sharesMint,
          baseVaultAuthority,
          name,
          symbol,
          uri,
          metadataProgramId,
          kvaultProgramIdToUse
        );

    return ix;
  }

  /**
   * This method updates the vault reserve allocation config for an exiting vault reserve, or adds a new reserve to the vault if it does not exist.
   * @param vault - vault to be updated
   * @param reserveAllocationConfig - new reserve allocation config
   * @param [vaultAdminAuthority] - vault admin - a noop vaultAdminAuthority is provided when absent for multisigs
   * @returns - a struct with an instruction to update the reserve allocation and an optional list of instructions to update the lookup table for the allocation changes
   */
  async updateReserveAllocationIxs(
    vault: KaminoVault,
    reserveAllocationConfig: ReserveAllocationConfig,
    vaultAdminAuthority?: TransactionSigner
  ): Promise<UpdateReserveAllocationIxs> {
    const vaultState: VaultState = await vault.getState();
    const reserveState: Reserve = reserveAllocationConfig.getReserveState();

    const cTokenVault = await getCTokenVaultPda(
      vault.address,
      reserveAllocationConfig.getReserveAddress(),
      this._kaminoVaultProgramId
    );

    const reserveWhitelistEntryOption = await getReserveWhitelistEntryIfExists(
      reserveAllocationConfig.getReserveAddress(),
      this.getConnection(),
      this._kaminoVaultProgramId
    );

    const vaultAdmin = parseVaultAdmin(vaultState, vaultAdminAuthority);
    const updateReserveAllocationAccounts: UpdateReserveAllocationAccounts = {
      signer: vaultAdmin,
      vaultState: vault.address,
      baseVaultAuthority: vaultState.baseVaultAuthority,
      reserveCollateralMint: reserveState.collateral.mintPubkey,
      reserve: reserveAllocationConfig.getReserveAddress(),
      ctokenVault: cTokenVault,
      reserveWhitelistEntry: reserveWhitelistEntryOption,
      systemProgram: SYSTEM_PROGRAM_ADDRESS,
      rent: SYSVAR_RENT_ADDRESS,
      reserveCollateralTokenProgram: TOKEN_PROGRAM_ADDRESS,
    };

    const updateReserveAllocationArgs: UpdateReserveAllocationArgs = {
      weight: new BN(reserveAllocationConfig.targetAllocationWeight),
      cap: new BN(reserveAllocationConfig.getAllocationCapLamports().floor().toString()),
    };

    const updateReserveAllocationIx = this.buildUpdateReserveAllocationIx(
      updateReserveAllocationArgs,
      updateReserveAllocationAccounts,
      reserveAllocationConfig.ctokenAllocationCapLamports
    );

    const accountsToAddToLut = [
      reserveAllocationConfig.getReserveAddress(),
      cTokenVault,
      ...this.getReserveAccountsToInsertInLut(reserveState),
    ];

    const [lendingMarketAuth] = await lendingMarketAuthPda(reserveState.lendingMarket, this._kaminoLendProgramId);
    accountsToAddToLut.push(lendingMarketAuth);

    const insertIntoLutIxs = await insertIntoLookupTableIxs(
      this.getConnection(),
      vaultAdmin,
      vaultState.vaultLookupTable,
      accountsToAddToLut
    );

    const updateReserveAllocationIxs: UpdateReserveAllocationIxs = {
      updateReserveAllocationIx,
      updateLUTIxs: insertIntoLutIxs,
    };

    return updateReserveAllocationIxs;
  }

  private buildUpdateReserveAllocationIx(
    args: UpdateReserveAllocationArgs,
    accounts: UpdateReserveAllocationAccounts,
    ctokenAllocationCapLamports?: BN
  ): Instruction {
    if (ctokenAllocationCapLamports === undefined) {
      // Omitted ctoken cap means preserve the on-chain value at execution time.
      return updateReserveAllocation(args, accounts, undefined, this._kaminoVaultProgramId);
    }

    return updateReserveAllocationV2(
      {
        ...args,
        ctokenAllocationCap: ctokenAllocationCapLamports,
      } satisfies UpdateReserveAllocationV2Args,
      accounts,
      undefined,
      this._kaminoVaultProgramId
    );
  }

  /**
   * This method updates the unallocated weight and cap of a vault (both are optional, if not provided the current values will be used)
   * @param vault - the vault to update the unallocated weight and cap for
   * @param [vaultAdminAuthority] - vault admin - a noop vaultAdminAuthority is provided when absent for multisigs
   * @param [unallocatedWeight] - the new unallocated weight to set. If not provided, the current unallocated weight will be used
   * @param [unallocatedCap] - the new unallocated cap to set. If not provided, the current unallocated cap will be used
   * @returns - a list of instructions to update the unallocated weight and cap
   */
  async updateVaultUnallocatedWeightAndCapIxs(
    vault: KaminoVault,
    vaultReservesMap: Map<Address, KaminoReserve>,
    vaultAdminAuthority?: TransactionSigner,
    unallocatedWeight?: BN,
    unallocatedCap?: BN
  ) {
    const vaultState = await vault.getState();

    const unallocatedWeightToUse = unallocatedWeight ? unallocatedWeight : vaultState.unallocatedWeight;
    const unallocatedCapToUse = unallocatedCap ? unallocatedCap : vaultState.unallocatedTokensCap;

    const ixs: Instruction[] = [];

    if (!unallocatedWeightToUse.eq(vaultState.unallocatedWeight)) {
      const updateVaultUnallocatedWeightIx = await this.updateVaultConfigIxs(
        vault,
        new VaultConfigField.UnallocatedWeight(),
        unallocatedWeightToUse.toString(),
        vaultReservesMap,
        vaultAdminAuthority
      );
      ixs.push(updateVaultUnallocatedWeightIx.updateVaultConfigIx);
    }

    if (!unallocatedCapToUse.eq(vaultState.unallocatedTokensCap)) {
      const updateVaultUnallocatedCapIx = await this.updateVaultConfigIxs(
        vault,
        new VaultConfigField.UnallocatedTokensCap(),
        unallocatedCapToUse.toString(),
        vaultReservesMap,
        vaultAdminAuthority
      );
      ixs.push(updateVaultUnallocatedCapIx.updateVaultConfigIx);
    }

    return ixs;
  }

  private async buildCappedInvestIxsForReserves({
    payer,
    vault,
    vaultState,
    slot,
    reserves,
    vaultReservesMap,
    createAtaIfNeeded = true,
  }: {
    payer: TransactionSigner;
    vault: KaminoVault;
    vaultState: VaultState;
    slot: Slot;
    reserves: Address[];
    vaultReservesMap: Map<Address, KaminoReserve>;
    createAtaIfNeeded?: boolean;
  }): Promise<Instruction[]> {
    const reserveAllocationAvailableLiquidityToWithdraw = await this.getReserveAllocationAvailableLiquidityToWithdraw(
      vaultState,
      slot,
      vaultReservesMap
    );
    const minInvestAmountLamports = new Decimal(vaultState.minInvestAmount?.toString() ?? '0');
    const reserveAllocationLiquidity = minInvestAmountLamports.gt(0)
      ? await this.getReserveAllocationLiquidity(vaultState, slot, vaultReservesMap)
      : new Map<Address, Decimal>();
    const reserveAmounts = reserves
      .map((reserve) => ({
        reserve,
        maxAmountLamports: (reserveAllocationAvailableLiquidityToWithdraw.get(reserve) ?? new Decimal(0)).floor(),
      }))
      .filter(({ reserve, maxAmountLamports }) => {
        const isUncappedFullWeightZeroEvacuation = maxAmountLamports.gte(
          (reserveAllocationLiquidity.get(reserve) ?? new Decimal(0)).floor()
        );
        return this.shouldEmitInvestMove(
          maxAmountLamports,
          minInvestAmountLamports,
          isUncappedFullWeightZeroEvacuation
        );
      });

    if (reserveAmounts.length === 0) {
      return [];
    }

    const tokenProgram = await getAccountOwner(this.getConnection(), vaultState.tokenMint);
    const [{ ata: payerTokenAta, createAtaIx }] = await createAtasIdempotent(payer, [
      { mint: vaultState.tokenMint, tokenProgram },
    ]);
    const investIxs = await this.buildCappedInvestIxsForReserveAmounts({
      payer,
      vault,
      vaultState,
      vaultReservesMap,
      reserveAmounts,
      tokenProgram,
      payerTokenAta,
      vaultReserves: this.getVaultReserves(vaultState),
    });

    return createAtaIfNeeded ? [createAtaIx, ...investIxs] : investIxs;
  }

  /**
   * This method withdraws all the funds from a reserve and blocks it from being invested by setting its weight and ctoken allocation to 0
   * @param vault - the vault to withdraw the funds from
   * @param reserve - the reserve to withdraw the funds from
   * @param [vaultAdminAuthority] - vault admin - a noop vaultAdminAuthority is provided when absent for multisigs
   * @returns - a struct with an instruction to update the reserve allocation and an optional list of instructions to update the lookup table for the allocation changes
   */
  async withdrawEverythingAndBlockInvestReserve(
    vault: KaminoVault,
    reserve: Address,
    vaultAdminAuthority?: TransactionSigner
  ): Promise<WithdrawAndBlockReserveIxs> {
    const vaultState = await vault.getState();

    const reserveIsPartOfAllocation = vaultState.vaultAllocationStrategy.some(
      (allocation) => allocation.reserve === reserve
    );

    const withdrawAndBlockReserveIxs: WithdrawAndBlockReserveIxs = {
      updateReserveAllocationIxs: [],
      investIxs: [],
    };
    if (!reserveIsPartOfAllocation) {
      return withdrawAndBlockReserveIxs;
    }

    const reserveState = await Reserve.fetch(this.getConnection(), reserve, this._kaminoLendProgramId);
    if (reserveState === null) {
      return withdrawAndBlockReserveIxs;
    }
    const reserveWithAddress: ReserveWithAddress = {
      address: reserve,
      state: reserveState,
    };
    const reserveAllocationConfig = new ReserveAllocationConfig(reserveWithAddress, 0, new Decimal(0));

    const admin = vaultAdminAuthority ? vaultAdminAuthority : noopSigner(vaultState.vaultAdminAuthority);

    // update allocation to have 0 weight and 0 cap
    const updateAllocIxs = await this.updateReserveAllocationIxs(vault, reserveAllocationConfig, admin);

    const slot = await this.getConnection().getSlot().send();
    const vaultReservesMap = await this.loadVaultReserves(vaultState);
    const investIx = await this.buildCappedInvestIxsForReserves({
      payer: admin,
      vault,
      vaultState,
      slot,
      reserves: [reserve],
      vaultReservesMap,
    });
    withdrawAndBlockReserveIxs.updateReserveAllocationIxs = [updateAllocIxs.updateReserveAllocationIx];
    withdrawAndBlockReserveIxs.investIxs = investIx;

    return withdrawAndBlockReserveIxs;
  }

  /**
   * This method withdraws all the funds from all the reserves and blocks them from being invested by setting their weight and ctoken allocation to 0
   * @param vault - the vault to withdraw the invested funds from
   * @param slot - current slot used for reserve and vault calculations
   * @param [vaultReservesMap] - optional parameter to pass a map of the vault reserves. If not provided, the reserves will be loaded from the vault
   * @param [payer] - optional parameter to pass a different payer for the transaction. If not provided, the admin of the vault will be used; this is the payer for the invest ixs and it should have an ATA and some lamports (2x no_of_reserves) of the token vault
   * @returns - a struct with an instruction to update the reserve allocations (set weight and ctoken allocation to 0) and an a list of instructions to disinvest the funds in the reserves
   */
  async withdrawEverythingFromAllReservesAndBlockInvest(
    vault: KaminoVault,
    slot: Slot,
    vaultReservesMap: Map<Address, KaminoReserve>,
    payer?: TransactionSigner
  ): Promise<WithdrawAndBlockReserveIxs> {
    const vaultState = await vault.getState();

    const reserves = this.getVaultReserves(vaultState);
    const withdrawAndBlockReserveIxs: WithdrawAndBlockReserveIxs = {
      updateReserveAllocationIxs: [],
      investIxs: [],
    };
    const investPayer = payer ? payer : noopSigner(vaultState.vaultAdminAuthority);

    for (const reserve of reserves) {
      const reserveWithAddress: ReserveWithAddress = {
        address: reserve,
        state: vaultReservesMap.get(reserve)!.state,
      };
      const reserveAllocationConfig = new ReserveAllocationConfig(reserveWithAddress, 0, new Decimal(0));

      // update allocation to have 0 weight and 0 cap
      const updateAllocIxs = await this.updateReserveAllocationIxs(vault, reserveAllocationConfig, investPayer);
      withdrawAndBlockReserveIxs.updateReserveAllocationIxs.push(updateAllocIxs.updateReserveAllocationIx);
    }

    withdrawAndBlockReserveIxs.investIxs = await this.buildCappedInvestIxsForReserves({
      payer: investPayer,
      vault,
      vaultState,
      slot,
      reserves,
      vaultReservesMap,
    });

    return withdrawAndBlockReserveIxs;
  }

  /**
   * This method disinvests all the funds from all the reserves and set their weight to 0; for vaults that are managed by external bot/crank, the bot can change the weight and invest in the reserves again
   * @param vault - the vault to disinvest the invested funds from
   * @param slot - current slot used for reserve and vault calculations
   * @param [vaultReservesMap] - optional parameter to pass a map of the vault reserves. If not provided, the reserves will be loaded from the vault
   * @param [payer] - optional parameter to pass a different payer for the transaction. If not provided, the admin of the vault will be used; this is the payer for the invest ixs and it should have an ATA and some lamports (2x no_of_reserves) of the token vault
   * @returns - a struct with an instruction to update the reserve allocations to 0 weight and a list of instructions to disinvest the funds in the reserves
   */
  async disinvestAllReservesIxs(
    vault: KaminoVault,
    slot: Slot,
    vaultReservesMap: Map<Address, KaminoReserve>,
    payer?: TransactionSigner
  ): Promise<DisinvestAllReservesIxs> {
    const vaultState = await vault.getState();

    const reserves = this.getVaultReserves(vaultState);
    const disinvestAllReservesIxs: DisinvestAllReservesIxs = {
      updateReserveAllocationIxs: [],
      investIxs: [],
    };

    for (const reserve of reserves) {
      const reserveWithAddress: ReserveWithAddress = {
        address: reserve,
        state: vaultReservesMap.get(reserve)!.state,
      };
      const existingReserveAllocation = vaultState.vaultAllocationStrategy.find(
        (allocation) => allocation.reserve === reserve
      );
      if (!existingReserveAllocation) {
        continue;
      }
      const reserveAllocationConfig = new ReserveAllocationConfig(
        reserveWithAddress,
        0,
        lamportsToDecimal(
          new Decimal(existingReserveAllocation.tokenAllocationCap.toString()),
          reserveWithAddress.state.liquidity.mintDecimals.toNumber()
        )
      );

      // update allocation to have 0 weight and 0 cap
      const updateAllocIxs = await this.updateReserveAllocationIxs(vault, reserveAllocationConfig, payer);
      disinvestAllReservesIxs.updateReserveAllocationIxs.push(updateAllocIxs.updateReserveAllocationIx);
    }

    const investPayer = payer ? payer : noopSigner(vaultState.vaultAdminAuthority);
    disinvestAllReservesIxs.investIxs = await this.buildCappedInvestIxsForReserves({
      payer: investPayer,
      vault,
      vaultState,
      slot,
      reserves,
      vaultReservesMap,
    });

    return disinvestAllReservesIxs;
  }

  /**
   * This method removes a reserve from the vault allocation strategy if already part of the allocation strategy
   * @param vault - vault to remove the reserve from
   * @param reserve - reserve to remove from the vault allocation strategy
   * @param [vaultAdminAuthority] - vault admin - a noop vaultAdminAuthority is provided when absent for multisigs
   * @returns - an instruction to remove the reserve from the vault allocation strategy or undefined if the reserve is not part of the allocation strategy
   */
  async removeReserveFromAllocationIx(
    vault: KaminoVault,
    reserve: Address,
    vaultAdminAuthority?: TransactionSigner
  ): Promise<Instruction | undefined> {
    const vaultState = await vault.getState();
    const vaultAdmin = parseVaultAdmin(vaultState, vaultAdminAuthority);

    const reserveIsPartOfAllocation = vaultState.vaultAllocationStrategy.some(
      (allocation) => allocation.reserve === reserve
    );

    if (!reserveIsPartOfAllocation) {
      return undefined;
    }

    const accounts: RemoveAllocationAccounts = {
      vaultAdminAuthority: vaultAdmin,
      vaultState: vault.address,
      reserve,
    };

    return removeAllocation(accounts);
  }

  /**
   * Update a field of the vault. If the field is a pubkey it will return an extra instruction to add that account into the lookup table
   * @param vault the vault to update
   * @param mode the field to update (based on VaultConfigFieldKind enum)
   * @param value the value to update the field with
   * @param [adminAuthority] the signer of the transaction. Optional. If not provided the admin of the vault will be used. It should be used when changing the admin of the vault if we want to build or batch multiple ixs in the same tx.
   *        The global admin should be passed in when wanting to change the AllowAllocationsInWhitelistedReservesOnly or AllowInvestInWhitelistedReservesOnly fields to false
   * @param [lutIxsSigner] the signer of the transaction to be used for the lookup table instructions. Optional. If not provided the admin of the vault will be used. It should be used when changing the admin of the vault if we want to build or batch multiple ixs in the same tx
   * @param [skipLutUpdate] if true, the lookup table instructions will not be included in the returned instructions
   * @param errorOnOverride throw error if vault already has a farm
   * @param bypassConfigValidations if true, the config validations will not be performed
   * @returns a struct that contains the instruction to update the field and an optional list of instructions to update the lookup table
   */
  async updateVaultConfigIxs(
    vault: KaminoVault,
    mode: VaultConfigFieldKind,
    value: string,
    vaultReservesMap: Map<Address, KaminoReserve>,
    adminAuthority?: TransactionSigner,
    lutIxsSigner?: TransactionSigner,
    skipLutUpdate: boolean = false,
    errorOnOverride: boolean = true,
    bypassConfigValidations: boolean = false
  ): Promise<UpdateVaultConfigIxs> {
    const vaultState: VaultState = await vault.getState();
    const admin = parseVaultAdmin(vaultState, adminAuthority);

    const globalConfig = await getKvaultGlobalConfigPda(this._kaminoVaultProgramId);
    const updateVaultConfigAccs: UpdateVaultConfigAccounts = {
      signer: admin,
      globalConfig: globalConfig,
      vaultState: vault.address,
      klendProgram: this._kaminoLendProgramId,
    };

    if (mode.kind === new VaultConfigField.Farm().kind) {
      if (value != DEFAULT_PUBLIC_KEY && vaultState.vaultFarm != DEFAULT_PUBLIC_KEY) {
        if (errorOnOverride) {
          throw new Error('Vault already has a farm, if you want to override it set errorOnOverride to false');
        }
      }
    }

    if (mode.kind === new VaultConfigField.FirstLossCapitalFarm().kind) {
      if (value != DEFAULT_PUBLIC_KEY && vaultState.firstLossCapitalFarm != DEFAULT_PUBLIC_KEY) {
        if (errorOnOverride) {
          throw new Error(
            'Vault already has a first loss capital farm, if you want to override it set errorOnOverride to false'
          );
        }
      }
    }

    const updateVaultConfigArgs: UpdateVaultConfigArgs = {
      entry: mode,
      data: this.getValueForModeAsBuffer(mode, value),
    };

    if (!bypassConfigValidations) {
      await this.updateVaultConfigValidations(mode, value, vaultState);
    }

    const vaultReserves = this.getVaultReserves(vaultState);
    const vaultReservesState = vaultReservesMap;

    let updateVaultConfigIx = updateVaultConfig(
      updateVaultConfigArgs,
      updateVaultConfigAccs,
      undefined,
      this._kaminoVaultProgramId
    );
    updateVaultConfigIx = this.appendRemainingAccountsForVaultReserves(
      updateVaultConfigIx,
      vaultReserves,
      vaultReservesState
    );

    const updateLUTIxs: Instruction[] = [];
    const extraIxs: Instruction[] = [];

    if (mode.kind === new VaultConfigField.PendingVaultAdmin().kind) {
      const newPubkey = address(value);
      // Keep ownership-transfer side effects independent from LUT management.
      const farmsSDK = new Farms(this._rpc, this._farmsProgramId);
      if (vaultState.firstLossCapitalFarm !== DEFAULT_PUBLIC_KEY) {
        const updatePendingFlcFarmAdminIx = await farmsSDK.updateFarmConfigIx(
          admin,
          vaultState.firstLossCapitalFarm,
          DEFAULT_PUBLIC_KEY,
          FarmConfigOption.UpdatePendingFarmAdmin,
          newPubkey,
          undefined,
          undefined,
          true
        );
        extraIxs.push(updatePendingFlcFarmAdminIx);
      }

      if (!skipLutUpdate) {
        const lutIxsSignerAccount = lutIxsSigner ? lutIxsSigner : admin;
        const insertIntoLutIxs = await insertIntoLookupTableIxs(
          this.getConnection(),
          lutIxsSignerAccount,
          vaultState.vaultLookupTable,
          [newPubkey]
        );
        updateLUTIxs.push(...insertIntoLutIxs);
      }
    } else if (!skipLutUpdate) {
      const lutIxsSignerAccount = lutIxsSigner ? lutIxsSigner : admin;

      if (mode.kind === new VaultConfigField.Farm().kind) {
        const keysToAddToLUT = [address(value)];
        // if the farm already exists we also add its state-derived accounts to the LUT
        try {
          const farmState = await fetchFarmStateOrNull(this.getConnection(), keysToAddToLUT[0]);
          if (farmState) {
            keysToAddToLUT.push(
              farmState.farmVault,
              farmState.farmVaultsAuthority,
              farmState.token.mint,
              farmState.scopePrices,
              farmState.globalConfig
            );
          }
          const insertIntoLutIxs = await insertIntoLookupTableIxs(
            this.getConnection(),
            lutIxsSignerAccount,
            vaultState.vaultLookupTable,
            keysToAddToLUT
          );
          updateLUTIxs.push(...insertIntoLutIxs);
        } catch (error) {
          console.log(`Error updating LUT for farm ${keysToAddToLUT[0].toString()}`, error);
        }
      }
    }

    const updateVaultConfigIxs: UpdateVaultConfigIxs = {
      updateVaultConfigIx,
      updateLUTIxs,
      extraIxs,
    };

    return updateVaultConfigIxs;
  }

  /**
   * Update the vault performance fee (in bps).
   * @param vault - vault to update
   * @param feeBps - performance fee in basis points
   * @param [vaultAdminAuthority] - vault admin - a noop vaultAdminAuthority is provided when absent for multisigs
   * @returns - a struct containing the update instruction and optional LUT updates
   */
  async updateVaultPerfFeeIxs(
    vault: KaminoVault,
    feeBps: BN | number | string,
    vaultReservesMap: Map<Address, KaminoReserve>,
    vaultAdminAuthority?: TransactionSigner
  ): Promise<UpdateVaultConfigIxs> {
    return this.updateVaultConfigIxs(
      vault,
      new VaultConfigField.PerformanceFeeBps(),
      feeBps.toString(),
      vaultReservesMap,
      vaultAdminAuthority
    );
  }

  /**
   * Update the vault management fee (in bps).
   * @param vault - vault to update
   * @param feeBps - management fee in basis points
   * @param [vaultAdminAuthority] - vault admin - a noop vaultAdminAuthority is provided when absent for multisigs
   * @returns - a struct containing the update instruction and optional LUT updates
   */
  async updateVaultMgmtFeeIxs(
    vault: KaminoVault,
    feeBps: BN | number | string,
    vaultReservesMap: Map<Address, KaminoReserve>,
    vaultAdminAuthority?: TransactionSigner
  ): Promise<UpdateVaultConfigIxs> {
    return this.updateVaultConfigIxs(
      vault,
      new VaultConfigField.ManagementFeeBps(),
      feeBps.toString(),
      vaultReservesMap,
      vaultAdminAuthority
    );
  }

  /**
   * Update the rate at which the vault rewards are distributed to depositors (by increasing the share value).
   * If a stream is active, the accrual pending on-chain is settled at the old rate before the new rate applies; the new rate is never applied retroactively
   * @param vault - vault to update
   * @param rewardPerSecondLamports - reward rate, in token lamports per second
   * @param vaultReservesMap - preloaded reserve states for every reserve in the vault allocation
   * @param [vaultAdminAuthority] - vault admin - a noop vaultAdminAuthority is provided when absent for multisigs
   * @returns - a struct containing the update instruction and optional LUT updates
   */
  async setVaultRewardPerSecondIxs(
    vault: KaminoVault,
    rewardPerSecondLamports: BN,
    vaultReservesMap: Map<Address, KaminoReserve>,
    vaultAdminAuthority?: TransactionSigner
  ): Promise<UpdateVaultConfigIxs> {
    return this.updateVaultConfigIxs(
      vault,
      new VaultConfigField.RewardPerSecond(),
      rewardPerSecondLamports.toString(),
      vaultReservesMap,
      vaultAdminAuthority
    );
  }

  /**
   * Update the pending admin for the vault (step 1/2 of the ownership transfer).
   * @param vault - vault to update
   * @param newAdmin - new pending admin pubkey
   * @param [vaultAdminAuthority] - vault admin - a noop vaultAdminAuthority is provided when absent for multisigs
   * @param [lutIxsSigner] - signer for LUT updates when adding the new admin
   * @param [skipLutUpdate] - if true, the LUT update instructions are not returned
   * @returns - a struct containing the update instruction and optional LUT updates
   */
  async updateVaultPendingAdminIxs(
    vault: KaminoVault,
    newAdmin: Address,
    vaultReservesMap: Map<Address, KaminoReserve>,
    vaultAdminAuthority?: TransactionSigner,
    lutIxsSigner?: TransactionSigner,
    skipLutUpdate: boolean = false
  ): Promise<UpdateVaultConfigIxs> {
    return this.updateVaultConfigIxs(
      vault,
      new VaultConfigField.PendingVaultAdmin(),
      newAdmin,
      vaultReservesMap,
      vaultAdminAuthority,
      lutIxsSigner,
      skipLutUpdate
    );
  }

  /**
   * Update the vault name.
   * @param vault - vault to update
   * @param name - new vault name
   * @param [vaultAdminAuthority] - vault admin - a noop vaultAdminAuthority is provided when absent for multisigs
   * @returns - a struct containing the update instruction and optional LUT updates
   */
  async updateVaultNameIxs(
    vault: KaminoVault,
    name: string,
    vaultReservesMap: Map<Address, KaminoReserve>,
    vaultAdminAuthority?: TransactionSigner
  ): Promise<UpdateVaultConfigIxs> {
    return this.updateVaultConfigIxs(vault, new VaultConfigField.Name(), name, vaultReservesMap, vaultAdminAuthority);
  }

  /**
   * Update the vault lookup table address.
   * @param vault - vault to update
   * @param lookupTable - new LUT address
   * @param [vaultAdminAuthority] - vault admin - a noop vaultAdminAuthority is provided when absent for multisigs
   * @returns - a struct containing the update instruction and optional LUT updates
   */
  async updateVaultLookupTableIxs(
    vault: KaminoVault,
    lookupTable: Address,
    vaultReservesMap: Map<Address, KaminoReserve>,
    vaultAdminAuthority?: TransactionSigner
  ): Promise<UpdateVaultConfigIxs> {
    return this.updateVaultConfigIxs(
      vault,
      new VaultConfigField.LookupTable(),
      lookupTable,
      vaultReservesMap,
      vaultAdminAuthority
    );
  }

  /**
   * Update the vault allocation admin.
   * @param vault - vault to update
   * @param allocationAdmin - new allocation admin pubkey
   * @param [vaultAdminAuthority] - vault admin - a noop vaultAdminAuthority is provided when absent for multisigs
   * @returns - a struct containing the update instruction and optional LUT updates
   */
  async updateVaultAllocationAdminIxs(
    vault: KaminoVault,
    allocationAdmin: Address,
    vaultReservesMap: Map<Address, KaminoReserve>,
    vaultAdminAuthority?: TransactionSigner
  ): Promise<UpdateVaultConfigIxs> {
    return this.updateVaultConfigIxs(
      vault,
      new VaultConfigField.AllocationAdmin(),
      allocationAdmin,
      vaultReservesMap,
      vaultAdminAuthority
    );
  }

  /**
   * Update the vault unallocated weight.
   * @param vault - vault to update
   * @param unallocatedWeight - new unallocated weight
   * @param [vaultAdminAuthority] - vault admin - a noop vaultAdminAuthority is provided when absent for multisigs
   * @returns - a struct containing the update instruction and optional LUT updates
   */
  async updateVaultUnallocatedWeightIxs(
    vault: KaminoVault,
    unallocatedWeight: BN | number | string,
    vaultReservesMap: Map<Address, KaminoReserve>,
    vaultAdminAuthority?: TransactionSigner
  ): Promise<UpdateVaultConfigIxs> {
    return this.updateVaultConfigIxs(
      vault,
      new VaultConfigField.UnallocatedWeight(),
      unallocatedWeight.toString(),
      vaultReservesMap,
      vaultAdminAuthority
    );
  }

  /**
   * Update the vault unallocated tokens cap.
   * @param vault - vault to update
   * @param unallocatedTokensCap - new unallocated tokens cap, in vault-token lamports
   * @param [vaultAdminAuthority] - vault admin - a noop vaultAdminAuthority is provided when absent for multisigs
   * @returns - a struct containing the update instruction and optional LUT updates
   */
  async updateVaultUnallocatedTokensCapIxs(
    vault: KaminoVault,
    unallocatedTokensCap: BN | number | string,
    vaultReservesMap: Map<Address, KaminoReserve>,
    vaultAdminAuthority?: TransactionSigner
  ): Promise<UpdateVaultConfigIxs> {
    return this.updateVaultConfigIxs(
      vault,
      new VaultConfigField.UnallocatedTokensCap(),
      unallocatedTokensCap.toString(),
      vaultReservesMap,
      vaultAdminAuthority
    );
  }

  /**
   * Update the vault farm address.
   * @param vault - vault to update
   * @param farm - farm address
   * @param [errorOnOverride] - if true, it will throw if the vault already has a farm
   * @param [vaultAdminAuthority] - vault admin - a noop vaultAdminAuthority is provided when absent for multisigs
   * @param [lutIxsSigner] - signer for LUT updates when adding the farm
   * @param [skipLutUpdate] - if true, the LUT update instructions are not returned
   * @returns - a struct containing the update instruction and optional LUT updates
   */
  async updateVaultFarmIxs(
    vault: KaminoVault,
    farm: Address,
    vaultReservesMap: Map<Address, KaminoReserve>,
    errorOnOverride: boolean = true,
    vaultAdminAuthority?: TransactionSigner,
    lutIxsSigner?: TransactionSigner,
    skipLutUpdate: boolean = false
  ): Promise<UpdateVaultConfigIxs> {
    return this.updateVaultConfigIxs(
      vault,
      new VaultConfigField.Farm(),
      farm,
      vaultReservesMap,
      vaultAdminAuthority,
      lutIxsSigner,
      skipLutUpdate,
      errorOnOverride
    );
  }

  /**
   * Update the first loss capital farm address.
   * @param vault - vault to update
   * @param farm - farm address
   * @param [vaultAdminAuthority] - vault admin - a noop vaultAdminAuthority is provided when absent for multisigs
   * @returns - a struct containing the update instruction and optional LUT updates
   */
  async updateVaultFirstLossCapitalFarmIxs(
    vault: KaminoVault,
    farm: Address,
    vaultReservesMap: Map<Address, KaminoReserve>,
    vaultAdminAuthority?: TransactionSigner
  ): Promise<UpdateVaultConfigIxs> {
    return this.updateVaultConfigIxs(
      vault,
      new VaultConfigField.FirstLossCapitalFarm(),
      farm,
      vaultReservesMap,
      vaultAdminAuthority
    );
  }

  /**
   * Update the vault min deposit amount, in vault-token lamports.
   * @param vault - vault to update
   * @param minDepositAmount - new minimum deposit amount, in vault-token lamports
   * @param [vaultAdminAuthority] - vault admin - a noop vaultAdminAuthority is provided when absent for multisigs
   * @returns - a struct containing the update instruction and optional LUT updates
   */
  async updateVaultMinDepositAmountIxs(
    vault: KaminoVault,
    minDepositAmount: BN | number | string,
    vaultReservesMap: Map<Address, KaminoReserve>,
    vaultAdminAuthority?: TransactionSigner
  ): Promise<UpdateVaultConfigIxs> {
    return this.updateVaultConfigIxs(
      vault,
      new VaultConfigField.MinDepositAmount(),
      minDepositAmount.toString(),
      vaultReservesMap,
      vaultAdminAuthority
    );
  }

  /**
   * Update the vault min withdraw amount, in vault-token lamports.
   * @param vault - vault to update
   * @param minWithdrawAmount - new minimum withdraw amount, in vault-token lamports
   * @param [vaultAdminAuthority] - vault admin - a noop vaultAdminAuthority is provided when absent for multisigs
   * @returns - a struct containing the update instruction and optional LUT updates
   */
  async updateVaultMinWithdrawAmountIxs(
    vault: KaminoVault,
    minWithdrawAmount: BN | number | string,
    vaultReservesMap: Map<Address, KaminoReserve>,
    vaultAdminAuthority?: TransactionSigner
  ): Promise<UpdateVaultConfigIxs> {
    return this.updateVaultConfigIxs(
      vault,
      new VaultConfigField.MinWithdrawAmount(),
      minWithdrawAmount.toString(),
      vaultReservesMap,
      vaultAdminAuthority
    );
  }

  /**
   * Update the vault min invest amount, in vault-token lamports.
   * @param vault - vault to update
   * @param minInvestAmount - new minimum invest amount, in vault-token lamports
   * @param [vaultAdminAuthority] - vault admin - a noop vaultAdminAuthority is provided when absent for multisigs
   * @returns - a struct containing the update instruction and optional LUT updates
   */
  async updateVaultMinInvestAmountIxs(
    vault: KaminoVault,
    minInvestAmount: BN | number | string,
    vaultReservesMap: Map<Address, KaminoReserve>,
    vaultAdminAuthority?: TransactionSigner
  ): Promise<UpdateVaultConfigIxs> {
    return this.updateVaultConfigIxs(
      vault,
      new VaultConfigField.MinInvestAmount(),
      minInvestAmount.toString(),
      vaultReservesMap,
      vaultAdminAuthority
    );
  }

  /**
   * Update the vault min invest delay (in slots).
   * @param vault - vault to update
   * @param minInvestDelaySlots - new minimum invest delay in slots
   * @param [vaultAdminAuthority] - vault admin - a noop vaultAdminAuthority is provided when absent for multisigs
   * @returns - a struct containing the update instruction and optional LUT updates
   */
  async updateVaultMinInvestDelaySlotsIxs(
    vault: KaminoVault,
    minInvestDelaySlots: BN | number | string,
    vaultReservesMap: Map<Address, KaminoReserve>,
    vaultAdminAuthority?: TransactionSigner
  ): Promise<UpdateVaultConfigIxs> {
    return this.updateVaultConfigIxs(
      vault,
      new VaultConfigField.MinInvestDelaySlots(),
      minInvestDelaySlots.toString(),
      vaultReservesMap,
      vaultAdminAuthority
    );
  }

  /**
   * Update the vault crank fund fee per reserve (in lamports).
   * @param vault - vault to update
   * @param crankFundFeePerReserve - new fee per reserve
   * @param [vaultAdminAuthority] - vault admin - a noop vaultAdminAuthority is provided when absent for multisigs
   * @returns - a struct containing the update instruction and optional LUT updates
   */
  async updateVaultCrankFundFeePerReserveIxs(
    vault: KaminoVault,
    crankFundFeePerReserve: BN | number | string,
    vaultReservesMap: Map<Address, KaminoReserve>,
    vaultAdminAuthority?: TransactionSigner
  ): Promise<UpdateVaultConfigIxs> {
    return this.updateVaultConfigIxs(
      vault,
      new VaultConfigField.CrankFundFeePerReserve(),
      crankFundFeePerReserve.toString(),
      vaultReservesMap,
      vaultAdminAuthority
    );
  }

  /**
   * Update the vault withdrawal penalty (in lamports).
   * @param vault - vault to update
   * @param withdrawalPenaltyLamports - new withdrawal penalty amount
   * @param [vaultAdminAuthority] - vault admin - a noop vaultAdminAuthority is provided when absent for multisigs
   * @returns - a struct containing the update instruction and optional LUT updates
   */
  async updateVaultWithdrawalPenaltyLamportsIxs(
    vault: KaminoVault,
    withdrawalPenaltyLamports: BN | number | string,
    vaultReservesMap: Map<Address, KaminoReserve>,
    vaultAdminAuthority?: TransactionSigner
  ): Promise<UpdateVaultConfigIxs> {
    return this.updateVaultConfigIxs(
      vault,
      new VaultConfigField.WithdrawalPenaltyLamports(),
      withdrawalPenaltyLamports.toString(),
      vaultReservesMap,
      vaultAdminAuthority
    );
  }

  /**
   * Update the vault withdrawal penalty (in bps).
   * @param vault - vault to update
   * @param withdrawalPenaltyBps - new withdrawal penalty bps
   * @param [vaultAdminAuthority] - vault admin - a noop vaultAdminAuthority is provided when absent for multisigs
   * @returns - a struct containing the update instruction and optional LUT updates
   */
  async updateVaultWithdrawalPenaltyBpsIxs(
    vault: KaminoVault,
    withdrawalPenaltyBps: BN | number | string,
    vaultReservesMap: Map<Address, KaminoReserve>,
    vaultAdminAuthority?: TransactionSigner
  ): Promise<UpdateVaultConfigIxs> {
    return this.updateVaultConfigIxs(
      vault,
      new VaultConfigField.WithdrawalPenaltyBps(),
      withdrawalPenaltyBps.toString(),
      vaultReservesMap,
      vaultAdminAuthority
    );
  }

  /**
   * Update whether allocations are restricted to whitelisted reserves only.
   * @param vault - vault to update
   * @param allowWhitelistedOnly - true to restrict, false to allow any reserve
   * @param [adminAuthority] - signer; pass global admin when setting to false
   * @returns - a struct containing the update instruction and optional LUT updates
   */
  async updateVaultAllowAllocationsInWhitelistedReservesOnlyIxs(
    vault: KaminoVault,
    allowWhitelistedOnly: boolean | string,
    vaultReservesMap: Map<Address, KaminoReserve>,
    adminAuthority?: TransactionSigner
  ): Promise<UpdateVaultConfigIxs> {
    const value = typeof allowWhitelistedOnly === 'boolean' ? allowWhitelistedOnly.toString() : allowWhitelistedOnly;
    return this.updateVaultConfigIxs(
      vault,
      new VaultConfigField.AllowAllocationsInWhitelistedReservesOnly(),
      value,
      vaultReservesMap,
      adminAuthority
    );
  }

  /**
   * Update whether invest is restricted to whitelisted reserves only.
   * @param vault - vault to update
   * @param allowWhitelistedOnly - true to restrict, false to allow any reserve
   * @param [adminAuthority] - signer; pass global admin when setting to false
   * @returns - a struct containing the update instruction and optional LUT updates
   */
  async updateVaultAllowInvestInWhitelistedReservesOnlyIxs(
    vault: KaminoVault,
    allowWhitelistedOnly: boolean | string,
    vaultReservesMap: Map<Address, KaminoReserve>,
    adminAuthority?: TransactionSigner
  ): Promise<UpdateVaultConfigIxs> {
    const value = typeof allowWhitelistedOnly === 'boolean' ? allowWhitelistedOnly.toString() : allowWhitelistedOnly;
    return this.updateVaultConfigIxs(
      vault,
      new VaultConfigField.AllowInvestInWhitelistedReservesOnly(),
      value,
      vaultReservesMap,
      adminAuthority
    );
  }

  /**
   * Update the vault config validations
   * @param mode - the mode to update the vault config validations with
   * @param value - the value to update the vault config validations with
   * @param vaultState - the state of the vault
   * @returns - a promise that resolves to void
   */
  async updateVaultConfigValidations(mode: VaultConfigFieldKind, value: string, vaultState: VaultState) {
    if (
      mode.kind === new VaultConfigField.FirstLossCapitalFarm().kind ||
      mode.kind === new VaultConfigField.Farm().kind
    ) {
      const farmAddress = address(value);
      if (farmAddress === DEFAULT_PUBLIC_KEY) {
        return;
      }
      const farmState = await fetchFarmStateOrNull(this.getConnection(), farmAddress);
      if (!farmState) {
        throw new Error(`Farm ${farmAddress.toString()} not found for FirstLossCapitalFarm`);
      }
      if (
        mode.kind === new VaultConfigField.FirstLossCapitalFarm().kind &&
        !(await this.isFlcFarmValid(farmState, vaultState))
      ) {
        throw new Error(`Farm ${farmAddress.toString()} is not valid for FirstLossCapitalFarm`);
      }
    }
  }
  /**
   * Add or update a reserve whitelist entry. This controls whether the reserve is whitelisted for adding/updating
   * allocations or for invest, depending on the mode parameter.
   *
   * @param reserve - Address of the reserve to whitelist
   * @param mode - The whitelist mode: either 'Invest' or 'AddAllocation' with a value (1 = allow, 0 = deny)
   * @param globalAdmin - The global admin that signs the transaction
   * @returns - An instruction to add/update the whitelisted reserve
   */
  async addUpdateWhitelistedReserveIx(
    reserve: Address,
    mode: UpdateReserveWhitelistModeKind,
    globalAdmin: TransactionSigner
  ): Promise<Instruction> {
    const globalConfig = await getKvaultGlobalConfigPda(this._kaminoVaultProgramId);
    const reserveWhitelistEntry = await getReserveWhitelistEntryPda(reserve, this._kaminoVaultProgramId);

    const accounts: AddUpdateWhitelistedReserveAccounts = {
      globalAdmin,
      globalConfig,
      reserve,
      reserveWhitelistEntry,
      systemProgram: SYSTEM_PROGRAM_ADDRESS,
    };

    const args: AddUpdateWhitelistedReserveArgs = {
      update: mode,
    };

    return addUpdateWhitelistedReserve(args, accounts, undefined, this._kaminoVaultProgramId);
  }

  /** Sets the farm where the shares can be staked. This is store in vault state and a vault can only have one farm, so the new farm will ovveride the old farm
   * @param vault - vault to set the farm for
   * @param farm - the farm where the vault shares can be staked
   * @param [errorOnOverride] - if true, the function will throw an error if the vault already has a farm. If false, it will override the farm
   * @param [vaultAdminAuthority] - vault admin - a noop vaultAdminAuthority is provided when absent for multisigs
   * @param [lutIxsSigner] - the signer of the transaction to be used for the lookup table instructions. Optional. If not provided the admin of the vault will be used. It should be used when changing the admin of the vault if we want to build or batch multiple ixs in the same tx
   * @param [skipLutUpdate] - if true, the lookup table instructions will not be included in the returned instructions
   * @returns - a struct that contains the instruction to update the farm and an optional list of instructions to update the lookup table
   */
  async setVaultFarmIxs(
    vault: KaminoVault,
    farm: Address,
    vaultReservesMap: Map<Address, KaminoReserve>,
    errorOnOverride: boolean = true,
    vaultAdminAuthority?: TransactionSigner,
    lutIxsSigner?: TransactionSigner,
    skipLutUpdate: boolean = false
  ): Promise<UpdateVaultConfigIxs> {
    const vaultHasFarm = await vault.hasFarm();
    if (vaultHasFarm && errorOnOverride) {
      throw new Error('Vault already has a farm, if you want to override it set errorOnOverride to false');
    }
    return this.updateVaultConfigIxs(
      vault,
      new VaultConfigField.Farm(),
      farm,
      vaultReservesMap,
      vaultAdminAuthority,
      lutIxsSigner,
      skipLutUpdate,
      errorOnOverride
    );
  }

  /**
   * This method updates the vault config during vault initialization, within the same transaction
   * where the vault is created. Use this when the vault state is not yet committed to the chain
   * and cannot be fetched via RPC. For updates to existing vaults, use updateVaultConfigIxs instead.
   *
   * @param admin - the admin that signs the transaction
   * @param vault - address of vault to be updated
   * @param mode - the field to be updated
   * @param value - the new value for the field to be updated (number or pubkey)
   * @returns - an instruction to update the vault config
   */
  private async updateUninitialisedVaultConfigIx(
    admin: TransactionSigner,
    vault: Address,
    mode: VaultConfigFieldKind,
    value: string
  ): Promise<Instruction> {
    const globalConfig = await getKvaultGlobalConfigPda(this._kaminoVaultProgramId);
    const updateVaultConfigAccs: UpdateVaultConfigAccounts = {
      signer: admin,
      globalConfig: globalConfig,
      vaultState: vault,
      klendProgram: this._kaminoLendProgramId,
    };

    const updateVaultConfigArgs: UpdateVaultConfigArgs = {
      entry: mode,
      data: this.getValueForModeAsBuffer(mode, value),
    };

    const updateVaultConfigIx = updateVaultConfig(
      updateVaultConfigArgs,
      updateVaultConfigAccs,
      undefined,
      this._kaminoVaultProgramId
    );

    return updateVaultConfigIx;
  }

  /**
   * This function creates the instruction for the `pendingAdmin` of the vault to accept to become the owner of the vault (step 2/2 of the ownership transfer)
   * @param vault - vault to change the ownership for
   * @param [pendingAdmin] - pending vault admin - a noop vaultAdminAuthority is provided when absent for multisigs
   * @returns - an instruction to accept the ownership of the vault and a list of instructions to update the lookup table
   */
  async acceptVaultOwnershipIxs(
    vault: KaminoVault,
    vaultReservesMap: Map<Address, KaminoReserve>,
    pendingAdmin?: TransactionSigner
  ): Promise<AcceptVaultOwnershipIxs> {
    const vaultState: VaultState = await vault.getState();
    const signer = parseVaultPendingAdmin(vaultState, pendingAdmin);
    let acceptFLCFarmOwnershipIx: Instruction | undefined = undefined;

    const acceptOwneshipAccounts: UpdateAdminAccounts = {
      pendingAdmin: signer,
      vaultState: vault.address,
    };

    const acceptVaultOwnershipIx = updateAdmin(acceptOwneshipAccounts, undefined, this._kaminoVaultProgramId);

    if (vaultState.firstLossCapitalFarm !== DEFAULT_PUBLIC_KEY) {
      const flcFarmState = await fetchFarmStateOrNull(this.getConnection(), vaultState.firstLossCapitalFarm);
      if (flcFarmState && flcFarmState.pendingFarmAdmin === vaultState.pendingAdmin) {
        const farmsSDK = new Farms(this._rpc, this._farmsProgramId);
        acceptFLCFarmOwnershipIx = await farmsSDK.updateFarmAdminIx(signer, vaultState.firstLossCapitalFarm);
      }
    }

    // read the current LUT and create a new one for the new admin and backfill it
    const accountsInExistentLUT = (await getAccountsInLut(this.getConnection(), vaultState.vaultLookupTable)).filter(
      (account) => account !== vaultState.vaultAdminAuthority
    );

    const lutIxs: Instruction[] = [];
    const [initNewLutIx, newLut] = await initLookupTableIx(
      signer,
      await this.getConnection().getSlot({ commitment: 'finalized' }).send()
    );

    const insertIntoLUTIxs = await insertIntoLookupTableIxs(
      this.getConnection(),
      signer,
      newLut,
      accountsInExistentLUT,
      []
    );

    lutIxs.push(...insertIntoLUTIxs);

    const updateVaultConfigIxs = await this.updateVaultConfigIxs(
      vault,
      new VaultConfigField.LookupTable(),
      newLut.toString(),
      vaultReservesMap,
      signer
    );
    lutIxs.push(updateVaultConfigIxs.updateVaultConfigIx);
    lutIxs.push(...updateVaultConfigIxs.updateLUTIxs);

    const acceptVaultOwnershipIxs: AcceptVaultOwnershipIxs = {
      acceptVaultOwnershipIx,
      acceptFLCFarmOwnershipIx,
      initNewLUTIx: initNewLutIx,
      updateLUTIxs: lutIxs,
    };

    return acceptVaultOwnershipIxs;
  }

  /**
   * This function creates the instruction for the admin to give up a part of the pending fees (which will be accounted as part of the vault)
   * @param vault - vault to give up pending fees for
   * @param maxAmountToGiveUp - the maximum amount of fees to give up, in tokens
   * @param [vaultAdminAuthority] - vault admin - a noop vaultAdminAuthority is provided when absent for multisigs
   * @returns - an instruction to give up the specified pending fees
   */
  async giveUpPendingFeesIx(
    vault: KaminoVault,
    maxAmountToGiveUp: Decimal,
    vaultAdminAuthority?: TransactionSigner
  ): Promise<Instruction> {
    const vaultState: VaultState = await vault.getState();
    const vaultAdmin = parseVaultAdmin(vaultState, vaultAdminAuthority);

    const giveUpPendingFeesAccounts: GiveUpPendingFeesAccounts = {
      vaultAdminAuthority: vaultAdmin,
      vaultState: vault.address,
      klendProgram: this._kaminoLendProgramId,
    };

    const maxAmountToGiveUpLamports = numberToLamportsDecimal(
      maxAmountToGiveUp,
      vaultState.tokenMintDecimals.toNumber()
    );
    const giveUpPendingFeesArgs: GiveUpPendingFeesArgs = {
      maxAmountToGiveUp: new BN(maxAmountToGiveUpLamports.toString()),
    };

    return giveUpPendingFees(giveUpPendingFeesArgs, giveUpPendingFeesAccounts, undefined, this._kaminoVaultProgramId);
  }

  /**
   * This method withdraws all the pending fees from the vault to the owner's token ATA
   * @param vault - vault for which the admin withdraws the pending fees
   * @param currentSlot - current slot, used to estimate the interest earned in the different reserves with allocation from the vault
   * @param [vaultReservesMap] - a hashmap from each reserve pubkey to the reserve state. Optional. If provided the function will be significantly faster as it will not have to fetch the reserves
   * @param [vaultAdminAuthority] - vault admin - a noop vaultAdminAuthority is provided when absent for multisigs
   * @returns - list of instructions to withdraw all pending fees, including the ATA creation instructions if needed
   */
  async withdrawPendingFeesIxs(
    vault: KaminoVault,
    currentSlot: Slot,
    vaultReservesMap: Map<Address, KaminoReserve>,
    vaultAdminAuthority?: TransactionSigner
  ): Promise<Instruction[]> {
    const slot = currentSlot;
    const vaultState: VaultState = await vault.getState();
    const vaultAdmin = parseVaultAdmin(vaultState, vaultAdminAuthority);
    const vaultReservesState = vaultReservesMap;
    const [{ ata: adminTokenAta, createAtaIx }] = await createAtasIdempotent(vaultAdmin, [
      {
        mint: vaultState.tokenMint,
        tokenProgram: vaultState.tokenProgram,
      },
    ]);

    const tokensToWithdraw = new Fraction(vaultState.pendingFeesSf).toDecimal();
    let tokenLeftToWithdraw = tokensToWithdraw;
    tokenLeftToWithdraw = tokenLeftToWithdraw.sub(new Decimal(vaultState.tokenAvailable.toString()));
    const reservesToWithdraw: Address[] = [];

    if (tokenLeftToWithdraw.lte(0)) {
      // Availabe enough to withdraw all - using first reserve as it does not matter
      reservesToWithdraw.push(vaultState.vaultAllocationStrategy[0].reserve);
    } else {
      // Get decreasing order sorted available liquidity to withdraw from each reserve allocated to
      const reserveAllocationAvailableLiquidityToWithdraw = await this.getReserveAllocationAvailableLiquidityToWithdraw(
        vaultState,
        slot,
        vaultReservesState
      );
      // sort
      const reserveAllocationAvailableLiquidityToWithdrawSorted = new Map(
        [...reserveAllocationAvailableLiquidityToWithdraw.entries()].sort((a, b) => b[1].sub(a[1]).toNumber())
      );

      reserveAllocationAvailableLiquidityToWithdrawSorted.forEach((availableLiquidityToWithdraw, key) => {
        if (tokenLeftToWithdraw.gt(0)) {
          reservesToWithdraw.push(key);
          tokenLeftToWithdraw = tokenLeftToWithdraw.sub(availableLiquidityToWithdraw);
        }
      });
    }

    const reserveStates = await Reserve.fetchMultiple(
      this.getConnection(),
      reservesToWithdraw,
      this._kaminoLendProgramId
    );
    const withdrawIxs: Instruction[] = await Promise.all(
      reservesToWithdraw.map(async (reserve, index) => {
        if (reserveStates[index] === null) {
          throw new Error(`Reserve ${reserve} not found`);
        }

        const reserveState = reserveStates[index]!;
        const marketAddress = reserveState.lendingMarket;

        return this.withdrawPendingFeesIx(
          vaultAdmin,
          vault,
          vaultState,
          marketAddress,
          { address: reserve, state: reserveState },
          adminTokenAta,
          vaultReservesMap
        );
      })
    );

    return [createAtaIx, ...withdrawIxs];
  }

  /**
   * This function creates instructions to top up the vault rewards to be distributed to depositors. Anyone can top up rewards.
   * If the reward rate is set but the rewards were depleted (paused stream), streaming resumes from the topup time; the depleted period is not distributed retroactively
   * @param payer - the signer paying the reward tokens
   * @param vault - vault to top up rewards for (if the state is not provided, it will be fetched)
   * @param tokenAmount - token amount to top up, in decimals (will be converted in lamports)
   * @returns - a struct with the prerequisite instructions (payer token ATA creation and wSOL wrapping if the vault token is wSOL), the topup instructions and the cleanup instructions (wSOL ATA close)
   */
  async topupVaultRewardsIxs(
    payer: TransactionSigner,
    vault: KaminoVault,
    tokenAmount: Decimal
  ): Promise<TopupVaultRewardsIxs> {
    return buildTopupVaultRewardsIxs(this._kaminoVaultProgramId, payer, vault, tokenAmount);
  }

  /**
   * This function creates instructions for the vault admin to withdraw rewards which were not distributed yet to the admin token ATA. The amount is capped on-chain at the undistributed rewards
   * @param vault - vault to withdraw the rewards from (if the state is not provided, it will be fetched)
   * @param tokenAmount - token amount to withdraw, in decimals (will be converted in lamports)
   * @param [vaultAdminAuthority] - vault admin - a noop vaultAdminAuthority is provided when absent for multisigs
   * @returns - a struct with the prerequisite instructions (admin token ATA creation), the withdraw instructions and the cleanup instructions (wSOL ATA close to unwrap the rewards if the vault token is wSOL)
   */
  async withdrawVaultRewardsIxs(
    vault: KaminoVault,
    tokenAmount: Decimal,
    vaultAdminAuthority?: TransactionSigner
  ): Promise<WithdrawVaultRewardsIxs> {
    return buildWithdrawVaultRewardsIxs(this._kaminoVaultProgramId, vault, tokenAmount, vaultAdminAuthority);
  }

  // async closeVaultIx(vault: KaminoVault): Promise<Instruction> {
  //   const vaultState: VaultState = await vault.getState(this.getConnection());

  //   const closeVaultAccounts: CloseVaultAccounts = {
  //     adminAuthority: vaultState.adminAuthority,
  //     vaultState: vault.address,
  //   };

  //   return closeVault(closeVaultAccounts, this._kaminoVaultProgramId);
  // }

  /**
   * This function creates instructions to deposit into a vault. It will also create ATA creation instructions for the vault shares that the user receives in return
   * @param user - user to deposit
   * @param vault - vault to deposit into (if the state is not provided, it will be fetched)
   * @param tokenAmount - token amount to be deposited, in decimals (will be converted in lamports)
   * @param vaultReservesMap - preloaded reserve states for every reserve in the vault allocation
   * @param farmState - preloaded vault farm state; provide this to stake into the vault farm
   * @param flcFarmState - preloaded first loss capital farm state; provide this to stake into the first loss capital farm
   * Pass only one of `farmState` or `flcFarmState`, depending on whether you want vault-farm or first loss capital farm behavior. Pass neither to skip staking.
   * @param [memo] - optional memo string to append as a memo SPL instruction
   * @param [minSharesOut] - optional minimum amount of shares to receive, in decimals (will be converted in lamports); if provided the deposit reverts on-chain unless at least this many shares are minted
   * @returns - Deposit instructions plus stake instructions for exactly one selected farm, or none
   */
  async depositIxs(
    user: TransactionSigner,
    vault: KaminoVault,
    tokenAmount: Decimal,
    vaultReservesMap: Map<Address, KaminoReserve>,
    farmState: FarmState | null,
    flcFarmState: FarmState | null,
    payer?: TransactionSigner,
    memo?: string,
    minSharesOut?: Decimal
  ): Promise<DepositIxs> {
    return this.buildShareEntryIxs(
      'deposit',
      user,
      vault,
      tokenAmount,
      vaultReservesMap,
      farmState,
      flcFarmState,
      payer,
      memo,
      minSharesOut
    );
  }

  async buySharesIxs(
    user: TransactionSigner,
    vault: KaminoVault,
    tokenAmount: Decimal,
    vaultReservesMap: Map<Address, KaminoReserve>,
    farmState: FarmState | null,
    flcFarmState: FarmState | null,
    payer?: TransactionSigner,
    minSharesOut?: Decimal
  ): Promise<DepositIxs> {
    return this.buildShareEntryIxs(
      'buy',
      user,
      vault,
      tokenAmount,
      vaultReservesMap,
      farmState,
      flcFarmState,
      payer,
      undefined,
      minSharesOut
    );
  }

  private async buildShareEntryIxs(
    mode: 'deposit' | 'buy',
    user: TransactionSigner,
    vault: KaminoVault,
    tokenAmount: Decimal,
    vaultReservesMap: Map<Address, KaminoReserve>,
    farmState: FarmState | null,
    flcFarmState: FarmState | null,
    payer?: TransactionSigner,
    memo?: string,
    minSharesOut?: Decimal
  ): Promise<DepositIxs> {
    if (minSharesOut !== undefined && minSharesOut.isNegative()) {
      throw new Error(`Invalid minSharesOut ${minSharesOut}, it cannot be negative`);
    }
    const vaultState = await vault.getState();
    const selectedFarm = this.resolveSelectedSharesFarm(vaultState, farmState, flcFarmState);

    const tokenProgramID = vaultState.tokenProgram;
    const userTokenAta = await getAssociatedTokenAddress(vaultState.tokenMint, user.address, tokenProgramID);
    const createAtasIxs: Instruction[] = [];
    const closeAtasIxs: Instruction[] = [];
    if (vaultState.tokenMint === WRAPPED_SOL_MINT) {
      const [{ ata: wsolAta, createAtaIx: createWsolAtaIxn }] = await createAtasIdempotent(
        user,
        [
          {
            mint: WRAPPED_SOL_MINT,
            tokenProgram: tokenProgramID,
          },
        ],
        payer
      );
      createAtasIxs.push(createWsolAtaIxn);
      const transferWsolIxs = getTransferWsolIxs(
        user,
        wsolAta,
        lamports(
          BigInt(numberToLamportsDecimal(tokenAmount, vaultState.tokenMintDecimals.toNumber()).ceil().toString())
        ),
        tokenProgramID
      );
      createAtasIxs.push(...transferWsolIxs);
    }

    const [{ ata: userSharesAta, createAtaIx: createSharesAtaIxs }] = await createAtasIdempotent(
      user,
      [
        {
          mint: vaultState.sharesMint,
          tokenProgram: TOKEN_PROGRAM_ADDRESS,
        },
      ],
      payer
    );
    createAtasIxs.push(createSharesAtaIxs);

    const eventAuthority = await getEventAuthorityPda(this._kaminoVaultProgramId);
    const tokenAmountLamports = numberToLamportsDecimal(tokenAmount, vaultState.tokenMintDecimals.toNumber()).floor();
    const minSharesOutLamports =
      minSharesOut !== undefined
        ? new BN(numberToLamportsDecimal(minSharesOut, vaultState.sharesMintDecimals.toNumber()).floor().toString())
        : undefined;
    let entryIx: Instruction;
    if (mode === 'deposit') {
      const depositAccounts: DepositAccounts = {
        user,
        vaultState: vault.address,
        tokenVault: vaultState.tokenVault,
        tokenMint: vaultState.tokenMint,
        baseVaultAuthority: vaultState.baseVaultAuthority,
        sharesMint: vaultState.sharesMint,
        userTokenAta,
        userSharesAta,
        tokenProgram: tokenProgramID,
        klendProgram: this._kaminoLendProgramId,
        sharesTokenProgram: TOKEN_PROGRAM_ADDRESS,
        eventAuthority,
        program: this._kaminoVaultProgramId,
      };
      if (minSharesOutLamports !== undefined) {
        const depositArgs: DepositWithMinSharesOutArgs = {
          // Generated IDL arg name; value is in vault-token lamports.
          maxAmount: new BN(tokenAmountLamports.toString()),
          minSharesOut: minSharesOutLamports,
        };
        entryIx = depositWithMinSharesOut(depositArgs, depositAccounts, undefined, this._kaminoVaultProgramId);
      } else {
        const depositArgs: DepositArgs = {
          // Generated IDL arg name; value is in vault-token lamports.
          maxAmount: new BN(tokenAmountLamports.toString()),
        };
        entryIx = deposit(depositArgs, depositAccounts, undefined, this._kaminoVaultProgramId);
      }
    } else {
      const buyAccounts: BuyAccounts = {
        user,
        vaultState: vault.address,
        tokenVault: vaultState.tokenVault,
        tokenMint: vaultState.tokenMint,
        baseVaultAuthority: vaultState.baseVaultAuthority,
        sharesMint: vaultState.sharesMint,
        userTokenAta,
        userSharesAta,
        tokenProgram: tokenProgramID,
        klendProgram: this._kaminoLendProgramId,
        sharesTokenProgram: TOKEN_PROGRAM_ADDRESS,
        eventAuthority,
        program: this._kaminoVaultProgramId,
      };
      if (minSharesOutLamports !== undefined) {
        const buyArgs: BuyWithMinSharesOutArgs = {
          // Generated IDL arg name; value is in vault-token lamports.
          maxAmount: new BN(tokenAmountLamports.toString()),
          minSharesOut: minSharesOutLamports,
        };
        entryIx = buyWithMinSharesOut(buyArgs, buyAccounts, undefined, this._kaminoVaultProgramId);
      } else {
        const buyArgs: BuyArgs = {
          // Generated IDL arg name; value is in vault-token lamports.
          maxAmount: new BN(tokenAmountLamports.toString()),
        };
        entryIx = buy(buyArgs, buyAccounts, undefined, this._kaminoVaultProgramId);
      }
    }

    const vaultReserves = this.getVaultReserves(vaultState);
    entryIx = this.appendRemainingAccountsForVaultReserves(entryIx, vaultReserves, vaultReservesMap);

    const result: DepositIxs = {
      depositIxs: [...createAtasIxs, entryIx, ...closeAtasIxs],
      stakeInFarmIfNeededIxs: [],
      stakeInFlcFarmIfNeededIxs: [],
    };

    if (memo) {
      result.depositIxs.unshift(getAddMemoInstruction({ memo, signers: [user] }));
    }

    if (selectedFarm && !selectedFarm.isFlcFarm) {
      const stakeSharesIxs = await this.stakeSharesIxs(user, vault, undefined, selectedFarm.farmState);
      result.stakeInFarmIfNeededIxs = stakeSharesIxs;
    }
    if (selectedFarm?.isFlcFarm) {
      const stakeSharesInFlcFarmIxs = await this.stakeSharesInFlcFarmIxs(
        user,
        vault,
        undefined,
        selectedFarm.farmState
      );
      result.stakeInFlcFarmIfNeededIxs = stakeSharesInFlcFarmIxs;
    }
    return result;
  }

  /**
   * Returns the accounts needed for a vault deposit instruction, without building the instruction itself.
   * Includes the deposit accounts, the remaining accounts for vault reserves, and optionally the stake shares instructions if the vault has a farm.
   * @param user - the user depositing into the vault
   * @param vault - the vault to deposit into
   * @param vaultReservesMap - preloaded reserve states for every reserve in the vault allocation
   * @param farmState - preloaded vault farm state; provide this to stake into the vault farm
   * @param flcFarmState - preloaded first loss capital farm state; provide this to stake into the first loss capital farm
   * Pass only one of `farmState` or `flcFarmState`, depending on whether you want vault-farm or first loss capital farm behavior. Pass neither to skip staking.
   * @returns the deposit accounts, remaining accounts, and optional stake shares instructions for exactly one selected farm
   */
  async getDepositAccounts(
    user: TransactionSigner,
    vault: KaminoVault,
    vaultReservesMap: Map<Address, KaminoReserve>,
    farmState: FarmState | null,
    flcFarmState: FarmState | null
  ): Promise<AllDepositAccounts> {
    const vaultState = await vault.getState();
    const selectedFarm = this.resolveSelectedSharesFarm(vaultState, farmState, flcFarmState);
    const tokenProgramID = vaultState.tokenProgram;
    const userTokenAta = await getAssociatedTokenAddress(vaultState.tokenMint, user.address, tokenProgramID);
    const userSharesAta = await getAssociatedTokenAddress(vaultState.sharesMint, user.address);
    const eventAuthority = await getEventAuthorityPda(this._kaminoVaultProgramId);

    const depositAccounts: DepositAccounts = {
      user,
      vaultState: vault.address,
      tokenVault: vaultState.tokenVault,
      tokenMint: vaultState.tokenMint,
      baseVaultAuthority: vaultState.baseVaultAuthority,
      sharesMint: vaultState.sharesMint,
      userTokenAta,
      userSharesAta,
      tokenProgram: tokenProgramID,
      klendProgram: this._kaminoLendProgramId,
      sharesTokenProgram: TOKEN_PROGRAM_ADDRESS,
      eventAuthority,
      program: this._kaminoVaultProgramId,
    };

    const vaultReserves = this.getVaultReserves(vaultState);
    const remainingAccounts = this.buildRemainingAccountsForVaultReserves(vaultReserves, vaultReservesMap);

    const result: AllDepositAccounts = {
      depositAccounts,
      remainingAccounts,
    };

    if (selectedFarm && !selectedFarm.isFlcFarm) {
      const stakeSharesIxs = await this.stakeSharesIxs(user, vault, undefined, selectedFarm.farmState);
      result.stakeSharesIxs = stakeSharesIxs;
    }
    if (selectedFarm?.isFlcFarm) {
      const stakeInFlcFarmIxs = await this.stakeSharesInFlcFarmIxs(user, vault, undefined, selectedFarm.farmState);
      result.stakeInFlcFarmIxs = stakeInFlcFarmIxs;
    }

    return result;
  }

  /**
   * Returns the accounts needed for a vault withdraw instruction, without building the instruction itself.
   * If a reserve is provided, builds the full WithdrawAccounts (withdraw from reserve). Otherwise builds WithdrawFromAvailableAccounts (withdraw from available liquidity only).
   * Also includes remaining accounts for vault reserves and optionally the unstake instructions if the vault has a farm.
   * @param user - the user withdrawing from the vault
   * @param vault - the vault to withdraw from
   * @param [reserve] - optional reserve to withdraw from; if omitted, builds accounts for withdrawing from available liquidity only
   * @param vaultReservesMap - preloaded reserve states for every reserve in the vault allocation
   * @param farmState - preloaded vault farm state; provide this to unstake from the vault farm
   * @param flcFarmState - preloaded first loss capital farm state; provide this to unstake from the first loss capital farm
   * Pass only one of `farmState` or `flcFarmState`, depending on whether you want vault-farm or first loss capital farm behavior. Pass neither to skip unstaking.
   * @returns the withdraw accounts, remaining accounts, and optional unstake shares instructions
   */
  async getWithdrawAccounts(
    user: TransactionSigner,
    vault: KaminoVault,
    reserve: ReserveWithAddress | undefined,
    vaultReservesMap: Map<Address, KaminoReserve>,
    farmState: FarmState | null,
    flcFarmState: FarmState | null
  ): Promise<AllWithdrawAccounts> {
    const vaultState = await vault.getState();
    const selectedFarm = this.resolveSelectedSharesFarm(vaultState, farmState, flcFarmState);
    const userTokenAta = await getAssociatedTokenAddress(vaultState.tokenMint, user.address, vaultState.tokenProgram);
    const userSharesAta = await getAssociatedTokenAddress(vaultState.sharesMint, user.address);

    const globalConfig = await getKvaultGlobalConfigPda(this._kaminoVaultProgramId);
    const eventAuthority = await getEventAuthorityPda(this._kaminoVaultProgramId);

    let withdrawAccounts: WithdrawAccounts | WithdrawFromAvailableAccounts;

    if (reserve) {
      const marketAddress = reserve.state.lendingMarket;
      const [lendingMarketAuth] = await lendingMarketAuthPda(marketAddress, this._kaminoLendProgramId);

      withdrawAccounts = {
        withdrawFromAvailable: {
          user,
          vaultState: vault.address,
          globalConfig,
          tokenVault: vaultState.tokenVault,
          baseVaultAuthority: vaultState.baseVaultAuthority,
          userTokenAta,
          tokenMint: vaultState.tokenMint,
          userSharesAta,
          sharesMint: vaultState.sharesMint,
          tokenProgram: vaultState.tokenProgram,
          sharesTokenProgram: TOKEN_PROGRAM_ADDRESS,
          klendProgram: this._kaminoLendProgramId,
          eventAuthority,
          program: this._kaminoVaultProgramId,
        },
        withdrawFromReserveAccounts: {
          vaultState: vault.address,
          reserve: reserve.address,
          ctokenVault: await getCTokenVaultPda(vault.address, reserve.address, this._kaminoVaultProgramId),
          lendingMarket: marketAddress,
          lendingMarketAuthority: lendingMarketAuth,
          reserveLiquiditySupply: reserve.state.liquidity.supplyVault,
          reserveCollateralMint: reserve.state.collateral.mintPubkey,
          reserveCollateralTokenProgram: TOKEN_PROGRAM_ADDRESS,
          instructionSysvarAccount: SYSVAR_INSTRUCTIONS_ADDRESS,
        },
        eventAuthority,
        program: this._kaminoVaultProgramId,
      } as WithdrawAccounts;
    } else {
      withdrawAccounts = {
        user,
        vaultState: vault.address,
        globalConfig,
        tokenVault: vaultState.tokenVault,
        baseVaultAuthority: vaultState.baseVaultAuthority,
        userTokenAta,
        tokenMint: vaultState.tokenMint,
        userSharesAta,
        sharesMint: vaultState.sharesMint,
        tokenProgram: vaultState.tokenProgram,
        sharesTokenProgram: TOKEN_PROGRAM_ADDRESS,
        klendProgram: this._kaminoLendProgramId,
        eventAuthority,
        program: this._kaminoVaultProgramId,
      } as WithdrawFromAvailableAccounts;
    }

    const vaultReserves = this.getVaultReserves(vaultState);
    const remainingAccounts = this.buildRemainingAccountsForVaultReserves(vaultReserves, vaultReservesMap);

    const result: AllWithdrawAccounts = {
      withdrawAccounts,
      remainingAccounts,
    };

    if (selectedFarm) {
      const unstakeIxs = await getFarmUnstakeAndWithdrawIxs(
        this.getConnection(),
        user,
        new Decimal(U64_MAX.toString()),
        selectedFarm.farmAddress,
        selectedFarm.farmState
      );
      result.unstakeSharesIxs = [unstakeIxs.unstakeIx, unstakeIxs.withdrawIx];
    }

    return result;
  }

  /**
   * This function creates instructions to stake the shares in the vault farm if the vault has a configured vault farm
   * @param user - user to stake
   * @param vault - vault to deposit into its farm (if the state is not provided, it will be fetched)
   * @param [sharesAmount] - token amount to be deposited, in decimals (will be converted in lamports). Optional. If not provided, the user's share balance will be used
   * @param farmState - preloaded vault farm state; required when the vault has a configured vault farm
   * @returns - a list of instructions for the user to stake shares into the vault's farm, including the creation of prerequisite accounts if needed
   */
  async stakeSharesIxs(
    user: TransactionSigner,
    vault: KaminoVault,
    sharesAmount: Decimal | undefined,
    farmState: FarmState
  ): Promise<Instruction[]> {
    const vaultState = await vault.getState();

    let sharesToStakeLamports = new Decimal(U64_MAX);
    if (sharesAmount) {
      sharesToStakeLamports = numberToLamportsDecimal(sharesAmount, vaultState.sharesMintDecimals.toNumber());
    }

    // if tokens to be staked are 0 or vault has no farm there is no stake needed
    if (sharesToStakeLamports.lte(0) || vaultState.vaultFarm === DEFAULT_PUBLIC_KEY) {
      return [];
    }

    // returns the ix to create the farm state account if needed and the ix to stake the shares
    return getFarmStakeIxs(this.getConnection(), user, sharesToStakeLamports, vaultState.vaultFarm, farmState);
  }

  /**
   * This function creates instructions to stake the shares in the vault firstLossCapital farm if the vault has a first loss capital farm
   * @param user - user to stake
   * @param vault - vault to deposit into its flc farm (if the state is not provided, it will be fetched)
   * @param [sharesAmount] - token amount to be deposited, in decimals (will be converted in lamports). Optional. If not provided, the user's share balance will be used
   * @param farmState - preloaded first loss capital farm state; required when the vault has a first loss capital farm
   * @returns - a list of instructions for the user to stake shares into the vault's firstLossCapital farm, including the creation of prerequisite accounts if needed
   */
  async stakeSharesInFlcFarmIxs(
    user: TransactionSigner,
    vault: KaminoVault,
    sharesAmount: Decimal | undefined,
    farmState: FarmState | null
  ): Promise<Instruction[]> {
    const vaultState = await vault.getState();

    let sharesToStakeLamports = new Decimal(U64_MAX);
    if (sharesAmount) {
      sharesToStakeLamports = numberToLamportsDecimal(sharesAmount, vaultState.sharesMintDecimals.toNumber());
    }

    // if tokens to be staked are 0 or vault has no farm there is no stake needed
    if (sharesToStakeLamports.lte(0) || vaultState.firstLossCapitalFarm === DEFAULT_PUBLIC_KEY) {
      return [];
    }

    const resolvedFarmState = this.requireConfiguredFarmState(
      farmState,
      vaultState.firstLossCapitalFarm,
      'first loss capital'
    );

    // returns the ix to create the farm state account if needed and the ix to stake the shares
    return getFarmStakeIxs(
      this.getConnection(),
      user,
      sharesToStakeLamports,
      vaultState.firstLossCapitalFarm,
      resolvedFarmState
    );
  }

  /**
   * This function will return a struct with the instructions to unstake from the farm if necessary and the instructions for the missing ATA creation instructions, as well as one or multiple withdraw instructions, based on how many reserves it's needed to withdraw from. This might have to be split in multiple transactions
   * @param user - user to withdraw
   * @param vault - vault to withdraw from
   * @param shareAmountToWithdraw - share amount to withdraw (in tokens, not lamports), in order to withdraw everything, any value > user share amount
   * @param slot - current slot, used to estimate the interest earned in the different reserves with allocation from the vault
   * @param vaultReservesMap - preloaded reserve states for every reserve in the vault allocation
   * @param farmState - preloaded vault farm state; provide this to unstake from the vault farm
   * @param flcFarmState - preloaded first loss capital farm state; provide this to unstake from the first loss capital farm
   * Pass only one of `farmState` or `flcFarmState`, depending on whether you want vault-farm or first loss capital farm behavior. Pass neither to skip unstaking.
   * @param [withdrawalPenalties] - effective vault/global withdrawal penalties; provide preloaded values to avoid fetching the KVault global config
   * @returns an array of instructions to create missing ATAs if needed and the withdraw instructions
   */
  async withdrawIxs(
    user: TransactionSigner,
    vault: KaminoVault,
    shareAmountToWithdraw: Decimal,
    slot: Slot,
    vaultReservesMap: Map<Address, KaminoReserve>,
    farmState: FarmState | null,
    flcFarmState: FarmState | null,
    payer?: TransactionSigner,
    withdrawalPenalties?: WithdrawPenalties
  ): Promise<WithdrawIxs> {
    return this.buildShareExitIxs(
      'withdraw',
      user,
      vault,
      shareAmountToWithdraw,
      slot,
      vaultReservesMap,
      farmState,
      flcFarmState,
      payer,
      undefined,
      undefined,
      withdrawalPenalties
    );
  }

  /**
   * Redeem shares in kind (receive cTokens instead of underlying tokens).
   * Reserves are selected by highest available liquidity (same order as withdraw).
   * @param user - user to redeem shares
   * @param vault - vault to redeem from
   * @param shareAmountToRedeem - share amount to redeem (in tokens, not lamports)
   * @param slot - current slot
   * @param vaultReservesMap - preloaded reserve states for every reserve in the vault allocation
   * @param vaultState - preloaded vault state; call `vault.getState()` / `vault.reloadState()` before building instructions
   * @param globalConfigState - preloaded KVault global config; call `client.loadKVaultGlobalConfig()` / `manager.loadKVaultGlobalConfig()` before building instructions
   * @param farmState - preloaded vault farm state; provide this to unstake from the vault farm
   * @param flcFarmState - preloaded first loss capital farm state; provide this to unstake from the first loss capital farm
   * Pass only one of `farmState` or `flcFarmState`, depending on whether you want vault-farm or first loss capital farm behavior. Pass neither to skip unstaking.
   * @param payer - optional different payer for ATA creation
   * @returns RedeemInKindIxs with setup, redeemInKind, cleanup instructions and luts
   */
  async redeemInKindIxs(
    user: TransactionSigner,
    vault: KaminoVault,
    shareAmountToRedeem: Decimal,
    slot: Slot,
    vaultReservesMap: Map<Address, KaminoReserve>,
    vaultState: VaultState,
    globalConfigState: KVaultGlobalConfig,
    farmState: FarmState | null,
    flcFarmState: FarmState | null,
    payer?: TransactionSigner,
    /** @internal simulated post-withdraw liquidity per reserve, used by withdrawAndRedeemInKindIfNeededIxs */
    postWithdrawLiquidity?: Map<Address, Decimal>,
    /** @internal when true, treat this redeem as the final leg of a full exit (forces U64_MAX on the last reserve) */
    isCompletingFullExit?: boolean,
    /** @internal precomputed redeem plan from withdrawAndRedeemInKindIfNeededIxs to avoid duplicate planning work */
    precomputedRedeemPlan?: RedeemInKindExecutionPlan,
    /** @internal simulated post-withdraw share balances used by split withdraw + redeem exits */
    userSharesStateOverride?: UserSharesState
  ): Promise<RedeemInKindIxs> {
    const vaultReservesState = vaultReservesMap;
    const selectedFarm = this.resolveSelectedSharesFarm(vaultState, farmState, flcFarmState);
    const withdrawalPenalties = KaminoVaultClient.getEffectiveWithdrawalPenaltyParams(vaultState, globalConfigState);

    const result: RedeemInKindIxs = {
      setupIxs: [],
      redeemInKindIxs: [],
      cleanupIxs: [],
      luts: [],
    };

    // Add LUT if available
    if (vaultState.vaultLookupTable !== DEFAULT_PUBLIC_KEY) {
      result.luts.push(vaultState.vaultLookupTable);
    }

    const { userSharesAta, ataBalance, farmBalance, totalShares } =
      userSharesStateOverride ?? (await this.getUserSharesState(user.address, vaultState, selectedFarm?.farmAddress));
    const { sharesToUse: sharesToRedeem, exitAll } = KaminoVaultClient.resolveSharesForExit(
      shareAmountToRedeem,
      totalShares,
      vaultState.sharesMintDecimals.toNumber()
    );
    // When this redeem completes a full exit that was split across withdraw + redeem,
    // shareAmountToRedeem < totalShares (the withdraw leg handles the rest), so
    // resolveSharesForExit returns exitAll=false. Override to true so the last reserve
    // gets U64_MAX and residual rounding dust is burned.
    const redeemAllShares = exitAll || (isCompletingFullExit ?? false);

    // Unstake from farm if shares in ATA are not enough
    const farmUnstakeIxs = await this.buildFarmUnstakeIxsIfNeeded(
      user,
      vaultState,
      selectedFarm,
      sharesToRedeem,
      ataBalance,
      farmBalance,
      redeemAllShares,
      payer
    );
    result.setupIxs.push(...farmUnstakeIxs);

    // Build the priority list of reserves to redeem from
    const actualSharesToRedeem = sharesToRedeem.lte(totalShares) ? sharesToRedeem : totalShares;
    if (actualSharesToRedeem.lte(0)) {
      return result;
    }

    const redeemPlan =
      precomputedRedeemPlan ??
      (await this.planRedeemInKindExecution(
        slot,
        vaultState,
        globalConfigState,
        vaultReservesState,
        actualSharesToRedeem,
        redeemAllShares,
        withdrawalPenalties,
        postWithdrawLiquidity
      ));
    if (redeemPlan.reservePlans.length === 0) {
      return result;
    }

    const globalConfig = await getKvaultGlobalConfigPda(this._kaminoVaultProgramId);
    const eventAuthority = await getEventAuthorityPda(this._kaminoVaultProgramId);

    for (const reservePlan of redeemPlan.reservePlans) {
      const reserveState = vaultReservesState.get(reservePlan.reserve);
      if (!reserveState) {
        throw new Error(`Reserve ${reservePlan.reserve} not found in vault reserves map`);
      }

      const ctokenMint = reserveState.state.collateral.mintPubkey;
      const ctokenVault = await getCTokenVaultPda(vault.address, reservePlan.reserve, this._kaminoVaultProgramId);

      // Create user ctoken ATA (idempotent)
      const [{ ata: userCtokenTa, createAtaIx: createCtokenAtaIx }] = await createAtasIdempotent(
        user,
        [{ mint: ctokenMint, tokenProgram: TOKEN_PROGRAM_ADDRESS }],
        payer
      );
      result.setupIxs.push(createCtokenAtaIx);

      const redeemInKindAccounts: RedeemInKindAccounts = {
        user,
        vaultState: vault.address,
        globalConfig,
        baseVaultAuthority: vaultState.baseVaultAuthority,
        reserve: reservePlan.reserve,
        ctokenVault,
        userCtokenTa,
        ctokenMint,
        userSharesTa: userSharesAta,
        sharesMint: vaultState.sharesMint,
        reserveCollateralTokenProgram: TOKEN_PROGRAM_ADDRESS,
        sharesTokenProgram: TOKEN_PROGRAM_ADDRESS,
        klendProgram: this._kaminoLendProgramId,
        eventAuthority,
        program: this._kaminoVaultProgramId,
      };

      const redeemInKindArgs: RedeemInKindArgs = {
        sharesAmount: reservePlan.sharesAmount,
      };

      let redeemIx = redeemInKind(redeemInKindArgs, redeemInKindAccounts, undefined, this._kaminoVaultProgramId);

      // Append remaining accounts for vault reserves
      const vaultReserves = this.getVaultReserves(vaultState);
      redeemIx = this.appendRemainingAccountsForVaultReserves(redeemIx, vaultReserves, vaultReservesState);

      result.redeemInKindIxs.push({
        ix: redeemIx,
        reserve: reservePlan.reserve,
        ctokenAmount: reservePlan.ctokenAmount,
      });
    }

    if (KaminoVaultClient.shouldCloseSharesAtaAfterRedeem(redeemAllShares, redeemPlan.reservePlans)) {
      const closeSharesAtaIx = getCloseAccountInstruction(
        {
          account: userSharesAta,
          owner: user,
          destination: user.address,
        },
        { programAddress: TOKEN_PROGRAM_ADDRESS }
      );
      result.cleanupIxs.push(closeSharesAtaIx);
    }

    return result;
  }

  /**
   * Withdraw as much as possible instantly, then redeem in kind the remaining shares from reserves.
   * Reads vault and reserves state, determines how much can be withdrawn instantly, and for
   * the remainder builds redeemInKind instructions using reserves sorted by redeem capacity.
   * When both withdraw and redeemInKind are needed, the withdraw handles farm unstaking for the
   * full exit amount so redeemInKind does not duplicate the unstake.
   * @param user - user to withdraw/redeem
   * @param vault - vault to withdraw/redeem from
   * @param shareAmountToExit - total share amount to exit (in tokens, not lamports)
   * @param slot - current slot
   * @param vaultReservesMap - preloaded reserve states for every reserve in the vault allocation
   * @param vaultState - preloaded vault state; call `vault.getState()` / `vault.reloadState()` before building instructions
   * @param globalConfigState - preloaded KVault global config; call `client.loadKVaultGlobalConfig()` / `manager.loadKVaultGlobalConfig()` before building instructions
   * @param farmState - preloaded vault farm state when exiting from the vault farm
   * @param flcFarmState - preloaded first loss capital farm state when exiting from the first loss capital farm
   * Pass only one of `farmState` or `flcFarmState`, depending on whether you want vault-farm or first loss capital farm behavior. Pass neither if no farm exit is needed.
   * @param payer - optional different payer for ATA creation
   * @returns WithdrawAndRedeemInKindIxs with both withdraw and redeemInKind instructions
   */
  async withdrawAndRedeemInKindIfNeededIxs(
    user: TransactionSigner,
    vault: KaminoVault,
    shareAmountToExit: Decimal,
    slot: Slot,
    vaultReservesMap: Map<Address, KaminoReserve>,
    vaultState: VaultState,
    globalConfigState: KVaultGlobalConfig,
    farmState: FarmState | null,
    flcFarmState: FarmState | null,
    payer?: TransactionSigner
  ): Promise<WithdrawAndRedeemInKindIxs> {
    const vaultReservesState = vaultReservesMap;
    const selectedFarm = this.resolveSelectedSharesFarm(vaultState, farmState, flcFarmState);
    const withdrawalPenalties = KaminoVaultClient.getEffectiveWithdrawalPenaltyParams(vaultState, globalConfigState);

    // Calculate how much can be withdrawn instantly
    const tokensPerShare = await this.getTokensPerShareSingleVault(vaultState, slot, vaultReservesState, slot);

    // Get user total shares
    const userSharesState = await this.getUserSharesState(user.address, vaultState, selectedFarm?.farmAddress);
    const { totalShares } = userSharesState;
    const sharesToExit = shareAmountToExit.lte(totalShares) ? shareAmountToExit : totalShares;
    const shareLamportsToExit = collToLamportsDecimal(sharesToExit, vaultState.sharesMintDecimals.toNumber());
    const tokensToExit = shareLamportsToExit.mul(tokensPerShare);

    // Calculate available liquidity for instant withdraw across all reserves
    const reserveAllocationAvailableLiquidity = await this.getReserveAllocationAvailableLiquidityToWithdraw(
      vaultState,
      slot,
      vaultReservesState
    );
    const reserveAllocationExecutableLiquidity = KaminoVaultClient.getExecutableReserveWithdrawLiquidityMap(
      reserveAllocationAvailableLiquidity
    );
    const availableTokens = new Decimal(vaultState.tokenAvailable.toString());
    let totalAvailableForWithdraw = availableTokens;
    for (const [, liquidity] of reserveAllocationExecutableLiquidity) {
      totalAvailableForWithdraw = totalAvailableForWithdraw.add(liquidity);
    }

    const plannedWithdraw = KaminoVaultClient.getPlannedInstantWithdrawExecution(
      shareLamportsToExit,
      tokensToExit,
      totalAvailableForWithdraw,
      tokensPerShare,
      vaultState.sharesMintDecimals.toNumber()
    );
    const instantWithdrawPlan = KaminoVaultClient.getInstantWithdrawPlan(
      vaultState,
      withdrawalPenalties,
      plannedWithdraw.requestedGrossWithdrawAmount
    );

    const { sharesToWithdraw: rawSharesToWithdraw, sharesToRedeem } = KaminoVaultClient.resolveWithdrawRedeemSplit(
      sharesToExit,
      plannedWithdraw.plannedSharesToWithdraw,
      plannedWithdraw.canFullyWithdraw
    );
    const isFullExit = sharesToExit.gte(totalShares);
    const canAttemptRedeemFallback = !instantWithdrawPlan.allowed && rawSharesToWithdraw.gt(0);

    // Build withdraw and redeem ixs
    const emptyWithdrawIxs: WithdrawIxs = {
      unstakeFromFarmIfNeededIxs: [],
      withdrawIxs: [],
      postWithdrawIxs: [],
    };
    const emptyRedeemIxs: RedeemInKindIxs = {
      setupIxs: [],
      redeemInKindIxs: [],
      cleanupIxs: [],
      luts: [],
    };

    const reserveAllocations =
      sharesToRedeem.gt(0) || canAttemptRedeemFallback
        ? await this.getReserveAllocationLiquidity(vaultState, slot, vaultReservesState)
        : new Map<Address, Decimal>();
    let precomputedRedeemPlan: RedeemInKindExecutionPlan | undefined;
    let withdrawSuppressed = !instantWithdrawPlan.allowed && rawSharesToWithdraw.gt(0) && sharesToRedeem.gt(0);
    let sharesRequestedToRedeem = withdrawSuppressed ? sharesToExit : sharesToRedeem;

    // If the exit can be fully withdrawn from current liquidity but the withdraw would fail
    // after penalty/min-withdraw checks, try routing the exit through redeem-in-kind.
    // When redeem-in-kind can make any forward progress, prefer returning the redeem leg
    // plus skippedShares instead of a known-invalid withdraw. Keep the withdraw behavior only
    // when the fallback redeem plan covers nothing, so tokenAvailable-only dust does not become a no-op.
    if (
      !withdrawSuppressed &&
      canAttemptRedeemFallback &&
      sharesToRedeem.eq(new Decimal(0)) &&
      reserveAllocations.size > 0
    ) {
      const redeemFallbackPlan = await this.planRedeemInKindExecution(
        slot,
        vaultState,
        globalConfigState,
        vaultReservesState,
        sharesToExit,
        isFullExit,
        withdrawalPenalties,
        reserveAllocations
      );
      if (redeemFallbackPlan.coveredShares.gt(0)) {
        withdrawSuppressed = true;
        sharesRequestedToRedeem = sharesToExit;
        precomputedRedeemPlan = redeemFallbackPlan;
      }
    }

    const sharesToWithdraw = withdrawSuppressed ? new Decimal(0) : rawSharesToWithdraw;
    let skippedShares = new Decimal(0);
    let withdrawIxsResult = emptyWithdrawIxs;
    let postWithdrawUserSharesState: UserSharesState | undefined;
    if (sharesToWithdraw.gt(0)) {
      // Pass the full exit amount as the unstake target so farm unstaking covers
      // both the withdraw and the subsequent redeemInKind, while only withdrawing the
      // instantly-available leg from the vault.
      withdrawIxsResult = await this.buildShareExitIxs(
        'withdraw',
        user,
        vault,
        sharesToWithdraw,
        slot,
        vaultReservesState,
        farmState,
        flcFarmState,
        payer,
        sharesToExit,
        vaultState,
        withdrawalPenalties
      );

      if (selectedFarm && withdrawIxsResult.unstakeFromFarmIfNeededIxs.length > 0 && sharesRequestedToRedeem.gt(0)) {
        postWithdrawUserSharesState = KaminoVaultClient.simulatePostWithdrawUserSharesState(
          userSharesState,
          sharesToExit,
          sharesToWithdraw,
          vaultState.sharesMintDecimals.toNumber()
        );
      }
    }

    const shouldPlanRedeem = sharesRequestedToRedeem.gt(0);
    // Reserve-side state must be simulated from the gross withdraw amount.
    // On-chain the vault can disinvest more liquidity from reserves than it sends to the user,
    // with the penalty / rounding residue staying in the vault.
    const grossTokensWithdrawn = sharesToWithdraw.gt(0) ? instantWithdrawPlan.grossAmount : new Decimal(0);
    const postWithdrawAllocations = shouldPlanRedeem
      ? KaminoVaultClient.simulatePostWithdrawAllocations(
          availableTokens,
          reserveAllocations,
          reserveAllocationExecutableLiquidity,
          grossTokensWithdrawn
        )
      : undefined;

    let redeemIxsResult = emptyRedeemIxs;
    if (sharesRequestedToRedeem.gt(0)) {
      // Compute skippedShares for any redeem path — not just when withdraw is suppressed.
      // planRedeemInKindExecution can cover less than requested on the normal path too,
      // because reserves are filtered by the on-chain min_withdraw_amount guard or
      // because of flooring/cap effects.
      const redeemPlan =
        precomputedRedeemPlan ??
        (await this.planRedeemInKindExecution(
          slot,
          vaultState,
          globalConfigState,
          vaultReservesState,
          sharesRequestedToRedeem,
          isFullExit,
          withdrawalPenalties,
          postWithdrawAllocations
        ));
      skippedShares = Decimal.max(new Decimal(0), sharesRequestedToRedeem.sub(redeemPlan.coveredShares));

      // Simulate post-withdraw allocations so the redeem leg plans from the correct state.
      // The withdraw drains tokenAvailable first, then reserves (sorted by withdrawable liquidity).
      // Redeem-in-kind uses the remaining cToken allocations (not available liquidity) since it
      // gives cTokens to the user — the reserve's available liquidity doesn't constrain this.
      // If the withdraw leg unstaked shares from a farm, the redeem leg is built
      // before that transaction executes. Use simulated post-withdraw balances so
      // bundled callers do not receive a duplicate farm unstake.
      redeemIxsResult = await this.redeemInKindIxs(
        user,
        vault,
        sharesRequestedToRedeem,
        slot,
        vaultReservesState,
        vaultState,
        globalConfigState,
        farmState,
        flcFarmState,
        payer,
        postWithdrawAllocations,
        isFullExit,
        redeemPlan,
        postWithdrawUserSharesState
      );
    }

    return {
      withdrawIxs: withdrawIxsResult,
      redeemInKindIxs: redeemIxsResult,
      skippedShares,
    };
  }

  /**
   * Withdraw and redeem in kind as needed, then enqueue the cTokens received from redeemInKind
   * into the klend withdrawal queue. This ensures the user eventually gets the underlying tokens.
   * @param user - user to withdraw/redeem/enqueue
   * @param vault - vault to withdraw/redeem from
   * @param shareAmountToExit - total share amount to exit (in tokens, not lamports)
   * @param slot - current slot
   * @param vaultReservesMap - preloaded reserve states for every reserve in the vault allocation
   * @param vaultState - preloaded vault state; call `vault.getState()` / `vault.reloadState()` before building instructions
   * @param globalConfigState - preloaded KVault global config; call `client.loadKVaultGlobalConfig()` / `manager.loadKVaultGlobalConfig()` before building instructions
   * @param farmState - preloaded vault farm state when exiting from the vault farm
   * @param flcFarmState - preloaded first loss capital farm state when exiting from the first loss capital farm
   * Pass only one of `farmState` or `flcFarmState`, depending on whether you want vault-farm or first loss capital farm behavior. Pass neither if no farm exit is needed.
   * @param payer - optional different payer for ATA creation
   * @returns WithdrawRedeemAndEnqueueIxs with withdraw, redeemInKind, and enqueue instructions
   *
   * @example
   * ```ts
   * const slot = await rpc.getSlot({ commitment: 'confirmed' }).send();
   * const vaultState = await vault.reloadState();
   * const vaultReservesMap = await vaultClient.loadVaultReserves(vaultState);
   * const globalConfigState = await vaultClient.loadKVaultGlobalConfig();
   * const result = await vaultClient.withdrawRedeemAndEnqueueIxs(
   *   user,
   *   vault,
   *   sharesToExit,
   *   slot,
   *   vaultReservesMap,
   *   vaultState,
   *   globalConfigState,
   *   null,
   *   null
   * );
   *
   * // 1. Withdraw instantly available liquidity
   * if (result.withdrawIxs.withdrawIxs.length > 0) {
   *   await sendTx([
   *     ...result.withdrawIxs.unstakeFromFarmIfNeededIxs,
   *     ...result.withdrawIxs.withdrawIxs,
   *     ...result.withdrawIxs.postWithdrawIxs,
   *   ]);
   * }
   *
   * // 2. Redeem in kind (receive cTokens) for the portion not instantly withdrawable
   * if (result.redeemInKindIxs.redeemInKindIxs.length > 0) {
   *   await sendTx([
   *     ...result.redeemInKindIxs.setupIxs,
   *     ...result.redeemInKindIxs.redeemInKindIxs.map(r => r.ix),
   *     ...result.redeemInKindIxs.cleanupIxs,
   *   ], result.redeemInKindIxs.luts);
   * }
   *
   * // 3. Enqueue cTokens into klend withdrawal queue to eventually receive underlying tokens
   * if (result.enqueueIxs.enqueueIxs.length > 0) {
   *   await sendTx([
   *     ...result.enqueueIxs.setupIxs,
   *     ...result.enqueueIxs.enqueueIxs,
   *     ...result.enqueueIxs.cleanupIxs,
   *   ]);
   * }
   * ```
   */
  async withdrawRedeemAndEnqueueIxs(
    user: TransactionSigner,
    vault: KaminoVault,
    shareAmountToExit: Decimal,
    slot: Slot,
    vaultReservesMap: Map<Address, KaminoReserve>,
    vaultState: VaultState,
    globalConfigState: KVaultGlobalConfig,
    farmState: FarmState | null,
    flcFarmState: FarmState | null,
    payer?: TransactionSigner
  ): Promise<WithdrawRedeemAndEnqueueIxs> {
    const vaultReservesState = vaultReservesMap;

    const withdrawAndRedeem = await this.withdrawAndRedeemInKindIfNeededIxs(
      user,
      vault,
      shareAmountToExit,
      slot,
      vaultReservesState,
      vaultState,
      globalConfigState,
      farmState,
      flcFarmState,
      payer
    );

    const enqueueResult: EnqueueToWithdrawIxs = {
      setupIxs: [],
      enqueueIxs: [],
      cleanupIxs: [],
    };

    // If there are redeemInKind ixs, build enqueue ixs for each reserve that was redeemed
    if (withdrawAndRedeem.redeemInKindIxs.redeemInKindIxs.length > 0) {
      // Create user token ATA for destination liquidity (needed by all enqueue ixs, create once)
      const [{ ata: userTokenAta, createAtaIx: createTokenAtaIx }] = await createAtasIdempotent(
        user,
        [{ mint: vaultState.tokenMint, tokenProgram: vaultState.tokenProgram }],
        payer
      );
      enqueueResult.setupIxs.push(createTokenAtaIx);

      // Each redeemInKind ix targets a specific reserve
      for (const redeemIx of withdrawAndRedeem.redeemInKindIxs.redeemInKindIxs) {
        const collateralAmount = KaminoVaultClient.getExecutableEnqueueCtokenAmount(redeemIx.ctokenAmount);
        if (collateralAmount.isZero()) {
          continue;
        }
        const reserveAddress = redeemIx.reserve;
        const reserveState = vaultReservesState.get(reserveAddress);
        if (!reserveState) {
          throw new Error(`Reserve ${reserveAddress} not found in vault reserves map`);
        }

        const kaminoMarketAddress = reserveState.state.lendingMarket;
        const [lendingMarketAuth] = await lendingMarketAuthPda(kaminoMarketAddress, this._kaminoLendProgramId);
        const ctokenMint = reserveState.state.collateral.mintPubkey;

        const [userCtokenTa] = await findAssociatedTokenPda({
          owner: user.address,
          mint: ctokenMint,
          tokenProgram: TOKEN_PROGRAM_ADDRESS,
        });

        const withdrawTicket = await withdrawTicketPda(
          reserveAddress,
          BigInt(reserveState.state.withdrawQueue.nextIssuedTicketSequenceNumber.toString()),
          this._kaminoLendProgramId
        );

        const ownerQueuedCollateralVault = await ownerQueuedCollateralVaultPda(
          reserveAddress,
          user.address,
          this._kaminoLendProgramId
        );

        const enqueueAccounts: EnqueueToWithdrawAccounts = {
          owner: user,
          lendingMarket: kaminoMarketAddress,
          lendingMarketAuthority: lendingMarketAuth,
          reserve: reserveAddress,
          userSourceCollateralTa: userCtokenTa,
          userDestinationLiquidityTa: userTokenAta,
          reserveLiquidityMint: vaultState.tokenMint,
          reserveCollateralMint: ctokenMint,
          collateralTokenProgram: TOKEN_PROGRAM_ADDRESS,
          withdrawTicket,
          ownerQueuedCollateralVault,
          systemProgram: SYSTEM_PROGRAM_ADDRESS,
          progressCallbackCustomAccount0: none(),
          progressCallbackCustomAccount1: none(),
          instructionSysvarAccount: SYSVAR_INSTRUCTIONS_ADDRESS,
        };

        const enqueueIx = enqueueToWithdraw(
          {
            collateralAmount,
            progressCallbackType: new ProgressCallbackType.None(),
          },
          enqueueAccounts,
          [],
          this._kaminoLendProgramId
        );
        enqueueResult.enqueueIxs.push(enqueueIx);
      }
    }

    return {
      withdrawIxs: withdrawAndRedeem.withdrawIxs,
      redeemInKindIxs: withdrawAndRedeem.redeemInKindIxs,
      enqueueIxs: enqueueResult,
      skippedShares: withdrawAndRedeem.skippedShares,
    };
  }

  /**
   * This function will return the missing ATA creation instructions, as well as one or multiple withdraw instructions, based on how many reserves it's needed to withdraw from. This might have to be split in multiple transactions
   * @param user - user to sell shares for vault tokens
   * @param vault - vault to sell shares from
   * @param shareAmountToWithdraw - share amount to sell (in tokens, not lamports), in order to withdraw everything, any value > user share amount
   * @param slot - current slot, used to estimate the interest earned in the different reserves with allocation from the vault
   * @param [vaultReservesMap] - optional parameter; a hashmap from each reserve pubkey to the reserve state. If provided the function will be significantly faster as it will not have to fetch the reserves
   * @param [farmState] - the state of the vault farm, if the vault has a farm. Optional. If not provided, it will be fetched
   * @param [withdrawalPenalties] - effective vault/global withdrawal penalties; provide preloaded values to avoid fetching the KVault global config
   * @returns an array of instructions to create missing ATAs if needed and the withdraw instructions
   */
  async sellSharesIxs(
    user: TransactionSigner,
    vault: KaminoVault,
    shareAmountToWithdraw: Decimal,
    slot: Slot,
    vaultReservesMap: Map<Address, KaminoReserve>,
    farmState: FarmState | null,
    flcFarmState: FarmState | null,
    payer?: TransactionSigner,
    withdrawalPenalties?: WithdrawPenalties
  ): Promise<WithdrawIxs> {
    return this.buildShareExitIxs(
      'sell',
      user,
      vault,
      shareAmountToWithdraw,
      slot,
      vaultReservesMap,
      farmState,
      flcFarmState,
      payer,
      undefined,
      undefined,
      withdrawalPenalties
    );
  }

  private async buildShareExitIxs(
    mode: 'withdraw' | 'sell',
    user: TransactionSigner,
    vault: KaminoVault,
    shareAmountToWithdraw: Decimal,
    slot: Slot,
    vaultReservesMap: Map<Address, KaminoReserve>,
    farmState: FarmState | null,
    flcFarmState: FarmState | null,
    payer?: TransactionSigner,
    shareAmountToUnstake?: Decimal,
    vaultStateOverride?: VaultState,
    withdrawalPenaltiesOverride?: WithdrawPenalties
  ): Promise<WithdrawIxs> {
    const vaultState = vaultStateOverride ?? (await vault.getState());
    const withdrawalPenalties =
      withdrawalPenaltiesOverride ??
      KaminoVaultClient.getEffectiveWithdrawalPenaltyParams(vaultState, await this.loadKVaultGlobalConfig());
    const selectedFarm = this.resolveSelectedSharesFarm(vaultState, farmState, flcFarmState);

    const withdrawIxs: WithdrawIxs = {
      unstakeFromFarmIfNeededIxs: [],
      withdrawIxs: [],
      postWithdrawIxs: [],
    };

    const {
      userSharesAta,
      ataBalance,
      farmBalance,
      totalShares: totalUserShares,
    } = await this.getUserSharesState(user.address, vaultState, selectedFarm?.farmAddress);
    const { sharesToUse: sharesToWithdraw, exitAll: withdrawAllShares } = KaminoVaultClient.resolveSharesForExit(
      shareAmountToWithdraw,
      totalUserShares,
      vaultState.sharesMintDecimals.toNumber()
    );
    const { sharesToUse: sharesToUnstake, exitAll: unstakeAllShares } = KaminoVaultClient.resolveSharesForExit(
      shareAmountToUnstake ?? shareAmountToWithdraw,
      totalUserShares,
      vaultState.sharesMintDecimals.toNumber()
    );

    // if not enough shares in ATA unstake from farm
    const farmUnstakeIxs = await this.buildFarmUnstakeIxsIfNeeded(
      user,
      vaultState,
      selectedFarm,
      sharesToUnstake,
      ataBalance,
      farmBalance,
      unstakeAllShares,
      payer
    );
    withdrawIxs.unstakeFromFarmIfNeededIxs.push(...farmUnstakeIxs);

    const hasAllocatedReserves = vaultState.vaultAllocationStrategy.some(
      (allocation) => allocation.reserve !== DEFAULT_PUBLIC_KEY
    );
    const actualSharesToWithdraw = sharesToWithdraw.lte(totalUserShares) ? sharesToWithdraw : totalUserShares;
    const tokensPerShare = await this.getTokensPerShareSingleVault(vaultState, slot, vaultReservesMap, slot);
    const shareExitLiquidityPlan = await this.getShareExitLiquidityPlan(
      vaultState,
      slot,
      vaultReservesMap,
      shareAmountToWithdraw,
      totalUserShares,
      tokensPerShare,
      withdrawalPenalties
    );

    if (hasAllocatedReserves) {
      if (mode === 'withdraw' && shareExitLiquidityPlan.reserveTokenLamportsToWithdraw.size === 0) {
        withdrawIxs.withdrawIxs = await this.withdrawFromAvailableIxs(
          user,
          vault,
          withdrawAllShares ? sharesToWithdraw : actualSharesToWithdraw,
          payer,
          vaultState,
          vaultReservesMap
        );
      } else {
        const reserveExitBuilder: ReserveExitInstructionBuilder =
          mode === 'withdraw'
            ? (params) =>
                this.withdrawIx(
                  params.user,
                  params.vault,
                  params.vaultState,
                  params.marketAddress,
                  params.reserve,
                  params.userSharesAta,
                  params.userTokenAta,
                  params.shareAmountLamports,
                  params.vaultReservesState
                )
            : (params) =>
                this.sellIx(
                  params.user,
                  params.vault,
                  params.vaultState,
                  params.marketAddress,
                  params.reserve,
                  params.userSharesAta,
                  params.userTokenAta,
                  params.shareAmountLamports,
                  params.vaultReservesState
                );
        const withdrawFromVaultIxs = await this.buildReserveExitIxs({
          user,
          vault,
          vaultState,
          vaultReservesMap,
          liquidityPlan: shareExitLiquidityPlan,
          builder: reserveExitBuilder,
          payer,
        });
        withdrawIxs.withdrawIxs = withdrawFromVaultIxs;
      }
    } else {
      const withdrawFromVaultIxs = await this.withdrawFromAvailableIxs(
        user,
        vault,
        sharesToWithdraw,
        payer,
        vaultState,
        vaultReservesMap
      );
      withdrawIxs.withdrawIxs = withdrawFromVaultIxs;
    }

    // if the vault is for SOL return the ix to unwrap the SOL
    if (vaultState.tokenMint === WRAPPED_SOL_MINT) {
      const userWsolAta = await getAssociatedTokenAddress(WRAPPED_SOL_MINT, user.address);
      const unwrapIx = getCloseAccountInstruction(
        {
          account: userWsolAta,
          owner: user,
          destination: user.address,
        },
        { programAddress: TOKEN_PROGRAM_ADDRESS }
      );
      withdrawIxs.postWithdrawIxs.push(unwrapIx);
    }

    if (shareExitLiquidityPlan.canBurnAllUserShares) {
      const closeSharesAtaIx = getCloseAccountInstruction(
        {
          account: userSharesAta,
          owner: user,
          destination: user.address,
        },
        { programAddress: TOKEN_PROGRAM_ADDRESS }
      );
      withdrawIxs.postWithdrawIxs.push(closeSharesAtaIx);
    }

    return withdrawIxs;
  }

  private async withdrawFromAvailableIxs(
    user: TransactionSigner,
    vault: KaminoVault,
    shareAmount: Decimal,
    payer?: TransactionSigner,
    vaultStateOverride?: VaultState,
    vaultReservesMap?: Map<Address, KaminoReserve>
  ): Promise<Instruction[]> {
    const vaultState = vaultStateOverride ?? (await vault.getState());

    const userSharesAta = await getAssociatedTokenAddress(vaultState.sharesMint, user.address);
    const [{ ata: userTokenAta, createAtaIx }] = await createAtasIdempotent(
      user,
      [
        {
          mint: vaultState.tokenMint,
          tokenProgram: vaultState.tokenProgram,
        },
      ],
      payer
    );

    const shareLamportsToWithdraw = collToLamportsDecimal(
      shareAmount,
      vaultState.sharesMintDecimals.toNumber()
    ).floor();
    const withdrawFromAvailableIxn = await this.withdrawFromAvailableIx(
      user,
      vault,
      vaultState,
      userSharesAta,
      userTokenAta,
      shareLamportsToWithdraw
    );

    const hasAllocatedReserves = vaultState.vaultAllocationStrategy.some(
      (allocation) => allocation.reserve !== DEFAULT_PUBLIC_KEY
    );
    if (hasAllocatedReserves) {
      if (!vaultReservesMap) {
        throw new Error('vaultReservesMap is required when withdrawing from a vault with allocated reserves');
      }
      const vaultReservesState = vaultReservesMap;
      const vaultReserves = this.getVaultReserves(vaultState);
      return [
        createAtaIx,
        this.appendRemainingAccountsForVaultReserves(withdrawFromAvailableIxn, vaultReserves, vaultReservesState),
      ];
    }

    return [createAtaIx, withdrawFromAvailableIxn];
  }

  private async buildReserveExitIxs({
    user,
    vault,
    vaultState,
    vaultReservesMap,
    liquidityPlan,
    builder,
    payer,
  }: BuildReserveExitIxsParams): Promise<Instruction[]> {
    const vaultReservesState = vaultReservesMap;
    const userSharesAta = await getAssociatedTokenAddress(vaultState.sharesMint, user.address);
    const [{ ata: userTokenAta, createAtaIx }] = await createAtasIdempotent(
      user,
      [
        {
          mint: vaultState.tokenMint,
          tokenProgram: vaultState.tokenProgram,
        },
      ],
      payer
    );

    type ReserveWithSharesToWithdraw = { reserve: Address; shares: Decimal };

    const reserveWithSharesAmountToWithdraw: ReserveWithSharesToWithdraw[] = [];
    const reserveTokenLamportsToWithdraw = [...liquidityPlan.reserveTokenLamportsToWithdraw.entries()];
    if (reserveTokenLamportsToWithdraw.length === 0 && liquidityPlan.availableTokenLamportsToWithdraw.gt(0)) {
      const firstReserve = vaultState.vaultAllocationStrategy.find((reserve) => reserve.reserve !== DEFAULT_PUBLIC_KEY);
      if (!firstReserve) {
        throw new Error('No reserve available to satisfy withdraw request');
      }
      reserveTokenLamportsToWithdraw.push([firstReserve.reserve, new Decimal(0)]);
    }

    let isFirstWithdraw = true;
    let cumulativeTokenLamports = new Decimal(0);
    let allocatedShareLamports = new Decimal(0);
    for (const [reserve, reserveTokenLamports] of reserveTokenLamportsToWithdraw) {
      const tokenLamportsForIx = reserveTokenLamports
        .add(isFirstWithdraw ? liquidityPlan.availableTokenLamportsToWithdraw : new Decimal(0))
        .floor();
      isFirstWithdraw = false;
      cumulativeTokenLamports = cumulativeTokenLamports.add(tokenLamportsForIx);
      const cumulativeShareLamports = liquidityPlan.netTokenLamportsToWithdraw.gt(0)
        ? Decimal.min(
            liquidityPlan.shareLamportsToWithdraw,
            cumulativeTokenLamports
              .mul(liquidityPlan.shareLamportsToWithdraw)
              .div(liquidityPlan.netTokenLamportsToWithdraw)
              .floor()
          )
        : new Decimal(0);
      const shareLamportsForIx = cumulativeShareLamports.sub(allocatedShareLamports).floor();
      allocatedShareLamports = cumulativeShareLamports;
      reserveWithSharesAmountToWithdraw.push({ reserve, shares: shareLamportsForIx });
    }

    if (liquidityPlan.canBurnAllUserShares && reserveWithSharesAmountToWithdraw.length > 0) {
      reserveWithSharesAmountToWithdraw[reserveWithSharesAmountToWithdraw.length - 1].shares = new Decimal(
        U64_MAX.toString()
      );
    }

    const withdrawIxs: Instruction[] = [];
    withdrawIxs.push(createAtaIx);
    for (const reserveWithTokens of reserveWithSharesAmountToWithdraw) {
      if (reserveWithTokens.shares.lte(0)) {
        continue;
      }
      const reserveState = vaultReservesState.get(reserveWithTokens.reserve);
      if (reserveState === undefined) {
        throw new Error(`Reserve ${reserveWithTokens.reserve} not found in vault reserves map`);
      }
      const marketAddress = reserveState.state.lendingMarket;

      const exitIx = await builder({
        user,
        vault,
        vaultState,
        marketAddress,
        reserve: { address: reserveWithTokens.reserve, state: reserveState.state },
        userSharesAta,
        userTokenAta,
        shareAmountLamports: reserveWithTokens.shares,
        vaultReservesState,
      });
      withdrawIxs.push(exitIx);
    }

    return withdrawIxs;
  }

  /**
   * This will trigger invest by balancing, based on weights, the reserve allocations of the vault. It can either withdraw or deposit into reserves to balance them. This is a function that should be cranked
   * @param payer wallet that pays the tx
   * @param vault - vault to invest from
   * @param slot - current slot used for invest calculations
   * @param skipComputationChecks - if true, bypasses preliminary allocation-diff gating during atomic allocation updates. Emitted moves are still filtered by min-invest thresholds unless they fully evacuate a reserve allocation, and amounts remain capped by computed allocation deltas, vault available liquidity, reserve freely withdrawable liquidity, and allocation caps
   * @returns - an array of invest instructions for each invest action required for the vault reserves
   */
  async investAllReservesIxs(
    payer: TransactionSigner,
    vault: KaminoVault,
    slot: Slot,
    skipComputationChecks: boolean = false
  ): Promise<Instruction[]> {
    const vaultState = await vault.reloadState();
    const minInvestAmount = vaultState.minInvestAmount;
    const allReserves = this.getVaultReserves(vaultState);
    if (allReserves.length === 0) {
      throw new Error('No reserves found for the vault, please select at least one reserve for the vault');
    }
    const allReservesStateMap = await this.loadVaultReserves(vaultState);
    const computedReservesAllocationTokens = await this.getVaultComputedReservesAllocation(
      vaultState,
      slot,
      allReservesStateMap,
      slot
    );

    // compute total vault holdings and expected distribution based on weights
    const curentVaultAllocations = this.getVaultAllocations(vaultState);
    const reserveAllocationAvailableLiquidityToWithdraw = await this.getReserveAllocationAvailableLiquidityToWithdraw(
      vaultState,
      slot,
      allReservesStateMap
    );
    const reservesToDisinvestFrom: Array<{ reserve: Address; maxAmountLamports: Decimal }> = [];
    const reservesToInvestIntoCandidates: Array<{ reserve: Address; requiredAmountLamports: Decimal }> = [];
    const reservesToInvestInto: Array<{ reserve: Address; maxAmountLamports: Decimal }> = [];
    let availableToInvestLamports = new Decimal(vaultState.tokenAvailable.toString());
    const minInvestAmountLamports = new Decimal(minInvestAmount.toString());

    for (let index = 0; index < allReserves.length; index++) {
      const reservePubkey = allReserves[index];
      const reserveState = allReservesStateMap.get(reservePubkey)!;
      const computedAllocationTokens = computedReservesAllocationTokens.targetReservesAllocation.get(reservePubkey)!;
      const computedAllocationLamports = numberToLamportsDecimal(
        computedAllocationTokens,
        vaultState.tokenMintDecimals.toNumber()
      );
      const currentAllocation = curentVaultAllocations.get(reservePubkey)!;
      const currentCTokenAllocationLamports = currentAllocation.ctokenAllocationLamports;

      const reserveCollExchangeRate = reserveState.getEstimatedCollateralExchangeRate(slot, 0);
      const currentLiquidityAllocationCapLamports = getEffectiveLiquidityAllocationCap(
        currentAllocation.tokenAllocationCapLamports,
        ctokenAllocationCapLamportsToLiquidityLamports(
          currentAllocation.ctokenAllocationCapLamports,
          reserveCollExchangeRate
        )
      );
      const reserveAllocationLamports = currentCTokenAllocationLamports.div(reserveCollExchangeRate);
      const reserveAllocationLiquidityAmount = lamportsToDecimal(
        KaminoReserve.cTokensToLiquidity(currentCTokenAllocationLamports, reserveCollExchangeRate),
        vaultState.tokenMintDecimals.toNumber()
      );

      const diffInReserveTokens = computedAllocationTokens.sub(reserveAllocationLiquidityAmount);
      const diffInReserveLamports = collToLamportsDecimal(diffInReserveTokens, vaultState.tokenMintDecimals.toNumber());
      // it is possible that the tokens to invest are > minInvestAmountLamports but the ctokens it represent are 0, which will make an invest move 0 tokens
      const diffInCtokenLamports = KaminoReserve.liquidityToCTokens(
        diffInReserveLamports.abs(),
        reserveCollExchangeRate
      );
      const actualDiffInLamports = KaminoReserve.cTokensToLiquidity(
        diffInCtokenLamports.floor(),
        reserveCollExchangeRate
      ).floor();

      // if the diff for the reserve is smaller than the min invest amount, we do not need to invest or disinvest
      if (actualDiffInLamports.gt(minInvestAmountLamports) || skipComputationChecks) {
        if (computedAllocationTokens.lt(reserveAllocationLiquidityAmount)) {
          const maxDisinvestAmountLamports = Decimal.min(
            actualDiffInLamports,
            reserveAllocationAvailableLiquidityToWithdraw.get(reservePubkey) ?? new Decimal(0)
          ).floor();
          const isUncappedFullWeightZeroEvacuation =
            currentAllocation.targetWeight.eq(0) && maxDisinvestAmountLamports.gte(actualDiffInLamports.floor());
          if (
            this.shouldEmitInvestMove(
              maxDisinvestAmountLamports,
              minInvestAmountLamports,
              isUncappedFullWeightZeroEvacuation
            )
          ) {
            reservesToDisinvestFrom.push({ reserve: reservePubkey, maxAmountLamports: maxDisinvestAmountLamports });
            availableToInvestLamports = availableToInvestLamports.add(maxDisinvestAmountLamports);
          }
        } else {
          const actualTargetLamports = currentLiquidityAllocationCapLamports.gt(computedAllocationLamports)
            ? computedAllocationLamports
            : currentLiquidityAllocationCapLamports;
          const lamportsToAddToReserve = Decimal.max(actualTargetLamports.sub(reserveAllocationLamports), 0).floor();
          if (lamportsToAddToReserve.gt(minInvestAmountLamports)) {
            reservesToInvestIntoCandidates.push({
              reserve: reservePubkey,
              requiredAmountLamports: lamportsToAddToReserve,
            });
          }
        }
      }
    }

    for (const reserveToInvestInto of reservesToInvestIntoCandidates) {
      const maxInvestAmountLamports = Decimal.min(
        reserveToInvestInto.requiredAmountLamports,
        availableToInvestLamports
      ).floor();
      if (this.shouldEmitInvestMove(maxInvestAmountLamports, minInvestAmountLamports)) {
        reservesToInvestInto.push({
          reserve: reserveToInvestInto.reserve,
          maxAmountLamports: maxInvestAmountLamports,
        });
        availableToInvestLamports = availableToInvestLamports.sub(maxInvestAmountLamports);
      }
    }

    const reserveAmounts = [...reservesToDisinvestFrom, ...reservesToInvestInto];
    if (reserveAmounts.length === 0) {
      return [];
    }

    const tokenProgram = await getAccountOwner(this.getConnection(), vaultState.tokenMint);
    const [{ ata: payerTokenAta, createAtaIx }] = await createAtasIdempotent(payer, [
      { mint: vaultState.tokenMint, tokenProgram },
    ]);
    const investIxs = await this.buildCappedInvestIxsForReserveAmounts({
      payer,
      vault,
      vaultState,
      vaultReservesMap: allReservesStateMap,
      reserveAmounts,
      tokenProgram,
      payerTokenAta,
      vaultReserves: allReserves,
    });
    return [createAtaIx, ...investIxs];
  }

  private shouldEmitInvestMove(
    amountLamports: Decimal,
    minInvestAmountLamports: Decimal,
    isUncappedFullWeightZeroEvacuation: boolean = false
  ): boolean {
    const flooredAmountLamports = amountLamports.floor();
    return (
      flooredAmountLamports.gt(minInvestAmountLamports) ||
      (isUncappedFullWeightZeroEvacuation && flooredAmountLamports.gt(0))
    );
  }

  private async getSingleReserveExpectedMoveLamports({
    vaultState,
    slot,
    reserve,
    vaultReservesMap,
    maxAmountLamports,
  }: {
    vaultState: VaultState;
    slot: Slot;
    reserve: ReserveWithAddress;
    vaultReservesMap: Map<Address, KaminoReserve>;
    maxAmountLamports?: BN | string;
  }): Promise<{ amountLamports: Decimal; fullyEvacuatesReserve: boolean }> {
    const reserveState = vaultReservesMap.get(reserve.address);
    if (reserveState === undefined) {
      throw new Error(`Reserve ${reserve.address} not found`);
    }

    const computedReservesAllocationTokens = await this.getVaultComputedReservesAllocation(
      vaultState,
      slot,
      vaultReservesMap,
      slot
    );
    const computedAllocationTokens = computedReservesAllocationTokens.targetReservesAllocation.get(reserve.address);
    const currentAllocation = this.getVaultAllocations(vaultState).get(reserve.address);
    if (computedAllocationTokens === undefined || currentAllocation === undefined) {
      return { amountLamports: new Decimal(0), fullyEvacuatesReserve: false };
    }

    const reserveCollExchangeRate = reserveState.getEstimatedCollateralExchangeRate(slot, 0);
    const reserveAllocationLiquidityAmount = lamportsToDecimal(
      KaminoReserve.cTokensToLiquidity(currentAllocation.ctokenAllocationLamports, reserveCollExchangeRate),
      vaultState.tokenMintDecimals.toNumber()
    );
    const computedAllocationLamports = numberToLamportsDecimal(
      computedAllocationTokens,
      vaultState.tokenMintDecimals.toNumber()
    );
    const diffInReserveTokens = computedAllocationTokens.sub(reserveAllocationLiquidityAmount);
    const diffInReserveLamports = collToLamportsDecimal(diffInReserveTokens, vaultState.tokenMintDecimals.toNumber());
    const diffInCtokenLamports = KaminoReserve.liquidityToCTokens(diffInReserveLamports.abs(), reserveCollExchangeRate);
    const actualDiffInLamports = KaminoReserve.cTokensToLiquidity(
      diffInCtokenLamports.floor(),
      reserveCollExchangeRate
    ).floor();

    let amountLamports = new Decimal(0);
    let fullyEvacuatesReserve = false;
    if (actualDiffInLamports.gt(0)) {
      if (computedAllocationTokens.lt(reserveAllocationLiquidityAmount)) {
        const reserveAllocationAvailableLiquidityToWithdraw =
          await this.getReserveAllocationAvailableLiquidityToWithdraw(vaultState, slot, vaultReservesMap);
        amountLamports = Decimal.min(
          actualDiffInLamports,
          reserveAllocationAvailableLiquidityToWithdraw.get(reserve.address) ?? new Decimal(0)
        ).floor();
        fullyEvacuatesReserve =
          currentAllocation.targetWeight.eq(0) && amountLamports.gte(actualDiffInLamports.floor());
      } else {
        const effectiveLiquidityAllocationCapLamports = getEffectiveLiquidityAllocationCap(
          currentAllocation.tokenAllocationCapLamports,
          ctokenAllocationCapLamportsToLiquidityLamports(
            currentAllocation.ctokenAllocationCapLamports,
            reserveCollExchangeRate
          )
        );
        const actualTargetLamports = Decimal.min(effectiveLiquidityAllocationCapLamports, computedAllocationLamports);
        amountLamports = Decimal.min(
          Decimal.max(
            actualTargetLamports.sub(currentAllocation.ctokenAllocationLamports.div(reserveCollExchangeRate)),
            0
          ),
          new Decimal(vaultState.tokenAvailable.toString())
        ).floor();
      }
    }

    if (maxAmountLamports !== undefined) {
      amountLamports = Decimal.min(amountLamports, new Decimal(maxAmountLamports.toString()).floor()).floor();
      fullyEvacuatesReserve = fullyEvacuatesReserve && amountLamports.gte(actualDiffInLamports.floor());
    }

    return { amountLamports, fullyEvacuatesReserve };
  }

  private async buildInvestSingleReserveIx({
    payer,
    vault,
    reserve,
    vaultState,
    vaultReservesMap,
    tokenProgram,
    payerTokenAta,
    maxAmountLamports,
    vaultReserves,
  }: {
    payer: TransactionSigner;
    vault: KaminoVault;
    reserve: ReserveWithAddress;
    vaultState: VaultState;
    vaultReservesMap: Map<Address, KaminoReserve>;
    tokenProgram: Address;
    payerTokenAta: Address;
    maxAmountLamports?: BN | string;
    vaultReserves?: Address[];
  }): Promise<Instruction> {
    const cTokenVault = await getCTokenVaultPda(vault.address, reserve.address, this._kaminoVaultProgramId);
    const [lendingMarketAuth] = await lendingMarketAuthPda(reserve.state.lendingMarket, this._kaminoLendProgramId);

    const reserveWhitelistEntryOption = await getReserveWhitelistEntryIfExists(
      reserve.address,
      this.getConnection(),
      this._kaminoVaultProgramId
    );

    const investAccounts: InvestAccounts = {
      payer,
      vaultState: vault.address,
      tokenVault: vaultState.tokenVault,
      baseVaultAuthority: vaultState.baseVaultAuthority,
      ctokenVault: cTokenVault,
      reserve: reserve.address,
      /** CPI accounts */
      lendingMarket: reserve.state.lendingMarket,
      lendingMarketAuthority: lendingMarketAuth,
      reserveLiquiditySupply: reserve.state.liquidity.supplyVault,
      reserveCollateralMint: reserve.state.collateral.mintPubkey,
      reserveWhitelistEntry: reserveWhitelistEntryOption,
      klendProgram: this._kaminoLendProgramId,
      instructionSysvarAccount: SYSVAR_INSTRUCTIONS_ADDRESS,
      tokenProgram: tokenProgram,
      payerTokenAccount: payerTokenAta,
      tokenMint: vaultState.tokenMint,
      reserveCollateralTokenProgram: TOKEN_PROGRAM_ADDRESS,
    };

    let investIx =
      maxAmountLamports === undefined
        ? invest(investAccounts, undefined, this._kaminoVaultProgramId)
        : investWithMaxAmount(
            {
              // Generated IDL arg name; value is in vault-token lamports.
              maxAmount: new BN(maxAmountLamports.toString()),
            },
            investAccounts,
            undefined,
            this._kaminoVaultProgramId
          );
    investIx = this.appendRemainingAccountsForVaultReserves(
      investIx,
      vaultReserves ?? this.getVaultReserves(vaultState),
      vaultReservesMap
    );

    return investIx;
  }

  private async buildInvestSingleReserveIxs({
    payer,
    vault,
    reserve,
    vaultReservesMap,
    createAtaIfNeeded,
    maxAmountLamports,
  }: {
    payer: TransactionSigner;
    vault: KaminoVault;
    reserve: ReserveWithAddress;
    vaultReservesMap: Map<Address, KaminoReserve>;
    createAtaIfNeeded: boolean;
    maxAmountLamports?: BN | string;
  }): Promise<Instruction[]> {
    const vaultState = await vault.getState();
    const minInvestAmountLamports = new Decimal(vaultState.minInvestAmount?.toString() ?? '0');
    const slot = await this.getConnection().getSlot().send();
    const { amountLamports, fullyEvacuatesReserve } = await this.getSingleReserveExpectedMoveLamports({
      vaultState,
      slot,
      reserve,
      vaultReservesMap,
      maxAmountLamports,
    });
    if (!this.shouldEmitInvestMove(amountLamports, minInvestAmountLamports, fullyEvacuatesReserve)) {
      return [];
    }

    const tokenProgram = await getAccountOwner(this.getConnection(), vaultState.tokenMint);
    const [{ ata: payerTokenAta, createAtaIx }] = await createAtasIdempotent(payer, [
      { mint: vaultState.tokenMint, tokenProgram },
    ]);
    const investIx = await this.buildInvestSingleReserveIx({
      payer,
      vault,
      reserve,
      vaultState,
      vaultReservesMap,
      tokenProgram,
      payerTokenAta,
      maxAmountLamports,
    });
    return createAtaIfNeeded ? [createAtaIx, investIx] : [investIx];
  }

  private async buildCappedInvestIxsForReserveAmounts({
    payer,
    vault,
    vaultState,
    vaultReservesMap,
    reserveAmounts,
    tokenProgram,
    payerTokenAta,
    vaultReserves,
  }: {
    payer: TransactionSigner;
    vault: KaminoVault;
    vaultState: VaultState;
    vaultReservesMap: Map<Address, KaminoReserve>;
    reserveAmounts: Array<{ reserve: Address; maxAmountLamports: Decimal }>;
    tokenProgram: Address;
    payerTokenAta: Address;
    vaultReserves?: Address[];
  }): Promise<Instruction[]> {
    const investIxPromises = reserveAmounts.map(({ reserve, maxAmountLamports }) => {
      const reserveState = vaultReservesMap.get(reserve);
      if (reserveState === undefined) {
        throw new Error(`Reserve ${reserve} not found`);
      }

      return this.buildInvestSingleReserveIx({
        payer,
        vault,
        reserve: {
          address: reserve,
          state: reserveState.state,
        },
        vaultState,
        vaultReservesMap,
        tokenProgram,
        payerTokenAta,
        maxAmountLamports: maxAmountLamports.floor().toFixed(0),
        vaultReserves,
      });
    });

    return Promise.all(investIxPromises);
  }

  // todo: make sure we also check the ata of the investor for the vault token exists
  /**
   * This will trigger invest by balancing, based on weights, the reserve allocation of the vault. It can either withdraw or deposit into the given reserve to balance it
   * @param payer wallet pubkey - the instruction is permissionless and does not require the vault admin, due to rounding between cTokens and the underlying, the payer may have to contribute 1 or more lamports of the underlying from their token account
   * @param vault - vault to invest from
   * @param reserve - reserve to invest into or disinvest from
   * @param [vaultReservesMap] - optional parameter; a hashmap from each reserve pubkey to the reserve state. If provided the function will be significantly faster as it will not have to fetch the reserves
   * @param [createAtaIfNeeded] - if true, the function will create an ATA for the payer if needed
   * @returns - an array of invest instructions for each invest action required for the vault reserves
   */
  async investSingleReserveIxs(
    payer: TransactionSigner,
    vault: KaminoVault,
    reserve: ReserveWithAddress,
    vaultReservesMap: Map<Address, KaminoReserve>,
    createAtaIfNeeded: boolean = true
  ): Promise<Instruction[]> {
    return this.buildInvestSingleReserveIxs({
      payer,
      vault,
      reserve,
      vaultReservesMap,
      createAtaIfNeeded,
    });
  }

  /**
   * This will trigger invest into or disinvest from the given reserve, capped by the provided max vault-token lamports.
   * @param payer wallet pubkey - the instruction is permissionless and does not require the vault admin, due to rounding between cTokens and the underlying, the payer may have to contribute 1 or more lamports of the underlying from their token account
   * @param vault - vault to invest from
   * @param reserve - reserve to invest into or disinvest from
   * @param maxAmountLamports - maximum vault-token lamports to move in or out of the reserve
   * @param vaultReservesMap - a hashmap from each reserve pubkey to the reserve state
   * @param [createAtaIfNeeded] - if true, the function will create an ATA for the payer if needed
   * @returns - an array of instructions for the capped invest/disinvest action
   */
  async investSingleReserveWithMaxAmountIxs(
    payer: TransactionSigner,
    vault: KaminoVault,
    reserve: ReserveWithAddress,
    maxAmountLamports: BN | string,
    vaultReservesMap: Map<Address, KaminoReserve>,
    createAtaIfNeeded: boolean = true
  ): Promise<Instruction[]> {
    return this.buildInvestSingleReserveIxs({
      payer,
      vault,
      reserve,
      vaultReservesMap,
      createAtaIfNeeded,
      maxAmountLamports,
    });
  }

  /** Convert a string to a u8 representation to be stored on chain */
  encodeVaultName(token: string): Uint8Array {
    const maxArray = new Uint8Array(40);
    const s: Uint8Array = new TextEncoder().encode(token);
    maxArray.set(s);
    return maxArray;
  }

  /**Convert an u8 array to a string */
  decodeVaultName(token: number[]): string {
    return decodeVaultName(token);
  }

  /** Helper to serialize value as Buffer for updateVaultConfig instruction */
  private getValueForModeAsBuffer(mode: VaultConfigFieldKind, value: string): Buffer {
    const isWhitelistOnlyFlag =
      mode.kind === new VaultConfigField.AllowInvestInWhitelistedReservesOnly().kind ||
      mode.kind === new VaultConfigField.AllowAllocationsInWhitelistedReservesOnly().kind;

    if (isWhitelistOnlyFlag) {
      const flag = parseBooleanFlag(value);
      return Buffer.from([flag]);
    } else if (isNaN(+value) || value == DEFAULT_PUBLIC_KEY) {
      if (mode.kind === new VaultConfigField.Name().kind) {
        const data = Array.from(this.encodeVaultName(value));
        return Buffer.from(data);
      } else {
        const data = address(value);
        return Buffer.from(addressEncoder.encode(data));
      }
    } else {
      const buffer = Buffer.alloc(8);
      buffer.writeBigUInt64LE(BigInt(value.toString()));
      return buffer;
    }
  }

  /**
   * Get the refresh obligation and reserves ixs for a given market, obligation and destination reserve (in the context of investing in a conditional liquidity)
   * @param market - the market of the obligation
   * @param obligation - the obligation to refresh (the obligation + the reserves of the obligation)
   * @param dstReserve - the destination reserve into which the vault will invest and fill the borrow order of the obligation
   * @returns - the refresh obligation and reserves ixs
   */
  public async getRefreshObligationAndReservesIxs(
    market: KaminoMarket,
    obligation: KaminoObligation,
    dstReserve: KaminoReserve
  ): Promise<{
    refreshObligationIxs: RefreshObligationIxs;
    refreshReservesIxs: Instruction[];
  }> {
    const allReservesList = obligation.getAllReserves();
    if (!allReservesList.find((reserve) => reserve === dstReserve.address)) {
      allReservesList.push(dstReserve.address);
    }
    const refreshReservesIxs = KaminoAction.getRefreshAllReserves(market, allReservesList);
    const [firstRefreshObligationIx, refreshObligationIx] = await Promise.all([
      obligation.getRefreshObligationIx(),
      obligation.getRefreshObligationIx({
        extraBorrowReserves: [dstReserve.address],
      }),
    ]);
    return {
      refreshObligationIxs: {
        firstRefreshObligationIx: firstRefreshObligationIx,
        refreshObligationIx: refreshObligationIx,
      },
      refreshReservesIxs: refreshReservesIxs,
    };
  }

  private async sellIx(
    user: TransactionSigner,
    vault: KaminoVault,
    vaultState: VaultState,
    marketAddress: Address,
    reserve: ReserveWithAddress,
    userSharesAta: Address,
    userTokenAta: Address,
    shareAmountLamports: Decimal,
    vaultReservesState: Map<Address, KaminoReserve>
  ): Promise<Instruction> {
    const [lendingMarketAuth] = await lendingMarketAuthPda(marketAddress, this._kaminoLendProgramId);

    const globalConfig = await getKvaultGlobalConfigPda(this._kaminoVaultProgramId);
    const eventAuthority = await getEventAuthorityPda(this._kaminoVaultProgramId);
    const sellAccounts: SellAccounts = {
      withdrawFromAvailable: {
        user,
        vaultState: vault.address,
        globalConfig: globalConfig,
        tokenVault: vaultState.tokenVault,
        baseVaultAuthority: vaultState.baseVaultAuthority,
        userTokenAta: userTokenAta,
        tokenMint: vaultState.tokenMint,
        userSharesAta: userSharesAta,
        sharesMint: vaultState.sharesMint,
        tokenProgram: vaultState.tokenProgram,
        sharesTokenProgram: TOKEN_PROGRAM_ADDRESS,
        klendProgram: this._kaminoLendProgramId,
        eventAuthority: eventAuthority,
        program: this._kaminoVaultProgramId,
      },
      withdrawFromReserveAccounts: {
        vaultState: vault.address,
        reserve: reserve.address,
        ctokenVault: await getCTokenVaultPda(vault.address, reserve.address, this._kaminoVaultProgramId),
        lendingMarket: marketAddress,
        lendingMarketAuthority: lendingMarketAuth,
        reserveLiquiditySupply: reserve.state.liquidity.supplyVault,
        reserveCollateralMint: reserve.state.collateral.mintPubkey,
        reserveCollateralTokenProgram: TOKEN_PROGRAM_ADDRESS,
        instructionSysvarAccount: SYSVAR_INSTRUCTIONS_ADDRESS,
      },
      eventAuthority: eventAuthority,
      program: this._kaminoVaultProgramId,
    };

    const sellArgs: SellArgs = {
      sharesAmount: new BN(shareAmountLamports.floor().toString()),
    };

    let sellIxn = sell(sellArgs, sellAccounts, undefined, this._kaminoVaultProgramId);

    const vaultReserves = this.getVaultReserves(vaultState);
    sellIxn = this.appendRemainingAccountsForVaultReserves(sellIxn, vaultReserves, vaultReservesState);

    return sellIxn;
  }

  private async withdrawIx(
    user: TransactionSigner,
    vault: KaminoVault,
    vaultState: VaultState,
    marketAddress: Address,
    reserve: ReserveWithAddress,
    userSharesAta: Address,
    userTokenAta: Address,
    shareAmountLamports: Decimal,
    vaultReservesState: Map<Address, KaminoReserve>
  ): Promise<Instruction> {
    const [lendingMarketAuth] = await lendingMarketAuthPda(marketAddress, this._kaminoLendProgramId);

    const globalConfig = await getKvaultGlobalConfigPda(this._kaminoVaultProgramId);
    const eventAuthority = await getEventAuthorityPda(this._kaminoVaultProgramId);
    const withdrawAccounts: WithdrawAccounts = {
      withdrawFromAvailable: {
        user,
        vaultState: vault.address,
        globalConfig: globalConfig,
        tokenVault: vaultState.tokenVault,
        baseVaultAuthority: vaultState.baseVaultAuthority,
        userTokenAta: userTokenAta,
        tokenMint: vaultState.tokenMint,
        userSharesAta: userSharesAta,
        sharesMint: vaultState.sharesMint,
        tokenProgram: vaultState.tokenProgram,
        sharesTokenProgram: TOKEN_PROGRAM_ADDRESS,
        klendProgram: this._kaminoLendProgramId,
        eventAuthority: eventAuthority,
        program: this._kaminoVaultProgramId,
      },
      withdrawFromReserveAccounts: {
        vaultState: vault.address,
        reserve: reserve.address,
        ctokenVault: await getCTokenVaultPda(vault.address, reserve.address, this._kaminoVaultProgramId),
        lendingMarket: marketAddress,
        lendingMarketAuthority: lendingMarketAuth,
        reserveLiquiditySupply: reserve.state.liquidity.supplyVault,
        reserveCollateralMint: reserve.state.collateral.mintPubkey,
        reserveCollateralTokenProgram: TOKEN_PROGRAM_ADDRESS,
        instructionSysvarAccount: SYSVAR_INSTRUCTIONS_ADDRESS,
      },
      eventAuthority: eventAuthority,
      program: this._kaminoVaultProgramId,
    };

    const withdrawArgs: WithdrawArgs = {
      sharesAmount: new BN(shareAmountLamports.floor().toString()),
    };

    let withdrawIxn = withdraw(withdrawArgs, withdrawAccounts, undefined, this._kaminoVaultProgramId);

    const vaultReserves = this.getVaultReserves(vaultState);
    withdrawIxn = this.appendRemainingAccountsForVaultReserves(withdrawIxn, vaultReserves, vaultReservesState);

    return withdrawIxn;
  }

  private async withdrawFromAvailableIx(
    user: TransactionSigner,
    vault: KaminoVault,
    vaultState: VaultState,
    userSharesAta: Address,
    userTokenAta: Address,
    shareAmountLamports: Decimal
  ): Promise<Instruction> {
    const globalConfig = await getKvaultGlobalConfigPda(this._kaminoVaultProgramId);
    const eventAuthority = await getEventAuthorityPda(this._kaminoVaultProgramId);
    const withdrawFromAvailableAccounts: WithdrawFromAvailableAccounts = {
      user,
      vaultState: vault.address,
      globalConfig: globalConfig,
      tokenVault: vaultState.tokenVault,
      baseVaultAuthority: vaultState.baseVaultAuthority,
      userTokenAta,
      tokenMint: vaultState.tokenMint,
      userSharesAta,
      sharesMint: vaultState.sharesMint,
      tokenProgram: vaultState.tokenProgram,
      sharesTokenProgram: TOKEN_PROGRAM_ADDRESS,
      klendProgram: this._kaminoLendProgramId,
      eventAuthority,
      program: this._kaminoVaultProgramId,
    };

    const withdrawFromAvailableArgs: WithdrawFromAvailableArgs = {
      sharesAmount: new BN(shareAmountLamports.floor().toString()),
    };

    return withdrawFromAvailable(
      withdrawFromAvailableArgs,
      withdrawFromAvailableAccounts,
      undefined,
      this._kaminoVaultProgramId
    );
  }

  private async withdrawPendingFeesIx(
    authority: TransactionSigner,
    vault: KaminoVault,
    vaultState: VaultState,
    marketAddress: Address,
    reserve: ReserveWithAddress,
    adminTokenAta: Address,
    vaultReservesMap: Map<Address, KaminoReserve>
  ): Promise<Instruction> {
    const [lendingMarketAuth] = await lendingMarketAuthPda(marketAddress, this._kaminoLendProgramId);

    const withdrawPendingFeesAccounts: WithdrawPendingFeesAccounts = {
      vaultAdminAuthority: authority,
      vaultState: vault.address,
      reserve: reserve.address,
      tokenVault: vaultState.tokenVault,
      ctokenVault: await getCTokenVaultPda(vault.address, reserve.address, this._kaminoVaultProgramId),
      baseVaultAuthority: vaultState.baseVaultAuthority,
      tokenAta: adminTokenAta,
      tokenMint: vaultState.tokenMint,
      tokenProgram: vaultState.tokenProgram,
      /** CPI accounts */
      lendingMarket: marketAddress,
      lendingMarketAuthority: lendingMarketAuth,
      reserveLiquiditySupply: reserve.state.liquidity.supplyVault,
      reserveCollateralMint: reserve.state.collateral.mintPubkey,
      klendProgram: this._kaminoLendProgramId,
      instructionSysvarAccount: SYSVAR_INSTRUCTIONS_ADDRESS,
      reserveCollateralTokenProgram: TOKEN_PROGRAM_ADDRESS,
    };

    let withdrawPendingFeesIxn = withdrawPendingFees(
      withdrawPendingFeesAccounts,
      undefined,
      this._kaminoVaultProgramId
    );

    const vaultReserves = this.getVaultReserves(vaultState);
    withdrawPendingFeesIxn = this.appendRemainingAccountsForVaultReserves(
      withdrawPendingFeesIxn,
      vaultReserves,
      vaultReservesMap
    );

    return withdrawPendingFeesIxn;
  }

  /**
   * Sync a vault for lookup table; create and set the LUT for the vault if needed and fill it with all the needed accounts
   * @param authority - vault admin
   * @param vault - the vault to sync and set the LUT for if needed
   * @param vaultReservesMap - hashmap from each reserve pubkey to the reserve state
   * @returns a struct that contains a list of ix to create the LUT and assign it to the vault if needed + a list of ixs to insert all the accounts in the LUT
   */
  async syncVaultLookupTableIxs(
    authority: TransactionSigner,
    vault: KaminoVault,
    slot: Slot,
    vaultReservesMap: Map<Address, KaminoReserve>
  ): Promise<SyncVaultLUTIxs> {
    const vaultState = await vault.getState();
    const allAccountsToBeInserted = [
      vault.address,
      vaultState.vaultAdminAuthority,
      vaultState.baseVaultAuthority,
      vaultState.tokenMint,
      vaultState.tokenVault,
      vaultState.sharesMint,
      vaultState.tokenProgram,
      this._kaminoLendProgramId,
    ];

    vaultState.vaultAllocationStrategy.forEach((allocation) => {
      allAccountsToBeInserted.push(allocation.reserve);
      allAccountsToBeInserted.push(allocation.ctokenVault);
    });

    vaultReservesMap.forEach((reserve) => {
      allAccountsToBeInserted.push(reserve.state.lendingMarket);
      allAccountsToBeInserted.push(reserve.state.farmCollateral);
      allAccountsToBeInserted.push(reserve.state.farmDebt);
      allAccountsToBeInserted.push(reserve.state.liquidity.supplyVault);
      allAccountsToBeInserted.push(reserve.state.liquidity.feeVault);
      allAccountsToBeInserted.push(reserve.state.collateral.mintPubkey);
      allAccountsToBeInserted.push(reserve.state.collateral.supplyVault);
    });

    if (vaultState.vaultFarm !== DEFAULT_PUBLIC_KEY) {
      allAccountsToBeInserted.push(vaultState.vaultFarm);
    }

    const setupLUTIfNeededIxs: Instruction[] = [];
    let lut = vaultState.vaultLookupTable;
    if (lut === DEFAULT_PUBLIC_KEY) {
      const [ix, address] = await initLookupTableIx(authority, slot);
      setupLUTIfNeededIxs.push(ix);
      lut = address;

      // set the new LUT for the vault
      const updateVaultConfigIxs = await this.updateVaultConfigIxs(
        vault,
        new VaultConfigField.LookupTable(),
        lut.toString(),
        vaultReservesMap
      );
      setupLUTIfNeededIxs.push(updateVaultConfigIxs.updateVaultConfigIx);
    }

    const ixs: Instruction[] = [];
    let overriddenExistentAccounts: Address[] | undefined = undefined;
    if (vaultState.vaultLookupTable === DEFAULT_PUBLIC_KEY) {
      overriddenExistentAccounts = [];
    }
    ixs.push(
      ...(await insertIntoLookupTableIxs(
        this.getConnection(),
        authority,
        lut,
        allAccountsToBeInserted,
        overriddenExistentAccounts
      ))
    );

    return {
      setupLUTIfNeededIxs,
      syncLUTIxs: ixs,
    };
  }

  private getReserveAccountsToInsertInLut(reserveState: Reserve): Address[] {
    return [
      reserveState.lendingMarket,
      reserveState.farmCollateral,
      reserveState.farmDebt,
      reserveState.liquidity.mintPubkey,
      reserveState.liquidity.supplyVault,
      reserveState.liquidity.feeVault,
      reserveState.collateral.mintPubkey,
      reserveState.collateral.supplyVault,
    ];
  }

  /**
   * Computes the maximum vault-token lamports a vault can invest into a reserve,
   * capped by both the vault allocation cap and the reserve deposit cap.
   * @param vault - the vault to compute the investment for
   * @param reserve - the reserve to compute the investment for
   * @param slot - needed to compute the exchange rate at this slot
   * @returns the maximum vault-token lamports that can be invested into the reserve
   */
  async getMaxInvestableFromVaultInReserve(vault: KaminoVault, reserve: KaminoReserve, slot: Slot): Promise<Decimal> {
    const vaultState = await vault.getState();
    const reserveState = reserve.state;
    const targetReserveAllocation = vaultState.vaultAllocationStrategy.find(
      (allocation) => allocation.reserve === reserve.address
    );
    if (!targetReserveAllocation) {
      throw new Error(`Target reserve ${reserve.address} not found in vault allocation strategy`);
    }

    const tokenAllocationCapLamportsStr = targetReserveAllocation.tokenAllocationCap.toString();
    const targetReserveExchangeRate = reserve.getEstimatedCollateralExchangeRate(slot, 0);
    const targetCtokenAllocationCapLamports =
      targetReserveAllocation.ctokenAllocationCap === undefined
        ? undefined
        : new Decimal(targetReserveAllocation.ctokenAllocationCap.toString());
    const targetLiquidityAllocationCapLamports = getEffectiveLiquidityAllocationCap(
      new Decimal(tokenAllocationCapLamportsStr),
      isCtokenAllocationCapUncapped(targetCtokenAllocationCapLamports)
        ? undefined
        : ctokenAllocationCapLamportsToLiquidityLamports(targetCtokenAllocationCapLamports, targetReserveExchangeRate)
    );
    const investedLiquidityLamports = KaminoReserve.cTokensToLiquidity(
      new Decimal(targetReserveAllocation.ctokenAllocation.toString()),
      targetReserveExchangeRate
    );
    const maxInvestableLamportsUntilAllocationCap = targetLiquidityAllocationCapLamports.eq(new Decimal(U64_MAX))
      ? new Decimal(U64_MAX)
      : targetLiquidityAllocationCapLamports.sub(investedLiquidityLamports).gt(0)
      ? targetLiquidityAllocationCapLamports.sub(investedLiquidityLamports)
      : new Decimal(0);

    const reserveTotalSupply = reserve.getEstimatedTotalSupply(slot, 0);
    const depositLimitStr = reserveState.config.depositLimit.toString();
    const reserveTotalCap = new Decimal(depositLimitStr);
    // U64_MAX means unlimited, so don't constrain by reserve cap
    const maxInvestableInTargetReserveBasedOnReserveCap =
      depositLimitStr === U64_MAX
        ? new Decimal(U64_MAX)
        : reserveTotalCap.sub(reserveTotalSupply).gt(0)
        ? reserveTotalCap.sub(reserveTotalSupply)
        : new Decimal(0);

    // return the min of the two
    return Decimal.min(maxInvestableLamportsUntilAllocationCap, maxInvestableInTargetReserveBasedOnReserveCap);
  }

  /** Read total vault holdings and reserve weights, then compute target liquidity token units per reserve.
   * @param vaultState - the vault state to calculate the allocation for
   * @param slot - the slot for which to calculate the allocation
   * @param vaultReserves - a hashmap from each reserve pubkey to the reserve state
   * @param currentSlot - latest confirmed slot
   * @returns target unallocated and per-reserve amounts in token units, not lamports
   */
  async getVaultComputedReservesAllocation(
    vaultState: VaultState,
    slot: Slot,
    vaultReserves: Map<Address, KaminoReserve>,
    currentSlot: Slot
  ): Promise<VaultComputedAllocation> {
    const vaultReservesState = vaultReserves;
    // 1. Read the states
    const holdings = await this.getVaultHoldings(vaultState, slot, vaultReservesState, currentSlot);
    const tokenMintDecimals = vaultState.tokenMintDecimals.toNumber();

    // if there are no vault reserves or all have weight 0 everything has to be in Available
    const allReservesPubkeys = this.getVaultReserves(vaultState);
    const reservesAllocations = this.getVaultAllocations(vaultState);
    const allReservesHaveWeight0 = allReservesPubkeys.every((reserve) => {
      const allocation = reservesAllocations.get(reserve);
      return allocation?.targetWeight.isZero();
    });
    if (allReservesPubkeys.length === 0 || allReservesHaveWeight0) {
      const computedHoldings = new Map<Address, Decimal>();
      allReservesPubkeys.forEach((reserve) => {
        computedHoldings.set(reserve, new Decimal(0));
      });
      return {
        targetUnallocatedAmount: holdings.totalAUMIncludingFees.sub(holdings.pendingFees),
        targetReservesAllocation: computedHoldings,
      };
    }

    const initialVaultAllocations = new Map<Address, ReserveAllocationForCompute>();
    reservesAllocations.forEach((allocation, reserve) => {
      let collateralExchangeRate: Decimal | undefined;
      if (!isCtokenAllocationCapUncapped(allocation.ctokenAllocationCapLamports)) {
        const reserveState = vaultReservesState.get(reserve);
        if (reserveState === undefined) {
          throw new Error(`Reserve ${reserve} not found in vault reserves map`);
        }

        collateralExchangeRate = reserveState.getEstimatedCollateralExchangeRate(slot, 0);
      }

      initialVaultAllocations.set(
        reserve,
        toReserveAllocationForCompute(allocation, tokenMintDecimals, collateralExchangeRate)
      );
    });

    // 2. Compute the allocation
    const totalInvestableInStandardReserves = await this.getTotalInvestableInStandardReserves(
      vaultState,
      slot,
      vaultReservesState,
      currentSlot,
      holdings
    );

    return computeReservesAllocation(
      totalInvestableInStandardReserves,
      new Decimal(vaultState.unallocatedWeight.toString()),
      lamportsToDecimal(new Decimal(vaultState.unallocatedTokensCap.toString()), tokenMintDecimals),
      initialVaultAllocations,
      tokenMintDecimals
    );
  }

  /**
   * This method returns the user shares balance for a given vault
   * @param user - user to calculate the shares balance for
   * @param vault - vault to calculate shares balance for
   * @returns - user share balance in tokens (not lamports)
   */
  async getUserSharesBalanceSingleVault(user: Address, vault: KaminoVault): Promise<UserSharesForVault> {
    const vaultState = await vault.getState();

    const userShares: UserSharesForVault = {
      unstakedShares: new Decimal(0),
      stakedShares: new Decimal(0),
      totalShares: new Decimal(0),
    };

    const userSharesTokenAccounts = await getAllStandardTokenProgramTokenAccounts(this.getConnection(), user);

    const userSharesTokenAccount = userSharesTokenAccounts.filter((tokenAccount) => {
      const accountData = tokenAccount.account.data;
      const mint = getTokenAccountMint(accountData);
      return mint === vaultState.sharesMint;
    });
    userShares.unstakedShares = userSharesTokenAccount.reduce((acc, tokenAccount) => {
      const accountData = tokenAccount.account.data;
      const amount = getTokenAccountAmount(accountData);
      if (amount !== null) {
        return acc.add(new Decimal(amount));
      }
      return acc;
    }, new Decimal(0));

    const farmAddresses = [vaultState.vaultFarm, vaultState.firstLossCapitalFarm].filter(
      (farmAddress) => farmAddress !== DEFAULT_PUBLIC_KEY
    );
    for (const farmAddress of farmAddresses) {
      const userSharesInFarm = await getUserSharesInTokensStakedInFarm(
        this.getConnection(),
        user,
        farmAddress,
        vaultState.sharesMintDecimals.toNumber()
      );
      userShares.stakedShares = userShares.stakedShares.add(userSharesInFarm);
    }

    userShares.totalShares = userShares.unstakedShares.add(userShares.stakedShares);
    return userShares;
  }

  /**
   * This method returns the user shares balance for all existing vaults
   * @param user - user to calculate the shares balance for
   * @param [vaultsOverride] - the kamino vaults if already fetched, in order to reduce rpc calls.Optional
   * @returns - hash map with keys as vault address and value as user share balance in decimal (not lamports)
   */
  async getUserSharesBalanceAllVaults(
    user: Address,
    vaultsOverride?: Array<KaminoVault>
  ): Promise<Map<Address, UserSharesForVault>> {
    const vaults = vaultsOverride ? vaultsOverride : await this.getAllVaults();

    // read all user shares stake in vault farms
    const farmClient = new Farms(this.getConnection(), this._farmsProgramId);
    const allUserFarmStates = await farmClient.getAllUserStatesForUser(user);
    const allUserFarmStatesMap = new Map<Address, UserState>();
    allUserFarmStates.forEach((userFarmState) => {
      allUserFarmStatesMap.set(userFarmState.userState.farmState, userFarmState.userState);
    });
    // stores vault address for each userSharesAta
    const vaultUserShareBalance = new Map<Address, UserSharesForVault>();

    const allUserTokenAccounts = await getAllStandardTokenProgramTokenAccounts(this.getConnection(), user);
    const userSharesTokenAccountsPerVault = new Map<
      Address,
      AccountInfoWithPubkey<AccountInfoBase & AccountInfoWithJsonData>[]
    >();
    for (const vault of vaults) {
      const state = vault.state;
      if (!state) {
        throw new Error(`Vault ${vault.address} not fetched`);
      }

      const userSharesTokenAccounts = allUserTokenAccounts.filter((tokenAccount) => {
        const accountData = tokenAccount.account.data;
        const mint = getTokenAccountMint(accountData);
        return mint === state.sharesMint;
      });
      userSharesTokenAccountsPerVault.set(vault.address, userSharesTokenAccounts);

      const stakedShares = [state.vaultFarm, state.firstLossCapitalFarm]
        .filter((farmAddress) => farmAddress !== DEFAULT_PUBLIC_KEY)
        .reduce((acc, farmAddress) => {
          const userFarmState = allUserFarmStatesMap.get(farmAddress);
          if (!userFarmState) {
            return acc;
          }

          return acc.add(getSharesInFarmUserPosition(userFarmState, state.sharesMintDecimals.toNumber()));
        }, new Decimal(0));
      if (stakedShares.gt(0)) {
        const userSharesBalance = vaultUserShareBalance.get(vault.address);
        if (userSharesBalance) {
          userSharesBalance.stakedShares = stakedShares;
          userSharesBalance.totalShares = userSharesBalance.unstakedShares.add(userSharesBalance.stakedShares);
          vaultUserShareBalance.set(vault.address, userSharesBalance);
        } else {
          vaultUserShareBalance.set(vault.address, {
            unstakedShares: new Decimal(0),
            stakedShares,
            totalShares: stakedShares,
          });
        }
      }
    }

    userSharesTokenAccountsPerVault.forEach((userSharesTokenAccounts, vaultAddress) => {
      userSharesTokenAccounts.forEach((userSharesTokenAccount) => {
        let userSharesForVault = vaultUserShareBalance.get(vaultAddress);
        if (!userSharesForVault) {
          userSharesForVault = {
            unstakedShares: new Decimal(0),
            stakedShares: new Decimal(0),
            totalShares: new Decimal(0),
          };
        }

        if (!userSharesTokenAccount) {
          vaultUserShareBalance.set(vaultAddress, userSharesForVault);
        } else {
          const accountData = userSharesTokenAccount.account.data;
          const amount = getTokenAccountAmount(accountData);
          if (amount !== null) {
            userSharesForVault.unstakedShares = new Decimal(amount);
            userSharesForVault.totalShares = userSharesForVault.unstakedShares.add(userSharesForVault.stakedShares);
            vaultUserShareBalance.set(vaultAddress, userSharesForVault);
          }
        }
      });
    });

    return vaultUserShareBalance;
  }

  /**
   * This method returns the management and performance fee percentages
   * @param vaultState - vault to retrieve the fees percentages from
   * @returns - VaultFeesPct containing management and performance fee percentages
   */
  getVaultFeesPct(vaultState: VaultState): VaultFeesPct {
    return {
      managementFeePct: bpsToPct(new Decimal(vaultState.managementFeeBps.toString())),
      performanceFeePct: bpsToPct(new Decimal(vaultState.performanceFeeBps.toString())),
    };
  }

  /**
   * This method calculates the token per share value. This will always change based on interest earned from the vault, but calculating it requires a bunch of rpc requests. Caching this for a short duration would be optimal
   * @param vaultState - vault state to calculate tokensPerShare for
   * @param slot - the slot at which we retrieve the tokens per share
   * @param vaultReservesMap - hashmap from each reserve pubkey to the reserve state
   * @param currentSlot - latest confirmed slot
   * @returns - token per share value
   */
  async getTokensPerShareSingleVault(
    vaultOrState: KaminoVault | VaultState,
    slot: Slot,
    vaultReservesMap: Map<Address, KaminoReserve>,
    currentSlot: Slot
  ): Promise<Decimal> {
    // Determine if we have a KaminoVault or VaultState
    const vaultState = 'getState' in vaultOrState ? await vaultOrState.getState() : vaultOrState;
    return this.computeTokensPerShare(vaultState, slot, vaultReservesMap, currentSlot);
  }

  /** Synchronous version of {@link getTokensPerShareSingleVault}; computes the token per share value from the provided states without any RPC call */
  computeTokensPerShare(
    vaultState: VaultState,
    slot: Slot,
    vaultReservesMap: Map<Address, KaminoReserve>,
    currentSlot: Slot
  ): Decimal {
    if (vaultState.sharesIssued.isZero()) {
      return new Decimal(0);
    }

    const sharesDecimal = lamportsToDecimal(
      vaultState.sharesIssued.toString(),
      vaultState.sharesMintDecimals.toString()
    );

    const holdings = this.computeVaultHoldings(vaultState, slot, vaultReservesMap, currentSlot);
    const netAUM = holdings.totalAUMIncludingFees.sub(holdings.pendingFees);

    return netAUM.div(sharesDecimal);
  }

  /**
   * Estimate the shares received for depositing a token amount, computed from the provided states without any RPC call.
   * Mirrors the on-chain computation and rounding: shares = floor(sharesIssued * tokenLamports / ceil(aumLamports)) after
   * deducting the crank funds, or 1:1 in lamports when no shares were issued yet. The AUM includes the vault rewards
   * vested until now, mirroring the rewards refresh the program runs before pricing the deposit, and the deposited
   * amount is clamped to the remaining vault deposit cap the same way the program clamps it.
   * The result is still an estimate: the actual mint uses on-chain state at execution time (interest accrual and reward
   * vesting grow the AUM and lower the shares out), so discount a slippage when using it as `minSharesOut`.
   * @param vaultState - the vault state to estimate the shares for
   * @param tokenAmount - token amount to be deposited, in decimals
   * @param slot - current slot, used to estimate the interest earned in the reserves the vault is invested in
   * @param vaultReservesMap - hashmap from each reserve pubkey to the reserve state
   * @param [slippageBps] - optional slippage to discount from the estimated shares, in bps. Defaults to 0 (no discount)
   * @returns - the estimated amount of shares received for the deposit, in decimals
   */
  estimateSharesFromTokens(
    vaultState: VaultState,
    tokenAmount: Decimal,
    slot: Slot,
    vaultReservesMap: Map<Address, KaminoReserve>,
    slippageBps: number = 0
  ): Decimal {
    if (!(slippageBps >= 0 && slippageBps <= FullBPSDecimal.toNumber())) {
      throw new Error(`Invalid slippageBps ${slippageBps}, it must be between 0 and 10_000`);
    }
    const tokenDecimals = vaultState.tokenMintDecimals.toNumber();
    const sharesDecimals = vaultState.sharesMintDecimals.toNumber();

    // the deposit reserves crank funds out of the deposited amount before minting shares; the program
    // only charges them for allocations with a non-default reserve, positive weight and positive cap
    const reservesWithAllocation = vaultState.vaultAllocationStrategy.filter(
      (allocation) =>
        allocation.reserve !== DEFAULT_PUBLIC_KEY &&
        allocation.targetAllocationWeight.gtn(0) &&
        allocation.tokenAllocationCap.gtn(0)
    ).length;
    const crankFundsLamports = new Decimal(vaultState.crankFundFeePerReserve.toString()).mul(reservesWithAllocation);
    const tokensForSharesLamports = numberToLamportsDecimal(tokenAmount, tokenDecimals).floor().sub(crankFundsLamports);
    if (tokensForSharesLamports.lte(0)) {
      return new Decimal(0);
    }

    const depositCapLamports = new Decimal(vaultState.depositCap.toString());
    let sharesOut: Decimal;
    if (vaultState.sharesIssued.isZero()) {
      // the first deposit mints shares 1:1 with the deposited token lamports; with no shares issued
      // the vault AUM is zero, so the remaining deposit capacity is the whole cap (0 means uncapped)
      const cappedTokensForSharesLamports = depositCapLamports.isZero()
        ? tokensForSharesLamports
        : Decimal.min(tokensForSharesLamports, depositCapLamports);
      sharesOut = lamportsToDecimal(cappedTokensForSharesLamports, sharesDecimals);
    } else {
      const holdings = this.computeVaultHoldings(vaultState, slot, vaultReservesMap, slot);
      // mirror the on-chain rewards refresh that runs before the deposit share pricing: pending vault
      // rewards vest into tokenAvailable, raising the AUM. The fees charged at execution are not
      // simulated on purpose: they lower the AUM, so leaving them out keeps the estimate a lower bound
      const { rewardPerSecond, lastIssuanceTs, rewardsAvailable } = vaultState.rewardInfo;
      let vestedRewardsLamports = new Decimal(0);
      if (rewardPerSecond.gtn(0) && rewardsAvailable.gtn(0) && !lastIssuanceTs.isZero()) {
        const secondsSinceLastIssuance = Decimal.max(
          new Decimal(Date.now()).div(1000).floor().sub(new Decimal(lastIssuanceTs.toString())),
          new Decimal(0)
        );
        vestedRewardsLamports = Decimal.min(
          secondsSinceLastIssuance.mul(new Decimal(rewardPerSecond.toString())),
          new Decimal(rewardsAvailable.toString())
        );
      }
      // mirror the program share mint rounding: the AUM lamports denominator is rounded up and the
      // minted shares are rounded down; use BN math as the intermediary product exceeds Decimal precision
      const netAumLamports = numberToLamportsDecimal(
        holdings.totalAUMIncludingFees.sub(holdings.pendingFees),
        tokenDecimals
      )
        .add(vestedRewardsLamports)
        .ceil();
      if (netAumLamports.lte(0)) {
        throw new Error('Vault AUM is zero, cannot estimate the shares to receive');
      }
      // mirror get_max_depositable_in_vault: the deposit is clamped to the remaining deposit cap
      // (deposit cap minus the AUM rounded up to lamports; a cap of 0 means uncapped) before the
      // shares are computed
      const cappedTokensForSharesLamports = depositCapLamports.isZero()
        ? tokensForSharesLamports
        : Decimal.min(tokensForSharesLamports, Decimal.max(depositCapLamports.sub(netAumLamports), new Decimal(0)));
      const sharesOutLamports = new BN(vaultState.sharesIssued.toString())
        .mul(new BN(cappedTokensForSharesLamports.toFixed()))
        .div(new BN(netAumLamports.toFixed()));
      sharesOut = lamportsToDecimal(new Decimal(sharesOutLamports.toString()), sharesDecimals);
    }

    return sharesOut.mul(FullBPSDecimal.sub(slippageBps)).div(FullBPSDecimal);
  }

  /**
   * This method calculates the token per share value. This will always change based on interest earned from the vault, but calculating it requires a bunch of rpc requests. Caching this for a short duration would be optimal
   * @param slot - current slot, used to estimate the interest earned in the different reserves with allocation from the vault
   * @param [vaultsOverride] - a list of vaults to get the tokens per share for; if provided with state it will not fetch the state again. Optional
   * @param vaultReservesMap - hashmap from each reserve pubkey to the reserve state
   * @returns - token per share value
   */
  async getTokensPerShareAllVaults(
    slot: Slot,
    vaultsOverride: Array<KaminoVault>,
    vaultReservesMap: Map<Address, KaminoReserve>
  ): Promise<Map<Address, Decimal>> {
    const vaults = vaultsOverride;
    const resolvedReservesMap = vaultReservesMap;
    const vaultTokensPerShare = new Map<Address, Decimal>();
    for (const vault of vaults) {
      const tokensPerShare = await this.getTokensPerShareSingleVault(vault, slot, resolvedReservesMap, slot);
      vaultTokensPerShare.set(vault.address, tokensPerShare);
    }

    return vaultTokensPerShare;
  }

  /**
   * Get all vaults
   * @returns an array of all vaults
   */
  async getAllVaults(): Promise<KaminoVault[]> {
    const filters: (GetProgramAccountsDatasizeFilter | GetProgramAccountsMemcmpFilter)[] = [
      {
        dataSize: BigInt(VaultState.layout.span + 8),
      },
      {
        memcmp: {
          offset: 0n,
          bytes: base58Decoder.decode(VaultState.discriminator) as Base58EncodedBytes,
          encoding: 'base58',
        },
      },
    ];

    return await this.getAllVaultsWithFilter(filters);
  }

  /**
   * Get all vaults for a given token
   * @param token - the token to get all vaults for
   * @returns an array of all vaults for the given token
   */
  async getAllVaultsForToken(token: Address): Promise<Array<KaminoVault>> {
    const filters: (GetProgramAccountsDatasizeFilter | GetProgramAccountsMemcmpFilter)[] = [
      {
        dataSize: BigInt(VaultState.layout.span + 8),
      },
      {
        memcmp: {
          offset: 0n,
          bytes: base58Decoder.decode(VaultState.discriminator) as Base58EncodedBytes,
          encoding: 'base58',
        },
      },
      {
        memcmp: {
          offset: 80n, // tokenMint offset: 8 + 32 + 32 + 8 (discriminator + vaultAdminAuthority + baseVaultAuthority + baseVaultAuthorityBump)
          bytes: token.toString() as Base58EncodedBytes,
          encoding: 'base58',
        },
      },
    ];

    return await this.getAllVaultsWithFilter(filters);
  }

  private async getAllVaultsWithFilter(
    filters: (GetProgramAccountsDatasizeFilter | GetProgramAccountsMemcmpFilter)[]
  ): Promise<Array<KaminoVault>> {
    const kaminoVaults: Array<Account<Buffer>> = await getProgramAccounts(
      this.getConnection(),
      this._kaminoVaultProgramId,
      VaultState.layout.span + 8,
      filters
    );

    return kaminoVaults.map((kaminoVault) => {
      const kaminoVaultAccount = decodeVaultState(kaminoVault.data);
      if (!kaminoVaultAccount) {
        throw Error(`kaminoVault with pubkey ${kaminoVault.address} could not be decoded`);
      }

      return KaminoVault.loadWithClientAndState(this, kaminoVault.address, kaminoVaultAccount);
    });
  }

  /**
   * Get a list of kaminoVaults
   * @param vaults - a list of vaults to get the states for; if not provided, all vaults will be fetched
   * @returns a list of vaults
   */
  async getVaults(vaults?: Array<Address>): Promise<Array<KaminoVault | null>> {
    if (!vaults) {
      vaults = (await this.getAllVaults()).map((x) => x.address);
    }
    const vaultStates = await batchFetch(vaults, (chunk) => this.getVaultsStates(chunk));
    return vaults.map((vault, index) => {
      const state = vaultStates[index];
      return state ? KaminoVault.loadWithClientAndState(this, vault, state) : null;
    });
  }

  /**
   * This will return all the initialized whitelisted reserves accounts, including those that are not whitelisted but just have the PDA initialized
   * @returns a map from mint to the whitelisted reserves for that mint
   */
  async getAllWhitelistedReserves(): Promise<Map<Address, ReserveWhitelistEntry[]>> {
    const whitelistedReserves = await getProgramAccounts(
      this.getConnection(),
      this._kaminoVaultProgramId,
      ReserveWhitelistEntry.layout.span + 8,
      [
        {
          dataSize: BigInt(ReserveWhitelistEntry.layout.span + 8),
        },
        {
          memcmp: {
            offset: 0n,
            bytes: base58Decoder.decode(ReserveWhitelistEntry.discriminator) as Base58EncodedBytes,
            encoding: 'base58',
          },
        },
      ]
    );

    // todo: after release when the account structure is updated optimize the implementation by reading directly the mint from whitelisted account
    const whitelistedReservesMap: Map<Address, ReserveWhitelistEntry> = new Map();
    const reservesSet: Set<Address> = new Set();
    for (const whitelistedReserve of whitelistedReserves) {
      const decodedAcc = decodeReserveWhitelistEntry(whitelistedReserve.data);
      whitelistedReservesMap.set(decodedAcc.reserve, decodedAcc);
      reservesSet.add(decodedAcc.reserve);
    }

    const reservesList: Address[] = Array.from(reservesSet);
    const reservesState = await Reserve.fetchMultiple(this.getConnection(), reservesList, this._kaminoLendProgramId);

    const mintToWhitelistedReservesMap: Map<Address, ReserveWhitelistEntry[]> = new Map();
    const reservesWithState = reservesList.map((reserve, index) => [reserve, reservesState[index]] as const);
    for (const [reserve, reserveState] of reservesWithState) {
      if (!reserveState) {
        continue;
      }
      const mintPubkey = reserveState.liquidity.mintPubkey;
      if (!mintToWhitelistedReservesMap.has(mintPubkey)) {
        mintToWhitelistedReservesMap.set(mintPubkey, []);
      }
      mintToWhitelistedReservesMap.get(mintPubkey)!.push(whitelistedReservesMap.get(reserve)!);
    }

    return mintToWhitelistedReservesMap;
  }

  /**
   * This will return all the whitelisted reserves for the given mint; if a ReserveWhitelistEntry exists it doesn't mean it is whitelisted, the fields of the struct has to be read;
   * If multiple mints are needed it is recommended to call getAllWhitelistedReserves instead;
   * @param mint - the mint to get the whitelisted reserves for
   * @returns a list of whitelisted reserves
   */
  async getAllWhitelistedReservesForMint(mint: Address): Promise<ReserveWhitelistEntry[]> {
    // todo: use the impl below once the account structure is updated
    // const whitelistedReserves = await getProgramAccounts(
    //   this.getConnection(),
    //   this._kaminoVaultProgramId,
    //   ReserveWhitelistEntry.layout.span + 8,
    //   [
    //     {
    //       dataSize: BigInt(ReserveWhitelistEntry.layout.span + 8),
    //     },
    //     {
    //       memcmp: {
    //         offset: 0n,
    //         bytes: base58Decoder.decode(ReserveWhitelistEntry.discriminator) as Base58EncodedBytes,
    //         encoding: 'base58',
    //       },
    //     },
    //     {
    //       memcmp: {
    //         offset: 8n, // tokenMint offset: 8 discriminator
    //         bytes: mint.toString() as Base58EncodedBytes,
    //         encoding: 'base58',
    //       },
    //     },
    //   ]
    // );

    // return whitelistedReserves.map((whitelistedReserve) => decodeReserveWhitelistEntry(whitelistedReserve.data));

    const whitelistedReserves = await this.getAllWhitelistedReserves();
    return whitelistedReserves.get(mint) || [];
  }

  /**
   * This will return all the whitelisted reserves for the given markets
   * @param markets - the markets to get the whitelisted reserves for; if not provided, no whitelisted reserves will be fetched; for getting all whitelisted reserves use getAllWhitelistedReserves
   * @returns a map from market address to a map from reserve address to the whitelisting status
   */
  async getAllWhitelistedReservesForMarkets(
    markets?: KaminoMarket[]
  ): Promise<Map<Address, Map<Address, ReserveWhitelistEntry>>> {
    const whitelistedReservesMap: Map<Address, Map<Address, ReserveWhitelistEntry>> = new Map();
    if (!markets || markets.length === 0) {
      return whitelistedReservesMap;
    }

    // Aggregate all active reserves from provided markets
    const allReserves: KaminoReserve[] = [];
    for (const market of markets) {
      if (market.reservesActive) {
        for (const reserve of market.reservesActive.values()) {
          allReserves.push(reserve);
        }
      }
    }

    const whitelistMap = await this.fetchReservesWhitelistEntries(allReserves);

    // Group by market
    for (const reserve of allReserves) {
      const entry = whitelistMap.get(reserve.address)!;
      if (!whitelistedReservesMap.has(reserve.state.lendingMarket)) {
        whitelistedReservesMap.set(reserve.state.lendingMarket, new Map());
      }
      whitelistedReservesMap.get(reserve.state.lendingMarket)!.set(reserve.address, entry);
    }

    return whitelistedReservesMap;
  }

  /**
   * This will return the whitelisting status for the given reserves
   * @param reserves - the reserves to get the whitelisting status for
   * @returns a map from reserve address to the whitelisting status
   */
  async getReservesWhitelistingStatus(reserves: KaminoReserve[]): Promise<Map<Address, ReserveWhitelistEntry>> {
    return this.fetchReservesWhitelistEntries(reserves);
  }

  /**
   * Fetches the on-chain ReserveWhitelistEntry for each reserve. If the account does not exist,
   * a default entry with whitelistAddAllocation=0 and whitelistInvest=0 is used.
   * @param reserves - the reserves to fetch whitelist entries for
   * @returns a map from reserve address to ReserveWhitelistEntry
   */
  private async fetchReservesWhitelistEntries(reserves: KaminoReserve[]): Promise<Map<Address, ReserveWhitelistEntry>> {
    const whitelistMap = new Map<Address, ReserveWhitelistEntry>();
    if (!reserves || reserves.length === 0) {
      return whitelistMap;
    }

    const allReservesWhitelistPDAs = await getReservesWhitelistPDAs(
      reserves.map((reserve) => reserve.address),
      this._kaminoVaultProgramId
    );

    const accountsArrays = await batchFetch(allReservesWhitelistPDAs, async (chunk) => {
      const response = await this.getConnection().getMultipleAccounts(chunk, { commitment: 'processed' }).send();
      return response.value;
    });

    const allWhitelistEntriesAccounts = accountsArrays.flat();

    for (let i = 0; i < reserves.length; i++) {
      const reserve = reserves[i];
      const accountInfo = allWhitelistEntriesAccounts[i];
      let entry: ReserveWhitelistEntry = new ReserveWhitelistEntry({
        tokenMint: reserve.state.liquidity.mintPubkey,
        reserve: reserve.address,
        whitelistAddAllocation: 0,
        whitelistInvest: 0,
        padding: [],
      });
      if (accountInfo) {
        entry = decodeReserveWhitelistEntry(Buffer.from(accountInfo.data[0], 'base64'));
      }
      whitelistMap.set(reserve.address, entry);
    }

    return whitelistMap;
  }

  /**
   * This will return a map from each vault to the reserves that are not fully whitelisted (allocation + invest) but are part of the vault allocation.
   * Duplicate vaults (by address) are deduplicated.
   * @param vaults - the vaults to get the not whitelisted reserves in allocation for
   * @returns a map from vault address to the list of reserve addresses that are not fully whitelisted
   */
  async getReservesNotWhitelistedInAllocations(vaults: KaminoVault[]): Promise<Map<Address, Address[]>> {
    const result = new Map<Address, Address[]>();
    if (!vaults || vaults.length === 0) {
      return result;
    }

    const dedupedVaults = deduplicateVaults(vaults);
    const { vaultAllocations, whitelistMap } = await this.fetchVaultsAllocationsAndWhitelistStatus(dedupedVaults);

    for (const vault of dedupedVaults) {
      const notWhitelisted: Address[] = [];
      const reservesInAlloc = vaultAllocations.get(vault.address)!;
      for (const reserve of reservesInAlloc.keys()) {
        if (
          whitelistMap.get(reserve)?.whitelistAddAllocation === 0 ||
          whitelistMap.get(reserve)?.whitelistInvest === 0
        ) {
          notWhitelisted.push(reserve);
        }
      }
      result.set(vault.address, notWhitelisted);
    }

    return result;
  }

  /**
   * This will return a map from each vault to the reserves that are not matching the vault whitelisting requirements (allocation and invest) but are part of the vault allocation.
   * Duplicate vaults (by address) are deduplicated.
   * @param vaults - the vaults to get the not whitelisted reserves in allocation for
   * @returns a map from each vault to the reserves that are not whitelisted as requested (allocation + invest) and their whitelisting status
   */
  async getReservesAllocationsNotMatchingVaultWhitelistingRequirements(
    vaults: KaminoVault[]
  ): Promise<Map<Address, Map<Address, ReserveWhitelistEntry>>> {
    const result = new Map<Address, Map<Address, ReserveWhitelistEntry>>();
    if (!vaults || vaults.length === 0) {
      return result;
    }

    const dedupedVaults = deduplicateVaults(vaults);
    const { vaultAllocations, whitelistMap } = await this.fetchVaultsAllocationsAndWhitelistStatus(dedupedVaults);

    for (const vault of dedupedVaults) {
      result.set(vault.address, new Map());

      const vaultState = await vault.getState();
      const vaultRequiresAllocationWhitelisted = vaultState.allowAllocationsInWhitelistedReservesOnly === 1;
      const vaultRequiresInvestWhitelisted = vaultState.allowInvestInWhitelistedReservesOnly === 1;
      if (!vaultRequiresAllocationWhitelisted && !vaultRequiresInvestWhitelisted) {
        continue;
      }

      const reservesInAlloc = vaultAllocations.get(vault.address)!;
      for (const reserve of reservesInAlloc.keys()) {
        const whitelistEntry = whitelistMap.get(reserve)!;
        const allocationWhitelistedNotMet =
          vaultRequiresAllocationWhitelisted && whitelistEntry.whitelistAddAllocation === 0;
        const investWhitelistedNotMet = vaultRequiresInvestWhitelisted && whitelistEntry.whitelistInvest === 0;
        if (allocationWhitelistedNotMet || investWhitelistedNotMet) {
          result.get(vault.address)!.set(reserve, whitelistEntry);
        }
      }
    }

    return result;
  }

  /**
   * Collects all reserve addresses across vault allocations, initializes their KaminoReserve state,
   * and fetches whitelist entries for all of them. Also caches the per-vault allocation maps to avoid
   * redundant calls.
   * @param vaults - the vaults to collect allocations from
   * @returns the per-vault allocation maps and a global reserve-to-whitelist-entry map
   */
  private async fetchVaultsAllocationsAndWhitelistStatus(vaults: KaminoVault[]): Promise<{
    vaultAllocations: Map<Address, Map<Address, ReserveAllocationOverview>>;
    whitelistMap: Map<Address, ReserveWhitelistEntry>;
  }> {
    const vaultAllocations = new Map<Address, Map<Address, ReserveAllocationOverview>>();
    const allReserveAddresses = new Set<Address>();

    // load all vault states in parallel so vault.getVaultAllocations() below won't do any additional rpc calls
    Promise.all(
      vaults.map(async (vault) => {
        vault.getState();
      })
    );
    for (const vault of vaults) {
      const allocations = await vault.getVaultAllocations();
      vaultAllocations.set(vault.address, allocations);
      for (const reserve of allocations.keys()) {
        allReserveAddresses.add(reserve);
      }
    }

    const reservesAddressList = Array.from(allReserveAddresses);
    const reserves = await Promise.all(
      reservesAddressList.map((reserve) =>
        KaminoReserve.initializeFromAddress(
          reserve,
          this.getConnection(),
          this.recentSlotDurationMs,
          undefined,
          undefined,
          undefined,
          undefined,
          this._kaminoLendProgramId
        )
      )
    );
    const whitelistMap = await this.fetchReservesWhitelistEntries(reserves);

    return { vaultAllocations, whitelistMap };
  }

  private async getVaultsStates(vaults: Address[]): Promise<Array<VaultState | null>> {
    return await VaultState.fetchMultiple(this.getConnection(), vaults, this._kaminoVaultProgramId);
  }

  /// Fetch the states for the vaults that do not have the state fetched yet
  async getMissingVaultsStates(vaults: KaminoVault[]): Promise<Array<KaminoVault>> {
    // some of the vaults may already have the state fetched, so we need to check for that
    const vaultsWithExistentState = vaults.filter((vault) => vault.state !== undefined);
    const vaultsToFetch = vaults.filter((vault) => vault.state === undefined).map((vault) => vault.address);
    const fetchedVaults = await this.getVaults(vaultsToFetch);

    return [...vaultsWithExistentState, ...fetchedVaults.filter((vault) => vault !== null)];
  }

  /**
   * Computes the referral fee in basis points for a given reserve based on the protocol take rate
   * and the absolute referral rate.
   * @param reserve - the reserve to compute referral fee bps for
   * @returns the referral fee in basis points
   */
  getReserveReferralFeeBps(reserve: KaminoReserve): number {
    const protocolTakeRate = reserve.state.config.protocolTakeRatePct / 100;
    if (protocolTakeRate <= 0) {
      return 0;
    }

    return new Fraction(reserve.state.liquidity.absoluteReferralRateSf)
      .toDecimal()
      .div(protocolTakeRate)
      .floor()
      .toNumber();
  }

  getSuppliedInReserve(vaultState: VaultState, slot: Slot, reserve: KaminoReserve): Decimal {
    const referralFeeBps = this.getReserveReferralFeeBps(reserve);
    const reserveCollExchangeRate = reserve.getEstimatedCollateralExchangeRate(slot, referralFeeBps);

    const reserveAllocation = vaultState.vaultAllocationStrategy.find(
      (allocation) => allocation.reserve === reserve.address
    );
    if (!reserveAllocation) {
      throw new Error(`Reserve ${reserve.address} not found in vault allocation strategy`);
    }

    const reserveAllocationLiquidityAmountLamports = KaminoReserve.cTokensToLiquidity(
      new Decimal(reserveAllocation.ctokenAllocation.toString()),
      reserveCollExchangeRate
    );
    const reserveAllocationLiquidityAmount = lamportsToDecimal(
      reserveAllocationLiquidityAmountLamports,
      vaultState.tokenMintDecimals.toNumber()
    );
    return reserveAllocationLiquidityAmount;
  }

  /**
   * This will return the a map between reserve pubkey and the pct of the vault invested amount in each reserve
   * @param vaultState - the kamino vault to get reserves distribution for
   * @returns a map between reserve pubkey and the allocation pct for the reserve
   */
  getAllocationsDistribuionPct(vaultState: VaultState): Map<Address, Decimal> {
    const allocationsDistributionPct = new Map<Address, Decimal>();
    let totalAllocation = new Decimal(0);

    const filteredAllocations = vaultState.vaultAllocationStrategy.filter(
      (allocation) => allocation.reserve !== DEFAULT_PUBLIC_KEY
    );
    filteredAllocations.forEach((allocation) => {
      totalAllocation = totalAllocation.add(new Decimal(allocation.targetAllocationWeight.toString()));
    });

    filteredAllocations.forEach((allocation) => {
      allocationsDistributionPct.set(
        allocation.reserve,
        new Decimal(allocation.targetAllocationWeight.toString()).mul(new Decimal(100)).div(totalAllocation)
      );
    });

    return allocationsDistributionPct;
  }

  /**
   * Returns reserve allocation overview values from vault state.
   * Caps and current ctoken allocations are raw on-chain lamports.
   * @param vaultState - the kamino vault to get reserves allocation overview for
   * @returns a map between reserve pubkey and the allocation overview for the reserve
   */
  getVaultAllocations(vaultState: VaultState): Map<Address, ReserveAllocationOverview> {
    const vaultAllocations = new Map<Address, ReserveAllocationOverview>();

    vaultState.vaultAllocationStrategy.map((allocation) => {
      if (allocation.reserve === DEFAULT_PUBLIC_KEY) {
        return;
      }

      const tokenAllocationCapLamports = new Decimal(allocation.tokenAllocationCap.toString());
      const ctokenAllocationCapLamports =
        allocation.ctokenAllocationCap === undefined
          ? undefined
          : new Decimal(allocation.ctokenAllocationCap.toString());
      const ctokenAllocationLamports = new Decimal(allocation.ctokenAllocation.toString());
      const allocationOverview: ReserveAllocationOverview = {
        targetWeight: new Decimal(allocation.targetAllocationWeight.toString()),
        tokenAllocationCapLamports,
        ctokenAllocationCapLamports,
        ctokenAllocationLamports,
        tokenAllocationCap: tokenAllocationCapLamports,
        ctokenAllocationCap: ctokenAllocationCapLamports,
        ctokenAllocation: ctokenAllocationLamports,
      };
      vaultAllocations.set(allocation.reserve, allocationOverview);
    });

    return vaultAllocations;
  }

  /**
   * Returns an unsorted hash map of all reserves that the given vault has allocations for, together with the amount
   * that can be withdrawn from each of the reserves (capped by reserve available liquidity).
   * @param vaultState - the preloaded vault state
   * @param slot - current slot
   * @param vaultReservesMap - a hashmap from each reserve pubkey to the reserve state
   * @returns a Map of reserves (key) with the amount available to withdraw for each (value), in lamports
   */
  async getReserveAllocationAvailableLiquidityToWithdraw(
    vaultState: VaultState,
    slot: Slot,
    vaultReservesMap: Map<Address, KaminoReserve>
  ): Promise<Map<Address, Decimal>> {
    const reserveAllocationAvailableLiquidityToWithdraw = new Map<Address, Decimal>();
    vaultState.vaultAllocationStrategy.forEach((allocationStrategy) => {
      if (allocationStrategy.reserve === DEFAULT_PUBLIC_KEY) {
        return;
      }
      const reserve = vaultReservesMap.get(allocationStrategy.reserve);
      if (reserve === undefined) {
        throw new Error(`Reserve ${allocationStrategy.reserve} not found`);
      }
      const referralFeeBps = this.getReserveReferralFeeBps(reserve);
      const reserveCollExchangeRate = reserve.getEstimatedCollateralExchangeRate(slot, referralFeeBps);
      const reserveAllocationLiquidityAmount = KaminoReserve.cTokensToLiquidity(
        new Decimal(allocationStrategy.ctokenAllocation.toString()),
        reserveCollExchangeRate
      );
      const reserveAvailableLiquidityAmount = reserve.getFreelyAvailableLiquidityAmount(slot, referralFeeBps);
      reserveAllocationAvailableLiquidityToWithdraw.set(
        allocationStrategy.reserve,
        Decimal.min(reserveAllocationLiquidityAmount, reserveAvailableLiquidityAmount)
      );
    });

    return reserveAllocationAvailableLiquidityToWithdraw;
  }

  /**
   * Plans a share exit using only the supplied vault and reserve states; this method performs no RPC calls.
   * All returned share and token amounts are integer lamports.
   * The penalty and net fields are computed once on the aggregate gross amount, while the program
   * charges the penalty per withdraw instruction — for exits split across multiple reserves they
   * understate the total penalty and overstate the received amount.
   * @param withdrawalPenalties - effective vault/global penalties computed from preloaded state
   */
  async getShareExitLiquidityPlan(
    vaultState: VaultState,
    slot: Slot,
    vaultReservesMap: Map<Address, KaminoReserve>,
    requestedShareTokens: Decimal,
    totalUserShareTokens: Decimal,
    tokensPerShare: Decimal,
    withdrawalPenalties: WithdrawPenalties
  ): Promise<ShareExitLiquidityPlan> {
    const { sharesToUse, exitAll: burnAllUserShares } = KaminoVaultClient.resolveSharesForExit(
      requestedShareTokens,
      totalUserShareTokens,
      vaultState.sharesMintDecimals.toNumber()
    );
    const actualShareTokensToWithdraw = Decimal.min(sharesToUse, totalUserShareTokens);
    const shareLamportsToWithdraw = collToLamportsDecimal(
      actualShareTokensToWithdraw,
      vaultState.sharesMintDecimals.toNumber()
    ).floor();
    const grossTokenLamportsToWithdraw = shareLamportsToWithdraw.mul(tokensPerShare).floor();
    const instantWithdrawPlan = KaminoVaultClient.buildInstantWithdrawPlan(
      grossTokenLamportsToWithdraw,
      withdrawalPenalties,
      new Decimal(0)
    );
    const netTokenLamportsToWithdraw = instantWithdrawPlan.netAmount;
    const availableTokenLamportsToWithdraw = Decimal.min(
      netTokenLamportsToWithdraw,
      new Decimal(vaultState.tokenAvailable.toString())
    );
    let remainingNetTokenLamportsToWithdraw = netTokenLamportsToWithdraw.sub(availableTokenLamportsToWithdraw);
    const reserveTokenLamportsToWithdraw = new Map<Address, Decimal>();

    if (remainingNetTokenLamportsToWithdraw.gt(0)) {
      const reserveWithdrawable = await this.getReserveAllocationAvailableLiquidityToWithdraw(
        vaultState,
        slot,
        vaultReservesMap
      );
      const executableReserveWithdrawable =
        KaminoVaultClient.getExecutableReserveWithdrawLiquidityMap(reserveWithdrawable);
      const sortedReserves = [...executableReserveWithdrawable.entries()].sort((a, b) => b[1].sub(a[1]).toNumber());

      for (const [reserve, executableLiquidityLamports] of sortedReserves) {
        if (remainingNetTokenLamportsToWithdraw.lte(0)) {
          break;
        }
        const reserveTokenLamports = Decimal.min(
          remainingNetTokenLamportsToWithdraw,
          executableLiquidityLamports
        ).floor();
        if (reserveTokenLamports.gt(0)) {
          reserveTokenLamportsToWithdraw.set(reserve, reserveTokenLamports);
          remainingNetTokenLamportsToWithdraw = remainingNetTokenLamportsToWithdraw.sub(reserveTokenLamports);
        }
      }
    }

    return {
      shareLamportsToWithdraw,
      grossTokenLamportsToWithdraw,
      withdrawalPenaltyLamports: instantWithdrawPlan.withdrawalPenalty,
      netTokenLamportsToWithdraw,
      availableTokenLamportsToWithdraw,
      reserveTokenLamportsToWithdraw,
      remainingNetTokenLamportsToWithdraw,
      burnAllUserShares,
      canBurnAllUserShares:
        burnAllUserShares &&
        totalUserShareTokens.gt(0) &&
        netTokenLamportsToWithdraw.gt(0) &&
        remainingNetTokenLamportsToWithdraw.lte(0),
    };
  }

  /**
   * Get the vault's cToken allocation per reserve in liquidity terms (without capping by reserve available liquidity).
   * This represents the total invested value in each reserve, regardless of how much liquidity the reserve currently has.
   */
  private async getReserveAllocationLiquidity(
    vaultState: VaultState,
    slot: Slot,
    vaultReservesMap: Map<Address, KaminoReserve>
  ): Promise<Map<Address, Decimal>> {
    const result = new Map<Address, Decimal>();
    vaultState.vaultAllocationStrategy.forEach((allocationStrategy) => {
      if (allocationStrategy.reserve === DEFAULT_PUBLIC_KEY) {
        return;
      }
      const reserve = vaultReservesMap.get(allocationStrategy.reserve);
      if (reserve === undefined) {
        throw new Error(`Reserve ${allocationStrategy.reserve} not found`);
      }
      const referralFeeBps = this.getReserveReferralFeeBps(reserve);
      const reserveCollExchangeRate = reserve.getEstimatedCollateralExchangeRate(slot, referralFeeBps);
      const reserveAllocationLiquidityAmount = KaminoReserve.cTokensToLiquidity(
        new Decimal(allocationStrategy.ctokenAllocation.toString()),
        reserveCollExchangeRate
      );
      result.set(allocationStrategy.reserve, reserveAllocationLiquidityAmount);
    });

    return result;
  }

  /**
   * Read the user's total vault shares: unstaked (in ATA) + optionally staked in the selected farm.
   * All values are in token units (not lamports).
   */
  async getUserSharesState(
    user: Address,
    vaultState: VaultState,
    selectedFarmAddress?: Address
  ): Promise<{ userSharesAta: Address; ataBalance: Decimal; farmBalance: Decimal; totalShares: Decimal }> {
    const userSharesAta = await getAssociatedTokenAddress(vaultState.sharesMint, user);
    let ataBalance = new Decimal(0);
    const userSharesAtaState = await fetchMaybeToken(this.getConnection(), userSharesAta);
    if (userSharesAtaState.exists) {
      const balanceLamports = getTokenBalanceFromAccountInfoLamports(userSharesAtaState);
      ataBalance = balanceLamports.div(new Decimal(10).pow(vaultState.sharesMintDecimals.toString()));
    }

    let farmBalance = new Decimal(0);
    if (this.hasFarmAddress(selectedFarmAddress)) {
      farmBalance = await getUserSharesInTokensStakedInFarm(
        this.getConnection(),
        user,
        selectedFarmAddress,
        vaultState.sharesMintDecimals.toNumber()
      );
    }

    return { userSharesAta, ataBalance, farmBalance, totalShares: ataBalance.add(farmBalance) };
  }

  /**
   * Clamp the requested share amount to the user's total and determine if exiting all shares.
   * When exiting all, the share amount is set to U64_MAX (in token units) so the on-chain program
   * burns everything rather than leaving dust.
   */
  static resolveSharesForExit(
    requestedShares: Decimal,
    totalUserShares: Decimal,
    sharesMintDecimals: number
  ): { sharesToUse: Decimal; exitAll: boolean } {
    if (requestedShares.gte(totalUserShares)) {
      return {
        sharesToUse: new Decimal(U64_MAX).div(new Decimal(10).pow(sharesMintDecimals)),
        exitAll: true,
      };
    }
    return { sharesToUse: requestedShares, exitAll: false };
  }

  private static simulatePostWithdrawUserSharesState(
    userSharesState: UserSharesState,
    shareAmountToUnstake: Decimal,
    shareAmountToWithdraw: Decimal,
    sharesMintDecimals: number
  ): UserSharesState {
    const { sharesToUse: sharesToUnstake, exitAll: unstakeAllShares } = KaminoVaultClient.resolveSharesForExit(
      shareAmountToUnstake,
      userSharesState.totalShares,
      sharesMintDecimals
    );
    const unstakedShares = unstakeAllShares
      ? userSharesState.farmBalance
      : Decimal.min(
          userSharesState.farmBalance,
          Decimal.max(new Decimal(0), sharesToUnstake.sub(userSharesState.ataBalance))
        );
    const ataBalanceAfterUnstake = userSharesState.ataBalance.add(unstakedShares);
    const burnedShares = Decimal.min(shareAmountToWithdraw, ataBalanceAfterUnstake);

    return {
      userSharesAta: userSharesState.userSharesAta,
      ataBalance: Decimal.max(new Decimal(0), ataBalanceAfterUnstake.sub(burnedShares)),
      farmBalance: Decimal.max(new Decimal(0), userSharesState.farmBalance.sub(unstakedShares)),
      totalShares: Decimal.max(new Decimal(0), userSharesState.totalShares.sub(burnedShares)),
    };
  }

  private hasFarmAddress(farmAddress: Address | null | undefined): farmAddress is Address {
    return !!farmAddress && farmAddress !== DEFAULT_PUBLIC_KEY;
  }

  private requireConfiguredFarmState(
    farmState: FarmState | null | undefined,
    farmAddress: Address,
    farmLabel: string
  ): FarmState {
    if (!farmState) {
      throw new Error(
        `${farmLabel} farm state is required for configured farm ${farmAddress}. Load it explicitly before building instructions.`
      );
    }

    return farmState;
  }

  private resolveSelectedSharesFarm(
    vaultState: VaultState,
    farmState: FarmState | null | undefined,
    flcFarmState: FarmState | null | undefined
  ): { farmAddress: Address; farmState: FarmState; isFlcFarm: boolean } | null {
    if (farmState && flcFarmState) {
      throw new Error(
        'Vault farm state and first loss capital farm state cannot both be provided. Only one farm can be used at a time.'
      );
    }

    if (farmState) {
      if (!this.hasFarmAddress(vaultState.vaultFarm)) {
        throw new Error('This vault does not have a vault farm configured.');
      }

      return {
        farmAddress: vaultState.vaultFarm,
        farmState: this.requireConfiguredFarmState(farmState, vaultState.vaultFarm, 'vault'),
        isFlcFarm: false,
      };
    }

    if (flcFarmState) {
      if (!this.hasFarmAddress(vaultState.firstLossCapitalFarm)) {
        throw new Error('This vault does not have a first loss capital farm configured.');
      }

      return {
        farmAddress: vaultState.firstLossCapitalFarm,
        farmState: this.requireConfiguredFarmState(flcFarmState, vaultState.firstLossCapitalFarm, 'first loss capital'),
        isFlcFarm: true,
      };
    }

    return null;
  }

  /**
   * Build farm unstake + withdraw ixs if the user needs shares from the farm.
   * Returns an array of ixs (create ATA idempotent, unstake, withdraw) or empty if not needed.
   */
  async buildFarmUnstakeIxsIfNeeded(
    user: TransactionSigner,
    vaultState: VaultState,
    selectedFarm: { farmAddress: Address; farmState: FarmState; isFlcFarm: boolean } | null,
    sharesToUse: Decimal,
    ataBalance: Decimal,
    farmBalance: Decimal,
    exitAll: boolean,
    payer?: TransactionSigner
  ): Promise<Instruction[]> {
    if (!selectedFarm || sharesToUse.lte(ataBalance) || farmBalance.lte(0)) {
      return [];
    }

    const ixs: Instruction[] = [];

    // Ensure shares ATA exists for the unstaked shares to land in
    const [{ createAtaIx }] = await createAtasIdempotent(
      user,
      [{ mint: vaultState.sharesMint, tokenProgram: TOKEN_PROGRAM_ADDRESS }],
      payer
    );
    ixs.push(createAtaIx);

    let shareLamportsToWithdraw = new Decimal(U64_MAX);
    if (!exitAll) {
      const sharesToWithdrawFromFarm = sharesToUse.sub(ataBalance);
      shareLamportsToWithdraw = collToLamportsDecimal(
        sharesToWithdrawFromFarm,
        vaultState.sharesMintDecimals.toNumber()
      );
    }

    const unstakeAndWithdrawIxs = await getFarmUnstakeAndWithdrawIxs(
      this.getConnection(),
      user,
      shareLamportsToWithdraw,
      selectedFarm.farmAddress,
      selectedFarm.farmState,
      this._farmsProgramId
    );
    ixs.push(unstakeAndWithdrawIxs.unstakeIx);
    ixs.push(unstakeAndWithdrawIxs.withdrawIx);

    return ixs;
  }

  private static shouldCloseSharesAtaAfterRedeem(
    redeemAllShares: boolean,
    reserveWithSharesToRedeem: { sharesAmount: BN }[]
  ): boolean {
    if (!redeemAllShares) {
      return false;
    }

    // Closing the ATA is only safe when the redeem plan explicitly uses U64_MAX,
    // which is the SDK-side signal that the final on-chain redeem leg can burn the full balance.
    return reserveWithSharesToRedeem.some(({ sharesAmount }) => sharesAmount.eq(new BN(U64_MAX)));
  }

  private static getPlannedInstantWithdrawExecution(
    shareLamportsToExit: Decimal,
    tokensToExit: Decimal,
    totalAvailableForWithdraw: Decimal,
    tokensPerShare: Decimal,
    sharesMintDecimals: number
  ): {
    plannedShareLamportsToWithdraw: Decimal;
    plannedSharesToWithdraw: Decimal;
    requestedGrossWithdrawAmount: Decimal;
    canFullyWithdraw: boolean;
  } {
    const canFullyWithdraw = tokensToExit.lte(totalAvailableForWithdraw);
    const plannedShareLamportsToWithdraw = canFullyWithdraw
      ? Decimal.max(shareLamportsToExit.floor(), new Decimal(0))
      : Decimal.max(totalAvailableForWithdraw.mul(new Decimal(1).div(tokensPerShare)).floor(), new Decimal(0));
    const shareLamportsPrecision = new Decimal(10).pow(sharesMintDecimals);

    return {
      plannedShareLamportsToWithdraw,
      plannedSharesToWithdraw: plannedShareLamportsToWithdraw.div(shareLamportsPrecision),
      requestedGrossWithdrawAmount: plannedShareLamportsToWithdraw.mul(tokensPerShare).floor(),
      canFullyWithdraw,
    };
  }

  private static getExecutableReserveWithdrawLiquidity(availableLiquidity: Decimal): Decimal {
    // Vault withdraw rounds cTokens up before the KLend redeem CPI, so planning exactly at
    // reserve free-liquidity capacity can ask KLend for one extra lamport and fail.
    return Decimal.max(
      availableLiquidity.floor().sub(RESERVE_WITHDRAW_LIQUIDITY_ROUNDING_BUFFER_LAMPORTS),
      new Decimal(0)
    );
  }

  private static getExecutableReserveWithdrawLiquidityMap(
    reserveWithdrawable: Map<Address, Decimal>
  ): Map<Address, Decimal> {
    const result = new Map<Address, Decimal>();
    for (const [reserve, availableLiquidity] of reserveWithdrawable) {
      result.set(reserve, KaminoVaultClient.getExecutableReserveWithdrawLiquidity(availableLiquidity));
    }
    return result;
  }

  private static getExecutableEnqueueCtokenAmount(ctokenAmount: BN): BN {
    // Enqueue instructions are built before the redeem transaction executes, so the cToken amount
    // is an estimate. Keep one cToken as dust to tolerate redeem-side floor/ceil differences.
    return ctokenAmount.gt(new BN(1)) ? ctokenAmount.sub(new BN(1)) : new BN(0);
  }

  private static resolveWithdrawRedeemSplit(
    sharesToExit: Decimal,
    plannedSharesToWithdraw: Decimal,
    canFullyWithdraw: boolean
  ): {
    sharesToWithdraw: Decimal;
    sharesToRedeem: Decimal;
  } {
    if (canFullyWithdraw) {
      return {
        sharesToWithdraw: sharesToExit,
        sharesToRedeem: new Decimal(0),
      };
    }

    return {
      sharesToWithdraw: plannedSharesToWithdraw,
      sharesToRedeem: sharesToExit.sub(plannedSharesToWithdraw),
    };
  }

  private static buildInstantWithdrawPlan(
    requestedGrossWithdrawAmount: Decimal,
    penalties: WithdrawPenalties,
    minWithdrawAmount: Decimal
  ): InstantWithdrawPlan {
    const grossAmount = Decimal.max(requestedGrossWithdrawAmount.floor(), new Decimal(0));
    if (grossAmount.lte(0)) {
      return {
        grossAmount,
        netAmount: new Decimal(0),
        withdrawalPenalty: new Decimal(0),
        allowed: false,
      };
    }

    const withdrawalPenaltyLamports = Decimal.max(penalties.withdrawalPenaltyLamports.floor(), new Decimal(0));
    const withdrawalPenaltyBps = Decimal.max(penalties.withdrawalPenaltyBps.floor(), new Decimal(0));
    const withdrawalPenalty = Decimal.max(
      grossAmount.mul(withdrawalPenaltyBps).div(FullBPSDecimal).ceil(),
      withdrawalPenaltyLamports
    );

    if (withdrawalPenalty.gte(grossAmount)) {
      return {
        grossAmount,
        netAmount: new Decimal(0),
        withdrawalPenalty,
        allowed: false,
      };
    }

    const netAmount = grossAmount.sub(withdrawalPenalty);

    return {
      grossAmount,
      netAmount,
      withdrawalPenalty,
      // Mirrors the on-chain guard: withdraw fails when net amount is <= min_withdraw_amount.
      allowed: netAmount.gt(minWithdrawAmount),
    };
  }

  private static getEffectiveWithdrawalPenaltyParams(
    vaultState: VaultState,
    globalConfigState: KVaultGlobalConfig
  ): WithdrawPenalties {
    return {
      withdrawalPenaltyLamports: Decimal.max(
        new Decimal(vaultState.withdrawalPenaltyLamports.toString()),
        new Decimal(globalConfigState.withdrawalPenaltyLamports.toString())
      ),
      withdrawalPenaltyBps: Decimal.max(
        new Decimal(vaultState.withdrawalPenaltyBps.toString()),
        new Decimal(globalConfigState.withdrawalPenaltyBps.toString())
      ),
    };
  }

  private static getInstantWithdrawPlan(
    vaultState: VaultState,
    penalties: WithdrawPenalties,
    requestedGrossWithdrawAmount: Decimal
  ): InstantWithdrawPlan {
    return KaminoVaultClient.buildInstantWithdrawPlan(
      requestedGrossWithdrawAmount,
      penalties,
      new Decimal(vaultState.minWithdrawAmount.toString())
    );
  }

  /**
   * Simulate the vault's per-reserve cToken allocation (in liquidity terms) after a withdraw.
   * The on-chain withdraw logic consumes tokenAvailable first, then disinvests from reserves
   * sorted by descending withdrawable liquidity. Each reserve's allocation decreases by the
   * amount actually disinvested from it.
   *
   * Returns the remaining allocation per reserve — this is what's available for redeem-in-kind,
   * since redeem-in-kind transfers cTokens (not liquidity) and only cares about the vault's
   * cToken holdings, not the reserve's available liquidity.
   *
   * @param tokenAvailable - vault's current token_available
   * @param reserveAllocations - per-reserve cToken allocation in liquidity terms (uncapped)
   * @param reserveWithdrawable - per-reserve withdrawable = min(allocation, available liquidity)
   * @param grossTokensWithdrawn - total gross tokens the withdraw drains from the vault
   * (tokenAvailable + reserve disinvestments). This is not the user's net payout: penalties can stay
   * in the vault even though the reserve-side disinvestment already happened.
   */
  static simulatePostWithdrawAllocations(
    tokenAvailable: Decimal,
    reserveAllocations: Map<Address, Decimal>,
    reserveWithdrawable: Map<Address, Decimal>,
    grossTokensWithdrawn: Decimal
  ): Map<Address, Decimal> {
    const result = new Map<Address, Decimal>();
    for (const [addr, alloc] of reserveAllocations) {
      result.set(addr, alloc);
    }

    // Tokens that must come from reserves = total withdraw - what tokenAvailable covers
    let tokensLeftFromReserves = grossTokensWithdrawn.sub(tokenAvailable);
    if (tokensLeftFromReserves.lte(0)) {
      return result; // tokenAvailable covers everything, no allocation change
    }

    // Sort by withdrawable liquidity descending (same order as buildReserveExitIxs)
    const sorted = [...reserveWithdrawable.entries()].sort((a, b) => b[1].sub(a[1]).toNumber());

    for (const [addr, withdrawableLiq] of sorted) {
      if (tokensLeftFromReserves.lte(0)) break;
      const drained = Decimal.min(tokensLeftFromReserves, withdrawableLiq);

      // Reduce allocation by the amount actually disinvested from this reserve
      const currentAlloc = result.get(addr) ?? new Decimal(0);
      result.set(addr, Decimal.max(new Decimal(0), currentAlloc.sub(drained)));
      tokensLeftFromReserves = tokensLeftFromReserves.sub(drained);
    }

    return result;
  }

  private async planRedeemInKindExecution(
    slot: Slot,
    vaultState: VaultState,
    globalConfigState: KVaultGlobalConfig,
    vaultReservesState: Map<Address, KaminoReserve>,
    sharesToRedeem: Decimal,
    redeemAllShares: boolean,
    withdrawalPenalties: WithdrawPenalties,
    postWithdrawLiquidity?: Map<Address, Decimal>
  ): Promise<RedeemInKindExecutionPlan> {
    if (sharesToRedeem.lte(0)) {
      return {
        reservePlans: [],
        coveredShares: new Decimal(0),
      };
    }

    const shareLamportsToRedeem = collToLamportsDecimal(sharesToRedeem, vaultState.sharesMintDecimals.toNumber());
    const tokensPerShare = await this.getTokensPerShareSingleVault(vaultState, slot, vaultReservesState, slot);
    if (tokensPerShare.lte(0)) {
      return {
        reservePlans: [],
        coveredShares: new Decimal(0),
      };
    }

    const sharesPerToken = new Decimal(1).div(tokensPerShare);
    const tokensToRedeem = shareLamportsToRedeem.mul(tokensPerShare);
    const reserveWithSharesToRedeem = await this.getReserveSharesForRedeemInKind(
      vaultState,
      slot,
      vaultReservesState,
      tokensToRedeem,
      sharesPerToken,
      redeemAllShares,
      withdrawalPenalties,
      postWithdrawLiquidity
    );

    const reservePlans: RedeemInKindReservePlan[] = [];
    let remainingShareLamportsForAcceptedPlans = shareLamportsToRedeem.floor();
    for (const reserveWithShares of reserveWithSharesToRedeem) {
      const reserveState = vaultReservesState.get(reserveWithShares.reserve);
      if (!reserveState) {
        throw new Error(`Reserve ${reserveWithShares.reserve} not found in vault reserves map`);
      }

      // U64_MAX is only an execution sentinel for the final on-chain redeem leg.
      // For cToken amount estimation we must use the exact remaining share lamports
      // that will still exist after earlier accepted redeem legs execute.
      const sharesAmountForEstimation = reserveWithShares.sharesAmount.eq(new BN(U64_MAX))
        ? new BN(Decimal.max(remainingShareLamportsForAcceptedPlans, new Decimal(0)).floor().toString())
        : reserveWithShares.sharesAmount;
      const ctokenAmount = await this.getExpectedRedeemInKindCtokenAmount(
        vaultState,
        globalConfigState,
        reserveWithShares.reserve,
        reserveState,
        sharesAmountForEstimation,
        slot,
        vaultReservesState,
        postWithdrawLiquidity
      );

      // Mirror the on-chain min_withdraw_amount guard: redeem_in_kind rejects when
      // the liquidity value of the redeemed cTokens is <= min_withdraw_amount.
      const reserveExchangeRate = reserveState.getEstimatedCollateralExchangeRate(
        slot,
        this.getReserveReferralFeeBps(reserveState)
      );
      const redeemLiquidityValue = KaminoReserve.cTokensToLiquidity(
        new Decimal(ctokenAmount.toString()),
        reserveExchangeRate
      ).floor();
      if (redeemLiquidityValue.lte(new Decimal(vaultState.minWithdrawAmount.toString()))) {
        continue;
      }

      reservePlans.push({
        reserve: reserveWithShares.reserve,
        sharesAmount: reserveWithShares.sharesAmount,
        ctokenAmount,
      });
      remainingShareLamportsForAcceptedPlans = Decimal.max(
        new Decimal(0),
        remainingShareLamportsForAcceptedPlans.sub(new Decimal(sharesAmountForEstimation.toString()))
      );
    }

    return {
      reservePlans,
      coveredShares: KaminoVaultClient.getCoveredSharesFromRedeemPlan(
        reservePlans,
        sharesToRedeem,
        vaultState.sharesMintDecimals.toNumber()
      ),
    };
  }

  private static getCoveredSharesFromRedeemPlan(
    reservePlans: Array<{ sharesAmount: BN }>,
    requestedShares: Decimal,
    sharesMintDecimals: number
  ): Decimal {
    let coveredShares = new Decimal(0);
    for (const reservePlan of reservePlans) {
      if (reservePlan.sharesAmount.eq(new BN(U64_MAX))) {
        return requestedShares;
      }

      coveredShares = coveredShares.add(
        lamportsToDecimal(new Decimal(reservePlan.sharesAmount.toString()), sharesMintDecimals)
      );
    }

    return Decimal.min(coveredShares, requestedShares);
  }

  private static buildGrossRedeemCapacity(redeemLiquidityCapacity: Decimal, penalties: WithdrawPenalties): Decimal {
    if (redeemLiquidityCapacity.lte(0)) {
      return new Decimal(0);
    }

    const denominator = FullBPSDecimal.sub(penalties.withdrawalPenaltyBps);
    const withdrawalPenaltyFromBps = denominator.lte(0)
      ? new Decimal(Number.MAX_SAFE_INTEGER)
      : redeemLiquidityCapacity.mul(penalties.withdrawalPenaltyBps).div(denominator);
    const withdrawalPenalty = Decimal.max(withdrawalPenaltyFromBps, penalties.withdrawalPenaltyLamports);

    return redeemLiquidityCapacity.add(withdrawalPenalty);
  }

  private async getExpectedRedeemInKindCtokenAmount(
    vaultState: VaultState,
    globalConfigState: KVaultGlobalConfig,
    reserveAddress: Address,
    reserveState: KaminoReserve,
    sharesAmountLamports: BN,
    slot: Slot,
    vaultReservesState: Map<Address, KaminoReserve>,
    postWithdrawLiquidity?: Map<Address, Decimal>
  ): Promise<BN> {
    const holdings = await this.getVaultHoldings(vaultState, slot, vaultReservesState, slot);
    const currentVaultAum = collToLamportsDecimal(
      holdings.totalAUMIncludingFees.sub(holdings.pendingFees),
      vaultState.tokenMintDecimals.toNumber()
    );
    const totalSharesSupply = new Decimal(vaultState.sharesIssued.toString());
    const sharesToRedeem = new Decimal(sharesAmountLamports.toString());

    const totalLiquidityForUserWithPenalty = totalSharesSupply.eq(sharesToRedeem)
      ? currentVaultAum
      : currentVaultAum.mul(sharesToRedeem).div(totalSharesSupply);
    const penaltyLamports = Decimal.max(
      new Decimal(vaultState.withdrawalPenaltyLamports.toString()),
      new Decimal(globalConfigState.withdrawalPenaltyLamports.toString())
    );
    const penaltyBps = Decimal.max(
      new Decimal(vaultState.withdrawalPenaltyBps.toString()),
      new Decimal(globalConfigState.withdrawalPenaltyBps.toString())
    );
    const withdrawalPenalty = Decimal.max(
      totalLiquidityForUserWithPenalty.mul(penaltyBps).div(FullBPSDecimal),
      penaltyLamports
    );
    const totalLiquidityForUser = totalLiquidityForUserWithPenalty.sub(withdrawalPenalty);

    const reserveExchangeRate = reserveState.getEstimatedCollateralExchangeRate(
      slot,
      this.getReserveReferralFeeBps(reserveState)
    );
    const reserveCtokensOwned = postWithdrawLiquidity
      ? KaminoReserve.liquidityToCTokens(
          postWithdrawLiquidity.get(reserveAddress) ?? new Decimal(0),
          reserveExchangeRate
        ).floor()
      : new Decimal(
          this.getVaultAllocations(vaultState).get(reserveAddress)?.ctokenAllocationLamports.toString() ?? '0'
        );

    const ctokensToSendToUser = Decimal.min(
      KaminoReserve.liquidityToCTokens(totalLiquidityForUser, reserveExchangeRate).floor(),
      reserveCtokensOwned
    );

    return new BN(Decimal.max(ctokensToSendToUser, new Decimal(0)).floor().toString());
  }
  /**
   * Compute how many shares to redeem from each reserve, sorted by descending redeemable amount.
   * The planner uses each reserve's gross redeem capacity, derived from the reserve's net cToken
   * allocation plus the withdrawal penalty that stays in the vault.
   * @param reserveAllocationLiquidityOverride - if provided, uses this map (of per-reserve net allocation
   *   liquidity) instead of reading on-chain state. Used by withdrawAndRedeemInKindIfNeededIxs to pass
   *   simulated post-withdraw allocations.
   */
  private async getReserveSharesForRedeemInKind(
    vaultState: VaultState,
    slot: Slot,
    vaultReservesState: Map<Address, KaminoReserve>,
    tokensToRedeem: Decimal,
    sharesPerToken: Decimal,
    redeemAllShares: boolean,
    withdrawalPenalties: WithdrawPenalties,
    reserveAllocationLiquidityOverride?: Map<Address, Decimal>
  ): Promise<{ reserve: Address; sharesAmount: BN }[]> {
    const reserveAllocationLiquidity =
      reserveAllocationLiquidityOverride ??
      (await this.getReserveAllocationLiquidity(vaultState, slot, vaultReservesState));
    const reserveRedeemCapacity = new Map<Address, Decimal>();
    reserveAllocationLiquidity.forEach((allocationLiquidity, reserve) => {
      reserveRedeemCapacity.set(
        reserve,
        KaminoVaultClient.buildGrossRedeemCapacity(allocationLiquidity, withdrawalPenalties)
      );
    });

    const sortedReserves = [...reserveRedeemCapacity.entries()]
      .sort((a, b) => b[1].sub(a[1]).toNumber())
      .map(([addr]) => addr);

    const result: { reserve: Address; sharesAmount: BN }[] = [];
    let tokensLeftToRedeem = tokensToRedeem;

    for (const reserveAddr of sortedReserves) {
      if (tokensLeftToRedeem.lte(0)) break;
      const redeemCapacity = reserveRedeemCapacity.get(reserveAddr)!;
      if (redeemCapacity.lte(0)) {
        continue;
      }

      const tokensFromThisReserve = Decimal.min(tokensLeftToRedeem, redeemCapacity);
      if (redeemAllShares && tokensLeftToRedeem.lte(redeemCapacity)) {
        result.push({ reserve: reserveAddr, sharesAmount: new BN(U64_MAX) });
      } else {
        result.push({
          reserve: reserveAddr,
          sharesAmount: new BN(tokensFromThisReserve.mul(sharesPerToken).floor().toString()),
        });
      }
      tokensLeftToRedeem = tokensLeftToRedeem.sub(tokensFromThisReserve);
    }

    return result;
  }

  /**
   * Get the list of all reserve pubkeys that the vault has allocations for
   * @param vault - the vault state to load reserves for
   * @returns a hashmap from each reserve pubkey to the reserve state
   */
  getVaultReserves(vault: VaultState): Address[] {
    return vault.vaultAllocationStrategy
      .filter((vaultAllocation) => vaultAllocation.reserve !== DEFAULT_PUBLIC_KEY)
      .map((vaultAllocation) => vaultAllocation.reserve);
  }

  /**
   * This will load the onchain state for all the reserves that the vault has allocations for
   * @param vaultState - the vault state to load reserves for
   * @returns a hashmap from each reserve pubkey to the reserve state
   */
  async loadVaultReserves(vaultState: VaultState): Promise<Map<Address, KaminoReserve>> {
    return this.loadVaultsReserves([vaultState]);
  }

  private async loadDeserializedReserves(vaultReservesAddresses: Address[]) {
    if (vaultReservesAddresses.length === 0) {
      return [];
    }
    const reserveAccounts = await this.getConnection()
      .getMultipleAccounts(vaultReservesAddresses, { commitment: 'processed' })
      .send();
    return reserveAccounts.value.map((reserve, i) => {
      if (reserve === null) {
        // maybe reuse old here
        throw new Error(`Reserve account ${vaultReservesAddresses[i]} was not found`);
      }
      const reserveAccount = Reserve.decode(Buffer.from(reserve.data[0], 'base64'));
      if (!reserveAccount) {
        throw Error(`Could not parse reserve ${vaultReservesAddresses[i]}`);
      }
      return {
        address: vaultReservesAddresses[i],
        state: reserveAccount,
      };
    });
  }

  /**
   * This will load the onchain state for all the reserves that the vaults have allocations for, deduplicating the reserves
   * @param vaults - the vault states to load reserves for
   * @param oracleAccounts (optional) all reserve oracle accounts, if not supplied will make an additional rpc call to fetch these accounts
   * @returns a hashmap from each reserve pubkey to the reserve state
   */
  async loadVaultsReserves(
    vaults: VaultState[],
    oracleAccounts?: AllOracleAccounts
  ): Promise<Map<Address, KaminoReserve>> {
    const vaultReservesAddressesSet = new Set<Address>(vaults.flatMap((vault) => this.getVaultReserves(vault)));
    const vaultReservesAddresses = [...vaultReservesAddressesSet];
    const deserializedReserves = await batchFetch(vaultReservesAddresses, (chunk) =>
      this.loadDeserializedReserves(chunk)
    );
    const unconfiguredReserve = deserializedReserves.find(({ state }) => !hasOracleConfigured(state));
    if (unconfiguredReserve) {
      throw new Error(
        `Could not load ${getUnconfiguredOracleReserveMessage(unconfiguredReserve.address, unconfiguredReserve.state)}`
      );
    }
    const [reservesAndOracles, cdnResourcesData, rewardsAprBpsByMarket] = await Promise.all([
      getTokenOracleData(this.getConnection(), deserializedReserves, oracleAccounts),
      kaminoCdn.getData(),
      fetchReserveRewardsMaxAprBpsByMarket(
        this.getConnection(),
        deserializedReserves.map((reserve) => reserve.state.lendingMarket),
        this._kaminoLendProgramId
      ),
    ]);
    const kaminoReserves = new Map<Address, KaminoReserve>();
    reservesAndOracles.forEach(([{ address: reserveAddress, state: reserve }, oracle]) => {
      if (!oracle) {
        throw Error(
          `Could not find oracle for ${parseTokenSymbol(
            reserve.config.tokenInfo.name
          )} (${reserveAddress}) reserve in market ${reserve.lendingMarket}`
        );
      }
      const kaminoReserve = KaminoReserve.initialize(
        reserveAddress,
        reserve,
        oracle,
        this.getConnection(),
        this.recentSlotDurationMs,
        rewardsAprBpsByMarket.get(reserve.lendingMarket)!,
        cdnResourcesData,
        undefined,
        this._kaminoLendProgramId
      );
      kaminoReserves.set(kaminoReserve.address, kaminoReserve);
    });

    return kaminoReserves;
  }

  /**
   * Batch-load all farm states referenced by the given vault states (vault farm, FLC farm).
   * The caller can cache the returned map and pass individual entries to methods like
   * getVaultRewardsAPY or getVaultFlcFarmStats to avoid per-vault FarmState.fetch() calls.
   * @param vaultStates - vault states to collect farm addresses from
   * @returns a map from farm address to FarmState (only includes farms that exist on-chain)
   */
  async loadVaultFarmStates(
    vaultStates: VaultState[],
    vaultReservesMap?: Map<Address, KaminoReserve>
  ): Promise<Map<Address, FarmState>> {
    const farmAddresses = new Set<Address>();
    for (const vault of vaultStates) {
      if (this.hasFarmAddress(vault.vaultFarm)) {
        farmAddresses.add(vault.vaultFarm);
      }
      if (this.hasFarmAddress(vault.firstLossCapitalFarm)) {
        farmAddresses.add(vault.firstLossCapitalFarm);
      }
    }

    if (vaultReservesMap) {
      for (const reserve of vaultReservesMap.values()) {
        if (this.hasFarmAddress(reserve.state.farmCollateral)) {
          farmAddresses.add(reserve.state.farmCollateral);
        }
      }
    }

    // also collect delegated farms from CDN
    const delegatedFarmsMap = await this.getVaultsWithDelegatedFarm();
    for (const [, farmAddr] of delegatedFarmsMap) {
      farmAddresses.add(farmAddr);
    }

    const addresses = [...farmAddresses];
    if (addresses.length === 0) {
      return new Map();
    }

    // getMultipleAccounts is limited to 100 addresses per request
    const farmStates = await batchFetch(addresses, (chunk) => fetchAllMaybeFarmState(this.getConnection(), chunk));
    const result = new Map<Address, FarmState>();
    farmStates.forEach((state, i) => {
      if (state.exists) {
        result.set(addresses[i], state.data);
      }
    });
    return result;
  }

  /**
   * Load the FarmState for a single vault. Returns null if the vault has no farm or the farm doesn't exist on chain.
   * The caller can cache and pass the result to depositIxs / withdrawIxs / etc. to avoid per-call FarmState.fetch().
   * @param vaultState - the vault state to load the farm for
   * @returns FarmState if the vault has a farm, null otherwise
   */
  async loadVaultFarmState(vaultState: VaultState): Promise<FarmState | null> {
    if (!this.hasFarmAddress(vaultState.vaultFarm)) {
      return null;
    }
    const farmState = await fetchFarmStateOrNull(this.getConnection(), vaultState.vaultFarm);
    return farmState ?? null;
  }

  /**
   * Load KaminoMarket instances for all unique lending markets referenced by the given reserves.
   * The caller can cache the returned map and pass it to getVaultCollaterals / getVaultOverview
   * to avoid per-reserve KaminoMarket.load() calls.
   * @param vaultReservesMap - the reserves map (as returned by loadVaultReserves / loadVaultsReserves)
   * @returns a map from lending market address to KaminoMarket
   */
  async loadKaminoMarketsForVaultReserves(
    vaultReservesMap: Map<Address, KaminoReserve>
  ): Promise<Map<Address, KaminoMarket>> {
    const marketReservesMap = new Map<Address, Map<Address, KaminoReserve>>();
    for (const reserve of vaultReservesMap.values()) {
      const marketAddress = reserve.state.lendingMarket;
      const marketReserves = marketReservesMap.get(marketAddress) ?? new Map<Address, KaminoReserve>();
      marketReserves.set(reserve.address, reserve);
      marketReservesMap.set(marketAddress, marketReserves);
    }

    return KaminoMarket.loadMultipleWithReserves(
      this.getConnection(),
      [...marketReservesMap.keys()],
      marketReservesMap,
      DEFAULT_RECENT_SLOT_DURATION_MS,
      this._kaminoLendProgramId,
      this._farmsProgramId
    );
  }

  /**
   * Pre-load the KVault global config. Can be called once and the result passed to methods like getVaultOverview and getVaultWithdrawPenalties.
   * @returns the KVaultGlobalConfig state
   */
  async loadKVaultGlobalConfig(): Promise<KVaultGlobalConfig> {
    const globalConfig = await KVaultGlobalConfig.fetch(
      this.getConnection(),
      await getKvaultGlobalConfigPda(this.getProgramID())
    );
    if (!globalConfig) {
      throw new Error('KVault Global config not found');
    }
    return globalConfig;
  }

  /**
   * This will retrieve all the tokens that can be used as collateral by the users who borrow the token in the vault alongside details about the min and max loan to value ratio
   * @param vaultState - the vault state to load reserves for
   * @param _slot - required for API compatibility; currently unused
   * @param vaultReservesMap - hashmap from each reserve pubkey to the reserve state
   * @param [kaminoMarkets] - a map from lending market address to KaminoMarket. If provided the function will be significantly faster as it will not have to fetch the markets
   * @returns a hashmap from each reserve pubkey to the market overview of the collaterals that can be used and the min and max loan to value ratio in that market
   */
  async getVaultCollaterals(
    vaultState: VaultState,
    _slot: Slot,
    vaultReservesMap: Map<Address, KaminoReserve>,
    kaminoMarkets: Map<Address, KaminoMarket>
  ): Promise<Map<Address, MarketOverview>> {
    const vaultReservesState: KaminoReserve[] = [];
    // filter the reserves that are not part of the vault allocation strategy
    vaultState.vaultAllocationStrategy.forEach((allocation) => {
      if (allocation.reserve === DEFAULT_PUBLIC_KEY) {
        return;
      }
      const reserve = vaultReservesMap.get(allocation.reserve);
      if (!reserve) {
        throw new Error(`Reserve ${allocation.reserve} not found in provided vaultReservesMap`);
      }

      vaultReservesState.push(reserve);
    });

    const vaultCollateralsPerReserve: Map<Address, MarketOverview> = new Map();

    for (const reserve of vaultReservesState) {
      const lendingMarket: KaminoMarket | undefined = kaminoMarkets.get(reserve.state.lendingMarket);

      if (!lendingMarket) {
        throw Error(`Lending market ${reserve.state.lendingMarket} not found in provided kaminoMarkets map`);
      }

      const marketReserves = lendingMarket.getReserves();
      const marketOverview: MarketOverview = {
        address: reserve.state.lendingMarket,
        reservesAsCollateral: [],
        minLTVPct: new Decimal(0),
        maxLTVPct: new Decimal(100),
      };

      marketReserves
        .filter((marketReserve) => {
          return (
            marketReserve.state.config.liquidationThresholdPct > 0 &&
            marketReserve.address !== reserve.address &&
            marketReserve.state.config.status === 0
          );
        })
        .map((filteredReserve) => {
          const reserveAsCollateral: ReserveAsCollateral = {
            mint: filteredReserve.getLiquidityMint(),
            address: filteredReserve.address,
            liquidationLTVPct: new Decimal(filteredReserve.state.config.liquidationThresholdPct),
          };
          marketOverview.reservesAsCollateral.push(reserveAsCollateral);
          if (reserveAsCollateral.liquidationLTVPct.lt(marketOverview.minLTVPct) || marketOverview.minLTVPct.eq(0)) {
            marketOverview.minLTVPct = reserveAsCollateral.liquidationLTVPct;
          }
          if (reserveAsCollateral.liquidationLTVPct.gt(marketOverview.maxLTVPct) || marketOverview.maxLTVPct.eq(0)) {
            marketOverview.maxLTVPct = reserveAsCollateral.liquidationLTVPct;
          }
        });

      vaultCollateralsPerReserve.set(reserve.address, marketOverview);
    }

    return vaultCollateralsPerReserve;
  }

  /**
   * This will return an VaultHoldings object which contains the amount available (uninvested) in vault, total amount invested in reseves and a breakdown of the amount invested in each reserve
   * @param vault - the kamino vault to get available liquidity to withdraw for
   * @param slot - the slot for which to calculate the holdings
   * @param vaultReserves - a hashmap from each reserve pubkey to the reserve state
   * @param currentSlot - latest confirmed slot
   * @returns an VaultHoldings object representing the amount available (uninvested) in vault, total amount invested in reseves and a breakdown of the amount invested in each reserve
   */
  async getVaultHoldings(
    vault: VaultState,
    slot: Slot,
    vaultReserves: Map<Address, KaminoReserve>,
    currentSlot: Slot
  ): Promise<VaultHoldings> {
    return this.computeVaultHoldings(vault, slot, vaultReserves, currentSlot);
  }

  /** Synchronous version of {@link getVaultHoldings}; computes the holdings from the provided states without any RPC call */
  computeVaultHoldings(
    vault: VaultState,
    slot: Slot,
    vaultReserves: Map<Address, KaminoReserve>,
    currentSlot: Slot
  ): VaultHoldings {
    const vaultHoldings: VaultHoldings = new VaultHoldings({
      available: new Decimal(vault.tokenAvailable.toString()),
      invested: new Decimal(0),
      investedInReserves: new Map<Address, Decimal>(),
      queuedForWithdrawalForReserves: new Map<Address, Decimal>(),
      totalAUMIncludingFees: new Decimal(0),
      pendingFees: new Decimal(0),
    });

    const currentSlotToUse = currentSlot;
    const vaultReservesState = vaultReserves;
    const decimals = new Decimal(vault.tokenMintDecimals.toString());

    vault.vaultAllocationStrategy.forEach((allocationStrategy) => {
      if (allocationStrategy.reserve === DEFAULT_PUBLIC_KEY) {
        return;
      }

      const reserve = vaultReservesState.get(allocationStrategy.reserve);
      if (reserve === undefined) {
        throw new Error(`Reserve ${allocationStrategy.reserve} not found`);
      }

      const reserveCollExchangeRate = reserve.getEstimatedCollateralExchangeRate(slot, 0);
      const reserveAllocationLiquidityAmount = KaminoReserve.cTokensToLiquidity(
        new Decimal(allocationStrategy.ctokenAllocation.toString()),
        reserveCollExchangeRate
      );

      vaultHoldings.invested = vaultHoldings.invested.add(reserveAllocationLiquidityAmount);
      vaultHoldings.investedInReserves.set(
        allocationStrategy.reserve,
        lamportsToDecimal(reserveAllocationLiquidityAmount, decimals)
      );
      vaultHoldings.queuedForWithdrawalForReserves.set(allocationStrategy.reserve, new Decimal(0));
    });

    const currentPendingFees = new Fraction(vault.pendingFeesSf).toDecimal();
    let totalPendingFees = currentPendingFees;

    // if there is a slot passed and it is in the future we need to estimate the fees from current time until that moment
    if (slot > currentSlotToUse) {
      const currentTimestampSec = new Date().getTime() / 1000;
      const timeAtPassedSlot =
        currentTimestampSec + Number.parseInt((slot - currentSlotToUse).toString()) * this.recentSlotDurationMs;
      const timeUntilPassedSlot = timeAtPassedSlot - currentTimestampSec;

      const managementFeeFactor = new Decimal(timeUntilPassedSlot)
        .mul(new Decimal(vault.managementFeeBps.toString()))
        .div(new Decimal(SECONDS_PER_YEAR))
        .div(FullBPSDecimal);
      const prevAUM = lamportsToDecimal(new Fraction(vault.prevAumSf).toDecimal(), vault.tokenMintDecimals.toNumber());
      const simulatedMgmtFee = prevAUM.mul(managementFeeFactor);
      totalPendingFees = totalPendingFees.add(simulatedMgmtFee);

      const simulatedEarnedInterest = vaultHoldings.invested
        .add(vaultHoldings.available)
        .sub(prevAUM)
        .sub(simulatedMgmtFee);
      const simulatedPerformanceFee = simulatedEarnedInterest
        .mul(new Decimal(vault.performanceFeeBps.toString()))
        .div(FullBPSDecimal);
      totalPendingFees = totalPendingFees.add(simulatedPerformanceFee);
    }

    const totalAvailableDecimal = lamportsToDecimal(vaultHoldings.available, decimals);
    const totalInvestedDecimal = lamportsToDecimal(vaultHoldings.invested, decimals);
    const pendingFees = lamportsToDecimal(totalPendingFees, decimals);
    return new VaultHoldings({
      available: totalAvailableDecimal,
      invested: totalInvestedDecimal,
      investedInReserves: vaultHoldings.investedInReserves,
      queuedForWithdrawalForReserves: vaultHoldings.queuedForWithdrawalForReserves,
      totalAUMIncludingFees: totalAvailableDecimal.add(totalInvestedDecimal),
      pendingFees: pendingFees,
    });
  }

  /**
   * This will return the total amount of liquidity that can be invested in reserves.
   * @param vault - the kamino vault to get available liquidity to withdraw for
   * @param slot - the slot for which to calculate the holdings
   * @param vaultReserves - a hashmap from each reserve pubkey to the reserve state
   * @param currentSlot - latest confirmed slot
   * @param [vaultHoldings] - the holdings of the vault. Optional. If provided the function will be  faster as it will not have to fetch the holdings
   * @returns the total amount of liquidity that can be invested in standard reserves
   */
  async getTotalInvestableInStandardReserves(
    vault: VaultState,
    slot: Slot,
    vaultReserves: Map<Address, KaminoReserve>,
    currentSlot: Slot,
    vaultHoldings?: VaultHoldings
  ): Promise<Decimal> {
    const vaultReservesState = vaultReserves;
    const totalHoldings = vaultHoldings
      ? vaultHoldings
      : await this.getVaultHoldings(vault, slot, vaultReservesState, currentSlot);
    return totalHoldings.totalAUMIncludingFees.sub(totalHoldings.pendingFees);
  }

  /**
   * This will return a VaultHoldingsWithUSDValue object with the token and USD-denominated holdings for the vault
   * @param vault - the kamino vault to get available liquidity to withdraw for
   * @param price - the price of the token in the vault (e.g. USDC)
   * @param slot - the slot for which to calculate the holdings
   * @param vaultReservesMap - hashmap from each reserve pubkey to the reserve state
   * @param currentSlot - latest confirmed slot
   * @returns a VaultHoldingsWithUSDValue object with details about the tokens available and invested in the vault, denominated in tokens and USD
   */
  async getVaultHoldingsWithPrice(
    vault: VaultState,
    price: Decimal,
    slot: Slot,
    vaultReservesMap: Map<Address, KaminoReserve>,
    currentSlot: Slot
  ): Promise<VaultHoldingsWithUSDValue> {
    const holdings = await this.getVaultHoldings(vault, slot, vaultReservesMap, currentSlot);

    const investedInReservesUSD = new Map<Address, Decimal>();
    holdings.investedInReserves.forEach((amount, reserve) => {
      investedInReservesUSD.set(reserve, amount.mul(price));
    });
    return {
      holdings: holdings,
      availableUSD: holdings.available.mul(price),
      investedUSD: holdings.invested.mul(price),
      investedInReservesUSD: investedInReservesUSD,
      totalUSDIncludingFees: holdings.totalAUMIncludingFees.mul(price),
      pendingFeesUSD: holdings.pendingFees.mul(price),
    };
  }

  /** Retrieves the maximum instant withdrawable amount for a vault based on the available liquidity in the vault allocations.
   * This includes the vault's uninvested `tokenAvailable` balance plus the per-reserve available liquidity
   * (capped by each reserve's actual available liquidity), returned in lamports.
   * @param vaultState - the kamino vault state to get the maximum instant withdrawable amount for
   * @param slot - current slot
   * @param vaultReservesMap - a hashmap from each reserve pubkey to the reserve state
   * @returns the maximum instant withdrawable amount for the vault, in lamports
   */
  async getMaxInstantWithdrawableAmount(
    vaultState: VaultState,
    slot: Slot,
    vaultReservesMap: Map<Address, KaminoReserve>
  ): Promise<Decimal> {
    const perReserve = await this.getReserveAllocationAvailableLiquidityToWithdraw(vaultState, slot, vaultReservesMap);
    let total = new Decimal(vaultState.tokenAvailable.toString());
    for (const amount of perReserve.values()) {
      total = total.add(amount);
    }
    return total;
  }

  /**
   * This will return an VaultOverview object that encapsulates all the information about the vault, including the holdings, reserves details, theoretical APY, utilization ratio and total borrowed amount
   * @param vault - the kamino vault to get available liquidity to withdraw for
   * @param vaultTokenPrice - the price of the token in the vault (e.g. USDC)
   * @param slot - the slot for which to retrieve the vault overview
   * @param vaultReservesMap - hashmap from each reserve pubkey to the reserve state
   * @param kaminoMarkets - a map of all kamino markets needed by the vault reserves
   * @param currentSlot - latest confirmed slot
   * @param [tokensPrices] - a hashmap from a token pubkey to the price of the token in USD. Optional. If some tokens are not in the map, the function will fetch the price
   * @returns an VaultOverview object with details about the tokens available and invested in the vault, denominated in tokens and USD, along sie APYs
   */
  async getVaultOverview(
    vault: KaminoVault,
    vaultTokenPrice: Decimal,
    slot: Slot,
    vaultReservesMap: Map<Address, KaminoReserve>,
    kaminoMarkets: Map<Address, KaminoMarket>,
    farmsMap: Map<Address, FarmState>,
    farmsClient: FarmsClient,
    globalConfig: KVaultGlobalConfig,
    currentSlot: Slot,
    tokensPrices?: Map<Address, Decimal>
  ): Promise<VaultOverview> {
    const vaultState = await vault.getState();
    const vaultReservesState = vaultReservesMap;

    const vaultHoldingsWithUSDValuePromise = this.getVaultHoldingsWithPrice(
      vaultState,
      vaultTokenPrice,
      slot,
      vaultReservesState,
      currentSlot
    );

    const slotForOverview = currentSlot;

    // Resolve farm states from cache if available
    const vaultFarmState = farmsMap.get(vaultState.vaultFarm) ?? null;
    const flcFarmState = farmsMap.get(vaultState.firstLossCapitalFarm) ?? null;

    const vaultTheoreticalAPYPromise = this.getVaultTheoreticalAPY(vaultState, slotForOverview, vaultReservesState);
    const vaultActualAPYPromise = this.getVaultActualAPY(vaultState, slotForOverview, vaultReservesState);
    const totalInvestedAndBorrowedPromise = this.getTotalBorrowedAndInvested(
      vaultState,
      slotForOverview,
      vaultReservesState
    );
    const vaultCollateralsPromise = this.getVaultCollaterals(
      vaultState,
      slotForOverview,
      vaultReservesState,
      kaminoMarkets
    );
    const reservesOverviewPromise = this.getVaultReservesDetails(vaultState, slotForOverview, vaultReservesState);
    const vaultFarmIncentivesPromise = this.getVaultRewardsAPY(
      vault,
      vaultTokenPrice,
      slotForOverview,
      vaultReservesState,
      farmsClient,
      vaultFarmState,
      currentSlot,
      tokensPrices
    );
    const vaultReservesFarmIncentivesPromise = this.getVaultReservesFarmsIncentives(
      vault,
      vaultTokenPrice,
      slotForOverview,
      farmsClient,
      vaultReservesState,
      tokensPrices
    );
    // Resolve the delegated farm address (CDN lookup, not RPC) and look up its state in farmsMap
    const delegatedFarmAddress = await this.getDelegatedFarmForVault(vault.address);
    const delegatedFarmState = delegatedFarmAddress ? farmsMap.get(delegatedFarmAddress) ?? null : null;
    const vaultDelegatedFarmIncentivesPromise = this.getVaultDelegatedFarmRewardsAPY(
      vault,
      vaultTokenPrice,
      slotForOverview,
      vaultReservesState,
      farmsClient,
      delegatedFarmState,
      currentSlot,
      tokensPrices
    );
    const vaultFlcFarmStatsPromise = this.getVaultFlcFarmStats(vault, farmsClient, flcFarmState);
    const vaultWithdrawPenaltiesPromise = this.getVaultWithdrawPenalties(vault, globalConfig);

    // all the async part of the functions above just read the vaultReservesState which is read beforehand, so excepting vaultCollateralsPromise they should do no additional network calls
    const [
      vaultHoldingsWithUSDValue,
      vaultTheoreticalAPYs,
      vaultActualAPYs,
      totalInvestedAndBorrowed,
      vaultCollaterals,
      reservesOverview,
      vaultFarmIncentives,
      vaultReservesFarmIncentives,
      vaultDelegatedFarmIncentives,
      vaultFlcFarmStats,
      vaultWithdrawPenalties,
    ] = await Promise.all([
      vaultHoldingsWithUSDValuePromise,
      vaultTheoreticalAPYPromise,
      vaultActualAPYPromise,
      totalInvestedAndBorrowedPromise,
      vaultCollateralsPromise,
      reservesOverviewPromise,
      vaultFarmIncentivesPromise,
      vaultReservesFarmIncentivesPromise,
      vaultDelegatedFarmIncentivesPromise,
      vaultFlcFarmStatsPromise,
      vaultWithdrawPenaltiesPromise,
    ]);

    return {
      holdingsUSD: vaultHoldingsWithUSDValue,
      reservesOverview: reservesOverview,
      vaultCollaterals: vaultCollaterals,
      actualSupplyAPY: vaultActualAPYs,
      theoreticalSupplyAPY: vaultTheoreticalAPYs,
      vaultFarmIncentives: vaultFarmIncentives,
      reservesFarmsIncentives: vaultReservesFarmIncentives,
      delegatedFarmIncentives: vaultDelegatedFarmIncentives,
      totalBorrowed: totalInvestedAndBorrowed.totalBorrowed,
      totalBorrowedUSD: totalInvestedAndBorrowed.totalBorrowed.mul(vaultTokenPrice),
      utilizationRatio: totalInvestedAndBorrowed.utilizationRatio,
      totalSupplied: totalInvestedAndBorrowed.totalInvested,
      totalSuppliedUSD: totalInvestedAndBorrowed.totalInvested.mul(vaultTokenPrice),
      flcFarmStats: vaultFlcFarmStats,
      withdrawalPenalties: vaultWithdrawPenalties,
    };
  }

  /**
   * This will return the withdrawal penalties for a vault
   * @param vault - the kamino vault to get the withdrawal penalties for
   * @param globalConfig - the global config to use for the withdrawal penalties. Optional. If not provided, the function will fetch the global config from the connection
   * @returns the withdrawal penalties for the vault, in lamports and bps; for each withdraw the penalty is computed and the bax between fixed amount and bps amount is taken
   */
  async getVaultWithdrawPenalties(vault: KaminoVault, globalConfig: KVaultGlobalConfig): Promise<WithdrawPenalties> {
    const vaultState = await vault.getState();
    const globalConfigState = globalConfig;
    const vaultWithdrawalPenaltyLamports = new Decimal(vaultState.withdrawalPenaltyLamports.toString());
    const globalWithdrawalPenaltyLamports = new Decimal(globalConfigState.withdrawalPenaltyLamports.toString());
    const withdrawalPenaltyLamports = vaultWithdrawalPenaltyLamports.gt(globalWithdrawalPenaltyLamports)
      ? vaultWithdrawalPenaltyLamports
      : globalWithdrawalPenaltyLamports;

    const vaultWithdrawalPenaltyBps = new Decimal(vaultState.withdrawalPenaltyBps.toString());
    const globalWithdrawalPenaltyBps = new Decimal(globalConfigState.withdrawalPenaltyBps.toString());
    const withdrawalPenaltyBps = vaultWithdrawalPenaltyBps.gt(globalWithdrawalPenaltyBps)
      ? vaultWithdrawalPenaltyBps
      : globalWithdrawalPenaltyBps;

    return {
      withdrawalPenaltyLamports: withdrawalPenaltyLamports,
      withdrawalPenaltyBps: withdrawalPenaltyBps,
    };
  }

  /**
   * This will return an aggregation of the current state of the vault with all the invested amounts and the utilization ratio of the vault
   * @param vault - the kamino vault to get available liquidity to withdraw for
   * @param slot - current slot
   * @param vaultReservesMap - hashmap from each reserve pubkey to the reserve state
   * @returns an VaultReserveTotalBorrowedAndInvested object with the total invested amount, total borrowed amount and the utilization ratio of the vault
   */
  async getTotalBorrowedAndInvested(
    vault: VaultState,
    slot: Slot,
    vaultReservesMap: Map<Address, KaminoReserve>
  ): Promise<VaultReserveTotalBorrowedAndInvested> {
    const vaultReservesState = vaultReservesMap;

    const totalAvailable = lamportsToDecimal(
      new Decimal(vault.tokenAvailable.toString()),
      new Decimal(vault.tokenMintDecimals.toString())
    );
    let totalInvested = new Decimal(0);
    let totalBorrowed = new Decimal(0);

    vault.vaultAllocationStrategy.forEach((allocationStrategy) => {
      if (allocationStrategy.reserve === DEFAULT_PUBLIC_KEY) {
        return;
      }

      const reserve = vaultReservesState.get(allocationStrategy.reserve);
      if (reserve === undefined) {
        throw new Error(`Reserve ${allocationStrategy.reserve} not found`);
      }

      const reserveCollExchangeRate = reserve.getEstimatedCollateralExchangeRate(slot, 0);
      const reserveAllocationLiquidityAmountLamports = KaminoReserve.cTokensToLiquidity(
        new Decimal(allocationStrategy.ctokenAllocation.toString()),
        reserveCollExchangeRate
      );
      const reserveAllocationLiquidityAmount = lamportsToDecimal(
        reserveAllocationLiquidityAmountLamports,
        vault.tokenMintDecimals.toString()
      );

      const utilizationRatio = reserve.getEstimatedUtilizationRatio(slot, 0);
      totalInvested = totalInvested.add(reserveAllocationLiquidityAmount);
      totalBorrowed = totalBorrowed.add(reserveAllocationLiquidityAmount.mul(utilizationRatio));
    });

    let utilizationRatio = new Decimal(0);
    if (!totalInvested.isZero()) {
      utilizationRatio = totalBorrowed.div(totalInvested.add(totalAvailable));
    }

    return {
      totalInvested: totalInvested,
      totalBorrowed: totalBorrowed,
      utilizationRatio: utilizationRatio,
    };
  }

  /**
   * This will return a map of the cumulative rewards issued for all the delegated farms
   * @param [vaults] - the vaults to get the cumulative rewards for; if not provided, the function will get the cumulative rewards for all the vaults
   * @returns a map of the cumulative rewards issued for all the delegated farms, per token, in lamports
   */
  async getCumulativeDelegatedFarmsRewardsIssuedForAllVaults(vaults?: Address[]): Promise<Map<Address, Decimal>> {
    const vaultsWithDelegatedFarms = await this.getVaultsWithDelegatedFarm();
    const delegatedFarmsAddresses: Address[] = [];
    if (vaults) {
      vaults.forEach((vault) => {
        const delegatedFarm = vaultsWithDelegatedFarms.get(vault);
        if (delegatedFarm) {
          delegatedFarmsAddresses.push(delegatedFarm);
        }
      });
    } else {
      delegatedFarmsAddresses.push(...Array.from(vaultsWithDelegatedFarms.values()));
    }

    const farmsSDK = new Farms(this.getConnection(), this._farmsProgramId);
    const delegatedFarmsStates = await farmsSDK.fetchMultipleFarmStatesWithCheckedSize(delegatedFarmsAddresses);

    const cumulativeRewardsPerToken = new Map<Address, Decimal>();
    for (const delegatedFarmState of delegatedFarmsStates) {
      if (!delegatedFarmState) {
        continue;
      }

      delegatedFarmState.rewardInfos.forEach((rewardInfo) => {
        if (rewardInfo.token.mint === DEFAULT_PUBLIC_KEY) {
          return;
        }
        const rewardTokenMint = rewardInfo.token.mint;
        if (cumulativeRewardsPerToken.has(rewardTokenMint)) {
          cumulativeRewardsPerToken.set(
            rewardTokenMint,
            cumulativeRewardsPerToken
              .get(rewardTokenMint)!
              .add(new Decimal(rewardInfo.rewardsIssuedCumulative.toString()))
          );
        } else {
          cumulativeRewardsPerToken.set(rewardTokenMint, new Decimal(rewardInfo.rewardsIssuedCumulative.toString()));
        }
      });
    }

    return cumulativeRewardsPerToken;
  }

  /**
   * This will return an overview of each reserve that is part of the vault allocation
   * @param vault - the kamino vault to get available liquidity to withdraw for
   * @param slot - current slot
   * @param vaultReservesMap - hashmap from each reserve pubkey to the reserve state
   * @returns a hashmap from vault reserve pubkey to ReserveOverview object
   */
  async getVaultReservesDetails(
    vault: VaultState,
    slot: Slot,
    vaultReserves: Map<Address, KaminoReserve>
  ): Promise<Map<Address, ReserveOverview>> {
    const vaultReservesState = vaultReserves;
    const reservesDetails = new Map<Address, ReserveOverview>();

    vault.vaultAllocationStrategy.forEach((allocationStrategy) => {
      if (allocationStrategy.reserve === DEFAULT_PUBLIC_KEY) {
        return;
      }

      const reserve = vaultReservesState.get(allocationStrategy.reserve);
      if (reserve === undefined) {
        throw new Error(`Reserve ${allocationStrategy.reserve} not found`);
      }

      const suppliedInReserve = this.getSuppliedInReserve(vault, slot, reserve);
      const utilizationRatio = new Decimal(reserve.getEstimatedUtilizationRatio(slot, 0));
      // current-state overview: report the rewards rate actually earned now (0 while the budget is depleted)
      const rewardsSupplyAPR = new Decimal(reserve.calculateEffectiveReserveRewardsSupplyAPR(slot, 0));
      const reserveOverview: ReserveOverview = {
        supplyAPY: new Decimal(reserve.totalSupplyAPY(slot)),
        rewardsSupplyAPR,
        utilizationRatio: utilizationRatio,
        liquidationThresholdPct: new Decimal(reserve.state.config.liquidationThresholdPct),
        totalBorrowedAmount: reserve.getBorrowedAmount(),
        amountBorrowedFromSupplied: suppliedInReserve.mul(utilizationRatio),
        market: reserve.state.lendingMarket,
        suppliedAmount: suppliedInReserve,
      };
      reservesDetails.set(allocationStrategy.reserve, reserveOverview);
    });

    return reservesDetails;
  }

  /**
   * This will return the APY of the vault under the assumption that all the available tokens in the vault are all the time invested in the reserves as requested by the weights; for percentage it needs multiplication by 100
   * @param vault - the kamino vault to get APY for
   * @param slot - current slot
   * @param vaultReservesMap - hashmap from each reserve pubkey to the reserve state
   * @returns a struct containing estimated gross APY and net APY (gross - vault fees) for the vault
   */
  async getVaultTheoreticalAPY(
    vault: VaultState,
    slot: Slot,
    vaultReservesMap: Map<Address, KaminoReserve>
  ): Promise<APYs> {
    const vaultReservesState = vaultReservesMap;

    let totalWeights = new Decimal(0);
    let totalAPR = new Decimal(0);
    vault.vaultAllocationStrategy.forEach((allocationStrategy) => {
      if (allocationStrategy.reserve === DEFAULT_PUBLIC_KEY) {
        return;
      }

      const reserve = vaultReservesState.get(allocationStrategy.reserve);
      if (reserve === undefined) {
        throw new Error(`Reserve ${allocationStrategy.reserve} not found`);
      }
      const reserveAPR = new Decimal(reserve.calculateSupplyAPR(slot, 0)).add(
        reserve.calculateTheoreticalReserveRewardsSupplyAPR(slot, 0)
      );
      const weight = new Decimal(allocationStrategy.targetAllocationWeight.toString());
      const weightedAPR = reserveAPR.mul(weight);
      totalAPR = totalAPR.add(weightedAPR);
      totalWeights = totalWeights.add(weight);
    });
    if (totalWeights.isZero()) {
      return {
        grossAPY: new Decimal(0),
        netAPY: new Decimal(0),
      };
    }

    const grossAPR = totalAPR.div(totalWeights);
    const netAPR = computeNetAPR(grossAPR, vault);
    const grossAPY = new Decimal(calculateAPYFromAPR(grossAPR.toNumber()));
    const netAPY = new Decimal(calculateAPYFromAPR(netAPR.toNumber()));
    return {
      grossAPY,
      netAPY,
    };
  }

  /**
   * This will return the APY of the vault based on the current invested amounts; for percentage it needs multiplication by 100
   * @param vault - the kamino vault to get APY for
   * @param slot - current slot
   * @param vaultReservesMap - hashmap from each reserve pubkey to the reserve state
   * @returns a struct containing estimated gross APY and net APY (gross - vault fees) for the vault
   */
  async getVaultActualAPY(vault: VaultState, slot: Slot, vaultReservesMap: Map<Address, KaminoReserve>): Promise<APYs> {
    const vaultReservesState = vaultReservesMap;

    let totalAUM = new Decimal(vault.tokenAvailable.toString());
    let totalAPR = new Decimal(0);
    vault.vaultAllocationStrategy.forEach((allocationStrategy) => {
      if (allocationStrategy.reserve === DEFAULT_PUBLIC_KEY) {
        return;
      }

      const reserve = vaultReservesState.get(allocationStrategy.reserve);
      if (reserve === undefined) {
        throw new Error(`Reserve ${allocationStrategy.reserve} not found`);
      }
      // actual APY: only count the rewards rate the reserve is earning now (0 while the budget is depleted)
      const reserveAPR = new Decimal(reserve.calculateSupplyAPR(slot, 0)).add(
        reserve.calculateEffectiveReserveRewardsSupplyAPR(slot, 0)
      );
      const exchangeRate = reserve.getEstimatedCollateralExchangeRate(slot, 0);
      const investedInReserve = KaminoReserve.cTokensToLiquidity(
        new Decimal(allocationStrategy.ctokenAllocation.toString()),
        exchangeRate
      );

      const weightedAPY = reserveAPR.mul(investedInReserve);
      totalAPR = totalAPR.add(weightedAPY);
      totalAUM = totalAUM.add(investedInReserve);
    });
    if (totalAUM.isZero()) {
      return {
        grossAPY: new Decimal(0),
        netAPY: new Decimal(0),
      };
    }

    const grossAPR = totalAPR.div(totalAUM);
    const netAPR = computeNetAPR(grossAPR, vault);
    const grossAPY = new Decimal(calculateAPYFromAPR(grossAPR.toNumber()));
    const netAPY = new Decimal(calculateAPYFromAPR(netAPR.toNumber()));
    return {
      grossAPY,
      netAPY,
    };
  }

  /**
   * Read the vault rewards state and rates; the rewards are paid in the vault token and increase the share value, so no prices are needed.
   * When the rate is 0 or the rewards are depleted the stream is paused: nothing is distributed and the paused period is never distributed retroactively (streaming resumes from the next topup). The returned APR/APY are 0 while paused or when the vault has no net AUM
   * @param vault - the kamino vault state to get the rewards overview for
   * @param slot - current slot
   * @param vaultReservesMap - hashmap from each reserve pubkey to the reserve state
   * @returns a struct containing the reward rate in token lamports and tokens per second, the rewards left to distribute and already distributed (in tokens), and the reward APR and APY relative to the vault AUM
   */
  async getVaultRewardsOverview(
    vault: VaultState,
    slot: Slot,
    vaultReservesMap: Map<Address, KaminoReserve>
  ): Promise<VaultRewardsOverview> {
    const decimals = vault.tokenMintDecimals.toNumber();
    const rewardPerSecondLamports = new Decimal(vault.rewardInfo.rewardPerSecond.toString());
    const rewardPerSecondTokens = lamportsToDecimal(rewardPerSecondLamports, decimals);
    const rewardsAvailableTokens = lamportsToDecimal(
      new Decimal(vault.rewardInfo.rewardsAvailable.toString()),
      decimals
    );
    const cumulativeRewardsDistributedTokens = lamportsToDecimal(
      new Decimal(vault.rewardInfo.cumulativeRewardsDistributedAnalytics.toString()),
      decimals
    );

    let apr = new Decimal(0);
    let apy = new Decimal(0);
    const hasActiveRewards = rewardPerSecondLamports.gt(0) && rewardsAvailableTokens.gt(0);
    if (hasActiveRewards) {
      const holdings = await this.getVaultHoldings(vault, slot, vaultReservesMap, slot);
      const netAUMTokens = holdings.totalAUMIncludingFees.sub(holdings.pendingFees);
      if (netAUMTokens.gt(0)) {
        ({ apr, apy } = calculateVaultRewardsAprApy(rewardPerSecondLamports, decimals, netAUMTokens));
      }
    }

    return {
      rewardPerSecondLamports,
      rewardPerSecondTokens,
      rewardsAvailableTokens,
      cumulativeRewardsDistributedTokens,
      lastIssuanceTs: unixTimestamp(BigInt(vault.rewardInfo.lastIssuanceTs.toString())),
      apr,
      apy,
    };
  }

  /**
   * Retrive the total amount of interest earned by the vault since its inception, up to the last interaction with the vault on chain, including what was charged as fees
   * @param vaultState the kamino vault state to get total net yield for
   * @returns a struct containing a Decimal representing the net number of tokens earned by the vault since its inception and the timestamp of the last fee charge
   */
  async getVaultCumulativeInterest(vaultState: VaultState): Promise<VaultCumulativeInterestWithTimestamp> {
    const netYieldLamports = new Fraction(vaultState.cumulativeEarnedInterestSf).toDecimal();
    const cumulativeInterest = lamportsToDecimal(netYieldLamports, vaultState.tokenMintDecimals.toString());
    return {
      cumulativeInterest: cumulativeInterest,
      timestamp: vaultState.lastFeeChargeTimestamp.toNumber(),
    };
  }

  /**
   * Simulate the current holdings of the vault and the earned interest
   * @param vaultState the kamino vault state to get simulated holdings and earnings for
   * @param vaultReservesMap - hashmap from each reserve pubkey to the reserve state
   * @param slot - the current slot
   * @param [previousNetAUM] - the previous AUM of the vault to compute the earned interest relative to this value. Optional. If not provided the function will estimate the total AUM at the slot of the last state update on chain
   * @param currentLedgerInstant - latest confirmed ledger slot and block time
   * @returns a struct of simulated vault holdings and earned interest
   */
  async calculateSimulatedHoldingsWithInterest(
    vaultState: VaultState,
    slot: Slot,
    vaultReservesMap: Map<Address, KaminoReserve>,
    previousNetAUM: Decimal | undefined,
    currentLedgerInstant: LedgerInstant
  ): Promise<SimulatedVaultHoldingsWithEarnedInterest> {
    let prevAUM: Decimal;
    let pendingFees = ZERO;

    if (previousNetAUM) {
      prevAUM = previousNetAUM;
    } else {
      const tokenDecimals = vaultState.tokenMintDecimals.toNumber();
      prevAUM = lamportsToDecimal(new Fraction(vaultState.prevAumSf).toDecimal(), tokenDecimals);
      pendingFees = lamportsToDecimal(new Fraction(vaultState.pendingFeesSf).toDecimal(), tokenDecimals);
    }

    const latestSlot = slot;

    const currentHoldings = await this.getVaultHoldings(
      vaultState,
      latestSlot,
      vaultReservesMap,
      currentLedgerInstant.slot
    );
    const earnedInterest = currentHoldings.totalAUMIncludingFees.sub(prevAUM).sub(pendingFees);

    return {
      holdings: currentHoldings,
      earnedInterest: earnedInterest,
    };
  }

  /**
   * Simulate the current holdings and compute the fees that would be charged
   * @param vaultState the kamino vault state to get simulated fees for
   * @param [simulatedCurrentHoldingsWithInterest] the simulated holdings and interest earned by the vault. Optional
   * @param currentLedgerInstant - latest confirmed ledger slot and block time
   * @param vaultReservesMap - hashmap from each reserve pubkey to the reserve state
   * @param slot - the slot at which to compute the fees
   * @param [previousNetAUM] - the previous AUM of the vault to compute the fees relative to this value. Optional. If not provided the function will estimate the total AUM at the slot of the last state update on chain
   * @returns a VaultFees struct of simulated management and interest fees
   */
  async calculateSimulatedFees(
    vaultState: VaultState,
    slot: Slot,
    vaultReservesMap: Map<Address, KaminoReserve>,
    simulatedCurrentHoldingsWithInterest: SimulatedVaultHoldingsWithEarnedInterest | undefined,
    currentLedgerInstant: LedgerInstant,
    previousNetAUM: Decimal | undefined
  ): Promise<VaultFees> {
    const timestampNowInSeconds = Number(currentLedgerInstant.blockTime);
    const timestampLastUpdate = vaultState.lastFeeChargeTimestamp.toNumber();
    const timeElapsed = timestampNowInSeconds - timestampLastUpdate;

    const simulatedCurrentHoldings = simulatedCurrentHoldingsWithInterest
      ? simulatedCurrentHoldingsWithInterest
      : await this.calculateSimulatedHoldingsWithInterest(
          vaultState,
          slot,
          vaultReservesMap,
          previousNetAUM,
          currentLedgerInstant
        );

    const performanceFee = simulatedCurrentHoldings.earnedInterest.mul(
      new Decimal(vaultState.performanceFeeBps.toString()).div(FullBPSDecimal)
    );

    const managementFeeFactor = new Decimal(timeElapsed)
      .mul(new Decimal(vaultState.managementFeeBps.toString()))
      .div(new Decimal(SECONDS_PER_YEAR))
      .div(FullBPSDecimal);
    const prevAUM = lamportsToDecimal(
      new Fraction(vaultState.prevAumSf).toDecimal(),
      vaultState.tokenMintDecimals.toNumber()
    );
    const mgmtFee = prevAUM.mul(managementFeeFactor);

    return {
      managementFee: mgmtFee,
      performanceFee: performanceFee,
    };
  }

  /**
   * This will compute the PDA that is used as delegatee in Farms program to compute the user state PDA for vault depositor investing in vault with reserve having a supply farm
   */
  computeUserFarmStateDelegateePDAForUserInVault(
    farmsProgramId: Address,
    vault: Address,
    reserve: Address,
    user: Address
  ): Promise<ProgramDerivedAddress> {
    return getProgramDerivedAddress({
      seeds: [addressEncoder.encode(reserve), addressEncoder.encode(vault), addressEncoder.encode(user)],
      programAddress: farmsProgramId,
    });
  }

  /**
   * Compute the delegatee PDA for the user farm state for a vault delegate farm
   * @param farmProgramID - the program ID of the farm program
   * @param vault - the address of the vault
   * @param farm - the address of the delegated farm
   * @param user - the address of the user
   * @returns the PDA of the delegatee user farm state for the delegated farm
   */
  async computeUserFarmStateDelegateePDAForUserInDelegatedVaultFarm(
    farmProgramID: Address,
    vault: Address,
    farm: Address,
    user: Address
  ): Promise<ProgramDerivedAddress> {
    return getProgramDerivedAddress({
      seeds: [addressEncoder.encode(vault), addressEncoder.encode(farm), addressEncoder.encode(user)],
      programAddress: farmProgramID,
    });
  }

  /**
   * Compute the user state PDA for a user in a delegated vault farm
   * @param farmProgramID - the program ID of the farm program
   * @param vault - the address of the vault
   * @param farm - the address of the delegated farm
   * @param user - the address of the user
   * @returns the PDA of the user state for the delegated farm
   */
  async computeUserStatePDAForUserInDelegatedVaultFarm(
    farmProgramID: Address,
    vault: Address,
    farm: Address,
    user: Address
  ): Promise<Address> {
    const delegateePDA = await this.computeDelegateeForUserInDelegatedFarm(farmProgramID, vault, farm, user);
    return getUserStatePDA(farmProgramID, farm, delegateePDA);
  }

  async computeDelegateeForUserInDelegatedFarm(
    farmProgramID: Address,
    vault: Address,
    farm: Address,
    user: Address
  ): Promise<Address> {
    const delegateePDA = await this.computeUserFarmStateDelegateePDAForUserInDelegatedVaultFarm(
      farmProgramID,
      vault,
      farm,
      user
    );
    return delegateePDA[0];
  }

  /**
   * Read the APY of the farm built on top of the vault (farm in vaultState.vaultFarm)
   * @param vaultOrState - the vault or state to read the farm APY for
   * @param vaultTokenPrice - the price of the vault token in USD (e.g. 1.0 for USDC)
   * @param [farmsClient] - the farms client to use. Optional. If not provided, the function will create a new one
   * @param slot - the slot to read the farm APY for
   * @param tokensPrices cached token prices
   * @returns the APY of the farm built on top of the vault
   */
  async getVaultRewardsAPY(
    vaultOrState: KaminoVault | VaultState,
    vaultTokenPrice: Decimal,
    slot: Slot,
    vaultReservesMap: Map<Address, KaminoReserve>,
    farmsClient: FarmsClient,
    farmState: FarmState | null,
    currentSlot: Slot,
    tokensPrices?: Map<Address, Decimal>
  ): Promise<FarmIncentives> {
    // Determine if we have a KaminoVault or VaultState
    const vaultState = 'getState' in vaultOrState ? await vaultOrState.getState() : vaultOrState;
    if (vaultState.vaultFarm === DEFAULT_PUBLIC_KEY) {
      return {
        incentivesStats: [],
        totalIncentivesApy: 0,
      };
    }
    const resolvedFarmState = farmState;

    if (!resolvedFarmState) {
      // a vault may have a badly configured farm that does not exist on chain but isn't set as a default pubkey by mistake
      return {
        incentivesStats: [],
        totalIncentivesApy: 0,
      };
    }

    const tokensPerShare = await this.getTokensPerShareSingleVault(vaultState, slot, vaultReservesMap, currentSlot);
    const sharePrice = tokensPerShare.mul(vaultTokenPrice);
    const stakedTokenMintDecimals = vaultState.sharesMintDecimals.toNumber();

    return getFarmIncentivesWithExistentStateForClient(
      farmsClient,
      vaultState.vaultFarm,
      resolvedFarmState,
      sharePrice,
      stakedTokenMintDecimals,
      tokensPrices
    );
  }

  /**
   * Read the APY of the delegated farm providing incentives for vault depositors
   * @param vault - the vault to read the farm APY for
   * @param vaultTokenPrice - the price of the vault token in USD (e.g. 1.0 for USDC)
   * @param [farmsClient] - the farms client to use. Optional. If not provided, the function will create a new one
   * @param slot - the slot to read the farm APY for
   * @param [tokensPrices] - the prices of the tokens in USD. Optional. If not provided, the function will fetch the prices
   * @returns the APY of the delegated farm providing incentives for vault depositors
   */
  async getVaultDelegatedFarmRewardsAPY(
    vault: KaminoVault,
    vaultTokenPrice: Decimal,
    slot: Slot,
    vaultReservesMap: Map<Address, KaminoReserve>,
    farmsClient: FarmsClient,
    farmState: FarmState | null,
    currentSlot: Slot,
    tokensPrices?: Map<Address, Decimal>
  ): Promise<FarmIncentives> {
    const delegatedFarm = await this.getDelegatedFarmForVault(vault.address);
    if (!delegatedFarm) {
      return {
        incentivesStats: [],
        totalIncentivesApy: 0,
      };
    }

    const vaultState = await vault.getState();
    const tokensPerShare = await this.getTokensPerShareSingleVault(vaultState, slot, vaultReservesMap, currentSlot);
    const sharePrice = tokensPerShare.mul(vaultTokenPrice);
    const stakedTokenMintDecimals = vaultState.sharesMintDecimals.toNumber();

    const resolvedFarmState = farmState;

    if (!resolvedFarmState) {
      // a vault may have a badly configured farm that does not exist on chain but isn't set as a default pubkey by mistake
      return {
        incentivesStats: [],
        totalIncentivesApy: 0,
      };
    }
    return getFarmIncentivesWithExistentStateForClient(
      farmsClient,
      delegatedFarm,
      resolvedFarmState,
      sharePrice,
      stakedTokenMintDecimals,
      tokensPrices
    );
  }

  /**
   * Get all the token mints of the vault, vault farm rewards and the allocation  rewards
   * @param vaults - the vaults to get the token mints for
   * @param [vaultReservesMap] - the vault reserves map to get the reserves for; if not provided, the function will fetch the reserves
   * @param farmsMap - the farms map to get the farms for
   * @returns a map of token mints (keys) and number of decimals (values)
   */
  async getAllVaultsTokenMintsIncludingRewards(
    vaults: KaminoVault[],
    vaultReservesMap: Map<Address, KaminoReserve>,
    farmsMap: Map<Address, FarmState>
  ) {
    const vaultsTokenMints = new Map<Address, number>();

    for (const vault of vaults) {
      const vaultState = await vault.getState();
      vaultsTokenMints.set(vaultState.tokenMint, vaultState.tokenMintDecimals.toNumber());
      if (vaultState.vaultFarm !== DEFAULT_PUBLIC_KEY) {
        const farmState = farmsMap.get(vaultState.vaultFarm);
        if (!farmState) {
          throw new Error(`Vault farm ${vaultState.vaultFarm} not found in provided farmsMap`);
        }
        farmState.rewardInfos.forEach((rewardInfo) => {
          if (rewardInfo.token.mint !== DEFAULT_PUBLIC_KEY) {
            vaultsTokenMints.set(rewardInfo.token.mint, Number(rewardInfo.token.decimals));
          }
        });
      }

      const reserves = vaultState.vaultAllocationStrategy.map((allocationStrategy) => allocationStrategy.reserve);
      reserves.forEach((reserve) => {
        if (reserve === DEFAULT_PUBLIC_KEY) {
          return;
        }

        const reserveState = vaultReservesMap.get(reserve);
        if (!reserveState) {
          throw new Error(`Reserve ${reserve} not found in provided vaultReservesMap`);
        }
        const supplyFarm = reserveState.state.farmCollateral;
        if (supplyFarm !== DEFAULT_PUBLIC_KEY) {
          const farmState = farmsMap.get(supplyFarm);
          if (!farmState) {
            throw new Error(`Reserve collateral farm ${supplyFarm} not found in provided farmsMap`);
          }
          farmState.rewardInfos.forEach((rewardInfo) => {
            if (rewardInfo.token.mint !== DEFAULT_PUBLIC_KEY) {
              vaultsTokenMints.set(rewardInfo.token.mint, Number(rewardInfo.token.decimals));
            }
          });
        }
      });
    }

    return vaultsTokenMints;
  }

  async getVaultReservesFarmsIncentives(
    vaultOrState: KaminoVault | VaultState,
    vaultTokenPrice: Decimal,
    slot: Slot,
    farmsClient: FarmsClient,
    vaultReservesMap: Map<Address, KaminoReserve>,
    tokensPrices?: Map<Address, Decimal>
  ): Promise<VaultReservesFarmsIncentives> {
    const vaultState = 'getState' in vaultOrState ? await vaultOrState.getState() : vaultOrState;

    const vaultReservesState = vaultReservesMap;
    const currentSlot = slot;

    const holdings = await this.getVaultHoldings(vaultState, currentSlot, vaultReservesState, currentSlot);

    const vaultReservesAddresses = vaultState.vaultAllocationStrategy.map(
      (allocationStrategy) => allocationStrategy.reserve
    );

    const vaultReservesFarmsIncentives = new Map<Address, FarmIncentives>();
    let totalIncentivesApy = new Decimal(0);

    const kFarmsClient = farmsClient;
    for (const reserveAddress of vaultReservesAddresses) {
      if (reserveAddress === DEFAULT_PUBLIC_KEY) {
        continue;
      }

      const reserveState = vaultReservesState.get(reserveAddress);
      if (reserveState === undefined) {
        console.log(`Reserve to read farm incentives for not found: ${reserveAddress}`);
        vaultReservesFarmsIncentives.set(reserveAddress, {
          incentivesStats: [],
          totalIncentivesApy: 0,
        });
        continue;
      }

      const reserveFarmIncentives = await getReserveFarmRewardsAPY(
        this._rpc,
        this.recentSlotDurationMs,
        reserveAddress,
        vaultTokenPrice,
        kFarmsClient,
        currentSlot,
        reserveState.state,
        tokensPrices,
        reserveState.reserveRewardsMaxAprBps,
        this._kaminoLendProgramId
      );
      vaultReservesFarmsIncentives.set(reserveAddress, reserveFarmIncentives.collateralFarmIncentives);

      const investedInReserve = holdings.investedInReserves.get(reserveAddress);
      const weightedReserveAPY = new Decimal(reserveFarmIncentives.collateralFarmIncentives.totalIncentivesApy)
        .mul(investedInReserve ?? 0)
        .div(holdings.totalAUMIncludingFees);
      totalIncentivesApy = totalIncentivesApy.add(weightedReserveAPY);
    }

    return {
      reserveFarmsIncentives: vaultReservesFarmsIncentives,
      totalIncentivesAPY: totalIncentivesApy,
    };
  }

  async getVaultFlcFarmStats(
    vaultOrState: KaminoVault | VaultState,
    farmsClient: FarmsClient,
    flcFarmStateParam: FarmState | null
  ): Promise<FlcFarmStats | undefined> {
    const vaultState = 'getState' in vaultOrState ? await vaultOrState.getState() : vaultOrState;

    if (vaultState.firstLossCapitalFarm === DEFAULT_PUBLIC_KEY) {
      return undefined;
    }

    const kFarmsClient = farmsClient;

    const flcFarmState = flcFarmStateParam;

    if (!flcFarmState) {
      return undefined;
    }

    if (!(await this.isFlcFarmValid(flcFarmState, vaultState))) {
      return undefined;
    }

    const userStates = await kFarmsClient.getAllUserStatesForFarm(vaultState.firstLossCapitalFarm);
    const pendingUnstakes: FarmPendingUnstakeInfo[] = [];

    for (const { userState, key } of userStates) {
      const pendingWithdrawalUnstake = new Decimal(scaleDownWads(userState.pendingWithdrawalUnstakeScaled));
      if (pendingWithdrawalUnstake.gt(0)) {
        pendingUnstakes.push({
          userStateAddress: key,
          pendingUnstakeAmountLamports: pendingWithdrawalUnstake,
          pendingUnstakeAvailableAtTimestamp: Number(userState.pendingWithdrawalUnstakeTs),
        });
      }
    }

    return {
      address: vaultState.firstLossCapitalFarm,
      farmState: flcFarmState,
      totalStakedShares: new Decimal(scaleDownWads(flcFarmState.totalActiveStakeScaled)),
      withdrawalCooldownDurationSeconds: flcFarmState.withdrawalCooldownPeriod,
      isPendingUnstake: pendingUnstakes.length > 0,
      pendingUnstakeInfo: pendingUnstakes,
    };
  }

  async isFlcFarmValid(flcFarmState: FarmState, vaultOrState: KaminoVault | VaultState): Promise<boolean> {
    const vaultState = 'getState' in vaultOrState ? await vaultOrState.getState() : vaultOrState;

    if (flcFarmState.timeUnit !== 0) {
      // timeUnit = 0 -> seconds
      return false;
    }

    if (flcFarmState.withdrawalCooldownPeriod === 0) {
      // invalid FLC farm, should have > 0 withdrawal cooldown
      return false;
    }

    if (flcFarmState.token.mint !== vaultState.sharesMint) {
      // staked token mint should be the vault shares mint
      return false;
    }
    return true;
  }

  /// reads the pending rewards for a user in the vault farm
  /// @param user - the user address
  /// @param vault - the vault
  /// @returns a map of the pending rewards token mint and amount in lamports
  async getUserPendingRewardsInVaultFarm(user: Address, vault: KaminoVault): Promise<Map<Address, Decimal>> {
    const vaultState = await vault.getState();
    const hasFarm = await vault.hasFarm();
    if (!hasFarm) {
      return new Map<Address, Decimal>();
    }

    const farmClient = new Farms(this.getConnection(), this._farmsProgramId);
    const userState = await getUserStatePDA(farmClient.getProgramID(), vaultState.vaultFarm, user);
    return getUserPendingRewardsInFarm(this.getConnection(), userState, vaultState.vaultFarm, this._farmsProgramId);
  }

  /// reads the pending rewards for a user in a delegated vault farm
  /// @param user - the user address
  /// @param vaultAddress - the address of the vault
  /// @returns a map of the pending rewards token mint and amount in lamports
  async getUserPendingRewardsInVaultDelegatedFarm(
    user: Address,
    vaultAddress: Address
  ): Promise<Map<Address, Decimal>> {
    const delegatedFarm = await this.getDelegatedFarmForVault(vaultAddress);
    if (!delegatedFarm) {
      return new Map<Address, Decimal>();
    }

    const farmClient = new Farms(this.getConnection(), this._farmsProgramId);
    const userState = await this.computeUserStatePDAForUserInDelegatedVaultFarm(
      farmClient.getProgramID(),
      vaultAddress,
      delegatedFarm,
      user
    );

    return getUserPendingRewardsInFarm(this.getConnection(), userState, delegatedFarm, this._farmsProgramId);
  }

  /// gets the delegated farm for a vault
  async getDelegatedFarmForVault(vault: Address): Promise<Address | undefined> {
    const resources = await this.loadCdnResourcesOnce();
    const delegatedVaultFarms = resources?.delegatedVaultFarms;
    if (!delegatedVaultFarms) {
      return undefined;
    }
    const delegatedFarmWithVault = delegatedVaultFarms.find((vaultWithFarm) => vaultWithFarm.vault === vault);
    if (!delegatedFarmWithVault) {
      return undefined;
    }
    return address(delegatedFarmWithVault.farm);
  }

  /**
   * gets all the delegated farms addresses
   * @returns a list of delegated farms addresses
   */
  async getAllDelegatedFarms(): Promise<Address[]> {
    const vaultsWithDelegatedFarm = await this.getVaultsWithDelegatedFarm();
    return Array.from(vaultsWithDelegatedFarm.values());
  }

  /**
   * This will return a map of the vault address and the delegated farm address for that vault
   * @returns a map of the vault address and the delegated farm address for that vault
   */
  async getVaultsWithDelegatedFarm(): Promise<Map<Address, Address>> {
    const resources = await this.loadCdnResourcesOnce();
    const delegatedVaultFarms = resources?.delegatedVaultFarms;
    if (!delegatedVaultFarms) {
      return new Map<Address, Address>();
    }

    return new Map(
      delegatedVaultFarms.map((delegatedFarm) => [address(delegatedFarm.vault), address(delegatedFarm.farm)])
    );
  }

  /// reads the pending rewards for a user in the reserves farms of a vault
  /// @param user - the user address
  /// @param vault - the vault
  /// @param [vaultReservesMap] - the vault reserves map to get the reserves for; if not provided, the function will fetch the reserves
  /// @returns a map of the pending rewards token mint and amount in lamports
  async getUserPendingRewardsInVaultReservesFarms(
    user: Address,
    vault: KaminoVault,
    vaultReservesMap: Map<Address, KaminoReserve>
  ): Promise<Map<Address, Decimal>> {
    const vaultState = await vault.getState();

    const vaultReservesState = vaultReservesMap;

    const vaultReserves = vaultState.vaultAllocationStrategy
      .map((allocationStrategy) => allocationStrategy.reserve)
      .filter((reserve) => reserve !== DEFAULT_PUBLIC_KEY);
    const pendingRewardsPerToken: Map<Address, Decimal> = new Map();

    const farmClient = new Farms(this.getConnection(), this._farmsProgramId);
    for (const reserveAddress of vaultReserves) {
      const reserveState = vaultReservesState.get(reserveAddress);
      if (!reserveState) {
        console.log(`Reserve to read farm incentives for not found: ${reserveAddress}`);
        continue;
      }

      if (reserveState.state.farmCollateral === DEFAULT_PUBLIC_KEY) {
        continue;
      }

      const delegatee = await this.computeUserFarmStateDelegateePDAForUserInVault(
        farmClient.getProgramID(),
        vault.address,
        reserveAddress,
        user
      );
      const userState = await getUserStatePDA(
        farmClient.getProgramID(),
        reserveState.state.farmCollateral,
        delegatee[0]
      );
      const pendingRewards = await getUserPendingRewardsInFarm(
        this.getConnection(),
        userState,
        reserveState.state.farmCollateral,
        this._farmsProgramId
      );
      pendingRewards.forEach((reward, token) => {
        const existingReward = pendingRewardsPerToken.get(token);
        if (existingReward) {
          pendingRewardsPerToken.set(token, existingReward.add(reward));
        } else {
          pendingRewardsPerToken.set(token, reward);
        }
      });
    }

    return pendingRewardsPerToken;
  }

  /// reads the pending rewards for a user in the vault farm, the reserves farms of the vault and the delegated vault farm
  /// @param user - the user address
  /// @param vault - the vault
  /// @param [vaultReservesMap] - the vault reserves map to get the reserves for; if not provided, the function will fetch the reserves
  /// @returns a struct containing the pending rewards in the vault farm, the reserves farms of the vault and the delegated vault farm, and the total pending rewards in lamports
  async getAllPendingRewardsForUserInVault(
    user: Address,
    vault: KaminoVault,
    vaultReservesMap: Map<Address, KaminoReserve>
  ): Promise<PendingRewardsForUserInVault> {
    const pendingRewardsInVaultFarm = await this.getUserPendingRewardsInVaultFarm(user, vault);
    const pendingRewardsInVaultReservesFarms = await this.getUserPendingRewardsInVaultReservesFarms(
      user,
      vault,
      vaultReservesMap
    );
    const pendingRewardsInVaultDelegatedFarm = await this.getUserPendingRewardsInVaultDelegatedFarm(
      user,
      vault.address
    );

    const totalPendingRewards = new Map<Address, Decimal>();
    pendingRewardsInVaultFarm.forEach((reward, token) => {
      const existingReward = totalPendingRewards.get(token);
      if (existingReward) {
        totalPendingRewards.set(token, existingReward.add(reward));
      } else {
        totalPendingRewards.set(token, reward);
      }
    });
    pendingRewardsInVaultReservesFarms.forEach((reward, token) => {
      const existingReward = totalPendingRewards.get(token);
      if (existingReward) {
        totalPendingRewards.set(token, existingReward.add(reward));
      } else {
        totalPendingRewards.set(token, reward);
      }
    });
    pendingRewardsInVaultDelegatedFarm.forEach((reward, token) => {
      const existingReward = totalPendingRewards.get(token);
      if (existingReward) {
        totalPendingRewards.set(token, existingReward.add(reward));
      } else {
        totalPendingRewards.set(token, reward);
      }
    });

    return {
      pendingRewardsInVaultFarm,
      pendingRewardsInVaultReservesFarms,
      pendingRewardsInVaultDelegatedFarm,
      totalPendingRewards,
    };
  }

  /**
   * This function will return the instructions to claim the rewards for the farm of a vault, the delegated farm of the vault and the reserves farms of the vault
   * @param user - the user to claim the rewards
   * @param vault - the vault
   * @param [vaultReservesMap] - the vault reserves map to get the reserves for; if not provided, the function will fetch the reserves
   * @returns the instructions to claim the rewards for the farm of the vault, the delegated farm of the vault and the reserves farms of the vault
   */
  async getClaimAllRewardsForVaultIxs(
    user: TransactionSigner,
    vault: KaminoVault,
    vaultReservesMap: Map<Address, KaminoReserve>
  ): Promise<Instruction[]> {
    const [vaultFarmIxs, delegatedFarmIxs, reservesFarmsIxs] = await Promise.all([
      this.getClaimVaultFarmRewardsIxs(user, vault),
      this.getClaimVaultDelegatedFarmRewardsIxs(user, vault),
      this.getClaimVaultReservesFarmsRewardsIxs(user, vault, vaultReservesMap),
    ]);

    return [...new Set([...vaultFarmIxs, ...delegatedFarmIxs, ...reservesFarmsIxs])];
  }

  /**
   * This function will return the instructions to claim the rewards for the farm of a vault
   * @param user - the user to claim the rewards
   * @param vault - the vault
   * @returns the instructions to claim the rewards for the farm of the vault
   */
  async getClaimVaultFarmRewardsIxs(user: TransactionSigner, vault: KaminoVault): Promise<Instruction[]> {
    const vaultState = await vault.getState();
    const hasFarm = await vault.hasFarm();
    if (!hasFarm) {
      return [];
    }

    const farmClient = new Farms(this.getConnection(), this._farmsProgramId);
    const pendingRewardsInVaultFarm = await this.getUserPendingRewardsInVaultFarm(user.address, vault);
    // if there are no pending rewards of their total is 0 no ix is needed
    const totalPendingRewards = Array.from(pendingRewardsInVaultFarm.values()).reduce(
      (acc, reward) => acc.add(reward),
      new Decimal(0)
    );
    if (totalPendingRewards.eq(0)) {
      return [];
    }
    return farmClient.claimForUserForFarmAllRewardsIx(user, user.address, vaultState.vaultFarm, false);
  }

  /**
   * This function will return the instructions to claim the rewards for the delegated farm of a vault
   * @param user - the user to claim the rewards
   * @param vault - the vault
   * @returns the instructions to claim the rewards for the delegated farm of the vault
   */
  async getClaimVaultDelegatedFarmRewardsIxs(user: TransactionSigner, vault: KaminoVault): Promise<Instruction[]> {
    const delegatedFarm = await this.getDelegatedFarmForVault(vault.address);
    if (!delegatedFarm) {
      return [];
    }

    const farmClient = new Farms(this.getConnection(), this._farmsProgramId);

    const delegatee = await this.computeDelegateeForUserInDelegatedFarm(
      farmClient.getProgramID(),
      vault.address,
      delegatedFarm,
      user.address
    );
    const userState = await getUserStatePDA(farmClient.getProgramID(), delegatedFarm, delegatee);
    // check if the user state exists
    const userStateExists = await fetchEncodedAccount(this.getConnection(), userState);
    if (!userStateExists.exists) {
      return [];
    }

    return farmClient.claimForUserForFarmAllRewardsIx(user, user.address, delegatedFarm, true, [delegatee]);
  }

  /**
   * This function will return the instructions to claim the rewards for the reserves farms of a vault
   * @param user - the user to claim the rewards
   * @param vault - the vault
   * @param [vaultReservesMap] - the vault reserves map to get the reserves for; if not provided, the function will fetch the reserves
   * @returns the instructions to claim the rewards for the reserves farms of the vault
   */
  async getClaimVaultReservesFarmsRewardsIxs(
    user: TransactionSigner,
    vault: KaminoVault,
    vaultReservesMap: Map<Address, KaminoReserve>
  ): Promise<Instruction[]> {
    const vaultState = await vault.getState();

    const vaultReservesState = vaultReservesMap;

    const vaultReserves = vaultState.vaultAllocationStrategy
      .map((allocationStrategy) => allocationStrategy.reserve)
      .filter((reserve) => reserve !== DEFAULT_PUBLIC_KEY);

    const ixs: Instruction[] = [];
    const farmClient = new Farms(this.getConnection(), this._farmsProgramId);
    for (const reserveAddress of vaultReserves) {
      const reserveState = vaultReservesState.get(reserveAddress);
      if (!reserveState) {
        console.log(`Reserve to read farm incentives for not found: ${reserveAddress}`);
        continue;
      }

      if (reserveState.state.farmCollateral === DEFAULT_PUBLIC_KEY) {
        continue;
      }

      const delegatee = await this.computeUserFarmStateDelegateePDAForUserInVault(
        farmClient.getProgramID(),
        vault.address,
        reserveAddress,
        user.address
      );
      const userState = await getUserStatePDA(
        farmClient.getProgramID(),
        reserveState.state.farmCollateral,
        delegatee[0]
      );

      const pendingRewards = await getUserPendingRewardsInFarm(
        this.getConnection(),
        userState,
        reserveState.state.farmCollateral,
        this._farmsProgramId
      );
      const totalPendingRewards = Array.from(pendingRewards.values()).reduce(
        (acc, reward) => acc.add(reward),
        new Decimal(0)
      );
      if (totalPendingRewards.eq(0)) {
        continue;
      }
      const ix = await farmClient.claimForUserForFarmAllRewardsIx(
        user,
        user.address,
        reserveState.state.farmCollateral,
        true,
        [delegatee[0]]
      );
      ixs.push(...ix);
    }

    return ixs;
  }

  private buildRemainingAccountsForVaultReserves(
    vaultReserves: Address[],
    vaultReservesState: Map<Address, KaminoReserve>
  ): AccountMeta[] {
    let vaultReservesAccountMetas: AccountMeta[] = [];
    let vaultReservesLendingMarkets: AccountMeta[] = [];
    vaultReserves.forEach((reserve) => {
      const reserveState = vaultReservesState.get(reserve);
      if (reserveState === undefined) {
        throw new Error(`Reserve ${reserve} not found`);
      }
      vaultReservesAccountMetas = vaultReservesAccountMetas.concat([{ address: reserve, role: AccountRole.WRITABLE }]);
      vaultReservesLendingMarkets = vaultReservesLendingMarkets.concat([
        { address: reserveState.state.lendingMarket, role: AccountRole.READONLY },
      ]);
    });
    return [...vaultReservesAccountMetas, ...vaultReservesLendingMarkets];
  }

  /**
   * Append the remaining accounts for the vault reserves to the instruction
   * @param ix - the instruction to append the remaining accounts to
   * @param vaultReserves - the vault reserves to append the remaining accounts to
   * @param vaultReservesState - the state of the vault reserves
   * @returns - the instruction with the remaining accounts appended
   */
  public appendRemainingAccountsForVaultReserves(
    ix: Instruction,
    vaultReserves: Address[],
    vaultReservesState: Map<Address, KaminoReserve>
  ): Instruction {
    const remainingAccounts = this.buildRemainingAccountsForVaultReserves(vaultReserves, vaultReservesState);
    return {
      ...ix,
      accounts: ix.accounts?.concat(remainingAccounts),
    };
  }
} // KaminoVaultClient

export class KaminoVault {
  readonly address: Address;
  state: VaultState | undefined | null;
  programId: Address;
  client: KaminoVaultClient;
  vaultReservesStateCache: Map<Address, KaminoReserve> | undefined;

  constructor(
    rpc: Rpc<SolanaRpcApi>,
    vaultAddress: Address,
    state?: VaultState,
    programId: Address = kaminoVaultId,
    recentSlotDurationMs: number = DEFAULT_RECENT_SLOT_DURATION_MS
  ) {
    this.address = vaultAddress;
    this.state = state;
    this.programId = programId;
    this.client = new KaminoVaultClient(rpc, recentSlotDurationMs);
  }

  static loadWithClientAndState(client: KaminoVaultClient, vaultAddress: Address, state: VaultState): KaminoVault {
    const vault = new KaminoVault(client.getConnection(), vaultAddress);
    vault.state = state;
    vault.programId = client.getProgramID();
    vault.client = client;
    return vault;
  }

  async getState(): Promise<VaultState> {
    if (!this.state) {
      const res = await VaultState.fetch(this.client.getConnection(), this.address, this.programId);
      if (!res) {
        throw new Error('Invalid vault');
      }
      this.state = res;
      return res;
    } else {
      return this.state;
    }
  }

  async reloadVaultReserves(): Promise<void> {
    this.vaultReservesStateCache = await this.client.loadVaultReserves(this.state!);
  }

  async reloadState(): Promise<VaultState> {
    this.state = await VaultState.fetch(this.client.getConnection(), this.address, this.programId);
    if (!this.state) {
      throw new Error('Could not fetch vault');
    }
    return this.state;
  }

  async hasFarm(vaultState?: VaultState): Promise<boolean> {
    const state = vaultState ?? (await this.getState());
    return state.vaultFarm !== DEFAULT_PUBLIC_KEY;
  }

  async hasFlcFarm(): Promise<boolean> {
    const state = await this.getState();
    return state.firstLossCapitalFarm !== DEFAULT_PUBLIC_KEY;
  }

  /**
   * This will return an VaultHoldings object which contains the amount available (uninvested) in vault, total amount invested in reseves and a breakdown of the amount invested in each reserve
   * @param slot - current slot used for holdings calculations
   * @returns an VaultHoldings object representing the amount available (uninvested) in vault, total amount invested in reseves and a breakdown of the amount invested in each reserve
   */
  async getVaultHoldings(slot: Slot): Promise<VaultHoldings> {
    if (!this.state || !this.vaultReservesStateCache) {
      await this.reloadState();
      await this.reloadVaultReserves();
    }

    return await this.client.getVaultHoldings(this.state!, slot, this.vaultReservesStateCache!, slot);
  }

  /**
   * This will return the a map between reserve pubkey and the allocation overview for the reserve
   * @returns a map between reserve pubkey and the allocation overview for the reserve
   */
  async getVaultAllocations(): Promise<Map<Address, ReserveAllocationOverview>> {
    if (!this.state) {
      await this.reloadState();
    }

    return this.client.getVaultAllocations(this.state!);
  }

  /**
   * This will return the APY of the vault based on the current invested amounts and the theoretical APY if all the available tokens were invested.
   * @param slot - current slot used for APY calculations
   * @returns a struct containing actualAPY and theoreticalAPY for the vault
   */
  async getAPYs(slot: Slot): Promise<VaultAPYs> {
    if (!this.state || !this.vaultReservesStateCache) {
      await this.reloadState();
      await this.reloadVaultReserves();
    }

    const actualApy = await this.client.getVaultActualAPY(this.state!, slot, this.vaultReservesStateCache!);
    const theoreticalApy = await this.client.getVaultTheoreticalAPY(this.state!, slot, this.vaultReservesStateCache!);

    return {
      actualAPY: actualApy,
      theoreticalAPY: theoreticalApy,
    };
  }

  /**
   * This method returns the exchange rate of the vault (tokens per share)
   * @param slot - current slot used for exchange-rate calculations
   * @returns - Decimal representing the exchange rate (tokens per share)
   */
  async getExchangeRate(slot: Slot): Promise<Decimal> {
    if (!this.state || !this.vaultReservesStateCache) {
      await this.reloadState();
      await this.reloadVaultReserves();
    }

    const tokensPerShare = await this.client.getTokensPerShareSingleVault(
      this.state!,
      slot,
      this.vaultReservesStateCache!,
      slot
    );
    return tokensPerShare;
  }

  /**
   * This method returns the user shares balance for a given vault
   * @param user - user to calculate the shares balance for
   * @param vault - vault to calculate shares balance for
   * @returns - a struct of user share balance (unstaked plus shares staked in either configured farm) in decimal (not lamports)
   */
  async getUserShares(user: Address): Promise<UserSharesForVault> {
    return this.client.getUserSharesBalanceSingleVault(user, this);
  }

  /**
   * This function creates instructions to deposit into a vault. It will also create ATA creation instructions for the vault shares that the user receives in return
   * @param user - user to deposit
   * @param tokenAmount - token amount to be deposited, in decimals (will be converted in lamports)
   * @param vaultReservesMap - preloaded reserve states for every reserve in the vault allocation
   * @param farmState - preloaded vault farm state; provide this to stake into the vault farm
   * @param flcFarmState - preloaded first loss capital farm state; provide this to stake into the first loss capital farm
   * Pass only one of `farmState` or `flcFarmState`, depending on whether you want vault-farm or first loss capital farm behavior. Pass neither to skip staking.
   * @param [memo] - optional memo string to append as a memo SPL instruction
   * @param [minSharesOut] - optional minimum amount of shares to receive, in decimals (will be converted in lamports); if provided the deposit reverts on-chain unless at least this many shares are minted
   * @returns - deposit instructions plus stake instructions for exactly one selected farm, or none
   */
  async depositIxs(
    user: TransactionSigner,
    tokenAmount: Decimal,
    vaultReservesMap: Map<Address, KaminoReserve>,
    farmState: FarmState | null,
    flcFarmState: FarmState | null,
    payer?: TransactionSigner,
    memo?: string,
    minSharesOut?: Decimal
  ): Promise<DepositIxs> {
    this.vaultReservesStateCache = vaultReservesMap;
    return this.client.depositIxs(
      user,
      this,
      tokenAmount,
      vaultReservesMap,
      farmState,
      flcFarmState,
      payer,
      memo,
      minSharesOut
    );
  }

  /**
   * This function will return the missing ATA creation instructions, as well as one or multiple withdraw instructions, based on how many reserves it's needed to withdraw from. This might have to be split in multiple transactions
   * @param user - user to withdraw
   * @param shareAmount - share amount to withdraw (in tokens, not lamports), in order to withdraw everything, any value > user share amount
   * @param slot - current slot, used to estimate the interest earned in the different reserves with allocation from the vault
   * @param vaultReservesMap - preloaded reserve states for every reserve in the vault allocation
   * @param farmState - preloaded vault farm state; provide this to unstake from the vault farm
   * @param flcFarmState - preloaded first loss capital farm state; provide this to unstake from the first loss capital farm
   * Pass only one of `farmState` or `flcFarmState`, depending on whether you want vault-farm or first loss capital farm behavior. Pass neither to skip unstaking.
   * @param [payer] - optional parameter to pass a different payer for ATA creation rent. If not provided, the user will be used
   * @param [withdrawalPenalties] - effective vault/global withdrawal penalties used to plan the net withdrawal amount
   * @returns an array of instructions to create missing ATAs if needed and the withdraw instructions
   */
  async withdrawIxs(
    user: TransactionSigner,
    shareAmount: Decimal,
    slot: Slot,
    vaultReservesMap: Map<Address, KaminoReserve>,
    farmState: FarmState | null,
    flcFarmState: FarmState | null,
    payer?: TransactionSigner,
    withdrawalPenalties?: WithdrawPenalties
  ): Promise<WithdrawIxs> {
    this.vaultReservesStateCache = vaultReservesMap;
    return this.client.withdrawIxs(
      user,
      this,
      shareAmount,
      slot,
      vaultReservesMap,
      farmState,
      flcFarmState,
      payer,
      withdrawalPenalties
    );
  }

  /**
   * Redeem shares in kind (receive cTokens instead of underlying tokens).
   * Reserves are selected by highest available liquidity (same order as withdraw).
   * @param user - user to redeem shares
   * @param shareAmount - share amount to redeem (in tokens, not lamports)
   * @param slot - current slot
   * @param vaultReservesMap - preloaded reserve states for every reserve in the vault allocation
   * @param vaultState - preloaded vault state; call `vault.getState()` / `vault.reloadState()` before building instructions
   * @param globalConfigState - preloaded KVault global config; call `client.loadKVaultGlobalConfig()` / `manager.loadKVaultGlobalConfig()` before building instructions
   * @param farmState - preloaded vault farm state; provide this to unstake from the vault farm
   * @param flcFarmState - preloaded first loss capital farm state; provide this to unstake from the first loss capital farm
   * Pass only one of `farmState` or `flcFarmState`, depending on whether you want vault-farm or first loss capital farm behavior. Pass neither to skip unstaking.
   * @param [payer] - optional different payer for ATA creation
   * @returns RedeemInKindIxs with setup, redeemInKind, cleanup instructions and luts
   */
  async redeemInKindIxs(
    user: TransactionSigner,
    shareAmount: Decimal,
    slot: Slot,
    vaultReservesMap: Map<Address, KaminoReserve>,
    vaultState: VaultState,
    globalConfigState: KVaultGlobalConfig,
    farmState: FarmState | null,
    flcFarmState: FarmState | null,
    payer?: TransactionSigner
  ): Promise<RedeemInKindIxs> {
    this.vaultReservesStateCache = vaultReservesMap;
    return this.client.redeemInKindIxs(
      user,
      this,
      shareAmount,
      slot,
      vaultReservesMap,
      vaultState,
      globalConfigState,
      farmState,
      flcFarmState,
      payer
    );
  }

  /**
   * Withdraw as much as possible instantly, then redeem in kind the remaining shares.
   * The withdraw handles farm unstaking for the full exit amount so redeemInKind does not duplicate the unstake.
   * @param user - user to withdraw/redeem
   * @param shareAmount - total share amount to exit (in tokens, not lamports)
   * @param slot - current slot
   * @param vaultReservesMap - preloaded reserve states for every reserve in the vault allocation
   * @param vaultState - preloaded vault state; call `vault.getState()` / `vault.reloadState()` before building instructions
   * @param globalConfigState - preloaded KVault global config; call `client.loadKVaultGlobalConfig()` / `manager.loadKVaultGlobalConfig()` before building instructions
   * @param farmState - preloaded vault farm state when exiting from the vault farm
   * @param flcFarmState - preloaded first loss capital farm state when exiting from the first loss capital farm
   * Pass only one of `farmState` or `flcFarmState`, depending on whether you want vault-farm or first loss capital farm behavior. Pass neither if no farm exit is needed.
   * @param [payer] - optional different payer for ATA creation
   * @returns WithdrawAndRedeemInKindIxs with both withdraw and redeemInKind instructions
   */
  async withdrawAndRedeemInKindIfNeededIxs(
    user: TransactionSigner,
    shareAmount: Decimal,
    slot: Slot,
    vaultReservesMap: Map<Address, KaminoReserve>,
    vaultState: VaultState,
    globalConfigState: KVaultGlobalConfig,
    farmState: FarmState | null,
    flcFarmState: FarmState | null,
    payer?: TransactionSigner
  ): Promise<WithdrawAndRedeemInKindIxs> {
    this.vaultReservesStateCache = vaultReservesMap;
    return this.client.withdrawAndRedeemInKindIfNeededIxs(
      user,
      this,
      shareAmount,
      slot,
      vaultReservesMap,
      vaultState,
      globalConfigState,
      farmState,
      flcFarmState,
      payer
    );
  }

  /**
   * Withdraw, redeem in kind, and enqueue cTokens into the klend withdrawal queue.
   * This is the top-level function that handles the full exit flow: instant withdraw for available
   * liquidity, redeemInKind for the remainder, and enqueue to eventually receive underlying tokens.
   * @param user - user to withdraw/redeem/enqueue
   * @param shareAmount - total share amount to exit (in tokens, not lamports)
   * @param slot - current slot
   * @param vaultReservesMap - preloaded reserve states for every reserve in the vault allocation
   * @param vaultState - preloaded vault state; call `vault.getState()` / `vault.reloadState()` before building instructions
   * @param globalConfigState - preloaded KVault global config; call `client.loadKVaultGlobalConfig()` / `manager.loadKVaultGlobalConfig()` before building instructions
   * @param farmState - preloaded vault farm state when exiting from the vault farm
   * @param flcFarmState - preloaded first loss capital farm state when exiting from the first loss capital farm
   * Pass only one of `farmState` or `flcFarmState`, depending on whether you want vault-farm or first loss capital farm behavior. Pass neither if no farm exit is needed.
   * @param [payer] - optional different payer for ATA creation
   * @returns WithdrawRedeemAndEnqueueIxs with withdraw, redeemInKind, and enqueue instructions
   */
  async withdrawRedeemAndEnqueueIxs(
    user: TransactionSigner,
    shareAmount: Decimal,
    slot: Slot,
    vaultReservesMap: Map<Address, KaminoReserve>,
    vaultState: VaultState,
    globalConfigState: KVaultGlobalConfig,
    farmState: FarmState | null,
    flcFarmState: FarmState | null,
    payer?: TransactionSigner
  ): Promise<WithdrawRedeemAndEnqueueIxs> {
    this.vaultReservesStateCache = vaultReservesMap;
    return this.client.withdrawRedeemAndEnqueueIxs(
      user,
      this,
      shareAmount,
      slot,
      vaultReservesMap,
      vaultState,
      globalConfigState,
      farmState,
      flcFarmState,
      payer
    );
  }
}

/**
 * Used to initialize a Kamino Vault
 */
export class KaminoVaultConfig {
  /** The admin of the vault */
  readonly admin: TransactionSigner;
  /** The token mint for the vault */
  readonly tokenMint: Address;
  /** The token mint program id */
  readonly tokenMintProgramId: Address;
  /** The performance fee rate of the vault, as percents, expressed as a decimal */
  readonly performanceFeeRatePercentage: Decimal;
  /** The management fee rate of the vault, as percents, expressed as a decimal */
  readonly managementFeeRatePercentage: Decimal;
  /** The name to be stored on chain for the vault (max 40 characters). */
  readonly name: string;
  /** The symbol of the vault token to be stored (max 5 characters). E.g. USDC for a vault using USDC as token. */
  readonly vaultTokenSymbol: string;
  /** The name of the vault token to be stored (max 10 characters), after the prefix `Kamino Vault <vaultTokenSymbol>`. E.g. USDC Vault for a vault using USDC as token. */
  readonly vaultTokenName: string;
  /** Minimum deposit amount in vault-token lamports. Default: 1000 */
  readonly minDepositAmount: number;
  /** Minimum withdraw amount in vault-token lamports. Default: 10 */
  readonly minWithdrawAmount: number;
  /** Minimum invest amount in vault-token lamports. Default: 0 */
  readonly minInvestAmount: number;
  /** Minimum invest delay in slots. Default: 0 */
  readonly minInvestDelaySlots: number;
  /** Withdrawal penalty in basis points. Default: 1 */
  readonly withdrawalPenaltyBps: number;
  /** Withdrawal penalty in lamports. Default: 1 */
  readonly withdrawalPenaltyLamports: number;
  /** Crank fund fee per reserve in lamports. Default: 1 */
  readonly crankFundFeePerReserve: number;
  /** Whether allocations are restricted to whitelisted reserves only. Default: false */
  readonly allowAllocationsInWhitelistedReservesOnly: boolean;
  /** Whether invest is restricted to whitelisted reserves only. Default: false */
  readonly allowInvestInWhitelistedReservesOnly: boolean;
  constructor(args: {
    admin: TransactionSigner;
    tokenMint: Address;
    tokenMintProgramId: Address;
    performanceFeeRatePercentage: Decimal;
    managementFeeRatePercentage: Decimal;
    name: string;
    vaultTokenSymbol: string;
    vaultTokenName: string;
    minDepositAmount?: number;
    minWithdrawAmount?: number;
    minInvestAmount?: number;
    minInvestDelaySlots?: number;
    withdrawalPenaltyBps?: number;
    withdrawalPenaltyLamports?: number;
    crankFundFeePerReserve?: number;
    allowAllocationsInWhitelistedReservesOnly?: boolean;
    allowInvestInWhitelistedReservesOnly?: boolean;
  }) {
    this.admin = args.admin;
    this.tokenMint = args.tokenMint;
    this.performanceFeeRatePercentage = args.performanceFeeRatePercentage;
    this.managementFeeRatePercentage = args.managementFeeRatePercentage;
    this.tokenMintProgramId = args.tokenMintProgramId;
    this.name = args.name;
    this.vaultTokenSymbol = args.vaultTokenSymbol;
    this.vaultTokenName = args.vaultTokenName;
    this.minDepositAmount = args.minDepositAmount ?? DefaultCreateVaultConfigAdvancedFields.minDepositAmount;
    this.minWithdrawAmount = args.minWithdrawAmount ?? DefaultCreateVaultConfigAdvancedFields.minWithdrawAmount;
    this.minInvestAmount = args.minInvestAmount ?? DefaultCreateVaultConfigAdvancedFields.minInvestAmount;
    this.minInvestDelaySlots = args.minInvestDelaySlots ?? DefaultCreateVaultConfigAdvancedFields.minInvestDelaySlots;
    this.withdrawalPenaltyBps =
      args.withdrawalPenaltyBps ?? DefaultCreateVaultConfigAdvancedFields.withdrawalPenaltyBps!;
    this.withdrawalPenaltyLamports =
      args.withdrawalPenaltyLamports ?? DefaultCreateVaultConfigAdvancedFields.withdrawalPenaltyLamports!;
    this.crankFundFeePerReserve =
      args.crankFundFeePerReserve ?? DefaultCreateVaultConfigAdvancedFields.crankFundFeePerReserve!;
    this.allowAllocationsInWhitelistedReservesOnly =
      args.allowAllocationsInWhitelistedReservesOnly ??
      DefaultCreateVaultConfigAdvancedFields.allowAllocationsInWhitelistedReservesOnly!;
    this.allowInvestInWhitelistedReservesOnly =
      args.allowInvestInWhitelistedReservesOnly ??
      DefaultCreateVaultConfigAdvancedFields.allowInvestInWhitelistedReservesOnly!;
  }

  getPerformanceFeeBps(): number {
    return this.performanceFeeRatePercentage.mul(100).toNumber();
  }

  getManagementFeeBps(): number {
    return this.managementFeeRatePercentage.mul(100).toNumber();
  }
}

export type CreateVaultConfigAdvancedFields = {
  minDepositAmount: number;
  minWithdrawAmount: number;
  minInvestAmount: number;
  minInvestDelaySlots: number;
  withdrawalPenaltyBps?: number;
  withdrawalPenaltyLamports?: number;
  crankFundFeePerReserve?: number;
  allowAllocationsInWhitelistedReservesOnly?: boolean;
  allowInvestInWhitelistedReservesOnly?: boolean;
};

// default values for the advanced fields on vault creation
export const DefaultCreateVaultConfigAdvancedFields: CreateVaultConfigAdvancedFields = {
  minDepositAmount: 1000,
  minWithdrawAmount: 10,
  minInvestAmount: 0,
  minInvestDelaySlots: 0,
  withdrawalPenaltyBps: 1,
  withdrawalPenaltyLamports: 1,
  crankFundFeePerReserve: 1,
  allowAllocationsInWhitelistedReservesOnly: false,
  allowInvestInWhitelistedReservesOnly: false,
};

export class ReserveAllocationConfig {
  readonly reserve: ReserveWithAddress;
  /** Target allocation weight; unitless relative weight. */
  readonly targetAllocationWeight: number;
  /** Token allocation cap in token units. Converted to vault-token lamports for the instruction. */
  readonly tokenAllocationCapTokens: Decimal;
  /** Optional ctoken allocation cap in raw ctoken lamports. */
  readonly ctokenAllocationCapLamports?: BN;
  /** @deprecated use tokenAllocationCapTokens. */
  readonly allocationCapDecimal: Decimal;
  /** @deprecated use ctokenAllocationCapLamports. */
  readonly ctokenAllocationCap?: BN;

  constructor(
    reserve: ReserveWithAddress,
    targetAllocationWeight: number,
    tokenAllocationCapTokens: Decimal,
    ctokenAllocationCapLamports?: BN
  ) {
    this.reserve = reserve;
    this.targetAllocationWeight = targetAllocationWeight;
    this.tokenAllocationCapTokens = tokenAllocationCapTokens;
    this.ctokenAllocationCapLamports = ctokenAllocationCapLamports;
    this.allocationCapDecimal = tokenAllocationCapTokens;
    this.ctokenAllocationCap = ctokenAllocationCapLamports;
  }

  getAllocationCapLamports(): Decimal {
    return numberToLamportsDecimal(this.tokenAllocationCapTokens, this.reserve.state.liquidity.mintDecimals.toNumber());
  }

  getReserveState(): Reserve {
    return this.reserve.state;
  }

  getReserveAddress(): Address {
    return this.reserve.address;
  }
}

export async function getCTokenVaultPda(
  vaultAddress: Address,
  reserveAddress: Address,
  kaminoVaultProgramId: Address
): Promise<Address> {
  return (
    await getProgramDerivedAddress({
      seeds: [
        Buffer.from(CTOKEN_VAULT_SEED),
        addressEncoder.encode(vaultAddress),
        addressEncoder.encode(reserveAddress),
      ],
      programAddress: kaminoVaultProgramId,
    })
  )[0];
}

export async function getKvaultGlobalConfigPda(kaminoVaultProgramId: Address): Promise<Address> {
  return (
    await getProgramDerivedAddress({
      seeds: [Buffer.from(GLOBAL_CONFIG_STATE_SEED)],
      programAddress: kaminoVaultProgramId,
    })
  )[0];
}

export async function getReserveWhitelistEntryPda(
  reserveAddress: Address,
  kaminoVaultProgramId: Address
): Promise<Address> {
  return (
    await getProgramDerivedAddress({
      seeds: [Buffer.from(WHITELISTED_RESERVES_SEED), addressEncoder.encode(reserveAddress)],
      programAddress: kaminoVaultProgramId,
    })
  )[0];
}

async function getReserveWhitelistEntryIfExists(
  reserveAddress: Address,
  rpc: Rpc<SolanaRpcApi>,
  kaminoVaultProgramId: Address
): Promise<Option<Address>> {
  const reserveWhitelistEntry = await getReserveWhitelistEntryPda(reserveAddress, kaminoVaultProgramId);
  const reserveWhitelistEntryAccount = await fetchEncodedAccount(rpc, reserveWhitelistEntry, {
    commitment: 'processed',
  });
  return reserveWhitelistEntryAccount.exists ? some(reserveWhitelistEntry) : none<Address>();
}

async function getReservesWhitelistPDAs(reserves: Address[], kaminoVaultProgramId: Address): Promise<Address[]> {
  return Promise.all(reserves.map((reserve) => getReserveWhitelistEntryPda(reserve, kaminoVaultProgramId)));
}

function deduplicateVaults(vaults: KaminoVault[]): KaminoVault[] {
  const seen = new Set<Address>();
  return vaults.filter((vault) => {
    if (seen.has(vault.address)) {
      return false;
    }
    seen.add(vault.address);
    return true;
  });
}

function parseVaultAdmin(vault: VaultState, signer?: TransactionSigner) {
  return signer ?? noopSigner(vault.vaultAdminAuthority);
}

function parseVaultPendingAdmin(vault: VaultState, signer?: TransactionSigner) {
  return signer ?? noopSigner(vault.pendingAdmin);
}

function computeNetAPR(grossAPR: Decimal, vault: VaultState): Decimal {
  const performanceFee = new Decimal(vault.performanceFeeBps.toString()).div(FullBPSDecimal);
  const managementFee = new Decimal(vault.managementFeeBps.toString()).div(FullBPSDecimal);
  return grossAPR.mul(new Decimal(1).sub(performanceFee)).sub(managementFee);
}

export type VaultHolder = {
  holderPubkey: Address;
  amount: Decimal;
};

export type APY = {
  grossAPY: Decimal;
  netAPY: Decimal;
};

export type VaultAPYs = {
  theoreticalAPY: APY;
  actualAPY: APY;
};

export class VaultHoldings {
  available: Decimal;
  invested: Decimal;
  investedInReserves: Map<Address, Decimal>; // how much is invested in each reserve, including the ctokens queued for withdrawal
  queuedForWithdrawalForReserves: Map<Address, Decimal>; // how much is queued for withdrawal for each reserve
  pendingFees: Decimal;
  totalAUMIncludingFees: Decimal;

  constructor(params: {
    available: Decimal;
    invested: Decimal;
    investedInReserves: Map<Address, Decimal>;
    queuedForWithdrawalForReserves: Map<Address, Decimal>;
    pendingFees: Decimal;
    totalAUMIncludingFees: Decimal;
  }) {
    this.available = params.available;
    this.invested = params.invested;
    this.investedInReserves = params.investedInReserves;
    this.queuedForWithdrawalForReserves = params.queuedForWithdrawalForReserves;
    this.pendingFees = params.pendingFees;
    this.totalAUMIncludingFees = params.totalAUMIncludingFees;
  }

  asJSON() {
    return {
      available: this.available.toString(),
      invested: this.invested.toString(),
      totalAUMIncludingFees: this.totalAUMIncludingFees.toString(),
      pendingFees: this.pendingFees.toString(),
      investedInReserves: pubkeyHashMapToJson(this.investedInReserves),
      queuedForWithdrawalForReserves: pubkeyHashMapToJson(this.queuedForWithdrawalForReserves),
    };
  }

  print() {
    console.log('Holdings:');
    console.log('  Available:', this.available.toString());
    console.log('  Invested:', this.invested.toString());
    console.log('  Total AUM including fees:', this.totalAUMIncludingFees.toString());
    console.log('  Pending fees:', this.pendingFees.toString());
    console.log('  Invested in reserves:', pubkeyHashMapToJson(this.investedInReserves));
    console.log('  Queued for withdrawal for reserves:', pubkeyHashMapToJson(this.queuedForWithdrawalForReserves));
  }
}

/**
 * earnedInterest represents the interest earned from now until the slot provided in the future
 */
export type SimulatedVaultHoldingsWithEarnedInterest = {
  holdings: VaultHoldings;
  earnedInterest: Decimal;
};

export type VaultHoldingsWithUSDValue = {
  holdings: VaultHoldings;
  availableUSD: Decimal;
  investedUSD: Decimal;
  investedInReservesUSD: Map<Address, Decimal>;
  totalUSDIncludingFees: Decimal;
  pendingFeesUSD: Decimal;
};

export type ReserveOverview = {
  supplyAPY: Decimal;
  /**
   * APR contribution the reserve-rewards distribution step is currently paying: zero on markets with
   * rewards disabled, and also zero while the reserve's rewards budget is depleted.
   */
  rewardsSupplyAPR: Decimal;
  utilizationRatio: Decimal;
  liquidationThresholdPct: Decimal;
  totalBorrowedAmount: Decimal;
  amountBorrowedFromSupplied: Decimal;
  suppliedAmount: Decimal;
  market: Address;
};

export type VaultReserveTotalBorrowedAndInvested = {
  totalInvested: Decimal;
  totalBorrowed: Decimal;
  utilizationRatio: Decimal;
};

export type MarketOverview = {
  address: Address;
  reservesAsCollateral: ReserveAsCollateral[]; // this MarketOverview has the reserve the caller calls for as the debt reserve and all the others as collateral reserves, so the debt reserve is not included here
  minLTVPct: Decimal;
  maxLTVPct: Decimal;
};

export type ReserveAsCollateral = {
  mint: Address;
  liquidationLTVPct: Decimal;
  address: Address;
};

export type VaultOverview = {
  holdingsUSD: VaultHoldingsWithUSDValue;
  reservesOverview: Map<Address, ReserveOverview>;
  vaultCollaterals: Map<Address, MarketOverview>;
  theoreticalSupplyAPY: APYs;
  actualSupplyAPY: APYs;
  vaultFarmIncentives: FarmIncentives;
  reservesFarmsIncentives: VaultReservesFarmsIncentives;
  delegatedFarmIncentives: FarmIncentives;
  totalBorrowed: Decimal;
  totalBorrowedUSD: Decimal;
  totalSupplied: Decimal;
  totalSuppliedUSD: Decimal;
  utilizationRatio: Decimal;
  flcFarmStats: FlcFarmStats | undefined;
  withdrawalPenalties: WithdrawPenalties;
};

export type VaultReservesFarmsIncentives = {
  reserveFarmsIncentives: Map<Address, FarmIncentives>;
  totalIncentivesAPY: Decimal;
};

export type FlcFarmStats = {
  address: Address;
  farmState: FarmState;
  totalStakedShares: Decimal;
  withdrawalCooldownDurationSeconds: number;
  isPendingUnstake: boolean;
  pendingUnstakeInfo: FarmPendingUnstakeInfo[];
};

export type FarmPendingUnstakeInfo = {
  userStateAddress: Address;
  pendingUnstakeAmountLamports: Decimal;
  pendingUnstakeAvailableAtTimestamp: number;
};

export type VaultFeesPct = {
  managementFeePct: Decimal;
  performanceFeePct: Decimal;
};

export type VaultFees = {
  managementFee: Decimal;
  performanceFee: Decimal;
};

export type VaultCumulativeInterestWithTimestamp = {
  cumulativeInterest: Decimal;
  timestamp: number;
};

export type PendingRewardsForUserInVault = {
  pendingRewardsInVaultFarm: Map<Address, Decimal>;
  pendingRewardsInVaultDelegatedFarm: Map<Address, Decimal>;
  pendingRewardsInVaultReservesFarms: Map<Address, Decimal>;
  totalPendingRewards: Map<Address, Decimal>;
};

type ReserveExitBuilderParams = {
  user: TransactionSigner;
  vault: KaminoVault;
  vaultState: VaultState;
  marketAddress: Address;
  reserve: ReserveWithAddress;
  userSharesAta: Address;
  userTokenAta: Address;
  shareAmountLamports: Decimal;
  vaultReservesState: Map<Address, KaminoReserve>;
};

type ReserveExitInstructionBuilder = (params: ReserveExitBuilderParams) => Promise<Instruction>;

type BuildReserveExitIxsParams = {
  user: TransactionSigner;
  vault: KaminoVault;
  vaultState: VaultState;
  vaultReservesMap: Map<Address, KaminoReserve>;
  liquidityPlan: ShareExitLiquidityPlan;
  builder: ReserveExitInstructionBuilder;
  payer?: TransactionSigner;
};

export type WithdrawPenalties = {
  withdrawalPenaltyLamports: Decimal;
  withdrawalPenaltyBps: Decimal;
};

export type InstantWithdrawPlan = {
  grossAmount: Decimal;
  netAmount: Decimal;
  withdrawalPenalty: Decimal;
  allowed: boolean;
};

type RedeemInKindReservePlan = {
  reserve: Address;
  sharesAmount: BN;
  ctokenAmount: BN;
};

type RedeemInKindExecutionPlan = {
  reservePlans: RedeemInKindReservePlan[];
  coveredShares: Decimal;
};

type UserSharesState = {
  userSharesAta: Address;
  ataBalance: Decimal;
  farmBalance: Decimal;
  totalShares: Decimal;
};
