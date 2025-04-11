import { BN } from '@coral-xyz/anchor';
import {
  AccountMeta,
  AddressLookupTableProgram,
  Connection,
  GetProgramAccountsResponse,
  Keypair,
  PublicKey,
  SystemProgram,
  SYSVAR_INSTRUCTIONS_PUBKEY,
  SYSVAR_RENT_PUBKEY,
  TransactionInstruction,
} from '@solana/web3.js';
import { getAssociatedTokenAddressSync, NATIVE_MINT, TOKEN_PROGRAM_ID, unpackAccount } from '@solana/spl-token';
import {
  getAssociatedTokenAddress,
  getTransferWsolIxs,
  getTokenOracleData,
  KaminoMarket,
  KaminoReserve,
  lamportsToDecimal,
  PubkeyHashMap,
  Reserve,
  UserState,
} from '../lib';
import {
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
  WithdrawAccounts,
  WithdrawArgs,
  withdrawFromAvailable,
  WithdrawFromAvailableAccounts,
  WithdrawFromAvailableArgs,
  withdrawPendingFees,
  WithdrawPendingFeesAccounts,
} from '../idl_codegen_kamino_vault/instructions';
import { VaultConfigField, VaultConfigFieldKind } from '../idl_codegen_kamino_vault/types';
import { VaultState } from '../idl_codegen_kamino_vault/accounts';
import Decimal from 'decimal.js';
import {
  bpsToPct,
  decodeVaultName,
  getTokenBalanceFromAccountInfoLamports,
  numberToLamportsDecimal,
  parseTokenSymbol,
  pubkeyHashMapToJson,
} from './utils';
import { deposit } from '../idl_codegen_kamino_vault/instructions';
import { withdraw } from '../idl_codegen_kamino_vault/instructions';
import { PROGRAM_ID } from '../idl_codegen/programId';
import { ReserveWithAddress } from './reserve';
import { Fraction } from './fraction';
import {
  createAtasIdempotent,
  createWsolAtaIfMissing,
  getKVaultSharesMetadataPda,
  lendingMarketAuthPda,
  PublicKeySet,
  SECONDS_PER_YEAR,
  U64_MAX,
  VAULT_INITIAL_DEPOSIT,
} from '../utils';
import bs58 from 'bs58';
import { getAccountOwner, getProgramAccounts } from '../utils/rpc';
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
import { batchFetch, collToLamportsDecimal, ZERO } from '@kamino-finance/kliquidity-sdk';
import { FullBPSDecimal } from '@kamino-finance/kliquidity-sdk/dist/utils/CreationParameters';
import { FarmState } from '@kamino-finance/farms-sdk/dist';
import { getAccountsInLUT, initLookupTableIx } from '../utils/lookupTable';
import {
  getFarmStakeIxs,
  getFarmUnstakeAndWithdrawIxs,
  getFarmUserStatePDA,
  getSharesInFarmUserPosition,
  getUserSharesInFarm,
} from './farm_utils';
import { getInitializeKVaultSharesMetadataIx, getUpdateSharesMetadataIx, resolveMetadata } from '../utils/metadata';

export const kaminoVaultId = new PublicKey('KvauGMspG5k6rtzrqqn7WNn3oZdyKqLKwK2XWQ8FLjd');
export const kaminoVaultStagingId = new PublicKey('stKvQfwRsQiKnLtMNVLHKS3exFJmZFsgfzBPWHECUYK');

const TOKEN_VAULT_SEED = 'token_vault';
const CTOKEN_VAULT_SEED = 'ctoken_vault';
const BASE_VAULT_AUTHORITY_SEED = 'authority';
const SHARES_SEED = 'shares';
const EVENT_AUTHORITY_SEED = '__event_authority';
export const METADATA_SEED = 'metadata';

export const METADATA_PROGRAM_ID: PublicKey = new PublicKey('metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s');

export const INITIAL_DEPOSIT_LAMPORTS = 1000;

/**
 * KaminoVaultClient is a class that provides a high-level interface to interact with the Kamino Vault program.
 */
export class KaminoVaultClient {
  private readonly _connection: Connection;
  private readonly _kaminoVaultProgramId: PublicKey;
  private readonly _kaminoLendProgramId: PublicKey;
  recentSlotDurationMs: number;

  constructor(
    connection: Connection,
    recentSlotDurationMs: number,
    kaminoVaultprogramId?: PublicKey,
    kaminoLendProgramId?: PublicKey
  ) {
    this._connection = connection;
    this.recentSlotDurationMs = recentSlotDurationMs;
    this._kaminoVaultProgramId = kaminoVaultprogramId ? kaminoVaultprogramId : kaminoVaultId;
    this._kaminoLendProgramId = kaminoLendProgramId ? kaminoLendProgramId : PROGRAM_ID;
  }

  getConnection() {
    return this._connection;
  }

  getProgramID() {
    return this._kaminoVaultProgramId;
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
  async printVault(vaultPubkey: PublicKey, vaultState?: VaultState) {
    const vault = vaultState ? vaultState : await VaultState.fetch(this.getConnection(), vaultPubkey);

    if (!vault) {
      console.log(`Vault ${vaultPubkey.toString()} not found`);
      return;
    }

    const kaminoVault = new KaminoVault(vaultPubkey, vault, this._kaminoVaultProgramId);
    const vaultName = this.decodeVaultName(vault.name);
    const slot = await this.getConnection().getSlot('confirmed');
    const tokensPerShare = await this.getTokensPerShareSingleVault(kaminoVault, slot);
    const holdings = await this.getVaultHoldings(vault, slot);

    const sharesIssued = new Decimal(vault.sharesIssued.toString()!).div(
      new Decimal(vault.sharesMintDecimals.toString())
    );

    console.log('Name: ', vaultName);
    console.log('Shares issued: ', sharesIssued);
    printHoldings(holdings);
    console.log('Tokens per share: ', tokensPerShare);
  }

  /**
   * This method will create a vault with a given config. The config can be changed later on, but it is recommended to set it up correctly from the start
   * @param vaultConfig - the config object used to create a vault
   * @returns vault: the keypair of the vault, used to sign the initialization transaction; initVaultIxs: a struct with ixs to initialize the vault and its lookup table + populateLUTIxs, a list to populate the lookup table which has to be executed in a separate transaction
   */
  async createVaultIxs(vaultConfig: KaminoVaultConfig): Promise<{ vault: Keypair; initVaultIxs: InitVaultIxs }> {
    const vaultState = Keypair.generate();
    const size = VaultState.layout.span + 8;

    const createVaultIx = SystemProgram.createAccount({
      fromPubkey: vaultConfig.admin,
      newAccountPubkey: vaultState.publicKey,
      lamports: await this.getConnection().getMinimumBalanceForRentExemption(size),
      space: size,
      programId: this._kaminoVaultProgramId,
    });

    const tokenVault = PublicKey.findProgramAddressSync(
      [Buffer.from(TOKEN_VAULT_SEED), vaultState.publicKey.toBytes()],
      this._kaminoVaultProgramId
    )[0];

    const baseVaultAuthority = PublicKey.findProgramAddressSync(
      [Buffer.from(BASE_VAULT_AUTHORITY_SEED), vaultState.publicKey.toBytes()],
      this._kaminoVaultProgramId
    )[0];

    const sharesMint = PublicKey.findProgramAddressSync(
      [Buffer.from(SHARES_SEED), vaultState.publicKey.toBytes()],
      this._kaminoVaultProgramId
    )[0];

    let adminTokenAccount: PublicKey;
    const prerequisiteIxs: TransactionInstruction[] = [];
    const cleanupIxs: TransactionInstruction[] = [];
    if (vaultConfig.tokenMint.equals(NATIVE_MINT)) {
      const { wsolAta, createAtaIxs, closeAtaIxs } = await createWsolAtaIfMissing(
        this.getConnection(),
        new Decimal(VAULT_INITIAL_DEPOSIT),
        vaultConfig.admin
      );
      adminTokenAccount = wsolAta;

      prerequisiteIxs.push(...createAtaIxs);
      cleanupIxs.push(...closeAtaIxs);
    } else {
      adminTokenAccount = getAssociatedTokenAddressSync(
        vaultConfig.tokenMint,
        vaultConfig.admin,
        false,
        vaultConfig.tokenMintProgramId
      );
    }

    const initVaultAccounts: InitVaultAccounts = {
      adminAuthority: vaultConfig.admin,
      vaultState: vaultState.publicKey,
      baseTokenMint: vaultConfig.tokenMint,
      tokenVault,
      baseVaultAuthority,
      sharesMint,
      systemProgram: SystemProgram.programId,
      rent: SYSVAR_RENT_PUBKEY,
      tokenProgram: vaultConfig.tokenMintProgramId,
      sharesTokenProgram: TOKEN_PROGRAM_ID,
      adminTokenAccount,
    };
    const initVaultIx = initVault(initVaultAccounts, this._kaminoVaultProgramId);

    // create and set up the vault lookup table
    const slot = await this.getConnection().getSlot();
    const [createLUTIx, lut] = initLookupTableIx(vaultConfig.admin, slot);

    const accountsToBeInserted = [
      vaultConfig.admin,
      vaultState.publicKey,
      vaultConfig.tokenMint,
      vaultConfig.tokenMintProgramId,
      baseVaultAuthority,
      sharesMint,
      SystemProgram.programId,
      SYSVAR_RENT_PUBKEY,
      TOKEN_PROGRAM_ID,
      this._kaminoLendProgramId,
      SYSVAR_INSTRUCTIONS_PUBKEY,
    ];
    const insertIntoLUTIxs = await this.insertIntoLookupTableIxs(vaultConfig.admin, lut, accountsToBeInserted, []);

    const setLUTIx = this.updateUninitialisedVaultConfigIx(
      vaultConfig.admin,
      vaultState.publicKey,
      new VaultConfigField.LookupTable(),
      lut.toString()
    );

    const ixs = [createVaultIx, initVaultIx, setLUTIx];

    if (vaultConfig.getPerformanceFeeBps() > 0) {
      const setPerformanceFeeIx = this.updateUninitialisedVaultConfigIx(
        vaultConfig.admin,
        vaultState.publicKey,
        new VaultConfigField.PerformanceFeeBps(),
        vaultConfig.getPerformanceFeeBps().toString()
      );
      ixs.push(setPerformanceFeeIx);
    }
    if (vaultConfig.getManagementFeeBps() > 0) {
      const setManagementFeeIx = this.updateUninitialisedVaultConfigIx(
        vaultConfig.admin,
        vaultState.publicKey,
        new VaultConfigField.ManagementFeeBps(),
        vaultConfig.getManagementFeeBps().toString()
      );
      ixs.push(setManagementFeeIx);
    }
    if (vaultConfig.name && vaultConfig.name.length > 0) {
      const setNameIx = this.updateUninitialisedVaultConfigIx(
        vaultConfig.admin,
        vaultState.publicKey,
        new VaultConfigField.Name(),
        vaultConfig.name
      );
      ixs.push(setNameIx);
    }

    const metadataIx = await this.getSetSharesMetadataIx(
      this.getConnection(),
      vaultConfig.admin,
      vaultState.publicKey,
      sharesMint,
      baseVaultAuthority,
      vaultConfig.vaultTokenSymbol,
      vaultConfig.vaultTokenName
    );

    return {
      vault: vaultState,
      initVaultIxs: {
        createAtaIfNeededIxs: prerequisiteIxs,
        initVaultIxs: ixs,
        createLUTIx,
        populateLUTIxs: insertIntoLUTIxs,
        cleanupIxs,
        initSharesMetadataIx: metadataIx,
      },
    };
  }

  /**
   * This method creates an instruction to set the shares metadata for a vault
   * @param vault - the vault to set the shares metadata for
   * @param tokenName - the name of the token in the vault (symbol; e.g. "USDC" which becomes "kVUSDC")
   * @param extraName - the extra string appended to the prefix("Kamino Vault USDC <extraName>")
   * @returns - an instruction to set the shares metadata for the vault
   */
  async getSetSharesMetadataIx(
    connection: Connection,
    vaultAdmin: PublicKey,
    vault: PublicKey,
    sharesMint: PublicKey,
    baseVaultAuthority: PublicKey,
    tokenName: string,
    extraName: string
  ) {
    const [sharesMintMetadata] = getKVaultSharesMetadataPda(sharesMint);

    const { name, symbol, uri } = resolveMetadata(vault, sharesMint, extraName, tokenName);

    const ix =
      (await connection.getAccountInfo(sharesMintMetadata)) === null
        ? await getInitializeKVaultSharesMetadataIx(
            connection,
            vaultAdmin,
            vault,
            sharesMint,
            baseVaultAuthority,
            name,
            symbol,
            uri
          )
        : await getUpdateSharesMetadataIx(
            connection,
            vaultAdmin,
            vault,
            sharesMint,
            baseVaultAuthority,
            name,
            symbol,
            uri
          );

    return ix;
  }

  /**
   * This method updates the vault reserve allocation cofnig for an exiting vault reserve, or adds a new reserve to the vault if it does not exist.
   * @param vault - vault to be updated
   * @param reserveAllocationConfig - new reserve allocation config
   * @param [signer] - optional parameter to pass a different signer for the instruction. If not provided, the admin of the vault will be used
   * @returns - a struct with an instruction to update the reserve allocation and an optional list of instructions to update the lookup table for the allocation changes
   */
  async updateReserveAllocationIxs(
    vault: KaminoVault,
    reserveAllocationConfig: ReserveAllocationConfig,
    signer?: PublicKey
  ): Promise<UpdateReserveAllocationIxs> {
    const vaultState: VaultState = await vault.getState(this.getConnection());
    const reserveState: Reserve = reserveAllocationConfig.getReserveState();

    const cTokenVault = getCTokenVaultPda(
      vault.address,
      reserveAllocationConfig.getReserveAddress(),
      this._kaminoVaultProgramId
    );

    const allocationSigner = signer ? signer : vaultState.vaultAdminAuthority;
    const updateReserveAllocationAccounts: UpdateReserveAllocationAccounts = {
      signer: allocationSigner,
      vaultState: vault.address,
      baseVaultAuthority: vaultState.baseVaultAuthority,
      reserveCollateralMint: reserveState.collateral.mintPubkey,
      reserve: reserveAllocationConfig.getReserveAddress(),
      ctokenVault: cTokenVault,
      systemProgram: SystemProgram.programId,
      rent: SYSVAR_RENT_PUBKEY,
      reserveCollateralTokenProgram: TOKEN_PROGRAM_ID,
    };

    const updateReserveAllocationArgs: UpdateReserveAllocationArgs = {
      weight: new BN(reserveAllocationConfig.targetAllocationWeight),
      cap: new BN(reserveAllocationConfig.getAllocationCapLamports().floor().toString()),
    };

    const updateReserveAllocationIx = updateReserveAllocation(
      updateReserveAllocationArgs,
      updateReserveAllocationAccounts,
      this._kaminoVaultProgramId
    );

    const accountsToAddToLUT = [
      reserveAllocationConfig.getReserveAddress(),
      cTokenVault,
      ...this.getReserveAccountsToInsertInLut(reserveState),
    ];

    const lendingMarketAuth = lendingMarketAuthPda(reserveState.lendingMarket, this._kaminoLendProgramId)[0];
    accountsToAddToLUT.push(lendingMarketAuth);

    const insertIntoLUTIxs = await this.insertIntoLookupTableIxs(
      vaultState.vaultAdminAuthority,
      vaultState.vaultLookupTable,
      accountsToAddToLUT
    );

    const updateReserveAllocationIxs: UpdateReserveAllocationIxs = {
      updateReserveAllocationIx,
      updateLUTIxs: insertIntoLUTIxs,
    };

    return updateReserveAllocationIxs;
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
    const vaultState = await vault.getState(this.getConnection());

    const reserveIsPartOfAllocation = vaultState.vaultAllocationStrategy.some((allocation) =>
      allocation.reserve.equals(reserve)
    );

    if (!reserveIsPartOfAllocation) {
      return undefined;
    }

    const accounts: RemoveAllocationAccounts = {
      vaultAdminAuthority: vaultState.vaultAdminAuthority,
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
   * @param [signer] the signer of the transaction. Optional. If not provided the admin of the vault will be used. It should be used when changing the admin of the vault if we want to build or batch multiple ixs in the same tx
   * @returns a struct that contains the instruction to update the field and an optional list of instructions to update the lookup table
   */
  async updateVaultConfigIxs(
    vault: KaminoVault,
    mode: VaultConfigFieldKind,
    value: string,
    signer?: PublicKey
  ): Promise<UpdateVaultConfigIxs> {
    const vaultState: VaultState = await vault.getState(this.getConnection());

    const updateVaultConfigAccs: UpdateVaultConfigAccounts = {
      vaultAdminAuthority: vaultState.vaultAdminAuthority,
      vaultState: vault.address,
      klendProgram: this._kaminoLendProgramId,
    };
    if (signer) {
      updateVaultConfigAccs.vaultAdminAuthority = signer;
    }

    const updateVaultConfigArgs: UpdateVaultConfigArgs = {
      entry: mode,
      data: Buffer.from([0]),
    };

    if (isNaN(+value)) {
      if (mode.kind === new VaultConfigField.Name().kind) {
        const data = Array.from(this.encodeVaultName(value));
        updateVaultConfigArgs.data = Buffer.from(data);
      } else {
        const data = new PublicKey(value);
        updateVaultConfigArgs.data = data.toBuffer();
      }
    } else {
      const buffer = Buffer.alloc(8);
      buffer.writeBigUInt64LE(BigInt(value.toString()));
      updateVaultConfigArgs.data = buffer;
    }

    const vaultReserves = this.getVaultReserves(vaultState);
    const vaultReservesState = await this.loadVaultReserves(vaultState);

    let vaultReservesAccountMetas: AccountMeta[] = [];
    let vaultReservesLendingMarkets: AccountMeta[] = [];
    vaultReserves.forEach((reserve) => {
      const reserveState = vaultReservesState.get(reserve);
      if (reserveState === undefined) {
        throw new Error(`Reserve ${reserve.toBase58()} not found`);
      }
      vaultReservesAccountMetas = vaultReservesAccountMetas.concat([
        { pubkey: reserve, isSigner: false, isWritable: true },
      ]);
      vaultReservesLendingMarkets = vaultReservesLendingMarkets.concat([
        { pubkey: reserveState.state.lendingMarket, isSigner: false, isWritable: false },
      ]);
    });

    const updateVaultConfigIx = updateVaultConfig(
      updateVaultConfigArgs,
      updateVaultConfigAccs,
      this._kaminoVaultProgramId
    );

    updateVaultConfigIx.keys = updateVaultConfigIx.keys.concat(vaultReservesAccountMetas);
    updateVaultConfigIx.keys = updateVaultConfigIx.keys.concat(vaultReservesLendingMarkets);

    const updateLUTIxs: TransactionInstruction[] = [];

    if (mode.kind === new VaultConfigField.PendingVaultAdmin().kind) {
      const newPubkey = new PublicKey(value);
      const insertIntoLutIxs = await this.insertIntoLookupTableIxs(
        vaultState.vaultAdminAuthority,
        vaultState.vaultLookupTable,
        [newPubkey]
      );
      updateLUTIxs.push(...insertIntoLutIxs);
    } else if (mode.kind === new VaultConfigField.Farm().kind) {
      const keysToAddToLUT = [new PublicKey(value)];
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
        const insertIntoLutIxs = await this.insertIntoLookupTableIxs(
          vaultState.vaultAdminAuthority,
          vaultState.vaultLookupTable,
          keysToAddToLUT
        );
        updateLUTIxs.push(...insertIntoLutIxs);
      } catch (error) {
        console.log(`Error fetching farm ${keysToAddToLUT[0].toString()} state`, error);
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
   */
  async setVaultFarmIxs(
    vault: KaminoVault,
    farm: PublicKey,
    errorOnOverride: boolean = true
  ): Promise<UpdateVaultConfigIxs> {
    const vaultHasFarm = await vault.hasFarm(this.getConnection());
    if (vaultHasFarm && errorOnOverride) {
      throw new Error('Vault already has a farm, if you want to override it set errorOnOverride to false');
    }
    return this.updateVaultConfigIxs(vault, new VaultConfigField.Farm(), farm.toBase58());
  }

  /**
   * This method updates the vault config for a vault that
   * @param vault - address of vault to be updated
   * @param mode - the field to be updated
   * @param value - the new value for the field to be updated (number or pubkey)
   * @returns - an instruction to update the vault config
   */
  private updateUninitialisedVaultConfigIx(
    admin: PublicKey,
    vault: PublicKey,
    mode: VaultConfigFieldKind,
    value: string
  ): TransactionInstruction {
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
        const data = new PublicKey(value);
        updateVaultConfigArgs.data = data.toBuffer();
      }
    } else {
      const buffer = Buffer.alloc(8);
      buffer.writeBigUInt64LE(BigInt(value.toString()));
      updateVaultConfigArgs.data = buffer;
    }

    const updateVaultConfigIx = updateVaultConfig(
      updateVaultConfigArgs,
      updateVaultConfigAccs,
      this._kaminoVaultProgramId
    );

    return updateVaultConfigIx;
  }

  /**
   * This function creates the instruction for the `pendingAdmin` of the vault to accept to become the owner of the vault (step 2/2 of the ownership transfer)
   * @param vault - vault to change the ownership for
   * @returns - an instruction to accept the ownership of the vault and a list of instructions to update the lookup table
   */
  async acceptVaultOwnershipIxs(vault: KaminoVault): Promise<AcceptVaultOwnershipIxs> {
    const vaultState: VaultState = await vault.getState(this.getConnection());

    const acceptOwneshipAccounts: UpdateAdminAccounts = {
      pendingAdmin: vaultState.pendingAdmin,
      vaultState: vault.address,
    };

    const acceptVaultOwnershipIx = updateAdmin(acceptOwneshipAccounts, this._kaminoVaultProgramId);

    // read the current LUT and create a new one for the new admin and backfill it
    const accountsInExistentLUT = (await getAccountsInLUT(this.getConnection(), vaultState.vaultLookupTable)).filter(
      (account) => !account.equals(vaultState.vaultAdminAuthority)
    );

    const LUTIxs: TransactionInstruction[] = [];
    const [initNewLUTIx, newLUT] = initLookupTableIx(vaultState.pendingAdmin, await this.getConnection().getSlot());

    const insertIntoLUTIxs = await this.insertIntoLookupTableIxs(
      vaultState.pendingAdmin,
      newLUT,
      accountsInExistentLUT,
      []
    );

    LUTIxs.push(...insertIntoLUTIxs);

    const updateVaultConfigIxs = await this.updateVaultConfigIxs(
      vault,
      new VaultConfigField.LookupTable(),
      newLUT.toString(),
      vaultState.pendingAdmin
    );
    LUTIxs.push(updateVaultConfigIxs.updateVaultConfigIx);
    LUTIxs.push(...updateVaultConfigIxs.updateLUTIxs);

    const acceptVaultOwnershipIxs: AcceptVaultOwnershipIxs = {
      acceptVaultOwnershipIx,
      initNewLUTIx,
      updateLUTIxs: LUTIxs,
    };

    return acceptVaultOwnershipIxs;
  }

  /**
   * This function creates the instruction for the admin to give up a part of the pending fees (which will be accounted as part of the vault)
   * @param vault - vault to give up pending fees for
   * @param maxAmountToGiveUp - the maximum amount of fees to give up, in tokens
   * @returns - an instruction to give up the specified pending fees
   */
  async giveUpPendingFeesIx(vault: KaminoVault, maxAmountToGiveUp: Decimal): Promise<TransactionInstruction> {
    const vaultState: VaultState = await vault.getState(this.getConnection());

    const giveUpPendingFeesAccounts: GiveUpPendingFeesAccounts = {
      vaultAdminAuthority: vaultState.vaultAdminAuthority,
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

    return giveUpPendingFees(giveUpPendingFeesArgs, giveUpPendingFeesAccounts, this._kaminoVaultProgramId);
  }

  /**
   * This method withdraws all the pending fees from the vault to the owner's token ATA
   * @param vault - vault for which the admin withdraws the pending fees
   * @param slot - current slot, used to estimate the interest earned in the different reserves with allocation from the vault
   * @param [vaultReservesMap] - a hashmap from each reserve pubkey to the reserve state. Optional. If provided the function will be significantly faster as it will not have to fetch the reserves
   * @returns - list of instructions to withdraw all pending fees, including the ATA creation instructions if needed
   */
  async withdrawPendingFeesIxs(
    vault: KaminoVault,
    slot: number,
    vaultReservesMap?: PubkeyHashMap<PublicKey, KaminoReserve>
  ): Promise<TransactionInstruction[]> {
    const vaultState: VaultState = await vault.getState(this.getConnection());
    const vaultReservesState = vaultReservesMap ? vaultReservesMap : await this.loadVaultReserves(vaultState);
    const [{ ata: adminTokenAta, createAtaIx }] = createAtasIdempotent(vaultState.vaultAdminAuthority, [
      {
        mint: vaultState.tokenMint,
        tokenProgram: TOKEN_PROGRAM_ID,
      },
    ]);

    const tokensToWithdraw = new Fraction(vaultState.pendingFeesSf).toDecimal();
    let tokenLeftToWithdraw = tokensToWithdraw;
    tokenLeftToWithdraw = tokenLeftToWithdraw.sub(new Decimal(vaultState.tokenAvailable.toString()));
    const reservesToWithdraw: PublicKey[] = [];

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
      const reserveAllocationAvailableLiquidityToWithdrawSorted = new PubkeyHashMap(
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
    const withdrawIxs: TransactionInstruction[] = await Promise.all(
      reservesToWithdraw.map(async (reserve, index) => {
        if (reserveStates[index] === null) {
          throw new Error(`Reserve ${reserve.toBase58()} not found`);
        }

        const reserveState = reserveStates[index]!;
        const marketAddress = reserveState.lendingMarket;

        return this.withdrawPendingFeesIx(
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

  // async closeVaultIx(vault: KaminoVault): Promise<TransactionInstruction> {
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
    user: PublicKey,
    vault: KaminoVault,
    tokenAmount: Decimal,
    vaultReservesMap?: PubkeyHashMap<PublicKey, KaminoReserve>,
    farmState?: FarmState
  ): Promise<DepositIxs> {
    const vaultState = await vault.getState(this.getConnection());

    const tokenProgramID = vaultState.tokenProgram;
    const userTokenAta = getAssociatedTokenAddress(vaultState.tokenMint, user, true, tokenProgramID);
    const createAtasIxs: TransactionInstruction[] = [];
    const closeAtasIxs: TransactionInstruction[] = [];
    if (vaultState.tokenMint.equals(NATIVE_MINT)) {
      const [{ ata: wsolAta, createAtaIx: createWsolAtaIxn }] = createAtasIdempotent(user, [
        {
          mint: NATIVE_MINT,
          tokenProgram: TOKEN_PROGRAM_ID,
        },
      ]);
      createAtasIxs.push(createWsolAtaIxn);
      const transferWsolIxs = getTransferWsolIxs(
        user,
        wsolAta,
        numberToLamportsDecimal(tokenAmount, vaultState.tokenMintDecimals.toNumber()).ceil()
      );
      createAtasIxs.push(...transferWsolIxs);
    }

    const [{ ata: userSharesAta, createAtaIx: createSharesAtaIxs }] = createAtasIdempotent(user, [
      {
        mint: vaultState.sharesMint,
        tokenProgram: TOKEN_PROGRAM_ID,
      },
    ]);
    createAtasIxs.push(createSharesAtaIxs);

    const eventAuthority = getEventAuthorityPda(this._kaminoVaultProgramId);
    const depoistAccounts: DepositAccounts = {
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
      sharesTokenProgram: TOKEN_PROGRAM_ID,
      eventAuthority: eventAuthority,
      program: this._kaminoVaultProgramId,
    };

    const depositArgs: DepositArgs = {
      maxAmount: new BN(numberToLamportsDecimal(tokenAmount, vaultState.tokenMintDecimals.toNumber()).toString()),
    };

    const depositIx = deposit(depositArgs, depoistAccounts, this._kaminoVaultProgramId);

    const vaultReserves = this.getVaultReserves(vaultState);

    const vaultReservesState = vaultReservesMap ? vaultReservesMap : await this.loadVaultReserves(vaultState);

    let vaultReservesAccountMetas: AccountMeta[] = [];
    let vaultReservesLendingMarkets: AccountMeta[] = [];
    vaultReserves.forEach((reserve) => {
      const reserveState = vaultReservesState.get(reserve);
      if (reserveState === undefined) {
        throw new Error(`Reserve ${reserve.toBase58()} not found`);
      }
      vaultReservesAccountMetas = vaultReservesAccountMetas.concat([
        { pubkey: reserve, isSigner: false, isWritable: true },
      ]);
      vaultReservesLendingMarkets = vaultReservesLendingMarkets.concat([
        { pubkey: reserveState.state.lendingMarket, isSigner: false, isWritable: false },
      ]);
    });
    depositIx.keys = depositIx.keys.concat(vaultReservesAccountMetas);
    depositIx.keys = depositIx.keys.concat(vaultReservesLendingMarkets);

    const depositIxs: DepositIxs = {
      depositIxs: [...createAtasIxs, depositIx, ...closeAtasIxs],
      stakeInFarmIfNeededIxs: [],
    };

    // if there is no farm, we can return the deposit instructions, otherwise include the stake ix in the response
    if (!(await vault.hasFarm(this.getConnection()))) {
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
    user: PublicKey,
    vault: KaminoVault,
    sharesAmount?: Decimal,
    farmState?: FarmState
  ): Promise<TransactionInstruction[]> {
    const vaultState = await vault.getState(this.getConnection());

    let sharesToStakeLamports = new Decimal(U64_MAX);
    if (sharesAmount) {
      sharesToStakeLamports = numberToLamportsDecimal(sharesAmount, vaultState.sharesMintDecimals.toNumber());
    }

    // if tokens to be staked are 0 or vault has no farm there is no stake needed
    if (sharesToStakeLamports.lte(0) || !vault.hasFarm(this.getConnection())) {
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
    user: PublicKey,
    vault: KaminoVault,
    shareAmount: Decimal,
    slot: number,
    vaultReservesMap?: PubkeyHashMap<PublicKey, KaminoReserve>,
    farmState?: FarmState
  ): Promise<WithdrawIxs> {
    const vaultState = await vault.getState(this.getConnection());
    const kaminoVault = new KaminoVault(vault.address, vaultState, vault.programId);

    const withdrawIxs: WithdrawIxs = {
      unstakeFromFarmIfNeededIxs: [],
      withdrawIxs: [],
    };

    const shareLamportsToWithdraw = collToLamportsDecimal(shareAmount, vaultState.sharesMintDecimals.toNumber());
    const hasFarm = await vault.hasFarm(this.getConnection());
    if (hasFarm) {
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
      (allocation) => !allocation.reserve.equals(PublicKey.default)
    );

    if (vaultAllocation) {
      const withdrawFromVaultIxs = await this.wihdrdrawWithReserveIxs(
        user,
        kaminoVault,
        shareAmount,
        slot,
        vaultReservesMap
      );
      withdrawIxs.withdrawIxs = withdrawFromVaultIxs;
    } else {
      const withdrawFromVaultIxs = await this.withdrawFromAvailableIxs(user, kaminoVault, shareAmount);
      withdrawIxs.withdrawIxs = withdrawFromVaultIxs;
    }

    return withdrawIxs;
  }

  private async withdrawFromAvailableIxs(
    user: PublicKey,
    vault: KaminoVault,
    shareAmount: Decimal
  ): Promise<TransactionInstruction[]> {
    const vaultState = await vault.getState(this.getConnection());
    const kaminoVault = new KaminoVault(vault.address, vaultState, vault.programId);

    const userSharesAta = getAssociatedTokenAddress(vaultState.sharesMint, user);
    const [{ ata: userTokenAta, createAtaIx }] = createAtasIdempotent(user, [
      {
        mint: vaultState.tokenMint,
        tokenProgram: vaultState.tokenProgram,
      },
    ]);

    const shareLamportsToWithdraw = collToLamportsDecimal(shareAmount, vaultState.sharesMintDecimals.toNumber());
    const withdrawFromAvailableIxn = await this.withdrawFromAvailableIx(
      user,
      kaminoVault,
      vaultState,
      userSharesAta,
      userTokenAta,
      shareLamportsToWithdraw
    );

    return [createAtaIx, withdrawFromAvailableIxn];
  }

  private async wihdrdrawWithReserveIxs(
    user: PublicKey,
    vault: KaminoVault,
    shareAmount: Decimal,
    slot: number,
    vaultReservesMap?: PubkeyHashMap<PublicKey, KaminoReserve>
  ): Promise<TransactionInstruction[]> {
    const vaultState = await vault.getState(this.getConnection());

    const vaultReservesState = vaultReservesMap ? vaultReservesMap : await this.loadVaultReserves(vaultState);

    const userSharesAta = getAssociatedTokenAddress(vaultState.sharesMint, user);
    const [{ ata: userTokenAta, createAtaIx }] = createAtasIdempotent(user, [
      {
        mint: vaultState.tokenMint,
        tokenProgram: vaultState.tokenProgram,
      },
    ]);

    const shareLamportsToWithdraw = collToLamportsDecimal(shareAmount, vaultState.sharesMintDecimals.toNumber());
    const tokensPerShare = await this.getTokensPerShareSingleVault(vault, slot);
    const sharesPerToken = new Decimal(1).div(tokensPerShare);
    const tokensToWithdraw = shareLamportsToWithdraw.mul(tokensPerShare);
    let tokenLeftToWithdraw = tokensToWithdraw;
    const availableTokens = new Decimal(vaultState.tokenAvailable.toString());
    tokenLeftToWithdraw = tokenLeftToWithdraw.sub(availableTokens);

    type ReserveWithTokensToWithdraw = { reserve: PublicKey; shares: Decimal };

    const reserveWithSharesAmountToWithdraw: ReserveWithTokensToWithdraw[] = [];
    let isFirstWithdraw = true;

    if (tokenLeftToWithdraw.lte(0)) {
      // Availabe enough to withdraw all - using first reserve as it does not matter
      reserveWithSharesAmountToWithdraw.push({
        reserve: vaultState.vaultAllocationStrategy[0].reserve,
        shares: shareLamportsToWithdraw,
      });
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
          // round up to the nearest integer the shares to withdraw
          const sharesToWithdrawFromReserve = tokensToWithdrawFromReserve.mul(sharesPerToken).ceil();
          reserveWithSharesAmountToWithdraw.push({ reserve: key, shares: sharesToWithdrawFromReserve });

          tokenLeftToWithdraw = tokenLeftToWithdraw.sub(tokensToWithdrawFromReserve);
        }
      });
    }

    const withdrawIxs: TransactionInstruction[] = [];
    withdrawIxs.push(createAtaIx);

    for (let reserveIndex = 0; reserveIndex < reserveWithSharesAmountToWithdraw.length; reserveIndex++) {
      const reserveWithTokens = reserveWithSharesAmountToWithdraw[reserveIndex];
      const reserveState = vaultReservesState.get(reserveWithTokens.reserve);
      if (reserveState === undefined) {
        throw new Error(`Reserve ${reserveWithTokens.reserve.toBase58()} not found in vault reserves map`);
      }
      const marketAddress = reserveState.state.lendingMarket;

      const isLastWithdraw = reserveIndex === reserveWithSharesAmountToWithdraw.length - 1;
      // if it is not last withdraw it means that we can pass all shares as we are withdrawing everything from that reserve
      let sharesToWithdraw = shareAmount;
      if (isLastWithdraw) {
        sharesToWithdraw = reserveWithTokens.shares;
      }

      const withdrawFromReserveIx = this.withdrawIx(
        user,
        vault,
        vaultState,
        marketAddress,
        { address: reserveWithTokens.reserve, state: reserveState.state },
        userSharesAta,
        userTokenAta,
        sharesToWithdraw,
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
   * @returns - an array of invest instructions for each invest action required for the vault reserves
   */
  async investAllReservesIxs(payer: PublicKey, vault: KaminoVault): Promise<TransactionInstruction[]> {
    const vaultState = await vault.getState(this.getConnection());
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
    const [{ ata: _payerTokenAta, createAtaIx }] = createAtasIdempotent(payer, [
      { mint: vaultState.tokenMint, tokenProgram },
    ]);
    // compute total vault holdings and expected distribution based on weights
    const curentVaultAllocations = this.getVaultAllocations(vaultState);
    const reservesToDisinvestFrom: PublicKey[] = [];
    const reservesToInvestInto: PublicKey[] = [];

    for (let index = 0; index < allReserves.length; index++) {
      const reservePubkey = allReserves[index];
      const reserveState = allReservesStateMap.get(reservePubkey)!;
      const computedAllocation = computedReservesAllocation.get(reservePubkey)!;
      const currentCTokenAllocation = curentVaultAllocations.get(reservePubkey)!.ctokenAllocation;
      const currentAllocationCap = curentVaultAllocations.get(reservePubkey)!.tokenAllocationCap;

      const reserveCollExchangeRate = reserveState.getCollateralExchangeRate();
      const reserveAllocationLiquidityAmount = lamportsToDecimal(
        currentCTokenAllocation.div(reserveCollExchangeRate),
        vaultState.tokenMintDecimals.toNumber()
      );

      const diffInReserveTokens = computedAllocation.sub(reserveAllocationLiquidityAmount);
      const diffInReserveLamports = collToLamportsDecimal(diffInReserveTokens, vaultState.tokenMintDecimals.toNumber());
      // if the diff for the reserve is smaller than the min invest amount, we do not need to invest or disinvest
      const minInvestAmountLamports = new Decimal(minInvestAmount.toString());
      if (diffInReserveLamports.abs().gt(minInvestAmountLamports)) {
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

    const investIxsPromises: Promise<TransactionInstruction[]>[] = [];
    // invest first the reserves from which we disinvest, then the other ones
    for (const reserve of reservesToDisinvestFrom) {
      const reserveState = allReservesStateMap.get(reserve);
      if (reserveState === null) {
        throw new Error(`Reserve ${reserve.toBase58()} not found`);
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
        throw new Error(`Reserve ${reserve.toBase58()} not found`);
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

    let investIxs: TransactionInstruction[] = [];
    investIxs.push(createAtaIx);
    investIxs = await Promise.all(investIxsPromises).then((ixs) => ixs.flat());

    return investIxs;
  }

  // todo: make sure we also check the ata of the investor for the vault token exists
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
    vault: KaminoVault,
    reserve: ReserveWithAddress,
    vaultReservesMap?: PubkeyHashMap<PublicKey, KaminoReserve>,
    createAtaIfNeeded: boolean = true
  ): Promise<TransactionInstruction[]> {
    console.log('create invest ix for reserve', reserve.address.toBase58());
    const vaultState = await vault.getState(this.getConnection());
    const cTokenVault = getCTokenVaultPda(vault.address, reserve.address, this._kaminoVaultProgramId);
    const lendingMarketAuth = lendingMarketAuthPda(reserve.state.lendingMarket, this._kaminoLendProgramId)[0];

    const ixs: TransactionInstruction[] = [];

    const tokenProgram = await getAccountOwner(this.getConnection(), vaultState.tokenMint);
    const [{ ata: payerTokenAta, createAtaIx }] = createAtasIdempotent(payer, [
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
      instructionSysvarAccount: SYSVAR_INSTRUCTIONS_PUBKEY,
      tokenProgram: tokenProgram,
      payerTokenAccount: payerTokenAta,
      tokenMint: vaultState.tokenMint,
      reserveCollateralTokenProgram: TOKEN_PROGRAM_ID,
    };

    const investIx = invest(investAccounts, this._kaminoVaultProgramId);

    const vaultReserves = this.getVaultReserves(vaultState);
    const vaultReservesState = vaultReservesMap ? vaultReservesMap : await this.loadVaultReserves(vaultState);

    let vaultReservesAccountMetas: AccountMeta[] = [];
    let vaultReservesLendingMarkets: AccountMeta[] = [];
    vaultReserves.forEach((reserve) => {
      const reserveState = vaultReservesState.get(reserve);
      if (reserveState === undefined) {
        throw new Error(`Reserve ${reserve.toBase58()} not found`);
      }
      vaultReservesAccountMetas = vaultReservesAccountMetas.concat([
        { pubkey: reserve, isSigner: false, isWritable: true },
      ]);
      vaultReservesLendingMarkets = vaultReservesLendingMarkets.concat([
        { pubkey: reserveState.state.lendingMarket, isSigner: false, isWritable: false },
      ]);
    });
    investIx.keys = investIx.keys.concat(vaultReservesAccountMetas);
    investIx.keys = investIx.keys.concat(vaultReservesLendingMarkets);

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

  private withdrawIx(
    user: PublicKey,
    vault: KaminoVault,
    vaultState: VaultState,
    marketAddress: PublicKey,
    reserve: ReserveWithAddress,
    userSharesAta: PublicKey,
    userTokenAta: PublicKey,
    shareAmountLamports: Decimal,
    vaultReservesState: PubkeyHashMap<PublicKey, KaminoReserve>
  ): TransactionInstruction {
    const lendingMarketAuth = lendingMarketAuthPda(marketAddress, this._kaminoLendProgramId)[0];

    const eventAuthority = getEventAuthorityPda(this._kaminoVaultProgramId);
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
        sharesTokenProgram: TOKEN_PROGRAM_ID,
        klendProgram: this._kaminoLendProgramId,
        eventAuthority: eventAuthority,
        program: this._kaminoVaultProgramId,
      },
      withdrawFromReserveAccounts: {
        vaultState: vault.address,
        reserve: reserve.address,
        ctokenVault: getCTokenVaultPda(vault.address, reserve.address, this._kaminoVaultProgramId),
        lendingMarket: marketAddress,
        lendingMarketAuthority: lendingMarketAuth,
        reserveLiquiditySupply: reserve.state.liquidity.supplyVault,
        reserveCollateralMint: reserve.state.collateral.mintPubkey,
        reserveCollateralTokenProgram: TOKEN_PROGRAM_ID,
        instructionSysvarAccount: SYSVAR_INSTRUCTIONS_PUBKEY,
      },
      eventAuthority: eventAuthority,
      program: this._kaminoVaultProgramId,
    };

    const withdrawArgs: WithdrawArgs = {
      sharesAmount: new BN(shareAmountLamports.floor().toString()),
    };

    const withdrawIxn = withdraw(withdrawArgs, withdrawAccounts, this._kaminoVaultProgramId);

    const vaultReserves = this.getVaultReserves(vaultState);

    let vaultReservesAccountMetas: AccountMeta[] = [];
    let vaultReservesLendingMarkets: AccountMeta[] = [];

    vaultReserves.forEach((reserve) => {
      const reserveState = vaultReservesState.get(reserve);
      if (reserveState === undefined) {
        throw new Error(`Reserve ${reserve.toBase58()} not found`);
      }

      vaultReservesAccountMetas = vaultReservesAccountMetas.concat([
        { pubkey: reserve, isSigner: false, isWritable: true },
      ]);
      vaultReservesLendingMarkets = vaultReservesLendingMarkets.concat([
        { pubkey: reserveState.state.lendingMarket, isSigner: false, isWritable: false },
      ]);
    });
    withdrawIxn.keys = withdrawIxn.keys.concat(vaultReservesAccountMetas);
    withdrawIxn.keys = withdrawIxn.keys.concat(vaultReservesLendingMarkets);

    return withdrawIxn;
  }

  private async withdrawFromAvailableIx(
    user: PublicKey,
    vault: KaminoVault,
    vaultState: VaultState,
    userSharesAta: PublicKey,
    userTokenAta: PublicKey,
    shareAmountLamports: Decimal
  ): Promise<TransactionInstruction> {
    const eventAuthority = getEventAuthorityPda(this._kaminoVaultProgramId);
    const withdrawFromAvailableAccounts: WithdrawFromAvailableAccounts = {
      user,
      vaultState: vault.address,
      tokenVault: vaultState.tokenVault,
      baseVaultAuthority: vaultState.baseVaultAuthority,
      userTokenAta: userTokenAta,
      tokenMint: vaultState.tokenMint,
      userSharesAta: userSharesAta,
      sharesMint: vaultState.sharesMint,
      tokenProgram: vaultState.tokenProgram,
      sharesTokenProgram: TOKEN_PROGRAM_ID,
      klendProgram: this._kaminoLendProgramId,
      eventAuthority: eventAuthority,
      program: this._kaminoVaultProgramId,
    };

    const withdrawFromAvailableArgs: WithdrawFromAvailableArgs = {
      sharesAmount: new BN(shareAmountLamports.floor().toString()),
    };

    return withdrawFromAvailable(withdrawFromAvailableArgs, withdrawFromAvailableAccounts, this._kaminoVaultProgramId);
  }

  private async withdrawPendingFeesIx(
    vault: KaminoVault,
    vaultState: VaultState,
    marketAddress: PublicKey,
    reserve: ReserveWithAddress,
    adminTokenAta: PublicKey
  ): Promise<TransactionInstruction> {
    const lendingMarketAuth = lendingMarketAuthPda(marketAddress, this._kaminoLendProgramId)[0];

    const withdrawPendingFeesAccounts: WithdrawPendingFeesAccounts = {
      vaultAdminAuthority: vaultState.vaultAdminAuthority,
      vaultState: vault.address,
      reserve: reserve.address,
      tokenVault: vaultState.tokenVault,
      ctokenVault: getCTokenVaultPda(vault.address, reserve.address, this._kaminoVaultProgramId),
      baseVaultAuthority: vaultState.baseVaultAuthority,
      tokenAta: adminTokenAta,
      tokenMint: vaultState.tokenMint,
      tokenProgram: TOKEN_PROGRAM_ID,
      /** CPI accounts */
      lendingMarket: marketAddress,
      lendingMarketAuthority: lendingMarketAuth,
      reserveLiquiditySupply: reserve.state.liquidity.supplyVault,
      reserveCollateralMint: reserve.state.collateral.mintPubkey,
      klendProgram: this._kaminoLendProgramId,
      instructionSysvarAccount: SYSVAR_INSTRUCTIONS_PUBKEY,
      reserveCollateralTokenProgram: TOKEN_PROGRAM_ID,
    };

    const withdrawPendingFeesIxn = withdrawPendingFees(withdrawPendingFeesAccounts, this._kaminoVaultProgramId);

    const vaultReserves = this.getVaultReserves(vaultState);
    const vaultReservesState = await this.loadVaultReserves(vaultState);

    let vaultReservesAccountMetas: AccountMeta[] = [];
    let vaultReservesLendingMarkets: AccountMeta[] = [];

    vaultReserves.forEach((reserve) => {
      const reserveState = vaultReservesState.get(reserve);
      if (reserveState === undefined) {
        throw new Error(`Reserve ${reserve.toBase58()} not found`);
      }

      vaultReservesAccountMetas = vaultReservesAccountMetas.concat([
        { pubkey: reserve, isSigner: false, isWritable: true },
      ]);
      vaultReservesLendingMarkets = vaultReservesLendingMarkets.concat([
        { pubkey: reserveState.state.lendingMarket, isSigner: false, isWritable: false },
      ]);
    });
    withdrawPendingFeesIxn.keys = withdrawPendingFeesIxn.keys.concat(vaultReservesAccountMetas);
    withdrawPendingFeesIxn.keys = withdrawPendingFeesIxn.keys.concat(vaultReservesLendingMarkets);

    return withdrawPendingFeesIxn;
  }

  /**
   * Sync a vault for lookup table; create and set the LUT for the vault if needed and fill it with all the needed accounts
   * @param vault the vault to sync and set the LUT for if needed
   * @param vaultReserves optional; the state of the reserves in the vault allocation
   * @param [vaultReservesMap] - optional parameter; a hashmap from each reserve pubkey to the reserve state. Optional. If provided the function will be significantly faster as it will not have to fetch the reserves
   * @returns a struct that contains a list of ix to create the LUT and assign it to the vault if needed + a list of ixs to insert all the accounts in the LUT
   */
  async syncVaultLookupTableIxs(
    vault: KaminoVault,
    vaultReservesMap?: PubkeyHashMap<PublicKey, KaminoReserve>
  ): Promise<SyncVaultLUTIxs> {
    const vaultState = await vault.getState(this.getConnection());
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

    if (!vaultState.vaultFarm.equals(PublicKey.default)) {
      allAccountsToBeInserted.push(vaultState.vaultFarm);
    }

    const setupLUTIfNeededIxs: TransactionInstruction[] = [];
    let lut = vaultState.vaultLookupTable;
    if (lut.equals(PublicKey.default)) {
      const recentSlot = await this.getConnection().getSlot();
      const [ix, address] = initLookupTableIx(vaultState.vaultAdminAuthority, recentSlot);
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

    const ixs: TransactionInstruction[] = [];
    let overridenExistentAccounts: PublicKey[] | undefined = undefined;
    if (vaultState.vaultLookupTable.equals(PublicKey.default)) {
      overridenExistentAccounts = [];
    }
    ixs.push(
      ...(await this.insertIntoLookupTableIxs(
        vaultState.vaultAdminAuthority,
        lut,
        allAccountsToBeInserted,
        overridenExistentAccounts
      ))
    );

    return {
      setupLUTIfNeededIxs,
      syncLUTIxs: ixs,
    };
  }

  private getReserveAccountsToInsertInLut(reserveState: Reserve): PublicKey[] {
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
   * This method inserts the missing keys from the provided keys into an existent lookup table
   * @param payer - payer wallet pubkey
   * @param lookupTable - lookup table to insert the keys into
   * @param keys - keys to insert into the lookup table
   * @param [accountsInLUT] - the existent accounts in the lookup table. Optional. If provided, the function will not fetch the accounts in the lookup table
   * @returns - an array of instructions to insert the missing keys into the lookup table
   */
  async insertIntoLookupTableIxs(
    payer: PublicKey,
    lookupTable: PublicKey,
    keys: PublicKey[],
    accountsInLUT?: PublicKey[]
  ): Promise<TransactionInstruction[]> {
    let lutContentsList = accountsInLUT;
    if (!accountsInLUT) {
      lutContentsList = await getAccountsInLUT(this.getConnection(), lookupTable);
    } else {
      lutContentsList = accountsInLUT;
    }

    const lutContents = new PublicKeySet(lutContentsList);

    const missingAccounts = keys.filter((key) => !lutContents.contains(key) && !key.equals(PublicKey.default));
    // deduplicate missing accounts and remove default accounts and convert it back to an array
    const missingAccountsList = new PublicKeySet(missingAccounts).toArray();

    const chunkSize = 20;
    const ixs: TransactionInstruction[] = [];

    for (let i = 0; i < missingAccountsList.length; i += chunkSize) {
      const chunk = missingAccountsList.slice(i, i + chunkSize);
      const ix = AddressLookupTableProgram.extendLookupTable({
        lookupTable,
        authority: payer,
        payer,
        addresses: chunk,
      });
      ixs.push(ix);
    }

    return ixs;
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
    // if there are no vault reserves or all have weight 0 everything has to be in Available
    const allReservesPubkeys = this.getVaultReserves(vaultState);
    const reservesAllocations = this.getVaultAllocations(vaultState);
    const allReservesHaveWeight0 = allReservesPubkeys.every((reserve) => {
      const allocation = reservesAllocations.get(reserve);
      return allocation?.targetWeight.isZero();
    });
    if (allReservesPubkeys.length === 0 || allReservesHaveWeight0) {
      const computedHoldings = new PubkeyHashMap<PublicKey, Decimal>();
      allReservesPubkeys.forEach((reserve) => {
        computedHoldings.set(reserve, new Decimal(0));
      });
      return computedHoldings;
    }

    const holdings = await this.getVaultHoldings(vaultState, slot, vaultReserves, currentSlot);
    const initialVaultAllocations = this.getVaultAllocations(vaultState);

    const allReserves = this.getVaultReserves(vaultState);

    let totalAllocation = new Decimal(0);
    initialVaultAllocations.forEach((allocation) => {
      totalAllocation = totalAllocation.add(allocation.targetWeight);
    });
    const expectedHoldingsDistribution = new PubkeyHashMap<PublicKey, Decimal>();
    allReserves.forEach((reserve) => {
      expectedHoldingsDistribution.set(reserve, new Decimal(0));
    });

    let totalLeftToInvest = holdings.totalAUMIncludingFees.sub(holdings.pendingFees);
    let currentAllocationSum = totalAllocation;
    const ONE = new Decimal(1);
    while (totalLeftToInvest.gt(ONE)) {
      const totalLeftover = totalLeftToInvest;
      for (const reserve of allReserves) {
        const reserveWithWeight = initialVaultAllocations.get(reserve);
        const targetAllocation = reserveWithWeight!.targetWeight.mul(totalLeftover).div(currentAllocationSum);
        const reserveCap = reserveWithWeight!.tokenAllocationCap;
        let amountToInvest = Decimal.min(targetAllocation, totalLeftToInvest);
        if (reserveCap.gt(ZERO)) {
          amountToInvest = Decimal.min(amountToInvest, reserveCap);
        }
        totalLeftToInvest = totalLeftToInvest.sub(amountToInvest);
        if (amountToInvest.eq(reserveCap) && reserveCap.gt(ZERO)) {
          currentAllocationSum = currentAllocationSum.sub(reserveWithWeight!.targetWeight);
        }
        const reserveHasPreallocation = expectedHoldingsDistribution.has(reserve);
        if (reserveHasPreallocation) {
          expectedHoldingsDistribution.set(reserve, expectedHoldingsDistribution.get(reserve)!.add(amountToInvest));
        } else {
          expectedHoldingsDistribution.set(reserve, amountToInvest);
        }
      }
    }

    return expectedHoldingsDistribution;
  }

  /**
   * This method returns the user shares balance for a given vault
   * @param user - user to calculate the shares balance for
   * @param vault - vault to calculate shares balance for
   * @returns - user share balance in tokens (not lamports)
   */
  async getUserSharesBalanceSingleVault(user: PublicKey, vault: KaminoVault): Promise<UserSharesForVault> {
    const vaultState = await vault.getState(this.getConnection());

    const userShares: UserSharesForVault = {
      unstakedShares: new Decimal(0),
      stakedShares: new Decimal(0),
      totalShares: new Decimal(0),
    };
    const userSharesAta = getAssociatedTokenAddress(vaultState.sharesMint, user);
    const userSharesAccountInfo = await this.getConnection().getAccountInfo(userSharesAta);
    if (userSharesAccountInfo) {
      const userSharesAccount = unpackAccount(userSharesAta, userSharesAccountInfo);

      userShares.unstakedShares = new Decimal(userSharesAccount.amount.toString()).div(
        new Decimal(10).pow(vaultState.sharesMintDecimals.toString())
      );
    }

    if (await vault.hasFarm(this.getConnection())) {
      const userSharesInFarm = await getUserSharesInFarm(
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
    user: PublicKey,
    vaultsOverride?: Array<KaminoVault>
  ): Promise<PubkeyHashMap<PublicKey, UserSharesForVault>> {
    const vaults = vaultsOverride ? vaultsOverride : await this.getAllVaults();
    // stores vault address for each userSharesAta
    const vaultUserShareBalance = new PubkeyHashMap<PublicKey, UserSharesForVault>();

    const vaultToUserFarmStateAddress = new PubkeyHashMap<PublicKey, PublicKey>();
    const userSharesAtaArray: PublicKey[] = [];
    vaults.forEach(async (vault) => {
      const state = vault.state;
      if (!state) {
        throw new Error(`Vault ${vault.address.toBase58()} not fetched`);
      }
      const userSharesAta = getAssociatedTokenAddress(state.sharesMint, user);
      userSharesAtaArray.push(userSharesAta);

      if (await vault.hasFarm(this.getConnection())) {
        const farmUserState = await getFarmUserStatePDA(this.getConnection(), user, state.vaultFarm);
        vaultToUserFarmStateAddress.set(vault.address, farmUserState);
      }
    });

    const [userSharesAtaAccounts, userFarmStates] = await Promise.all([
      this.getConnection().getMultipleAccountsInfo(userSharesAtaArray),
      UserState.fetchMultiple(this.getConnection(), Array.from(vaultToUserFarmStateAddress.values())),
    ]);

    userSharesAtaAccounts.forEach((userShareAtaAccount, index) => {
      const userSharesForVault: UserSharesForVault = {
        unstakedShares: new Decimal(0),
        stakedShares: new Decimal(0),
        totalShares: new Decimal(0),
      };
      if (!userShareAtaAccount) {
        vaultUserShareBalance.set(vaults[index].address, userSharesForVault);
      } else {
        userSharesForVault.unstakedShares = getTokenBalanceFromAccountInfoLamports(userShareAtaAccount).div(
          new Decimal(10).pow(vaults[index].state!.sharesMintDecimals.toString())
        );
        userSharesForVault.totalShares = userSharesForVault.unstakedShares.add(userSharesForVault.stakedShares);
        vaultUserShareBalance.set(vaults[index].address, userSharesForVault);
      }
    });

    userFarmStates.forEach((userFarmState, _) => {
      if (!userFarmState) {
        return;
      }
      const farmState = userFarmState.farmState;
      // find the vault which has the farm
      const vault = vaults.find((vault) => vault.state!.vaultFarm.equals(farmState));
      if (!vault) {
        throw new Error(`Vault with farm ${farmState.toBase58()} not found`);
      }

      const shares = getSharesInFarmUserPosition(userFarmState, vault.state!.sharesMintDecimals.toNumber());
      const userSharesBalance = vaultUserShareBalance.get(vault.address);
      userSharesBalance!.stakedShares = shares;
      vaultUserShareBalance.set(vault.address, userSharesBalance!);
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
    const vaultState = await vault.getState(this.getConnection());
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
    slot: number,
    vaultsOverride?: Array<KaminoVault>,
    vaultReservesMap?: PubkeyHashMap<PublicKey, KaminoReserve>
  ): Promise<PubkeyHashMap<PublicKey, Decimal>> {
    const vaults = vaultsOverride ? vaultsOverride : await this.getAllVaults();
    const vaultTokensPerShare = new PubkeyHashMap<PublicKey, Decimal>();
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
    ];

    const kaminoVaults: GetProgramAccountsResponse = await getProgramAccounts(
      this.getConnection(),
      this._kaminoVaultProgramId,
      VaultState.layout.span + 8,
      {
        commitment: this.getConnection().commitment ?? 'processed',
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
   * @returns a list of vaults
   */
  async getVaults(vaults?: Array<PublicKey>): Promise<Array<KaminoVault | null>> {
    if (!vaults) {
      vaults = (await this.getAllVaults()).map((x) => x.address);
    }
    const vaultStates = await batchFetch(vaults, (chunk) => this.getVaultsStates(chunk));
    return vaults.map((vault, index) => {
      const state = vaultStates[index];
      return state ? new KaminoVault(vault, state, this._kaminoVaultProgramId) : null;
    });
  }

  private async getVaultsStates(vaults: PublicKey[]): Promise<Array<VaultState | null>> {
    return await VaultState.fetchMultiple(this.getConnection(), vaults, this._kaminoVaultProgramId);
  }

  /**
   * This will return the amount of token invested from the vault into the given reserve
   * @param vault - the kamino vault to get invested amount in reserve for
   * @param slot - current slot
   * @param reserve - the reserve state to get vault invested amount in
   * @returns vault amount supplied in reserve in decimal
   */
  getSuppliedInReserve(vaultState: VaultState, slot: number, reserve: KaminoReserve): Decimal {
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

    const reserveAllocation = vaultState.vaultAllocationStrategy.find((allocation) =>
      allocation.reserve.equals(reserve.address)
    );
    if (!reserveAllocation) {
      throw new Error(`Reserve ${reserve.address.toBase58()} not found in vault allocation strategy`);
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
  getAllocationsDistribuionPct(vaultState: VaultState): PubkeyHashMap<PublicKey, Decimal> {
    const allocationsDistributionPct = new PubkeyHashMap<PublicKey, Decimal>();
    let totalAllocation = new Decimal(0);

    const filteredAllocations = vaultState.vaultAllocationStrategy.filter(
      (allocation) => !allocation.reserve.equals(PublicKey.default)
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
  getVaultAllocations(vaultState: VaultState): PubkeyHashMap<PublicKey, ReserveAllocationOverview> {
    const vaultAllocations = new PubkeyHashMap<PublicKey, ReserveAllocationOverview>();

    vaultState.vaultAllocationStrategy.map((allocation) => {
      if (allocation.reserve.equals(PublicKey.default)) {
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
    slot: number,
    vaultReservesMap: PubkeyHashMap<PublicKey, KaminoReserve>
  ): Promise<PubkeyHashMap<PublicKey, Decimal>> {
    const vaultState = await vault.getState(this.getConnection());

    const reserveAllocationAvailableLiquidityToWithdraw = new PubkeyHashMap<PublicKey, Decimal>();
    vaultState.vaultAllocationStrategy.forEach((allocationStrategy) => {
      if (allocationStrategy.reserve.equals(PublicKey.default)) {
        return;
      }
      const reserve = vaultReservesMap.get(allocationStrategy.reserve);
      if (reserve === undefined) {
        throw new Error(`Reserve ${allocationStrategy.reserve.toBase58()} not found`);
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
  getVaultReserves(vault: VaultState): PublicKey[] {
    return vault.vaultAllocationStrategy
      .filter((vaultAllocation) => !vaultAllocation.reserve.equals(PublicKey.default))
      .map((vaultAllocation) => vaultAllocation.reserve);
  }

  /**
   * This will load the onchain state for all the reserves that the vault has allocations for
   * @param vaultState - the vault state to load reserves for
   * @returns a hashmap from each reserve pubkey to the reserve state
   */
  async loadVaultReserves(vaultState: VaultState): Promise<PubkeyHashMap<PublicKey, KaminoReserve>> {
    return this.loadVaultsReserves([vaultState]);
  }

  /**
   * This will load the onchain state for all the reserves that the vaults have allocations for, deduplicating the reserves
   * @param vaults - the vault states to load reserves for
   * @returns a hashmap from each reserve pubkey to the reserve state
   */
  async loadVaultsReserves(vaults: VaultState[]): Promise<PubkeyHashMap<PublicKey, KaminoReserve>> {
    const vaultReservesAddressesSet = new PublicKeySet(vaults.flatMap((vault) => this.getVaultReserves(vault)));
    const vaultReservesAddresses = vaultReservesAddressesSet.toArray();
    const reserveAccounts = await this.getConnection().getMultipleAccountsInfo(vaultReservesAddresses, 'processed');

    const deserializedReserves = reserveAccounts.map((reserve, i) => {
      if (reserve === null) {
        // maybe reuse old here
        throw new Error(`Reserve account ${vaultReservesAddresses[i].toBase58()} was not found`);
      }
      const reserveAccount = Reserve.decode(reserve.data);
      if (!reserveAccount) {
        throw Error(`Could not parse reserve ${vaultReservesAddresses[i].toBase58()}`);
      }
      return reserveAccount;
    });

    const reservesAndOracles = await getTokenOracleData(this.getConnection(), deserializedReserves);

    const kaminoReserves = new PubkeyHashMap<PublicKey, KaminoReserve>();

    reservesAndOracles.forEach(([reserve, oracle], index) => {
      if (!oracle) {
        throw Error(`Could not find oracle for ${parseTokenSymbol(reserve.config.tokenInfo.name)} reserve`);
      }
      const kaminoReserve = KaminoReserve.initialize(
        reserveAccounts[index]!,
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
   * @returns a hashmap from each reserve pubkey to the market overview of the collaterals that can be used and the min and max loan to value ratio in that market
   */
  async getVaultCollaterals(
    vaultState: VaultState,
    slot: number,
    vaultReservesMap?: PubkeyHashMap<PublicKey, KaminoReserve>,
    kaminoMarkets?: KaminoMarket[]
  ): Promise<PubkeyHashMap<PublicKey, MarketOverview>> {
    const vaultReservesStateMap = vaultReservesMap ? vaultReservesMap : await this.loadVaultReserves(vaultState);
    const vaultReservesState = Array.from(vaultReservesStateMap.values());

    const vaultCollateralsPerReserve: PubkeyHashMap<PublicKey, MarketOverview> = new PubkeyHashMap();

    for (const reserve of vaultReservesState) {
      // try to read the market from the provided list, if it doesn't exist fetch it
      let lendingMarket: KaminoMarket | undefined = undefined;
      if (kaminoMarkets) {
        lendingMarket = kaminoMarkets?.find((market) =>
          reserve.state.lendingMarket.equals(new PublicKey(market.address))
        );
      }

      if (!lendingMarket) {
        const fetchedLendingMarket = await KaminoMarket.load(this.getConnection(), reserve.state.lendingMarket, slot);
        if (!fetchedLendingMarket) {
          throw Error(`Could not fetch lending market ${reserve.state.lendingMarket.toBase58()}`);
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
            !marketReserve.address.equals(reserve.address) &&
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
    slot?: number,
    vaultReserves?: PubkeyHashMap<PublicKey, KaminoReserve>,
    currentSlot?: number
  ): Promise<VaultHoldings> {
    const vaultHoldings: VaultHoldings = {
      available: new Decimal(vault.tokenAvailable.toString()),
      invested: new Decimal(0),
      investedInReserves: new PubkeyHashMap<PublicKey, Decimal>(),
      totalAUMIncludingFees: new Decimal(0),
      pendingFees: new Decimal(0),
    };

    const currentSlotToUse = currentSlot ? currentSlot : await this.getConnection().getSlot('confirmed');
    const vaultReservesState = vaultReserves ? vaultReserves : await this.loadVaultReserves(vault);
    const decimals = new Decimal(vault.tokenMintDecimals.toString());

    vault.vaultAllocationStrategy.forEach((allocationStrategy) => {
      if (allocationStrategy.reserve.equals(PublicKey.default)) {
        return;
      }

      const reserve = vaultReservesState.get(allocationStrategy.reserve);
      if (reserve === undefined) {
        throw new Error(`Reserve ${allocationStrategy.reserve.toBase58()} not found`);
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
      const timeAtPassedSlot = currentTimestampSec + (slot - currentSlotToUse) * this.recentSlotDurationMs;
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
    return {
      available: totalAvailableDecimal,
      invested: totalInvestedDecimal,
      investedInReserves: vaultHoldings.investedInReserves,
      totalAUMIncludingFees: totalAvailableDecimal.add(totalInvestedDecimal),
      pendingFees: pendingFees,
    };
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
    slot?: number,
    vaultReservesMap?: PubkeyHashMap<PublicKey, KaminoReserve>,
    currentSlot?: number
  ): Promise<VaultHoldingsWithUSDValue> {
    const holdings = await this.getVaultHoldings(vault, slot, vaultReservesMap, currentSlot);

    const investedInReservesUSD = new PubkeyHashMap<PublicKey, Decimal>();
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
    vaultReservesMap?: PubkeyHashMap<PublicKey, KaminoReserve>,
    kaminoMarkets?: KaminoMarket[],
    currentSlot?: number
  ): Promise<VaultOverview> {
    const vaultReservesState = vaultReservesMap ? vaultReservesMap : await this.loadVaultReserves(vault);

    const vaultHoldingsWithUSDValuePromise = await this.getVaultHoldingsWithPrice(
      vault,
      price,
      slot,
      vaultReservesState,
      currentSlot
    );

    const slotForOverview = slot ? slot : await this.getConnection().getSlot();

    const vaultTheoreticalAPYPromise = await this.getVaultTheoreticalAPY(vault, slotForOverview, vaultReservesState);
    const totalInvestedAndBorrowedPromise = await this.getTotalBorrowedAndInvested(
      vault,
      slotForOverview,
      vaultReservesState
    );
    const vaultCollateralsPromise = await this.getVaultCollaterals(
      vault,
      slotForOverview,
      vaultReservesState,
      kaminoMarkets
    );
    const reservesOverviewPromise = await this.getVaultReservesDetails(vault, slotForOverview, vaultReservesState);

    // all the async part of the functions above just read the vaultReservesState which is read beforehand, so excepting vaultCollateralsPromise they should do no additional network calls
    const [
      vaultHoldingsWithUSDValue,
      vaultTheoreticalAPYs,
      totalInvestedAndBorrowed,
      vaultCollaterals,
      reservesOverview,
    ] = await Promise.all([
      vaultHoldingsWithUSDValuePromise,
      vaultTheoreticalAPYPromise,
      totalInvestedAndBorrowedPromise,
      vaultCollateralsPromise,
      reservesOverviewPromise,
    ]);

    return {
      holdingsUSD: vaultHoldingsWithUSDValue,
      reservesOverview: reservesOverview,
      vaultCollaterals: vaultCollaterals,
      theoreticalSupplyAPY: vaultTheoreticalAPYs,
      totalBorrowed: totalInvestedAndBorrowed.totalBorrowed,
      utilizationRatio: totalInvestedAndBorrowed.utilizationRatio,
      totalSupplied: totalInvestedAndBorrowed.totalInvested,
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
    slot: number,
    vaultReservesMap?: PubkeyHashMap<PublicKey, KaminoReserve>
  ): Promise<VaultReserveTotalBorrowedAndInvested> {
    const vaultReservesState = vaultReservesMap ? vaultReservesMap : await this.loadVaultReserves(vault);

    const totalAvailable = lamportsToDecimal(
      new Decimal(vault.tokenAvailable.toString()),
      new Decimal(vault.tokenMintDecimals.toString())
    );
    let totalInvested = new Decimal(0);
    let totalBorrowed = new Decimal(0);

    vault.vaultAllocationStrategy.forEach((allocationStrategy) => {
      if (allocationStrategy.reserve.equals(PublicKey.default)) {
        return;
      }

      const reserve = vaultReservesState.get(allocationStrategy.reserve);
      if (reserve === undefined) {
        throw new Error(`Reserve ${allocationStrategy.reserve.toBase58()} not found`);
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
   * This will return an overview of each reserve that is part of the vault allocation
   * @param vault - the kamino vault to get available liquidity to withdraw for
   * @param slot - current slot
   * @param [vaultReservesMap] - hashmap from each reserve pubkey to the reserve state. Optional. If provided the function will be significantly faster as it will not have to fetch the reserves
   * @returns a hashmap from vault reserve pubkey to ReserveOverview object
   */
  async getVaultReservesDetails(
    vault: VaultState,
    slot: number,
    vaultReserves?: PubkeyHashMap<PublicKey, KaminoReserve>
  ): Promise<PubkeyHashMap<PublicKey, ReserveOverview>> {
    const vaultReservesState = vaultReserves ? vaultReserves : await this.loadVaultReserves(vault);
    const reservesDetails = new PubkeyHashMap<PublicKey, ReserveOverview>();

    vault.vaultAllocationStrategy.forEach((allocationStrategy) => {
      if (allocationStrategy.reserve.equals(PublicKey.default)) {
        return;
      }

      const reserve = vaultReservesState.get(allocationStrategy.reserve);
      if (reserve === undefined) {
        throw new Error(`Reserve ${allocationStrategy.reserve.toBase58()} not found`);
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
   * This will return the APY of the vault under the assumption that all the available tokens in the vault are all the time invested in the reserves as ratio; for percentage it needs multiplication by 100
   * @param vault - the kamino vault to get APY for
   * @param slot - current slot
   * @param [vaultReservesMap] - hashmap from each reserve pubkey to the reserve state. Optional. If provided the function will be significantly faster as it will not have to fetch the reserves
   * @returns a struct containing estimated gross APY and net APY (gross - vault fees) for the vault
   */
  async getVaultTheoreticalAPY(
    vault: VaultState,
    slot: number,
    vaultReservesMap?: PubkeyHashMap<PublicKey, KaminoReserve>
  ): Promise<APYs> {
    const vaultReservesState = vaultReservesMap ? vaultReservesMap : await this.loadVaultReserves(vault);

    let totalWeights = new Decimal(0);
    let totalAPY = new Decimal(0);
    vault.vaultAllocationStrategy.forEach((allocationStrategy) => {
      if (allocationStrategy.reserve.equals(PublicKey.default)) {
        return;
      }

      const reserve = vaultReservesState.get(allocationStrategy.reserve);
      if (reserve === undefined) {
        throw new Error(`Reserve ${allocationStrategy.reserve.toBase58()} not found`);
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
    vaultReservesMap?: PubkeyHashMap<PublicKey, KaminoReserve>,
    slot?: number,
    previousNetAUM?: Decimal,
    currentSlot?: number
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

    const latestSlot = slot ? slot : await this.getConnection().getSlot('confirmed');

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
} // KaminoVaultClient

export class KaminoVault {
  readonly address: PublicKey;
  state: VaultState | undefined | null;
  programId: PublicKey;

  constructor(vaultAddress: PublicKey, state?: VaultState, programId: PublicKey = kaminoVaultId) {
    this.address = vaultAddress;
    this.state = state;
    this.programId = programId;
  }

  async getState(connection: Connection): Promise<VaultState> {
    if (!this.state) {
      const res = await VaultState.fetch(connection, this.address, this.programId);
      if (!res) {
        throw new Error('Invalid vault');
      }
      this.state = res;
      return res;
    } else {
      return this.state;
    }
  }

  async reloadState(connection: Connection): Promise<VaultState> {
    this.state = await VaultState.fetch(connection, this.address, this.programId);
    if (!this.state) {
      throw new Error('Could not fetch vault');
    }
    return this.state;
  }

  async hasFarm(connection: Connection): Promise<boolean> {
    const state = await this.getState(connection);
    return !state.vaultFarm.equals(PublicKey.default);
  }
}

/**
 * Used to initialize a Kamino Vault
 */
export class KaminoVaultConfig {
  /** The admin of the vault */
  readonly admin: PublicKey;
  /** The token mint for the vault */
  readonly tokenMint: PublicKey;
  /** The token mint program id */
  readonly tokenMintProgramId: PublicKey;
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
    admin: PublicKey;
    tokenMint: PublicKey;
    tokenMintProgramId: PublicKey;
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

  getReserveAddress(): PublicKey {
    return this.reserve.address;
  }
}

export function getCTokenVaultPda(vaultAddress: PublicKey, reserveAddress: PublicKey, kaminoVaultProgramId: PublicKey) {
  return PublicKey.findProgramAddressSync(
    [Buffer.from(CTOKEN_VAULT_SEED), vaultAddress.toBytes(), reserveAddress.toBytes()],
    kaminoVaultProgramId
  )[0];
}

export function getEventAuthorityPda(kaminoVaultProgramId: PublicKey) {
  return PublicKey.findProgramAddressSync([Buffer.from(EVENT_AUTHORITY_SEED)], kaminoVaultProgramId)[0];
}

export type VaultHolder = {
  holderPubkey: PublicKey;
  amount: Decimal;
};

export type VaultHoldings = {
  available: Decimal;
  invested: Decimal;
  investedInReserves: PubkeyHashMap<PublicKey, Decimal>;
  pendingFees: Decimal;
  totalAUMIncludingFees: Decimal;
};

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
  investedInReservesUSD: PubkeyHashMap<PublicKey, Decimal>;
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
  market: PublicKey;
};

export type VaultReserveTotalBorrowedAndInvested = {
  totalInvested: Decimal;
  totalBorrowed: Decimal;
  utilizationRatio: Decimal;
};

export type MarketOverview = {
  address: PublicKey;
  reservesAsCollateral: ReserveAsCollateral[]; // this MarketOverview has the reserve the caller calls for as the debt reserve and all the others as collateral reserves, so the debt reserve is not included here
  minLTVPct: Decimal;
  maxLTVPct: Decimal;
};

export type ReserveAsCollateral = {
  mint: PublicKey;
  liquidationLTVPct: Decimal;
  address: PublicKey;
};

export type VaultOverview = {
  holdingsUSD: VaultHoldingsWithUSDValue;
  reservesOverview: PubkeyHashMap<PublicKey, ReserveOverview>;
  vaultCollaterals: PubkeyHashMap<PublicKey, MarketOverview>;
  theoreticalSupplyAPY: APYs;
  totalBorrowed: Decimal;
  totalSupplied: Decimal;
  utilizationRatio: Decimal;
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

export function printHoldings(holdings: VaultHoldings) {
  console.log('Holdings:');
  console.log('  Available:', holdings.available.toString());
  console.log('  Invested:', holdings.invested.toString());
  console.log('  Total AUM including fees:', holdings.totalAUMIncludingFees.toString());
  console.log('  Pending fees:', holdings.pendingFees.toString());
  console.log('  Invested in reserves:', pubkeyHashMapToJson(holdings.investedInReserves));
}
