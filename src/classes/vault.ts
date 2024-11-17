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
import { TOKEN_PROGRAM_ID, unpackAccount } from '@solana/spl-token';
import {
  getAssociatedTokenAddress,
  getDepositWsolIxns,
  getTokenOracleData,
  KaminoMarket,
  KaminoReserve,
  lamportsToDecimal,
  PubkeyHashMap,
  Reserve,
  WRAPPED_SOL_MINT,
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
import { bpsToPct, getTokenBalanceFromAccountInfoLamports, numberToLamportsDecimal, parseTokenSymbol } from './utils';
import { deposit } from '../idl_codegen_kamino_vault/instructions';
import { withdraw } from '../idl_codegen_kamino_vault/instructions';
import { PROGRAM_ID } from '../idl_codegen/programId';
import { DEFAULT_RECENT_SLOT_DURATION_MS, ReserveWithAddress } from './reserve';
import { Fraction } from './fraction';
import { createAtasIdempotent, lendingMarketAuthPda, PublicKeySet } from '../utils';
import bs58 from 'bs58';
import { getAccountOwner, getProgramAccounts } from '../utils/rpc';
import {
  AcceptVaultOwnershipIxs,
  InitVaultIxs,
  SyncVaultLUTIxs,
  UpdateReserveAllocationIxs,
  UpdateVaultConfigIxs,
} from './types';
import { collToLamportsDecimal } from '@kamino-finance/kliquidity-sdk';

export const kaminoVaultId = new PublicKey('kvauTFR8qm1dhniz6pYuBZkuene3Hfrs1VQhVRgCNrr');
export const kaminoVaultStagingId = new PublicKey('STkvh7ostar39Fwr4uZKASs1RNNuYMFMTsE77FiRsL2');

const TOKEN_VAULT_SEED = 'token_vault';
const CTOKEN_VAULT_SEED = 'ctoken_vault';
const BASE_VAULT_AUTHORITY_SEED = 'authority';
const SHARES_SEEDS = 'shares';

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
    kaminoVaultprogramId?: PublicKey,
    kaminoLendProgramId?: PublicKey,
    recentSlotDurationMs?: number
  ) {
    this._connection = connection;
    this._kaminoVaultProgramId = kaminoVaultprogramId ? kaminoVaultprogramId : kaminoVaultId;
    this._kaminoLendProgramId = kaminoLendProgramId ? kaminoLendProgramId : PROGRAM_ID;
    this.recentSlotDurationMs = recentSlotDurationMs ? recentSlotDurationMs : DEFAULT_RECENT_SLOT_DURATION_MS;
  }

  getConnection() {
    return this._connection;
  }

  getProgramID() {
    return this._kaminoVaultProgramId;
  }

  /**
   * This method will create a vault with a given config. The config can be changed later on, but it is recommended to set it up correctly from the start
   * @param vaultConfig - the config object used to create a vault
   * @returns vault - keypair, should be used to sign the transaction which creates the vault account
   * @returns vault: the keypair of the vault, used to sign the initialization transaction; initVaultIxs: a struct with ixs to initialize the vault and its lookup table + populateLUTIxs, a list to populate the lookup table which has to be executed in a separate transaction
   */
  async createVaultIxs(vaultConfig: KaminoVaultConfig): Promise<{ vault: Keypair; initVaultIxs: InitVaultIxs }> {
    const vaultState = Keypair.generate();
    const size = VaultState.layout.span + 8;

    const createVaultIx = SystemProgram.createAccount({
      fromPubkey: vaultConfig.admin,
      newAccountPubkey: vaultState.publicKey,
      lamports: await this._connection.getMinimumBalanceForRentExemption(size),
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
      [Buffer.from(SHARES_SEEDS), vaultState.publicKey.toBytes()],
      this._kaminoVaultProgramId
    )[0];

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
    };
    const initVaultIx = initVault(initVaultAccounts, this._kaminoVaultProgramId);

    // create and set up the vault lookup table
    const slot = await this._connection.getSlot();
    const [createLUTIx, lut] = this.getInitLookupTableIx(vaultConfig.admin, slot);

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

    const ixns = [createVaultIx, initVaultIx, createLUTIx, setLUTIx];

    if (vaultConfig.getPerformanceFeeBps() > 0) {
      const setPerformanceFeeIx = this.updateUninitialisedVaultConfigIx(
        vaultConfig.admin,
        vaultState.publicKey,
        new VaultConfigField.PerformanceFeeBps(),
        vaultConfig.getPerformanceFeeBps().toString()
      );
      ixns.push(setPerformanceFeeIx);
    }
    if (vaultConfig.getManagementFeeBps() > 0) {
      const setManagementFeeIx = this.updateUninitialisedVaultConfigIx(
        vaultConfig.admin,
        vaultState.publicKey,
        new VaultConfigField.ManagementFeeBps(),
        vaultConfig.getManagementFeeBps().toString()
      );
      ixns.push(setManagementFeeIx);
    }
    if (vaultConfig.name && vaultConfig.name.length > 0) {
      const setNameIx = this.updateUninitialisedVaultConfigIx(
        vaultConfig.admin,
        vaultState.publicKey,
        new VaultConfigField.Name(),
        vaultConfig.name
      );
      ixns.push(setNameIx);
    }

    return { vault: vaultState, initVaultIxs: { initVaultIxs: ixns, populateLUTIxs: insertIntoLUTIxs } };
  }

  /**
   * This method updates the vault reserve allocation cofnig for an exiting vault reserve, or adds a new reserve to the vault if it does not exist.
   * @param vault - vault to be updated
   * @param reserveAllocationConfig - new reserve allocation config
   * @returns - a list of instructions
   */
  async updateReserveAllocationIxs(
    vault: KaminoVault,
    reserveAllocationConfig: ReserveAllocationConfig
  ): Promise<UpdateReserveAllocationIxs> {
    const vaultState: VaultState = await vault.getState(this.getConnection());
    const reserveState: Reserve = reserveAllocationConfig.getReserveState();

    const cTokenVault = getCTokenVaultPda(
      vault.address,
      reserveAllocationConfig.getReserveAddress(),
      this._kaminoVaultProgramId
    );

    const updateReserveAllocationAccounts: UpdateReserveAllocationAccounts = {
      adminAuthority: vaultState.adminAuthority,
      vaultState: vault.address,
      baseVaultAuthority: vaultState.baseVaultAuthority,
      reserveCollateralMint: reserveState.collateral.mintPubkey,
      reserve: reserveAllocationConfig.getReserveAddress(),
      ctokenVault: cTokenVault,
      systemProgram: SystemProgram.programId,
      rent: SYSVAR_RENT_PUBKEY,
      tokenProgram: TOKEN_PROGRAM_ID,
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
      vaultState.adminAuthority,
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
   * Update a field of the vault. If the field is a pubkey it will return an extra instruction to add that account into the lookup table
   * @param vault the vault to update
   * @param mode the field to update (based on VaultConfigFieldKind enum)
   * @param value the value to update the field with
   * @returns a struct that contains the instruction to update the field and an optional list of instructions to update the lookup table
   */
  async updateVaultConfigIxs(
    vault: KaminoVault,
    mode: VaultConfigFieldKind,
    value: string
  ): Promise<UpdateVaultConfigIxs> {
    const vaultState: VaultState = await vault.getState(this.getConnection());

    const updateVaultConfigAccs: UpdateVaultConfigAccounts = {
      adminAuthority: vaultState.adminAuthority,
      vaultState: vault.address,
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

    const updateLUTIxs = [];

    if (mode.kind === new VaultConfigField.PendingVaultAdmin().kind || mode.kind === new VaultConfigField.Farm().kind) {
      const newPubkey = new PublicKey(value);
      const insertIntoLutIxs = await this.insertIntoLookupTableIxs(
        vaultState.adminAuthority,
        vaultState.vaultLookupTable,
        [newPubkey]
      );
      updateLUTIxs.push(...insertIntoLutIxs);
    }

    const updateVaultConfigIxs: UpdateVaultConfigIxs = {
      updateVaultConfigIx,
      updateLUTIxs,
    };

    return updateVaultConfigIxs;
  }

  /**
   * This method updates the vault config for a vault that
   * @param vault - address of vault to be updated
   * @param mode - the field to be updated
   * @param value - the new value for the field to be updated (number or pubkey)
   * @returns - a list of instructions
   */
  updateUninitialisedVaultConfigIx(
    admin: PublicKey,
    vault: PublicKey,
    mode: VaultConfigFieldKind,
    value: string
  ): TransactionInstruction {
    const updateVaultConfigAccs: UpdateVaultConfigAccounts = {
      adminAuthority: admin,
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
   * @returns - an instruction to be used to be executed
   */
  async acceptVaultOwnershipIxs(vault: KaminoVault): Promise<AcceptVaultOwnershipIxs> {
    const vaultState: VaultState = await vault.getState(this.getConnection());

    const acceptOwneshipAccounts: UpdateAdminAccounts = {
      pendingAdmin: vaultState.pendingAdmin,
      vaultState: vault.address,
    };

    const acceptVaultOwnershipIx = updateAdmin(acceptOwneshipAccounts, this._kaminoVaultProgramId);

    // read the current LUT and create a new one for the new admin and backfill it
    const accountsInExistentLUT = (await this.getAccountsInLUT(vaultState.vaultLookupTable)).filter(
      (account) => !account.equals(vaultState.adminAuthority)
    );

    const LUTIxs = [];
    const [initNewLUTIx, newLUT] = this.getInitLookupTableIx(vaultState.pendingAdmin, await this._connection.getSlot());
    LUTIxs.push(initNewLUTIx);

    const insertIntoLUTIxs = await this.insertIntoLookupTableIxs(
      vaultState.pendingAdmin,
      newLUT,
      accountsInExistentLUT
    );

    LUTIxs.push(...insertIntoLUTIxs);

    const updateVaultConfigIxs = await this.updateVaultConfigIxs(
      vault,
      new VaultConfigField.LookupTable(),
      newLUT.toString()
    );
    LUTIxs.push(updateVaultConfigIxs.updateVaultConfigIx);
    LUTIxs.push(...updateVaultConfigIxs.updateLUTIxs);

    const acceptVaultOwnershipIxs: AcceptVaultOwnershipIxs = {
      acceptVaultOwnershipIx,
      updateLUTIxs: LUTIxs,
    };

    return acceptVaultOwnershipIxs;
  }

  /**
   * This function creates the instruction for the admin to give up a part of the pending fees (which will be accounted as part of the vault)
   * @param vault - vault to give up pending fees for
   * @param maxAmountToGiveUp - the maximum amount of fees to give up, in tokens
   * @returns - an instruction to be used to be executed
   */
  async giveUpPendingFeesIx(vault: KaminoVault, maxAmountToGiveUp: Decimal): Promise<TransactionInstruction> {
    const vaultState: VaultState = await vault.getState(this.getConnection());

    const giveUpPendingFeesAccounts: GiveUpPendingFeesAccounts = {
      adminAuthority: vaultState.adminAuthority,
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
   * @returns - list of instructions to withdraw all pending fees
   */
  async withdrawPendingFeesIxs(
    vault: KaminoVault,
    slot: number,
    vaultReservesMap?: PubkeyHashMap<PublicKey, KaminoReserve>
  ): Promise<TransactionInstruction[]> {
    const vaultState: VaultState = await vault.getState(this.getConnection());
    const vaultReservesState = vaultReservesMap ? vaultReservesMap : await this.loadVaultReserves(vaultState);
    const [{ ata: adminTokenAta, createAtaIx }] = createAtasIdempotent(vaultState.adminAuthority, [
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

    const reserveStates = await Reserve.fetchMultiple(this._connection, reservesToWithdraw, this._kaminoLendProgramId);
    const withdrawIxns: TransactionInstruction[] = await Promise.all(
      reservesToWithdraw.map(async (reserve, index) => {
        if (reserveStates[index] === null) {
          throw new Error(`Reserve ${reserve.toBase58()} not found`);
        }

        const reserveState = reserveStates[index]!;
        const marketAddress = reserveState.lendingMarket;

        return this.withdrawPendingFeesIxn(
          vault,
          vaultState,
          marketAddress,
          { address: reserve, state: reserveState },
          adminTokenAta
        );
      })
    );

    return [createAtaIx, ...withdrawIxns];
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
   * @param vault - vault to deposit into
   * @param tokenAmount - token amount to be deposited, in decimals (will be converted in lamports)
   * @param vaultReservesMap - optional parameter; a hashmap from each reserve pubkey to the reserve state. If provided the function will be significantly faster as it will not have to fetch the reserves
   * @returns - an array of instructions to be used to be executed
   */
  async depositIxs(
    user: PublicKey,
    vault: KaminoVault,
    tokenAmount: Decimal,
    vaultReservesMap?: PubkeyHashMap<PublicKey, KaminoReserve>
  ): Promise<TransactionInstruction[]> {
    const vaultState = await vault.getState(this._connection);

    const tokenProgramID = vaultState.tokenProgram;
    const userTokenAta = getAssociatedTokenAddress(vaultState.tokenMint, user, true, tokenProgramID);
    const createAtasIxns: TransactionInstruction[] = [];
    const closeAtasIxns: TransactionInstruction[] = [];
    if (vaultState.tokenMint.equals(WRAPPED_SOL_MINT)) {
      const [{ ata: wsolAta, createAtaIx: createWsolAtaIxn }] = createAtasIdempotent(user, [
        {
          mint: WRAPPED_SOL_MINT,
          tokenProgram: TOKEN_PROGRAM_ID,
        },
      ]);
      createAtasIxns.push(createWsolAtaIxn);
      const depositWsolIxn = getDepositWsolIxns(
        user,
        wsolAta,
        numberToLamportsDecimal(tokenAmount, vaultState.tokenMintDecimals.toNumber()).ceil()
      );
      createAtasIxns.push(...depositWsolIxn);
    }

    const [{ ata: userSharesAta, createAtaIx: createSharesAtaIxns }] = createAtasIdempotent(user, [
      {
        mint: vaultState.sharesMint,
        tokenProgram: TOKEN_PROGRAM_ID,
      },
    ]);
    createAtasIxns.push(createSharesAtaIxns);

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
      instructionSysvarAccount: SYSVAR_INSTRUCTIONS_PUBKEY,
      klendProgram: this._kaminoLendProgramId,
      sharesTokenProgram: TOKEN_PROGRAM_ID,
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

    return [...createAtasIxns, depositIx, ...closeAtasIxns];
  }

  /**
   * This function will return the missing ATA creation instructions, as well as one or multiple withdraw instructions, based on how many reserves it's needed to withdraw from. This might have to be split in multiple transactions
   * @param user - user to withdraw
   * @param vault - vault to withdraw from
   * @param shareAmount - share amount to withdraw, in order to withdraw everything, any value > user share amount
   * @param slot - current slot, used to estimate the interest earned in the different reserves with allocation from the vault
   * @returns an array of instructions to be executed
   */
  async withdrawIxs(
    user: PublicKey,
    vault: KaminoVault,
    shareAmount: Decimal,
    slot: number,
    vaultReservesMap?: PubkeyHashMap<PublicKey, KaminoReserve>
  ): Promise<TransactionInstruction[]> {
    const vaultState = await vault.getState(this._connection);
    const kaminoVault = new KaminoVault(vault.address, vaultState, vault.programId);

    // if the vault has allocations withdraw otherwise wtihdraw from available ix
    const vaultAllocation = vaultState.vaultAllocationStrategy.find(
      (allocation) => ~allocation.reserve.equals(PublicKey.default)
    );

    if (vaultAllocation) {
      return this.wihdrdrawWithReserveIxns(user, kaminoVault, shareAmount, slot, vaultReservesMap);
    } else {
      return this.withdrawFromAvailableIxns(user, kaminoVault, shareAmount);
    }
  }

  private async withdrawFromAvailableIxns(
    user: PublicKey,
    vault: KaminoVault,
    shareAmount: Decimal
  ): Promise<TransactionInstruction[]> {
    const vaultState = await vault.getState(this._connection);
    const kaminoVault = new KaminoVault(vault.address, vaultState, vault.programId);

    const userSharesAta = getAssociatedTokenAddress(vaultState.sharesMint, user);
    const [{ ata: userTokenAta, createAtaIx }] = createAtasIdempotent(user, [
      {
        mint: vaultState.tokenMint,
        tokenProgram: vaultState.tokenProgram,
      },
    ]);

    const shareLamportsToWithdraw = collToLamportsDecimal(shareAmount, vaultState.sharesMintDecimals.toNumber());
    const withdrawFromAvailableIxn = await this.withdrawFromAvailableIxn(
      user,
      kaminoVault,
      vaultState,
      userSharesAta,
      userTokenAta,
      shareLamportsToWithdraw
    );

    return [createAtaIx, withdrawFromAvailableIxn];
  }

  private async wihdrdrawWithReserveIxns(
    user: PublicKey,
    vault: KaminoVault,
    shareAmount: Decimal,
    slot: number,
    vaultReservesMap?: PubkeyHashMap<PublicKey, KaminoReserve>
  ): Promise<TransactionInstruction[]> {
    const vaultState = await vault.getState(this._connection);

    const vaultReservesState = vaultReservesMap ? vaultReservesMap : await this.loadVaultReserves(vaultState);

    const userSharesAta = getAssociatedTokenAddress(vaultState.sharesMint, user);
    const [{ ata: userTokenAta, createAtaIx }] = createAtasIdempotent(user, [
      {
        mint: vaultState.tokenMint,
        tokenProgram: vaultState.tokenProgram,
      },
    ]);

    const tokensToWithdraw = shareAmount.mul(await this.getTokensPerShareSingleVault(vault, slot));
    let tokenLeftToWithdraw = tokensToWithdraw;

    tokenLeftToWithdraw = tokenLeftToWithdraw.sub(new Decimal(vaultState.tokenAvailable.toString()));

    const reservesToWithdraw: PublicKey[] = [];
    const amountToWithdraw: Decimal[] = [];
    amountToWithdraw.push(new Decimal(vaultState.tokenAvailable.toString()));

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
          amountToWithdraw.push(Decimal.min(tokenLeftToWithdraw, availableLiquidityToWithdraw));
        }
      });
    }

    const withdrawIxns: TransactionInstruction[] = [];
    withdrawIxns.push(createAtaIx);

    reservesToWithdraw.forEach((reserve, index) => {
      const reserveState = vaultReservesState.get(reserve);
      if (reserveState === undefined) {
        throw new Error(`Reserve ${reserve.toBase58()} not found in vault reserves map`);
      }

      const marketAddress = reserveState.state.lendingMarket;
      const withdrawFromReserveIx = this.withdrawIxn(
        user,
        vault,
        vaultState,
        marketAddress,
        { address: reserve, state: reserveState.state },
        userSharesAta,
        userTokenAta,
        amountToWithdraw[index],
        vaultReservesState
      );
      withdrawIxns.push(withdrawFromReserveIx);
    });

    return withdrawIxns;
  }

  /**
   * This will trigger invest by balancing, based on weights, the reserve allocations of the vault. It can either withdraw or deposit into reserves to balance them. This is a function that should be cranked
   * @param payer wallet that pays the tx
   * @param vault - vault to invest from
   * @returns - an array of invest instructions for each invest action required for the vault reserves
   */
  async investAllReservesIxs(payer: PublicKey, vault: KaminoVault): Promise<TransactionInstruction[]> {
    //TODO: Order invest ixns by - invest that removes first, then invest that adds
    const vaultState = await vault.getState(this._connection);
    const vaultReserves = this.getVaultReserves(vaultState);
    const investIxnsPromises: Promise<TransactionInstruction[]>[] = [];
    for (const reserve of vaultReserves) {
      const reserveState = await Reserve.fetch(this._connection, reserve, this._kaminoLendProgramId);
      if (reserveState === null) {
        throw new Error(`Reserve ${reserve.toBase58()} not found`);
      }
      const investIxsPromise = this.investSingleReserveIxs(payer, vault, { address: reserve, state: reserveState });
      investIxnsPromises.push(investIxsPromise);
    }

    const investIxns = await Promise.all(investIxnsPromises).then((ixns) => ixns.flat());

    return investIxns;
  }

  /**
   * This will trigger invest by balancing, based on weights, the reserve allocation of the vault. It can either withdraw or deposit into the given reserve to balance it
   * @param payer wallet pubkey
   * @param vault - vault to invest from
   * @param reserve - reserve to invest into or disinvest from
   * @returns - an array of invest instructions for each invest action required for the vault reserves
   */
  async investSingleReserveIxs(
    payer: PublicKey,
    vault: KaminoVault,
    reserve: ReserveWithAddress
  ): Promise<TransactionInstruction[]> {
    const vaultState = await vault.getState(this._connection);

    const cTokenVault = getCTokenVaultPda(vault.address, reserve.address, this._kaminoVaultProgramId);
    const lendingMarketAuth = lendingMarketAuthPda(reserve.state.lendingMarket, this._kaminoLendProgramId)[0];

    const tokenProgram = await getAccountOwner(this._connection, vaultState.tokenMint);
    const [{ ata: payerTokenAta, createAtaIx }] = createAtasIdempotent(payer, [
      { mint: vaultState.tokenMint, tokenProgram },
    ]);

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
    const vaultReservesAccountMetas: AccountMeta[] = vaultReserves.map((reserve) => {
      return { pubkey: reserve, isSigner: false, isWritable: true };
    });
    investIx.keys = investIx.keys.concat(vaultReservesAccountMetas);

    return [createAtaIx, investIx];
  }

  encodeVaultName(token: string): Uint8Array {
    const maxArray = new Uint8Array(40);
    const s: Uint8Array = new TextEncoder().encode(token);
    maxArray.set(s);
    return maxArray;
  }

  decodeVaultName(token: number[]): string {
    const maxArray = new Uint8Array(token);
    let s: string = new TextDecoder().decode(maxArray);
    // Remove trailing zeros and spaces
    s = s.replace(/[\0 ]+$/, '');
    return s;
  }

  private withdrawIxn(
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
    };

    const withdrawArgs: WithdrawArgs = {
      sharesAmount: new BN(shareAmountLamports.toString()),
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

  private async withdrawFromAvailableIxn(
    user: PublicKey,
    vault: KaminoVault,
    vaultState: VaultState,
    userSharesAta: PublicKey,
    userTokenAta: PublicKey,
    shareAmountLamports: Decimal
  ): Promise<TransactionInstruction> {
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
    };

    const withdrawFromAvailableArgs: WithdrawFromAvailableArgs = {
      sharesAmount: new BN(shareAmountLamports.toString()),
    };

    return withdrawFromAvailable(withdrawFromAvailableArgs, withdrawFromAvailableAccounts, this._kaminoVaultProgramId);
  }

  private async withdrawPendingFeesIxn(
    vault: KaminoVault,
    vaultState: VaultState,
    marketAddress: PublicKey,
    reserve: ReserveWithAddress,
    adminTokenAta: PublicKey
  ): Promise<TransactionInstruction> {
    const lendingMarketAuth = lendingMarketAuthPda(marketAddress, this._kaminoLendProgramId)[0];

    const withdrawPendingFeesAccounts: WithdrawPendingFeesAccounts = {
      adminAuthority: vaultState.adminAuthority,
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
   * @returns a struct that contains a list of ix to create the LUT and assign it to the vault if needed + a list of ixs to insert all the accounts in the LUT
   */
  async syncVaultLookupTable(
    vault: KaminoVault,
    vaultReserves?: PubkeyHashMap<PublicKey, KaminoReserve>
  ): Promise<SyncVaultLUTIxs> {
    const vaultState = await vault.getState(this._connection);
    const allAccountsToBeInserted = [
      vault.address,
      vaultState.adminAuthority,
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

    if (vaultReserves) {
      vaultReserves.forEach((reserve) => {
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
      const recentSlot = await this._connection.getSlot();
      const [ixn, address] = this.getInitLookupTableIx(vaultState.adminAuthority, recentSlot);
      setupLUTIfNeededIxs.push(ixn);
      lut = address;

      // set the new LUT for the vault
      const updateVaultConfigIxs = await this.updateVaultConfigIxs(
        vault,
        new VaultConfigField.LookupTable(),
        lut.toString()
      );
      setupLUTIfNeededIxs.push(updateVaultConfigIxs.updateVaultConfigIx);
    }

    const ixns: TransactionInstruction[] = [];
    let overridenExistentAccounts: PublicKey[] | undefined = undefined;
    if (vaultState.vaultLookupTable.equals(PublicKey.default)) {
      overridenExistentAccounts = [];
    }
    ixns.push(
      ...(await this.insertIntoLookupTableIxs(
        vaultState.adminAuthority,
        lut,
        allAccountsToBeInserted,
        overridenExistentAccounts
      ))
    );

    return {
      setupLUTIfNeededIxs,
      syncLUTIxs: ixns,
    };
  }

  getInitLookupTableIx(payer: PublicKey, slot: number): [TransactionInstruction, PublicKey] {
    const [ixn, address] = AddressLookupTableProgram.createLookupTable({
      authority: payer,
      payer,
      recentSlot: slot,
    });

    return [ixn, address];
  }

  getReserveAccountsToInsertInLut(reserveState: Reserve): PublicKey[] {
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

  async insertIntoLookupTableIxs(
    payer: PublicKey,
    lookupTable: PublicKey,
    keys: PublicKey[],
    accountsInLUT?: PublicKey[]
  ): Promise<TransactionInstruction[]> {
    let lutContents = accountsInLUT;
    if (!accountsInLUT) {
      lutContents = await this.getAccountsInLUT(lookupTable);
    } else {
      lutContents = accountsInLUT;
    }

    const missingAccounts = keys.filter((key) => !lutContents!.includes(key) && !key.equals(PublicKey.default));
    // deduplicate missing accounts and remove default accounts and convert it back to an array
    const missingAccountsList = new PublicKeySet(missingAccounts).toArray();

    const chunkSize = 20;
    const ixns: TransactionInstruction[] = [];

    for (let i = 0; i < missingAccountsList.length; i += chunkSize) {
      const chunk = missingAccountsList.slice(i, i + chunkSize);
      const ixn = AddressLookupTableProgram.extendLookupTable({
        lookupTable,
        authority: payer,
        payer,
        addresses: chunk,
      });
      ixns.push(ixn);
    }

    return ixns;
  }

  /**
   *
   * @param connection
   * @param lookupTable
   * @returns
   */
  async getAccountsInLUT(lookupTable: PublicKey): Promise<PublicKey[]> {
    const lutState = await this._connection.getAddressLookupTable(lookupTable);
    if (!lutState || !lutState.value) {
      throw new Error(`Lookup table ${lookupTable} not found`);
    }

    return lutState.value.state.addresses;
  }

  deactivateLookupTableIx(payer: PublicKey, lookupTable: PublicKey): TransactionInstruction {
    const ixn = AddressLookupTableProgram.deactivateLookupTable({
      authority: payer,
      lookupTable: lookupTable,
    });

    return ixn;
  }

  /// this require the LUT to be deactivated at least 500 blocks before
  closeLookupTableIx(payer: PublicKey, lookupTable: PublicKey): TransactionInstruction {
    const ixn = AddressLookupTableProgram.closeLookupTable({
      authority: payer,
      recipient: payer,
      lookupTable: lookupTable,
    });

    return ixn;
  }

  /**
   * This method returns the user shares balance for a given vault
   * @param user - user to calculate the shares balance for
   * @param vault - vault to calculate shares balance for
   * @returns - user share balance in decimal (not lamports)
   */
  async getUserSharesBalanceSingleVault(user: PublicKey, vault: KaminoVault): Promise<Decimal> {
    const vaultState = await vault.getState(this._connection);
    const userSharesAta = getAssociatedTokenAddress(vaultState.sharesMint, user);
    const userSharesAccountInfo = await this._connection.getAccountInfo(userSharesAta);
    if (!userSharesAccountInfo) {
      return new Decimal(0);
    }
    const userSharesAccount = unpackAccount(userSharesAta, userSharesAccountInfo);

    return new Decimal(userSharesAccount.amount.toString()).div(
      new Decimal(10).pow(vaultState.sharesMintDecimals.toString())
    );
  }

  /**
   * This method returns the user shares balance for all existing vaults
   * @param user - user to calculate the shares balance for
   * @param vaultsOverride - the kamino vaults if already fetched, in order to reduce rpc calls
   * @returns - hash map with keyh as vault address and value as user share balance in decimal (not lamports)
   */
  async getUserSharesBalanceAllVaults(
    user: PublicKey,
    vaultsOverride?: Array<KaminoVault>
  ): Promise<PubkeyHashMap<PublicKey, Decimal>> {
    const vaults = vaultsOverride ? vaultsOverride : await this.getAllVaults();
    // stores vault address for each userSharesAta
    const vaultUserShareBalance = new PubkeyHashMap<PublicKey, Decimal>();
    const userSharesAtaArray: PublicKey[] = [];
    vaults.forEach((vault) => {
      const state = vault.state;
      if (!state) {
        throw new Error(`Vault ${vault.address.toBase58()} not fetched`);
      }
      const userSharesAta = getAssociatedTokenAddress(state.sharesMint, user);
      userSharesAtaArray.push(userSharesAta);
    });
    const userSharesAtaAccounts = await this._connection.getMultipleAccountsInfo(userSharesAtaArray);

    userSharesAtaAccounts.forEach((userShareAtaAccount, index) => {
      if (!userShareAtaAccount) {
        vaultUserShareBalance.set(vaults[index].address, new Decimal(0));
      } else {
        vaultUserShareBalance.set(
          vaults[index].address,
          getTokenBalanceFromAccountInfoLamports(userShareAtaAccount).div(
            new Decimal(10).pow(vaults[index].state!.sharesMintDecimals.toString())
          )
        );
      }
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
   * This method calculates the token per shar value. This will always change based on interest earned from the vault, but calculating it requires a bunch of rpc requests. Caching this for a short duration would be optimal
   * @param vault - vault to calculate tokensPerShare for
   * @param slot - current slot, used to estimate the interest earned in the different reserves with allocation from the vault
   * @param vaultReservesMap - optional parameter; a hashmap from each reserve pubkey to the reserve state. If provided the function will be significantly faster as it will not have to fetch the reserves
   * @returns - token per share value
   */
  async getTokensPerShareSingleVault(
    vault: KaminoVault,
    slot: number,
    vaultReservesMap?: PubkeyHashMap<PublicKey, KaminoReserve>
  ): Promise<Decimal> {
    const vaultState = await vault.getState(this._connection);
    if (vaultState.sharesIssued.isZero()) {
      return new Decimal(0);
    }

    const vaultReservesState = vaultReservesMap ? vaultReservesMap : await this.loadVaultReserves(vaultState);

    const sharesDecimal = lamportsToDecimal(
      vaultState.sharesIssued.toString(),
      vaultState.sharesMintDecimals.toString()
    );

    const holdings = await this.getVaultHoldings(
      vaultState,
      await this._connection.getSlot('confirmed'),
      vaultReservesState
    );

    return holdings.total.div(sharesDecimal);
  }

  /**
   * This method calculates the token per share value. This will always change based on interest earned from the vault, but calculating it requires a bunch of rpc requests. Caching this for a short duration would be optimal
   * @param vaultsOverride - a list of vaults to get the tokens per share for; if provided with state it will not fetch the state again
   * @param vaultReservesMap - optional parameter; a hashmap from pubkey to reserve state. If provided the function will be significantly faster as it will not have to fetch the reserves
   * @param slot - current slot, used to estimate the interest earned in the different reserves with allocation from the vault
   * @param useOptimisedRPCCall - if set to true, it will use the optimized getProgramAccounts RPC call, which is more efficient but doesn't work in web environments
   * @returns - token per share value
   */
  async getTokensPerShareAllVaults(
    slot: number,
    vaultsOverride?: Array<KaminoVault>,
    vaultReservesMap?: PubkeyHashMap<PublicKey, KaminoReserve>,
    useOptimisedRPCCall: boolean = true
  ): Promise<PubkeyHashMap<PublicKey, Decimal>> {
    const vaults = vaultsOverride ? vaultsOverride : await this.getAllVaults(useOptimisedRPCCall);
    const vaultTokensPerShare = new PubkeyHashMap<PublicKey, Decimal>();
    for (const vault of vaults) {
      const tokensPerShare = await this.getTokensPerShareSingleVault(vault, slot, vaultReservesMap);
      vaultTokensPerShare.set(vault.address, tokensPerShare);
    }

    return vaultTokensPerShare;
  }

  /**
   * Get all vaults
   * @param useOptimisedRPCCall - if set to true, it will use the optimized getProgramAccounts RPC call, which is more efficient but doesn't work in web environments
   * @returns an array of all vaults
   */
  async getAllVaults(useOptimisedRPCCall: boolean = true): Promise<KaminoVault[]> {
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

    let kaminoVaults: GetProgramAccountsResponse = [];

    if (useOptimisedRPCCall) {
      kaminoVaults = await getProgramAccounts(this._connection, this._kaminoVaultProgramId, {
        commitment: this._connection.commitment ?? 'processed',
        filters,
      });
    } else {
      kaminoVaults = await this._connection.getProgramAccounts(this._kaminoVaultProgramId, { filters });
    }

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
   * This will return the amount of token invested from the vault into the given reserve
   * @param vault - the kamino vault to get invested amount in reserve for
   * @param slot - current slot
   * @param reserve - the reserve state to get vault invested amount in
   * @returns vault amount supplied in reserve in decimal
   */
  getSuppliedInReserve(vaultState: VaultState, slot: number, reserve: KaminoReserve): Decimal {
    const reserveCollExchangeRate = reserve.getEstimatedCollateralExchangeRate(
      slot,
      new Fraction(reserve.state.liquidity.absoluteReferralRateSf)
        .toDecimal()
        .div(reserve.state.config.protocolTakeRatePct / 100)
        .floor()
        .toNumber()
    );

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
   * @returns a ma between reserve pubkey and the allocation pct for the reserve
   */
  getAllocationsDistribuionPct(vaultState: VaultState): PubkeyHashMap<PublicKey, Decimal> {
    const allocationsDistributionPct = new PubkeyHashMap<PublicKey, Decimal>();
    let totalAllocation = new Decimal(0);

    const filteredAllocations = vaultState.vaultAllocationStrategy.filter(
      (allocation) => !allocation.reserve.equals(PublicKey.default)
    );
    console.log('filteredAllocations length', filteredAllocations.length);
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
   * This will return an unsorted hash map of all reserves that the given vault has allocations for, toghether with the amount that can be withdrawn from each of the reserves
   * @param vault - the kamino vault to get available liquidity to withdraw for
   * @param slot - current slot
   * @returns an HashMap of reserves (key) with the amount available to withdraw for each (value)
   */
  private async getReserveAllocationAvailableLiquidityToWithdraw(
    vault: KaminoVault,
    slot: number,
    reserves: PubkeyHashMap<PublicKey, KaminoReserve>
  ): Promise<PubkeyHashMap<PublicKey, Decimal>> {
    const vaultState = await vault.getState(this._connection);

    const reserveAllocationAvailableLiquidityToWithdraw = new PubkeyHashMap<PublicKey, Decimal>();
    vaultState.vaultAllocationStrategy.forEach((allocationStrategy) => {
      const reserve = reserves.get(allocationStrategy.reserve);
      if (reserve === undefined) {
        throw new Error(`Reserve ${allocationStrategy.reserve.toBase58()} not found`);
      }
      const reserveCollExchangeRate = reserve.getEstimatedCollateralExchangeRate(
        slot,
        new Fraction(reserve.state.liquidity.absoluteReferralRateSf)
          .toDecimal()
          .div(reserve.state.config.protocolTakeRatePct / 100)
          .floor()
          .toNumber()
      );
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
   * This will get the list of all reserve pubkeys that the vault has allocations for
   * @param vault - the vault state to load reserves for
   * @returns a hashmap from each reserve pubkey to the reserve state
   */
  getAllVaultReserves(vault: VaultState): PublicKey[] {
    return vault.vaultAllocationStrategy.map((vaultAllocation) => vaultAllocation.reserve);
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
    const vaultReservesAddresses = this.getVaultReserves(vaultState);
    const reserveAccounts = await this._connection.getMultipleAccountsInfo(vaultReservesAddresses, 'processed');

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

    const reservesAndOracles = await getTokenOracleData(this._connection, deserializedReserves);

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
        this._connection,
        this.recentSlotDurationMs
      );
      kaminoReserves.set(kaminoReserve.address, kaminoReserve);
    });

    return kaminoReserves;
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
    vaultReserves?: PubkeyHashMap<PublicKey, KaminoReserve>,
    kaminoMarkets?: KaminoMarket[]
  ): Promise<PubkeyHashMap<PublicKey, MarketOverview>> {
    const vaultReservesStateMap = vaultReserves ? vaultReserves : await this.loadVaultReserves(vaultState);
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
        const fetchedLendingMarket = await KaminoMarket.load(this._connection, reserve.state.lendingMarket, slot);
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
   * @param slot - current slot
   * @param vaultReserves - optional parameter; a hashmap from each reserve pubkey to the reserve state. If provided the function will be significantly faster as it will not have to fetch the reserves
   * @returns an VaultHoldings object
   */
  async getVaultHoldings(
    vault: VaultState,
    slot: number,
    vaultReserves?: PubkeyHashMap<PublicKey, KaminoReserve>
  ): Promise<VaultHoldings> {
    const vaultHoldings: VaultHoldings = {
      available: new Decimal(vault.tokenAvailable.toString()),
      invested: new Decimal(0),
      investedInReserves: new PubkeyHashMap<PublicKey, Decimal>(),
      total: new Decimal(0),
    };

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

      const reserveCollExchangeRate = reserve.getEstimatedCollateralExchangeRate(slot, 0);
      const reserveAllocationLiquidityAmount = new Decimal(allocationStrategy.ctokenAllocation.toString()).div(
        reserveCollExchangeRate
      );

      vaultHoldings.invested = vaultHoldings.invested.add(reserveAllocationLiquidityAmount);
      vaultHoldings.investedInReserves.set(
        allocationStrategy.reserve,
        lamportsToDecimal(reserveAllocationLiquidityAmount, decimals)
      );
    });

    const totalAvailableDecimal = lamportsToDecimal(vaultHoldings.available, decimals);
    const totalInvestedDecimal = lamportsToDecimal(vaultHoldings.invested, decimals);
    return {
      available: totalAvailableDecimal,
      invested: totalInvestedDecimal,
      investedInReserves: vaultHoldings.investedInReserves,
      total: totalAvailableDecimal.add(totalInvestedDecimal),
    };
  }

  /**
   * This will return an VaultHoldingsWithUSDValue object which contains an holdings field representing the amount available (uninvested) in vault, total amount invested in reseves and a breakdown of the amount invested in each reserve and additional fields for the total USD value of the available and invested amounts
   * @param vault - the kamino vault to get available liquidity to withdraw for
   * @param slot - current slot
   * @param vaultReserves - optional parameter; a hashmap from each reserve pubkey to the reserve state. If provided the function will be significantly faster as it will not have to fetch the reserves
   * @param price - the price of the token in the vault (e.g. USDC)
   * @returns an VaultHoldingsWithUSDValue object with details about the tokens available and invested in the vault, denominated in tokens and USD
   */
  async getVaultHoldingsWithPrice(
    vault: VaultState,
    slot: number,
    price: Decimal,
    vaultReserves?: PubkeyHashMap<PublicKey, KaminoReserve>
  ): Promise<VaultHoldingsWithUSDValue> {
    const holdings = await this.getVaultHoldings(vault, slot, vaultReserves);

    const investedInReservesUSD = new PubkeyHashMap<PublicKey, Decimal>();
    holdings.investedInReserves.forEach((amount, reserve) => {
      investedInReservesUSD.set(reserve, amount.mul(price));
    });
    return {
      holdings: holdings,
      availableUSD: holdings.available.mul(price),
      investedUSD: holdings.invested.mul(price),
      investedInReservesUSD: investedInReservesUSD,
      totalUSD: holdings.total.mul(price),
    };
  }

  /**
   * This will return an VaultOverview object that encapsulates all the information about the vault, including the holdings, reserves details, theoretical APY, utilization ratio and total borrowed amount
   * @param vault - the kamino vault to get available liquidity to withdraw for
   * @param slot - current slot
   * @param price - the price of the token in the vault (e.g. USDC)
   * @param vaultReserves - optional parameter; a hashmap from each reserve pubkey to the reserve state. If provided the function will be significantly faster as it will not have to fetch the reserves
   * @param kaminoMarkets - optional parameter; a list of all kamino markets. If provided the function will be significantly faster as it will not have to fetch the markets
   * @returns an VaultHoldingsWithUSDValue object with details about the tokens available and invested in the vault, denominated in tokens and USD
   */
  async getVaultOverview(
    vault: VaultState,
    slot: number,
    price: Decimal,
    vaultReserves?: PubkeyHashMap<PublicKey, KaminoReserve>,
    kaminoMarkets?: KaminoMarket[]
  ): Promise<VaultOverview> {
    const vaultReservesState = vaultReserves ? vaultReserves : await this.loadVaultReserves(vault);

    const vaultHoldingsWithUSDValuePromise = await this.getVaultHoldingsWithPrice(
      vault,
      slot,
      price,
      vaultReservesState
    );
    const vaultTheoreticalAPYPromise = await this.getVaultTheoreticalAPY(vault, slot, vaultReservesState);
    const totalInvestedAndBorrowedPromise = await this.getTotalBorrowedAndInvested(vault, slot, vaultReservesState);
    const vaultCollateralsPromise = await this.getVaultCollaterals(vault, slot, vaultReservesState, kaminoMarkets);
    const reservesOverviewPromise = await this.getVaultReservesDetails(vault, slot, vaultReservesState);

    // all the async part of the functions above just read the vaultReservesState which is read beforehand, so excepting vaultCollateralsPromise they should do no additional network calls
    const [
      vaultHoldingsWithUSDValue,
      vaultTheoreticalAPY,
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
      theoreticalSupplyAPY: vaultTheoreticalAPY,
      totalBorrowed: totalInvestedAndBorrowed.totalBorrowed,
      utilizationRatio: totalInvestedAndBorrowed.utilizationRatio,
      totalSupplied: totalInvestedAndBorrowed.totalInvested,
    };
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
    const vaultReservesState = vaultReserves ? vaultReserves : await this.loadVaultReserves(vault);

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
   * @param vaultReserves - optional parameter; a hashmap from each reserve pubkey to the reserve state. If provided the function will be significantly faster as it will not have to fetch the reserves
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
      const reserveOverview: ReserveOverview = {
        supplyAPY: new Decimal(reserve.totalSupplyAPY(slot)),
        utilizationRatio: new Decimal(reserve.getEstimatedUtilizationRatio(slot, 0)),
        liquidationThresholdPct: new Decimal(reserve.state.config.liquidationThresholdPct),
        borrowedAmount: reserve.getBorrowedAmount(),
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
   * @param vaultReserves - optional parameter; a hashmap from each reserve pubkey to the reserve state. If provided the function will be significantly faster as it will not have to fetch the reserves
   * @returns APY for the vault
   */
  async getVaultTheoreticalAPY(
    vault: VaultState,
    slot: number,
    vaultReserves?: PubkeyHashMap<PublicKey, KaminoReserve>
  ): Promise<Decimal> {
    const vaultReservesState = vaultReserves ? vaultReserves : await this.loadVaultReserves(vault);

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
      return new Decimal(0);
    }
    return totalAPY.div(totalWeights);
  }

  /**
   * Retrive the total amount of interest earned by the vault since its inception, including what was charged as fees
   * @param vaultState the kamino vault state to get total net yield for
   * @returns a decimal representing the net number of tokens earned by the vault since its inception
   */
  async getVaultCumulativeInterest(vaultState: VaultState) {
    const netYieldLamports = new Fraction(vaultState.cumulativeEarnedInterestSf).toDecimal();
    return lamportsToDecimal(netYieldLamports, vaultState.tokenMintDecimals.toString());
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
  /** The performance fee rate of the vault, expressed as a decimal */
  readonly performanceFeeRate: Decimal;
  /** The management fee rate of the vault, expressed as a decimal */
  readonly managementFeeRate: Decimal;
  /** The name to be stored on cain for the vault (max 40 characters). */
  readonly name: string;

  constructor(args: {
    admin: PublicKey;
    tokenMint: PublicKey;
    tokenMintProgramId: PublicKey;
    performanceFeeRate: Decimal;
    managementFeeRate: Decimal;
    name: string;
  }) {
    this.admin = args.admin;
    this.tokenMint = args.tokenMint;
    this.performanceFeeRate = args.performanceFeeRate;
    this.managementFeeRate = args.managementFeeRate;
    this.tokenMintProgramId = args.tokenMintProgramId;
    this.name = args.name;
  }

  getPerformanceFeeBps(): number {
    return this.performanceFeeRate.mul(100).toNumber();
  }

  getManagementFeeBps(): number {
    return this.managementFeeRate.mul(100).toNumber();
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

export type VaultHolder = {
  holderPubkey: PublicKey;
  amount: Decimal;
};

export type VaultHoldings = {
  available: Decimal;
  invested: Decimal;
  investedInReserves: PubkeyHashMap<PublicKey, Decimal>;
  total: Decimal;
};

export type VaultHoldingsWithUSDValue = {
  holdings: VaultHoldings;
  availableUSD: Decimal;
  investedUSD: Decimal;
  investedInReservesUSD: PubkeyHashMap<PublicKey, Decimal>;
  totalUSD: Decimal;
};

export type ReserveOverview = {
  supplyAPY: Decimal;
  utilizationRatio: Decimal;
  liquidationThresholdPct: Decimal;
  borrowedAmount: Decimal;
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
};

export type VaultOverview = {
  holdingsUSD: VaultHoldingsWithUSDValue;
  reservesOverview: PubkeyHashMap<PublicKey, ReserveOverview>;
  vaultCollaterals: PubkeyHashMap<PublicKey, MarketOverview>;
  theoreticalSupplyAPY: Decimal;
  totalBorrowed: Decimal;
  totalSupplied: Decimal;
  utilizationRatio: Decimal;
};

export type VaultFeesPct = {
  managementFeePct: Decimal;
  performanceFeePct: Decimal;
};
