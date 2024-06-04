import { AccountInfo, Connection, PublicKey } from '@solana/web3.js';
import { KaminoObligation } from './obligation';
import { KaminoReserve } from './reserve';
import { LendingMarket, Obligation, UserMetadata, ReferrerTokenState, Reserve } from '../idl_codegen/accounts';
import {
  lendingMarketAuthPda,
  ObligationType,
  referrerTokenStatePda,
  userMetadataPda,
  getTokenOracleData,
  VanillaObligation,
  LendingObligation,
  MultiplyObligation,
  LeverageObligation,
  isNotNullPubkey,
  getAllOracleAccounts,
  PythPrices,
  cacheOrGetScopePrice,
  cacheOrGetPythPrices,
  cacheOrGetSwitchboardPrice,
  PubkeyHashMap,
  CandidatePrice,
} from '../utils';
import base58 from 'bs58';
import { BN } from '@coral-xyz/anchor';
import Decimal from 'decimal.js';
import { FarmState } from '@hubbleprotocol/farms-sdk';
import { PROGRAM_ID } from '../idl_codegen/programId';
import bs58 from 'bs58';
import { OraclePrices, Scope } from '@hubbleprotocol/scope-sdk';
import { Fraction } from './fraction';
import { chunks, KaminoPrices, MintToPriceMap } from '@hubbleprotocol/kamino-sdk';
import { parseTokenSymbol } from './utils';
import SwitchboardProgram from '@switchboard-xyz/sbv2-lite';
import { ObligationZP } from '../idl_codegen/zero_padding';

export interface ReserveRewardInfo {
  rewardsPerSecond: Decimal; // not lamport
  rewardsRemaining: Decimal; // not lamport
  rewardApr: Decimal;
  rewardMint: PublicKey;
  totalInvestmentUsd: Decimal;
  rewardPrice: number;
}

export class KaminoMarket {
  private readonly connection: Connection;

  readonly address: string;

  state: LendingMarket;

  reserves: Map<PublicKey, KaminoReserve>;

  reservesActive: Map<PublicKey, KaminoReserve>;

  readonly programId: PublicKey;

  scope: Scope;

  private constructor(
    connection: Connection,
    state: LendingMarket,
    marketAddress: string,
    reserves: Map<PublicKey, KaminoReserve>,
    scope: Scope,
    programId: PublicKey = PROGRAM_ID
  ) {
    this.address = marketAddress;
    this.connection = connection;
    this.state = state;
    this.reserves = reserves;
    this.reservesActive = getReservesActive(this.reserves);
    this.programId = programId;
    this.scope = scope;
  }

  /**
   * Load a new market with all of its associated reserves
   * @param connection
   * @param marketAddress
   * @param programId
   * @param setupLocalTest
   */
  static async load(
    connection: Connection,
    marketAddress: PublicKey,
    programId: PublicKey = PROGRAM_ID,
    setupLocalTest: boolean = false,
    withReserves: boolean = true
  ) {
    const market = await LendingMarket.fetch(connection, marketAddress, programId);

    if (market === null) {
      return null;
    }
    let scope: Scope;
    if (!setupLocalTest) {
      scope = new Scope('mainnet-beta', connection);
    } else {
      scope = new Scope('localnet', connection);
    }

    const reserves = withReserves
      ? await getReservesForMarket(marketAddress, connection, programId)
      : new Map<PublicKey, KaminoReserve>();

    return new KaminoMarket(connection, market, marketAddress.toString(), reserves, scope, programId);
  }

  async reload(): Promise<void> {
    const market = await LendingMarket.fetch(this.connection, this.getAddress(), this.programId);
    if (market === null) {
      return;
    }

    this.state = market;
    this.reserves = await getReservesForMarket(this.getAddress(), this.connection, this.programId);
    this.reservesActive = getReservesActive(this.reserves);
  }

  async reloadSingleReserve(reservePk: PublicKey, accountData?: AccountInfo<Buffer>): Promise<void> {
    const reserve = await getSingleReserve(reservePk, this.connection, accountData);
    this.reserves.set(reservePk, reserve);
    this.reservesActive.set(reservePk, reserve);
  }

  /**
   * Get the address of this market
   * @return market address public key
   */
  getAddress(): PublicKey {
    return new PublicKey(this.address);
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

  getMinNetValueObligation(): Decimal {
    return new Fraction(this.state.minNetValueInObligationSf).toDecimal();
  }

  /**
   * Get the authority PDA of this market
   * @return market authority public key
   */
  getLendingMarketAuthority(): PublicKey {
    return lendingMarketAuthPda(this.getAddress(), this.programId)[0];
  }

  async getObligationDepositByWallet(
    owner: PublicKey,
    mint: PublicKey,
    obligationType: ObligationType
  ): Promise<Decimal> {
    const obligation = await this.getObligationByWallet(owner, obligationType);
    return obligation?.getDepositByMint(mint)?.amount ?? new Decimal(0);
  }

  async getObligationBorrowByWallet(
    owner: PublicKey,
    mint: PublicKey,
    obligationType: ObligationType
  ): Promise<Decimal> {
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

  getMaxLeverageForPair(collTokenMint: PublicKey, debtTokenMint: PublicKey): number {
    const { maxLtv: maxCollateralLtv, borrowFactor } = this.getMaxAndLiquidationLtvAndBorrowFactorForPair(
      collTokenMint,
      debtTokenMint
    );

    const maxLeverage =
      // const ltv = (coll * ltv_factor) / (debt * borrow_factor);
      1 / (1 - (maxCollateralLtv * 100) / (borrowFactor * 100));

    return maxLeverage;
  }

  getMaxAndLiquidationLtvAndBorrowFactorForPair(
    collTokenMint: PublicKey,
    debtTokenMint: PublicKey
  ): { maxLtv: number; liquidationLtv: number; borrowFactor: number } {
    const collReserve: KaminoReserve | undefined = this.getReserveByMint(collTokenMint);
    const debtReserve: KaminoReserve | undefined = this.getReserveByMint(debtTokenMint);

    if (!collReserve || !debtReserve) {
      throw Error('Could not find one of the reserves.');
    }

    const groupsColl = new Set(collReserve.state.config.elevationGroups);
    const groupsDebt = new Set(debtReserve.state.config.elevationGroups);
    const commonElevationGroups = [...groupsColl].filter((item) => groupsDebt.has(item) && item !== 0);

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

  async getObligationByWallet(publicKey: PublicKey, obligationType: ObligationType): Promise<KaminoObligation | null> {
    const { address } = this;
    if (!address) {
      throw Error('Market must be initialized to call initialize.');
    }
    const obligationAddress = obligationType.toPda(this.getAddress(), publicKey);
    return KaminoObligation.load(this, obligationAddress);
  }

  async loadReserves() {
    const addresses = [...this.reserves.keys()];
    const reserveAccounts = await this.connection.getMultipleAccountsInfo(addresses, 'processed');
    const deserializedReserves = reserveAccounts.map((reserve, i) => {
      if (reserve === null) {
        // maybe reuse old here
        throw new Error(`Reserve account ${addresses[i].toBase58()} was not found`);
      }
      const reserveAccount = Reserve.decode(reserve.data);
      if (!reserveAccount) {
        throw Error(`Could not parse reserve ${addresses[i].toBase58()}`);
      }
      return reserveAccount;
    });
    const reservesAndOracles = await getTokenOracleData(this.connection, deserializedReserves);
    const kaminoReserves = new PubkeyHashMap<PublicKey, KaminoReserve>();
    reservesAndOracles.forEach(([reserve, oracle], index) => {
      if (!oracle) {
        throw Error(`Could not find oracle for ${parseTokenSymbol(reserve.config.tokenInfo.name)} reserve`);
      }
      const kaminoReserve = KaminoReserve.initialize(
        reserveAccounts[index]!,
        addresses[index],
        reserve,
        oracle,
        this.connection
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

  getReserveByAddress(address: PublicKey) {
    return this.reserves.get(address);
  }

  getReserveByMint(address: PublicKey) {
    for (const reserve of this.reserves.values()) {
      if (reserve.getLiquidityMint().equals(address)) {
        return reserve;
      }
    }
    return undefined;
  }

  getReserveBySymbol(symbol: string) {
    for (const reserve of this.reserves.values()) {
      if (reserve.symbol === symbol) {
        return reserve;
      }
    }
    return undefined;
  }

  getReserveMintBySymbol(symbol: string) {
    return this.getReserveBySymbol(symbol)?.getLiquidityMint();
  }

  async getReserveFarmInfo(
    mint: PublicKey,
    getRewardPrice: (mint: PublicKey) => Promise<number>
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
        rewardMint: PublicKey.default,
        totalInvestmentUsd: new Decimal(0),
        rewardPrice: 0,
      },
      depositingRewards: {
        rewardsPerSecond: new Decimal(0),
        rewardsRemaining: new Decimal(0),
        rewardApr: new Decimal(0),
        rewardMint: PublicKey.default,
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
      result.depositingRewards = await this.getRewardInfoForFarm(debtFarmAddress, totalBorrowAmount, getRewardPrice);
    }

    return result;
  }

  async getRewardInfoForFarm(
    farmAddress: PublicKey,
    totalInvestmentUsd: Decimal,
    getRewardPrice: (mint: PublicKey) => Promise<number>
  ): Promise<ReserveRewardInfo> {
    const farmState = await FarmState.fetch(this.connection, farmAddress);
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
    const { getProgramAccounts } = await import('../utils/rpc');
    const filters = [
      {
        dataSize: Obligation.layout.span + 8,
      },
      {
        memcmp: {
          offset: 32,
          bytes: this.address,
        },
      },
    ];

    if (tag !== undefined) {
      filters.push({
        memcmp: {
          offset: 8,
          bytes: base58.encode(new BN(tag).toBuffer()),
        },
      });
    }

    const collateralExchangeRates = new PubkeyHashMap<PublicKey, Decimal>();
    const cumulativeBorrowRates = new PubkeyHashMap<PublicKey, Decimal>();

    const [slot, obligations] = await Promise.all([
      this.connection.getSlot(),
      getProgramAccounts(this.connection, this.programId, {
        commitment: this.connection.commitment ?? 'processed',
        filters,
        dataSlice: { offset: 0, length: ObligationZP.layout.span + 8 }, // truncate the padding
      }),
    ]);

    return obligations.map((obligation) => {
      if (obligation.account === null) {
        throw new Error('Invalid account');
      }

      const obligationAccount = ObligationZP.decode(obligation.account.data);
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
   * Get all obligations for lending market from an async generator filled with batches of 100 obligations each
   * @param tag
   * @example
   * const obligationsGenerator = market.batchGetAllObligationsForMarket();
   * for await (const obligations of obligationsGenerator) {
   *   console.log('got a batch of # obligations:', obligations.length);
   * }
   */
  async *batchGetAllObligationsForMarket(tag?: number): AsyncGenerator<KaminoObligation[], void, unknown> {
    const filters = [
      {
        dataSize: Obligation.layout.span + 8,
      },
      {
        memcmp: {
          offset: 32,
          bytes: this.address,
        },
      },
    ];

    if (tag !== undefined) {
      filters.push({
        memcmp: {
          offset: 8,
          bytes: base58.encode(new BN(tag).toBuffer()),
        },
      });
    }

    const collateralExchangeRates = new PubkeyHashMap<PublicKey, Decimal>();
    const cumulativeBorrowRates = new PubkeyHashMap<PublicKey, Decimal>();

    const [obligationPubkeys, slot] = await Promise.all([
      this.connection.getProgramAccounts(this.programId, {
        filters,
        dataSlice: { offset: 0, length: 0 },
      }),
      this.connection.getSlot(),
    ]);

    for (const batch of chunks(
      obligationPubkeys.map((x) => x.pubkey),
      100
    )) {
      const obligationAccounts = await this.connection.getMultipleAccountsInfo(batch);
      const obligationsBatch: KaminoObligation[] = [];
      for (let i = 0; i < obligationAccounts.length; i++) {
        const obligation = obligationAccounts[i];
        const pubkey = batch[i];
        if (obligation === null) {
          continue;
        }

        const obligationAccount = Obligation.decode(obligation.data);

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

  async getAllObligationsByTag(tag: number, market: PublicKey) {
    const [slot, obligations] = await Promise.all([
      this.connection.getSlot(),
      this.connection.getProgramAccounts(this.programId, {
        filters: [
          {
            dataSize: Obligation.layout.span + 8,
          },
          {
            memcmp: {
              offset: 8,
              bytes: base58.encode(new BN(tag).toBuffer()),
            },
          },
          {
            memcmp: {
              offset: 32,
              bytes: market.toBase58(),
            },
          },
        ],
      }),
    ]);
    const collateralExchangeRates = new PubkeyHashMap<PublicKey, Decimal>();
    const cumulativeBorrowRates = new PubkeyHashMap<PublicKey, Decimal>();

    return obligations.map((obligation) => {
      if (obligation.account === null) {
        throw new Error('Invalid account');
      }
      if (!obligation.account.owner.equals(this.programId)) {
        throw new Error("account doesn't belong to this program");
      }

      const obligationAccount = Obligation.decode(obligation.account.data);

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

  async getAllUserObligations(user: PublicKey) {
    const [currentSlot, obligations] = await Promise.all([
      this.connection.getSlot(),
      this.connection.getProgramAccounts(this.programId, {
        filters: [
          {
            dataSize: Obligation.layout.span + 8,
          },
          {
            memcmp: {
              offset: 0,
              bytes: bs58.encode(Obligation.discriminator),
            },
          },
          {
            memcmp: {
              offset: 64,
              bytes: user.toBase58(),
            },
          },
          {
            memcmp: {
              offset: 32,
              bytes: this.address,
            },
          },
        ],
      }),
    ]);

    const collateralExchangeRates = new PubkeyHashMap<PublicKey, Decimal>();
    const cumulativeBorrowRates = new PubkeyHashMap<PublicKey, Decimal>();
    return obligations.map((obligation) => {
      if (obligation.account === null) {
        throw new Error('Invalid account');
      }
      if (!obligation.account.owner.equals(this.programId)) {
        throw new Error("account doesn't belong to this program");
      }

      const obligationAccount = Obligation.decode(obligation.account.data);

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

  async getUserObligationsByTag(tag: number, user: PublicKey): Promise<KaminoObligation[]> {
    const [currentSlot, obligations] = await Promise.all([
      this.connection.getSlot(),
      this.connection.getProgramAccounts(this.programId, {
        filters: [
          {
            dataSize: Obligation.layout.span + 8,
          },
          {
            memcmp: {
              offset: 8,
              bytes: base58.encode(new BN(tag).toBuffer()),
            },
          },
          {
            memcmp: {
              offset: 32,
              bytes: this.address,
            },
          },
          {
            memcmp: {
              offset: 64,
              bytes: user.toBase58(),
            },
          },
        ],
      }),
    ]);
    const collateralExchangeRates = new PubkeyHashMap<PublicKey, Decimal>();
    const cumulativeBorrowRates = new PubkeyHashMap<PublicKey, Decimal>();
    return obligations.map((obligation) => {
      if (obligation.account === null) {
        throw new Error('Invalid account');
      }
      if (!obligation.account.owner.equals(this.programId)) {
        throw new Error("account doesn't belong to this program");
      }

      const obligationAccount = Obligation.decode(obligation.account.data);

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

  async getObligationByAddress(address: PublicKey) {
    if (!this.getReserves().every((reserve) => reserve.stats)) {
      await this.loadReserves();
    }
    return KaminoObligation.load(this, address);
  }

  async getMultipleObligationsByAddress(addresses: PublicKey[]) {
    return KaminoObligation.loadAll(this, addresses);
  }

  /**
   * Get the user metadata PDA and fetch and return the user metadata state if it exists
   * @return [address, userMetadataState] - The address of the user metadata PDA and the user metadata state, or null if it doesn't exist
   */
  async getUserMetadata(user: PublicKey): Promise<[PublicKey, UserMetadata | null]> {
    const [address, _bump] = userMetadataPda(user, this.programId);

    const userMetadata = await UserMetadata.fetch(this.connection, address, this.programId);

    return [address, userMetadata];
  }

  async getReferrerTokenStateForReserve(
    referrer: PublicKey,
    reserve: PublicKey
  ): Promise<[PublicKey, ReferrerTokenState | null]> {
    const [address, _bump] = referrerTokenStatePda(referrer, reserve, this.programId);

    const referrerTokenState = await ReferrerTokenState.fetch(this.connection, address, this.programId);

    return [address, referrerTokenState];
  }

  async getAllReferrerTokenStates(referrer: PublicKey) {
    const referrerTokenStates = await this.connection.getProgramAccounts(this.programId, {
      filters: [
        {
          dataSize: ReferrerTokenState.layout.span + 8,
        },
        {
          memcmp: {
            offset: 8,
            bytes: referrer.toBase58(),
          },
        },
      ],
    });

    const referrerTokenStatesForMints = new PubkeyHashMap<PublicKey, ReferrerTokenState>();

    referrerTokenStates.forEach((referrerTokenState) => {
      if (referrerTokenState.account === null) {
        throw new Error('Invalid account');
      }
      if (!referrerTokenState.account.owner.equals(this.programId)) {
        throw new Error("account doesn't belong to this program");
      }

      const referrerTokenStateDecoded = ReferrerTokenState.decode(referrerTokenState.account.data);

      if (!referrerTokenStateDecoded) {
        throw Error('Could not parse obligation.');
      }

      referrerTokenStatesForMints.set(referrerTokenStateDecoded.mint, referrerTokenStateDecoded);
    });

    return referrerTokenStatesForMints;
  }

  async getAllReferrerFeesUnclaimed(referrer: PublicKey) {
    const referrerTokenStatesForMints = await this.getAllReferrerTokenStates(referrer);

    const referrerFeesUnclaimedForMints = new PubkeyHashMap<PublicKey, Decimal>();

    for (const mint of referrerTokenStatesForMints.keys()) {
      referrerFeesUnclaimedForMints.set(
        mint,
        new Fraction(referrerTokenStatesForMints.get(mint)!.amountUnclaimedSf).toDecimal()
      );
    }

    return referrerFeesUnclaimedForMints;
  }

  async getReferrerFeesUnclaimedForReserve(referrer: PublicKey, reserve: KaminoReserve): Promise<Decimal> {
    const [, referrerTokenState] = await this.getReferrerTokenStateForReserve(referrer, reserve.address);
    return referrerTokenState ? new Fraction(referrerTokenState.amountUnclaimedSf).toDecimal() : new Decimal(0);
  }

  async getReferrerFeesCumulativeForReserve(referrer: PublicKey, reserve: KaminoReserve): Promise<Decimal> {
    const [, referrerTokenState] = await this.getReferrerTokenStateForReserve(referrer, reserve.address);
    return referrerTokenState ? new Fraction(referrerTokenState.amountCumulativeSf).toDecimal() : new Decimal(0);
  }

  async getAllReferrerFeesCumulative(referrer: PublicKey) {
    const referrerTokenStatesForMints = await this.getAllReferrerTokenStates(referrer);

    const referrerFeesCumulativeForMints = new PubkeyHashMap<PublicKey, Decimal>();

    for (const mint of referrerTokenStatesForMints.keys()) {
      referrerFeesCumulativeForMints.set(
        mint,
        new Fraction(referrerTokenStatesForMints.get(mint)!.amountUnclaimedSf).toDecimal()
      );
    }

    return referrerFeesCumulativeForMints;
  }

  async getReferrerUrl(baseUrl: string, referrer: PublicKey) {
    return baseUrl + this.encodeReferrer(referrer);
  }

  async getReferrerFromUrl(baseUrl: string, url: string) {
    return this.decodeReferrer(url.split(baseUrl)[1]);
  }

  async encodeReferrer(referrer: PublicKey) {
    return bs58.encode(referrer.toBuffer());
  }

  async decodeReferrer(encoded_referrer: string) {
    const referrer_buffer = bs58.decode(encoded_referrer);
    return new PublicKey(referrer_buffer.toString());
  }

  /**
   * Get the underlying connection passed when instantiating this market
   * @return connection
   */
  getConnection() {
    return this.connection;
  }

  /**
   * Get all Scope prices used by all the market reserves
   */
  async getAllScopePrices(oraclePrices?: OraclePrices): Promise<KaminoPrices> {
    if (!oraclePrices) {
      oraclePrices = await this.scope.getOraclePrices();
    }
    const spot: MintToPriceMap = {};
    const twaps: MintToPriceMap = {};
    for (const reserve of this.reserves.values()) {
      const tokenMint = reserve.getLiquidityMint().toString();
      const tokenName = reserve.getTokenSymbol();
      const oracle = reserve.state.config.tokenInfo.scopeConfiguration.priceFeed;
      const chain = reserve.state.config.tokenInfo.scopeConfiguration.priceChain;
      const twapChain = reserve.state.config.tokenInfo.scopeConfiguration.twapChain.filter((x) => x > 0);
      if (oracle && isNotNullPubkey(oracle) && chain && Scope.isScopeChainValid(chain)) {
        const spotPrice = await this.scope.getPriceFromChain(chain, oraclePrices);
        spot[tokenMint] = { price: spotPrice.price, name: tokenName };
      }
      if (oracle && isNotNullPubkey(oracle) && twapChain && Scope.isScopeChainValid(twapChain)) {
        const twap = await this.scope.getPriceFromChain(twapChain, oraclePrices);
        twaps[tokenMint] = { price: twap.price, name: tokenName };
      }
    }
    return { spot, twap: twaps };
  }

  /**
   * Get all Scope/Pyth/Switchboard prices used by all the market reserves
   */
  async getAllPrices(): Promise<KlendPrices> {
    const klendPrices: KlendPrices = {
      scope: { spot: {}, twap: {} },
      pyth: { spot: {}, twap: {} },
      switchboard: { spot: {}, twap: {} },
    };
    const allOracleAccounts = await getAllOracleAccounts(
      this.connection,
      this.getReserves().map((x) => x.state)
    );
    const pythCache = new PubkeyHashMap<PublicKey, PythPrices>();
    const switchboardCache = new PubkeyHashMap<PublicKey, CandidatePrice>();
    const scopeCache = new PubkeyHashMap<PublicKey, OraclePrices>();

    const switchboardV2 = await SwitchboardProgram.loadMainnet(this.connection);

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
          spot: cacheOrGetSwitchboardPrice(switchboardSpotOracle, switchboardCache, allOracleAccounts, switchboardV2),
          twap: isNotNullPubkey(switchboardTwapOracle)
            ? cacheOrGetSwitchboardPrice(switchboardTwapOracle, switchboardCache, allOracleAccounts, switchboardV2)
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

  getCumulativeBorrowRatesByReserve(slot: number): Map<PublicKey, Decimal> {
    const cumulativeBorrowRates = new PubkeyHashMap<PublicKey, Decimal>();
    for (const reserve of this.reserves.values()) {
      cumulativeBorrowRates.set(reserve.address, reserve.getEstimatedCumulativeBorrowRate(slot));
    }
    return cumulativeBorrowRates;
  }

  getCollateralExchangeRatesByReserve(slot: number): Map<PublicKey, Decimal> {
    const collateralExchangeRates = new PubkeyHashMap<PublicKey, Decimal>();
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
}

export type KlendPrices = {
  scope: KaminoPrices;
  pyth: KaminoPrices;
  switchboard: KaminoPrices;
};

export async function getReservesForMarket(
  marketAddress: PublicKey,
  connection: Connection,
  programId: PublicKey
): Promise<Map<PublicKey, KaminoReserve>> {
  const reserves = await connection.getProgramAccounts(programId, {
    filters: [
      {
        dataSize: Reserve.layout.span + 8,
      },
      {
        memcmp: {
          offset: 32,
          bytes: marketAddress.toBase58(),
        },
      },
    ],
  });
  const deserializedReserves = reserves.map((reserve) => {
    if (reserve.account === null) {
      throw new Error(`Reserve account ${reserve.pubkey.toBase58()} does not exist`);
    }

    const reserveAccount = Reserve.decode(reserve.account.data);

    if (!reserveAccount) {
      throw Error(`Could not parse reserve ${reserve.pubkey.toBase58()}`);
    }
    return reserveAccount;
  });
  const allBuffers = reserves.map((reserve) => reserve.account);
  const reservesAndOracles = await getTokenOracleData(connection, deserializedReserves);
  const reservesByAddress = new PubkeyHashMap<PublicKey, KaminoReserve>();
  reservesAndOracles.forEach(([reserve, oracle], index) => {
    if (!oracle) {
      throw Error(`Could not find oracle for ${parseTokenSymbol(reserve.config.tokenInfo.name)} reserve`);
    }
    const kaminoReserve = KaminoReserve.initialize(
      allBuffers[index],
      reserves[index].pubkey,
      reserve,
      oracle,
      connection
    );
    reservesByAddress.set(kaminoReserve.address, kaminoReserve);
  });
  return reservesByAddress;
}

export async function getSingleReserve(
  reservePk: PublicKey,
  connection: Connection,
  accountData?: AccountInfo<Buffer>
): Promise<KaminoReserve> {
  const reserve = accountData ? accountData : await connection.getAccountInfo(reservePk);

  if (reserve === null) {
    throw new Error(`Reserve account ${reservePk.toBase58()} does not exist`);
  }

  const reserveAccount = Reserve.decode(reserve.data);

  if (!reserveAccount) {
    throw Error(`Could not parse reserve ${reservePk.toBase58()}`);
  }

  const reservesAndOracles = await getTokenOracleData(connection, [reserveAccount]);
  const [reserveState, oracle] = reservesAndOracles[0];

  if (!oracle) {
    throw Error(`Could not find oracle for ${parseTokenSymbol(reserveState.config.tokenInfo.name)} reserve`);
  }
  const kaminoReserve = KaminoReserve.initialize(reserve, reservePk, reserveState, oracle, connection);

  return kaminoReserve;
}

export function getReservesActive(reserves: Map<PublicKey, KaminoReserve>): Map<PublicKey, KaminoReserve> {
  const reservesActive = new PubkeyHashMap<PublicKey, KaminoReserve>();
  for (const [key, reserve] of reserves) {
    if (reserve.state.config.status === 0) {
      reservesActive.set(key, reserve);
    }
  }
  return reservesActive;
}

export async function getReserveFromMintAndMarket(
  connection: Connection,
  market: KaminoMarket,
  mint: string,
  programId: PublicKey = PROGRAM_ID
): Promise<[PublicKey, AccountInfo<Buffer>]> {
  const reserve = (
    await connection.getProgramAccounts(programId, {
      filters: [
        {
          dataSize: Reserve.layout.span + 8,
        },
        {
          memcmp: {
            offset: 32,
            bytes: market.address,
          },
        },
        {
          memcmp: {
            offset: 128,
            bytes: mint,
          },
        },
      ],
    })
  )[0];

  if (reserve.account === null) {
    throw new Error('Invalid account');
  }
  if (!reserve.account.owner.equals(programId)) {
    throw new Error("Account doesn't belong to this program");
  }

  return [reserve.pubkey, reserve.account];
}

const lamportsToNumberDecimal = (amount: Decimal.Value, decimals: number): Decimal => {
  const factor = 10 ** decimals;
  return new Decimal(amount).div(factor);
};
