import {
  Address,
  address,
  Base58EncodedBytes,
  Commitment,
  GetAccountInfoApi,
  GetBalanceApi,
  getBase58Decoder,
  GetMinimumBalanceForRentExemptionApi,
  GetMultipleAccountsApi,
  GetProgramAccountsApi,
  GetProgramAccountsDatasizeFilter,
  GetProgramAccountsMemcmpFilter,
  GetSlotApi,
  GetTokenAccountBalanceApi,
  Rpc,
  Slot,
} from '@solana/kit';
import { KaminoObligation } from './obligation';
import { KaminoReserve, KaminoReserveRpcApi, ReserveWithAddress } from './reserve';
import { LendingMarket, Obligation, ReferrerTokenState, Reserve, UserMetadata } from '../@codegen/klend/accounts';
import {
  AllOracleAccounts,
  BORROWS_LIMIT,
  cacheOrGetPythPrices,
  cacheOrGetScopePrice,
  cacheOrGetSwitchboardPrice,
  CandidatePrice,
  DEFAULT_PUBLIC_KEY,
  DEPOSITS_LIMIT,
  getAllOracleAccounts,
  getProgramAccounts,
  getTokenOracleData,
  isNotNullPubkey,
  lendingMarketAuthPda,
  LendingObligation,
  LeverageObligation,
  MultiplyObligation,
  ObligationType,
  PythPrices,
  referrerTokenStatePda,
  setOrAppend,
  userMetadataPda,
  VanillaObligation,
} from '../utils';
import BN from 'bn.js';
import Decimal from 'decimal.js';
import { FarmState } from '@kamino-finance/farms-sdk';
import { PROGRAM_ID } from '../@codegen/klend/programId';
import { Scope, U16_MAX } from '@kamino-finance/scope-sdk';
import { OraclePrices } from '@kamino-finance/scope-sdk/dist/@codegen/scope/accounts/OraclePrices';
import { Fraction } from './fraction';
import { batchFetch, chunks, KaminoPrices, MintToPriceMap } from '@kamino-finance/kliquidity-sdk';
import { parseTokenSymbol, parseZeroPaddedUtf8 } from './utils';
import { ObligationZP } from '../@codegen/klend/zero_padding';
import { checkDefined } from '../utils/validations';
import { Buffer } from 'buffer';
import { ReserveStatus } from '../@codegen/klend/types';

export type KaminoMarketRpcApi = GetAccountInfoApi &
  GetMultipleAccountsApi &
  GetProgramAccountsApi &
  GetSlotApi &
  GetMinimumBalanceForRentExemptionApi &
  GetTokenAccountBalanceApi &
  GetBalanceApi;

const base58Decoder = getBase58Decoder();

export interface ReserveRewardInfo {
  rewardsPerSecond: Decimal; // not lamport
  rewardsRemaining: Decimal; // not lamport
  rewardApr: Decimal;
  rewardMint: Address;
  totalInvestmentUsd: Decimal;
  rewardPrice: number;
}

export class KaminoMarket {
  private readonly rpc: Rpc<KaminoMarketRpcApi>;

  readonly address: Address;

  state: LendingMarket;

  reserves: Map<Address, KaminoReserve>;

  reservesActive: Map<Address, KaminoReserve>;

  readonly programId: Address;

  private readonly recentSlotDurationMs: number;

  // scope feeds used by all market reserves
  readonly scopeFeeds: Set<Address>;

  private constructor(
    rpc: Rpc<KaminoMarketRpcApi>,
    state: LendingMarket,
    marketAddress: Address,
    reserves: Map<Address, KaminoReserve>,
    recentSlotDurationMs: number,
    programId: Address = PROGRAM_ID
  ) {
    if (recentSlotDurationMs <= 0) {
      throw new Error('Recent slot duration cannot be 0');
    }

    this.address = marketAddress;
    this.rpc = rpc;
    this.state = state;
    this.reserves = reserves;
    this.reservesActive = getReservesActive(this.reserves);
    this.programId = programId;
    this.recentSlotDurationMs = recentSlotDurationMs;
    this.scopeFeeds = new Set(
      Array.from(this.reserves.values())
        .filter((r) => isNotNullPubkey(r.state.config.tokenInfo.scopeConfiguration.priceFeed))
        .map((r) => r.state.config.tokenInfo.scopeConfiguration.priceFeed)
    );
  }

  /**
   * Load a new market with all of its associated reserves
   * @param rpc
   * @param marketAddress
   * @param recentSlotDurationMs
   * @param programId
   * @param withReserves
   */
  static async load(
    rpc: Rpc<KaminoMarketRpcApi>,
    marketAddress: Address,
    recentSlotDurationMs: number,
    programId: Address = PROGRAM_ID,
    withReserves: boolean = true
  ) {
    const market = await LendingMarket.fetch(rpc, marketAddress, programId);

    if (market === null) {
      return null;
    }

    const reserves = withReserves
      ? await getReservesForMarket(marketAddress, rpc, programId, recentSlotDurationMs)
      : new Map<Address, KaminoReserve>();

    return new KaminoMarket(rpc, market, marketAddress, reserves, recentSlotDurationMs, programId);
  }

  static loadWithReserves(
    connection: Rpc<KaminoMarketRpcApi>,
    market: LendingMarket,
    reserves: Map<Address, KaminoReserve>,
    marketAddress: Address,
    recentSlotDurationMs: number,
    programId: Address = PROGRAM_ID
  ) {
    return new KaminoMarket(connection, market, marketAddress, reserves, recentSlotDurationMs, programId);
  }

  static async loadMultiple(
    connection: Rpc<KaminoMarketRpcApi>,
    markets: Address[],
    recentSlotDurationMs: number,
    programId: Address = PROGRAM_ID,
    withReserves: boolean = true,
    oracleAccounts?: AllOracleAccounts
  ) {
    const marketStates = await batchFetch(markets, (market) =>
      LendingMarket.fetchMultiple(connection, market, programId)
    );
    const kaminoMarkets = new Map<Address, KaminoMarket>();
    for (let i = 0; i < markets.length; i++) {
      const market = marketStates[i];
      const marketAddress = markets[i];
      if (market === null) {
        throw Error(`Could not fetch LendingMarket account state for market ${marketAddress}`);
      }

      const marketReserves = withReserves
        ? await getReservesForMarket(marketAddress, connection, programId, recentSlotDurationMs, oracleAccounts)
        : new Map<Address, KaminoReserve>();

      kaminoMarkets.set(
        marketAddress,
        new KaminoMarket(connection, market, marketAddress, marketReserves, recentSlotDurationMs, programId)
      );
    }
    return kaminoMarkets;
  }

  static async loadMultipleWithReserves(
    connection: Rpc<KaminoMarketRpcApi>,
    markets: Address[],
    reserves: Map<Address, Map<Address, KaminoReserve>>,
    recentSlotDurationMs: number,
    programId: Address = PROGRAM_ID
  ) {
    const marketStates = await batchFetch(markets, (market) =>
      LendingMarket.fetchMultiple(connection, market, programId)
    );
    const kaminoMarkets = new Map<Address, KaminoMarket>();
    for (let i = 0; i < markets.length; i++) {
      const market = marketStates[i];
      const marketAddress = markets[i];
      if (market === null) {
        throw Error(`Could not fetch LendingMarket account state for market ${marketAddress}`);
      }
      const marketReserves = reserves.get(marketAddress);
      if (!marketReserves) {
        throw Error(
          `Could not get reserves for market ${marketAddress} from the reserves map argument supplied to this method`
        );
      }
      kaminoMarkets.set(
        marketAddress,
        new KaminoMarket(connection, market, marketAddress, marketReserves, recentSlotDurationMs, programId)
      );
    }
    return kaminoMarkets;
  }

  async reload(): Promise<void> {
    const market = await LendingMarket.fetch(this.rpc, this.getAddress(), this.programId);
    if (market === null) {
      return;
    }

    this.state = market;
    this.reserves = await getReservesForMarket(this.getAddress(), this.rpc, this.programId, this.recentSlotDurationMs);
    this.reservesActive = getReservesActive(this.reserves);
  }

  async reloadSingleReserve(reservePk: Address, reserveData?: Reserve): Promise<void> {
    const reserve = await getSingleReserve(reservePk, this.rpc, this.recentSlotDurationMs, reserveData);
    this.reserves.set(reservePk, reserve);
    this.reservesActive.set(reservePk, reserve);
  }

  /**
   * Get the address of this market
   * @return market address public key
   */
  getAddress(): Address {
    return this.address;
  }

  /**
   * Get a list of reserves for this market
   */
  getReserves(): Array<KaminoReserve> {
    return [...this.reserves.values()];
  }

  getElevationGroup(elevationGroup: number) {
    return this.state.elevationGroups[elevationGroup - 1];
  }

  /**
   * Returns this market's elevation group of the given ID, or `null` for the default group `0`, or throws an error
   * (including the given description) if the requested group does not exist.
   */
  getExistingElevationGroup(
    elevationGroupId: number,
    description: string = 'Requested'
  ): ElevationGroupDescription | null {
    if (elevationGroupId === 0) {
      return null;
    }
    return checkDefined(
      this.getMarketElevationGroupDescriptions().find((candidate) => candidate.elevationGroup === elevationGroupId),
      `${description} elevation group ${elevationGroupId} not found`
    );
  }

  getMinNetValueObligation(): Decimal {
    return new Fraction(this.state.minNetValueInObligationSf).toDecimal();
  }

  /**
   * Get the authority PDA of this market
   * @return market authority public key
   */
  async getLendingMarketAuthority(): Promise<Address> {
    return (await lendingMarketAuthPda(this.getAddress(), this.programId))[0];
  }

  getName(): string {
    return parseZeroPaddedUtf8(this.state.name);
  }

  async getObligationDepositByWallet(owner: Address, mint: Address, obligationType: ObligationType): Promise<Decimal> {
    const obligation = await this.getObligationByWallet(owner, obligationType);
    return obligation?.getDepositByMint(mint)?.amount ?? new Decimal(0);
  }

  async getObligationBorrowByWallet(owner: Address, mint: Address, obligationType: ObligationType): Promise<Decimal> {
    const obligation = await this.getObligationByWallet(owner, obligationType);
    return obligation?.getBorrowByMint(mint)?.amount ?? new Decimal(0);
  }

  getTotalDepositTVL(): Decimal {
    let tvl = new Decimal(0);
    for (const reserve of this.reserves.values()) {
      tvl = tvl.add(reserve.getDepositTvl());
    }
    return tvl;
  }

  getTotalBorrowTVL(): Decimal {
    let tvl = new Decimal(0);
    for (const reserve of this.reserves.values()) {
      tvl = tvl.add(reserve.getBorrowTvl());
    }
    return tvl;
  }

  getMaxLeverageForPair(collTokenMint: Address, debtTokenMint: Address): number {
    const { maxLtv: maxCollateralLtv, borrowFactor } = this.getMaxAndLiquidationLtvAndBorrowFactorForPair(
      collTokenMint,
      debtTokenMint
    );

    const maxLeverage =
      // const ltv = (coll * ltv_factor) / (debt * borrow_factor);
      1 / (1 - (maxCollateralLtv * 100) / (borrowFactor * 100));

    return maxLeverage;
  }

  getCommonElevationGroupsForPair(collReserve: KaminoReserve, debtReserve: KaminoReserve): number[] {
    const groupsColl = new Set(collReserve.state.config.elevationGroups);
    const groupsDebt = new Set(debtReserve.state.config.elevationGroups);

    return [...groupsColl].filter(
      (item) =>
        groupsDebt.has(item) &&
        item !== 0 &&
        this.state.elevationGroups[item - 1].allowNewLoans !== 0 &&
        collReserve.state.config.borrowLimitAgainstThisCollateralInElevationGroup[item - 1].gt(new BN(0)) &&
        this.state.elevationGroups[item - 1].debtReserve === debtReserve.address
    );
  }

  getMaxAndLiquidationLtvAndBorrowFactorForPair(
    collTokenMint: Address,
    debtTokenMint: Address
  ): { maxLtv: number; liquidationLtv: number; borrowFactor: number } {
    const collReserve: KaminoReserve | undefined = this.getReserveByMint(collTokenMint);
    const debtReserve: KaminoReserve | undefined = this.getReserveByMint(debtTokenMint);

    if (!collReserve || !debtReserve) {
      throw Error('Could not find one of the reserves.');
    }

    const commonElevationGroups = this.getCommonElevationGroupsForPair(collReserve, debtReserve);

    // Ltv factor for coll token
    const maxCollateralLtv =
      commonElevationGroups.length === 0
        ? collReserve.state.config.loanToValuePct
        : this.state.elevationGroups
            .filter((e) => commonElevationGroups.includes(e.id))
            .reduce((acc, elem) => Math.max(acc, elem.ltvPct), 0);

    const liquidationLtv =
      commonElevationGroups.length === 0
        ? collReserve.state.config.liquidationThresholdPct
        : this.state.elevationGroups
            .filter((e) => commonElevationGroups.includes(e.id))
            .reduce((acc, elem) => Math.max(acc, elem.liquidationThresholdPct), 0);

    const borrowFactor =
      commonElevationGroups.length === 0 ? debtReserve?.state.config.borrowFactorPct.toNumber() / 100 : 1;

    return { maxLtv: maxCollateralLtv / 100, liquidationLtv: liquidationLtv / 100, borrowFactor };
  }

  async getTotalProductTvl(
    productType: ObligationType
  ): Promise<{ tvl: Decimal; borrows: Decimal; deposits: Decimal; avgLeverage: Decimal }> {
    let obligations = (await this.getAllObligationsForMarket(productType.toArgs().tag)).filter(
      (obligation) =>
        obligation.refreshedStats.userTotalBorrow.gt(0) || obligation.refreshedStats.userTotalDeposit.gt(0)
    );

    switch (productType.toArgs().tag) {
      case VanillaObligation.tag: {
        break;
      }
      case LendingObligation.tag: {
        const mint = productType.toArgs().seed1;
        obligations = obligations.filter((obligation) => obligation.getDepositByMint(mint) !== undefined);
        break;
      }
      case MultiplyObligation.tag:
      case LeverageObligation.tag: {
        const collMint = productType.toArgs().seed1;
        const debtMint = productType.toArgs().seed2;
        obligations = obligations.filter(
          (obligation) =>
            obligation.getDepositByMint(collMint) !== undefined && obligation.getBorrowByMint(debtMint) !== undefined
        );
        break;
      }
      default:
        throw new Error('Invalid obligation type');
    }

    const deposits = obligations.reduce(
      (acc, obligation) => acc.plus(obligation.refreshedStats.userTotalDeposit),
      new Decimal(0)
    );
    const borrows = obligations.reduce(
      (acc, obligation) => acc.plus(obligation.refreshedStats.userTotalBorrow),
      new Decimal(0)
    );
    const avgLeverage = obligations.reduce(
      (acc, obligations) => acc.plus(obligations.refreshedStats.leverage),
      new Decimal(0)
    );
    return { tvl: deposits.sub(borrows), deposits, borrows, avgLeverage: avgLeverage.div(obligations.length) };
  }

  /**
   *
   * @returns Number of active obligations in the market
   */
  async getNumberOfObligations() {
    return (await this.getAllObligationsForMarket())
      .filter(
        (obligation) =>
          obligation.refreshedStats.userTotalBorrow.gt(0) || obligation.refreshedStats.userTotalDeposit.gt(0)
      )
      .reduce((acc, _obligation) => acc + 1, 0);
  }

  async getObligationByWallet(Address: Address, obligationType: ObligationType): Promise<KaminoObligation | null> {
    const { address } = this;
    if (!address) {
      throw Error('Market must be initialized to call initialize.');
    }
    const obligationAddress = await obligationType.toPda(this.getAddress(), Address);
    return KaminoObligation.load(this, obligationAddress);
  }

  /**
   * @returns The max borrowable amount for leverage positions
   */
  getMaxLeverageBorrowableAmount(
    collReserve: KaminoReserve,
    debtReserve: KaminoReserve,
    slot: Slot,
    requestElevationGroup: boolean,
    obligation?: KaminoObligation
  ): Decimal {
    return obligation
      ? obligation.getMaxBorrowAmount(this, debtReserve.getLiquidityMint(), slot, requestElevationGroup)
      : debtReserve.getMaxBorrowAmountWithCollReserve(this, collReserve, slot);
  }

  async loadReserves(oracleAccounts?: AllOracleAccounts) {
    const addresses = [...this.reserves.keys()];
    const reserveAccounts = await this.rpc
      .getMultipleAccounts(addresses, { commitment: 'processed', encoding: 'base64' })
      .send();
    const deserializedReserves: ReserveWithAddress[] = reserveAccounts.value.map((reserve, i) => {
      if (reserve === null) {
        // maybe reuse old here
        throw new Error(`Reserve account ${addresses[i]} was not found`);
      }
      const reserveAccount = Reserve.decode(Buffer.from(reserve.data[0], 'base64'));
      if (!reserveAccount) {
        throw Error(`Could not parse reserve ${addresses[i]}`);
      }
      return {
        address: addresses[i],
        state: reserveAccount,
      };
    });
    const reservesAndOracles = await getTokenOracleData(this.getRpc(), deserializedReserves, oracleAccounts);
    const kaminoReserves = new Map<Address, KaminoReserve>();
    reservesAndOracles.forEach(([reserve, oracle], index) => {
      if (!oracle) {
        throw Error(
          `Could not find oracle for ${parseTokenSymbol(reserve.config.tokenInfo.name)} (${
            addresses[index]
          }) reserve in market ${reserve.lendingMarket}`
        );
      }
      const kaminoReserve = KaminoReserve.initialize(
        addresses[index],
        reserve,
        oracle,
        this.rpc,
        this.recentSlotDurationMs
      );
      kaminoReserves.set(kaminoReserve.address, kaminoReserve);
    });
    this.reserves = kaminoReserves;
    this.reservesActive = getReservesActive(this.reserves);
  }

  async refreshAll() {
    const promises = [this.getReserves().every((reserve) => reserve.stats) ? this.loadReserves() : null].filter(
      (x) => x
    );

    await Promise.all(promises);

    this.reservesActive = getReservesActive(this.reserves);
  }

  getReserveByAddress(address: Address) {
    return this.reserves.get(address);
  }

  /**
   * Returns this market's reserve of the given address, or throws an error (including the given description) if such
   * reserve does not exist.
   */
  getExistingReserveByAddress(address: Address, description: string = 'Requested'): KaminoReserve {
    return checkDefined(this.getReserveByAddress(address), `${description} reserve ${address} not found`);
  }

  getReserveByMint(address: Address): KaminoReserve | undefined {
    for (const reserve of this.reserves.values()) {
      if (reserve.getLiquidityMint() === address) {
        return reserve;
      }
    }
    return undefined;
  }

  /**
   * Returns this market's reserve of the given mint address, or throws an error (including the given description) if
   * such reserve does not exist.
   */
  getExistingReserveByMint(address: Address, description: string = 'Requested'): KaminoReserve {
    return checkDefined(this.getReserveByMint(address), `${description} reserve with mint ${address} not found`);
  }

  getReserveBySymbol(symbol: string) {
    for (const reserve of this.reserves.values()) {
      if (reserve.symbol === symbol) {
        return reserve;
      }
    }
    return undefined;
  }

  /**
   * Returns this market's reserve of the given symbol, or throws an error (including the given description) if
   * such reserve does not exist.
   */
  getExistingReserveBySymbol(symbol: string, description: string = 'Requested'): KaminoReserve {
    return checkDefined(this.getReserveBySymbol(symbol), `${description} reserve with symbol ${symbol} not found`);
  }

  getReserveMintBySymbol(symbol: string) {
    return this.getReserveBySymbol(symbol)?.getLiquidityMint();
  }

  async getReserveFarmInfo(
    mint: Address,
    getRewardPrice: (mint: Address) => Promise<number>
  ): Promise<{ borrowingRewards: ReserveRewardInfo; depositingRewards: ReserveRewardInfo }> {
    const { address } = this;
    if (!address) {
      throw Error('Market must be initialized to call initialize.');
    }
    if (!this.getReserves().every((reserve) => reserve.stats)) {
      await this.loadReserves();
    }

    // Find the reserve
    const kaminoReserve = this.getReserveByMint(mint);

    if (!kaminoReserve) {
      throw Error(`Could not find reserve. ${mint}`);
    }

    const totalDepositAmount = lamportsToNumberDecimal(
      kaminoReserve.getLiquidityAvailableAmount(),
      kaminoReserve.stats.decimals
    );
    const totalBorrowAmount = lamportsToNumberDecimal(kaminoReserve.getBorrowedAmount(), kaminoReserve.stats.decimals);

    const collateralFarmAddress = kaminoReserve.state.farmCollateral;
    const debtFarmAddress = kaminoReserve.state.farmDebt;

    const result = {
      borrowingRewards: {
        rewardsPerSecond: new Decimal(0),
        rewardsRemaining: new Decimal(0),
        rewardApr: new Decimal(0),
        rewardMint: DEFAULT_PUBLIC_KEY,
        totalInvestmentUsd: new Decimal(0),
        rewardPrice: 0,
      },
      depositingRewards: {
        rewardsPerSecond: new Decimal(0),
        rewardsRemaining: new Decimal(0),
        rewardApr: new Decimal(0),
        rewardMint: DEFAULT_PUBLIC_KEY,
        totalInvestmentUsd: new Decimal(0),
        rewardPrice: 0,
      },
    };

    if (isNotNullPubkey(collateralFarmAddress)) {
      result.depositingRewards = await this.getRewardInfoForFarm(
        collateralFarmAddress,
        totalDepositAmount,
        getRewardPrice
      );
    }

    if (isNotNullPubkey(debtFarmAddress)) {
      result.borrowingRewards = await this.getRewardInfoForFarm(debtFarmAddress, totalBorrowAmount, getRewardPrice);
    }

    return result;
  }

  async getRewardInfoForFarm(
    farmAddress: Address,
    totalInvestmentUsd: Decimal,
    getRewardPrice: (mint: Address) => Promise<number>
  ): Promise<ReserveRewardInfo> {
    const farmState = await FarmState.fetch(this.getRpc(), farmAddress);
    if (!farmState) {
      throw Error(`Could not parse farm state. ${farmAddress}`);
    }
    const { token, rewardsAvailable, rewardScheduleCurve } = farmState.rewardInfos[0];
    // TODO: marius fix
    const rewardPerSecondLamports = rewardScheduleCurve.points[0].rewardPerTimeUnit.toNumber();
    const { mint, decimals: rewardDecimals } = token;
    const rewardPriceUsd = await getRewardPrice(mint);
    const rewardApr = this.calculateRewardAPR(
      rewardPerSecondLamports,
      rewardPriceUsd,
      totalInvestmentUsd,
      rewardDecimals.toNumber()
    );

    return {
      rewardsPerSecond: new Decimal(rewardPerSecondLamports).dividedBy(10 ** rewardDecimals.toNumber()),
      rewardsRemaining: new Decimal(rewardsAvailable.toNumber()).dividedBy(10 ** rewardDecimals.toNumber()),
      rewardApr: rewardsAvailable.toNumber() > 0 ? rewardApr : new Decimal(0),
      rewardMint: mint,
      totalInvestmentUsd,
      rewardPrice: rewardPriceUsd,
    };
  }

  calculateRewardAPR(
    rewardPerSecondLamports: number,
    rewardPriceUsd: number,
    totalInvestmentUsd: Decimal,
    rewardDecimals: number
  ): Decimal {
    const rewardsPerYear = new Decimal(rewardPerSecondLamports)
      .dividedBy(10 ** rewardDecimals)
      .times(365 * 24 * 60 * 60)
      .times(rewardPriceUsd);

    return rewardsPerYear.dividedBy(totalInvestmentUsd);
  }

  /**
   * Get all obligations for lending market, optionally filter by obligation tag
   * This function will likely require an RPC capable of returning more than the default 100k rows in a single scan
   *
   * @param tag
   */
  async getAllObligationsForMarket(tag?: number): Promise<KaminoObligation[]> {
    const filters: (GetProgramAccountsDatasizeFilter | GetProgramAccountsMemcmpFilter)[] = [
      {
        dataSize: BigInt(Obligation.layout.span + 8),
      },
      {
        memcmp: {
          offset: 32n,
          bytes: this.address.toString() as Base58EncodedBytes,
          encoding: 'base58',
        },
      },
    ];

    if (tag !== undefined) {
      filters.push({
        memcmp: {
          offset: 8n,
          bytes: base58Decoder.decode(new BN(tag).toBuffer()) as Base58EncodedBytes,
          encoding: 'base58',
        },
      });
    }

    const collateralExchangeRates = new Map<Address, Decimal>();
    const cumulativeBorrowRates = new Map<Address, Decimal>();

    const [slot, obligations] = await Promise.all([
      this.rpc.getSlot().send(),
      getProgramAccounts(
        this.rpc,
        this.programId,
        ObligationZP.layout.span + 8,
        filters,
        { offset: 0, length: ObligationZP.layout.span + 8 } // truncate the padding
      ),
    ]);

    return obligations.map((obligation) => {
      if (obligation.data === null) {
        throw new Error('Invalid account');
      }

      const obligationAccount = ObligationZP.decode(obligation.data);
      if (!obligationAccount) {
        throw Error('Could not parse obligation.');
      }

      KaminoObligation.addRatesForObligation(
        this,
        obligationAccount,
        collateralExchangeRates,
        cumulativeBorrowRates,
        slot
      );
      return new KaminoObligation(
        this,
        obligation.address,
        obligationAccount,
        collateralExchangeRates,
        cumulativeBorrowRates
      );
    });
  }

  /**
   * Get all obligations for lending market from an async generator filled with batches of 100 obligations each
   * @param tag
   * @example
   * const obligationsGenerator = market.batchGetAllObligationsForMarket();
   * for await (const obligations of obligationsGenerator) {
   *   console.log('got a batch of # obligations:', obligations.length);
   * }
   */
  async *batchGetAllObligationsForMarket(tag?: number): AsyncGenerator<KaminoObligation[], void, unknown> {
    const filters: (GetProgramAccountsDatasizeFilter | GetProgramAccountsMemcmpFilter)[] = [
      {
        dataSize: BigInt(Obligation.layout.span + 8),
      },
      {
        memcmp: {
          offset: 32n,
          bytes: this.address.toString() as Base58EncodedBytes,
          encoding: 'base58',
        },
      },
    ];

    if (tag !== undefined) {
      filters.push({
        memcmp: {
          offset: 8n,
          bytes: base58Decoder.decode(new BN(tag).toBuffer()) as Base58EncodedBytes,
          encoding: 'base58',
        },
      });
    }

    const collateralExchangeRates = new Map<Address, Decimal>();
    const cumulativeBorrowRates = new Map<Address, Decimal>();

    const [obligationPubkeys, slot] = await Promise.all([
      this.rpc
        .getProgramAccounts(this.programId, {
          filters,
          encoding: 'base64',
          dataSlice: { offset: 0, length: 0 },
        })
        .send(),
      this.rpc.getSlot().send(),
    ]);

    for (const batch of chunks(
      obligationPubkeys.map((x) => x.pubkey),
      100
    )) {
      const obligationAccounts = await this.rpc.getMultipleAccounts(batch, { encoding: 'base64' }).send();
      const obligationsBatch: KaminoObligation[] = [];
      for (let i = 0; i < obligationAccounts.value.length; i++) {
        const obligation = obligationAccounts.value[i];
        const pubkey = batch[i];
        if (obligation === null) {
          continue;
        }

        const obligationAccount = Obligation.decode(Buffer.from(obligation.data[0], 'base64'));

        if (!obligationAccount) {
          throw Error(`Could not decode obligation ${pubkey.toString()}`);
        }

        KaminoObligation.addRatesForObligation(
          this,
          obligationAccount,
          collateralExchangeRates,
          cumulativeBorrowRates,
          slot
        );
        obligationsBatch.push(
          new KaminoObligation(this, pubkey, obligationAccount, collateralExchangeRates, cumulativeBorrowRates)
        );
      }
      yield obligationsBatch;
    }
  }

  async getAllObligationsByTag(tag: number, market: Address) {
    const [slot, obligations] = await Promise.all([
      this.rpc.getSlot().send(),
      this.rpc
        .getProgramAccounts(this.programId, {
          filters: [
            {
              dataSize: BigInt(Obligation.layout.span + 8),
            },
            {
              memcmp: {
                offset: 8n,
                bytes: base58Decoder.decode(new BN(tag).toBuffer()) as Base58EncodedBytes,
                encoding: 'base58',
              },
            },
            {
              memcmp: {
                offset: 32n,
                bytes: market.toString() as Base58EncodedBytes,
                encoding: 'base58',
              },
            },
          ],
          encoding: 'base64',
        })
        .send(),
    ]);
    const collateralExchangeRates = new Map<Address, Decimal>();
    const cumulativeBorrowRates = new Map<Address, Decimal>();

    return obligations.map((obligation) => {
      if (obligation.account === null) {
        throw new Error('Invalid account');
      }
      if (obligation.account.owner !== this.programId) {
        throw new Error("account doesn't belong to this program");
      }

      const obligationAccount = Obligation.decode(Buffer.from(obligation.account.data[0], 'base64'));

      if (!obligationAccount) {
        throw Error('Could not parse obligation.');
      }

      KaminoObligation.addRatesForObligation(
        this,
        obligationAccount,
        collateralExchangeRates,
        cumulativeBorrowRates,
        slot
      );

      return new KaminoObligation(
        this,
        obligation.pubkey,
        obligationAccount,
        collateralExchangeRates,
        cumulativeBorrowRates
      );
    });
  }

  /**
   * Retrieves all obligations that have deposited into the specified reserve.
   *
   * Iterates through all possible deposit slots up to DEPOSITS_LIMIT, applying filters to fetch obligations
   * from the program accounts where the deposited reserve matches the provided address. For each matching
   * obligation, it decodes the account data, validates ownership, and constructs KaminoObligation instances
   * with calculated rates.
   *
   * @param {Address} reserve - The address of the reserve to filter deposited obligations by.
   * @returns {Promise<KaminoObligation[]>} A promise that resolves to an array of KaminoObligation objects representing all obligations that have deposited into the specified reserve.
   * @throws {Error} If an account is invalid or does not belong to this program, or if obligation parsing fails.
   */
  async getAllObligationsByDepositedReserve(reserve: Address) {
    const finalObligations: KaminoObligation[] = [];
    for (let i = 0; i < DEPOSITS_LIMIT; i++) {
      const [slot, obligations] = await Promise.all([
        this.rpc.getSlot().send(),
        this.rpc
          .getProgramAccounts(this.programId, {
            filters: [
              {
                dataSize: BigInt(Obligation.layout.span + 8),
              },
              {
                memcmp: {
                  offset: 96n + 136n * BigInt(i), // the offset for the borrows array in the obligation account
                  bytes: reserve.toString() as Base58EncodedBytes,
                  encoding: 'base58',
                },
              },
              {
                memcmp: {
                  offset: 32n,
                  bytes: this.address.toString() as Base58EncodedBytes,
                  encoding: 'base58',
                },
              },
            ],
            encoding: 'base64',
          })
          .send(),
      ]);

      const collateralExchangeRates = new Map<Address, Decimal>();
      const cumulativeBorrowRates = new Map<Address, Decimal>();

      const obligationsBatch = obligations.map((obligation) => {
        if (obligation.account === null) {
          throw new Error('Invalid account');
        }
        if (obligation.account.owner !== this.programId) {
          throw new Error("account doesn't belong to this program");
        }

        const obligationAccount = Obligation.decode(Buffer.from(obligation.account.data[0], 'base64'));

        if (!obligationAccount) {
          throw Error('Could not parse obligation.');
        }

        KaminoObligation.addRatesForObligation(
          this,
          obligationAccount,
          collateralExchangeRates,
          cumulativeBorrowRates,
          slot
        );

        return new KaminoObligation(
          this,
          obligation.pubkey,
          obligationAccount,
          collateralExchangeRates,
          cumulativeBorrowRates
        );
      });
      finalObligations.push(...obligationsBatch);
    }
    return finalObligations;
  }

  /**
   * Retrieves all obligations that have borrowed from the specified reserve.
   *
   * Iterates through all possible borrow slots up to BORROWS_LIMIT, applying filters to fetch obligations
   * from the program accounts where the borrowed reserve matches the provided address. For each matching
   * obligation, it decodes the account data, validates ownership, and constructs KaminoObligation instances
   * with calculated rates.
   *
   * @param {Address} reserve - The address of the reserve to filter borrowed obligations by.
   * @returns {Promise<KaminoObligation[]>} A promise that resolves to an array of KaminoObligation objects
   *   representing all obligations that have borrowed from the specified reserve.
   * @throws {Error} If an account is invalid or does not belong to this program, or if obligation parsing fails.
   */
  async getAllObligationsByBorrowedReserve(reserve: Address) {
    const finalObligations: KaminoObligation[] = [];
    for (let i = 0; i < BORROWS_LIMIT; i++) {
      const [slot, obligations] = await Promise.all([
        this.rpc.getSlot().send(),
        this.rpc
          .getProgramAccounts(this.programId, {
            filters: [
              {
                dataSize: BigInt(Obligation.layout.span + 8),
              },
              {
                memcmp: {
                  offset: 96n + 136n * 8n + 24n + 200n * BigInt(i), // the offset for the borrows array in the obligation account
                  bytes: reserve.toString() as Base58EncodedBytes,
                  encoding: 'base58',
                },
              },
              {
                memcmp: {
                  offset: 32n, // lendingMarket address
                  bytes: this.address.toString() as Base58EncodedBytes,
                  encoding: 'base58',
                },
              },
            ],
            encoding: 'base64',
          })
          .send(),
      ]);

      const collateralExchangeRates = new Map<Address, Decimal>();
      const cumulativeBorrowRates = new Map<Address, Decimal>();

      const obligationsBatch = obligations.map((obligation) => {
        if (obligation.account === null) {
          throw new Error('Invalid account');
        }
        if (obligation.account.owner !== this.programId) {
          throw new Error("account doesn't belong to this program");
        }

        const obligationAccount = Obligation.decode(Buffer.from(obligation.account.data[0], 'base64'));

        if (!obligationAccount) {
          throw Error('Could not parse obligation.');
        }

        KaminoObligation.addRatesForObligation(
          this,
          obligationAccount,
          collateralExchangeRates,
          cumulativeBorrowRates,
          slot
        );

        return new KaminoObligation(
          this,
          obligation.pubkey,
          obligationAccount,
          collateralExchangeRates,
          cumulativeBorrowRates
        );
      });
      finalObligations.push(...obligationsBatch);
    }
    return finalObligations;
  }

  async getAllUserObligations(
    user: Address,
    commitment: Commitment = 'processed',
    slot?: bigint
  ): Promise<KaminoObligation[]> {
    const [currentSlot, obligations] = await Promise.all([
      slot !== undefined ? Promise.resolve(slot) : this.rpc.getSlot().send(),
      this.rpc
        .getProgramAccounts(this.programId, {
          filters: [
            {
              dataSize: BigInt(Obligation.layout.span + 8),
            },
            {
              memcmp: {
                offset: 0n,
                bytes: base58Decoder.decode(Obligation.discriminator) as Base58EncodedBytes,
                encoding: 'base58',
              },
            },
            {
              memcmp: {
                offset: 64n,
                bytes: user.toString() as Base58EncodedBytes,
                encoding: 'base58',
              },
            },
            {
              memcmp: {
                offset: 32n,
                bytes: this.address.toString() as Base58EncodedBytes,
                encoding: 'base58',
              },
            },
          ],
          encoding: 'base64',
          commitment,
        })
        .send(),
    ]);

    const collateralExchangeRates = new Map<Address, Decimal>();
    const cumulativeBorrowRates = new Map<Address, Decimal>();
    return obligations.map((obligation) => {
      if (obligation.account.owner !== this.programId) {
        throw new Error("account doesn't belong to this program");
      }

      const obligationAccount = Obligation.decode(Buffer.from(obligation.account.data[0], 'base64'));

      if (!obligationAccount) {
        throw Error('Could not parse obligation.');
      }

      KaminoObligation.addRatesForObligation(
        this,
        obligationAccount,
        collateralExchangeRates,
        cumulativeBorrowRates,
        currentSlot
      );
      return new KaminoObligation(
        this,
        obligation.pubkey,
        obligationAccount,
        collateralExchangeRates,
        cumulativeBorrowRates
      );
    });
  }

  async getAllUserObligationsForReserve(user: Address, reserve: Address): Promise<KaminoObligation[]> {
    const obligationAddresses: Address[] = [];
    obligationAddresses.push(await new VanillaObligation(this.programId).toPda(this.getAddress(), user));
    const targetReserve = new Map<Address, KaminoReserve>(Array.from(this.reserves.entries())).get(reserve);
    if (!targetReserve) {
      throw Error(`Could not find reserve ${reserve}`);
    }
    for (const [key, kaminoReserve] of this.reserves) {
      if (targetReserve.address === key) {
        // skip target reserve
        continue;
      }
      obligationAddresses.push(
        await new MultiplyObligation(
          targetReserve.getLiquidityMint(),
          kaminoReserve.getLiquidityMint(),
          this.programId
        ).toPda(this.getAddress(), user)
      );
      obligationAddresses.push(
        await new MultiplyObligation(
          kaminoReserve.getLiquidityMint(),
          targetReserve.getLiquidityMint(),
          this.programId
        ).toPda(this.getAddress(), user)
      );
      obligationAddresses.push(
        await new LeverageObligation(
          targetReserve.getLiquidityMint(),
          kaminoReserve.getLiquidityMint(),
          this.programId
        ).toPda(this.getAddress(), user)
      );
      obligationAddresses.push(
        await new LeverageObligation(
          kaminoReserve.getLiquidityMint(),
          targetReserve.getLiquidityMint(),
          this.programId
        ).toPda(this.getAddress(), user)
      );
    }
    const batchSize = 100;
    const finalObligations: KaminoObligation[] = [];
    for (let batchStart = 0; batchStart < obligationAddresses.length; batchStart += batchSize) {
      const obligations = await this.getMultipleObligationsByAddress(
        obligationAddresses.slice(batchStart, batchStart + batchSize)
      );
      obligations.forEach((obligation) => {
        if (obligation !== null) {
          for (const deposits of obligation.deposits.keys()) {
            if (deposits === reserve) {
              finalObligations.push(obligation);
            }
          }
          for (const borrows of obligation.borrows.keys()) {
            if (borrows === reserve) {
              finalObligations.push(obligation);
            }
          }
        }
      });
    }

    return finalObligations;
  }

  async getUserVanillaObligation(user: Address): Promise<KaminoObligation> {
    const vanillaObligationAddress = await new VanillaObligation(this.programId).toPda(this.getAddress(), user);

    const obligation = await this.getObligationByAddress(vanillaObligationAddress);

    if (!obligation) {
      throw new Error(`Could not find vanilla obligation ${vanillaObligationAddress}`);
    }

    return obligation;
  }

  isReserveInObligation(obligation: KaminoObligation, reserve: Address): boolean {
    for (const deposits of obligation.deposits.keys()) {
      if (deposits === reserve) {
        return true;
      }
    }
    for (const borrows of obligation.borrows.keys()) {
      if (borrows === reserve) {
        return true;
      }
    }

    return false;
  }

  async getUserObligationsByTag(tag: number, user: Address): Promise<KaminoObligation[]> {
    const [currentSlot, obligations] = await Promise.all([
      this.rpc.getSlot().send(),
      this.rpc
        .getProgramAccounts(this.programId, {
          filters: [
            {
              dataSize: BigInt(Obligation.layout.span + 8),
            },
            {
              memcmp: {
                offset: 8n,
                bytes: base58Decoder.decode(new BN(tag).toBuffer()) as Base58EncodedBytes,
                encoding: 'base58',
              },
            },
            {
              memcmp: {
                offset: 32n,
                bytes: this.address.toString() as Base58EncodedBytes,
                encoding: 'base58',
              },
            },
            {
              memcmp: {
                offset: 64n,
                bytes: user.toString() as Base58EncodedBytes,
                encoding: 'base58',
              },
            },
          ],
          encoding: 'base64',
        })
        .send(),
    ]);
    const collateralExchangeRates = new Map<Address, Decimal>();
    const cumulativeBorrowRates = new Map<Address, Decimal>();
    return obligations.map((obligation) => {
      if (obligation.account.owner !== this.programId) {
        throw new Error("account doesn't belong to this program");
      }

      const obligationAccount = Obligation.decode(Buffer.from(obligation.account.data[0], 'base64'));

      if (!obligationAccount) {
        throw Error('Could not parse obligation.');
      }
      KaminoObligation.addRatesForObligation(
        this,
        obligationAccount,
        collateralExchangeRates,
        cumulativeBorrowRates,
        currentSlot
      );
      return new KaminoObligation(
        this,
        obligation.pubkey,
        obligationAccount,
        collateralExchangeRates,
        cumulativeBorrowRates
      );
    });
  }

  async getObligationByAddress(address: Address) {
    if (!this.getReserves().every((reserve) => reserve.stats)) {
      await this.loadReserves();
    }
    return KaminoObligation.load(this, address);
  }

  async getMultipleObligationsByAddress(addresses: Address[]) {
    return KaminoObligation.loadAll(this, addresses);
  }

  /**
   * Get the user metadata PDA and fetch and return the user metadata state if it exists
   * @return [address, userMetadataState] - The address of the user metadata PDA and the user metadata state, or null if it doesn't exist
   */
  async getUserMetadata(user: Address): Promise<[Address, UserMetadata | null]> {
    const [address, _bump] = await userMetadataPda(user, this.programId);

    const userMetadata = await UserMetadata.fetch(this.rpc, address, this.programId);

    return [address, userMetadata];
  }

  async getReferrerTokenStateForReserve(
    referrer: Address,
    reserve: Address
  ): Promise<[Address, ReferrerTokenState | null]> {
    const address = await referrerTokenStatePda(referrer, reserve, this.programId);

    const referrerTokenState = await ReferrerTokenState.fetch(this.rpc, address, this.programId);

    return [address, referrerTokenState];
  }

  async getAllReferrerTokenStates(referrer: Address) {
    const referrerTokenStates = await this.rpc
      .getProgramAccounts(this.programId, {
        filters: [
          {
            dataSize: BigInt(ReferrerTokenState.layout.span + 8),
          },
          {
            memcmp: {
              offset: 8n,
              bytes: referrer.toString() as Base58EncodedBytes,
              encoding: 'base58',
            },
          },
        ],
        encoding: 'base64',
      })
      .send();

    const referrerTokenStatesForMints = new Map<Address, ReferrerTokenState>();

    referrerTokenStates.forEach((referrerTokenState) => {
      if (referrerTokenState.account === null) {
        throw new Error('Invalid account');
      }
      if (referrerTokenState.account.owner !== this.programId) {
        throw new Error("account doesn't belong to this program");
      }

      const referrerTokenStateDecoded = ReferrerTokenState.decode(
        Buffer.from(referrerTokenState.account.data[0], 'base64')
      );

      if (!referrerTokenStateDecoded) {
        throw Error('Could not parse obligation.');
      }

      referrerTokenStatesForMints.set(referrerTokenStateDecoded.mint, referrerTokenStateDecoded);
    });

    return referrerTokenStatesForMints;
  }

  async getAllReferrerFeesUnclaimed(referrer: Address) {
    const referrerTokenStatesForMints = await this.getAllReferrerTokenStates(referrer);

    const referrerFeesUnclaimedForMints = new Map<Address, Decimal>();

    for (const mint of referrerTokenStatesForMints.keys()) {
      referrerFeesUnclaimedForMints.set(
        mint,
        new Fraction(referrerTokenStatesForMints.get(mint)!.amountUnclaimedSf).toDecimal()
      );
    }

    return referrerFeesUnclaimedForMints;
  }

  async getReferrerFeesUnclaimedForReserve(referrer: Address, reserve: KaminoReserve): Promise<Decimal> {
    const [, referrerTokenState] = await this.getReferrerTokenStateForReserve(referrer, reserve.address);
    return referrerTokenState ? new Fraction(referrerTokenState.amountUnclaimedSf).toDecimal() : new Decimal(0);
  }

  async getReferrerFeesCumulativeForReserve(referrer: Address, reserve: KaminoReserve): Promise<Decimal> {
    const [, referrerTokenState] = await this.getReferrerTokenStateForReserve(referrer, reserve.address);
    return referrerTokenState ? new Fraction(referrerTokenState.amountCumulativeSf).toDecimal() : new Decimal(0);
  }

  async getAllReferrerFeesCumulative(referrer: Address) {
    const referrerTokenStatesForMints = await this.getAllReferrerTokenStates(referrer);

    const referrerFeesCumulativeForMints = new Map<Address, Decimal>();

    for (const mint of referrerTokenStatesForMints.keys()) {
      referrerFeesCumulativeForMints.set(
        mint,
        new Fraction(referrerTokenStatesForMints.get(mint)!.amountUnclaimedSf).toDecimal()
      );
    }

    return referrerFeesCumulativeForMints;
  }

  getReferrerUrl(baseUrl: string, referrer: Address) {
    return `${baseUrl}${referrer.toString()}`;
  }

  getReferrerFromUrl(baseUrl: string, url: string) {
    return address(url.split(baseUrl)[1]);
  }

  /**
   * Get the underlying rpc passed when instantiating this market
   * @return rpc
   */
  getRpc(): Rpc<KaminoMarketRpcApi> {
    return this.rpc;
  }

  /**
   * Get all scope OraclePrices accounts for all market reserves
   * @param scope
   */
  async getReserveOraclePrices(scope: Scope): Promise<Map<Address, OraclePrices>> {
    const reserveOraclePrices: Map<Address, OraclePrices> = new Map();
    const oraclePrices = await scope.getMultipleOraclePrices(Array.from(this.scopeFeeds.keys()));
    const oraclePriceMap = new Map<Address, OraclePrices>();
    for (const [feed, account] of oraclePrices) {
      oraclePriceMap.set(feed, account);
    }
    for (const [reserveAddress, reserve] of this.reserves) {
      reserveOraclePrices.set(
        reserveAddress,
        oraclePriceMap.get(reserve.state.config.tokenInfo.scopeConfiguration.priceFeed)!
      );
    }
    return reserveOraclePrices;
  }

  /**
   * Get all Scope prices used by all the market reserves
   */
  async getAllScopePrices(scope: Scope, allOraclePrices: Map<Address, OraclePrices>): Promise<KaminoPrices> {
    const spot: MintToPriceMap = {};
    const twaps: MintToPriceMap = {};
    for (const reserve of this.reserves.values()) {
      const tokenMint = reserve.getLiquidityMint().toString();
      const tokenName = reserve.getTokenSymbol();
      const oracle = reserve.state.config.tokenInfo.scopeConfiguration.priceFeed;
      const chain = reserve.state.config.tokenInfo.scopeConfiguration.priceChain;
      const twapChain = reserve.state.config.tokenInfo.scopeConfiguration.twapChain.filter((x) => x > 0);
      const oraclePrices = allOraclePrices.get(oracle);
      if (oraclePrices && oracle && isNotNullPubkey(oracle) && chain && Scope.isScopeChainValid(chain)) {
        const spotPrice = await scope.getPriceFromChain(chain, oraclePrices);
        spot[tokenMint] = { price: spotPrice.price, name: tokenName };
      }
      if (oraclePrices && oracle && isNotNullPubkey(oracle) && twapChain && Scope.isScopeChainValid(twapChain)) {
        const twap = await scope.getPriceFromChain(twapChain, oraclePrices);
        twaps[tokenMint] = { price: twap.price, name: tokenName };
      }
    }
    return { spot, twap: twaps };
  }

  /**
   * Get all Scope/Pyth/Switchboard prices used by all the market reserves
   */
  async getAllPrices(oracleAccounts?: AllOracleAccounts): Promise<KlendPrices> {
    const klendPrices: KlendPrices = {
      scope: { spot: {}, twap: {} },
      pyth: { spot: {}, twap: {} },
      switchboard: { spot: {}, twap: {} },
    };
    const allOracleAccounts =
      oracleAccounts ??
      (await getAllOracleAccounts(
        this.rpc,
        this.getReserves().map((x) => x.state)
      ));
    const pythCache = new Map<Address, PythPrices>();
    const switchboardCache = new Map<Address, CandidatePrice>();
    const scopeCache = new Map<Address, OraclePrices>();

    for (const reserve of this.reserves.values()) {
      const tokenMint = reserve.getLiquidityMint().toString();
      const tokenName = reserve.getTokenSymbol();
      const scopeOracle = reserve.state.config.tokenInfo.scopeConfiguration.priceFeed;
      const spotChain = reserve.state.config.tokenInfo.scopeConfiguration.priceChain;
      const twapChain = reserve.state.config.tokenInfo.scopeConfiguration.twapChain.filter((x) => x > 0);
      const pythOracle = reserve.state.config.tokenInfo.pythConfiguration.price;
      const switchboardSpotOracle = reserve.state.config.tokenInfo.switchboardConfiguration.priceAggregator;
      const switchboardTwapOracle = reserve.state.config.tokenInfo.switchboardConfiguration.twapAggregator;

      if (isNotNullPubkey(scopeOracle)) {
        const scopePrices = {
          spot: cacheOrGetScopePrice(scopeOracle, scopeCache, allOracleAccounts, spotChain),
          twap: cacheOrGetScopePrice(scopeOracle, scopeCache, allOracleAccounts, twapChain),
        };
        this.setPriceIfExist(klendPrices.scope, scopePrices.spot, scopePrices.twap, tokenMint, tokenName);
      }
      if (isNotNullPubkey(pythOracle)) {
        const pythPrices = cacheOrGetPythPrices(pythOracle, pythCache, allOracleAccounts);
        this.setPriceIfExist(klendPrices.pyth, pythPrices?.spot, pythPrices?.twap, tokenMint, tokenName);
      }
      if (isNotNullPubkey(switchboardSpotOracle)) {
        const switchboardPrices = {
          spot: cacheOrGetSwitchboardPrice(switchboardSpotOracle, switchboardCache, allOracleAccounts),
          twap: isNotNullPubkey(switchboardTwapOracle)
            ? cacheOrGetSwitchboardPrice(switchboardTwapOracle, switchboardCache, allOracleAccounts)
            : null,
        };
        this.setPriceIfExist(
          klendPrices.switchboard,
          switchboardPrices.spot,
          switchboardPrices.twap,
          tokenMint,
          tokenName
        );
      }
    }
    return klendPrices;
  }

  getCumulativeBorrowRatesByReserve(slot: Slot): Map<Address, Decimal> {
    const cumulativeBorrowRates = new Map<Address, Decimal>();
    for (const reserve of this.reserves.values()) {
      cumulativeBorrowRates.set(
        reserve.address,
        reserve.getEstimatedCumulativeBorrowRate(slot, this.state.referralFeeBps)
      );
    }
    return cumulativeBorrowRates;
  }

  getCollateralExchangeRatesByReserve(slot: Slot): Map<Address, Decimal> {
    const collateralExchangeRates = new Map<Address, Decimal>();
    for (const reserve of this.reserves.values()) {
      collateralExchangeRates.set(
        reserve.address,
        reserve.getEstimatedCollateralExchangeRate(slot, this.state.referralFeeBps)
      );
    }
    return collateralExchangeRates;
  }

  private setPriceIfExist(
    prices: KaminoPrices,
    spot: CandidatePrice | null | undefined,
    twap: CandidatePrice | null | undefined,
    mint: string,
    tokenName: string
  ) {
    if (spot) {
      prices.spot[mint] = { price: spot.price, name: tokenName };
    }
    if (twap) {
      prices.twap[mint] = { price: twap.price, name: tokenName };
    }
  }

  getRecentSlotDurationMs(): number {
    return this.recentSlotDurationMs;
  }

  /* Returns all elevation groups except the default one  */
  getMarketElevationGroupDescriptions(): ElevationGroupDescription[] {
    const elevationGroups: ElevationGroupDescription[] = [];

    // Partially build
    for (const elevationGroup of this.state.elevationGroups) {
      if (elevationGroup.id === 0) {
        continue;
      }
      elevationGroups.push({
        collateralReserves: new Set<Address>([]),
        collateralLiquidityMints: new Set<Address>([]),
        debtReserve: elevationGroup.debtReserve,
        debtLiquidityMint: DEFAULT_PUBLIC_KEY,
        elevationGroup: elevationGroup.id,
        maxReservesAsCollateral: elevationGroup.maxReservesAsCollateral,
      });
    }

    // Fill the remaining
    for (const reserve of this.reserves.values()) {
      const reserveLiquidityMint = reserve.getLiquidityMint();
      const reserveAddress = reserve.address;
      const reserveElevationGroups = reserve.state.config.elevationGroups;
      for (const elevationGroupId of reserveElevationGroups) {
        if (elevationGroupId === 0) {
          continue;
        }

        const elevationGroupDescription = elevationGroups[elevationGroupId - 1];
        if (elevationGroupDescription) {
          if (reserveAddress === elevationGroupDescription.debtReserve) {
            elevationGroups[elevationGroupId - 1].debtLiquidityMint = reserveLiquidityMint;
          } else {
            elevationGroups[elevationGroupId - 1].collateralReserves.add(reserveAddress);
            elevationGroups[elevationGroupId - 1].collateralLiquidityMints.add(reserveLiquidityMint);
          }
        } else {
          throw new Error(`Invalid elevation group id ${elevationGroupId} at reserve ${reserveAddress.toString()}`);
        }
      }
    }

    return elevationGroups;
  }

  /* Returns all elevation groups for a given combination of liquidity mints, except the default one */
  getElevationGroupsForMintsCombination(
    collLiquidityMints: Address[],
    debtLiquidityMint?: Address
  ): ElevationGroupDescription[] {
    const allElevationGroups = this.getMarketElevationGroupDescriptions();

    return allElevationGroups.filter((elevationGroupDescription) => {
      return (
        collLiquidityMints.every((mint) => elevationGroupDescription.collateralLiquidityMints.has(mint)) &&
        (debtLiquidityMint == undefined || debtLiquidityMint === elevationGroupDescription.debtLiquidityMint)
      );
    });
  }

  /* Returns all elevation groups for a given combination of reserves, except the default one */
  getElevationGroupsForReservesCombination(
    collReserves: Address[],
    debtReserve?: Address
  ): ElevationGroupDescription[] {
    const allElevationGroups = this.getMarketElevationGroupDescriptions();

    return allElevationGroups.filter((elevationGroupDescription) => {
      return (
        collReserves.every((mint) => elevationGroupDescription.collateralReserves.has(mint)) &&
        (debtReserve == undefined || debtReserve === elevationGroupDescription.debtReserve)
      );
    });
  }
}

export type BorrowCapsAndCounters = {
  // Utilization cap
  utilizationCap: Decimal;
  utilizationCurrentValue: Decimal;

  // Daily borrow cap
  netWithdrawalCap: Decimal;
  netWithdrawalCurrentValue: Decimal;
  netWithdrawalLastUpdateTs: Decimal;
  netWithdrawalIntervalDurationSeconds: Decimal;

  // Global cap
  globalDebtCap: Decimal;
  globalTotalBorrowed: Decimal;

  // Debt outside emode cap
  debtOutsideEmodeCap: Decimal;
  borrowedOutsideEmode: Decimal;

  // Debt against collateral caps
  debtAgainstCollateralReserveCaps: {
    collateralReserve: Address;
    elevationGroup: number;
    maxDebt: Decimal;
    currentValue: Decimal;
  }[];
};

export type ElevationGroupDescription = {
  collateralReserves: Set<Address>;
  collateralLiquidityMints: Set<Address>;
  debtReserve: Address;
  debtLiquidityMint: Address;
  elevationGroup: number;
  maxReservesAsCollateral: number;
};

export type KlendPrices = {
  scope: KaminoPrices;
  pyth: KaminoPrices;
  switchboard: KaminoPrices;
};

export async function getReservesForMarket(
  marketAddress: Address,
  rpc: Rpc<KaminoReserveRpcApi>,
  programId: Address,
  recentSlotDurationMs: number,
  oracleAccounts?: AllOracleAccounts
): Promise<Map<Address, KaminoReserve>> {
  const reserves = await rpc
    .getProgramAccounts(programId, {
      filters: [
        {
          dataSize: BigInt(Reserve.layout.span + 8),
        },
        {
          memcmp: {
            offset: 32n,
            bytes: marketAddress.toString() as Base58EncodedBytes,
            encoding: 'base58',
          },
        },
      ],
      encoding: 'base64',
    })
    .send();
  const deserializedReserves: ReserveWithAddress[] = reserves.map((reserve) => {
    if (reserve.account === null) {
      throw new Error(`Reserve account ${reserve.pubkey} does not exist`);
    }

    const reserveAccount = Reserve.decode(Buffer.from(reserve.account.data[0], 'base64'));

    if (!reserveAccount) {
      throw Error(`Could not parse reserve ${reserve.pubkey}`);
    }
    return {
      address: reserve.pubkey,
      state: reserveAccount,
    };
  });
  const reservesAndOracles = await getTokenOracleData(rpc, deserializedReserves, oracleAccounts);
  const reservesByAddress = new Map<Address, KaminoReserve>();
  reservesAndOracles.forEach(([reserve, oracle], index) => {
    if (reserve.config.status === ReserveStatus.Obsolete.discriminator) {
      return;
    }
    if (!oracle) {
      throw Error(
        `Could not find oracle for ${parseTokenSymbol(reserve.config.tokenInfo.name)} (${
          reserves[index].pubkey
        }) reserve in market ${reserve.lendingMarket}`
      );
    }
    const kaminoReserve = KaminoReserve.initialize(reserves[index].pubkey, reserve, oracle, rpc, recentSlotDurationMs);
    reservesByAddress.set(kaminoReserve.address, kaminoReserve);
  });
  return reservesByAddress;
}

export async function getSingleReserve(
  reservePk: Address,
  rpc: Rpc<KaminoReserveRpcApi>,
  recentSlotDurationMs: number,
  reserveData?: Reserve,
  oracleAccounts?: AllOracleAccounts
): Promise<KaminoReserve> {
  const reserve = reserveData ?? (await Reserve.fetch(rpc, reservePk));

  if (reserve === null) {
    throw new Error(`Reserve account ${reservePk} does not exist`);
  }
  const reservesAndOracles = await getTokenOracleData(rpc, [{ address: reservePk, state: reserve }], oracleAccounts);
  const [, oracle] = reservesAndOracles[0];

  if (!oracle) {
    throw Error(
      `Could not find oracle for ${parseTokenSymbol(reserve.config.tokenInfo.name)} (${reservePk}) reserve in market ${
        reserve.lendingMarket
      }`
    );
  }
  return KaminoReserve.initialize(reservePk, reserve, oracle, rpc, recentSlotDurationMs);
}

export function getReservesActive(reserves: Map<Address, KaminoReserve>): Map<Address, KaminoReserve> {
  const reservesActive = new Map<Address, KaminoReserve>();
  for (const [key, reserve] of reserves) {
    if (reserve.state.config.status === 0) {
      reservesActive.set(key, reserve);
    }
  }
  return reservesActive;
}

/**
 *
 * @param kaminoMarket
 * @param reserves
 */
export function getTokenIdsForScopeRefresh(kaminoMarket: KaminoMarket, reserves: Address[]): Map<Address, number[]> {
  const tokenIds = new Map<Address, number[]>();

  for (const reserveAddress of reserves) {
    const reserve = kaminoMarket.getReserveByAddress(reserveAddress);
    if (!reserve) {
      throw new Error(`Reserve not found for reserve ${reserveAddress}`);
    }
    const { scopeConfiguration } = reserve.state.config.tokenInfo;
    if (scopeConfiguration.priceFeed !== DEFAULT_PUBLIC_KEY) {
      let x = 0;

      while (scopeConfiguration.priceChain[x] !== U16_MAX) {
        setOrAppend(tokenIds, scopeConfiguration.priceFeed, scopeConfiguration.priceChain[x]);
        x++;
      }

      x = 0;
      while (scopeConfiguration.twapChain[x] !== U16_MAX) {
        setOrAppend(tokenIds, scopeConfiguration.priceFeed, scopeConfiguration.twapChain[x]);
        x++;
      }
    }
  }

  //TODO: remove code below
  // - currently Scope program does not allow multiple refreshPricesList instructions in one tx
  // - temporary fix is to only refresh one scope feed at this time
  const firstFeed = tokenIds.entries().next();
  tokenIds.clear();
  if (!firstFeed.done) {
    const [key, value] = firstFeed.value;
    tokenIds.set(key, value);
  }

  return tokenIds;
}

const lamportsToNumberDecimal = (amount: Decimal.Value, decimals: number): Decimal => {
  const factor = 10 ** decimals;
  return new Decimal(amount).div(factor);
};
