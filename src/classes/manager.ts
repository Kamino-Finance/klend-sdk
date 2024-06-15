import {
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
  SYSVAR_RENT_PUBKEY,
  TransactionInstruction,
} from '@solana/web3.js';
import { KaminoVault, KaminoVaultClient, KaminoVaultConfig, kaminoVaultId, ReserveAllocationConfig } from './vault';
import {
  createReserveIx,
  DEFAULT_RECENT_SLOT_DURATION_MS,
  initLendingMarket,
  InitLendingMarketAccounts,
  InitLendingMarketArgs,
  LendingMarket,
  lendingMarketAuthPda,
  NULL_PUBKEY,
  parseForChangesReserveConfigAndGetIxns,
  Reserve,
  updateEntireReserveConfigIxn,
} from '../lib';
import { PROGRAM_ID } from '../idl_codegen/programId';
import { Fraction, ZERO_FRACTION } from './fraction';
import { OracleType, OracleTypeKind, U16_MAX } from '@hubbleprotocol/scope-sdk';
import BN from 'bn.js';
import {
  BorrowRateCurve,
  BorrowRateCurveFields,
  CurvePoint,
  PriceHeuristic,
  PythConfiguration,
  ReserveConfig,
  ReserveConfigFields,
  ScopeConfiguration,
  SwitchboardConfiguration,
  TokenInfo,
  WithdrawalCaps,
} from '../idl_codegen/types';
import { numberToLamportsDecimal } from './utils';
import Decimal from 'decimal.js';
import { ReserveWithAddress } from '../../dist/classes/reserve';

/**
 * KaminoVaultClient is a class that provides a high-level interface to interact with the Kamino Vault program.
 */
export class KaminoManager {
  private readonly _connection: Connection;
  private readonly _kaminoVaultProgramId: PublicKey;
  private readonly _kaminoLendProgramId: PublicKey;
  private readonly _vaultClient: KaminoVaultClient;
  recentSlotDurationMs: number;

  constructor(
    connection: Connection,
    kaminoLendProgramId?: PublicKey,
    kaminoVaultProgramId?: PublicKey,
    recentSlotDurationMs?: number
  ) {
    this._connection = connection;
    this._kaminoVaultProgramId = kaminoVaultProgramId ? kaminoVaultProgramId : kaminoVaultId;
    this._kaminoLendProgramId = kaminoLendProgramId ? kaminoLendProgramId : PROGRAM_ID;
    this.recentSlotDurationMs = recentSlotDurationMs ? recentSlotDurationMs : DEFAULT_RECENT_SLOT_DURATION_MS;
    this._vaultClient = new KaminoVaultClient(
      connection,
      this._kaminoVaultProgramId,
      this._kaminoLendProgramId,
      this.recentSlotDurationMs
    );
  }

  getConnection() {
    return this._connection;
  }

  getProgramID() {
    return this._kaminoVaultProgramId;
  }

  async createMarket(params: CreateKaminoMarketParams): Promise<{ market: Keypair; ixns: TransactionInstruction[] }> {
    const marketAccount = Keypair.generate();
    const size = LendingMarket.layout.span + 8;
    const [lendingMarketAuthority, _] = lendingMarketAuthPda(marketAccount.publicKey, this._kaminoLendProgramId);
    const createMarketIxns: TransactionInstruction[] = [];

    createMarketIxns.push(
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

    createMarketIxns.push(initLendingMarket(args, accounts, this._kaminoLendProgramId));

    return { market: marketAccount, ixns: createMarketIxns };
  }

  /***
   * @returns reserve - keypair used for creation -> to be signed with
   * @returns txnIxns - A list of lists of ixns -> first list for reserve creation, second for updating it with correct params
   */
  async addAssetToMarket(
    params: AddAssetToMarketParams
  ): Promise<{ reserve: Keypair; txnIxns: TransactionInstruction[][] }> {
    const market = await LendingMarket.fetch(this._connection, params.marketAddress, this._kaminoLendProgramId);
    if (!market) {
      throw new Error('Market not found');
    }
    const marketWithAddress: MarketWithAddress = { address: params.marketAddress, state: market };

    const reserveAccount = Keypair.generate();

    const createReserveixns = await createReserveIx(
      this._connection,
      params.admin,
      params.marketAddress,
      params.assetConfig.mint,
      reserveAccount.publicKey,
      this._kaminoLendProgramId
    );

    const updateReserveIxns = await this.updateReserveIx(
      marketWithAddress,
      reserveAccount.publicKey,
      params.assetConfig.getReserveConfig()
    );

    const txnIxns: TransactionInstruction[][] = [];
    txnIxns.push(createReserveixns);
    txnIxns.push(updateReserveIxns);

    return { reserve: reserveAccount, txnIxns };
  }

  async createVault(vaultConfig: KaminoVaultConfig): Promise<[Keypair, TransactionInstruction[]]> {
    return this._vaultClient.createVault(vaultConfig);
  }

  async updateVaultReserveAllocation(
    vault: KaminoVault,
    reserveAllocationConfig: ReserveAllocationConfig
  ): Promise<TransactionInstruction> {
    return this._vaultClient.updateReserveAllocation(vault, reserveAllocationConfig);
  }

  private async updateReserveIx(
    marketWithAddress: MarketWithAddress,
    reserve: PublicKey,
    config: ReserveConfig
  ): Promise<TransactionInstruction[]> {
    const reserveState = await Reserve.fetch(this._connection, reserve, this._kaminoLendProgramId);
    const ixns: TransactionInstruction[] = [];

    if (!reserveState) {
      ixns.push(updateEntireReserveConfigIxn(marketWithAddress, reserve, config, this._kaminoLendProgramId));
    } else {
      ixns.push(
        ...parseForChangesReserveConfigAndGetIxns(
          marketWithAddress,
          reserveState,
          reserve,
          config,
          this._kaminoLendProgramId
        )
      );
    }

    return ixns;
  }

  /**
   * @param user - user to deposit
   * @param vault - vault to deposit into
   * @param tokenAmount - token amount to be deposited, in decimals (will be converted in lamports)
   * @returns
   */
  async depositToVault(user: PublicKey, vault: KaminoVault, tokenAmount: Decimal): Promise<TransactionInstruction[]> {
    return this._vaultClient.deposit(user, vault, tokenAmount);
  }

  async withdrawFromVault(
    user: PublicKey,
    vault: KaminoVault,
    shareAmount: Decimal,
    slot: number
  ): Promise<TransactionInstruction[]> {
    return this._vaultClient.withdraw(user, vault, shareAmount, slot);
  }

  async getVaultTokensPerShare(vault: KaminoVault, slot: number): Promise<Decimal> {
    return this._vaultClient.getTokensPerShare(vault, slot);
  }

  async getUserVaultSharesBalance(user: PublicKey, vault: KaminoVault): Promise<Decimal> {
    return this._vaultClient.getUserSharesBalance(user, vault);
  }

  getKaminoVaultClient(): KaminoVaultClient {
    return this._vaultClient;
  }

  async investAllReserves(kaminoVault: KaminoVault): Promise<TransactionInstruction[]> {
    return this._vaultClient.investAllReserves(kaminoVault);
  }

  async investSingleReserves(
    kaminoVault: KaminoVault,
    reserveWithAddress: ReserveWithAddress
  ): Promise<TransactionInstruction> {
    return this._vaultClient.investSingleReserve(kaminoVault, reserveWithAddress);
  }
} // KaminoManager

export type CreateKaminoMarketParams = {
  admin: PublicKey;
};

export type AddAssetToMarketParams = {
  admin: PublicKey;
  marketAddress: PublicKey;
  assetConfig: AssetConfig;
};

export interface AssetConfig {
  readonly mint: PublicKey;
  readonly tokenName: string;
  readonly mintDecimals: number;
  assetReserveConfigParams: AssetReserveConfigParams;

  setAssetConfigParams(assetReserveConfigParams: AssetReserveConfigParams): void;
  getReserveConfig(): ReserveConfig;
}

export class AssetReserveConfig implements AssetConfig {
  readonly mint: PublicKey;
  readonly tokenName: string;
  readonly mintDecimals: number;
  assetReserveConfigParams: AssetReserveConfigParams;

  constructor(fields: {
    mint: PublicKey;
    tokenName: string;
    mintDecimals: number;
    priceFeed: PriceFeed;
    loanToValuePct: number;
    liquidationThresholdPct: number;
    borrowRateCurve: BorrowRateCurve;
    depositLimit: Decimal;
    borrowLimit: Decimal;
  }) {
    this.mint = fields.mint;
    this.tokenName = fields.tokenName;
    this.mintDecimals = fields.mintDecimals;

    // TODO: verify defaults and ensure opinionated
    this.assetReserveConfigParams = DefaultConfigParams;
    this.assetReserveConfigParams.priceFeed = fields.priceFeed;
    this.assetReserveConfigParams.loanToValuePct = fields.loanToValuePct;
    this.assetReserveConfigParams.liquidationThresholdPct = fields.liquidationThresholdPct;
    this.assetReserveConfigParams.borrowRateCurve = fields.borrowRateCurve;
    this.assetReserveConfigParams.depositLimit = fields.depositLimit;
    this.assetReserveConfigParams.borrowLimit = fields.borrowLimit;
  }

  setAssetConfigParams(assetReserveConfigParams: AssetReserveConfigParams): void {
    this.assetReserveConfigParams = assetReserveConfigParams;
  }

  getReserveConfig(): ReserveConfig {
    return buildReserveConfig({
      configParams: this.assetReserveConfigParams,
      mintDecimals: this.mintDecimals,
      tokenName: this.tokenName,
    });
  }
}

export class AssetReserveConfigCli implements AssetConfig {
  readonly mint: PublicKey;
  readonly tokenName: string;
  readonly mintDecimals: number;
  private reserveConfig: ReserveConfig | undefined;
  assetReserveConfigParams: AssetReserveConfigParams;

  constructor(mint: PublicKey, reserveConfig: ReserveConfig) {
    this.reserveConfig = reserveConfig;
    this.tokenName = '';
    this.mintDecimals = 0;
    this.assetReserveConfigParams = DefaultConfigParams;
    this.mint = mint;
  }

  setAssetConfigParams(assetReserveConfigParams: AssetReserveConfigParams): void {
    this.assetReserveConfigParams = assetReserveConfigParams;
  }

  setReserveConfig(reserveConfig: ReserveConfig) {
    this.reserveConfig = reserveConfig;
  }

  getReserveConfig(): ReserveConfig {
    return this.reserveConfig
      ? this.reserveConfig
      : buildReserveConfig({
          configParams: this.assetReserveConfigParams,
          mintDecimals: this.mintDecimals,
          tokenName: this.tokenName,
        });
  }
}

export class CollateralConfig implements AssetConfig {
  readonly mint: PublicKey;
  readonly tokenName: string;
  readonly mintDecimals: number;
  assetReserveConfigParams: AssetReserveConfigParams;

  constructor(fields: {
    mint: PublicKey;
    tokenName: string;
    mintDecimals: number;
    priceFeed: PriceFeed;
    loanToValuePct: number;
    liquidationThresholdPct: number;
  }) {
    this.mint = fields.mint;
    this.tokenName = fields.tokenName;
    this.mintDecimals = fields.mintDecimals;

    // TODO: verify defaults and ensure opinionated
    this.assetReserveConfigParams = DefaultConfigParams;
    this.assetReserveConfigParams.priceFeed = fields.priceFeed;
    this.assetReserveConfigParams.loanToValuePct = fields.loanToValuePct;
    this.assetReserveConfigParams.liquidationThresholdPct = fields.liquidationThresholdPct;
    this.assetReserveConfigParams.borrowLimit = new Decimal(0);
  }

  setAssetConfigParams(assetReserveConfigParams: AssetReserveConfigParams): void {
    this.assetReserveConfigParams = assetReserveConfigParams;
  }

  getReserveConfig(): ReserveConfig {
    return buildReserveConfig({
      configParams: this.assetReserveConfigParams,
      mintDecimals: this.mintDecimals,
      tokenName: this.tokenName,
    });
  }
}

export class DebtConfig implements AssetConfig {
  readonly mint: PublicKey;
  readonly tokenName: string;
  readonly mintDecimals: number;
  assetReserveConfigParams: AssetReserveConfigParams;

  constructor(fields: {
    mint: PublicKey;
    tokenName: string;
    mintDecimals: number;
    priceFeed: PriceFeed;
    borrowRateCurve: BorrowRateCurve;
  }) {
    this.mint = fields.mint;
    this.tokenName = fields.tokenName;
    this.mintDecimals = fields.mintDecimals;

    // TODO: verify defaults and ensure opinionated
    this.assetReserveConfigParams = DefaultConfigParams;
    this.assetReserveConfigParams.priceFeed = fields.priceFeed;
    this.assetReserveConfigParams.borrowRateCurve = fields.borrowRateCurve;
  }

  setAssetConfigParams(assetReserveConfigParams: AssetReserveConfigParams): void {
    this.assetReserveConfigParams = assetReserveConfigParams;
  }

  getReserveConfig(): ReserveConfig {
    return buildReserveConfig({
      configParams: this.assetReserveConfigParams,
      mintDecimals: this.mintDecimals,
      tokenName: this.tokenName,
    });
  }
}

export type PriceFeed = {
  type: OracleTypeKind;
  price: PublicKey;
  chain?: number[];
};

export type AssetReserveConfigParams = {
  loanToValuePct: number;
  depositLimit: Decimal;
  borrowLimit: Decimal;
  maxLiquidationBonusBps: number;
  minLiquidationBonusBps: number;
  badDebtLiquidationBonusBps: number;
  liquidationThresholdPct: number;
  borrowFeeSf: Fraction;
  flashLoanFeeSf: Fraction;
  protocolTakeRate: number;
  elevationGroups: number[];
  priceFeed: PriceFeed | null;
  maxAgePriceSeconds: number;
  maxAgeTwapSeconds: number;
  borrowRateCurve: BorrowRateCurve;
};

export const DefaultConfigParams: AssetReserveConfigParams = {
  loanToValuePct: 70,
  maxLiquidationBonusBps: 500,
  minLiquidationBonusBps: 200,
  badDebtLiquidationBonusBps: 10,
  liquidationThresholdPct: 75,
  borrowFeeSf: ZERO_FRACTION,
  flashLoanFeeSf: ZERO_FRACTION,
  protocolTakeRate: 0,
  elevationGroups: [0, 0, 0, 0, 0],
  priceFeed: null,
  borrowLimit: new Decimal(1000.0),
  depositLimit: new Decimal(1000.0),
  borrowRateCurve: new BorrowRateCurve({
    points: [
      new CurvePoint({ utilizationRateBps: 0, borrowRateBps: 1000 }),
      new CurvePoint({ utilizationRateBps: 10000, borrowRateBps: 1000 }),
      ...Array(9).fill(new CurvePoint({ utilizationRateBps: 10000, borrowRateBps: 1000 })),
    ],
  } as BorrowRateCurveFields),
  maxAgePriceSeconds: 180,
  maxAgeTwapSeconds: 240,
};

export const encodeTokenName = (tokenName: string): number[] => {
  const buffer: Buffer = Buffer.alloc(32);

  const tokenNameEncoded = new Uint8Array(32);
  const s: Uint8Array = new TextEncoder().encode(tokenName);
  tokenNameEncoded.set(s);
  for (let i = 0; i < tokenNameEncoded.length; i++) {
    buffer[i] = tokenNameEncoded[i];
  }

  const result = [...buffer];
  return result;
};

function buildReserveConfig(fields: {
  configParams: AssetReserveConfigParams;
  mintDecimals: number;
  tokenName: string;
}): ReserveConfig {
  const reserveConfigFields: ReserveConfigFields = {
    status: 0,
    loanToValuePct: fields.configParams.loanToValuePct,
    liquidationThresholdPct: fields.configParams.liquidationThresholdPct,
    minLiquidationBonusBps: fields.configParams.minLiquidationBonusBps,
    protocolLiquidationFeePct: 0,
    protocolTakeRatePct: fields.configParams.protocolTakeRate,
    assetTier: 0,
    multiplierSideBoost: Array(2).fill(1),
    maxLiquidationBonusBps: fields.configParams.maxLiquidationBonusBps,
    badDebtLiquidationBonusBps: fields.configParams.badDebtLiquidationBonusBps,
    fees: {
      borrowFeeSf: fields.configParams.borrowFeeSf.getValue(),
      flashLoanFeeSf: fields.configParams.flashLoanFeeSf.getValue(),
      padding: Array(6).fill(0),
    },
    depositLimit: new BN(
      numberToLamportsDecimal(fields.configParams.depositLimit, fields.mintDecimals).floor().toString()
    ),
    borrowLimit: new BN(
      numberToLamportsDecimal(fields.configParams.borrowLimit, fields.mintDecimals).floor().toString()
    ),
    tokenInfo: {
      name: encodeTokenName(fields.tokenName),
      heuristic: new PriceHeuristic({
        lower: new BN(0),
        upper: new BN(0),
        exp: new BN(0),
      }),
      maxTwapDivergenceBps: new BN(0),
      maxAgePriceSeconds: new BN(fields.configParams.maxAgePriceSeconds),
      maxAgeTwapSeconds: new BN(fields.configParams.maxAgeTwapSeconds),
      ...getOracleConfigs(fields.configParams.priceFeed),
      padding: Array(20).fill(new BN(0)),
    } as TokenInfo,
    borrowRateCurve: fields.configParams.borrowRateCurve,
    depositWithdrawalCap: new WithdrawalCaps({
      configCapacity: new BN(0),
      currentTotal: new BN(0),
      lastIntervalStartTimestamp: new BN(0),
      configIntervalLengthSeconds: new BN(0),
    }),
    debtWithdrawalCap: new WithdrawalCaps({
      configCapacity: new BN(0),
      currentTotal: new BN(0),
      lastIntervalStartTimestamp: new BN(0),
      configIntervalLengthSeconds: new BN(0),
    }),
    deleveragingMarginCallPeriodSecs: new BN(0),
    borrowFactorPct: new BN(100),
    elevationGroups: fields.configParams.elevationGroups,
    deleveragingThresholdSlotsPerBps: new BN(7200),
    multiplierTagBoost: Array(8).fill(1),
    disableUsageAsCollOutsideEmode: 0,
    utilizationLimitBlockBorrowingAbove: 0,
    reserved0: Array(2).fill(0),
    reserved1: Array(4).fill(0),
  };

  return new ReserveConfig(reserveConfigFields);
}

export function getOracleConfigs(priceFeed: PriceFeed | null): {
  pythConfiguration: PythConfiguration;
  switchboardConfiguration: SwitchboardConfiguration;
  scopeConfiguration: ScopeConfiguration;
} {
  let pythConfiguration = new PythConfiguration({
    price: NULL_PUBKEY,
  });
  let switchboardConfiguration = new SwitchboardConfiguration({
    priceAggregator: NULL_PUBKEY,
    twapAggregator: NULL_PUBKEY,
  });
  let scopeConfiguration = new ScopeConfiguration({
    priceFeed: NULL_PUBKEY,
    priceChain: [65535, 65535, 65535, 65535],
    twapChain: [65535, 65535, 65535, 65535],
  });

  if (priceFeed) {
    const { type, price, chain } = priceFeed;
    switch (type.kind) {
      case new OracleType.Pyth().kind: {
        pythConfiguration = new PythConfiguration({ price });
        break;
      }
      case new OracleType.SwitchboardV2().kind: {
        switchboardConfiguration = new SwitchboardConfiguration({
          ...switchboardConfiguration,
          priceAggregator: price,
        });
        break;
      }
      case new OracleType.KToken().kind: {
        scopeConfiguration = new ScopeConfiguration({
          ...scopeConfiguration,
          priceFeed: price,
          priceChain: chain!.concat(Array(4 - chain!.length).fill(U16_MAX)),
        });
        break;
      }
      default:
        throw new Error('Invalid oracle type');
    }
  }
  return {
    pythConfiguration,
    switchboardConfiguration,
    scopeConfiguration,
  };
}

export type MarketWithAddress = {
  address: PublicKey;
  state: LendingMarket;
};
