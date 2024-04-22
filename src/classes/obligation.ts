/* eslint-disable max-classes-per-file */
import { PublicKey } from '@solana/web3.js';
import Decimal from 'decimal.js';
import { KaminoReserve } from './reserve';
import { Obligation } from '../idl_codegen/accounts';
import { KaminoMarket } from './market';
import BN from 'bn.js';
import { Fraction } from './fraction';
import { ObligationCollateral, ObligationLiquidity } from '../idl_codegen/types';
import { positiveOrZero, valueOrZero } from './utils';
import { isNotNullPubkey, PubkeyHashMap } from '../utils';
import { ActionType } from './action';

export type Position = {
  reserveAddress: PublicKey;
  mintAddress: PublicKey;
  amount: Decimal;
  marketValueRefreshed: Decimal;
};

export type ObligationStats = {
  userTotalDeposit: Decimal;
  userTotalBorrow: Decimal;
  userTotalBorrowBorrowFactorAdjusted: Decimal;
  borrowLimit: Decimal;
  borrowLiquidationLimit: Decimal;
  borrowUtilization: Decimal;
  netAccountValue: Decimal;
  loanToValue: Decimal;
  liquidationLtv: Decimal;
  leverage: Decimal;
  potentialElevationGroupUpdate: Array<number>;
};

interface BorrowStats {
  borrows: Map<PublicKey, Position>;
  userTotalBorrow: Decimal;
  userTotalBorrowBorrowFactorAdjusted: Decimal;
  positions: number;
}

export class KaminoObligation {
  obligationAddress: PublicKey;

  state: Obligation;

  /**
   * Deposits stored in a map of reserve address to position
   */
  deposits: Map<PublicKey, Position>;

  /**
   * Borrows stored in a map of reserve address to position
   */
  borrows: Map<PublicKey, Position>;

  refreshedStats: ObligationStats;

  obligationTag: number;

  /**
   * Initialise a new Obligation from the deserialized state
   * @param market
   * @param obligationAddress
   * @param obligation
   * @param collateralExchangeRates - rates from the market by reserve address, will be calculated if not provided
   * @param cumulativeBorrowRates - rates from the market by reserve address, will be calculated if not provided
   */
  constructor(
    market: KaminoMarket,
    obligationAddress: PublicKey,
    obligation: Obligation,
    collateralExchangeRates: Map<PublicKey, Decimal>,
    cumulativeBorrowRates: Map<PublicKey, Decimal>
  ) {
    this.obligationAddress = obligationAddress;
    this.state = obligation;
    const { borrows, deposits, refreshedStats } = this.calculatePositions(
      market,
      obligation,
      collateralExchangeRates,
      cumulativeBorrowRates
    );
    this.deposits = deposits;
    this.borrows = borrows;
    this.refreshedStats = refreshedStats;
    this.obligationTag = obligation.tag.toNumber();
  }

  static async load(kaminoMarket: KaminoMarket, obligationAddress: PublicKey): Promise<KaminoObligation | null> {
    const res = await kaminoMarket.getConnection().getAccountInfoAndContext(obligationAddress);
    if (res.value === null) {
      return null;
    }
    const accInfo = res.value;
    if (!accInfo.owner.equals(kaminoMarket.programId)) {
      throw new Error("account doesn't belong to this program");
    }
    const obligation = Obligation.decode(accInfo.data);

    if (obligation === null) {
      return null;
    }
    const { collateralExchangeRates, cumulativeBorrowRates } = KaminoObligation.getRatesForObligation(
      kaminoMarket,
      obligation,
      res.context.slot
    );
    return new KaminoObligation(
      kaminoMarket,
      obligationAddress,
      obligation,
      collateralExchangeRates,
      cumulativeBorrowRates
    );
  }

  static async loadAll(
    kaminoMarket: KaminoMarket,
    obligationAddresses: PublicKey[],
    slot?: number
  ): Promise<(KaminoObligation | null)[]> {
    let currentSlot = slot;
    let obligations: (Obligation | null)[];
    if (!currentSlot) {
      [currentSlot, obligations] = await Promise.all([
        kaminoMarket.getConnection().getSlot(),
        Obligation.fetchMultiple(kaminoMarket.getConnection(), obligationAddresses, kaminoMarket.programId),
      ]);
    } else {
      obligations = await Obligation.fetchMultiple(
        kaminoMarket.getConnection(),
        obligationAddresses,
        kaminoMarket.programId
      );
    }
    const cumulativeBorrowRates = new PubkeyHashMap<PublicKey, Decimal>();
    const collateralExchangeRates = new PubkeyHashMap<PublicKey, Decimal>();
    for (const obligation of obligations) {
      if (obligation !== null) {
        KaminoObligation.addRatesForObligation(
          kaminoMarket,
          obligation,
          collateralExchangeRates,
          cumulativeBorrowRates,
          currentSlot
        );
      }
    }

    return obligations.map((obligation, i) => {
      if (obligation === null) {
        return null;
      }
      return new KaminoObligation(
        kaminoMarket,
        obligationAddresses[i],
        obligation,
        collateralExchangeRates,
        cumulativeBorrowRates
      );
    });
  }

  /**
   * @returns the obligation borrows as a list
   */
  getBorrows(): Array<Position> {
    return [...this.borrows.values()];
  }

  /**
   * @returns the obligation borrows as a list
   */
  getDeposits(): Array<Position> {
    return [...this.deposits.values()];
  }

  /**
   * @returns the total deposited value of the obligation (sum of all deposits)
   */
  getDepositedValue(): Decimal {
    return new Fraction(this.state.depositedValueSf).toDecimal();
  }

  /**
   * @returns the total borrowed value of the obligation (sum of all borrows -- no borrow factor)
   */
  getBorrowedMarketValue(): Decimal {
    return new Fraction(this.state.borrowedAssetsMarketValueSf).toDecimal();
  }

  /**
   * @returns the total borrowed value of the obligation (sum of all borrows -- with borrow factor weighting)
   */
  getBorrowedMarketValueBFAdjusted(): Decimal {
    return new Fraction(this.state.borrowFactorAdjustedDebtValueSf).toDecimal();
  }

  /**
   * @returns total borrow power of the obligation, relative to max LTV of each asset's reserve
   */
  getAllowedBorrowValue(): Decimal {
    return new Fraction(this.state.allowedBorrowValueSf).toDecimal();
  }

  /**
   * @returns the borrow value at which the obligation gets liquidatable
   * (relative to the liquidation threshold of each asset's reserve)
   */
  getUnhealthyBorrowValue(): Decimal {
    return new Fraction(this.state.unhealthyBorrowValueSf).toDecimal();
  }

  /**
   *
   * @returns Market value of the deposit in the specified obligation collateral/deposit asset (USD)
   */
  getDepositMarketValue(deposit: ObligationCollateral): Decimal {
    return new Fraction(deposit.marketValueSf).toDecimal();
  }

  getBorrowByReserve(reserve: PublicKey): Position | undefined {
    return this.borrows.get(reserve);
  }

  getDepositByReserve(reserve: PublicKey): Position | undefined {
    return this.deposits.get(reserve);
  }

  getBorrowByMint(mint: PublicKey): Position | undefined {
    for (const value of this.borrows.values()) {
      if (value.mintAddress.equals(mint)) {
        return value;
      }
    }
    return undefined;
  }

  getDepositByMint(mint: PublicKey): Position | undefined {
    for (const value of this.deposits.values()) {
      if (value.mintAddress.equals(mint)) {
        return value;
      }
    }
    return undefined;
  }

  /**
   *
   * @returns Market value of the borrow in the specified obligation liquidity/borrow asset (USD) (no borrow factor weighting)
   */
  getBorrowMarketValue(borrow: ObligationLiquidity): Decimal {
    return new Fraction(borrow.marketValueSf).toDecimal();
  }

  /**
   *
   * @returns Market value of the borrow in the specified obligation liquidity/borrow asset (USD) (with borrow factor weighting)
   */
  getBorrowMarketValueBFAdjusted(borrow: ObligationLiquidity): Decimal {
    return new Fraction(borrow.borrowFactorAdjustedMarketValueSf).toDecimal();
  }

  /**
   * Calculate the current ratio of borrowed value to deposited value
   */
  loanToValue(): Decimal {
    if (this.refreshedStats.userTotalDeposit.eq(0)) {
      return new Decimal(0);
    }
    return this.refreshedStats.userTotalBorrowBorrowFactorAdjusted.div(this.refreshedStats.userTotalDeposit);
  }

  /**
   * @returns the total number of positions (deposits + borrows)
   */
  getNumberOfPositions(): number {
    return this.deposits.size + this.borrows.size;
  }

  getNetAccountValue(): Decimal {
    return this.refreshedStats.netAccountValue;
  }

  /**
   * @returns the potential elevation groups the obligation qualifies for
   */
  getElevationGroups(kaminoMarket: KaminoMarket): Array<number> {
    const reserves = new PubkeyHashMap<PublicKey, KaminoReserve>();
    for (const deposit of this.state.deposits.values()) {
      if (isNotNullPubkey(deposit.depositReserve) && !reserves.has(deposit.depositReserve)) {
        reserves.set(deposit.depositReserve, kaminoMarket.getReserveByAddress(deposit.depositReserve)!);
      }
    }
    for (const borrow of this.state.borrows.values()) {
      if (isNotNullPubkey(borrow.borrowReserve) && !reserves.has(borrow.borrowReserve)) {
        reserves.set(borrow.borrowReserve, kaminoMarket.getReserveByAddress(borrow.borrowReserve)!);
      }
    }
    return KaminoObligation.getElevationGroupsForReserves([...reserves.values()]);
  }

  static getElevationGroupsForReserves(reserves: Array<KaminoReserve>): Array<number> {
    const elevationGroupsCounts = new Map<number, number>();
    for (const reserve of reserves) {
      for (const elevationGroup of reserve.state.config.elevationGroups) {
        if (elevationGroup !== 0) {
          const count = elevationGroupsCounts.get(elevationGroup);
          if (count) {
            elevationGroupsCounts.set(elevationGroup, count + 1);
          } else {
            elevationGroupsCounts.set(elevationGroup, 1);
          }
        }
      }
    }
    const activeElevationGroups = new Array<number>();
    for (const [group, count] of elevationGroupsCounts.entries()) {
      if (count === reserves.length) {
        activeElevationGroups.push(group);
      }
    }
    return activeElevationGroups;
  }

  calculateSimulatedBorrow(
    oldStats: ObligationStats,
    oldBorrows: Map<PublicKey, Position>,
    borrowAmount: Decimal,
    mint: PublicKey,
    reserves: Map<PublicKey, KaminoReserve>
  ): {
    stats: ObligationStats;
    borrows: Map<PublicKey, Position>;
  } {
    const newStats = { ...oldStats };
    const newBorrows = new PubkeyHashMap<PublicKey, Position>([...oldBorrows.entries()]);
    let borrowPosition: Position | undefined = undefined;
    for (const oldBorrow of oldBorrows.values()) {
      if (oldBorrow.mintAddress.equals(mint)) {
        borrowPosition = oldBorrow;
      }
    }
    let reserve: KaminoReserve | undefined = undefined;
    for (const kaminoReserve of reserves.values()) {
      if (kaminoReserve.getLiquidityMint().equals(mint)) {
        reserve = kaminoReserve;
      }
    }

    if (!reserve) {
      throw new Error(`No reserve found for mint ${mint}`);
    }

    if (!borrowPosition) {
      borrowPosition = {
        reserveAddress: reserve!.address,
        mintAddress: mint,
        amount: new Decimal(0),
        marketValueRefreshed: new Decimal(0),
      };
    }

    if (!reserve.state.config.elevationGroups.includes(this.state.elevationGroup)) {
      throw new Error(
        `User would have to downgrade the elevation group in order to be able to borrow from this reserve`
      );
    }

    const borrowFactor =
      this.state.elevationGroup !== 0 ? new Decimal(1) : new Decimal(reserve.stats.borrowFactor).div(100);

    const borrowValueUSD = borrowAmount.mul(reserve.getOracleMarketPrice()).dividedBy(reserve.getMintFactor());

    const borrowValueBorrowFactorAdjustedUSD = borrowValueUSD.mul(borrowFactor);

    newStats.userTotalBorrow = positiveOrZero(newStats.userTotalBorrow.plus(borrowValueUSD));
    newStats.userTotalBorrowBorrowFactorAdjusted = positiveOrZero(
      newStats.userTotalBorrowBorrowFactorAdjusted.plus(borrowValueBorrowFactorAdjustedUSD)
    );

    borrowPosition.amount = positiveOrZero(borrowPosition.amount.plus(borrowAmount));
    borrowPosition.mintAddress = mint;
    borrowPosition.marketValueRefreshed = positiveOrZero(borrowPosition.marketValueRefreshed.plus(borrowValueUSD));

    newBorrows.set(borrowPosition.reserveAddress, borrowPosition);
    return {
      borrows: newBorrows,
      stats: newStats,
    };
  }

  calculateSimulatedDeposit(
    oldStats: ObligationStats,
    oldDeposits: Map<PublicKey, Position>,
    amount: Decimal,
    mint: PublicKey,
    reserves: Map<PublicKey, KaminoReserve>,
    market: KaminoMarket
  ): {
    stats: ObligationStats;
    deposits: Map<PublicKey, Position>;
  } {
    const newStats = { ...oldStats };
    const newDeposits = new PubkeyHashMap<PublicKey, Position>([...oldDeposits.entries()]);

    let depositPosition: Position | undefined = undefined;
    for (const oldDeposit of oldDeposits.values()) {
      if (oldDeposit.mintAddress.equals(mint)) {
        depositPosition = oldDeposit;
      }
    }
    let reserve: KaminoReserve | undefined = undefined;
    for (const kaminoReserve of reserves.values()) {
      if (kaminoReserve.getLiquidityMint().equals(mint)) {
        reserve = kaminoReserve;
      }
    }
    if (!reserve) {
      throw new Error(`No reserve found for mint ${mint}`);
    }

    if (!depositPosition) {
      depositPosition = {
        reserveAddress: reserve!.address,
        mintAddress: mint,
        amount: new Decimal(0),
        marketValueRefreshed: new Decimal(0),
      };
    }

    let loanToValue = reserve.stats.loanToValuePct;
    let liqThreshold = reserve.stats.liquidationThreshold;

    if (this.state.elevationGroup !== 0) {
      loanToValue = market.getElevationGroup(this.state.elevationGroup).ltvPct / 100;
      liqThreshold = market.getElevationGroup(this.state.elevationGroup).liquidationThresholdPct / 100;
    }

    if (!reserve.state.config.elevationGroups.includes(this.state.elevationGroup)) {
      throw new Error(
        `User would have to downgrade the elevation group in order to be able to deposit in this reserve`
      );
    }

    const supplyAmount = amount; //.mul(reserve.getCollateralExchangeRate()).floor();
    const supplyAmountMultiplierUSD = supplyAmount
      .mul(reserve.getOracleMarketPrice())
      .dividedBy('1'.concat(Array(reserve.stats.decimals + 1).join('0')));

    newStats.userTotalDeposit = positiveOrZero(newStats.userTotalDeposit.plus(supplyAmountMultiplierUSD));
    newStats.borrowLimit = positiveOrZero(newStats.borrowLimit.plus(supplyAmountMultiplierUSD.mul(loanToValue)));
    newStats.borrowLiquidationLimit = positiveOrZero(
      newStats.borrowLiquidationLimit.plus(supplyAmountMultiplierUSD.mul(liqThreshold))
    );
    newStats.liquidationLtv = valueOrZero(newStats.borrowLiquidationLimit.div(newStats.userTotalDeposit));

    depositPosition.amount = positiveOrZero(depositPosition.amount.plus(amount));
    depositPosition.mintAddress = mint;
    depositPosition.marketValueRefreshed = positiveOrZero(
      depositPosition.marketValueRefreshed.plus(
        supplyAmount.mul(reserve.getOracleMarketPrice()).dividedBy(reserve.getMintFactor())
      )
    );

    newDeposits.set(depositPosition.reserveAddress, depositPosition);

    return {
      deposits: newDeposits,
      stats: newStats,
    };
  }

  /**
   * Calculate the newly modified stats of the obligation
   */
  // TODO: Elevation group problems
  // TODO: Shall we set up position limits?
  getSimulatedObligationStats(
    amount: Decimal,
    action: ActionType,
    mint: PublicKey,
    market: KaminoMarket,
    reserves: Map<PublicKey, KaminoReserve>
  ): {
    stats: ObligationStats;
    deposits: Map<PublicKey, Position>;
    borrows: Map<PublicKey, Position>;
  } {
    let newStats = { ...this.refreshedStats };
    let newDeposits: Map<PublicKey, Position> = new PubkeyHashMap<PublicKey, Position>([...this.deposits.entries()]);
    let newBorrows: Map<PublicKey, Position> = new PubkeyHashMap<PublicKey, Position>([...this.borrows.entries()]);

    switch (action) {
      case 'deposit': {
        const { stats, deposits } = this.calculateSimulatedDeposit(
          this.refreshedStats,
          this.deposits,
          amount,
          mint,
          reserves,
          market
        );

        newStats = stats;
        newDeposits = deposits;

        break;
      }
      case 'borrow': {
        const { stats, borrows } = this.calculateSimulatedBorrow(
          this.refreshedStats,
          this.borrows,
          amount,
          mint,
          reserves
        );
        newStats = stats;
        newBorrows = borrows;
        break;
      }
      case 'repay': {
        const { stats, borrows } = this.calculateSimulatedBorrow(
          this.refreshedStats,
          this.borrows,
          new Decimal(amount).neg(),
          mint,
          reserves
        );
        newStats = stats;
        newBorrows = borrows;
        break;
      }

      case 'withdraw': {
        const { stats, deposits } = this.calculateSimulatedDeposit(
          this.refreshedStats,
          this.deposits,
          new Decimal(amount).neg(),
          mint,
          reserves,
          market
        );
        newStats = stats;
        newDeposits = deposits;
        break;
      }
      case 'depositAndBorrow': {
        const { stats: statsAfterDeposit, deposits } = this.calculateSimulatedDeposit(
          this.refreshedStats,
          this.deposits,
          amount,
          mint,
          reserves,
          market
        );
        const { stats, borrows } = this.calculateSimulatedBorrow(
          statsAfterDeposit,
          this.borrows,
          amount,
          mint,
          reserves
        );

        newStats = stats;
        newDeposits = deposits;
        newBorrows = borrows;
        break;
      }
      case 'repayAndWithdraw': {
        const { stats: statsAfterRepay, borrows } = this.calculateSimulatedBorrow(
          this.refreshedStats,
          this.borrows,
          new Decimal(amount).neg(),
          mint,
          reserves
        );
        const { stats: statsAfterWithdraw, deposits } = this.calculateSimulatedDeposit(
          statsAfterRepay,
          this.deposits,
          amount,
          mint,
          reserves,
          market
        );
        newStats = statsAfterWithdraw;
        newDeposits = deposits;
        newBorrows = borrows;
        break;
      }
      default: {
        throw Error(`Invalid action type ${action} for getSimulatedObligationStats`);
      }
    }
    newStats.netAccountValue = newStats.userTotalDeposit.minus(newStats.userTotalBorrow);
    newStats.loanToValue = valueOrZero(
      newStats.userTotalBorrowBorrowFactorAdjusted.dividedBy(newStats.userTotalDeposit)
    );
    newStats.leverage = valueOrZero(newStats.userTotalDeposit.dividedBy(newStats.netAccountValue));

    return {
      stats: newStats,
      deposits: newDeposits,
      borrows: newBorrows,
    };
  }

  estimateObligationInterestRate = (
    reserve: KaminoReserve,
    borrow: ObligationLiquidity,
    currentSlot: number
  ): Decimal => {
    const estimatedCumulativeBorrowRate = reserve.getEstimatedCumulativeBorrowRate(currentSlot);

    const currentCumulativeBorrowRate = KaminoObligation.getCumulativeBorrowRate(borrow);

    if (estimatedCumulativeBorrowRate.gt(currentCumulativeBorrowRate)) {
      return estimatedCumulativeBorrowRate.div(currentCumulativeBorrowRate);
    }

    return new Decimal(0);
  };

  private calculateDeposits(
    market: KaminoMarket,
    obligation: Obligation,
    collateralExchangeRates: Map<PublicKey, Decimal>,
    getPx: (reserve: KaminoReserve) => Decimal
  ): {
    deposits: Map<PublicKey, Position>;
    userTotalDeposit: Decimal;
    borrowLimit: Decimal;
    liquidationLtv: Decimal;
    borrowLiquidationLimit: Decimal;
  } {
    return KaminoObligation.calculateObligationDeposits(market, obligation, collateralExchangeRates, getPx);
  }

  private calculateBorrows(
    market: KaminoMarket,
    obligation: Obligation,
    cumulativeBorrowRates: Map<PublicKey, Decimal>,
    getPx: (reserve: KaminoReserve) => Decimal
  ): BorrowStats {
    return KaminoObligation.calculateObligationBorrows(market, obligation, cumulativeBorrowRates, getPx);
  }

  private calculatePositions(
    market: KaminoMarket,
    obligation: Obligation,
    collateralExchangeRates: Map<PublicKey, Decimal>,
    cumulativeBorrowRates: Map<PublicKey, Decimal>
  ): {
    borrows: Map<PublicKey, Position>;
    deposits: Map<PublicKey, Position>;
    refreshedStats: ObligationStats;
  } {
    const commonElevationGroups = this.getElevationGroups(market);

    const getOraclePx = (reserve: KaminoReserve) => reserve.getOracleMarketPrice();
    const depositStatsOraclePrice = this.calculateDeposits(market, obligation, collateralExchangeRates, getOraclePx);

    const borrowStatsOraclePrice = this.calculateBorrows(market, obligation, cumulativeBorrowRates, getOraclePx);

    const netAccountValueScopeRefreshed = depositStatsOraclePrice.userTotalDeposit.minus(
      borrowStatsOraclePrice.userTotalBorrow
    );

    return {
      deposits: depositStatsOraclePrice.deposits,
      borrows: borrowStatsOraclePrice.borrows,
      refreshedStats: {
        borrowLimit: depositStatsOraclePrice.borrowLimit,
        borrowLiquidationLimit: depositStatsOraclePrice.borrowLiquidationLimit,
        userTotalBorrow: borrowStatsOraclePrice.userTotalBorrow,
        userTotalBorrowBorrowFactorAdjusted: borrowStatsOraclePrice.userTotalBorrowBorrowFactorAdjusted,
        userTotalDeposit: depositStatsOraclePrice.userTotalDeposit,
        liquidationLtv: depositStatsOraclePrice.liquidationLtv,
        borrowUtilization: borrowStatsOraclePrice.userTotalBorrowBorrowFactorAdjusted.dividedBy(
          depositStatsOraclePrice.borrowLimit
        ),
        netAccountValue: netAccountValueScopeRefreshed,
        leverage: depositStatsOraclePrice.userTotalDeposit.dividedBy(netAccountValueScopeRefreshed),
        loanToValue: borrowStatsOraclePrice.userTotalBorrowBorrowFactorAdjusted.dividedBy(
          depositStatsOraclePrice.userTotalDeposit
        ),
        potentialElevationGroupUpdate: commonElevationGroups,
      },
    };
  }

  public static calculateObligationDeposits(
    market: KaminoMarket,
    obligation: Obligation,
    collateralExchangeRates: Map<PublicKey, Decimal> | null,
    getPx: (reserve: KaminoReserve) => Decimal
  ): {
    deposits: Map<PublicKey, Position>;
    userTotalDeposit: Decimal;
    userTotalCollateralDeposit: Decimal;
    borrowLimit: Decimal;
    liquidationLtv: Decimal;
    borrowLiquidationLimit: Decimal;
  } {
    let userTotalDeposit = new Decimal(0);
    let userTotalCollateralDeposit = new Decimal(0);
    let borrowLimit = new Decimal(0);
    let borrowLiquidationLimit = new Decimal(0);

    const deposits = new PubkeyHashMap<PublicKey, Position>();
    for (let i = 0; i < obligation.deposits.length; i++) {
      if (!isNotNullPubkey(obligation.deposits[i].depositReserve)) {
        continue;
      }
      const deposit = obligation.deposits[i];
      const reserve = market.getReserveByAddress(deposit.depositReserve);
      if (!reserve) {
        throw new Error(
          `Obligation contains a deposit belonging to reserve: ${deposit.depositReserve} but the reserve was not found on the market. Deposit amount: ${deposit.depositedAmount}`
        );
      }
      let loanToValue = reserve.stats.loanToValuePct;
      let liqThreshold = reserve.stats.liquidationThreshold;

      if (obligation.elevationGroup !== 0) {
        loanToValue = market.state.elevationGroups[obligation.elevationGroup - 1].ltvPct / 100;
        liqThreshold = market.state.elevationGroups[obligation.elevationGroup - 1].liquidationThresholdPct / 100;
      }

      let exchangeRate;
      if (collateralExchangeRates !== null) {
        exchangeRate = collateralExchangeRates.get(reserve.address)!;
      } else {
        exchangeRate = reserve.getCollateralExchangeRate();
      }
      const supplyAmount = new Decimal(deposit.depositedAmount.toString()).div(exchangeRate);

      const depositValueUsd = supplyAmount.mul(getPx(reserve)).div(reserve.getMintFactor());

      userTotalDeposit = userTotalDeposit.add(depositValueUsd);

      if (loanToValue !== 0) {
        userTotalCollateralDeposit = userTotalCollateralDeposit.add(depositValueUsd);
      }

      borrowLimit = borrowLimit.add(depositValueUsd.mul(loanToValue));
      borrowLiquidationLimit = borrowLiquidationLimit.add(depositValueUsd.mul(liqThreshold));

      const position: Position = {
        reserveAddress: reserve.address,
        mintAddress: reserve.getLiquidityMint(),
        amount: supplyAmount,
        marketValueRefreshed: depositValueUsd,
      };
      deposits.set(reserve.address, position);
    }

    return {
      deposits,
      userTotalDeposit,
      userTotalCollateralDeposit,
      borrowLimit,
      liquidationLtv: valueOrZero(borrowLiquidationLimit.div(userTotalDeposit)),
      borrowLiquidationLimit,
    };
  }

  public static calculateObligationBorrows(
    market: KaminoMarket,
    obligation: Obligation,
    cumulativeBorrowRates: Map<PublicKey, Decimal> | null,
    getPx: (reserve: KaminoReserve) => Decimal
  ): BorrowStats {
    let userTotalBorrow = new Decimal(0);
    let userTotalBorrowBorrowFactorAdjusted = new Decimal(0);
    let positions = 0;

    const borrows = new PubkeyHashMap<PublicKey, Position>();
    for (let i = 0; i < obligation.borrows.length; i++) {
      if (!isNotNullPubkey(obligation.borrows[i].borrowReserve)) {
        continue;
      }
      const borrow = obligation.borrows[i];
      const reserve = market.getReserveByAddress(borrow.borrowReserve);
      if (!reserve) {
        throw new Error(
          `Obligation contains a borrow belonging to reserve: ${
            borrow.borrowReserve
          } but the reserve was not found on the market. Borrow amount: ${KaminoObligation.getBorrowAmount(borrow)}`
        );
      }

      const obligationCumulativeBorrowRate = KaminoObligation.getCumulativeBorrowRate(borrow);
      let cumulativeBorrowRate;
      if (cumulativeBorrowRates !== null) {
        cumulativeBorrowRate = cumulativeBorrowRates.get(reserve.address)!;
      } else {
        cumulativeBorrowRate = reserve.getCumulativeBorrowRate();
      }

      const borrowAmount = KaminoObligation.getBorrowAmount(borrow)
        .mul(cumulativeBorrowRate)
        .dividedBy(obligationCumulativeBorrowRate);

      const borrowValueUsd = borrowAmount.mul(getPx(reserve)).dividedBy(reserve.getMintFactor());

      const borrowFactor = KaminoObligation.getBorrowFactorForReserve(reserve, obligation.elevationGroup);
      const borrowValueBorrowFactorAdjustedUsd = borrowValueUsd.mul(borrowFactor);

      if (!borrowAmount.eq(new Decimal('0'))) {
        positions += 1;
      }

      userTotalBorrow = userTotalBorrow.plus(borrowValueUsd);
      userTotalBorrowBorrowFactorAdjusted = userTotalBorrowBorrowFactorAdjusted.plus(
        borrowValueBorrowFactorAdjustedUsd
      );

      const position: Position = {
        reserveAddress: reserve.address,
        mintAddress: reserve.getLiquidityMint(),
        amount: borrowAmount,
        marketValueRefreshed: borrowValueUsd,
      };
      borrows.set(reserve.address, position);
    }

    return {
      borrows,
      userTotalBorrow,
      userTotalBorrowBorrowFactorAdjusted,
      positions,
    };
  }

  /**
   *
   * @returns Total borrowed amount for the specified obligation liquidity/borrow asset
   */
  static getBorrowAmount(borrow: ObligationLiquidity): Decimal {
    return new Fraction(borrow.borrowedAmountSf).toDecimal();
  }

  /**
   *
   * @returns Cumulative borrow rate for the specified obligation liquidity/borrow asset
   */
  static getCumulativeBorrowRate(borrow: ObligationLiquidity): Decimal {
    let accSf = new BN(0);
    for (const value of borrow.cumulativeBorrowRateBsf.value.reverse()) {
      accSf = accSf.add(value);
      accSf.shrn(64);
    }
    return new Fraction(accSf).toDecimal();
  }

  public static getRatesForObligation(
    kaminoMarket: KaminoMarket,
    obligation: Obligation,
    slot: number
  ): {
    collateralExchangeRates: Map<PublicKey, Decimal>;
    cumulativeBorrowRates: Map<PublicKey, Decimal>;
  } {
    const collateralExchangeRates = KaminoObligation.getCollateralExchangeRatesForObligation(
      kaminoMarket,
      obligation,
      slot
    );
    const cumulativeBorrowRates = KaminoObligation.getCumulativeBorrowRatesForObligation(
      kaminoMarket,
      obligation,
      slot
    );

    return {
      collateralExchangeRates,
      cumulativeBorrowRates,
    };
  }

  public static addRatesForObligation(
    kaminoMarket: KaminoMarket,
    obligation: Obligation,
    collateralExchangeRates: Map<PublicKey, Decimal>,
    cumulativeBorrowRates: Map<PublicKey, Decimal>,
    slot: number
  ): void {
    KaminoObligation.addCollateralExchangeRatesForObligation(kaminoMarket, collateralExchangeRates, obligation, slot);
    KaminoObligation.addCumulativeBorrowRatesForObligation(kaminoMarket, cumulativeBorrowRates, obligation, slot);
  }

  static getCollateralExchangeRatesForObligation(
    kaminoMarket: KaminoMarket,
    obligation: Obligation,
    slot: number
  ): Map<PublicKey, Decimal> {
    const collateralExchangeRates = new PubkeyHashMap<PublicKey, Decimal>();
    for (let i = 0; i < obligation.deposits.length; i++) {
      const deposit = obligation.deposits[i];
      if (isNotNullPubkey(deposit.depositReserve) && !collateralExchangeRates.has(deposit.depositReserve)) {
        const reserve = kaminoMarket.getReserveByAddress(deposit.depositReserve)!;
        const collateralExchangeRate = reserve.getEstimatedCollateralExchangeRate(
          slot,
          kaminoMarket.state.referralFeeBps
        );
        collateralExchangeRates.set(reserve.address, collateralExchangeRate);
      }
    }
    return collateralExchangeRates;
  }

  static addCollateralExchangeRatesForObligation(
    kaminoMarket: KaminoMarket,
    collateralExchangeRates: Map<PublicKey, Decimal>,
    obligation: Obligation,
    slot: number
  ) {
    for (let i = 0; i < obligation.deposits.length; i++) {
      const deposit = obligation.deposits[i];
      if (isNotNullPubkey(deposit.depositReserve) && !collateralExchangeRates.has(deposit.depositReserve)) {
        const reserve = kaminoMarket.getReserveByAddress(deposit.depositReserve)!;
        const collateralExchangeRate = reserve.getEstimatedCollateralExchangeRate(
          slot,
          kaminoMarket.state.referralFeeBps
        );
        collateralExchangeRates.set(reserve.address, collateralExchangeRate);
      }
    }
  }

  static getCumulativeBorrowRatesForObligation(kaminoMarket: KaminoMarket, obligation: Obligation, slot: number) {
    const cumulativeBorrowRates = new PubkeyHashMap<PublicKey, Decimal>();
    for (let i = 0; i < obligation.borrows.length; i++) {
      const borrow = obligation.borrows[i];
      if (isNotNullPubkey(borrow.borrowReserve) && !cumulativeBorrowRates.has(borrow.borrowReserve)) {
        const reserve = kaminoMarket.getReserveByAddress(borrow.borrowReserve)!;
        const cumulativeBorrowRate = reserve.getEstimatedCumulativeBorrowRate(slot);
        cumulativeBorrowRates.set(reserve.address, cumulativeBorrowRate);
      }
    }
    return cumulativeBorrowRates;
  }

  static addCumulativeBorrowRatesForObligation(
    kaminoMarket: KaminoMarket,
    cumulativeBorrowRates: Map<PublicKey, Decimal>,
    obligation: Obligation,
    slot: number
  ) {
    for (let i = 0; i < obligation.borrows.length; i++) {
      const borrow = obligation.borrows[i];
      if (isNotNullPubkey(borrow.borrowReserve) && !cumulativeBorrowRates.has(borrow.borrowReserve)) {
        const reserve = kaminoMarket.getReserveByAddress(borrow.borrowReserve)!;
        const cumulativeBorrowRate = reserve.getEstimatedCumulativeBorrowRate(slot);
        cumulativeBorrowRates.set(reserve.address, cumulativeBorrowRate);
      }
    }
  }

  static getBorrowFactorForReserve(reserve: KaminoReserve, elevationGroup: number): Decimal {
    if (elevationGroup !== 0) {
      return new Decimal(1);
    }
    return new Decimal(reserve.stats.borrowFactor).div(100);
  }
}
