import type { Address } from '@solana/kit';
import type Decimal from 'decimal.js';
import type { ReserveWhitelistEntry } from '../@codegen/kvault/accounts';

export type ReserveWhitelistStatus = {
  reserveAddress: Address;
  pda: Address;
  entry: ReserveWhitelistEntry | null;
  whitelistInvest: number;
  whitelistAddAllocation: number;
  whitelistedForInvest: boolean;
  whitelistedForAddAllocation: boolean;
};

export type PrintableValue = {
  toString(): string;
};

export type PrintableRewardStats = {
  rewardMint: Address;
  rewardDecimals: PrintableValue | number;
  value: PrintableValue;
  yearlyRewards: PrintableValue;
  monthlyRewards: PrintableValue;
  weeklyRewards: PrintableValue;
  dailyRewards: PrintableValue;
  incentivesApy: number;
  hasRewardAvailable: boolean;
};

export type PrintableFarmIncentives = {
  incentivesStats: PrintableRewardStats[];
  totalIncentivesApy: number;
};

export type PrintableReserveAllocation = {
  /** Target allocation weight; unitless relative weight. */
  targetWeight: Decimal;
  /** Token allocation cap in vault-token lamports. */
  tokenAllocationCapLamports: Decimal;
  /** Optional ctoken allocation cap in ctoken lamports. */
  ctokenAllocationCapLamports?: Decimal;
  /** Current reserve allocation in ctoken lamports. */
  ctokenAllocationLamports: Decimal;
};
