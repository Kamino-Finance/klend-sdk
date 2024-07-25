import { BN } from '@coral-xyz/anchor';
import {
  AccountMeta,
  Connection,
  Keypair,
  PublicKey,
  SYSVAR_INSTRUCTIONS_PUBKEY,
  SYSVAR_RENT_PUBKEY,
  SystemProgram,
  TransactionInstruction,
} from '@solana/web3.js';
import { TOKEN_PROGRAM_ID, unpackAccount } from '@solana/spl-token';
import {
  getAssociatedTokenAddress,
  getAtasWithCreateIxnsIfMissing,
  getDepositWsolIxns,
  getTokenOracleData,
  KaminoReserve,
  LendingMarket,
  MarketWithAddress,
  PubkeyHashMap,
  Reserve,
  WRAPPED_SOL_MINT,
} from '../lib';
import {
  DepositAccounts,
  DepositArgs,
  initVault,
  InitVaultAccounts,
  invest,
  InvestAccounts,
  updateReserveAllocation,
  UpdateReserveAllocationAccounts,
  UpdateReserveAllocationArgs,
  WithdrawAccounts,
  WithdrawArgs,
} from '../idl_codegen_kamino_vault/instructions';
import { VaultState } from '../idl_codegen_kamino_vault/accounts';
import Decimal from 'decimal.js';
import { numberToLamportsDecimal, parseTokenSymbol } from './utils';
import { deposit } from '../idl_codegen_kamino_vault/instructions/deposit';
import { withdraw } from '../idl_codegen_kamino_vault/instructions/withdraw';
import { PROGRAM_ID } from '../idl_codegen/programId';
import { DEFAULT_RECENT_SLOT_DURATION_MS, ReserveWithAddress } from './reserve';
import { Fraction } from './fraction';
import { lendingMarketAuthPda } from '../utils/seeds';

export const kaminoVaultId = new PublicKey('kvauTFR8qm1dhniz6pYuBZkuene3Hfrs1VQhVRgCNrr');

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
   * @returns ixns - an array of instructions to create the vault
   */
  async createVaultIxs(vaultConfig: KaminoVaultConfig): Promise<{ vault: Keypair; ixns: TransactionInstruction[] }> {
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
      tokenMint: vaultConfig.tokenMint,
      tokenVault,
      baseVaultAuthority,
      sharesMint,
      systemProgram: SystemProgram.programId,
      rent: SYSVAR_RENT_PUBKEY,
      tokenProgram: vaultConfig.tokenMintProgramId,
    };
    const initVaultIx = initVault(initVaultAccounts, this._kaminoVaultProgramId);

    // TODO: Add logic to update vault based on vaultConfig

    return { vault: vaultState, ixns: [createVaultIx, initVaultIx] };
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
  ): Promise<TransactionInstruction> {
    const vaultState: VaultState = await vault.getState(this.getConnection());
    const reserveState: Reserve = reserveAllocationConfig.getReserveState();

    const cTokenVault = getCTokenVaultPda(reserveAllocationConfig.getReserveAddress(), this._kaminoVaultProgramId);

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

    return updateReserveAllocation(
      updateReserveAllocationArgs,
      updateReserveAllocationAccounts,
      this._kaminoVaultProgramId
    );
  }

  /**
   * This function creates instructions to deposit into a vault. It will also create ATA creation instructions for the vault shares that the user receives in return
   * @param user - user to deposit
   * @param vault - vault to deposit into
   * @param tokenAmount - token amount to be deposited, in decimals (will be converted in lamports)
   * @returns - an array of instructions to be used to be executed
   */
  async depositIxs(user: PublicKey, vault: KaminoVault, tokenAmount: Decimal): Promise<TransactionInstruction[]> {
    const vaultState = await vault.getState(this._connection);

    const userTokenAta = getAssociatedTokenAddress(vaultState.tokenMint, user);
    const createAtasIxns: TransactionInstruction[] = [];
    const closeAtasIxns: TransactionInstruction[] = [];
    if (vaultState.tokenMint.equals(WRAPPED_SOL_MINT)) {
      const {
        atas: wsolAta,
        createAtasIxns: createWsolAtaIxns,
        closeAtasIxns: closeWsolAtaIxns,
      } = await getAtasWithCreateIxnsIfMissing(this._connection, user, [WRAPPED_SOL_MINT], [TOKEN_PROGRAM_ID]);
      createAtasIxns.push(...createWsolAtaIxns);
      const depositWsolixn = getDepositWsolIxns(
        user,
        wsolAta[0],
        numberToLamportsDecimal(tokenAmount, vaultState.tokenMintDecimals.toNumber()).ceil()
      );
      createAtasIxns.push(...depositWsolixn);
      closeAtasIxns.push(...closeWsolAtaIxns);
    }

    const { atas, createAtasIxns: createSharesAtaIxns } = await getAtasWithCreateIxnsIfMissing(
      this._connection,
      user,
      [vaultState.sharesMint],
      [TOKEN_PROGRAM_ID]
    );
    createAtasIxns.push(...createSharesAtaIxns);

    const userSharesAta = atas[0];

    const depoistAccounts: DepositAccounts = {
      user: user,
      vaultState: vault.address,
      tokenVault: vaultState.tokenVault,
      tokenMint: vaultState.tokenMint,
      baseVaultAuthority: vaultState.baseVaultAuthority,
      sharesMint: vaultState.sharesMint,
      tokenAta: userTokenAta,
      userSharesAta: userSharesAta,
      tokenProgram: TOKEN_PROGRAM_ID,
      instructionSysvarAccount: SYSVAR_INSTRUCTIONS_PUBKEY,
    };

    const depositArgs: DepositArgs = {
      maxAmount: new BN(numberToLamportsDecimal(tokenAmount, vaultState.tokenMintDecimals.toNumber()).toString()),
    };

    const depositIx = deposit(depositArgs, depoistAccounts, this._kaminoVaultProgramId);

    const vaultReserves = this.getVaultReserves(vaultState);

    const vaultReservesAccountMetas: AccountMeta[] = vaultReserves.map((reserve) => {
      return { pubkey: reserve, isSigner: false, isWritable: false };
    });
    depositIx.keys = depositIx.keys.concat(vaultReservesAccountMetas);

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
    slot: number
  ): Promise<TransactionInstruction[]> {
    const vaultState = await vault.getState(this._connection);

    const userSharesAta = getAssociatedTokenAddress(vaultState.sharesMint, user);
    const { atas, createAtasIxns } = await getAtasWithCreateIxnsIfMissing(
      this._connection,
      user,
      [vaultState.tokenMint],
      [TOKEN_PROGRAM_ID]
    );
    const userTokenAta = atas[0];

    const tokensToWithdraw = shareAmount.div(await this.getTokensPerShareSingleVault(vault, slot));
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
        slot
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

    const reserveStates = await Reserve.fetchMultiple(this._connection, reservesToWithdraw, this._kaminoLendProgramId);
    const withdrawIxns: TransactionInstruction[] = await Promise.all(
      reservesToWithdraw.map(async (reserve, index) => {
        if (reserveStates[index] === null) {
          throw new Error(`Reserve ${reserve.toBase58()} not found`);
        }

        const reserveState = reserveStates[index]!;

        const market = reserveState.lendingMarket;
        const marketState = await LendingMarket.fetch(this._connection, market, this._kaminoLendProgramId);
        if (marketState === null) {
          throw new Error(`Market ${market.toBase58()} not found`);
        }

        const marketWithAddress = {
          address: market,
          state: marketState,
        };

        return this.withdrawIxn(
          user,
          vault,
          vaultState,
          marketWithAddress,
          { address: reserve, state: reserveState },
          userSharesAta,
          userTokenAta,
          amountToWithdraw[index]
        );
      })
    );

    return [...createAtasIxns, ...withdrawIxns];
  }

  /**
   * This will trigger invest by balancing, based on weights, the reserve allocations of the vault. It can either withdraw or deposit into reserves to balance them. This is a function that should be cranked
   * @param kaminoVault - vault to invest from
   * @returns - an array of invest instructions for each invest action required for the vault reserves
   */
  async investAllReservesIxs(vault: KaminoVault): Promise<TransactionInstruction[]> {
    //TODO: Order invest ixns by - invest that removes first, then invest that adds

    const vaultState = await vault.getState(this._connection);
    const vaultReserves = this.getVaultReserves(vaultState);
    const investIxns: TransactionInstruction[] = [];
    for (const reserve of vaultReserves) {
      const reserveState = await Reserve.fetch(this._connection, reserve, this._kaminoLendProgramId);
      if (reserveState === null) {
        throw new Error(`Reserve ${reserve.toBase58()} not found`);
      }
      investIxns.push(await this.investSingleReserveIxs(vault, { address: reserve, state: reserveState }));
    }

    return investIxns;
  }

  /**
   * This will trigger invest by balancing, based on weights, the reserve allocation of the vault. It can either withdraw or deposit into the given reserve to balance it
   * @param kaminoVault - vault to invest from
   * @param reserve - reserve to invest into or disinvest from
   * @returns - an array of invest instructions for each invest action required for the vault reserves
   */
  async investSingleReserveIxs(vault: KaminoVault, reserve: ReserveWithAddress): Promise<TransactionInstruction> {
    const vaultState = await vault.getState(this._connection);

    const cTokenVault = getCTokenVaultPda(reserve.address, this._kaminoVaultProgramId);
    const lendingMarketAuth = lendingMarketAuthPda(reserve.state.lendingMarket, this._kaminoLendProgramId)[0];

    const investAccounts: InvestAccounts = {
      adminAuthority: vaultState.adminAuthority,
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
      tokenProgram: TOKEN_PROGRAM_ID,
    };

    const investIx = invest(investAccounts, this._kaminoVaultProgramId);

    const vaultReserves = this.getVaultReserves(vaultState);
    const vaultReservesAccountMetas: AccountMeta[] = vaultReserves.map((reserve) => {
      return { pubkey: reserve, isSigner: false, isWritable: true };
    });
    investIx.keys = investIx.keys.concat(vaultReservesAccountMetas);

    return investIx;
  }

  private withdrawIxn(
    user: PublicKey,
    vault: KaminoVault,
    vaultState: VaultState,
    marketWithAddress: MarketWithAddress,
    reserve: ReserveWithAddress,
    userSharesAta: PublicKey,
    userTokenAta: PublicKey,
    shareAmountLamports: Decimal
  ): TransactionInstruction {
    const lendingMarketAuth = lendingMarketAuthPda(marketWithAddress.address, this._kaminoLendProgramId)[0];

    const withdrawAccounts: WithdrawAccounts = {
      user: user,
      vaultState: vault.address,
      tokenVault: vaultState.tokenVault,
      tokenMint: vaultState.tokenMint,
      baseVaultAuthority: vaultState.baseVaultAuthority,
      sharesMint: vaultState.sharesMint,
      userSharesAta: userSharesAta,
      tokenAta: userTokenAta,
      tokenProgram: TOKEN_PROGRAM_ID,
      instructionSysvarAccount: SYSVAR_INSTRUCTIONS_PUBKEY,
      reserve: reserve.address,
      ctokenVault: getCTokenVaultPda(reserve.address, this._kaminoVaultProgramId),
      /** CPI accounts */
      lendingMarket: marketWithAddress.address,
      lendingMarketAuthority: lendingMarketAuth,
      reserveLiquiditySupply: reserve.state.liquidity.supplyVault,
      reserveCollateralMint: reserve.state.collateral.mintPubkey,
      klendProgram: this._kaminoLendProgramId,
    };

    const withdrawArgs: WithdrawArgs = {
      sharesAmount: new BN(shareAmountLamports.toString()),
    };

    const withdrawIxn = withdraw(withdrawArgs, withdrawAccounts, this._kaminoVaultProgramId);

    const vaultReserves = this.getVaultReserves(vaultState);
    const vaultReservesAccountMetas: AccountMeta[] = vaultReserves.map((reserve) => {
      return { pubkey: reserve, isSigner: false, isWritable: false };
    });
    withdrawIxn.keys = withdrawIxn.keys.concat(vaultReservesAccountMetas);

    return withdrawIxn;
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

    return new Decimal(new Decimal(userSharesAccount.amount.toString()).toNumber()).div(
      new Decimal(10).pow(vaultState.sharesMintDecimals.toNumber())
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
          new Decimal(userShareAtaAccount.lamports).div(
            new Decimal(10).pow(vaults[index].state!.sharesMintDecimals.toNumber())
          )
        );
      }
    });

    return vaultUserShareBalance;
  }

  /**
   * This method calculates the token per shar value. This will always change based on interest earned from the vault, but calculating it requires a bunch of rpc requests. Caching this for a short duration would be optimal
   * @param vault - vault to calculate tokensPerShare for
   * @param slot - current slot, used to estimate the interest earned in the different reserves with allocation from the vault
   * @returns - token per share value
   */
  async getTokensPerShareSingleVault(vault: KaminoVault, slot: number): Promise<Decimal> {
    const vaultState = await vault.getState(this._connection);
    const reserves = await this.loadVaultReserves(vaultState);

    const totalVaultLiquidityAmount = new Decimal(vaultState.tokenAvailable.toString());
    vaultState.vaultAllocationStrategy.forEach((allocationStrategy) => {
      if (!allocationStrategy.reserve.equals(PublicKey.default)) {
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
        const reserveAllocationLiquidityAmount = new Decimal(allocationStrategy.cTokenAllocation.toString()).div(
          reserveCollExchangeRate
        );
        totalVaultLiquidityAmount.add(reserveAllocationLiquidityAmount);
      }
    });

    return new Decimal(vaultState.sharesIssued.toString()).div(totalVaultLiquidityAmount);
  }

  /**
   * This method calculates the token per share value. This will always change based on interest earned from the vault, but calculating it requires a bunch of rpc requests. Caching this for a short duration would be optimal
   * @param vault - vault to calculate tokensPerShare for
   * @param slot - current slot, used to estimate the interest earned in the different reserves with allocation from the vault
   * @returns - token per share value
   */
  async getTokensPerShareAllVaults(
    slot: number,
    vaultsOverride?: Array<KaminoVault>
  ): Promise<PubkeyHashMap<PublicKey, Decimal>> {
    const vaults = vaultsOverride ? vaultsOverride : await this.getAllVaults();
    const vaultTokensPerShare = new PubkeyHashMap<PublicKey, Decimal>();
    vaults.forEach(async (vault) => {
      const vaultState = vault.state;
      if (!vaultState) {
        throw new Error(`Vault ${vault.address.toBase58()} not fetched`);
      }
      const reserves = await this.loadVaultReserves(vaultState);

      const totalVaultLiquidityAmount = new Decimal(vaultState.tokenAvailable.toString());
      vaultState.vaultAllocationStrategy.forEach((allocationStrategy) => {
        if (!allocationStrategy.reserve.equals(PublicKey.default)) {
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
          const reserveAllocationLiquidityAmount = new Decimal(allocationStrategy.cTokenAllocation.toString()).div(
            reserveCollExchangeRate
          );
          totalVaultLiquidityAmount.add(reserveAllocationLiquidityAmount);
        }
      });
      vaultTokensPerShare.set(
        vault.address,
        new Decimal(vaultState.sharesIssued.toString()).div(totalVaultLiquidityAmount)
      );
    });

    return vaultTokensPerShare;
  }

  /**
   * This will return an unsorted hash map of all reserves that the given vault has allocations for, toghether with the amount that can be withdrawn from each of the reserves
   * @param vault - the kamino vault to get available liquidity to withdraw for
   * @param slot - current slot
   * @returns an HashMap of reserves (key) with the amount available to withdraw for each (value)
   */
  private async getReserveAllocationAvailableLiquidityToWithdraw(
    vault: KaminoVault,
    slot: number
  ): Promise<PubkeyHashMap<PublicKey, Decimal>> {
    const vaultState = await vault.getState(this._connection);
    const reserves = await this.loadVaultReserves(vaultState);

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
      const reserveAllocationLiquidityAmount = new Decimal(allocationStrategy.cTokenAllocation.toString()).div(
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

  private getVaultReserves(vault: VaultState): PublicKey[] {
    return vault.vaultAllocationStrategy
      .filter((vaultAllocation) => !vaultAllocation.reserve.equals(PublicKey.default))
      .map((vaultAllocation) => vaultAllocation.reserve);
  }

  private async loadVaultReserves(vaultState: VaultState): Promise<PubkeyHashMap<PublicKey, KaminoReserve>> {
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
   * Get all vaults
   * @returns an array of all vaults
   */
  async getAllVaults(): Promise<KaminoVault[]> {
    const { getProgramAccounts } = await import('../utils/rpc');
    const filters = [
      {
        dataSize: VaultState.layout.span + 8,
      },
    ];

    const [, kaminoVaults] = await Promise.all([
      this._connection.getSlot(),
      getProgramAccounts(this._connection, this._kaminoVaultProgramId, {
        commitment: this._connection.commitment ?? 'processed',
        filters,
      }),
    ]);

    return kaminoVaults.map((kaminoVault) => {
      if (kaminoVault.account === null) {
        throw new Error('Invalid account');
      }

      const kaminoVaultAccount = VaultState.decode(kaminoVault.account.data);
      if (!kaminoVaultAccount) {
        throw Error('Could not parse obligation.');
      }

      return new KaminoVault(kaminoVault.pubkey, kaminoVaultAccount, this._kaminoVaultProgramId);
    });
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

  constructor(args: {
    admin: PublicKey;
    tokenMint: PublicKey;
    tokenMintProgramId: PublicKey;
    performanceFeeRate: Decimal;
    managementFeeRate: Decimal;
  }) {
    this.admin = args.admin;
    this.tokenMint = args.tokenMint;
    this.performanceFeeRate = args.performanceFeeRate;
    this.managementFeeRate = args.managementFeeRate;
    this.tokenMintProgramId = args.tokenMintProgramId;
  }

  getPerformanceFeeBps(): number {
    return this.performanceFeeRate.mul(10000).toNumber();
  }

  getManagementFeeRate(): number {
    return this.managementFeeRate.mul(10000).toNumber();
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

export function getCTokenVaultPda(reserveAddress: PublicKey, kaminoVaultProgramId: PublicKey) {
  return PublicKey.findProgramAddressSync(
    [Buffer.from(CTOKEN_VAULT_SEED), reserveAddress.toBytes()],
    kaminoVaultProgramId
  )[0];
}
