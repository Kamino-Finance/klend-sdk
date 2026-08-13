/* eslint-disable max-classes-per-file */
import BN from 'bn.js';
import {
  Address,
  Instruction,
  Slot,
  TransactionSigner,
  Rpc,
  GetMinimumBalanceForRentExemptionApi,
  Option,
  none,
  some,
  isSome,
  GetProgramAccountsApi,
  GetAccountInfoApi,
  GetMultipleAccountsApi,
  SolanaRpcApiMainnet,
  Base58EncodedBytes,
} from '@solana/kit';
import Decimal from 'decimal.js';
import {
  AllOracleAccounts,
  DEFAULT_PUBLIC_KEY,
  fetchReserveRewardsMaxAprBps,
  FixedRateReserveKind,
  FloatRateReserveKind,
  getTokenOracleData,
  globalConfigPda,
  INITIAL_COLLATERAL_RATE,
  lendingMarketAuthPda,
  MarketWithAddress,
  MaturityTimestampReserveKind,
  MIN_INITIAL_DEPOSIT,
  ONE_HUNDRED_PCT_IN_BPS,
  reservePdas,
  ReserveKind,
  SLOTS_PER_SECOND,
  SLOTS_PER_YEAR,
  TokenOracleData,
  U64_MAX,
} from '../utils';
import { FeeCalculation, Fees, ReserveDataType, ReserveFarmInfo, ReserveRewardYield, ReserveStatus } from './shared';
import { Reserve, ReserveFields, WithdrawTicket } from '../@codegen/klend/accounts';
import { PROGRAM_ID } from '../@codegen/klend/programId';
import {
  CurvePointFields,
  ReserveConfig,
  ReserveStatus as ReserveStatusEnum,
  UpdateConfigMode,
  UpdateConfigModeKind,
  WithdrawalCaps,
} from '../@codegen/klend/types';
import {
  calculateAPYFromAPR,
  getBorrowRate,
  lamportsToNumberDecimal,
  parseTokenSymbol,
  positiveOrZero,
  toBuffer,
} from './utils';
import { CompositeConfigItem, ConfigUpdater, PriorityOrderedConfigUpdater } from './configItems';
import { bfToDecimal, Fraction } from './fraction';
import { ActionType } from './action';
import { BorrowCapsAndCounters, ElevationGroupDescription, KaminoMarket } from './market';
import {
  initReserve,
  InitReserveAccounts,
  updateReserveConfig,
  UpdateReserveConfigAccounts,
  UpdateReserveConfigArgs,
} from '../lib';
import { aprToApy, KaminoPrices } from '@kamino-finance/kliquidity-sdk';
import { FarmAndKey, RewardInfo } from '@kamino-finance/farms-sdk';
import { TOKEN_PROGRAM_ADDRESS } from '@solana-program/token';
import { maxBigInt, minBigInt } from '../utils/bigint';
import { getCreateAccountInstruction, SYSTEM_PROGRAM_ADDRESS } from '@solana-program/system';
import { SYSVAR_INSTRUCTIONS_ADDRESS, SYSVAR_RENT_ADDRESS } from '@solana/sysvars';
import { noopSigner } from '../utils/signer';
import { fetchFarmStateOrNull, getRewardPerTimeUnitSecond } from './farm_utils';
import { Scope, ScopeEntryMetadata } from '@kamino-finance/scope-sdk';
import { kaminoCdn, KaminoCdnData } from './cdnClient';

export type KaminoReserveRpcApi = GetProgramAccountsApi & GetAccountInfoApi & GetMultipleAccountsApi;

export const DEFAULT_RECENT_SLOT_DURATION_MS = 400;

/**
 * The terms a fresh fixed-term borrow into a fixed-rate reserve is (re-)originated with. Surfaced by SDK flows that
 * originate or reset fixed-term debt (swap-debt into a fixed-rate target, swap-collateral via-debt re-borrow, leverage
 * deposit/increase) so clients can show the user the new term/rate/maturity. All fields are `undefined` for
 * variable/open-term reserves.
 */
export type FixedTermReorigination = {
  /**
   * The reserve's configured fixed debt term, in seconds. This is orthogonal to the reserve-wide
   * `debt_maturity_timestamp`, matching the term that on-chain early-repay penalty calculations use.
   */
  newDebtTermSeconds: number;
  /**
   * The independent reserve-wide `debt_maturity_timestamp`, or `0` when none is configured. This is not the
   * per-borrow term end; that derives from `last_borrowed_at + newDebtTermSeconds`.
   */
  newDebtTermMaturityTimestamp: number;
  /** The fixed borrow rate (bps) the new debt accrues at. */
  newBorrowRateBps: number;
  /** Whether any prior auto-rollover config is dropped on (re)origination — always true for the SDK's flash flows. */
  rolloverReset: boolean;
};

export class KaminoReserve {
  state: Reserve;
  address: Address;
  symbol: string;

  tokenOraclePrice: TokenOracleData;
  stats: ReserveDataType;
  private farmData: ReserveFarmInfo = { fetched: false, farms: [] };

  private rpc: Rpc<KaminoReserveRpcApi>;
  private readonly recentSlotDurationMs: number;

  private metadata?: ScopeEntryMetadata[];
  private reserveKind: ReserveKind;
  private scaledUiAmountMultiplier: Decimal;
  /** The klend program that owns this reserve (and its parent lending market); used by all account fetches this instance makes. */
  private readonly programId: Address;

  /**
   * Snapshot of the parent market's `LendingMarket::reserveRewardsMaxAprBps`, captured when this
   * instance was constructed and, like `state` itself, refreshed on {@link reloadState}/{@link load}.
   *
   * All estimation methods use it to mirror the rewards-distribution step of the on-chain
   * `refresh_reserve`; `0` means the market has reserve rewards disabled.
   */
  reserveRewardsMaxAprBps: number;

  constructor(
    state: Reserve,
    address: Address,
    tokenOraclePrice: TokenOracleData,
    connection: Rpc<KaminoReserveRpcApi>,
    recentSlotDurationMs: number,
    reserveRewardsMaxAprBps: number,
    scaledUiAmountMultiplier: Decimal = new Decimal(1),
    programId: Address = PROGRAM_ID
  ) {
    this.state = state;
    this.address = address;
    this.tokenOraclePrice = tokenOraclePrice;
    this.stats = {} as ReserveDataType;
    this.rpc = connection;
    this.symbol = parseTokenSymbol(state.config.tokenInfo.name);
    this.recentSlotDurationMs = recentSlotDurationMs;
    this.reserveKind = KaminoReserve.createReserveKind(state);
    this.reserveRewardsMaxAprBps = reserveRewardsMaxAprBps;
    this.scaledUiAmountMultiplier = scaledUiAmountMultiplier;
    this.programId = programId;
  }

  static initialize(
    address: Address,
    state: Reserve,
    tokenOraclePrice: TokenOracleData,
    rpc: Rpc<KaminoReserveRpcApi>,
    recentSlotDurationMs: number,
    reserveRewardsMaxAprBps: number,
    cdnResourcesData?: KaminoCdnData,
    scaledUiAmountMultiplier?: Decimal,
    programId?: Address
  ): KaminoReserve {
    const reserve = new KaminoReserve(
      state,
      address,
      tokenOraclePrice,
      rpc,
      recentSlotDurationMs,
      reserveRewardsMaxAprBps,
      scaledUiAmountMultiplier,
      programId
    );
    reserve.stats = reserve.formatReserveData(state, cdnResourcesData?.deprecatedAssets ?? []);
    return reserve;
  }

  /**
   * Construct a KaminoReserve from raw on-chain account data.
   * Use this when you have raw bytes from a WebSocket notification and
   * an existing oracle price (e.g. from a cached price query).
   *
   * Note that the reserve account bytes alone are not enough for fully accurate reserve math:
   * `reserveRewardsMaxAprBps` lives on the parent `LendingMarket` account, so callers must supply
   * a snapshot of it read from that account (`kaminoMarket.state.reserveRewardsMaxAprBps`) —
   * do not hardcode a value. Long-lived subscribers should refresh the snapshot when the market
   * account changes.
   *
   * Throws if the data does not match the Reserve discriminator.
   */
  static fromAccountData(
    reserveAddress: Address,
    data: Buffer | Uint8Array,
    tokenOraclePrice: TokenOracleData,
    rpc: Rpc<KaminoReserveRpcApi>,
    recentSlotDurationMs: number,
    reserveRewardsMaxAprBps: number,
    cdnResourcesData?: KaminoCdnData,
    programId?: Address
  ): KaminoReserve {
    const state = Reserve.decode(toBuffer(data));
    return KaminoReserve.initialize(
      reserveAddress,
      state,
      tokenOraclePrice,
      rpc,
      recentSlotDurationMs,
      reserveRewardsMaxAprBps,
      cdnResourcesData,
      undefined,
      programId
    );
  }

  /**
   * `reserveRewardsMaxAprBps` is the parent market's `LendingMarket::reserveRewardsMaxAprBps`;
   * pass it when you already hold the market state to save a network call, otherwise the
   * reserve's lending market is fetched to read it.
   */
  static async initializeFromAddress(
    address: Address,
    rpc: Rpc<KaminoReserveRpcApi>,
    recentSlotDurationMs: number,
    reserveState?: Reserve,
    oracleAccounts?: AllOracleAccounts,
    scaledUiAmountMultiplier?: Decimal,
    reserveRewardsMaxAprBps?: number,
    programId: Address = PROGRAM_ID
  ) {
    const reserve = reserveState ?? (await Reserve.fetch(rpc, address, programId));
    if (reserve === null) {
      throw new Error(`Reserve account ${address} does not exist`);
    }

    const [tokenOracleDataWithReserve, rewardsMaxAprBps] = await Promise.all([
      getTokenOracleData(rpc, [{ address: address, state: reserve }], oracleAccounts),
      reserveRewardsMaxAprBps !== undefined
        ? Promise.resolve(reserveRewardsMaxAprBps)
        : fetchReserveRewardsMaxAprBps(rpc, reserve.lendingMarket, programId),
    ]);
    if (!tokenOracleDataWithReserve[0]) {
      throw new Error('Token oracle data not found');
    }
    const tokenOracleData = tokenOracleDataWithReserve[0]![1]!;
    return new KaminoReserve(
      reserve,
      address,
      tokenOracleData,
      rpc,
      recentSlotDurationMs,
      rewardsMaxAprBps,
      scaledUiAmountMultiplier,
      programId
    );
  }

  static createReserveKind(state: Reserve): ReserveKind {
    const { debtTermSeconds, debtMaturityTimestamp } = state.config;
    if (debtTermSeconds.eqn(0) && debtMaturityTimestamp.eqn(0)) {
      return new FloatRateReserveKind();
    } else if (!debtTermSeconds.eqn(0)) {
      const borrowRateBps = state.config.borrowRateCurve.points[0]?.borrowRateBps || 0;
      return new FixedRateReserveKind(debtTermSeconds, borrowRateBps);
    } else {
      return new MaturityTimestampReserveKind(debtMaturityTimestamp);
    }
  }

  /// GETTERS

  /**
   * @returns the scaledUiAmount multiplier for this reserve's liquidity mint.
   * Returns 1 for mints without the ScaledUiAmountConfig extension.
   */
  getScaledUiAmountMultiplier(): Decimal {
    return this.scaledUiAmountMultiplier;
  }

  /**
   * @returns the parsed token symbol of the reserve
   */
  getTokenSymbol(): string {
    return parseTokenSymbol(this.state.config.tokenInfo.name);
  }

  /**
   * @returns list of logo names and human readable oracle descriptions
   */
  async getOracleMetadata(): Promise<[string, string][]> {
    if (!this.metadata) {
      const scope = new Scope('mainnet-beta', this.rpc as Rpc<SolanaRpcApiMainnet>);
      const { priceFeed, priceChain } = this.state.config.tokenInfo.scopeConfiguration;
      this.metadata = await scope.getChainMetadata({ prices: priceFeed }, priceChain);
    }

    return this.metadata.map((m) => [m.provider, m.name]);
  }

  /**
   * @returns the total borrowed amount of the reserve in lamports
   */
  getBorrowedAmount(): Decimal {
    return new Fraction(this.state.liquidity.borrowedAmountSf).toDecimal();
  }

  /**
   * @returns the available liquidity amount of the reserve in lamports, as credited at the last refresh
   *
   * This is what the reserve holds right now, so it is the amount to use when mirroring the program at
   * the reserve's current state (see {@link getQueuedLiquidityAmountAtCurrentRate}). Use
   * {@link getEstimatedLiquidityAvailableAmount} when projecting to a later slot instead.
   */
  getLiquidityAvailableAmount(): Decimal {
    return new Decimal(this.state.liquidity.totalAvailableAmount.toString());
  }

  /**
   * @returns the available liquidity amount of the reserve in lamports, estimated at `slot`: the amount
   * credited at the last refresh plus whatever a refresh at `slot` would distribute into it
   *
   * The on-chain `distribute_rewards` credits `total_available_amount`, so — unlike interest accrual —
   * the reserve rewards make this amount a function of the slot being asked about. This is the value to
   * pair with anything derived from {@link getEstimatedCollateralExchangeRate}, so that both sides come
   * from one simulated refresh.
   */
  getEstimatedLiquidityAvailableAmount(slot: Slot, referralFeeBps: number): Decimal {
    return this.getLiquidityAvailableAmount().add(this.getEstimatedDistributedRewards(slot, referralFeeBps));
  }

  /** @returns the total amount of ctokens queued for withdrawal */
  getQueuedCTokens(): Decimal {
    return new Decimal(this.state.withdrawQueue.queuedCollateralAmount.toString());
  }

  /**
   * @returns the total amount of liquidity queued for withdrawal, valued at the exchange rate estimated
   * for `slot`. Floored, like the on-chain `Reserve::queued_liquidity_amount`.
   */
  getQueuedLiquidityAmount(slot: Slot, referralFeeBps: number): Decimal {
    const queuedCTokens = this.getQueuedCTokens();
    const exchangeRate = this.getEstimatedCollateralExchangeRate(slot, referralFeeBps);
    return KaminoReserve.cTokensToLiquidity(queuedCTokens, exchangeRate).floor();
  }

  /**
   * @returns the the part of reserve liquidity available for *non-priority* purposes (e.g. borrowing,
   * regular withdrawals), estimated at `slot`
   *
   * Mirrors the on-chain `Reserve::freely_available_liquidity_amount`, which takes the available
   * liquidity and the value of the withdraw queue from the same refreshed state — so both sides here
   * come from one simulated refresh.
   */
  getFreelyAvailableLiquidityAmount(slot: Slot, referralFeeBps: number): Decimal {
    const liquidityForQueuedCollateral = this.getQueuedLiquidityAmount(slot, referralFeeBps);
    return Decimal.max(
      this.getEstimatedLiquidityAvailableAmount(slot, referralFeeBps).sub(liquidityForQueuedCollateral),
      new Decimal(0)
    );
  }

  /**
   *
   * @returns the last cached price stored in the reserve in USD
   */
  getReserveMarketPrice(): Decimal {
    return new Fraction(this.state.liquidity.marketPriceSf).toDecimal();
  }

  /**
   * @returns the current market price of the reserve in USD
   */
  getOracleMarketPrice(): Decimal {
    return this.tokenOraclePrice.price;
  }

  /**
   * @returns the total accumulated protocol fees of the reserve
   */
  getAccumulatedProtocolFees(): Decimal {
    return new Fraction(this.state.liquidity.accumulatedProtocolFeesSf).toDecimal();
  }

  /**
   * @returns the total accumulated referrer fees of the reserve
   */
  getAccumulatedReferrerFees(): Decimal {
    return new Fraction(this.state.liquidity.accumulatedReferrerFeesSf).toDecimal();
  }

  /**
   * @returns the total pending referrer fees of the reserve
   */
  getPendingReferrerFees(): Decimal {
    return new Fraction(this.state.liquidity.pendingReferrerFeesSf).toDecimal();
  }

  // --- Scaled UI amount getters ---
  // These apply the Token-2022 ScaledUiAmountConfig multiplier for display purposes.
  // Use these for user-facing amounts; use the raw getters above for calculations.

  getScaledBorrowedAmount(): Decimal {
    return this.getBorrowedAmount().mul(this.scaledUiAmountMultiplier);
  }

  getScaledLiquidityAvailableAmount(): Decimal {
    return this.getLiquidityAvailableAmount().mul(this.scaledUiAmountMultiplier);
  }

  getScaledTotalSupply(): Decimal {
    return this.getTotalSupply().mul(this.scaledUiAmountMultiplier);
  }

  getScaledAccumulatedProtocolFees(): Decimal {
    return this.getAccumulatedProtocolFees().mul(this.scaledUiAmountMultiplier);
  }

  getScaledAccumulatedReferrerFees(): Decimal {
    return this.getAccumulatedReferrerFees().mul(this.scaledUiAmountMultiplier);
  }

  getScaledPendingReferrerFees(): Decimal {
    return this.getPendingReferrerFees().mul(this.scaledUiAmountMultiplier);
  }

  /**
   *
   * @returns the flash loan fee percentage of the reserve
   */
  getFlashLoanFee = (): Decimal => {
    if (this.state.config.fees.flashLoanFeeSf.toString() === U64_MAX) {
      return new Decimal('0');
    }
    return new Fraction(this.state.config.fees.flashLoanFeeSf).toDecimal();
  };

  /**
   *
   * @returns the origination fee percentage of the reserve
   */
  getBorrowFee = (): Decimal => {
    return new Fraction(this.state.config.fees.originationFeeSf).toDecimal();
  };

  /**
   *
   * @returns the fixed interest rate allocated to the host
   */
  getFixedHostInterestRate = (): Decimal => {
    return new Decimal(this.state.config.hostFixedInterestRateBps).div(ONE_HUNDRED_PCT_IN_BPS);
  };

  /**
   * Use getEstimatedTotalSupply() for the most accurate value
   * @returns the stale total liquidity supply of the reserve from the last refresh
   */
  getTotalSupply(): Decimal {
    return this.getLiquidityAvailableAmount()
      .add(this.getBorrowedAmount())
      .sub(this.getAccumulatedProtocolFees())
      .sub(this.getAccumulatedReferrerFees())
      .sub(this.getPendingReferrerFees());
  }

  /** @returns {@link getTotalSupply} in scaled-fraction units, for exact on-chain-matching fixed-point math */
  getTotalSupplySf(): BN {
    return this.state.liquidity.totalAvailableAmount
      .mul(Fraction.ONE_SF)
      .add(this.state.liquidity.borrowedAmountSf)
      .sub(this.state.liquidity.accumulatedProtocolFeesSf)
      .sub(this.state.liquidity.accumulatedReferrerFeesSf)
      .sub(this.state.liquidity.pendingReferrerFeesSf);
  }

  /**
   * Calculates the total liquidity supply of the reserve
   */
  getEstimatedTotalSupply(slot: Slot, referralFeeBps: number): Decimal {
    const { totalSupply } = this.getEstimatedDebtAndSupply(slot, referralFeeBps);
    return totalSupply;
  }

  /**
   * Use getEstimatedCumulativeBorrowRate() for the most accurate value
   * @returns the stale cumulative borrow rate of the reserve from the last refresh
   */
  getCumulativeBorrowRate(): Decimal {
    return bfToDecimal(this.state.liquidity.cumulativeBorrowRateBsf);
  }

  /**
   * @Returns estimated cumulative borrow rate of the reserve.
   *
   * This is a running scale factor, not a rate: an obligation's debt is recovered by scaling it by the
   * ratio between two readings (see the on-chain `ObligationLiquidity::accrue_interest`). It must
   * therefore grow by the same factor {@link getEstimatedDebtAndSupply} grows the reserve's borrowed
   * amount by, which is why both take it from {@link compoundInterest}.
   */
  getEstimatedCumulativeBorrowRate(currentSlot: Slot, referralFeeBps: number): Decimal {
    const slotsElapsed = maxBigInt(currentSlot - BigInt(this.state.lastUpdate.slot.toString()), 0n);

    const { compoundedInterestRate } = this.compoundInterest(slotsElapsed, referralFeeBps);

    const previousCumulativeBorrowRate = this.getCumulativeBorrowRate();

    return previousCumulativeBorrowRate.mul(compoundedInterestRate);
  }

  /**
   * Mirrors on-chain `Reserve::calculate_future_cumulative_borrow_rate`.
   * Projects the cumulative borrow rate to a future slot.
   */
  calculateFutureCumulativeBorrowRate(futureSlot: Slot): Decimal {
    const currentSlot = BigInt(this.state.lastUpdate.slot.toString()) as Slot;
    const slotsElapsed = maxBigInt(futureSlot - currentSlot, 0n);
    const hostFixedInterestRate = this.getFixedHostInterestRate();
    const currentUtilization = this.calculateUtilizationRatio();
    const curve = truncateBorrowCurve(this.state.config.borrowRateCurve.points);
    const baseBorrowRate = new Decimal(getBorrowRate(currentUtilization, curve));
    const currentBorrowRate = baseBorrowRate.add(hostFixedInterestRate);
    const compoundedInterestRate = this.approximateCompoundedInterest(currentBorrowRate, slotsElapsed);
    const previousCumulativeBorrowRate = this.getCumulativeBorrowRate();

    return previousCumulativeBorrowRate.mul(compoundedInterestRate);
  }

  /**
   * Use getEstimatedCollateralExchangeRate() for the most accurate value
   * @returns the stale exchange rate between the collateral tokens and the liquidity - this is a decimal number scaled by 1e18
   */
  getCollateralExchangeRate(): Decimal {
    const totalSupply = this.getTotalSupply();
    const mintTotalSupply = this.state.collateral.mintTotalSupply;
    if (mintTotalSupply.isZero() || totalSupply.isZero()) {
      return INITIAL_COLLATERAL_RATE;
    } else {
      return new Decimal(mintTotalSupply.toString()).dividedBy(totalSupply.toString());
    }
  }

  /**
   *
   * @returns the estimated exchange rate between the collateral tokens and the liquidity - this is a decimal number scaled by 1e18
   */
  getEstimatedCollateralExchangeRate(slot: Slot, referralFeeBps: number): Decimal {
    const totalSupply = this.getEstimatedTotalSupply(slot, referralFeeBps);
    const mintTotalSupply = this.state.collateral.mintTotalSupply;
    if (mintTotalSupply.isZero() || totalSupply.isZero()) {
      return INITIAL_COLLATERAL_RATE;
    } else {
      return new Decimal(mintTotalSupply.toString()).dividedBy(totalSupply.toString());
    }
  }

  /**
   * Computes the amount of liquidity tokens that corresponds to a given amount of cTokens
   * @param cTokens - the amount of cTokens to convert to liquidity tokens
   * @param exchangeRate - the exchange rate to use. If not provided, the estimated exchange rate will be used
   * @param slot - the slot to use to estimate exchange rate. If exchangeRate is provided, this parameter is ignored, if exchangeRate is not provided this parameter is required
   * @param referralFeeBps - the referral fee percentage to use for the estimated exchange rate. Defaults to 0. If exchangeRate is provided, this parameter is ignored.
   * @returns the amount of liquidity tokens that corresponds to the given amount of cTokens
   */
  cTokensToLiquidity(cTokens: Decimal, slot: Slot, exchangeRate?: Decimal, referralFeeBps: number = 0): Decimal {
    if (exchangeRate === undefined) {
      exchangeRate = this.getEstimatedCollateralExchangeRate(slot, referralFeeBps);
    }
    return KaminoReserve.cTokensToLiquidity(cTokens, exchangeRate);
  }

  /**
   * Computes the amount of liquidity tokens that corresponds to a given amount of cTokens
   * @param cTokens - the amount of cTokens to convert to liquidity tokens
   * @param exchangeRate - the exchange rate to use
   * @returns the amount of liquidity tokens that corresponds to the given amount of cTokens
   */
  static cTokensToLiquidity(cTokens: Decimal, exchangeRate: Decimal): Decimal {
    return cTokens.div(exchangeRate);
  }

  /**
   * Computes the amount of cTokens that corresponds to a given amount of liquidity
   * @param liquidity - the amount of liquidity to convert to cTokens
   * @param exchangeRate - the exchange rate to use. If not provided, the estimated exchange rate will be used
   * @param slot - the slot to use to estimate exchange rate. If exchangeRate is provided, this parameter is ignored, if exchangeRate is not provided this parameter is required
   * @param referralFeeBps - the referral fee percentage to use for the estimated exchange rate. Defaults to 0. If exchangeRate is provided, this parameter is ignored.
   * @returns the amount of cTokens that corresponds to the given amount of liquidity
   */
  liquidityToCTokens(liquidity: Decimal, slot: Slot, exchangeRate?: Decimal, referralFeeBps: number = 0): Decimal {
    if (exchangeRate === undefined) {
      exchangeRate = this.getEstimatedCollateralExchangeRate(slot, referralFeeBps);
    }
    return KaminoReserve.liquidityToCTokens(liquidity, exchangeRate);
  }

  /**
   * Computes the amount of cTokens that corresponds to a given amount of liquidity
   * @param liquidity - the amount of liquidity to convert to cTokens
   * @param exchangeRate - the exchange rate to use
   * @returns the amount of cTokens that corresponds to the given amount of liquidity
   */
  static liquidityToCTokens(liquidity: Decimal, exchangeRate: Decimal): Decimal {
    return liquidity.mul(exchangeRate);
  }

  /**
   *
   * @returns the total USD value of the existing collateral in the reserve
   */
  getDepositTvl = (): Decimal => {
    return new Decimal(this.getTotalSupply().toString()).mul(this.getOracleMarketPrice()).div(this.getMintFactor());
  };

  /**
   *
   * Get the total USD value of the borrowed assets from the reserve
   */
  getBorrowTvl = (): Decimal => {
    return this.getBorrowedAmount().mul(this.getOracleMarketPrice()).div(this.getMintFactor());
  };

  /**
   * @returns 10^mint_decimals
   */
  getMintFactor(): Decimal {
    return new Decimal(10).pow(this.getMintDecimals());
  }

  /**
   * @returns the raw (no borrow factor) market value of the given liquidity amount, in scaled-fraction USD,
   * mirroring the on-chain `liquidity_amount_to_market_value` (truncating toward zero).
   */
  getMarketValueFromLiquidityAmount(liquidityAmount: Fraction): Fraction {
    const mintFactorSf = new BN(10).pow(new BN(this.getMintDecimals())).mul(Fraction.ONE_SF);
    return liquidityAmount.mulIntRatio(this.state.liquidity.marketPriceSf, mintFactorSf);
  }

  /**
   * @returns mint_decimals of the liquidity token
   */
  getMintDecimals(): number {
    return this.state.liquidity.mintDecimals.toNumber();
  }

  /**
   * @returns the collateral farm address if it is set, otherwise none
   */
  getCollateralFarmAddress(): Option<Address> {
    if (this.state.farmCollateral === DEFAULT_PUBLIC_KEY) {
      return none();
    }
    return some(this.state.farmCollateral);
  }

  /**
   * @returns the debt farm address if it is set, otherwise none
   */
  getDebtFarmAddress(): Option<Address> {
    if (this.state.farmDebt === DEFAULT_PUBLIC_KEY) {
      return none();
    }
    return some(this.state.farmDebt);
  }

  /**
   * @Returns true if the total liquidity supply of the reserve is greater than the deposit limit
   */
  depositLimitCrossed(): boolean {
    return this.getTotalSupply().gt(new Decimal(this.state.config.depositLimit.toString()));
  }

  /**
   * @Returns true if the total borrowed amount of the reserve is greater than the borrow limit
   */
  borrowLimitCrossed(): boolean {
    return this.getBorrowedAmount().gt(new Decimal(this.state.config.borrowLimit.toString()));
  }

  /**
   *
   * @returns the max capacity of the deposit withdrawal cap
   */
  getDepositWithdrawalCapCapacity(): Decimal {
    return new Decimal(this.state.config.depositWithdrawalCap.configCapacity.toString());
  }

  /**
   *
   * @returns the current capacity of the deposit withdrawal cap
   */
  getDepositWithdrawalCapCurrent(currentUnixTimestamp: number): Decimal {
    return this.getWithdrawalCapCurrent(this.state.config.depositWithdrawalCap, currentUnixTimestamp);
  }

  /**
   *
   * @returns the max capacity of the debt withdrawal cap
   */
  getDebtWithdrawalCapCapacity(): Decimal {
    return new Decimal(this.state.config.debtWithdrawalCap.configCapacity.toString());
  }

  /**
   *
   * @returns the borrow limit of the reserve outside the elevation group
   */
  getBorrowLimitOutsideElevationGroup(): Decimal {
    return new Decimal(this.state.config.borrowLimitOutsideElevationGroup.toString());
  }

  /**
   *
   * @returns the borrowed amount of the reserve outside the elevation group
   */
  getBorrowedAmountOutsideElevationGroup(): Decimal {
    return new Decimal(this.state.borrowedAmountOutsideElevationGroup.toString());
  }

  /**
   *
   * @returns the borrow limit against the collateral reserve in the elevation group
   */
  getBorrowLimitAgainstCollateralInElevationGroup(elevationGroupIndex: number): Decimal {
    return new Decimal(
      this.state.config.borrowLimitAgainstThisCollateralInElevationGroup[elevationGroupIndex].toString()
    );
  }

  /**
   *
   * @returns the borrowed amount against the collateral reserve in the elevation group
   */
  getBorrowedAmountAgainstCollateralInElevationGroup(elevationGroupIndex: number): Decimal {
    return new Decimal(this.state.borrowedAmountsAgainstThisReserveInElevationGroups[elevationGroupIndex].toString());
  }

  private getWithdrawalCapCurrent(caps: WithdrawalCaps, currentUnixTimestamp: number): Decimal {
    const intervalLength = Number(caps.configIntervalLengthSeconds.toString());
    if (intervalLength === 0) {
      return new Decimal(0);
    }
    const elapsed = currentUnixTimestamp - Number(caps.lastIntervalStartTimestamp.toString());
    if (elapsed >= intervalLength) {
      return new Decimal(0);
    }
    return new Decimal(caps.currentTotal.toString());
  }

  /**
   *
   * @returns the current capacity of the debt withdrawal cap
   */
  getDebtWithdrawalCapCurrent(currentUnixTimestamp: number): Decimal {
    return this.getWithdrawalCapCurrent(this.state.config.debtWithdrawalCap, currentUnixTimestamp);
  }

  /**
   * @returns the liquidity (floored, valued at the current collateral exchange rate) the reserve has set aside
   * to honor queued collateral withdrawals. Mirrors the on-chain `Reserve::queued_liquidity_amount` (current,
   * non-estimated rate), unlike {@link getQueuedLiquidityAmount} which estimates the rate to a given slot.
   */
  getQueuedLiquidityAmountAtCurrentRate(): Decimal {
    return KaminoReserve.cTokensToLiquidity(this.getQueuedCTokens(), this.getCollateralExchangeRate()).floor();
  }

  /**
   * @returns the most restrictive amount of liquidity (a u64 lamport count) that can be borrowed from this
   * reserve outside any elevation group, mirroring the on-chain
   * `Reserve::borrowable_liquidity_amount_outside_elevation_group`: the minimum of freely-available liquidity,
   * the reserve borrow cap, the outside-elevation-group borrow limit, the utilization-rate limit, and the debt
   * withdrawal cap. Never negative.
   */
  getBorrowableLiquidityAmountOutsideElevationGroup(currentUnixTimestamp: number): BN {
    const toBn = (amount: Decimal): BN => new BN(amount.floor().toFixed());
    const withdrawalCapActive = !this.state.config.debtWithdrawalCap.configIntervalLengthSeconds.isZero();
    let withdrawalCapRemaining: BN | null = null;
    if (withdrawalCapActive) {
      const capacity = this.getDebtWithdrawalCapCapacity();
      withdrawalCapRemaining = capacity.lte(0)
        ? new BN(0)
        : toBn(capacity.sub(this.getDebtWithdrawalCapCurrent(currentUnixTimestamp)));
    }
    return KaminoReserve.computeBorrowableLiquidityOutsideElevationGroup({
      freelyAvailable: toBn(this.getLiquidityAvailableAmount().sub(this.getQueuedLiquidityAmountAtCurrentRate())),
      remainingBorrowCap: toBn(this.stats.reserveBorrowLimit.sub(this.getBorrowedAmount())),
      remainingOutsideElevationLimit: toBn(
        this.getBorrowLimitOutsideElevationGroup().sub(this.getBorrowedAmountOutsideElevationGroup())
      ),
      totalSupply: new Fraction(this.getTotalSupplySf()),
      totalBorrow: new Fraction(this.state.liquidity.borrowedAmountSf),
      utilizationLimitPct: this.state.config.utilizationLimitBlockBorrowingAbovePct,
      withdrawalCapRemaining,
    });
  }

  /**
   * @returns whether the reserve is already over any of its borrow caps - the reserve borrow limit (`>`), the
   * outside-elevation-group borrow limit (`>`), or the utilization limit (`>=`, which deliberately blocks at
   * the boundary on-chain). Used by a same-reserve rollover, which re-borrows the same amount and so only
   * requires the reserve to be within its existing limits rather than to have spare capacity.
   */
  isOverBorrowLimits(): boolean {
    return KaminoReserve.computeIsOverBorrowLimits({
      borrowedAmount: this.getBorrowedAmount(),
      reserveBorrowLimit: this.stats.reserveBorrowLimit,
      borrowedAmountOutsideElevation: this.getBorrowedAmountOutsideElevationGroup(),
      borrowLimitOutsideElevation: this.getBorrowLimitOutsideElevationGroup(),
      utilizationLimitPct: this.state.config.utilizationLimitBlockBorrowingAbovePct,
      totalSupply: this.getTotalSupply(),
    });
  }

  /**
   * Pure form of {@link getBorrowableLiquidityAmountOutsideElevationGroup} (mirrors the on-chain
   * `Reserve::borrowable_liquidity_amount_outside_elevation_group`): the most restrictive of the integer caps
   * (freely-available liquidity, the reserve borrow cap, the outside-elevation-group borrow limit, and - when
   * active - the debt withdrawal cap) together with the utilization-rate limit. The utilization limit is
   * computed in `Fraction` arithmetic as `(totalSupply * pct% - totalBorrow - DELTA)` floored (or the full
   * `totalSupply` floored when no limit is configured), matching the program's fixed-point math. The integer
   * caps are u64 lamport counts; `withdrawalCapRemaining` is null when no withdrawal cap is active. Never
   * negative.
   */
  static computeBorrowableLiquidityOutsideElevationGroup(inputs: {
    freelyAvailable: BN;
    remainingBorrowCap: BN;
    remainingOutsideElevationLimit: BN;
    totalSupply: Fraction;
    totalBorrow: Fraction;
    utilizationLimitPct: number;
    withdrawalCapRemaining: BN | null;
  }): BN {
    const utilizationRateLimit =
      inputs.utilizationLimitPct > 0
        ? inputs.totalSupply
            .mul(Fraction.fromInt(inputs.utilizationLimitPct).mulIntRatio(1, 100)) // * from_percent(pct), truncating
            .saturatingSub(inputs.totalBorrow)
            .saturatingSub(new Fraction(new BN(1))) // - Fraction::DELTA (one ulp)
            .floorToBn()
        : inputs.totalSupply.floorToBn();
    const limits = [
      inputs.freelyAvailable,
      inputs.remainingBorrowCap,
      inputs.remainingOutsideElevationLimit,
      utilizationRateLimit,
    ];
    if (inputs.withdrawalCapRemaining !== null) {
      limits.push(inputs.withdrawalCapRemaining);
    }
    return BN.max(
      limits.reduce((acc, limit) => BN.min(acc, limit)),
      new BN(0)
    );
  }

  /**
   * Pure form of {@link isOverBorrowLimits}: whether the reserve is over the borrow limit (`>`), the
   * outside-elevation-group borrow limit (`>`), or the utilization limit (`>=`, which blocks at the boundary).
   */
  static computeIsOverBorrowLimits(inputs: {
    borrowedAmount: Decimal;
    reserveBorrowLimit: Decimal;
    borrowedAmountOutsideElevation: Decimal;
    borrowLimitOutsideElevation: Decimal;
    utilizationLimitPct: number;
    totalSupply: Decimal;
  }): boolean {
    if (inputs.borrowedAmount.gt(inputs.reserveBorrowLimit)) {
      return true;
    }
    if (inputs.borrowedAmountOutsideElevation.gt(inputs.borrowLimitOutsideElevation)) {
      return true;
    }
    return (
      inputs.utilizationLimitPct > 0 &&
      inputs.borrowedAmount.gte(inputs.totalSupply.mul(inputs.utilizationLimitPct).div(100))
    );
  }

  getBorrowFactor(): Decimal {
    return new Decimal(this.state.config.borrowFactorPct.toString()).div(100);
  }

  /**
   * @returns the reserve's borrow factor as a {@link Fraction}, mirroring the on-chain `get_borrow_factor`:
   * `max(1, borrow_factor_pct%)`.
   */
  getBorrowFactorFraction(): Fraction {
    const one = Fraction.fromInt(1);
    // Truncating percent (`floor(pct * 2^60 / 100)`) to match `Fraction::from_percent`; `Fraction.fromPercent`
    // rounds to nearest and so diverges by one ulp at borrow factors such as 110%.
    const borrowFactor = Fraction.fromInt(this.state.config.borrowFactorPct).mulIntRatio(1, 100);
    return borrowFactor.lt(one) ? one : borrowFactor;
  }

  /**
   * Borrow-interest component of the supply APR (i.e. utilization × borrow-rate × (1 − take)).
   *
   * Utilization and borrow rate are both evaluated from the same estimated reserve state,
   * including the rewards distribution implied by {@link reserveRewardsMaxAprBps}.
   *
   * Does NOT include the reserve-rewards distribution contribution itself (the inflation-of-cToken-
   * exchange-rate yield); see {@link calculateTheoreticalReserveRewardsSupplyAPR} for that component. Callers
   * that want the combined depositor yield should add the two.
   */
  calculateSupplyAPR(slot: Slot, referralFeeBps: number) {
    const currentUtilization = this.getEstimatedUtilizationRatio(slot, referralFeeBps);
    const borrowRate = this.calculateEstimatedBorrowRate(slot, referralFeeBps);
    const protocolTakeRatePct = 1 - this.state.config.protocolTakeRatePct / 100;
    return currentUtilization * borrowRate * protocolTakeRatePct;
  }

  /**
   * Returns the rewards-distribution component of the supply APR — the annualized rate at
   * which the on-chain `distribute_rewards` step inflates the cToken exchange rate.
   *
   * Exposed separately from {@link calculateSupplyAPR} (which returns the borrow-interest yield
   * only) so that callers can render or use the two components independently.
   *
   * Returns the lesser of:
   *   - `rewardsAmountPerSlot * SLOTS_PER_YEAR / total_supply` — the configured per-slot drip rate,
   *   - `reserveRewardsMaxAprBps / FULL_BPS` — the market-level cap.
   *
   * Returns `0` only when rewards are configured off (market cap is `0` or RPS is `0`), or
   * when `total_supply` is zero (no depositors to earn the rate).
   *
   * Note on `rewardsAmountAvailable`: the realized rewards yield drops to zero whenever the
   * on-chain budget is depleted (until an admin tops it up). The SDK cannot predict topup
   * cadence, so this function returns the **steady-state rate** — what depositors earn while
   * the budget is non-zero.
   */
  calculateTheoreticalReserveRewardsSupplyAPR(slot: Slot, referralFeeBps: number): number {
    if (this.reserveRewardsMaxAprBps === 0) {
      return 0;
    }
    const rps = new Decimal(this.state.config.rewardsAmountPerSlot.toString());
    if (rps.isZero()) {
      return 0;
    }
    // On-chain `distribute_rewards` evaluates its APR cap against the post-accrue, pre-distribute
    // supply (see `programs/klend/src/state/reserve.rs` — `total_supply()` is read before
    // `total_available_amount` is incremented by the distribution). Use the pre-rewards supply
    // here too, otherwise we'd be feeding the distribution back into its own denominator and
    // under-stating the rate.
    const { totalSupply } = this.getEstimatedDebtAndSupplyPreRewards(slot, referralFeeBps);
    if (totalSupply.isZero()) {
      return 0;
    }
    const rpsRate = rps.mul(SLOTS_PER_YEAR).div(totalSupply).toNumber();
    const aprCap = this.reserveRewardsMaxAprBps / ONE_HUNDRED_PCT_IN_BPS;
    return Math.min(rpsRate, aprCap);
  }

  /**
   * Rewards-distribution supply APR the reserve is earning right now: equals
   * {@link calculateTheoreticalReserveRewardsSupplyAPR} while the on-chain rewards budget is funded, and `0`
   * once `rewardsAmountAvailable` is depleted (the on-chain `distribute_rewards` step distributes
   * nothing until an admin tops the budget up).
   *
   * Use this for reporting current/actual yield; use {@link calculateTheoreticalReserveRewardsSupplyAPR} for
   * the steady-state rate (eg. theoretical APY projections).
   */
  calculateEffectiveReserveRewardsSupplyAPR(slot: Slot, referralFeeBps: number): number {
    if (this.state.liquidity.rewardsAmountAvailable.isZero()) {
      return 0;
    }
    return this.calculateTheoreticalReserveRewardsSupplyAPR(slot, referralFeeBps);
  }

  /**
   * Mirrors the on-chain `refresh_reserve` (`accrue_interest` → `distribute_rewards`) and returns
   * the post-refresh debt and supply. The rewards-distribution step is driven by
   * {@link reserveRewardsMaxAprBps} (`0`, i.e. rewards disabled on the market, makes it a no-op).
   */
  getEstimatedDebtAndSupply(slot: Slot, referralFeeBps: number): { totalBorrow: Decimal; totalSupply: Decimal } {
    const slotsElapsed = maxBigInt(slot - BigInt(this.state.lastUpdate.slot.toNumber()), 0n);
    const { totalBorrow, totalSupply } = this.getEstimatedDebtAndSupplyPreRewards(slot, referralFeeBps);
    const distributedRewards = this.simulateDistributeRewards(slotsElapsed, totalSupply);
    return { totalBorrow, totalSupply: totalSupply.add(distributedRewards) };
  }

  /**
   * The amount the `distribute_rewards` step of a refresh at `slot` would move out of
   * `rewardsAmountAvailable` and into the reserve's available liquidity.
   */
  private getEstimatedDistributedRewards(slot: Slot, referralFeeBps: number): Decimal {
    const slotsElapsed = maxBigInt(slot - BigInt(this.state.lastUpdate.slot.toNumber()), 0n);
    const { totalSupply } = this.getEstimatedDebtAndSupplyPreRewards(slot, referralFeeBps);
    return this.simulateDistributeRewards(slotsElapsed, totalSupply);
  }

  /**
   * Debt and supply after the `accrue_interest` step only — the pre-distribution state.
   *
   * This is what the on-chain code sees while accruing interest: the borrow index
   * ({@link getEstimatedCumulativeBorrowRate}) and the rewards-distribution APR cap
   * ({@link calculateTheoreticalReserveRewardsSupplyAPR}, {@link simulateDistributeRewards}) are all
   * evaluated against this state, never against the post-distribution one.
   */
  private getEstimatedDebtAndSupplyPreRewards(
    slot: Slot,
    referralFeeBps: number
  ): { totalBorrow: Decimal; totalSupply: Decimal } {
    const slotsElapsed = maxBigInt(slot - BigInt(this.state.lastUpdate.slot.toNumber()), 0n);
    let totalBorrow: Decimal;
    let totalSupply: Decimal;
    if (slotsElapsed === 0n) {
      totalBorrow = this.getBorrowedAmount();
      totalSupply = this.getTotalSupply();
    } else {
      const { newDebt, newAccProtocolFees, pendingReferralFees } = this.compoundInterest(slotsElapsed, referralFeeBps);
      const postAccrueTotalSupply = this.getLiquidityAvailableAmount()
        .add(newDebt)
        .sub(newAccProtocolFees)
        .sub(this.getAccumulatedReferrerFees())
        .sub(pendingReferralFees);
      totalBorrow = newDebt;
      totalSupply = postAccrueTotalSupply;
    }
    return { totalBorrow, totalSupply };
  }

  /**
   * Mirrors on-chain `Reserve::distribute_rewards` (programs/klend/src/state/reserve.rs).
   *
   * Computes how much of `rewards_amount_available` would be moved into `total_available_amount`
   * during a refresh at the given slot, capped by the per-slot RPS budget and the market-level
   * APR ({@link reserveRewardsMaxAprBps}).
   *
   * `postAccrueTotalSupply` must be the supply *after* `accrue_interest` has run for the same
   * `slotsElapsed` (this is what the on-chain code uses for the APR cap).
   *
   * Every quantity the on-chain formula operates on is an integer, so this is computed in `bigint`
   * to match it exactly: the `total_supply * apr_bps * slots_elapsed` product exceeds the 20
   * significant digits {@link Decimal} keeps by default long before it exceeds the program's `u128`,
   * and rounding it would shift the final floor by a lamport.
   */
  private simulateDistributeRewards(slotsElapsed: bigint, postAccrueTotalSupply: Decimal): Decimal {
    const maxAprBps = BigInt(this.reserveRewardsMaxAprBps);
    const rps = BigInt(this.state.config.rewardsAmountPerSlot.toString());
    const rewardsAvailable = BigInt(this.state.liquidity.rewardsAmountAvailable.toString());
    const mintTotalSupply = BigInt(this.state.collateral.mintTotalSupply.toString());

    if (slotsElapsed === 0n || maxAprBps === 0n || rps === 0n || rewardsAvailable === 0n || mintTotalSupply === 0n) {
      return new Decimal(0);
    }

    const rawDistribution = rps * slotsElapsed;
    // APR cap: floor(floor(total_supply) * apr_bps * slots_elapsed / (FULL_BPS * SLOTS_PER_YEAR))
    // On-chain calls `total_supply().to_floor()` *before* the multiplication
    // (programs/klend/src/state/reserve.rs::distribute_rewards), so we floor first too; the
    // program's integer division then truncates the quotient, like `bigint` division does here.
    const flooredTotalSupply = BigInt(postAccrueTotalSupply.floor().toFixed(0));
    const aprCap =
      (flooredTotalSupply * maxAprBps * slotsElapsed) / (BigInt(ONE_HUNDRED_PCT_IN_BPS) * BigInt(SLOTS_PER_YEAR));

    return new Decimal(minBigInt(rawDistribution, aprCap, rewardsAvailable).toString());
  }

  getEstimatedAccumulatedProtocolFees(
    slot: Slot,
    referralFeeBps: number
  ): { accumulatedProtocolFees: Decimal; compoundedVariableProtocolFee: Decimal; compoundedFixedHostFee: Decimal } {
    const slotsElapsed = maxBigInt(slot - BigInt(this.state.lastUpdate.slot.toString()), 0n);
    let accumulatedProtocolFees: Decimal;
    let compoundedVariableProtocolFee: Decimal;
    let compoundedFixedHostFee: Decimal;
    if (slotsElapsed === 0n) {
      accumulatedProtocolFees = this.getAccumulatedProtocolFees();
      compoundedVariableProtocolFee = new Decimal(0);
      compoundedFixedHostFee = new Decimal(0);
    } else {
      const { newAccProtocolFees, variableProtocolFee, fixedHostFee } = this.compoundInterest(
        slotsElapsed,
        referralFeeBps
      );
      accumulatedProtocolFees = newAccProtocolFees;
      compoundedVariableProtocolFee = variableProtocolFee;
      compoundedFixedHostFee = fixedHostFee;
    }
    return { accumulatedProtocolFees, compoundedVariableProtocolFee, compoundedFixedHostFee };
  }

  calculateUtilizationRatio(): number {
    const totalBorrows = this.getBorrowedAmount();
    const totalSupply = this.getTotalSupply();
    if (totalSupply.eq(0)) {
      return 0;
    }
    return totalBorrows.dividedBy(totalSupply).toNumber();
  }

  getEstimatedUtilizationRatio(slot: Slot, referralFeeBps: number): number {
    const { totalBorrow: estimatedTotalBorrowed, totalSupply: estimatedTotalSupply } = this.getEstimatedDebtAndSupply(
      slot,
      referralFeeBps
    );
    if (estimatedTotalSupply.eq(0)) {
      return 0;
    }

    return estimatedTotalBorrowed.dividedBy(estimatedTotalSupply).toNumber();
  }

  calcSimulatedUtilizationRatio(
    amount: Decimal,
    action: ActionType,
    slot: Slot,
    referralFeeBps: number,
    outflowAmount?: Decimal
  ): number {
    const { totalBorrow: previousTotalBorrowed, totalSupply: previousTotalSupply } = this.getEstimatedDebtAndSupply(
      slot,
      referralFeeBps
    );

    switch (action) {
      case 'deposit': {
        const newTotalSupply = previousTotalSupply.add(amount);
        return previousTotalBorrowed.dividedBy(newTotalSupply).toNumber();
      }
      case 'withdraw': {
        const newTotalSupply = previousTotalSupply.sub(amount);
        if (newTotalSupply.eq(0)) {
          return 0;
        } else {
          return previousTotalBorrowed.dividedBy(newTotalSupply).toNumber();
        }
      }
      case 'borrow': {
        const newTotalBorrowed = previousTotalBorrowed.add(amount);
        return newTotalBorrowed.dividedBy(previousTotalSupply).toNumber();
      }
      case 'repay': {
        const newTotalBorrowed = previousTotalBorrowed.sub(amount);
        return newTotalBorrowed.dividedBy(previousTotalSupply).toNumber();
      }
      case 'depositAndBorrow': {
        const newTotalSupply = previousTotalSupply.add(amount);
        const newTotalBorrowed = previousTotalBorrowed.add(outflowAmount!);
        return newTotalBorrowed.dividedBy(newTotalSupply).toNumber();
      }
      case 'repayAndWithdraw': {
        const newTotalBorrowed = previousTotalBorrowed.sub(amount);
        const newTotalSupply = previousTotalSupply.sub(outflowAmount!);
        if (newTotalSupply.eq(0)) {
          return 0;
        }
        return newTotalBorrowed.dividedBy(newTotalSupply).toNumber();
      }
      case 'mint': {
        const newTotalSupply = previousTotalSupply.add(amount);
        return previousTotalBorrowed.dividedBy(newTotalSupply).toNumber();
      }
      case 'redeem': {
        const newTotalSupply = previousTotalSupply.sub(amount);
        return previousTotalBorrowed.dividedBy(newTotalSupply).toNumber();
      }
      default:
        throw Error(`Invalid action type ${action} for simulatedUtilizationRatio`);
    }
  }

  getMaxBorrowAmountWithCollReserve(market: KaminoMarket, collReserve: KaminoReserve): Decimal {
    const groups = market.state.elevationGroups;
    const commonElevationGroups = market.getCommonElevationGroupsForPair(collReserve, this);

    let eModeGroup = 0;

    if (commonElevationGroups.length !== 0) {
      const eModeGroupWithMaxLtvAndDebtReserve = commonElevationGroups.reduce((prev, curr) => {
        const prevGroup = groups.find((group) => group.id === prev);
        const currGroup = groups.find((group) => group.id === curr);
        return prevGroup!.ltvPct > currGroup!.ltvPct ? prev : curr;
      });

      eModeGroup = groups.find((group) => group.id === eModeGroupWithMaxLtvAndDebtReserve)!.id;
    }

    const elevationGroupActivated = this.state.config.elevationGroups.includes(eModeGroup) && eModeGroup !== 0;

    const reserveAvailableAmount = this.getLiquidityAvailableAmount();
    const reserveBorrowCapRemained = this.stats.reserveBorrowLimit.sub(this.getBorrowedAmount());

    let maxBorrowAmount = Decimal.min(reserveAvailableAmount, reserveBorrowCapRemained);

    const currentUnixTimestamp = Math.floor(Date.now() / 1000);
    const debtWithdrawalCap = this.getDebtWithdrawalCapCapacity().sub(
      this.getDebtWithdrawalCapCurrent(currentUnixTimestamp)
    );
    maxBorrowAmount = this.getDebtWithdrawalCapCapacity().gt(0)
      ? Decimal.min(maxBorrowAmount, debtWithdrawalCap)
      : maxBorrowAmount;

    let originationFeeRate = this.getBorrowFee();

    // Inclusive fee rate
    originationFeeRate = originationFeeRate.div(originationFeeRate.add(new Decimal(1)));
    const borrowFee = maxBorrowAmount.mul(originationFeeRate);

    maxBorrowAmount = maxBorrowAmount.sub(borrowFee);

    const utilizationRatioLimit = this.state.config.utilizationLimitBlockBorrowingAbovePct / 100;
    const currentUtilizationRatio = this.calculateUtilizationRatio();

    if (utilizationRatioLimit > 0 && currentUtilizationRatio > utilizationRatioLimit) {
      return new Decimal(0);
    } else if (utilizationRatioLimit > 0 && currentUtilizationRatio < utilizationRatioLimit) {
      const maxBorrowBasedOnUtilization = new Decimal(utilizationRatioLimit - currentUtilizationRatio).mul(
        this.getTotalSupply()
      );
      maxBorrowAmount = Decimal.min(maxBorrowAmount, maxBorrowBasedOnUtilization);
    }

    let borrowLimitDependentOnElevationGroup = new Decimal(U64_MAX);

    if (!elevationGroupActivated) {
      borrowLimitDependentOnElevationGroup = this.getBorrowLimitOutsideElevationGroup().sub(
        this.getBorrowedAmountOutsideElevationGroup()
      );
    } else {
      let maxDebtTakenAgainstCollaterals = new Decimal(U64_MAX);
      const maxDebtAllowedAgainstCollateral = collReserve
        .getBorrowLimitAgainstCollateralInElevationGroup(eModeGroup - 1)
        .sub(collReserve.getBorrowedAmountAgainstCollateralInElevationGroup(eModeGroup - 1));

      maxDebtTakenAgainstCollaterals = Decimal.max(
        new Decimal(0),
        Decimal.min(maxDebtAllowedAgainstCollateral, maxDebtTakenAgainstCollaterals)
      );
      borrowLimitDependentOnElevationGroup = maxDebtTakenAgainstCollaterals;
    }

    maxBorrowAmount = Decimal.min(maxBorrowAmount, borrowLimitDependentOnElevationGroup);

    return Decimal.max(new Decimal(0), maxBorrowAmount);
  }

  /**
   * Simulated borrow rate for a hypothetical deposit/withdraw, evaluated at the rewards-aware
   * post-action utilization (see {@link reserveRewardsMaxAprBps}).
   */
  calcSimulatedBorrowRate(
    amount: Decimal,
    action: ActionType,
    slot: Slot,
    referralFeeBps: number,
    outflowAmount?: Decimal
  ) {
    const slotAdjustmentFactor = this.slotAdjustmentFactor();
    const newUtilization = this.calcSimulatedUtilizationRatio(amount, action, slot, referralFeeBps, outflowAmount);
    const curve = truncateBorrowCurve(this.state.config.borrowRateCurve.points);
    return getBorrowRate(newUtilization, curve) * slotAdjustmentFactor;
  }

  /**
   * Simulated borrow APR. Same semantics as {@link calcSimulatedBorrowRate} plus the fixed
   * host interest component.
   */
  calcSimulatedBorrowAPR(
    amount: Decimal,
    action: ActionType,
    slot: Slot,
    referralFeeBps: number,
    outflowAmount?: Decimal
  ) {
    return (
      this.calcSimulatedBorrowRate(amount, action, slot, referralFeeBps, outflowAmount) +
      this.getFixedHostInterestRate().toNumber() * this.slotAdjustmentFactor()
    );
  }

  /**
   * Borrow-interest component of the supply APR for a simulated deposit/withdraw — symmetric
   * with {@link calculateSupplyAPR}. Does NOT include the reserve-rewards distribution
   * component; see {@link calculateTheoreticalReserveRewardsSupplyAPR} for the snapshot rewards rate
   * (callers can add the two for the combined depositor yield).
   */
  calcSimulatedSupplyAPR(
    amount: Decimal,
    action: ActionType,
    slot: Slot,
    referralFeeBps: number,
    outflowAmount?: Decimal
  ) {
    const newUtilization = this.calcSimulatedUtilizationRatio(amount, action, slot, referralFeeBps, outflowAmount);
    const simulatedBorrowAPR = this.calcSimulatedBorrowRate(amount, action, slot, referralFeeBps, outflowAmount);
    const protocolTakeRatePct = 1 - this.state.config.protocolTakeRatePct / 100;

    return newUtilization * simulatedBorrowAPR * protocolTakeRatePct;
  }

  slotAdjustmentFactor(): number {
    return 1000 / SLOTS_PER_SECOND / this.recentSlotDurationMs;
  }

  calculateBorrowRate() {
    const slotAdjustmentFactor = this.slotAdjustmentFactor();
    const currentUtilization = this.calculateUtilizationRatio();
    const curve = truncateBorrowCurve(this.state.config.borrowRateCurve.points);

    return getBorrowRate(currentUtilization, curve) * slotAdjustmentFactor;
  }

  /**
   * The reserve's peak (worst-case) borrow rate in bps: the maximum point of its borrow-rate curve.
   * Mirrors on-chain `ReserveConfig::max_borrow_rate_bps`, used to gate borrow-order fills against the
   * order's max acceptable rate. The borrow-rate curve is a fixed-length on-chain array, so an empty one means
   * the reserve is misconfigured and this throws.
   */
  getMaxBorrowRateBps(): number {
    const points = this.state.config.borrowRateCurve.points;
    if (points.length === 0) {
      throw new Error(`Reserve ${this.address} has an empty borrow rate curve`);
    }
    return Math.max(...points.map((point) => point.borrowRateBps));
  }

  /**
   * The reserve's remaining debt term in seconds, or `undefined` if it is open-term (a float reserve with neither
   * a fixed term nor a maturity timestamp). If both `debtTermSeconds` and `debtMaturityTimestamp` are set, the
   * shorter remaining cap is returned, because the on-chain `fill_borrow_order` instruction checks both.
   *
   * @param currentTimestamp current unix time in seconds, used for the seconds-until-maturity case.
   */
  getRemainingDebtTermSeconds(currentTimestamp: number): BN | undefined {
    const { debtTermSeconds, debtMaturityTimestamp } = this.state.config;
    const termCaps: BN[] = [];
    if (!debtTermSeconds.eqn(0)) {
      termCaps.push(debtTermSeconds);
    }
    if (!debtMaturityTimestamp.eqn(0)) {
      termCaps.push(BN.max(debtMaturityTimestamp.sub(new BN(currentTimestamp)), new BN(0)));
    }
    return termCaps.length === 0 ? undefined : termCaps.reduce((shortest, cap) => BN.min(shortest, cap));
  }

  /**
   * Estimated borrow rate, evaluated at the rewards-aware utilization implied by
   * {@link reserveRewardsMaxAprBps}.
   */
  calculateEstimatedBorrowRate(slot: Slot, referralFeeBps: number) {
    const slotAdjustmentFactor = this.slotAdjustmentFactor();
    const estimatedCurrentUtilization = this.getEstimatedUtilizationRatio(slot, referralFeeBps);
    const curve = truncateBorrowCurve(this.state.config.borrowRateCurve.points);
    return getBorrowRate(estimatedCurrentUtilization, curve) * slotAdjustmentFactor;
  }

  /**
   * Borrow APR (curve-driven borrow rate + fixed host interest). The utilization that feeds
   * the curve is computed with the rewards-distribution simulation of
   * {@link reserveRewardsMaxAprBps} applied.
   */
  calculateBorrowAPR(slot: Slot, referralFeeBps: number) {
    const slotAdjustmentFactor = this.slotAdjustmentFactor();
    const borrowRate = this.calculateEstimatedBorrowRate(slot, referralFeeBps);
    return borrowRate + this.getFixedHostInterestRate().toNumber() * slotAdjustmentFactor;
  }

  calculateBorrowAPRFixedRate() {
    if (!this.reserveKind.isFixedRate()) {
      throw new Error(
        'calculateBorrowAPRFixedRate should only be called for fixed rate reserves; for float rate reserves, see calculateBorrowAPR'
      );
    }
    const slotAdjustmentFactor = this.slotAdjustmentFactor();
    const borrowRate =
      (this.reserveKind as FixedRateReserveKind).borrowRateBps / ONE_HUNDRED_PCT_IN_BPS +
      this.getFixedHostInterestRate().toNumber();
    return borrowRate * slotAdjustmentFactor;
  }

  /**
   * For a fixed-rate (fixed-term) reserve, returns the terms a fresh borrow into this reserve would be (re-)originated
   * with, so callers can surface that an obligation's debt term/rate/maturity is being (re)stamped. A direct borrow
   * stamps `last_borrowed_at = now` and does NOT carry over any prior auto-rollover config (so `rolloverReset` is
   * always true for the SDK's flash-based flows). Returns `undefined` for open-term (variable) reserves.
   *
   * `debt_term_seconds` and `debt_maturity_timestamp` are independent on-chain axes: a direct borrow stamps the full
   * configured term for early-repay calculations, while the reserve-wide maturity remains an absolute timestamp.
   */
  getFixedTermReorigination(): FixedTermReorigination | undefined {
    if (!this.reserveKind.isFixedRate()) {
      return undefined;
    }
    const kind = this.reserveKind as FixedRateReserveKind;
    const configTermSeconds = kind.debtTermSeconds.toNumber();
    return {
      newDebtTermSeconds: configTermSeconds,
      newDebtTermMaturityTimestamp: this.state.config.debtMaturityTimestamp.toNumber(),
      newBorrowRateBps: kind.borrowRateBps,
      rolloverReset: true,
    };
  }

  /**
   * Throws if a fresh borrow into this reserve would be rejected on-chain because the reserve-wide debt maturity has
   * been reached (`ReserveDebtMaturityReached`). No-op for reserves without a configured `debt_maturity_timestamp`.
   * Use this to preflight the (re-)origination of debt before building a swap-debt / swap-collateral / leverage tx so
   * callers get a clear error instead of an opaque on-chain revert.
   *
   * This low-level helper retains a wall-clock default, but transaction builders pass the block time from a
   * `LedgerInstant` fetched at the same commitment as their loaded state. Other callers that need a deterministic
   * clock should likewise pass a cluster-derived `currentTimestamp` (e.g. from `getBlockTime`). The on-chain check
   * runs against cluster time at execution, so a borrow that crosses maturity after this preflight still fails
   * cleanly at simulation with the on-chain error.
   *
   * @param currentTimestamp unix seconds (defaults to the current wall clock)
   */
  assertCanOriginateDebt(currentTimestamp: number = Math.floor(Date.now() / 1000)): void {
    const debtMaturityTimestamp = this.state.config.debtMaturityTimestamp;
    if (!debtMaturityTimestamp.eqn(0) && debtMaturityTimestamp.lten(currentTimestamp)) {
      throw new Error(
        `Reserve ${this.address} (${this.symbol}) has reached its debt maturity timestamp ` +
          `(${debtMaturityTimestamp.toString()} <= ${currentTimestamp}); new borrows are rejected on-chain ` +
          `(ReserveDebtMaturityReached). Cannot originate debt into this reserve.`
      );
    }
  }

  /**
   * @returns the mint of the reserve liquidity token
   */
  getLiquidityMint(): Address {
    return this.state.liquidity.mintPubkey;
  }

  /**
   * @returns the token program of the reserve liquidity mint
   */
  getLiquidityTokenProgram(): Address {
    return this.state.liquidity.tokenProgram;
  }

  /**
   * @returns the mint of the reserve collateral token , i.e. the cToken minted for depositing the liquidity token
   */
  getCTokenMint(): Address {
    return this.state.collateral.mintPubkey;
  }

  /**
   * Returns the reserve kind (FloatRateReserveKind or FixedRateReserveKind) for this reserve.
   *
   * @returns The reserve kind instance
   */
  getKind(): ReserveKind {
    return this.reserveKind;
  }

  calculateFees(
    amountLamports: Decimal,
    borrowFeeRate: Decimal,
    feeCalculation: FeeCalculation,
    referralFeeBps: number,
    hasReferrer: boolean
  ): Fees {
    const referralFeeRate = new Decimal(referralFeeBps).div(ONE_HUNDRED_PCT_IN_BPS);
    if (borrowFeeRate.gt('0') && amountLamports.gt('0')) {
      const needToAssessReferralFee = referralFeeRate.gt('0') && hasReferrer;
      const minimumFee = new Decimal('1'); // 1 token to market owner, nothing to referrer

      let borrowFeeAmount: Decimal;
      if (feeCalculation === FeeCalculation.Exclusive) {
        borrowFeeAmount = amountLamports.mul(borrowFeeRate);
      } else {
        const borrowFeeFactor = borrowFeeRate.div(borrowFeeRate.add('1'));
        borrowFeeAmount = amountLamports.mul(borrowFeeFactor);
      }
      const borrowFee = Decimal.max(borrowFeeAmount, minimumFee);
      if (borrowFee.gte(amountLamports)) {
        throw Error('Borrow amount is too small to receive liquidity after fees');
      }
      const referralFee = needToAssessReferralFee
        ? referralFeeRate.eq(1)
          ? borrowFee
          : borrowFee.mul(referralFeeRate).floor()
        : new Decimal(0);

      const protocolFee = borrowFee.sub(referralFee);

      return { protocolFees: protocolFee, referrerFees: referralFee };
    } else {
      return { protocolFees: new Decimal(0), referrerFees: new Decimal(0) };
    }
  }

  calculateFlashLoanFees(flashLoanAmountLamports: Decimal, referralFeeBps: number, hasReferrer: boolean): Fees {
    return this.calculateFees(
      flashLoanAmountLamports,
      this.getFlashLoanFee(),
      FeeCalculation.Exclusive,
      referralFeeBps,
      hasReferrer
    );
  }

  async load(tokenOraclePrice: TokenOracleData) {
    await this.reloadState();
    this.tokenOraclePrice = tokenOraclePrice;
  }

  async reloadState() {
    // the parent lending market of a reserve never changes, so its rewards cap can be
    // re-fetched in parallel with the reserve account itself
    const [parsedData, cdnResourcesData, reserveRewardsMaxAprBps] = await Promise.all([
      Reserve.fetch(this.rpc, this.address, this.programId),
      kaminoCdn.getData(),
      fetchReserveRewardsMaxAprBps(this.rpc, this.state.lendingMarket, this.programId),
    ]);
    if (!parsedData) {
      throw Error(`Unable to parse data of reserve ${this.symbol}`);
    }
    this.state = parsedData;
    this.stats = this.formatReserveData(parsedData, cdnResourcesData?.deprecatedAssets ?? []);
    this.reserveRewardsMaxAprBps = reserveRewardsMaxAprBps;
  }

  /**
   * Borrow-interest supply APY (does not include reserve-rewards distribution; see
   * {@link calculateTheoreticalReserveRewardsSupplyAPR} for that). The borrow rate that feeds this is
   * evaluated at the rewards-aware utilization (see {@link reserveRewardsMaxAprBps}).
   */
  totalSupplyAPY(currentSlot: Slot) {
    const { stats } = this;
    if (!stats) {
      throw Error('KaminoMarket must call loadRewards.');
    }

    return calculateAPYFromAPR(this.calculateSupplyAPR(currentSlot, 0));
  }

  /**
   * Borrow APY. The curve-driven borrow rate is evaluated at the rewards-aware utilization
   * (see {@link reserveRewardsMaxAprBps}).
   */
  totalBorrowAPY(currentSlot: Slot) {
    const { stats } = this;
    if (!stats) {
      throw Error('KaminoMarket must call loadRewards.');
    }

    return calculateAPYFromAPR(this.calculateBorrowAPR(currentSlot, 0));
  }

  totalBorrowAPYFixedRate() {
    const { stats } = this;
    if (!stats) {
      throw Error('KaminoMarket must call loadRewards.');
    }

    return calculateAPYFromAPR(this.calculateBorrowAPRFixedRate());
  }

  async loadFarmStates(_farmsProgramId?: Address) {
    if (!this.farmData.fetched) {
      const farmStates: FarmAndKey[] = [];
      const debtFarmAddress = this.getDebtFarmAddress();
      if (isSome(debtFarmAddress)) {
        const farmState = await fetchFarmStateOrNull(this.rpc, debtFarmAddress.value);
        if (farmState !== null) {
          farmStates.push({ farmState, key: debtFarmAddress.value });
        }
      }
      const collateralFarmAddress = this.getCollateralFarmAddress();
      if (isSome(collateralFarmAddress)) {
        const farmState = await fetchFarmStateOrNull(this.rpc, collateralFarmAddress.value);
        if (farmState !== null) {
          farmStates.push({ farmState, key: collateralFarmAddress.value });
        }
      }
      this.farmData.farms = farmStates;
      this.farmData.fetched = true;
    }
  }

  async getRewardYields(prices: KaminoPrices, farmsProgramId?: Address): Promise<ReserveRewardYield[]> {
    const { stats } = this;
    if (!stats) {
      throw Error('KaminoMarket must call loadReserves.');
    }

    await this.loadFarmStates(farmsProgramId);
    const yields: ReserveRewardYield[] = [];
    for (const farmAndKey of this.farmData.farms) {
      const isDebtReward = this.state.farmDebt === farmAndKey.key;
      for (const rewardInfo of farmAndKey.farmState.rewardInfos.filter(
        (x) => x.token.mint !== DEFAULT_PUBLIC_KEY && x.rewardsAvailable !== 0n
      )) {
        const { apy, apr } = this.calculateRewardYield(
          prices,
          rewardInfo,
          isDebtReward,
          new Decimal(farmAndKey.farmState.totalActiveStakeScaled.toString())
        );
        if (apy.isZero() && apr.isZero()) {
          continue;
        }
        yields.push({ apy, apr, rewardInfo });
      }
    }
    return yields;
  }

  calculateRewardYield(
    prices: KaminoPrices,
    rewardInfo: RewardInfo,
    isDebtReward: boolean,
    farmTotalStakeLamports: Decimal
  ) {
    const mintAddress = this.getLiquidityMint();
    const rewardPerTimeUnitSecond = getRewardPerTimeUnitSecond(rewardInfo, farmTotalStakeLamports);
    const reserveToken = prices.spot[mintAddress.toString()];
    const rewardToken = prices.spot[rewardInfo.token.mint.toString()];

    if (rewardPerTimeUnitSecond.isZero() || reserveToken === undefined || rewardToken === undefined) {
      return { apy: new Decimal(0), apr: new Decimal(0) };
    }
    const { decimals } = this.stats;
    const totalBorrows = this.getBorrowedAmount();
    const totalSupply = this.getTotalSupply();

    const totalAmount = isDebtReward
      ? lamportsToNumberDecimal(totalBorrows, decimals)
      : lamportsToNumberDecimal(totalSupply, decimals);
    const totalValue = totalAmount.mul(reserveToken.price);
    const rewardsInYear = rewardPerTimeUnitSecond.mul(60 * 60 * 24 * 365);
    const rewardsInYearValue = rewardsInYear.mul(rewardToken.price);
    const apr = rewardsInYearValue.div(totalValue);
    return { apy: aprToApy(apr, 365), apr };
  }

  private formatReserveData(parsedData: ReserveFields, deprecatedAssets: string[]): ReserveDataType {
    const mintTotalSupply = new Decimal(parsedData.collateral.mintTotalSupply.toString()).div(this.getMintFactor());
    let reserveStatus = ReserveStatus.Active;
    switch (parsedData.config.status) {
      case 0:
        reserveStatus = ReserveStatus.Active;
        break;
      case 1:
        reserveStatus = ReserveStatus.Obsolete;
        break;
      case 2:
        reserveStatus = ReserveStatus.Hidden;
        break;
    }
    const reserveIsUIDeprecated =
      deprecatedAssets.length > 0 ? deprecatedAssets.includes(this.address.toString()) : undefined;
    return {
      // Reserve config

      status: reserveStatus,
      mintAddress: parsedData.liquidity.mintPubkey,
      borrowCurve: truncateBorrowCurve(parsedData.config.borrowRateCurve.points),
      loanToValue: parsedData.config.loanToValuePct / 100,
      maxLiquidationBonus: parsedData.config.maxLiquidationBonusBps / 10000,
      minLiquidationBonus: parsedData.config.minLiquidationBonusBps / 10000,
      liquidationThreshold: parsedData.config.liquidationThresholdPct / 100,
      protocolTakeRate: parsedData.config.protocolTakeRatePct / 100,
      reserveDepositLimit: new Decimal(parsedData.config.depositLimit.toString()),
      reserveBorrowLimit: new Decimal(parsedData.config.borrowLimit.toString()),

      // Reserve info
      symbol: parseTokenSymbol(parsedData.config.tokenInfo.name),
      decimals: this.getMintDecimals(),
      accumulatedProtocolFees: this.getAccumulatedProtocolFees().div(this.getMintFactor()),
      mintTotalSupply,
      depositLimitCrossedTimestamp: parsedData.liquidity.depositLimitCrossedTimestamp.toNumber(),
      borrowLimitCrossedTimestamp: parsedData.liquidity.borrowLimitCrossedTimestamp.toNumber(),
      borrowFactor: parsedData.config.borrowFactorPct.toNumber(),
      isUIDeprecated: reserveIsUIDeprecated,
    };
  }

  /**
   * Compound current borrow rate over elapsed slots
   *
   * This also calculates protocol fees, which are taken for all obligations that have borrowed from current reserve.
   *
   * This also calculates referral fees, which are taken into pendingReferralFees.
   *
   * https://github.com/Kamino-Finance/klend/blob/release/1.3.0/programs/klend/src/state/reserve.rs#L517
   *
   * @param slotsElapsed
   * @param referralFeeBps
   */
  private compoundInterest(
    slotsElapsed: bigint,
    referralFeeBps: number
  ): {
    compoundedInterestRate: Decimal;
    newDebt: Decimal;
    netNewDebt: Decimal;
    variableProtocolFee: Decimal;
    fixedHostFee: Decimal;
    absoluteReferralFee: Decimal;
    maxReferralFees: Decimal;
    newAccProtocolFees: Decimal;
    pendingReferralFees: Decimal;
  } {
    const currentBorrowRate = this.calculateBorrowRate();
    const protocolTakeRate = new Decimal(this.state.config.protocolTakeRatePct).div(100);
    const referralRate = new Decimal(referralFeeBps).div(10_000);
    const fixedHostInterestRate = this.getFixedHostInterestRate();

    const compoundedInterestRate = this.approximateCompoundedInterest(
      new Decimal(currentBorrowRate).plus(fixedHostInterestRate),
      slotsElapsed
    );
    const compoundedFixedRate = this.approximateCompoundedInterest(fixedHostInterestRate, slotsElapsed);

    const previousDebt = this.getBorrowedAmount();
    const newDebt = previousDebt.mul(compoundedInterestRate);
    const fixedHostFee = previousDebt.mul(compoundedFixedRate).sub(previousDebt);

    const netNewDebt = newDebt.sub(previousDebt).sub(fixedHostFee);

    const variableProtocolFee = netNewDebt.mul(protocolTakeRate);
    const absoluteReferralFee = protocolTakeRate.mul(referralRate);
    const maxReferralFees = netNewDebt.mul(absoluteReferralFee);

    const newAccProtocolFees = variableProtocolFee
      .add(fixedHostFee)
      .sub(maxReferralFees)
      .add(this.getAccumulatedProtocolFees());

    const pendingReferralFees = this.getPendingReferrerFees().add(maxReferralFees);

    return {
      compoundedInterestRate,
      newDebt,
      netNewDebt,
      variableProtocolFee,
      fixedHostFee,
      absoluteReferralFee,
      maxReferralFees,
      newAccProtocolFees,
      pendingReferralFees,
    };
  }

  /**
   * Approximation to match the smart contract calculation
   * https://github.com/Kamino-Finance/klend/blob/release/1.3.0/programs/klend/src/state/reserve.rs#L1026
   * @param rate
   * @param elapsedSlots
   */
  private approximateCompoundedInterest(rate: Decimal, elapsedSlots: bigint): Decimal {
    const base = rate.div(SLOTS_PER_YEAR);
    switch (elapsedSlots) {
      case 0n:
        return new Decimal(1);
      case 1n:
        return base.add(1);
      case 2n:
        return base.add(1).mul(base.add(1));
      case 3n:
        return base.add(1).mul(base.add(1)).mul(base.add(1));
      case 4n: {
        const pow2 = base.add(1).mul(base.add(1));
        return pow2.mul(pow2);
      }
    }
    const exp = elapsedSlots;
    const expMinus1 = exp - 1n;
    const expMinus2 = exp - 2n;

    const firstTerm = base.mul(exp.toString());
    const secondTerm = firstTerm.mul(base).mul(expMinus1.toString()).div(2);
    const thirdTerm = secondTerm.mul(base).mul(expMinus2.toString()).div(3);

    return new Decimal(1).add(firstTerm).add(secondTerm).add(thirdTerm);
  }

  getBorrowCapForReserve(market: KaminoMarket): BorrowCapsAndCounters {
    // Utilization cap
    const utilizationCap = this.state.config.utilizationLimitBlockBorrowingAbovePct;
    const utilizationCurrentValue = this.calculateUtilizationRatio();

    // Daily borrow cap
    const withdrawalCap = this.state.config.debtWithdrawalCap;

    // Debt against collaterals in elevation groups
    const debtAgainstCollateralReserveCaps: {
      collateralReserve: Address;
      elevationGroup: number;
      maxDebt: Decimal;
      currentValue: Decimal;
    }[] = market
      .getMarketElevationGroupDescriptions()
      .filter((x) => x.debtReserve === this.address)
      .map((elevationGroupDescription: ElevationGroupDescription) =>
        [...elevationGroupDescription.collateralReserves].map((collateralReserveAddress) => {
          const collRes = market.reserves.get(collateralReserveAddress)!;

          const debtLimitAgainstThisCollInGroup =
            collRes.state.config.borrowLimitAgainstThisCollateralInElevationGroup[
              elevationGroupDescription.elevationGroup - 1
            ].toString();

          const debtCounterAgainstThisCollInGroup =
            collRes.state.borrowedAmountsAgainstThisReserveInElevationGroups[
              elevationGroupDescription.elevationGroup - 1
            ].toString();

          return {
            collateralReserve: collRes.address,
            elevationGroup: elevationGroupDescription.elevationGroup,
            maxDebt: new Decimal(debtLimitAgainstThisCollInGroup),
            currentValue: new Decimal(debtCounterAgainstThisCollInGroup),
          };
        })
      )
      .flat();

    const caps: BorrowCapsAndCounters = {
      // Utilization cap
      utilizationCap: new Decimal(utilizationCap > 0 ? utilizationCap / 100 : 1),
      utilizationCurrentValue: new Decimal(utilizationCurrentValue),

      // Daily borrow cap
      netWithdrawalCap: new Decimal(withdrawalCap.configCapacity.toString()),
      netWithdrawalCurrentValue: new Decimal(withdrawalCap.currentTotal.toString()),
      netWithdrawalLastUpdateTs: new Decimal(withdrawalCap.lastIntervalStartTimestamp.toString()),
      netWithdrawalIntervalDurationSeconds: new Decimal(withdrawalCap.configIntervalLengthSeconds.toString()),

      // Global cap
      globalDebtCap: new Decimal(this.state.config.borrowLimit.toString()),
      globalTotalBorrowed: this.getBorrowedAmount(),

      // Debt outside emode cap
      debtOutsideEmodeCap: new Decimal(this.state.config.borrowLimitOutsideElevationGroup.toString()),
      borrowedOutsideEmode: this.getBorrowedAmountOutsideElevationGroup(),

      debtAgainstCollateralReserveCaps: debtAgainstCollateralReserveCaps,
    };

    return caps;
  }

  /* This takes into account all the caps */
  getLiquidityAvailableForDebtReserveGivenCaps(
    market: KaminoMarket,
    elevationGroups: number[],
    collateralReserves: Address[] = []
  ): Decimal[] {
    const caps = this.getBorrowCapForReserve(market);

    const liquidityAvailable = this.getLiquidityAvailableAmount();

    // Cap this to utilization cap first
    const utilizationRatioLimit = caps.utilizationCap;
    const currentUtilizationRatio = this.calculateUtilizationRatio();

    const liquidityGivenUtilizationCap = this.getTotalSupply().mul(
      utilizationRatioLimit.minus(currentUtilizationRatio)
    );

    const remainingDailyCap = caps.netWithdrawalIntervalDurationSeconds.eq(new Decimal(0))
      ? new Decimal(U64_MAX)
      : caps.netWithdrawalCap.minus(caps.netWithdrawalCurrentValue);

    const remainingGlobalCap = caps.globalDebtCap.minus(caps.globalTotalBorrowed);
    const remainingOutsideEmodeCap = caps.debtOutsideEmodeCap.minus(caps.borrowedOutsideEmode);

    const available = elevationGroups.map((elevationGroup) => {
      if (elevationGroup === 0) {
        const availableInCrossMode = Decimal.min(
          positiveOrZero(liquidityAvailable),
          positiveOrZero(remainingOutsideEmodeCap),
          positiveOrZero(remainingDailyCap),
          positiveOrZero(remainingGlobalCap),
          positiveOrZero(liquidityGivenUtilizationCap)
        );
        return availableInCrossMode;
      } else {
        let remainingInsideEmodeCaps = new Decimal(0);
        const capsGivenEgroup = caps.debtAgainstCollateralReserveCaps.filter(
          (x) => x.elevationGroup === elevationGroup
        );
        if (capsGivenEgroup.length > 0) {
          remainingInsideEmodeCaps = Decimal.min(
            ...capsGivenEgroup.map((x) => {
              // check reserve is part of collReserves array
              if (collateralReserves.find((collateralReserve) => collateralReserve === x.collateralReserve)) {
                return x.maxDebt.minus(x.currentValue);
              } else {
                return new Decimal(U64_MAX);
              }
            })
          );
        }
        return Decimal.min(
          positiveOrZero(liquidityAvailable),
          positiveOrZero(remainingInsideEmodeCaps),
          positiveOrZero(remainingDailyCap),
          positiveOrZero(remainingGlobalCap),
          positiveOrZero(liquidityGivenUtilizationCap)
        );
      }
    });

    return available;
  }

  /**
   * Fetches all withdraw tickets for this reserve (across all users).
   *
   * Useful for computing "queued before you" by comparing ticket sequence numbers.
   *
   * @param programId - The lending program ID (defaults to the program that owns this reserve)
   * @returns Array of all withdraw tickets for this reserve
   */
  async getAllWithdrawTickets(programId: Address = this.programId): Promise<WithdrawTicket[]> {
    const tickets = await this.rpc
      .getProgramAccounts(programId, {
        filters: [
          {
            dataSize: BigInt(WithdrawTicket.layout.span + 8),
          },
          {
            memcmp: {
              offset: 48n, // reserve field offset (8 disc + 8 sequence + 32 owner)
              bytes: this.address.toString() as Base58EncodedBytes,
              encoding: 'base58',
            },
          },
        ],
        encoding: 'base64',
      })
      .send();

    return tickets.map((ticket) => {
      if (ticket.account === null) {
        throw new Error(`WithdrawTicket account ${ticket.pubkey} does not exist`);
      }
      return WithdrawTicket.decode(Buffer.from(ticket.account.data[0], 'base64'));
    });
  }

  /**
   * Fetches all withdraw tickets for this reserve owned by the given user.
   *
   * @param userWallet - The user's wallet address
   * @param programId - The lending program ID (defaults to the program that owns this reserve)
   * @returns Array of withdraw tickets for the user on this reserve
   */
  async getWithdrawTicketsForUser(userWallet: Address, programId: Address = this.programId): Promise<WithdrawTicket[]> {
    const tickets = await this.rpc
      .getProgramAccounts(programId, {
        filters: [
          {
            dataSize: BigInt(WithdrawTicket.layout.span + 8),
          },
          {
            memcmp: {
              offset: 16n, // owner field offset (8 bytes discriminator + 8 bytes sequenceNumber)
              bytes: userWallet.toString() as Base58EncodedBytes,
              encoding: 'base58',
            },
          },
          {
            memcmp: {
              offset: 48n, // reserve field offset (8 + 8 + 32)
              bytes: this.address.toString() as Base58EncodedBytes,
              encoding: 'base58',
            },
          },
        ],
        encoding: 'base64',
      })
      .send();

    return tickets.map((ticket) => {
      if (ticket.account === null) {
        throw new Error(`WithdrawTicket account ${ticket.pubkey} does not exist`);
      }
      return WithdrawTicket.decode(Buffer.from(ticket.account.data[0], 'base64'));
    });
  }
}

const truncateBorrowCurve = (points: CurvePointFields[]): [number, number][] => {
  const curve: [number, number][] = [];
  for (const { utilizationRateBps, borrowRateBps } of points) {
    curve.push([utilizationRateBps / ONE_HUNDRED_PCT_IN_BPS, borrowRateBps / ONE_HUNDRED_PCT_IN_BPS]);

    if (utilizationRateBps === ONE_HUNDRED_PCT_IN_BPS) {
      break;
    }
  }
  return curve;
};

export async function createReserveIxs(
  rpc: Rpc<GetMinimumBalanceForRentExemptionApi>,
  owner: TransactionSigner,
  ownerLiquiditySource: Address,
  lendingMarket: Address,
  liquidityMint: Address,
  liquidityMintTokenProgram: Address,
  reserveAddress: TransactionSigner,
  programId: Address
): Promise<Instruction[]> {
  const size = BigInt(Reserve.layout.span + 8);
  const createReserveIx = getCreateAccountInstruction({
    payer: owner,
    space: size,
    lamports: await rpc.getMinimumBalanceForRentExemption(size).send(),
    programAddress: programId,
    newAccount: reserveAddress,
  });

  const { liquiditySupplyVault, collateralMint, collateralSupplyVault, feeVault } = await reservePdas(
    programId,
    reserveAddress.address
  );
  const [lendingMarketAuthority] = await lendingMarketAuthPda(lendingMarket, programId);

  const accounts: InitReserveAccounts = {
    signer: owner,
    lendingMarket: lendingMarket,
    lendingMarketAuthority: lendingMarketAuthority,
    reserve: reserveAddress.address,
    reserveLiquidityMint: liquidityMint,
    reserveLiquiditySupply: liquiditySupplyVault,
    feeReceiver: feeVault,
    reserveCollateralMint: collateralMint,
    reserveCollateralSupply: collateralSupplyVault,
    initialLiquiditySource: ownerLiquiditySource,
    liquidityTokenProgram: liquidityMintTokenProgram,
    collateralTokenProgram: TOKEN_PROGRAM_ADDRESS,
    systemProgram: SYSTEM_PROGRAM_ADDRESS,
    rent: SYSVAR_RENT_ADDRESS,
    instructionSysvarAccount: SYSVAR_INSTRUCTIONS_ADDRESS,
  };

  const initReserveIx = initReserve(accounts, undefined, programId);

  return [createReserveIx, initReserveIx];
}

export async function updateReserveConfigIx(
  signer: TransactionSigner,
  marketAddress: Address,
  reserveAddress: Address,
  mode: UpdateConfigModeKind,
  value: Uint8Array,
  programId: Address,
  skipConfigIntegrityValidation: boolean = false
): Promise<Instruction> {
  const args: UpdateReserveConfigArgs = {
    mode,
    value,
    skipConfigIntegrityValidation,
  };

  const globalConfig = await globalConfigPda(programId);
  const accounts: UpdateReserveConfigAccounts = {
    signer,
    lendingMarket: marketAddress,
    reserve: reserveAddress,
    globalConfig,
    instructionSysvarAccount: SYSVAR_INSTRUCTIONS_ADDRESS,
  };

  return updateReserveConfig(args, accounts, undefined, programId);
}

export const RESERVE_CONFIG_UPDATER = new ConfigUpdater(UpdateConfigMode.fromDecoded, ReserveConfig, (config) => ({
  [UpdateConfigMode.UpdateLoanToValuePct.kind]: config.loanToValuePct,
  [UpdateConfigMode.UpdateMaxLiquidationBonusBps.kind]: config.maxLiquidationBonusBps,
  [UpdateConfigMode.UpdateLiquidationThresholdPct.kind]: config.liquidationThresholdPct,
  [UpdateConfigMode.UpdateProtocolLiquidationFee.kind]: config.protocolLiquidationFeePct,
  [UpdateConfigMode.UpdateProtocolTakeRate.kind]: config.protocolTakeRatePct,
  [UpdateConfigMode.UpdateFeesOriginationFee.kind]: config.fees.originationFeeSf,
  [UpdateConfigMode.UpdateFeesFlashLoanFee.kind]: config.fees.flashLoanFeeSf,
  [UpdateConfigMode.DeprecatedUpdateFeesReferralFeeBps.kind]: [], // deprecated
  [UpdateConfigMode.UpdateDepositLimit.kind]: config.depositLimit,
  [UpdateConfigMode.UpdateBorrowLimit.kind]: config.borrowLimit,
  [UpdateConfigMode.UpdateTokenInfoLowerHeuristic.kind]: config.tokenInfo.heuristic.lower,
  [UpdateConfigMode.UpdateTokenInfoUpperHeuristic.kind]: config.tokenInfo.heuristic.upper,
  [UpdateConfigMode.UpdateTokenInfoExpHeuristic.kind]: config.tokenInfo.heuristic.exp,
  [UpdateConfigMode.UpdateTokenInfoTwapDivergence.kind]: config.tokenInfo.maxTwapDivergenceBps,
  [UpdateConfigMode.UpdateTokenInfoScopeTwap.kind]: config.tokenInfo.scopeConfiguration.twapChain,
  [UpdateConfigMode.UpdateTokenInfoScopeChain.kind]: config.tokenInfo.scopeConfiguration.priceChain,
  [UpdateConfigMode.UpdateTokenInfoName.kind]: config.tokenInfo.name,
  [UpdateConfigMode.UpdateTokenInfoPriceMaxAge.kind]: config.tokenInfo.maxAgePriceSeconds,
  [UpdateConfigMode.UpdateTokenInfoTwapMaxAge.kind]: config.tokenInfo.maxAgeTwapSeconds,
  [UpdateConfigMode.UpdateScopePriceFeed.kind]: config.tokenInfo.scopeConfiguration.priceFeed,
  [UpdateConfigMode.UpdatePythPrice.kind]: config.tokenInfo.pythConfiguration.price,
  [UpdateConfigMode.UpdateSwitchboardFeed.kind]: config.tokenInfo.switchboardConfiguration.priceAggregator,
  [UpdateConfigMode.UpdateSwitchboardTwapFeed.kind]: config.tokenInfo.switchboardConfiguration.twapAggregator,
  [UpdateConfigMode.UpdateBorrowRateCurve.kind]: config.borrowRateCurve,
  [UpdateConfigMode.DeprecatedUpdateEntireReserveConfig.kind]: [], // technically `config` would be a valid thing here, but we actually do NOT want entire config update among ixs produced for field-by-field updates
  [UpdateConfigMode.UpdateDebtWithdrawalCap.kind]: new CompositeConfigItem(
    config.debtWithdrawalCap.configCapacity,
    config.debtWithdrawalCap.configIntervalLengthSeconds
  ),
  [UpdateConfigMode.UpdateDepositWithdrawalCap.kind]: new CompositeConfigItem(
    config.depositWithdrawalCap.configCapacity,
    config.depositWithdrawalCap.configIntervalLengthSeconds
  ),
  [UpdateConfigMode.DeprecatedUpdateDebtWithdrawalCapCurrentTotal.kind]: [], // deprecated
  [UpdateConfigMode.DeprecatedUpdateDepositWithdrawalCapCurrentTotal.kind]: [], // deprecated
  [UpdateConfigMode.UpdateBadDebtLiquidationBonusBps.kind]: config.badDebtLiquidationBonusBps,
  [UpdateConfigMode.UpdateMinLiquidationBonusBps.kind]: config.minLiquidationBonusBps,
  [UpdateConfigMode.UpdateDeleveragingMarginCallPeriod.kind]: config.deleveragingMarginCallPeriodSecs,
  [UpdateConfigMode.UpdateBorrowFactor.kind]: config.borrowFactorPct,
  [UpdateConfigMode.DeprecatedUpdateAssetTier.kind]: [],
  [UpdateConfigMode.UpdateElevationGroup.kind]: config.elevationGroups,
  [UpdateConfigMode.UpdateDeleveragingThresholdDecreaseBpsPerDay.kind]: config.deleveragingThresholdDecreaseBpsPerDay,
  [UpdateConfigMode.DeprecatedUpdateMultiplierSideBoost.kind]: [], // deprecated
  [UpdateConfigMode.DeprecatedUpdateMultiplierTagBoost.kind]: [], // deprecated
  [UpdateConfigMode.UpdateReserveStatus.kind]: config.status,
  [UpdateConfigMode.UpdateFarmCollateral.kind]: [], // the farm fields live on the `Reserve` level...
  [UpdateConfigMode.UpdateFarmDebt.kind]: [], // ...so we are not concerned with them in the `ReserveConfig`'s field-by-field update tx
  [UpdateConfigMode.UpdateDisableUsageAsCollateralOutsideEmode.kind]: config.disableUsageAsCollOutsideEmode,
  [UpdateConfigMode.UpdateBlockBorrowingAboveUtilizationPct.kind]: config.utilizationLimitBlockBorrowingAbovePct,
  [UpdateConfigMode.UpdateBlockPriceUsage.kind]: config.tokenInfo.blockPriceUsage,
  [UpdateConfigMode.UpdateBorrowLimitOutsideElevationGroup.kind]: config.borrowLimitOutsideElevationGroup,
  [UpdateConfigMode.UpdateBorrowLimitsInElevationGroupAgainstThisReserve.kind]:
    config.borrowLimitAgainstThisCollateralInElevationGroup,
  [UpdateConfigMode.UpdateHostFixedInterestRateBps.kind]: config.hostFixedInterestRateBps,
  [UpdateConfigMode.UpdateAutodeleverageEnabled.kind]: config.autodeleverageEnabled,
  [UpdateConfigMode.UpdateDeleveragingBonusIncreaseBpsPerDay.kind]: config.deleveragingBonusIncreaseBpsPerDay,
  [UpdateConfigMode.UpdateProtocolOrderExecutionFee.kind]: config.protocolOrderExecutionFeePct,
  [UpdateConfigMode.UpdateProposerAuthorityLock.kind]: config.proposerAuthorityLocked,
  [UpdateConfigMode.UpdateMinDeleveragingBonusBps.kind]: config.minDeleveragingBonusBps,
  [UpdateConfigMode.UpdateBlockCTokenUsage.kind]: config.blockCtokenUsage,
  [UpdateConfigMode.UpdateDebtMaturityTimestamp.kind]: config.debtMaturityTimestamp,
  [UpdateConfigMode.UpdateDebtTermSeconds.kind]: config.debtTermSeconds,
  [UpdateConfigMode.UpdateEarlyRepayRemainingInterestPct.kind]: config.earlyRepayRemainingInterestPct,
  [UpdateConfigMode.UpdateReserveEmergencyMode.kind]: config.emergencyMode,
  [UpdateConfigMode.UpdateRewardsAmountPerSlot.kind]: config.rewardsAmountPerSlot,
  [UpdateConfigMode.UpdateReservePermissionedOps.kind]: config.permissionedOps,
}));

export const ENTIRE_RESERVE_CONFIG_UPDATER = new PriorityOrderedConfigUpdater(RESERVE_CONFIG_UPDATER);

export const GLOBAL_ADMIN_ONLY_MODES = new Set<number>([
  UpdateConfigMode.UpdateProtocolTakeRate.discriminator,
  UpdateConfigMode.UpdateProtocolLiquidationFee.discriminator,
  UpdateConfigMode.UpdateHostFixedInterestRateBps.discriminator,
  UpdateConfigMode.UpdateProtocolOrderExecutionFee.discriminator,
  UpdateConfigMode.UpdateFeesOriginationFee.discriminator,
  UpdateConfigMode.UpdateFeesFlashLoanFee.discriminator,
  UpdateConfigMode.UpdateBlockCTokenUsage.discriminator,
]);

export function isGlobalAdminOnly(mode: UpdateConfigModeKind): boolean {
  return GLOBAL_ADMIN_ONLY_MODES.has(mode.discriminator);
}

export type ReserveConfigUpdateIx = {
  ix: Instruction;
  requiresGlobalAdmin: boolean;
};

export function parseForChangesReserveConfigAndGetIxs(
  marketWithAddress: MarketWithAddress,
  reserve: Reserve | undefined,
  reserveAddress: Address,
  reserveConfig: ReserveConfig,
  programId: Address,
  lendingMarketOwner: TransactionSigner = noopSigner(marketWithAddress.state.lendingMarketOwner),
  globalAdminSigner?: TransactionSigner
): Promise<ReserveConfigUpdateIx[]> {
  const currentConfig = reserve?.config ?? defaultReserveConfig();
  const encodedConfigUpdates = ENTIRE_RESERVE_CONFIG_UPDATER.encodeAllUpdates(
    currentConfig,
    reserveConfig,
    buildReserveConfigPriority(currentConfig, reserveConfig)
  );

  return Promise.all(
    encodedConfigUpdates.map(async (encodedConfigUpdate) => {
      const requiresGlobalAdmin = isGlobalAdminOnly(encodedConfigUpdate.mode);
      if (requiresGlobalAdmin && !globalAdminSigner) {
        throw new Error(
          `Global admin signer is required for update mode ${encodedConfigUpdate.mode.kind} (${encodedConfigUpdate.mode.discriminator})`
        );
      }
      const signer = requiresGlobalAdmin ? globalAdminSigner! : lendingMarketOwner;
      const ix = await updateReserveConfigIx(
        signer,
        marketWithAddress.address,
        reserveAddress,
        encodedConfigUpdate.mode,
        encodedConfigUpdate.value,
        programId,
        shouldSkipValidation(encodedConfigUpdate.mode, reserve)
      );
      return { ix, requiresGlobalAdmin };
    })
  );
}

export type ReserveWithAddress = {
  address: Address;
  state: Reserve;
};

// Updating the deposit/borrow limit will automatically unblock usage and force validation inside the smart contract
const VALIDATED_DISCRIMINATORS = [
  UpdateConfigMode.UpdateDepositLimit.discriminator,
  UpdateConfigMode.UpdateBorrowLimit.discriminator,
];

export function shouldSkipValidation(mode: UpdateConfigModeKind, reserve: Reserve | undefined): boolean {
  if (VALIDATED_DISCRIMINATORS.includes(mode.discriminator)) {
    return false;
  }

  if (reserve == undefined) {
    return true;
  }

  const isUsed =
    reserve.liquidity.totalAvailableAmount.gtn(MIN_INITIAL_DEPOSIT) ||
    reserve.liquidity.borrowedAmountSf.gtn(0) ||
    reserve.collateral.mintTotalSupply.gtn(MIN_INITIAL_DEPOSIT);
  const isUsageBlocked = reserve.config.depositLimit.isZero() && reserve.config.borrowLimit.isZero();
  return isUsageBlocked && !isUsed;
}

/**
 * Returns a ReserveConfig matching the on-chain defaults after init_reserve
 * (status = Hidden, everything else zeroed).
 * Used as the baseline for diffing when no existing reserve config is available
 * (reserve does not exist on-chain yet)
 */
function defaultReserveConfig(): ReserveConfig {
  const layout = ReserveConfig.layout();
  const zeroed = ReserveConfig.fromDecoded(layout.decode(Buffer.alloc(layout.span)));
  return new ReserveConfig({ ...zeroed, status: ReserveStatusEnum.Hidden.discriminator });
}

export function buildReserveConfigPriority(previous: ReserveConfig | undefined, changed: ReserveConfig) {
  const currentLiquidationThreshold = previous?.liquidationThresholdPct ?? 0;
  const liquidationThresholdIncreasing = changed.liquidationThresholdPct > currentLiquidationThreshold;
  const autodeleverageDisabling = (previous?.autodeleverageEnabled ?? 0) !== 0 && changed.autodeleverageEnabled === 0;
  const maxLiquidationBonusShouldUpdateFirst = changed.minLiquidationBonusBps > (previous?.maxLiquidationBonusBps ?? 0);
  return (mode: UpdateConfigModeKind) =>
    priorityOf(mode, liquidationThresholdIncreasing, autodeleverageDisabling, maxLiquidationBonusShouldUpdateFirst);
}

// Lowest priority gets updated first
export function priorityOf(
  mode: UpdateConfigModeKind,
  liquidationThresholdIncreasing: boolean = false,
  autodeleverageDisabling: boolean = false,
  maxLiquidationBonusShouldUpdateFirst: boolean = false
): number {
  switch (mode.discriminator) {
    case UpdateConfigMode.UpdateScopePriceFeed.discriminator:
    case UpdateConfigMode.UpdatePythPrice.discriminator:
    case UpdateConfigMode.UpdateSwitchboardFeed.discriminator:
    case UpdateConfigMode.UpdateTokenInfoScopeChain.discriminator:
    case UpdateConfigMode.UpdateTokenInfoScopeTwap.discriminator:
    case UpdateConfigMode.UpdateSwitchboardTwapFeed.discriminator:
    case UpdateConfigMode.UpdateTokenInfoLowerHeuristic.discriminator:
    case UpdateConfigMode.UpdateTokenInfoUpperHeuristic.discriminator:
    case UpdateConfigMode.UpdateTokenInfoExpHeuristic.discriminator:
    case UpdateConfigMode.UpdateTokenInfoTwapDivergence.discriminator:
    case UpdateConfigMode.UpdateTokenInfoName.discriminator:
    case UpdateConfigMode.UpdateTokenInfoPriceMaxAge.discriminator:
    case UpdateConfigMode.UpdateTokenInfoTwapMaxAge.discriminator:
      return 0;
    // When disabling autodeleverage, it must be disabled before params can be zeroed out;
    // when enabling, params must be set first (non-zero) before autodeleverage can be enabled
    case UpdateConfigMode.UpdateDeleveragingBonusIncreaseBpsPerDay.discriminator:
    case UpdateConfigMode.UpdateDeleveragingMarginCallPeriod.discriminator:
    case UpdateConfigMode.UpdateDeleveragingThresholdDecreaseBpsPerDay.discriminator:
      return priorityOf(new UpdateConfigMode.UpdateAutodeleverageEnabled()) + (autodeleverageDisabling ? 1 : -1);
    case UpdateConfigMode.UpdateAutodeleverageEnabled.discriminator:
      return 4;
    case UpdateConfigMode.UpdateLoanToValuePct.discriminator:
      return 8;
    // LiquidationThreshold >= LTV must always hold
    // If liquidation threshold is increasing, update it first
    // All other cases, we update LTV first
    case UpdateConfigMode.UpdateLiquidationThresholdPct.discriminator:
      return priorityOf(new UpdateConfigMode.UpdateLoanToValuePct()) + (liquidationThresholdIncreasing ? -1 : 1);
    // Always update last bc we cannot skip validation
    case UpdateConfigMode.UpdateElevationGroup.discriminator:
    case UpdateConfigMode.UpdateBorrowLimitsInElevationGroupAgainstThisReserve.discriminator:
    case UpdateConfigMode.UpdateMinLiquidationBonusBps.discriminator:
      return 62;
    case UpdateConfigMode.UpdateDepositLimit.discriminator:
    case UpdateConfigMode.UpdateBorrowLimit.discriminator:
      return 63;
    case UpdateConfigMode.UpdateMaxLiquidationBonusBps.discriminator:
      return maxLiquidationBonusShouldUpdateFirst ? 61 : 63;
    default:
      return 10;
  }
}
