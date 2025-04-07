import {
  Connection,
  PublicKey,
  RpcResponseAndContext,
  SimulatedTransactionResponse,
  SystemProgram,
  SYSVAR_INSTRUCTIONS_PUBKEY,
  SYSVAR_RENT_PUBKEY,
  Transaction,
  TransactionInstruction,
  TransactionSignature,
} from '@solana/web3.js';
import {
  ASSOCIATED_TOKEN_PROGRAM_ID,
  NATIVE_MINT,
  TOKEN_PROGRAM_ID,
  createCloseAccountInstruction,
  createSyncNativeInstruction,
} from '@solana/spl-token';
import BN from 'bn.js';
import Decimal from 'decimal.js';
import {
  borrowObligationLiquidity,
  depositAndWithdraw,
  borrowObligationLiquidityV2,
  depositObligationCollateral,
  depositObligationCollateralV2,
  depositReserveLiquidity,
  depositReserveLiquidityAndObligationCollateral,
  depositReserveLiquidityAndObligationCollateralV2,
  initObligation,
  initObligationFarmsForReserve,
  InitObligationFarmsForReserveAccounts,
  InitObligationFarmsForReserveArgs,
  initReferrerTokenState,
  initUserMetadata,
  liquidateObligationAndRedeemReserveCollateral,
  liquidateObligationAndRedeemReserveCollateralV2,
  redeemReserveCollateral,
  refreshObligation,
  refreshObligationFarmsForReserve,
  RefreshObligationFarmsForReserveAccounts,
  RefreshObligationFarmsForReserveArgs,
  refreshReserve,
  repayAndWithdrawAndRedeem,
  repayObligationLiquidity,
  repayObligationLiquidityV2,
  requestElevationGroup,
  RequestElevationGroupAccounts,
  RequestElevationGroupArgs,
  setObligationOrder,
  withdrawObligationCollateralAndRedeemReserveCollateral,
  withdrawObligationCollateralAndRedeemReserveCollateralV2,
  withdrawReferrerFees,
} from '../idl_codegen/instructions';
import {
  buildComputeBudgetIx,
  createAssociatedTokenAccountIdempotentInstruction,
  ObligationType,
  U64_MAX,
  referrerTokenStatePda,
  userMetadataPda,
  createLookupTableIx,
  isNotNullPubkey,
  PublicKeySet,
  getAssociatedTokenAddress,
  ScopePriceRefreshConfig,
  createAtasIdempotent,
  SOL_PADDING_FOR_INTEREST,
  obligationFarmStatePda,
} from '../utils';
import { getTokenIdsForScopeRefresh, KaminoMarket } from './market';
import { KaminoObligation } from './obligation';
import { KaminoReserve } from './reserve';
import { ReserveFarmKind } from '../idl_codegen/types';
import { farmsId } from '@kamino-finance/farms-sdk';
import { Reserve } from '../idl_codegen/accounts';
import { VanillaObligation } from '../utils/ObligationType';
import { PROGRAM_ID } from '../lib';
import { Scope } from '@kamino-finance/scope-sdk';
import { ObligationOrderAtIndex } from './obligationOrder';

export type ActionType =
  | 'deposit'
  | 'borrow'
  | 'withdraw'
  | 'repay'
  | 'mint'
  | 'redeem'
  | 'depositCollateral'
  | 'liquidate'
  | 'depositAndBorrow'
  | 'repayAndWithdraw'
  | 'refreshObligation'
  | 'requestElevationGroup'
  | 'withdrawReferrerFees'
  | 'repayAndWithdrawV2'
  | 'depositAndWithdraw';

export type AuxiliaryIx = 'setup' | 'inBetween' | 'cleanup';

export class KaminoAction {
  kaminoMarket: KaminoMarket;

  reserve: KaminoReserve;

  outflowReserve: KaminoReserve | undefined;

  owner: PublicKey;
  payer: PublicKey;

  obligation: KaminoObligation | null = null;

  referrer: PublicKey;

  /**
   * Null unless the obligation is not passed
   */
  obligationType: ObligationType | null = null;

  mint: PublicKey;

  secondaryMint?: PublicKey;

  positions?: number;

  amount: BN;
  outflowAmount?: BN;

  computeBudgetIxs: Array<TransactionInstruction>;
  computeBudgetIxsLabels: Array<string>;

  setupIxs: Array<TransactionInstruction>;
  setupIxsLabels: Array<string>;

  inBetweenIxs: Array<TransactionInstruction>;
  inBetweenIxsLabels: Array<string>;

  lendingIxs: Array<TransactionInstruction>;
  lendingIxsLabels: Array<string>;

  cleanupIxs: Array<TransactionInstruction>;
  cleanupIxsLabels: Array<string>;

  refreshFarmsCleanupTxnIxs: Array<TransactionInstruction>;
  refreshFarmsCleanupTxnIxsLabels: Array<string>;

  depositReserves: Array<PublicKey>;
  borrowReserves: Array<PublicKey>;

  preLoadedDepositReservesSameTx: Array<PublicKey>;

  currentSlot: number;

  private constructor(
    kaminoMarket: KaminoMarket,
    owner: PublicKey,
    obligation: KaminoObligation | ObligationType | null,
    mint: PublicKey,
    positions: number,
    amount: string | BN,
    depositReserves: Array<PublicKey>,
    borrowReserves: Array<PublicKey>,
    reserveState: KaminoReserve,
    currentSlot: number,
    secondaryMint?: PublicKey,
    outflowReserveState?: KaminoReserve,
    outflowAmount?: string | BN,
    referrer?: PublicKey,
    payer?: PublicKey
  ) {
    if (obligation instanceof KaminoObligation) {
      this.obligation = obligation;
    } else if (obligation !== null) {
      this.obligationType = obligation;
    }

    this.kaminoMarket = kaminoMarket;
    this.owner = owner;
    this.payer = payer ?? owner;
    this.amount = new BN(amount);
    this.mint = mint;
    this.positions = positions;
    this.computeBudgetIxs = [];
    this.computeBudgetIxsLabels = [];
    this.setupIxs = [];
    this.setupIxsLabels = [];
    this.inBetweenIxs = [];
    this.inBetweenIxsLabels = [];
    this.lendingIxs = [];
    this.lendingIxsLabels = [];
    this.cleanupIxs = [];
    this.cleanupIxsLabels = [];
    this.refreshFarmsCleanupTxnIxs = [];
    this.refreshFarmsCleanupTxnIxsLabels = [];
    this.depositReserves = depositReserves;
    this.borrowReserves = borrowReserves;
    this.secondaryMint = secondaryMint;
    this.reserve = reserveState;
    this.outflowReserve = outflowReserveState;
    this.outflowAmount = outflowAmount ? new BN(outflowAmount) : undefined;
    this.preLoadedDepositReservesSameTx = [];
    this.referrer = referrer ? referrer : PublicKey.default;
    this.currentSlot = currentSlot;
  }

  static async initialize(
    action: ActionType,
    amount: string | BN,
    mint: PublicKey,
    owner: PublicKey,
    kaminoMarket: KaminoMarket,
    obligation: KaminoObligation | ObligationType,
    referrer: PublicKey = PublicKey.default,
    currentSlot: number = 0,
    payer?: PublicKey
  ) {
    const reserve = kaminoMarket.getReserveByMint(mint);
    if (reserve === undefined) {
      throw new Error(`Reserve ${mint} not found in market ${kaminoMarket.getAddress().toBase58()}`);
    }

    const { kaminoObligation, depositReserves, borrowReserves, distinctReserveCount } =
      await KaminoAction.loadObligation(action, kaminoMarket, owner, reserve.address, obligation);

    const referrerKey = await this.getReferrerKey(kaminoMarket, owner, kaminoObligation, referrer);

    return new KaminoAction(
      kaminoMarket,
      owner,
      kaminoObligation || obligation,
      mint,
      distinctReserveCount,
      amount,
      depositReserves,
      borrowReserves,
      reserve,
      currentSlot,
      undefined,
      undefined,
      undefined,
      referrerKey,
      payer
    );
  }

  private static getUserAccountAddresses(owner: PublicKey, reserve: Reserve) {
    const userTokenAccountAddress = getAssociatedTokenAddress(
      reserve.liquidity.mintPubkey,
      owner,
      true,
      reserve.liquidity.tokenProgram,
      ASSOCIATED_TOKEN_PROGRAM_ID
    );
    const userCollateralAccountAddress = getAssociatedTokenAddress(
      reserve.collateral.mintPubkey,
      owner,
      true,
      TOKEN_PROGRAM_ID,
      ASSOCIATED_TOKEN_PROGRAM_ID
    );

    return { userTokenAccountAddress, userCollateralAccountAddress };
  }

  private static async loadObligation(
    action: ActionType,
    kaminoMarket: KaminoMarket,
    owner: PublicKey,
    reserve: PublicKey,
    obligation: KaminoObligation | ObligationType,
    outflowReserve?: PublicKey
  ) {
    let kaminoObligation: KaminoObligation | null;
    const depositReserves: Array<PublicKey> = [];
    const borrowReserves: Array<PublicKey> = [];
    if (obligation instanceof KaminoObligation) {
      kaminoObligation = obligation;
    } else {
      const obligationAddress = obligation.toPda(kaminoMarket.getAddress(), owner);
      kaminoObligation = await KaminoObligation.load(kaminoMarket, obligationAddress);
    }
    if (kaminoObligation !== null) {
      depositReserves.push(...[...kaminoObligation.deposits.keys()]);
      borrowReserves.push(...[...kaminoObligation.borrows.keys()]);
    }

    if (!outflowReserve && action === 'depositAndBorrow') {
      throw new Error(`Outflow reserve has not been set for depositAndBorrow`);
    }

    // Union of addresses
    const distinctReserveCount =
      new PublicKeySet<PublicKey>([
        ...borrowReserves.map((e) => e),
        ...(action === 'borrow' ? [reserve] : []),
        ...(action === 'depositAndBorrow' ? [reserve] : []),
      ]).toArray().length +
      new PublicKeySet<PublicKey>([
        ...depositReserves.map((e) => e),
        ...(action === 'deposit' ? [reserve] : []),
        ...(action === 'depositAndBorrow' ? [outflowReserve!] : []),
      ]).toArray().length;

    return {
      kaminoObligation,
      depositReserves,
      borrowReserves,
      distinctReserveCount,
    };
  }

  static async buildRefreshObligationTxns(
    kaminoMarket: KaminoMarket,
    payer: PublicKey,
    obligation: KaminoObligation,
    extraComputeBudget: number = 1_000_000, // if > 0 then adds the ixn
    currentSlot: number = 0
  ) {
    //  placeholder for action initialization
    const firstReserve = obligation.getDeposits()[0].reserveAddress;
    const firstKaminoReserve = kaminoMarket.getReserveByAddress(firstReserve);
    if (!firstKaminoReserve) {
      throw new Error(`Reserve ${firstReserve.toBase58()} not found`);
    }
    const axn = await KaminoAction.initialize(
      'refreshObligation',
      '0',
      firstKaminoReserve?.getLiquidityMint(),
      obligation.state.owner,
      kaminoMarket,
      obligation,
      undefined,
      currentSlot
    );

    if (extraComputeBudget > 0) {
      axn.addComputeBudgetIxn(extraComputeBudget);
    }

    axn.addRefreshObligation(payer);

    return axn;
  }

  static async buildRequestElevationGroupTxns(
    kaminoMarket: KaminoMarket,
    payer: PublicKey,
    obligation: KaminoObligation,
    elevationGroup: number,
    extraComputeBudget: number = 1_000_000, // if > 0 then adds the ixn
    currentSlot: number = 0
  ) {
    const firstReserve = obligation.state.deposits.find(
      (x) => !x.depositReserve.equals(PublicKey.default)
    )!.depositReserve;
    const firstKaminoReserve = kaminoMarket.getReserveByAddress(firstReserve);
    if (!firstKaminoReserve) {
      throw new Error(`Reserve ${firstReserve.toBase58()} not found`);
    }
    const axn = await KaminoAction.initialize(
      'requestElevationGroup',
      '0',
      firstKaminoReserve?.getLiquidityMint(),
      obligation.state.owner,
      kaminoMarket,
      obligation,
      undefined,
      currentSlot
    );

    if (extraComputeBudget > 0) {
      axn.addComputeBudgetIxn(extraComputeBudget);
    }

    axn.addRefreshObligation(payer);
    axn.addRequestElevationIx(elevationGroup, 'setup');

    return axn;
  }

  static async buildDepositTxns(
    kaminoMarket: KaminoMarket,
    amount: string | BN,
    mint: PublicKey,
    owner: PublicKey,
    obligation: KaminoObligation | ObligationType,
    useV2Ixs: boolean,
    scopeRefreshConfig: ScopePriceRefreshConfig | undefined,
    extraComputeBudget: number = 1_000_000, // if > 0 then adds the ixn
    includeAtaIxns: boolean = true, // if true it includes create and close wsol and token atas,
    requestElevationGroup: boolean = false, // to be requested *before* the deposit
    initUserMetadata: { skipInitialization: boolean; skipLutCreation: boolean } = {
      skipInitialization: false,
      skipLutCreation: false,
    },
    referrer: PublicKey = PublicKey.default,
    currentSlot: number = 0,
    overrideElevationGroupRequest: number | undefined = undefined // if set, when an elevationgroup request is made, it will use this value
  ) {
    const axn = await KaminoAction.initialize(
      'deposit',
      amount,
      mint,
      owner,
      kaminoMarket,
      obligation,
      referrer,
      currentSlot
    );
    const addInitObligationForFarm = true;

    if (extraComputeBudget > 0) {
      axn.addComputeBudgetIxn(extraComputeBudget);
    }

    await axn.addSupportIxs(
      'deposit',
      includeAtaIxns,
      requestElevationGroup,
      addInitObligationForFarm,
      useV2Ixs,
      scopeRefreshConfig,
      initUserMetadata,
      undefined,
      overrideElevationGroupRequest
    );
    if (useV2Ixs) {
      axn.addDepositIxV2();
    } else {
      axn.addDepositIx();
    }
    axn.addRefreshFarmsCleanupTxnIxsToCleanupIxs();

    return axn;
  }

  async addScopeRefreshIxs(scope: Scope, tokens: number[], feed: string = 'hubble') {
    this.setupIxsLabels.unshift(`refreshScopePrices`);
    this.setupIxs.unshift(
      await scope.refreshPriceListIx(
        {
          feed: feed,
        },
        tokens
      )
    );
  }

  static async buildBorrowTxns(
    kaminoMarket: KaminoMarket,
    amount: string | BN,
    mint: PublicKey,
    owner: PublicKey,
    obligation: KaminoObligation | ObligationType,
    useV2Ixs: boolean,
    scopeRefreshConfig: ScopePriceRefreshConfig | undefined,
    extraComputeBudget: number = 1_000_000, // if > 0 then adds the ixn
    includeAtaIxns: boolean = true, // if true it includes create and close wsol and token atas,
    requestElevationGroup: boolean = false,
    initUserMetadata: { skipInitialization: boolean; skipLutCreation: boolean } = {
      skipInitialization: false,
      skipLutCreation: false,
    },
    referrer: PublicKey = PublicKey.default,
    currentSlot: number = 0,
    overrideElevationGroupRequest: number | undefined = undefined // if set, when an elevationgroup request is made, it will use this value
  ) {
    const axn = await KaminoAction.initialize(
      'borrow',
      amount,
      mint,
      owner,
      kaminoMarket,
      obligation,
      referrer,
      currentSlot
    );
    const addInitObligationForFarm = true;
    if (extraComputeBudget > 0) {
      axn.addComputeBudgetIxn(extraComputeBudget);
    }

    if (!axn.referrer.equals(PublicKey.default)) {
      const referrerTokenState = referrerTokenStatePda(
        axn.referrer,
        axn.reserve.address,
        axn.kaminoMarket.programId
      )[0];
      const account = await axn.kaminoMarket.getConnection().getAccountInfo(referrerTokenState);
      if (!account) {
        axn.addInitReferrerTokenStateIx(axn.reserve, referrerTokenState);
      }
    }

    await axn.addSupportIxs(
      'borrow',
      includeAtaIxns,
      requestElevationGroup,
      addInitObligationForFarm,
      useV2Ixs,
      scopeRefreshConfig,
      initUserMetadata,
      undefined,
      overrideElevationGroupRequest
    );
    if (useV2Ixs) {
      axn.addBorrowIxV2();
    } else {
      axn.addBorrowIx();
    }
    axn.addRefreshFarmsCleanupTxnIxsToCleanupIxs();

    return axn;
  }

  static async buildDepositReserveLiquidityTxns(
    kaminoMarket: KaminoMarket,
    amount: string | BN,
    mint: PublicKey,
    owner: PublicKey,
    obligation: KaminoObligation | ObligationType,
    scopeRefreshConfig: ScopePriceRefreshConfig | undefined,
    extraComputeBudget: number = 1_000_000, // if > 0 then adds the ixn
    includeAtaIxns: boolean = true, // if true it includes create and close wsol and token atas
    requestElevationGroup: boolean = false,
    referrer: PublicKey = PublicKey.default,
    currentSlot: number = 0
  ) {
    const axn = await KaminoAction.initialize(
      'mint',
      amount,
      mint,
      owner,
      kaminoMarket,
      obligation,
      referrer,
      currentSlot
    );
    const addInitObligationForFarm = true;

    if (extraComputeBudget > 0) {
      axn.addComputeBudgetIxn(extraComputeBudget);
    }

    await axn.addSupportIxs(
      'mint',
      includeAtaIxns,
      requestElevationGroup,
      false,
      addInitObligationForFarm,
      scopeRefreshConfig,
      { skipInitialization: true, skipLutCreation: true }
    );
    axn.addDepositReserveLiquidityIx();
    axn.addRefreshFarmsCleanupTxnIxsToCleanupIxs();
    return axn;
  }

  static async buildRedeemReserveCollateralTxns(
    kaminoMarket: KaminoMarket,
    amount: string | BN,
    mint: PublicKey,
    owner: PublicKey,
    obligation: KaminoObligation | ObligationType,
    scopeRefreshConfig: ScopePriceRefreshConfig | undefined,
    extraComputeBudget: number = 1_000_000, // if > 0 then adds the ixn
    includeAtaIxns: boolean = true, // if true it includes create and close wsol and token atas
    requestElevationGroup: boolean = false,
    referrer: PublicKey = PublicKey.default,
    currentSlot: number = 0
  ) {
    const axn = await KaminoAction.initialize(
      'redeem',
      amount,
      mint,
      owner,
      kaminoMarket,
      obligation,
      referrer,
      currentSlot
    );
    const addInitObligationForFarm = true;

    if (extraComputeBudget > 0) {
      axn.addComputeBudgetIxn(extraComputeBudget);
    }

    await axn.addSupportIxs(
      'redeem',
      includeAtaIxns,
      requestElevationGroup,
      false,
      addInitObligationForFarm,
      scopeRefreshConfig,
      { skipInitialization: true, skipLutCreation: true }
    );
    axn.addRedeemReserveCollateralIx();
    axn.addRefreshFarmsCleanupTxnIxsToCleanupIxs();
    return axn;
  }

  static async buildDepositObligationCollateralTxns(
    kaminoMarket: KaminoMarket,
    amount: string | BN,
    mint: PublicKey,
    owner: PublicKey,
    obligation: KaminoObligation | ObligationType,
    useV2Ixs: boolean,
    scopeRefreshConfig: ScopePriceRefreshConfig | undefined,
    extraComputeBudget: number = 1_000_000, // if > 0 then adds the ixn
    includeAtaIxns: boolean = true, // if true it includes create and close wsol and token atas
    requestElevationGroup: boolean = false,
    initUserMetadata: { skipInitialization: boolean; skipLutCreation: boolean } = {
      skipInitialization: false,
      skipLutCreation: false,
    },
    referrer: PublicKey = PublicKey.default,
    currentSlot: number = 0
  ) {
    const axn = await KaminoAction.initialize(
      'depositCollateral',
      amount,
      mint,
      owner,
      kaminoMarket,
      obligation,
      referrer,
      currentSlot
    );
    const addInitObligationForFarm = true;

    if (extraComputeBudget > 0) {
      axn.addComputeBudgetIxn(extraComputeBudget);
    }

    await axn.addSupportIxs(
      'depositCollateral',
      includeAtaIxns,
      requestElevationGroup,
      addInitObligationForFarm,
      useV2Ixs,
      scopeRefreshConfig,
      initUserMetadata
    );
    if (useV2Ixs) {
      axn.addDepositObligationCollateralIxV2();
    } else {
      axn.addDepositObligationCollateralIx();
    }
    axn.addRefreshFarmsCleanupTxnIxsToCleanupIxs();
    return axn;
  }

  static async buildDepositAndBorrowTxns(
    kaminoMarket: KaminoMarket,
    depositAmount: string | BN,
    depositMint: PublicKey,
    borrowAmount: string | BN,
    borrowMint: PublicKey,
    payer: PublicKey,
    obligation: KaminoObligation | ObligationType,
    useV2Ixs: boolean,
    scopeRefreshConfig: ScopePriceRefreshConfig | undefined,
    extraComputeBudget: number = 1_000_000, // if > 0 then adds the ixn
    includeAtaIxns: boolean = true, // if true it includes create and close wsol and token atas,
    requestElevationGroup: boolean = false,
    initUserMetadata: { skipInitialization: boolean; skipLutCreation: boolean } = {
      skipInitialization: false,
      skipLutCreation: false,
    },
    referrer: PublicKey = PublicKey.default,
    currentSlot: number = 0
  ) {
    const axn = await KaminoAction.initializeMultiTokenAction(
      kaminoMarket,
      'depositAndBorrow',
      depositAmount,
      depositMint,
      borrowMint,
      payer,
      payer,
      obligation,
      borrowAmount,
      referrer,
      currentSlot
    );
    const addInitObligationForFarmForDeposit = true;
    const addInitObligationForFarmForBorrow = false;
    const twoTokenAction = true;

    if (extraComputeBudget > 0) {
      axn.addComputeBudgetIxn(extraComputeBudget);
    }

    if (!axn.referrer.equals(PublicKey.default)) {
      const referrerTokenState = referrerTokenStatePda(
        axn.referrer,
        axn.outflowReserve!.address,
        axn.kaminoMarket.programId
      )[0];
      const account = await axn.kaminoMarket.getConnection().getAccountInfo(referrerTokenState);
      if (!account) {
        axn.addInitReferrerTokenStateIx(axn.outflowReserve!, referrerTokenState);
      }
    }
    await axn.addSupportIxs(
      'deposit',
      includeAtaIxns,
      requestElevationGroup,
      addInitObligationForFarmForDeposit,
      useV2Ixs,
      undefined,
      initUserMetadata,
      twoTokenAction
    );

    if (useV2Ixs) {
      await axn.addDepositAndBorrowIxV2();
    } else {
      await axn.addDepositAndBorrowIx();
    }
    await axn.addInBetweenIxs(
      'depositAndBorrow',
      includeAtaIxns,
      requestElevationGroup,
      addInitObligationForFarmForBorrow,
      useV2Ixs
    );
    axn.addRefreshFarmsCleanupTxnIxsToCleanupIxs();

    // Create the scope refresh ixn in here to ensure it's the first ixn in the txn
    const allReserves = new PublicKeySet<PublicKey>([
      ...axn.depositReserves,
      ...axn.borrowReserves,
      axn.reserve.address,
      ...(axn.outflowReserve ? [axn.outflowReserve.address] : []),
      ...(axn.preLoadedDepositReservesSameTx ? axn.preLoadedDepositReservesSameTx : []),
    ]).toArray();
    const tokenIds = getTokenIdsForScopeRefresh(axn.kaminoMarket, allReserves);

    if (tokenIds.length > 0 && scopeRefreshConfig) {
      await axn.addScopeRefreshIxs(scopeRefreshConfig.scope, tokenIds, scopeRefreshConfig.scopeFeed);
    }
    return axn;
  }

  static async buildDepositAndWithdrawV2Txns(
    kaminoMarket: KaminoMarket,
    depositAmount: string | BN,
    depositMint: PublicKey,
    withdrawAmount: string | BN,
    withdrawMint: PublicKey,
    payer: PublicKey,
    currentSlot: number,
    obligation: KaminoObligation | ObligationType,
    scopeRefreshConfig: ScopePriceRefreshConfig | undefined,
    extraComputeBudget: number = 1_000_000, // if > 0 then adds the ixn
    includeAtaIxns: boolean = true, // if true it includes create and close wsol and token atas,
    requestElevationGroup: boolean = false,
    initUserMetadata: { skipInitialization: boolean; skipLutCreation: boolean } = {
      skipInitialization: false,
      skipLutCreation: false,
    },
    referrer: PublicKey = PublicKey.default
  ) {
    const axn = await KaminoAction.initializeMultiTokenAction(
      kaminoMarket,
      'depositAndWithdraw',
      depositAmount,
      depositMint,
      withdrawMint,
      payer,
      payer,
      obligation,
      withdrawAmount,
      referrer,
      currentSlot
    );
    const addInitObligationForFarm = true;
    const twoTokenAction = true;
    if (extraComputeBudget > 0) {
      axn.addComputeBudgetIxn(extraComputeBudget);
    }

    await axn.addSupportIxs(
      'depositAndWithdraw',
      includeAtaIxns,
      requestElevationGroup,
      addInitObligationForFarm,
      true,
      scopeRefreshConfig,
      initUserMetadata,
      twoTokenAction
    );
    const withdrawCollateralAmount = axn.getWithdrawCollateralAmount(axn.outflowReserve!, axn.outflowAmount!);
    axn.addDepositAndWithdrawV2Ixs(withdrawCollateralAmount);

    return axn;
  }

  static async buildRepayAndWithdrawV2Txns(
    kaminoMarket: KaminoMarket,
    repayAmount: string | BN,
    repayMint: PublicKey,
    withdrawAmount: string | BN,
    withdrawMint: PublicKey,
    payer: PublicKey,
    currentSlot: number,
    obligation: KaminoObligation | ObligationType,
    scopeRefreshConfig: ScopePriceRefreshConfig | undefined,
    extraComputeBudget: number = 1_000_000, // if > 0 then adds the ixn
    includeAtaIxns: boolean = true, // if true it includes create and close wsol and token atas,
    requestElevationGroup: boolean = false,
    initUserMetadata: { skipInitialization: boolean; skipLutCreation: boolean } = {
      skipInitialization: false,
      skipLutCreation: false,
    },
    referrer: PublicKey = PublicKey.default
  ) {
    const axn = await KaminoAction.initializeMultiTokenAction(
      kaminoMarket,
      'repayAndWithdrawV2',
      repayAmount,
      repayMint,
      withdrawMint,
      payer,
      payer,
      obligation,
      withdrawAmount,
      referrer,
      currentSlot
    );
    const addInitObligationForFarm = true;
    const twoTokenAction = true;
    if (extraComputeBudget > 0) {
      axn.addComputeBudgetIxn(extraComputeBudget);
    }

    await axn.addSupportIxs(
      'repayAndWithdrawV2',
      includeAtaIxns,
      requestElevationGroup,
      addInitObligationForFarm,
      true,
      scopeRefreshConfig,
      initUserMetadata,
      twoTokenAction
    );
    const withdrawCollateralAmount = axn.getWithdrawCollateralAmount(axn.outflowReserve!, axn.outflowAmount!);
    axn.addRepayAndWithdrawV2Ixs(withdrawCollateralAmount);

    return axn;
  }

  static async buildRepayAndWithdrawTxns(
    kaminoMarket: KaminoMarket,
    repayAmount: string | BN,
    repayMint: PublicKey,
    withdrawAmount: string | BN,
    withdrawMint: PublicKey,
    payer: PublicKey,
    currentSlot: number,
    obligation: KaminoObligation | ObligationType,
    useV2Ixs: boolean,
    scopeRefreshConfig: ScopePriceRefreshConfig | undefined,
    extraComputeBudget: number = 1_000_000, // if > 0 then adds the ixn
    includeAtaIxns: boolean = true, // if true it includes create and close wsol and token atas,
    requestElevationGroup: boolean = false,
    initUserMetadata: { skipInitialization: boolean; skipLutCreation: boolean } = {
      skipInitialization: false,
      skipLutCreation: false,
    },
    referrer: PublicKey = PublicKey.default
  ) {
    const axn = await KaminoAction.initializeMultiTokenAction(
      kaminoMarket,
      'repayAndWithdraw',
      repayAmount,
      repayMint,
      withdrawMint,
      payer,
      payer,
      obligation,
      withdrawAmount,
      referrer,
      currentSlot
    );
    const addInitObligationForFarmForRepay = true;
    const addInitObligationForFarmForWithdraw = false;
    const twoTokenAction = true;
    if (extraComputeBudget > 0) {
      axn.addComputeBudgetIxn(extraComputeBudget);
    }

    await axn.addSupportIxs(
      'repay',
      includeAtaIxns,
      requestElevationGroup,
      addInitObligationForFarmForRepay,
      useV2Ixs,
      undefined,
      initUserMetadata,
      twoTokenAction
    );

    const withdrawCollateralAmount = axn.getWithdrawCollateralAmount(axn.outflowReserve!, axn.outflowAmount!);
    if (useV2Ixs) {
      await axn.addRepayAndWithdrawIxsV2(withdrawCollateralAmount);
    } else {
      await axn.addRepayAndWithdrawIxs(withdrawCollateralAmount);
    }

    await axn.addInBetweenIxs(
      'repayAndWithdraw',
      includeAtaIxns,
      requestElevationGroup,
      addInitObligationForFarmForWithdraw,
      useV2Ixs
    );
    axn.addRefreshFarmsCleanupTxnIxsToCleanupIxs();
    // Create the scope refresh ixn in here to ensure it's the first ixn in the txn
    const allReserves = new PublicKeySet<PublicKey>([
      ...axn.depositReserves,
      ...axn.borrowReserves,
      axn.reserve.address,
      ...(axn.outflowReserve ? [axn.outflowReserve.address] : []),
      ...(axn.preLoadedDepositReservesSameTx ? axn.preLoadedDepositReservesSameTx : []),
    ]).toArray();
    const tokenIds = getTokenIdsForScopeRefresh(axn.kaminoMarket, allReserves);

    if (tokenIds.length > 0 && scopeRefreshConfig) {
      await axn.addScopeRefreshIxs(scopeRefreshConfig.scope, tokenIds, scopeRefreshConfig.scopeFeed);
    }
    return axn;
  }

  static async buildWithdrawTxns(
    kaminoMarket: KaminoMarket,
    amount: string | BN,
    mint: PublicKey,
    owner: PublicKey,
    obligation: KaminoObligation | ObligationType,
    useV2Ixs: boolean,
    scopeRefreshConfig: ScopePriceRefreshConfig | undefined,
    extraComputeBudget: number = 1_000_000, // if > 0 then adds the ixn
    includeAtaIxns: boolean = true, // if true it includes create and close wsol and token atas,
    requestElevationGroup: boolean = false, // to be requested *after* the withdraw
    initUserMetadata: { skipInitialization: boolean; skipLutCreation: boolean } = {
      skipInitialization: false,
      skipLutCreation: false,
    },
    referrer: PublicKey = PublicKey.default,
    currentSlot: number = 0,
    overrideElevationGroupRequest?: number,
    // Optional customizations which may be needed if the obligation was mutated by some previous ixn.
    obligationCustomizations?: {
      // Any newly-added deposit reserves.
      addedDepositReserves?: PublicKey[];
    }
  ) {
    const axn = await KaminoAction.initialize(
      'withdraw',
      amount,
      mint,
      owner,
      kaminoMarket,
      obligation,
      referrer,
      currentSlot
    );
    const addInitObligationForFarm = true;

    if (extraComputeBudget > 0) {
      axn.addComputeBudgetIxn(extraComputeBudget);
    }

    axn.depositReserves.push(...(obligationCustomizations?.addedDepositReserves || []));

    await axn.addSupportIxs(
      'withdraw',
      includeAtaIxns,
      requestElevationGroup,
      addInitObligationForFarm,
      useV2Ixs,
      scopeRefreshConfig,
      initUserMetadata,
      false,
      overrideElevationGroupRequest
    );

    const collateralAmount = axn.getWithdrawCollateralAmount(axn.reserve, axn.amount);
    if (useV2Ixs) {
      await axn.addWithdrawIxV2(collateralAmount);
    } else {
      await axn.addWithdrawIx(collateralAmount);
    }

    axn.addRefreshFarmsCleanupTxnIxsToCleanupIxs();

    return axn;
  }

  /**
   *
   * @param kaminoMarket
   * @param amount
   * @param mint
   * @param owner
   * @param obligation - obligation to repay or the PDA seeds
   * @param currentSlot
   * @param payer - if not set then owner is used
   * @param extraComputeBudget - if > 0 then adds the ixn
   * @param includeAtaIxns - if true it includes create and close wsol and token atas
   * @param requestElevationGroup
   * @param includeUserMetadata - if true it includes user metadata
   * @param referrer
   */
  static async buildRepayTxns(
    kaminoMarket: KaminoMarket,
    amount: string | BN,
    mint: PublicKey,
    owner: PublicKey,
    obligation: KaminoObligation | ObligationType,
    useV2Ixs: boolean,
    scopeRefreshConfig: ScopePriceRefreshConfig | undefined,
    currentSlot: number,
    payer: PublicKey | undefined = undefined,
    extraComputeBudget: number = 1_000_000,
    includeAtaIxns: boolean = true,
    requestElevationGroup: boolean = false,
    initUserMetadata: { skipInitialization: boolean; skipLutCreation: boolean } = {
      skipInitialization: false,
      skipLutCreation: false,
    },
    referrer: PublicKey = PublicKey.default
  ) {
    const axn = await KaminoAction.initialize(
      'repay',
      amount,
      mint,
      owner,
      kaminoMarket,
      obligation,
      referrer,
      currentSlot,
      payer
    );
    const addInitObligationForFarm = true;

    if (extraComputeBudget > 0) {
      axn.addComputeBudgetIxn(extraComputeBudget);
    }

    await axn.addSupportIxs(
      'repay',
      includeAtaIxns,
      requestElevationGroup,
      addInitObligationForFarm,
      useV2Ixs,
      scopeRefreshConfig,
      initUserMetadata
    );
    if (useV2Ixs) {
      await axn.addRepayIxV2();
    } else {
      await axn.addRepayIx();
    }
    axn.addRefreshFarmsCleanupTxnIxsToCleanupIxs();

    return axn;
  }

  static async buildLiquidateTxns(
    kaminoMarket: KaminoMarket,
    amount: string | BN,
    minCollateralReceiveAmount: string | BN,
    repayTokenMint: PublicKey,
    withdrawTokenMint: PublicKey,
    liquidator: PublicKey,
    obligationOwner: PublicKey,
    obligation: KaminoObligation | ObligationType,
    useV2Ixs: boolean,
    scopeRefreshConfig: ScopePriceRefreshConfig | undefined = undefined,
    extraComputeBudget: number = 1_000_000, // if > 0 then adds the ixn
    includeAtaIxns: boolean = true, // if true it includes create and close wsol and token atas, and creates all other token atas if they don't exist
    requestElevationGroup: boolean = false,
    initUserMetadata: { skipInitialization: boolean; skipLutCreation: boolean } = {
      skipInitialization: false,
      skipLutCreation: false,
    },
    referrer: PublicKey = PublicKey.default,
    maxAllowedLtvOverridePercent: number = 0,
    currentSlot: number = 0
  ) {
    const axn = await KaminoAction.initializeMultiTokenAction(
      kaminoMarket,
      'liquidate',
      amount,
      repayTokenMint,
      withdrawTokenMint,
      liquidator,
      obligationOwner,
      obligation,
      minCollateralReceiveAmount,
      referrer,
      currentSlot
    );
    const addInitObligationForFarm = true;

    if (extraComputeBudget > 0) {
      axn.addComputeBudgetIxn(extraComputeBudget);
    }

    await axn.addSupportIxs(
      'liquidate',
      includeAtaIxns,
      requestElevationGroup,
      addInitObligationForFarm,
      useV2Ixs,
      scopeRefreshConfig,
      initUserMetadata
    );
    if (useV2Ixs) {
      await axn.addLiquidateIxV2(maxAllowedLtvOverridePercent);
    } else {
      await axn.addLiquidateIx(maxAllowedLtvOverridePercent);
    }
    axn.addRefreshFarmsCleanupTxnIxsToCleanupIxs();

    return axn;
  }

  static async buildWithdrawReferrerFeeTxns(
    owner: PublicKey,
    tokenMint: PublicKey,
    kaminoMarket: KaminoMarket,
    currentSlot: number = 0
  ) {
    const { axn, createAtaIxs } = await KaminoAction.initializeWithdrawReferrerFees(
      tokenMint,
      owner,
      kaminoMarket,
      currentSlot
    );

    axn.setupIxs.push(...createAtaIxs);
    axn.setupIxsLabels.push(`createAtasIxs[${axn.owner.toString()}]`);

    if (!axn.referrer.equals(PublicKey.default)) {
      const referrerTokenState = referrerTokenStatePda(
        axn.referrer,
        axn.reserve.address,
        axn.kaminoMarket.programId
      )[0];
      const account = await axn.kaminoMarket.getConnection().getAccountInfo(referrerTokenState);
      if (!account) {
        axn.addInitReferrerTokenStateIx(axn.reserve, referrerTokenState);
      }
    }
    axn.addRefreshReserveIxs([axn.reserve.address]);
    axn.addWithdrawReferrerFeesIxs();

    return axn;
  }

  /**
   * Builds an instruction for setting the new state of one of the given obligation's orders.
   *
   * In other words: it will overwrite the given slot in the {@link Obligation.orders} array. This possibly includes
   * setting the `null` state (i.e. cancelling the order).
   */
  static buildSetObligationOrderIxn(
    kaminoMarket: KaminoMarket,
    obligation: KaminoObligation,
    orderAtIndex: ObligationOrderAtIndex
  ): TransactionInstruction {
    return setObligationOrder(
      {
        index: orderAtIndex.index,
        order: orderAtIndex.orderState(),
      },
      {
        lendingMarket: kaminoMarket.getAddress(),
        obligation: obligation.obligationAddress,
        owner: obligation.state.owner,
      },
      kaminoMarket.programId
    );
  }

  async getTransactions() {
    let txns: Transaction;

    if (this.lendingIxs.length === 2) {
      txns = new Transaction({
        feePayer: this.owner,
        recentBlockhash: (await this.kaminoMarket.getConnection().getLatestBlockhash()).blockhash,
      }).add(
        ...this.setupIxs,
        ...[this.lendingIxs[0]],
        ...this.inBetweenIxs,
        ...[this.lendingIxs[1]],
        ...this.cleanupIxs
      );
    } else {
      txns = new Transaction({
        feePayer: this.owner,
        recentBlockhash: (await this.kaminoMarket.getConnection().getLatestBlockhash()).blockhash,
      }).add(...this.setupIxs, ...this.lendingIxs, ...this.cleanupIxs);
    }

    return txns;
  }

  async sendTransactions(sendTransaction: (txn: Transaction, connection: Connection) => Promise<TransactionSignature>) {
    const txns = await this.getTransactions();

    const signature = await this.sendSingleTransaction(txns, sendTransaction);

    return signature;
  }

  private async sendSingleTransaction(
    txn: Transaction | null,
    sendTransaction: (txn: Transaction, connection: Connection) => Promise<TransactionSignature>
  ) {
    if (!txn) return '';

    const signature = await sendTransaction(txn, this.kaminoMarket.getConnection());
    await this.kaminoMarket.getConnection().confirmTransaction(signature);

    return signature;
  }

  async simulateTransactions(
    sendTransaction: (
      txn: Transaction,
      connection: Connection
    ) => Promise<RpcResponseAndContext<SimulatedTransactionResponse>>
  ) {
    const txns = await this.getTransactions();

    const signature = await this.simulateSingleTransaction(txns, sendTransaction);

    return signature;
  }

  private async simulateSingleTransaction(
    txn: Transaction | null,
    sendTransaction: (
      txn: Transaction,
      connection: Connection
    ) => Promise<RpcResponseAndContext<SimulatedTransactionResponse>>
  ) {
    if (!txn) return '';
    return await sendTransaction(txn, this.kaminoMarket.getConnection());
  }

  addDepositReserveLiquidityIx() {
    this.lendingIxsLabels.push(`depositReserveLiquidity`);
    this.lendingIxs.push(
      depositReserveLiquidity(
        {
          liquidityAmount: this.amount,
        },
        {
          owner: this.owner,
          lendingMarket: this.kaminoMarket.getAddress(),
          lendingMarketAuthority: this.kaminoMarket.getLendingMarketAuthority(),
          reserve: this.reserve.address,
          reserveLiquidityMint: this.reserve.getLiquidityMint(),
          reserveLiquiditySupply: this.reserve.state.liquidity.supplyVault,
          reserveCollateralMint: this.reserve.getCTokenMint(),
          userSourceLiquidity: this.getUserTokenAccountAddress(this.reserve),
          userDestinationCollateral: this.getUserCollateralAccountAddress(this.reserve),
          collateralTokenProgram: TOKEN_PROGRAM_ID,
          liquidityTokenProgram: this.reserve.getLiquidityTokenProgram(),
          instructionSysvarAccount: SYSVAR_INSTRUCTIONS_PUBKEY,
        },
        this.kaminoMarket.programId
      )
    );
  }

  addRedeemReserveCollateralIx() {
    this.lendingIxsLabels.push(`redeemReserveCollateral`);
    this.lendingIxs.push(
      redeemReserveCollateral(
        {
          collateralAmount: this.amount,
        },
        {
          owner: this.owner,
          lendingMarket: this.kaminoMarket.getAddress(),
          lendingMarketAuthority: this.kaminoMarket.getLendingMarketAuthority(),
          reserve: this.reserve.address,
          reserveLiquidityMint: this.reserve.getLiquidityMint(),
          reserveLiquiditySupply: this.reserve.state.liquidity.supplyVault,
          reserveCollateralMint: this.reserve.getCTokenMint(),
          userSourceCollateral: this.getUserCollateralAccountAddress(this.reserve),
          userDestinationLiquidity: this.getUserTokenAccountAddress(this.reserve),
          collateralTokenProgram: TOKEN_PROGRAM_ID,
          liquidityTokenProgram: this.reserve.getLiquidityTokenProgram(),
          instructionSysvarAccount: SYSVAR_INSTRUCTIONS_PUBKEY,
        },
        this.kaminoMarket.programId
      )
    );
  }

  // @deprecated -- use addDepositIxV2 instead
  addDepositIx() {
    this.lendingIxsLabels.push(`depositReserveLiquidityAndObligationCollateral`);
    this.lendingIxs.push(
      depositReserveLiquidityAndObligationCollateral(
        {
          liquidityAmount: this.amount,
        },
        {
          owner: this.owner,
          obligation: this.getObligationPda(),
          lendingMarket: this.kaminoMarket.getAddress(),
          lendingMarketAuthority: this.kaminoMarket.getLendingMarketAuthority(),
          reserve: this.reserve.address,
          reserveLiquidityMint: this.reserve.getLiquidityMint(),
          reserveLiquiditySupply: this.reserve.state.liquidity.supplyVault,
          reserveCollateralMint: this.reserve.getCTokenMint(),
          reserveDestinationDepositCollateral: this.reserve.state.collateral.supplyVault, // destinationCollateral
          userSourceLiquidity: this.getUserTokenAccountAddress(this.reserve),
          placeholderUserDestinationCollateral: this.kaminoMarket.programId,
          collateralTokenProgram: TOKEN_PROGRAM_ID,
          liquidityTokenProgram: this.reserve.getLiquidityTokenProgram(),
          instructionSysvarAccount: SYSVAR_INSTRUCTIONS_PUBKEY,
        },
        this.kaminoMarket.programId
      )
    );
  }

  addDepositIxV2() {
    const farmsAccounts = this.reserve.state.farmCollateral.equals(PublicKey.default)
      ? {
          obligationFarmUserState: this.kaminoMarket.programId,
          reserveFarmState: this.kaminoMarket.programId,
        }
      : {
          obligationFarmUserState: obligationFarmStatePda(this.reserve.state.farmCollateral, this.getObligationPda()),
          reserveFarmState: this.reserve.state.farmCollateral,
        };

    this.lendingIxsLabels.push(`depositReserveLiquidityAndObligationCollateralV2`);
    this.lendingIxs.push(
      depositReserveLiquidityAndObligationCollateralV2(
        {
          liquidityAmount: this.amount,
        },
        {
          depositAccounts: {
            owner: this.owner,
            obligation: this.getObligationPda(),
            lendingMarket: this.kaminoMarket.getAddress(),
            lendingMarketAuthority: this.kaminoMarket.getLendingMarketAuthority(),
            reserve: this.reserve.address,
            reserveLiquidityMint: this.reserve.getLiquidityMint(),
            reserveLiquiditySupply: this.reserve.state.liquidity.supplyVault,
            reserveCollateralMint: this.reserve.getCTokenMint(),
            reserveDestinationDepositCollateral: this.reserve.state.collateral.supplyVault, // destinationCollateral
            userSourceLiquidity: this.getUserTokenAccountAddress(this.reserve),
            placeholderUserDestinationCollateral: this.kaminoMarket.programId,
            collateralTokenProgram: TOKEN_PROGRAM_ID,
            liquidityTokenProgram: this.reserve.getLiquidityTokenProgram(),
            instructionSysvarAccount: SYSVAR_INSTRUCTIONS_PUBKEY,
          },
          farmsAccounts,
          farmsProgram: farmsId,
        },
        this.kaminoMarket.programId
      )
    );
  }

  /// @deprecated -- use addDepositObligationCollateralIxV2 instead
  addDepositObligationCollateralIx() {
    this.lendingIxsLabels.push(`depositObligationCollateral`);
    this.lendingIxs.push(
      depositObligationCollateral(
        {
          collateralAmount: this.amount,
        },
        {
          owner: this.owner,
          obligation: this.getObligationPda(),
          lendingMarket: this.kaminoMarket.getAddress(),
          depositReserve: this.reserve.address,
          reserveDestinationCollateral: this.reserve.state.collateral.supplyVault,
          userSourceCollateral: this.getUserCollateralAccountAddress(this.reserve),
          tokenProgram: TOKEN_PROGRAM_ID,
          instructionSysvarAccount: SYSVAR_INSTRUCTIONS_PUBKEY,
        },
        this.kaminoMarket.programId
      )
    );
  }

  addDepositObligationCollateralIxV2() {
    const farmsAccounts = this.reserve.state.farmCollateral.equals(PublicKey.default)
      ? {
          obligationFarmUserState: this.kaminoMarket.programId,
          reserveFarmState: this.kaminoMarket.programId,
        }
      : {
          obligationFarmUserState: obligationFarmStatePda(this.reserve.state.farmCollateral, this.getObligationPda()),
          reserveFarmState: this.reserve.state.farmCollateral,
        };

    this.lendingIxsLabels.push(`depositObligationCollateralV2`);
    this.lendingIxs.push(
      depositObligationCollateralV2(
        {
          collateralAmount: this.amount,
        },
        {
          depositAccounts: {
            owner: this.owner,
            obligation: this.getObligationPda(),
            lendingMarket: this.kaminoMarket.getAddress(),
            depositReserve: this.reserve.address,
            reserveDestinationCollateral: this.reserve.state.collateral.supplyVault,
            userSourceCollateral: this.getUserCollateralAccountAddress(this.reserve),
            tokenProgram: TOKEN_PROGRAM_ID,
            instructionSysvarAccount: SYSVAR_INSTRUCTIONS_PUBKEY,
          },
          lendingMarketAuthority: this.kaminoMarket.getLendingMarketAuthority(),
          farmsAccounts,
          farmsProgram: farmsId,
        },
        this.kaminoMarket.programId
      )
    );
  }

  /// @deprecated -- use addDepositObligationCollateralIxV2 instead
  addBorrowIx() {
    this.lendingIxsLabels.push(`borrowObligationLiquidity`);

    const depositReservesList = this.getAdditionalDepositReservesList();

    const depositReserveAccountMetas = depositReservesList.map((reserve) => {
      return { pubkey: reserve, isSigner: false, isWritable: true };
    });

    const borrowIx = borrowObligationLiquidity(
      {
        liquidityAmount: this.amount,
      },
      {
        owner: this.owner,
        obligation: this.getObligationPda(),
        lendingMarket: this.kaminoMarket.getAddress(),
        lendingMarketAuthority: this.kaminoMarket.getLendingMarketAuthority(),
        borrowReserve: this.reserve.address,
        borrowReserveLiquidityMint: this.reserve.getLiquidityMint(),
        reserveSourceLiquidity: this.reserve.state.liquidity.supplyVault,
        userDestinationLiquidity: this.getUserTokenAccountAddress(this.reserve),
        borrowReserveLiquidityFeeReceiver: this.reserve.state.liquidity.feeVault,
        referrerTokenState: referrerTokenStatePda(this.referrer, this.reserve.address, this.kaminoMarket.programId)[0],
        tokenProgram: this.reserve.getLiquidityTokenProgram(),
        instructionSysvarAccount: SYSVAR_INSTRUCTIONS_PUBKEY,
      },
      this.kaminoMarket.programId
    );
    borrowIx.keys =
      this.obligation!.state.elevationGroup > 0 || this.obligation!.refreshedStats.potentialElevationGroupUpdate > 0
        ? borrowIx.keys.concat([...depositReserveAccountMetas])
        : borrowIx.keys;
    this.lendingIxs.push(borrowIx);
  }

  addBorrowIxV2() {
    this.lendingIxsLabels.push(`borrowObligationLiquidityV2`);

    const depositReservesList = this.getAdditionalDepositReservesList();

    const depositReserveAccountMetas = depositReservesList.map((reserve) => {
      return { pubkey: reserve, isSigner: false, isWritable: true };
    });

    const farmsAccounts = this.reserve.state.farmDebt.equals(PublicKey.default)
      ? {
          obligationFarmUserState: this.kaminoMarket.programId,
          reserveFarmState: this.kaminoMarket.programId,
        }
      : {
          obligationFarmUserState: obligationFarmStatePda(this.reserve.state.farmDebt, this.getObligationPda()),
          reserveFarmState: this.reserve.state.farmDebt,
        };

    const borrowIx = borrowObligationLiquidityV2(
      {
        liquidityAmount: this.amount,
      },
      {
        borrowAccounts: {
          owner: this.owner,
          obligation: this.getObligationPda(),
          lendingMarket: this.kaminoMarket.getAddress(),
          lendingMarketAuthority: this.kaminoMarket.getLendingMarketAuthority(),
          borrowReserve: this.reserve.address,
          borrowReserveLiquidityMint: this.reserve.getLiquidityMint(),
          reserveSourceLiquidity: this.reserve.state.liquidity.supplyVault,
          userDestinationLiquidity: this.getUserTokenAccountAddress(this.reserve),
          borrowReserveLiquidityFeeReceiver: this.reserve.state.liquidity.feeVault,
          referrerTokenState: referrerTokenStatePda(
            this.referrer,
            this.reserve.address,
            this.kaminoMarket.programId
          )[0],
          tokenProgram: this.reserve.getLiquidityTokenProgram(),
          instructionSysvarAccount: SYSVAR_INSTRUCTIONS_PUBKEY,
        },
        farmsAccounts,
        farmsProgram: farmsId,
      },
      this.kaminoMarket.programId
    );
    borrowIx.keys =
      this.obligation!.state.elevationGroup > 0 || this.obligation!.refreshedStats.potentialElevationGroupUpdate > 0
        ? borrowIx.keys.concat([...depositReserveAccountMetas])
        : borrowIx.keys;
    this.lendingIxs.push(borrowIx);
  }

  /// @deprecated -- use addWithdrawIxV2 instead
  async addWithdrawIx(collateralAmount: BN) {
    this.lendingIxsLabels.push(`withdrawObligationCollateralAndRedeemReserveCollateral`);
    this.lendingIxs.push(
      withdrawObligationCollateralAndRedeemReserveCollateral(
        {
          collateralAmount,
        },
        {
          owner: this.owner,
          obligation: this.getObligationPda(),
          lendingMarket: this.kaminoMarket.getAddress(),
          lendingMarketAuthority: this.kaminoMarket.getLendingMarketAuthority(),
          withdrawReserve: this.reserve.address,
          reserveLiquidityMint: this.reserve.getLiquidityMint(),
          reserveCollateralMint: this.reserve.getCTokenMint(),
          reserveLiquiditySupply: this.reserve.state.liquidity.supplyVault,
          reserveSourceCollateral: this.reserve.state.collateral.supplyVault,
          userDestinationLiquidity: this.getUserTokenAccountAddress(this.reserve),
          placeholderUserDestinationCollateral: this.kaminoMarket.programId,
          collateralTokenProgram: TOKEN_PROGRAM_ID,
          liquidityTokenProgram: this.reserve.getLiquidityTokenProgram(),
          instructionSysvarAccount: SYSVAR_INSTRUCTIONS_PUBKEY,
        },
        this.kaminoMarket.programId
      )
    );
  }

  async addWithdrawIxV2(collateralAmount: BN) {
    const farmsAccounts = this.reserve.state.farmCollateral.equals(PublicKey.default)
      ? {
          obligationFarmUserState: this.kaminoMarket.programId,
          reserveFarmState: this.kaminoMarket.programId,
        }
      : {
          obligationFarmUserState: obligationFarmStatePda(this.reserve.state.farmCollateral, this.getObligationPda()),
          reserveFarmState: this.reserve.state.farmCollateral,
        };

    this.lendingIxsLabels.push(`withdrawObligationCollateralAndRedeemReserveCollateralV2`);
    this.lendingIxs.push(
      withdrawObligationCollateralAndRedeemReserveCollateralV2(
        {
          collateralAmount,
        },
        {
          withdrawAccounts: {
            owner: this.owner,
            obligation: this.getObligationPda(),
            lendingMarket: this.kaminoMarket.getAddress(),
            lendingMarketAuthority: this.kaminoMarket.getLendingMarketAuthority(),
            withdrawReserve: this.reserve.address,
            reserveLiquidityMint: this.reserve.getLiquidityMint(),
            reserveCollateralMint: this.reserve.getCTokenMint(),
            reserveLiquiditySupply: this.reserve.state.liquidity.supplyVault,
            reserveSourceCollateral: this.reserve.state.collateral.supplyVault,
            userDestinationLiquidity: this.getUserTokenAccountAddress(this.reserve),
            placeholderUserDestinationCollateral: this.kaminoMarket.programId,
            collateralTokenProgram: TOKEN_PROGRAM_ID,
            liquidityTokenProgram: this.reserve.getLiquidityTokenProgram(),
            instructionSysvarAccount: SYSVAR_INSTRUCTIONS_PUBKEY,
          },
          farmsAccounts: farmsAccounts,
          farmsProgram: farmsId,
        },
        this.kaminoMarket.programId
      )
    );
  }

  /// @deprecated -- use addRepayIxV2 instead
  async addRepayIx() {
    this.lendingIxsLabels.push(
      `repayObligationLiquidity(reserve=${this.reserve.address})(obligation=${this.getObligationPda()})`
    );

    const depositReservesList = this.getAdditionalDepositReservesList();

    const depositReserveAccountMetas = depositReservesList.map((reserve) => {
      return { pubkey: reserve, isSigner: false, isWritable: true };
    });

    const repayIx = repayObligationLiquidity(
      {
        liquidityAmount: this.amount,
      },
      {
        owner: this.payer,
        obligation: this.getObligationPda(),
        lendingMarket: this.kaminoMarket.getAddress(),
        repayReserve: this.reserve.address,
        reserveLiquidityMint: this.reserve.getLiquidityMint(),
        userSourceLiquidity: this.getTokenAccountAddressByUser(this.reserve, this.payer),
        reserveDestinationLiquidity: this.reserve.state.liquidity.supplyVault,
        tokenProgram: this.reserve.getLiquidityTokenProgram(),
        instructionSysvarAccount: SYSVAR_INSTRUCTIONS_PUBKEY,
      },
      this.kaminoMarket.programId
    );

    repayIx.keys =
      this.obligation!.state.elevationGroup > 0 ? repayIx.keys.concat([...depositReserveAccountMetas]) : repayIx.keys;

    this.lendingIxs.push(repayIx);
  }

  async addRepayIxV2() {
    this.lendingIxsLabels.push(
      `repayObligationLiquidityV2(reserve=${this.reserve.address})(obligation=${this.getObligationPda()})`
    );

    const depositReservesList = this.getAdditionalDepositReservesList();

    const farmsAccounts = this.reserve.state.farmDebt.equals(PublicKey.default)
      ? {
          obligationFarmUserState: this.kaminoMarket.programId,
          reserveFarmState: this.kaminoMarket.programId,
        }
      : {
          obligationFarmUserState: obligationFarmStatePda(this.reserve.state.farmDebt, this.getObligationPda()),
          reserveFarmState: this.reserve.state.farmDebt,
        };
    const depositReserveAccountMetas = depositReservesList.map((reserve) => {
      return { pubkey: reserve, isSigner: false, isWritable: true };
    });

    const repayIx = repayObligationLiquidityV2(
      {
        liquidityAmount: this.amount,
      },
      {
        repayAccounts: {
          owner: this.payer,
          obligation: this.getObligationPda(),
          lendingMarket: this.kaminoMarket.getAddress(),
          repayReserve: this.reserve.address,
          reserveLiquidityMint: this.reserve.getLiquidityMint(),
          userSourceLiquidity: this.getTokenAccountAddressByUser(this.reserve, this.payer),
          reserveDestinationLiquidity: this.reserve.state.liquidity.supplyVault,
          tokenProgram: this.reserve.getLiquidityTokenProgram(),
          instructionSysvarAccount: SYSVAR_INSTRUCTIONS_PUBKEY,
        },
        lendingMarketAuthority: this.kaminoMarket.getLendingMarketAuthority(),
        farmsAccounts,
        farmsProgram: farmsId,
      },
      this.kaminoMarket.programId
    );

    repayIx.keys =
      this.obligation!.state.elevationGroup > 0 ? repayIx.keys.concat([...depositReserveAccountMetas]) : repayIx.keys;

    this.lendingIxs.push(repayIx);
  }

  addRepayAndWithdrawV2Ixs(withdrawCollateralAmount: BN) {
    this.lendingIxsLabels.push(
      `repayAndWithdrawAndRedeem(repayReserve=${this.reserve!.address})(withdrawReserve=${
        this.outflowReserve!.address
      })(obligation=${this.getObligationPda()})`
    );

    const depositReservesList = this.getAdditionalDepositReservesList();

    const depositReserveAccountMetas = depositReservesList.map((reserve) => {
      return { pubkey: reserve, isSigner: false, isWritable: true };
    });
    const borrowReserveAccountMetas = this.borrowReserves.map((reserve) => {
      return { pubkey: reserve, isSigner: false, isWritable: true };
    });

    if (!this.outflowAmount) {
      throw new Error(`outflowAmount not set`);
    }

    if (!this.outflowReserve) {
      throw new Error(`outflowReserve not set`);
    }

    const collateralFarmsAccounts = this.outflowReserve.state.farmCollateral.equals(PublicKey.default)
      ? {
          obligationFarmUserState: this.kaminoMarket.programId,
          reserveFarmState: this.kaminoMarket.programId,
        }
      : {
          obligationFarmUserState: obligationFarmStatePda(
            this.outflowReserve.state.farmCollateral,
            this.getObligationPda()
          ),
          reserveFarmState: this.outflowReserve.state.farmCollateral,
        };

    const debtFarmsAccounts = this.reserve.state.farmDebt.equals(PublicKey.default)
      ? {
          obligationFarmUserState: this.kaminoMarket.programId,
          reserveFarmState: this.kaminoMarket.programId,
        }
      : {
          obligationFarmUserState: obligationFarmStatePda(this.reserve.state.farmDebt, this.getObligationPda()),
          reserveFarmState: this.reserve.state.farmDebt,
        };

    const repayAndWithdrawIx = repayAndWithdrawAndRedeem(
      {
        repayAmount: this.amount,
        withdrawCollateralAmount,
      },
      {
        repayAccounts: {
          owner: this.owner,
          obligation: this.getObligationPda(),
          lendingMarket: this.kaminoMarket.getAddress(),
          repayReserve: this.reserve!.address,
          reserveLiquidityMint: this.reserve.getLiquidityMint(),
          userSourceLiquidity: this.getUserTokenAccountAddress(this.reserve),
          reserveDestinationLiquidity: this.reserve.state.liquidity.supplyVault,
          tokenProgram: this.reserve.getLiquidityTokenProgram(),
          instructionSysvarAccount: SYSVAR_INSTRUCTIONS_PUBKEY,
        },
        withdrawAccounts: {
          owner: this.owner,
          obligation: this.getObligationPda(),
          lendingMarket: this.kaminoMarket.getAddress(),
          lendingMarketAuthority: this.kaminoMarket.getLendingMarketAuthority(),
          withdrawReserve: this.outflowReserve.address,
          reserveLiquidityMint: this.outflowReserve.getLiquidityMint(),
          reserveCollateralMint: this.outflowReserve.getCTokenMint(),
          reserveLiquiditySupply: this.outflowReserve.state.liquidity.supplyVault,
          reserveSourceCollateral: this.outflowReserve.state.collateral.supplyVault,
          userDestinationLiquidity: this.getUserTokenAccountAddress(this.outflowReserve),
          placeholderUserDestinationCollateral: this.kaminoMarket.programId,
          collateralTokenProgram: TOKEN_PROGRAM_ID,
          liquidityTokenProgram: this.outflowReserve.getLiquidityTokenProgram(),
          instructionSysvarAccount: SYSVAR_INSTRUCTIONS_PUBKEY,
        },
        collateralFarmsAccounts,
        debtFarmsAccounts,
        farmsProgram: farmsId,
      },
      this.kaminoMarket.programId
    );

    repayAndWithdrawIx.keys = repayAndWithdrawIx.keys.concat([
      ...depositReserveAccountMetas,
      ...borrowReserveAccountMetas,
    ]);

    this.lendingIxs.push(repayAndWithdrawIx);
  }

  addDepositAndWithdrawV2Ixs(withdrawCollateralAmount: BN) {
    this.lendingIxsLabels.push(
      `depositAndWithdrawV2(depositReserve=${this.reserve!.address})(withdrawReserve=${
        this.outflowReserve!.address
      })(obligation=${this.getObligationPda()})`
    );

    const depositReservesList = this.getAdditionalDepositReservesList();

    const depositReserveAccountMetas = depositReservesList.map((reserve) => {
      return { pubkey: reserve, isSigner: false, isWritable: true };
    });
    const borrowReserveAccountMetas = this.borrowReserves.map((reserve) => {
      return { pubkey: reserve, isSigner: false, isWritable: true };
    });

    if (!this.outflowAmount) {
      throw new Error(`outflowAmount not set`);
    }

    if (!this.outflowReserve) {
      throw new Error(`outflowReserve not set`);
    }

    const depositFarmsAccounts = this.reserve.state.farmCollateral.equals(PublicKey.default)
      ? {
          obligationFarmUserState: this.kaminoMarket.programId,
          reserveFarmState: this.kaminoMarket.programId,
        }
      : {
          obligationFarmUserState: obligationFarmStatePda(this.reserve.state.farmCollateral, this.getObligationPda()),
          reserveFarmState: this.reserve.state.farmCollateral,
        };
    const withdrawFarmsAccounts = this.outflowReserve.state.farmCollateral.equals(PublicKey.default)
      ? {
          obligationFarmUserState: this.kaminoMarket.programId,
          reserveFarmState: this.kaminoMarket.programId,
        }
      : {
          obligationFarmUserState: obligationFarmStatePda(
            this.outflowReserve.state.farmCollateral,
            this.getObligationPda()
          ),
          reserveFarmState: this.outflowReserve.state.farmCollateral,
        };

    const depositAndWithdrawIx = depositAndWithdraw(
      {
        liquidityAmount: this.amount,
        withdrawCollateralAmount,
      },
      {
        depositAccounts: {
          owner: this.owner,
          obligation: this.getObligationPda(),
          lendingMarket: this.kaminoMarket.getAddress(),
          lendingMarketAuthority: this.kaminoMarket.getLendingMarketAuthority(),
          reserve: this.reserve.address,
          reserveLiquidityMint: this.reserve.getLiquidityMint(),
          reserveLiquiditySupply: this.reserve.state.liquidity.supplyVault,
          reserveCollateralMint: this.reserve.getCTokenMint(),
          reserveDestinationDepositCollateral: this.reserve.state.collateral.supplyVault, // destinationCollateral
          userSourceLiquidity: this.getUserTokenAccountAddress(this.reserve),
          placeholderUserDestinationCollateral: this.kaminoMarket.programId,
          collateralTokenProgram: TOKEN_PROGRAM_ID,
          liquidityTokenProgram: this.reserve.getLiquidityTokenProgram(),
          instructionSysvarAccount: SYSVAR_INSTRUCTIONS_PUBKEY,
        },
        withdrawAccounts: {
          owner: this.owner,
          obligation: this.getObligationPda(),
          lendingMarket: this.kaminoMarket.getAddress(),
          lendingMarketAuthority: this.kaminoMarket.getLendingMarketAuthority(),
          withdrawReserve: this.outflowReserve.address,
          reserveLiquidityMint: this.outflowReserve.getLiquidityMint(),
          reserveCollateralMint: this.outflowReserve.getCTokenMint(),
          reserveLiquiditySupply: this.outflowReserve.state.liquidity.supplyVault,
          reserveSourceCollateral: this.outflowReserve.state.collateral.supplyVault,
          userDestinationLiquidity: this.getUserTokenAccountAddress(this.outflowReserve),
          placeholderUserDestinationCollateral: this.kaminoMarket.programId,
          collateralTokenProgram: TOKEN_PROGRAM_ID,
          liquidityTokenProgram: this.outflowReserve.getLiquidityTokenProgram(),
          instructionSysvarAccount: SYSVAR_INSTRUCTIONS_PUBKEY,
        },
        depositFarmsAccounts,
        withdrawFarmsAccounts,
        farmsProgram: farmsId,
      },
      this.kaminoMarket.programId
    );

    depositAndWithdrawIx.keys = depositAndWithdrawIx.keys.concat([
      ...depositReserveAccountMetas,
      ...borrowReserveAccountMetas,
    ]);

    this.lendingIxs.push(depositAndWithdrawIx);
  }

  async addDepositAndBorrowIx() {
    this.lendingIxsLabels.push(`depositReserveLiquidityAndObligationCollateral`);
    this.lendingIxsLabels.push(`borrowObligationLiquidity`);
    this.lendingIxs.push(
      depositReserveLiquidityAndObligationCollateral(
        {
          liquidityAmount: this.amount,
        },
        {
          owner: this.owner,
          obligation: this.getObligationPda(),
          lendingMarket: this.kaminoMarket.getAddress(),
          lendingMarketAuthority: this.kaminoMarket.getLendingMarketAuthority(),
          reserve: this.reserve.address,
          reserveLiquidityMint: this.reserve.getLiquidityMint(),
          reserveLiquiditySupply: this.reserve.state.liquidity.supplyVault,
          reserveCollateralMint: this.reserve.getCTokenMint(),
          reserveDestinationDepositCollateral: this.reserve.state.collateral.supplyVault, // destinationCollateral
          userSourceLiquidity: this.getUserTokenAccountAddress(this.reserve),
          placeholderUserDestinationCollateral: this.kaminoMarket.programId,
          collateralTokenProgram: TOKEN_PROGRAM_ID,
          liquidityTokenProgram: this.reserve.getLiquidityTokenProgram(),
          instructionSysvarAccount: SYSVAR_INSTRUCTIONS_PUBKEY,
        },
        this.kaminoMarket.programId
      )
    );

    if (!this.outflowReserve) {
      throw new Error(`outflowReserve not set`);
    }

    if (!this.outflowAmount) {
      throw new Error(`outflowAmount not set`);
    }

    const depositReservesList = this.getAdditionalDepositReservesList();
    if (depositReservesList.length === 0) {
      depositReservesList.push(this.reserve.address);
    }
    const depositReserveAccountMetas = depositReservesList.map((reserve) => {
      return { pubkey: reserve, isSigner: false, isWritable: true };
    });

    const borrowIx = borrowObligationLiquidity(
      {
        liquidityAmount: this.outflowAmount,
      },
      {
        owner: this.owner,
        obligation: this.getObligationPda(),
        lendingMarket: this.kaminoMarket.getAddress(),
        lendingMarketAuthority: this.kaminoMarket.getLendingMarketAuthority(),
        borrowReserve: this.outflowReserve.address,
        borrowReserveLiquidityMint: this.outflowReserve.getLiquidityMint(),
        reserveSourceLiquidity: this.outflowReserve.state.liquidity.supplyVault,
        userDestinationLiquidity: this.getUserTokenAccountAddress(this.outflowReserve),
        borrowReserveLiquidityFeeReceiver: this.outflowReserve.state.liquidity.feeVault,
        referrerTokenState: referrerTokenStatePda(
          this.referrer,
          this.outflowReserve.address,
          this.kaminoMarket.programId
        )[0],
        tokenProgram: this.outflowReserve.getLiquidityTokenProgram(),
        instructionSysvarAccount: SYSVAR_INSTRUCTIONS_PUBKEY,
      },
      this.kaminoMarket.programId
    );

    borrowIx.keys = borrowIx.keys.concat([...depositReserveAccountMetas]);

    this.lendingIxs.push(borrowIx);
  }

  async addDepositAndBorrowIxV2() {
    const collateralFarmsAccounts = this.reserve.state.farmCollateral.equals(PublicKey.default)
      ? {
          obligationFarmUserState: this.kaminoMarket.programId,
          reserveFarmState: this.kaminoMarket.programId,
        }
      : {
          obligationFarmUserState: obligationFarmStatePda(this.reserve.state.farmCollateral, this.getObligationPda()),
          reserveFarmState: this.reserve.state.farmCollateral,
        };

    this.lendingIxsLabels.push(`depositReserveLiquidityAndObligationCollateralV2`);
    this.lendingIxsLabels.push(`borrowObligationLiquidityV2`);
    this.lendingIxs.push(
      depositReserveLiquidityAndObligationCollateralV2(
        {
          liquidityAmount: this.amount,
        },
        {
          depositAccounts: {
            owner: this.owner,
            obligation: this.getObligationPda(),
            lendingMarket: this.kaminoMarket.getAddress(),
            lendingMarketAuthority: this.kaminoMarket.getLendingMarketAuthority(),
            reserve: this.reserve.address,
            reserveLiquidityMint: this.reserve.getLiquidityMint(),
            reserveLiquiditySupply: this.reserve.state.liquidity.supplyVault,
            reserveCollateralMint: this.reserve.getCTokenMint(),
            reserveDestinationDepositCollateral: this.reserve.state.collateral.supplyVault, // destinationCollateral
            userSourceLiquidity: this.getUserTokenAccountAddress(this.reserve),
            placeholderUserDestinationCollateral: this.kaminoMarket.programId,
            collateralTokenProgram: TOKEN_PROGRAM_ID,
            liquidityTokenProgram: this.reserve.getLiquidityTokenProgram(),
            instructionSysvarAccount: SYSVAR_INSTRUCTIONS_PUBKEY,
          },
          farmsAccounts: collateralFarmsAccounts,
          farmsProgram: farmsId,
        },
        this.kaminoMarket.programId
      )
    );

    if (!this.outflowReserve) {
      throw new Error(`outflowReserve not set`);
    }

    if (!this.outflowAmount) {
      throw new Error(`outflowAmount not set`);
    }

    const depositReservesList = this.getAdditionalDepositReservesList();
    if (depositReservesList.length === 0) {
      depositReservesList.push(this.reserve.address);
    }
    const depositReserveAccountMetas = depositReservesList.map((reserve) => {
      return { pubkey: reserve, isSigner: false, isWritable: true };
    });

    const debtFarmsAccounts = this.outflowReserve.state.farmDebt.equals(PublicKey.default)
      ? {
          obligationFarmUserState: this.kaminoMarket.programId,
          reserveFarmState: this.kaminoMarket.programId,
        }
      : {
          obligationFarmUserState: obligationFarmStatePda(this.outflowReserve.state.farmDebt, this.getObligationPda()),
          reserveFarmState: this.outflowReserve.state.farmDebt,
        };

    const borrowIx = borrowObligationLiquidityV2(
      {
        liquidityAmount: this.outflowAmount,
      },
      {
        borrowAccounts: {
          owner: this.owner,
          obligation: this.getObligationPda(),
          lendingMarket: this.kaminoMarket.getAddress(),
          lendingMarketAuthority: this.kaminoMarket.getLendingMarketAuthority(),
          borrowReserve: this.outflowReserve.address,
          borrowReserveLiquidityMint: this.outflowReserve.getLiquidityMint(),
          reserveSourceLiquidity: this.outflowReserve.state.liquidity.supplyVault,
          userDestinationLiquidity: this.getUserTokenAccountAddress(this.outflowReserve),
          borrowReserveLiquidityFeeReceiver: this.outflowReserve.state.liquidity.feeVault,
          referrerTokenState: referrerTokenStatePda(
            this.referrer,
            this.outflowReserve.address,
            this.kaminoMarket.programId
          )[0],
          tokenProgram: this.outflowReserve.getLiquidityTokenProgram(),
          instructionSysvarAccount: SYSVAR_INSTRUCTIONS_PUBKEY,
        },
        farmsAccounts: debtFarmsAccounts,
        farmsProgram: farmsId,
      },
      this.kaminoMarket.programId
    );

    borrowIx.keys = borrowIx.keys.concat([...depositReserveAccountMetas]);

    this.lendingIxs.push(borrowIx);
  }

  async addRepayAndWithdrawIxs(withdrawCollateralAmount: BN) {
    this.lendingIxsLabels.push(
      `repayObligationLiquidity(reserve=${this.reserve!.address})(obligation=${this.getObligationPda()})`
    );
    this.lendingIxsLabels.push(`withdrawObligationCollateralAndRedeemReserveCollateral`);

    const depositReservesList = this.getAdditionalDepositReservesList();

    const depositReserveAccountMetas = depositReservesList.map((reserve) => {
      return { pubkey: reserve, isSigner: false, isWritable: true };
    });
    const repayIx = repayObligationLiquidity(
      {
        liquidityAmount: this.amount,
      },
      {
        owner: this.owner,
        obligation: this.getObligationPda(),
        lendingMarket: this.kaminoMarket.getAddress(),
        repayReserve: this.reserve!.address,
        reserveLiquidityMint: this.reserve.getLiquidityMint(),
        userSourceLiquidity: this.getUserTokenAccountAddress(this.reserve),
        reserveDestinationLiquidity: this.reserve.state.liquidity.supplyVault,
        tokenProgram: this.reserve.getLiquidityTokenProgram(),
        instructionSysvarAccount: SYSVAR_INSTRUCTIONS_PUBKEY,
      },
      this.kaminoMarket.programId
    );

    repayIx.keys = repayIx.keys.concat([...depositReserveAccountMetas]);

    this.lendingIxs.push(repayIx);
    if (!this.outflowReserve) {
      throw new Error(`outflowReserve not set`);
    }

    if (!this.outflowAmount) {
      throw new Error(`outflowAmount not set`);
    }

    this.lendingIxs.push(
      withdrawObligationCollateralAndRedeemReserveCollateral(
        {
          collateralAmount: withdrawCollateralAmount,
        },
        {
          owner: this.owner,
          obligation: this.getObligationPda(),
          lendingMarket: this.kaminoMarket.getAddress(),
          lendingMarketAuthority: this.kaminoMarket.getLendingMarketAuthority(),
          withdrawReserve: this.outflowReserve.address,
          reserveLiquidityMint: this.outflowReserve.getLiquidityMint(),
          reserveCollateralMint: this.outflowReserve.getCTokenMint(),
          reserveLiquiditySupply: this.outflowReserve.state.liquidity.supplyVault,
          reserveSourceCollateral: this.outflowReserve.state.collateral.supplyVault,
          userDestinationLiquidity: this.getUserTokenAccountAddress(this.outflowReserve),
          placeholderUserDestinationCollateral: this.kaminoMarket.programId,
          collateralTokenProgram: TOKEN_PROGRAM_ID,
          liquidityTokenProgram: this.outflowReserve.getLiquidityTokenProgram(),
          instructionSysvarAccount: SYSVAR_INSTRUCTIONS_PUBKEY,
        },
        this.kaminoMarket.programId
      )
    );
  }

  async addRepayAndWithdrawIxsV2(withdrawCollateralAmount: BN) {
    this.lendingIxsLabels.push(
      `repayObligationLiquidityV2(reserve=${this.reserve!.address})(obligation=${this.getObligationPda()})`
    );
    this.lendingIxsLabels.push(`withdrawObligationCollateralAndRedeemReserveCollateralV2`);

    const depositReservesList = this.getAdditionalDepositReservesList();

    const depositReserveAccountMetas = depositReservesList.map((reserve) => {
      return { pubkey: reserve, isSigner: false, isWritable: true };
    });

    const debtFarmsAccounts = this.reserve.state.farmDebt.equals(PublicKey.default)
      ? {
          obligationFarmUserState: this.kaminoMarket.programId,
          reserveFarmState: this.kaminoMarket.programId,
        }
      : {
          obligationFarmUserState: obligationFarmStatePda(this.reserve.state.farmDebt, this.getObligationPda()),
          reserveFarmState: this.reserve.state.farmDebt,
        };

    const repayIx = repayObligationLiquidityV2(
      {
        liquidityAmount: this.amount,
      },
      {
        repayAccounts: {
          owner: this.owner,
          obligation: this.getObligationPda(),
          lendingMarket: this.kaminoMarket.getAddress(),
          repayReserve: this.reserve!.address,
          reserveLiquidityMint: this.reserve.getLiquidityMint(),
          userSourceLiquidity: this.getUserTokenAccountAddress(this.reserve),
          reserveDestinationLiquidity: this.reserve.state.liquidity.supplyVault,
          tokenProgram: this.reserve.getLiquidityTokenProgram(),
          instructionSysvarAccount: SYSVAR_INSTRUCTIONS_PUBKEY,
        },
        lendingMarketAuthority: this.kaminoMarket.getLendingMarketAuthority(),
        farmsAccounts: debtFarmsAccounts,
        farmsProgram: farmsId,
      },
      this.kaminoMarket.programId
    );

    repayIx.keys = repayIx.keys.concat([...depositReserveAccountMetas]);

    this.lendingIxs.push(repayIx);
    if (!this.outflowReserve) {
      throw new Error(`outflowReserve not set`);
    }

    if (!this.outflowAmount) {
      throw new Error(`outflowAmount not set`);
    }

    const collateralFarmsAccounts = this.outflowReserve.state.farmCollateral.equals(PublicKey.default)
      ? {
          obligationFarmUserState: this.kaminoMarket.programId,
          reserveFarmState: this.kaminoMarket.programId,
        }
      : {
          obligationFarmUserState: obligationFarmStatePda(
            this.outflowReserve.state.farmCollateral,
            this.getObligationPda()
          ),
          reserveFarmState: this.outflowReserve.state.farmCollateral,
        };

    this.lendingIxs.push(
      withdrawObligationCollateralAndRedeemReserveCollateralV2(
        {
          collateralAmount: withdrawCollateralAmount,
        },
        {
          withdrawAccounts: {
            owner: this.owner,
            obligation: this.getObligationPda(),
            lendingMarket: this.kaminoMarket.getAddress(),
            lendingMarketAuthority: this.kaminoMarket.getLendingMarketAuthority(),
            withdrawReserve: this.outflowReserve.address,
            reserveLiquidityMint: this.outflowReserve.getLiquidityMint(),
            reserveCollateralMint: this.outflowReserve.getCTokenMint(),
            reserveLiquiditySupply: this.outflowReserve.state.liquidity.supplyVault,
            reserveSourceCollateral: this.outflowReserve.state.collateral.supplyVault,
            userDestinationLiquidity: this.getUserTokenAccountAddress(this.outflowReserve),
            placeholderUserDestinationCollateral: this.kaminoMarket.programId,
            collateralTokenProgram: TOKEN_PROGRAM_ID,
            liquidityTokenProgram: this.outflowReserve.getLiquidityTokenProgram(),
            instructionSysvarAccount: SYSVAR_INSTRUCTIONS_PUBKEY,
          },
          farmsAccounts: collateralFarmsAccounts,
          farmsProgram: farmsId,
        },
        this.kaminoMarket.programId
      )
    );
  }

  addLiquidateIx(maxAllowedLtvOverridePercent: number = 0) {
    this.lendingIxsLabels.push(`liquidateObligationAndRedeemReserveCollateral`);
    if (!this.outflowReserve) {
      throw Error(`Withdraw reserve during liquidation is not defined`);
    }

    const depositReservesList = this.getAdditionalDepositReservesList();
    const depositReserveAccountMetas = depositReservesList.map((reserve) => {
      return { pubkey: reserve, isSigner: false, isWritable: true };
    });

    const liquidateIx = liquidateObligationAndRedeemReserveCollateral(
      {
        liquidityAmount: this.amount,
        // TODO: Configure this when updating liquidator with new interface
        minAcceptableReceivedLiquidityAmount: this.outflowAmount || new BN(0),
        maxAllowedLtvOverridePercent: new BN(maxAllowedLtvOverridePercent),
      },
      {
        liquidator: this.owner,
        obligation: this.getObligationPda(),
        lendingMarket: this.kaminoMarket.getAddress(),
        lendingMarketAuthority: this.kaminoMarket.getLendingMarketAuthority(),
        repayReserve: this.reserve.address,
        repayReserveLiquidityMint: this.reserve.getLiquidityMint(),
        repayReserveLiquiditySupply: this.reserve.state.liquidity.supplyVault,
        withdrawReserve: this.outflowReserve.address,
        withdrawReserveLiquidityMint: this.outflowReserve.getLiquidityMint(),
        withdrawReserveCollateralMint: this.outflowReserve.getCTokenMint(),
        withdrawReserveCollateralSupply: this.outflowReserve.state.collateral.supplyVault,
        withdrawReserveLiquiditySupply: this.outflowReserve.state.liquidity.supplyVault,
        userSourceLiquidity: this.getUserTokenAccountAddress(this.reserve),
        userDestinationCollateral: this.getUserCollateralAccountAddress(this.outflowReserve),
        userDestinationLiquidity: this.getUserTokenAccountAddress(this.outflowReserve),
        withdrawReserveLiquidityFeeReceiver: this.outflowReserve.state.liquidity.feeVault,
        collateralTokenProgram: TOKEN_PROGRAM_ID,
        repayLiquidityTokenProgram: this.reserve.getLiquidityTokenProgram(),
        withdrawLiquidityTokenProgram: this.outflowReserve.getLiquidityTokenProgram(),
        instructionSysvarAccount: SYSVAR_INSTRUCTIONS_PUBKEY,
      },
      this.kaminoMarket.programId
    );
    liquidateIx.keys =
      this.obligation!.state.elevationGroup > 0
        ? liquidateIx.keys.concat([...depositReserveAccountMetas])
        : liquidateIx.keys;
    this.lendingIxs.push(liquidateIx);
  }

  async addLiquidateIxV2(maxAllowedLtvOverridePercent: number = 0) {
    this.lendingIxsLabels.push(`liquidateObligationAndRedeemReserveCollateralV2`);
    if (!this.outflowReserve) {
      throw Error(`Withdraw reserve during liquidation is not defined`);
    }

    const depositReservesList = this.getAdditionalDepositReservesList();
    const depositReserveAccountMetas = depositReservesList.map((reserve) => {
      return { pubkey: reserve, isSigner: false, isWritable: true };
    });

    const collateralFarmsAccounts = this.outflowReserve.state.farmCollateral.equals(PublicKey.default)
      ? {
          obligationFarmUserState: this.kaminoMarket.programId,
          reserveFarmState: this.kaminoMarket.programId,
        }
      : {
          obligationFarmUserState: obligationFarmStatePda(
            this.outflowReserve.state.farmCollateral,
            this.getObligationPda()
          ),
          reserveFarmState: this.outflowReserve.state.farmCollateral,
        };

    const debtFarmsAccounts = this.reserve.state.farmDebt.equals(PublicKey.default)
      ? {
          obligationFarmUserState: this.kaminoMarket.programId,
          reserveFarmState: this.kaminoMarket.programId,
        }
      : {
          obligationFarmUserState: obligationFarmStatePda(this.reserve.state.farmDebt, this.getObligationPda()),
          reserveFarmState: this.reserve.state.farmDebt,
        };

    const liquidateIx = liquidateObligationAndRedeemReserveCollateralV2(
      {
        liquidityAmount: this.amount,
        // TODO: Configure this when updating liquidator with new interface
        minAcceptableReceivedLiquidityAmount: this.outflowAmount || new BN(0),
        maxAllowedLtvOverridePercent: new BN(maxAllowedLtvOverridePercent),
      },
      {
        liquidationAccounts: {
          liquidator: this.owner,
          obligation: this.getObligationPda(),
          lendingMarket: this.kaminoMarket.getAddress(),
          lendingMarketAuthority: this.kaminoMarket.getLendingMarketAuthority(),
          repayReserve: this.reserve.address,
          repayReserveLiquidityMint: this.reserve.getLiquidityMint(),
          repayReserveLiquiditySupply: this.reserve.state.liquidity.supplyVault,
          withdrawReserve: this.outflowReserve.address,
          withdrawReserveLiquidityMint: this.outflowReserve.getLiquidityMint(),
          withdrawReserveCollateralMint: this.outflowReserve.getCTokenMint(),
          withdrawReserveCollateralSupply: this.outflowReserve.state.collateral.supplyVault,
          withdrawReserveLiquiditySupply: this.outflowReserve.state.liquidity.supplyVault,
          userSourceLiquidity: this.getUserTokenAccountAddress(this.reserve),
          userDestinationCollateral: this.getUserCollateralAccountAddress(this.outflowReserve),
          userDestinationLiquidity: this.getUserTokenAccountAddress(this.outflowReserve),
          withdrawReserveLiquidityFeeReceiver: this.outflowReserve.state.liquidity.feeVault,
          collateralTokenProgram: TOKEN_PROGRAM_ID,
          repayLiquidityTokenProgram: this.reserve.getLiquidityTokenProgram(),
          withdrawLiquidityTokenProgram: this.outflowReserve.getLiquidityTokenProgram(),
          instructionSysvarAccount: SYSVAR_INSTRUCTIONS_PUBKEY,
        },
        debtFarmsAccounts,
        collateralFarmsAccounts,
        farmsProgram: farmsId,
      },
      this.kaminoMarket.programId
    );
    liquidateIx.keys =
      this.obligation!.state.elevationGroup > 0
        ? liquidateIx.keys.concat([...depositReserveAccountMetas])
        : liquidateIx.keys;
    this.lendingIxs.push(liquidateIx);
  }

  async addInBetweenIxs(
    action: ActionType,
    includeAtaIxns: boolean,
    requestElevationGroup: boolean,
    addInitObligationForFarm: boolean,
    useV2Ixs: boolean
  ) {
    await this.addSupportIxsWithoutInitObligation(
      action,
      includeAtaIxns,
      useV2Ixs,
      'inBetween',
      requestElevationGroup,
      addInitObligationForFarm
    );
  }

  addRefreshObligation(crank: PublicKey) {
    const uniqueReserveAddresses = new PublicKeySet(this.depositReserves.concat(this.borrowReserves)).toArray();

    const addAllToSetupIxns = 'setup';
    // Union of addresses
    const allReservesExcludingCurrent = [...uniqueReserveAddresses];

    this.addRefreshReserveIxs(allReservesExcludingCurrent, addAllToSetupIxns);
    this.addRefreshFarmsForReserve(
      this.depositReserves.map((r) => this.kaminoMarket.getReserveByAddress(r)!),
      addAllToSetupIxns,
      ReserveFarmKind.Collateral,
      crank
    );
    this.addRefreshFarmsForReserve(
      this.borrowReserves.map((r) => this.kaminoMarket.getReserveByAddress(r)!),
      addAllToSetupIxns,
      ReserveFarmKind.Debt,
      crank
    );
    this.addRefreshObligationIx(addAllToSetupIxns);
  }

  async addSupportIxsWithoutInitObligation(
    action: ActionType,
    includeAtaIxns: boolean,
    useV2Ixs: boolean,
    addAsSupportIx: AuxiliaryIx = 'setup',
    requestElevationGroup: boolean = false,
    addInitObligationForFarm: boolean = false,
    twoTokenAction: boolean = false,
    overrideElevationGroupRequest?: number
  ) {
    // TODO: why are we not doing this first?
    if (includeAtaIxns) {
      await this.addAtaIxs(action);
    }

    if (
      [
        'depositCollateral',
        'deposit',
        'withdraw',
        'borrow',
        'liquidate',
        'repay',
        'depositAndBorrow',
        'repayAndWithdraw',
        'repayAndWithdrawV2',
        'refreshObligation',
        'depositAndWithdraw',
      ].includes(action)
    ) {
      // The support ixns in order are:
      // 0. Init obligation ixn
      // 0. Token Ata ixns
      // 0. Init obligation for farm
      // 1. Ixns to refresh the reserves of the obligation not related to the current action
      // 2. Ixn to refresh the reserve of the current action
      // 3. Ixn to refresh the obligation
      // 4. Ixn to refresh the `debt` farm of the obligation
      // 5. Ixn to refresh the `collateral` farm of the obligation
      // 6. The instruction itself
      // 7. Ixn to refresh the `debt` farm of the obligation
      // 8. Ixn to refresh the `collateral` farm of the obligation

      let currentReserves: KaminoReserve[] = [];

      if (
        action === 'liquidate' ||
        action === 'depositAndBorrow' ||
        action === 'repayAndWithdraw' ||
        action === 'repayAndWithdrawV2'
      ) {
        if (!this.outflowReserve) {
          throw new Error('outflowReserve is undefined');
        }

        if (action === 'depositAndBorrow' || action === 'repayAndWithdraw' || action === 'repayAndWithdrawV2') {
          currentReserves = [this.reserve, this.outflowReserve];
          if (action === 'depositAndBorrow') {
            if (this.obligation) {
              const deposit = this.obligation.getDepositByReserve(this.reserve.address);
              if (!deposit) {
                this.preLoadedDepositReservesSameTx.push(this.reserve.address);
              }
            } else {
              // Obligation doesn't exist yet, so we have to preload the deposit reserve
              this.preLoadedDepositReservesSameTx.push(this.reserve.address);
            }
          }
        } else if (action === 'liquidate' && !this.outflowReserve.address.equals(this.reserve.address)) {
          currentReserves = [this.outflowReserve, this.reserve];
        } else {
          currentReserves = [this.reserve];
        }
      } else {
        currentReserves = [this.reserve];
      }

      const uniqueReserveAddresses = new PublicKeySet(this.depositReserves.concat(this.borrowReserves));
      const currentReserveAddresses = new PublicKeySet(currentReserves.map((reserve) => reserve.address));

      // Union of addresses
      const allReservesExcludingCurrent = [...uniqueReserveAddresses.toArray()].filter(
        (address) => !currentReserveAddresses.contains(address)
      );

      this.addRefreshReserveIxs(allReservesExcludingCurrent, addAsSupportIx);
      if (addInitObligationForFarm) {
        if (action === 'liquidate') {
          await this.addInitObligationForFarm(this.reserve, ReserveFarmKind.Debt, addAsSupportIx);
          await this.addInitObligationForFarm(this.outflowReserve!, ReserveFarmKind.Collateral, addAsSupportIx);
        } else if (
          action === 'depositAndBorrow' ||
          action === 'depositCollateral' ||
          action === 'withdraw' ||
          action === 'deposit' ||
          action === 'depositAndWithdraw'
        ) {
          await this.addInitObligationForFarm(this.reserve, ReserveFarmKind.Collateral, addAsSupportIx);
          if (this.outflowReserve && action !== 'depositAndWithdraw') {
            await this.addInitObligationForFarm(this.outflowReserve, ReserveFarmKind.Debt, addAsSupportIx);
          }
        } else if (
          action === 'repayAndWithdraw' ||
          action === 'borrow' ||
          action === 'repay' ||
          action === 'repayAndWithdrawV2'
        ) {
          // todo - probably don't need to add both debt and collateral for everything here
          await this.addInitObligationForFarm(this.reserve, ReserveFarmKind.Debt, addAsSupportIx);
          if (this.outflowReserve) {
            await this.addInitObligationForFarm(this.outflowReserve, ReserveFarmKind.Collateral, addAsSupportIx);
          }
        } else {
          await this.addInitObligationForFarm(this.reserve, ReserveFarmKind.Collateral, addAsSupportIx);
          await this.addInitObligationForFarm(this.reserve, ReserveFarmKind.Debt, addAsSupportIx);
          if (this.outflowReserve) {
            await this.addInitObligationForFarm(this.outflowReserve, ReserveFarmKind.Collateral, addAsSupportIx);
            await this.addInitObligationForFarm(this.outflowReserve, ReserveFarmKind.Debt, addAsSupportIx);
          }
        }
      }
      this.addRefreshReserveIxs(currentReserveAddresses.toArray(), addAsSupportIx);

      if (action === 'repayAndWithdraw' && addAsSupportIx === 'inBetween') {
        const repayObligationLiquidity = this.obligation!.getBorrowByReserve(this.reserve.address);
        if (!repayObligationLiquidity) {
          throw new Error(`Could not find debt reserve ${this.reserve.address} in obligation`);
        }
        const repaidBorrowReservesToSkip = repayObligationLiquidity.amount.lte(new Decimal(this.amount.toString()))
          ? [repayObligationLiquidity.reserveAddress]
          : [];
        this.addRefreshObligationIx(addAsSupportIx, repaidBorrowReservesToSkip);
      } else {
        this.addRefreshObligationIx(addAsSupportIx);
      }

      if (requestElevationGroup) {
        if (action === 'repay' || action === 'repayAndWithdrawV2') {
          const repayObligationLiquidity = this.obligation!.borrows.get(this.reserve.address);

          if (!repayObligationLiquidity) {
            throw new Error(`Could not find debt reserve ${this.reserve.address} in obligation`);
          }

          if (
            repayObligationLiquidity.amount.lte(new Decimal(this.amount.toString())) &&
            this.obligation!.borrows.size === 1 &&
            this.obligation?.state.elevationGroup !== 0
          ) {
            this.addRefreshReserveIxs(allReservesExcludingCurrent, 'cleanup');
            // Skip the borrow reserve, since we repay in the same tx
            this.addRefreshObligationIx('cleanup', [this.reserve.address]);
            this.addRequestElevationIx(overrideElevationGroupRequest ?? 0, 'cleanup', [this.reserve.address]);
          }
        } else if (action === 'depositAndBorrow' || action === 'borrow') {
          let newElevationGroup: number = -1;
          let addAsSupportIx: AuxiliaryIx = 'setup';

          if (overrideElevationGroupRequest !== undefined) {
            newElevationGroup = overrideElevationGroupRequest;
          } else {
            let emodeGroupsDebt = this.reserve.state.config.elevationGroups;
            let emodeGroupsColl = this.reserve.state.config.elevationGroups;
            let debtReserve = this.reserve.address;

            if (action === 'depositAndBorrow') {
              emodeGroupsDebt = this.outflowReserve!.state.config.elevationGroups;
              debtReserve = this.outflowReserve!.address;
              addAsSupportIx = 'inBetween';
            } else if (action === 'borrow') {
              const depositReserve = this.obligation!.state.deposits.find(
                (x) => !x.depositReserve.equals(PublicKey.default)
              )!.depositReserve;
              const collReserve = this.kaminoMarket.getReserveByAddress(depositReserve);
              emodeGroupsColl = collReserve!.state.config.elevationGroups;
              addAsSupportIx = 'setup';
            }

            const groups = this.kaminoMarket.state.elevationGroups;
            const commonElevationGroups = [...emodeGroupsColl].filter(
              (item) => emodeGroupsDebt.includes(item) && item !== 0 && groups[item - 1].debtReserve.equals(debtReserve)
            );

            console.log(
              'Groups of coll reserve',
              emodeGroupsColl,
              'Groups of debt reserve',
              emodeGroupsDebt,
              'Common groups',
              commonElevationGroups
            );

            if (commonElevationGroups.length === 0) {
              console.log('No common elevation groups found, staying with default');
            } else {
              const eModeGroupWithMaxLtvAndDebtReserve = commonElevationGroups.reduce((prev, curr) => {
                const prevGroup = groups.find((group) => group.id === prev);
                const currGroup = groups.find((group) => group.id === curr);
                return prevGroup!.ltvPct > currGroup!.ltvPct ? prev : curr;
              });

              const eModeGroup = groups.find((group) => group.id === eModeGroupWithMaxLtvAndDebtReserve)!.id;
              console.log('Setting eModeGroup to', eModeGroup);

              if (eModeGroup !== 0 && eModeGroup !== this.obligation?.state.elevationGroup) {
                newElevationGroup = eModeGroup;
              }
            }
          }

          console.log('newElevationGroup', newElevationGroup, addAsSupportIx);
          if (newElevationGroup >= 0 && newElevationGroup !== this.obligation?.state.elevationGroup) {
            this.addRequestElevationIx(newElevationGroup, addAsSupportIx);
            this.addRefreshReserveIxs(allReservesExcludingCurrent, addAsSupportIx);
            this.addRefreshReserveIxs(currentReserveAddresses.toArray(), addAsSupportIx);
            this.addRefreshObligationIx(addAsSupportIx);

            if (action === 'borrow') {
              this.obligation!.refreshedStats.potentialElevationGroupUpdate = newElevationGroup;
            }
          }
        } else if (
          action === 'deposit' &&
          overrideElevationGroupRequest !== undefined &&
          overrideElevationGroupRequest !== this.obligation?.state.elevationGroup
        ) {
          const addAsSupportIx: AuxiliaryIx = 'setup';
          console.log('Deposit: Requesting elevation group', overrideElevationGroupRequest);
          this.addRequestElevationIx(overrideElevationGroupRequest, addAsSupportIx);
          this.addRefreshReserveIxs(allReservesExcludingCurrent, addAsSupportIx);
          this.addRefreshReserveIxs(currentReserveAddresses.toArray(), addAsSupportIx);
          this.addRefreshObligationIx(addAsSupportIx);
        } else if (
          action === 'withdraw' &&
          overrideElevationGroupRequest !== undefined
          // Note: contrary to the 'deposit' case above, we allow requesting the same group as in the [stale, cached] obligation state, since our current use-case is "deposit X, withdraw Y"
        ) {
          console.log('Withdraw: Requesting elevation group', overrideElevationGroupRequest);
          // Skip the withdrawn reserve if we are in the process of closing it:
          const skipReserveIfClosing = this.amount.eq(new BN(U64_MAX)) ? [this.reserve.address] : [];
          this.addRefreshObligationIx('cleanup', skipReserveIfClosing);
          this.addRequestElevationIx(overrideElevationGroupRequest, 'cleanup', skipReserveIfClosing);
        }
      }

      if (!useV2Ixs) {
        if (addAsSupportIx === 'setup') {
          // If this is an setup ixn (therefore not an in-between), it means it's either a one off action
          // or the first of a two-token-action
          if (action === 'liquidate') {
            this.addRefreshFarmsForReserve([this.outflowReserve!], addAsSupportIx, ReserveFarmKind.Collateral);
            this.addRefreshFarmsForReserve([this.reserve], addAsSupportIx, ReserveFarmKind.Debt);
          } else if (
            action === 'depositAndBorrow' ||
            action === 'depositCollateral' ||
            action === 'withdraw' ||
            action === 'deposit'
          ) {
            this.addRefreshFarmsForReserve(
              currentReserves,
              addAsSupportIx,
              ReserveFarmKind.Collateral,
              undefined,
              twoTokenAction
            );
          } else if (action === 'repayAndWithdraw' || action === 'borrow' || action === 'repay') {
            this.addRefreshFarmsForReserve(
              currentReserves,
              addAsSupportIx,
              ReserveFarmKind.Debt,
              undefined,
              twoTokenAction
            );
          } else {
            throw new Error(`Could not decide on refresh farm for action ${action}`);
          }
        } else {
          // If this is an inbetween, it means it's part of a two-token-action
          // so we skip the refresh farm obligation of the first reserve as that operation already happened
          // add added to 'setup' ixns
          if (action === 'depositAndBorrow') {
            this.addRefreshFarmsForReserve([this.outflowReserve!], addAsSupportIx, ReserveFarmKind.Debt);
          } else if (action === 'repayAndWithdraw') {
            this.addRefreshFarmsForReserve([this.outflowReserve!], addAsSupportIx, ReserveFarmKind.Collateral);
          } else {
            throw new Error(`Could not decide on refresh farm for action ${action}`);
          }
        }
      }
    }
  }

  async addSupportIxs(
    action: ActionType,
    includeAtaIxns: boolean,
    requestElevationGroup: boolean,
    addInitObligationForFarm: boolean,
    useV2Ixs: boolean,
    scopeRefreshConfig: ScopePriceRefreshConfig | undefined,
    initUserMetadata: { skipInitialization: boolean; skipLutCreation: boolean },
    twoTokenAction: boolean = false,
    overrideElevationGroupRequest?: number
  ) {
    if (!['mint', 'redeem'].includes(action)) {
      const [, ownerUserMetadata] = await this.kaminoMarket.getUserMetadata(this.owner);
      if (!ownerUserMetadata && !initUserMetadata.skipInitialization) {
        let lookupTable: PublicKey = PublicKey.default;
        if (!initUserMetadata.skipLutCreation) {
          const [createLutIx, lookupTableAddress] = await createLookupTableIx(
            this.kaminoMarket.getConnection(),
            this.owner
          );
          lookupTable = lookupTableAddress;
          this.setupIxs.push(createLutIx);
          this.setupIxsLabels.push(`createUserLutIx[${lookupTableAddress.toString()}]`);
        }
        this.addInitUserMetadataIxs(lookupTable);
      }

      await this.addInitObligationIxs();
    }

    await this.addSupportIxsWithoutInitObligation(
      action,
      includeAtaIxns,
      useV2Ixs,
      'setup',
      requestElevationGroup,
      addInitObligationForFarm,
      twoTokenAction,
      overrideElevationGroupRequest
    );

    const allReserves = new PublicKeySet<PublicKey>([
      ...this.depositReserves,
      ...this.borrowReserves,
      this.reserve.address,
      ...(this.outflowReserve ? [this.outflowReserve.address] : []),
      ...(this.preLoadedDepositReservesSameTx ? this.preLoadedDepositReservesSameTx : []),
    ]).toArray();
    const tokenIds = getTokenIdsForScopeRefresh(this.kaminoMarket, allReserves);

    if (tokenIds.length > 0 && scopeRefreshConfig) {
      await this.addScopeRefreshIxs(scopeRefreshConfig.scope, tokenIds, scopeRefreshConfig.scopeFeed);
    }
  }

  private static optionalAccount(pubkey: PublicKey, programId: PublicKey = PROGRAM_ID): PublicKey {
    if (isNotNullPubkey(pubkey)) {
      return pubkey;
    } else {
      return programId;
    }
  }

  private addRefreshReserveIxs(reserves: PublicKey[], addAsSupportIx: AuxiliaryIx = 'setup') {
    reserves.forEach((reserveAddress) => {
      const foundReserve = this.kaminoMarket.getReserveByAddress(reserveAddress);
      if (!foundReserve) {
        throw new Error(`Could not find reserve ${reserveAddress} in reserves`);
      }

      const { state } = foundReserve;

      const refreshReserveIx = refreshReserve(
        {
          lendingMarket: this.kaminoMarket.getAddress(),
          reserve: reserveAddress,
          pythOracle: KaminoAction.optionalAccount(
            state.config.tokenInfo.pythConfiguration.price,
            this.kaminoMarket.programId
          ),
          switchboardPriceOracle: KaminoAction.optionalAccount(
            state.config.tokenInfo.switchboardConfiguration.priceAggregator,
            this.kaminoMarket.programId
          ),
          switchboardTwapOracle: KaminoAction.optionalAccount(
            state.config.tokenInfo.switchboardConfiguration.twapAggregator,
            this.kaminoMarket.programId
          ),
          scopePrices: KaminoAction.optionalAccount(
            state.config.tokenInfo.scopeConfiguration.priceFeed,
            this.kaminoMarket.programId
          ),
        },
        this.kaminoMarket.programId
      );

      if (addAsSupportIx === 'setup') {
        this.setupIxs.push(refreshReserveIx);
        this.setupIxsLabels.push(`RefreshReserve[${reserveAddress}]`);
      } else if (addAsSupportIx === 'inBetween') {
        this.inBetweenIxs.push(refreshReserveIx);
        this.inBetweenIxsLabels.push(`RefreshReserve[${reserveAddress}]`);
      } else {
        this.cleanupIxs.push(refreshReserveIx);
        this.cleanupIxsLabels.push(`RefreshReserve[${reserveAddress}]`);
      }
    });
  }

  public static getRefreshAllReserves(kaminoMarket: KaminoMarket, reserves: PublicKey[]): TransactionInstruction[] {
    return reserves.map((reserveAddress): TransactionInstruction => {
      const foundReserve = kaminoMarket.getReserveByAddress(reserveAddress);
      if (!foundReserve) {
        throw new Error(`Could not find reserve ${reserveAddress} in reserves`);
      }

      const { state } = foundReserve;
      return refreshReserve(
        {
          reserve: reserveAddress,
          lendingMarket: state.lendingMarket,
          pythOracle: this.optionalAccount(state.config.tokenInfo.pythConfiguration.price, kaminoMarket.programId),
          switchboardPriceOracle: this.optionalAccount(
            state.config.tokenInfo.switchboardConfiguration.priceAggregator,
            kaminoMarket.programId
          ),
          switchboardTwapOracle: this.optionalAccount(
            state.config.tokenInfo.switchboardConfiguration.twapAggregator,
            kaminoMarket.programId
          ),
          scopePrices: this.optionalAccount(
            state.config.tokenInfo.scopeConfiguration.priceFeed,
            kaminoMarket.programId
          ),
        },
        kaminoMarket.programId
      );
    });
  }

  private addRefreshObligationIx(addAsSupportIx: AuxiliaryIx = 'setup', skipReserves: PublicKey[] = []) {
    const marketAddress = this.kaminoMarket.getAddress();
    const obligationPda = this.getObligationPda();
    const refreshObligationIx = refreshObligation(
      {
        lendingMarket: marketAddress,
        obligation: obligationPda,
      },
      this.kaminoMarket.programId
    );

    const skipReservesSet = new PublicKeySet(skipReserves);

    const depositReservesList = this.getAdditionalDepositReservesList().filter(
      (reserve) => !skipReservesSet.contains(reserve)
    );
    const depositReserveAccountMetas = depositReservesList.map((reserve) => {
      return { pubkey: reserve, isSigner: false, isWritable: true };
    });

    const borrowReservesList = this.borrowReserves.filter((reserve) => !skipReservesSet.contains(reserve));
    const borrowReserveAccountMetas = borrowReservesList.map((reserve) => {
      return { pubkey: reserve, isSigner: false, isWritable: true };
    });

    const borrowReservesReferrerTokenStates = borrowReservesList
      .map((reserve) => {
        if (this.referrer.equals(PublicKey.default)) {
          return { pubkey: this.kaminoMarket.programId, isSigner: false, isWritable: false };
        }
        const referrerTokenStateAddress = referrerTokenStatePda(this.referrer, reserve, this.kaminoMarket.programId)[0];
        return { pubkey: referrerTokenStateAddress, isSigner: false, isWritable: true };
      })
      .filter((x) => !x.pubkey.equals(this.kaminoMarket.programId));

    refreshObligationIx.keys = refreshObligationIx.keys.concat([
      ...depositReserveAccountMetas,
      ...borrowReserveAccountMetas,
      ...borrowReservesReferrerTokenStates,
    ]);

    if (addAsSupportIx === 'setup') {
      this.setupIxs.push(refreshObligationIx);
      this.setupIxsLabels.push(`RefreshObligation[${obligationPda.toString()}]`);
    } else if (addAsSupportIx === 'inBetween') {
      this.inBetweenIxs.push(refreshObligationIx);
      this.inBetweenIxsLabels.push(`RefreshObligation[${obligationPda.toString()}]`);
    } else {
      this.cleanupIxs.push(refreshObligationIx);
      this.cleanupIxsLabels.push(`RefreshObligation[${obligationPda.toString()}]`);
    }
  }

  private addRequestElevationIx(elevationGroup: number, addAsSupportIx: AuxiliaryIx, skipReserves: PublicKey[] = []) {
    const obligationPda = this.getObligationPda();
    const args: RequestElevationGroupArgs = {
      elevationGroup,
    };
    const accounts: RequestElevationGroupAccounts = {
      owner: this.owner,
      obligation: obligationPda,
      lendingMarket: this.kaminoMarket.getAddress(),
    };

    const requestElevationGroupIx = requestElevationGroup(args, accounts, this.kaminoMarket.programId);

    const skipReservesSet = new PublicKeySet<PublicKey>(skipReserves);

    const depositReservesList = this.getAdditionalDepositReservesList().filter(
      (reserve) => !skipReservesSet.contains(reserve)
    );
    const depositReserveAccountMetas = depositReservesList.map((reserve) => {
      return { pubkey: reserve, isSigner: false, isWritable: true };
    });

    const borrowReservesList = this.borrowReserves.filter((reserve) => !skipReservesSet.contains(reserve));
    const borrowReserveAccountMetas = borrowReservesList.map((reserve) => {
      return { pubkey: reserve, isSigner: false, isWritable: true };
    });

    const borrowReservesReferrerTokenStates = borrowReservesList
      .map((reserve) => {
        if (this.referrer.equals(PublicKey.default)) {
          return { pubkey: this.kaminoMarket.programId, isSigner: false, isWritable: false };
        }
        const reserveState = this.kaminoMarket.getReserveByAddress(reserve)!;
        const referrerTokenStateAddress = referrerTokenStatePda(
          this.referrer,
          reserveState.address,
          this.kaminoMarket.programId
        )[0];
        return { pubkey: referrerTokenStateAddress, isSigner: false, isWritable: true };
      })
      .filter((x) => !x.pubkey.equals(this.kaminoMarket.programId));

    requestElevationGroupIx.keys = requestElevationGroupIx.keys.concat([
      ...depositReserveAccountMetas,
      ...borrowReserveAccountMetas,
      ...borrowReservesReferrerTokenStates,
    ]);

    if (addAsSupportIx === 'setup') {
      this.setupIxs.push(requestElevationGroupIx);
      this.setupIxsLabels.push(`RequestElevation[${obligationPda}], elevation_group:${elevationGroup}`);
    } else if (addAsSupportIx === 'inBetween') {
      this.inBetweenIxs.push(requestElevationGroupIx);
      this.inBetweenIxsLabels.push(`RequestElevation[${obligationPda}], elevation_group:${elevationGroup}`);
    } else {
      this.cleanupIxs.push(requestElevationGroupIx);
      this.cleanupIxsLabels.push(`RequestElevation[${obligationPda}], elevation_group:${elevationGroup}`);
    }
  }

  private addRefreshFarmsForReserve(
    reserves: KaminoReserve[],
    addAsSupportIx: AuxiliaryIx = 'setup',
    mode: typeof ReserveFarmKind.Collateral | typeof ReserveFarmKind.Debt,
    crank: PublicKey = this.payer,
    twoTokenAction: boolean = false
  ) {
    const farms: [
      typeof ReserveFarmKind.Collateral | typeof ReserveFarmKind.Debt,
      PublicKey,
      PublicKey,
      KaminoReserve
    ][] = [];

    for (const kaminoReserve of reserves) {
      if (mode === ReserveFarmKind.Collateral && !kaminoReserve.state.farmCollateral.equals(PublicKey.default)) {
        farms.push([
          ReserveFarmKind.Collateral,
          kaminoReserve.state.farmCollateral,
          obligationFarmStatePda(kaminoReserve.state.farmCollateral, this.getObligationPda()),
          kaminoReserve,
        ]);
      }
      if (mode === ReserveFarmKind.Debt && !kaminoReserve.state.farmDebt.equals(PublicKey.default)) {
        farms.push([
          ReserveFarmKind.Debt,
          kaminoReserve.state.farmDebt,
          obligationFarmStatePda(kaminoReserve.state.farmDebt, this.getObligationPda()),
          kaminoReserve,
        ]);
      }
    }

    farms.forEach(
      (arg: [typeof ReserveFarmKind.Collateral | typeof ReserveFarmKind.Debt, PublicKey, PublicKey, KaminoReserve]) => {
        const args: RefreshObligationFarmsForReserveArgs = { mode: arg[0].discriminator };
        const accounts: RefreshObligationFarmsForReserveAccounts = {
          crank,
          baseAccounts: {
            obligation: this.getObligationPda(),
            lendingMarketAuthority: this.kaminoMarket.getLendingMarketAuthority(),
            reserve: arg[3].address,
            reserveFarmState: arg[1],
            obligationFarmUserState: arg[2],
            lendingMarket: this.kaminoMarket.getAddress(),
          },
          farmsProgram: farmsId,
          rent: SYSVAR_RENT_PUBKEY,
          systemProgram: SystemProgram.programId,
        };
        const refreshFarmForObligationix = refreshObligationFarmsForReserve(
          args,
          accounts,
          this.kaminoMarket.programId
        );

        if (addAsSupportIx === 'setup') {
          this.setupIxs.push(refreshFarmForObligationix);
          this.setupIxsLabels.push(
            `RefreshFarmForObligation[${
              arg[0].kind
            }, res=${arg[3].address.toString()}, obl=${this.getObligationPda().toString()}]`
          );
          if (twoTokenAction) {
            // If two token action, this refresh needs to be the first inbetween ix
            this.inBetweenIxs.push(refreshFarmForObligationix);
            this.inBetweenIxsLabels.push(
              `RefreshFarmForObligation[${
                arg[0].kind
              }, res=${arg[3].address.toString()}, obl=${this.getObligationPda().toString()}]`
            );
          } else {
            this.refreshFarmsCleanupTxnIxs.push(refreshFarmForObligationix);
            this.refreshFarmsCleanupTxnIxsLabels.push(
              `RefreshFarmForObligation[${
                arg[0].kind
              }, res=${arg[3].address.toString()}, obl=${this.getObligationPda().toString()}]`
            );
          }
        } else if (addAsSupportIx === 'inBetween') {
          this.inBetweenIxs.push(refreshFarmForObligationix);
          this.inBetweenIxsLabels.push(
            `RefreshFarmForObligation[${
              arg[0].kind
            }, res=${arg[3].address.toString()}, obl=${this.getObligationPda().toString()}]`
          );

          this.refreshFarmsCleanupTxnIxs.push(refreshFarmForObligationix);
          this.refreshFarmsCleanupTxnIxsLabels.push(
            `RefreshFarmForObligation[${
              arg[0].kind
            }, res=${arg[3].address.toString()}, obl=${this.getObligationPda().toString()}]`
          );
        }
      }
    );
  }

  private addRefreshFarmsCleanupTxnIxsToCleanupIxs() {
    this.cleanupIxs.splice(0, 0, ...this.refreshFarmsCleanupTxnIxs);
    this.cleanupIxsLabels.splice(0, 0, ...this.refreshFarmsCleanupTxnIxsLabels);
  }

  private async addInitObligationForFarm(
    reserve: KaminoReserve,
    mode: typeof ReserveFarmKind.Collateral | typeof ReserveFarmKind.Debt,
    addAsSupportIx: AuxiliaryIx = 'setup'
  ): Promise<void> {
    const farms: [number, PublicKey, PublicKey][] = [];

    if (mode === ReserveFarmKind.Collateral && isNotNullPubkey(reserve.state.farmCollateral)) {
      const pda = obligationFarmStatePda(reserve.state.farmCollateral, this.getObligationPda());
      const account = await this.kaminoMarket.getConnection().getAccountInfo(pda);
      if (!account) {
        farms.push([ReserveFarmKind.Collateral.discriminator, reserve.state.farmCollateral, pda]);
      }
    }

    if (mode === ReserveFarmKind.Debt && isNotNullPubkey(reserve.state.farmDebt)) {
      const pda = obligationFarmStatePda(reserve.state.farmDebt, this.getObligationPda());
      const account = await this.kaminoMarket.getConnection().getAccountInfo(pda);
      if (!account) {
        farms.push([ReserveFarmKind.Debt.discriminator, reserve.state.farmDebt, pda]);
      }
    }

    farms.forEach((arg: [number, PublicKey, PublicKey]) => {
      const args: InitObligationFarmsForReserveArgs = { mode: arg[0] };
      const accounts: InitObligationFarmsForReserveAccounts = {
        owner: this.obligation ? this.obligation.state.owner : this.owner,
        payer: this.owner,
        obligation: this.getObligationPda(),
        lendingMarketAuthority: this.kaminoMarket.getLendingMarketAuthority(),
        reserve: reserve.address,
        reserveFarmState: arg[1],
        obligationFarm: arg[2],
        lendingMarket: this.kaminoMarket.getAddress(),
        farmsProgram: farmsId,
        rent: SYSVAR_RENT_PUBKEY,
        systemProgram: SystemProgram.programId,
      };
      const initObligationForFarm = initObligationFarmsForReserve(args, accounts, this.kaminoMarket.programId);
      if (addAsSupportIx === 'setup') {
        this.setupIxs.push(initObligationForFarm);
        this.setupIxsLabels.push(
          `InitObligationForFarm[${reserve.address.toString()}, ${this.getObligationPda().toString()}]`
        );
      } else if (addAsSupportIx === 'inBetween') {
        this.inBetweenIxs.push(initObligationForFarm);
        this.inBetweenIxsLabels.push(
          `InitObligationForFarm[${reserve.address.toString()}, ${this.getObligationPda().toString()}]`
        );
      }
    });
  }

  private addInitObligationIxs() {
    if (!this.obligation) {
      const obligationPda = this.getObligationPda();
      const [userMetadataAddress, _bump] = userMetadataPda(this.owner, this.kaminoMarket.programId);
      const initObligationIx = initObligation(
        {
          args: {
            tag: this.obligationType!.toArgs().tag,
            id: this.obligationType!.toArgs().id,
          },
        },
        {
          obligationOwner: this.owner,
          feePayer: this.payer,
          obligation: obligationPda,
          lendingMarket: this.kaminoMarket.getAddress(),
          seed1Account: this.obligationType!.toArgs().seed1,
          seed2Account: this.obligationType!.toArgs().seed2,
          ownerUserMetadata: userMetadataAddress,
          rent: SYSVAR_RENT_PUBKEY,
          systemProgram: SystemProgram.programId,
        },
        this.kaminoMarket.programId
      );
      this.setupIxs.push(initObligationIx);
      this.setupIxsLabels.push(`InitObligation[${obligationPda.toString()}]`);
    }
  }

  private addInitUserMetadataIxs(lookupTableAddress: PublicKey) {
    const [userMetadataAddress, _bump] = userMetadataPda(this.owner, this.kaminoMarket.programId);
    const referrerUserMetadataAddress = this.referrer.equals(PublicKey.default)
      ? this.kaminoMarket.programId
      : userMetadataPda(this.referrer, this.kaminoMarket.programId)[0];
    const initUserMetadataIx = initUserMetadata(
      {
        userLookupTable: lookupTableAddress,
      },
      {
        owner: this.owner,
        feePayer: this.payer,
        userMetadata: userMetadataAddress,
        referrerUserMetadata: referrerUserMetadataAddress,
        rent: SYSVAR_RENT_PUBKEY,
        systemProgram: SystemProgram.programId,
      },
      this.kaminoMarket.programId
    );
    this.setupIxs.push(initUserMetadataIx);
    this.setupIxsLabels.push(`initUserMetadata[${userMetadataAddress.toString()}]`);
  }

  private addInitReferrerTokenStateIx(reserve: KaminoReserve, referrerTokenState: PublicKey) {
    const initReferrerTokenStateIx = initReferrerTokenState(
      {
        lendingMarket: this.kaminoMarket.getAddress(),
        payer: this.owner,
        reserve: reserve.address,
        referrer: this.referrer,
        referrerTokenState,
        rent: SYSVAR_RENT_PUBKEY,
        systemProgram: SystemProgram.programId,
      },
      this.kaminoMarket.programId
    );
    this.setupIxs.unshift(initReferrerTokenStateIx);
    this.setupIxsLabels.unshift(`InitReferrerTokenState[${referrerTokenState.toString()} res=${reserve.address}]`);
  }

  private addWithdrawReferrerFeesIxs() {
    const referrerTokenStateAddress = referrerTokenStatePda(
      this.owner,
      this.reserve.address,
      this.kaminoMarket.programId
    )[0];

    const withdrawReferrerFeesIx = withdrawReferrerFees(
      {
        referrer: this.owner,
        lendingMarket: this.kaminoMarket.getAddress(),
        reserve: this.reserve.address,
        reserveLiquidityMint: this.reserve.getLiquidityMint(),
        referrerTokenState: referrerTokenStateAddress,
        reserveSupplyLiquidity: this.reserve.state.liquidity.supplyVault,
        referrerTokenAccount: this.getUserTokenAccountAddress(this.reserve),
        lendingMarketAuthority: this.kaminoMarket.getLendingMarketAuthority(),
        tokenProgram: this.reserve.getLiquidityTokenProgram(),
      },
      this.kaminoMarket.programId
    );

    this.lendingIxs.push(withdrawReferrerFeesIx);
    this.lendingIxsLabels.push(`WithdrawReferrerFeesIx[${this.owner.toString()}]`);
  }

  private addComputeBudgetIxn(units: number) {
    this.computeBudgetIxs.push(buildComputeBudgetIx(units));
    this.computeBudgetIxsLabels.push(`AddComputeBudget[${units}]`);
  }

  private async addAtaIxs(action: ActionType) {
    if (this.mint.equals(NATIVE_MINT) || this.secondaryMint?.equals(NATIVE_MINT)) {
      await this.updateWSOLAccount(action);
    }

    if ((action === 'withdraw' || action === 'borrow' || action === 'redeem') && !this.mint.equals(NATIVE_MINT)) {
      const [, createUserTokenAccountIx] = createAssociatedTokenAccountIdempotentInstruction(
        this.owner,
        this.reserve.getLiquidityMint(),
        this.owner,
        this.reserve.getLiquidityTokenProgram(),
        this.getUserTokenAccountAddress(this.reserve)
      );

      this.setupIxs.unshift(createUserTokenAccountIx);
      this.setupIxsLabels.unshift(`CreateLiquidityUserAta[${this.owner}]`);
    }

    if (action === 'liquidate') {
      if (!this.outflowReserve) {
        throw new Error(`Outflow reserve state not found ${this.secondaryMint}`);
      }

      const [, createUserTokenAccountIx] = createAssociatedTokenAccountIdempotentInstruction(
        this.owner,
        this.outflowReserve.getLiquidityMint(),
        this.owner,
        this.outflowReserve.getLiquidityTokenProgram(),
        this.getUserTokenAccountAddress(this.outflowReserve)
      );

      this.setupIxs.unshift(createUserTokenAccountIx);
      this.setupIxsLabels.unshift(`CreateUserAta[${this.getUserTokenAccountAddress(this.outflowReserve).toBase58()}]`);

      const [, createUserCollateralAccountIx] = createAssociatedTokenAccountIdempotentInstruction(
        this.owner,
        this.outflowReserve.getCTokenMint(),
        this.owner,
        TOKEN_PROGRAM_ID,
        this.getUserCollateralAccountAddress(this.outflowReserve)
      );

      this.setupIxs.unshift(createUserCollateralAccountIx);
      this.setupIxsLabels.unshift(
        `CreateCollateralUserAta[${this.getUserCollateralAccountAddress(this.outflowReserve).toString()}]`
      );
    }

    if (action === 'depositAndBorrow' || (action === 'repayAndWithdraw' && !this.secondaryMint?.equals(NATIVE_MINT))) {
      if (!this.outflowReserve) {
        throw new Error(`Outflow reserve state not found ${this.mint}`);
      }

      const additionalUserTokenAccountAddress = this.getUserTokenAccountAddress(this.outflowReserve);

      const additionalUserTokenAccountInfo = await this.kaminoMarket
        .getConnection()
        .getAccountInfo(additionalUserTokenAccountAddress);

      if (!additionalUserTokenAccountInfo) {
        const [, createUserTokenAccountIx] = createAssociatedTokenAccountIdempotentInstruction(
          this.owner,
          this.outflowReserve.getLiquidityMint(),
          this.owner,
          this.outflowReserve.getLiquidityTokenProgram(),
          additionalUserTokenAccountAddress
        );

        this.setupIxs.unshift(createUserTokenAccountIx);
        this.setupIxsLabels.unshift(`CreateAdditionalUserTokenAta[${this.owner}]`);
      }
    }

    if (action === 'withdraw' || action === 'mint' || action === 'deposit' || action === 'repayAndWithdraw') {
      const [, createUserTokenAccountIx] = createAssociatedTokenAccountIdempotentInstruction(
        this.owner,
        this.reserve.getLiquidityMint(),
        this.owner,
        this.reserve.getLiquidityTokenProgram(),
        this.getUserTokenAccountAddress(this.reserve)
      );
      this.setupIxs.unshift(createUserTokenAccountIx);
      this.setupIxsLabels.unshift(`CreateUserAta[${this.getUserTokenAccountAddress(this.reserve).toBase58()}]`);
    }
    if (action === 'mint') {
      const [, createUserCollateralAccountIx] = createAssociatedTokenAccountIdempotentInstruction(
        this.owner,
        this.reserve.getCTokenMint(),
        this.owner,
        TOKEN_PROGRAM_ID,
        this.getUserCollateralAccountAddress(this.reserve)
      );

      this.setupIxs.unshift(createUserCollateralAccountIx);
      this.setupIxsLabels.unshift(
        `CreateCollateralUserAta[${this.getUserCollateralAccountAddress(this.reserve).toString()}]`
      );
    }
  }

  private async updateWSOLAccount(action: ActionType) {
    const preIxs: Array<TransactionInstruction> = [];
    const postIxs: Array<TransactionInstruction> = [];
    const preIxsLabels: Array<string> = [];
    const postIxsLabels: Array<string> = [];

    if (action === 'depositAndBorrow' || action === 'repayAndWithdraw') {
      return;
    }

    let safeRepay = new BN(this.amount);

    if (this.obligation && (action === 'repay' || action === 'repayAndWithdrawV2') && this.amount.eq(new BN(U64_MAX))) {
      const borrow = this.obligation.state.borrows.find(
        (borrow) => borrow.borrowReserve.toString() === this.reserve.address.toString()
      );

      if (!borrow) {
        throw Error(`Unable to find obligation borrow to repay for ${this.obligation.state.owner.toBase58()}`);
      }

      const cumulativeBorrowRateObligation = KaminoObligation.getCumulativeBorrowRate(borrow);
      const cumulativeBorrowRateReserve = this.reserve.getEstimatedCumulativeBorrowRate(
        this.currentSlot,
        this.kaminoMarket.state.referralFeeBps
      );

      safeRepay = new BN(
        Math.floor(
          KaminoObligation.getBorrowAmount(borrow)
            .mul(cumulativeBorrowRateReserve)
            .div(cumulativeBorrowRateObligation)
            .add(new Decimal(SOL_PADDING_FOR_INTEREST.toString()))
            .toNumber()
        ).toString()
      );
    }

    let userTokenAccountAddress = this.getUserTokenAccountAddress(this.reserve);
    if (this.secondaryMint?.equals(NATIVE_MINT)) {
      if (!this.outflowReserve) {
        throw new Error(`Outflow reserve state not found ${this.secondaryMint}`);
      }

      const additionalUserTokenAccountAddress = this.getUserTokenAccountAddress(this.outflowReserve);
      userTokenAccountAddress = additionalUserTokenAccountAddress;
    }

    const userWSOLAccountInfo = await this.kaminoMarket.getConnection().getAccountInfo(userTokenAccountAddress);

    const rentExempt = await this.kaminoMarket.getConnection().getMinimumBalanceForRentExemption(165);

    // Add rent exemption lamports for WSOL accounts that need to be pre-funded for inflow/send transactions
    const sendAction =
      action === 'deposit' ||
      action === 'repay' ||
      action === 'repayAndWithdrawV2' ||
      action === 'mint' ||
      (action === 'liquidate' && this.mint?.equals(NATIVE_MINT)); // only sync WSOL amount if liquidator repays SOL which is secondaryMint

    const transferLamportsIx = SystemProgram.transfer({
      fromPubkey: this.owner,
      toPubkey: userTokenAccountAddress,
      lamports: (userWSOLAccountInfo ? 0 : rentExempt) + (sendAction ? parseInt(safeRepay.toString(), 10) : 0),
    });
    preIxs.push(transferLamportsIx);
    preIxsLabels.push(`TransferLamportsToUserAtaSOL[${userTokenAccountAddress}]`);

    const closeWSOLAccountIx = createCloseAccountInstruction(
      userTokenAccountAddress,
      this.owner,
      this.owner,
      [],
      TOKEN_PROGRAM_ID
    );

    const syncIx = createSyncNativeInstruction(userTokenAccountAddress);
    if (userWSOLAccountInfo) {
      if (sendAction) {
        preIxs.push(syncIx);
        preIxsLabels.push(`SyncUserAtaSOL[${userTokenAccountAddress}]`);
      } else {
        postIxs.push(closeWSOLAccountIx);
        postIxsLabels.push(`CloseUserAtaSOL[${userTokenAccountAddress}]`);
      }
    } else {
      const [, createUserWSOLAccountIx] = createAssociatedTokenAccountIdempotentInstruction(
        this.owner,
        NATIVE_MINT,
        this.owner,
        TOKEN_PROGRAM_ID,
        userTokenAccountAddress
      );
      preIxs.push(createUserWSOLAccountIx);
      preIxsLabels.push(`CreateUserAtaSOL[${userTokenAccountAddress}]`);
      preIxs.push(syncIx);
      preIxsLabels.push(`SyncUserAtaSOL[${userTokenAccountAddress}]`);
      postIxs.push(closeWSOLAccountIx);
      postIxsLabels.push(`CloseUserAtaSOL[${userTokenAccountAddress}]`);
    }

    this.setupIxs.unshift(...preIxs);
    this.setupIxsLabels.unshift(...preIxsLabels);
    this.cleanupIxs.push(...postIxs);
    this.cleanupIxsLabels.push(...postIxsLabels);
  }

  static async initializeMultiTokenAction(
    kaminoMarket: KaminoMarket,
    action: ActionType,
    inflowAmount: string | BN,
    inflowTokenMint: PublicKey,
    outflowTokenMint: PublicKey,
    payer: PublicKey,
    obligationOwner: PublicKey,
    obligation: KaminoObligation | ObligationType,
    outflowAmount?: string | BN,
    referrer: PublicKey = PublicKey.default,
    currentSlot: number = 0
  ) {
    const inflowReserve = kaminoMarket.getReserveByMint(inflowTokenMint);
    const outflowReserve = kaminoMarket.getReserveByMint(outflowTokenMint);

    if (!outflowReserve || !inflowReserve) {
      throw new Error('reserve states are not fetched');
    }

    const { kaminoObligation, depositReserves, borrowReserves, distinctReserveCount } =
      await KaminoAction.loadObligation(
        action,
        kaminoMarket,
        obligationOwner,
        inflowReserve.address,
        obligation,
        outflowReserve.address
      );
    const referrerKey = await this.getReferrerKey(kaminoMarket, payer, kaminoObligation, referrer);

    let secondaryMint: PublicKey;
    let primaryMint: PublicKey;

    if (
      action === 'liquidate' ||
      action === 'depositAndBorrow' ||
      action === 'repayAndWithdraw' ||
      action === 'repayAndWithdrawV2'
    ) {
      primaryMint = inflowTokenMint;
      secondaryMint = outflowTokenMint;
    } else {
      throw new Error('Invalid action');
    }

    return new KaminoAction(
      kaminoMarket,
      payer,
      kaminoObligation || obligation,
      primaryMint,
      distinctReserveCount,
      inflowAmount,
      depositReserves,
      borrowReserves,
      inflowReserve,
      currentSlot,
      secondaryMint,
      outflowReserve,
      outflowAmount,
      referrerKey
    );
  }

  static async initializeWithdrawReferrerFees(
    mint: PublicKey,
    owner: PublicKey,
    kaminoMarket: KaminoMarket,
    currentSlot: number = 0
  ) {
    const reserve = kaminoMarket.getReserveByMint(mint);
    if (reserve === undefined) {
      throw new Error(`Reserve ${mint} not found in market ${kaminoMarket.getAddress().toBase58()}`);
    }

    const [{ createAtaIx }] = createAtasIdempotent(owner, [
      {
        mint: reserve.getLiquidityMint(),
        tokenProgram: reserve.getLiquidityTokenProgram(),
      },
    ]);

    return {
      axn: new KaminoAction(
        kaminoMarket,
        owner,
        new VanillaObligation(kaminoMarket.programId),
        mint,
        0,
        new BN(0),
        [],
        [],
        reserve,
        currentSlot,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined
      ),
      createAtaIxs: [createAtaIx],
    };
  }

  getWithdrawCollateralAmount(reserve: KaminoReserve, amount: BN): BN {
    const collateralExchangeRate = reserve.getEstimatedCollateralExchangeRate(
      this.currentSlot,
      this.kaminoMarket.state.referralFeeBps
    );

    return amount.eq(new BN(U64_MAX))
      ? amount
      : new BN(new Decimal(amount.toString()).mul(collateralExchangeRate).ceil().toString());
  }

  getObligationPda(): PublicKey {
    return this.obligation
      ? this.obligation.obligationAddress
      : this.obligationType!.toPda(this.kaminoMarket.getAddress(), this.owner);
  }

  getAdditionalDepositReservesList(): PublicKey[] {
    const depositReservesList = this.depositReserves;

    // check if there's any member in the preloadedDepositReserves that is not in the depositReserves
    // if so, add it to the depositReserves
    for (let i = 0; i < this.preLoadedDepositReservesSameTx.length; i++) {
      const preloadedDepositReserve = this.preLoadedDepositReservesSameTx[i];

      // Check if the depositReserves array contains the current preloadedDepositReserve
      const found = this.depositReserves.some((depositReserve) => {
        return depositReserve.equals(preloadedDepositReserve);
      });

      // If not found, push the current preloadedDepositReserve to the depositReserves array
      if (!found) {
        depositReservesList.push(this.preLoadedDepositReservesSameTx[i]);
      }
    }

    return depositReservesList;
  }

  private static async getReferrerKey(
    kaminoMarket: KaminoMarket,
    owner: PublicKey,
    kaminoObligation: KaminoObligation | null,
    referrer: PublicKey
  ): Promise<PublicKey> {
    let referrerKey = referrer;
    if (!referrer || referrer.equals(PublicKey.default)) {
      if (kaminoObligation === null) {
        const [_, userMetadata] = await kaminoMarket.getUserMetadata(owner);
        if (userMetadata) {
          referrerKey = userMetadata.referrer;
        }
      } else {
        referrerKey = kaminoObligation.state.referrer;
      }
    }
    return referrerKey;
  }

  getUserTokenAccountAddress(reserve: KaminoReserve): PublicKey {
    return getAssociatedTokenAddress(reserve.getLiquidityMint(), this.owner, true, reserve.getLiquidityTokenProgram());
  }

  getTokenAccountAddressByUser(reserve: KaminoReserve, user: PublicKey): PublicKey {
    return getAssociatedTokenAddress(reserve.getLiquidityMint(), user, true, reserve.getLiquidityTokenProgram());
  }

  getUserCollateralAccountAddress(reserve: KaminoReserve): PublicKey {
    return getAssociatedTokenAddress(reserve.getCTokenMint(), this.owner, true);
  }

  public static actionToIxs(action: KaminoAction): Array<TransactionInstruction> {
    const ixs: TransactionInstruction[] = [...action.computeBudgetIxs, ...action.setupIxs];
    ixs.push(...KaminoAction.actionToLendingIxs(action));
    ixs.push(...action.cleanupIxs);
    return ixs;
  }

  public static actionToLendingIxs(action: KaminoAction): Array<TransactionInstruction> {
    const ixs: TransactionInstruction[] = [];
    for (let i = 0; i < action.lendingIxs.length; i++) {
      ixs.push(action.lendingIxs[i]);
      if (i !== action.lendingIxs.length - 1) {
        ixs.push(...action.inBetweenIxs);
      }
    }
    return ixs;
  }

  public static actionToIxLabels(action: KaminoAction): Array<string> {
    const labels: string[] = [...action.computeBudgetIxsLabels, ...action.setupIxsLabels];
    labels.push(...KaminoAction.actionToLendingIxLabels(action));
    labels.push(...action.cleanupIxsLabels);
    return labels;
  }

  public static actionToLendingIxLabels(action: KaminoAction): Array<string> {
    const labels: string[] = [];
    for (let i = 0; i < action.lendingIxsLabels.length; i++) {
      labels.push(action.lendingIxsLabels[i]);
      if (i !== action.lendingIxsLabels.length - 1) {
        labels.push(...action.inBetweenIxsLabels);
      }
    }
    return labels;
  }
}
