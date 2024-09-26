import { PublicKey } from '@solana/web3.js';
import Decimal from 'decimal.js';
import { FarmState, RewardInfo } from '@kamino-finance/farms-sdk';

export type ConfigType = Array<MarketConfigType>;

export type MarketConfigType = {
  name: string;
  isPrimary: boolean;
  description: string;
  lendingMarket: string;
  lookupTable: string;
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
  mintAddress: PublicKey;
  borrowCurve: [number, number][];
  loanToValue: number;
  maxLiquidationBonus: number;
  minLiquidationBonus: number;
  liquidationThreshold: number;
  reserveDepositLimit: Decimal;
  reserveBorrowLimit: Decimal;
  depositLimitCrossedSlot: number;
  borrowLimitCrossedSlot: number;
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
