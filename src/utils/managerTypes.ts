import { PublicKey } from '@solana/web3.js';
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
import Decimal from 'decimal.js';
import { Fraction, ZERO_FRACTION } from '../classes/fraction';
import BN from 'bn.js';
import { numberToLamportsDecimal } from '../classes';
import { NULL_PUBKEY } from './pubkey';
import { OracleType, U16_MAX } from '@kamino-finance/scope-sdk';
import { LendingMarket } from '../lib';

export type ScopeOracleConfig = {
  scopePriceConfigAddress: PublicKey;
  name: string;
  oracleType: string;
  oracleId: number;
  oracleAccount: PublicKey;
  twapEnabled: boolean;
  twapSourceId: number;
  max_age: number;
};

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
  readonly mintTokenProgram: PublicKey;
  assetReserveConfigParams: AssetReserveConfigParams;

  setAssetConfigParams(assetReserveConfigParams: AssetReserveConfigParams): void;
  getReserveConfig(): ReserveConfig;
}

export class AssetReserveConfig implements AssetConfig {
  readonly mint: PublicKey;
  readonly tokenName: string;
  readonly mintDecimals: number;
  readonly mintTokenProgram: PublicKey;
  assetReserveConfigParams: AssetReserveConfigParams;

  constructor(fields: {
    mint: PublicKey;
    mintTokenProgram: PublicKey;
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
  readonly mintTokenProgram: PublicKey;
  private reserveConfig: ReserveConfig | undefined;
  assetReserveConfigParams: AssetReserveConfigParams;

  constructor(mint: PublicKey, mintTokenProgram: PublicKey, reserveConfig: ReserveConfig) {
    this.reserveConfig = reserveConfig;
    this.tokenName = '';
    this.mintDecimals = 0;
    this.assetReserveConfigParams = DefaultConfigParams;
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
  readonly mint: PublicKey;
  readonly tokenName: string;
  readonly mintDecimals: number;
  readonly mintTokenProgram: PublicKey;
  assetReserveConfigParams: AssetReserveConfigParams;

  constructor(fields: {
    mint: PublicKey;
    mintTokenProgram: PublicKey;
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
  readonly mintTokenProgram: PublicKey;
  assetReserveConfigParams: AssetReserveConfigParams;

  constructor(fields: {
    mint: PublicKey;
    mintTokenProgram: PublicKey;
    tokenName: string;
    mintDecimals: number;
    priceFeed: PriceFeed;
    borrowRateCurve: BorrowRateCurve;
  }) {
    this.mint = fields.mint;
    this.tokenName = fields.tokenName;
    this.mintDecimals = fields.mintDecimals;
    this.mintTokenProgram = fields.mintTokenProgram;

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
  scopePriceConfigAddress?: PublicKey;
  scopeChain?: number[];
  scopeTwapChain?: number[];
  pythPrice?: PublicKey;
  switchboardPrice?: PublicKey;
  switchboardTwapPrice?: PublicKey;
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
    disableUsageAsCollOutsideEmode: 0,
    utilizationLimitBlockBorrowingAbove: 0,
    hostFixedInterestRateBps: 0,
    borrowLimitOutsideElevationGroup: new BN(0),
    borrowLimitAgainstThisCollateralInElevationGroup: Array(32).fill(new BN(0)),
    reserved1: Array(2).fill(0),
    reserved2: Array(2).fill(0),
    reserved3: Array(8).fill(0),
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

export function parseOracleType(type: number): string {
  switch (type) {
    case new OracleType.Pyth().discriminator:
      return 'Pyth';
    case new OracleType.SwitchboardV2().discriminator:
      return 'SwitchboardV2';
    case new OracleType.CToken().discriminator:
      return 'CToken';
    case new OracleType.KToken().discriminator:
      return 'KToken';
    case new OracleType.SplStake().discriminator:
      return 'SplStake';
    case new OracleType.PythEMA().discriminator:
      return 'PythEMA';
    case new OracleType.DeprecatedPlaceholder1().discriminator:
      return 'DeprecatedPlaceholder1';
    case new OracleType.DeprecatedPlaceholder2().discriminator:
      return 'DeprecatedPlaceholder2';
    case new OracleType.MsolStake().discriminator:
      return 'MsolStake';
    case new OracleType.KTokenToTokenA().discriminator:
      return 'KTokenToTokenA';
    case new OracleType.KTokenToTokenB().discriminator:
      return 'KTokenToTokenB';
    case new OracleType.JupiterLpFetch().discriminator:
      return 'JupiterLpFetch';
    case new OracleType.ScopeTwap().discriminator:
      return 'ScopeTwap';
    case new OracleType.OrcaWhirlpoolAtoB().discriminator:
      return 'OrcaWhirlpoolAtoB';
    case new OracleType.OrcaWhirlpoolBtoA().discriminator:
      return 'OrcaWhirlpoolBtoA';
    case new OracleType.RaydiumAmmV3AtoB().discriminator:
      return 'RaydiumAmmV3AtoB';
    case new OracleType.RaydiumAmmV3BtoA().discriminator:
      return 'RaydiumAmmV3BtoA';
    case new OracleType.JupiterLpCompute().discriminator:
      return 'JupiterLpCompute';
    case new OracleType.MeteoraDlmmAtoB().discriminator:
      return 'MeteoraDlmmAtoB';
    case new OracleType.MeteoraDlmmBtoA().discriminator:
      return 'MeteoraDlmmBtoA';
    case new OracleType.JupiterLpScope().discriminator:
      return 'JupiterLpScope';
    case new OracleType.PythPullBased().discriminator:
      return 'PythPullBased';
    case new OracleType.PythPullBasedEMA().discriminator:
      return 'PythPullBasedEMA';
    case new OracleType.FixedPrice().discriminator:
      return 'FixedPrice';
    default:
      return 'Unknown';
  }
}

export type MarketWithAddress = {
  address: PublicKey;
  state: LendingMarket;
};
