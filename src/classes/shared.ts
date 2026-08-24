import { Address } from '@solana/kit';
import Decimal from 'decimal.js';
import { FarmAndKey, RewardInfo } from '@kamino-finance/farms-sdk';

export type ConfigType = Array<MarketConfigType>;

export type MarketConfigType = {
  name: string;
  isPrimary: boolean;
  description: string;
  lendingMarket: string;
  lookupTable: string;
  isCurated: boolean;
};

export type ReserveConfigResponse = {
  liquidityToken: {
    symbol: string;
    mint: string;
  };
};

export enum ReserveStatus {
  Active = 'Active',
  Obsolete = 'Obsolete',
  Hidden = 'Hidden',
}

/**
 * Mirrors the on-chain `InterestRateBasis` (stored as a `u8` in `ReserveConfig.interestRateBasis`): selects how a
 * reserve's time-related settings (the borrow rate curve, the host fixed interest rate and the rewards amount per
 * accrual unit) are interpreted when accruing interest/rewards.
 *
 * The klend program does not expose this enum in its IDL (it is only ever serialized as a `u8`), hence this local copy.
 */
export enum InterestRateBasis {
  /**
   * Rates are nominal "slot-year" APRs (assuming {@link SLOTS_PER_SECOND} slots per second): interest/rewards accrue
   * per slot over {@link SLOTS_PER_YEAR}, so the realized wall-clock rate tracks the real slot rate (see
   * `KaminoReserve.slotAdjustmentFactor()`).
   */
  Legacy = 0,
  /**
   * Rates are real, wall-clock APRs: interest/rewards accrue per second over {@link TRUE_APR_SECONDS_PER_YEAR},
   * independently of the slot rate. All reserves created by klend >= 1.25.0 use this basis.
   */
  TrueApr = 1,
}

export type ReserveDataType = {
  status: ReserveStatus;
  mintAddress: Address;
  borrowCurve: [number, number][];
  loanToValue: number;
  maxLiquidationBonus: number;
  minLiquidationBonus: number;
  liquidationThreshold: number;
  reserveDepositLimit: Decimal;
  reserveBorrowLimit: Decimal;
  depositLimitCrossedTimestamp: number;
  borrowLimitCrossedTimestamp: number;
  symbol: string;
  decimals: number;
  protocolTakeRate: number;
  accumulatedProtocolFees: Decimal;
  mintTotalSupply: Decimal;
  borrowFactor: number;
  isUIDeprecated: boolean | undefined;
};

export type ReserveRewardYield = {
  apy: Decimal;
  apr: Decimal;
  rewardInfo: RewardInfo;
  /** Farm-wide tokens/second (stake-adjusted for `Constant` rewards); the rate `apr`/`apy` derive from. */
  rewardsPerSecond: Decimal;
};

export type ReserveFarmInfo = {
  fetched: boolean;
  farms: FarmAndKey[];
};

export enum FeeCalculation {
  Inclusive = 'Inclusive',
  Exclusive = 'Exclusive',
}

export type Fees = {
  protocolFees: Decimal;
  referrerFees: Decimal;
};

/**
 * Some amount of a specific token type.
 */
export type TokenAmount = {
  /**
   * Token's mint key.
   */
  mint: Address;

  reserveAddress: Address;

  /**
   * Amount, in lamports.
   */
  amount: Decimal;
};
