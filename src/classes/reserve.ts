/* eslint-disable max-classes-per-file */
import { AccountInfo, Connection, PublicKey } from '@solana/web3.js';
import Decimal from 'decimal.js';
import { INITIAL_COLLATERAL_RATE, ONE_HUNDRED_PCT_IN_BPS, SLOTS_PER_YEAR, TokenOracleData } from '../utils';
import { ReserveDataType, ReserveStatus } from './shared';
import { Reserve, ReserveFields } from '../idl_codegen/accounts';
import { CurvePointFields } from '../idl_codegen/types';
import { calculateAPYFromAPR, getBorrowRate, parseTokenSymbol } from './utils';
import { Fraction } from './fraction';
import BN from 'bn.js';
import { ActionType } from './action';

export class KaminoReserve {
  state: Reserve;
  address: PublicKey;
  symbol: string;

  tokenOraclePrice: TokenOracleData;
  stats: ReserveDataType;

  private buffer: AccountInfo<Buffer> | null;
  private connection: Connection;

  constructor(state: Reserve, address: PublicKey, tokenOraclePrice: TokenOracleData, connection: Connection) {
    this.state = state;
    this.address = address;
    this.buffer = null;
    this.tokenOraclePrice = tokenOraclePrice;
    this.stats = {} as ReserveDataType;
    this.connection = connection;
    this.symbol = parseTokenSymbol(state.config.tokenInfo.name);
  }

  static initialize(
    accountData: AccountInfo<Buffer>,
    address: PublicKey,
    state: Reserve,
    tokenOraclePrice: TokenOracleData,
    connection: Connection
  ) {
    const reserve = new KaminoReserve(state, address, tokenOraclePrice, connection);
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
   * @returns the total borrowed amount of the reserve
   */
  getBorrowedAmount(): Decimal {
    return new Fraction(this.state.liquidity.borrowedAmountSf).toDecimal();
  }

  /**
   * @returns the available liquidity amount of the reserve
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
   * Calculates the total liquidity supply of the reserve
   */
  getTotalSupply(): Decimal {
    return this.getLiquidityAvailableAmount()
      .add(this.getBorrowedAmount())
      .sub(this.getAccumulatedProtocolFees())
      .sub(this.getAccumulatedReferrerFees())
      .sub(this.getPendingReferrerFees());
  }

  /**
   * Use getEstimatedCumulativeBorrowRate() for the most accurate value
   * @returns the stale cumulative borrow rate of the reserve from the last refresh
   */
  getCumulativeBorrowRate(): Decimal {
    let accSf = new BN(0);
    for (const value of this.state.liquidity.cumulativeBorrowRateBsf.value.reverse()) {
      accSf = accSf.add(value);
      accSf.shrn(64);
    }
    return new Fraction(accSf).toDecimal();
  }

  /**
   * @Returns estimated cumulative borrow rate of the reserve
   */
  getEstimatedCumulativeBorrowRate = (currentSlot: number): Decimal => {
    const currentBorrowRate = new Decimal(this.calculateBorrowAPR());
    const slotsElapsed = Math.max(currentSlot - this.state.lastUpdate.slot.toNumber(), 0);

    const compoundInterest = new Decimal(1).add(currentBorrowRate.div(SLOTS_PER_YEAR)).pow(slotsElapsed);

    const previousCumulativeBorrowRate = this.getCumulativeBorrowRate();

    return previousCumulativeBorrowRate.mul(compoundInterest);
  };

  /**
   * Returns the exchange rate between the collateral tokens and the liquidity
   * This is a decimal number scaled by 1e18
   */
  getCollateralExchangeRate = (): Decimal => {
    const totalSupply = this.getTotalSupply();
    const mintTotalSupply = this.state.collateral.mintTotalSupply;
    if (mintTotalSupply.isZero() || totalSupply.isZero()) {
      return INITIAL_COLLATERAL_RATE;
    } else {
      return new Decimal(mintTotalSupply.toString()).dividedBy(totalSupply.toString());
    }
  };

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
    return new Decimal(10).pow(this.state.liquidity.mintDecimals.toNumber());
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

  calculateSupplyAPR() {
    const currentUtilization = this.calculateUtilizationRatio();

    const borrowAPR = this.calculateBorrowAPR();
    const protocolTakeRatePct = 1 - this.state.config.protocolTakeRatePct / 100;
    return currentUtilization * borrowAPR * protocolTakeRatePct;
  }

  calculateUtilizationRatio() {
    const totalBorrows = this.getBorrowedAmount();
    const totalSupply = this.getTotalSupply();
    if (totalSupply.eq(0)) {
      return 0;
    }
    return totalBorrows.dividedBy(totalSupply).toNumber();
  }

  calcSimulatedUtilizationRatio(amount: Decimal, action: ActionType, outflowAmount?: Decimal): number {
    const previousTotalBorrowed = this.getBorrowedAmount();
    const previousTotalSupply = this.getTotalSupply();

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

  calcSimulatedBorrowAPR(amount: Decimal, action: ActionType, outflowAmount?: Decimal) {
    const newUtilization = this.calcSimulatedUtilizationRatio(amount, action, outflowAmount);
    const curve = truncateBorrowCurve(this.state.config.borrowRateCurve.points);
    return getBorrowRate(newUtilization, curve);
  }

  calcSimulatedSupplyAPR(amount: Decimal, action: ActionType, outflowAmount?: Decimal) {
    const newUtilization = this.calcSimulatedUtilizationRatio(amount, action, outflowAmount);
    const simulatedBorrowAPR = this.calcSimulatedBorrowAPR(amount, action, outflowAmount);
    return newUtilization * simulatedBorrowAPR;
  }

  calculateBorrowAPR() {
    const currentUtilization = this.calculateUtilizationRatio();
    const curve = truncateBorrowCurve(this.state.config.borrowRateCurve.points);
    return getBorrowRate(currentUtilization, curve);
  }

  /**
   * @returns the mint of the reserve liquidity token
   */
  getLiquidityMint(): PublicKey {
    return this.state.liquidity.mintPubkey;
  }

  /**
   * @returns the mint of the reserve collateral token , i.e. the cToken minted for depositing the liquidity token
   */
  getCTokenMint(): PublicKey {
    return this.state.collateral.mintPubkey;
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

  totalSupplyAPY() {
    const { stats } = this;
    if (!stats) {
      throw Error('KaminoMarket must call loadRewards.');
    }

    const totalAPY = new Decimal(stats.supplyInterestAPY).toNumber();

    return {
      interestAPY: stats.supplyInterestAPY,
      totalAPY,
    };
  }

  totalBorrowAPY() {
    const { stats } = this;
    if (!stats) {
      throw Error('KaminoMarket must call loadRewards.');
    }

    const totalAPY = new Decimal(stats.borrowInterestAPY).toNumber();

    return {
      interestAPY: stats.borrowInterestAPY,
      totalAPY,
    };
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
      loanToValuePct: parsedData.config.loanToValuePct / 100,
      maxLiquidationBonus: parsedData.config.maxLiquidationBonusBps / 10000,
      minLiquidationBonus: parsedData.config.minLiquidationBonusBps / 10000,
      liquidationThreshold: parsedData.config.liquidationThresholdPct / 100,
      protocolTakeRate: parsedData.config.protocolTakeRatePct / 100,
      reserveDepositLimit: new Decimal(parsedData.config.depositLimit.toString()),
      reserveBorrowLimit: new Decimal(parsedData.config.borrowLimit.toString()),

      // Reserve info
      symbol: parseTokenSymbol(parsedData.config.tokenInfo.name),
      decimals: this.state.liquidity.mintDecimals.toNumber(),
      supplyInterestAPY: calculateAPYFromAPR(this.calculateSupplyAPR()),
      borrowInterestAPY: calculateAPYFromAPR(this.calculateBorrowAPR()),
      accumulatedProtocolFees: this.getAccumulatedProtocolFees().div(this.getMintFactor()),
      mintTotalSupply,
      depositLimitCrossedSlot: parsedData.liquidity.depositLimitCrossedSlot.toNumber(),
      borrowLimitCrossedSlot: parsedData.liquidity.borrowLimitCrossedSlot.toNumber(),
      borrowFactor: parsedData.config.borrowFactorPct.toNumber(),
    };
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
