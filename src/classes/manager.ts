import {
  AccountInfo,
  Connection,
  GetProgramAccountsResponse,
  Keypair,
  ParsedAccountData,
  PublicKey,
  SystemProgram,
  SYSVAR_RENT_PUBKEY,
  TransactionInstruction,
} from '@solana/web3.js';
import {
  KaminoVault,
  KaminoVaultClient,
  KaminoVaultConfig,
  kaminoVaultId,
  MarketOverview,
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
  assertNever,
  CreateKaminoMarketParams,
  createReserveIxs,
  ENV,
  getAllLendingMarketAccounts,
  getAllOracleAccounts,
  getAllReserveAccounts,
  getMedianSlotDurationInMsFromLastEpochs,
  getReserveOracleConfigs,
  getTokenOracleDataSync,
  initLendingMarket,
  InitLendingMarketAccounts,
  InitLendingMarketArgs,
  KaminoMarket,
  KaminoReserve,
  LendingMarket,
  lendingMarketAuthPda,
  LendingMarketFields,
  MarketWithAddress,
  parseForChangesReserveConfigAndGetIxs,
  parseOracleType,
  parseTokenSymbol,
  PubkeyHashMap,
  Reserve,
  ReserveWithAddress,
  sameLengthArrayEquals,
  ScopeOracleConfig,
  updateEntireReserveConfigIx,
  updateLendingMarket,
  UpdateLendingMarketAccounts,
  UpdateLendingMarketArgs,
  updateLendingMarketOwner,
  UpdateLendingMarketOwnerAccounts,
} from '../lib';
import { PROGRAM_ID } from '../idl_codegen/programId';
import { Scope, TokenMetadatas, U16_MAX } from '@kamino-finance/scope-sdk';
import BN from 'bn.js';
import {
  ElevationGroup,
  ReserveConfig,
  UpdateLendingMarketMode,
  UpdateLendingMarketModeKind,
} from '../idl_codegen/types';
import Decimal from 'decimal.js';
import * as anchor from '@coral-xyz/anchor';
import { VaultState } from '../idl_codegen_kamino_vault/accounts';
import { TOKEN_PROGRAM_ID } from '@solana/spl-token';
import { Data } from '@kamino-finance/kliquidity-sdk';
import bs58 from 'bs58';
import { getProgramAccounts } from '../utils/rpc';
import { VaultConfigField, VaultConfigFieldKind } from '../idl_codegen_kamino_vault/types';
import {
  AcceptVaultOwnershipIxs,
  APYs,
  DepositIxs,
  InitVaultIxs,
  ReserveAllocationOverview,
  SyncVaultLUTIxs,
  UpdateReserveAllocationIxs,
  UpdateVaultConfigIxs,
  UserSharesForVault,
  WithdrawIxs,
} from './vault_types';
import { FarmState } from '@kamino-finance/farms-sdk/dist';
import SwitchboardProgram from '@switchboard-xyz/sbv2-lite';

/**
 * KaminoManager is a class that provides a high-level interface to interact with the Kamino Lend and Kamino Vault programs, in order to create and manage a market, as well as vaults
 */
export class KaminoManager {
  private readonly _connection: Connection;
  private readonly _kaminoVaultProgramId: PublicKey;
  private readonly _kaminoLendProgramId: PublicKey;
  private readonly _vaultClient: KaminoVaultClient;
  recentSlotDurationMs: number;

  constructor(
    connection: Connection,
    recentSlotDurationMs: number,
    kaminoLendProgramId?: PublicKey,
    kaminoVaultProgramId?: PublicKey
  ) {
    this._connection = connection;
    this.recentSlotDurationMs = recentSlotDurationMs;
    this._kaminoVaultProgramId = kaminoVaultProgramId ? kaminoVaultProgramId : kaminoVaultId;
    this._kaminoLendProgramId = kaminoLendProgramId ? kaminoLendProgramId : PROGRAM_ID;
    this._vaultClient = new KaminoVaultClient(
      connection,
      this.recentSlotDurationMs,
      this._kaminoVaultProgramId,
      this._kaminoLendProgramId
    );
  }

  getConnection() {
    return this._connection;
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
  async createMarketIxs(params: CreateKaminoMarketParams): Promise<{ market: Keypair; ixs: TransactionInstruction[] }> {
    const marketAccount = Keypair.generate();
    const size = LendingMarket.layout.span + 8;
    const [lendingMarketAuthority, _] = lendingMarketAuthPda(marketAccount.publicKey, this._kaminoLendProgramId);
    const createMarketIxs: TransactionInstruction[] = [];

    createMarketIxs.push(
      SystemProgram.createAccount({
        fromPubkey: params.admin,
        newAccountPubkey: marketAccount.publicKey,
        lamports: await this._connection.getMinimumBalanceForRentExemption(size),
        space: size,
        programId: this._kaminoLendProgramId,
      })
    );

    const accounts: InitLendingMarketAccounts = {
      lendingMarketOwner: params.admin,
      lendingMarket: marketAccount.publicKey,
      lendingMarketAuthority: lendingMarketAuthority,
      systemProgram: SystemProgram.programId,
      rent: SYSVAR_RENT_PUBKEY,
    };

    const args: InitLendingMarketArgs = {
      quoteCurrency: Array(32).fill(0),
    };

    createMarketIxs.push(initLendingMarket(args, accounts, this._kaminoLendProgramId));

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
  ): Promise<{ reserve: Keypair; txnIxs: TransactionInstruction[][] }> {
    const market = await LendingMarket.fetch(this._connection, params.marketAddress, this._kaminoLendProgramId);
    if (!market) {
      throw new Error('Market not found');
    }
    const marketWithAddress: MarketWithAddress = { address: params.marketAddress, state: market };

    const reserveAccount = Keypair.generate();

    const createReserveInstructions = await createReserveIxs(
      this._connection,
      params.admin,
      params.adminLiquiditySource,
      params.marketAddress,
      params.assetConfig.mint,
      reserveAccount.publicKey,
      this._kaminoLendProgramId
    );

    const updateReserveInstructions = await this.updateReserveIxs(
      marketWithAddress,
      reserveAccount.publicKey,
      params.assetConfig.getReserveConfig(),
      undefined,
      false
    );

    const txnIxs: TransactionInstruction[][] = [];
    txnIxs.push(createReserveInstructions);
    txnIxs.push(updateReserveInstructions);

    return { reserve: reserveAccount, txnIxs };
  }

  /**
   * This method will create a vault with a given config. The config can be changed later on, but it is recommended to set it up correctly from the start
   * @param vaultConfig - the config object used to create a vault
   * @returns vault: the keypair of the vault, used to sign the initialization transaction; initVaultIxs: a struct with ixs to initialize the vault and its lookup table + populateLUTIxs, a list to populate the lookup table which has to be executed in a separate transaction
   */
  async createVaultIxs(vaultConfig: KaminoVaultConfig): Promise<{ vault: Keypair; initVaultIxs: InitVaultIxs }> {
    return this._vaultClient.createVaultIxs(vaultConfig);
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
    signer?: PublicKey
  ): Promise<UpdateReserveAllocationIxs> {
    return this._vaultClient.updateReserveAllocationIxs(vault, reserveAllocationConfig, signer);
  }

  /**
   * This method removes a reserve from the vault allocation strategy if already part of the allocation strategy
   * @param vault - vault to remove the reserve from
   * @param reserve - reserve to remove from the vault allocation strategy
   * @returns - an instruction to remove the reserve from the vault allocation strategy or undefined if the reserve is not part of the allocation strategy
   */
  async removeReserveFromAllocationIx(
    vault: KaminoVault,
    reserve: PublicKey
  ): Promise<TransactionInstruction | undefined> {
    return this._vaultClient.removeReserveFromAllocationIx(vault, reserve);
  }

  // async closeVault(vault: KaminoVault): Promise<TransactionInstruction> {
  //   return this._vaultClient.closeVaultIx(vault);
  // }

  /**
   * This method retruns the reserve config for a given reserve
   * @param reserve - reserve to get the config for
   * @returns - the reserve config
   */
  async getReserveConfig(reserve: PublicKey): Promise<ReserveConfig> {
    const reserveState = await Reserve.fetch(this._connection, reserve);
    if (!reserveState) {
      throw new Error('Reserve not found');
    }
    return reserveState.config;
  }

  /**
   * This function enables the update of the scope oracle configuration. In order to get a list of scope prices, getScopeOracleConfigs can be used
   * @param market - lending market which owns the reserve
   * @param reserve - reserve which to be updated
   * @param scopeOracleConfig - new scope oracle config
   * @param scopeTwapConfig - new scope twap config
   * @param maxAgeBufferSeconds - buffer to be added to onchain max_age - if oracle price is older than that, txns interacting with the reserve will fail
   * @returns - an array of instructions used update the oracle configuration
   */
  async updateReserveScopeOracleConfigurationIxs(
    market: MarketWithAddress,
    reserve: ReserveWithAddress,
    scopeOracleConfig: ScopeOracleConfig,
    scopeTwapConfig?: ScopeOracleConfig,
    maxAgeBufferSeconds: number = 20
  ): Promise<TransactionInstruction[]> {
    const reserveConfig = reserve.state.config;

    let scopeTwapId = U16_MAX;
    if (scopeTwapConfig) {
      scopeTwapId = scopeTwapConfig.oracleId;

      // if(scopeTwapConfig.twapSourceId !== scopeOracleConfig.oracleId) {
      //   throw new Error('Twap source id must match oracle id');
      // }
    }

    const { scopeConfiguration } = getReserveOracleConfigs({
      scopePriceConfigAddress: scopeOracleConfig.scopePriceConfigAddress,
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

    return this.updateReserveIxs(market, reserve.address, newReserveConfig, reserve.state);
  }

  /**
   * This function updates the given reserve with a new config. It can either update the entire reserve config or just update fields which differ between given reserve and existing reserve
   * @param marketWithAddress - the market that owns the reserve to be updated
   * @param reserve - the reserve to be updated
   * @param config - the new reserve configuration to be used for the update
   * @param reserveStateOverride - the reserve state, useful to provide, if already fetched outside this method, in order to avoid an extra rpc call to fetch it. Make sure the reserveConfig has not been updated since fetching the reserveState that you pass in.
   * @param updateEntireConfig - when set to false, it will only update fields that are different between @param config and reserveState.config, set to true it will always update entire reserve config. An entire reserveConfig update might be too large for a multisig transaction
   * @returns - an array of multiple update ixs. If there are many fields that are being updated without the updateEntireConfig=true, multiple transactions might be required to fit all ixs.
   */
  async updateReserveIxs(
    marketWithAddress: MarketWithAddress,
    reserve: PublicKey,
    config: ReserveConfig,
    reserveStateOverride?: Reserve,
    updateEntireConfig: boolean = false
  ): Promise<TransactionInstruction[]> {
    const reserveState = reserveStateOverride
      ? reserveStateOverride
      : (await Reserve.fetch(this._connection, reserve, this._kaminoLendProgramId))!;
    const ixs: TransactionInstruction[] = [];

    if (!reserveState || updateEntireConfig) {
      ixs.push(updateEntireReserveConfigIx(marketWithAddress, reserve, config, this._kaminoLendProgramId));
    } else {
      ixs.push(
        ...parseForChangesReserveConfigAndGetIxs(
          marketWithAddress,
          reserveState,
          reserve,
          config,
          this._kaminoLendProgramId
        )
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
    user: PublicKey,
    vault: KaminoVault,
    tokenAmount: Decimal,
    vaultReservesMap?: PubkeyHashMap<PublicKey, KaminoReserve>,
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
    user: PublicKey,
    vault: KaminoVault,
    sharesAmount?: Decimal,
    farmState?: FarmState
  ): Promise<TransactionInstruction[]> {
    return this._vaultClient.stakeSharesIxs(user, vault, sharesAmount, farmState);
  }

  /**
   * Update a field of the vault. If the field is a pubkey it will return an extra instruction to add that account into the lookup table
   * @param vault the vault to update
   * @param mode the field to update (based on VaultConfigFieldKind enum)
   * @param value the value to update the field with
   * @param [signer] the signer of the transaction. Optional. If not provided the admin of the vault will be used. It should be used when changing the admin of the vault if we want to build or batch multiple ixs in the same tx
   * @returns a struct that contains the instruction to update the field and an optional list of instructions to update the lookup table
   */
  async updateVaultConfigIxs(
    vault: KaminoVault,
    mode: VaultConfigFieldKind | string,
    value: string,
    signer?: PublicKey
  ): Promise<UpdateVaultConfigIxs> {
    if (typeof mode === 'string') {
      const field = VaultConfigField.fromDecoded({ [mode]: '' });
      return this._vaultClient.updateVaultConfigIxs(vault, field, value, signer);
    }

    return this._vaultClient.updateVaultConfigIxs(vault, mode, value, signer);
  }

  /** Sets the farm where the shares can be staked. This is store in vault state and a vault can only have one farm, so the new farm will ovveride the old farm
   * @param vault - vault to set the farm for
   * @param farm - the farm where the vault shares can be staked
   * @param [errorOnOverride] - if true, the function will throw an error if the vault already has a farm. If false, it will override the farm
   */
  async setVaultFarmIxs(
    vault: KaminoVault,
    farm: PublicKey,
    errorOnOverride: boolean = true
  ): Promise<UpdateVaultConfigIxs> {
    return this._vaultClient.setVaultFarmIxs(vault, farm, errorOnOverride);
  }

  /**
   * This function creates the instruction for the `pendingAdmin` of the vault to accept to become the owner of the vault (step 2/2 of the ownership transfer)
   * @param vault - vault to change the ownership for
   * @returns - an instruction to accept the ownership of the vault and a list of instructions to update the lookup table
   */
  async acceptVaultOwnershipIxs(vault: KaminoVault): Promise<AcceptVaultOwnershipIxs> {
    return this._vaultClient.acceptVaultOwnershipIxs(vault);
  }

  /**
   * This function creates the instruction for the admin to give up a part of the pending fees (which will be accounted as part of the vault)
   * @param vault - vault to give up pending fees for
   * @param maxAmountToGiveUp - the maximum amount of fees to give up, in tokens
   * @returns - an instruction to give up the specified pending fees
   */
  async giveUpPendingFeesIx(vault: KaminoVault, maxAmountToGiveUp: Decimal): Promise<TransactionInstruction> {
    return this._vaultClient.giveUpPendingFeesIx(vault, maxAmountToGiveUp);
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
    user: PublicKey,
    vault: KaminoVault,
    shareAmount: Decimal,
    slot: number,
    vaultReservesMap?: PubkeyHashMap<PublicKey, KaminoReserve>,
    farmState?: FarmState
  ): Promise<WithdrawIxs> {
    return this._vaultClient.withdrawIxs(user, vault, shareAmount, slot, vaultReservesMap, farmState);
  }

  /**
   * This method withdraws all the pending fees from the vault to the owner's token ATA
   * @param vault - vault for which the admin withdraws the pending fees
   * @param slot - current slot, used to estimate the interest earned in the different reserves with allocation from the vault
   * @param [vaultReservesMap] - a hashmap from each reserve pubkey to the reserve state. Optional. If provided the function will be significantly faster as it will not have to fetch the reserves
   * @returns - list of instructions to withdraw all pending fees, including the ATA creation instructions if needed
   */
  async withdrawPendingFeesIxs(vault: KaminoVault, slot: number): Promise<TransactionInstruction[]> {
    return this._vaultClient.withdrawPendingFeesIxs(vault, slot);
  }

  /**
   * This method inserts the missing keys from the provided keys into an existent lookup table
   * @param payer - payer wallet pubkey
   * @param lookupTable - lookup table to insert the keys into
   * @param keys - keys to insert into the lookup table
   * @param [accountsInLUT] - the existent accounts in the lookup table. Optional. If provided, the function will not fetch the accounts in the lookup table
   * @returns - an array of instructions to insert the missing keys into the lookup table
   */
  async insertIntoLUTIxs(
    payer: PublicKey,
    lut: PublicKey,
    keys: PublicKey[],
    accountsInLUT?: PublicKey[]
  ): Promise<TransactionInstruction[]> {
    return this._vaultClient.insertIntoLookupTableIxs(payer, lut, keys, accountsInLUT);
  }

  /**
   * Sync a vault for lookup table; create and set the LUT for the vault if needed and fill it with all the needed accounts
   * @param vault the vault to sync and set the LUT for if needed
   * @param vaultReserves optional; the state of the reserves in the vault allocation
   * @param [vaultReservesMap] - optional parameter; a hashmap from each reserve pubkey to the reserve state. Optional. If provided the function will be significantly faster as it will not have to fetch the reserves
   * @returns a struct that contains a list of ix to create the LUT and assign it to the vault if needed + a list of ixs to insert all the accounts in the LUT
   */
  async syncVaultLUTIxs(
    vault: KaminoVault,
    vaultReserves?: PubkeyHashMap<PublicKey, KaminoReserve>
  ): Promise<SyncVaultLUTIxs> {
    return this._vaultClient.syncVaultLookupTableIxs(vault, vaultReserves);
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
    slot?: number,
    vaultReservesMap?: PubkeyHashMap<PublicKey, KaminoReserve>,
    currentSlot?: number
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
    slot?: number,
    vaultReservesMap?: PubkeyHashMap<PublicKey, KaminoReserve>,
    currentSlot?: number
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
  async getUserSharesBalanceSingleVault(user: PublicKey, vault: KaminoVault): Promise<UserSharesForVault> {
    return this._vaultClient.getUserSharesBalanceSingleVault(user, vault);
  }

  /**
   * This method returns the user shares balance for all existing vaults
   * @param user - user to calculate the shares balance for
   * @param vaultsOverride - the kamino vaults if already fetched, in order to reduce rpc calls
   * @returns - hash map with keyh as vault address and value as user share balance in decimal (not lamports)
   */
  async getUserSharesBalanceAllVaults(
    user: PublicKey,
    vaultsOverride?: KaminoVault[]
  ): Promise<PubkeyHashMap<PublicKey, UserSharesForVault>> {
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
   * @param vault - vault to retrieve the onchain name for
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
  async getAllMarkets(): Promise<KaminoMarket[]> {
    // Get all lending markets
    const marketGenerator = getAllLendingMarketAccounts(this.getConnection());
    const slotDuration = await getMedianSlotDurationInMsFromLastEpochs();

    const lendingMarketPairs: [PublicKey, LendingMarket][] = [];
    for await (const pair of marketGenerator) {
      lendingMarketPairs.push(pair);
    }

    // Get all reserves
    const allReserveAccounts = await getAllReserveAccounts(this.getConnection());
    const reservePairs: [PublicKey, Reserve, AccountInfo<Buffer>][] = [];
    for await (const pair of allReserveAccounts) {
      reservePairs.push(pair);
    }
    const allReserves = reservePairs.map(([, reserve]) => reserve);

    // Get all oracle accounts
    const allOracleAccounts = await getAllOracleAccounts(this.getConnection(), allReserves);
    const switchboardV2 = await SwitchboardProgram.loadMainnet(this.getConnection());

    // Group reserves by market
    const marketToReserve = new PubkeyHashMap<PublicKey, [PublicKey, Reserve, AccountInfo<Buffer>][]>();
    for (const [reserveAddress, reserveState, buffer] of reservePairs) {
      const marketAddress = reserveState.lendingMarket;
      if (!marketToReserve.has(marketAddress)) {
        marketToReserve.set(marketAddress, [[reserveAddress, reserveState, buffer]]);
      } else {
        marketToReserve.get(marketAddress)?.push([reserveAddress, reserveState, buffer]);
      }
    }

    const combinedMarkets = lendingMarketPairs.map(([pubkey, market]) => {
      const reserves = marketToReserve.get(pubkey);
      const reservesByAddress = new PubkeyHashMap<PublicKey, KaminoReserve>();
      if (!reserves) {
        console.log(`Market ${pubkey.toString()} ${parseTokenSymbol(market.name)} has no reserves`);
      } else {
        const allBuffers = reserves.map(([, , account]) => account);
        const allReserves = reserves.map(([, reserve]) => reserve);
        const reservesAndOracles = getTokenOracleDataSync(allOracleAccounts, switchboardV2, allReserves);
        reservesAndOracles.forEach(([reserve, oracle], index) => {
          if (!oracle) {
            console.log('Manager > getAllMarkets: oracle not found for reserve', reserve.config.tokenInfo.name);
            return;
          }

          const kaminoReserve = KaminoReserve.initialize(
            allBuffers[index],
            reserves[index][0],
            reserves[index][1],
            oracle,
            this.getConnection(),
            this.recentSlotDurationMs
          );
          reservesByAddress.set(kaminoReserve.address, kaminoReserve);
        });
      }

      return KaminoMarket.loadWithReserves(this.getConnection(), market, reservesByAddress, pubkey, slotDuration);
    });

    return combinedMarkets;
  }

  /**
   * Get all vaults for owner
   * @param owner the pubkey of the vaults owner
   * @returns an array of all vaults owned by a given pubkey
   */
  async getAllVaultsForOwner(owner: PublicKey): Promise<KaminoVault[]> {
    const filters = [
      {
        dataSize: VaultState.layout.span + 8,
      },
      {
        memcmp: {
          offset: 0,
          bytes: bs58.encode(VaultState.discriminator),
        },
      },
      {
        memcmp: {
          offset: 8,
          bytes: owner.toBase58(),
        },
      },
    ];

    const kaminoVaults: GetProgramAccountsResponse = await getProgramAccounts(
      this._connection,
      this._kaminoVaultProgramId,
      VaultState.layout.span + 8,
      {
        commitment: this._connection.commitment ?? 'processed',
        filters,
      }
    );

    return kaminoVaults.map((kaminoVault) => {
      if (kaminoVault.account === null) {
        throw new Error(`kaminoVault with pubkey ${kaminoVault.pubkey.toString()} does not exist`);
      }

      const kaminoVaultAccount = VaultState.decode(kaminoVault.account.data);
      if (!kaminoVaultAccount) {
        throw Error(`kaminoVault with pubkey ${kaminoVault.pubkey.toString()} could not be decoded`);
      }

      return new KaminoVault(kaminoVault.pubkey, kaminoVaultAccount, this._kaminoVaultProgramId);
    });
  }

  /**
   * Get a list of kaminoVaults
   * @param vaults - a list of vaults to get the states for; if not provided, all vaults will be fetched
   * @returns a list of KaminoVaults
   */
  async getVaults(vaults?: Array<PublicKey>): Promise<Array<KaminoVault | null>> {
    return this._vaultClient.getVaults(vaults);
  }

  /**
   * Get all token accounts that hold shares for a specific share mint
   * @param shareMint
   * @returns an array of all holders tokenAccounts pubkeys and their account info
   */
  async getShareTokenAccounts(
    shareMint: PublicKey
  ): Promise<{ pubkey: PublicKey; account: AccountInfo<Buffer | ParsedAccountData> }[]> {
    //how to get all token accounts for specific mint: https://spl.solana.com/token#finding-all-token-accounts-for-a-specific-mint
    //get it from the hardcoded token program and create a filter with the actual mint address
    //datasize:165 filter selects all token accounts, memcmp filter selects based on the mint address withing each token account
    return this._connection.getParsedProgramAccounts(TOKEN_PROGRAM_ID, {
      filters: [{ dataSize: 165 }, { memcmp: { offset: 0, bytes: shareMint.toBase58() } }],
    });
  }

  /**
   * Get all token accounts that hold shares for a specific vault; if you already have the vault state use it in the param so you don't have to fetch it again
   * @param vault
   * @returns an array of all holders tokenAccounts pubkeys and their account info
   */
  async getVaultTokenAccounts(
    vault: KaminoVault
  ): Promise<{ pubkey: PublicKey; account: AccountInfo<Buffer | ParsedAccountData> }[]> {
    const vaultState = await vault.getState(this._connection);
    return this.getShareTokenAccounts(vaultState.sharesMint);
  }

  /**
   * Get all vault token holders
   * @param vault
   * @returns an array of all vault holders with their pubkeys and amounts
   */
  getVaultHolders = async (vault: KaminoVault): Promise<VaultHolder[]> => {
    await vault.getState(this._connection);
    const tokenAccounts = await this.getVaultTokenAccounts(vault);
    const result: VaultHolder[] = [];
    for (const tokenAccount of tokenAccounts) {
      const accountData = tokenAccount.account.data as Data;
      result.push({
        holderPubkey: new PublicKey(accountData.parsed.info.owner),
        amount: new Decimal(accountData.parsed.info.tokenAmount.uiAmountString),
      });
    }
    return result;
  };

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
    slot?: number,
    vaultReserves?: PubkeyHashMap<PublicKey, KaminoReserve>,
    currentSlot?: number
  ): Promise<VaultHoldings> {
    return this._vaultClient.getVaultHoldings(vault, slot, vaultReserves, currentSlot);
  }

  /**
   * This will return an VaultHoldingsWithUSDValue object which contains an holdings field representing the amount available (uninvested) in vault, total amount invested in reseves and a breakdown of the amount invested in each reserve and additional fields for the total USD value of the available and invested amounts
   * @param vault - the kamino vault to get available liquidity to withdraw for
   * @param price - the price of the token in the vault (e.g. USDC)
   * @param [slot] - the slot for which to calculate the holdings. Optional. If not provided the function will fetch the current slot
   * @param [vaultReservesMap] - hashmap from each reserve pubkey to the reserve state. Optional. If provided the function will be significantly faster as it will not have to fetch the reserves
   * @param [currentSlot] - the latest confirmed slot. Optional. If provided the function will be  faster as it will not have to fetch the latest slot
   * @returns an VaultHoldingsWithUSDValue object with details about the tokens available and invested in the vault, denominated in tokens and USD
   */
  async getVaultHoldingsWithPrice(
    vault: VaultState,
    price: Decimal,
    slot?: number,
    vaultReserves?: PubkeyHashMap<PublicKey, KaminoReserve>,
    currentSlot?: number
  ): Promise<VaultHoldingsWithUSDValue> {
    return this._vaultClient.getVaultHoldingsWithPrice(vault, price, slot, vaultReserves, currentSlot);
  }

  /**
   * This will return an VaultOverview object that encapsulates all the information about the vault, including the holdings, reserves details, theoretical APY, utilization ratio and total borrowed amount
   * @param vault - the kamino vault to get available liquidity to withdraw for
   * @param price - the price of the token in the vault (e.g. USDC)
   * @param [slot] - the slot for which to retrieve the vault overview for. Optional. If not provided the function will fetch the current slot
   * @param [vaultReservesMap] - hashmap from each reserve pubkey to the reserve state. Optional. If provided the function will be significantly faster as it will not have to fetch the reserves
   * @param [kaminoMarkets] - a list of all kamino markets. Optional. If provided the function will be significantly faster as it will not have to fetch the markets
   * @param [currentSlot] - the latest confirmed slot. Optional. If provided the function will be  faster as it will not have to fetch the latest slot
   * @returns an VaultOverview object with details about the tokens available and invested in the vault, denominated in tokens and USD
   */
  async getVaultOverview(
    vault: VaultState,
    price: Decimal,
    slot?: number,
    vaultReserves?: PubkeyHashMap<PublicKey, KaminoReserve>,
    kaminoMarkets?: KaminoMarket[],
    currentSlot?: number
  ): Promise<VaultOverview> {
    return this._vaultClient.getVaultOverview(vault, price, slot, vaultReserves, kaminoMarkets, currentSlot);
  }

  /**
   * Prints a vault in a human readable form
   * @param vaultPubkey - the address of the vault
   * @param [vaultState] - optional parameter to pass the vault state directly; this will save a network call
   * @returns - void; prints the vault to the console
   */
  async printVault(vaultPubkey: PublicKey, vaultState?: VaultState) {
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
    slot: number,
    vaultReserves?: PubkeyHashMap<PublicKey, KaminoReserve>
  ): Promise<VaultReserveTotalBorrowedAndInvested> {
    return this._vaultClient.getTotalBorrowedAndInvested(vault, slot, vaultReserves);
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
    slot: number,
    vaultReserves?: PubkeyHashMap<PublicKey, KaminoReserve>
  ): Promise<PubkeyHashMap<PublicKey, ReserveOverview>> {
    return this._vaultClient.getVaultReservesDetails(vault, slot, vaultReserves);
  }

  /**
   * This will return the APY of the vault under the assumption that all the available tokens in the vault are all the time invested in the reserves as ratio; for percentage it needs multiplication by 100
   * @param vault - the kamino vault to get APY for
   * @param slot - current slot
   * @param [vaultReservesMap] - hashmap from each reserve pubkey to the reserve state. Optional. If provided the function will be significantly faster as it will not have to fetch the reserves
   * @returns a struct containing estimated gross APY and net APY (gross - vault fees) for the vault
   */
  async getVaultTheoreticalAPY(
    vault: VaultState,
    slot: number,
    vaultReserves?: PubkeyHashMap<PublicKey, KaminoReserve>
  ): Promise<APYs> {
    return this._vaultClient.getVaultTheoreticalAPY(vault, slot, vaultReserves);
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
    vaultReserves?: PubkeyHashMap<PublicKey, KaminoReserve>,
    slot?: number,
    previousTotalAUM?: Decimal,
    currentSlot?: number
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
    slot?: number,
    vaultReserves?: PubkeyHashMap<PublicKey, KaminoReserve>,
    currentSlot?: number
  ): Promise<PubkeyHashMap<PublicKey, Decimal>> {
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
   * This will load the onchain state for all the reserves that the vault has allocations for
   * @param vaultState - the vault state to load reserves for
   * @returns a hashmap from each reserve pubkey to the reserve state
   */
  async loadVaultReserves(vaultState: VaultState): Promise<PubkeyHashMap<PublicKey, KaminoReserve>> {
    return this._vaultClient.loadVaultReserves(vaultState);
  }

  /**
   * This will load the onchain state for all the reserves that the vaults have allocations for, deduplicating the reserves
   * @param vaults - the vault states to load reserves for
   * @returns a hashmap from each reserve pubkey to the reserve state
   */
  async loadVaultsReserves(vaults: VaultState[]): Promise<PubkeyHashMap<PublicKey, KaminoReserve>> {
    return this._vaultClient.loadVaultsReserves(vaults);
  }

  /**
   * This will load the onchain state for all the reserves that the vault has allocations for
   * @param vaultState - the vault state to load reserves for
   * @returns a hashmap from each reserve pubkey to the reserve state
   */
  getVaultReserves(vault: VaultState): PublicKey[] {
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
    slot: number,
    vaultReservesMap?: PubkeyHashMap<PublicKey, KaminoReserve>,
    kaminoMarkets?: KaminoMarket[]
  ): Promise<PubkeyHashMap<PublicKey, MarketOverview>> {
    return this._vaultClient.getVaultCollaterals(vaultState, slot, vaultReservesMap, kaminoMarkets);
  }

  /**
   * This will trigger invest by balancing, based on weights, the reserve allocations of the vault. It can either withdraw or deposit into reserves to balance them. This is a function that should be cranked
   * @param kaminoVault - vault to invest from
   * @returns - an array of invest instructions for each invest action required for the vault reserves
   */
  async investAllReservesIxs(payer: PublicKey, kaminoVault: KaminoVault): Promise<TransactionInstruction[]> {
    return this._vaultClient.investAllReservesIxs(payer, kaminoVault);
  }

  /**
   * This will trigger invest by balancing, based on weights, the reserve allocation of the vault. It can either withdraw or deposit into the given reserve to balance it
   * @param payer wallet pubkey
   * @param vault - vault to invest from
   * @param reserve - reserve to invest into or disinvest from
   * @param [vaultReservesMap] - optional parameter; a hashmap from each reserve pubkey to the reserve state. If provided the function will be significantly faster as it will not have to fetch the reserves
   * @returns - an array of invest instructions for each invest action required for the vault reserves
   */
  async investSingleReserveIxs(
    payer: PublicKey,
    kaminoVault: KaminoVault,
    reserveWithAddress: ReserveWithAddress,
    vaultReservesMap?: PubkeyHashMap<PublicKey, KaminoReserve>
  ): Promise<TransactionInstruction[]> {
    return this._vaultClient.investSingleReserveIxs(payer, kaminoVault, reserveWithAddress, vaultReservesMap);
  }

  /**
   * This will return the a map between reserve pubkey and the pct of the vault invested amount in each reserve
   * @param vaultState - the kamino vault to get reserves distribution for
   * @returns a map between reserve pubkey and the allocation pct for the reserve
   */
  getAllocationsDistribuionPct(vaultState: VaultState): PubkeyHashMap<PublicKey, Decimal> {
    return this._vaultClient.getAllocationsDistribuionPct(vaultState);
  }

  /**
   * This will return the a map between reserve pubkey and the allocation overview for the reserve
   * @param vaultState - the kamino vault to get reserves allocation overview for
   * @returns a map between reserve pubkey and the allocation overview for the reserve
   */
  getVaultAllocations(vaultState: VaultState): PubkeyHashMap<PublicKey, ReserveAllocationOverview> {
    return this._vaultClient.getVaultAllocations(vaultState);
  }

  /**
   * This will return the amount of token invested from the vault into the given reserve
   * @param vault - the kamino vault to get invested amount in reserve for
   * @param slot - current slot
   * @param reserve - the reserve state to get vault invested amount in
   * @returns vault amount supplied in reserve in decimal
   */
  getSuppliedInReserve(vaultState: VaultState, slot: number, reserve: KaminoReserve): Decimal {
    return this._vaultClient.getSuppliedInReserve(vaultState, slot, reserve);
  }

  /**
   * This returns an array of scope oracle configs to be used to set the scope price and twap oracles for a reserve
   * @param feed - scope feed to fetch prices from
   * @param cluster - cluster to fetch from, this should be left unchanged unless working on devnet or locally
   * @returns - an array of scope oracle configs
   */
  async getScopeOracleConfigs(
    feed: string = 'hubble',
    cluster: ENV = 'mainnet-beta'
  ): Promise<Array<ScopeOracleConfig>> {
    const scopeOracleConfigs: Array<ScopeOracleConfig> = [];

    const scope = new Scope(cluster, this._connection);
    const oracleMappings = await scope.getOracleMappings({ feed: feed });
    const [, feedConfig] = await scope.getFeedConfiguration({ feed: feed });
    const tokenMetadatas = await TokenMetadatas.fetch(this._connection, feedConfig.tokensMetadata);
    const decoder = new TextDecoder('utf-8');

    console.log('feedConfig.tokensMetadata', feedConfig.tokensMetadata);

    if (tokenMetadatas === null) {
      throw new Error('TokenMetadatas not found');
    }

    for (let index = 0; index < oracleMappings.priceInfoAccounts.length; index++) {
      if (!oracleMappings.priceInfoAccounts[index].equals(PublicKey.default)) {
        const name = decoder.decode(Uint8Array.from(tokenMetadatas.metadatasArray[index].name)).replace(/\0/g, '');
        const oracleType = parseOracleType(oracleMappings.priceTypes[index]);

        scopeOracleConfigs.push({
          scopePriceConfigAddress: feedConfig.oraclePrices,
          name: name,
          oracleType: oracleType,
          oracleId: index,
          oracleAccount: oracleMappings.priceInfoAccounts[index],
          twapEnabled: oracleMappings.twapEnabled[index] === 1,
          twapSourceId: oracleMappings.twapSource[index],
          max_age: tokenMetadatas.metadatasArray[index].maxAgePriceSlots.toNumber(),
        });
      }
    }

    return scopeOracleConfigs;
  }

  /**
   * This retruns an array of instructions to be used to update the lending market configurations
   * @param marketWithAddress - the market address and market state object
   * @param newMarket - the lending market state with the new configuration - to be build we new config options from the previous state
   * @returns - an array of instructions
   */
  updateLendingMarketIxs(marketWithAddress: MarketWithAddress, newMarket: LendingMarket): TransactionInstruction[] {
    return parseForChangesMarketConfigAndGetIxs(marketWithAddress, newMarket, this._kaminoLendProgramId);
  }

  /**
   * This retruns an instruction to be used to update the market owner. This can only be executed by the current lendingMarketOwnerCached
   * @param marketWithAddress - the market address and market state object
   * @param newMarket - the lending market state with the new configuration - to be build we new config options from the previous state
   * @returns - an array of instructions
   */
  updateLendingMarketOwnerIxs(marketWithAddress: MarketWithAddress): TransactionInstruction {
    const accounts: UpdateLendingMarketOwnerAccounts = {
      lendingMarketOwnerCached: marketWithAddress.state.lendingMarketOwnerCached,
      lendingMarket: marketWithAddress.address,
    };

    return updateLendingMarketOwner(accounts, this._kaminoLendProgramId);
  }
} // KaminoManager

export type BaseLendingMarketKey = keyof LendingMarketFields;
const EXCLUDED_LENDING_MARKET_KEYS = [
  'version',
  'bumpSeed',
  'reserved0',
  'reserved1',
  'padding1',
  'padding2',
  'elevationGroupPadding',
  'quoteCurrency',
] as const;
export type ExcludedLendingMarketKey = (typeof EXCLUDED_LENDING_MARKET_KEYS)[number];

function isExcludedLendingMarketKey(value: unknown): value is ExcludedLendingMarketKey {
  return EXCLUDED_LENDING_MARKET_KEYS.includes(value as ExcludedLendingMarketKey);
}

export type LendingMarketKey = Exclude<BaseLendingMarketKey, ExcludedLendingMarketKey>;

const updateLendingMarketConfig = (
  key: LendingMarketKey,
  market: LendingMarket,
  newMarket: LendingMarket
): { mode: number; value: Buffer }[] => {
  const updateLendingMarketIxsArgs: { mode: number; value: Buffer }[] = [];
  switch (key) {
    case 'lendingMarketOwner': {
      if (!market.lendingMarketOwner.equals(newMarket.lendingMarketOwner)) {
        updateLendingMarketIxsArgs.push({
          mode: UpdateLendingMarketMode.UpdateOwner.discriminator,
          value: updateMarketConfigEncodedValue(
            UpdateLendingMarketMode.UpdateOwner.discriminator,
            newMarket.lendingMarketOwner
          ),
        });
      }
      break;
    }
    case 'lendingMarketOwnerCached':
      if (!market.lendingMarketOwnerCached.equals(newMarket.lendingMarketOwnerCached)) {
        updateLendingMarketIxsArgs.push({
          mode: UpdateLendingMarketMode.UpdateOwner.discriminator,
          value: updateMarketConfigEncodedValue(
            UpdateLendingMarketMode.UpdateOwner.discriminator,
            newMarket.lendingMarketOwnerCached
          ),
        });
      }
      break;
    case 'referralFeeBps':
      if (market.referralFeeBps !== newMarket.referralFeeBps) {
        updateLendingMarketIxsArgs.push({
          mode: UpdateLendingMarketMode.UpdateReferralFeeBps.discriminator,
          value: updateMarketConfigEncodedValue(
            UpdateLendingMarketMode.UpdateReferralFeeBps.discriminator,
            newMarket.referralFeeBps
          ),
        });
      }
      break;
    case 'emergencyMode':
      if (market.emergencyMode !== newMarket.emergencyMode) {
        updateLendingMarketIxsArgs.push({
          mode: UpdateLendingMarketMode.UpdateEmergencyMode.discriminator,
          value: updateMarketConfigEncodedValue(
            UpdateLendingMarketMode.UpdateEmergencyMode.discriminator,
            newMarket.emergencyMode
          ),
        });
      }
      break;
    case 'autodeleverageEnabled':
      if (market.autodeleverageEnabled !== newMarket.autodeleverageEnabled) {
        updateLendingMarketIxsArgs.push({
          mode: UpdateLendingMarketMode.UpdateAutodeleverageEnabled.discriminator,
          value: updateMarketConfigEncodedValue(
            UpdateLendingMarketMode.UpdateAutodeleverageEnabled.discriminator,
            newMarket.autodeleverageEnabled
          ),
        });
      }
      break;
    case 'borrowDisabled':
      if (market.borrowDisabled !== newMarket.borrowDisabled) {
        updateLendingMarketIxsArgs.push({
          mode: UpdateLendingMarketMode.UpdateBorrowingDisabled.discriminator,
          value: updateMarketConfigEncodedValue(
            UpdateLendingMarketMode.UpdateBorrowingDisabled.discriminator,
            newMarket.borrowDisabled
          ),
        });
      }
      break;
    case 'priceRefreshTriggerToMaxAgePct':
      if (market.priceRefreshTriggerToMaxAgePct !== newMarket.priceRefreshTriggerToMaxAgePct) {
        updateLendingMarketIxsArgs.push({
          mode: UpdateLendingMarketMode.UpdatePriceRefreshTriggerToMaxAgePct.discriminator,
          value: updateMarketConfigEncodedValue(
            UpdateLendingMarketMode.UpdatePriceRefreshTriggerToMaxAgePct.discriminator,
            newMarket.priceRefreshTriggerToMaxAgePct
          ),
        });
      }
      break;
    case 'liquidationMaxDebtCloseFactorPct':
      if (market.liquidationMaxDebtCloseFactorPct !== newMarket.liquidationMaxDebtCloseFactorPct) {
        updateLendingMarketIxsArgs.push({
          mode: UpdateLendingMarketMode.UpdateLiquidationCloseFactor.discriminator,
          value: updateMarketConfigEncodedValue(
            UpdateLendingMarketMode.UpdateLiquidationCloseFactor.discriminator,
            newMarket.liquidationMaxDebtCloseFactorPct
          ),
        });
      }
      break;
    case 'insolvencyRiskUnhealthyLtvPct':
      if (market.insolvencyRiskUnhealthyLtvPct !== newMarket.insolvencyRiskUnhealthyLtvPct) {
        updateLendingMarketIxsArgs.push({
          mode: UpdateLendingMarketMode.UpdateInsolvencyRiskLtv.discriminator,
          value: updateMarketConfigEncodedValue(
            UpdateLendingMarketMode.UpdateInsolvencyRiskLtv.discriminator,
            newMarket.insolvencyRiskUnhealthyLtvPct
          ),
        });
      }
      break;
    case 'minFullLiquidationValueThreshold':
      if (!market.minFullLiquidationValueThreshold.eq(newMarket.minFullLiquidationValueThreshold)) {
        updateLendingMarketIxsArgs.push({
          mode: UpdateLendingMarketMode.UpdateMinFullLiquidationThreshold.discriminator,
          value: updateMarketConfigEncodedValue(
            UpdateLendingMarketMode.UpdateMinFullLiquidationThreshold.discriminator,
            newMarket.minFullLiquidationValueThreshold.toNumber()
          ),
        });
      }
      break;
    case 'maxLiquidatableDebtMarketValueAtOnce':
      if (!market.maxLiquidatableDebtMarketValueAtOnce.eq(newMarket.maxLiquidatableDebtMarketValueAtOnce)) {
        updateLendingMarketIxsArgs.push({
          mode: UpdateLendingMarketMode.UpdateLiquidationMaxValue.discriminator,
          value: updateMarketConfigEncodedValue(
            UpdateLendingMarketMode.UpdateLiquidationMaxValue.discriminator,
            newMarket.maxLiquidatableDebtMarketValueAtOnce.toNumber()
          ),
        });
      }
      break;
    case 'globalAllowedBorrowValue':
      if (!market.globalAllowedBorrowValue.eq(newMarket.globalAllowedBorrowValue)) {
        updateLendingMarketIxsArgs.push({
          mode: UpdateLendingMarketMode.UpdateGlobalAllowedBorrow.discriminator,
          value: updateMarketConfigEncodedValue(
            UpdateLendingMarketMode.UpdateGlobalAllowedBorrow.discriminator,
            newMarket.globalAllowedBorrowValue.toNumber()
          ),
        });
      }
      break;
    case 'riskCouncil':
      if (!market.riskCouncil.equals(newMarket.riskCouncil)) {
        updateLendingMarketIxsArgs.push({
          mode: UpdateLendingMarketMode.UpdateRiskCouncil.discriminator,
          value: updateMarketConfigEncodedValue(
            UpdateLendingMarketMode.UpdateRiskCouncil.discriminator,
            newMarket.riskCouncil
          ),
        });
      }
      break;
    case 'elevationGroups':
      let elevationGroupsDiffs = 0;
      for (let i = 0; i < market.elevationGroups.length; i++) {
        if (
          market.elevationGroups[i].id !== newMarket.elevationGroups[i].id ||
          market.elevationGroups[i].maxLiquidationBonusBps !== newMarket.elevationGroups[i].maxLiquidationBonusBps ||
          market.elevationGroups[i].ltvPct !== newMarket.elevationGroups[i].ltvPct ||
          market.elevationGroups[i].liquidationThresholdPct !== newMarket.elevationGroups[i].liquidationThresholdPct ||
          market.elevationGroups[i].allowNewLoans !== newMarket.elevationGroups[i].allowNewLoans ||
          market.elevationGroups[i].maxReservesAsCollateral !== newMarket.elevationGroups[i].maxReservesAsCollateral ||
          !market.elevationGroups[i].debtReserve.equals(newMarket.elevationGroups[i].debtReserve)
        ) {
          updateLendingMarketIxsArgs.push({
            mode: UpdateLendingMarketMode.UpdateElevationGroup.discriminator,
            value: updateMarketConfigEncodedValue(
              UpdateLendingMarketMode.UpdateElevationGroup.discriminator,
              newMarket.elevationGroups[i]
            ),
          });
          elevationGroupsDiffs++;
        }
      }
      if (elevationGroupsDiffs > 1) {
        throw new Error('Can only update 1 elevation group at a time');
      }
      break;
    case 'minNetValueInObligationSf':
      if (!market.minNetValueInObligationSf.eq(newMarket.minNetValueInObligationSf)) {
        updateLendingMarketIxsArgs.push({
          mode: UpdateLendingMarketMode.UpdateMinNetValueObligationPostAction.discriminator,
          value: updateMarketConfigEncodedValue(
            UpdateLendingMarketMode.UpdateMinNetValueObligationPostAction.discriminator,
            newMarket.minNetValueInObligationSf.toString()
          ),
        });
      }
      break;
    case 'minValueSkipLiquidationBfChecks':
      if (!market.minValueSkipLiquidationBfChecks.eq(newMarket.minValueSkipLiquidationBfChecks)) {
        updateLendingMarketIxsArgs.push({
          mode: UpdateLendingMarketMode.UpdateMinValueBfSkipPriorityLiqCheck.discriminator,
          value: updateMarketConfigEncodedValue(
            UpdateLendingMarketMode.UpdateMinValueBfSkipPriorityLiqCheck.discriminator,
            newMarket.minValueSkipLiquidationBfChecks.toNumber()
          ),
        });
      }
      break;
    case 'minValueSkipLiquidationLtvChecks':
      if (!market.minValueSkipLiquidationLtvChecks.eq(newMarket.minValueSkipLiquidationLtvChecks)) {
        updateLendingMarketIxsArgs.push({
          mode: UpdateLendingMarketMode.UpdateMinValueLtvSkipPriorityLiqCheck.discriminator,
          value: updateMarketConfigEncodedValue(
            UpdateLendingMarketMode.UpdateMinValueLtvSkipPriorityLiqCheck.discriminator,
            newMarket.minValueSkipLiquidationLtvChecks.toNumber()
          ),
        });
      }
      break;
    case 'individualAutodeleverageMarginCallPeriodSecs':
      if (
        market.individualAutodeleverageMarginCallPeriodSecs !== newMarket.individualAutodeleverageMarginCallPeriodSecs
      ) {
        updateLendingMarketIxsArgs.push({
          mode: UpdateLendingMarketMode.UpdateIndividualAutodeleverageMarginCallPeriodSecs.discriminator,
          value: updateMarketConfigEncodedValue(
            UpdateLendingMarketMode.UpdateIndividualAutodeleverageMarginCallPeriodSecs.discriminator,
            newMarket.individualAutodeleverageMarginCallPeriodSecs.toNumber()
          ),
        });
      }
      break;
    case 'name':
      if (!sameLengthArrayEquals(market.name, newMarket.name)) {
        updateLendingMarketIxsArgs.push({
          mode: UpdateLendingMarketMode.UpdateName.discriminator,
          value: updateMarketConfigEncodedValue(UpdateLendingMarketMode.UpdateName.discriminator, newMarket.name),
        });
      }
      break;
    case 'minInitialDepositAmount':
      if (!market.minInitialDepositAmount.eq(newMarket.minInitialDepositAmount)) {
        updateLendingMarketIxsArgs.push({
          mode: UpdateLendingMarketMode.UpdateInitialDepositAmount.discriminator,
          value: updateMarketConfigEncodedValue(
            UpdateLendingMarketMode.UpdateInitialDepositAmount.discriminator,
            newMarket.minInitialDepositAmount.toNumber()
          ),
        });
      }
      break;
    case 'obligationOrdersEnabled':
      if (market.obligationOrdersEnabled !== newMarket.obligationOrdersEnabled) {
        updateLendingMarketIxsArgs.push({
          mode: UpdateLendingMarketMode.UpdateObligationOrdersEnabled.discriminator,
          value: updateMarketConfigEncodedValue(
            UpdateLendingMarketMode.UpdateObligationOrdersEnabled.discriminator,
            newMarket.obligationOrdersEnabled
          ),
        });
      }
      break;
    default:
      assertNever(key);
  }
  return updateLendingMarketIxsArgs;
};

function parseForChangesMarketConfigAndGetIxs(
  marketWithAddress: MarketWithAddress,
  newMarket: LendingMarket,
  programId: PublicKey
): TransactionInstruction[] {
  const market = marketWithAddress.state;
  const updateLendingMarketIxsArgs: { mode: number; value: Buffer }[] = [];

  for (const key in market.toJSON()) {
    if (isExcludedLendingMarketKey(key)) {
      continue;
    }
    updateLendingMarketIxsArgs.push(...updateLendingMarketConfig(key as LendingMarketKey, market, newMarket));
  }

  const ixs: TransactionInstruction[] = [];

  updateLendingMarketIxsArgs.forEach((updateLendingMarketConfigArgs) => {
    ixs.push(
      updateMarketConfigIx(
        marketWithAddress,
        updateLendingMarketConfigArgs.mode,
        updateLendingMarketConfigArgs.value,
        programId
      )
    );
  });

  return ixs;
}

function updateMarketConfigEncodedValue(
  discriminator: UpdateLendingMarketModeKind['discriminator'],
  value: number | number[] | PublicKey | ElevationGroup | string
): Buffer {
  let buffer: Buffer = Buffer.alloc(72);
  let pkBuffer: Buffer;
  let valueBigInt: bigint;
  let valueArray: number[];

  switch (discriminator) {
    case UpdateLendingMarketMode.UpdateEmergencyMode.discriminator:
    case UpdateLendingMarketMode.UpdateLiquidationCloseFactor.discriminator:
    case UpdateLendingMarketMode.UpdateInsolvencyRiskLtv.discriminator:
    case UpdateLendingMarketMode.UpdatePriceRefreshTriggerToMaxAgePct.discriminator:
    case UpdateLendingMarketMode.UpdateAutodeleverageEnabled.discriminator:
    case UpdateLendingMarketMode.UpdateObligationOrdersEnabled.discriminator:
    case UpdateLendingMarketMode.UpdateBorrowingDisabled.discriminator:
      buffer.writeUIntLE(value as number, 0, 1);
      break;
    case UpdateLendingMarketMode.UpdateReferralFeeBps.discriminator:
      buffer.writeUInt16LE(value as number, 0);
      break;
    case UpdateLendingMarketMode.UpdateLiquidationMaxValue.discriminator:
    case UpdateLendingMarketMode.UpdateGlobalAllowedBorrow.discriminator:
    case UpdateLendingMarketMode.UpdateMinFullLiquidationThreshold.discriminator:
    case UpdateLendingMarketMode.UpdateMinValueBfSkipPriorityLiqCheck.discriminator:
    case UpdateLendingMarketMode.UpdateMinValueLtvSkipPriorityLiqCheck.discriminator:
    case UpdateLendingMarketMode.UpdateIndividualAutodeleverageMarginCallPeriodSecs.discriminator:
    case UpdateLendingMarketMode.UpdateInitialDepositAmount.discriminator:
      value = value as number;
      buffer.writeBigUint64LE(BigInt(value), 0);
      break;
    case UpdateLendingMarketMode.UpdateOwner.discriminator:
    case UpdateLendingMarketMode.UpdateRiskCouncil.discriminator:
      pkBuffer = (value as PublicKey).toBuffer();
      pkBuffer.copy(buffer, 0);
      break;
    case UpdateLendingMarketMode.UpdateElevationGroup.discriminator:
      buffer = serializeElevationGroup(value as ElevationGroup);
      break;
    case UpdateLendingMarketMode.UpdateMinNetValueObligationPostAction.discriminator:
      valueBigInt = BigInt(value as string);
      for (let i = 0; i < 16; i++) {
        buffer[15 - i] = Number((valueBigInt >> BigInt(i * 8)) & BigInt(0xff));
      }
      break;
    case UpdateLendingMarketMode.UpdateName.discriminator:
      valueArray = value as number[];
      for (let i = 0; i < valueArray.length; i++) {
        buffer.writeUIntLE(valueArray[i], i, 1);
      }
      break;
    case UpdateLendingMarketMode.UpdatePaddingFields.discriminator:
    case UpdateLendingMarketMode.DeprecatedUpdateGlobalUnhealthyBorrow.discriminator:
    case UpdateLendingMarketMode.DeprecatedUpdateMultiplierPoints.discriminator:
      // Deliberately skipped - we are not updating padding or deprecated fields using this method
      break;
    default:
      assertNever(discriminator);
  }

  return buffer;
}

function updateMarketConfigIx(
  marketWithAddress: MarketWithAddress,
  modeDiscriminator: number,
  value: Buffer,
  programId: PublicKey
): TransactionInstruction {
  const accounts: UpdateLendingMarketAccounts = {
    lendingMarketOwner: marketWithAddress.state.lendingMarketOwner,
    lendingMarket: marketWithAddress.address,
  };

  const args: UpdateLendingMarketArgs = {
    mode: new anchor.BN(modeDiscriminator),
    value: [...value],
  };

  const ix = updateLendingMarket(args, accounts, programId);

  return ix;
}

function serializeElevationGroup(elevationGroup: ElevationGroup): Buffer {
  const buffer = Buffer.alloc(72);
  buffer.writeUInt16LE(elevationGroup.maxLiquidationBonusBps, 0);
  buffer.writeUIntLE(elevationGroup.id, 2, 1);
  buffer.writeUIntLE(elevationGroup.ltvPct, 3, 1);
  buffer.writeUIntLE(elevationGroup.liquidationThresholdPct, 4, 1);
  buffer.writeUIntLE(elevationGroup.allowNewLoans, 5, 1);
  buffer.writeUIntLE(elevationGroup.maxReservesAsCollateral, 6, 1);
  buffer.writeUIntLE(elevationGroup.padding0, 7, 1);
  const debtReserveBuffer = elevationGroup.debtReserve.toBuffer();
  debtReserveBuffer.copy(buffer, 8);
  return buffer;
}
