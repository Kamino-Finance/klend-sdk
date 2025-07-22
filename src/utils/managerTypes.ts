import { Address, TransactionSigner } from '@solana/kit';
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
} from '../@codegen/klend/types';
import Decimal from 'decimal.js';
import { Fraction, ZERO_FRACTION } from '../classes';
import BN from 'bn.js';
import { numberToLamportsDecimal } from '../classes';
import { NULL_PUBKEY } from './pubkey';
import { U16_MAX } from '@kamino-finance/scope-sdk';
import { OracleType } from '@kamino-finance/scope-sdk/dist/@codegen/scope/types';
import { LendingMarket } from '../lib';

export type ScopeOracleConfig = {
  name: string;
  oracleType: string;
  oracleId: number;
  oracleAccount: Address;
  twapEnabled: boolean;
  twapSourceId: number;
  max_age: number;
};

export type CreateKaminoMarketParams = {
  admin: TransactionSigner;
};

export type AddAssetToMarketParams = {
  admin: TransactionSigner;
  adminLiquiditySource: Address;
  marketAddress: Address;
  assetConfig: AssetConfig;
};

export interface AssetConfig {
  readonly mint: Address;
  readonly tokenName: string;
  readonly mintDecimals: number;
  readonly mintTokenProgram: Address;
  assetReserveConfigParams: AssetReserveConfigParams;

  setAssetConfigParams(assetReserveConfigParams: AssetReserveConfigParams): void;

  getReserveConfig(): ReserveConfig;
}

export class AssetReserveConfig implements AssetConfig {
  readonly mint: Address;
  readonly tokenName: string;
  readonly mintDecimals: number;
  readonly mintTokenProgram: Address;
  assetReserveConfigParams: AssetReserveConfigParams;

  constructor(fields: {
    mint: Address;
    mintTokenProgram: Address;
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
    this.mintTokenProgram = fields.mintTokenProgram;

    // TODO: verify defaults and ensure opinionated
    this.assetReserveConfigParams = getDefaultConfigParams();
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
  readonly mint: Address;
  readonly tokenName: string;
  readonly mintDecimals: number;
  readonly mintTokenProgram: Address;
  private reserveConfig: ReserveConfig | undefined;
  assetReserveConfigParams: AssetReserveConfigParams;

  constructor(mint: Address, mintTokenProgram: Address, reserveConfig: ReserveConfig) {
    this.reserveConfig = reserveConfig;
    this.tokenName = '';
    this.mintDecimals = 0;
    this.assetReserveConfigParams = getDefaultConfigParams();
    this.mint = mint;
    this.mintTokenProgram = mintTokenProgram;
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
  readonly mint: Address;
  readonly tokenName: string;
  readonly mintDecimals: number;
  readonly mintTokenProgram: Address;
  assetReserveConfigParams: AssetReserveConfigParams;

  constructor(fields: {
    mint: Address;
    mintTokenProgram: Address;
    tokenName: string;
    mintDecimals: number;
    priceFeed: PriceFeed;
    loanToValuePct: number;
    liquidationThresholdPct: number;
  }) {
    this.mint = fields.mint;
    this.tokenName = fields.tokenName;
    this.mintDecimals = fields.mintDecimals;
    this.mintTokenProgram = fields.mintTokenProgram;

    // TODO: verify defaults and ensure opinionated
    this.assetReserveConfigParams = getDefaultConfigParams();
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
  readonly mint: Address;
  readonly tokenName: string;
  readonly mintDecimals: number;
  readonly mintTokenProgram: Address;
  assetReserveConfigParams: AssetReserveConfigParams;
  borrowLimitOutsideElevationGroup?: Decimal;
  debtWithdrawalCapConfigCapacity?: Decimal;

  constructor(fields: {
    mint: Address;
    mintTokenProgram: Address;
    tokenName: string;
    mintDecimals: number;
    priceFeed: PriceFeed;
    borrowRateCurve: BorrowRateCurve;
    borrowLimitOutsideElevationGroup?: Decimal;
    debtWithdrawalCapConfigCapacity?: Decimal;
  }) {
    this.mint = fields.mint;
    this.tokenName = fields.tokenName;
    this.mintDecimals = fields.mintDecimals;
    this.mintTokenProgram = fields.mintTokenProgram;
    this.borrowLimitOutsideElevationGroup = fields.borrowLimitOutsideElevationGroup;
    this.debtWithdrawalCapConfigCapacity = fields.debtWithdrawalCapConfigCapacity;

    // TODO: verify defaults and ensure opinionated
    this.assetReserveConfigParams = getDefaultConfigParams();
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
      borrowLimitOutsideElevationGroup: this.borrowLimitOutsideElevationGroup,
      debtWithdrawalCapConfigCapacity: this.debtWithdrawalCapConfigCapacity,
    });
  }
}

export type PriceFeed = {
  scopePriceConfigAddress?: Address;
  scopeChain?: number[];
  scopeTwapChain?: number[];
  pythPrice?: Address;
  switchboardPrice?: Address;
  switchboardTwapPrice?: Address;
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

export const getDefaultConfigParams = (): AssetReserveConfigParams => {
  return {
    loanToValuePct: 70,
    maxLiquidationBonusBps: 500,
    minLiquidationBonusBps: 200,
    badDebtLiquidationBonusBps: 10,
    liquidationThresholdPct: 75,
    borrowFeeSf: ZERO_FRACTION,
    flashLoanFeeSf: ZERO_FRACTION,
    protocolTakeRate: 0,
    elevationGroups: new Array(20).fill(0),
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
};

export const encodeTokenName = (tokenName: string): number[] => {
  const buffer: Buffer = Buffer.alloc(32);

  const tokenNameEncoded = new Uint8Array(32);
  const s: Uint8Array = new TextEncoder().encode(tokenName);
  tokenNameEncoded.set(s);
  for (let i = 0; i < tokenNameEncoded.length; i++) {
    buffer[i] = tokenNameEncoded[i];
  }
  return [...buffer];
};

function buildReserveConfig(fields: {
  configParams: AssetReserveConfigParams;
  mintDecimals: number;
  tokenName: string;
  borrowLimitOutsideElevationGroup?: Decimal;
  debtWithdrawalCapConfigCapacity?: Decimal;
}): ReserveConfig {
  const reserveConfigFields: ReserveConfigFields = {
    status: 0,
    loanToValuePct: fields.configParams.loanToValuePct,
    liquidationThresholdPct: fields.configParams.liquidationThresholdPct,
    minLiquidationBonusBps: fields.configParams.minLiquidationBonusBps,
    protocolLiquidationFeePct: 0,
    protocolOrderExecutionFeePct: 0,
    protocolTakeRatePct: fields.configParams.protocolTakeRate,
    assetTier: 0,
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
      ...getReserveOracleConfigs(fields.configParams.priceFeed),
      padding: Array(20).fill(new BN(0)),
    } as TokenInfo,
    borrowRateCurve: fields.configParams.borrowRateCurve,
    depositWithdrawalCap: new WithdrawalCaps({
      configCapacity: new BN(
        numberToLamportsDecimal(fields.configParams.depositLimit ?? new Decimal(0), fields.mintDecimals)
          .floor()
          .toString()
      ),
      currentTotal: new BN(0),
      lastIntervalStartTimestamp: new BN(0),
      configIntervalLengthSeconds: new BN(0),
    }),
    debtWithdrawalCap: new WithdrawalCaps({
      configCapacity: new BN(
        numberToLamportsDecimal(fields.debtWithdrawalCapConfigCapacity ?? new Decimal(0), fields.mintDecimals)
          .floor()
          .toString()
      ),
      currentTotal: new BN(0),
      lastIntervalStartTimestamp: new BN(0),
      configIntervalLengthSeconds: new BN(0),
    }),
    deleveragingMarginCallPeriodSecs: new BN(0),
    borrowFactorPct: new BN(100),
    elevationGroups: fields.configParams.elevationGroups,
    deleveragingThresholdDecreaseBpsPerDay: new BN(24),
    disableUsageAsCollOutsideEmode: 0,
    utilizationLimitBlockBorrowingAbovePct: 0,
    hostFixedInterestRateBps: 0,
    autodeleverageEnabled: 0,
    borrowLimitOutsideElevationGroup: new BN(
      numberToLamportsDecimal(fields.borrowLimitOutsideElevationGroup ?? new Decimal(0), fields.mintDecimals)
        .floor()
        .toString()
    ),
    borrowLimitAgainstThisCollateralInElevationGroup: Array(32).fill(new BN(0)),
    deleveragingBonusIncreaseBpsPerDay: new BN(100),
    reserved1: Array(1).fill(0),
    reserved2: Array(9).fill(0),
  };

  return new ReserveConfig(reserveConfigFields);
}

export function getReserveOracleConfigs(priceFeed: PriceFeed | null): {
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
    const { scopePriceConfigAddress, scopeChain, scopeTwapChain, pythPrice, switchboardPrice, switchboardTwapPrice } =
      priceFeed;
    if (pythPrice) {
      pythConfiguration = new PythConfiguration({ price: pythPrice });
    }
    if (switchboardPrice) {
      switchboardConfiguration = new SwitchboardConfiguration({
        priceAggregator: switchboardPrice ? switchboardPrice : NULL_PUBKEY,
        twapAggregator: switchboardTwapPrice ? switchboardTwapPrice : NULL_PUBKEY,
      });
    }
    if (scopePriceConfigAddress) {
      scopeConfiguration = new ScopeConfiguration({
        priceFeed: scopePriceConfigAddress,
        priceChain: scopeChain!.concat(Array(4 - scopeChain!.length).fill(U16_MAX)),
        twapChain: scopeTwapChain!.concat(Array(4 - scopeTwapChain!.length).fill(U16_MAX)),
      });
    }
  }
  return {
    pythConfiguration,
    switchboardConfiguration,
    scopeConfiguration,
  };
}

const ORACLE_TYPE_MAP = Object.fromEntries(
  Object.values(OracleType)
    // Filter for oracle types that have a discriminator property
    // This ensures we only include actual oracle implementations in the mapping
    // Pyth is used as a type assertion here but actually any oracle type with a discriminator will pass
    .filter((T): T is typeof OracleType.Pyth => 'discriminator' in T)
    .map((T) => [T.discriminator, T.name])
);

export function parseOracleType(type: number): string {
  return ORACLE_TYPE_MAP[type] || 'Unknown';
}

export type MarketWithAddress = {
  address: Address;
  state: LendingMarket;
};
