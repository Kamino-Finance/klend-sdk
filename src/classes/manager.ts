import {
  Address,
  Instruction,
  generateKeyPairSigner,
  TransactionSigner,
  Slot,
  address,
  Rpc,
  SolanaRpcApi,
  GetAccountInfoApi,
  GetProgramAccountsDatasizeFilter,
  GetProgramAccountsMemcmpFilter,
  ProgramDerivedAddress,
  Base58EncodedBytes,
  getBase58Decoder,
  getAddressEncoder,
} from '@solana/kit';
import {
  KaminoVault,
  KaminoVaultClient,
  KaminoVaultConfig,
  kaminoVaultId,
  MarketOverview,
  PendingRewardsForUserInVault,
  ReserveAllocationConfig,
  ReserveOverview,
  SimulatedVaultHoldingsWithEarnedInterest,
  VaultFees,
  VaultFeesPct,
  VaultHolder,
  VaultHoldings,
  VaultHoldingsWithUSDValue,
  VaultOverview,
  VaultReserveTotalBorrowedAndInvested,
  WithdrawPenalties,
} from './vault';
import {
  AddAssetToMarketParams,
  AllOracleAccounts,
  CdnResources,
  CreateKaminoMarketParams,
  createReserveIxs,
  DEFAULT_PUBLIC_KEY,
  ENV,
  getAllLendingMarketAccounts,
  getAllOracleAccounts,
  getAllReserveAccounts,
  getReserveOracleConfigs,
  getTokenOracleDataSync,
  globalConfigPda,
  initLendingMarket,
  InitLendingMarketAccounts,
  InitLendingMarketArgs,
  initLookupTableIx,
  insertIntoLookupTableIxs,
  KaminoMarket,
  KaminoReserve,
  KVaultGlobalConfig,
  LendingMarket,
  lendingMarketAuthPda,
  MarketWithAddress,
  parseForChangesReserveConfigAndGetIxs,
  parseOracleType,
  parseTokenSymbol,
  Reserve,
  ReserveConfigUpdateIx,
  ReserveWithAddress,
  ScopeOracleConfig,
  setOrAppend,
  updateLendingMarket,
  UpdateLendingMarketAccounts,
  UpdateLendingMarketArgs,
  updateLendingMarketOwner,
  UpdateLendingMarketOwnerAccounts,
  updateReserveConfigIx,
} from '../lib';
import { PROGRAM_ID } from '../@codegen/klend/programId';
import { Scope, U16_MAX } from '@kamino-finance/scope-sdk';
import { TokenMetadatas } from '@kamino-finance/scope-sdk/dist/@codegen/scope/accounts/TokenMetadatas';
import BN from 'bn.js';
import {
  ReserveConfig,
  ReserveFarmKind,
  ReserveFarmKindKind,
  UpdateConfigMode,
  UpdateConfigModeKind,
  UpdateLendingMarketMode,
  UpdateLendingMarketModeKind,
} from '../@codegen/klend/types';
import Decimal from 'decimal.js';
import { VaultState } from '../@codegen/kvault/accounts';
import { getProgramAccounts, isNotNullPubkey, computeLutFinalPhysicalSize } from '../utils';
import {
  UpdateReserveWhitelistModeKind,
  VaultAllocationFields,
  VaultConfigField,
  VaultConfigFieldKind,
} from '../@codegen/kvault/types';
import {
  AcceptVaultOwnershipIxs,
  APYs,
  CreateVaultFarm,
  DepositIxs,
  DisinvestAllReservesIxs,
  InitVaultIxs,
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
  WithdrawRedeemAndEnqueueIxs,
} from './vault_types';
import type { LedgerInstant } from '../utils/ledger';
import { FarmIncentives, Farms, FarmState } from '@kamino-finance/farms-sdk/dist';
import { decodeVaultState } from '../utils/vault';
import { noopSigner } from '../utils/signer';
import type { WalletType } from '../utils/wallets';
import { getCreateAccountInstruction, SYSTEM_PROGRAM_ADDRESS } from '@solana-program/system';
import { SYSVAR_INSTRUCTIONS_ADDRESS, SYSVAR_RENT_ADDRESS } from '@solana/sysvars';
import { ASSOCIATED_TOKEN_PROGRAM_ADDRESS, TOKEN_PROGRAM_ADDRESS } from '@solana-program/token';
import { fetchAddressLookupTable } from '@solana-program/address-lookup-table';
import { FarmsClient } from '../utils/farmUtils';
import type { AccountInfoBase, AccountInfoWithJsonData, AccountInfoWithPubkey } from '@solana/rpc-types';
import { arrayElementConfigItems, ConfigUpdater, PriorityOrderedConfigUpdater } from './configItems';
import { OracleMappings } from '@kamino-finance/scope-sdk/dist/@codegen/scope/accounts';
import { getReserveFarmRewardsAPY as getReserveFarmRewardsAPYUtils, ReserveIncentives } from '../utils/farmUtils';
import { kaminoCdn } from './cdnClient';

const base58Decoder = getBase58Decoder();
const addressEncoder = getAddressEncoder();

/** Maximum number of addresses a single Address Lookup Table can hold. */
const MAX_LOOKUP_TABLE_ADDRESSES = 256;

/**
 * The instructions and address for a market lookup table.
 * A market lookup table is client-owned: the market account has no on-chain field for it, so the caller creates it,
 * keeps `lut`, and passes it back as `existingLut` to top it up later.
 */
export type MarketLutIxs = {
  /** The new (freshly created) or existing lookup table address. */
  lut: Address;
  /** The instruction that creates the lookup table, or `null` when extending an existing one. */
  createLutIx: Instruction | null;
  /** The instructions that insert the market and reserve keys into the lookup table. Send these after `createLutIx` is confirmed. */
  populateLutIxs: Instruction[];
};

/**
 * KaminoManager is a class that provides a high-level interface to interact with the Kamino Lend and Kamino Vault programs, in order to create and manage a market, as well as vaults
 */
export class KaminoManager {
  private readonly _rpc: Rpc<SolanaRpcApi>;
  private readonly _kaminoVaultProgramId: Address;
  private readonly _kaminoLendProgramId: Address;
  private readonly _farmsProgramId?: Address;
  private readonly _vaultClient: KaminoVaultClient;
  recentSlotDurationMs: number;

  constructor(
    rpc: Rpc<SolanaRpcApi>,
    recentSlotDurationMs: number,
    kaminoLendProgramId?: Address,
    kaminoVaultProgramId?: Address,
    cdnResources?: CdnResources,
    farmsProgramId?: Address
  ) {
    this._rpc = rpc;
    this.recentSlotDurationMs = recentSlotDurationMs;
    this._kaminoVaultProgramId = kaminoVaultProgramId ? kaminoVaultProgramId : kaminoVaultId;
    this._kaminoLendProgramId = kaminoLendProgramId ? kaminoLendProgramId : PROGRAM_ID;
    this._farmsProgramId = farmsProgramId;
    this._vaultClient = new KaminoVaultClient(
      rpc,
      this.recentSlotDurationMs,
      this._kaminoVaultProgramId,
      this._kaminoLendProgramId,
      cdnResources,
      farmsProgramId
    );
  }

  getRpc() {
    return this._rpc;
  }

  getProgramID() {
    return this._kaminoVaultProgramId;
  }

  /**
   * This is a function that helps quickly setting up a reserve for an asset with a default config. The config can be modified later on.
   * @param params.admin - the admin of the market
   * @returns market keypair - keypair used for market account creation -> to be signed with when executing the transaction
   * @returns ixs - an array of ixs for creating and initializing the market account
   */
  async createMarketIxs(params: CreateKaminoMarketParams): Promise<{ market: TransactionSigner; ixs: Instruction[] }> {
    const marketAccount = await generateKeyPairSigner();
    const size = BigInt(LendingMarket.layout.span + 8);
    const [lendingMarketAuthority] = await lendingMarketAuthPda(marketAccount.address, this._kaminoLendProgramId);
    const createMarketIxs: Instruction[] = [];

    createMarketIxs.push(
      getCreateAccountInstruction({
        payer: params.admin,
        newAccount: marketAccount,
        space: size,
        lamports: await this._rpc.getMinimumBalanceForRentExemption(size).send(),
        programAddress: this._kaminoLendProgramId,
      })
    );

    const accounts: InitLendingMarketAccounts = {
      lendingMarketOwner: params.admin,
      lendingMarket: marketAccount.address,
      lendingMarketAuthority: lendingMarketAuthority,
      systemProgram: SYSTEM_PROGRAM_ADDRESS,
      rent: SYSVAR_RENT_ADDRESS,
      instructionSysvarAccount: SYSVAR_INSTRUCTIONS_ADDRESS,
    };

    const args: InitLendingMarketArgs = {
      quoteCurrency: Array(32).fill(0),
    };

    createMarketIxs.push(initLendingMarket(args, accounts, undefined, this._kaminoLendProgramId));

    return { market: marketAccount, ixs: createMarketIxs };
  }

  /**
   * This is a function that helps quickly setting up a reserve for an asset with a default config. The config can be modified later on.
   * @param params.admin - the admin of the reserve
   * @param params.marketAddress - the market to create a reserve for, only the market admin can create a reserve for the market
   * @param params.assetConfig - an object that helps generate a default reserve config with some inputs which have to be configured before calling this function
   * @returns reserve - keypair used for reserve creation -> to be signed with when executing the transaction
   * @returns txnIxs - an array of arrays of ixs -> first array for reserve creation, second for updating it with correct params
   */
  async addAssetToMarketIxs(params: AddAssetToMarketParams): Promise<{
    createReserveIxs: Instruction[];
    configUpdateIxs: ReserveConfigUpdateIx[];
  }> {
    const market = await LendingMarket.fetch(this._rpc, params.marketAddress, this._kaminoLendProgramId);
    if (!market) {
      throw new Error('Market not found');
    }
    const marketWithAddress: MarketWithAddress = { address: params.marketAddress, state: market };

    const reserve = await Reserve.fetch(this._rpc, params.reserveKeypair.address, this._kaminoLendProgramId);

    let createReserveInstructions: Instruction[] = [];
    if (!reserve) {
      createReserveInstructions = await createReserveIxs(
        this._rpc,
        params.admin,
        params.adminLiquiditySource,
        params.marketAddress,
        params.assetConfig.mint,
        params.assetConfig.mintTokenProgram,
        params.reserveKeypair,
        this._kaminoLendProgramId
      );
    } else {
      console.log('Reserve already exists, skipping creation');
    }

    const configUpdateIxs = await this.updateReserveIxs(
      params.admin,
      marketWithAddress,
      params.reserveKeypair.address,
      params.assetConfig.getReserveConfig(),
      undefined,
      params.globalAdminSigner
    );

    return { createReserveIxs: createReserveInstructions, configUpdateIxs };
  }

  /**
   * This method initializes the kvault global config (one off, needs to be signed by program owner)
   * @param admin - the admin of the kvault program
   * @returns - an instruction to initialize the kvault global config
   */
  async initKvaultGlobalConfigIx(admin: TransactionSigner) {
    return this._vaultClient.initKvaultGlobalConfigIx(admin);
  }

  /**
   * This method will create a vault with a given config. The config can be changed later on, but it is recommended to set it up correctly from the start
   * @param vaultConfig - the config object used to create a vault
   * @returns vault: the keypair of the vault, used to sign the initialization transaction; initVaultIxs: a struct with ixs to initialize the vault and its lookup table + populateLUTIxs, a list to populate the lookup table which has to be executed in a separate transaction
   */
  async createVaultIxs(
    vaultConfig: KaminoVaultConfig,
    useDevnetFarms: boolean = false
  ): Promise<{ vault: TransactionSigner; lut: Address; initVaultIxs: InitVaultIxs }> {
    return this._vaultClient.createVaultIxs(vaultConfig, useDevnetFarms);
  }

  /**
   * This method creates a farm for a vault
   * @param admin - the admin of the vault
   * @param vault - the vault to create a farm for (the vault should be already initialized)
   * @returns a struct with the farm, the setup farm ixs and the update farm ixs
   */
  async createVaultFarmIxs(admin: TransactionSigner, vault: KaminoVault): Promise<CreateVaultFarm> {
    const vaultState = await vault.getState();
    if (!vaultState) {
      throw new Error('Vault not initialized');
    }
    if (vaultState.vaultFarm !== DEFAULT_PUBLIC_KEY) {
      throw new Error('Vault already has a farm');
    }
    return this._vaultClient.createVaultFarm(admin, vault.address, vaultState.sharesMint);
  }

  /**
   * This method creates an instruction to set the shares metadata for a vault
   * @param authority - the vault admin
   * @param vault - the vault to set the shares metadata for
   * @param tokenName - the name of the token in the vault (symbol; e.g. "USDC" which becomes "kVUSDC")
   * @param extraName - the extra string appended to the prefix("Kamino Vault USDC <extraName>")
   * @returns - an instruction to set the shares metadata for the vault
   */
  async getSetSharesMetadataIx(
    authority: TransactionSigner,
    vault: KaminoVault,
    tokenName: string,
    extraName: string,
    metadataProgramId?: Address,
    kvaultProgramId?: Address
  ) {
    const vaultState = await vault.getState();
    return this._vaultClient.getSetSharesMetadataIx(
      this._rpc,
      authority,
      vault.address,
      vaultState.sharesMint,
      vaultState.baseVaultAuthority,
      tokenName,
      extraName,
      metadataProgramId,
      kvaultProgramId
    );
  }

  /**
   * This method updates the vault reserve allocation cofnig for an exiting vault reserve, or adds a new reserve to the vault if it does not exist.
   * @param vault - vault to be updated
   * @param reserveAllocationConfig - new reserve allocation config
   * @param [signer] - optional parameter to pass a different signer for the instruction. If not provided, the admin of the vault will be used
   * @returns - a struct with an instruction to update the reserve allocation and an optional list of instructions to update the lookup table for the allocation changes
   */
  async updateVaultReserveAllocationIxs(
    vault: KaminoVault,
    reserveAllocationConfig: ReserveAllocationConfig,
    signer?: TransactionSigner
  ): Promise<UpdateReserveAllocationIxs> {
    return this._vaultClient.updateReserveAllocationIxs(vault, reserveAllocationConfig, signer);
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
  ): Promise<Instruction[]> {
    return this._vaultClient.updateVaultUnallocatedWeightAndCapIxs(
      vault,
      vaultReservesMap,
      vaultAdminAuthority,
      unallocatedWeight,
      unallocatedCap
    );
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
    return this._vaultClient.removeReserveFromAllocationIx(vault, reserve, vaultAdminAuthority);
  }

  private buildVaultWithZeroedReserveAllocation(
    kaminoVault: KaminoVault,
    vaultState: VaultState,
    reserveAddress: Address
  ): KaminoVault {
    const vaultAllocationStrategy = vaultState.vaultAllocationStrategy.map<VaultAllocationFields>((allocation) =>
      allocation.reserve === reserveAddress
        ? {
            ...allocation,
            targetAllocationWeight: new BN(0),
            tokenAllocationCap: new BN(0),
          }
        : allocation
    );
    const vaultStateAfterSetAllocationToZero = new VaultState({
      ...vaultState,
      vaultAllocationStrategy,
    });

    // The invest planner must see the allocation update that is emitted earlier in the same tx.
    return new KaminoVault(
      this.getRpc(),
      kaminoVault.address,
      this.recentSlotDurationMs,
      vaultStateAfterSetAllocationToZero,
      this._kaminoVaultProgramId
    );
  }

  /**
   * This method sets weight to 0, remove tokens and remove from allocation a reserve from the vault
   * @param signer - signer to use for the transaction
   * @param kaminoVault - vault to remove the reserve from
   * @param reserveAddress - reserve to remove from the vault allocation strategy
   * @param ledgerInstant - current ledger instant (slot + block time), fetched from chain
   * @param reserveState - preloaded reserve state for the reserve being removed
   * @returns - an array of instructions to set the reserve allocation to 0, disinvest up to the freely withdrawable reserve liquidity, and remove the reserve from the allocation when the full allocation can be disinvested
   */
  async fullRemoveReserveFromVaultIxs(
    signer: TransactionSigner,
    kaminoVault: KaminoVault,
    reserveAddress: Address,
    ledgerInstant: LedgerInstant,
    reserveState: Reserve
  ): Promise<Instruction[]> {
    const vaultState = await kaminoVault.getState();

    const allocations = this.getVaultReserves(vaultState);
    if (!allocations.includes(reserveAddress)) {
      throw new Error('Reserve not found in vault allocations');
    }

    const reserveWithAddress: ReserveWithAddress = {
      address: reserveAddress,
      state: reserveState,
    };

    const kaminoReserve = await KaminoReserve.initializeFromAddress(
      reserveAddress,
      this.getRpc(),
      this.recentSlotDurationMs,
      reserveState,
      undefined,
      undefined,
      undefined,
      this._kaminoLendProgramId
    );

    const reserveAllocationConfig = new ReserveAllocationConfig(reserveWithAddress, 0, new Decimal(0));
    const setAllocationToZeroIx = await this.updateVaultReserveAllocationIxs(
      kaminoVault,
      reserveAllocationConfig,
      signer
    );

    const vaultReservesMap = await this.loadVaultReserves(vaultState);
    const reserveAllocationAvailableLiquidityToWithdraw =
      await this._vaultClient.getReserveAllocationAvailableLiquidityToWithdraw(
        vaultState,
        ledgerInstant,
        vaultReservesMap
      );
    const maxAmountLamports = reserveAllocationAvailableLiquidityToWithdraw.get(reserveAddress) ?? new Decimal(0);

    const removeAllocationIx = await this.removeReserveFromAllocationIx(kaminoVault, reserveAddress, signer);

    const ixs = [setAllocationToZeroIx.updateReserveAllocationIx];

    const suppliedInReserve = this.getSuppliedInReserve(vaultState, ledgerInstant, kaminoReserve);
    if (suppliedInReserve.gt(new Decimal(0))) {
      const kaminoVaultAfterSetAllocationToZero = this.buildVaultWithZeroedReserveAllocation(
        kaminoVault,
        vaultState,
        reserveAddress
      );
      const investIx = maxAmountLamports.gt(0)
        ? await this.investSingleReserveWithMaxAmountIxs(
            signer,
            kaminoVaultAfterSetAllocationToZero,
            reserveWithAddress,
            maxAmountLamports.floor().toFixed(0),
            vaultReservesMap
          )
        : [];
      ixs.push(...investIx);
    }
    const suppliedInReserveLamports = suppliedInReserve
      .mul(new Decimal(10).pow(reserveState.liquidity.mintDecimals.toNumber()))
      .floor();
    if (removeAllocationIx && maxAmountLamports.gte(suppliedInReserveLamports)) {
      ixs.push(removeAllocationIx);
    }

    return ixs;
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
    return this._vaultClient.withdrawEverythingAndBlockInvestReserve(vault, reserve, vaultAdminAuthority);
  }

  /**
   * This method withdraws all the funds from all the reserves and blocks them from being invested by setting their weight and ctoken allocation to 0
   * @param vault - the vault to withdraw the invested funds from
   * @param ledgerInstant - current ledger instant (slot + block time), used for reserve and vault calculations
   * @param [vaultReservesMap] - optional parameter to pass a map of the vault reserves. If not provided, the reserves will be loaded from the vault
   * @param [payer] - optional parameter to pass a different payer for the transaction. If not provided, the admin of the vault will be used; this is the payer for the invest ixs and it should have an ATA and some lamports (2x no_of_reserves) of the token vault
   * @returns - a struct with an instruction to update the reserve allocation and an optional list of instructions to update the lookup table for the allocation changes
   */
  async withdrawEverythingFromAllReservesAndBlockInvest(
    vault: KaminoVault,
    ledgerInstant: LedgerInstant,
    vaultReservesMap: Map<Address, KaminoReserve>,
    payer?: TransactionSigner
  ): Promise<WithdrawAndBlockReserveIxs> {
    return this._vaultClient.withdrawEverythingFromAllReservesAndBlockInvest(
      vault,
      ledgerInstant,
      vaultReservesMap,
      payer
    );
  }

  /**
   * This method disinvests all the funds from all the reserves and set their weight to 0; for vaults that are managed by external bot/crank, the bot can change the weight and invest in the reserves again
   * @param vault - the vault to disinvest the invested funds from
   * @param ledgerInstant - current ledger instant (slot + block time), used for reserve and vault calculations
   * @param [vaultReservesMap] - optional parameter to pass a map of the vault reserves. If not provided, the reserves will be loaded from the vault
   * @param [payer] - optional parameter to pass a different payer for the transaction. If not provided, the admin of the vault will be used; this is the payer for the invest ixs and it should have an ATA and some lamports (2x no_of_reserves) of the token vault
   * @returns - a struct with an instruction to update the reserve allocations to 0 weight and a list of instructions to disinvest the funds in the reserves
   */
  async disinvestAllReservesIxs(
    vault: KaminoVault,
    ledgerInstant: LedgerInstant,
    vaultReservesMap: Map<Address, KaminoReserve>,
    payer?: TransactionSigner
  ): Promise<DisinvestAllReservesIxs> {
    return this._vaultClient.disinvestAllReservesIxs(vault, ledgerInstant, vaultReservesMap, payer);
  }

  // async closeVault(vault: KaminoVault): Promise<TransactionInstruction> {
  //   return this._vaultClient.closeVaultIx(vault);
  // }

  /**
   * This method returns the reserve config from a preloaded reserve state
   * @param reserveState - preloaded reserve state
   * @returns - the reserve config
   */
  async getReserveConfig(reserveState: Reserve): Promise<ReserveConfig> {
    return reserveState.config;
  }

  /**
   * This function enables the update of the scope oracle configuration. In order to get a list of scope prices, getScopeOracleConfigs can be used
   * @param lendingMarketOwner - market admin
   * @param market - lending market which owns the reserve
   * @param reserve - reserve which to be updated
   * @param oraclePrices - scope OraclePrices account pubkey
   * @param scopeOracleConfig - new scope oracle config
   * @param scopeTwapConfig - new scope twap config
   * @param maxAgeBufferSeconds - buffer to be added to onchain max_age - if oracle price is older than that, txns interacting with the reserve will fail
   * @returns - an array of instructions used update the oracle configuration
   */
  async updateReserveScopeOracleConfigurationIxs(
    lendingMarketOwner: TransactionSigner,
    market: MarketWithAddress,
    reserve: ReserveWithAddress,
    oraclePrices: Address,
    scopeOracleConfig: ScopeOracleConfig,
    scopeTwapConfig?: ScopeOracleConfig,
    maxAgeBufferSeconds: number = 20
  ): Promise<Instruction[]> {
    const reserveConfig = reserve.state.config;

    let scopeTwapId = U16_MAX;
    if (scopeTwapConfig) {
      scopeTwapId = scopeTwapConfig.oracleId;

      // if(scopeTwapConfig.twapSourceId !== scopeOracleConfig.oracleId) {
      //   throw new Error('Twap source id must match oracle id');
      // }
    }

    const { scopeConfiguration } = getReserveOracleConfigs({
      scopePriceConfigAddress: oraclePrices,
      scopeChain: [scopeOracleConfig.oracleId],
      scopeTwapChain: [scopeTwapId],
    });

    const newReserveConfig = new ReserveConfig({
      ...reserveConfig,
      tokenInfo: {
        ...reserveConfig.tokenInfo,
        scopeConfiguration: scopeConfiguration,
        // TODO: Decide if we want to keep this maxAge override for twap & price
        maxAgeTwapSeconds: scopeTwapConfig
          ? new BN(scopeTwapConfig.max_age + maxAgeBufferSeconds)
          : reserveConfig.tokenInfo.maxAgeTwapSeconds,
        maxAgePriceSeconds: new BN(scopeOracleConfig.max_age + maxAgeBufferSeconds),
      },
    });

    const updateIxs = await this.updateReserveIxs(
      lendingMarketOwner,
      market,
      reserve.address,
      newReserveConfig,
      reserve.state
    );
    return updateIxs.map((item) => item.ix);
  }

  /**
   * This function updates the given reserve with a new config. It updates fields which differ between given reserve config and existing reserve config
   * @param lendingMarketOwner - market authority
   * @param marketWithAddress - the market that owns the reserve to be updated
   * @param reserve - the reserve to be updated
   * @param config - the new reserve configuration to be used for the update
   * @param reserveStateOverride - the reserve state, useful to provide, if already fetched outside this method, in order to avoid an extra rpc call to fetch it. Make sure the reserveConfig has not been updated since fetching the reserveState that you pass in.
   * @param globalAdminSigner - optional global admin signer for config modes that require it
   * @returns - an array of update instructions with metadata indicating if global admin is required as signer.
   * If there are many fields that are being updated, multiple transactions might be required to fit all ixs.
   */
  async updateReserveIxs(
    lendingMarketOwner: TransactionSigner,
    marketWithAddress: MarketWithAddress,
    reserve: Address,
    config: ReserveConfig,
    reserveStateOverride?: Reserve,
    globalAdminSigner?: TransactionSigner
  ): Promise<ReserveConfigUpdateIx[]> {
    const reserveState = reserveStateOverride
      ? reserveStateOverride
      : (await Reserve.fetch(this._rpc, reserve, this._kaminoLendProgramId))!;
    const ixs: ReserveConfigUpdateIx[] = [];

    ixs.push(
      ...(await parseForChangesReserveConfigAndGetIxs(
        marketWithAddress,
        reserveState,
        reserve,
        config,
        this._kaminoLendProgramId,
        lendingMarketOwner,
        globalAdminSigner
      ))
    );

    return ixs;
  }

  /**
   * This function creates an instruction that repoints a reserve's collateral or debt farm.
   * The farm addresses live on the `Reserve` level (not inside `ReserveConfig`), so they are not covered by
   * `updateReserveIxs`; this method emits the dedicated `UpdateFarmCollateral` / `UpdateFarmDebt` config update instead.
   * @param lendingMarketOwner - market authority (the reserve's lending market owner)
   * @param marketWithAddress - the market that owns the reserve to be updated
   * @param reserve - the reserve whose farm is being repointed
   * @param farmKind - which farm to set: `Collateral` or `Debt`
   * @param farmAddress - the farm state address to point the reserve at
   * @returns - the instruction that updates the reserve's farm address
   */
  async updateReserveFarmIx(
    lendingMarketOwner: TransactionSigner,
    marketWithAddress: MarketWithAddress,
    reserve: Address,
    farmKind: ReserveFarmKindKind,
    farmAddress: Address
  ): Promise<Instruction> {
    const mode: UpdateConfigModeKind =
      farmKind.discriminator === ReserveFarmKind.Collateral.discriminator
        ? new UpdateConfigMode.UpdateFarmCollateral()
        : new UpdateConfigMode.UpdateFarmDebt();

    const value = new Uint8Array(addressEncoder.encode(farmAddress));

    return updateReserveConfigIx(
      lendingMarketOwner,
      marketWithAddress.address,
      reserve,
      mode,
      value,
      this._kaminoLendProgramId,
      false
    );
  }

  /**
   * This function builds the instructions to create and/or populate a market lookup table with the market's stable
   * accounts and every reserve's linked accounts (vaults, mints, farms, oracles). A market lookup table is client-owned:
   * the market account has no on-chain field for it, so the caller keeps the returned `lut` and passes it back as
   * `existingLut` to top it up later (e.g. after adding a reserve).
   * This helper plans one lookup table and throws if the market's non-null accounts cannot fit in that table.
   * @param authority - the lookup table authority and payer (creates and later extends/closes the table)
   * @param market - the loaded market whose accounts (and reserves) populate the lookup table
   * @param existingLut - optional existing lookup table to extend; when omitted, a new one is created
   * @returns - the lookup table address, the creation instruction (null when extending), and the chunked populate instructions.
   * The `createLutIx` must be confirmed before sending `populateLutIxs`.
   * The capacity check uses one RPC snapshot of an existing lookup table. It is advisory if another writer extends
   * the table at the same time. Population uses multiple instructions, so a later failure can leave the table partly
   * populated. Callers should avoid concurrent writers and rerun this method to top up the table after a failure.
   */
  async getMarketLookupTableIxs(
    authority: TransactionSigner,
    market: KaminoMarket,
    existingLut?: Address
  ): Promise<MarketLutIxs> {
    if (market.getReserves().length === 0) {
      await market.reload();
    }

    const globalConfig = await globalConfigPda(this._kaminoLendProgramId);
    const lendingMarketAuthority = await market.getLendingMarketAuthority();

    const keys: Address[] = [
      globalConfig,
      market.state.lendingMarketOwner,
      market.getAddress(),
      lendingMarketAuthority,
      TOKEN_PROGRAM_ADDRESS,
      ASSOCIATED_TOKEN_PROGRAM_ADDRESS,
    ];

    for (const reserve of market.getReserves()) {
      const state = reserve.state;
      keys.push(
        reserve.address,
        state.liquidity.mintPubkey,
        state.liquidity.supplyVault,
        state.liquidity.feeVault,
        // each reserve carries its own liquidity token program, so Token-2022 reserves alias the right program
        state.liquidity.tokenProgram,
        state.collateral.mintPubkey,
        state.collateral.supplyVault,
        state.farmCollateral,
        state.farmDebt,
        state.config.tokenInfo.pythConfiguration.price,
        state.config.tokenInfo.scopeConfiguration.priceFeed,
        state.config.tokenInfo.switchboardConfiguration.priceAggregator,
        state.config.tokenInfo.switchboardConfiguration.twapAggregator
      );
    }

    let lut = existingLut;
    let createLutIx: Instruction | null = null;
    const validKeys = keys.filter(isNotNullPubkey);

    // A freshly created table starts empty; an existing one may already hold entries.
    let accountsInLut: Address[];
    if (lut === undefined) {
      const recentSlot = await this._rpc.getSlot({ commitment: 'finalized' }).send();
      const [ix, newLut] = await initLookupTableIx(authority, recentSlot);
      createLutIx = ix;
      lut = newLut;
      accountsInLut = [];
    } else {
      // why: a caller-supplied existing LUT must be readable. Unlike getAccountsInLut (which swallows read
      // failures into []), a transient RPC error here must abort — treating a populated LUT as empty would
      // bypass the 256-address guard and re-emit extends for keys already present, duplicating entries.
      accountsInLut = (await fetchAddressLookupTable(this._rpc, lut)).data.addresses;
    }

    // A lookup table holds at most 256 addresses. Use physical size (existing length + unique missing keys)
    // rather than Set-union size: on-chain LUTs can already contain duplicates, and Set-union undercounts them.
    const finalPhysicalSize = computeLutFinalPhysicalSize(accountsInLut, validKeys);
    if (finalPhysicalSize > MAX_LOOKUP_TABLE_ADDRESSES) {
      throw new Error(
        `This helper supports only markets whose unique non-null account set fits in one lookup table. Market ${market.getAddress()} would require ${finalPhysicalSize} physical entries, exceeding the ${MAX_LOOKUP_TABLE_ADDRESSES}-address limit.`
      );
    }

    const populateLutIxs = await insertIntoLookupTableIxs(this._rpc, authority, lut, validKeys, accountsInLut);

    return { lut, createLutIx, populateLutIxs };
  }

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
   * @returns - an instance of DepositIxs which contains the instructions to deposit in vault and the instructions to stake the shares in the farm if the vault has a farm
   */
  async depositToVaultIxs(
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
    return this._vaultClient.depositIxs(
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

  /**
   * This function creates instructions to buy shares (i.e. deposit) into a vault. It will also create ATA creation instructions for the vault shares that the user receives in return
   * @param user - user to nuy shares
   * @param vault - vault to buy shares from (if the state is not provided, it will be fetched)
   * @param tokenAmount - token amount to be swapped for shares, in decimals (will be converted in lamports)
   * @param vaultReservesMap - preloaded reserve states for every reserve in the vault allocation
   * @param farmState - preloaded vault farm state; provide this to stake into the vault farm
   * @param flcFarmState - preloaded first loss capital farm state; provide this to stake into the first loss capital farm
   * Pass only one of `farmState` or `flcFarmState`, depending on whether you want vault-farm or first loss capital farm behavior. Pass neither to skip staking.
   * @param [payer] - optional parameter to pass a different payer for ATA creation rent. If not provided, the user will be used
   * @param [minSharesOut] - optional minimum amount of shares to receive, in decimals (will be converted in lamports); if provided the buy reverts on-chain unless at least this many shares are minted
   * @returns - an instance of DepositIxs which contains the instructions to buy shares in vault and the instructions to stake the shares in the farm if the vault has a farm
   */
  async buyVaultSharesIxs(
    user: TransactionSigner,
    vault: KaminoVault,
    tokenAmount: Decimal,
    vaultReservesMap: Map<Address, KaminoReserve>,
    farmState: FarmState | null,
    flcFarmState: FarmState | null,
    payer?: TransactionSigner,
    minSharesOut?: Decimal
  ): Promise<DepositIxs> {
    return this._vaultClient.buySharesIxs(
      user,
      vault,
      tokenAmount,
      vaultReservesMap,
      farmState,
      flcFarmState,
      payer,
      minSharesOut
    );
  }

  /**
   * Estimate the shares received for depositing a token amount, computed from the provided states without any RPC call
   * @param vaultState - the vault state to estimate the shares for
   * @param tokenAmount - token amount to be deposited, in decimals
   * @param ledgerInstant - current ledger instant (slot + block time), used to estimate the interest earned in the reserves the vault is invested in
   * @param vaultReservesMap - hashmap from each reserve pubkey to the reserve state
   * @param [slippageBps] - optional slippage to discount from the estimated shares, in bps. Defaults to 0 (no discount)
   * @returns - the estimated amount of shares received for the deposit, in decimals
   */
  estimateSharesFromTokens(
    vaultState: VaultState,
    tokenAmount: Decimal,
    ledgerInstant: LedgerInstant,
    vaultReservesMap: Map<Address, KaminoReserve>,
    slippageBps: number = 0
  ): Decimal {
    return this._vaultClient.estimateSharesFromTokens(
      vaultState,
      tokenAmount,
      ledgerInstant,
      vaultReservesMap,
      slippageBps
    );
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
    return this._vaultClient.stakeSharesIxs(user, vault, sharesAmount, farmState);
  }

  /**
   * Update a field of the vault. If the field is a pubkey it will return an extra instruction to add that account into the lookup table
   * @param vault the vault to update
   * @param mode the field to update (based on VaultConfigFieldKind enum)
   * @param value the value to update the field with
   * @param [signer] the signer of the transaction. Optional. If not provided the admin of the vault will be used. It should be used when changing the admin of the vault if we want to build or batch multiple ixs in the same tx
   * @param [lutIxsSigner] the signer of the transaction to be used for the lookup table instructions. Optional. If not provided the admin of the vault will be used. It should be used when changing the admin of the vault if we want to build or batch multiple ixs in the same tx
   * @param [skipLutUpdate] if true, the lookup table instructions will not be included in the returned instructions
   * @param errorOnOverride throw error if vault already has a farm
   * @param bypassConfigValidations if true, the config validations will not be performed
   * @returns a struct that contains the instruction to update the field and an optional list of instructions to update the lookup table
   */
  async updateVaultConfigIxs(
    vault: KaminoVault,
    mode: VaultConfigFieldKind | string,
    value: string,
    vaultReservesMap: Map<Address, KaminoReserve>,
    signer?: TransactionSigner,
    lutIxsSigner?: TransactionSigner,
    skipLutUpdate: boolean = false,
    errorOnOverride: boolean = true,
    bypassConfigValidations: boolean = false
  ): Promise<UpdateVaultConfigIxs> {
    if (typeof mode === 'string') {
      const field = VaultConfigField.fromDecoded({ [mode]: '' });
      return this._vaultClient.updateVaultConfigIxs(
        vault,
        field,
        value,
        vaultReservesMap,
        signer,
        lutIxsSigner,
        skipLutUpdate,
        errorOnOverride,
        bypassConfigValidations
      );
    }

    return this._vaultClient.updateVaultConfigIxs(
      vault,
      mode,
      value,
      vaultReservesMap,
      signer,
      lutIxsSigner,
      skipLutUpdate,
      errorOnOverride,
      bypassConfigValidations
    );
  }

  /**
   * Append the remaining reserve accounts required by vault instructions.
   * @param ix - the instruction to append the remaining accounts to
   * @param vaultReserves - the vault reserve addresses to append
   * @param vaultReservesState - preloaded reserve state for each vault reserve
   * @returns the instruction with reserve remaining accounts appended
   */
  public appendRemainingAccountsForVaultReserves(
    ix: Instruction,
    vaultReserves: Address[],
    vaultReservesState: Map<Address, KaminoReserve>
  ): Instruction {
    return this._vaultClient.appendRemainingAccountsForVaultReserves(ix, vaultReserves, vaultReservesState);
  }

  /**
   * Update the vault performance fee (in bps).
   */
  async updateVaultPerfFeeIxs(
    vault: KaminoVault,
    feeBps: BN | number | string,
    vaultReservesMap: Map<Address, KaminoReserve>,
    vaultAdminAuthority?: TransactionSigner
  ): Promise<UpdateVaultConfigIxs> {
    return this._vaultClient.updateVaultPerfFeeIxs(vault, feeBps, vaultReservesMap, vaultAdminAuthority);
  }

  /**
   * Update the vault management fee (in bps).
   */
  async updateVaultMgmtFeeIxs(
    vault: KaminoVault,
    feeBps: BN | number | string,
    vaultReservesMap: Map<Address, KaminoReserve>,
    vaultAdminAuthority?: TransactionSigner
  ): Promise<UpdateVaultConfigIxs> {
    return this._vaultClient.updateVaultMgmtFeeIxs(vault, feeBps, vaultReservesMap, vaultAdminAuthority);
  }

  /**
   * Update the rate at which the vault rewards are distributed to depositors (in token lamports per second).
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
    return this._vaultClient.setVaultRewardPerSecondIxs(
      vault,
      rewardPerSecondLamports,
      vaultReservesMap,
      vaultAdminAuthority
    );
  }

  /**
   * Update the pending admin for the vault (step 1/2 of the ownership transfer).
   */
  async updateVaultPendingAdminIxs(
    vault: KaminoVault,
    newAdmin: Address,
    vaultReservesMap: Map<Address, KaminoReserve>,
    vaultAdminAuthority?: TransactionSigner,
    lutIxsSigner?: TransactionSigner,
    skipLutUpdate: boolean = false
  ): Promise<UpdateVaultConfigIxs> {
    return this._vaultClient.updateVaultPendingAdminIxs(
      vault,
      newAdmin,
      vaultReservesMap,
      vaultAdminAuthority,
      lutIxsSigner,
      skipLutUpdate
    );
  }

  /**
   * Update the vault name.
   */
  async updateVaultNameIxs(
    vault: KaminoVault,
    name: string,
    vaultReservesMap: Map<Address, KaminoReserve>,
    vaultAdminAuthority?: TransactionSigner
  ): Promise<UpdateVaultConfigIxs> {
    return this._vaultClient.updateVaultNameIxs(vault, name, vaultReservesMap, vaultAdminAuthority);
  }

  /**
   * Update the vault lookup table address.
   */
  async updateVaultLookupTableIxs(
    vault: KaminoVault,
    lookupTable: Address,
    vaultReservesMap: Map<Address, KaminoReserve>,
    vaultAdminAuthority?: TransactionSigner
  ): Promise<UpdateVaultConfigIxs> {
    return this._vaultClient.updateVaultLookupTableIxs(vault, lookupTable, vaultReservesMap, vaultAdminAuthority);
  }

  /**
   * Update the vault allocation admin.
   */
  async updateVaultAllocationAdminIxs(
    vault: KaminoVault,
    allocationAdmin: Address,
    vaultReservesMap: Map<Address, KaminoReserve>,
    vaultAdminAuthority?: TransactionSigner
  ): Promise<UpdateVaultConfigIxs> {
    return this._vaultClient.updateVaultAllocationAdminIxs(
      vault,
      allocationAdmin,
      vaultReservesMap,
      vaultAdminAuthority
    );
  }

  /**
   * Update the vault unallocated weight.
   */
  async updateVaultUnallocatedWeightIxs(
    vault: KaminoVault,
    unallocatedWeight: BN | number | string,
    vaultReservesMap: Map<Address, KaminoReserve>,
    vaultAdminAuthority?: TransactionSigner
  ): Promise<UpdateVaultConfigIxs> {
    return this._vaultClient.updateVaultUnallocatedWeightIxs(
      vault,
      unallocatedWeight,
      vaultReservesMap,
      vaultAdminAuthority
    );
  }

  /**
   * Update the vault unallocated tokens cap.
   */
  async updateVaultUnallocatedTokensCapIxs(
    vault: KaminoVault,
    unallocatedTokensCap: BN | number | string,
    vaultReservesMap: Map<Address, KaminoReserve>,
    vaultAdminAuthority?: TransactionSigner
  ): Promise<UpdateVaultConfigIxs> {
    return this._vaultClient.updateVaultUnallocatedTokensCapIxs(
      vault,
      unallocatedTokensCap,
      vaultReservesMap,
      vaultAdminAuthority
    );
  }

  /**
   * Update the vault farm address.
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
    return this._vaultClient.updateVaultFarmIxs(
      vault,
      farm,
      vaultReservesMap,
      errorOnOverride,
      vaultAdminAuthority,
      lutIxsSigner,
      skipLutUpdate
    );
  }

  /**
   * Update the first loss capital farm address.
   */
  async updateVaultFirstLossCapitalFarmIxs(
    vault: KaminoVault,
    farm: Address,
    vaultReservesMap: Map<Address, KaminoReserve>,
    vaultAdminAuthority?: TransactionSigner
  ): Promise<UpdateVaultConfigIxs> {
    return this._vaultClient.updateVaultFirstLossCapitalFarmIxs(vault, farm, vaultReservesMap, vaultAdminAuthority);
  }

  /**
   * Update the vault min deposit amount (in lamports).
   */
  async updateVaultMinDepositAmountIxs(
    vault: KaminoVault,
    minDepositAmount: BN | number | string,
    vaultReservesMap: Map<Address, KaminoReserve>,
    vaultAdminAuthority?: TransactionSigner
  ): Promise<UpdateVaultConfigIxs> {
    return this._vaultClient.updateVaultMinDepositAmountIxs(
      vault,
      minDepositAmount,
      vaultReservesMap,
      vaultAdminAuthority
    );
  }

  /**
   * Update the vault min withdraw amount (in lamports).
   */
  async updateVaultMinWithdrawAmountIxs(
    vault: KaminoVault,
    minWithdrawAmount: BN | number | string,
    vaultReservesMap: Map<Address, KaminoReserve>,
    vaultAdminAuthority?: TransactionSigner
  ): Promise<UpdateVaultConfigIxs> {
    return this._vaultClient.updateVaultMinWithdrawAmountIxs(
      vault,
      minWithdrawAmount,
      vaultReservesMap,
      vaultAdminAuthority
    );
  }

  /**
   * Update the vault min invest amount (in lamports).
   */
  async updateVaultMinInvestAmountIxs(
    vault: KaminoVault,
    minInvestAmount: BN | number | string,
    vaultReservesMap: Map<Address, KaminoReserve>,
    vaultAdminAuthority?: TransactionSigner
  ): Promise<UpdateVaultConfigIxs> {
    return this._vaultClient.updateVaultMinInvestAmountIxs(
      vault,
      minInvestAmount,
      vaultReservesMap,
      vaultAdminAuthority
    );
  }

  /**
   * Update the vault min invest delay (in slots).
   */
  async updateVaultMinInvestDelaySlotsIxs(
    vault: KaminoVault,
    minInvestDelaySlots: BN | number | string,
    vaultReservesMap: Map<Address, KaminoReserve>,
    vaultAdminAuthority?: TransactionSigner
  ): Promise<UpdateVaultConfigIxs> {
    return this._vaultClient.updateVaultMinInvestDelaySlotsIxs(
      vault,
      minInvestDelaySlots,
      vaultReservesMap,
      vaultAdminAuthority
    );
  }

  /**
   * Update the vault crank fund fee per reserve (in lamports).
   */
  async updateVaultCrankFundFeePerReserveIxs(
    vault: KaminoVault,
    crankFundFeePerReserve: BN | number | string,
    vaultReservesMap: Map<Address, KaminoReserve>,
    vaultAdminAuthority?: TransactionSigner
  ): Promise<UpdateVaultConfigIxs> {
    return this._vaultClient.updateVaultCrankFundFeePerReserveIxs(
      vault,
      crankFundFeePerReserve,
      vaultReservesMap,
      vaultAdminAuthority
    );
  }

  /**
   * Update the vault withdrawal penalty (in lamports).
   */
  async updateVaultWithdrawalPenaltyLamportsIxs(
    vault: KaminoVault,
    withdrawalPenaltyLamports: BN | number | string,
    vaultReservesMap: Map<Address, KaminoReserve>,
    vaultAdminAuthority?: TransactionSigner
  ): Promise<UpdateVaultConfigIxs> {
    return this._vaultClient.updateVaultWithdrawalPenaltyLamportsIxs(
      vault,
      withdrawalPenaltyLamports,
      vaultReservesMap,
      vaultAdminAuthority
    );
  }

  /**
   * Update the vault withdrawal penalty (in bps).
   */
  async updateVaultWithdrawalPenaltyBpsIxs(
    vault: KaminoVault,
    withdrawalPenaltyBps: BN | number | string,
    vaultReservesMap: Map<Address, KaminoReserve>,
    vaultAdminAuthority?: TransactionSigner
  ): Promise<UpdateVaultConfigIxs> {
    return this._vaultClient.updateVaultWithdrawalPenaltyBpsIxs(
      vault,
      withdrawalPenaltyBps,
      vaultReservesMap,
      vaultAdminAuthority
    );
  }

  /**
   * Update whether allocations are restricted to whitelisted reserves only.
   */
  async updateVaultAllowAllocationsInWhitelistedReservesOnlyIxs(
    vault: KaminoVault,
    allowWhitelistedOnly: boolean | string,
    vaultReservesMap: Map<Address, KaminoReserve>,
    adminAuthority?: TransactionSigner
  ): Promise<UpdateVaultConfigIxs> {
    return this._vaultClient.updateVaultAllowAllocationsInWhitelistedReservesOnlyIxs(
      vault,
      allowWhitelistedOnly,
      vaultReservesMap,
      adminAuthority
    );
  }

  /**
   * Update whether invest is restricted to whitelisted reserves only.
   */
  async updateVaultAllowInvestInWhitelistedReservesOnlyIxs(
    vault: KaminoVault,
    allowWhitelistedOnly: boolean | string,
    vaultReservesMap: Map<Address, KaminoReserve>,
    adminAuthority?: TransactionSigner
  ): Promise<UpdateVaultConfigIxs> {
    return this._vaultClient.updateVaultAllowInvestInWhitelistedReservesOnlyIxs(
      vault,
      allowWhitelistedOnly,
      vaultReservesMap,
      adminAuthority
    );
  }

  /**
   * Add or update a reserve whitelist entry. This controls whether the reserve is whitelisted for adding/updating
   * allocations or for invest, depending on the mode parameter.
   *
   * @param reserve - Address of the reserve to whitelist
   * @param mode - The whitelist mode: either 'Invest' or 'AddAllocation' with a value (1 = add, 0 = remove)
   * @param globalAdmin - The global admin that signs the transaction
   * @returns - An instruction to add/update the whitelisted reserve entry
   */
  async addUpdateWhitelistedReserveIx(
    reserve: Address,
    mode: UpdateReserveWhitelistModeKind,
    globalAdmin: TransactionSigner
  ): Promise<Instruction> {
    return this._vaultClient.addUpdateWhitelistedReserveIx(reserve, mode, globalAdmin);
  }

  /** Sets the farm where the shares can be staked. This is store in vault state and a vault can only have one farm, so the new farm will ovveride the old farm
   * @param vault - vault to set the farm for
   * @param farm - the farm where the vault shares can be staked
   * @param [errorOnOverride] - if true, the function will throw an error if the vault already has a farm. If false, it will override the farm
   * @param [vaultAdminAuthority] - vault admin - a noop vaultAdminAuthority is provided when absent for multisigs
   * @param [lutIxsSigner] (optional) signer of the LUT ixs
   * @param skipLutUpdate  if true, the lookup table instructions will not be included in the returned instructions
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
    return this._vaultClient.setVaultFarmIxs(
      vault,
      farm,
      vaultReservesMap,
      errorOnOverride,
      vaultAdminAuthority,
      lutIxsSigner,
      skipLutUpdate
    );
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
    return this._vaultClient.acceptVaultOwnershipIxs(vault, vaultReservesMap, pendingAdmin);
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
    return this._vaultClient.giveUpPendingFeesIx(vault, maxAmountToGiveUp, vaultAdminAuthority);
  }

  /**
   * This function will return the missing ATA creation instructions, as well as one or multiple withdraw instructions, based on how many reserves it's needed to withdraw from. This might have to be split in multiple transactions
   * @param user - user to withdraw
   * @param vault - vault to withdraw from
   * @param shareAmount - share amount to withdraw (in tokens, not lamports), in order to withdraw everything, any value > user share amount
   * @param ledgerInstant - current ledger instant (slot + block time), used to estimate the interest earned in the different reserves with allocation from the vault
   * @param vaultReservesMap - preloaded reserve states for every reserve in the vault allocation
   * @param farmState - preloaded vault farm state; provide this to unstake from the vault farm
   * @param flcFarmState - preloaded first loss capital farm state; provide this to unstake from the first loss capital farm
   * Pass only one of `farmState` or `flcFarmState`, depending on whether you want vault-farm or first loss capital farm behavior. Pass neither to skip unstaking.
   * @param [withdrawalPenalties] - effective vault/global withdrawal penalties used to plan the net withdrawal amount
   * @returns an array of instructions to create missing ATAs if needed and the withdraw instructions
   */
  async withdrawFromVaultIxs(
    user: TransactionSigner,
    vault: KaminoVault,
    shareAmount: Decimal,
    ledgerInstant: LedgerInstant,
    vaultReservesMap: Map<Address, KaminoReserve>,
    farmState: FarmState | null,
    flcFarmState: FarmState | null,
    payer?: TransactionSigner,
    withdrawalPenalties?: WithdrawPenalties
  ): Promise<WithdrawIxs> {
    return this._vaultClient.withdrawIxs(
      user,
      vault,
      shareAmount,
      ledgerInstant,
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
   * @param vault - vault to redeem from
   * @param shareAmount - share amount to redeem (in tokens, not lamports)
   * @param ledgerInstant - current ledger instant (slot + block time)
   * @param vaultReservesMap - preloaded reserve states for every reserve in the vault allocation
   * @param vaultState - preloaded vault state; call `vault.getState()` / `vault.reloadState()` before building instructions
   * @param globalConfigState - preloaded KVault global config; call `manager.loadKVaultGlobalConfig()` before building instructions
   * @param farmState - preloaded vault farm state; provide this to unstake from the vault farm
   * @param flcFarmState - preloaded first loss capital farm state; provide this to unstake from the first loss capital farm
   * Pass only one of `farmState` or `flcFarmState`, depending on whether you want vault-farm or first loss capital farm behavior. Pass neither to skip unstaking.
   * @param [payer] - optional different payer for ATA creation
   * @returns RedeemInKindIxs with setup, redeemInKind, cleanup instructions and luts
   */
  async redeemInKindIxs(
    user: TransactionSigner,
    vault: KaminoVault,
    shareAmount: Decimal,
    ledgerInstant: LedgerInstant,
    vaultReservesMap: Map<Address, KaminoReserve>,
    vaultState: VaultState,
    globalConfigState: KVaultGlobalConfig,
    farmState: FarmState | null,
    flcFarmState: FarmState | null,
    payer?: TransactionSigner
  ): Promise<RedeemInKindIxs> {
    return this._vaultClient.redeemInKindIxs(
      user,
      vault,
      shareAmount,
      ledgerInstant,
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
   * @param vault - vault to withdraw/redeem from
   * @param shareAmount - total share amount to exit (in tokens, not lamports)
   * @param ledgerInstant - current ledger instant (slot + block time)
   * @param vaultReservesMap - preloaded reserve states for every reserve in the vault allocation
   * @param vaultState - preloaded vault state; call `vault.getState()` / `vault.reloadState()` before building instructions
   * @param globalConfigState - preloaded KVault global config; call `manager.loadKVaultGlobalConfig()` before building instructions
   * @param farmState - preloaded vault farm state when exiting from the vault farm
   * @param flcFarmState - preloaded first loss capital farm state when exiting from the first loss capital farm
   * Pass only one of `farmState` or `flcFarmState`, depending on whether you want vault-farm or first loss capital farm behavior. Pass neither if no farm exit is needed.
   * @param [payer] - optional different payer for ATA creation
   * @returns WithdrawAndRedeemInKindIxs with both withdraw and redeemInKind instructions
   */
  async withdrawAndRedeemInKindIfNeededIxs(
    user: TransactionSigner,
    vault: KaminoVault,
    shareAmount: Decimal,
    ledgerInstant: LedgerInstant,
    vaultReservesMap: Map<Address, KaminoReserve>,
    vaultState: VaultState,
    globalConfigState: KVaultGlobalConfig,
    farmState: FarmState | null,
    flcFarmState: FarmState | null,
    payer?: TransactionSigner
  ): Promise<WithdrawAndRedeemInKindIxs> {
    return this._vaultClient.withdrawAndRedeemInKindIfNeededIxs(
      user,
      vault,
      shareAmount,
      ledgerInstant,
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
   * @param vault - vault to withdraw/redeem from
   * @param shareAmount - total share amount to exit (in tokens, not lamports)
   * @param ledgerInstant - current ledger instant (slot + block time)
   * @param vaultReservesMap - preloaded reserve states for every reserve in the vault allocation
   * @param vaultState - preloaded vault state; call `vault.getState()` / `vault.reloadState()` before building instructions
   * @param globalConfigState - preloaded KVault global config; call `manager.loadKVaultGlobalConfig()` before building instructions
   * @param farmState - preloaded vault farm state when exiting from the vault farm
   * @param flcFarmState - preloaded first loss capital farm state when exiting from the first loss capital farm
   * Pass only one of `farmState` or `flcFarmState`, depending on whether you want vault-farm or first loss capital farm behavior. Pass neither if no farm exit is needed.
   * @param [payer] - optional different payer for ATA creation
   * @returns WithdrawRedeemAndEnqueueIxs with withdraw, redeemInKind, and enqueue instructions
   */
  async withdrawRedeemAndEnqueueIxs(
    user: TransactionSigner,
    vault: KaminoVault,
    shareAmount: Decimal,
    ledgerInstant: LedgerInstant,
    vaultReservesMap: Map<Address, KaminoReserve>,
    vaultState: VaultState,
    globalConfigState: KVaultGlobalConfig,
    farmState: FarmState | null,
    flcFarmState: FarmState | null,
    payer?: TransactionSigner
  ): Promise<WithdrawRedeemAndEnqueueIxs> {
    return this._vaultClient.withdrawRedeemAndEnqueueIxs(
      user,
      vault,
      shareAmount,
      ledgerInstant,
      vaultReservesMap,
      vaultState,
      globalConfigState,
      farmState,
      flcFarmState,
      payer
    );
  }

  /**
   * This function will return the missing ATA creation instructions, as well as one or multiple withdraw instructions, based on how many reserves it's needed to withdraw from. This might have to be split in multiple transactions
   * @param user - user to sell shares for vault tokens
   * @param vault - vault to sell shares from
   * @param shareAmount - share amount to sell (in tokens, not lamports), in order to withdraw everything, any value > user share amount
   * @param ledgerInstant - current ledger instant (slot + block time), used to estimate the interest earned in the different reserves with allocation from the vault
   * @param vaultReservesMap - preloaded reserve states for every reserve in the vault allocation
   * @param farmState - preloaded vault farm state when exiting from the vault farm
   * @param flcFarmState - preloaded first loss capital farm state when exiting from the first loss capital farm
   * Pass only one of `farmState` or `flcFarmState`, depending on whether you want vault-farm or first loss capital farm behavior. Pass neither if no farm exit is needed.
   * @param [payer] - optional parameter to pass a different payer for ATA creation rent. If not provided, the user will be used
   * @param [withdrawalPenalties] - effective vault/global withdrawal penalties used to plan the net withdrawal amount
   * @returns an array of instructions to create missing ATAs if needed and the withdraw instructions
   */
  async sellVaultSharesIxs(
    user: TransactionSigner,
    vault: KaminoVault,
    shareAmount: Decimal,
    ledgerInstant: LedgerInstant,
    vaultReservesMap: Map<Address, KaminoReserve>,
    farmState: FarmState | null,
    flcFarmState: FarmState | null,
    payer?: TransactionSigner,
    withdrawalPenalties?: WithdrawPenalties
  ): Promise<WithdrawIxs> {
    return this._vaultClient.sellSharesIxs(
      user,
      vault,
      shareAmount,
      ledgerInstant,
      vaultReservesMap,
      farmState,
      flcFarmState,
      payer,
      withdrawalPenalties
    );
  }

  /**
   * This method withdraws all the pending fees from the vault to the owner's token ATA
   * @param vault - vault for which the admin withdraws the pending fees
   * @param ledgerInstant - current ledger instant (slot + block time), used to estimate the interest earned in the different reserves with allocation from the vault
   * @param [vaultAdminAuthority] - vault admin - a noop vaultAdminAuthority is provided when absent for multisigs
   * @param [vaultReservesMap] - optional parameter; a hashmap from each reserve pubkey to the reserve state. If provided the function will be significantly faster as it will not have to fetch the reserves
   * @returns - list of instructions to withdraw all pending fees, including the ATA creation instructions if needed
   */
  async withdrawPendingFeesIxs(
    vault: KaminoVault,
    ledgerInstant: LedgerInstant,
    vaultReservesMap: Map<Address, KaminoReserve>,
    vaultAdminAuthority?: TransactionSigner
  ): Promise<Instruction[]> {
    return this._vaultClient.withdrawPendingFeesIxs(vault, ledgerInstant, vaultReservesMap, vaultAdminAuthority);
  }

  /**
   * This method tops up the vault rewards to be distributed to depositors. Anyone can top up rewards.
   * If the reward rate is set but the rewards were depleted (paused stream), streaming resumes from the topup time; the depleted period is not distributed retroactively
   * @param payer - the signer paying the reward tokens
   * @param vault - vault to top up rewards for
   * @param tokenAmount - token amount to top up, in decimals (will be converted in lamports)
   * @returns - a struct with the prerequisite instructions (payer token ATA creation and wSOL wrapping if the vault token is wSOL), the topup instructions and the cleanup instructions (wSOL ATA close)
   */
  async topupVaultRewardsIxs(
    payer: TransactionSigner,
    vault: KaminoVault,
    tokenAmount: Decimal
  ): Promise<TopupVaultRewardsIxs> {
    return this._vaultClient.topupVaultRewardsIxs(payer, vault, tokenAmount);
  }

  /**
   * This method withdraws rewards which were not distributed yet to the vault admin token ATA. The amount is capped on-chain at the undistributed rewards
   * @param vault - vault to withdraw the rewards from
   * @param tokenAmount - token amount to withdraw, in decimals (will be converted in lamports)
   * @param [vaultAdminAuthority] - vault admin - a noop vaultAdminAuthority is provided when absent for multisigs
   * @returns - a struct with the prerequisite instructions (admin token ATA creation), the withdraw instructions and the cleanup instructions (wSOL ATA close to unwrap the rewards if the vault token is wSOL)
   */
  async withdrawVaultRewardsIxs(
    vault: KaminoVault,
    tokenAmount: Decimal,
    vaultAdminAuthority?: TransactionSigner
  ): Promise<WithdrawVaultRewardsIxs> {
    return this._vaultClient.withdrawVaultRewardsIxs(vault, tokenAmount, vaultAdminAuthority);
  }

  /**
   * This method inserts the missing keys from the provided keys into an existent lookup table
   * @param payer - payer wallet pubkey
   * @param lut - lookup table to insert the keys into
   * @param keys - keys to insert into the lookup table
   * @param [accountsInLUT] - the existent accounts in the lookup table. Optional. If provided, the function will not fetch the accounts in the lookup table
   * @returns - an array of instructions to insert the missing keys into the lookup table
   */
  async insertIntoLutIxs(
    payer: TransactionSigner,
    lut: Address,
    keys: Address[],
    accountsInLUT?: Address[]
  ): Promise<Instruction[]> {
    return insertIntoLookupTableIxs(this._vaultClient.getConnection(), payer, lut, keys, accountsInLUT);
  }

  /**
   * Sync a vault for lookup table; create and set the LUT for the vault if needed and fill it with all the needed accounts
   * @param authority - vault admin
   * @param vault - the vault to sync and set the LUT for if needed
   * @param [vaultReserves] - optional; the state of the reserves in the vault allocation
   * @returns a struct that contains a list of ix to create the LUT and assign it to the vault if needed + a list of ixs to insert all the accounts in the LUT
   */
  async syncVaultLUTIxs(
    authority: TransactionSigner,
    vault: KaminoVault,
    recentSlot: Slot,
    vaultReserves: Map<Address, KaminoReserve>
  ): Promise<SyncVaultLUTIxs> {
    return this._vaultClient.syncVaultLookupTableIxs(authority, vault, recentSlot, vaultReserves);
  }

  /**
   * This method calculates the token per share value. This will always change based on interest earned from the vault, but calculating it requires a bunch of rpc requests. Caching this for a short duration would be optimal
   * @param vault - vault to calculate tokensPerShare for
   * @param ledgerInstant - the ledger instant (slot + block time) at which we retrieve the tokens per share
   * @param vaultReservesMap - hashmap from each reserve pubkey to the reserve state
   * @param currentLedgerInstant - latest confirmed ledger instant (slot + block time)
   * @returns - token per share value
   */
  async getTokensPerShareSingleVault(
    vault: KaminoVault,
    ledgerInstant: LedgerInstant,
    vaultReservesMap: Map<Address, KaminoReserve>,
    currentLedgerInstant: LedgerInstant
  ): Promise<Decimal> {
    return this._vaultClient.getTokensPerShareSingleVault(vault, ledgerInstant, vaultReservesMap, currentLedgerInstant);
  }

  /**
   * This method calculates the price of one vault share(kToken)
   * @param vault - vault to calculate sharePrice for
   * @param tokenPrice - the price of the vault token (e.g. SOL) in USD
   * @param ledgerInstant - the ledger instant (slot + block time) at which we retrieve the tokens per share
   * @param vaultReservesMap - hashmap from each reserve pubkey to the reserve state
   * @param currentLedgerInstant - latest confirmed ledger instant (slot + block time)
   * @returns - share value in USD
   */
  async getSharePriceInUSD(
    vault: KaminoVault,
    tokenPrice: Decimal,
    ledgerInstant: LedgerInstant,
    vaultReservesMap: Map<Address, KaminoReserve>,
    currentLedgerInstant: LedgerInstant
  ): Promise<Decimal> {
    const tokensPerShare = await this.getTokensPerShareSingleVault(
      vault,
      ledgerInstant,
      vaultReservesMap,
      currentLedgerInstant
    );
    return tokensPerShare.mul(tokenPrice);
  }

  /**
   * This method returns the user shares balance for a given vault
   * @param user - user to calculate the shares balance for
   * @param vault - vault to calculate shares balance for
   * @returns - a struct of user share balance (unstaked plus shares staked in either configured farm) in decimal (not lamports)
   */
  async getUserSharesBalanceSingleVault(user: Address, vault: KaminoVault): Promise<UserSharesForVault> {
    return this._vaultClient.getUserSharesBalanceSingleVault(user, vault);
  }

  /**
   * This method returns the user shares balance for all existing vaults
   * @param user - user to calculate the shares balance for
   * @param vaultsOverride - the kamino vaults if already fetched, in order to reduce rpc calls
   * @returns - hash map with keyh as vault address and value as user share balance in decimal (not lamports)
   */
  async getUserSharesBalanceAllVaults(
    user: Address,
    vaultsOverride?: KaminoVault[]
  ): Promise<Map<Address, UserSharesForVault>> {
    return this._vaultClient.getUserSharesBalanceAllVaults(user, vaultsOverride);
  }

  /**
   * This method returns the management and performance fee percentages
   * @param vaultState - vault to retrieve the fees percentages from
   * @returns - VaultFeesPct containing management and performance fee percentages
   */
  getVaultFeesPct(vaultState: VaultState): VaultFeesPct {
    return this._vaultClient.getVaultFeesPct(vaultState);
  }

  /**
   * This method returns the vault name
   * @param vaultState - vault to retrieve the onchain name for
   * @returns - the vault name as string
   */
  getDecodedVaultName(vaultState: VaultState): string {
    return this._vaultClient.decodeVaultName(vaultState.name);
  }

  /**
   * @returns - the KaminoVault client
   */
  getKaminoVaultClient(): KaminoVaultClient {
    return this._vaultClient;
  }

  /**
   * Get all vaults
   * @returns an array of all vaults
   */
  async getAllVaults(): Promise<KaminoVault[]> {
    return this._vaultClient.getAllVaults();
  }

  /**
   * Get all lending markets
   * @returns an array of all lending markets
   */
  async getAllMarkets(programId: Address = this._kaminoLendProgramId): Promise<KaminoMarket[]> {
    // Get all lending markets
    const marketGenerator = getAllLendingMarketAccounts(this.getRpc(), programId);

    const lendingMarketPairs: [Address, LendingMarket][] = [];
    for await (const pair of marketGenerator) {
      lendingMarketPairs.push(pair);
    }

    // Get all reserves
    const allReserveAccounts = getAllReserveAccounts(this.getRpc(), programId);
    const reservePairs: [Address, Reserve][] = [];
    for await (const pair of allReserveAccounts) {
      reservePairs.push(pair);
    }
    const allReserves = reservePairs.map(([, reserve]) => reserve);

    // Get all oracle accounts
    const [allOracleAccounts, cdnResourcesData] = await Promise.all([
      getAllOracleAccounts(this.getRpc(), allReserves),
      kaminoCdn.getData(),
    ]);
    // Group reserves by market
    const marketToReserve = new Map<Address, ReserveWithAddress[]>();
    for (const [reserveAddress, reserveState] of reservePairs) {
      const marketAddress = reserveState.lendingMarket;
      if (!marketToReserve.has(marketAddress)) {
        marketToReserve.set(marketAddress, [
          {
            address: reserveAddress,
            state: reserveState,
          },
        ]);
      } else {
        marketToReserve.get(marketAddress)?.push({
          address: reserveAddress,
          state: reserveState,
        });
      }
    }

    const combinedMarkets = lendingMarketPairs.map(([pubkey, market]) => {
      const reserves = marketToReserve.get(pubkey);
      const reservesByAddress = new Map<Address, KaminoReserve>();
      if (!reserves) {
        console.log(`Market ${pubkey.toString()} ${parseTokenSymbol(market.name)} has no reserves`);
      } else {
        const reservesAndOracles = getTokenOracleDataSync(allOracleAccounts, reserves);
        reservesAndOracles.forEach(([{ address: reserveAddress, state: reserve }, oracle]) => {
          if (!oracle) {
            console.log('Manager > getAllMarkets: oracle not found for reserve', reserve.config.tokenInfo.name);
            return;
          }

          const kaminoReserve = KaminoReserve.initialize(
            reserveAddress,
            reserve,
            oracle,
            this.getRpc(),
            this.recentSlotDurationMs,
            market.reserveRewardsMaxAprBps,
            cdnResourcesData,
            undefined,
            programId
          );
          reservesByAddress.set(kaminoReserve.address, kaminoReserve);
        });
      }

      return KaminoMarket.loadWithReserves(
        this.getRpc(),
        market,
        reservesByAddress,
        pubkey,
        this.recentSlotDurationMs,
        programId,
        this._farmsProgramId
      );
    });

    return combinedMarkets;
  }

  /**
   * Get all vaults for owner
   * @param owner the pubkey of the vaults owner
   * @returns an array of all vaults owned by a given pubkey
   */
  async getAllVaultsForOwner(owner: Address): Promise<KaminoVault[]> {
    const size = VaultState.layout.span + 8;
    const filters: (GetProgramAccountsDatasizeFilter | GetProgramAccountsMemcmpFilter)[] = [
      {
        dataSize: BigInt(size),
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
          offset: 8n,
          bytes: owner.toString() as Base58EncodedBytes,
          encoding: 'base58',
        },
      },
    ];

    const kaminoVaults = await getProgramAccounts(this._rpc, this._kaminoVaultProgramId, size, filters);

    return kaminoVaults.map((kaminoVault) => {
      const kaminoVaultAccount = decodeVaultState(kaminoVault.data);
      if (!kaminoVaultAccount) {
        throw Error(`kaminoVault with pubkey ${kaminoVault.address} could not be decoded`);
      }

      return KaminoVault.loadWithClientAndState(this._vaultClient, kaminoVault.address, kaminoVaultAccount);
    });
  }

  /**
   * Get a list of kaminoVaults
   * @param vaults - a list of vaults to get the states for; if not provided, all vaults will be fetched
   * @returns a list of KaminoVaults
   */
  async getVaults(vaults?: Array<Address>): Promise<Array<KaminoVault | null>> {
    return this._vaultClient.getVaults(vaults);
  }

  /**
   * Get all token accounts that hold shares for a specific share mint
   * @param shareMint
   * @returns an array of all holders tokenAccounts pubkeys and their account info
   */
  async getShareTokenAccounts(
    shareMint: Address
  ): Promise<AccountInfoWithPubkey<AccountInfoBase & AccountInfoWithJsonData>[]> {
    //how to get all token accounts for specific mint: https://spl.solana.com/token#finding-all-token-accounts-for-a-specific-mint
    //get it from the hardcoded token program and create a filter with the actual mint address
    //datasize:165 filter selects all token accounts, memcmp filter selects based on the mint address withing each token account
    return this._rpc
      .getProgramAccounts(TOKEN_PROGRAM_ADDRESS, {
        filters: [
          { dataSize: 165n },
          { memcmp: { offset: 0n, bytes: shareMint.toString() as Base58EncodedBytes, encoding: 'base58' } },
        ],
        encoding: 'jsonParsed',
      })
      .send();
  }

  /**
   * Get all token accounts that hold shares for a specific vault; if you already have the vault state use it in the param so you don't have to fetch it again
   * @param vault
   * @returns an array of all holders tokenAccounts pubkeys and their account info
   */
  async getVaultTokenAccounts(
    vault: KaminoVault
  ): Promise<AccountInfoWithPubkey<AccountInfoBase & AccountInfoWithJsonData>[]> {
    const vaultState = await vault.getState();
    return this.getShareTokenAccounts(vaultState.sharesMint);
  }

  /**
   * Get all vault token holders
   * @param vault
   * @returns an array of all vault holders with their pubkeys and amounts
   */
  getVaultHolders = async (vault: KaminoVault): Promise<VaultHolder[]> => {
    await vault.getState();
    const tokenAccounts = await this.getVaultTokenAccounts(vault);
    const result: VaultHolder[] = [];
    for (const tokenAccount of tokenAccounts) {
      const accountData = tokenAccount.account.data as Readonly<{
        parsed: {
          info: {
            owner: string;
            tokenAmount: {
              uiAmountString: string;
            };
          };
          type: string;
        };
        program: string;
        space: bigint;
      }>;
      result.push({
        holderPubkey: address(accountData.parsed.info.owner),
        amount: new Decimal(accountData.parsed.info.tokenAmount.uiAmountString),
      });
    }
    return result;
  };

  /**
   * Get all vaults for a given token
   * @param token - the token to get all vaults for
   * @returns an array of all vaults for the given token
   */
  async getAllVaultsForToken(token: Address): Promise<Array<KaminoVault>> {
    return this._vaultClient.getAllVaultsForToken(token);
  }

  /**
   * This will return an VaultHoldings object which contains the amount available (uninvested) in vault, total amount invested in reseves and a breakdown of the amount invested in each reserve
   * @param vault - the kamino vault to get available liquidity to withdraw for
   * @param ledgerInstant - the ledger instant (slot + block time) for which to calculate the holdings
   * @param vaultReserves - a hashmap from each reserve pubkey to the reserve state
   * @param currentLedgerInstant - latest confirmed ledger instant (slot + block time)
   * @returns an VaultHoldings object
   */
  async getVaultHoldings(
    vault: VaultState,
    ledgerInstant: LedgerInstant,
    vaultReserves: Map<Address, KaminoReserve>,
    currentLedgerInstant: LedgerInstant
  ): Promise<VaultHoldings> {
    return this._vaultClient.getVaultHoldings(vault, ledgerInstant, vaultReserves, currentLedgerInstant);
  }

  /**
   * This will return an VaultHoldingsWithUSDValue object which contains an holdings field representing the amount available (uninvested) in vault, total amount invested in reseves and a breakdown of the amount invested in each reserve and additional fields for the total USD value of the available and invested amounts
   * @param vault - the kamino vault to get available liquidity to withdraw for
   * @param price - the price of the token in the vault (e.g. USDC)
   * @param ledgerInstant - the ledger instant (slot + block time) for which to calculate the holdings
   * @param vaultReserves - a hashmap from each reserve pubkey to the reserve state
   * @param currentLedgerInstant - latest confirmed ledger instant (slot + block time)
   * @returns an VaultHoldingsWithUSDValue object with details about the tokens available and invested in the vault, denominated in tokens and USD
   */
  async getVaultHoldingsWithPrice(
    vault: VaultState,
    price: Decimal,
    ledgerInstant: LedgerInstant,
    vaultReserves: Map<Address, KaminoReserve>,
    currentLedgerInstant: LedgerInstant
  ): Promise<VaultHoldingsWithUSDValue> {
    return this._vaultClient.getVaultHoldingsWithPrice(
      vault,
      price,
      ledgerInstant,
      vaultReserves,
      currentLedgerInstant
    );
  }

  /**
   * This will return an VaultOverview object that encapsulates all the information about the vault, including the holdings, reserves details, theoretical APY, utilization ratio and total borrowed amount
   * @param vault - the kamino vault to get available liquidity to withdraw for
   * @param price - the price of the token in the vault (e.g. USDC)
   * @param ledgerInstant - the ledger instant (slot + block time) for which to retrieve the vault overview
   * @param vaultReserves - hashmap from each reserve pubkey to the reserve state
   * @param kaminoMarkets - a map of all kamino markets needed by the vault reserves
   * @param currentLedgerInstant - latest confirmed ledger instant (slot + block time)
   * @param [tokensPrices] - a hashmap from a token pubkey to the price of the token in USD. Optional. If some tokens are not in the map, the function will fetch the price
   * @returns an VaultOverview object with details about the tokens available and invested in the vault, denominated in tokens and USD, along sie APYs
   */
  async getVaultOverview(
    vault: KaminoVault,
    price: Decimal,
    ledgerInstant: LedgerInstant,
    vaultReserves: Map<Address, KaminoReserve>,
    kaminoMarkets: Map<Address, KaminoMarket>,
    farmsMap: Map<Address, FarmState>,
    farmsClient: FarmsClient,
    globalConfig: KVaultGlobalConfig,
    currentLedgerInstant: LedgerInstant,
    tokensPrices?: Map<Address, Decimal>
  ): Promise<VaultOverview> {
    return this._vaultClient.getVaultOverview(
      vault,
      price,
      ledgerInstant,
      vaultReserves,
      kaminoMarkets,
      farmsMap,
      farmsClient,
      globalConfig,
      currentLedgerInstant,
      tokensPrices
    );
  }

  /**
   * Prints a vault in a human readable form
   * @param vaultPubkey - the address of the vault
   * @param ledgerInstant - current ledger instant (slot + block time) to use for vault calculations
   * @param [vaultState] - optional parameter to pass the vault state directly; this will save a network call
   * @returns - void; prints the vault to the console
   */
  async printVault(vaultPubkey: Address, ledgerInstant: LedgerInstant, vaultState?: VaultState) {
    return this._vaultClient.printVault(vaultPubkey, ledgerInstant, vaultState);
  }

  /**
   * This will return an aggregation of the current state of the vault with all the invested amounts and the utilization ratio of the vault
   * @param vault - the kamino vault to get available liquidity to withdraw for
   * @param ledgerInstant - current ledger instant (slot + block time)
   * @param vaultReserves - hashmap from each reserve pubkey to the reserve state
   * @returns an VaultReserveTotalBorrowedAndInvested object with the total invested amount, total borrowed amount and the utilization ratio of the vault
   */
  async getTotalBorrowedAndInvested(
    vault: VaultState,
    ledgerInstant: LedgerInstant,
    vaultReserves: Map<Address, KaminoReserve>
  ): Promise<VaultReserveTotalBorrowedAndInvested> {
    return this._vaultClient.getTotalBorrowedAndInvested(vault, ledgerInstant, vaultReserves);
  }

  /**
   * This will return a map of the cumulative rewards issued for all the delegated farms, per token
   * @param [vaults] - the vaults to get the cumulative rewards for; if not provided, the function will get the cumulative rewards for all the vaults
   * @returns a map of the cumulative rewards issued for all the delegated farms, per token, in lamports
   */
  async getCumulativeDelegatedFarmsRewardsIssuedForAllVaults(vaults?: Address[]): Promise<Map<Address, Decimal>> {
    return this._vaultClient.getCumulativeDelegatedFarmsRewardsIssuedForAllVaults(vaults);
  }

  /**
   * This will return a map of the vault address and the delegated farm address for that vault
   * @returns a map of the vault address and the delegated farm address for that vault
   */
  async getVaultsWithDelegatedFarm(): Promise<Map<Address, Address>> {
    return this._vaultClient.getVaultsWithDelegatedFarm();
  }

  /**
   * This will return an overview of each reserve that is part of the vault allocation
   * @param vault - the kamino vault to get available liquidity to withdraw for
   * @param ledgerInstant - current ledger instant (slot + block time)
   * @param vaultReserves - optional parameter; a hashmap from each reserve pubkey to the reserve state. If provided the function will be significantly faster as it will not have to fetch the reserves
   * @returns a hashmap from vault reserve pubkey to ReserveOverview object
   */
  async getVaultReservesDetails(
    vault: VaultState,
    ledgerInstant: LedgerInstant,
    vaultReserves: Map<Address, KaminoReserve>
  ): Promise<Map<Address, ReserveOverview>> {
    return this._vaultClient.getVaultReservesDetails(vault, ledgerInstant, vaultReserves);
  }

  /**
   * This will return the APY of the vault under the assumption that all the available tokens in the vault are all the time invested in the reserves as ratio; for percentage it needs multiplication by 100
   * @param vault - the kamino vault to get APY for
   * @param ledgerInstant - current ledger instant (slot + block time)
   * @param vaultReserves - hashmap from each reserve pubkey to the reserve state
   * @returns a struct containing estimated gross APY and net APY (gross - vault fees) for the vault
   */
  async getVaultTheoreticalAPY(
    vault: VaultState,
    ledgerInstant: LedgerInstant,
    vaultReserves: Map<Address, KaminoReserve>
  ): Promise<APYs> {
    return this._vaultClient.getVaultTheoreticalAPY(vault, ledgerInstant, vaultReserves);
  }

  /**
   * This will return the APY of the vault based on the current invested amounts; for percentage it needs multiplication by 100
   * @param vault - the kamino vault to get APY for
   * @param ledgerInstant - current ledger instant (slot + block time)
   * @param vaultReserves - hashmap from each reserve pubkey to the reserve state
   * @returns a struct containing estimated gross APY and net APY (gross - vault fees) for the vault
   */
  async getVaultActualAPY(
    vault: VaultState,
    ledgerInstant: LedgerInstant,
    vaultReserves: Map<Address, KaminoReserve>
  ): Promise<APYs> {
    return this._vaultClient.getVaultActualAPY(vault, ledgerInstant, vaultReserves);
  }

  /**
   * Read the vault rewards state and rates; the rewards are paid in the vault token and increase the share value, so no prices are needed.
   * When the rate is 0 or the rewards are depleted the stream is paused: nothing is distributed and the paused period is never distributed retroactively (streaming resumes from the next topup). The returned APR/APY are 0 while paused or when the vault has no net AUM
   * @param vault - the kamino vault state to get the rewards overview for
   * @param ledgerInstant - current ledger instant (slot + block time)
   * @param vaultReserves - hashmap from each reserve pubkey to the reserve state
   * @returns a struct containing the reward rate in token lamports and tokens per second, the rewards left to distribute and already distributed (in tokens), and the reward APR and APY relative to the vault AUM
   */
  async getVaultRewardsOverview(
    vault: VaultState,
    ledgerInstant: LedgerInstant,
    vaultReserves: Map<Address, KaminoReserve>
  ): Promise<VaultRewardsOverview> {
    return this._vaultClient.getVaultRewardsOverview(vault, ledgerInstant, vaultReserves);
  }

  /**
   * Retrive the total amount of interest earned by the vault since its inception, up to the last interaction with the vault on chain, including what was charged as fees
   * @param vaultState the kamino vault state to get total net yield for
   * @returns a struct containing a Decimal representing the net number of tokens earned by the vault since its inception and the timestamp of the last fee charge
   */
  async getVaultCumulativeInterest(vaultState: VaultState) {
    return this._vaultClient.getVaultCumulativeInterest(vaultState);
  }

  /**
   * Simulate the current holdings of the vault and the earned interest
   * @param vaultState the kamino vault state to get simulated holdings and earnings for
   * @param ledgerInstant - latest confirmed ledger instant (slot + block time)
   * @param vaultReserves - hashmap from each reserve pubkey to the reserve state
   * @param [previousTotalAUM] - the previous AUM of the vault to compute the earned interest relative to this value. Optional. If not provided the function will estimate the total AUM at the slot of the last state update on chain
   * @param currentLedgerInstant - latest confirmed ledger instant (slot + block time)
   * @returns a struct of simulated vault holdings and earned interest
   */
  async calculateSimulatedHoldingsWithInterest(
    vaultState: VaultState,
    ledgerInstant: LedgerInstant,
    vaultReserves: Map<Address, KaminoReserve>,
    previousTotalAUM: Decimal | undefined,
    currentLedgerInstant: LedgerInstant
  ): Promise<SimulatedVaultHoldingsWithEarnedInterest> {
    return this._vaultClient.calculateSimulatedHoldingsWithInterest(
      vaultState,
      ledgerInstant,
      vaultReserves,
      previousTotalAUM,
      currentLedgerInstant
    );
  }

  /** Read total vault holdings and reserve weights, then compute target liquidity token units per reserve.
   * @param vaultState - the vault state to calculate the allocation for
   * @param ledgerInstant - the ledger instant (slot + block time) for which to calculate the allocation
   * @param vaultReserves - a hashmap from each reserve pubkey to the reserve state
   * @param currentLedgerInstant - latest confirmed ledger instant (slot + block time)
   * @returns target unallocated and per-reserve amounts in token units, not lamports
   */
  async getVaultComputedReservesAllocation(
    vaultState: VaultState,
    ledgerInstant: LedgerInstant,
    vaultReserves: Map<Address, KaminoReserve>,
    currentLedgerInstant: LedgerInstant
  ): Promise<VaultComputedAllocation> {
    return this._vaultClient.getVaultComputedReservesAllocation(
      vaultState,
      ledgerInstant,
      vaultReserves,
      currentLedgerInstant
    );
  }

  /**
   * Simulate the current holdings and compute the fees that would be charged
   * @param vaultState the kamino vault state to get simulated fees for
   * @param ledgerInstant - the ledger instant (slot + block time) at which to compute the fees
   * @param vaultReservesMap - hashmap from each reserve pubkey to the reserve state
   * @param simulatedCurrentHoldingsWithInterest - the simulated holdings and interest earned by the vault; pass undefined to have them computed from the vault and reserve states
   * @param currentLedgerInstant - latest confirmed ledger instant (slot + block time)
   * @param previousNetAUM - the previous AUM of the vault to compute the fees relative to this value; pass undefined to estimate the total AUM at the slot of the last state update on chain
   * @returns a struct of simulated management and performance fees
   */
  async calculateSimulatedFees(
    vaultState: VaultState,
    ledgerInstant: LedgerInstant,
    vaultReservesMap: Map<Address, KaminoReserve>,
    simulatedCurrentHoldingsWithInterest: SimulatedVaultHoldingsWithEarnedInterest | undefined,
    currentLedgerInstant: LedgerInstant,
    previousNetAUM: Decimal | undefined
  ): Promise<VaultFees> {
    return this._vaultClient.calculateSimulatedFees(
      vaultState,
      ledgerInstant,
      vaultReservesMap,
      simulatedCurrentHoldingsWithInterest,
      currentLedgerInstant,
      previousNetAUM
    );
  }

  /**
   * This will compute the PDA that is used as delegatee in Farms program to compute the user state PDA for vault depositor investing in vault with reserve having a supply farm
   */
  computeUserFarmStateForUserInVault(
    farmsProgramId: Address,
    vault: Address,
    reserve: Address,
    user: Address
  ): Promise<ProgramDerivedAddress> {
    return this._vaultClient.computeUserFarmStateDelegateePDAForUserInVault(farmsProgramId, reserve, vault, user);
  }

  /**
   * Read the APY of the farm built on top of the vault (farm in vaultState.vaultFarm)
   * @param vault - the vault to read the farm APY for
   * @param vaultTokenPrice - the price of the vault token in USD (e.g. 1.0 for USDC)
   * @param ledgerInstant - the ledger instant (slot + block time) to read the farm APY at
   * @param vaultReservesMap - hashmap from each reserve pubkey to the reserve state
   * @param farmsClient - the farms client to use
   * @param farmState - the farm state; pass null if not available
   * @param currentLedgerInstant - latest confirmed ledger instant (slot + block time)
   * @param [tokensPrices] - the prices of the tokens in USD. Optional. If not provided, the function will fetch the prices
   * @returns the APY of the farm built on top of the vault
   */
  async getVaultFarmRewardsAPY(
    vault: KaminoVault,
    vaultTokenPrice: Decimal,
    ledgerInstant: LedgerInstant,
    vaultReservesMap: Map<Address, KaminoReserve>,
    farmsClient: FarmsClient,
    farmState: FarmState | null,
    currentLedgerInstant: LedgerInstant,
    tokensPrices?: Map<Address, Decimal>
  ): Promise<FarmIncentives> {
    return this._vaultClient.getVaultRewardsAPY(
      vault,
      vaultTokenPrice,
      ledgerInstant,
      vaultReservesMap,
      farmsClient,
      farmState,
      currentLedgerInstant,
      tokensPrices
    );
  }

  /**
   * Read the APY of the delegated farm providing incentives for vault depositors
   * @param vault - the vault to read the farm APY for
   * @param vaultTokenPrice - the price of the vault token in USD (e.g. 1.0 for USDC)
   * @param ledgerInstant - the ledger instant (slot + block time) to read the farm APY at
   * @param vaultReservesMap - hashmap from each reserve pubkey to the reserve state
   * @param farmsClient - the farms client to use
   * @param farmState - the farm state; pass null if not available (will return empty incentives)
   * @param currentLedgerInstant - latest confirmed ledger instant (slot + block time)
   * @param [tokensPrices] - the prices of the tokens in USD. Optional. If not provided, the function will fetch the prices
   * @returns the APY of the delegated farm providing incentives for vault depositors
   */
  async getVaultDelegatedFarmRewardsAPY(
    vault: KaminoVault,
    vaultTokenPrice: Decimal,
    ledgerInstant: LedgerInstant,
    vaultReservesMap: Map<Address, KaminoReserve>,
    farmsClient: FarmsClient,
    farmState: FarmState | null,
    currentLedgerInstant: LedgerInstant,
    tokensPrices?: Map<Address, Decimal>
  ): Promise<FarmIncentives> {
    return this._vaultClient.getVaultDelegatedFarmRewardsAPY(
      vault,
      vaultTokenPrice,
      ledgerInstant,
      vaultReservesMap,
      farmsClient,
      farmState,
      currentLedgerInstant,
      tokensPrices
    );
  }

  /**
   * This will read the pending rewards for a user in the vault farm, the reserves farms of the vault and the delegated vault farm
   * @param user - the user address
   * @param vault - the vault
   * @param vaultReservesMap - the vault reserves map to get the reserves for
   * @returns a struct containing the pending rewards in the vault farm, the reserves farms of the vault and the delegated vault farm, and the total pending rewards in lamports
   */
  async getAllPendingRewardsForUserInVault(
    user: Address,
    vault: KaminoVault,
    vaultReservesMap: Map<Address, KaminoReserve>,
    currentLedgerInstant: LedgerInstant
  ): Promise<PendingRewardsForUserInVault> {
    return this._vaultClient.getAllPendingRewardsForUserInVault(user, vault, vaultReservesMap, currentLedgerInstant);
  }

  /**
   * This function will return the instructions to claim the rewards for the farm of a vault, the delegated farm of the vault and the reserves farms of the vault
   * @param user - the user to claim the rewards
   * @param vault - the vault
   * @param vaultReservesMap - the vault reserves map to get the reserves for
   * @returns the instructions to claim the rewards for the farm of the vault, the delegated farm of the vault and the reserves farms of the vault
   */
  async getClaimAllRewardsForVaultIxs(
    user: TransactionSigner,
    vault: KaminoVault,
    vaultReservesMap: Map<Address, KaminoReserve>,
    currentLedgerInstant: LedgerInstant
  ): Promise<Instruction[]> {
    return this._vaultClient.getClaimAllRewardsForVaultIxs(user, vault, vaultReservesMap, currentLedgerInstant);
  }

  /**
   * This function will return the instructions to claim the rewards for the farm of a vault
   * @param user - the user to claim the rewards
   * @param vault - the vault
   * @returns the instructions to claim the rewards for the farm of the vault
   */
  async getClaimVaultFarmRewardsIxs(
    user: TransactionSigner,
    vault: KaminoVault,
    currentLedgerInstant: LedgerInstant
  ): Promise<Instruction[]> {
    return this._vaultClient.getClaimVaultFarmRewardsIxs(user, vault, currentLedgerInstant);
  }

  /**
   * This function will return the instructions to claim the rewards for the delegated farm of a vault
   * @param user - the user to claim the rewards
   * @param vault - the vault
   * @returns the instructions to claim the rewards for the delegated farm of the vault
   */
  async getClaimVaultDelegatedFarmRewardsIxs(user: TransactionSigner, vault: KaminoVault): Promise<Instruction[]> {
    return this._vaultClient.getClaimVaultDelegatedFarmRewardsIxs(user, vault);
  }

  /**
   * This function will return the instructions to claim the rewards for the reserves farms of a vault
   * @param user - the user to claim the rewards
   * @param vault - the vault
   * @param vaultReservesMap - the vault reserves map to get the reserves for
   * @returns the instructions to claim the rewards for the reserves farms of the vault
   */
  async getClaimVaultReservesFarmsRewardsIxs(
    user: TransactionSigner,
    vault: KaminoVault,
    vaultReservesMap: Map<Address, KaminoReserve>,
    currentLedgerInstant: LedgerInstant
  ): Promise<Instruction[]> {
    return this._vaultClient.getClaimVaultReservesFarmsRewardsIxs(user, vault, vaultReservesMap, currentLedgerInstant);
  }

  /**
   * Get all the token mints of the vault, vault farm rewards and the allocation  rewards
   * @param vaults - the vaults to get the token mints for
   * @param vaultReservesMap - the vault reserves map to get the reserves for
   * @param farmsMap - the farms map to get the farms for
   * @returns a map of token mints (keys) and number of decimals (values)
   */
  async getAllVaultsTokenMintsIncludingRewards(
    vaults: KaminoVault[],
    vaultReservesMap: Map<Address, KaminoReserve>,
    farmsMap: Map<Address, FarmState>
  ) {
    return this._vaultClient.getAllVaultsTokenMintsIncludingRewards(vaults, vaultReservesMap, farmsMap);
  }

  /**
   * This will return the APY of the reserve farms (debt and supply)
   * @param reserve - the reserve to get the farms APY for
   * @param reserveTokenPrice - the price of the reserve token in USD (e.g. 1.0 for USDC)
   * @param ledgerInstant - the ledger instant (slot + block time) to read the farm APY at
   * @param reserveState - the reserve state. Load it before calling to avoid an extra RPC call
   * @param [farmsClient] - the farms client to use. Optional. If not provided, the function will create a new one
   * @param [reserveRewardsMaxAprBps] - the parent lending market's `reserveRewardsMaxAprBps` (`kaminoMarket.state.reserveRewardsMaxAprBps`). Pass it when the market is already loaded to save a network call; when omitted, the reserve's lending market is fetched to read it.
   * @returns the APY of the farm built on top of the reserve
   */
  async getReserveFarmRewardsAPY(
    reserve: Address,
    reserveTokenPrice: Decimal,
    ledgerInstant: LedgerInstant,
    reserveState: Reserve,
    farmsClient?: FarmsClient,
    reserveRewardsMaxAprBps?: number
  ): Promise<ReserveIncentives> {
    return getReserveFarmRewardsAPYUtils(
      this._rpc,
      this.recentSlotDurationMs,
      reserve,
      reserveTokenPrice,
      farmsClient ? farmsClient : new Farms(this._rpc, this._farmsProgramId),
      ledgerInstant,
      reserveState,
      undefined,
      reserveRewardsMaxAprBps,
      this._kaminoLendProgramId
    );
  }

  /**
   * This will load the onchain state for all the reserves that the vault has allocations for
   * @param vaultState - the vault state to load reserves for
   * @returns a hashmap from each reserve pubkey to the reserve state
   */
  async loadVaultReserves(vaultState: VaultState): Promise<Map<Address, KaminoReserve>> {
    return this._vaultClient.loadVaultReserves(vaultState);
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
    return this._vaultClient.loadVaultsReserves(vaults, oracleAccounts);
  }

  /**
   * This will load the onchain state for all the reserves that the vault has allocations for
   * @param vault - the vault state to load reserves for
   * @returns a hashmap from each reserve pubkey to the reserve state
   */
  getVaultReserves(vault: VaultState): Address[] {
    return this._vaultClient.getVaultReserves(vault);
  }

  /**
   * Batch-load all farm states referenced by the given vault states (vault farm, FLC farm, delegated farms).
   * Cache the returned map and pass individual entries to methods like getVaultRewardsAPY or getVaultFlcFarmStats.
   * @param vaultStates - vault states to collect farm addresses from
   * @returns a map from farm address to FarmState
   */
  async loadVaultFarmStates(
    vaultStates: VaultState[],
    vaultReservesMap?: Map<Address, KaminoReserve>
  ): Promise<Map<Address, FarmState>> {
    return this._vaultClient.loadVaultFarmStates(vaultStates, vaultReservesMap);
  }

  /**
   * Load the FarmState for a single vault. Returns null if the vault has no farm.
   * Cache and pass the result to depositIxs / withdrawIxs / etc. to avoid per-call FarmState.fetch().
   * @param vaultState - the vault state
   * @returns FarmState if the vault has a farm, null otherwise
   */
  async loadVaultFarmState(vaultState: VaultState): Promise<FarmState | null> {
    return this._vaultClient.loadVaultFarmState(vaultState);
  }

  /**
   * Load KaminoMarket instances for all unique lending markets referenced by the given reserves.
   * Cache the returned map and pass it to getVaultCollaterals / getVaultOverview.
   * @param vaultReservesMap - the reserves map (as returned by loadVaultReserves / loadVaultsReserves)
   * @returns a map from lending market address to KaminoMarket
   */
  async loadKaminoMarketsForVaultReserves(
    vaultReservesMap: Map<Address, KaminoReserve>
  ): Promise<Map<Address, KaminoMarket>> {
    return this._vaultClient.loadKaminoMarketsForVaultReserves(vaultReservesMap);
  }

  /**
   * Pre-load the KVault global config. Can be called once and the result passed to methods like getVaultOverview and getVaultWithdrawPenalties.
   * @returns the KVaultGlobalConfig state
   */
  async loadKVaultGlobalConfig(): Promise<KVaultGlobalConfig> {
    return this._vaultClient.loadKVaultGlobalConfig();
  }

  /**
   * This will retrieve all the tokens that can be use as collateral by the users who borrow the token in the vault alongside details about the min and max loan to value ratio
   * @param vaultState - the vault state to load reserves for
   *
   * @param ledgerInstant - current ledger instant (slot + block time)
   * @param vaultReservesMap - cached vault reserves map
   * @param kaminoMarkets - cached kamino markets
   * @returns a hashmap from each reserve pubkey to the market overview of the collaterals that can be used and the min and max loan to value ratio in that market
   */
  async getVaultCollaterals(
    vaultState: VaultState,
    ledgerInstant: LedgerInstant,
    vaultReservesMap: Map<Address, KaminoReserve>,
    kaminoMarkets: Map<Address, KaminoMarket>
  ): Promise<Map<Address, MarketOverview>> {
    return this._vaultClient.getVaultCollaterals(vaultState, ledgerInstant, vaultReservesMap, kaminoMarkets);
  }

  /**
   * This will trigger invest by balancing, based on weights, the reserve allocations of the vault. It can either withdraw or deposit into reserves to balance them. This is a function that should be cranked
   * @param payer
   * @param kaminoVault - vault to invest from
   * @param ledgerInstant - current ledger instant (slot + block time), used for invest calculations
   * @param skipComputationChecks - if true, the function will skip the computation checks and will invest all the reserves
   * @returns - an array of invest instructions for each invest action required for the vault reserves
   */
  async investAllReservesIxs(
    payer: TransactionSigner,
    kaminoVault: KaminoVault,
    ledgerInstant: LedgerInstant,
    skipComputationChecks: boolean = false
  ): Promise<Instruction[]> {
    return this._vaultClient.investAllReservesIxs(payer, kaminoVault, ledgerInstant, skipComputationChecks);
  }

  /**
   * This will trigger invest by balancing, based on weights, the reserve allocation of the vault. It can either withdraw or deposit into the given reserve to balance it
   * @param payer wallet pubkey - the instruction is permissionless and does not require the vault admin, due to rounding between cTokens and the underlying, the payer may have to contribute 1 or more lamports of the underlying from their token account
   * @param kaminoVault - vault to invest from
   * @param reserveWithAddress - reserve to invest into or disinvest from
   * @param [vaultReservesMap] - optional parameter; a hashmap from each reserve pubkey to the reserve state. If provided the function will be significantly faster as it will not have to fetch the reserves
   * @param [createAtaIfNeeded] - if true, the function will create an ATA for the payer if needed
   * @returns - an array of invest instructions for each invest action required for the vault reserves
   */
  async investSingleReserveIxs(
    payer: TransactionSigner,
    kaminoVault: KaminoVault,
    reserveWithAddress: ReserveWithAddress,
    vaultReservesMap: Map<Address, KaminoReserve>,
    createAtaIfNeeded: boolean = true
  ): Promise<Instruction[]> {
    return this._vaultClient.investSingleReserveIxs(
      payer,
      kaminoVault,
      reserveWithAddress,
      vaultReservesMap,
      createAtaIfNeeded
    );
  }

  /**
   * This will trigger invest into or disinvest from the given reserve, capped by the provided max amount in lamports.
   * @param payer wallet pubkey - the instruction is permissionless and does not require the vault admin, due to rounding between cTokens and the underlying, the payer may have to contribute 1 or more lamports of the underlying from their token account
   * @param kaminoVault - vault to invest from
   * @param reserveWithAddress - reserve to invest into or disinvest from
   * @param maxAmount - maximum amount to move in or out of the reserve, in lamports
   * @param vaultReservesMap - a hashmap from each reserve pubkey to the reserve state
   * @param [createAtaIfNeeded] - if true, the function will create an ATA for the payer if needed
   * @returns - an array of instructions for the capped invest/disinvest action
   */
  async investSingleReserveWithMaxAmountIxs(
    payer: TransactionSigner,
    kaminoVault: KaminoVault,
    reserveWithAddress: ReserveWithAddress,
    maxAmount: BN | string,
    vaultReservesMap: Map<Address, KaminoReserve>,
    createAtaIfNeeded: boolean = true
  ): Promise<Instruction[]> {
    return this._vaultClient.investSingleReserveWithMaxAmountIxs(
      payer,
      kaminoVault,
      reserveWithAddress,
      maxAmount,
      vaultReservesMap,
      createAtaIfNeeded
    );
  }

  /**
   * This will return the a map between reserve pubkey and the pct of the vault invested amount in each reserve
   * @param vaultState - the kamino vault to get reserves distribution for
   * @returns a map between reserve pubkey and the allocation pct for the reserve
   */
  getAllocationsDistribuionPct(vaultState: VaultState): Map<Address, Decimal> {
    return this._vaultClient.getAllocationsDistribuionPct(vaultState);
  }

  /**
   * This will return the a map between reserve pubkey and the allocation overview for the reserve
   * @param vaultState - the kamino vault to get reserves allocation overview for
   * @returns a map between reserve pubkey and the allocation overview for the reserve
   */
  getVaultAllocations(vaultState: VaultState): Map<Address, ReserveAllocationOverview> {
    return this._vaultClient.getVaultAllocations(vaultState);
  }

  /**
   * This will return the amount of token invested from the vault into the given reserve
   * @param vaultState - the kamino vault to get invested amount in reserve for
   * @param ledgerInstant - current ledger instant (slot + block time)
   * @param reserve - the reserve state to get vault invested amount in
   * @returns vault amount supplied in reserve in decimal
   */
  getSuppliedInReserve(vaultState: VaultState, ledgerInstant: LedgerInstant, reserve: KaminoReserve): Decimal {
    return this._vaultClient.getSuppliedInReserve(vaultState, ledgerInstant, reserve);
  }

  /**
   * This returns an array of scope oracle configs to be used to set the scope price and twap oracles for a reserve
   * @param market kamino market
   * @param cluster - cluster to fetch from, this should be left unchanged unless working on devnet or locally
   * @returns - a map with keys as scope OraclePrices pubkeys and values of scope oracle configs
   */
  async getScopeOracleConfigs(
    market: KaminoMarket,
    cluster: ENV = 'mainnet-beta'
  ): Promise<Map<Address, ScopeOracleConfig[]>> {
    const scopeOracleConfigs = new Map<Address, ScopeOracleConfig[]>();

    const scope = new Scope(cluster, this._rpc);
    const configs = (await scope.getAllConfigurations()).filter(([_, config]) =>
      market.scopeFeeds.has(config.oraclePrices)
    );
    if (!configs || configs.length === 0) {
      return scopeOracleConfigs;
    }
    const configOracleMappings = await OracleMappings.fetchMultiple(
      this._rpc,
      configs.map(([_, config]) => config.oracleMappings),
      scope.config.programId
    );

    const configTokenMetadatas = await TokenMetadatas.fetchMultiple(
      this._rpc,
      configs.map(([_, config]) => config.tokensMetadata),
      scope.config.programId
    );

    const decoder = new TextDecoder('utf-8');

    for (let i = 0; i < configs.length; i++) {
      const [configPubkey, config] = configs[i];
      const oracleMappings = configOracleMappings[i];
      const tokenMetadatas = configTokenMetadatas[i];
      if (!oracleMappings) {
        throw new Error(`OracleMappings account not found for config ${configPubkey}`);
      }
      if (!tokenMetadatas) {
        throw new Error(`TokenMetadatas account not found for config ${configPubkey}`);
      }

      for (let j = 0; j < oracleMappings.priceInfoAccounts.length; j++) {
        if (oracleMappings.priceInfoAccounts[j] !== DEFAULT_PUBLIC_KEY) {
          const name = decoder.decode(Uint8Array.from(tokenMetadatas.metadatasArray[j].name)).replace(/\0/g, '');
          const oracleType = parseOracleType(oracleMappings.priceTypes[j]);
          setOrAppend(scopeOracleConfigs, config.oraclePrices, {
            name: name,
            oracleType: oracleType,
            oracleId: j,
            oracleAccount: oracleMappings.priceInfoAccounts[j],
            twapEnabled: oracleMappings.twapEnabled[j] === 1,
            twapSourceId: oracleMappings.twapSource[j],
            max_age: tokenMetadatas.metadatasArray[j].maxAgePriceSlots.toNumber(),
          });
        }
      }
    }

    return scopeOracleConfigs;
  }

  /**
   * This retruns an array of instructions to be used to update the lending market configurations
   * @param lendingMarketOwner - market admin
   * @param marketWithAddress - the market address and market state object
   * @param newMarket - the lending market state with the new configuration - to be build we new config options from the previous state
   * @returns - an array of instructions
   */
  updateLendingMarketIxs(
    lendingMarketOwner: TransactionSigner,
    marketWithAddress: MarketWithAddress,
    newMarket: LendingMarket
  ): Instruction[] {
    return parseForChangesMarketConfigAndGetIxs(
      lendingMarketOwner,
      marketWithAddress,
      newMarket,
      this._kaminoLendProgramId
    );
  }

  /**
   * This retruns an array of instructions to be used to update the pending lending market admin; if the admin is the same the list will be empty otherwise it will have an instruction to update the cached (pending) admin
   * @param currentAdmin - current lending market owner
   * @param marketWithAddress - the market address and market state object
   * @param newAdmin - the new admin
   * @returns - an array of instructions
   */
  updatePendingLendingMarketAdminIx(
    currentAdmin: TransactionSigner,
    marketWithAddress: MarketWithAddress,
    newAdmin: Address
  ): Instruction[] {
    const newMarket = new LendingMarket({ ...marketWithAddress.state, lendingMarketOwnerCached: newAdmin });
    return this.updateLendingMarketIxs(currentAdmin, marketWithAddress, newMarket);
  }

  /**
   * This returns an instruction to be used to update the market owner. This can only be executed by the current lendingMarketOwnerCached
   * @param marketWithAddress - the market address and market state object
   * @param lendingMarketOwnerCached - lendingMarketOwnerCached signer - a noop signer suitable for multisigs is used if not provided
   * @returns - an instruction for the new owner
   */
  updateLendingMarketOwnerIxs(
    marketWithAddress: MarketWithAddress,
    lendingMarketOwnerCached: TransactionSigner = noopSigner(marketWithAddress.state.lendingMarketOwnerCached)
  ): Instruction {
    const accounts: UpdateLendingMarketOwnerAccounts = {
      lendingMarketOwnerCached,
      lendingMarket: marketWithAddress.address,
      instructionSysvarAccount: SYSVAR_INSTRUCTIONS_ADDRESS,
    };
    return updateLendingMarketOwner(accounts, undefined, this._kaminoLendProgramId);
  }

  /**
   * Check if a vault has all the needed criteria to be released
   * @param vault - the vault to check
   * @returns the release check result with errors, warnings, and success flag
   */
  async checkVaultReleaseStatus(vault: KaminoVault): Promise<VaultReleaseCheckResult> {
    return this._vaultClient.checkVaultReleaseStatus(vault);
  }

  /**
   * This will get information about a market or vault admin
   * @param rpc - the rpc to use
   * @param address - the market or vault address
   * @param getAdminWalletType - callback to get the wallet type of the resolved admin authority
   * @returns the admin wallet type, or undefined if the market or vault does not exist
   */
  static async getMarketOrVaultAdminInfo(
    rpc: Rpc<GetAccountInfoApi>,
    address: Address,
    getAdminWalletType: (adminAuthority: Address) => Promise<WalletType>
  ): Promise<WalletType | undefined> {
    let adminAuthority: Address;
    try {
      // Try to fetch vault state first
      const vaultState = await VaultState.fetch(rpc, address);
      if (!vaultState) {
        throw new Error('Vault not found');
      }
      adminAuthority = vaultState.vaultAdminAuthority;
    } catch (error) {
      // If vault not found, try to fetch market state
      const market = await LendingMarket.fetch(rpc, address);
      if (!market) {
        return undefined;
      }
      adminAuthority = market.lendingMarketOwner;
    }
    return getAdminWalletType(adminAuthority);
  }
} // KaminoManager

export const MARKET_UPDATER = new ConfigUpdater(UpdateLendingMarketMode.fromDecoded, LendingMarket, (config) => ({
  [UpdateLendingMarketMode.UpdateOwner.kind]: config.lendingMarketOwnerCached,
  [UpdateLendingMarketMode.UpdateImmutableFlag.kind]: config.immutable,
  [UpdateLendingMarketMode.UpdateEmergencyMode.kind]: config.emergencyMode,
  [UpdateLendingMarketMode.UpdateLiquidationCloseFactor.kind]: config.liquidationMaxDebtCloseFactorPct,
  [UpdateLendingMarketMode.UpdateLiquidationMaxValue.kind]: config.maxLiquidatableDebtMarketValueAtOnce,
  [UpdateLendingMarketMode.DeprecatedUpdateGlobalUnhealthyBorrow.kind]: [], // deprecated
  [UpdateLendingMarketMode.UpdateGlobalAllowedBorrow.kind]: config.globalAllowedBorrowValue,
  [UpdateLendingMarketMode.UpdateEmergencyCouncil.kind]: config.emergencyCouncil,
  [UpdateLendingMarketMode.UpdateMinFullLiquidationThreshold.kind]: config.minFullLiquidationValueThreshold,
  [UpdateLendingMarketMode.UpdateInsolvencyRiskLtv.kind]: config.insolvencyRiskUnhealthyLtvPct,
  [UpdateLendingMarketMode.UpdateElevationGroup.kind]: arrayElementConfigItems(config.elevationGroups),
  [UpdateLendingMarketMode.UpdateReferralFeeBps.kind]: config.referralFeeBps,
  [UpdateLendingMarketMode.DeprecatedUpdateMultiplierPoints.kind]: [], // deprecated
  [UpdateLendingMarketMode.UpdatePriceRefreshTriggerToMaxAgePct.kind]: config.priceRefreshTriggerToMaxAgePct,
  [UpdateLendingMarketMode.UpdateAutodeleverageEnabled.kind]: config.autodeleverageEnabled,
  [UpdateLendingMarketMode.UpdateBorrowingDisabled.kind]: config.borrowDisabled,
  [UpdateLendingMarketMode.UpdateMinNetValueObligationPostAction.kind]: config.minNetValueInObligationSf,
  [UpdateLendingMarketMode.UpdateMinValueLtvSkipPriorityLiqCheck.kind]: config.minValueSkipLiquidationLtvChecks,
  [UpdateLendingMarketMode.UpdateMinValueBfSkipPriorityLiqCheck.kind]: config.minValueSkipLiquidationBfChecks,
  [UpdateLendingMarketMode.UpdatePaddingFields.kind]: [], // we do not update padding this way
  [UpdateLendingMarketMode.UpdateName.kind]: config.name,
  [UpdateLendingMarketMode.UpdateIndividualAutodeleverageMarginCallPeriodSecs.kind]:
    config.individualAutodeleverageMarginCallPeriodSecs,
  [UpdateLendingMarketMode.UpdateInitialDepositAmount.kind]: config.minInitialDepositAmount,
  [UpdateLendingMarketMode.UpdateObligationOrderCreationEnabled.kind]: config.obligationOrderCreationEnabled,
  [UpdateLendingMarketMode.UpdateObligationOrderExecutionEnabled.kind]: config.obligationOrderExecutionEnabled,
  [UpdateLendingMarketMode.UpdateProposerAuthority.kind]: config.proposerAuthority,
  [UpdateLendingMarketMode.UpdatePriceTriggeredLiquidationDisabled.kind]: config.priceTriggeredLiquidationDisabled,
  [UpdateLendingMarketMode.UpdateMatureReserveDebtLiquidationEnabled.kind]: config.matureReserveDebtLiquidationEnabled,
  [UpdateLendingMarketMode.UpdateObligationBorrowDebtTermLiquidationEnabled.kind]:
    config.obligationBorrowDebtTermLiquidationEnabled,
  [UpdateLendingMarketMode.UpdateBorrowOrderCreationEnabled.kind]: config.borrowOrderCreationEnabled,
  [UpdateLendingMarketMode.UpdateBorrowOrderExecutionEnabled.kind]: config.borrowOrderExecutionEnabled,
  [UpdateLendingMarketMode.UpdateMinBorrowOrderFillValue.kind]: config.minBorrowOrderFillValue,
  [UpdateLendingMarketMode.UpdateWithdrawTicketIssuanceEnabled.kind]: config.withdrawTicketIssuanceEnabled,
  [UpdateLendingMarketMode.UpdateWithdrawTicketRedemptionEnabled.kind]: config.withdrawTicketRedemptionEnabled,
  [UpdateLendingMarketMode.UpdateMinWithdrawQueuedLiquidityValue.kind]: config.minWithdrawQueuedLiquidityValue,
  [UpdateLendingMarketMode.UpdateFixedTermRolloverWindowDurationSeconds.kind]:
    config.fixedTermRolloverWindowDurationSeconds,
  [UpdateLendingMarketMode.UpdateOpenTermRolloverWindowDurationSeconds.kind]:
    config.openTermRolloverWindowDurationSeconds,
  [UpdateLendingMarketMode.UpdateObligationBorrowRolloverConfigurationEnabled.kind]:
    config.obligationBorrowRolloverConfigurationEnabled,
  [UpdateLendingMarketMode.UpdateTermBasedFullLiquidationDurationSecs.kind]:
    config.termBasedFullLiquidationDurationSecs,
  [UpdateLendingMarketMode.UpdateObligationBorrowMigrationToFixedExecutionEnabled.kind]:
    config.obligationBorrowMigrationToFixedExecutionEnabled,
  [UpdateLendingMarketMode.UpdateMinPartialRolloverValue.kind]: config.minPartialRolloverValue,
  [UpdateLendingMarketMode.UpdateWithdrawTicketCancellationEnabled.kind]: config.withdrawTicketCancellationEnabled,
  [UpdateLendingMarketMode.UpdatePermissioningAuthority.kind]: config.permissioningAuthority,
  [UpdateLendingMarketMode.UpdatePermissionedOps.kind]: config.permissionedOps,
  [UpdateLendingMarketMode.DeprecatedUpdateReserveRewardsMaxAprPct.kind]: [], // deprecated
  [UpdateLendingMarketMode.UpdateReserveRewardsMaxAprBps.kind]: config.reserveRewardsMaxAprBps,
  [UpdateLendingMarketMode.UpdateDisableNonceBlock.kind]: config.disableNonceBlock,
}));

const PRIORITY_ORDERED_MARKET_UPDATER = new PriorityOrderedConfigUpdater(MARKET_UPDATER);

// Lowest priority gets updated first
function marketUpdatePriorityOf(mode: UpdateLendingMarketModeKind): number {
  switch (mode.discriminator) {
    // MinBorrowOrderFillValue must be set before execution can be enabled
    case UpdateLendingMarketMode.UpdateMinBorrowOrderFillValue.discriminator:
      return 0;
    case UpdateLendingMarketMode.UpdateBorrowOrderExecutionEnabled.discriminator:
      return 1;
    default:
      return 10;
  }
}

function parseForChangesMarketConfigAndGetIxs(
  lendingMarketOwner: TransactionSigner,
  marketWithAddress: MarketWithAddress,
  newMarket: LendingMarket,
  programId: Address
): Instruction[] {
  const encodedMarketUpdates = PRIORITY_ORDERED_MARKET_UPDATER.encodeAllUpdates(
    marketWithAddress.state,
    newMarket,
    marketUpdatePriorityOf
  );
  return encodedMarketUpdates.map((encodedMarketUpdate) =>
    updateMarketConfigIx(
      lendingMarketOwner,
      marketWithAddress,
      encodedMarketUpdate.mode,
      encodedMarketUpdate.value,
      programId
    )
  );
}

function updateMarketConfigIx(
  lendingMarketOwner: TransactionSigner,
  marketWithAddress: MarketWithAddress,
  mode: UpdateLendingMarketModeKind,
  value: Uint8Array,
  programId: Address
): Instruction {
  const accounts: UpdateLendingMarketAccounts = {
    signer: lendingMarketOwner,
    lendingMarket: marketWithAddress.address,
    instructionSysvarAccount: SYSVAR_INSTRUCTIONS_ADDRESS,
  };

  const args: UpdateLendingMarketArgs = {
    mode: new BN(mode.discriminator),
    // NOTE: the Market's update handler expects a `[u8; 72]` (contrary to e.g. the Reserve's update handler accepting
    // `Vec<u8>`). Hence, we need to add explicit padding here:
    value: [...value, ...Array(72 - value.length).fill(0)],
  };

  const ix = updateLendingMarket(args, accounts, undefined, programId);

  return ix;
}
