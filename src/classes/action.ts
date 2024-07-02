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
} from '@solana/spl-token';
import BN from 'bn.js';
import Decimal from 'decimal.js';
import {
  borrowObligationLiquidity,
  depositObligationCollateral,
  depositReserveLiquidity,
  depositReserveLiquidityAndObligationCollateral,
  initObligation,
  initObligationFarmsForReserve,
  InitObligationFarmsForReserveAccounts,
  InitObligationFarmsForReserveArgs,
  initReferrerTokenState,
  initUserMetadata,
  liquidateObligationAndRedeemReserveCollateral,
  redeemReserveCollateral,
  refreshObligation,
  refreshObligationFarmsForReserve,
  RefreshObligationFarmsForReserveAccounts,
  RefreshObligationFarmsForReserveArgs,
  refreshReserve,
  repayObligationLiquidity,
  requestElevationGroup,
  RequestElevationGroupAccounts,
  RequestElevationGroupArgs,
  withdrawObligationCollateralAndRedeemReserveCollateral,
  withdrawReferrerFees,
} from '../idl_codegen/instructions';
import {
  buildComputeBudgetIx,
  createAssociatedTokenAccountIdempotentInstruction,
  ObligationType,
  syncNative,
  U64_MAX,
  referrerTokenStatePda,
  userMetadataPda,
  getAtasWithCreateIxnsIfMissing,
  checkIfAccountExists,
  createLookupTableIx,
  isNotNullPubkey,
  PublicKeySet,
  WRAPPED_SOL_MINT,
  getAssociatedTokenAddress,
} from '../utils';
import { KaminoMarket } from './market';
import { KaminoObligation } from './obligation';
import { KaminoReserve } from './reserve';
import { ReserveFarmKind } from '../idl_codegen/types';
import { farmsId } from '@hubbleprotocol/farms-sdk';
import { Reserve } from '../idl_codegen/accounts';
import { VanillaObligation } from '../utils/ObligationType';
import { PROGRAM_ID } from '../lib';

export const POSITION_LIMIT = 10;
export const BORROWS_LIMIT = 5;
export const DEPOSITS_LIMIT = 8;

const SOL_PADDING_FOR_INTEREST = new BN('1000000');

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
  | 'withdrawReferrerFees';

export class KaminoAction {
  kaminoMarket: KaminoMarket;

  reserve: KaminoReserve;

  outflowReserve: KaminoReserve | undefined;

  owner: PublicKey;
  payer: PublicKey;

  obligation: KaminoObligation | null = null;

  referrer: PublicKey;

  userTokenAccountAddress: PublicKey;

  userCollateralAccountAddress: PublicKey;

  additionalTokenAccountAddress?: PublicKey;

  /**
   * Null unless the obligation is not passed
   */
  obligationType: ObligationType | null = null;

  mint: PublicKey;

  secondaryMint?: PublicKey;

  positions?: number;

  amount: BN;
  outflowAmount?: BN;

  hostAta?: PublicKey;

  setupIxs: Array<TransactionInstruction>;
  setupIxsLabels: Array<string>;

  inBetweenIxs: Array<TransactionInstruction>;
  inBetweenIxsLabels: Array<string>;

  lendingIxs: Array<TransactionInstruction>;
  lendingIxsLabels: Array<string>;

  cleanupIxs: Array<TransactionInstruction>;
  cleanupIxsLabels: Array<string>;

  preTxnIxs: Array<TransactionInstruction>;
  preTxnIxsLabels: Array<string>;

  postTxnIxs: Array<TransactionInstruction>;
  postTxnIxsLabels: Array<string>;

  refreshFarmsCleanupTxnIxs: Array<TransactionInstruction>;
  refreshFarmsCleanupTxnIxsLabels: Array<string>;

  depositReserves: Array<PublicKey>;
  borrowReserves: Array<PublicKey>;

  preLoadedDepositReservesSameTx: Array<PublicKey>;
  preLoadedBorrowReservesSameTx: Array<PublicKey>;

  currentSlot: number;

  private constructor(
    kaminoMarket: KaminoMarket,
    owner: PublicKey,
    obligation: KaminoObligation | ObligationType | null,
    userTokenAccountAddress: PublicKey,
    userCollateralAccountAddress: PublicKey,
    mint: PublicKey,
    positions: number,
    amount: string | BN,
    depositReserves: Array<PublicKey>,
    borrowReserves: Array<PublicKey>,
    reserveState: KaminoReserve,
    currentSlot: number,
    hostAta?: PublicKey,
    secondaryMint?: PublicKey,
    additionalTokenAccountAddress?: PublicKey,
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
    this.hostAta = hostAta;
    this.userTokenAccountAddress = userTokenAccountAddress;
    this.userCollateralAccountAddress = userCollateralAccountAddress;
    this.setupIxs = [];
    this.setupIxsLabels = [];
    this.inBetweenIxs = [];
    this.inBetweenIxsLabels = [];
    this.lendingIxs = [];
    this.lendingIxsLabels = [];
    this.cleanupIxs = [];
    this.cleanupIxsLabels = [];
    this.preTxnIxs = [];
    this.preTxnIxsLabels = [];
    this.postTxnIxs = [];
    this.postTxnIxsLabels = [];
    this.refreshFarmsCleanupTxnIxs = [];
    this.refreshFarmsCleanupTxnIxsLabels = [];
    this.depositReserves = depositReserves;
    this.borrowReserves = borrowReserves;
    this.additionalTokenAccountAddress = additionalTokenAccountAddress;
    this.secondaryMint = secondaryMint;
    this.reserve = reserveState;
    this.outflowReserve = outflowReserveState;
    this.outflowAmount = outflowAmount ? new BN(outflowAmount) : undefined;
    this.preLoadedDepositReservesSameTx = [];
    this.preLoadedBorrowReservesSameTx = [];
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
    hostAta?: PublicKey,
    payer?: PublicKey
  ) {
    const reserve = kaminoMarket.getReserveByMint(mint);
    if (reserve === undefined) {
      throw new Error(`Reserve ${mint} not found in market ${kaminoMarket.getAddress().toBase58()}`);
    }

    const { userTokenAccountAddress, userCollateralAccountAddress } = KaminoAction.getUserAccountAddresses(
      payer ?? owner,
      reserve.state
    );

    const { kaminoObligation, depositReserves, borrowReserves, distinctReserveCount } =
      await KaminoAction.loadObligation(action, kaminoMarket, owner, reserve.address, obligation);

    const referrerKey = await this.getReferrerKey(kaminoMarket, owner, kaminoObligation, referrer);

    return new KaminoAction(
      kaminoMarket,
      owner,
      kaminoObligation || obligation,
      userTokenAccountAddress,
      userCollateralAccountAddress,
      mint,
      distinctReserveCount,
      amount,
      depositReserves,
      borrowReserves,
      reserve,
      currentSlot,
      hostAta,
      undefined,
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
      [
        ...new Set([
          ...borrowReserves.map((e) => e.toBase58()),
          ...(action === 'borrow' ? [reserve.toBase58()] : []),
          ...(action === 'depositAndBorrow' ? [reserve.toBase58()] : []),
        ]),
      ].length +
      [
        ...new Set([
          ...depositReserves.map((e) => e.toBase58()),
          ...(action === 'deposit' ? [reserve.toBase58()] : []),
          ...(action === 'depositAndBorrow' ? [outflowReserve!.toBase58()] : []),
        ]),
      ].length;

    if (distinctReserveCount > POSITION_LIMIT) {
      throw Error(`Obligation already has max number of positions: ${POSITION_LIMIT}`);
    }

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
    const firstReserve = obligation.state.deposits[0].depositReserve;
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
    const firstReserve = obligation.state.deposits[0].depositReserve;
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
    axn.addRequestElevationIx(elevationGroup, true);

    return axn;
  }

  static async buildDepositTxns(
    kaminoMarket: KaminoMarket,
    amount: string | BN,
    mint: PublicKey,
    owner: PublicKey,
    obligation: KaminoObligation | ObligationType,
    extraComputeBudget: number = 1_000_000, // if > 0 then adds the ixn
    includeAtaIxns: boolean = true, // if true it includes create and close wsol and token atas,
    requestElevationGroup: boolean = false,
    includeUserMetadata: boolean = true, // if true it includes user metadata
    referrer: PublicKey = PublicKey.default,
    currentSlot: number = 0
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
      includeUserMetadata,
      addInitObligationForFarm
    );
    axn.addDepositIx();
    axn.addRefreshFarmsCleanupTxnIxsToCleanupIxs();

    return axn;
  }

  static async buildBorrowTxns(
    kaminoMarket: KaminoMarket,
    amount: string | BN,
    mint: PublicKey,
    owner: PublicKey,
    obligation: KaminoObligation | ObligationType,
    extraComputeBudget: number = 1_000_000, // if > 0 then adds the ixn
    includeAtaIxns: boolean = true, // if true it includes create and close wsol and token atas,
    requestElevationGroup: boolean = false,
    includeUserMetadata: boolean = true, // if true it includes user metadata
    referrer: PublicKey = PublicKey.default,
    currentSlot: number = 0,
    hostAta?: PublicKey
  ) {
    const axn = await KaminoAction.initialize(
      'borrow',
      amount,
      mint,
      owner,
      kaminoMarket,
      obligation,
      referrer,
      currentSlot,
      hostAta
    );
    const addInitObligationForFarm = true;
    if (extraComputeBudget > 0) {
      axn.addComputeBudgetIxn(extraComputeBudget);
    }
    await axn.addSupportIxs(
      'borrow',
      includeAtaIxns,
      requestElevationGroup,
      includeUserMetadata,
      addInitObligationForFarm
    );
    axn.addBorrowIx();
    axn.addRefreshFarmsCleanupTxnIxsToCleanupIxs();

    return axn;
  }

  static async buildDepositReserveLiquidityTxns(
    kaminoMarket: KaminoMarket,
    amount: string | BN,
    mint: PublicKey,
    owner: PublicKey,
    obligation: KaminoObligation | ObligationType,
    extraComputeBudget: number = 1_000_000, // if > 0 then adds the ixn
    includeAtaIxns: boolean = true, // if true it includes create and close wsol and token atas
    requestElevationGroup: boolean = false,
    includeUserMetadata: boolean = true, // if true it includes user metadata
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
      includeUserMetadata,
      addInitObligationForFarm
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
    extraComputeBudget: number = 1_000_000, // if > 0 then adds the ixn
    includeAtaIxns: boolean = true, // if true it includes create and close wsol and token atas
    requestElevationGroup: boolean = false,
    includeUserMetadata: boolean = true, // if true it includes user metadata,
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
      includeUserMetadata,
      addInitObligationForFarm
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
    extraComputeBudget: number = 1_000_000, // if > 0 then adds the ixn
    includeAtaIxns: boolean = true, // if true it includes create and close wsol and token atas
    requestElevationGroup: boolean = false,
    includeUserMetadata: boolean = true, // if true it includes user metadata
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
      includeUserMetadata,
      addInitObligationForFarm
    );
    axn.addDepositObligationCollateralIx();
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
    extraComputeBudget: number = 1_000_000, // if > 0 then adds the ixn
    includeAtaIxns: boolean = true, // if true it includes create and close wsol and token atas,
    requestElevationGroup: boolean = false,
    includeUserMetadata: boolean = true, // if true it includes user metadata,
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

    await axn.addSupportIxs(
      'deposit',
      includeAtaIxns,
      requestElevationGroup,
      includeUserMetadata,
      addInitObligationForFarmForDeposit,
      twoTokenAction
    );
    await axn.addDepositAndBorrowIx();
    await axn.addInBetweenIxs(
      'depositAndBorrow',
      includeAtaIxns,
      requestElevationGroup,
      addInitObligationForFarmForBorrow
    );
    axn.addRefreshFarmsCleanupTxnIxsToCleanupIxs();
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
    extraComputeBudget: number = 1_000_000, // if > 0 then adds the ixn
    includeAtaIxns: boolean = true, // if true it includes create and close wsol and token atas,
    requestElevationGroup: boolean = false,
    includeUserMetadata: boolean = true, // if true it includes user metadata,
    isClosingPosition: boolean = false,
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
      includeUserMetadata,
      addInitObligationForFarmForRepay,
      twoTokenAction
    );
    await axn.addRepayAndWithdrawIxs();
    await axn.addInBetweenIxs(
      'repayAndWithdraw',
      includeAtaIxns,
      requestElevationGroup,
      addInitObligationForFarmForWithdraw,
      isClosingPosition
    );
    axn.addRefreshFarmsCleanupTxnIxsToCleanupIxs();
    return axn;
  }

  static async buildWithdrawTxns(
    kaminoMarket: KaminoMarket,
    amount: string | BN,
    mint: PublicKey,
    owner: PublicKey,
    obligation: KaminoObligation | ObligationType,
    extraComputeBudget: number = 1_000_000, // if > 0 then adds the ixn
    includeAtaIxns: boolean = true, // if true it includes create and close wsol and token atas,
    requestElevationGroup: boolean = false,
    includeUserMetadata: boolean = true, // if true it includes user metadata
    referrer: PublicKey = PublicKey.default,
    currentSlot: number = 0
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
    await axn.addSupportIxs(
      'withdraw',
      includeAtaIxns,
      requestElevationGroup,
      includeUserMetadata,
      addInitObligationForFarm
    );
    await axn.addWithdrawIx();
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
    currentSlot: number,
    payer: PublicKey | undefined = undefined,
    extraComputeBudget: number = 1_000_000,
    includeAtaIxns: boolean = true,
    requestElevationGroup: boolean = false,
    includeUserMetadata: boolean = true,
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
      undefined,
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
      includeUserMetadata,
      addInitObligationForFarm
    );
    await axn.addRepayIx();
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
    extraComputeBudget: number = 1_000_000, // if > 0 then adds the ixn
    includeAtaIxns: boolean = true, // if true it includes create and close wsol and token atas, and creates all other token atas if they don't exist
    requestElevationGroup: boolean = false,
    includeUserMetadata: boolean = true, // if true it includes user metadata
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
      includeUserMetadata,
      addInitObligationForFarm
    );
    await axn.addLiquidateIx(maxAllowedLtvOverridePercent);
    axn.addRefreshFarmsCleanupTxnIxsToCleanupIxs();

    return axn;
  }

  static async buildWithdrawReferrerFeeTxns(
    owner: PublicKey,
    tokenMint: PublicKey,
    kaminoMarket: KaminoMarket,
    currentSlot: number = 0
  ) {
    const { axn, createAtasIxns } = await KaminoAction.initializeWithdrawReferrerFees(
      tokenMint,
      owner,
      kaminoMarket,
      currentSlot
    );

    axn.preTxnIxs.push(...createAtasIxns);
    axn.preTxnIxsLabels.push(`createAtasIxs[${axn.userTokenAccountAddress.toString()}]`);

    axn.addRefreshReserveIxs([axn.reserve.address]);
    axn.addWithdrawReferrerFeesIxs();

    return axn;
  }

  async getTransactions() {
    const txns: {
      preLendingTxn: Transaction | null;
      lendingTxn: Transaction | null;
      postLendingTxn: Transaction | null;
    } = {
      preLendingTxn: null,
      lendingTxn: null,
      postLendingTxn: null,
    };

    if (this.preTxnIxs.length) {
      txns.preLendingTxn = new Transaction({
        feePayer: this.owner,
        recentBlockhash: (await this.kaminoMarket.getConnection().getLatestBlockhash()).blockhash,
      }).add(...this.preTxnIxs);
    }

    if (this.lendingIxs.length === 2) {
      txns.lendingTxn = new Transaction({
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
      txns.lendingTxn = new Transaction({
        feePayer: this.owner,
        recentBlockhash: (await this.kaminoMarket.getConnection().getLatestBlockhash()).blockhash,
      }).add(...this.setupIxs, ...this.lendingIxs, ...this.cleanupIxs);
    }

    if (this.postTxnIxs.length) {
      txns.postLendingTxn = new Transaction({
        feePayer: this.owner,
        recentBlockhash: (await this.kaminoMarket.getConnection().getLatestBlockhash()).blockhash,
      }).add(...this.postTxnIxs);
    }

    return txns;
  }

  async sendTransactions(sendTransaction: (txn: Transaction, connection: Connection) => Promise<TransactionSignature>) {
    const txns = await this.getTransactions();

    await this.sendSingleTransaction(txns.preLendingTxn, sendTransaction);

    const signature = await this.sendSingleTransaction(txns.lendingTxn, sendTransaction);

    await this.sendSingleTransaction(txns.postLendingTxn, sendTransaction);

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

    await this.simulateSingleTransaction(txns.preLendingTxn, sendTransaction);

    const signature = await this.simulateSingleTransaction(txns.lendingTxn, sendTransaction);

    await this.simulateSingleTransaction(txns.postLendingTxn, sendTransaction);

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
          userSourceLiquidity: this.userTokenAccountAddress,
          placeholderUserDestinationCollateral: this.kaminoMarket.programId,
          collateralTokenProgram: TOKEN_PROGRAM_ID,
          liquidityTokenProgram: this.reserve.getLiquidityTokenProgram(),
          instructionSysvarAccount: SYSVAR_INSTRUCTIONS_PUBKEY,
        },
        this.kaminoMarket.programId
      )
    );
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
          userSourceLiquidity: this.userTokenAccountAddress,
          userDestinationCollateral: this.userCollateralAccountAddress,
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
          userSourceCollateral: this.userCollateralAccountAddress,
          userDestinationLiquidity: this.userTokenAccountAddress,
          collateralTokenProgram: TOKEN_PROGRAM_ID,
          liquidityTokenProgram: this.reserve.getLiquidityTokenProgram(),
          instructionSysvarAccount: SYSVAR_INSTRUCTIONS_PUBKEY,
        },
        this.kaminoMarket.programId
      )
    );
  }

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
          userSourceCollateral: this.userCollateralAccountAddress,
          tokenProgram: TOKEN_PROGRAM_ID,
          instructionSysvarAccount: SYSVAR_INSTRUCTIONS_PUBKEY,
        },
        this.kaminoMarket.programId
      )
    );
  }

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
        userDestinationLiquidity: this.userTokenAccountAddress,
        borrowReserveLiquidityFeeReceiver: this.reserve.state.liquidity.feeVault,
        referrerTokenState: referrerTokenStatePda(this.referrer, this.reserve.address, this.kaminoMarket.programId)[0],
        tokenProgram: this.reserve.getLiquidityTokenProgram(),
        instructionSysvarAccount: SYSVAR_INSTRUCTIONS_PUBKEY,
      },
      this.kaminoMarket.programId
    );
    borrowIx.keys = this.obligation?.state.elevationGroup
      ? borrowIx.keys.concat([...depositReserveAccountMetas])
      : borrowIx.keys;
    this.lendingIxs.push(borrowIx);
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
          userSourceLiquidity: this.userTokenAccountAddress,
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

    if (!this.additionalTokenAccountAddress) {
      throw new Error(`additionalTokenAccountAddress not set`);
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
        userDestinationLiquidity: this.additionalTokenAccountAddress,
        borrowReserveLiquidityFeeReceiver: this.outflowReserve.state.liquidity.feeVault,
        referrerTokenState: referrerTokenStatePda(
          this.referrer,
          this.outflowReserve.address,
          this.kaminoMarket.programId
        )[0],
        tokenProgram: this.reserve.getLiquidityTokenProgram(),
        instructionSysvarAccount: SYSVAR_INSTRUCTIONS_PUBKEY,
      },
      this.kaminoMarket.programId
    );

    borrowIx.keys = borrowIx.keys.concat([...depositReserveAccountMetas]);

    this.lendingIxs.push(borrowIx);
  }

  async addRepayAndWithdrawIxs() {
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
        userSourceLiquidity: this.userTokenAccountAddress,
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

    if (!this.additionalTokenAccountAddress) {
      throw new Error(`additionalTokenAccountAddress not set`);
    }

    if (!this.outflowAmount) {
      throw new Error(`outflowAmount not set`);
    }

    const collateralExchangeRate = this.outflowReserve.getEstimatedCollateralExchangeRate(
      this.currentSlot,
      this.kaminoMarket.state.referralFeeBps
    );

    this.lendingIxs.push(
      withdrawObligationCollateralAndRedeemReserveCollateral(
        {
          collateralAmount: this.outflowAmount.eq(new BN(U64_MAX))
            ? this.outflowAmount
            : new BN(new Decimal(this.outflowAmount.toString()).mul(collateralExchangeRate).ceil().toString()),
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
          userDestinationLiquidity: this.additionalTokenAccountAddress,
          placeholderUserDestinationCollateral: this.kaminoMarket.programId,
          collateralTokenProgram: TOKEN_PROGRAM_ID,
          liquidityTokenProgram: this.reserve.getLiquidityTokenProgram(),
          instructionSysvarAccount: SYSVAR_INSTRUCTIONS_PUBKEY,
        },
        this.kaminoMarket.programId
      )
    );
  }

  async addWithdrawIx() {
    const collateralExchangeRate = this.reserve.getEstimatedCollateralExchangeRate(
      this.currentSlot,
      this.kaminoMarket.state.referralFeeBps
    );

    const collateralAmount = this.amount.eq(new BN(U64_MAX))
      ? this.amount
      : new BN(new Decimal(this.amount.toString()).mul(collateralExchangeRate).ceil().toString());

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
          userDestinationLiquidity: this.userTokenAccountAddress,
          placeholderUserDestinationCollateral: this.kaminoMarket.programId,
          collateralTokenProgram: TOKEN_PROGRAM_ID,
          liquidityTokenProgram: this.reserve.getLiquidityTokenProgram(),
          instructionSysvarAccount: SYSVAR_INSTRUCTIONS_PUBKEY,
        },
        this.kaminoMarket.programId
      )
    );
  }

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
        userSourceLiquidity: this.userTokenAccountAddress,
        reserveDestinationLiquidity: this.reserve.state.liquidity.supplyVault,
        tokenProgram: this.reserve.getLiquidityTokenProgram(),
        instructionSysvarAccount: SYSVAR_INSTRUCTIONS_PUBKEY,
      },
      this.kaminoMarket.programId
    );

    repayIx.keys =
      this.obligation?.state.elevationGroup !== 0 ? repayIx.keys.concat([...depositReserveAccountMetas]) : repayIx.keys;

    this.lendingIxs.push(repayIx);
  }

  async addLiquidateIx(maxAllowedLtvOverridePercent: number = 0) {
    this.lendingIxsLabels.push(`liquidateObligationAndRedeemReserveCollateral`);
    if (!this.outflowReserve) {
      throw Error(`Withdraw reserve during liquidation is not defined`);
    }
    if (!this.additionalTokenAccountAddress) {
      throw Error(`Liquidating token account address is not defined`);
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
        userSourceLiquidity: this.additionalTokenAccountAddress,
        userDestinationCollateral: this.userCollateralAccountAddress,
        userDestinationLiquidity: this.userTokenAccountAddress,
        withdrawReserveLiquidityFeeReceiver: this.outflowReserve.state.liquidity.feeVault,
        collateralTokenProgram: TOKEN_PROGRAM_ID,
        repayLiquidityTokenProgram: this.reserve.getLiquidityTokenProgram(),
        withdrawLiquidityTokenProgram: this.outflowReserve.getLiquidityTokenProgram(),
        instructionSysvarAccount: SYSVAR_INSTRUCTIONS_PUBKEY,
      },
      this.kaminoMarket.programId
    );
    liquidateIx.keys =
      this.obligation?.state.elevationGroup !== 0
        ? liquidateIx.keys.concat([...depositReserveAccountMetas])
        : liquidateIx.keys;
    this.lendingIxs.push(liquidateIx);
  }

  async addInBetweenIxs(
    action: ActionType,
    includeAtaIxns: boolean,
    requestElevationGroup: boolean,
    addInitObligationForFarm: boolean,
    isClosingPosition: boolean = false
  ) {
    await this.addSupportIxsWithoutInitObligation(
      action,
      includeAtaIxns,
      false,
      requestElevationGroup,
      addInitObligationForFarm,
      isClosingPosition
    );
  }

  addRefreshObligation(crank: PublicKey) {
    const uniqueReserveAddresses = new PublicKeySet(this.depositReserves.concat(this.borrowReserves)).toArray();

    const addAllToSetupIxns = true;
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
    this.addRefreshObligationIx(addAllToSetupIxns, false);
  }

  async addSupportIxsWithoutInitObligation(
    action: ActionType,
    includeAtaIxns: boolean,
    addToSetupIxs: boolean = true,
    requestElevationGroup: boolean = false,
    addInitObligationForFarm: boolean = false,
    isClosingPosition: boolean = false,
    twoTokenAction: boolean = false
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
        'refreshObligation',
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

      if (action === 'liquidate' || action === 'depositAndBorrow' || action === 'repayAndWithdraw') {
        if (!this.outflowReserve) {
          throw new Error('outflowReserve is undefined');
        }

        if (action === 'depositAndBorrow' || action === 'repayAndWithdraw') {
          currentReserves = [this.reserve, this.outflowReserve];
          if (this.obligation) {
            if (action === 'depositAndBorrow') {
              const deposit = this.obligation.state.deposits.find((deposit) =>
                deposit.depositReserve.equals(this.reserve.address)
              );

              if (!deposit) {
                this.preLoadedDepositReservesSameTx.push(this.reserve.address);
              }
            } else {
              const borrow = this.obligation.state.borrows.find((borrow) =>
                borrow.borrowReserve.equals(this.reserve.address)
              );

              if (!borrow) {
                throw Error(`Unable to find obligation borrow to repay for ${this.obligation.state.owner.toBase58()}`);
              }

              const cumulativeBorrowRateObligation = KaminoObligation.getCumulativeBorrowRate(borrow);

              const cumulativeBorrowRateReserve = this.reserve.getEstimatedCumulativeBorrowRate(this.currentSlot);
              const fullRepay = KaminoObligation.getBorrowAmount(borrow)
                .mul(cumulativeBorrowRateReserve)
                .div(cumulativeBorrowRateObligation);

              const amountDecimal = new Decimal(this.amount.toString());

              if (fullRepay.lte(amountDecimal)) {
                this.preLoadedBorrowReservesSameTx.push(this.reserve.address);
              }
            }
          } else {
            // Obligation doesn't exist yet, so we have to preload the deposit reserve
            this.preLoadedDepositReservesSameTx.push(this.reserve.address);
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

      this.addRefreshReserveIxs(allReservesExcludingCurrent, addToSetupIxs);
      if (addInitObligationForFarm) {
        if (action === 'liquidate') {
          await this.addInitObligationForFarm(this.reserve, ReserveFarmKind.Debt, addToSetupIxs);
          await this.addInitObligationForFarm(this.outflowReserve!, ReserveFarmKind.Collateral, addToSetupIxs);
        } else if (
          action === 'depositAndBorrow' ||
          action === 'depositCollateral' ||
          action === 'withdraw' ||
          action === 'deposit'
        ) {
          await this.addInitObligationForFarm(this.reserve, ReserveFarmKind.Collateral, addToSetupIxs);
          if (this.outflowReserve) {
            await this.addInitObligationForFarm(this.outflowReserve, ReserveFarmKind.Debt, addToSetupIxs);
          }
        } else if (action === 'repayAndWithdraw' || action === 'borrow' || action === 'repay') {
          // todo - probably don't need to add both debt and collateral for everything here
          await this.addInitObligationForFarm(this.reserve, ReserveFarmKind.Debt, addToSetupIxs);
          if (this.outflowReserve) {
            await this.addInitObligationForFarm(this.outflowReserve, ReserveFarmKind.Collateral, addToSetupIxs);
          }
        } else {
          await this.addInitObligationForFarm(this.reserve, ReserveFarmKind.Collateral, addToSetupIxs);
          await this.addInitObligationForFarm(this.reserve, ReserveFarmKind.Debt, addToSetupIxs);
          if (this.outflowReserve) {
            await this.addInitObligationForFarm(this.outflowReserve, ReserveFarmKind.Collateral, addToSetupIxs);
            await this.addInitObligationForFarm(this.outflowReserve, ReserveFarmKind.Debt, addToSetupIxs);
          }
        }
      }
      this.addRefreshReserveIxs(currentReserveAddresses.toArray(), addToSetupIxs);

      if (action === 'repayAndWithdraw' && !addToSetupIxs && isClosingPosition) {
        // addToSetupIxs === addInBetween (same thing)
        // If this is a repay and withdraw, and it's not the first action, and it's closing a position
        // we don't need to include the repay reserve in the refresh obligation
        // I am ashamed of this code, we need to rewrite this entire thing
        this.addRefreshObligationIx(addToSetupIxs, true);
      } else {
        this.addRefreshObligationIx(addToSetupIxs, false);
      }

      if (addToSetupIxs) {
        // If this is an setup ixn (therefore not an in-between), it means it's either a one off action
        // or the first of a two-token-action
        if (action === 'liquidate') {
          this.addRefreshFarmsForReserve([this.outflowReserve!], addToSetupIxs, ReserveFarmKind.Collateral);
          this.addRefreshFarmsForReserve([this.reserve], addToSetupIxs, ReserveFarmKind.Debt);
        } else if (
          action === 'depositAndBorrow' ||
          action === 'depositCollateral' ||
          action === 'withdraw' ||
          action === 'deposit'
        ) {
          this.addRefreshFarmsForReserve(
            currentReserves,
            addToSetupIxs,
            ReserveFarmKind.Collateral,
            undefined,
            twoTokenAction
          );
        } else if (action === 'repayAndWithdraw' || action === 'borrow' || action === 'repay') {
          this.addRefreshFarmsForReserve(
            currentReserves,
            addToSetupIxs,
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
          this.addRefreshFarmsForReserve([this.outflowReserve!], addToSetupIxs, ReserveFarmKind.Debt);
        } else if (action === 'repayAndWithdraw') {
          this.addRefreshFarmsForReserve([this.outflowReserve!], addToSetupIxs, ReserveFarmKind.Collateral);
        } else {
          throw new Error(`Could not decide on refresh farm for action ${action}`);
        }
      }

      if (action === 'depositAndBorrow' && requestElevationGroup) {
        const groupsColl = this.reserve.state.config.elevationGroups;
        const groupsDebt = this.outflowReserve!.state.config.elevationGroups;
        const groups = this.kaminoMarket.state.elevationGroups;
        const commonElevationGroups = [...groupsColl].filter(
          (item) =>
            groupsDebt.includes(item) && item !== 0 && groups[item - 1].debtReserve.equals(this.outflowReserve!.address)
        );

        console.log(
          'Groups of coll reserve',
          groupsColl,
          'Groups of debt reserve',
          groupsDebt,
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
            this.addRequestElevationIx(eModeGroup, false);
            this.addRefreshReserveIxs(allReservesExcludingCurrent, addToSetupIxs);
            this.addRefreshReserveIxs(currentReserveAddresses.toArray(), addToSetupIxs);
            this.addRefreshObligationIx(addToSetupIxs);
          }
        }
      }
    }
  }

  async addSupportIxs(
    action: ActionType,
    includeAtaIxns: boolean,
    requestElevationGroup: boolean,
    includeUserMetadata: boolean,
    addInitObligationForFarm: boolean,
    twoTokenAction: boolean = false
  ) {
    if (!['mint', 'redeem'].includes(action)) {
      const [, ownerUserMetadata] = await this.kaminoMarket.getUserMetadata(this.owner);
      if (!ownerUserMetadata && includeUserMetadata) {
        await this.addInitUserMetadataIxs();
      }

      await this.addInitReferrerTokenStateIxs();
      await this.addInitObligationIxs();
    }

    await this.addSupportIxsWithoutInitObligation(
      action,
      includeAtaIxns,
      true,
      requestElevationGroup,
      addInitObligationForFarm,
      false,
      twoTokenAction
    );
  }

  private static optionalAccount(pubkey: PublicKey, programId: PublicKey = PROGRAM_ID): PublicKey {
    if (isNotNullPubkey(pubkey)) {
      return pubkey;
    } else {
      return programId;
    }
  }

  private addRefreshReserveIxs(reserves: PublicKey[], addToSetupIxs: boolean = true) {
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

      if (addToSetupIxs) {
        this.setupIxs.push(refreshReserveIx);
        this.setupIxsLabels.push(`RefreshReserve[${reserveAddress}]`);
      } else {
        this.inBetweenIxs.push(refreshReserveIx);
        this.inBetweenIxsLabels.push(`RefreshReserve[${reserveAddress}]`);
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

  private addRefreshObligationIx(addToSetupIxs: boolean = true, skipBorrowObligations: boolean = false) {
    const marketAddress = this.kaminoMarket.getAddress();
    const obligationPda = this.getObligationPda();
    const refreshObligationIx = refreshObligation(
      {
        lendingMarket: marketAddress,
        obligation: obligationPda,
      },
      this.kaminoMarket.programId
    );

    const depositReservesList = this.getAdditionalDepositReservesList();

    const depositReserveAccountMetas = depositReservesList.map((reserve) => {
      return { pubkey: reserve, isSigner: false, isWritable: true };
    });

    const preloadedBorrowReservesString = this.preLoadedBorrowReservesSameTx.map((reserve) => reserve.toString());
    const borrowReservesList = this.borrowReserves.filter(
      (reserve) => !preloadedBorrowReservesString.includes(reserve.toString())
    );

    const borrowReserveAccountMetas = borrowReservesList.map((reserve) => {
      return { pubkey: reserve, isSigner: false, isWritable: true };
    });

    const borrowReservesReferrerTokenStates = borrowReservesList
      .map((reserve) => {
        if (this.referrer.equals(PublicKey.default)) {
          return { pubkey: this.kaminoMarket.programId, isSigner: false, isWritable: true };
        }
        const referrerTokenStateAddress = referrerTokenStatePda(this.referrer, reserve, this.kaminoMarket.programId)[0];
        return { pubkey: referrerTokenStateAddress, isSigner: false, isWritable: true };
      })
      .filter((x) => !x.pubkey.equals(this.kaminoMarket.programId));

    refreshObligationIx.keys = refreshObligationIx.keys.concat([
      ...depositReserveAccountMetas,
      ...(skipBorrowObligations ? [] : [...borrowReserveAccountMetas, ...borrowReservesReferrerTokenStates]),
    ]);

    if (addToSetupIxs) {
      this.setupIxs.push(refreshObligationIx);
      this.setupIxsLabels.push(`RefreshObligation[${obligationPda.toString()}]`);
    } else {
      this.inBetweenIxs.push(refreshObligationIx);
      this.inBetweenIxsLabels.push(`RefreshObligation[${obligationPda.toString()}]`);
    }
  }

  private addRequestElevationIx(elevationGroup: number, addToSetupIxs: boolean) {
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

    const depositReservesList = this.getAdditionalDepositReservesList();

    const depositReserveAccountMetas = depositReservesList.map((reserve) => {
      return { pubkey: reserve, isSigner: false, isWritable: true };
    });

    const preloadedBorrowReservesString = this.preLoadedBorrowReservesSameTx.map((reserve) => reserve.toString());
    const borrowReservesList = this.borrowReserves.filter(
      (reserve) => !preloadedBorrowReservesString.includes(reserve.toString())
    );

    const borrowReserveAccountMetas = borrowReservesList.map((reserve) => {
      return { pubkey: reserve, isSigner: false, isWritable: true };
    });

    const borrowReservesReferrerTokenStates = borrowReservesList
      .map((reserve) => {
        if (this.referrer.equals(PublicKey.default)) {
          return { pubkey: this.kaminoMarket.programId, isSigner: false, isWritable: true };
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

    if (addToSetupIxs) {
      this.setupIxs.push(requestElevationGroupIx);
      this.setupIxsLabels.push(`RequestElevation[${obligationPda}], elevation_group:${elevationGroup}`);
    } else {
      this.inBetweenIxs.push(requestElevationGroupIx);
      this.inBetweenIxsLabels.push(`RequestElevation[${obligationPda}], elevation_group:${elevationGroup}`);
    }
  }

  private addRefreshFarmsForReserve(
    reserves: KaminoReserve[],
    addToSetupIxs: boolean = true,
    mode: typeof ReserveFarmKind.Collateral | typeof ReserveFarmKind.Debt,
    crank: PublicKey = this.payer,
    twoTokenAction: boolean = false
  ) {
    const BASE_SEED_USER_STATE = Buffer.from('user');
    const getPda = (farm: PublicKey) =>
      PublicKey.findProgramAddressSync(
        [BASE_SEED_USER_STATE, farm.toBytes(), this.getObligationPda().toBytes()],
        farmsId
      )[0];

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
          getPda(kaminoReserve.state.farmCollateral),
          kaminoReserve,
        ]);
      }
      if (mode === ReserveFarmKind.Debt && !kaminoReserve.state.farmDebt.equals(PublicKey.default)) {
        farms.push([
          ReserveFarmKind.Debt,
          kaminoReserve.state.farmDebt,
          getPda(kaminoReserve.state.farmDebt),
          kaminoReserve,
        ]);
      }
    }

    farms.forEach(
      (arg: [typeof ReserveFarmKind.Collateral | typeof ReserveFarmKind.Debt, PublicKey, PublicKey, KaminoReserve]) => {
        const args: RefreshObligationFarmsForReserveArgs = { mode: arg[0].discriminator };
        const accounts: RefreshObligationFarmsForReserveAccounts = {
          crank,
          obligation: this.getObligationPda(),
          lendingMarketAuthority: this.kaminoMarket.getLendingMarketAuthority(),
          reserve: arg[3].address,
          reserveFarmState: arg[1],
          obligationFarmUserState: arg[2],
          lendingMarket: this.kaminoMarket.getAddress(),
          farmsProgram: farmsId,
          rent: SYSVAR_RENT_PUBKEY,
          systemProgram: SystemProgram.programId,
        };
        const refreshFarmForObligationix = refreshObligationFarmsForReserve(
          args,
          accounts,
          this.kaminoMarket.programId
        );

        if (addToSetupIxs) {
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
        } else {
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
    this.cleanupIxs.splice(this.cleanupIxs.length - 1, 0, ...this.refreshFarmsCleanupTxnIxs);
    this.cleanupIxsLabels.splice(this.cleanupIxsLabels.length - 1, 0, ...this.refreshFarmsCleanupTxnIxsLabels);
  }

  private async addInitObligationForFarm(
    reserve: KaminoReserve,
    mode: typeof ReserveFarmKind.Collateral | typeof ReserveFarmKind.Debt,
    addToSetupIxs: boolean = true
  ): Promise<void> {
    const BASE_SEED_USER_STATE = Buffer.from('user');
    const getPda = (farm: PublicKey) =>
      PublicKey.findProgramAddressSync(
        [BASE_SEED_USER_STATE, farm.toBytes(), this.getObligationPda().toBytes()],
        farmsId
      )[0];

    const farms: [number, PublicKey, PublicKey][] = [];

    if (mode === ReserveFarmKind.Collateral && isNotNullPubkey(reserve.state.farmCollateral)) {
      const pda = getPda(reserve.state.farmCollateral);
      const account = await this.kaminoMarket.getConnection().getAccountInfo(pda);
      if (!account) {
        farms.push([ReserveFarmKind.Collateral.discriminator, reserve.state.farmCollateral, pda]);
      }
    }

    if (mode === ReserveFarmKind.Debt && isNotNullPubkey(reserve.state.farmDebt)) {
      const pda = getPda(reserve.state.farmDebt);
      const account = await this.kaminoMarket.getConnection().getAccountInfo(pda);
      if (!account) {
        farms.push([ReserveFarmKind.Debt.discriminator, reserve.state.farmDebt, getPda(reserve.state.farmDebt)]);
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
      if (addToSetupIxs) {
        this.setupIxs.push(initObligationForFarm);
        this.setupIxsLabels.push(
          `InitObligationForFarm[${reserve.address.toString()}, ${this.getObligationPda().toString()}]`
        );
      } else {
        this.inBetweenIxs.push(initObligationForFarm);
        this.inBetweenIxsLabels.push(
          `InitObligationForFarm[${reserve.address.toString()}, ${this.getObligationPda().toString()}]`
        );
      }
    });
  }

  private async addInitObligationIxs() {
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

  private async addInitUserMetadataIxs() {
    const [createLutIx, lookupTableAddress] = await createLookupTableIx(this.kaminoMarket.getConnection(), this.owner);
    this.setupIxs.push(createLutIx);
    this.setupIxsLabels.push(`createUserLutIx[${lookupTableAddress.toString()}]`);
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

  private async addInitReferrerTokenStateIxs(reservesArr: KaminoReserve[] = []) {
    if (this.referrer.equals(PublicKey.default)) {
      return;
    }

    const reserves = reservesArr.length !== 0 ? reservesArr : [...new Set([this.reserve, this.outflowReserve])];
    const tokenStatesToCreate: [PublicKey, PublicKey][] = [];
    for (const reserve of reserves) {
      if (!reserve) {
        continue;
      }

      const referrerTokenStateAddress = referrerTokenStatePda(
        this.referrer,
        reserve.address,
        this.kaminoMarket.programId
      )[0];

      if (!(await checkIfAccountExists(this.kaminoMarket.getConnection(), referrerTokenStateAddress))) {
        tokenStatesToCreate.push([referrerTokenStateAddress, reserve?.address]);
      }
    }

    tokenStatesToCreate.forEach(([referrerTokenStateAddress, reserveAddress]) => {
      const initreferrerTokenStateIx = initReferrerTokenState(
        {
          referrer: this.referrer,
        },
        {
          lendingMarket: this.kaminoMarket.getAddress(),
          payer: this.owner,
          reserve: reserveAddress,
          referrerTokenState: referrerTokenStateAddress,
          rent: SYSVAR_RENT_PUBKEY,
          systemProgram: SystemProgram.programId,
        },
        this.kaminoMarket.programId
      );

      this.setupIxs.unshift(initreferrerTokenStateIx);
      this.setupIxsLabels.unshift(
        `InitReferrerTokenState[${referrerTokenStateAddress.toString()} res=${reserveAddress}]`
      );
    });
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
        referrerTokenAccount: this.userTokenAccountAddress,
        lendingMarketAuthority: this.kaminoMarket.getLendingMarketAuthority(),
        tokenProgram: this.reserve.getLiquidityTokenProgram(),
      },
      this.kaminoMarket.programId
    );

    this.lendingIxs.push(withdrawReferrerFeesIx);
    this.lendingIxsLabels.push(`WithdrawReferrerFeesIx[${this.owner.toString()}]`);
  }

  private addComputeBudgetIxn(units: number) {
    this.setupIxs.push(buildComputeBudgetIx(units));
    this.setupIxsLabels.push(`AddComputeBudget[${units}]`);
  }

  private async addAtaIxs(action: ActionType) {
    if (this.mint.equals(WRAPPED_SOL_MINT) || this.secondaryMint?.equals(WRAPPED_SOL_MINT)) {
      await this.updateWSOLAccount(action);
    }

    if ((action === 'withdraw' || action === 'borrow' || action === 'redeem') && !this.mint.equals(WRAPPED_SOL_MINT)) {
      const userTokenAccountInfo = await this.kaminoMarket.getConnection().getAccountInfo(this.userTokenAccountAddress);

      if (!userTokenAccountInfo) {
        const [, createUserTokenAccountIx] = createAssociatedTokenAccountIdempotentInstruction(
          this.owner,
          this.reserve.getLiquidityMint(),
          this.owner,
          this.reserve.getLiquidityTokenProgram(),
          this.userTokenAccountAddress
        );

        if (this.positions === POSITION_LIMIT && this.hostAta) {
          this.preTxnIxs.push(createUserTokenAccountIx);
          this.preTxnIxsLabels.push(`CreateLiquidityUserAta[${this.owner}]`);
        } else {
          this.setupIxs.unshift(createUserTokenAccountIx);
          this.setupIxsLabels.unshift(`CreateLiquidityUserAta[${this.owner}]`);
        }
      }
    }

    if (action === 'liquidate') {
      const userTokenAccountInfo = await this.kaminoMarket.getConnection().getAccountInfo(this.userTokenAccountAddress);

      if (!this.outflowReserve) {
        throw new Error(`Outflow reserve state not found ${this.mint}`);
      }

      if (!userTokenAccountInfo) {
        const [, createUserTokenAccountIx] = createAssociatedTokenAccountIdempotentInstruction(
          this.owner,
          this.outflowReserve.getLiquidityMint(),
          this.owner,
          this.outflowReserve.getLiquidityTokenProgram(),
          this.userTokenAccountAddress
        );
        if (this.positions === POSITION_LIMIT && this.mint.equals(WRAPPED_SOL_MINT)) {
          this.preTxnIxs.push(createUserTokenAccountIx);
          this.preTxnIxsLabels.push(`CreateUserAta[${this.userTokenAccountAddress.toBase58()}]`);
        } else {
          this.setupIxs.unshift(createUserTokenAccountIx);
          this.setupIxsLabels.unshift(`CreateUserAta[${this.userTokenAccountAddress.toBase58()}]`);
        }
      }

      const userCollateralAccountInfo = await this.kaminoMarket
        .getConnection()
        .getAccountInfo(this.userCollateralAccountAddress);
      if (!userCollateralAccountInfo) {
        const [, createUserCollateralAccountIx] = createAssociatedTokenAccountIdempotentInstruction(
          this.owner,
          this.outflowReserve.getCTokenMint(),
          this.owner,
          TOKEN_PROGRAM_ID,
          this.userCollateralAccountAddress
        );

        if (this.positions === POSITION_LIMIT && this.mint.equals(WRAPPED_SOL_MINT)) {
          this.preTxnIxs.push(createUserCollateralAccountIx);
          this.preTxnIxsLabels.push(`CreateCollateralUserAta[${this.userCollateralAccountAddress.toString()}]`);
        } else {
          this.setupIxs.unshift(createUserCollateralAccountIx);
          this.setupIxsLabels.unshift(`CreateCollateralUserAta[${this.userCollateralAccountAddress.toString()}]`);
        }
      }

      if (!this.additionalTokenAccountAddress) {
        throw new Error(`Additional token account address not found ${this.mint}`);
      }
    }

    if (
      action === 'depositAndBorrow' ||
      (action === 'repayAndWithdraw' && !this.secondaryMint?.equals(WRAPPED_SOL_MINT))
    ) {
      if (!this.additionalTokenAccountAddress) {
        throw new Error(`Additional token account address not found ${this.secondaryMint}`);
      }

      if (!this.outflowReserve) {
        throw new Error(`Outflow reserve state not found ${this.mint}`);
      }

      const additionalUserTokenAccountInfo = await this.kaminoMarket
        .getConnection()
        .getAccountInfo(this.additionalTokenAccountAddress);

      if (!additionalUserTokenAccountInfo) {
        const [, createUserTokenAccountIx] = createAssociatedTokenAccountIdempotentInstruction(
          this.owner,
          this.outflowReserve.getLiquidityMint(),
          this.owner,
          this.outflowReserve.getLiquidityTokenProgram(),
          this.additionalTokenAccountAddress
        );

        this.setupIxs.unshift(createUserTokenAccountIx);
        this.setupIxsLabels.unshift(`CreateAdditionalUserTokenAta[${this.owner}]`);
      }
    }

    if (action === 'withdraw' || action === 'mint' || action === 'deposit' || action === 'repayAndWithdraw') {
      const userTokenAccountInfo = await this.kaminoMarket.getConnection().getAccountInfo(this.userTokenAccountAddress);

      // TODO: Might need to remove this
      if (!userTokenAccountInfo) {
        const [, createUserTokenAccountIx] = createAssociatedTokenAccountIdempotentInstruction(
          this.owner,
          this.reserve.getLiquidityMint(),
          this.owner,
          this.reserve.getLiquidityTokenProgram(),
          this.userTokenAccountAddress
        );
        this.preTxnIxs.push(createUserTokenAccountIx);
        this.preTxnIxsLabels.push(`CreateUserAta[${this.userTokenAccountAddress.toBase58()}]`);
      }
    }
    if (action === 'mint') {
      const userCollateralAccountInfo = await this.kaminoMarket
        .getConnection()
        .getAccountInfo(this.userCollateralAccountAddress);

      if (!userCollateralAccountInfo) {
        const collateralMintPubkey = this.reserve.getCTokenMint();
        const [, createUserCollateralAccountIx] = createAssociatedTokenAccountIdempotentInstruction(
          this.owner,
          collateralMintPubkey,
          this.owner,
          TOKEN_PROGRAM_ID,
          this.userCollateralAccountAddress
        );

        if (this.positions === POSITION_LIMIT && this.mint.equals(WRAPPED_SOL_MINT)) {
          this.preTxnIxs.push(createUserCollateralAccountIx);
          this.preTxnIxsLabels.push(`CreateCollateralUserAta[${this.userCollateralAccountAddress.toString()}]`);
        } else {
          this.setupIxs.unshift(createUserCollateralAccountIx);
          this.setupIxsLabels.unshift(`CreateCollateralUserAta[${this.userCollateralAccountAddress.toString()}]`);
        }
      }
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

    if (this.obligation && action === 'repay' && this.amount.eq(new BN(U64_MAX))) {
      const borrow = this.obligation.state.borrows.find(
        (borrow) => borrow.borrowReserve.toString() === this.reserve.address.toString()
      );

      if (!borrow) {
        throw Error(`Unable to find obligation borrow to repay for ${this.obligation.state.owner.toBase58()}`);
      }

      const cumulativeBorrowRateObligation = KaminoObligation.getCumulativeBorrowRate(borrow);
      const cumulativeBorrowRateReserve = this.reserve.getEstimatedCumulativeBorrowRate(this.currentSlot);
      // TODO: shouldn't this calc be added to all other stuff as well?
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

    let userTokenAccountAddress = this.userTokenAccountAddress;
    if (this.secondaryMint?.equals(WRAPPED_SOL_MINT)) {
      if (!this.additionalTokenAccountAddress) {
        throw new Error(`Additional token account address not found ${this.secondaryMint}`);
      }
      userTokenAccountAddress = this.additionalTokenAccountAddress;
    }

    const userWSOLAccountInfo = await this.kaminoMarket.getConnection().getAccountInfo(userTokenAccountAddress);

    const rentExempt = await this.kaminoMarket.getConnection().getMinimumBalanceForRentExemption(165);

    // Add rent exemption lamports for WSOL accounts that need to be pre-funded for inflow/send transactions
    const sendAction =
      action === 'deposit' ||
      action === 'repay' ||
      action === 'mint' ||
      (action === 'liquidate' && this.secondaryMint?.equals(WRAPPED_SOL_MINT)); // only sync WSOL amount if liquidator repays SOL which is secondaryMint

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

    const syncIx = syncNative(userTokenAccountAddress);
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

    // TODO: Consider for liquidations and other types of actions if we have to split up some ixs in 2-3 txs
    // if (this.positions && this.positions >= POSITION_LIMIT) {
    //   this.preTxnIxs.push(...preIxs);
    //   this.preTxnIxsLabels.push(...preIxsLabels);
    //   this.postTxnIxs.push(...postIxs);
    //   this.postTxnIxsLabels.push(...postIxsLabels);
    // } else {
    // }
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

    const {
      userTokenAccountAddress: userOutflowTokenAccountAddress,
      userCollateralAccountAddress: userOutflowCollateralAccountAddress,
    } = KaminoAction.getUserAccountAddresses(payer, outflowReserve.state);

    const {
      userTokenAccountAddress: userInflowTokenAccountAddress,
      userCollateralAccountAddress: userInflowCollateralAccountAddress,
    } = KaminoAction.getUserAccountAddresses(payer, inflowReserve.state);

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

    let userTokenAccountAddress: PublicKey;
    let userCollateralAccountAddress: PublicKey;
    let additionalUserTokenAccountAddress: PublicKey;
    let secondaryMint: PublicKey;
    let primaryMint: PublicKey;

    if (action === 'liquidate') {
      userTokenAccountAddress = userOutflowTokenAccountAddress;
      userCollateralAccountAddress = userOutflowCollateralAccountAddress;
      additionalUserTokenAccountAddress = userInflowTokenAccountAddress;
      primaryMint = outflowTokenMint;
      secondaryMint = inflowTokenMint;
    } else if (action === 'depositAndBorrow') {
      userTokenAccountAddress = userInflowTokenAccountAddress;
      userCollateralAccountAddress = userInflowCollateralAccountAddress;
      additionalUserTokenAccountAddress = userOutflowTokenAccountAddress;
      primaryMint = inflowTokenMint;
      secondaryMint = outflowTokenMint;
    } else if (action === 'repayAndWithdraw') {
      primaryMint = inflowTokenMint;
      secondaryMint = outflowTokenMint;
      userTokenAccountAddress = userInflowTokenAccountAddress;
      userCollateralAccountAddress = userOutflowCollateralAccountAddress;
      additionalUserTokenAccountAddress = userOutflowTokenAccountAddress;
    } else {
      throw new Error('Invalid action');
    }

    return new KaminoAction(
      kaminoMarket,
      payer,
      kaminoObligation || obligation,
      userTokenAccountAddress,
      userCollateralAccountAddress,
      primaryMint,
      distinctReserveCount,
      inflowAmount,
      depositReserves,
      borrowReserves,
      inflowReserve,
      currentSlot,
      undefined,
      secondaryMint,
      additionalUserTokenAccountAddress,
      outflowReserve,
      outflowAmount,
      referrerKey
    );
  }

  static async initializeWithdrawReferrerFees(
    mint: PublicKey,
    owner: PublicKey,
    kaminoMarket: KaminoMarket,
    currentSlot: number = 0,
    hostAta?: PublicKey
  ) {
    const reserve = kaminoMarket.getReserveByMint(mint);
    if (reserve === undefined) {
      throw new Error(`Reserve ${mint} not found in market ${kaminoMarket.getAddress().toBase58()}`);
    }

    const { atas, createAtasIxns } = await getAtasWithCreateIxnsIfMissing(kaminoMarket.getConnection(), owner, [
      reserve.getLiquidityMint(),
    ]);

    const userTokenAccountAddress = atas[0];

    return {
      axn: new KaminoAction(
        kaminoMarket,
        owner,
        new VanillaObligation(kaminoMarket.programId),
        userTokenAccountAddress,
        PublicKey.default,
        mint,
        0,
        new BN(0),
        [],
        [],
        reserve,
        currentSlot,
        hostAta,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined
      ),
      createAtasIxns,
    };
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
  ) {
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
}
