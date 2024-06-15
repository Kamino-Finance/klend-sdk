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
import { TOKEN_PROGRAM_ID } from '@solana/spl-token';
import {
  getAssociatedTokenAddress,
  getAtasWithCreateIxnsIfMissing,
  getDepositWsolIxns,
  getTokenOracleData,
  KaminoReserve,
  LendingMarket,
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
import { MarketWithAddress } from './manager';
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

  async createVault(vaultConfig: KaminoVaultConfig): Promise<[Keypair, TransactionInstruction[]]> {
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
      tokenProgram: TOKEN_PROGRAM_ID,
    };
    const initVaultIx = initVault(initVaultAccounts, this._kaminoVaultProgramId);

    // TODO: Add logic to update vault based on vaultConfig

    return [vaultState, [createVaultIx, initVaultIx]];
  }

  async updateReserveAllocation(
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

  async deposit(user: PublicKey, vault: KaminoVault, tokenAmount: Decimal): Promise<TransactionInstruction[]> {
    const vaultState = await vault.getState(this._connection);

    const userTokenAta = await getAssociatedTokenAddress(vaultState.tokenMint, user);
    const createAtasIxns: TransactionInstruction[] = [];
    const closeAtasIxns: TransactionInstruction[] = [];
    if (vaultState.tokenMint.equals(WRAPPED_SOL_MINT)) {
      const {
        atas: wsolAta,
        createAtasIxns: createWsolAtaIxns,
        closeAtasIxns: closeWsolAtaIxns,
      } = await getAtasWithCreateIxnsIfMissing(this._connection, user, [WRAPPED_SOL_MINT]);
      createAtasIxns.push(...createWsolAtaIxns);
      const depositWsolixn = getDepositWsolIxns(
        user,
        wsolAta[0],
        numberToLamportsDecimal(tokenAmount, vaultState.tokenMintDecimals.toNumber()).ceil()
      );
      createAtasIxns.push(...depositWsolixn);
      closeAtasIxns.push(...closeWsolAtaIxns);
    }

    const { atas, createAtasIxns: createSharesAtaIxns } = await getAtasWithCreateIxnsIfMissing(this._connection, user, [
      vaultState.sharesMint,
    ]);
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

  async withdraw(
    user: PublicKey,
    vault: KaminoVault,
    shareAmount: Decimal,
    slot: number
  ): Promise<TransactionInstruction[]> {
    const vaultState = await vault.getState(this._connection);

    const userSharesAta = await getAssociatedTokenAddress(vaultState.sharesMint, user);
    const { atas, createAtasIxns } = await getAtasWithCreateIxnsIfMissing(this._connection, user, [
      vaultState.tokenMint,
    ]);
    const userTokenAta = atas[0];

    const tokensToWithdraw = shareAmount.div(await this.getTokensPerShare(vault, slot));
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

  async investAllReserves(vault: KaminoVault): Promise<TransactionInstruction[]> {
    //TODO: Order invest ixns by - invest that removes first, then invest that adds

    const vaultState = await vault.getState(this._connection);
    const vaultReserves = this.getVaultReserves(vaultState);
    const investIxns: TransactionInstruction[] = [];
    for (const reserve of vaultReserves) {
      const reserveState = await Reserve.fetch(this._connection, reserve, this._kaminoLendProgramId);
      if (reserveState === null) {
        throw new Error(`Reserve ${reserve.toBase58()} not found`);
      }
      investIxns.push(await this.investSingleReserve(vault, { address: reserve, state: reserveState }));
    }

    return investIxns;
  }

  async investSingleReserve(vault: KaminoVault, reserve: ReserveWithAddress): Promise<TransactionInstruction> {
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

  async getUserSharesBalance(user: PublicKey, vault: KaminoVault): Promise<Decimal> {
    const vaultState = await vault.getState(this._connection);
    const userSharesAta = await getAssociatedTokenAddress(vaultState.sharesMint, user);
    const userSharesAccount = await this._connection.getAccountInfo(userSharesAta);

    if (!userSharesAccount) {
      return new Decimal(0);
    }

    return new Decimal(userSharesAccount.lamports).div(new Decimal(10).pow(vaultState.sharesMintDecimals.toNumber()));
  }

  async getTokensPerShare(vault: KaminoVault, slot: number): Promise<Decimal> {
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
}

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

  async reload(connection: Connection): Promise<void> {
    this.state = await VaultState.fetch(connection, this.address, this.programId);
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
  /** The performance fee rate of the vault, expressed as a decimal */
  readonly performanceFeeRate: Decimal;
  /** The management fee rate of the vault, expressed as a decimal */
  readonly managementFeeRate: Decimal;

  constructor(args: {
    admin: PublicKey;
    tokenMint: PublicKey;
    performanceFeeRate: Decimal;
    managementFeeRate: Decimal;
  }) {
    this.admin = args.admin;
    this.tokenMint = args.tokenMint;
    this.performanceFeeRate = args.performanceFeeRate;
    this.managementFeeRate = args.managementFeeRate;
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
