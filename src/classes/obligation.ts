/* eslint-disable max-classes-per-file */
import { PublicKey } from '@solana/web3.js';
import Decimal from 'decimal.js';
import { KaminoReserve } from './reserve';
import { Obligation } from '../idl_codegen/accounts';
import { ElevationGroupDescription, KaminoMarket } from './market';
import BN from 'bn.js';
import { Fraction } from './fraction';
import {
  ObligationCollateral,
  ObligationCollateralFields,
  ObligationLiquidity,
  ObligationLiquidityFields,
} from '../idl_codegen/types';
import { positiveOrZero, valueOrZero } from './utils';
import {
  getObligationPdaWithArgs,
  getObligationType,
  isNotNullPubkey,
  PubkeyHashMap,
  TOTAL_NUMBER_OF_IDS_TO_CHECK,
  U64_MAX,
} from '../utils';
import { ActionType } from './action';

export type Position = {
  reserveAddress: PublicKey;
  mintAddress: PublicKey;
  /**
   * Amount of tokens in lamports, including decimal places for interest accrued (no borrow factor weighting)
   */
  amount: Decimal;
  /**
   * Market value of the position in USD (no borrow factor weighting)
   */
  marketValueRefreshed: Decimal;
};

export type ObligationStats = {
  userTotalDeposit: Decimal;
  userTotalCollateralDeposit: Decimal;
  userTotalLiquidatableDeposit: Decimal;
  userTotalBorrow: Decimal;
  userTotalBorrowBorrowFactorAdjusted: Decimal;
  borrowLimit: Decimal;
  borrowLiquidationLimit: Decimal;
  borrowUtilization: Decimal;
  netAccountValue: Decimal;
  loanToValue: Decimal;
  liquidationLtv: Decimal;
  leverage: Decimal;
  potentialElevationGroupUpdate: number;
};

interface BorrowStats {
  borrows: Map<PublicKey, Position>;
  userTotalBorrow: Decimal;
  userTotalBorrowBorrowFactorAdjusted: Decimal;
  positions: number;
}

interface DepositStats {
  deposits: Map<PublicKey, Position>;
  userTotalDeposit: Decimal;
  userTotalCollateralDeposit: Decimal;
  userTotalLiquidatableDeposit: Decimal;
  borrowLimit: Decimal;
  liquidationLtv: Decimal;
  borrowLiquidationLimit: Decimal;
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
      obligation.deposits,
      obligation.borrows,
      obligation.elevationGroup,
      collateralExchangeRates,
      cumulativeBorrowRates
    );
    this.deposits = deposits;
    this.borrows = borrows;
    this.refreshedStats = refreshedStats;
    this.obligationTag = obligation.tag.toNumber();
  }

  getObligationId(
    market: KaminoMarket,
    mintAddress1: PublicKey = PublicKey.default,
    mintAddress2: PublicKey = PublicKey.default
  ) {
    if (!this.state.lendingMarket.equals(new PublicKey(market.address))) {
      throw new Error('Obligation does not belong to this market');
    }
    let obligationId: number | undefined;
    const type = getObligationType(market, this.obligationTag, mintAddress1, mintAddress2);
    const baseArgs = type.toArgs();

    for (let i = 0; i < TOTAL_NUMBER_OF_IDS_TO_CHECK; i++) {
      const pda = getObligationPdaWithArgs(
        new PublicKey(market.address),
        this.state.owner,
        {
          ...baseArgs,
          id: i,
        },
        market.programId
      );
      if (pda.equals(this.obligationAddress)) {
        obligationId = i;
        break;
      }
    }
    if (obligationId === undefined) {
      throw new Error(`obligation id not found for obligation ${this.obligationAddress.toString()}`);
    }
    return obligationId;
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

  getBorrowAmountByReserve(reserve: KaminoReserve): Decimal {
    const amountLamports = this.getBorrowByMint(reserve.getLiquidityMint())?.amount ?? new Decimal(0);
    return amountLamports.div(reserve.getMintFactor());
  }

  getDepositByMint(mint: PublicKey): Position | undefined {
    for (const value of this.deposits.values()) {
      if (value.mintAddress.equals(mint)) {
        return value;
      }
    }
    return undefined;
  }

  getDepositAmountByReserve(reserve: KaminoReserve): Decimal {
    const amountLamports = this.getDepositByMint(reserve.getLiquidityMint())?.amount ?? new Decimal(0);
    return amountLamports.div(reserve.getMintFactor());
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
   * Get the loan to value and liquidation loan to value for a collateral token reserve as ratios, accounting for the obligation elevation group if it is active
   * @param market
   * @param reserve
   */
  public getLtvForReserve(market: KaminoMarket, reserve: KaminoReserve): { maxLtv: Decimal; liquidationLtv: Decimal } {
    return KaminoObligation.getLtvForReserve(market, reserve, this.state.elevationGroup);
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

  simulateDepositChange(
    obligationDeposits: ObligationCollateral[],
    changeInLamports: number,
    changeReserve: PublicKey,
    collateralExchangeRates: Map<PublicKey, Decimal>
  ): ObligationCollateral[] {
    const newDeposits: ObligationCollateral[] = [];
    const depositIndex = obligationDeposits.findIndex((deposit) => deposit.depositReserve.equals(changeReserve));

    // Always copy the previous deposits and modify the changeReserve one if it exists
    for (let i = 0; i < obligationDeposits.length; i++) {
      if (obligationDeposits[i].depositReserve.equals(changeReserve)) {
        const coll: ObligationCollateralFields = { ...obligationDeposits[i] };
        const exchangeRate = collateralExchangeRates.get(changeReserve)!;
        const changeInCollateral = new Decimal(changeInLamports).mul(exchangeRate).toFixed(0);
        const updatedDeposit = new Decimal(obligationDeposits[i].depositedAmount.toNumber()).add(changeInCollateral);
        coll.depositedAmount = new BN(positiveOrZero(updatedDeposit).toString());
        newDeposits.push(new ObligationCollateral(coll));
      } else {
        newDeposits.push(obligationDeposits[i]);
      }
    }

    if (depositIndex === -1) {
      // If the reserve is not in the obligation, we add it
      const firstBorrowIndexAvailable = obligationDeposits.findIndex((deposit) =>
        deposit.depositReserve.equals(PublicKey.default)
      );

      if (firstBorrowIndexAvailable === -1) {
        throw new Error('No available borrows to modify');
      }

      const coll: ObligationCollateralFields = { ...obligationDeposits[firstBorrowIndexAvailable] };
      const exchangeRate = collateralExchangeRates.get(changeReserve)!;
      const changeInCollateral = new Decimal(changeInLamports).mul(exchangeRate).toFixed(0);
      coll.depositedAmount = new BN(positiveOrZero(new Decimal(changeInCollateral)).toString());
      coll.depositReserve = changeReserve;

      newDeposits[firstBorrowIndexAvailable] = new ObligationCollateral(coll);
    }

    return newDeposits;
  }

  simulateBorrowChange(
    obligationBorrows: ObligationLiquidity[],
    changeInLamports: number,
    changeReserve: PublicKey,
    cumulativeBorrowRate: Decimal
  ): ObligationLiquidity[] {
    const newBorrows: ObligationLiquidity[] = [];
    const borrowIndex = obligationBorrows.findIndex((borrow) => borrow.borrowReserve.equals(changeReserve));

    // Always copy the previous borrows and modify the changeReserve one if it exists
    for (let i = 0; i < obligationBorrows.length; i++) {
      if (obligationBorrows[i].borrowReserve.equals(changeReserve)) {
        const borrow: ObligationLiquidityFields = { ...obligationBorrows[borrowIndex] };
        const newBorrowedAmount: Decimal = new Fraction(borrow.borrowedAmountSf).toDecimal().add(changeInLamports);
        const newBorrowedAmountSf = Fraction.fromDecimal(positiveOrZero(newBorrowedAmount)).getValue();
        borrow.borrowedAmountSf = newBorrowedAmountSf;

        newBorrows.push(new ObligationLiquidity(borrow));
      } else {
        newBorrows.push(obligationBorrows[i]);
      }
    }

    if (borrowIndex === -1) {
      // If the reserve is not in the obligation, we add it
      const firstBorrowIndexAvailable = obligationBorrows.findIndex((borrow) =>
        borrow.borrowReserve.equals(PublicKey.default)
      );

      if (firstBorrowIndexAvailable === -1) {
        throw new Error('No available borrows to modify');
      }

      const borrow: ObligationLiquidityFields = { ...obligationBorrows[firstBorrowIndexAvailable] };
      borrow.borrowedAmountSf = Fraction.fromDecimal(new Decimal(changeInLamports)).getValue();
      borrow.borrowReserve = changeReserve;
      borrow.cumulativeBorrowRateBsf = {
        padding: [],
        value: [Fraction.fromDecimal(cumulativeBorrowRate).getValue(), new BN(0), new BN(0), new BN(0)],
      };
      newBorrows[firstBorrowIndexAvailable] = new ObligationLiquidity(borrow);
    }

    return newBorrows;
  }

  /**
   * Calculate the newly modified stats of the obligation
   */
  // TODO: Shall we set up position limits?
  getSimulatedObligationStats(params: {
    amountCollateral?: Decimal;
    amountDebt?: Decimal;
    action: ActionType;
    mintCollateral?: PublicKey;
    mintDebt?: PublicKey;
    market: KaminoMarket;
    reserves: Map<PublicKey, KaminoReserve>;
    slot: number;
    elevationGroupOverride?: number;
  }): {
    stats: ObligationStats;
    deposits: Map<PublicKey, Position>;
    borrows: Map<PublicKey, Position>;
  } {
    const { amountCollateral, amountDebt, action, mintCollateral, mintDebt, market } = params;
    let newStats = { ...this.refreshedStats };

    const collateralReservePk = mintCollateral ? market.getReserveByMint(mintCollateral)!.address : undefined;
    const debtReservePk = mintDebt ? market.getReserveByMint(mintDebt)!.address : undefined;

    const additionalReserves: PublicKey[] = [];
    if (collateralReservePk !== undefined) {
      additionalReserves.push(collateralReservePk);
    }
    if (debtReservePk !== undefined) {
      additionalReserves.push(debtReservePk);
    }

    const { collateralExchangeRates } = KaminoObligation.getRatesForObligation(
      market,
      this.state,
      params.slot,
      additionalReserves
    );

    const elevationGroup = params.elevationGroupOverride ?? this.state.elevationGroup;

    let newDeposits: Map<PublicKey, Position> = new PubkeyHashMap<PublicKey, Position>([...this.deposits.entries()]);
    let newBorrows: Map<PublicKey, Position> = new PubkeyHashMap<PublicKey, Position>([...this.borrows.entries()]);

    // Any action can impact both deposit stats and borrow stats if elevation group is changed
    // so we have to recalculate the entire position, not just an updated deposit or borrow
    // as both LTVs and borrow factors can change, affecting all calcs

    const debtReserveCumulativeBorrowRate = mintDebt
      ? market.getReserveByMint(mintDebt)!.getCumulativeBorrowRate()
      : undefined;

    let newObligationDeposits = this.state.deposits;
    let newObligationBorrows = this.state.borrows;

    // Print deposits and borrows before
    for (const deposit of this.state.deposits) {
      console.log(`Before Deposit: ${deposit.depositReserve.toBase58()} - ${deposit.depositedAmount}`);
    }
    for (const borrow of this.state.borrows) {
      console.log(`Before Borrow: ${borrow.borrowReserve.toBase58()} - ${borrow.borrowedAmountSf}`);
    }

    switch (action) {
      case 'deposit': {
        if (amountCollateral === undefined || mintCollateral === undefined) {
          throw Error('amountCollateral & mintCollateral are required for deposit action');
        }
        newObligationDeposits = this.simulateDepositChange(
          this.state.deposits,
          amountCollateral.toNumber(),
          collateralReservePk!,
          collateralExchangeRates
        );
        break;
      }
      case 'borrow': {
        if (amountDebt === undefined || mintDebt === undefined) {
          throw Error('amountDebt & mintDebt are required for borrow action');
        }

        newObligationBorrows = this.simulateBorrowChange(
          this.state.borrows,
          amountDebt.toNumber(),
          debtReservePk!,
          debtReserveCumulativeBorrowRate!
        );
        break;
      }
      case 'repay': {
        if (amountDebt === undefined || mintDebt === undefined) {
          throw Error('amountDebt & mintDebt are required for repay action');
        }

        newObligationBorrows = this.simulateBorrowChange(
          this.state.borrows,
          amountDebt.neg().toNumber(),
          debtReservePk!,
          debtReserveCumulativeBorrowRate!
        );

        break;
      }

      case 'withdraw': {
        if (amountCollateral === undefined || mintCollateral === undefined) {
          throw Error('amountCollateral & mintCollateral are required for withdraw action');
        }
        newObligationDeposits = this.simulateDepositChange(
          this.state.deposits,
          amountCollateral.neg().toNumber(),
          collateralReservePk!,
          collateralExchangeRates
        );
        break;
      }
      case 'depositAndBorrow': {
        if (
          amountCollateral === undefined ||
          amountDebt === undefined ||
          mintCollateral === undefined ||
          mintDebt === undefined
        ) {
          throw Error('amountColl & amountDebt & mintCollateral & mintDebt are required for depositAndBorrow action');
        }
        newObligationDeposits = this.simulateDepositChange(
          this.state.deposits,
          amountCollateral.toNumber(),
          collateralReservePk!,
          collateralExchangeRates
        );

        newObligationBorrows = this.simulateBorrowChange(
          this.state.borrows,
          amountDebt.toNumber(),
          debtReservePk!,
          debtReserveCumulativeBorrowRate!
        );
        break;
      }
      case 'repayAndWithdraw': {
        if (
          amountCollateral === undefined ||
          amountDebt === undefined ||
          mintCollateral === undefined ||
          mintDebt === undefined
        ) {
          throw Error('amountColl & amountDebt & mintCollateral & mintDebt are required for repayAndWithdraw action');
        }
        newObligationDeposits = this.simulateDepositChange(
          this.state.deposits,
          amountCollateral.neg().toNumber(),
          collateralReservePk!,
          collateralExchangeRates
        );
        newObligationBorrows = this.simulateBorrowChange(
          this.state.borrows,
          amountDebt.neg().toNumber(),
          debtReservePk!,
          debtReserveCumulativeBorrowRate!
        );
        break;
      }
      default: {
        throw Error(`Invalid action type ${action} for getSimulatedObligationStats`);
      }
    }

    const { borrows, deposits, refreshedStats } = this.calculatePositions(
      market,
      newObligationDeposits,
      newObligationBorrows,
      elevationGroup,
      collateralExchangeRates,
      null
    );

    // Print deposits and borrows after
    for (const deposit of newObligationDeposits) {
      console.log(`After Deposit: ${deposit.depositReserve.toBase58()} - ${deposit.depositedAmount}`);
    }
    for (const borrow of newObligationBorrows) {
      console.log(`After Borrow: ${borrow.borrowReserve.toBase58()} - ${borrow.borrowedAmountSf}`);
    }

    newStats = refreshedStats;
    newDeposits = deposits;
    newBorrows = borrows;

    newStats.netAccountValue = newStats.userTotalDeposit.minus(newStats.userTotalBorrow);
    newStats.loanToValue = valueOrZero(
      newStats.userTotalBorrowBorrowFactorAdjusted.dividedBy(newStats.userTotalCollateralDeposit)
    );
    newStats.leverage = valueOrZero(newStats.userTotalDeposit.dividedBy(newStats.netAccountValue));

    return {
      stats: newStats,
      deposits: newDeposits,
      borrows: newBorrows,
    };
  }

  /**
   * Calculates the stats of the obligation after a hypothetical collateral swap.
   */
  getPostSwapCollObligationStats(params: {
    withdrawAmountLamports: Decimal;
    withdrawReserveAddress: PublicKey;
    depositAmountLamports: Decimal;
    depositReserveAddress: PublicKey;
    newElevationGroup: number;
    market: KaminoMarket;
    slot: number;
  }): ObligationStats {
    const {
      withdrawAmountLamports,
      withdrawReserveAddress,
      depositAmountLamports,
      depositReserveAddress,
      newElevationGroup,
      market,
      slot,
    } = params;

    const additionalReserves = [withdrawReserveAddress, depositReserveAddress].filter(
      (reserveAddress) => !market.isReserveInObligation(this, reserveAddress)
    );

    const { collateralExchangeRates } = KaminoObligation.getRatesForObligation(
      market,
      this.state,
      slot,
      additionalReserves
    );

    let newObligationDeposits = this.state.deposits;
    newObligationDeposits = this.simulateDepositChange(
      newObligationDeposits,
      withdrawAmountLamports.neg().toNumber(),
      withdrawReserveAddress,
      collateralExchangeRates
    );
    newObligationDeposits = this.simulateDepositChange(
      newObligationDeposits,
      depositAmountLamports.toNumber(),
      depositReserveAddress,
      collateralExchangeRates
    );

    const { refreshedStats } = this.calculatePositions(
      market,
      newObligationDeposits,
      this.state.borrows,
      newElevationGroup,
      collateralExchangeRates,
      null
    );

    const newStats = refreshedStats;
    newStats.netAccountValue = newStats.userTotalDeposit.minus(newStats.userTotalBorrow);
    newStats.loanToValue = valueOrZero(
      newStats.userTotalBorrowBorrowFactorAdjusted.dividedBy(newStats.userTotalCollateralDeposit)
    );
    newStats.leverage = valueOrZero(newStats.userTotalDeposit.dividedBy(newStats.netAccountValue));
    return newStats;
  }

  estimateObligationInterestRate = (
    market: KaminoMarket,
    reserve: KaminoReserve,
    borrow: ObligationLiquidity,
    currentSlot: number
  ): Decimal => {
    const newCumulativeBorrowRate = reserve.getEstimatedCumulativeBorrowRate(currentSlot, market.state.referralFeeBps);

    const formerCumulativeBorrowRate = KaminoObligation.getCumulativeBorrowRate(borrow);

    if (newCumulativeBorrowRate.gt(formerCumulativeBorrowRate)) {
      return newCumulativeBorrowRate.div(formerCumulativeBorrowRate);
    }

    return new Decimal(0);
  };

  static getOraclePx = (reserve: KaminoReserve) => {
    return reserve.getOracleMarketPrice();
  };

  calculatePositions(
    market: KaminoMarket,
    obligationDeposits: ObligationCollateral[],
    obligationBorrows: ObligationLiquidity[],
    elevationGroup: number,
    collateralExchangeRates: Map<PublicKey, Decimal>,
    cumulativeBorrowRates: Map<PublicKey, Decimal> | null,
    getOraclePx: (reserve: KaminoReserve) => Decimal = KaminoObligation.getOraclePx
  ): {
    borrows: Map<PublicKey, Position>;
    deposits: Map<PublicKey, Position>;
    refreshedStats: ObligationStats;
  } {
    const depositStatsOraclePrice = KaminoObligation.calculateObligationDeposits(
      market,
      obligationDeposits,
      collateralExchangeRates,
      elevationGroup,
      getOraclePx
    );

    const borrowStatsOraclePrice = KaminoObligation.calculateObligationBorrows(
      market,
      obligationBorrows,
      cumulativeBorrowRates,
      elevationGroup,
      getOraclePx
    );

    const netAccountValueScopeRefreshed = depositStatsOraclePrice.userTotalDeposit.minus(
      borrowStatsOraclePrice.userTotalBorrow
    );

    // TODO: Fix this?
    const potentialElevationGroupUpdate = 0;

    return {
      deposits: depositStatsOraclePrice.deposits,
      borrows: borrowStatsOraclePrice.borrows,
      refreshedStats: {
        borrowLimit: depositStatsOraclePrice.borrowLimit,
        borrowLiquidationLimit: depositStatsOraclePrice.borrowLiquidationLimit,
        userTotalBorrow: borrowStatsOraclePrice.userTotalBorrow,
        userTotalBorrowBorrowFactorAdjusted: borrowStatsOraclePrice.userTotalBorrowBorrowFactorAdjusted,
        userTotalDeposit: depositStatsOraclePrice.userTotalDeposit,
        userTotalCollateralDeposit: depositStatsOraclePrice.userTotalCollateralDeposit,
        userTotalLiquidatableDeposit: depositStatsOraclePrice.userTotalLiquidatableDeposit,
        liquidationLtv: depositStatsOraclePrice.liquidationLtv,
        borrowUtilization: borrowStatsOraclePrice.userTotalBorrowBorrowFactorAdjusted.dividedBy(
          depositStatsOraclePrice.borrowLimit
        ),
        netAccountValue: netAccountValueScopeRefreshed,
        leverage: depositStatsOraclePrice.userTotalDeposit.dividedBy(netAccountValueScopeRefreshed),
        loanToValue: borrowStatsOraclePrice.userTotalBorrowBorrowFactorAdjusted.dividedBy(
          depositStatsOraclePrice.userTotalCollateralDeposit
        ),
        potentialElevationGroupUpdate,
      },
    };
  }

  public static calculateObligationDeposits(
    market: KaminoMarket,
    obligationDeposits: ObligationCollateral[],
    collateralExchangeRates: Map<PublicKey, Decimal> | null,
    elevationGroup: number,
    getPx: (reserve: KaminoReserve) => Decimal
  ): DepositStats {
    let userTotalDeposit = new Decimal(0);
    let userTotalCollateralDeposit = new Decimal(0);
    let userTotalLiquidatableDeposit = new Decimal(0);
    let borrowLimit = new Decimal(0);
    let borrowLiquidationLimit = new Decimal(0);

    const deposits = new PubkeyHashMap<PublicKey, Position>();
    for (let i = 0; i < obligationDeposits.length; i++) {
      if (!isNotNullPubkey(obligationDeposits[i].depositReserve)) {
        continue;
      }
      const deposit = obligationDeposits[i];
      const reserve = market.getReserveByAddress(deposit.depositReserve);
      if (!reserve) {
        throw new Error(
          `Obligation contains a deposit belonging to reserve: ${deposit.depositReserve} but the reserve was not found on the market. Deposit amount: ${deposit.depositedAmount}`
        );
      }
      const { maxLtv, liquidationLtv } = KaminoObligation.getLtvForReserve(market, reserve, elevationGroup);

      let exchangeRate: Decimal;
      if (collateralExchangeRates !== null) {
        exchangeRate = collateralExchangeRates.get(reserve.address)!;
      } else {
        exchangeRate = reserve.getCollateralExchangeRate();
      }
      const supplyAmount = new Decimal(deposit.depositedAmount.toString()).div(exchangeRate);

      const depositValueUsd = supplyAmount.mul(getPx(reserve)).div(reserve.getMintFactor());

      userTotalDeposit = userTotalDeposit.add(depositValueUsd);

      if (!maxLtv.eq('0')) {
        userTotalCollateralDeposit = userTotalCollateralDeposit.add(depositValueUsd);
      }

      if (!liquidationLtv.eq('0')) {
        userTotalLiquidatableDeposit = userTotalLiquidatableDeposit.add(depositValueUsd);
      }

      borrowLimit = borrowLimit.add(depositValueUsd.mul(maxLtv));
      borrowLiquidationLimit = borrowLiquidationLimit.add(depositValueUsd.mul(liquidationLtv));

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
      userTotalLiquidatableDeposit,
      borrowLimit,
      liquidationLtv: valueOrZero(borrowLiquidationLimit.div(userTotalLiquidatableDeposit)),
      borrowLiquidationLimit,
    };
  }

  public static calculateObligationBorrows(
    market: KaminoMarket,
    obligationBorrows: ObligationLiquidity[],
    cumulativeBorrowRates: Map<PublicKey, Decimal> | null,
    elevationGroup: number,
    getPx: (reserve: KaminoReserve) => Decimal
  ): BorrowStats {
    let userTotalBorrow = new Decimal(0);
    let userTotalBorrowBorrowFactorAdjusted = new Decimal(0);
    let positions = 0;

    const borrows = new PubkeyHashMap<PublicKey, Position>();
    for (let i = 0; i < obligationBorrows.length; i++) {
      if (!isNotNullPubkey(obligationBorrows[i].borrowReserve)) {
        continue;
      }
      const borrow = obligationBorrows[i];
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

      const borrowFactor = KaminoObligation.getBorrowFactorForReserve(reserve, elevationGroup);
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

  getMaxLoanLtvGivenElevationGroup(market: KaminoMarket, elevationGroup: number, slot: number): Decimal {
    const getOraclePx = (reserve: KaminoReserve) => reserve.getOracleMarketPrice();
    const { collateralExchangeRates } = KaminoObligation.getRatesForObligation(market, this.state, slot);

    const { borrowLimit, userTotalCollateralDeposit } = KaminoObligation.calculateObligationDeposits(
      market,
      this.state.deposits,
      collateralExchangeRates,
      elevationGroup,
      getOraclePx
    );

    if (borrowLimit.eq(0) || userTotalCollateralDeposit.eq(0)) {
      return new Decimal(0);
    }

    return borrowLimit.div(userTotalCollateralDeposit);
  }

  /*
    How much of a given token can a user borrow extra given an elevation group,
    regardless of caps and liquidity or assuming infinite liquidity and infinite caps,
    until it hits max LTV.

    This is purely a function about the borrow power of an obligation,
    not a reserve-specific, caps-specific, liquidity-specific function.

    * @param market - The KaminoMarket instance.
    * @param liquidityMint - The liquidity mint PublicKey.
    * @param slot - The slot number.
    * @param elevationGroup - The elevation group number (default: this.state.elevationGroup).
    * @returns The borrow power as a Decimal.
    * @throws Error if the reserve is not found.
  */
  getBorrowPower(
    market: KaminoMarket,
    liquidityMint: PublicKey,
    slot: number,
    elevationGroup: number = this.state.elevationGroup
  ): Decimal {
    const reserve = market.getReserveByMint(liquidityMint);
    if (!reserve) {
      throw new Error('Reserve not found');
    }

    const elevationGroupActivated =
      reserve.state.config.elevationGroups.includes(elevationGroup) && elevationGroup !== 0;

    const borrowFactor = KaminoObligation.getBorrowFactorForReserve(reserve, elevationGroup);

    const getOraclePx = (reserve: KaminoReserve) => reserve.getOracleMarketPrice();
    const { collateralExchangeRates, cumulativeBorrowRates } = KaminoObligation.getRatesForObligation(
      market,
      this.state,
      slot
    );

    const { borrowLimit } = KaminoObligation.calculateObligationDeposits(
      market,
      this.state.deposits,
      collateralExchangeRates,
      elevationGroup,
      getOraclePx
    );

    const { userTotalBorrowBorrowFactorAdjusted } = KaminoObligation.calculateObligationBorrows(
      market,
      this.state.borrows,
      cumulativeBorrowRates,
      elevationGroup,
      getOraclePx
    );

    const maxObligationBorrowPower = borrowLimit // adjusted available amount
      .minus(userTotalBorrowBorrowFactorAdjusted)
      .div(borrowFactor)
      .div(reserve.getOracleMarketPrice())
      .mul(reserve.getMintFactor());

    // If it has any collateral outside emode, then return 0
    for (const [_, value] of this.deposits.entries()) {
      const depositReserve = market.getReserveByAddress(value.reserveAddress);
      if (!depositReserve) {
        throw new Error('Reserve not found');
      }
      if (depositReserve.state.config.disableUsageAsCollOutsideEmode && !elevationGroupActivated) {
        return new Decimal(0);
      }
    }

    // This is not amazing because it assumes max borrow, which is not true
    let originationFeeRate = reserve.getBorrowFee();

    // Inclusive fee rate
    originationFeeRate = originationFeeRate.div(originationFeeRate.add(new Decimal(1)));
    const borrowFee = maxObligationBorrowPower.mul(originationFeeRate);

    const maxBorrowAmount = maxObligationBorrowPower.sub(borrowFee);

    return Decimal.max(new Decimal(0), maxBorrowAmount);
  }

  /*
    How much of a given token can a user borrow extra given an elevation group,
    and a specific reserve, until it hits max LTV and given available liquidity and caps.

    * @param market - The KaminoMarket instance.
    * @param liquidityMint - The liquidity mint PublicKey.
    * @param slot - The slot number.
    * @param elevationGroup - The elevation group number (default: this.state.elevationGroup).
    * @returns The maximum borrow amount as a Decimal.
    * @throws Error if the reserve is not found.
  */
  getMaxBorrowAmountV2(
    market: KaminoMarket,
    liquidityMint: PublicKey,
    slot: number,
    elevationGroup: number = this.state.elevationGroup
  ): Decimal {
    const reserve = market.getReserveByMint(liquidityMint);
    if (!reserve) {
      throw new Error('Reserve not found');
    }

    const liquidityAvailable = reserve.getLiquidityAvailableForDebtReserveGivenCaps(
      market,
      [elevationGroup],
      Array.from(this.deposits.keys())
    )[0];
    const maxBorrowAmount = this.getBorrowPower(market, liquidityMint, slot, elevationGroup);

    if (elevationGroup === this.state.elevationGroup) {
      return Decimal.min(maxBorrowAmount, liquidityAvailable);
    } else {
      // TODO: this is wrong, most liquidity caps are global, we should add up only the ones that are specific to this mode
      const { amount: debtThisReserve } = this.borrows.get(reserve.address) || { amount: new Decimal(0) };
      const liquidityAvailablePostMigration = Decimal.max(0, liquidityAvailable.minus(debtThisReserve));
      return Decimal.min(maxBorrowAmount, liquidityAvailablePostMigration);
    }
  }

  /*
    Returns true if the loan is eligible for the elevation group, including for the default one.
    * @param market - The KaminoMarket object representing the market.
    * @param slot - The slot number of the loan.
    * @param elevationGroup - The elevation group number.
    * @returns A boolean indicating whether the loan is eligible for elevation.
  */
  isLoanEligibleForElevationGroup(market: KaminoMarket, slot: number, elevationGroup: number): boolean {
    // - isLoanEligibleForEmode(obligation, emode: 0 | number): <boolean, ErrorMessage>
    //    - essentially checks if a loan can be migrated or not
    //    - [x] due to collateral / debt reserves combination
    //    - [x] due to LTV, etc

    const reserveDeposits: PublicKey[] = Array.from(this.deposits.keys());
    const reserveBorrows: PublicKey[] = Array.from(this.borrows.keys());

    if (reserveBorrows.length > 1) {
      return false;
    }

    if (elevationGroup > 0) {
      // Elevation group 0 doesn't need to do reserve checks, as all are included by default
      const allElevationGroups = market.getMarketElevationGroupDescriptions();
      const elevationGroupDescription = allElevationGroups[elevationGroup - 1];

      // Has to be a subset
      const allCollsIncluded = reserveDeposits.every((reserve) =>
        elevationGroupDescription.collateralReserves.contains(reserve)
      );
      const allDebtsIncluded =
        reserveBorrows.length === 0 ||
        (reserveBorrows.length === 1 && elevationGroupDescription.debtReserve.equals(reserveBorrows[0]));

      if (!allCollsIncluded || !allDebtsIncluded) {
        return false;
      }
    }

    // Check if the loan can be migrated based on LTV
    const getOraclePx = (reserve: KaminoReserve) => reserve.getOracleMarketPrice();
    const { collateralExchangeRates } = KaminoObligation.getRatesForObligation(market, this.state, slot);

    const { borrowLimit } = KaminoObligation.calculateObligationDeposits(
      market,
      this.state.deposits,
      collateralExchangeRates,
      elevationGroup,
      getOraclePx
    );

    const isEligibleBasedOnLtv = this.refreshedStats.userTotalBorrowBorrowFactorAdjusted.lte(borrowLimit);

    return isEligibleBasedOnLtv;
  }

  /*
    Returns all elevation groups for a given obligation, except the default one
    * @param market - The KaminoMarket instance.
    * @returns An array of ElevationGroupDescription objects representing the elevation groups for the obligation.
  */
  getElevationGroupsForObligation(market: KaminoMarket): ElevationGroupDescription[] {
    if (this.borrows.size > 1) {
      return [];
    }

    const collReserves = Array.from(this.deposits.keys());
    if (this.borrows.size === 0) {
      return market.getElevationGroupsForReservesCombination(collReserves);
    } else {
      const debtReserve = Array.from(this.borrows.keys())[0];
      return market.getElevationGroupsForReservesCombination(collReserves, debtReserve);
    }
  }

  /* Deprecated function, also broken */
  getMaxBorrowAmount(
    market: KaminoMarket,
    liquidityMint: PublicKey,
    slot: number,
    requestElevationGroup: boolean
  ): Decimal {
    const reserve = market.getReserveByMint(liquidityMint);

    if (!reserve) {
      throw new Error('Reserve not found');
    }

    const groups = market.state.elevationGroups;
    const emodeGroupsDebtReserve = reserve.state.config.elevationGroups;
    let commonElevationGroups = [...emodeGroupsDebtReserve].filter(
      (item) => item !== 0 && groups[item - 1].debtReserve.equals(reserve.address)
    );

    for (const [_, value] of this.deposits.entries()) {
      const depositReserve = market.getReserveByAddress(value.reserveAddress);

      if (!depositReserve) {
        throw new Error('Reserve not found');
      }

      const depositReserveEmodeGroups = depositReserve.state.config.elevationGroups;

      commonElevationGroups = commonElevationGroups.filter((item) => depositReserveEmodeGroups.includes(item));
    }

    let elevationGroup = this.state.elevationGroup;
    if (commonElevationGroups.length != 0) {
      const eModeGroupWithMaxLtvAndDebtReserve = commonElevationGroups.reduce((prev, curr) => {
        const prevGroup = groups.find((group) => group.id === prev);
        const currGroup = groups.find((group) => group.id === curr);
        return prevGroup!.ltvPct > currGroup!.ltvPct ? prev : curr;
      });

      if (requestElevationGroup) {
        elevationGroup = eModeGroupWithMaxLtvAndDebtReserve;
      }
    }

    const elevationGroupActivated =
      reserve.state.config.elevationGroups.includes(elevationGroup) && elevationGroup !== 0;

    const borrowFactor = KaminoObligation.getBorrowFactorForReserve(reserve, elevationGroup);

    const maxObligationBorrowPower = this.refreshedStats.borrowLimit // adjusted available amount
      .minus(this.refreshedStats.userTotalBorrowBorrowFactorAdjusted)
      .div(borrowFactor)
      .div(reserve.getOracleMarketPrice())
      .mul(reserve.getMintFactor());
    const reserveAvailableAmount = reserve.getLiquidityAvailableAmount();
    let reserveBorrowCapRemained = reserve.stats.reserveBorrowLimit.sub(reserve.getBorrowedAmount());

    this.deposits.forEach((deposit) => {
      const depositReserve = market.getReserveByAddress(deposit.reserveAddress);
      if (!depositReserve) {
        throw new Error('Reserve not found');
      }
      if (depositReserve.state.config.disableUsageAsCollOutsideEmode && !elevationGroupActivated) {
        reserveBorrowCapRemained = new Decimal(0);
      }
    });

    let maxBorrowAmount = Decimal.min(maxObligationBorrowPower, reserveAvailableAmount, reserveBorrowCapRemained);

    const debtWithdrawalCap = reserve.getDebtWithdrawalCapCapacity().sub(reserve.getDebtWithdrawalCapCurrent(slot));
    maxBorrowAmount = reserve.getDebtWithdrawalCapCapacity().gt(0)
      ? Decimal.min(maxBorrowAmount, debtWithdrawalCap)
      : maxBorrowAmount;

    let originationFeeRate = reserve.getBorrowFee();

    // Inclusive fee rate
    originationFeeRate = originationFeeRate.div(originationFeeRate.add(new Decimal(1)));
    const borrowFee = maxBorrowAmount.mul(originationFeeRate);

    maxBorrowAmount = maxBorrowAmount.sub(borrowFee);

    const utilizationRatioLimit = reserve.state.config.utilizationLimitBlockBorrowingAbovePct / 100;
    const currentUtilizationRatio = reserve.calculateUtilizationRatio();

    if (utilizationRatioLimit > 0 && currentUtilizationRatio > utilizationRatioLimit) {
      return new Decimal(0);
    } else if (utilizationRatioLimit > 0 && currentUtilizationRatio < utilizationRatioLimit) {
      const maxBorrowBasedOnUtilization = new Decimal(utilizationRatioLimit - currentUtilizationRatio).mul(
        reserve.getTotalSupply()
      );
      maxBorrowAmount = Decimal.min(maxBorrowAmount, maxBorrowBasedOnUtilization);
    }

    let borrowLimitDependentOnElevationGroup = new Decimal(U64_MAX);

    if (!elevationGroupActivated) {
      borrowLimitDependentOnElevationGroup = reserve
        .getBorrowLimitOutsideElevationGroup()
        .sub(reserve.getBorrowedAmountOutsideElevationGroup());
    } else {
      let maxDebtTakenAgainstCollaterals = new Decimal(U64_MAX);
      for (const [_, value] of this.deposits.entries()) {
        const depositReserve = market.getReserveByAddress(value.reserveAddress);

        if (!depositReserve) {
          throw new Error('Reserve not found');
        }

        const maxDebtAllowedAgainstCollateral = depositReserve
          .getBorrowLimitAgainstCollateralInElevationGroup(elevationGroup - 1)
          .sub(depositReserve.getBorrowedAmountAgainstCollateralInElevationGroup(elevationGroup - 1));

        maxDebtTakenAgainstCollaterals = Decimal.max(
          new Decimal(0),
          Decimal.min(maxDebtAllowedAgainstCollateral, maxDebtTakenAgainstCollaterals)
        );
      }
      borrowLimitDependentOnElevationGroup = maxDebtTakenAgainstCollaterals;
    }

    maxBorrowAmount = Decimal.min(maxBorrowAmount, borrowLimitDependentOnElevationGroup);

    return Decimal.max(new Decimal(0), maxBorrowAmount);
  }

  getMaxWithdrawAmount(market: KaminoMarket, tokenMint: PublicKey, slot: number): Decimal {
    const depositReserve = market.getReserveByMint(tokenMint);

    if (!depositReserve) {
      throw new Error('Reserve not found');
    }

    const userDepositPosition = this.getDepositByReserve(depositReserve.address);

    if (!userDepositPosition) {
      throw new Error('Deposit reserve not found');
    }

    const userDepositPositionAmount = userDepositPosition.amount;

    if (this.refreshedStats.userTotalBorrowBorrowFactorAdjusted.equals(new Decimal(0))) {
      return new Decimal(userDepositPositionAmount);
    }

    const { maxLtv: reserveMaxLtv } = KaminoObligation.getLtvForReserve(
      market,
      depositReserve,
      this.state.elevationGroup
    );
    // bf adjusted debt value > allowed_borrow_value
    if (this.refreshedStats.userTotalBorrowBorrowFactorAdjusted.gte(this.refreshedStats.borrowLimit)) {
      return new Decimal(0);
    }

    let maxWithdrawValue: Decimal;
    if (reserveMaxLtv.eq(0)) {
      maxWithdrawValue = userDepositPositionAmount;
    } else {
      // borrowLimit / userTotalDeposit = maxLtv
      // maxWithdrawValue = userTotalDeposit - userTotalBorrow / maxLtv
      maxWithdrawValue = this.refreshedStats.borrowLimit
        .sub(this.refreshedStats.userTotalBorrowBorrowFactorAdjusted)
        .div(reserveMaxLtv)
        .mul(0.999); // remove 0.1% to prevent going over max ltv
    }

    const maxWithdrawAmount = maxWithdrawValue
      .div(depositReserve.getOracleMarketPrice())
      .mul(depositReserve.getMintFactor());
    const reserveAvailableLiquidity = depositReserve.getLiquidityAvailableAmount();

    const withdrawalCapRemained = depositReserve
      .getDepositWithdrawalCapCapacity()
      .sub(depositReserve.getDepositWithdrawalCapCurrent(slot));
    return Decimal.max(
      0,
      Decimal.min(userDepositPositionAmount, maxWithdrawAmount, reserveAvailableLiquidity, withdrawalCapRemained)
    );
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
    }
    return new Fraction(accSf).toDecimal();
  }

  public static getRatesForObligation(
    kaminoMarket: KaminoMarket,
    obligation: Obligation,
    slot: number,
    additionalReserves: PublicKey[] = []
  ): {
    collateralExchangeRates: Map<PublicKey, Decimal>;
    cumulativeBorrowRates: Map<PublicKey, Decimal>;
  } {
    const collateralExchangeRates = KaminoObligation.getCollateralExchangeRatesForObligation(
      kaminoMarket,
      obligation,
      slot,
      additionalReserves
    );
    const cumulativeBorrowRates = KaminoObligation.getCumulativeBorrowRatesForObligation(
      kaminoMarket,
      obligation,
      slot,
      additionalReserves
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
    slot: number,
    additionalReserves: PublicKey[]
  ): Map<PublicKey, Decimal> {
    const collateralExchangeRates = new PubkeyHashMap<PublicKey, Decimal>();

    // Create a set of all reserves coming from deposit plus additional reserves
    const allReserves = new Set<PublicKey>();
    for (let i = 0; i < obligation.deposits.length; i++) {
      const deposit = obligation.deposits[i];
      if (isNotNullPubkey(deposit.depositReserve)) {
        allReserves.add(deposit.depositReserve);
      }
    }
    for (let i = 0; i < additionalReserves.length; i++) {
      if (isNotNullPubkey(additionalReserves[i])) {
        allReserves.add(additionalReserves[i]);
      }
    }

    // Run through all reserves and get the exchange rate
    for (const reserve of allReserves) {
      const reserveInstance = kaminoMarket.getReserveByAddress(reserve)!;
      const collateralExchangeRate = reserveInstance.getEstimatedCollateralExchangeRate(
        slot,
        kaminoMarket.state.referralFeeBps
      );
      collateralExchangeRates.set(reserve, collateralExchangeRate);
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

  static getCumulativeBorrowRatesForObligation(
    kaminoMarket: KaminoMarket,
    obligation: Obligation,
    slot: number,
    additionalReserves: PublicKey[] = []
  ): Map<PublicKey, Decimal> {
    const allReserves = new Set<PublicKey>();
    for (let i = 0; i < obligation.borrows.length; i++) {
      const borrow = obligation.borrows[i];
      if (isNotNullPubkey(borrow.borrowReserve)) {
        allReserves.add(borrow.borrowReserve);
      }
    }

    // Add additional reserves
    for (let i = 0; i < additionalReserves.length; i++) {
      if (isNotNullPubkey(additionalReserves[i])) {
        allReserves.add(additionalReserves[i]);
      }
    }

    const cumulativeBorrowRates = new PubkeyHashMap<PublicKey, Decimal>();

    // Run through all reserves and get the cumulative borrow rate
    for (const reserve of allReserves) {
      const reserveInstance = kaminoMarket.getReserveByAddress(reserve)!;
      const cumulativeBorrowRate = reserveInstance.getEstimatedCumulativeBorrowRate(
        slot,
        kaminoMarket.state.referralFeeBps
      );
      cumulativeBorrowRates.set(reserve, cumulativeBorrowRate);
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
        const cumulativeBorrowRate = reserve.getEstimatedCumulativeBorrowRate(slot, kaminoMarket.state.referralFeeBps);
        cumulativeBorrowRates.set(reserve.address, cumulativeBorrowRate);
      }
    }
  }

  /**
   * Get the borrow factor for a borrow reserve, accounting for the obligation elevation group if it is active
   * @param reserve
   * @param elevationGroup
   */
  public static getBorrowFactorForReserve(reserve: KaminoReserve, elevationGroup: number): Decimal {
    const elevationGroupActivated =
      reserve.state.config.elevationGroups.includes(elevationGroup) && elevationGroup !== 0;
    if (elevationGroupActivated) {
      return new Decimal('1');
    }
    return new Decimal(reserve.stats.borrowFactor).div('100');
  }

  /**
   * Get the loan to value and liquidation loan to value for a collateral reserve as ratios, accounting for the obligation elevation group if it is active
   * @param market
   * @param reserve
   * @param elevationGroup
   */
  public static getLtvForReserve(
    market: KaminoMarket,
    reserve: KaminoReserve,
    elevationGroup: number
  ): { maxLtv: Decimal; liquidationLtv: Decimal } {
    const elevationGroupActivated =
      elevationGroup !== 0 && reserve.state.config.elevationGroups.includes(elevationGroup);
    if (elevationGroupActivated) {
      const { ltvPct, liquidationThresholdPct } = market.getElevationGroup(elevationGroup);
      return {
        maxLtv: new Decimal(ltvPct).div('100'),
        liquidationLtv: new Decimal(liquidationThresholdPct).div('100'),
      };
    } else {
      const { loanToValue, liquidationThreshold } = reserve.stats;
      return {
        maxLtv: new Decimal(loanToValue),
        liquidationLtv: new Decimal(liquidationThreshold),
      };
    }
  }
}
