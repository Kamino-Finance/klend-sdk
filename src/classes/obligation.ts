/* eslint-disable max-classes-per-file */
import { Address, none, Option, Slot, some } from '@solana/kit';
import Decimal from 'decimal.js';
import { KaminoReserve } from './reserve';
import { Obligation } from '../@codegen/klend/accounts';
import { ElevationGroupDescription, KaminoMarket } from './market';
import BN from 'bn.js';
import { bfToDecimal, Fraction } from './fraction';
import {
  ObligationCollateral,
  ObligationCollateralFields,
  ObligationLiquidity,
  ObligationLiquidityFields,
} from '../@codegen/klend/types';
import { positiveOrZero, valueOrZero } from './utils';
import {
  DEFAULT_PUBLIC_KEY,
  getObligationPdaWithArgs,
  getObligationType,
  isNotNullPubkey,
  ObligationType,
  TOTAL_NUMBER_OF_IDS_TO_CHECK,
  U64_MAX,
} from '../utils';
import { ActionType } from './action';
import { KaminoObligationOrder } from './obligationOrder';

export type Position = {
  reserveAddress: Address;
  mintAddress: Address;
  mintFactor: Decimal;
  /**
   * Amount of tokens in lamports, including decimal places for interest accrued (no borrow factor weighting)
   */
  amount: Decimal;
  /**
   * Market value of the position in USD (no borrow factor weighting)
   */
  marketValueRefreshed: Decimal;
};

export type PositionChange = {
  reserveAddress: Address;
  amountChangeLamports: Decimal;
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

  /**
   * The obligation's current LTV, *suitable for UI display*.
   *
   * Technically, this is a ratio:
   * - of a sum of all borrows' values multiplied by reserves' borrowFactor (i.e. `userTotalBorrowBorrowFactorAdjusted`)
   * - to a sum of values of all deposits having reserve's loanToValue > 0 (i.e. `userTotalCollateralDeposit`)
   *
   * Please note that this is different from the smart contract's definition of LTV (which divides by a sum of values
   * of strictly all deposits, i.e. `userTotalDeposit`). Some parts of the SDK (e.g. obligation orders) need to use the
   * smart contract's LTV definition.
   */
  loanToValue: Decimal;

  /**
   * The LTV at which the obligation becomes subject to liquidation, *suitable for UI display*.
   *
   * Technically, this is a ratio:
   * - of a sum of values of all deposits multiplied by reserves' liquidationLtv (i.e. `borrowLiquidationLimit`)
   * - to a sum of values of all deposits having reserve's liquidationLtv > 0 (i.e. `userTotalLiquidatableDeposit`)
   *
   * Please note that this is different from the smart contract's definition of liquidation LTV (which divides by a sum
   * of values of strictly all deposits, i.e. `userTotalDeposit`). Some parts of the SDK (e.g. obligation orders) need
   * to use the smart contract's LTV definition.
   */
  liquidationLtv: Decimal;

  leverage: Decimal;
  potentialElevationGroupUpdate: number;
};

interface BorrowStats {
  borrows: Map<Address, Position>;
  userTotalBorrow: Decimal;
  userTotalBorrowBorrowFactorAdjusted: Decimal;
  positions: number;
}

interface DepositStats {
  deposits: Map<Address, Position>;
  userTotalDeposit: Decimal;
  userTotalCollateralDeposit: Decimal;
  userTotalLiquidatableDeposit: Decimal;
  borrowLimit: Decimal;
  liquidationLtv: Decimal;
  borrowLiquidationLimit: Decimal;
}

export class KaminoObligation {
  obligationAddress: Address;

  state: Obligation;

  /**
   * Deposits stored in a map of reserve address to position
   */
  deposits: Map<Address, Position>;

  /**
   * Borrows stored in a map of reserve address to position
   */
  borrows: Map<Address, Position>;

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
    obligationAddress: Address,
    obligation: Obligation,
    collateralExchangeRates: Map<Address, Decimal>,
    cumulativeBorrowRates: Map<Address, Decimal>
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

  async getObligationId(
    market: KaminoMarket,
    mintAddress1: Option<Address> = none(),
    mintAddress2: Option<Address> = none()
  ) {
    if (this.state.lendingMarket !== market.getAddress()) {
      throw new Error('Obligation does not belong to this market');
    }
    let obligationId: number | undefined;
    const type = getObligationType(market, this.obligationTag, mintAddress1, mintAddress2);
    const baseArgs = type.toArgs();

    for (let i = 0; i < TOTAL_NUMBER_OF_IDS_TO_CHECK; i++) {
      const pda = await getObligationPdaWithArgs(
        market.getAddress(),
        this.state.owner,
        {
          ...baseArgs,
          id: i,
        },
        market.programId
      );
      if (pda === this.obligationAddress) {
        obligationId = i;
        break;
      }
    }
    if (obligationId === undefined) {
      throw new Error(`obligation id not found for obligation ${this.obligationAddress.toString()}`);
    }
    return obligationId;
  }

  static async load(kaminoMarket: KaminoMarket, obligationAddress: Address): Promise<KaminoObligation | null> {
    const res = await kaminoMarket.getRpc().getAccountInfo(obligationAddress, { encoding: 'base64' }).send();
    if (!res.value) {
      return null;
    }
    const accInfo = res.value;
    if (accInfo.owner !== kaminoMarket.programId) {
      throw new Error("account doesn't belong to this program");
    }
    const obligation = Obligation.decode(Buffer.from(accInfo.data[0], 'base64'));

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
    obligationAddresses: Address[],
    slot?: Slot
  ): Promise<(KaminoObligation | null)[]> {
    let currentSlot = slot;
    let obligations: (Obligation | null)[];
    if (!currentSlot) {
      [currentSlot, obligations] = await Promise.all([
        kaminoMarket.getRpc().getSlot().send(),
        Obligation.fetchMultiple(kaminoMarket.getRpc(), obligationAddresses, kaminoMarket.programId),
      ]);
    } else {
      obligations = await Obligation.fetchMultiple(kaminoMarket.getRpc(), obligationAddresses, kaminoMarket.programId);
    }
    const cumulativeBorrowRates = new Map<Address, Decimal>();
    const collateralExchangeRates = new Map<Address, Decimal>();
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
   * Returns obligation orders (including the null ones, i.e. non-active positions in the orders' array).
   */
  getOrders(): Array<KaminoObligationOrder | null> {
    return this.state.orders.map((order) => KaminoObligationOrder.fromState(order));
  }

  /**
   * Returns active obligation orders (i.e. ones that *may* have their condition met).
   */
  getActiveOrders(): Array<KaminoObligationOrder> {
    return this.getOrders().filter((order) => order !== null);
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
  getMaxAllowedBorrowValue(): Decimal {
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

  getBorrowByReserve(reserve: Address): Position | undefined {
    return this.borrows.get(reserve);
  }

  getDepositByReserve(reserve: Address): Position | undefined {
    return this.deposits.get(reserve);
  }

  getBorrowByMint(mint: Address): Position | undefined {
    for (const value of this.borrows.values()) {
      if (value.mintAddress === mint) {
        return value;
      }
    }
    return undefined;
  }

  getBorrowAmountByReserve(reserve: KaminoReserve): Decimal {
    const amountLamports = this.getBorrowByMint(reserve.getLiquidityMint())?.amount ?? new Decimal(0);
    return amountLamports.div(reserve.getMintFactor());
  }

  getDepositByMint(mint: Address): Position | undefined {
    for (const value of this.deposits.values()) {
      if (value.mintAddress === mint) {
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
   * Calculates the current ratio of borrowed value to deposited value (taking *all* deposits into account).
   *
   * Please note that the denominator here is different from the one found in `refreshedStats`:
   * - the {@link ObligationStats#loanToValue} contains a value appropriate for display on the UI (i.e. taking into
   *   account *only* the deposits having `reserve.loanToValue > 0`).
   * - the computation below follows the logic used by the KLend smart contract, and is appropriate e.g. for evaluating
   *   LTV-based obligation orders.
   */
  loanToValue(): Decimal {
    if (this.refreshedStats.userTotalDeposit.eq(0)) {
      return new Decimal(0);
    }
    return this.refreshedStats.userTotalBorrowBorrowFactorAdjusted.div(this.refreshedStats.userTotalDeposit);
  }

  /**
   * Calculates the ratio of borrowed value to deposited value (taking *all* deposits into account) at which the
   * obligation is subject to liquidation.
   *
   * Please note that the denominator here is different from the one found in `refreshedStats`:
   * - the {@link ObligationStats#liquidationLtv} contains a value appropriate for display on the UI (i.e. taking into
   *   account *only* the deposits having `reserve.liquidationLtv > 0`).
   * - the computation below follows the logic used by the KLend smart contract, and is appropriate e.g. for evaluating
   *   LTV-based obligation orders.
   */
  liquidationLtv(): Decimal {
    if (this.refreshedStats.userTotalDeposit.eq(0)) {
      return new Decimal(0);
    }
    return this.refreshedStats.borrowLiquidationLimit.div(this.refreshedStats.userTotalDeposit);
  }

  /**
   * Calculate the current ratio of borrowed value to deposited value, disregarding the borrow factor.
   */
  noBfLoanToValue(): Decimal {
    if (this.refreshedStats.userTotalDeposit.eq(0)) {
      return new Decimal(0);
    }
    return this.refreshedStats.userTotalBorrow.div(this.refreshedStats.userTotalDeposit);
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

  getReferrer(): Option<Address> {
    if (this.state.referrer === DEFAULT_PUBLIC_KEY) {
      return none();
    }
    return some(this.state.referrer);
  }

  /**
   * Get the loan to value and liquidation loan to value for a collateral token reserve as ratios, accounting for the obligation elevation group if it is active
   */
  public getLtvForReserve(market: KaminoMarket, reserveAddress: Address): { maxLtv: Decimal; liquidationLtv: Decimal } {
    return KaminoObligation.getLtvForReserve(
      market,
      market.getExistingReserveByAddress(reserveAddress),
      this.state.elevationGroup
    );
  }

  /**
   * @returns the potential elevation groups the obligation qualifies for
   */
  getElevationGroups(kaminoMarket: KaminoMarket): Array<number> {
    const reserves = new Map<Address, KaminoReserve>();
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
    depositChange: PositionChange,
    collateralExchangeRates: Map<Address, Decimal>
  ): ObligationCollateral[] {
    const newDeposits: ObligationCollateral[] = [];
    const depositIndex = obligationDeposits.findIndex(
      (deposit) => deposit.depositReserve === depositChange.reserveAddress
    );

    // Always copy the previous deposits and modify the changeReserve one if it exists
    for (let i = 0; i < obligationDeposits.length; i++) {
      if (obligationDeposits[i].depositReserve === depositChange.reserveAddress) {
        const coll: ObligationCollateralFields = { ...obligationDeposits[i] };
        const exchangeRate = collateralExchangeRates.get(depositChange.reserveAddress)!;
        const changeInCollateral = new Decimal(depositChange.amountChangeLamports).mul(exchangeRate).toFixed(0);
        const updatedDeposit = new Decimal(obligationDeposits[i].depositedAmount.toNumber()).add(changeInCollateral);
        coll.depositedAmount = new BN(positiveOrZero(updatedDeposit).toString());
        newDeposits.push(new ObligationCollateral(coll));
      } else {
        newDeposits.push(obligationDeposits[i]);
      }
    }

    if (depositIndex === -1) {
      // If the reserve is not in the obligation, we add it
      const firstBorrowIndexAvailable = obligationDeposits.findIndex(
        (deposit) => deposit.depositReserve === DEFAULT_PUBLIC_KEY
      );

      if (firstBorrowIndexAvailable === -1) {
        throw new Error('No available borrows to modify');
      }

      const coll: ObligationCollateralFields = { ...obligationDeposits[firstBorrowIndexAvailable] };
      const exchangeRate = collateralExchangeRates.get(depositChange.reserveAddress)!;
      const changeInCollateral = new Decimal(depositChange.amountChangeLamports).mul(exchangeRate).toFixed(0);
      coll.depositedAmount = new BN(positiveOrZero(new Decimal(changeInCollateral)).toString());
      coll.depositReserve = depositChange.reserveAddress;

      newDeposits[firstBorrowIndexAvailable] = new ObligationCollateral(coll);
    }

    return newDeposits;
  }

  simulateBorrowChange(
    obligationBorrows: ObligationLiquidity[],
    borrowChange: PositionChange,
    cumulativeBorrowRate: Decimal
  ): ObligationLiquidity[] {
    const newBorrows: ObligationLiquidity[] = [];
    const borrowIndex = obligationBorrows.findIndex((borrow) => borrow.borrowReserve === borrowChange.reserveAddress);

    // Always copy the previous borrows and modify the changeReserve one if it exists
    for (let i = 0; i < obligationBorrows.length; i++) {
      if (obligationBorrows[i].borrowReserve === borrowChange.reserveAddress) {
        const borrow: ObligationLiquidityFields = { ...obligationBorrows[borrowIndex] };
        const newBorrowedAmount: Decimal = new Fraction(borrow.borrowedAmountSf)
          .toDecimal()
          .add(borrowChange.amountChangeLamports);
        const newBorrowedAmountSf = Fraction.fromDecimal(positiveOrZero(newBorrowedAmount)).getValue();
        borrow.borrowedAmountSf = newBorrowedAmountSf;

        newBorrows.push(new ObligationLiquidity(borrow));
      } else {
        newBorrows.push(obligationBorrows[i]);
      }
    }

    if (borrowIndex === -1) {
      // If the reserve is not in the obligation, we add it
      const firstBorrowIndexAvailable = obligationBorrows.findIndex(
        (borrow) => borrow.borrowReserve === DEFAULT_PUBLIC_KEY
      );

      if (firstBorrowIndexAvailable === -1) {
        throw new Error('No available borrows to modify');
      }

      const borrow: ObligationLiquidityFields = { ...obligationBorrows[firstBorrowIndexAvailable] };
      borrow.borrowedAmountSf = Fraction.fromDecimal(new Decimal(borrowChange.amountChangeLamports)).getValue();
      borrow.borrowReserve = borrowChange.reserveAddress;
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
    mintCollateral?: Address;
    mintDebt?: Address;
    market: KaminoMarket;
    reserves: Map<Address, KaminoReserve>;
    slot: Slot;
    elevationGroupOverride?: number;
  }): {
    stats: ObligationStats;
    deposits: Map<Address, Position>;
    borrows: Map<Address, Position>;
  } {
    const { amountCollateral, amountDebt, action, mintCollateral, mintDebt, market } = params;
    let newStats = { ...this.refreshedStats };

    const collateralReservePk = mintCollateral ? market.getReserveByMint(mintCollateral)!.address : undefined;
    const debtReservePk = mintDebt ? market.getReserveByMint(mintDebt)!.address : undefined;

    const additionalReserves: Address[] = [];
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

    let newDeposits: Map<Address, Position> = new Map<Address, Position>([...this.deposits.entries()]);
    let newBorrows: Map<Address, Position> = new Map<Address, Position>([...this.borrows.entries()]);

    // Any action can impact both deposit stats and borrow stats if elevation group is changed
    // so we have to recalculate the entire position, not just an updated deposit or borrow
    // as both LTVs and borrow factors can change, affecting all calcs

    const debtReserveCumulativeBorrowRate = mintDebt
      ? market.getReserveByMint(mintDebt)!.getCumulativeBorrowRate()
      : undefined;

    let newObligationDeposits = this.state.deposits;
    let newObligationBorrows = this.state.borrows;

    switch (action) {
      case 'deposit': {
        if (amountCollateral === undefined || mintCollateral === undefined) {
          throw Error('amountCollateral & mintCollateral are required for deposit action');
        }
        newObligationDeposits = this.simulateDepositChange(
          this.state.deposits,
          {
            reserveAddress: collateralReservePk!,
            amountChangeLamports: amountCollateral,
          },
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
          {
            reserveAddress: debtReservePk!,
            amountChangeLamports: amountDebt,
          },
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
          {
            reserveAddress: debtReservePk!,
            amountChangeLamports: amountDebt.neg(),
          },
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
          {
            reserveAddress: collateralReservePk!,
            amountChangeLamports: amountCollateral.neg(),
          },
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
          {
            reserveAddress: collateralReservePk!,
            amountChangeLamports: amountCollateral,
          },
          collateralExchangeRates
        );

        newObligationBorrows = this.simulateBorrowChange(
          this.state.borrows,
          {
            reserveAddress: debtReservePk!,
            amountChangeLamports: amountDebt,
          },
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
          {
            reserveAddress: collateralReservePk!,
            amountChangeLamports: amountCollateral.neg(),
          },
          collateralExchangeRates
        );
        newObligationBorrows = this.simulateBorrowChange(
          this.state.borrows,
          {
            reserveAddress: debtReservePk!,
            amountChangeLamports: amountDebt.neg(),
          },
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
    withdrawReserveAddress: Address;
    depositAmountLamports: Decimal;
    depositReserveAddress: Address;
    newElevationGroup: number;
    market: KaminoMarket;
    slot: Slot;
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
      {
        reserveAddress: withdrawReserveAddress,
        amountChangeLamports: withdrawAmountLamports.neg(),
      },
      collateralExchangeRates
    );
    newObligationDeposits = this.simulateDepositChange(
      newObligationDeposits,
      {
        reserveAddress: depositReserveAddress,
        amountChangeLamports: depositAmountLamports,
      },
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
    currentSlot: Slot
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
    collateralExchangeRates: Map<Address, Decimal>,
    cumulativeBorrowRates: Map<Address, Decimal> | null,
    getOraclePx: (reserve: KaminoReserve) => Decimal = KaminoObligation.getOraclePx
  ): {
    borrows: Map<Address, Position>;
    deposits: Map<Address, Position>;
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
    collateralExchangeRates: Map<Address, Decimal> | null,
    elevationGroup: number,
    getPx: (reserve: KaminoReserve) => Decimal
  ): DepositStats {
    let userTotalDeposit = new Decimal(0);
    let userTotalCollateralDeposit = new Decimal(0);
    let userTotalLiquidatableDeposit = new Decimal(0);
    let borrowLimit = new Decimal(0);
    let borrowLiquidationLimit = new Decimal(0);

    const deposits = new Map<Address, Position>();
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
        mintFactor: reserve.getMintFactor(),
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
    cumulativeBorrowRates: Map<Address, Decimal> | null,
    elevationGroup: number,
    getPx: (reserve: KaminoReserve) => Decimal
  ): BorrowStats {
    let userTotalBorrow = new Decimal(0);
    let userTotalBorrowBorrowFactorAdjusted = new Decimal(0);
    let positions = 0;

    const borrows = new Map<Address, Position>();
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
        mintFactor: reserve.getMintFactor(),
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

  getMaxLoanLtvAndLiquidationLtvGivenElevationGroup(
    market: KaminoMarket,
    elevationGroup: number,
    slot: Slot
  ): { maxLtv: Decimal; liquidationLtv: Decimal } {
    const getOraclePx = (reserve: KaminoReserve) => reserve.getOracleMarketPrice();
    const { collateralExchangeRates } = KaminoObligation.getRatesForObligation(market, this.state, slot);

    const { borrowLimit, userTotalCollateralDeposit, borrowLiquidationLimit } =
      KaminoObligation.calculateObligationDeposits(
        market,
        this.state.deposits,
        collateralExchangeRates,
        elevationGroup,
        getOraclePx
      );

    if (userTotalCollateralDeposit.eq(0)) {
      return { maxLtv: new Decimal(0), liquidationLtv: new Decimal(0) };
    }

    return {
      maxLtv: borrowLimit.div(userTotalCollateralDeposit),
      liquidationLtv: borrowLiquidationLimit.div(userTotalCollateralDeposit),
    };
  }

  /**
   * Creates a new KaminoObligation with simulated position changes applied.
   * This allows you to model what the obligation would look like with deposits/borrows
   * without actually executing those transactions.
   *
   * @param market - The KaminoMarket instance
   * @param slot - The slot number for rate calculations
   * @param depositChanges - Optional array of deposit changes to apply
   * @param borrowChanges - Optional array of borrow changes to apply
   * @returns A new KaminoObligation instance with the changes applied
   */
  withPositionChanges(
    market: KaminoMarket,
    slot: Slot,
    depositChanges?: PositionChange[],
    borrowChanges?: PositionChange[]
  ): KaminoObligation {
    const reservesToRefresh: Address[] = [];

    if (depositChanges) {
      reservesToRefresh.push(...depositChanges.map((change) => change.reserveAddress));
    }
    if (borrowChanges) {
      reservesToRefresh.push(...borrowChanges.map((change) => change.reserveAddress));
    }

    const { collateralExchangeRates, cumulativeBorrowRates } = KaminoObligation.getRatesForObligation(
      market,
      this.state,
      slot,
      reservesToRefresh
    );

    let newDeposits: ObligationCollateral[] = this.state.deposits;
    if (depositChanges) {
      for (const depositChange of depositChanges) {
        newDeposits = this.simulateDepositChange(newDeposits, depositChange, collateralExchangeRates);
      }
    }

    let newBorrows: ObligationLiquidity[] = this.state.borrows;
    if (borrowChanges) {
      for (const borrowChange of borrowChanges) {
        const reserve = market.getReserveByAddress(borrowChange.reserveAddress);
        if (!reserve) {
          throw new Error(`Reserve not found: ${borrowChange.reserveAddress}`);
        }
        newBorrows = this.simulateBorrowChange(newBorrows, borrowChange, reserve.getCumulativeBorrowRate());
      }
    }

    // Create a deep copy of the obligation state and override deposits/borrows
    const newObligationState = new Obligation({
      ...this.state,
      deposits: newDeposits,
      borrows: newBorrows,
    });

    return new KaminoObligation(
      market,
      this.obligationAddress,
      newObligationState,
      collateralExchangeRates,
      cumulativeBorrowRates
    );
  }

  /*
    How much of a given token can a user borrow extra given an elevation group,
    regardless of caps and liquidity or assuming infinite liquidity and infinite caps,
    until it hits max LTV.

    This is purely a function about the borrow power of an obligation,
    not a reserve-specific, caps-specific, liquidity-specific function.

    * @param market - The KaminoMarket instance.
    * @param liquidityMint - The liquidity mint Address.
    * @param slot - The slot number.
    * @param elevationGroup - The elevation group number (default: this.state.elevationGroup).
    * @returns The borrow power as a Decimal.
    * @throws Error if the reserve is not found.
  */
  getBorrowPower(
    market: KaminoMarket,
    liquidityMint: Address,
    slot: Slot,
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
    * @param liquidityMint - The liquidity mint Address.
    * @param slot - The slot number.
    * @param elevationGroup - The elevation group number (default: this.state.elevationGroup).
    * @returns The maximum borrow amount as a Decimal.
    * @throws Error if the reserve is not found.
  */
  getMaxBorrowAmountV2(
    market: KaminoMarket,
    liquidityMint: Address,
    slot: Slot,
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
    Same as getMaxBorrowAmountV2 but assumes a deposit is made first, calculating
    the new borrow power after the deposit, without overriding the obligation itself.

    * @param market - The KaminoMarket instance.
    * @param liquidityMint - The liquidity mint Address.
    * @param slot - The slot number.
    * @param elevationGroup - The elevation group number (default: this.state.elevationGroup).
    * @returns The maximum borrow amount as a Decimal.
    * @throws Error if the reserve is not found.
  */
  getMaxBorrowAmountV2WithDeposit(
    market: KaminoMarket,
    liquidityMint: Address,
    slot: Slot,
    elevationGroup: number = this.state.elevationGroup,
    depositAmountLamports: Decimal,
    depositReserveAddress: Address
  ): Decimal {
    const depositChanges = [
      {
        reserveAddress: depositReserveAddress,
        amountChangeLamports: depositAmountLamports,
      },
    ];
    const obligationWithDeposit = this.withPositionChanges(market, slot, depositChanges);

    return obligationWithDeposit.getMaxBorrowAmountV2(market, liquidityMint, slot, elevationGroup);
  }

  /*
    Returns true if the loan is eligible for the elevation group, including for the default one.
    * @param market - The KaminoMarket object representing the market.
    * @param slot - The slot number of the loan.
    * @param elevationGroup - The elevation group number.
    * @returns A boolean indicating whether the loan is eligible for elevation.
  */
  isLoanEligibleForElevationGroup(market: KaminoMarket, slot: Slot, elevationGroup: number): boolean {
    // - isLoanEligibleForEmode(obligation, emode: 0 | number): <boolean, ErrorMessage>
    //    - essentially checks if a loan can be migrated or not
    //    - [x] due to collateral / debt reserves combination
    //    - [x] due to LTV, etc

    const reserveDeposits: Address[] = Array.from(this.deposits.keys());
    const reserveBorrows: Address[] = Array.from(this.borrows.keys());

    if (reserveBorrows.length > 1) {
      return false;
    }

    if (elevationGroup > 0) {
      // Elevation group 0 doesn't need to do reserve checks, as all are included by default
      const allElevationGroups = market.getMarketElevationGroupDescriptions();
      const elevationGroupDescription = allElevationGroups[elevationGroup - 1];

      // Has to be a subset
      const allCollsIncluded = reserveDeposits.every((reserve) =>
        elevationGroupDescription.collateralReserves.has(reserve)
      );
      const allDebtsIncluded =
        reserveBorrows.length === 0 ||
        (reserveBorrows.length === 1 && elevationGroupDescription.debtReserve === reserveBorrows[0]);

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
    liquidityMint: Address,
    slot: Slot,
    requestElevationGroup: boolean
  ): Decimal {
    const reserve = market.getReserveByMint(liquidityMint);

    if (!reserve) {
      throw new Error('Reserve not found');
    }

    const groups = market.state.elevationGroups;
    const emodeGroupsDebtReserve = reserve.state.config.elevationGroups;
    let commonElevationGroups = [...emodeGroupsDebtReserve].filter(
      (item) => item !== 0 && groups[item - 1].debtReserve === reserve.address
    );

    for (const [_, value] of this.deposits.entries()) {
      const depositReserve = market.getExistingReserveByAddress(value.reserveAddress);

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

  getMaxWithdrawAmount(market: KaminoMarket, tokenMint: Address, slot: Slot): Decimal {
    const depositReserve = market.getReserveByMint(tokenMint);

    if (!depositReserve) {
      throw new Error('Reserve not found');
    }

    const reserveAvailableLiquidity = depositReserve.getLiquidityAvailableAmount();
    const withdrawalCapRemained = depositReserve
      .getDepositWithdrawalCapCapacity()
      .sub(depositReserve.getDepositWithdrawalCapCurrent(slot));

    const reserveWithdrawalLimit = Decimal.min(withdrawalCapRemained, reserveAvailableLiquidity);

    const userDepositPosition = this.getDepositByReserve(depositReserve.address);

    if (!userDepositPosition) {
      throw new Error('Deposit reserve not found');
    }

    const userDepositPositionAmount = userDepositPosition.amount;

    if (this.refreshedStats.userTotalBorrowBorrowFactorAdjusted.equals(new Decimal(0))) {
      return Decimal.max(0, Decimal.min(userDepositPositionAmount, reserveWithdrawalLimit));
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

    return Decimal.max(0, Decimal.min(userDepositPositionAmount, maxWithdrawAmount, reserveWithdrawalLimit));
  }

  /**
   * Same as getMaxWithdrawAmount but assumes a repay is made first, calculating
   * the new withdraw power after the repay, without overriding the obligation itself.
   *
   * @param market - The KaminoMarket instance.
   * @param tokenMint - The liquidity mint Address.
   * @param slot - The slot number.
   * @param repayAmountLamports - The amount to repay in lamports (use U64_MAX for full repay).
   * @param repayReserveAddress - The reserve address of the borrow being repaid.
   * @returns The maximum withdraw amount as a Decimal.
   * @throws Error if the reserve is not found.
   */
  getMaxWithdrawAmountWithRepay(
    market: KaminoMarket,
    tokenMint: Address,
    slot: Slot,
    repayAmountLamports: Decimal,
    repayReserveAddress: Address
  ): Decimal {
    const repayReserve = market.getReserveByAddress(repayReserveAddress);
    if (!repayReserve) {
      throw new Error('Reserve not found');
    }

    const repayAmount = repayAmountLamports.equals(U64_MAX)
      ? this.getBorrowAmountByReserve(repayReserve)
      : repayAmountLamports;
    const borrowChanges = [
      {
        reserveAddress: repayReserveAddress,
        amountChangeLamports: repayAmount.neg(), // as it's a repay
      },
    ];
    const obligationWithRepay = this.withPositionChanges(market, slot, undefined, borrowChanges);

    return obligationWithRepay.getMaxWithdrawAmount(market, tokenMint, slot);
  }

  getObligationLiquidityByReserve(reserveAddress: Address): ObligationLiquidity {
    const obligationLiquidity = this.state.borrows.find((borrow) => borrow.borrowReserve === reserveAddress);

    if (!obligationLiquidity) {
      throw new Error(`Obligation liquidity not found given reserve ${reserveAddress}`);
    }

    return obligationLiquidity;
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
    return bfToDecimal(borrow.cumulativeBorrowRateBsf);
  }

  public static getRatesForObligation(
    kaminoMarket: KaminoMarket,
    obligation: Obligation,
    slot: Slot,
    additionalReserves: Address[] = []
  ): {
    collateralExchangeRates: Map<Address, Decimal>;
    cumulativeBorrowRates: Map<Address, Decimal>;
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
    collateralExchangeRates: Map<Address, Decimal>,
    cumulativeBorrowRates: Map<Address, Decimal>,
    slot: Slot
  ): void {
    KaminoObligation.addCollateralExchangeRatesForObligation(kaminoMarket, collateralExchangeRates, obligation, slot);
    KaminoObligation.addCumulativeBorrowRatesForObligation(kaminoMarket, cumulativeBorrowRates, obligation, slot);
  }

  static getCollateralExchangeRatesForObligation(
    kaminoMarket: KaminoMarket,
    obligation: Obligation,
    slot: Slot,
    additionalReserves: Address[]
  ): Map<Address, Decimal> {
    const collateralExchangeRates = new Map<Address, Decimal>();

    // Create a set of all reserves coming from deposit plus additional reserves
    const allReserves = new Set<Address>();
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
    collateralExchangeRates: Map<Address, Decimal>,
    obligation: Obligation,
    slot: Slot
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
    slot: Slot,
    additionalReserves: Address[] = []
  ): Map<Address, Decimal> {
    const allReserves = new Set<Address>();
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

    const cumulativeBorrowRates = new Map<Address, Decimal>();

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
    cumulativeBorrowRates: Map<Address, Decimal>,
    obligation: Obligation,
    slot: Slot
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

// Create a function that checks if an obligation is of type obligation or obligationType
export function isKaminoObligation(obligation: KaminoObligation | ObligationType): obligation is KaminoObligation {
  return 'obligationAddress' in obligation;
}
