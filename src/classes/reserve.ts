/* eslint-disable max-classes-per-file */
import {
  AccountInfo,
  Connection,
  PublicKey,
  SystemProgram,
  SYSVAR_RENT_PUBKEY,
  TransactionInstruction,
} from '@solana/web3.js';
import Decimal from 'decimal.js';
import {
  INITIAL_COLLATERAL_RATE,
  lendingMarketAuthPda,
  MarketWithAddress,
  MIN_INITIAL_DEPOSIT,
  ONE_HUNDRED_PCT_IN_BPS,
  reservePdas,
  SLOTS_PER_DAY,
  SLOTS_PER_SECOND,
  SLOTS_PER_YEAR,
  TokenOracleData,
  U64_MAX,
} from '../utils';
import { FeeCalculation, Fees, ReserveDataType, ReserveFarmInfo, ReserveRewardYield, ReserveStatus } from './shared';
import { Reserve, ReserveFields } from '../idl_codegen/accounts';
import { CurvePointFields, ReserveConfig, UpdateConfigMode, UpdateConfigModeKind } from '../idl_codegen/types';
import { calculateAPYFromAPR, getBorrowRate, lamportsToNumberDecimal, parseTokenSymbol, positiveOrZero } from './utils';
import { CompositeConfigItem, encodeUsingLayout, ConfigUpdater } from './configItems';
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
import { TOKEN_PROGRAM_ID } from '@solana/spl-token';
import { aprToApy, KaminoPrices } from '@kamino-finance/kliquidity-sdk';
import { FarmState, RewardInfo } from '@kamino-finance/farms-sdk';
import BN from 'bn.js';

export const DEFAULT_RECENT_SLOT_DURATION_MS = 450;

export class KaminoReserve {
  state: Reserve;
  address: PublicKey;
  symbol: string;

  tokenOraclePrice: TokenOracleData;
  stats: ReserveDataType;
  private farmData: ReserveFarmInfo = { fetched: false, farmStates: [] };

  private buffer: AccountInfo<Buffer> | null;
  private connection: Connection;
  private readonly recentSlotDurationMs: number;

  constructor(
    state: Reserve,
    address: PublicKey,
    tokenOraclePrice: TokenOracleData,
    connection: Connection,
    recentSlotDurationMs: number
  ) {
    this.state = state;
    this.address = address;
    this.buffer = null;
    this.tokenOraclePrice = tokenOraclePrice;
    this.stats = {} as ReserveDataType;
    this.connection = connection;
    this.symbol = parseTokenSymbol(state.config.tokenInfo.name);
    this.recentSlotDurationMs = recentSlotDurationMs;
  }

  static initialize(
    accountData: AccountInfo<Buffer>,
    address: PublicKey,
    state: Reserve,
    tokenOraclePrice: TokenOracleData,
    connection: Connection,
    recentSlotDurationMs: number
  ) {
    const reserve = new KaminoReserve(state, address, tokenOraclePrice, connection, recentSlotDurationMs);
    reserve.setBuffer(accountData);
    reserve.stats = reserve.formatReserveData(state);
    return reserve;
  }

  /// GETTERS

  /**
   * @returns the parsed token symbol of the reserve
   */
  getTokenSymbol(): string {
    return parseTokenSymbol(this.state.config.tokenInfo.name);
  }

  /**
   * @returns the total borrowed amount of the reserve in lamports
   */
  getBorrowedAmount(): Decimal {
    return new Fraction(this.state.liquidity.borrowedAmountSf).toDecimal();
  }

  /**
   * @returns the available liquidity amount of the reserve in lamports
   */
  getLiquidityAvailableAmount(): Decimal {
    return new Decimal(this.state.liquidity.availableAmount.toString());
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
    return new Fraction(this.state.config.fees.borrowFeeSf).toDecimal();
  };

  /**
   *
   * @returns the fixed interest rate allocated to the host
   */
  getFixedHostInterestRate = (): Decimal => {
    return new Decimal(this.state.config.hostFixedInterestRateBps).div(10_000);
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

  /**
   * Calculates the total liquidity supply of the reserve
   */
  getEstimatedTotalSupply(slot: number, referralFeeBps: number): Decimal {
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
   * @Returns estimated cumulative borrow rate of the reserve
   */
  getEstimatedCumulativeBorrowRate(currentSlot: number, referralFeeBps: number): Decimal {
    const currentBorrowRate = new Decimal(this.calculateBorrowAPR(currentSlot, referralFeeBps));
    const slotsElapsed = Math.max(currentSlot - this.state.lastUpdate.slot.toNumber(), 0);

    const compoundInterest = this.approximateCompoundedInterest(currentBorrowRate, slotsElapsed);

    const previousCumulativeBorrowRate = this.getCumulativeBorrowRate();

    return previousCumulativeBorrowRate.mul(compoundInterest);
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
  getEstimatedCollateralExchangeRate(slot: number, referralFeeBps: number): Decimal {
    const totalSupply = this.getEstimatedTotalSupply(slot, referralFeeBps);
    const mintTotalSupply = this.state.collateral.mintTotalSupply;
    if (mintTotalSupply.isZero() || totalSupply.isZero()) {
      return INITIAL_COLLATERAL_RATE;
    } else {
      return new Decimal(mintTotalSupply.toString()).dividedBy(totalSupply.toString());
    }
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
   * @returns mint_decimals of the liquidity token
   */
  getMintDecimals(): number {
    return this.state.liquidity.mintDecimals.toNumber();
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
   * @returns the max capacity of the daily deposit withdrawal cap
   */
  getDepositWithdrawalCapCapacity(): Decimal {
    return new Decimal(this.state.config.depositWithdrawalCap.configCapacity.toString());
  }

  /**
   *
   * @returns the current capacity of the daily deposit withdrawal cap
   */
  getDepositWithdrawalCapCurrent(slot: number): Decimal {
    const slotsElapsed = Math.max(slot - this.state.lastUpdate.slot.toNumber(), 0);
    if (slotsElapsed > SLOTS_PER_DAY) {
      return new Decimal(0);
    } else {
      return new Decimal(this.state.config.depositWithdrawalCap.currentTotal.toString());
    }
  }

  /**
   *
   * @returns the max capacity of the daily debt withdrawal cap
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

  /**
   *
   * @returns the current capacity of the daily debt withdrawal cap
   */
  getDebtWithdrawalCapCurrent(slot: number): Decimal {
    const slotsElapsed = Math.max(slot - this.state.lastUpdate.slot.toNumber(), 0);
    if (slotsElapsed > SLOTS_PER_DAY) {
      return new Decimal(0);
    } else {
      return new Decimal(this.state.config.debtWithdrawalCap.currentTotal.toString());
    }
  }

  getBorrowFactor(): Decimal {
    return new Decimal(this.state.config.borrowFactorPct.toString()).div(100);
  }

  calculateSupplyAPR(slot: number, referralFeeBps: number) {
    const currentUtilization = this.calculateUtilizationRatio();

    const borrowRate = this.calculateEstimatedBorrowRate(slot, referralFeeBps);
    const protocolTakeRatePct = 1 - this.state.config.protocolTakeRatePct / 100;
    return currentUtilization * borrowRate * protocolTakeRatePct;
  }

  getEstimatedDebtAndSupply(slot: number, referralFeeBps: number): { totalBorrow: Decimal; totalSupply: Decimal } {
    const slotsElapsed = Math.max(slot - this.state.lastUpdate.slot.toNumber(), 0);
    let totalBorrow: Decimal;
    let totalSupply: Decimal;
    if (slotsElapsed === 0) {
      totalBorrow = this.getBorrowedAmount();
      totalSupply = this.getTotalSupply();
    } else {
      const { newDebt, newAccProtocolFees, pendingReferralFees } = this.compoundInterest(slotsElapsed, referralFeeBps);
      const newTotalSupply = this.getLiquidityAvailableAmount()
        .add(newDebt)
        .sub(newAccProtocolFees)
        .sub(this.getAccumulatedReferrerFees())
        .sub(pendingReferralFees);
      totalBorrow = newDebt;
      totalSupply = newTotalSupply;
    }
    return { totalBorrow, totalSupply };
  }

  getEstimatedAccumulatedProtocolFees(
    slot: number,
    referralFeeBps: number
  ): { accumulatedProtocolFees: Decimal; compoundedVariableProtocolFee: Decimal; compoundedFixedHostFee: Decimal } {
    const slotsElapsed = Math.max(slot - this.state.lastUpdate.slot.toNumber(), 0);
    let accumulatedProtocolFees: Decimal;
    let compoundedVariableProtocolFee: Decimal;
    let compoundedFixedHostFee: Decimal;
    if (slotsElapsed === 0) {
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

  getEstimatedUtilizationRatio(slot: number, referralFeeBps: number): number {
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
    slot: number,
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

  getMaxBorrowAmountWithCollReserve(market: KaminoMarket, collReserve: KaminoReserve, slot: number): Decimal {
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

    const debtWithdrawalCap = this.getDebtWithdrawalCapCapacity().sub(this.getDebtWithdrawalCapCurrent(slot));
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

  calcSimulatedBorrowRate(
    amount: Decimal,
    action: ActionType,
    slot: number,
    referralFeeBps: number,
    outflowAmount?: Decimal
  ) {
    const slotAdjustmentFactor = this.slotAdjustmentFactor();
    const newUtilization = this.calcSimulatedUtilizationRatio(amount, action, slot, referralFeeBps, outflowAmount);
    const curve = truncateBorrowCurve(this.state.config.borrowRateCurve.points);
    return getBorrowRate(newUtilization, curve) * slotAdjustmentFactor;
  }

  calcSimulatedBorrowAPR(
    amount: Decimal,
    action: ActionType,
    slot: number,
    referralFeeBps: number,
    outflowAmount?: Decimal
  ) {
    return (
      this.calcSimulatedBorrowRate(amount, action, slot, referralFeeBps, outflowAmount) +
      this.getFixedHostInterestRate().toNumber() * this.slotAdjustmentFactor()
    );
  }

  calcSimulatedSupplyAPR(
    amount: Decimal,
    action: ActionType,
    slot: number,
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

  calculateEstimatedBorrowRate(slot: number, referralFeeBps: number) {
    const slotAdjustmentFactor = this.slotAdjustmentFactor();
    const estimatedCurrentUtilization = this.getEstimatedUtilizationRatio(slot, referralFeeBps);
    const curve = truncateBorrowCurve(this.state.config.borrowRateCurve.points);
    return getBorrowRate(estimatedCurrentUtilization, curve) * slotAdjustmentFactor;
  }

  calculateBorrowAPR(slot: number, referralFeeBps: number) {
    const slotAdjustmentFactor = this.slotAdjustmentFactor();
    const borrowRate = this.calculateEstimatedBorrowRate(slot, referralFeeBps);
    return borrowRate + this.getFixedHostInterestRate().toNumber() * slotAdjustmentFactor;
  }

  /**
   * @returns the mint of the reserve liquidity token
   */
  getLiquidityMint(): PublicKey {
    return this.state.liquidity.mintPubkey;
  }

  /**
   * @returns the token program of the reserve liquidity mint
   */
  getLiquidityTokenProgram(): PublicKey {
    return this.state.liquidity.tokenProgram;
  }

  /**
   * @returns the mint of the reserve collateral token , i.e. the cToken minted for depositing the liquidity token
   */
  getCTokenMint(): PublicKey {
    return this.state.collateral.mintPubkey;
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

  setBuffer(buffer: AccountInfo<Buffer> | null) {
    this.buffer = buffer;
  }

  async load(tokenOraclePrice: TokenOracleData) {
    if (!this.buffer) {
      this.setBuffer(await this.connection.getAccountInfo(this.address, 'processed'));
    }

    if (!this.buffer) {
      throw Error(`Error requesting account info for ${this.symbol}`);
    }

    const parsedData = await Reserve.fetch(this.connection, this.address);
    if (!parsedData) {
      throw Error(`Unable to parse data of reserve ${this.symbol}`);
    }
    this.state = parsedData;
    this.tokenOraclePrice = tokenOraclePrice;
    this.stats = this.formatReserveData(parsedData);
  }

  totalSupplyAPY(currentSlot: number) {
    const { stats } = this;
    if (!stats) {
      throw Error('KaminoMarket must call loadRewards.');
    }

    return calculateAPYFromAPR(this.calculateSupplyAPR(currentSlot, 0));
  }

  totalBorrowAPY(currentSlot: number) {
    const { stats } = this;
    if (!stats) {
      throw Error('KaminoMarket must call loadRewards.');
    }

    return calculateAPYFromAPR(this.calculateBorrowAPR(currentSlot, 0));
  }

  async loadFarmStates() {
    if (!this.farmData.fetched) {
      const farmStates: FarmState[] = [];
      if (!this.state.farmDebt.equals(PublicKey.default)) {
        const farmState = await FarmState.fetch(this.connection, this.state.farmDebt);
        if (farmState !== null) {
          farmStates.push(farmState);
        }
      }
      if (!this.state.farmCollateral.equals(PublicKey.default)) {
        const farmState = await FarmState.fetch(this.connection, this.state.farmCollateral);
        if (farmState !== null) {
          farmStates.push(farmState);
        }
      }
      this.farmData.farmStates = farmStates;
      this.farmData.fetched = true;
    }
  }

  async getRewardYields(prices: KaminoPrices): Promise<ReserveRewardYield[]> {
    const { stats } = this;
    if (!stats) {
      throw Error('KaminoMarket must call loadReserves.');
    }

    const isDebtReward = this.state.farmDebt.equals(this.address);
    await this.loadFarmStates();
    const yields: ReserveRewardYield[] = [];
    for (const farmState of this.farmData.farmStates) {
      for (const rewardInfo of farmState.rewardInfos.filter(
        (x) => !x.token.mint.equals(PublicKey.default) && !x.rewardsAvailable.isZero()
      )) {
        const { apy, apr } = this.calculateRewardYield(prices, rewardInfo, isDebtReward);
        if (apy.isZero() && apr.isZero()) {
          continue;
        }
        yields.push({ apy, apr, rewardInfo });
      }
    }
    return yields;
  }

  private calculateRewardYield(prices: KaminoPrices, rewardInfo: RewardInfo, isDebtReward: boolean) {
    const mintAddress = this.getLiquidityMint();
    const rewardPerTimeUnitSecond = this.getRewardPerTimeUnitSecond(rewardInfo);
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

  private getRewardPerTimeUnitSecond(reward: RewardInfo) {
    const now = new Decimal(new Date().getTime()).div(1000);
    let rewardPerTimeUnitSecond = new Decimal(0);
    for (let i = 0; i < reward.rewardScheduleCurve.points.length - 1; i++) {
      const { tsStart: tsStartThisPoint, rewardPerTimeUnit } = reward.rewardScheduleCurve.points[i];
      const { tsStart: tsStartNextPoint } = reward.rewardScheduleCurve.points[i + 1];

      const thisPeriodStart = new Decimal(tsStartThisPoint.toString());
      const thisPeriodEnd = new Decimal(tsStartNextPoint.toString());
      const rps = new Decimal(rewardPerTimeUnit.toString());
      if (thisPeriodStart <= now && thisPeriodEnd >= now) {
        rewardPerTimeUnitSecond = rps;
        break;
      } else if (thisPeriodStart > now && thisPeriodEnd > now) {
        rewardPerTimeUnitSecond = rps;
        break;
      }
    }

    const rewardTokenDecimals = reward.token.decimals.toNumber();
    const rewardAmountPerUnitDecimals = new Decimal(10).pow(reward.rewardsPerSecondDecimals.toString());
    const rewardAmountPerUnitLamports = new Decimal(10).pow(rewardTokenDecimals.toString());

    const rpsAdjusted = new Decimal(rewardPerTimeUnitSecond.toString())
      .div(rewardAmountPerUnitDecimals)
      .div(rewardAmountPerUnitLamports);

    return rewardPerTimeUnitSecond ? rpsAdjusted : new Decimal(0);
  }

  private formatReserveData(parsedData: ReserveFields): ReserveDataType {
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
    slotsElapsed: number,
    referralFeeBps: number
  ): {
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
   * @private
   */
  private approximateCompoundedInterest(rate: Decimal, elapsedSlots: number): Decimal {
    const base = rate.div(SLOTS_PER_YEAR);
    switch (elapsedSlots) {
      case 0:
        return new Decimal(1);
      case 1:
        return base.add(1);
      case 2:
        return base.add(1).mul(base.add(1));
      case 3:
        return base.add(1).mul(base.add(1)).mul(base.add(1));
      case 4:
        // eslint-disable-next-line no-case-declarations
        const pow2 = base.add(1).mul(base.add(1));
        return pow2.mul(pow2);
    }
    const exp = elapsedSlots;
    const expMinus1 = exp - 1;
    const expMinus2 = exp - 2;

    const basePow2 = base.mul(base);
    const basePow3 = basePow2.mul(base);

    const firstTerm = base.mul(exp);
    const secondTerm = basePow2.mul(exp).mul(expMinus1).div(2);
    const thirdTerm = basePow3.mul(exp).mul(expMinus1).mul(expMinus2).div(6);

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
      collateralReserve: PublicKey;
      elevationGroup: number;
      maxDebt: Decimal;
      currentValue: Decimal;
    }[] = market
      .getMarketElevationGroupDescriptions()
      .filter((x) => x.debtReserve.equals(this.address))
      .map((elevationGroupDescription: ElevationGroupDescription) =>
        elevationGroupDescription.collateralReserves.toArray().map((collateralReserveAddress) => {
          const collRes = market.reserves.get(new PublicKey(collateralReserveAddress))!;

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
    collateralReserves: PublicKey[] = []
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
              if (collateralReserves.find((collateralReserve) => collateralReserve.equals(x.collateralReserve))) {
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
  connection: Connection,
  owner: PublicKey,
  ownerLiquiditySource: PublicKey,
  lendingMarket: PublicKey,
  liquidityMint: PublicKey,
  reserveAddress: PublicKey,
  programId: PublicKey
): Promise<TransactionInstruction[]> {
  const size = Reserve.layout.span + 8;

  const createReserveIx = SystemProgram.createAccount({
    fromPubkey: owner,
    newAccountPubkey: reserveAddress,
    lamports: await connection.getMinimumBalanceForRentExemption(size),
    space: size,
    programId: programId,
  });

  const { liquiditySupplyVault, collateralMint, collateralSupplyVault, feeVault } = reservePdas(
    programId,
    lendingMarket,
    liquidityMint
  );
  const [lendingMarketAuthority, _] = lendingMarketAuthPda(lendingMarket, programId);

  const accounts: InitReserveAccounts = {
    lendingMarketOwner: owner,
    lendingMarket: lendingMarket,
    lendingMarketAuthority: lendingMarketAuthority,
    reserve: reserveAddress,
    reserveLiquidityMint: liquidityMint,
    reserveLiquiditySupply: liquiditySupplyVault,
    feeReceiver: feeVault,
    reserveCollateralMint: collateralMint,
    reserveCollateralSupply: collateralSupplyVault,
    initialLiquiditySource: ownerLiquiditySource,
    liquidityTokenProgram: TOKEN_PROGRAM_ID,
    collateralTokenProgram: TOKEN_PROGRAM_ID,
    systemProgram: SystemProgram.programId,
    rent: SYSVAR_RENT_PUBKEY,
  };

  const initReserveIx = initReserve(accounts, programId);

  return [createReserveIx, initReserveIx];
}

export function updateReserveConfigIx(
  signer: PublicKey,
  marketAddress: PublicKey,
  reserveAddress: PublicKey,
  mode: UpdateConfigModeKind,
  value: Uint8Array,
  programId: PublicKey,
  skipValidation: boolean = false
): TransactionInstruction {
  const args: UpdateReserveConfigArgs = {
    mode: new BN(mode.discriminator + 1),
    value,
    skipValidation,
  };

  const accounts: UpdateReserveConfigAccounts = {
    lendingMarketOwner: signer,
    lendingMarket: marketAddress,
    reserve: reserveAddress,
  };

  return updateReserveConfig(args, accounts, programId);
}

export const RESERVE_CONFIG_UPDATER = new ConfigUpdater(UpdateConfigMode.fromDecoded, ReserveConfig, (config) => ({
  [UpdateConfigMode.UpdateLoanToValuePct.kind]: config.loanToValuePct,
  [UpdateConfigMode.UpdateMaxLiquidationBonusBps.kind]: config.maxLiquidationBonusBps,
  [UpdateConfigMode.UpdateLiquidationThresholdPct.kind]: config.liquidationThresholdPct,
  [UpdateConfigMode.UpdateProtocolLiquidationFee.kind]: config.protocolLiquidationFeePct,
  [UpdateConfigMode.UpdateProtocolTakeRate.kind]: config.protocolTakeRatePct,
  [UpdateConfigMode.UpdateFeesBorrowFee.kind]: config.fees.borrowFeeSf,
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
  [UpdateConfigMode.UpdateEntireReserveConfig.kind]: [], // technically `config` would be a valid thing here, but we actually do NOT want entire config update among ixs produced for field-by-field updates
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
  [UpdateConfigMode.UpdateAssetTier.kind]: config.assetTier,
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
}));

export function updateEntireReserveConfigIx(
  signer: PublicKey,
  marketAddress: PublicKey,
  reserveAddress: PublicKey,
  reserveConfig: ReserveConfig,
  programId: PublicKey
): TransactionInstruction {
  const args: UpdateReserveConfigArgs = {
    mode: new BN(UpdateConfigMode.UpdateEntireReserveConfig.discriminator + 1),
    value: encodeUsingLayout(ReserveConfig.layout(), reserveConfig),
    skipValidation: false,
  };

  const accounts: UpdateReserveConfigAccounts = {
    lendingMarketOwner: signer,
    lendingMarket: marketAddress,
    reserve: reserveAddress,
  };

  const ix = updateReserveConfig(args, accounts, programId);

  return ix;
}

export function parseForChangesReserveConfigAndGetIxs(
  marketWithAddress: MarketWithAddress,
  reserve: Reserve | undefined,
  reserveAddress: PublicKey,
  reserveConfig: ReserveConfig,
  programId: PublicKey
) {
  const encodedConfigUpdates = RESERVE_CONFIG_UPDATER.encodeAllUpdates(reserve?.config, reserveConfig);
  encodedConfigUpdates.sort((left, right) => priorityOf(left.mode) - priorityOf(right.mode));
  return encodedConfigUpdates.map((encodedConfigUpdate) =>
    updateReserveConfigIx(
      marketWithAddress.state.lendingMarketOwner,
      marketWithAddress.address,
      reserveAddress,
      encodedConfigUpdate.mode,
      encodedConfigUpdate.value,
      programId,
      shouldSkipValidation(encodedConfigUpdate.mode, reserve)
    )
  );
}

export type ReserveWithAddress = {
  address: PublicKey;
  state: Reserve;
};

const NON_VALIDATED_DISCRIMINATORS = [
  UpdateConfigMode.UpdateScopePriceFeed.discriminator,
  UpdateConfigMode.UpdateTokenInfoScopeChain.discriminator,
  UpdateConfigMode.UpdateTokenInfoScopeTwap.discriminator,
  UpdateConfigMode.UpdateTokenInfoExpHeuristic.discriminator,
  UpdateConfigMode.UpdateTokenInfoTwapDivergence.discriminator,
  UpdateConfigMode.UpdateTokenInfoPriceMaxAge.discriminator,
  UpdateConfigMode.UpdateTokenInfoTwapMaxAge.discriminator,
];

function shouldSkipValidation(mode: UpdateConfigModeKind, reserve: Reserve | undefined): boolean {
  return (
    NON_VALIDATED_DISCRIMINATORS.includes(mode.discriminator) &&
    !reserve?.liquidity.availableAmount.gten(MIN_INITIAL_DEPOSIT)
  );
}

function priorityOf(mode: UpdateConfigModeKind): number {
  switch (mode.discriminator) {
    case UpdateConfigMode.UpdateScopePriceFeed.discriminator:
      return 0;
    case UpdateConfigMode.UpdateTokenInfoScopeChain.discriminator:
      return 0;
    default:
      return 1;
  }
}
