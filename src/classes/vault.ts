import BN from 'bn.js';
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
} from '@solana/kit';
import {
  AllOracleAccounts,
  DEFAULT_PUBLIC_KEY,
  DEFAULT_RECENT_SLOT_DURATION_MS,
  getAssociatedTokenAddress,
  getTokenBalanceFromAccountInfoLamports,
  getTokenOracleData,
  getTransferWsolIxs,
  KaminoMarket,
  KaminoReserve,
  lamportsToDecimal,
  Reserve,
  UserState,
  WRAPPED_SOL_MINT,
} from '../lib';
import {
  deposit,
  DepositAccounts,
  DepositArgs,
  giveUpPendingFees,
  GiveUpPendingFeesAccounts,
  GiveUpPendingFeesArgs,
  initVault,
  InitVaultAccounts,
  invest,
  InvestAccounts,
  removeAllocation,
  RemoveAllocationAccounts,
  updateAdmin,
  UpdateAdminAccounts,
  updateReserveAllocation,
  UpdateReserveAllocationAccounts,
  UpdateReserveAllocationArgs,
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
} from '../@codegen/kvault/instructions';
import { VaultConfigField, VaultConfigFieldKind } from '../@codegen/kvault/types';
import { VaultState } from '../@codegen/kvault/accounts';
import Decimal from 'decimal.js';
import { bpsToPct, decodeVaultName, numberToLamportsDecimal, parseTokenSymbol, pubkeyHashMapToJson } from './utils';
import { PROGRAM_ID } from '../@codegen/klend/programId';
import { ReserveWithAddress } from './reserve';
import { Fraction } from './fraction';
import {
  CDN_ENDPOINT,
  createAtasIdempotent,
  createWsolAtaIfMissing,
  getAllStandardTokenProgramTokenAccounts,
  getKVaultSharesMetadataPda,
  getTokenAccountAmount,
  getTokenAccountMint,
  lendingMarketAuthPda,
  SECONDS_PER_YEAR,
  U64_MAX,
  VAULT_INITIAL_DEPOSIT,
} from '../utils';
import { getAccountOwner, getProgramAccounts } from '../utils/rpc';
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
import { batchFetch, collToLamportsDecimal, ZERO } from '@kamino-finance/kliquidity-sdk';
import { FullBPSDecimal } from '@kamino-finance/kliquidity-sdk/dist/utils/CreationParameters';
import { FarmConfigOption, FarmIncentives, FarmState, getUserStatePDA } from '@kamino-finance/farms-sdk/dist';
import { getAccountsInLut, initLookupTableIx, insertIntoLookupTableIxs } from '../utils/lookupTable';
import {
  FARMS_ADMIN_MAINNET,
  FARMS_GLOBAL_CONFIG_MAINNET,
  getFarmStakeIxs,
  getFarmUnstakeAndWithdrawIxs,
  getSharesInFarmUserPosition,
  getUserPendingRewardsInFarm,
  getUserSharesInTokensStakedInFarm,
} from './farm_utils';
import { getCreateAccountInstruction, SYSTEM_PROGRAM_ADDRESS } from '@solana-program/system';
import { getInitializeKVaultSharesMetadataIx, getUpdateSharesMetadataIx, resolveMetadata } from '../utils/metadata';
import { decodeVaultState } from '../utils/vault';
import { fetchMaybeToken, findAssociatedTokenPda, getCloseAccountInstruction } from '@solana-program/token-2022';
import { TOKEN_PROGRAM_ADDRESS } from '@solana-program/token';
import { SYSVAR_INSTRUCTIONS_ADDRESS, SYSVAR_RENT_ADDRESS } from '@solana/sysvars';
import { noopSigner } from '../utils/signer';
import { Farms } from '@kamino-finance/farms-sdk';
import { getFarmIncentives } from '@kamino-finance/farms-sdk/dist/utils/apy';
import { computeReservesAllocation } from '../utils/vaultAllocation';
import { getReserveFarmRewardsAPY } from '../utils/farmUtils';

export const kaminoVaultId = address('KvauGMspG5k6rtzrqqn7WNn3oZdyKqLKwK2XWQ8FLjd');
export const kaminoVaultStagingId = address('stKvQfwRsQiKnLtMNVLHKS3exFJmZFsgfzBPWHECUYK');

const TOKEN_VAULT_SEED = 'token_vault';
const CTOKEN_VAULT_SEED = 'ctoken_vault';
const BASE_VAULT_AUTHORITY_SEED = 'authority';
const SHARES_SEED = 'shares';
const EVENT_AUTHORITY_SEED = '__event_authority';
export const METADATA_SEED = 'metadata';

export const METADATA_PROGRAM_ID: Address = address('metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s');

export const INITIAL_DEPOSIT_LAMPORTS = 1000;

const addressEncoder = getAddressEncoder();
const base58Decoder = getBase58Decoder();

/**
 * KaminoVaultClient is a class that provides a high-level interface to interact with the Kamino Vault program.
 */
export class KaminoVaultClient {
  private readonly _rpc: Rpc<SolanaRpcApi>;
  private readonly _kaminoVaultProgramId: Address;
  private readonly _kaminoLendProgramId: Address;
  recentSlotDurationMs: number;

  constructor(
    rpc: Rpc<SolanaRpcApi>,
    recentSlotDurationMs: number,
    kaminoVaultprogramId?: Address,
    kaminoLendProgramId?: Address
  ) {
    this._rpc = rpc;
    this.recentSlotDurationMs = recentSlotDurationMs;
    this._kaminoVaultProgramId = kaminoVaultprogramId ? kaminoVaultprogramId : kaminoVaultId;
    this._kaminoLendProgramId = kaminoLendProgramId ? kaminoLendProgramId : PROGRAM_ID;
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

  hasFarm() {
    return;
  }

  /**
   * Prints a vault in a human readable form
   * @param vaultPubkey - the address of the vault
   * @param [vaultState] - optional parameter to pass the vault state directly; this will save a network call
   * @returns - void; prints the vault to the console
   */
  async printVault(vaultPubkey: Address, vaultState?: VaultState) {
    const vault = vaultState ? vaultState : await VaultState.fetch(this.getConnection(), vaultPubkey);

    if (!vault) {
      console.log(`Vault ${vaultPubkey.toString()} not found`);
      return;
    }

    const kaminoVault = KaminoVault.loadWithClientAndState(this, vaultPubkey, vault);
    const vaultName = this.decodeVaultName(vault.name);
    const slot = await this.getConnection().getSlot({ commitment: 'confirmed' }).send();
    const tokensPerShare = await this.getTokensPerShareSingleVault(kaminoVault, slot);
    const holdings = await this.getVaultHoldings(vault, slot);

    const sharesIssued = new Decimal(vault.sharesIssued.toString()!).div(
      new Decimal(vault.sharesMintDecimals.toString())
    );

    console.log('Name: ', vaultName);
    console.log('Shares issued: ', sharesIssued);
    holdings.print();
    console.log('Tokens per share: ', tokensPerShare);
  }

  /**
   * This method will create a vault with a given config. The config can be changed later on, but it is recommended to set it up correctly from the start
   * @param vaultConfig - the config object used to create a vault
   * @returns vault: the keypair of the vault, used to sign the initialization transaction; initVaultIxs: a struct with ixs to initialize the vault and its lookup table + populateLUTIxs, a list to populate the lookup table which has to be executed in a separate transaction
   */
  async createVaultIxs(
    vaultConfig: KaminoVaultConfig
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

    const [slot, [tokenVault], [baseVaultAuthority], [sharesMint]] = await Promise.all([
      this.getConnection().getSlot({ commitment: 'finalized' }).send(),
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
        vaultConfig.admin
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

    const createVaultFarm = await this.createVaultFarm(vaultConfig.admin, vaultState.address, sharesMint);

    // create and set up the vault lookup table
    const [createLUTIx, lut] = await initLookupTableIx(vaultConfig.admin, slot);

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
      FARMS_GLOBAL_CONFIG_MAINNET,
    ];
    const insertIntoLUTIxs = await insertIntoLookupTableIxs(
      this.getConnection(),
      vaultConfig.admin,
      lut,
      accountsToBeInserted,
      []
    );

    const setLUTIx = this.updateUninitialisedVaultConfigIx(
      vaultConfig.admin,
      vaultState.address,
      new VaultConfigField.LookupTable(),
      lut.toString()
    );

    const ixs = [createVaultIx, initVaultIx, setLUTIx];

    if (vaultConfig.getPerformanceFeeBps() > 0) {
      const setPerformanceFeeIx = this.updateUninitialisedVaultConfigIx(
        vaultConfig.admin,
        vaultState.address,
        new VaultConfigField.PerformanceFeeBps(),
        vaultConfig.getPerformanceFeeBps().toString()
      );
      ixs.push(setPerformanceFeeIx);
    }
    if (vaultConfig.getManagementFeeBps() > 0) {
      const setManagementFeeIx = this.updateUninitialisedVaultConfigIx(
        vaultConfig.admin,
        vaultState.address,
        new VaultConfigField.ManagementFeeBps(),
        vaultConfig.getManagementFeeBps().toString()
      );
      ixs.push(setManagementFeeIx);
    }
    if (vaultConfig.name && vaultConfig.name.length > 0) {
      const setNameIx = this.updateUninitialisedVaultConfigIx(
        vaultConfig.admin,
        vaultState.address,
        new VaultConfigField.Name(),
        vaultConfig.name
      );
      ixs.push(setNameIx);
    }
    const setFarmIx = this.updateUninitialisedVaultConfigIx(
      vaultConfig.admin,
      vaultState.address,
      new VaultConfigField.Farm(),
      createVaultFarm.farm.address
    );

    const metadataIx = await this.getSetSharesMetadataIx(
      this.getConnection(),
      vaultConfig.admin,
      vaultState.address,
      sharesMint,
      baseVaultAuthority,
      vaultConfig.vaultTokenSymbol,
      vaultConfig.vaultTokenName
    );

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
        createVaultFarm,
        setFarmToVaultIx: setFarmIx,
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
    vaultSharesMint: Address
  ): Promise<CreateVaultFarm> {
    const farmsSDK = new Farms(this._rpc);

    const farm = await generateKeyPairSigner();
    const ixs = await farmsSDK.createFarmIxs(signer, farm, FARMS_GLOBAL_CONFIG_MAINNET, vaultSharesMint);

    const updatePendingFarmAdminIx = await farmsSDK.updateFarmConfigIx(
      signer,
      farm.address,
      DEFAULT_PUBLIC_KEY,
      new FarmConfigOption.UpdatePendingFarmAdmin(),
      FARMS_ADMIN_MAINNET,
      undefined,
      undefined,
      true
    );
    const updateFarmVaultIdIx = await farmsSDK.updateFarmConfigIx(
      signer,
      farm.address,
      DEFAULT_PUBLIC_KEY,
      new FarmConfigOption.UpdateVaultId(),
      vaultAddress,
      undefined,
      undefined,
      true
    );

    return {
      farm,
      setupFarmIxs: ixs,
      updateFarmIxs: [updatePendingFarmAdminIx, updateFarmVaultIdIx],
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
    extraName: string
  ) {
    const [sharesMintMetadata] = await getKVaultSharesMetadataPda(sharesMint);

    const { name, symbol, uri } = resolveMetadata(sharesMint, extraName, tokenName);

    const ix = !(await fetchEncodedAccount(rpc, sharesMintMetadata, { commitment: 'processed' })).exists
      ? await getInitializeKVaultSharesMetadataIx(vaultAdmin, vault, sharesMint, baseVaultAuthority, name, symbol, uri)
      : await getUpdateSharesMetadataIx(vaultAdmin, vault, sharesMint, baseVaultAuthority, name, symbol, uri);

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

    const vaultAdmin = parseVaultAdmin(vaultState, vaultAdminAuthority);
    const updateReserveAllocationAccounts: UpdateReserveAllocationAccounts = {
      signer: vaultAdmin,
      vaultState: vault.address,
      baseVaultAuthority: vaultState.baseVaultAuthority,
      reserveCollateralMint: reserveState.collateral.mintPubkey,
      reserve: reserveAllocationConfig.getReserveAddress(),
      ctokenVault: cTokenVault,
      systemProgram: SYSTEM_PROGRAM_ADDRESS,
      rent: SYSVAR_RENT_ADDRESS,
      reserveCollateralTokenProgram: TOKEN_PROGRAM_ADDRESS,
    };

    const updateReserveAllocationArgs: UpdateReserveAllocationArgs = {
      weight: new BN(reserveAllocationConfig.targetAllocationWeight),
      cap: new BN(reserveAllocationConfig.getAllocationCapLamports().floor().toString()),
    };

    const updateReserveAllocationIx = updateReserveAllocation(
      updateReserveAllocationArgs,
      updateReserveAllocationAccounts,
      undefined,
      this._kaminoVaultProgramId
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
        vaultAdminAuthority
      );
      ixs.push(updateVaultUnallocatedWeightIx.updateVaultConfigIx);
    }

    if (!unallocatedCapToUse.eq(vaultState.unallocatedTokensCap)) {
      const updateVaultUnallocatedCapIx = await this.updateVaultConfigIxs(
        vault,
        new VaultConfigField.UnallocatedTokensCap(),
        unallocatedCapToUse.toString(),
        vaultAdminAuthority
      );
      ixs.push(updateVaultUnallocatedCapIx.updateVaultConfigIx);
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

    const reserveState = await Reserve.fetch(this.getConnection(), reserve);
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

    const investIx = await this.investSingleReserveIxs(admin, vault, reserveWithAddress);
    withdrawAndBlockReserveIxs.updateReserveAllocationIxs = [updateAllocIxs.updateReserveAllocationIx];
    withdrawAndBlockReserveIxs.investIxs = investIx;

    return withdrawAndBlockReserveIxs;
  }

  /**
   * This method withdraws all the funds from all the reserves and blocks them from being invested by setting their weight and ctoken allocation to 0
   * @param vault - the vault to withdraw the invested funds from
   * @param [vaultReservesMap] - optional parameter to pass a map of the vault reserves. If not provided, the reserves will be loaded from the vault
   * @param [payer] - optional parameter to pass a different payer for the transaction. If not provided, the admin of the vault will be used; this is the payer for the invest ixs and it should have an ATA and some lamports (2x no_of_reserves) of the token vault
   * @returns - a struct with an instruction to update the reserve allocations (set weight and ctoken allocation to 0) and an a list of instructions to disinvest the funds in the reserves
   */
  async withdrawEverythingFromAllReservesAndBlockInvest(
    vault: KaminoVault,
    vaultReservesMap?: Map<Address, KaminoReserve>,
    payer?: TransactionSigner
  ): Promise<WithdrawAndBlockReserveIxs> {
    const vaultState = await vault.getState();

    const reserves = this.getVaultReserves(vaultState);
    const withdrawAndBlockReserveIxs: WithdrawAndBlockReserveIxs = {
      updateReserveAllocationIxs: [],
      investIxs: [],
    };

    if (!vaultReservesMap) {
      vaultReservesMap = await this.loadVaultReserves(vaultState);
    }

    for (const reserve of reserves) {
      const reserveWithAddress: ReserveWithAddress = {
        address: reserve,
        state: vaultReservesMap.get(reserve)!.state,
      };
      const reserveAllocationConfig = new ReserveAllocationConfig(reserveWithAddress, 0, new Decimal(0));

      // update allocation to have 0 weight and 0 cap
      const updateAllocIxs = await this.updateReserveAllocationIxs(vault, reserveAllocationConfig, payer);
      withdrawAndBlockReserveIxs.updateReserveAllocationIxs.push(updateAllocIxs.updateReserveAllocationIx);
    }

    const investPayer = payer ? payer : noopSigner(vaultState.vaultAdminAuthority);
    const investIxs = await this.investAllReservesIxs(investPayer, vault, true);
    withdrawAndBlockReserveIxs.investIxs = investIxs;

    return withdrawAndBlockReserveIxs;
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
    const vaultState = await vault.getState();

    const reserves = this.getVaultReserves(vaultState);
    const disinvestAllReservesIxs: DisinvestAllReservesIxs = {
      updateReserveAllocationIxs: [],
      investIxs: [],
    };

    if (!vaultReservesMap) {
      vaultReservesMap = await this.loadVaultReserves(vaultState);
    }

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
        new Decimal(existingReserveAllocation.tokenAllocationCap.toString())
      );

      // update allocation to have 0 weight and 0 cap
      const updateAllocIxs = await this.updateReserveAllocationIxs(vault, reserveAllocationConfig, payer);
      disinvestAllReservesIxs.updateReserveAllocationIxs.push(updateAllocIxs.updateReserveAllocationIx);
    }

    const investPayer = payer ? payer : noopSigner(vaultState.vaultAdminAuthority);
    const investIxs = await this.investAllReservesIxs(investPayer, vault, true);
    disinvestAllReservesIxs.investIxs = investIxs;

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
   * @param [vaultAdminAuthority] the signer of the transaction. Optional. If not provided the admin of the vault will be used. It should be used when changing the admin of the vault if we want to build or batch multiple ixs in the same tx
   * @param [lutIxsSigner] the signer of the transaction to be used for the lookup table instructions. Optional. If not provided the admin of the vault will be used. It should be used when changing the admin of the vault if we want to build or batch multiple ixs in the same tx
   * @param [skipLutUpdate] if true, the lookup table instructions will not be included in the returned instructions
   * @returns a struct that contains the instruction to update the field and an optional list of instructions to update the lookup table
   */
  async updateVaultConfigIxs(
    vault: KaminoVault,
    mode: VaultConfigFieldKind,
    value: string,
    vaultAdminAuthority?: TransactionSigner,
    lutIxsSigner?: TransactionSigner,
    skipLutUpdate: boolean = false
  ): Promise<UpdateVaultConfigIxs> {
    const vaultState: VaultState = await vault.getState();
    const admin = parseVaultAdmin(vaultState, vaultAdminAuthority);

    const updateVaultConfigAccs: UpdateVaultConfigAccounts = {
      vaultAdminAuthority: admin,
      vaultState: vault.address,
      klendProgram: this._kaminoLendProgramId,
    };
    if (vaultAdminAuthority) {
      updateVaultConfigAccs.vaultAdminAuthority = vaultAdminAuthority;
    }

    const updateVaultConfigArgs: UpdateVaultConfigArgs = {
      entry: mode,
      data: Buffer.from([0]),
    };

    if (isNaN(+value) || value === DEFAULT_PUBLIC_KEY) {
      if (mode.kind === new VaultConfigField.Name().kind) {
        const data = Array.from(this.encodeVaultName(value));
        updateVaultConfigArgs.data = Buffer.from(data);
      } else {
        const data = address(value);
        updateVaultConfigArgs.data = Buffer.from(addressEncoder.encode(data));
      }
    } else {
      const buffer = Buffer.alloc(8);
      buffer.writeBigUInt64LE(BigInt(value.toString()));
      updateVaultConfigArgs.data = buffer;
    }

    const vaultReserves = this.getVaultReserves(vaultState);
    const vaultReservesState = await this.loadVaultReserves(vaultState);

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

    if (!skipLutUpdate) {
      const lutIxsSignerAccount = lutIxsSigner ? lutIxsSigner : admin;

      if (mode.kind === new VaultConfigField.PendingVaultAdmin().kind) {
        const newPubkey = address(value);

        const insertIntoLutIxs = await insertIntoLookupTableIxs(
          this.getConnection(),
          lutIxsSignerAccount,
          vaultState.vaultLookupTable,
          [newPubkey]
        );
        updateLUTIxs.push(...insertIntoLutIxs);
      } else if (mode.kind === new VaultConfigField.Farm().kind) {
        const keysToAddToLUT = [address(value)];
        // if the farm already exist we want to read its state to add it to the LUT
        try {
          const farmState = await FarmState.fetch(this.getConnection(), keysToAddToLUT[0]);
          keysToAddToLUT.push(
            farmState!.farmVault,
            farmState!.farmVaultsAuthority,
            farmState!.token.mint,
            farmState!.scopePrices,
            farmState!.globalConfig
          );
          const insertIntoLutIxs = await insertIntoLookupTableIxs(
            this.getConnection(),
            lutIxsSignerAccount,
            vaultState.vaultLookupTable,
            keysToAddToLUT
          );
          updateLUTIxs.push(...insertIntoLutIxs);
        } catch (error) {
          console.log(`Error fetching farm ${keysToAddToLUT[0].toString()} state`, error);
        }
      }
    }

    const updateVaultConfigIxs: UpdateVaultConfigIxs = {
      updateVaultConfigIx,
      updateLUTIxs,
    };

    return updateVaultConfigIxs;
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
      vaultAdminAuthority,
      lutIxsSigner,
      skipLutUpdate
    );
  }

  /**
   * This method updates the vault config for a vault that
   * @param admin - address of vault to be updated
   * @param vault - address of vault to be updated
   * @param mode - the field to be updated
   * @param value - the new value for the field to be updated (number or pubkey)
   * @returns - an instruction to update the vault config
   */
  private updateUninitialisedVaultConfigIx(
    admin: TransactionSigner,
    vault: Address,
    mode: VaultConfigFieldKind,
    value: string
  ): Instruction {
    const updateVaultConfigAccs: UpdateVaultConfigAccounts = {
      vaultAdminAuthority: admin,
      vaultState: vault,
      klendProgram: this._kaminoLendProgramId,
    };

    const updateVaultConfigArgs: UpdateVaultConfigArgs = {
      entry: mode,
      data: Buffer.from([0]),
    };

    if (isNaN(+value)) {
      if (mode.kind === new VaultConfigField.Name().kind) {
        const data = Array.from(this.encodeVaultName(value));
        updateVaultConfigArgs.data = Buffer.from(data);
      } else {
        const data = address(value);
        updateVaultConfigArgs.data = Buffer.from(addressEncoder.encode(data));
      }
    } else {
      const buffer = Buffer.alloc(8);
      buffer.writeBigUInt64LE(BigInt(value.toString()));
      updateVaultConfigArgs.data = buffer;
    }

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
    pendingAdmin?: TransactionSigner
  ): Promise<AcceptVaultOwnershipIxs> {
    const vaultState: VaultState = await vault.getState();
    const signer = parseVaultPendingAdmin(vaultState, pendingAdmin);

    const acceptOwneshipAccounts: UpdateAdminAccounts = {
      pendingAdmin: signer,
      vaultState: vault.address,
    };

    const acceptVaultOwnershipIx = updateAdmin(acceptOwneshipAccounts, undefined, this._kaminoVaultProgramId);

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
      signer
    );
    lutIxs.push(updateVaultConfigIxs.updateVaultConfigIx);
    lutIxs.push(...updateVaultConfigIxs.updateLUTIxs);

    const acceptVaultOwnershipIxs: AcceptVaultOwnershipIxs = {
      acceptVaultOwnershipIx,
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
   * @param authority - vault admin
   * @param vault - vault for which the admin withdraws the pending fees
   * @param slot - current slot, used to estimate the interest earned in the different reserves with allocation from the vault
   * @param [vaultReservesMap] - a hashmap from each reserve pubkey to the reserve state. Optional. If provided the function will be significantly faster as it will not have to fetch the reserves
   * @param [vaultAdminAuthority] - vault admin - a noop vaultAdminAuthority is provided when absent for multisigs
   * @returns - list of instructions to withdraw all pending fees, including the ATA creation instructions if needed
   */
  async withdrawPendingFeesIxs(
    vault: KaminoVault,
    slot: Slot,
    vaultReservesMap?: Map<Address, KaminoReserve>,
    vaultAdminAuthority?: TransactionSigner
  ): Promise<Instruction[]> {
    const vaultState: VaultState = await vault.getState();
    const vaultAdmin = parseVaultAdmin(vaultState, vaultAdminAuthority);
    const vaultReservesState = vaultReservesMap ? vaultReservesMap : await this.loadVaultReserves(vaultState);
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
        vault,
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
          adminTokenAta
        );
      })
    );

    return [createAtaIx, ...withdrawIxs];
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
   * @param [vaultReservesMap] - optional parameter; a hashmap from each reserve pubkey to the reserve state. Optional. If provided the function will be significantly faster as it will not have to fetch the reserves
   * @param [farmState] - the state of the vault farm, if the vault has a farm. Optional. If not provided, it will be fetched
   * @returns - an instance of DepositIxs which contains the instructions to deposit in vault and the instructions to stake the shares in the farm if the vault has a farm
   */
  async depositIxs(
    user: TransactionSigner,
    vault: KaminoVault,
    tokenAmount: Decimal,
    vaultReservesMap?: Map<Address, KaminoReserve>,
    farmState?: FarmState
  ): Promise<DepositIxs> {
    const vaultState = await vault.getState();

    const tokenProgramID = vaultState.tokenProgram;
    const userTokenAta = await getAssociatedTokenAddress(vaultState.tokenMint, user.address, tokenProgramID);
    const createAtasIxs: Instruction[] = [];
    const closeAtasIxs: Instruction[] = [];
    if (vaultState.tokenMint === WRAPPED_SOL_MINT) {
      const [{ ata: wsolAta, createAtaIx: createWsolAtaIxn }] = await createAtasIdempotent(user, [
        {
          mint: WRAPPED_SOL_MINT,
          tokenProgram: TOKEN_PROGRAM_ADDRESS,
        },
      ]);
      createAtasIxs.push(createWsolAtaIxn);
      const transferWsolIxs = getTransferWsolIxs(
        user,
        wsolAta,
        lamports(
          BigInt(numberToLamportsDecimal(tokenAmount, vaultState.tokenMintDecimals.toNumber()).ceil().toString())
        )
      );
      createAtasIxs.push(...transferWsolIxs);
    }

    const [{ ata: userSharesAta, createAtaIx: createSharesAtaIxs }] = await createAtasIdempotent(user, [
      {
        mint: vaultState.sharesMint,
        tokenProgram: TOKEN_PROGRAM_ADDRESS,
      },
    ]);
    createAtasIxs.push(createSharesAtaIxs);

    const eventAuthority = await getEventAuthorityPda(this._kaminoVaultProgramId);
    const depositAccounts: DepositAccounts = {
      user: user,
      vaultState: vault.address,
      tokenVault: vaultState.tokenVault,
      tokenMint: vaultState.tokenMint,
      baseVaultAuthority: vaultState.baseVaultAuthority,
      sharesMint: vaultState.sharesMint,
      userTokenAta: userTokenAta,
      userSharesAta: userSharesAta,
      tokenProgram: tokenProgramID,
      klendProgram: this._kaminoLendProgramId,
      sharesTokenProgram: TOKEN_PROGRAM_ADDRESS,
      eventAuthority: eventAuthority,
      program: this._kaminoVaultProgramId,
    };

    const depositArgs: DepositArgs = {
      maxAmount: new BN(
        numberToLamportsDecimal(tokenAmount, vaultState.tokenMintDecimals.toNumber()).floor().toString()
      ),
    };

    let depositIx = deposit(depositArgs, depositAccounts, undefined, this._kaminoVaultProgramId);

    const vaultReserves = this.getVaultReserves(vaultState);

    const vaultReservesState = vaultReservesMap ? vaultReservesMap : await this.loadVaultReserves(vaultState);
    depositIx = this.appendRemainingAccountsForVaultReserves(depositIx, vaultReserves, vaultReservesState);

    const depositIxs: DepositIxs = {
      depositIxs: [...createAtasIxs, depositIx, ...closeAtasIxs],
      stakeInFarmIfNeededIxs: [],
    };

    // if there is no farm, we can return the deposit instructions, otherwise include the stake ix in the response
    if (!(await vault.hasFarm())) {
      return depositIxs;
    }

    // if there is a farm, stake the shares
    const stakeSharesIxs = await this.stakeSharesIxs(user, vault, undefined, farmState);
    depositIxs.stakeInFarmIfNeededIxs = stakeSharesIxs;
    return depositIxs;
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
    const vaultState = await vault.getState();

    let sharesToStakeLamports = new Decimal(U64_MAX);
    if (sharesAmount) {
      sharesToStakeLamports = numberToLamportsDecimal(sharesAmount, vaultState.sharesMintDecimals.toNumber());
    }

    // if tokens to be staked are 0 or vault has no farm there is no stake needed
    if (sharesToStakeLamports.lte(0) || !(await vault.hasFarm())) {
      return [];
    }

    // returns the ix to create the farm state account if needed and the ix to stake the shares
    return getFarmStakeIxs(this.getConnection(), user, sharesToStakeLamports, vaultState.vaultFarm, farmState);
  }

  /**
   * This function will return a struct with the instructions to unstake from the farm if necessary and the instructions for the missing ATA creation instructions, as well as one or multiple withdraw instructions, based on how many reserves it's needed to withdraw from. This might have to be split in multiple transactions
   * @param user - user to withdraw
   * @param vault - vault to withdraw from
   * @param shareAmount - share amount to withdraw (in tokens, not lamports), in order to withdraw everything, any value > user share amount
   * @param slot - current slot, used to estimate the interest earned in the different reserves with allocation from the vault
   * @param [vaultReservesMap] - optional parameter; a hashmap from each reserve pubkey to the reserve state. If provided the function will be significantly faster as it will not have to fetch the reserves
   * @param [farmState] - the state of the vault farm, if the vault has a farm. Optional. If not provided, it will be fetched
   * @returns an array of instructions to create missing ATAs if needed and the withdraw instructions
   */
  async withdrawIxs(
    user: TransactionSigner,
    vault: KaminoVault,
    shareAmountToWithdraw: Decimal,
    slot: Slot,
    vaultReservesMap?: Map<Address, KaminoReserve>,
    farmState?: FarmState
  ): Promise<WithdrawIxs> {
    const vaultState = await vault.getState();
    const hasFarm = await vault.hasFarm();

    const withdrawIxs: WithdrawIxs = {
      unstakeFromFarmIfNeededIxs: [],
      withdrawIxs: [],
      postWithdrawIxs: [],
    };

    // compute the total shares the user has (in ATA + in farm) and check if they want to withdraw everything or just a part
    let userSharesAtaBalance = new Decimal(0);
    const userSharesAta = await getAssociatedTokenAddress(vaultState.sharesMint, user.address);
    const userSharesAtaState = await fetchMaybeToken(this.getConnection(), userSharesAta);
    if (userSharesAtaState.exists) {
      const userSharesAtaBalanceInLamports = getTokenBalanceFromAccountInfoLamports(userSharesAtaState);
      userSharesAtaBalance = userSharesAtaBalanceInLamports.div(
        new Decimal(10).pow(vaultState.sharesMintDecimals.toString())
      );
    }

    let userSharesInFarm = new Decimal(0);
    if (hasFarm) {
      userSharesInFarm = await getUserSharesInTokensStakedInFarm(
        this.getConnection(),
        user.address,
        vaultState.vaultFarm,
        vaultState.sharesMintDecimals.toNumber()
      );
    }

    let sharesToWithdraw = shareAmountToWithdraw;
    const totalUserShares = userSharesAtaBalance.add(userSharesInFarm);
    let withdrawAllShares = false;
    if (sharesToWithdraw.gt(totalUserShares)) {
      sharesToWithdraw = new Decimal(U64_MAX.toString()).div(
        new Decimal(10).pow(vaultState.sharesMintDecimals.toString())
      );
      withdrawAllShares = true;
    }

    // if not enough shares in ATA unstake from farm
    const sharesInAtaAreEnoughForWithdraw = sharesToWithdraw.lte(userSharesAtaBalance);
    if (hasFarm && !sharesInAtaAreEnoughForWithdraw && userSharesInFarm.gt(0)) {
      // if we need to unstake we need to make sure share ata is created
      const [{ createAtaIx }] = await createAtasIdempotent(user, [
        {
          mint: vaultState.sharesMint,
          tokenProgram: TOKEN_PROGRAM_ADDRESS,
        },
      ]);
      withdrawIxs.unstakeFromFarmIfNeededIxs.push(createAtaIx);
      let shareLamportsToWithdraw = new Decimal(U64_MAX.toString());
      if (!withdrawAllShares) {
        const sharesToWithdrawFromFarm = sharesToWithdraw.sub(userSharesAtaBalance);
        shareLamportsToWithdraw = collToLamportsDecimal(
          sharesToWithdrawFromFarm,
          vaultState.sharesMintDecimals.toNumber()
        );
      }
      const unstakeAndWithdrawFromFarmIxs = await getFarmUnstakeAndWithdrawIxs(
        this.getConnection(),
        user,
        shareLamportsToWithdraw,
        vaultState.vaultFarm,
        farmState
      );
      withdrawIxs.unstakeFromFarmIfNeededIxs.push(unstakeAndWithdrawFromFarmIxs.unstakeIx);
      withdrawIxs.unstakeFromFarmIfNeededIxs.push(unstakeAndWithdrawFromFarmIxs.withdrawIx);
    }

    // if the vault has allocations withdraw otherwise wtihdraw from available ix
    const vaultAllocation = vaultState.vaultAllocationStrategy.find(
      (allocation) => allocation.reserve !== DEFAULT_PUBLIC_KEY
    );

    if (vaultAllocation) {
      const withdrawFromVaultIxs = await this.withdrawWithReserveIxs(
        user,
        vault,
        sharesToWithdraw,
        totalUserShares,
        slot,
        vaultReservesMap
      );
      withdrawIxs.withdrawIxs = withdrawFromVaultIxs;
    } else {
      const withdrawFromVaultIxs = await this.withdrawFromAvailableIxs(user, vault, sharesToWithdraw);
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

    // if we burn all of user's shares close its shares ATA
    const burnAllUserShares = sharesToWithdraw.gt(totalUserShares);
    if (burnAllUserShares) {
      const closeAtaIx = getCloseAccountInstruction(
        {
          account: userSharesAta,
          owner: user,
          destination: user.address,
        },
        { programAddress: TOKEN_PROGRAM_ADDRESS }
      );
      withdrawIxs.postWithdrawIxs.push(closeAtaIx);
    }

    return withdrawIxs;
  }

  private async withdrawFromAvailableIxs(
    user: TransactionSigner,
    vault: KaminoVault,
    shareAmount: Decimal
  ): Promise<Instruction[]> {
    const vaultState = await vault.getState();

    const userSharesAta = await getAssociatedTokenAddress(vaultState.sharesMint, user.address);
    const [{ ata: userTokenAta, createAtaIx }] = await createAtasIdempotent(user, [
      {
        mint: vaultState.tokenMint,
        tokenProgram: vaultState.tokenProgram,
      },
    ]);

    const shareLamportsToWithdraw = collToLamportsDecimal(shareAmount, vaultState.sharesMintDecimals.toNumber());
    const withdrawFromAvailableIxn = await this.withdrawFromAvailableIx(
      user,
      vault,
      vaultState,
      userSharesAta,
      userTokenAta,
      shareLamportsToWithdraw
    );

    return [createAtaIx, withdrawFromAvailableIxn];
  }

  private async withdrawWithReserveIxs(
    user: TransactionSigner,
    vault: KaminoVault,
    shareAmount: Decimal,
    allUserShares: Decimal,
    slot: Slot,
    vaultReservesMap?: Map<Address, KaminoReserve>
  ): Promise<Instruction[]> {
    const vaultState = await vault.getState();

    const vaultReservesState = vaultReservesMap ? vaultReservesMap : await this.loadVaultReserves(vaultState);
    const userSharesAta = await getAssociatedTokenAddress(vaultState.sharesMint, user.address);
    const [{ ata: userTokenAta, createAtaIx }] = await createAtasIdempotent(user, [
      {
        mint: vaultState.tokenMint,
        tokenProgram: vaultState.tokenProgram,
      },
    ]);

    const withdrawAllShares = shareAmount.gte(allUserShares);
    const actualSharesToWithdraw = shareAmount.lte(allUserShares) ? shareAmount : allUserShares;
    const shareLamportsToWithdraw = collToLamportsDecimal(
      actualSharesToWithdraw,
      vaultState.sharesMintDecimals.toNumber()
    );
    const tokensPerShare = await this.getTokensPerShareSingleVault(vault, slot);
    const sharesPerToken = new Decimal(1).div(tokensPerShare);
    const tokensToWithdraw = shareLamportsToWithdraw.mul(tokensPerShare);
    let tokenLeftToWithdraw = tokensToWithdraw;
    const availableTokens = new Decimal(vaultState.tokenAvailable.toString());
    tokenLeftToWithdraw = tokenLeftToWithdraw.sub(availableTokens);

    type ReserveWithTokensToWithdraw = { reserve: Address; shares: Decimal };

    const reserveWithSharesAmountToWithdraw: ReserveWithTokensToWithdraw[] = [];
    let isFirstWithdraw = true;

    if (tokenLeftToWithdraw.lte(0)) {
      // Availabe enough to withdraw all - using the first existent reserve
      const firstReserve = vaultState.vaultAllocationStrategy.find((reserve) => reserve.reserve !== DEFAULT_PUBLIC_KEY);
      if (withdrawAllShares) {
        reserveWithSharesAmountToWithdraw.push({
          reserve: firstReserve!.reserve,
          shares: new Decimal(U64_MAX.toString()),
        });
      } else {
        reserveWithSharesAmountToWithdraw.push({
          reserve: firstReserve!.reserve,
          shares: shareLamportsToWithdraw,
        });
      }
    } else {
      // Get decreasing order sorted available liquidity to withdraw from each reserve allocated to
      const reserveAllocationAvailableLiquidityToWithdraw = await this.getReserveAllocationAvailableLiquidityToWithdraw(
        vault,
        slot,
        vaultReservesState
      );
      // sort
      const reserveAllocationAvailableLiquidityToWithdrawSorted = [
        ...reserveAllocationAvailableLiquidityToWithdraw.entries(),
      ].sort((a, b) => b[1].sub(a[1]).toNumber());

      reserveAllocationAvailableLiquidityToWithdrawSorted.forEach(([key, availableLiquidityToWithdraw], _) => {
        if (tokenLeftToWithdraw.gt(0)) {
          let tokensToWithdrawFromReserve = Decimal.min(tokenLeftToWithdraw, availableLiquidityToWithdraw);
          if (isFirstWithdraw) {
            tokensToWithdrawFromReserve = tokensToWithdrawFromReserve.add(availableTokens);
            isFirstWithdraw = false;
          }
          if (withdrawAllShares) {
            reserveWithSharesAmountToWithdraw.push({ reserve: key, shares: new Decimal(U64_MAX.toString()) });
          } else {
            // round up to the nearest integer the shares to withdraw
            const sharesToWithdrawFromReserve = tokensToWithdrawFromReserve.mul(sharesPerToken).floor();
            reserveWithSharesAmountToWithdraw.push({ reserve: key, shares: sharesToWithdrawFromReserve });
          }

          tokenLeftToWithdraw = tokenLeftToWithdraw.sub(tokensToWithdrawFromReserve);
        }
      });
    }

    const withdrawIxs: Instruction[] = [];
    withdrawIxs.push(createAtaIx);
    for (let reserveIndex = 0; reserveIndex < reserveWithSharesAmountToWithdraw.length; reserveIndex++) {
      const reserveWithTokens = reserveWithSharesAmountToWithdraw[reserveIndex];
      const reserveState = vaultReservesState.get(reserveWithTokens.reserve);
      if (reserveState === undefined) {
        throw new Error(`Reserve ${reserveWithTokens.reserve} not found in vault reserves map`);
      }
      const marketAddress = reserveState.state.lendingMarket;

      const withdrawFromReserveIx = await this.withdrawIx(
        user,
        vault,
        vaultState,
        marketAddress,
        { address: reserveWithTokens.reserve, state: reserveState.state },
        userSharesAta,
        userTokenAta,
        reserveWithTokens.shares,
        vaultReservesState
      );
      withdrawIxs.push(withdrawFromReserveIx);
    }

    return withdrawIxs;
  }

  /**
   * This will trigger invest by balancing, based on weights, the reserve allocations of the vault. It can either withdraw or deposit into reserves to balance them. This is a function that should be cranked
   * @param payer wallet that pays the tx
   * @param vault - vault to invest from
   * @param skipComputationChecks - if true, the function will skip the computation checks and will invest all the reserves; it is useful for txs where we update reserve allocations and invest atomically
   * @returns - an array of invest instructions for each invest action required for the vault reserves
   */
  async investAllReservesIxs(
    payer: TransactionSigner,
    vault: KaminoVault,
    skipComputationChecks: boolean = false
  ): Promise<Instruction[]> {
    const vaultState = await vault.reloadState();
    const minInvestAmount = vaultState.minInvestAmount;
    const allReserves = this.getVaultReserves(vaultState);
    if (allReserves.length === 0) {
      throw new Error('No reserves found for the vault, please select at least one reserve for the vault');
    }
    const [allReservesStateMap, computedReservesAllocation] = await Promise.all([
      this.loadVaultReserves(vaultState),
      this.getVaultComputedReservesAllocation(vaultState),
    ]);
    const tokenProgram = await getAccountOwner(this.getConnection(), vaultState.tokenMint);
    const [{ createAtaIx }] = await createAtasIdempotent(payer, [{ mint: vaultState.tokenMint, tokenProgram }]);
    // compute total vault holdings and expected distribution based on weights
    const curentVaultAllocations = this.getVaultAllocations(vaultState);
    const reservesToDisinvestFrom: Address[] = [];
    const reservesToInvestInto: Address[] = [];

    for (let index = 0; index < allReserves.length; index++) {
      const reservePubkey = allReserves[index];
      const reserveState = allReservesStateMap.get(reservePubkey)!;
      const computedAllocation = computedReservesAllocation.targetReservesAllocation.get(reservePubkey)!;
      const currentCTokenAllocation = curentVaultAllocations.get(reservePubkey)!.ctokenAllocation;
      const currentAllocationCap = curentVaultAllocations.get(reservePubkey)!.tokenAllocationCap;

      const reserveCollExchangeRate = reserveState.getCollateralExchangeRate();
      const reserveAllocationLiquidityAmount = lamportsToDecimal(
        currentCTokenAllocation.div(reserveCollExchangeRate),
        vaultState.tokenMintDecimals.toNumber()
      );

      const diffInReserveTokens = computedAllocation.sub(reserveAllocationLiquidityAmount);
      const diffInReserveLamports = collToLamportsDecimal(diffInReserveTokens, vaultState.tokenMintDecimals.toNumber());
      // it is possible that the tokens to invest are > minInvestAmountLamports but the ctokens it represent are 0, which will make an invest move 0 tokens
      const diffInCtokenLamports = reserveCollExchangeRate.mul(diffInReserveLamports.abs());
      const actualDiffInLamports = diffInCtokenLamports.floor().div(reserveCollExchangeRate).floor();

      // if the diff for the reserve is smaller than the min invest amount, we do not need to invest or disinvest
      const minInvestAmountLamports = new Decimal(minInvestAmount.toString());
      if (actualDiffInLamports.gt(minInvestAmountLamports) || skipComputationChecks) {
        if (computedAllocation.lt(reserveAllocationLiquidityAmount)) {
          reservesToDisinvestFrom.push(reservePubkey);
        } else {
          const actualTarget = currentAllocationCap.gt(computedAllocation) ? computedAllocation : currentAllocationCap;
          const lamportsToAddToReserve = actualTarget.sub(reserveAllocationLiquidityAmount);
          if (lamportsToAddToReserve.gt(minInvestAmountLamports)) {
            reservesToInvestInto.push(reservePubkey);
          }
        }
      }
    }

    const investIxsPromises: Promise<Instruction[]>[] = [];
    // invest first the reserves from which we disinvest, then the other ones
    for (const reserve of reservesToDisinvestFrom) {
      const reserveState = allReservesStateMap.get(reserve);
      if (reserveState === null) {
        throw new Error(`Reserve ${reserve} not found`);
      }
      const investIxsPromise = this.investSingleReserveIxs(
        payer,
        vault,
        {
          address: reserve,
          state: reserveState!.state,
        },
        allReservesStateMap,
        false
      );
      investIxsPromises.push(investIxsPromise);
    }

    for (const reserve of reservesToInvestInto) {
      const reserveState = allReservesStateMap.get(reserve);
      if (reserveState === null) {
        throw new Error(`Reserve ${reserve} not found`);
      }
      const investIxsPromise = this.investSingleReserveIxs(
        payer,
        vault,
        {
          address: reserve,
          state: reserveState!.state,
        },
        allReservesStateMap,
        false
      );
      investIxsPromises.push(investIxsPromise);
    }

    let investIxs: Instruction[] = [];
    investIxs.push(createAtaIx);
    investIxs = await Promise.all(investIxsPromises).then((ixs) => ixs.flat());

    return investIxs;
  }

  // todo: make sure we also check the ata of the investor for the vault token exists
  /**
   * This will trigger invest by balancing, based on weights, the reserve allocation of the vault. It can either withdraw or deposit into the given reserve to balance it
   * @param payer wallet pubkey - the instruction is permissionless and does not require the vault admin, due to rounding between cTokens and the underlying, the payer may have to contribute 1 or more lamports of the underlying from their token account
   * @param vault - vault to invest from
   * @param reserve - reserve to invest into or disinvest from
   * @param [vaultReservesMap] - optional parameter; a hashmap from each reserve pubkey to the reserve state. If provided the function will be significantly faster as it will not have to fetch the reserves
   * @param [createAtaIfNeeded]
   * @returns - an array of invest instructions for each invest action required for the vault reserves
   */
  async investSingleReserveIxs(
    payer: TransactionSigner,
    vault: KaminoVault,
    reserve: ReserveWithAddress,
    vaultReservesMap?: Map<Address, KaminoReserve>,
    createAtaIfNeeded: boolean = true
  ): Promise<Instruction[]> {
    const vaultState = await vault.getState();
    const cTokenVault = await getCTokenVaultPda(vault.address, reserve.address, this._kaminoVaultProgramId);
    const [lendingMarketAuth] = await lendingMarketAuthPda(reserve.state.lendingMarket, this._kaminoLendProgramId);

    const ixs: Instruction[] = [];

    const tokenProgram = await getAccountOwner(this.getConnection(), vaultState.tokenMint);
    const [{ ata: payerTokenAta, createAtaIx }] = await createAtasIdempotent(payer, [
      { mint: vaultState.tokenMint, tokenProgram },
    ]);
    if (createAtaIfNeeded) {
      ixs.push(createAtaIx);
    }

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
      klendProgram: this._kaminoLendProgramId,
      instructionSysvarAccount: SYSVAR_INSTRUCTIONS_ADDRESS,
      tokenProgram: tokenProgram,
      payerTokenAccount: payerTokenAta,
      tokenMint: vaultState.tokenMint,
      reserveCollateralTokenProgram: TOKEN_PROGRAM_ADDRESS,
    };

    let investIx = invest(investAccounts, undefined, this._kaminoVaultProgramId);

    const vaultReserves = this.getVaultReserves(vaultState);
    const vaultReservesState = vaultReservesMap ? vaultReservesMap : await this.loadVaultReserves(vaultState);
    investIx = this.appendRemainingAccountsForVaultReserves(investIx, vaultReserves, vaultReservesState);
    return [createAtaIx, investIx];
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

    const eventAuthority = await getEventAuthorityPda(this._kaminoVaultProgramId);
    const withdrawAccounts: WithdrawAccounts = {
      withdrawFromAvailable: {
        user,
        vaultState: vault.address,
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
    const eventAuthority = await getEventAuthorityPda(this._kaminoVaultProgramId);
    const withdrawFromAvailableAccounts: WithdrawFromAvailableAccounts = {
      user,
      vaultState: vault.address,
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
    adminTokenAta: Address
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
    const vaultReservesState = await this.loadVaultReserves(vaultState);
    withdrawPendingFeesIxn = this.appendRemainingAccountsForVaultReserves(
      withdrawPendingFeesIxn,
      vaultReserves,
      vaultReservesState
    );

    return withdrawPendingFeesIxn;
  }

  /**
   * Sync a vault for lookup table; create and set the LUT for the vault if needed and fill it with all the needed accounts
   * @param authority - vault admin
   * @param vault the vault to sync and set the LUT for if needed
   * @param [vaultReservesMap] - optional parameter; a hashmap from each reserve pubkey to the reserve state. Optional. If provided the function will be significantly faster as it will not have to fetch the reserves
   * @returns a struct that contains a list of ix to create the LUT and assign it to the vault if needed + a list of ixs to insert all the accounts in the LUT
   */
  async syncVaultLookupTableIxs(
    authority: TransactionSigner,
    vault: KaminoVault,
    vaultReservesMap?: Map<Address, KaminoReserve>
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

    if (vaultReservesMap) {
      vaultReservesMap.forEach((reserve) => {
        allAccountsToBeInserted.push(reserve.state.lendingMarket);
        allAccountsToBeInserted.push(reserve.state.farmCollateral);
        allAccountsToBeInserted.push(reserve.state.farmDebt);
        allAccountsToBeInserted.push(reserve.state.liquidity.supplyVault);
        allAccountsToBeInserted.push(reserve.state.liquidity.feeVault);
        allAccountsToBeInserted.push(reserve.state.collateral.mintPubkey);
        allAccountsToBeInserted.push(reserve.state.collateral.supplyVault);
      });
    } else {
      const vaultReservesState = await this.loadVaultReserves(vaultState);
      vaultReservesState.forEach((reserve) => {
        allAccountsToBeInserted.push(reserve.state.lendingMarket);
        allAccountsToBeInserted.push(reserve.state.farmCollateral);
        allAccountsToBeInserted.push(reserve.state.farmDebt);
        allAccountsToBeInserted.push(reserve.state.liquidity.supplyVault);
        allAccountsToBeInserted.push(reserve.state.liquidity.feeVault);
        allAccountsToBeInserted.push(reserve.state.collateral.mintPubkey);
        allAccountsToBeInserted.push(reserve.state.collateral.supplyVault);
      });
    }

    if (vaultState.vaultFarm !== DEFAULT_PUBLIC_KEY) {
      allAccountsToBeInserted.push(vaultState.vaultFarm);
    }

    const setupLUTIfNeededIxs: Instruction[] = [];
    let lut = vaultState.vaultLookupTable;
    if (lut === DEFAULT_PUBLIC_KEY) {
      const recentSlot = await this.getConnection().getSlot({ commitment: 'confirmed' }).send();
      const [ix, address] = await initLookupTableIx(authority, recentSlot);
      setupLUTIfNeededIxs.push(ix);
      lut = address;

      // set the new LUT for the vault
      const updateVaultConfigIxs = await this.updateVaultConfigIxs(
        vault,
        new VaultConfigField.LookupTable(),
        lut.toString()
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
    // 1. Read the states
    const holdings = await this.getVaultHoldings(vaultState, slot, vaultReserves, currentSlot);

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

    const initialVaultAllocations = this.getVaultAllocations(vaultState);

    // 2. Compute the allocation
    return this.computeReservesAllocation(
      holdings.totalAUMIncludingFees.sub(holdings.pendingFees),
      new Decimal(vaultState.unallocatedWeight.toString()),
      new Decimal(vaultState.unallocatedTokensCap.toString()),
      initialVaultAllocations,
      vaultState.tokenMintDecimals.toNumber()
    );
  }

  private computeReservesAllocation(
    vaultAUM: Decimal,
    vaultUnallocatedWeight: Decimal,
    vaultUnallocatedCap: Decimal,
    initialVaultAllocations: Map<Address, ReserveAllocationOverview>,
    vaultTokenDecimals: number
  ) {
    return computeReservesAllocation(
      vaultAUM,
      vaultUnallocatedWeight,
      vaultUnallocatedCap,
      initialVaultAllocations,
      vaultTokenDecimals
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

    if (await vault.hasFarm()) {
      const userSharesInFarm = await getUserSharesInTokensStakedInFarm(
        this.getConnection(),
        user,
        vaultState.vaultFarm,
        vaultState.sharesMintDecimals.toNumber()
      );

      userShares.stakedShares = userSharesInFarm;
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
    const farmClient = new Farms(this.getConnection());
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
    vaults.forEach(async (vault) => {
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

      if (await vault.hasFarm()) {
        const userFarmState = allUserFarmStatesMap.get(state.vaultFarm);
        if (userFarmState) {
          const stakedShares = getSharesInFarmUserPosition(userFarmState, state.sharesMintDecimals.toNumber());
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
    });

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
   * @param [slot] - the slot at which we retrieve the tokens per share. Optional. If not provided, the function will fetch the current slot
   * @param [vaultReservesMap] - hashmap from each reserve pubkey to the reserve state. Optional. If provided the function will be significantly faster as it will not have to fetch the reserves
   * @param [currentSlot] - the latest confirmed slot. Optional. If provided the function will be  faster as it will not have to fetch the latest slot
   * @returns - token per share value
   */
  async getTokensPerShareSingleVault(
    vaultOrState: KaminoVault | VaultState,
    slot?: Slot,
    vaultReservesMap?: Map<Address, KaminoReserve>,
    currentSlot?: Slot
  ): Promise<Decimal> {
    // Determine if we have a KaminoVault or VaultState
    const vaultState = 'getState' in vaultOrState ? await vaultOrState.getState() : vaultOrState;

    if (vaultState.sharesIssued.isZero()) {
      return new Decimal(0);
    }

    const vaultReservesState = vaultReservesMap ? vaultReservesMap : await this.loadVaultReserves(vaultState);

    const sharesDecimal = lamportsToDecimal(
      vaultState.sharesIssued.toString(),
      vaultState.sharesMintDecimals.toString()
    );

    const holdings = await this.getVaultHoldings(vaultState, slot, vaultReservesState, currentSlot);
    const netAUM = holdings.totalAUMIncludingFees.sub(holdings.pendingFees);

    return netAUM.div(sharesDecimal);
  }

  /**
   * This method calculates the token per share value. This will always change based on interest earned from the vault, but calculating it requires a bunch of rpc requests. Caching this for a short duration would be optimal
   * @param [vaultsOverride] - a list of vaults to get the tokens per share for; if provided with state it will not fetch the state again. Optional
   * @param [vaultReservesMap] - optional parameter; a hashmap from each reserve pubkey to the reserve state. Optional. If provided the function will be significantly faster as it will not have to fetch the reserves
   * @param slot - current slot, used to estimate the interest earned in the different reserves with allocation from the vault
   * @returns - token per share value
   */
  async getTokensPerShareAllVaults(
    slot: Slot,
    vaultsOverride?: Array<KaminoVault>,
    vaultReservesMap?: Map<Address, KaminoReserve>
  ): Promise<Map<Address, Decimal>> {
    const vaults = vaultsOverride ? vaultsOverride : await this.getAllVaults();
    const vaultTokensPerShare = new Map<Address, Decimal>();
    for (const vault of vaults) {
      const tokensPerShare = await this.getTokensPerShareSingleVault(vault, slot, vaultReservesMap);
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

  private async getVaultsStates(vaults: Address[]): Promise<Array<VaultState | null>> {
    return await VaultState.fetchMultiple(this.getConnection(), vaults, this._kaminoVaultProgramId);
  }

  /**
   * This will return the amount of token invested from the vault into the given reserve
   * @param vaultState - the kamino vault to get invested amount in reserve for
   * @param slot - current slot
   * @param reserve - the reserve state to get vault invested amount in
   * @returns vault amount supplied in reserve in decimal
   */
  getSuppliedInReserve(vaultState: VaultState, slot: Slot, reserve: KaminoReserve): Decimal {
    let referralFeeBps = 0;
    const denominator = reserve.state.config.protocolTakeRatePct / 100;
    if (denominator > 0) {
      referralFeeBps = new Fraction(reserve.state.liquidity.absoluteReferralRateSf)
        .toDecimal()
        .div(denominator)
        .floor()
        .toNumber();
    }
    const reserveCollExchangeRate = reserve.getEstimatedCollateralExchangeRate(slot, referralFeeBps);

    const reserveAllocation = vaultState.vaultAllocationStrategy.find(
      (allocation) => allocation.reserve === reserve.address
    );
    if (!reserveAllocation) {
      throw new Error(`Reserve ${reserve.address} not found in vault allocation strategy`);
    }

    const reserveAllocationLiquidityAmountLamports = new Decimal(reserveAllocation.ctokenAllocation.toString()).div(
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
   * This will return the a map between reserve pubkey and the allocation overview for the reserve
   * @param vaultState - the kamino vault to get reserves allocation overview for
   * @returns a map between reserve pubkey and the allocation overview for the reserve
   */
  getVaultAllocations(vaultState: VaultState): Map<Address, ReserveAllocationOverview> {
    const vaultAllocations = new Map<Address, ReserveAllocationOverview>();

    vaultState.vaultAllocationStrategy.map((allocation) => {
      if (allocation.reserve === DEFAULT_PUBLIC_KEY) {
        return;
      }

      const allocationOverview: ReserveAllocationOverview = {
        targetWeight: new Decimal(allocation.targetAllocationWeight.toString()),
        tokenAllocationCap: new Decimal(allocation.tokenAllocationCap.toString()),
        ctokenAllocation: new Decimal(allocation.ctokenAllocation.toString()),
      };
      vaultAllocations.set(allocation.reserve, allocationOverview);
    });

    return vaultAllocations;
  }

  /**
   * This will return an unsorted hash map of all reserves that the given vault has allocations for, toghether with the amount that can be withdrawn from each of the reserves
   * @param vault - the kamino vault to get available liquidity to withdraw for
   * @param slot - current slot
   *@param [vaultReservesMap] - a hashmap from each reserve pubkey to the reserve state
   * @returns an HashMap of reserves (key) with the amount available to withdraw for each (value)
   */
  private async getReserveAllocationAvailableLiquidityToWithdraw(
    vault: KaminoVault,
    slot: Slot,
    vaultReservesMap: Map<Address, KaminoReserve>
  ): Promise<Map<Address, Decimal>> {
    const vaultState = await vault.getState();

    const reserveAllocationAvailableLiquidityToWithdraw = new Map<Address, Decimal>();
    vaultState.vaultAllocationStrategy.forEach((allocationStrategy) => {
      if (allocationStrategy.reserve === DEFAULT_PUBLIC_KEY) {
        return;
      }
      const reserve = vaultReservesMap.get(allocationStrategy.reserve);
      if (reserve === undefined) {
        throw new Error(`Reserve ${allocationStrategy.reserve} not found`);
      }
      let referralFeeBps = 0;
      const denominator = reserve.state.config.protocolTakeRatePct / 100;
      if (denominator > 0) {
        referralFeeBps = new Fraction(reserve.state.liquidity.absoluteReferralRateSf)
          .toDecimal()
          .div(denominator)
          .floor()
          .toNumber();
      }
      const reserveCollExchangeRate = reserve.getEstimatedCollateralExchangeRate(slot, referralFeeBps);
      const reserveAllocationLiquidityAmount = new Decimal(allocationStrategy.ctokenAllocation.toString()).div(
        reserveCollExchangeRate
      );
      const reserveAvailableLiquidityAmount = reserve.getLiquidityAvailableAmount();
      reserveAllocationAvailableLiquidityToWithdraw.set(
        allocationStrategy.reserve,
        Decimal.min(reserveAllocationLiquidityAmount, reserveAvailableLiquidityAmount)
      );
    });

    return reserveAllocationAvailableLiquidityToWithdraw;
  }

  /**
   * This will get the list of all reserve pubkeys that the vault has allocations for ex
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

  private async loadReserializedReserves(vaultReservesAddresses: Address[]) {
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
      this.loadReserializedReserves(chunk)
    );
    const reservesAndOracles = await getTokenOracleData(this.getConnection(), deserializedReserves, oracleAccounts);
    const kaminoReserves = new Map<Address, KaminoReserve>();
    reservesAndOracles.forEach(([reserve, oracle], index) => {
      if (!oracle) {
        throw Error(
          `Could not find oracle for ${parseTokenSymbol(reserve.config.tokenInfo.name)} (${
            vaultReservesAddresses[index]
          }) reserve in market ${reserve.lendingMarket}`
        );
      }
      const kaminoReserve = KaminoReserve.initialize(
        vaultReservesAddresses[index],
        reserve,
        oracle,
        this.getConnection(),
        this.recentSlotDurationMs
      );
      kaminoReserves.set(kaminoReserve.address, kaminoReserve);
    });

    return kaminoReserves;
  }

  /**
   * This will retrieve all the tokens that can be used as collateral by the users who borrow the token in the vault alongside details about the min and max loan to value ratio
   * @param vaultState - the vault state to load reserves for
   * @param [slot] - the slot for which to retrieve the vault collaterals for. Optional. If not provided the function will fetch the current slot
   * @param [vaultReservesMap] - hashmap from each reserve pubkey to the reserve state. Optional. If provided the function will be significantly faster as it will not have to fetch the reserves
   * @param [kaminoMarkets] - a list of all the kamino markets. Optional. If provided the function will be significantly faster as it will not have to fetch the markets
   * @param oracleAccounts (optional) all reserve oracle accounts, if not supplied will make an additional rpc call to fetch these accounts
   * @returns a hashmap from each reserve pubkey to the market overview of the collaterals that can be used and the min and max loan to value ratio in that market
   */
  async getVaultCollaterals(
    vaultState: VaultState,
    slot: Slot,
    vaultReservesMap?: Map<Address, KaminoReserve>,
    kaminoMarkets?: KaminoMarket[],
    oracleAccounts?: AllOracleAccounts
  ): Promise<Map<Address, MarketOverview>> {
    const vaultReservesStateMap = vaultReservesMap ? vaultReservesMap : await this.loadVaultReserves(vaultState);
    const vaultReservesState: KaminoReserve[] = [];

    const missingReserves = new Set<Address>([]);
    // filter the reserves that are not part of the vault allocation strategy
    vaultState.vaultAllocationStrategy.forEach(async (allocation) => {
      if (allocation.reserve === DEFAULT_PUBLIC_KEY) {
        return;
      }
      const reserve = vaultReservesStateMap.get(allocation.reserve);
      if (!reserve) {
        missingReserves.add(allocation.reserve);
        return;
      }

      vaultReservesState.push(reserve);
    });

    // read missing reserves
    const missingReserveAddresses = [...missingReserves];
    const missingReservesStates = (await Reserve.fetchMultiple(this.getConnection(), missingReserveAddresses))
      .map((reserve, index) => {
        if (!reserve) {
          return null;
        }
        return {
          address: missingReserveAddresses[index],
          state: reserve,
        };
      })
      .filter((state) => state !== null);
    const missingReservesAndOracles = await getTokenOracleData(
      this.getConnection(),
      missingReservesStates,
      oracleAccounts
    );
    missingReservesAndOracles.forEach(([reserve, oracle], index) => {
      const fetchedReserve = new KaminoReserve(
        reserve,
        missingReserveAddresses[index]!, // Set maintains order
        oracle!,
        this.getConnection(),
        this.recentSlotDurationMs
      );
      vaultReservesState.push(fetchedReserve);
    });

    const vaultCollateralsPerReserve: Map<Address, MarketOverview> = new Map();

    for (const reserve of vaultReservesState) {
      // try to read the market from the provided list, if it doesn't exist fetch it
      let lendingMarket: KaminoMarket | undefined = undefined;
      if (kaminoMarkets) {
        lendingMarket = kaminoMarkets?.find((market) => reserve.state.lendingMarket === market.address);
      }

      if (!lendingMarket) {
        const fetchedLendingMarket = await KaminoMarket.load(
          this.getConnection(),
          reserve.state.lendingMarket,
          DEFAULT_RECENT_SLOT_DURATION_MS
        );
        if (!fetchedLendingMarket) {
          throw Error(`Could not fetch lending market ${reserve.state.lendingMarket}`);
        }
        lendingMarket = fetchedLendingMarket;
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
   * @param [slot] - the slot for which to calculate the holdings. Optional. If not provided the function will fetch the current slot
   * @param [vaultReserves] - a hashmap from each reserve pubkey to the reserve state. Optional. If provided the function will be significantly faster as it will not have to fetch the reserves
   * @param [currentSlot] - the latest confirmed slot. Optional. If provided the function will be  faster as it will not have to fetch the latest slot
   * @returns an VaultHoldings object representing the amount available (uninvested) in vault, total amount invested in reseves and a breakdown of the amount invested in each reserve
   */
  async getVaultHoldings(
    vault: VaultState,
    slot?: Slot,
    vaultReserves?: Map<Address, KaminoReserve>,
    currentSlot?: Slot
  ): Promise<VaultHoldings> {
    const vaultHoldings: VaultHoldings = new VaultHoldings({
      available: new Decimal(vault.tokenAvailable.toString()),
      invested: new Decimal(0),
      investedInReserves: new Map<Address, Decimal>(),
      totalAUMIncludingFees: new Decimal(0),
      pendingFees: new Decimal(0),
    });

    const currentSlotToUse = currentSlot ?? (await this.getConnection().getSlot({ commitment: 'confirmed' }).send());
    const vaultReservesState = vaultReserves ? vaultReserves : await this.loadVaultReserves(vault);
    const decimals = new Decimal(vault.tokenMintDecimals.toString());

    vault.vaultAllocationStrategy.forEach((allocationStrategy) => {
      if (allocationStrategy.reserve === DEFAULT_PUBLIC_KEY) {
        return;
      }

      const reserve = vaultReservesState.get(allocationStrategy.reserve);
      if (reserve === undefined) {
        throw new Error(`Reserve ${allocationStrategy.reserve} not found`);
      }

      let reserveCollExchangeRate: Decimal;

      if (slot) {
        reserveCollExchangeRate = reserve.getEstimatedCollateralExchangeRate(slot, 0);
      } else {
        reserveCollExchangeRate = reserve.getCollateralExchangeRate();
      }
      const reserveAllocationLiquidityAmount = new Decimal(allocationStrategy.ctokenAllocation.toString()).div(
        reserveCollExchangeRate
      );

      vaultHoldings.invested = vaultHoldings.invested.add(reserveAllocationLiquidityAmount);
      vaultHoldings.investedInReserves.set(
        allocationStrategy.reserve,
        lamportsToDecimal(reserveAllocationLiquidityAmount, decimals)
      );
    });

    const currentPendingFees = new Fraction(vault.pendingFeesSf).toDecimal();
    let totalPendingFees = currentPendingFees;

    // if there is a slot passed and it is in the future we need to estimate the fees from current time until that moment
    if (slot && slot > currentSlotToUse) {
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
      totalAUMIncludingFees: totalAvailableDecimal.add(totalInvestedDecimal),
      pendingFees: pendingFees,
    });
  }

  /**
   * This will return an VaultOverview object that encapsulates all the information about the vault, including the holdings, reserves details, theoretical APY, utilization ratio and total borrowed amount
   * @param vault - the kamino vault to get available liquidity to withdraw for
   * @param price - the price of the token in the vault (e.g. USDC)
   * @param [slot] - the slot for which to retrieve the vault overview for. Optional. If not provided the function will fetch the current slot
   * @param [vaultReservesMap] - hashmap from each reserve pubkey to the reserve state. Optional. If provided the function will be significantly faster as it will not have to fetch the reserves
   * @param [currentSlot] - the latest confirmed slot. Optional. If provided the function will be  faster as it will not have to fetch the latest slot
   * @returns an VaultOverview object with details about the tokens available and invested in the vault, denominated in tokens and USD
   */
  async getVaultHoldingsWithPrice(
    vault: VaultState,
    price: Decimal,
    slot?: Slot,
    vaultReservesMap?: Map<Address, KaminoReserve>,
    currentSlot?: Slot
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
    vaultTokenPrice: Decimal,
    slot?: Slot,
    vaultReservesMap?: Map<Address, KaminoReserve>,
    kaminoMarkets?: KaminoMarket[],
    currentSlot?: Slot,
    tokensPrices?: Map<Address, Decimal>
  ): Promise<VaultOverview> {
    const vaultState = await vault.getState();
    const vaultReservesState = vaultReservesMap ? vaultReservesMap : await this.loadVaultReserves(vaultState);

    const vaultHoldingsWithUSDValuePromise = this.getVaultHoldingsWithPrice(
      vaultState,
      vaultTokenPrice,
      slot,
      vaultReservesState,
      currentSlot
    );

    const slotForOverview = slot ? slot : await this.getConnection().getSlot().send();
    const farmsClient = new Farms(this.getConnection());

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
      farmsClient,
      slotForOverview,
      tokensPrices
    );
    const vaultReservesFarmIncentivesPromise = this.getVaultReservesFarmsIncentives(
      vault,
      vaultTokenPrice,
      farmsClient,
      slotForOverview,
      vaultReservesState,
      tokensPrices
    );
    const vaultDelegatedFarmIncentivesPromise = this.getVaultDelegatedFarmRewardsAPY(
      vault,
      vaultTokenPrice,
      farmsClient,
      slotForOverview,
      tokensPrices
    );

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
    };
  }

  /**
   * This will return an aggregation of the current state of the vault with all the invested amounts and the utilization ratio of the vault
   * @param vault - the kamino vault to get available liquidity to withdraw for
   * @param slot - current slot
   * @param [vaultReservesMap] - hashmap from each reserve pubkey to the reserve state. Optional. If provided the function will be significantly faster as it will not have to fetch the reserves
   * @returns an VaultReserveTotalBorrowedAndInvested object with the total invested amount, total borrowed amount and the utilization ratio of the vault
   */
  async getTotalBorrowedAndInvested(
    vault: VaultState,
    slot: Slot,
    vaultReservesMap?: Map<Address, KaminoReserve>
  ): Promise<VaultReserveTotalBorrowedAndInvested> {
    const vaultReservesState = vaultReservesMap ? vaultReservesMap : await this.loadVaultReserves(vault);

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
      const reserveAllocationLiquidityAmountLamports = new Decimal(allocationStrategy.ctokenAllocation.toString()).div(
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

    const farmsSDK = new Farms(this.getConnection());
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
   * @param [vaultReservesMap] - hashmap from each reserve pubkey to the reserve state. Optional. If provided the function will be significantly faster as it will not have to fetch the reserves
   * @returns a hashmap from vault reserve pubkey to ReserveOverview object
   */
  async getVaultReservesDetails(
    vault: VaultState,
    slot: Slot,
    vaultReserves?: Map<Address, KaminoReserve>
  ): Promise<Map<Address, ReserveOverview>> {
    const vaultReservesState = vaultReserves ? vaultReserves : await this.loadVaultReserves(vault);
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
      const reserveOverview: ReserveOverview = {
        supplyAPY: new Decimal(reserve.totalSupplyAPY(slot)),
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
   * @param [vaultReservesMap] - hashmap from each reserve pubkey to the reserve state. Optional. If provided the function will be significantly faster as it will not have to fetch the reserves
   * @returns a struct containing estimated gross APY and net APY (gross - vault fees) for the vault
   */
  async getVaultTheoreticalAPY(
    vault: VaultState,
    slot: Slot,
    vaultReservesMap?: Map<Address, KaminoReserve>
  ): Promise<APYs> {
    const vaultReservesState = vaultReservesMap ? vaultReservesMap : await this.loadVaultReserves(vault);

    let totalWeights = new Decimal(0);
    let totalAPY = new Decimal(0);
    vault.vaultAllocationStrategy.forEach((allocationStrategy) => {
      if (allocationStrategy.reserve === DEFAULT_PUBLIC_KEY) {
        return;
      }

      const reserve = vaultReservesState.get(allocationStrategy.reserve);
      if (reserve === undefined) {
        throw new Error(`Reserve ${allocationStrategy.reserve} not found`);
      }

      const reserveAPY = new Decimal(reserve.totalSupplyAPY(slot));
      const weight = new Decimal(allocationStrategy.targetAllocationWeight.toString());
      const weightedAPY = reserveAPY.mul(weight);
      totalAPY = totalAPY.add(weightedAPY);
      totalWeights = totalWeights.add(weight);
    });
    if (totalWeights.isZero()) {
      return {
        grossAPY: new Decimal(0),
        netAPY: new Decimal(0),
      };
    }

    const grossAPY = totalAPY.div(totalWeights);
    const netAPY = grossAPY
      .mul(new Decimal(1).sub(new Decimal(vault.performanceFeeBps.toString()).div(FullBPSDecimal)))
      .mul(new Decimal(1).sub(new Decimal(vault.managementFeeBps.toString()).div(FullBPSDecimal)));
    return {
      grossAPY,
      netAPY,
    };
  }

  /**
   * This will return the APY of the vault based on the current invested amounts; for percentage it needs multiplication by 100
   * @param vault - the kamino vault to get APY for
   * @param slot - current slot
   * @param [vaultReservesMap] - hashmap from each reserve pubkey to the reserve state. Optional. If provided the function will be significantly faster as it will not have to fetch the reserves
   * @returns a struct containing estimated gross APY and net APY (gross - vault fees) for the vault
   */
  async getVaultActualAPY(
    vault: VaultState,
    slot: Slot,
    vaultReservesMap?: Map<Address, KaminoReserve>
  ): Promise<APYs> {
    const vaultReservesState = vaultReservesMap ? vaultReservesMap : await this.loadVaultReserves(vault);

    let totalAUM = new Decimal(vault.tokenAvailable.toString());
    let totalAPY = new Decimal(0);
    vault.vaultAllocationStrategy.forEach((allocationStrategy) => {
      if (allocationStrategy.reserve === DEFAULT_PUBLIC_KEY) {
        return;
      }

      const reserve = vaultReservesState.get(allocationStrategy.reserve);
      if (reserve === undefined) {
        throw new Error(`Reserve ${allocationStrategy.reserve} not found`);
      }

      const reserveAPY = new Decimal(reserve.totalSupplyAPY(slot));
      const exchangeRate = reserve.getEstimatedCollateralExchangeRate(slot, 0);
      const investedInReserve = exchangeRate.mul(new Decimal(allocationStrategy.ctokenAllocation.toString()));

      const weightedAPY = reserveAPY.mul(investedInReserve);
      totalAPY = totalAPY.add(weightedAPY);
      totalAUM = totalAUM.add(investedInReserve);
    });
    if (totalAUM.isZero()) {
      return {
        grossAPY: new Decimal(0),
        netAPY: new Decimal(0),
      };
    }

    const grossAPY = totalAPY.div(totalAUM);
    const netAPY = grossAPY
      .mul(new Decimal(1).sub(new Decimal(vault.performanceFeeBps.toString()).div(FullBPSDecimal)))
      .mul(new Decimal(1).sub(new Decimal(vault.managementFeeBps.toString()).div(FullBPSDecimal)));
    return {
      grossAPY,
      netAPY,
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
   * @param [vaultReservesMap] - hashmap from each reserve pubkey to the reserve state. Optional. If provided the function will be significantly faster as it will not have to fetch the reserves
   * @param [currentSlot] - the current slot. Optional. If not provided it will fetch the current slot
   * @param [previousNetAUM] - the previous AUM of the vault to compute the earned interest relative to this value. Optional. If not provided the function will estimate the total AUM at the slot of the last state update on chain
   * @param [currentSlot] - the latest confirmed slot. Optional. If provided the function will be  faster as it will not have to fetch the latest slot
   * @returns a struct of simulated vault holdings and earned interest
   */
  async calculateSimulatedHoldingsWithInterest(
    vaultState: VaultState,
    vaultReservesMap?: Map<Address, KaminoReserve>,
    slot?: Slot,
    previousNetAUM?: Decimal,
    currentSlot?: Slot
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

    const latestSlot = slot ? slot : await this.getConnection().getSlot({ commitment: 'confirmed' }).send();

    const currentHoldings = await this.getVaultHoldings(vaultState, latestSlot, vaultReservesMap, currentSlot);
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
   * @param [currentTimestamp] the current date. Optional. If not provided it will fetch the current unix timestamp
   * @returns a VaultFees struct of simulated management and interest fees
   */
  async calculateSimulatedFees(
    vaultState: VaultState,
    simulatedCurrentHoldingsWithInterest?: SimulatedVaultHoldingsWithEarnedInterest,
    currentTimestamp?: Date
  ): Promise<VaultFees> {
    const timestampNowInSeconds = currentTimestamp ? currentTimestamp.valueOf() / 1000 : Date.now() / 1000;
    const timestampLastUpdate = vaultState.lastFeeChargeTimestamp.toNumber();
    const timeElapsed = timestampNowInSeconds - timestampLastUpdate;

    const simulatedCurrentHoldings = simulatedCurrentHoldingsWithInterest
      ? simulatedCurrentHoldingsWithInterest
      : await this.calculateSimulatedHoldingsWithInterest(vaultState);

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
   * @param vault - the vault to read the farm APY for
   * @param vaultTokenPrice - the price of the vault token in USD (e.g. 1.0 for USDC)
   * @param [farmsClient] - the farms client to use. Optional. If not provided, the function will create a new one
   * @param [slot] - the slot to read the farm APY for. Optional. If not provided, the function will read the current slot
   * @returns the APY of the farm built on top of the vault
   */
  async getVaultRewardsAPY(
    vaultOrState: KaminoVault | VaultState,
    vaultTokenPrice: Decimal,
    farmsClient?: Farms,
    slot?: Slot,
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

    const tokensPerShare = await this.getTokensPerShareSingleVault(vaultState, slot);
    const sharePrice = tokensPerShare.mul(vaultTokenPrice);
    const stakedTokenMintDecimals = vaultState.sharesMintDecimals.toNumber();

    const kFarmsClient = farmsClient ? farmsClient : new Farms(this.getConnection());
    return getFarmIncentives(kFarmsClient, vaultState.vaultFarm, sharePrice, stakedTokenMintDecimals, tokensPrices);
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
    slot?: Slot,
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
    const tokensPerShare = await this.getTokensPerShareSingleVault(vaultState, slot);
    const sharePrice = tokensPerShare.mul(vaultTokenPrice);
    const stakedTokenMintDecimals = vaultState.sharesMintDecimals.toNumber();

    const kFarmsClient = farmsClient ? farmsClient : new Farms(this.getConnection());
    return getFarmIncentives(kFarmsClient, delegatedFarm, sharePrice, stakedTokenMintDecimals, tokensPrices);
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
    const vaultsTokenMints = new Set<Address>();

    const kFarmsMap = farmsMap ? farmsMap : new Map<Address, FarmState>();

    const farmsToFetch = new Set<Address>();
    const reservesToFetch = new Set<Address>();

    for (const vault of vaults) {
      const vaultState = await vault.getState();
      vaultsTokenMints.add(vaultState.tokenMint);
      const hasFarm = await vault.hasFarm();
      if (hasFarm) {
        const farmAddress = vaultState.vaultFarm;
        if (!kFarmsMap.has(farmAddress)) {
          farmsToFetch.add(farmAddress);
        } else {
          const farmState = kFarmsMap.get(farmAddress)!;
          farmState.rewardInfos.forEach((rewardInfo) => {
            if (rewardInfo.token.mint !== DEFAULT_PUBLIC_KEY) {
              vaultsTokenMints.add(rewardInfo.token.mint);
            }
          });
        }
      }

      const reserves = vaultState.vaultAllocationStrategy.map((allocationStrategy) => allocationStrategy.reserve);
      reserves.forEach((reserve) => {
        if (reserve === DEFAULT_PUBLIC_KEY) {
          return;
        }

        if (vaultReservesMap && !vaultReservesMap.has(reserve)) {
          const reserveState = vaultReservesMap.get(reserve)!;
          const supplyFarm = reserveState.state.farmCollateral;
          if (supplyFarm !== DEFAULT_PUBLIC_KEY) {
            if (!kFarmsMap.has(supplyFarm)) {
              farmsToFetch.add(supplyFarm);
            } else {
              const farmState = kFarmsMap.get(supplyFarm)!;
              farmState.rewardInfos.forEach((rewardInfo) => {
                if (rewardInfo.token.mint !== DEFAULT_PUBLIC_KEY) {
                  vaultsTokenMints.add(rewardInfo.token.mint);
                }
              });
            }
          }
        } else {
          reservesToFetch.add(reserve);
        }
      });
    }

    // fetch the reserves first so we can add their farms to farms to be fetched, if needed
    const missingReservesStates = await Reserve.fetchMultiple(this.getConnection(), Array.from(reservesToFetch));

    missingReservesStates.forEach((reserveState) => {
      if (reserveState) {
        const supplyFarm = reserveState.farmCollateral;
        if (supplyFarm !== DEFAULT_PUBLIC_KEY) {
          if (!kFarmsMap.has(supplyFarm)) {
            farmsToFetch.add(supplyFarm);
          } else {
            const farmState = kFarmsMap.get(supplyFarm)!;
            farmState.rewardInfos.forEach((rewardInfo) => {
              if (rewardInfo.token.mint !== DEFAULT_PUBLIC_KEY) {
                vaultsTokenMints.add(rewardInfo.token.mint);
              }
            });
          }
        }
      }
    });

    // fetch the missing farms
    const missingFarmsStates = await FarmState.fetchMultiple(this.getConnection(), Array.from(farmsToFetch));
    missingFarmsStates.forEach((farmState) => {
      if (farmState) {
        farmState.rewardInfos.forEach((rewardInfo) => {
          if (rewardInfo.token.mint !== DEFAULT_PUBLIC_KEY) {
            vaultsTokenMints.add(rewardInfo.token.mint);
          }
        });
      }
    });

    return vaultsTokenMints;
  }

  async getVaultReservesFarmsIncentives(
    vaultOrState: KaminoVault | VaultState,
    vaultTokenPrice: Decimal,
    farmsClient?: Farms,
    slot?: Slot,
    vaultReservesMap?: Map<Address, KaminoReserve>,
    tokensPrices?: Map<Address, Decimal>
  ): Promise<VaultReservesFarmsIncentives> {
    const vaultState = 'getState' in vaultOrState ? await vaultOrState.getState() : vaultOrState;

    const vaultReservesState = vaultReservesMap ? vaultReservesMap : await this.loadVaultReserves(vaultState);
    const currentSlot = slot ?? (await this.getConnection().getSlot({ commitment: 'confirmed' }).send());

    const holdings = await this.getVaultHoldings(vaultState, currentSlot, vaultReservesState);

    const vaultReservesAddresses = vaultState.vaultAllocationStrategy.map(
      (allocationStrategy) => allocationStrategy.reserve
    );

    const vaultReservesFarmsIncentives = new Map<Address, FarmIncentives>();
    let totalIncentivesApy = new Decimal(0);

    const kFarmsClient = farmsClient ? farmsClient : new Farms(this.getConnection());
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
        this._kaminoLendProgramId,
        kFarmsClient,
        currentSlot,
        reserveState.state,
        tokensPrices
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

    const farmClient = new Farms(this.getConnection());
    const userState = await getUserStatePDA(farmClient.getProgramID(), vaultState.vaultFarm, user);
    return getUserPendingRewardsInFarm(this.getConnection(), userState, vaultState.vaultFarm);
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

    const farmClient = new Farms(this.getConnection());
    const userState = await this.computeUserStatePDAForUserInDelegatedVaultFarm(
      farmClient.getProgramID(),
      vaultAddress,
      delegatedFarm,
      user
    );

    return getUserPendingRewardsInFarm(this.getConnection(), userState, delegatedFarm);
  }

  /// gets the delegated farm for a vault
  async getDelegatedFarmForVault(vault: Address): Promise<Address | undefined> {
    const response = await fetch(`${CDN_ENDPOINT}/resources.json`);
    if (!response.ok) {
      console.log(`Failed to fetch CDN for user pending rewards in vault delegated farm: ${response.statusText}`);
      return undefined;
    }
    const data = (await response.json()) as { 'mainnet-beta'?: { delegatedVaultFarms: any } };
    const delegatedVaultFarms = data['mainnet-beta']?.delegatedVaultFarms;
    if (!delegatedVaultFarms) {
      return undefined;
    }
    const delegatedFarmWithVault = delegatedVaultFarms.find((vaultWithFarm: any) => vaultWithFarm.vault === vault);
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
    const response = await fetch(`${CDN_ENDPOINT}/resources.json`);
    if (!response.ok) {
      console.log(`Failed to fetch CDN for get vaults with delegated farm`);
      return new Map<Address, Address>();
    }
    const data = (await response.json()) as { 'mainnet-beta'?: { delegatedVaultFarms: any } };
    const delegatedVaultFarms = data['mainnet-beta']?.delegatedVaultFarms;
    if (!delegatedVaultFarms) {
      return new Map<Address, Address>();
    }

    return new Map(
      delegatedVaultFarms.map((delegatedFarm: any) => [address(delegatedFarm.vault), address(delegatedFarm.farm)])
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
    vaultReservesMap?: Map<Address, KaminoReserve>
  ): Promise<Map<Address, Decimal>> {
    const vaultState = await vault.getState();

    const vaultReservesState = vaultReservesMap ? vaultReservesMap : await this.loadVaultReserves(vaultState);

    const vaultReserves = vaultState.vaultAllocationStrategy
      .map((allocationStrategy) => allocationStrategy.reserve)
      .filter((reserve) => reserve !== DEFAULT_PUBLIC_KEY);
    const pendingRewardsPerToken: Map<Address, Decimal> = new Map();

    const farmClient = new Farms(this.getConnection());
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
        reserveState.state.farmCollateral
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
    vaultReservesMap?: Map<Address, KaminoReserve>
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
    vaultReservesMap?: Map<Address, KaminoReserve>
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

    const farmClient = new Farms(this.getConnection());
    const pendingRewardsInVaultFarm = await this.getUserPendingRewardsInVaultFarm(user.address, vault);
    // if there are no pending rewards of their total is 0 no ix is needed
    const totalPendingRewards = Array.from(pendingRewardsInVaultFarm.values()).reduce(
      (acc, reward) => acc.add(reward),
      new Decimal(0)
    );
    if (totalPendingRewards.eq(0)) {
      return [];
    }
    return farmClient.claimForUserForFarmAllRewardsIx(user, vaultState.vaultFarm, false);
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

    const farmClient = new Farms(this.getConnection());

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

    return farmClient.claimForUserForFarmAllRewardsIx(user, delegatedFarm, true, [delegatee]);
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
    const vaultState = await vault.getState();

    const vaultReservesState = vaultReservesMap ? vaultReservesMap : await this.loadVaultReserves(vaultState);

    const vaultReserves = vaultState.vaultAllocationStrategy
      .map((allocationStrategy) => allocationStrategy.reserve)
      .filter((reserve) => reserve !== DEFAULT_PUBLIC_KEY);

    const ixs: Instruction[] = [];
    const farmClient = new Farms(this.getConnection());
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
        reserveState.state.farmCollateral
      );
      const totalPendingRewards = Array.from(pendingRewards.values()).reduce(
        (acc, reward) => acc.add(reward),
        new Decimal(0)
      );
      if (totalPendingRewards.eq(0)) {
        continue;
      }
      const ix = await farmClient.claimForUserForFarmAllRewardsIx(user, reserveState.state.farmCollateral, true, [
        delegatee[0],
      ]);
      ixs.push(...ix);
    }

    return ixs;
  }

  private appendRemainingAccountsForVaultReserves(
    ix: Instruction,
    vaultReserves: Address[],
    vaultReservesState: Map<Address, KaminoReserve>
  ): Instruction {
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
    return {
      ...ix,
      accounts: ix.accounts?.concat([...vaultReservesAccountMetas, ...vaultReservesLendingMarkets]),
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

  async hasFarm(): Promise<boolean> {
    const state = await this.getState();
    return state.vaultFarm !== DEFAULT_PUBLIC_KEY;
  }

  /**
   * This will return an VaultHoldings object which contains the amount available (uninvested) in vault, total amount invested in reseves and a breakdown of the amount invested in each reserve
   * @returns an VaultHoldings object representing the amount available (uninvested) in vault, total amount invested in reseves and a breakdown of the amount invested in each reserve
   */
  async getVaultHoldings(): Promise<VaultHoldings> {
    if (!this.state || !this.vaultReservesStateCache) {
      await this.reloadState();
      await this.reloadVaultReserves();
    }

    return await this.client.getVaultHoldings(this.state!, undefined, this.vaultReservesStateCache!, undefined);
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
   * This will return the APY of the vault based on the current invested amounts and the theoretical APY if all the available tokens were invested
   * @returns a struct containing actualAPY and theoreticalAPY for the vault
   */
  async getAPYs(slot?: Slot): Promise<VaultAPYs> {
    if (!this.state || !this.vaultReservesStateCache) {
      await this.reloadState();
      await this.reloadVaultReserves();
    }

    const latestSlot = slot ?? (await this.client.getConnection().getSlot({ commitment: 'confirmed' }).send());
    const actualApy = await this.client.getVaultActualAPY(this.state!, latestSlot, this.vaultReservesStateCache!);
    const theoreticalApy = await this.client.getVaultTheoreticalAPY(
      this.state!,
      latestSlot,
      this.vaultReservesStateCache!
    );

    return {
      actualAPY: actualApy,
      theoreticalAPY: theoreticalApy,
    };
  }

  /**
   * This method returns the exchange rate of the vault (tokens per share)
   * @returns - Decimal representing the exchange rate (tokens per share)
   */
  async getExchangeRate(slot?: Slot): Promise<Decimal> {
    if (!this.state || !this.vaultReservesStateCache) {
      await this.reloadState();
      await this.reloadVaultReserves();
    }

    const latestSlot = slot ?? (await this.client.getConnection().getSlot({ commitment: 'confirmed' }).send());
    const tokensPerShare = await this.client.getTokensPerShareSingleVault(this.state!, latestSlot);
    return tokensPerShare;
  }

  /**
   * This method returns the user shares balance for a given vault
   * @param user - user to calculate the shares balance for
   * @param vault - vault to calculate shares balance for
   * @returns - a struct of user share balance (staked in vault farm if the vault has a farm and unstaked) in decimal (not lamports)
   */
  async getUserShares(user: Address): Promise<UserSharesForVault> {
    return this.client.getUserSharesBalanceSingleVault(user, this);
  }

  /**
   * This function creates instructions to deposit into a vault. It will also create ATA creation instructions for the vault shares that the user receives in return
   * @param user - user to deposit
   * @param tokenAmount - token amount to be deposited, in decimals (will be converted in lamports)
   * @param [vaultReservesMap] - optional parameter; a hashmap from each reserve pubkey to the reserve state. Optional. If provided the function will be significantly faster as it will not have to fetch the reserves
   * @param [farmState] - the state of the vault farm, if the vault has a farm. Optional. If not provided, it will be fetched
   * @returns - an instance of DepositIxs which contains the instructions to deposit in vault and the instructions to stake the shares in the farm if the vault has a farm
   */
  async depositIxs(
    user: TransactionSigner,
    tokenAmount: Decimal,
    vaultReservesMap?: Map<Address, KaminoReserve>,
    farmState?: FarmState
  ): Promise<DepositIxs> {
    if (vaultReservesMap) {
      this.vaultReservesStateCache = vaultReservesMap;
    }
    return this.client.depositIxs(user, this, tokenAmount, this.vaultReservesStateCache, farmState);
  }

  /**
   * This function will return the missing ATA creation instructions, as well as one or multiple withdraw instructions, based on how many reserves it's needed to withdraw from. This might have to be split in multiple transactions
   * @param user - user to withdraw
   * @param shareAmount - share amount to withdraw (in tokens, not lamports), in order to withdraw everything, any value > user share amount
   * @param slot - current slot, used to estimate the interest earned in the different reserves with allocation from the vault
   * @param [vaultReservesMap] - optional parameter; a hashmap from each reserve pubkey to the reserve state. If provided the function will be significantly faster as it will not have to fetch the reserves
   * @param [farmState] - the state of the vault farm, if the vault has a farm. Optional. If not provided, it will be fetched
   * @returns an array of instructions to create missing ATAs if needed and the withdraw instructions
   */
  async withdrawIxs(
    user: TransactionSigner,
    shareAmount: Decimal,
    slot?: Slot,
    vaultReservesMap?: Map<Address, KaminoReserve>,
    farmState?: FarmState
  ): Promise<WithdrawIxs> {
    if (vaultReservesMap) {
      this.vaultReservesStateCache = vaultReservesMap;
    }

    const currentSlot = slot ?? (await this.client.getConnection().getSlot({ commitment: 'confirmed' }).send());

    return this.client.withdrawIxs(user, this, shareAmount, currentSlot, this.vaultReservesStateCache, farmState);
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
  constructor(args: {
    admin: TransactionSigner;
    tokenMint: Address;
    tokenMintProgramId: Address;
    performanceFeeRatePercentage: Decimal;
    managementFeeRatePercentage: Decimal;
    name: string;
    vaultTokenSymbol: string;
    vaultTokenName: string;
  }) {
    this.admin = args.admin;
    this.tokenMint = args.tokenMint;
    this.performanceFeeRatePercentage = args.performanceFeeRatePercentage;
    this.managementFeeRatePercentage = args.managementFeeRatePercentage;
    this.tokenMintProgramId = args.tokenMintProgramId;
    this.name = args.name;
    this.vaultTokenSymbol = args.vaultTokenSymbol;
    this.vaultTokenName = args.vaultTokenName;
  }

  getPerformanceFeeBps(): number {
    return this.performanceFeeRatePercentage.mul(100).toNumber();
  }

  getManagementFeeBps(): number {
    return this.managementFeeRatePercentage.mul(100).toNumber();
  }
}

export class ReserveAllocationConfig {
  readonly reserve: ReserveWithAddress;
  readonly targetAllocationWeight: number;
  readonly allocationCapDecimal: Decimal;

  constructor(reserve: ReserveWithAddress, targetAllocationWeight: number, allocationCapDecimal: Decimal) {
    this.reserve = reserve;
    this.targetAllocationWeight = targetAllocationWeight;
    this.allocationCapDecimal = allocationCapDecimal;
  }

  getAllocationCapLamports(): Decimal {
    return numberToLamportsDecimal(this.allocationCapDecimal, this.reserve.state.liquidity.mintDecimals.toNumber());
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

export async function getEventAuthorityPda(kaminoVaultProgramId: Address): Promise<Address> {
  return (
    await getProgramDerivedAddress({
      seeds: [Buffer.from(EVENT_AUTHORITY_SEED)],
      programAddress: kaminoVaultProgramId,
    })
  )[0];
}

function parseVaultAdmin(vault: VaultState, signer?: TransactionSigner) {
  return signer ?? noopSigner(vault.vaultAdminAuthority);
}

function parseVaultPendingAdmin(vault: VaultState, signer?: TransactionSigner) {
  return signer ?? noopSigner(vault.pendingAdmin);
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
  investedInReserves: Map<Address, Decimal>;
  pendingFees: Decimal;
  totalAUMIncludingFees: Decimal;

  constructor(params: {
    available: Decimal;
    invested: Decimal;
    investedInReserves: Map<Address, Decimal>;
    pendingFees: Decimal;
    totalAUMIncludingFees: Decimal;
  }) {
    this.available = params.available;
    this.invested = params.invested;
    this.investedInReserves = params.investedInReserves;
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
    };
  }

  print() {
    console.log('Holdings:');
    console.log('  Available:', this.available.toString());
    console.log('  Invested:', this.invested.toString());
    console.log('  Total AUM including fees:', this.totalAUMIncludingFees.toString());
    console.log('  Pending fees:', this.pendingFees.toString());
    console.log('  Invested in reserves:', pubkeyHashMapToJson(this.investedInReserves));
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
};

export type VaultReservesFarmsIncentives = {
  reserveFarmsIncentives: Map<Address, FarmIncentives>;
  totalIncentivesAPY: Decimal;
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
