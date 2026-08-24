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
} from '@solana/kit';
import type { LedgerInstant } from '../utils/ledger';
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
  fetchReserveRewardsMaxAprBps,
  getAllOracleAccounts,
  getProgramAccounts,
  getTokenOracleData,
  getUnconfiguredOracleReserveMessage,
  hasOracleConfigured,
  isNotNullPubkey,
  lendingMarketAuthPda,
  LendingObligation,
  LendingObligationFixedRate,
  LeverageObligation,
  LeverageObligationFixedRate,
  MultiplyObligation,
  MultiplyObligationFixedRate,
  ObligationType,
  FloatRateReserveKind,
  PythPrices,
  referrerTokenStatePda,
  ReserveKind,
  setOrAppend,
  userMetadataPda,
  VanillaObligation,
} from '../utils';
import BN from 'bn.js';
import Decimal from 'decimal.js';
import { FARMS_PROGRAM_ADDRESS as FARMS_PROGRAM_ID } from '@kamino-finance/farms-sdk';
import { fetchFarmStateOrNull } from './farm_utils';
import { PROGRAM_ID } from '../@codegen/klend/programId';
import { Scope, U16_MAX } from '@kamino-finance/scope-sdk';
import { OraclePrices } from '@kamino-finance/scope-sdk/dist/@codegen/scope/accounts/OraclePrices';
import { Fraction } from './fraction';
import { batchFetch, chunks, KaminoPrices, MintToPriceMap } from '@kamino-finance/kliquidity-sdk';
import { parseTokenSymbol, parseZeroPaddedUtf8 } from './utils';
import { PermissionedOp } from './permission';
import { ObligationZP } from '../@codegen/klend/zero_padding';
import { checkArrayNotEmpty, checkDefined } from '../utils/validations';
import { Buffer } from 'buffer';
import { kaminoCdn } from './cdnClient';

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

  readonly farmsProgramId: Address;

  private readonly recentSlotDurationMs: number;

  // scope feeds used by all market reserves
  readonly scopeFeeds: Set<Address>;

  private constructor(
    rpc: Rpc<KaminoMarketRpcApi>,
    state: LendingMarket,
    marketAddress: Address,
    reserves: Map<Address, KaminoReserve>,
    recentSlotDurationMs: number,
    programId: Address = PROGRAM_ID,
    farmsProgramId: Address = FARMS_PROGRAM_ID
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
    this.farmsProgramId = farmsProgramId;
    this.recentSlotDurationMs = recentSlotDurationMs;
    this.scopeFeeds = new Set(
      Array.from(this.reserves.values())
        .filter((r) => isNotNullPubkey(r.state.config.tokenInfo.scopeConfiguration.priceFeed))
        .map((r) => r.state.config.tokenInfo.scopeConfiguration.priceFeed)
    );
  }

  /**
   * TESTING ONLY!
   *
   * Used to create mock markets for testing
   */
  static createMarket(
    rpc: Rpc<KaminoMarketRpcApi>,
    state: LendingMarket,
    marketAddress: Address,
    reserves: Map<Address, KaminoReserve>,
    recentSlotDurationMs: number,
    programId: Address = PROGRAM_ID
  ) {
    return new KaminoMarket(rpc, state, marketAddress, reserves, recentSlotDurationMs, programId);
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
    withReserves: boolean = true,
    farmsProgramId: Address = FARMS_PROGRAM_ID
  ) {
    const market = await LendingMarket.fetch(rpc, marketAddress, programId);

    if (market === null) {
      return null;
    }

    const reserves = withReserves
      ? await getReservesForMarket(marketAddress, rpc, programId, recentSlotDurationMs, market.reserveRewardsMaxAprBps)
      : new Map<Address, KaminoReserve>();

    return new KaminoMarket(rpc, market, marketAddress, reserves, recentSlotDurationMs, programId, farmsProgramId);
  }

  static loadWithReserves(
    connection: Rpc<KaminoMarketRpcApi>,
    market: LendingMarket,
    reserves: Map<Address, KaminoReserve>,
    marketAddress: Address,
    recentSlotDurationMs: number,
    programId: Address = PROGRAM_ID,
    farmsProgramId: Address = FARMS_PROGRAM_ID
  ) {
    return new KaminoMarket(
      connection,
      market,
      marketAddress,
      reserves,
      recentSlotDurationMs,
      programId,
      farmsProgramId
    );
  }

  static async loadMultiple(
    connection: Rpc<KaminoMarketRpcApi>,
    markets: Address[],
    recentSlotDurationMs: number,
    programId: Address = PROGRAM_ID,
    withReserves: boolean = true,
    oracleAccounts?: AllOracleAccounts,
    farmsProgramId: Address = FARMS_PROGRAM_ID
  ) {
    const marketStates = await batchFetch(markets, (market) =>
      LendingMarket.fetchMultiple(connection, market, programId)
    );
    const rewardsAprBpsByMarket = new Map<Address, number>();
    for (let i = 0; i < markets.length; i++) {
      const market = marketStates[i];
      if (market !== null) {
        rewardsAprBpsByMarket.set(markets[i], market.reserveRewardsMaxAprBps);
      }
    }
    const marketReservesByMarket = withReserves
      ? await getReservesForMarkets(
          markets,
          connection,
          programId,
          recentSlotDurationMs,
          rewardsAprBpsByMarket,
          oracleAccounts
        )
      : new Map<Address, Map<Address, KaminoReserve>>();
    const kaminoMarkets = new Map<Address, KaminoMarket>();
    for (let i = 0; i < markets.length; i++) {
      const market = marketStates[i];
      const marketAddress = markets[i];
      if (market === null) {
        throw Error(`Could not fetch LendingMarket account state for market ${marketAddress}`);
      }

      const marketReserves = withReserves
        ? marketReservesByMarket.get(marketAddress) ?? new Map<Address, KaminoReserve>()
        : new Map<Address, KaminoReserve>();

      kaminoMarkets.set(
        marketAddress,
        new KaminoMarket(
          connection,
          market,
          marketAddress,
          marketReserves,
          recentSlotDurationMs,
          programId,
          farmsProgramId
        )
      );
    }
    return kaminoMarkets;
  }

  static async loadMultipleWithReserves(
    connection: Rpc<KaminoMarketRpcApi>,
    markets: Address[],
    reserves: Map<Address, Map<Address, KaminoReserve>>,
    recentSlotDurationMs: number,
    programId: Address = PROGRAM_ID,
    farmsProgramId: Address = FARMS_PROGRAM_ID
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
        new KaminoMarket(
          connection,
          market,
          marketAddress,
          marketReserves,
          recentSlotDurationMs,
          programId,
          farmsProgramId
        )
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
    this.reserves = await getReservesForMarket(
      this.getAddress(),
      this.rpc,
      this.programId,
      this.recentSlotDurationMs,
      market.reserveRewardsMaxAprBps
    );
    this.reservesActive = getReservesActive(this.reserves);
  }

  async reloadSingleReserve(reservePk: Address, reserveData?: Reserve): Promise<void> {
    const reserve = await getSingleReserve(
      reservePk,
      this.rpc,
      this.recentSlotDurationMs,
      reserveData,
      undefined,
      this.state.reserveRewardsMaxAprBps,
      this.programId
    );
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

  /**
   * True if any op in `op` is gated by the market's permissioning authority, for an operation touching
   * `opReserves`. An op is gated when the market itself gates it, or when any of the touched reserves
   * does — but only on a market that has a permissioning authority, since without one there is nobody
   * who could authorize it and the reserves' own flags lie dormant.
   *
   * Pass every reserve the operation touches; a reserve omitted here is a gate not seen. Passing `[]` still
   * applies the market's own gating — it means "this operation touches no reserve", not "check nothing".
   */
  requiresPermissioner(op: PermissionedOp, opReserves: KaminoReserve[]): boolean {
    if (this.getPermissioningAuthority() === undefined) {
      return false;
    }
    return (
      PermissionedOp.fromBN(this.state.permissionedOps).intersects(op) ||
      opReserves.some((reserve) => PermissionedOp.fromBN(reserve.state.config.permissionedOps).intersects(op))
    );
  }

  /** Address authorized to sign for permissioned ops on this market. */
  getPermissioningAuthority(): Address | undefined {
    return this.state.permissioningAuthority === DEFAULT_PUBLIC_KEY ? undefined : this.state.permissioningAuthority;
  }

  async getObligationDepositByWallet(
    owner: Address,
    depositReserveAddress: Address,
    obligationType: ObligationType
  ): Promise<Decimal> {
    const obligation = await this.getObligationByWallet(owner, obligationType);
    return obligation?.getDepositByReserve(depositReserveAddress)?.amount ?? new Decimal(0);
  }

  async getObligationBorrowByWallet(
    owner: Address,
    borrowReserveAddress: Address,
    obligationType: ObligationType
  ): Promise<Decimal> {
    const obligation = await this.getObligationByWallet(owner, obligationType);
    return obligation?.getBorrowByReserve(borrowReserveAddress)?.amount ?? new Decimal(0);
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

  getMaxLeverageForPair(collReserveAddress: Address, debtReserveAddress: Address): number {
    const { maxLtv: maxCollateralLtv, borrowFactor } = this.getMaxAndLiquidationLtvAndBorrowFactorForPair(
      collReserveAddress,
      debtReserveAddress
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

  /**
   * The elevation group an on-chain deposit+borrow of this (collateral, debt) pair auto-selects: the common
   * elevation group with the highest LTV, or `0` (no emode / default) when the pair shares no usable group.
   *
   * Single source of truth for the "preferred group for a borrow pair" rule — used by `KaminoAction` when building
   * deposit+borrow ixs and by the swap-debt migration preview/validation so all three stay consistent.
   */
  getPreferredElevationGroupForBorrowPair(collReserve: KaminoReserve, debtReserve: KaminoReserve): number {
    const commonElevationGroups = this.getCommonElevationGroupsForPair(collReserve, debtReserve);
    if (commonElevationGroups.length === 0) {
      return 0;
    }
    let selectedId = 0;
    let selectedMaxLtvPct = -1;
    for (const group of this.state.elevationGroups) {
      if (commonElevationGroups.includes(group.id) && group.ltvPct > selectedMaxLtvPct) {
        selectedId = group.id;
        selectedMaxLtvPct = group.ltvPct;
      }
    }
    return selectedId;
  }

  getMaxAndLiquidationLtvAndBorrowFactorForPair(
    collReserveAddress: Address,
    debtReserveAddress: Address,
    elevationGroup?: number
  ): { maxLtv: number; liquidationLtv: number; borrowFactor: number } {
    const collReserve: KaminoReserve | undefined = this.getReserveByAddress(collReserveAddress);
    const debtReserve: KaminoReserve | undefined = this.getReserveByAddress(debtReserveAddress);
    if (!collReserve || !debtReserve) {
      throw Error('Could not find one of the reserves.');
    }

    // When the caller pins a specific elevation group, evaluate LTV/borrow-factor AT THAT group: `0` means no emode
    // (the reserves' own config), otherwise the requested group's parameters (borrow factor is always 1 in emode).
    // With no group pinned, fall back to the best common group (highest max LTV) — the group an on-chain
    // deposit+borrow auto-selects.
    if (elevationGroup !== undefined) {
      if (elevationGroup === 0) {
        return {
          maxLtv: collReserve.state.config.loanToValuePct / 100,
          liquidationLtv: collReserve.state.config.liquidationThresholdPct / 100,
          borrowFactor: debtReserve.state.config.borrowFactorPct.toNumber() / 100,
        };
      }
      const group = checkDefined(
        this.state.elevationGroups[elevationGroup - 1],
        `Elevation group ${elevationGroup} not found`
      );
      return {
        maxLtv: group.ltvPct / 100,
        liquidationLtv: group.liquidationThresholdPct / 100,
        borrowFactor: 1,
      };
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
    productType: ObligationType,
    currentLedgerInstant: LedgerInstant
  ): Promise<{ tvl: Decimal; borrows: Decimal; deposits: Decimal; avgLeverage: Decimal }> {
    let obligations = (await this.getAllObligationsForMarket(currentLedgerInstant, productType.toArgs().tag)).filter(
      (obligation) =>
        obligation.refreshedStats.userTotalBorrow.gt(0) || obligation.refreshedStats.userTotalDeposit.gt(0)
    );

    switch (productType.toArgs().tag) {
      case VanillaObligation.tag: {
        break;
      }
      case LendingObligation.tag: {
        const mint = productType.toArgs().seed1;
        obligations = obligations.filter((obligation) => obligation.getDepositsByMint(mint).length > 0);
        break;
      }
      case MultiplyObligation.tag:
      case LeverageObligation.tag: {
        const collMint = productType.toArgs().seed1;
        const debtMint = productType.toArgs().seed2;
        obligations = obligations.filter(
          (obligation) =>
            obligation.getDepositsByMint(collMint).length > 0 && obligation.getBorrowsByMint(debtMint).length > 0
        );
        break;
      }
      case LendingObligationFixedRate.tag: {
        const reserveAddress = productType.toArgs().seed1;
        obligations = obligations.filter((obligation) => obligation.getDepositByReserve(reserveAddress) !== undefined);
        break;
      }
      case LeverageObligationFixedRate.tag:
      case MultiplyObligationFixedRate.tag: {
        const collReserveAddress = productType.toArgs().seed1;
        const debtReserveAddress = productType.toArgs().seed2;
        obligations = obligations.filter((obligation) => {
          const collDeposit = obligation.getDepositByReserve(collReserveAddress);
          const debtBorrow = obligation.getBorrowByReserve(debtReserveAddress);
          return collDeposit !== undefined && debtBorrow !== undefined;
        });
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
  async getNumberOfObligations(currentLedgerInstant: LedgerInstant) {
    return (await this.getAllObligationsForMarket(currentLedgerInstant))
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
    currentLedgerInstant: LedgerInstant,
    requestElevationGroup: boolean,
    obligation?: KaminoObligation
  ): Decimal {
    return obligation
      ? obligation.getMaxBorrowAmount(this, debtReserve.address, currentLedgerInstant, requestElevationGroup)
      : debtReserve.getMaxBorrowAmountWithCollReserve(this, collReserve, currentLedgerInstant);
  }

  async loadReserves(oracleAccounts?: AllOracleAccounts) {
    const addresses = [...this.reserves.keys()];
    if (addresses.length === 0) {
      return;
    }
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
    const [reservesAndOracles, cdnResourcesData] = await Promise.all([
      getTokenOracleData(this.getRpc(), deserializedReserves, oracleAccounts),
      kaminoCdn.getData(),
    ]);
    const kaminoReserves = new Map<Address, KaminoReserve>();
    reservesAndOracles.forEach(([{ address: reserveAddress, state: reserve }, oracle]) => {
      if (!oracle) {
        if (shouldSkipUnconfiguredOracleReserve(reserveAddress, reserve)) {
          return;
        }
        throw Error(
          `Could not find oracle for ${parseTokenSymbol(
            reserve.config.tokenInfo.name
          )} (${reserveAddress}) reserve in market ${reserve.lendingMarket}`
        );
      }
      const kaminoReserve = KaminoReserve.initialize(
        reserveAddress,
        reserve,
        oracle,
        this.rpc,
        this.recentSlotDurationMs,
        this.state.reserveRewardsMaxAprBps,
        cdnResourcesData,
        undefined,
        this.programId
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

  /**
   * Returns all reserves for the given mint address (both float rate and fixed rate).
   *
   * @param mint The liquidity mint address
   * @returns Array of all reserves for this mint
   */
  getReservesByMint(address: Address): KaminoReserve[] {
    const reserves: KaminoReserve[] = [];
    for (const reserve of this.reserves.values()) {
      if (reserve.getLiquidityMint() === address) {
        reserves.push(reserve);
      }
    }
    return reserves;
  }

  getExistingReservesByMint(address: Address, description: string = 'Requested'): KaminoReserve[] {
    return checkArrayNotEmpty(this.getReservesByMint(address), `${description} reserve with mint ${address} not found`);
  }

  getLiquidityTokenProgramByMint(mint: Address): Address {
    const reserves = this.getExistingReservesByMint(mint);
    const tokenProgram = reserves[0].getLiquidityTokenProgram();
    for (let i = 1; i < reserves.length; i++) {
      const otherTokenProgram = reserves[i].getLiquidityTokenProgram();
      if (otherTokenProgram !== tokenProgram) {
        throw new Error(
          `Inconsistent token programs for mint ${mint}: reserve ${reserves[0].address} has ${tokenProgram}, reserve ${reserves[i].address} has ${otherTokenProgram}`
        );
      }
    }
    return tokenProgram;
  }

  /**
   * Returns this market's reserve matching the given mint address and reserve kind.
   * Since a market can have multiple reserves for the same mint (with different terms),
   * the reserve kind specifies which reserve to select.
   *
   * Example for fixed-term reserves:
   * const fixedReserveKind = new FixedReserveKind(new BN(30 * 24 * 60 * 60), 500); // 30 days, 5% borrow rate
   * const fixedReserve = market.getReserveByMintAndKind(tokenMint, fixedReserveKind)!;

   * @param mint The liquidity mint address
   * @param reserveKind The reserve kind to match (e.g., FloatRateReserveKind or FixedRateReserveKind)
   */
  getReserveByMintAndKind(mint: Address, reserveKind: ReserveKind): KaminoReserve | undefined {
    for (const reserve of this.reserves.values()) {
      if (reserve.getLiquidityMint() === mint && reserveKind.matches(reserve)) {
        return reserve;
      }
    }
    return undefined;
  }

  /**
   * Returns this market's reserve matching the given mint address and reserve kind,
   * or throws an error if not found.
   *
   * @param mint The liquidity mint address
   * @param reserveKind The reserve kind to match
   * @param description Optional description for the error message
   */
  getExistingReserveByMintAndKind(
    mint: Address,
    reserveKind: ReserveKind,
    description: string = 'Requested'
  ): KaminoReserve {
    return checkDefined(
      this.getReserveByMintAndKind(mint, reserveKind),
      `${description} reserve with mint ${mint} and kind ${reserveKind.toString()} not found`
    );
  }

  /**
   * Returns this market's float rate reserve for the given mint address.
   * Float rate reserves are reserves without a fixed term (debtTermSeconds = 0).
   *
   * @param mint The liquidity mint address
   * @returns The float rate reserve, or undefined if not found
   */
  getFloatRateReserveByMint(mint: Address): KaminoReserve | undefined {
    return this.getReserveByMintAndKind(mint, new FloatRateReserveKind());
  }

  /**
   * Returns this market's float rate reserve for the given mint address,
   * or throws an error if not found.
   *
   * @param mint The liquidity mint address
   * @param description Optional description for the error message
   * @returns The float rate reserve
   */
  getExistingFloatRateReserveByMint(mint: Address, description: string = 'Requested'): KaminoReserve {
    return checkDefined(
      this.getFloatRateReserveByMint(mint),
      `${description} float rate reserve with mint ${mint} not found`
    );
  }

  /**
   * Returns all fixed rate reserves for the given mint address.
   * Fixed rate reserves have a non-zero debt term (debtTermSeconds > 0).
   *
   * @param mint The liquidity mint address
   * @returns Array of all fixed rate reserves for this mint
   */
  getFixedRateReservesByMint(mint: Address): KaminoReserve[] {
    const fixedRateReserves: KaminoReserve[] = [];
    for (const reserve of this.reserves.values()) {
      if (reserve.getLiquidityMint() === mint && reserve.getKind().isFixedRate()) {
        fixedRateReserves.push(reserve);
      }
    }
    return fixedRateReserves;
  }

  /**
   * Returns all maturity-timestamp reserves for the given mint address.
   *
   * @param mint The liquidity mint address
   * @returns Array of all maturity-timestamp reserves for this mint
   */
  getMaturityTimestampReservesByMint(mint: Address): KaminoReserve[] {
    const reserves: KaminoReserve[] = [];
    for (const reserve of this.reserves.values()) {
      if (reserve.getLiquidityMint() === mint && reserve.getKind().isMaturityTimestampKind()) {
        reserves.push(reserve);
      }
    }
    return reserves;
  }

  /**
   * Returns all reserves for the given symbol (both float rate and fixed rate).
   *
   * @param symbol The reserve symbol
   * @returns Array of all reserves for this symbol
   */
  getReservesBySymbol(symbol: string): KaminoReserve[] {
    const reserves: KaminoReserve[] = [];
    for (const reserve of this.reserves.values()) {
      if (reserve.symbol === symbol) {
        reserves.push(reserve);
      }
    }
    return reserves;
  }

  getExistingReservesBySymbol(symbol: string, description: string = 'Requested'): KaminoReserve[] {
    return checkArrayNotEmpty(
      this.getReservesBySymbol(symbol),
      `${description} reserve with symbol ${symbol} not found`
    );
  }

  /**
   * Returns this market's reserve matching the given symbol and reserve kind.
   * Since a market can have multiple reserves for the same symbol (with different terms),
   * the reserve kind specifies which reserve to select.
   *
   * @param symbol The reserve symbol
   * @param reserveKind The reserve kind to match (e.g., FloatRateReserveKind or FixedRateReserveKind)
   */
  getReserveBySymbolAndKind(symbol: string, reserveKind: ReserveKind): KaminoReserve | undefined {
    for (const reserve of this.reserves.values()) {
      if (reserve.symbol === symbol && reserveKind.matches(reserve)) {
        return reserve;
      }
    }
    return undefined;
  }

  /**
   * Returns this market's reserve matching the given symbol and reserve kind,
   * or throws an error if not found.
   *
   * @param symbol The reserve symbol
   * @param reserveKind The reserve kind to match
   * @param description Optional description for the error message
   */
  getExistingReserveBySymbolAndKind(
    symbol: string,
    reserveKind: ReserveKind,
    description: string = 'Requested'
  ): KaminoReserve {
    return checkDefined(
      this.getReserveBySymbolAndKind(symbol, reserveKind),
      `${description} reserve with symbol ${symbol} and kind ${reserveKind.toString()} not found`
    );
  }

  /**
   * Returns this market's float rate reserve for the given symbol.
   * Float rate reserves are reserves without a fixed term (debtTermSeconds = 0).
   *
   * @param symbol The reserve symbol
   * @returns The float rate reserve, or undefined if not found
   */
  getFloatRateReserveBySymbol(symbol: string): KaminoReserve | undefined {
    return this.getReserveBySymbolAndKind(symbol, new FloatRateReserveKind());
  }

  /**
   * Returns this market's float rate reserve for the given symbol,
   * or throws an error if not found.
   *
   * @param symbol The reserve symbol
   * @param description Optional description for the error message
   * @returns The float rate reserve
   */
  getExistingFloatRateReserveBySymbol(symbol: string, description: string = 'Requested'): KaminoReserve {
    return checkDefined(
      this.getFloatRateReserveBySymbol(symbol),
      `${description} float rate reserve with symbol ${symbol} not found`
    );
  }

  /**
   * Returns all fixed rate reserves for the given symbol.
   * Fixed rate reserves have a non-zero debt term (debtTermSeconds > 0).
   *
   * @param symbol The reserve symbol
   * @returns Array of all fixed rate reserves for this symbol
   */
  getFixedRateReservesBySymbol(symbol: string): KaminoReserve[] {
    const fixedRateReserves: KaminoReserve[] = [];
    for (const reserve of this.reserves.values()) {
      if (reserve.symbol === symbol && reserve.getKind().isFixedRate()) {
        fixedRateReserves.push(reserve);
      }
    }
    return fixedRateReserves;
  }

  /**
   * Returns all maturity-timestamp reserves for the given symbol.
   *
   * @param symbol The reserve symbol
   * @returns Array of all maturity-timestamp reserves for this symbol
   */
  getMaturityTimestampReservesBySymbol(symbol: string): KaminoReserve[] {
    const reserves: KaminoReserve[] = [];
    for (const reserve of this.reserves.values()) {
      if (reserve.symbol === symbol && reserve.getKind().isMaturityTimestampKind()) {
        reserves.push(reserve);
      }
    }
    return reserves;
  }

  getReserveMintBySymbol(symbol: string) {
    const reserves = this.getReservesBySymbol(symbol);
    if (reserves.length === 0) {
      throw new Error(`No reserves found for symbol ${symbol}`);
    }
    return reserves[0].getLiquidityMint();
  }

  async getReserveFarmInfo(
    reserveAddress: Address,
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
    const kaminoReserve = this.getReserveByAddress(reserveAddress);

    if (!kaminoReserve) {
      throw Error(`Could not find reserve ${reserveAddress}`);
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
    const farmState = await fetchFarmStateOrNull(this.getRpc(), farmAddress);
    if (!farmState) {
      throw Error(`Could not parse farm state. ${farmAddress}`);
    }
    const { token, rewardsAvailable, rewardScheduleCurve } = farmState.rewardInfos[0];
    // TODO: marius fix
    const rewardPerSecondLamports = Number(rewardScheduleCurve.points[0].rewardPerTimeUnit);
    const { mint, decimals: rewardDecimals } = token;
    const rewardPriceUsd = await getRewardPrice(mint);
    const rewardApr = this.calculateRewardAPR(
      rewardPerSecondLamports,
      rewardPriceUsd,
      totalInvestmentUsd,
      Number(rewardDecimals)
    );

    return {
      rewardsPerSecond: new Decimal(rewardPerSecondLamports).dividedBy(10 ** Number(rewardDecimals)),
      rewardsRemaining: new Decimal(rewardsAvailable.toString()).dividedBy(10 ** Number(rewardDecimals)),
      rewardApr: rewardsAvailable > 0n ? rewardApr : new Decimal(0),
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
  async getAllObligationsForMarket(currentLedgerInstant: LedgerInstant, tag?: number): Promise<KaminoObligation[]> {
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

    const obligations = await getProgramAccounts(
      this.rpc,
      this.programId,
      ObligationZP.layout.span + 8,
      filters,
      { offset: 0, length: ObligationZP.layout.span + 8 } // truncate the padding
    );

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
        obligationAccount.deposits,
        obligationAccount.borrows,
        collateralExchangeRates,
        cumulativeBorrowRates,
        currentLedgerInstant
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
  async *batchGetAllObligationsForMarket(
    currentLedgerInstant: LedgerInstant,
    tag?: number
  ): AsyncGenerator<KaminoObligation[], void, unknown> {
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

    const obligationPubkeys = await this.rpc
      .getProgramAccounts(this.programId, {
        filters,
        encoding: 'base64',
        dataSlice: { offset: 0, length: 0 },
      })
      .send();

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
          obligationAccount.deposits,
          obligationAccount.borrows,
          collateralExchangeRates,
          cumulativeBorrowRates,
          currentLedgerInstant
        );
        obligationsBatch.push(
          new KaminoObligation(this, pubkey, obligationAccount, collateralExchangeRates, cumulativeBorrowRates)
        );
      }
      yield obligationsBatch;
    }
  }

  async getAllObligationsByTag(tag: number, market: Address, currentLedgerInstant: LedgerInstant) {
    const obligations = await this.rpc
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
      .send();
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
        obligationAccount.deposits,
        obligationAccount.borrows,
        collateralExchangeRates,
        cumulativeBorrowRates,
        currentLedgerInstant
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
  async getAllObligationsByDepositedReserve(reserve: Address, currentLedgerInstant: LedgerInstant) {
    const finalObligations: KaminoObligation[] = [];
    for (let i = 0; i < DEPOSITS_LIMIT; i++) {
      const obligations = await this.rpc
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
        .send();

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
          obligationAccount.deposits,
          obligationAccount.borrows,
          collateralExchangeRates,
          cumulativeBorrowRates,
          currentLedgerInstant
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
  async getAllObligationsByBorrowedReserve(reserve: Address, currentLedgerInstant: LedgerInstant) {
    const finalObligations: KaminoObligation[] = [];
    for (let i = 0; i < BORROWS_LIMIT; i++) {
      const obligations = await this.rpc
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
        .send();

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
          obligationAccount.deposits,
          obligationAccount.borrows,
          collateralExchangeRates,
          cumulativeBorrowRates,
          currentLedgerInstant
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
    currentLedgerInstant: LedgerInstant,
    commitment: Commitment = 'processed'
  ): Promise<KaminoObligation[]> {
    const [currentInstant, obligations] = await Promise.all([
      Promise.resolve(currentLedgerInstant),
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
        obligationAccount.deposits,
        obligationAccount.borrows,
        collateralExchangeRates,
        cumulativeBorrowRates,
        currentInstant
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

  async getAllUserObligationsForReserve(
    user: Address,
    reserve: Address,
    currentLedgerInstant: LedgerInstant
  ): Promise<KaminoObligation[]> {
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
        obligationAddresses.slice(batchStart, batchStart + batchSize),
        currentLedgerInstant
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

  async getUserObligationsByTag(
    tag: number,
    user: Address,
    currentLedgerInstant: LedgerInstant
  ): Promise<KaminoObligation[]> {
    const obligations = await this.rpc
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
      .send();
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
        obligationAccount.deposits,
        obligationAccount.borrows,
        collateralExchangeRates,
        cumulativeBorrowRates,
        currentLedgerInstant
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

  async getMultipleObligationsByAddress(addresses: Address[], currentLedgerInstant: LedgerInstant) {
    return KaminoObligation.loadAll(this, addresses, currentLedgerInstant);
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
      // The raw chain is evaluated as configured - 0 is a valid price ID; only all-`U16_MAX`/all-0 means "no twap".
      const twapChain = reserve.state.config.tokenInfo.scopeConfiguration.twapChain;
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
      // The raw chain is evaluated as configured - 0 is a valid price ID; only all-`U16_MAX`/all-0 means "no twap".
      const twapChain = reserve.state.config.tokenInfo.scopeConfiguration.twapChain;
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

  getCumulativeBorrowRatesByReserve(currentLedgerInstant: LedgerInstant): Map<Address, Decimal> {
    const cumulativeBorrowRates = new Map<Address, Decimal>();
    for (const reserve of this.reserves.values()) {
      cumulativeBorrowRates.set(
        reserve.address,
        reserve.getEstimatedCumulativeBorrowRate(currentLedgerInstant, this.state.referralFeeBps)
      );
    }
    return cumulativeBorrowRates;
  }

  getCollateralExchangeRatesByReserve(currentLedgerInstant: LedgerInstant): Map<Address, Decimal> {
    const collateralExchangeRates = new Map<Address, Decimal>();
    for (const reserve of this.reserves.values()) {
      collateralExchangeRates.set(
        reserve.address,
        reserve.getEstimatedCollateralExchangeRate(currentLedgerInstant, this.state.referralFeeBps)
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

export async function getReserveStatesForMarket(
  marketAddress: Address,
  rpc: Rpc<KaminoReserveRpcApi>,
  programId: Address
): Promise<ReserveWithAddress[]> {
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
        {
          // Match Reserve's 8-byte Anchor discriminator at offset 0 so uninitialized
          // klend-owned accounts with the same 8624-byte layout (e.g. pre-allocated
          // placeholders awaiting init_reserve) are filtered out server-side and
          // never reach Reserve.decode below.
          memcmp: {
            offset: 0n,
            bytes: base58Decoder.decode(Reserve.discriminator) as Base58EncodedBytes,
            encoding: 'base58',
          },
        },
      ],
      encoding: 'base64',
    })
    .send();
  return reserves.map((reserve) => {
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
}

async function getReservesForMarkets(
  marketAddresses: Address[],
  rpc: Rpc<KaminoReserveRpcApi>,
  programId: Address,
  recentSlotDurationMs: number,
  rewardsAprBpsByMarket: Map<Address, number>,
  oracleAccounts?: AllOracleAccounts
): Promise<Map<Address, Map<Address, KaminoReserve>>> {
  const requestedMarkets = new Set(marketAddresses);
  const reservesByMarket = new Map<Address, Map<Address, KaminoReserve>>();

  marketAddresses.forEach((marketAddress) => {
    reservesByMarket.set(marketAddress, new Map<Address, KaminoReserve>());
  });

  if (requestedMarkets.size === 0) {
    return reservesByMarket;
  }

  const reserves = await rpc
    .getProgramAccounts(programId, {
      filters: [
        {
          dataSize: BigInt(Reserve.layout.span + 8),
        },
        {
          memcmp: {
            offset: 0n,
            bytes: base58Decoder.decode(Reserve.discriminator) as Base58EncodedBytes,
            encoding: 'base58',
          },
        },
      ],
      encoding: 'base64',
    })
    .send();

  const deserializedReserves = reserves
    .map((reserve) => {
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
    })
    .filter((reserve) => requestedMarkets.has(reserve.state.lendingMarket));

  if (deserializedReserves.length === 0) {
    return reservesByMarket;
  }

  const kaminoReserves = await initializeKaminoReserves(
    deserializedReserves,
    rpc,
    recentSlotDurationMs,
    (lendingMarket) => {
      const rewardsAprBps = rewardsAprBpsByMarket.get(lendingMarket);
      if (rewardsAprBps === undefined) {
        throw new Error(`Missing reserveRewardsMaxAprBps for lending market ${lendingMarket}`);
      }
      return rewardsAprBps;
    },
    programId,
    oracleAccounts
  );

  kaminoReserves.forEach((kaminoReserve) => {
    const marketReserves = reservesByMarket.get(kaminoReserve.state.lendingMarket);
    if (marketReserves) {
      marketReserves.set(kaminoReserve.address, kaminoReserve);
    }
  });

  return reservesByMarket;
}

/**
 * `reserveRewardsMaxAprBps` is the market's `LendingMarket::reserveRewardsMaxAprBps`; pass it
 * when you already hold the market state to save a network call, otherwise the market is fetched
 * to read it.
 */
export async function getReservesForMarket(
  marketAddress: Address,
  rpc: Rpc<KaminoReserveRpcApi>,
  programId: Address,
  recentSlotDurationMs: number,
  reserveRewardsMaxAprBps?: number,
  oracleAccounts?: AllOracleAccounts
): Promise<Map<Address, KaminoReserve>> {
  const [deserializedReserves, rewardsAprBps] = await Promise.all([
    getReserveStatesForMarket(marketAddress, rpc, programId),
    reserveRewardsMaxAprBps !== undefined
      ? Promise.resolve(reserveRewardsMaxAprBps)
      : fetchReserveRewardsMaxAprBps(rpc, marketAddress, programId),
  ]);
  const kaminoReserves = await initializeKaminoReserves(
    deserializedReserves,
    rpc,
    recentSlotDurationMs,
    () => rewardsAprBps,
    programId,
    oracleAccounts
  );
  const reservesByAddress = new Map<Address, KaminoReserve>();
  kaminoReserves.forEach((kaminoReserve) => {
    reservesByAddress.set(kaminoReserve.address, kaminoReserve);
  });
  return reservesByAddress;
}

async function initializeKaminoReserves(
  reserves: ReserveWithAddress[],
  rpc: Rpc<KaminoReserveRpcApi>,
  recentSlotDurationMs: number,
  getRewardsMaxAprBps: (lendingMarket: Address) => number,
  programId: Address,
  oracleAccounts?: AllOracleAccounts
): Promise<KaminoReserve[]> {
  const [reservesAndOracles, cdnResourcesData] = await Promise.all([
    getTokenOracleData(rpc, reserves, oracleAccounts),
    kaminoCdn.getData(),
  ]);

  const kaminoReserves: KaminoReserve[] = [];
  reservesAndOracles.forEach(([{ address: reserveAddress, state: reserve }, oracle]) => {
    if (!oracle) {
      if (shouldSkipUnconfiguredOracleReserve(reserveAddress, reserve)) {
        return;
      }
      throw Error(
        `Could not find oracle for ${parseTokenSymbol(
          reserve.config.tokenInfo.name
        )} (${reserveAddress}) reserve in market ${reserve.lendingMarket}`
      );
    }

    kaminoReserves.push(
      KaminoReserve.initialize(
        reserveAddress,
        reserve,
        oracle,
        rpc,
        recentSlotDurationMs,
        getRewardsMaxAprBps(reserve.lendingMarket),
        cdnResourcesData,
        undefined,
        programId
      )
    );
  });
  return kaminoReserves;
}

/**
 * `reserveRewardsMaxAprBps` is the parent market's `LendingMarket::reserveRewardsMaxAprBps`; pass
 * it when you already hold the market state to save a network call, otherwise the reserve's
 * lending market is fetched to read it.
 */
export async function getSingleReserve(
  reservePk: Address,
  rpc: Rpc<KaminoReserveRpcApi>,
  recentSlotDurationMs: number,
  reserveData?: Reserve,
  oracleAccounts?: AllOracleAccounts,
  reserveRewardsMaxAprBps?: number,
  programId: Address = PROGRAM_ID
): Promise<KaminoReserve> {
  const reserve = reserveData ?? (await Reserve.fetch(rpc, reservePk, programId));

  if (reserve === null) {
    throw new Error(`Reserve account ${reservePk} does not exist`);
  }
  const [reservesAndOracles, cdnResourcesData, rewardsAprBps] = await Promise.all([
    getTokenOracleData(rpc, [{ address: reservePk, state: reserve }], oracleAccounts),
    kaminoCdn.getData(),
    reserveRewardsMaxAprBps !== undefined
      ? Promise.resolve(reserveRewardsMaxAprBps)
      : fetchReserveRewardsMaxAprBps(rpc, reserve.lendingMarket, programId),
  ]);
  const [, oracle] = reservesAndOracles[0];

  if (!oracle) {
    if (!hasOracleConfigured(reserve)) {
      throw Error(`Could not load ${getUnconfiguredOracleReserveMessage(reservePk, reserve)}`);
    }
    throw Error(
      `Could not find oracle for ${parseTokenSymbol(reserve.config.tokenInfo.name)} (${reservePk}) reserve in market ${
        reserve.lendingMarket
      }`
    );
  }
  return KaminoReserve.initialize(
    reservePk,
    reserve,
    oracle,
    rpc,
    recentSlotDurationMs,
    rewardsAprBps,
    cdnResourcesData,
    undefined,
    programId
  );
}

function shouldSkipUnconfiguredOracleReserve(reserveAddress: Address, reserve: Reserve): boolean {
  if (hasOracleConfigured(reserve)) {
    return false;
  }

  console.warn(`Skipping ${getUnconfiguredOracleReserveMessage(reserveAddress, reserve)}`);
  return true;
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
