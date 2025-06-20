import { Address } from '@solana/kit';
import Decimal from 'decimal.js';
import { FarmState, RewardInfo } from '@kamino-finance/farms-sdk';

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
};

export type ReserveRewardYield = {
  apy: Decimal;
  apr: Decimal;
  rewardInfo: RewardInfo;
};

export type ReserveFarmInfo = {
  fetched: boolean;
  farmStates: FarmState[];
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

  /**
   * Amount, in lamports.
   */
  amount: Decimal;
};
