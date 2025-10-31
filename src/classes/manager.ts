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
} from './vault';
import {
  AddAssetToMarketParams,
  AllOracleAccounts,
  CreateKaminoMarketParams,
  createReserveIxs,
  DEFAULT_PUBLIC_KEY,
  DEFAULT_RECENT_SLOT_DURATION_MS,
  ENV,
  getAllLendingMarketAccounts,
  getAllOracleAccounts,
  getAllReserveAccounts,
  getReserveOracleConfigs,
  getTokenOracleDataSync,
  initLendingMarket,
  InitLendingMarketAccounts,
  InitLendingMarketArgs,
  insertIntoLookupTableIxs,
  KaminoMarket,
  KaminoReserve,
  LendingMarket,
  lendingMarketAuthPda,
  MarketWithAddress,
  parseForChangesReserveConfigAndGetIxs,
  parseOracleType,
  parseTokenSymbol,
  Reserve,
  ReserveWithAddress,
  ScopeOracleConfig,
  setOrAppend,
  updateEntireReserveConfigIx,
  updateLendingMarket,
  UpdateLendingMarketAccounts,
  UpdateLendingMarketArgs,
  updateLendingMarketOwner,
  UpdateLendingMarketOwnerAccounts,
} from '../lib';
import { PROGRAM_ID } from '../@codegen/klend/programId';
import { Scope, U16_MAX } from '@kamino-finance/scope-sdk';
import { TokenMetadatas } from '@kamino-finance/scope-sdk/dist/@codegen/scope/accounts/TokenMetadatas';
import BN from 'bn.js';
import { ReserveConfig, UpdateLendingMarketMode, UpdateLendingMarketModeKind } from '../@codegen/klend/types';
import Decimal from 'decimal.js';
import { VaultState } from '../@codegen/kvault/accounts';
import { getProgramAccounts } from '../utils/rpc';
import { VaultConfigField, VaultConfigFieldKind } from '../@codegen/kvault/types';
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
  VaultComputedAllocation,
  WithdrawAndBlockReserveIxs,
  WithdrawIxs,
} from './vault_types';
import { FarmIncentives, Farms, FarmState } from '@kamino-finance/farms-sdk/dist';
import { getSquadsMultisigAdminsAndThreshold, walletIsSquadsMultisig, WalletType } from '../utils/multisig';
import { decodeVaultState } from '../utils/vault';
import { noopSigner } from '../utils/signer';
import { getCreateAccountInstruction, SYSTEM_PROGRAM_ADDRESS } from '@solana-program/system';
import { SYSVAR_RENT_ADDRESS } from '@solana/sysvars';
import { TOKEN_PROGRAM_ADDRESS } from '@solana-program/token';
import type { AccountInfoBase, AccountInfoWithJsonData, AccountInfoWithPubkey } from '@solana/rpc-types';
import { arrayElementConfigItems, ConfigUpdater } from './configItems';
import { OracleMappings } from '@kamino-finance/scope-sdk/dist/@codegen/scope/accounts';
import { getReserveFarmRewardsAPY as getReserveFarmRewardsAPYUtils, ReserveIncentives } from '../utils/farmUtils';

const base58Decoder = getBase58Decoder();

/**
 * KaminoManager is a class that provides a high-level interface to interact with the Kamino Lend and Kamino Vault programs, in order to create and manage a market, as well as vaults
 */
export class KaminoManager {
  private readonly _rpc: Rpc<SolanaRpcApi>;
  private readonly _kaminoVaultProgramId: Address;
  private readonly _kaminoLendProgramId: Address;
  private readonly _vaultClient: KaminoVaultClient;
  recentSlotDurationMs: number;

  constructor(
    rpc: Rpc<SolanaRpcApi>,
    recentSlotDurationMs?: number,
    kaminoLendProgramId?: Address,
    kaminoVaultProgramId?: Address
  ) {
    this._rpc = rpc;
    this.recentSlotDurationMs = recentSlotDurationMs ?? DEFAULT_RECENT_SLOT_DURATION_MS;
    this._kaminoVaultProgramId = kaminoVaultProgramId ? kaminoVaultProgramId : kaminoVaultId;
    this._kaminoLendProgramId = kaminoLendProgramId ? kaminoLendProgramId : PROGRAM_ID;
    this._vaultClient = new KaminoVaultClient(
      rpc,
      this.recentSlotDurationMs,
      this._kaminoVaultProgramId,
      this._kaminoLendProgramId
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
  async addAssetToMarketIxs(
    params: AddAssetToMarketParams
  ): Promise<{ reserve: TransactionSigner; txnIxs: Instruction[][] }> {
    const market = await LendingMarket.fetch(this._rpc, params.marketAddress, this._kaminoLendProgramId);
    if (!market) {
      throw new Error('Market not found');
    }
    const marketWithAddress: MarketWithAddress = { address: params.marketAddress, state: market };

    const reserveAccount = await generateKeyPairSigner();

    const createReserveInstructions = await createReserveIxs(
      this._rpc,
      params.admin,
      params.adminLiquiditySource,
      params.marketAddress,
      params.assetConfig.mint,
      params.assetConfig.mintTokenProgram,
      reserveAccount,
      this._kaminoLendProgramId
    );

    const updateReserveInstructions = await this.updateReserveIxs(
      params.admin,
      marketWithAddress,
      reserveAccount.address,
      params.assetConfig.getReserveConfig(),
      undefined,
      false
    );

    const txnIxs: Instruction[][] = [];
    txnIxs.push(createReserveInstructions);
    txnIxs.push(updateReserveInstructions);

    return { reserve: reserveAccount, txnIxs };
  }

  /**
   * This method will create a vault with a given config. The config can be changed later on, but it is recommended to set it up correctly from the start
   * @param vaultConfig - the config object used to create a vault
   * @returns vault: the keypair of the vault, used to sign the initialization transaction; initVaultIxs: a struct with ixs to initialize the vault and its lookup table + populateLUTIxs, a list to populate the lookup table which has to be executed in a separate transaction
   */
  async createVaultIxs(
    vaultConfig: KaminoVaultConfig
  ): Promise<{ vault: TransactionSigner; lut: Address; initVaultIxs: InitVaultIxs }> {
    return this._vaultClient.createVaultIxs(vaultConfig);
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
  async getSetSharesMetadataIx(authority: TransactionSigner, vault: KaminoVault, tokenName: string, extraName: string) {
    const vaultState = await vault.getState();
    return this._vaultClient.getSetSharesMetadataIx(
      this._rpc,
      authority,
      vault.address,
      vaultState.sharesMint,
      vaultState.baseVaultAuthority,
      tokenName,
      extraName
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
    vaultAdminAuthority?: TransactionSigner,
    unallocatedWeight?: BN,
    unallocatedCap?: BN
  ): Promise<Instruction[]> {
    return this._vaultClient.updateVaultUnallocatedWeightAndCapIxs(
      vault,
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

  /**
   * This method sets weight to 0, remove tokens and remove from allocation a reserve from the vault
   * @param signer - signer to use for the transaction
   * @param kaminoVault - vault to remove the reserve from
   * @param reserveAddress - reserve to remove from the vault allocation strategy
   * @param [reserveState] - optional parameter to pass a reserve state. If not provided, the reserve will be fetched from the connection
   * @returns - an array of instructions to set the reserve allocation to 0, invest the reserve if it has tokens, and remove the reserve from the allocation
   */
  async fullRemoveReserveFromVaultIxs(
    signer: TransactionSigner,
    kaminoVault: KaminoVault,
    reserveAddress: Address,
    reserveState?: Reserve
  ): Promise<Instruction[]> {
    const connection = this.getRpc();
    const vaultState = await kaminoVault.getState();

    const allocations = this.getVaultReserves(vaultState);
    if (!allocations.includes(reserveAddress)) {
      throw new Error('Reserve not found in vault allocations');
    }

    const fetchedReserveState =
      reserveState ?? (await Reserve.fetch(connection, reserveAddress, this._kaminoLendProgramId));
    if (!fetchedReserveState) {
      throw new Error('Reserve not found');
    }
    const reserveWithAddress: ReserveWithAddress = {
      address: reserveAddress,
      state: fetchedReserveState,
    };

    const kaminoReserve = await KaminoReserve.initializeFromAddress(
      reserveAddress,
      connection,
      this.recentSlotDurationMs,
      reserveState
    );

    const reserveAllocationConfig = new ReserveAllocationConfig(reserveWithAddress, 0, new Decimal(0));
    const setAllocationToZeroIx = await this.updateVaultReserveAllocationIxs(
      kaminoVault,
      reserveAllocationConfig,
      signer
    );

    const investIx = await this.investSingleReserveIxs(signer, kaminoVault, reserveWithAddress);

    const removeAllocationIx = await this.removeReserveFromAllocationIx(kaminoVault, reserveAddress, signer);

    const ixs = [setAllocationToZeroIx.updateReserveAllocationIx];

    const slot = await connection.getSlot({ commitment: 'confirmed' }).send();
    const suppliedInReserve = this.getSuppliedInReserve(vaultState, slot, kaminoReserve);
    if (suppliedInReserve.gt(new Decimal(0))) {
      ixs.push(...investIx);
    }
    if (removeAllocationIx) {
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
   * @param [vaultReservesMap] - optional parameter to pass a map of the vault reserves. If not provided, the reserves will be loaded from the vault
   * @param [payer] - optional parameter to pass a different payer for the transaction. If not provided, the admin of the vault will be used; this is the payer for the invest ixs and it should have an ATA and some lamports (2x no_of_reserves) of the token vault
   * @returns - a struct with an instruction to update the reserve allocation and an optional list of instructions to update the lookup table for the allocation changes
   */
  async withdrawEverythingFromAllReservesAndBlockInvest(
    vault: KaminoVault,
    vaultReservesMap?: Map<Address, KaminoReserve>,
    payer?: TransactionSigner
  ): Promise<WithdrawAndBlockReserveIxs> {
    return this._vaultClient.withdrawEverythingFromAllReservesAndBlockInvest(vault, vaultReservesMap, payer);
  }

  /**
   * This method disinvests all the funds from all the reserves and set their weight to 0; for vaults that are managed by external bot/crank, the bot can change the weight and invest in the reserves again
   * @param vault - the vault to disinvest the invested funds from
   * @param [vaultReservesMap] - optional parameter to pass a map of the vault reserves. If not provided, the reserves will be loaded from the vault
   * @param [payer] - optional parameter to pass a different payer for the transaction. If not provided, the admin of the vault will be used; this is the payer for the invest ixs and it should have an ATA and some lamports (2x no_of_reserves) of the token vault
   * @returns - a struct with an instruction to update the reserve allocations to 0 weight and a list of instructions to disinvest the funds in the reserves
   */
  async disinvestAllReservesIxs(
    vault: KaminoVault,
    vaultReservesMap?: Map<Address, KaminoReserve>,
    payer?: TransactionSigner
  ): Promise<DisinvestAllReservesIxs> {
    return this._vaultClient.disinvestAllReservesIxs(vault, vaultReservesMap, payer);
  }

  // async closeVault(vault: KaminoVault): Promise<TransactionInstruction> {
  //   return this._vaultClient.closeVaultIx(vault);
  // }

  /**
   * This method retruns the reserve config for a given reserve
   * @param reserve - reserve to get the config for
   * @returns - the reserve config
   */
  async getReserveConfig(reserve: Address): Promise<ReserveConfig> {
    const reserveState = await Reserve.fetch(this._rpc, reserve);
    if (!reserveState) {
      throw new Error('Reserve not found');
    }
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

    return this.updateReserveIxs(lendingMarketOwner, market, reserve.address, newReserveConfig, reserve.state);
  }

  /**
   * This function updates the given reserve with a new config. It can either update the entire reserve config or just update fields which differ between given reserve and existing reserve
   * @param lendingMarketOwner - market authority
   * @param marketWithAddress - the market that owns the reserve to be updated
   * @param reserve - the reserve to be updated
   * @param config - the new reserve configuration to be used for the update
   * @param reserveStateOverride - the reserve state, useful to provide, if already fetched outside this method, in order to avoid an extra rpc call to fetch it. Make sure the reserveConfig has not been updated since fetching the reserveState that you pass in.
   * @param updateEntireConfig - when set to false, it will only update fields that are different between @param config and reserveState.config, set to true it will always update entire reserve config. An entire reserveConfig update might be too large for a multisig transaction
   * @returns - an array of multiple update ixs. If there are many fields that are being updated without the updateEntireConfig=true, multiple transactions might be required to fit all ixs.
   */
  async updateReserveIxs(
    lendingMarketOwner: TransactionSigner,
    marketWithAddress: MarketWithAddress,
    reserve: Address,
    config: ReserveConfig,
    reserveStateOverride?: Reserve,
    updateEntireConfig: boolean = false
  ): Promise<Instruction[]> {
    const reserveState = reserveStateOverride
      ? reserveStateOverride
      : (await Reserve.fetch(this._rpc, reserve, this._kaminoLendProgramId))!;
    const ixs: Instruction[] = [];

    if (!reserveState || updateEntireConfig) {
      ixs.push(
        await updateEntireReserveConfigIx(
          lendingMarketOwner,
          marketWithAddress.address,
          reserve,
          config,
          this._kaminoLendProgramId
        )
      );
    } else {
      ixs.push(
        ...(await parseForChangesReserveConfigAndGetIxs(
          marketWithAddress,
          reserveState,
          reserve,
          config,
          this._kaminoLendProgramId,
          lendingMarketOwner
        ))
      );
    }

    return ixs;
  }

  /**
   * This function creates instructions to deposit into a vault. It will also create ATA creation instructions for the vault shares that the user receives in return
   * @param user - user to deposit
   * @param vault - vault to deposit into (if the state is not provided, it will be fetched)
   * @param tokenAmount - token amount to be deposited, in decimals (will be converted in lamports)
   * @param [vaultReservesMap] - optional parameter; a hashmap from each reserve pubkey to the reserve state. Optional. If provided the function will be significantly faster as it will not have to fetch the reserves
   * @param [farmState] - the state of the vault farm, if the vault has a farm. Optional. If not provided, it will be fetched
   * @returns - an instance of DepositIxs which contains the instructions to deposit in vault and the instructions to stake the shares in the farm if the vault has a farm
   */
  async depositToVaultIxs(
    user: TransactionSigner,
    vault: KaminoVault,
    tokenAmount: Decimal,
    vaultReservesMap?: Map<Address, KaminoReserve>,
    farmState?: FarmState
  ): Promise<DepositIxs> {
    return this._vaultClient.depositIxs(user, vault, tokenAmount, vaultReservesMap, farmState);
  }

  /**
   * This function creates instructions to stake the shares in the vault farm if the vault has a farm
   * @param user - user to stake
   * @param vault - vault to deposit into its farm (if the state is not provided, it will be fetched)
   * @param [sharesAmount] - token amount to be deposited, in decimals (will be converted in lamports). Optional. If not provided, the user's share balance will be used
   * @param [farmState] - the state of the vault farm, if the vault has a farm. Optional. If not provided, it will be fetched
   * @returns - a list of instructions for the user to stake shares into the vault's farm, including the creation of prerequisite accounts if needed
   */
  async stakeSharesIxs(
    user: TransactionSigner,
    vault: KaminoVault,
    sharesAmount?: Decimal,
    farmState?: FarmState
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
   * @returns a struct that contains the instruction to update the field and an optional list of instructions to update the lookup table
   */
  async updateVaultConfigIxs(
    vault: KaminoVault,
    mode: VaultConfigFieldKind | string,
    value: string,
    signer?: TransactionSigner,
    lutIxsSigner?: TransactionSigner,
    skipLutUpdate: boolean = false
  ): Promise<UpdateVaultConfigIxs> {
    if (typeof mode === 'string') {
      const field = VaultConfigField.fromDecoded({ [mode]: '' });
      return this._vaultClient.updateVaultConfigIxs(vault, field, value, signer, lutIxsSigner, skipLutUpdate);
    }

    return this._vaultClient.updateVaultConfigIxs(vault, mode, value, signer, lutIxsSigner, skipLutUpdate);
  }

  /** Sets the farm where the shares can be staked. This is store in vault state and a vault can only have one farm, so the new farm will ovveride the old farm
   * @param vault - vault to set the farm for
   * @param farm - the farm where the vault shares can be staked
   * @param [errorOnOverride] - if true, the function will throw an error if the vault already has a farm. If false, it will override the farm
   * @param [vaultAdminAuthority] - vault admin - a noop vaultAdminAuthority is provided when absent for multisigs
   */
  async setVaultFarmIxs(
    vault: KaminoVault,
    farm: Address,
    errorOnOverride: boolean = true,
    vaultAdminAuthority?: TransactionSigner,
    lutIxsSigner?: TransactionSigner,
    skipLutUpdate: boolean = false
  ): Promise<UpdateVaultConfigIxs> {
    return this._vaultClient.setVaultFarmIxs(
      vault,
      farm,
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
    pendingAdmin?: TransactionSigner
  ): Promise<AcceptVaultOwnershipIxs> {
    return this._vaultClient.acceptVaultOwnershipIxs(vault, pendingAdmin);
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
   * @param slot - current slot, used to estimate the interest earned in the different reserves with allocation from the vault
   * @param [vaultReservesMap] - optional parameter; a hashmap from each reserve pubkey to the reserve state. If provided the function will be significantly faster as it will not have to fetch the reserves
   * @param [farmState] - the state of the vault farm, if the vault has a farm. Optional. If not provided, it will be fetched
   * @returns an array of instructions to create missing ATAs if needed and the withdraw instructions
   */
  async withdrawFromVaultIxs(
    user: TransactionSigner,
    vault: KaminoVault,
    shareAmount: Decimal,
    slot: Slot,
    vaultReservesMap?: Map<Address, KaminoReserve>,
    farmState?: FarmState
  ): Promise<WithdrawIxs> {
    return this._vaultClient.withdrawIxs(user, vault, shareAmount, slot, vaultReservesMap, farmState);
  }

  /**
   * This method withdraws all the pending fees from the vault to the owner's token ATA
   * @param vault - vault for which the admin withdraws the pending fees
   * @param slot - current slot, used to estimate the interest earned in the different reserves with allocation from the vault
   * @param [vaultAdminAuthority] - vault admin - a noop vaultAdminAuthority is provided when absent for multisigs
   * @returns - list of instructions to withdraw all pending fees, including the ATA creation instructions if needed
   */
  async withdrawPendingFeesIxs(
    vault: KaminoVault,
    slot: Slot,
    vaultAdminAuthority?: TransactionSigner
  ): Promise<Instruction[]> {
    return this._vaultClient.withdrawPendingFeesIxs(vault, slot, undefined, vaultAdminAuthority);
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
   * @param vault the vault to sync and set the LUT for if needed
   * @param vaultReserves optional; the state of the reserves in the vault allocation
   * @returns a struct that contains a list of ix to create the LUT and assign it to the vault if needed + a list of ixs to insert all the accounts in the LUT
   */
  async syncVaultLUTIxs(
    authority: TransactionSigner,
    vault: KaminoVault,
    vaultReserves?: Map<Address, KaminoReserve>
  ): Promise<SyncVaultLUTIxs> {
    return this._vaultClient.syncVaultLookupTableIxs(authority, vault, vaultReserves);
  }

  /**
   * This method calculates the token per share value. This will always change based on interest earned from the vault, but calculating it requires a bunch of rpc requests. Caching this for a short duration would be optimal
   * @param vault - vault to calculate tokensPerShare for
   * @param [slot] - the slot at which we retrieve the tokens per share. Optional. If not provided, the function will fetch the current slot
   * @param [vaultReservesMap] - hashmap from each reserve pubkey to the reserve state. Optional. If provided the function will be significantly faster as it will not have to fetch the reserves
   * @param [currentSlot] - the latest confirmed slot. Optional. If provided the function will be  faster as it will not have to fetch the latest slot
   * @returns - token per share value
   */
  async getTokensPerShareSingleVault(
    vault: KaminoVault,
    slot?: Slot,
    vaultReservesMap?: Map<Address, KaminoReserve>,
    currentSlot?: Slot
  ): Promise<Decimal> {
    return this._vaultClient.getTokensPerShareSingleVault(vault, slot, vaultReservesMap, currentSlot);
  }

  /**
   * This method calculates the price of one vault share(kToken)
   * @param vault - vault to calculate sharePrice for
   * @param tokenPrice - the price of the vault token (e.g. SOL) in USD
   * @param [slot] - the slot at which we retrieve the tokens per share. Optional. If not provided, the function will fetch the current slot
   * @param [vaultReservesMap] - hashmap from each reserve pubkey to the reserve state. Optional. If provided the function will be significantly faster as it will not have to fetch the reserves
   * @param [currentSlot] - the latest confirmed slot. Optional. If provided the function will be  faster as it will not have to fetch the latest slot
   * @returns - share value in USD
   */
  async getSharePriceInUSD(
    vault: KaminoVault,
    tokenPrice: Decimal,
    slot?: Slot,
    vaultReservesMap?: Map<Address, KaminoReserve>,
    currentSlot?: Slot
  ): Promise<Decimal> {
    const tokensPerShare = await this.getTokensPerShareSingleVault(vault, slot, vaultReservesMap, currentSlot);
    return tokensPerShare.mul(tokenPrice);
  }

  /**
   * This method returns the user shares balance for a given vault
   * @param user - user to calculate the shares balance for
   * @param vault - vault to calculate shares balance for
   * @returns - a struct of user share balance (staked in vault farm if the vault has a farm and unstaked) in decimal (not lamports)
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
  async getAllMarkets(programId: Address = PROGRAM_ID): Promise<KaminoMarket[]> {
    // Get all lending markets
    const marketGenerator = getAllLendingMarketAccounts(this.getRpc(), programId);

    const lendingMarketPairs: [Address, LendingMarket][] = [];
    for await (const pair of marketGenerator) {
      lendingMarketPairs.push(pair);
    }

    // Get all reserves
    const allReserveAccounts = getAllReserveAccounts(this.getRpc());
    const reservePairs: [Address, Reserve][] = [];
    for await (const pair of allReserveAccounts) {
      reservePairs.push(pair);
    }
    const allReserves = reservePairs.map(([, reserve]) => reserve);

    // Get all oracle accounts
    const allOracleAccounts = await getAllOracleAccounts(this.getRpc(), allReserves);
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
        reservesAndOracles.forEach(([reserve, oracle], index) => {
          if (!oracle) {
            console.log('Manager > getAllMarkets: oracle not found for reserve', reserve.config.tokenInfo.name);
            return;
          }

          const { address, state } = reserves[index];
          const kaminoReserve = KaminoReserve.initialize(
            address,
            state,
            oracle,
            this.getRpc(),
            this.recentSlotDurationMs
          );
          reservesByAddress.set(kaminoReserve.address, kaminoReserve);
        });
      }

      return KaminoMarket.loadWithReserves(this.getRpc(), market, reservesByAddress, pubkey, this.recentSlotDurationMs);
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
   * @param [slot] - the slot for which to calculate the holdings. Optional. If not provided the function will fetch the current slot
   * @param [vaultReserves] - a hashmap from each reserve pubkey to the reserve state. Optional. If provided the function will be significantly faster as it will not have to fetch the reserves
   * @param [currentSlot] - the latest confirmed slot. Optional. If provided the function will be  faster as it will not have to fetch the latest slot
   * @returns an VaultHoldings object
   */
  async getVaultHoldings(
    vault: VaultState,
    slot?: Slot,
    vaultReserves?: Map<Address, KaminoReserve>,
    currentSlot?: Slot
  ): Promise<VaultHoldings> {
    return this._vaultClient.getVaultHoldings(vault, slot, vaultReserves, currentSlot);
  }

  /**
   * This will return an VaultHoldingsWithUSDValue object which contains an holdings field representing the amount available (uninvested) in vault, total amount invested in reseves and a breakdown of the amount invested in each reserve and additional fields for the total USD value of the available and invested amounts
   * @param vault - the kamino vault to get available liquidity to withdraw for
   * @param price - the price of the token in the vault (e.g. USDC)
   * @param [slot] - the slot for which to calculate the holdings. Optional. If not provided the function will fetch the current slot
   * @param [vaultReserves]
   * @param [currentSlot] - the latest confirmed slot. Optional. If provided the function will be  faster as it will not have to fetch the latest slot
   * @returns an VaultHoldingsWithUSDValue object with details about the tokens available and invested in the vault, denominated in tokens and USD
   */
  async getVaultHoldingsWithPrice(
    vault: VaultState,
    price: Decimal,
    slot?: Slot,
    vaultReserves?: Map<Address, KaminoReserve>,
    currentSlot?: Slot
  ): Promise<VaultHoldingsWithUSDValue> {
    return this._vaultClient.getVaultHoldingsWithPrice(vault, price, slot, vaultReserves, currentSlot);
  }

  /**
   * This will return an VaultOverview object that encapsulates all the information about the vault, including the holdings, reserves details, theoretical APY, utilization ratio and total borrowed amount
   * @param vault - the kamino vault to get available liquidity to withdraw for
   * @param vaultTokenPrice - the price of the token in the vault (e.g. USDC)
   * @param [slot] - the slot for which to retrieve the vault overview for. Optional. If not provided the function will fetch the current slot
   * @param [vaultReservesMap] - hashmap from each reserve pubkey to the reserve state. Optional. If provided the function will be significantly faster as it will not have to fetch the reserves
   * @param [kaminoMarkets] - a list of all kamino markets. Optional. If provided the function will be significantly faster as it will not have to fetch the markets
   * @param [currentSlot] - the latest confirmed slot. Optional. If provided the function will be  faster as it will not have to fetch the latest slot
   * @param [tokensPrices] - a hashmap from a token pubkey to the price of the token in USD. Optional. If some tokens are not in the map, the function will fetch the price
   * @returns an VaultOverview object with details about the tokens available and invested in the vault, denominated in tokens and USD, along sie APYs
   */
  async getVaultOverview(
    vault: KaminoVault,
    price: Decimal,
    slot?: Slot,
    vaultReserves?: Map<Address, KaminoReserve>,
    kaminoMarkets?: KaminoMarket[],
    currentSlot?: Slot,
    tokensPrices?: Map<Address, Decimal>
  ): Promise<VaultOverview> {
    return this._vaultClient.getVaultOverview(
      vault,
      price,
      slot,
      vaultReserves,
      kaminoMarkets,
      currentSlot,
      tokensPrices
    );
  }

  /**
   * Prints a vault in a human readable form
   * @param vaultPubkey - the address of the vault
   * @param [vaultState] - optional parameter to pass the vault state directly; this will save a network call
   * @returns - void; prints the vault to the console
   */
  async printVault(vaultPubkey: Address, vaultState?: VaultState) {
    return this._vaultClient.printVault(vaultPubkey, vaultState);
  }

  /**
   * This will return an aggregation of the current state of the vault with all the invested amounts and the utilization ratio of the vault
   * @param vault - the kamino vault to get available liquidity to withdraw for
   * @param slot - current slot
   * @param vaultReserves - optional parameter; a hashmap from each reserve pubkey to the reserve state. If provided the function will be significantly faster as it will not have to fetch the reserves
   * @returns an VaultReserveTotalBorrowedAndInvested object with the total invested amount, total borrowed amount and the utilization ratio of the vault
   */
  async getTotalBorrowedAndInvested(
    vault: VaultState,
    slot: Slot,
    vaultReserves?: Map<Address, KaminoReserve>
  ): Promise<VaultReserveTotalBorrowedAndInvested> {
    return this._vaultClient.getTotalBorrowedAndInvested(vault, slot, vaultReserves);
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
   * @param slot - current slot
   * @param vaultReserves - optional parameter; a hashmap from each reserve pubkey to the reserve state. If provided the function will be significantly faster as it will not have to fetch the reserves
   * @returns a hashmap from vault reserve pubkey to ReserveOverview object
   */
  async getVaultReservesDetails(
    vault: VaultState,
    slot: Slot,
    vaultReserves?: Map<Address, KaminoReserve>
  ): Promise<Map<Address, ReserveOverview>> {
    return this._vaultClient.getVaultReservesDetails(vault, slot, vaultReserves);
  }

  /**
   * This will return the APY of the vault under the assumption that all the available tokens in the vault are all the time invested in the reserves as ratio; for percentage it needs multiplication by 100
   * @param vault - the kamino vault to get APY for
   * @param slot - current slot
   * @param [vaultReserves] - hashmap from each reserve pubkey to the reserve state. Optional. If provided the function will be significantly faster as it will not have to fetch the reserves
   * @returns a struct containing estimated gross APY and net APY (gross - vault fees) for the vault
   */
  async getVaultTheoreticalAPY(
    vault: VaultState,
    slot: Slot,
    vaultReserves?: Map<Address, KaminoReserve>
  ): Promise<APYs> {
    return this._vaultClient.getVaultTheoreticalAPY(vault, slot, vaultReserves);
  }

  /**
   * This will return the APY of the vault based on the current invested amounts; for percentage it needs multiplication by 100
   * @param vault - the kamino vault to get APY for
   * @param slot - current slot
   * @param [vaultReservesMap] - hashmap from each reserve pubkey to the reserve state. Optional. If provided the function will be significantly faster as it will not have to fetch the reserves
   * @returns a struct containing estimated gross APY and net APY (gross - vault fees) for the vault
   */
  async getVaultActualAPY(vault: VaultState, slot: Slot, vaultReserves?: Map<Address, KaminoReserve>): Promise<APYs> {
    return this._vaultClient.getVaultActualAPY(vault, slot, vaultReserves);
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
   * @param [vaultReservesMap] - hashmap from each reserve pubkey to the reserve state. Optional. If provided the function will be significantly faster as it will not have to fetch the reserves
   * @param [currentSlot] - the current slot. Optional. If not provided it will fetch the current slot
   * @param [previousTotalAUM] - the previous AUM of the vault to compute the earned interest relative to this value. Optional. If not provided the function will estimate the total AUM at the slot of the last state update on chain
   * @param [currentSlot] - the latest confirmed slot. Optional. If provided the function will be  faster as it will not have to fetch the latest slot
   * @returns a struct of simulated vault holdings and earned interest
   */
  async calculateSimulatedHoldingsWithInterest(
    vaultState: VaultState,
    vaultReserves?: Map<Address, KaminoReserve>,
    slot?: Slot,
    previousTotalAUM?: Decimal,
    currentSlot?: Slot
  ): Promise<SimulatedVaultHoldingsWithEarnedInterest> {
    return this._vaultClient.calculateSimulatedHoldingsWithInterest(
      vaultState,
      vaultReserves,
      slot,
      previousTotalAUM,
      currentSlot
    );
  }

  /** Read the total holdings of a vault and the reserve weights and returns a map from each reserve to how many tokens should be deposited.
   * @param vaultState - the vault state to calculate the allocation for
   * @param [slot] - the slot for which to calculate the allocation. Optional. If not provided the function will fetch the current slot
   * @param [vaultReserves] - a hashmap from each reserve pubkey to the reserve state. Optional. If provided the function will be significantly faster as it will not have to fetch the reserves
   * @param [currentSlot] - the latest confirmed slot. Optional. If provided the function will be  faster as it will not have to fetch the latest slot
   * @returns - a map from each reserve to how many tokens should be invested into
   */
  async getVaultComputedReservesAllocation(
    vaultState: VaultState,
    slot?: Slot,
    vaultReserves?: Map<Address, KaminoReserve>,
    currentSlot?: Slot
  ): Promise<VaultComputedAllocation> {
    return this._vaultClient.getVaultComputedReservesAllocation(vaultState, slot, vaultReserves, currentSlot);
  }

  /**
   * Simulate the current holdings and compute the fees that would be charged
   * @param vaultState the kamino vault state to get simulated fees for
   * @param simulatedCurrentHoldingsWithInterest optional; the simulated holdings and interest earned by the vault
   * @param [currentTimestamp] the current date. Optional. If not provided it will fetch the current unix timestamp
   * @returns a struct of simulated management and interest fees
   */
  async calculateSimulatedFees(
    vaultState: VaultState,
    simulatedCurrentHoldingsWithInterest?: SimulatedVaultHoldingsWithEarnedInterest,
    currentTimestamp?: Date
  ): Promise<VaultFees> {
    return this._vaultClient.calculateSimulatedFees(vaultState, simulatedCurrentHoldingsWithInterest, currentTimestamp);
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
   * @param [farmsClient] - the farms client to use. Optional. If not provided, the function will create a new one
   * @param [slot] - the slot to read the farm APY for. Optional. If not provided, the function will read the current slot
   * @returns the APY of the farm built on top of the vault
   */
  async getVaultFarmRewardsAPY(
    vault: KaminoVault,
    vaultTokenPrice: Decimal,
    farmsClient?: Farms,
    slot?: Slot
  ): Promise<FarmIncentives> {
    return this._vaultClient.getVaultRewardsAPY(vault, vaultTokenPrice, farmsClient, slot);
  }

  /**
   * Read the APY of the delegated farm providing incentives for vault depositors
   * @param vault - the vault to read the farm APY for
   * @param vaultTokenPrice - the price of the vault token in USD (e.g. 1.0 for USDC)
   * @param [farmsClient] - the farms client to use. Optional. If not provided, the function will create a new one
   * @param [slot] - the slot to read the farm APY for. Optional. If not provided, the function will read the current slot
   * @param [tokensPrices] - the prices of the tokens in USD. Optional. If not provided, the function will fetch the prices
   * @returns the APY of the delegated farm providing incentives for vault depositors
   */
  async getVaultDelegatedFarmRewardsAPY(
    vault: KaminoVault,
    vaultTokenPrice: Decimal,
    farmsClient?: Farms,
    slot?: Slot
  ): Promise<FarmIncentives> {
    return this._vaultClient.getVaultDelegatedFarmRewardsAPY(vault, vaultTokenPrice, farmsClient, slot);
  }

  /**
   * This will read the pending rewards for a user in the vault farm, the reserves farms of the vault and the delegated vault farm
   * @param user - the user address
   * @param vault - the vault
   * @param [vaultReservesMap] - the vault reserves map to get the reserves for; if not provided, the function will fetch the reserves
   * @returns a struct containing the pending rewards in the vault farm, the reserves farms of the vault and the delegated vault farm, and the total pending rewards in lamports
   */
  async getAllPendingRewardsForUserInVault(
    user: Address,
    vault: KaminoVault,
    vaultReservesMap?: Map<Address, KaminoReserve>
  ): Promise<PendingRewardsForUserInVault> {
    return this._vaultClient.getAllPendingRewardsForUserInVault(user, vault, vaultReservesMap);
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
    vaultReservesMap?: Map<Address, KaminoReserve>
  ): Promise<Instruction[]> {
    return this._vaultClient.getClaimAllRewardsForVaultIxs(user, vault, vaultReservesMap);
  }

  /**
   * This function will return the instructions to claim the rewards for the farm of a vault
   * @param user - the user to claim the rewards
   * @param vault - the vault
   * @returns the instructions to claim the rewards for the farm of the vault
   */
  async getClaimVaultFarmRewardsIxs(user: TransactionSigner, vault: KaminoVault): Promise<Instruction[]> {
    return this._vaultClient.getClaimVaultFarmRewardsIxs(user, vault);
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
   * @param [vaultReservesMap] - the vault reserves map to get the reserves for; if not provided, the function will fetch the reserves
   * @returns the instructions to claim the rewards for the reserves farms of the vault
   */
  async getClaimVaultReservesFarmsRewardsIxs(
    user: TransactionSigner,
    vault: KaminoVault,
    vaultReservesMap?: Map<Address, KaminoReserve>
  ): Promise<Instruction[]> {
    return this._vaultClient.getClaimVaultReservesFarmsRewardsIxs(user, vault, vaultReservesMap);
  }

  /**
   * Get all the token mints of the vault, vault farm rewards and the allocation  rewards
   * @param vaults - the vaults to get the token mints for
   * @param [vaultReservesMap] - the vault reserves map to get the reserves for; if not provided, the function will fetch the reserves
   * @param farmsMap - the farms map to get the farms for
   * @returns a set of token mints
   */
  async getAllVaultsTokenMintsIncludingRewards(
    vaults: KaminoVault[],
    vaultReservesMap?: Map<Address, KaminoReserve>,
    farmsMap?: Map<Address, FarmState>
  ) {
    return this._vaultClient.getAllVaultsTokenMintsIncludingRewards(vaults, vaultReservesMap, farmsMap);
  }

  /**
   * This will return the APY of the reserve farms (debt and supply)
   * @param reserve - the reserve to get the farms APY for
   * @param reserveTokenPrice - the price of the reserve token in USD (e.g. 1.0 for USDC)
   * @param [farmsClient] - the farms client to use. Optional. If not provided, the function will create a new one
   * @param [slot] - the slot to read the farm APY for. Optional. If not provided, the function will read the current slot
   * @param [reserveState] - the reserve state. Optional. If not provided, the function will fetch the reserve state
   * @returns the APY of the farm built on top of the reserve
   */
  async getReserveFarmRewardsAPY(
    reserve: Address,
    reserveTokenPrice: Decimal,
    farmsClient?: Farms,
    slot?: Slot,
    reserveState?: Reserve
  ): Promise<ReserveIncentives> {
    return getReserveFarmRewardsAPYUtils(
      this._rpc,
      this.recentSlotDurationMs,
      reserve,
      reserveTokenPrice,
      this._kaminoLendProgramId,
      farmsClient ? farmsClient : new Farms(this._rpc),
      slot ? slot : await this.getRpc().getSlot().send(),
      reserveState
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
   * @param vaultState - the vault state to load reserves for
   * @returns a hashmap from each reserve pubkey to the reserve state
   */
  getVaultReserves(vault: VaultState): Address[] {
    return this._vaultClient.getVaultReserves(vault);
  }

  /**
   * This will retrieve all the tokens that can be use as collateral by the users who borrow the token in the vault alongside details about the min and max loan to value ratio
   * @param vaultState - the vault state to load reserves for
   *
   * @returns a hashmap from each reserve pubkey to the market overview of the collaterals that can be used and the min and max loan to value ratio in that market
   */
  async getVaultCollaterals(
    vaultState: VaultState,
    slot: Slot,
    vaultReservesMap?: Map<Address, KaminoReserve>,
    kaminoMarkets?: KaminoMarket[]
  ): Promise<Map<Address, MarketOverview>> {
    return this._vaultClient.getVaultCollaterals(vaultState, slot, vaultReservesMap, kaminoMarkets);
  }

  /**
   * This will trigger invest by balancing, based on weights, the reserve allocations of the vault. It can either withdraw or deposit into reserves to balance them. This is a function that should be cranked
   * @param payer
   * @param kaminoVault - vault to invest from
   * @param skipComputationChecks - if true, the function will skip the computation checks and will invest all the reserves
   * @returns - an array of invest instructions for each invest action required for the vault reserves
   */
  async investAllReservesIxs(
    payer: TransactionSigner,
    kaminoVault: KaminoVault,
    skipComputationChecks: boolean = false
  ): Promise<Instruction[]> {
    return this._vaultClient.investAllReservesIxs(payer, kaminoVault, skipComputationChecks);
  }

  /**
   * This will trigger invest by balancing, based on weights, the reserve allocation of the vault. It can either withdraw or deposit into the given reserve to balance it
   * @param payer wallet pubkey - the instruction is permissionless and does not require the vault admin, due to rounding between cTokens and the underlying, the payer may have to contribute 1 or more lamports of the underlying from their token account
   * @param kaminoVault - vault to invest from
   * @param reserveWithAddress - reserve to invest into or disinvest from
   * @param [vaultReservesMap] - optional parameter; a hashmap from each reserve pubkey to the reserve state. If provided the function will be significantly faster as it will not have to fetch the reserves
   * @returns - an array of invest instructions for each invest action required for the vault reserves
   */
  async investSingleReserveIxs(
    payer: TransactionSigner,
    kaminoVault: KaminoVault,
    reserveWithAddress: ReserveWithAddress,
    vaultReservesMap?: Map<Address, KaminoReserve>
  ): Promise<Instruction[]> {
    return this._vaultClient.investSingleReserveIxs(payer, kaminoVault, reserveWithAddress, vaultReservesMap);
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
   * @param vault - the kamino vault to get invested amount in reserve for
   * @param slot - current slot
   * @param reserve - the reserve state to get vault invested amount in
   * @returns vault amount supplied in reserve in decimal
   */
  getSuppliedInReserve(vaultState: VaultState, slot: Slot, reserve: KaminoReserve): Decimal {
    return this._vaultClient.getSuppliedInReserve(vaultState, slot, reserve);
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
    };
    return updateLendingMarketOwner(accounts, undefined, this._kaminoLendProgramId);
  }

  /**
   * This will check if the given wallet is a squads multisig
   * @param wallet - the wallet to check
   * @returns true if the wallet is a squads multisig, false otherwise
   */
  static async walletIsSquadsMultisig(wallet: Address) {
    return walletIsSquadsMultisig(wallet);
  }

  /**
   * This will get the wallet type, admins number and threshold for the given authority
   * @param rpc - the rpc to use
   * @param address - the address to get the wallet info for
   * @returns the wallet type, admins number and threshold
   */
  static async getMarketOrVaultAdminInfo(
    rpc: Rpc<GetAccountInfoApi>,
    address: Address
  ): Promise<WalletType | undefined> {
    try {
      // Try to fetch vault state first
      const vaultState = await VaultState.fetch(rpc, address);
      if (!vaultState) {
        throw new Error('Vault not found');
      }
      return await KaminoManager.getWalletInfo(rpc, vaultState.vaultAdminAuthority);
    } catch (error) {
      // If vault not found, try to fetch market state
      const market = await LendingMarket.fetch(rpc, address);
      if (!market) {
        return undefined;
      }
      return await KaminoManager.getWalletInfo(rpc, market.lendingMarketOwner);
    }
  }

  /**
   * Helper method to get wallet information for a given authority
   */
  private static async getWalletInfo(connection: Rpc<GetAccountInfoApi>, authority: Address): Promise<WalletType> {
    const isSquadsMultisig = await KaminoManager.walletIsSquadsMultisig(authority);
    let walletAdminsNumber = 1;
    let walletThreshold = 1;

    if (isSquadsMultisig) {
      const { adminsNumber, threshold } = await getSquadsMultisigAdminsAndThreshold(authority);
      walletAdminsNumber = adminsNumber;
      walletThreshold = threshold;
    }

    return {
      walletType: isSquadsMultisig ? 'squadsMultisig' : 'simpleWallet',
      walletAdminsNumber,
      walletThreshold,
    };
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
  [UpdateLendingMarketMode.UpdateRiskCouncil.kind]: config.riskCouncil,
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
}));

function parseForChangesMarketConfigAndGetIxs(
  lendingMarketOwner: TransactionSigner,
  marketWithAddress: MarketWithAddress,
  newMarket: LendingMarket,
  programId: Address
): Instruction[] {
  const encodedMarketUpdates = MARKET_UPDATER.encodeAllUpdates(marketWithAddress.state, newMarket);
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
    lendingMarketOwner,
    lendingMarket: marketWithAddress.address,
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
