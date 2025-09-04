import {
  AccountRole,
  Address,
  fetchEncodedAccount,
  AccountMeta,
  Instruction,
  isNone,
  isSome,
  none,
  Option,
  Slot,
  some,
  TransactionSigner,
} from '@solana/kit';
import BN from 'bn.js';
import Decimal from 'decimal.js';
import {
  borrowObligationLiquidity,
  borrowObligationLiquidityV2,
  depositAndWithdraw,
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
} from '../@codegen/klend/instructions';
import {
  buildComputeBudgetIx,
  createAssociatedTokenAccountIdempotentInstruction,
  createAtasIdempotent,
  createLookupTableIx,
  DEFAULT_PUBLIC_KEY,
  getAssociatedTokenAddress,
  isNotNullPubkey,
  obligationFarmStatePda,
  ObligationType,
  referrerTokenStatePda,
  ScopePriceRefreshConfig,
  SOL_PADDING_FOR_INTEREST,
  U64_MAX,
  userMetadataPda,
  WRAPPED_SOL_MINT,
} from '../utils';
import { getTokenIdsForScopeRefresh, KaminoMarket } from './market';
import { isKaminoObligation, KaminoObligation } from './obligation';
import { KaminoReserve } from './reserve';
import { ReserveFarmKind } from '../@codegen/klend/types';
import { PROGRAM_ID as FARMS_PROGRAM_ID } from '@kamino-finance/farms-sdk/dist/@codegen/farms/programId';
import { Reserve } from '../@codegen/klend/accounts';
import { VanillaObligation } from '../utils/ObligationType';
import { Scope } from '@kamino-finance/scope-sdk';
import { ObligationOrderAtIndex } from './obligationOrder';
import { ASSOCIATED_TOKEN_PROGRAM_ADDRESS, TOKEN_PROGRAM_ADDRESS } from '@solana-program/token';
import { SYSVAR_INSTRUCTIONS_ADDRESS, SYSVAR_RENT_ADDRESS } from '@solana/sysvars';
import { getCloseAccountInstruction, getSyncNativeInstruction } from '@solana-program/token-2022';
import { getTransferSolInstruction, SYSTEM_PROGRAM_ADDRESS } from '@solana-program/system';
import { noopSigner } from '../utils/signer';

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

  owner: TransactionSigner;
  payer: TransactionSigner;

  obligation: KaminoObligation | ObligationType;

  referrer: Option<Address>;

  /**
   * Null unless the obligation is not passed
   */
  obligationType: ObligationType | null = null;

  mint: Address;

  secondaryMint?: Address;

  positions?: number;

  amount: BN;
  outflowAmount?: BN;

  computeBudgetIxs: Array<Instruction>;
  computeBudgetIxsLabels: Array<string>;

  setupIxs: Array<Instruction>;
  setupIxsLabels: Array<string>;

  inBetweenIxs: Array<Instruction>;
  inBetweenIxsLabels: Array<string>;

  lendingIxs: Array<Instruction>;
  lendingIxsLabels: Array<string>;

  cleanupIxs: Array<Instruction>;
  cleanupIxsLabels: Array<string>;

  refreshFarmsCleanupTxnIxs: Array<Instruction>;
  refreshFarmsCleanupTxnIxsLabels: Array<string>;

  depositReserves: Array<Address>;
  borrowReserves: Array<Address>;

  preLoadedDepositReservesSameTx: Array<Address>;

  currentSlot: Slot;

  private constructor(
    kaminoMarket: KaminoMarket,
    owner: TransactionSigner,
    obligation: KaminoObligation | ObligationType,
    mint: Address,
    positions: number,
    amount: string | BN,
    depositReserves: Array<Address>,
    borrowReserves: Array<Address>,
    reserveState: KaminoReserve,
    currentSlot: Slot,
    secondaryMint?: Address,
    outflowReserveState?: KaminoReserve,
    outflowAmount?: string | BN,
    referrer: Option<Address> = none(),
    payer?: TransactionSigner
  ) {
    this.kaminoMarket = kaminoMarket;
    this.obligation = obligation;
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
    this.referrer = referrer;
    this.currentSlot = currentSlot;
  }

  static async initialize(
    action: ActionType,
    amount: string | BN,
    mint: Address,
    owner: TransactionSigner,
    kaminoMarket: KaminoMarket,
    obligation: KaminoObligation | ObligationType,
    referrer: Option<Address> = none(),
    currentSlot: Slot = 0n,
    payer: TransactionSigner = owner
  ) {
    const reserve = kaminoMarket.getReserveByMint(mint);
    if (reserve === undefined) {
      throw new Error(`Reserve ${mint} not found in market ${kaminoMarket.getAddress()}`);
    }

    const { kaminoObligation, depositReserves, borrowReserves, distinctReserveCount } =
      await KaminoAction.loadObligation(action, kaminoMarket, owner.address, reserve.address, obligation);

    const referrerKey = await this.getReferrerKey(kaminoMarket, owner.address, kaminoObligation, referrer);

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

  private static async getUserAccountAddresses(owner: Address, reserve: Reserve) {
    const [userTokenAccountAddress, userCollateralAccountAddress] = await Promise.all([
      getAssociatedTokenAddress(
        reserve.liquidity.mintPubkey,
        owner,
        reserve.liquidity.tokenProgram,
        ASSOCIATED_TOKEN_PROGRAM_ADDRESS
      ),
      getAssociatedTokenAddress(
        reserve.collateral.mintPubkey,
        owner,
        TOKEN_PROGRAM_ADDRESS,
        ASSOCIATED_TOKEN_PROGRAM_ADDRESS
      ),
    ]);

    return { userTokenAccountAddress, userCollateralAccountAddress };
  }

  private static async loadObligation(
    action: ActionType,
    kaminoMarket: KaminoMarket,
    owner: Address,
    reserve: Address,
    obligation: KaminoObligation | ObligationType,
    outflowReserve?: Address
  ) {
    let kaminoObligation: KaminoObligation | null;
    const depositReserves: Array<Address> = [];
    const borrowReserves: Array<Address> = [];
    if (obligation instanceof KaminoObligation) {
      kaminoObligation = obligation;
    } else {
      const obligationAddress = await obligation.toPda(kaminoMarket.getAddress(), owner);
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
      new Set<Address>([
        ...borrowReserves.map((e) => e),
        ...(action === 'borrow' ? [reserve] : []),
        ...(action === 'depositAndBorrow' ? [reserve] : []),
      ]).size +
      new Set<Address>([
        ...depositReserves.map((e) => e),
        ...(action === 'deposit' ? [reserve] : []),
        ...(action === 'depositAndBorrow' ? [outflowReserve!] : []),
      ]).size;

    return {
      kaminoObligation,
      depositReserves,
      borrowReserves,
      distinctReserveCount,
    };
  }

  static async buildRefreshObligationTxns(
    kaminoMarket: KaminoMarket,
    payer: TransactionSigner,
    obligation: KaminoObligation,
    extraComputeBudget: number = 1_000_000, // if > 0 then adds the ix
    currentSlot: Slot = 0n
  ) {
    //  placeholder for action initialization
    const firstReserve = obligation.getDeposits()[0].reserveAddress;
    const firstKaminoReserve = kaminoMarket.getReserveByAddress(firstReserve);
    if (!firstKaminoReserve) {
      throw new Error(`Reserve ${firstReserve} not found`);
    }
    const axn = await KaminoAction.initialize(
      'refreshObligation',
      '0',
      firstKaminoReserve?.getLiquidityMint(),
      noopSigner(obligation.state.owner), // owner does not need to sign for refresh
      kaminoMarket,
      obligation,
      undefined,
      currentSlot
    );

    if (extraComputeBudget > 0) {
      axn.addComputeBudgetIx(extraComputeBudget);
    }

    await axn.addRefreshObligation(payer);

    return axn;
  }

  static async buildRequestElevationGroupTxns(
    kaminoMarket: KaminoMarket,
    owner: TransactionSigner,
    obligation: KaminoObligation,
    elevationGroup: number,
    extraComputeBudget: number = 1_000_000, // if > 0 then adds the ix
    currentSlot: Slot = 0n
  ) {
    const firstReserve = obligation.state.deposits.find((x) => x.depositReserve !== DEFAULT_PUBLIC_KEY)!.depositReserve;
    const firstKaminoReserve = kaminoMarket.getReserveByAddress(firstReserve);
    if (!firstKaminoReserve) {
      throw new Error(`Reserve ${firstReserve} not found`);
    }
    const axn = await KaminoAction.initialize(
      'requestElevationGroup',
      '0',
      firstKaminoReserve?.getLiquidityMint(),
      owner,
      kaminoMarket,
      obligation,
      undefined,
      currentSlot
    );

    if (extraComputeBudget > 0) {
      axn.addComputeBudgetIx(extraComputeBudget);
    }

    await axn.addRefreshObligation(owner);
    await axn.addRequestElevationIx(elevationGroup, 'setup');

    return axn;
  }

  static async buildDepositTxns(
    kaminoMarket: KaminoMarket,
    amount: string | BN,
    mint: Address,
    owner: TransactionSigner,
    obligation: KaminoObligation | ObligationType,
    useV2Ixs: boolean,
    scopeRefreshConfig: ScopePriceRefreshConfig | undefined,
    extraComputeBudget: number = 1_000_000, // if > 0 then adds the ix
    includeAtaIxs: boolean = true, // if true it includes create and close wsol and token atas,
    requestElevationGroup: boolean = false, // to be requested *before* the deposit
    initUserMetadata: { skipInitialization: boolean; skipLutCreation: boolean } = {
      skipInitialization: false,
      skipLutCreation: false,
    },
    referrer: Option<Address> = none(),
    currentSlot: Slot = 0n,
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
      axn.addComputeBudgetIx(extraComputeBudget);
    }

    await axn.addSupportIxs(
      'deposit',
      includeAtaIxs,
      requestElevationGroup,
      addInitObligationForFarm,
      useV2Ixs,
      scopeRefreshConfig,
      initUserMetadata,
      undefined,
      overrideElevationGroupRequest
    );
    if (useV2Ixs) {
      await axn.addDepositIxV2();
    } else {
      await axn.addDepositIx();
    }
    axn.addRefreshFarmsCleanupTxnIxsToCleanupIxs();

    return axn;
  }

  async addScopeRefreshIxs(scope: Scope, tokens: number[], scopeConfig: Address) {
    const refreshIx = await scope.refreshPriceListIx({ config: scopeConfig }, tokens);
    if (refreshIx) {
      this.setupIxsLabels.unshift(`refreshScopePrices`);
      this.setupIxs.unshift(refreshIx);
    }
  }

  static async buildBorrowTxns(
    kaminoMarket: KaminoMarket,
    amount: string | BN,
    mint: Address,
    owner: TransactionSigner,
    obligation: KaminoObligation | ObligationType,
    useV2Ixs: boolean,
    scopeRefreshConfig: ScopePriceRefreshConfig | undefined,
    extraComputeBudget: number = 1_000_000, // if > 0 then adds the ix
    includeAtaIxs: boolean = true, // if true it includes create and close wsol and token atas,
    requestElevationGroup: boolean = false,
    initUserMetadata: { skipInitialization: boolean; skipLutCreation: boolean } = {
      skipInitialization: false,
      skipLutCreation: false,
    },
    referrer: Option<Address> = none(),
    currentSlot: Slot = 0n,
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
      axn.addComputeBudgetIx(extraComputeBudget);
    }

    if (isSome(axn.referrer)) {
      const referrerTokenState = await referrerTokenStatePda(
        axn.referrer.value,
        axn.reserve.address,
        axn.kaminoMarket.programId
      );
      const account = await fetchEncodedAccount(kaminoMarket.getRpc(), referrerTokenState);
      if (!account.exists) {
        axn.addInitReferrerTokenStateIx(axn.reserve, referrerTokenState);
      }
    }

    await axn.addSupportIxs(
      'borrow',
      includeAtaIxs,
      requestElevationGroup,
      addInitObligationForFarm,
      useV2Ixs,
      scopeRefreshConfig,
      initUserMetadata,
      undefined,
      overrideElevationGroupRequest
    );
    if (useV2Ixs) {
      await axn.addBorrowIxV2();
    } else {
      await axn.addBorrowIx();
    }
    axn.addRefreshFarmsCleanupTxnIxsToCleanupIxs();

    return axn;
  }

  static async buildDepositReserveLiquidityTxns(
    kaminoMarket: KaminoMarket,
    amount: string | BN,
    mint: Address,
    owner: TransactionSigner,
    obligation: KaminoObligation | ObligationType,
    scopeRefreshConfig: ScopePriceRefreshConfig | undefined,
    extraComputeBudget: number = 1_000_000, // if > 0 then adds the ix
    includeAtaIxs: boolean = true, // if true it includes create and close wsol and token atas
    requestElevationGroup: boolean = false,
    referrer: Option<Address> = none(),
    currentSlot: Slot = 0n
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
      axn.addComputeBudgetIx(extraComputeBudget);
    }

    await axn.addSupportIxs(
      'mint',
      includeAtaIxs,
      requestElevationGroup,
      false,
      addInitObligationForFarm,
      scopeRefreshConfig,
      { skipInitialization: true, skipLutCreation: true }
    );
    await axn.addDepositReserveLiquidityIx();
    axn.addRefreshFarmsCleanupTxnIxsToCleanupIxs();
    return axn;
  }

  static async buildRedeemReserveCollateralTxns(
    kaminoMarket: KaminoMarket,
    amount: string | BN,
    mint: Address,
    owner: TransactionSigner,
    obligation: KaminoObligation | ObligationType,
    scopeRefreshConfig: ScopePriceRefreshConfig | undefined,
    extraComputeBudget: number = 1_000_000, // if > 0 then adds the ix
    includeAtaIxs: boolean = true, // if true it includes create and close wsol and token atas
    requestElevationGroup: boolean = false,
    referrer: Option<Address> = none(),
    currentSlot: Slot = 0n
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
      axn.addComputeBudgetIx(extraComputeBudget);
    }

    await axn.addSupportIxs(
      'redeem',
      includeAtaIxs,
      requestElevationGroup,
      false,
      addInitObligationForFarm,
      scopeRefreshConfig,
      { skipInitialization: true, skipLutCreation: true }
    );
    await axn.addRedeemReserveCollateralIx();
    axn.addRefreshFarmsCleanupTxnIxsToCleanupIxs();
    return axn;
  }

  static async buildDepositObligationCollateralTxns(
    kaminoMarket: KaminoMarket,
    amount: string | BN,
    mint: Address,
    owner: TransactionSigner,
    obligation: KaminoObligation | ObligationType,
    useV2Ixs: boolean,
    scopeRefreshConfig: ScopePriceRefreshConfig | undefined,
    extraComputeBudget: number = 1_000_000, // if > 0 then adds the ix
    includeAtaIxs: boolean = true, // if true it includes create and close wsol and token atas
    requestElevationGroup: boolean = false,
    initUserMetadata: { skipInitialization: boolean; skipLutCreation: boolean } = {
      skipInitialization: false,
      skipLutCreation: false,
    },
    referrer: Option<Address> = none(),
    currentSlot: Slot = 0n
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
      axn.addComputeBudgetIx(extraComputeBudget);
    }

    await axn.addSupportIxs(
      'depositCollateral',
      includeAtaIxs,
      requestElevationGroup,
      addInitObligationForFarm,
      useV2Ixs,
      scopeRefreshConfig,
      initUserMetadata
    );
    if (useV2Ixs) {
      await axn.addDepositObligationCollateralIxV2();
    } else {
      await axn.addDepositObligationCollateralIx();
    }
    axn.addRefreshFarmsCleanupTxnIxsToCleanupIxs();
    return axn;
  }

  static async buildDepositAndBorrowTxns(
    kaminoMarket: KaminoMarket,
    depositAmount: string | BN,
    depositMint: Address,
    borrowAmount: string | BN,
    borrowMint: Address,
    owner: TransactionSigner,
    obligation: KaminoObligation | ObligationType,
    useV2Ixs: boolean,
    scopeRefreshConfig: ScopePriceRefreshConfig | undefined,
    extraComputeBudget: number = 1_000_000, // if > 0 then adds the ix
    includeAtaIxs: boolean = true, // if true it includes create and close wsol and token atas,
    requestElevationGroup: boolean = false,
    initUserMetadata: { skipInitialization: boolean; skipLutCreation: boolean } = {
      skipInitialization: false,
      skipLutCreation: false,
    },
    referrer: Option<Address> = none(),
    currentSlot: Slot = 0n
  ) {
    const axn = await KaminoAction.initializeMultiTokenAction(
      kaminoMarket,
      'depositAndBorrow',
      depositAmount,
      depositMint,
      borrowMint,
      owner,
      owner.address,
      obligation,
      borrowAmount,
      referrer,
      currentSlot
    );
    const addInitObligationForFarmForDeposit = true;
    const addInitObligationForFarmForBorrow = false;
    const twoTokenAction = true;

    if (extraComputeBudget > 0) {
      axn.addComputeBudgetIx(extraComputeBudget);
    }

    if (isSome(axn.referrer)) {
      const referrerTokenState = await referrerTokenStatePda(
        axn.referrer.value,
        axn.outflowReserve!.address,
        axn.kaminoMarket.programId
      );
      const account = await fetchEncodedAccount(axn.kaminoMarket.getRpc(), referrerTokenState);
      if (!account.exists) {
        axn.addInitReferrerTokenStateIx(axn.outflowReserve!, referrerTokenState);
      }
    }
    await axn.addSupportIxs(
      'deposit',
      includeAtaIxs,
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
      includeAtaIxs,
      requestElevationGroup,
      addInitObligationForFarmForBorrow,
      useV2Ixs
    );
    axn.addRefreshFarmsCleanupTxnIxsToCleanupIxs();

    // Create the scope refresh ix in here to ensure it's the first ix in the tx
    const allReserves = [
      ...new Set<Address>([
        ...axn.depositReserves,
        ...axn.borrowReserves,
        axn.reserve.address,
        ...(axn.outflowReserve ? [axn.outflowReserve.address] : []),
        ...(axn.preLoadedDepositReservesSameTx ? axn.preLoadedDepositReservesSameTx : []),
      ]),
    ];
    const scopeTokensMap = getTokenIdsForScopeRefresh(axn.kaminoMarket, allReserves);

    if (scopeTokensMap.size > 0 && scopeRefreshConfig) {
      for (const [configPubkey, config] of scopeRefreshConfig.scopeConfigurations) {
        const tokenIds = scopeTokensMap.get(config.oraclePrices);
        if (tokenIds && tokenIds.length > 0) {
          await axn.addScopeRefreshIxs(scopeRefreshConfig.scope, tokenIds, configPubkey);
        }
      }
    }
    return axn;
  }

  static async buildDepositAndWithdrawV2Txns(
    kaminoMarket: KaminoMarket,
    depositAmount: string | BN,
    depositMint: Address,
    withdrawAmount: string | BN,
    withdrawMint: Address,
    owner: TransactionSigner,
    currentSlot: Slot,
    obligation: KaminoObligation | ObligationType,
    scopeRefreshConfig: ScopePriceRefreshConfig | undefined,
    extraComputeBudget: number = 1_000_000, // if > 0 then adds the ix
    includeAtaIxs: boolean = true, // if true it includes create and close wsol and token atas,
    requestElevationGroup: boolean = false,
    initUserMetadata: { skipInitialization: boolean; skipLutCreation: boolean } = {
      skipInitialization: false,
      skipLutCreation: false,
    },
    referrer: Option<Address> = none()
  ) {
    const axn = await KaminoAction.initializeMultiTokenAction(
      kaminoMarket,
      'depositAndWithdraw',
      depositAmount,
      depositMint,
      withdrawMint,
      owner,
      owner.address,
      obligation,
      withdrawAmount,
      referrer,
      currentSlot
    );
    const addInitObligationForFarm = true;
    const twoTokenAction = true;
    if (extraComputeBudget > 0) {
      axn.addComputeBudgetIx(extraComputeBudget);
    }

    await axn.addSupportIxs(
      'depositAndWithdraw',
      includeAtaIxs,
      requestElevationGroup,
      addInitObligationForFarm,
      true,
      scopeRefreshConfig,
      initUserMetadata,
      twoTokenAction
    );
    const withdrawCollateralAmount = axn.getWithdrawCollateralAmount(axn.outflowReserve!, axn.outflowAmount!);
    await axn.addDepositAndWithdrawV2Ixs(withdrawCollateralAmount);

    return axn;
  }

  static async buildRepayAndWithdrawV2Txns(
    kaminoMarket: KaminoMarket,
    repayAmount: string | BN,
    repayMint: Address,
    withdrawAmount: string | BN,
    withdrawMint: Address,
    payer: TransactionSigner,
    currentSlot: Slot,
    obligation: KaminoObligation | ObligationType,
    scopeRefreshConfig: ScopePriceRefreshConfig | undefined,
    extraComputeBudget: number = 1_000_000, // if > 0 then adds the ix
    includeAtaIxs: boolean = true, // if true it includes create and close wsol and token atas,
    requestElevationGroup: boolean = false,
    initUserMetadata: { skipInitialization: boolean; skipLutCreation: boolean } = {
      skipInitialization: false,
      skipLutCreation: false,
    },
    referrer: Option<Address> = none()
  ) {
    const axn = await KaminoAction.initializeMultiTokenAction(
      kaminoMarket,
      'repayAndWithdrawV2',
      repayAmount,
      repayMint,
      withdrawMint,
      payer,
      payer.address,
      obligation,
      withdrawAmount,
      referrer,
      currentSlot
    );
    const addInitObligationForFarm = true;
    const twoTokenAction = true;
    if (extraComputeBudget > 0) {
      axn.addComputeBudgetIx(extraComputeBudget);
    }

    await axn.addSupportIxs(
      'repayAndWithdrawV2',
      includeAtaIxs,
      requestElevationGroup,
      addInitObligationForFarm,
      true,
      scopeRefreshConfig,
      initUserMetadata,
      twoTokenAction
    );
    const withdrawCollateralAmount = axn.getWithdrawCollateralAmount(axn.outflowReserve!, axn.outflowAmount!);
    await axn.addRepayAndWithdrawV2Ixs(withdrawCollateralAmount);

    return axn;
  }

  static async buildRepayAndWithdrawTxns(
    kaminoMarket: KaminoMarket,
    repayAmount: string | BN,
    repayMint: Address,
    withdrawAmount: string | BN,
    withdrawMint: Address,
    payer: TransactionSigner,
    currentSlot: Slot,
    obligation: KaminoObligation | ObligationType,
    useV2Ixs: boolean,
    scopeRefreshConfig: ScopePriceRefreshConfig | undefined,
    extraComputeBudget: number = 1_000_000, // if > 0 then adds the ix
    includeAtaIxs: boolean = true, // if true it includes create and close wsol and token atas,
    requestElevationGroup: boolean = false,
    initUserMetadata: { skipInitialization: boolean; skipLutCreation: boolean } = {
      skipInitialization: false,
      skipLutCreation: false,
    },
    referrer: Option<Address> = none()
  ) {
    const axn = await KaminoAction.initializeMultiTokenAction(
      kaminoMarket,
      'repayAndWithdraw',
      repayAmount,
      repayMint,
      withdrawMint,
      payer,
      payer.address,
      obligation,
      withdrawAmount,
      referrer,
      currentSlot
    );
    const addInitObligationForFarmForRepay = true;
    const addInitObligationForFarmForWithdraw = false;
    const twoTokenAction = true;
    if (extraComputeBudget > 0) {
      axn.addComputeBudgetIx(extraComputeBudget);
    }

    await axn.addSupportIxs(
      'repay',
      includeAtaIxs,
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
      includeAtaIxs,
      requestElevationGroup,
      addInitObligationForFarmForWithdraw,
      useV2Ixs
    );
    axn.addRefreshFarmsCleanupTxnIxsToCleanupIxs();
    // Create the scope refresh ix in here to ensure it's the first ix in the tx
    const allReserves = [
      ...new Set<Address>([
        ...axn.depositReserves,
        ...axn.borrowReserves,
        axn.reserve.address,
        ...(axn.outflowReserve ? [axn.outflowReserve.address] : []),
        ...(axn.preLoadedDepositReservesSameTx ? axn.preLoadedDepositReservesSameTx : []),
      ]),
    ];
    const scopeTokensMap = getTokenIdsForScopeRefresh(axn.kaminoMarket, allReserves);

    if (scopeTokensMap.size > 0 && scopeRefreshConfig) {
      for (const [configPubkey, config] of scopeRefreshConfig.scopeConfigurations) {
        const tokenIds = scopeTokensMap.get(config.oraclePrices);
        if (tokenIds && tokenIds.length > 0) {
          await axn.addScopeRefreshIxs(scopeRefreshConfig.scope, tokenIds, configPubkey);
        }
      }
    }
    return axn;
  }

  static async buildWithdrawTxns(
    kaminoMarket: KaminoMarket,
    amount: string | BN,
    mint: Address,
    owner: TransactionSigner,
    obligation: KaminoObligation | ObligationType,
    useV2Ixs: boolean,
    scopeRefreshConfig: ScopePriceRefreshConfig | undefined,
    extraComputeBudget: number = 1_000_000, // if > 0 then adds the ix
    includeAtaIxs: boolean = true, // if true it includes create and close wsol and token atas,
    requestElevationGroup: boolean = false, // to be requested *after* the withdraw
    initUserMetadata: { skipInitialization: boolean; skipLutCreation: boolean } = {
      skipInitialization: false,
      skipLutCreation: false,
    },
    referrer: Option<Address> = none(),
    currentSlot: Slot = 0n,
    overrideElevationGroupRequest?: number,
    // Optional customizations which may be needed if the obligation was mutated by some previous ix.
    obligationCustomizations?: {
      // Any newly-added deposit reserves.
      addedDepositReserves?: Address[];
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
      axn.addComputeBudgetIx(extraComputeBudget);
    }

    axn.depositReserves.push(...(obligationCustomizations?.addedDepositReserves || []));

    await axn.addSupportIxs(
      'withdraw',
      includeAtaIxs,
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
   * @param useV2Ixs
   * @param scopeRefreshConfig
   * @param currentSlot
   * @param payer - if not set then owner is used
   * @param extraComputeBudget - if > 0 then adds the ix
   * @param includeAtaIxs - if true it includes create and close wsol and token atas
   * @param requestElevationGroup
   * @param initUserMetadata
   * @param referrer
   */
  static async buildRepayTxns(
    kaminoMarket: KaminoMarket,
    amount: string | BN,
    mint: Address,
    owner: TransactionSigner,
    obligation: KaminoObligation | ObligationType,
    useV2Ixs: boolean,
    scopeRefreshConfig: ScopePriceRefreshConfig | undefined,
    currentSlot: Slot,
    payer: TransactionSigner = owner,
    extraComputeBudget: number = 1_000_000,
    includeAtaIxs: boolean = true,
    requestElevationGroup: boolean = false,
    initUserMetadata: { skipInitialization: boolean; skipLutCreation: boolean } = {
      skipInitialization: false,
      skipLutCreation: false,
    },
    referrer: Option<Address> = none()
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
      axn.addComputeBudgetIx(extraComputeBudget);
    }

    await axn.addSupportIxs(
      'repay',
      includeAtaIxs,
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
    repayTokenMint: Address,
    withdrawTokenMint: Address,
    liquidator: TransactionSigner,
    obligationOwner: Address,
    obligation: KaminoObligation | ObligationType,
    useV2Ixs: boolean,
    scopeRefreshConfig: ScopePriceRefreshConfig | undefined = undefined,
    extraComputeBudget: number = 1_000_000, // if > 0 then adds the ix
    includeAtaIxs: boolean = true, // if true it includes create and close wsol and token atas, and creates all other token atas if they don't exist
    requestElevationGroup: boolean = false,
    initUserMetadata: { skipInitialization: boolean; skipLutCreation: boolean } = {
      skipInitialization: false,
      skipLutCreation: false,
    },
    referrer: Option<Address> = none(),
    maxAllowedLtvOverridePercent: number = 0,
    currentSlot: Slot = 0n
  ): Promise<KaminoAction> {
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
      axn.addComputeBudgetIx(extraComputeBudget);
    }

    await axn.addSupportIxs(
      'liquidate',
      includeAtaIxs,
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
    owner: TransactionSigner,
    tokenMint: Address,
    kaminoMarket: KaminoMarket,
    currentSlot: Slot = 0n
  ) {
    const { axn, createAtaIxs } = await KaminoAction.initializeWithdrawReferrerFees(
      tokenMint,
      owner,
      kaminoMarket,
      currentSlot
    );

    axn.setupIxs.push(...createAtaIxs);
    axn.setupIxsLabels.push(`createAtasIxs[${axn.owner.toString()}]`);

    if (isSome(axn.referrer)) {
      const referrerTokenState = await referrerTokenStatePda(
        axn.referrer.value,
        axn.reserve.address,
        axn.kaminoMarket.programId
      );
      const account = await fetchEncodedAccount(axn.kaminoMarket.getRpc(), referrerTokenState);
      if (!account.exists) {
        axn.addInitReferrerTokenStateIx(axn.reserve, referrerTokenState);
      }
    }
    axn.addRefreshReserveIxs([axn.reserve.address]);
    await axn.addWithdrawReferrerFeesIxs();

    return axn;
  }

  /**
   * Builds an instruction for setting the new state of one of the given obligation's orders.
   *
   * In other words: it will overwrite the given slot in the {@link Obligation.orders} array. This possibly includes
   * setting the `null` state (i.e. cancelling the order).
   */
  static buildSetObligationOrderIxn(
    owner: TransactionSigner,
    kaminoMarket: KaminoMarket,
    obligation: KaminoObligation,
    orderAtIndex: ObligationOrderAtIndex
  ): Instruction {
    return setObligationOrder(
      {
        index: orderAtIndex.index,
        order: orderAtIndex.orderState(),
      },
      {
        lendingMarket: kaminoMarket.getAddress(),
        obligation: obligation.obligationAddress,
        owner,
      },
      undefined,
      kaminoMarket.programId
    );
  }

  async addDepositReserveLiquidityIx() {
    this.lendingIxsLabels.push(`depositReserveLiquidity`);
    this.lendingIxs.push(
      depositReserveLiquidity(
        {
          liquidityAmount: this.amount,
        },
        {
          owner: this.owner,
          lendingMarket: this.kaminoMarket.getAddress(),
          lendingMarketAuthority: await this.kaminoMarket.getLendingMarketAuthority(),
          reserve: this.reserve.address,
          reserveLiquidityMint: this.reserve.getLiquidityMint(),
          reserveLiquiditySupply: this.reserve.state.liquidity.supplyVault,
          reserveCollateralMint: this.reserve.getCTokenMint(),
          userSourceLiquidity: await this.getUserTokenAccountAddress(this.reserve),
          userDestinationCollateral: await this.getUserCollateralAccountAddress(this.reserve),
          collateralTokenProgram: TOKEN_PROGRAM_ADDRESS,
          liquidityTokenProgram: this.reserve.getLiquidityTokenProgram(),
          instructionSysvarAccount: SYSVAR_INSTRUCTIONS_ADDRESS,
        },
        undefined,
        this.kaminoMarket.programId
      )
    );
  }

  async addRedeemReserveCollateralIx() {
    this.lendingIxsLabels.push(`redeemReserveCollateral`);
    this.lendingIxs.push(
      redeemReserveCollateral(
        {
          collateralAmount: this.amount,
        },
        {
          owner: this.owner,
          lendingMarket: this.kaminoMarket.getAddress(),
          lendingMarketAuthority: await this.kaminoMarket.getLendingMarketAuthority(),
          reserve: this.reserve.address,
          reserveLiquidityMint: this.reserve.getLiquidityMint(),
          reserveLiquiditySupply: this.reserve.state.liquidity.supplyVault,
          reserveCollateralMint: this.reserve.getCTokenMint(),
          userSourceCollateral: await this.getUserCollateralAccountAddress(this.reserve),
          userDestinationLiquidity: await this.getUserTokenAccountAddress(this.reserve),
          collateralTokenProgram: TOKEN_PROGRAM_ADDRESS,
          liquidityTokenProgram: this.reserve.getLiquidityTokenProgram(),
          instructionSysvarAccount: SYSVAR_INSTRUCTIONS_ADDRESS,
        },
        undefined,
        this.kaminoMarket.programId
      )
    );
  }

  // @deprecated -- use addDepositIxV2 instead
  async addDepositIx() {
    this.lendingIxsLabels.push(`depositReserveLiquidityAndObligationCollateral`);
    this.lendingIxs.push(
      depositReserveLiquidityAndObligationCollateral(
        {
          liquidityAmount: this.amount,
        },
        {
          owner: this.owner,
          obligation: await this.getObligationPda(),
          lendingMarket: this.kaminoMarket.getAddress(),
          lendingMarketAuthority: await this.kaminoMarket.getLendingMarketAuthority(),
          reserve: this.reserve.address,
          reserveLiquidityMint: this.reserve.getLiquidityMint(),
          reserveLiquiditySupply: this.reserve.state.liquidity.supplyVault,
          reserveCollateralMint: this.reserve.getCTokenMint(),
          reserveDestinationDepositCollateral: this.reserve.state.collateral.supplyVault, // destinationCollateral
          userSourceLiquidity: await this.getUserTokenAccountAddress(this.reserve),
          placeholderUserDestinationCollateral: none(),
          collateralTokenProgram: TOKEN_PROGRAM_ADDRESS,
          liquidityTokenProgram: this.reserve.getLiquidityTokenProgram(),
          instructionSysvarAccount: SYSVAR_INSTRUCTIONS_ADDRESS,
        },
        undefined,
        this.kaminoMarket.programId
      )
    );
  }

  async addDepositIxV2() {
    const { collateralFarmAccounts: farmsAccounts } = await KaminoAction.getFarmAccountsForReserve(
      await this.getObligationPda(),
      this.reserve
    );
    this.lendingIxsLabels.push(`depositReserveLiquidityAndObligationCollateralV2`);
    this.lendingIxs.push(
      depositReserveLiquidityAndObligationCollateralV2(
        {
          liquidityAmount: this.amount,
        },
        {
          depositAccounts: {
            owner: this.owner,
            obligation: await this.getObligationPda(),
            lendingMarket: this.kaminoMarket.getAddress(),
            lendingMarketAuthority: await this.kaminoMarket.getLendingMarketAuthority(),
            reserve: this.reserve.address,
            reserveLiquidityMint: this.reserve.getLiquidityMint(),
            reserveLiquiditySupply: this.reserve.state.liquidity.supplyVault,
            reserveCollateralMint: this.reserve.getCTokenMint(),
            reserveDestinationDepositCollateral: this.reserve.state.collateral.supplyVault, // destinationCollateral
            userSourceLiquidity: await this.getUserTokenAccountAddress(this.reserve),
            placeholderUserDestinationCollateral: none(),
            collateralTokenProgram: TOKEN_PROGRAM_ADDRESS,
            liquidityTokenProgram: this.reserve.getLiquidityTokenProgram(),
            instructionSysvarAccount: SYSVAR_INSTRUCTIONS_ADDRESS,
          },
          farmsAccounts,
          farmsProgram: FARMS_PROGRAM_ID,
        },
        undefined,
        this.kaminoMarket.programId
      )
    );
  }

  /// @deprecated -- use addDepositObligationCollateralIxV2 instead
  async addDepositObligationCollateralIx() {
    this.lendingIxsLabels.push(`depositObligationCollateral`);
    this.lendingIxs.push(
      depositObligationCollateral(
        {
          collateralAmount: this.amount,
        },
        {
          owner: this.owner,
          obligation: await this.getObligationPda(),
          lendingMarket: this.kaminoMarket.getAddress(),
          depositReserve: this.reserve.address,
          reserveDestinationCollateral: this.reserve.state.collateral.supplyVault,
          userSourceCollateral: await this.getUserCollateralAccountAddress(this.reserve),
          tokenProgram: TOKEN_PROGRAM_ADDRESS,
          instructionSysvarAccount: SYSVAR_INSTRUCTIONS_ADDRESS,
        },
        undefined,
        this.kaminoMarket.programId
      )
    );
  }

  async addDepositObligationCollateralIxV2() {
    const obligationAddress = await this.getObligationPda();
    const { collateralFarmAccounts: farmsAccounts } = await KaminoAction.getFarmAccountsForReserve(
      obligationAddress,
      this.reserve
    );

    this.lendingIxsLabels.push(`depositObligationCollateralV2`);
    this.lendingIxs.push(
      depositObligationCollateralV2(
        {
          collateralAmount: this.amount,
        },
        {
          depositAccounts: {
            owner: this.owner,
            obligation: obligationAddress,
            lendingMarket: this.kaminoMarket.getAddress(),
            depositReserve: this.reserve.address,
            reserveDestinationCollateral: this.reserve.state.collateral.supplyVault,
            userSourceCollateral: await this.getUserCollateralAccountAddress(this.reserve),
            tokenProgram: TOKEN_PROGRAM_ADDRESS,
            instructionSysvarAccount: SYSVAR_INSTRUCTIONS_ADDRESS,
          },
          lendingMarketAuthority: await this.kaminoMarket.getLendingMarketAuthority(),
          farmsAccounts,
          farmsProgram: FARMS_PROGRAM_ID,
        },
        undefined,
        this.kaminoMarket.programId
      )
    );
  }

  /// @deprecated -- use addDepositObligationCollateralIxV2 instead
  async addBorrowIx() {
    this.lendingIxsLabels.push(`borrowObligationLiquidity`);

    const depositReservesList = this.getAdditionalDepositReservesList();

    const depositReserveAccountMetas: AccountMeta[] = depositReservesList.map((reserve) => {
      return { address: reserve, role: AccountRole.WRITABLE };
    });

    let borrowIx = borrowObligationLiquidity(
      {
        liquidityAmount: this.amount,
      },
      {
        owner: this.owner,
        obligation: await this.getObligationPda(),
        lendingMarket: this.kaminoMarket.getAddress(),
        lendingMarketAuthority: await this.kaminoMarket.getLendingMarketAuthority(),
        borrowReserve: this.reserve.address,
        borrowReserveLiquidityMint: this.reserve.getLiquidityMint(),
        reserveSourceLiquidity: this.reserve.state.liquidity.supplyVault,
        userDestinationLiquidity: await this.getUserTokenAccountAddress(this.reserve),
        borrowReserveLiquidityFeeReceiver: this.reserve.state.liquidity.feeVault,
        referrerTokenState: await this.getReferrerTokenStateAddress(this.reserve.address),
        tokenProgram: this.reserve.getLiquidityTokenProgram(),
        instructionSysvarAccount: SYSVAR_INSTRUCTIONS_ADDRESS,
      },
      undefined,
      this.kaminoMarket.programId
    );
    borrowIx = {
      ...borrowIx,
      accounts:
        isKaminoObligation(this.obligation) &&
        (this.obligation.state.elevationGroup > 0 || this.obligation.refreshedStats.potentialElevationGroupUpdate > 0)
          ? borrowIx.accounts!.concat(depositReserveAccountMetas)
          : borrowIx.accounts,
    };
    this.lendingIxs.push(borrowIx);
  }

  async addBorrowIxV2() {
    this.lendingIxsLabels.push(`borrowObligationLiquidityV2`);

    const depositReservesList = this.getAdditionalDepositReservesList();

    const depositReserveAccountMetas: AccountMeta[] = depositReservesList.map((reserve) => {
      return { address: reserve, role: AccountRole.WRITABLE };
    });

    const obligationAddress = await this.getObligationPda();
    const { debtFarmAccounts: farmsAccounts } = await KaminoAction.getFarmAccountsForReserve(
      obligationAddress,
      this.reserve
    );

    let borrowIx = borrowObligationLiquidityV2(
      {
        liquidityAmount: this.amount,
      },
      {
        borrowAccounts: {
          owner: this.owner,
          obligation: obligationAddress,
          lendingMarket: this.kaminoMarket.getAddress(),
          lendingMarketAuthority: await this.kaminoMarket.getLendingMarketAuthority(),
          borrowReserve: this.reserve.address,
          borrowReserveLiquidityMint: this.reserve.getLiquidityMint(),
          reserveSourceLiquidity: this.reserve.state.liquidity.supplyVault,
          userDestinationLiquidity: await this.getUserTokenAccountAddress(this.reserve),
          borrowReserveLiquidityFeeReceiver: this.reserve.state.liquidity.feeVault,
          referrerTokenState: await this.getReferrerTokenStateAddress(this.reserve.address),
          tokenProgram: this.reserve.getLiquidityTokenProgram(),
          instructionSysvarAccount: SYSVAR_INSTRUCTIONS_ADDRESS,
        },
        farmsAccounts,
        farmsProgram: FARMS_PROGRAM_ID,
      },
      undefined,
      this.kaminoMarket.programId
    );
    borrowIx = {
      ...borrowIx,
      accounts:
        isKaminoObligation(this.obligation) &&
        (this.obligation.state.elevationGroup > 0 || this.obligation.refreshedStats.potentialElevationGroupUpdate > 0)
          ? borrowIx.accounts!.concat(depositReserveAccountMetas)
          : borrowIx.accounts,
    };
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
          obligation: await this.getObligationPda(),
          lendingMarket: this.kaminoMarket.getAddress(),
          lendingMarketAuthority: await this.kaminoMarket.getLendingMarketAuthority(),
          withdrawReserve: this.reserve.address,
          reserveLiquidityMint: this.reserve.getLiquidityMint(),
          reserveCollateralMint: this.reserve.getCTokenMint(),
          reserveLiquiditySupply: this.reserve.state.liquidity.supplyVault,
          reserveSourceCollateral: this.reserve.state.collateral.supplyVault,
          userDestinationLiquidity: await this.getUserTokenAccountAddress(this.reserve),
          placeholderUserDestinationCollateral: none(),
          collateralTokenProgram: TOKEN_PROGRAM_ADDRESS,
          liquidityTokenProgram: this.reserve.getLiquidityTokenProgram(),
          instructionSysvarAccount: SYSVAR_INSTRUCTIONS_ADDRESS,
        },
        undefined,
        this.kaminoMarket.programId
      )
    );
  }

  async addWithdrawIxV2(collateralAmount: BN): Promise<void> {
    const obligationAddress = await this.getObligationPda();
    const { collateralFarmAccounts: farmsAccounts } = await KaminoAction.getFarmAccountsForReserve(
      obligationAddress,
      this.reserve
    );
    this.lendingIxsLabels.push(`withdrawObligationCollateralAndRedeemReserveCollateralV2`);
    this.lendingIxs.push(
      withdrawObligationCollateralAndRedeemReserveCollateralV2(
        {
          collateralAmount,
        },
        {
          withdrawAccounts: {
            owner: this.owner,
            obligation: obligationAddress,
            lendingMarket: this.kaminoMarket.getAddress(),
            lendingMarketAuthority: await this.kaminoMarket.getLendingMarketAuthority(),
            withdrawReserve: this.reserve.address,
            reserveLiquidityMint: this.reserve.getLiquidityMint(),
            reserveCollateralMint: this.reserve.getCTokenMint(),
            reserveLiquiditySupply: this.reserve.state.liquidity.supplyVault,
            reserveSourceCollateral: this.reserve.state.collateral.supplyVault,
            userDestinationLiquidity: await this.getUserTokenAccountAddress(this.reserve),
            placeholderUserDestinationCollateral: none(),
            collateralTokenProgram: TOKEN_PROGRAM_ADDRESS,
            liquidityTokenProgram: this.reserve.getLiquidityTokenProgram(),
            instructionSysvarAccount: SYSVAR_INSTRUCTIONS_ADDRESS,
          },
          farmsAccounts: farmsAccounts,
          farmsProgram: FARMS_PROGRAM_ID,
        },
        undefined,
        this.kaminoMarket.programId
      )
    );
  }

  /// @deprecated -- use addRepayIxV2 instead
  async addRepayIx() {
    const obligationAddress = await this.getObligationPda();
    this.lendingIxsLabels.push(
      `repayObligationLiquidity(reserve=${this.reserve.address})(obligation=${obligationAddress})`
    );

    const depositReservesList = this.getAdditionalDepositReservesList();

    const depositReserveAccountMetas: AccountMeta[] = depositReservesList.map((reserve) => {
      return { address: reserve, role: AccountRole.WRITABLE };
    });

    let repayIx = repayObligationLiquidity(
      {
        liquidityAmount: this.amount,
      },
      {
        owner: this.payer,
        obligation: obligationAddress,
        lendingMarket: this.kaminoMarket.getAddress(),
        repayReserve: this.reserve.address,
        reserveLiquidityMint: this.reserve.getLiquidityMint(),
        userSourceLiquidity: await this.getTokenAccountAddressByUser(this.reserve, this.payer.address),
        reserveDestinationLiquidity: this.reserve.state.liquidity.supplyVault,
        tokenProgram: this.reserve.getLiquidityTokenProgram(),
        instructionSysvarAccount: SYSVAR_INSTRUCTIONS_ADDRESS,
      },
      undefined,
      this.kaminoMarket.programId
    );

    repayIx = {
      ...repayIx,
      accounts:
        isKaminoObligation(this.obligation) && this.obligation.state.elevationGroup > 0
          ? repayIx.accounts!.concat(depositReserveAccountMetas)
          : repayIx.accounts,
    };

    this.lendingIxs.push(repayIx);
  }

  async addRepayIxV2() {
    const obligationAddress = await this.getObligationPda();
    this.lendingIxsLabels.push(
      `repayObligationLiquidityV2(reserve=${this.reserve.address})(obligation=${obligationAddress})`
    );

    const depositReservesList = this.getAdditionalDepositReservesList();

    const { debtFarmAccounts: farmsAccounts } = await KaminoAction.getFarmAccountsForReserve(
      obligationAddress,
      this.reserve
    );

    const depositReserveAccountMetas: AccountMeta[] = depositReservesList.map((reserve) => {
      return { address: reserve, role: AccountRole.WRITABLE };
    });

    let repayIx = repayObligationLiquidityV2(
      {
        liquidityAmount: this.amount,
      },
      {
        repayAccounts: {
          owner: this.payer,
          obligation: obligationAddress,
          lendingMarket: this.kaminoMarket.getAddress(),
          repayReserve: this.reserve.address,
          reserveLiquidityMint: this.reserve.getLiquidityMint(),
          userSourceLiquidity: await this.getTokenAccountAddressByUser(this.reserve, this.payer.address),
          reserveDestinationLiquidity: this.reserve.state.liquidity.supplyVault,
          tokenProgram: this.reserve.getLiquidityTokenProgram(),
          instructionSysvarAccount: SYSVAR_INSTRUCTIONS_ADDRESS,
        },
        lendingMarketAuthority: await this.kaminoMarket.getLendingMarketAuthority(),
        farmsAccounts,
        farmsProgram: FARMS_PROGRAM_ID,
      },
      undefined,
      this.kaminoMarket.programId
    );

    repayIx = {
      ...repayIx,
      // TODO: potential elev group update?
      accounts:
        isKaminoObligation(this.obligation) && this.obligation.state.elevationGroup > 0
          ? repayIx.accounts!.concat(depositReserveAccountMetas)
          : repayIx.accounts,
    };

    this.lendingIxs.push(repayIx);
  }

  async addRepayAndWithdrawV2Ixs(withdrawCollateralAmount: BN): Promise<void> {
    const obligationAddress = await this.getObligationPda();
    this.lendingIxsLabels.push(
      `repayAndWithdrawAndRedeem(repayReserve=${this.reserve!.address})(withdrawReserve=${
        this.outflowReserve!.address
      })(obligation=${obligationAddress})`
    );

    const depositReservesList = this.getAdditionalDepositReservesList();

    const depositReserveAccountMetas: AccountMeta[] = depositReservesList.map((reserve) => {
      return { address: reserve, role: AccountRole.WRITABLE };
    });
    const borrowReserveAccountMetas: AccountMeta[] = this.borrowReserves.map((reserve) => {
      return { address: reserve, role: AccountRole.WRITABLE };
    });

    if (!this.outflowAmount) {
      throw new Error(`outflowAmount not set`);
    }

    if (!this.outflowReserve) {
      throw new Error(`outflowReserve not set`);
    }

    const { collateralFarmAccounts } = await KaminoAction.getFarmAccountsForReserve(
      obligationAddress,
      this.outflowReserve
    );
    const { debtFarmAccounts } = await KaminoAction.getFarmAccountsForReserve(obligationAddress, this.reserve);

    let repayAndWithdrawIx = repayAndWithdrawAndRedeem(
      {
        repayAmount: this.amount,
        withdrawCollateralAmount,
      },
      {
        repayAccounts: {
          owner: this.owner,
          obligation: obligationAddress,
          lendingMarket: this.kaminoMarket.getAddress(),
          repayReserve: this.reserve!.address,
          reserveLiquidityMint: this.reserve.getLiquidityMint(),
          userSourceLiquidity: await this.getUserTokenAccountAddress(this.reserve),
          reserveDestinationLiquidity: this.reserve.state.liquidity.supplyVault,
          tokenProgram: this.reserve.getLiquidityTokenProgram(),
          instructionSysvarAccount: SYSVAR_INSTRUCTIONS_ADDRESS,
        },
        withdrawAccounts: {
          owner: this.owner,
          obligation: obligationAddress,
          lendingMarket: this.kaminoMarket.getAddress(),
          lendingMarketAuthority: await this.kaminoMarket.getLendingMarketAuthority(),
          withdrawReserve: this.outflowReserve.address,
          reserveLiquidityMint: this.outflowReserve.getLiquidityMint(),
          reserveCollateralMint: this.outflowReserve.getCTokenMint(),
          reserveLiquiditySupply: this.outflowReserve.state.liquidity.supplyVault,
          reserveSourceCollateral: this.outflowReserve.state.collateral.supplyVault,
          userDestinationLiquidity: await this.getUserTokenAccountAddress(this.outflowReserve),
          placeholderUserDestinationCollateral: none(),
          collateralTokenProgram: TOKEN_PROGRAM_ADDRESS,
          liquidityTokenProgram: this.outflowReserve.getLiquidityTokenProgram(),
          instructionSysvarAccount: SYSVAR_INSTRUCTIONS_ADDRESS,
        },
        collateralFarmsAccounts: collateralFarmAccounts,
        debtFarmsAccounts: debtFarmAccounts,
        farmsProgram: FARMS_PROGRAM_ID,
      },
      undefined,
      this.kaminoMarket.programId
    );

    repayAndWithdrawIx = {
      ...repayAndWithdrawIx,
      accounts: repayAndWithdrawIx.accounts!.concat(depositReserveAccountMetas).concat(borrowReserveAccountMetas),
    };

    this.lendingIxs.push(repayAndWithdrawIx);
  }

  async addDepositAndWithdrawV2Ixs(withdrawCollateralAmount: BN): Promise<void> {
    const obligationAddress = await this.getObligationPda();
    this.lendingIxsLabels.push(
      `depositAndWithdrawV2(depositReserve=${this.reserve!.address})(withdrawReserve=${
        this.outflowReserve!.address
      })(obligation=${obligationAddress})`
    );

    const depositReservesList = this.getAdditionalDepositReservesList();

    const depositReserveAccountMetas: AccountMeta[] = depositReservesList.map((reserve) => {
      return { address: reserve, role: AccountRole.WRITABLE };
    });
    const borrowReserveAccountMetas: AccountMeta[] = this.borrowReserves.map((reserve) => {
      return { address: reserve, role: AccountRole.WRITABLE };
    });

    if (!this.outflowAmount) {
      throw new Error(`outflowAmount not set`);
    }

    if (!this.outflowReserve) {
      throw new Error(`outflowReserve not set`);
    }

    const { collateralFarmAccounts: depositFarmsAccounts } = await KaminoAction.getFarmAccountsForReserve(
      obligationAddress,
      this.reserve
    );
    const { collateralFarmAccounts: withdrawFarmsAccounts } = await KaminoAction.getFarmAccountsForReserve(
      obligationAddress,
      this.outflowReserve
    );

    const lendingMarketAuthority = await this.kaminoMarket.getLendingMarketAuthority();
    let depositAndWithdrawIx = depositAndWithdraw(
      {
        liquidityAmount: this.amount,
        withdrawCollateralAmount,
      },
      {
        depositAccounts: {
          owner: this.owner,
          obligation: obligationAddress,
          lendingMarket: this.kaminoMarket.getAddress(),
          lendingMarketAuthority,
          reserve: this.reserve.address,
          reserveLiquidityMint: this.reserve.getLiquidityMint(),
          reserveLiquiditySupply: this.reserve.state.liquidity.supplyVault,
          reserveCollateralMint: this.reserve.getCTokenMint(),
          reserveDestinationDepositCollateral: this.reserve.state.collateral.supplyVault, // destinationCollateral
          userSourceLiquidity: await this.getUserTokenAccountAddress(this.reserve),
          placeholderUserDestinationCollateral: none(),
          collateralTokenProgram: TOKEN_PROGRAM_ADDRESS,
          liquidityTokenProgram: this.reserve.getLiquidityTokenProgram(),
          instructionSysvarAccount: SYSVAR_INSTRUCTIONS_ADDRESS,
        },
        withdrawAccounts: {
          owner: this.owner,
          obligation: obligationAddress,
          lendingMarket: this.kaminoMarket.getAddress(),
          lendingMarketAuthority,
          withdrawReserve: this.outflowReserve.address,
          reserveLiquidityMint: this.outflowReserve.getLiquidityMint(),
          reserveCollateralMint: this.outflowReserve.getCTokenMint(),
          reserveLiquiditySupply: this.outflowReserve.state.liquidity.supplyVault,
          reserveSourceCollateral: this.outflowReserve.state.collateral.supplyVault,
          userDestinationLiquidity: await this.getUserTokenAccountAddress(this.outflowReserve),
          placeholderUserDestinationCollateral: none(),
          collateralTokenProgram: TOKEN_PROGRAM_ADDRESS,
          liquidityTokenProgram: this.outflowReserve.getLiquidityTokenProgram(),
          instructionSysvarAccount: SYSVAR_INSTRUCTIONS_ADDRESS,
        },
        depositFarmsAccounts,
        withdrawFarmsAccounts,
        farmsProgram: FARMS_PROGRAM_ID,
      },
      undefined,
      this.kaminoMarket.programId
    );

    depositAndWithdrawIx = {
      ...depositAndWithdrawIx,
      accounts: depositAndWithdrawIx.accounts!.concat(depositReserveAccountMetas).concat(borrowReserveAccountMetas),
    };

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
          obligation: await this.getObligationPda(),
          lendingMarket: this.kaminoMarket.getAddress(),
          lendingMarketAuthority: await this.kaminoMarket.getLendingMarketAuthority(),
          reserve: this.reserve.address,
          reserveLiquidityMint: this.reserve.getLiquidityMint(),
          reserveLiquiditySupply: this.reserve.state.liquidity.supplyVault,
          reserveCollateralMint: this.reserve.getCTokenMint(),
          reserveDestinationDepositCollateral: this.reserve.state.collateral.supplyVault, // destinationCollateral
          userSourceLiquidity: await this.getUserTokenAccountAddress(this.reserve),
          placeholderUserDestinationCollateral: none(),
          collateralTokenProgram: TOKEN_PROGRAM_ADDRESS,
          liquidityTokenProgram: this.reserve.getLiquidityTokenProgram(),
          instructionSysvarAccount: SYSVAR_INSTRUCTIONS_ADDRESS,
        },
        undefined,
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
    const depositReserveAccountMetas: AccountMeta[] = depositReservesList.map((reserve) => {
      return { address: reserve, role: AccountRole.WRITABLE };
    });

    let borrowIx = borrowObligationLiquidity(
      {
        liquidityAmount: this.outflowAmount,
      },
      {
        owner: this.owner,
        obligation: await this.getObligationPda(),
        lendingMarket: this.kaminoMarket.getAddress(),
        lendingMarketAuthority: await this.kaminoMarket.getLendingMarketAuthority(),
        borrowReserve: this.outflowReserve.address,
        borrowReserveLiquidityMint: this.outflowReserve.getLiquidityMint(),
        reserveSourceLiquidity: this.outflowReserve.state.liquidity.supplyVault,
        userDestinationLiquidity: await this.getUserTokenAccountAddress(this.outflowReserve),
        borrowReserveLiquidityFeeReceiver: this.outflowReserve.state.liquidity.feeVault,
        referrerTokenState: await this.getReferrerTokenStateAddress(this.outflowReserve.address),
        tokenProgram: this.outflowReserve.getLiquidityTokenProgram(),
        instructionSysvarAccount: SYSVAR_INSTRUCTIONS_ADDRESS,
      },
      undefined,
      this.kaminoMarket.programId
    );

    borrowIx = {
      ...borrowIx,
      accounts: borrowIx.accounts!.concat(depositReserveAccountMetas),
    };

    this.lendingIxs.push(borrowIx);
  }

  async addDepositAndBorrowIxV2(): Promise<void> {
    const obligationAddress = await this.getObligationPda();
    const { collateralFarmAccounts: collateralFarmsAccounts } = await KaminoAction.getFarmAccountsForReserve(
      obligationAddress,
      this.reserve
    );

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
            obligation: obligationAddress,
            lendingMarket: this.kaminoMarket.getAddress(),
            lendingMarketAuthority: await this.kaminoMarket.getLendingMarketAuthority(),
            reserve: this.reserve.address,
            reserveLiquidityMint: this.reserve.getLiquidityMint(),
            reserveLiquiditySupply: this.reserve.state.liquidity.supplyVault,
            reserveCollateralMint: this.reserve.getCTokenMint(),
            reserveDestinationDepositCollateral: this.reserve.state.collateral.supplyVault, // destinationCollateral
            userSourceLiquidity: await this.getUserTokenAccountAddress(this.reserve),
            placeholderUserDestinationCollateral: none(),
            collateralTokenProgram: TOKEN_PROGRAM_ADDRESS,
            liquidityTokenProgram: this.reserve.getLiquidityTokenProgram(),
            instructionSysvarAccount: SYSVAR_INSTRUCTIONS_ADDRESS,
          },
          farmsAccounts: collateralFarmsAccounts,
          farmsProgram: FARMS_PROGRAM_ID,
        },
        undefined,
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
    const depositReserveAccountMetas: AccountMeta[] = depositReservesList.map((reserve) => {
      return { address: reserve, role: AccountRole.WRITABLE };
    });

    const { debtFarmAccounts: debtFarmsAccounts } = await KaminoAction.getFarmAccountsForReserve(
      obligationAddress,
      this.outflowReserve
    );

    let borrowIx = borrowObligationLiquidityV2(
      {
        liquidityAmount: this.outflowAmount,
      },
      {
        borrowAccounts: {
          owner: this.owner,
          obligation: obligationAddress,
          lendingMarket: this.kaminoMarket.getAddress(),
          lendingMarketAuthority: await this.kaminoMarket.getLendingMarketAuthority(),
          borrowReserve: this.outflowReserve.address,
          borrowReserveLiquidityMint: this.outflowReserve.getLiquidityMint(),
          reserveSourceLiquidity: this.outflowReserve.state.liquidity.supplyVault,
          userDestinationLiquidity: await this.getUserTokenAccountAddress(this.outflowReserve),
          borrowReserveLiquidityFeeReceiver: this.outflowReserve.state.liquidity.feeVault,
          referrerTokenState: await this.getReferrerTokenStateAddress(this.outflowReserve.address),
          tokenProgram: this.outflowReserve.getLiquidityTokenProgram(),
          instructionSysvarAccount: SYSVAR_INSTRUCTIONS_ADDRESS,
        },
        farmsAccounts: debtFarmsAccounts,
        farmsProgram: FARMS_PROGRAM_ID,
      },
      undefined,
      this.kaminoMarket.programId
    );

    borrowIx = {
      ...borrowIx,
      accounts: borrowIx.accounts!.concat(depositReserveAccountMetas),
    };

    this.lendingIxs.push(borrowIx);
  }

  async addRepayAndWithdrawIxs(withdrawCollateralAmount: BN) {
    const obligationAddress = await this.getObligationPda();
    this.lendingIxsLabels.push(
      `repayObligationLiquidity(reserve=${this.reserve!.address})(obligation=${obligationAddress})`
    );
    this.lendingIxsLabels.push(`withdrawObligationCollateralAndRedeemReserveCollateral`);

    const depositReservesList = this.getAdditionalDepositReservesList();

    const depositReserveAccountMetas: AccountMeta[] = depositReservesList.map((reserve) => {
      return { address: reserve, role: AccountRole.WRITABLE };
    });
    let repayIx = repayObligationLiquidity(
      {
        liquidityAmount: this.amount,
      },
      {
        owner: this.owner,
        obligation: obligationAddress,
        lendingMarket: this.kaminoMarket.getAddress(),
        repayReserve: this.reserve!.address,
        reserveLiquidityMint: this.reserve.getLiquidityMint(),
        userSourceLiquidity: await this.getUserTokenAccountAddress(this.reserve),
        reserveDestinationLiquidity: this.reserve.state.liquidity.supplyVault,
        tokenProgram: this.reserve.getLiquidityTokenProgram(),
        instructionSysvarAccount: SYSVAR_INSTRUCTIONS_ADDRESS,
      },
      undefined,
      this.kaminoMarket.programId
    );

    repayIx = {
      ...repayIx,
      accounts: repayIx.accounts!.concat(depositReserveAccountMetas),
    };

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
          obligation: obligationAddress,
          lendingMarket: this.kaminoMarket.getAddress(),
          lendingMarketAuthority: await this.kaminoMarket.getLendingMarketAuthority(),
          withdrawReserve: this.outflowReserve.address,
          reserveLiquidityMint: this.outflowReserve.getLiquidityMint(),
          reserveCollateralMint: this.outflowReserve.getCTokenMint(),
          reserveLiquiditySupply: this.outflowReserve.state.liquidity.supplyVault,
          reserveSourceCollateral: this.outflowReserve.state.collateral.supplyVault,
          userDestinationLiquidity: await this.getUserTokenAccountAddress(this.outflowReserve),
          placeholderUserDestinationCollateral: none(),
          collateralTokenProgram: TOKEN_PROGRAM_ADDRESS,
          liquidityTokenProgram: this.outflowReserve.getLiquidityTokenProgram(),
          instructionSysvarAccount: SYSVAR_INSTRUCTIONS_ADDRESS,
        },
        undefined,
        this.kaminoMarket.programId
      )
    );
  }

  async addRepayAndWithdrawIxsV2(withdrawCollateralAmount: BN) {
    const obligationAddress = await this.getObligationPda();
    this.lendingIxsLabels.push(
      `repayObligationLiquidityV2(reserve=${this.reserve!.address})(obligation=${obligationAddress})`
    );
    this.lendingIxsLabels.push(`withdrawObligationCollateralAndRedeemReserveCollateralV2`);

    if (!isKaminoObligation(this.obligation)) {
      throw new Error(`obligation is not a KaminoObligation`);
    }

    const depositReservesList = this.getAdditionalDepositReservesList();

    const depositReserveAccountMetas: AccountMeta[] = depositReservesList.map((reserve) => {
      return { address: reserve, role: AccountRole.WRITABLE };
    });

    const { debtFarmAccounts: debtFarmsAccounts } = await KaminoAction.getFarmAccountsForReserve(
      obligationAddress,
      this.reserve
    );

    let repayIx = repayObligationLiquidityV2(
      {
        liquidityAmount: this.amount,
      },
      {
        repayAccounts: {
          owner: this.owner,
          obligation: obligationAddress,
          lendingMarket: this.kaminoMarket.getAddress(),
          repayReserve: this.reserve!.address,
          reserveLiquidityMint: this.reserve.getLiquidityMint(),
          userSourceLiquidity: await this.getUserTokenAccountAddress(this.reserve),
          reserveDestinationLiquidity: this.reserve.state.liquidity.supplyVault,
          tokenProgram: this.reserve.getLiquidityTokenProgram(),
          instructionSysvarAccount: SYSVAR_INSTRUCTIONS_ADDRESS,
        },
        lendingMarketAuthority: await this.kaminoMarket.getLendingMarketAuthority(),
        farmsAccounts: debtFarmsAccounts,
        farmsProgram: FARMS_PROGRAM_ID,
      },
      [],
      this.kaminoMarket.programId
    );

    repayIx = {
      ...repayIx,
      accounts:
        this.obligation.state.elevationGroup > 0
          ? repayIx.accounts!.concat(depositReserveAccountMetas)
          : repayIx.accounts,
    };

    this.lendingIxs.push(repayIx);
    if (!this.outflowReserve) {
      throw new Error(`outflowReserve not set`);
    }

    if (!this.outflowAmount) {
      throw new Error(`outflowAmount not set`);
    }

    const { collateralFarmAccounts: collateralFarmsAccounts } = await KaminoAction.getFarmAccountsForReserve(
      obligationAddress,
      this.outflowReserve
    );

    this.lendingIxs.push(
      withdrawObligationCollateralAndRedeemReserveCollateralV2(
        {
          collateralAmount: withdrawCollateralAmount,
        },
        {
          withdrawAccounts: {
            owner: this.owner,
            obligation: obligationAddress,
            lendingMarket: this.kaminoMarket.getAddress(),
            lendingMarketAuthority: await this.kaminoMarket.getLendingMarketAuthority(),
            withdrawReserve: this.outflowReserve.address,
            reserveLiquidityMint: this.outflowReserve.getLiquidityMint(),
            reserveCollateralMint: this.outflowReserve.getCTokenMint(),
            reserveLiquiditySupply: this.outflowReserve.state.liquidity.supplyVault,
            reserveSourceCollateral: this.outflowReserve.state.collateral.supplyVault,
            userDestinationLiquidity: await this.getUserTokenAccountAddress(this.outflowReserve),
            placeholderUserDestinationCollateral: none(),
            collateralTokenProgram: TOKEN_PROGRAM_ADDRESS,
            liquidityTokenProgram: this.outflowReserve.getLiquidityTokenProgram(),
            instructionSysvarAccount: SYSVAR_INSTRUCTIONS_ADDRESS,
          },
          farmsAccounts: collateralFarmsAccounts,
          farmsProgram: FARMS_PROGRAM_ID,
        },
        undefined,
        this.kaminoMarket.programId
      )
    );
  }

  async addLiquidateIx(maxAllowedLtvOverridePercent: number = 0): Promise<void> {
    this.lendingIxsLabels.push(`liquidateObligationAndRedeemReserveCollateral`);
    if (!this.outflowReserve) {
      throw Error(`Withdraw reserve during liquidation is not defined`);
    }

    if (!isKaminoObligation(this.obligation)) {
      throw new Error(`obligation is not a KaminoObligation`);
    }

    const depositReservesList = this.getAdditionalDepositReservesList();
    const depositReserveAccountMetas: AccountMeta[] = depositReservesList.map((reserve) => {
      return { address: reserve, role: AccountRole.WRITABLE };
    });

    let liquidateIx = liquidateObligationAndRedeemReserveCollateral(
      {
        liquidityAmount: this.amount,
        // TODO: Configure this when updating liquidator with new interface
        minAcceptableReceivedLiquidityAmount: this.outflowAmount || new BN(0),
        maxAllowedLtvOverridePercent: new BN(maxAllowedLtvOverridePercent),
      },
      {
        liquidator: this.owner,
        obligation: await this.getObligationPda(),
        lendingMarket: this.kaminoMarket.getAddress(),
        lendingMarketAuthority: await this.kaminoMarket.getLendingMarketAuthority(),
        repayReserve: this.reserve.address,
        repayReserveLiquidityMint: this.reserve.getLiquidityMint(),
        repayReserveLiquiditySupply: this.reserve.state.liquidity.supplyVault,
        withdrawReserve: this.outflowReserve.address,
        withdrawReserveLiquidityMint: this.outflowReserve.getLiquidityMint(),
        withdrawReserveCollateralMint: this.outflowReserve.getCTokenMint(),
        withdrawReserveCollateralSupply: this.outflowReserve.state.collateral.supplyVault,
        withdrawReserveLiquiditySupply: this.outflowReserve.state.liquidity.supplyVault,
        userSourceLiquidity: await this.getUserTokenAccountAddress(this.reserve),
        userDestinationCollateral: await this.getUserCollateralAccountAddress(this.outflowReserve),
        userDestinationLiquidity: await this.getUserTokenAccountAddress(this.outflowReserve),
        withdrawReserveLiquidityFeeReceiver: this.outflowReserve.state.liquidity.feeVault,
        collateralTokenProgram: TOKEN_PROGRAM_ADDRESS,
        repayLiquidityTokenProgram: this.reserve.getLiquidityTokenProgram(),
        withdrawLiquidityTokenProgram: this.outflowReserve.getLiquidityTokenProgram(),
        instructionSysvarAccount: SYSVAR_INSTRUCTIONS_ADDRESS,
      },
      [],
      this.kaminoMarket.programId
    );
    liquidateIx = {
      ...liquidateIx,
      accounts:
        this.obligation.state.elevationGroup > 0
          ? liquidateIx.accounts!.concat(depositReserveAccountMetas)
          : liquidateIx.accounts,
    };
    this.lendingIxs.push(liquidateIx);
  }

  async addLiquidateIxV2(maxAllowedLtvOverridePercent: number = 0) {
    this.lendingIxsLabels.push(`liquidateObligationAndRedeemReserveCollateralV2`);
    if (!this.outflowReserve) {
      throw Error(`Withdraw reserve during liquidation is not defined`);
    }

    if (!isKaminoObligation(this.obligation)) {
      throw new Error(`obligation is not a KaminoObligation`);
    }

    const depositReservesList = this.getAdditionalDepositReservesList();
    const depositReserveAccountMetas: AccountMeta[] = depositReservesList.map((reserve) => {
      return { address: reserve, role: AccountRole.WRITABLE };
    });

    const obligationAddress = await this.getObligationPda();
    const { collateralFarmAccounts: collateralFarmsAccounts } = await KaminoAction.getFarmAccountsForReserve(
      obligationAddress,
      this.outflowReserve
    );
    const { debtFarmAccounts: debtFarmsAccounts } = await KaminoAction.getFarmAccountsForReserve(
      await this.getObligationPda(),
      this.reserve
    );

    let liquidateIx = liquidateObligationAndRedeemReserveCollateralV2(
      {
        liquidityAmount: this.amount,
        // TODO: Configure this when updating liquidator with new interface
        minAcceptableReceivedLiquidityAmount: this.outflowAmount || new BN(0),
        maxAllowedLtvOverridePercent: new BN(maxAllowedLtvOverridePercent),
      },
      {
        liquidationAccounts: {
          liquidator: this.owner,
          obligation: obligationAddress,
          lendingMarket: this.kaminoMarket.getAddress(),
          lendingMarketAuthority: await this.kaminoMarket.getLendingMarketAuthority(),
          repayReserve: this.reserve.address,
          repayReserveLiquidityMint: this.reserve.getLiquidityMint(),
          repayReserveLiquiditySupply: this.reserve.state.liquidity.supplyVault,
          withdrawReserve: this.outflowReserve.address,
          withdrawReserveLiquidityMint: this.outflowReserve.getLiquidityMint(),
          withdrawReserveCollateralMint: this.outflowReserve.getCTokenMint(),
          withdrawReserveCollateralSupply: this.outflowReserve.state.collateral.supplyVault,
          withdrawReserveLiquiditySupply: this.outflowReserve.state.liquidity.supplyVault,
          userSourceLiquidity: await this.getUserTokenAccountAddress(this.reserve),
          userDestinationCollateral: await this.getUserCollateralAccountAddress(this.outflowReserve),
          userDestinationLiquidity: await this.getUserTokenAccountAddress(this.outflowReserve),
          withdrawReserveLiquidityFeeReceiver: this.outflowReserve.state.liquidity.feeVault,
          collateralTokenProgram: TOKEN_PROGRAM_ADDRESS,
          repayLiquidityTokenProgram: this.reserve.getLiquidityTokenProgram(),
          withdrawLiquidityTokenProgram: this.outflowReserve.getLiquidityTokenProgram(),
          instructionSysvarAccount: SYSVAR_INSTRUCTIONS_ADDRESS,
        },
        debtFarmsAccounts,
        collateralFarmsAccounts,
        farmsProgram: FARMS_PROGRAM_ID,
      },
      [],
      this.kaminoMarket.programId
    );
    liquidateIx = {
      ...liquidateIx,
      accounts:
        this.obligation!.state.elevationGroup > 0
          ? liquidateIx.accounts!.concat(depositReserveAccountMetas)
          : liquidateIx.accounts,
    };
    this.lendingIxs.push(liquidateIx);
  }

  async addInBetweenIxs(
    action: ActionType,
    includeAtaIxs: boolean,
    requestElevationGroup: boolean,
    addInitObligationForFarm: boolean,
    useV2Ixs: boolean
  ) {
    await this.addSupportIxsWithoutInitObligation(
      action,
      includeAtaIxs,
      useV2Ixs,
      'inBetween',
      requestElevationGroup,
      addInitObligationForFarm
    );
  }

  async addRefreshObligation(crank: TransactionSigner): Promise<void> {
    const uniqueReserveAddresses = [...new Set<Address>(this.depositReserves.concat(this.borrowReserves))];

    const addAllToSetupIxs = 'setup';
    // Union of addresses
    const allReservesExcludingCurrent = [...uniqueReserveAddresses];

    this.addRefreshReserveIxs(allReservesExcludingCurrent, addAllToSetupIxs);
    await this.addRefreshFarmsForReserve(
      this.depositReserves.map((r) => this.kaminoMarket.getReserveByAddress(r)!),
      addAllToSetupIxs,
      ReserveFarmKind.Collateral,
      crank
    );
    await this.addRefreshFarmsForReserve(
      this.borrowReserves.map((r) => this.kaminoMarket.getReserveByAddress(r)!),
      addAllToSetupIxs,
      ReserveFarmKind.Debt,
      crank
    );
    await this.addRefreshObligationIx(addAllToSetupIxs);
  }

  async addSupportIxsWithoutInitObligation(
    action: ActionType,
    includeAtaIxs: boolean,
    useV2Ixs: boolean,
    addAsSupportIx: AuxiliaryIx = 'setup',
    requestElevationGroup: boolean = false,
    addInitObligationForFarm: boolean = false,
    twoTokenAction: boolean = false,
    overrideElevationGroupRequest?: number
  ) {
    // TODO: why are we not doing this first?
    if (includeAtaIxs) {
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
      // The support ixs in order are:
      // 0. Init obligation ix
      // 0. Token Ata ixs
      // 0. Init obligation for farm
      // 1. Ixs to refresh the reserves of the obligation not related to the current action
      // 2. Ix to refresh the reserve of the current action
      // 3. Ix to refresh the obligation
      // 4. Ix to refresh the `debt` farm of the obligation
      // 5. Ix to refresh the `collateral` farm of the obligation
      // 6. The instruction itself
      // 7. Ix to refresh the `debt` farm of the obligation
      // 8. Ix to refresh the `collateral` farm of the obligation

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
            if (isKaminoObligation(this.obligation)) {
              const deposit = this.obligation.getDepositByReserve(this.reserve.address);
              if (!deposit) {
                this.preLoadedDepositReservesSameTx.push(this.reserve.address);
              }
            } else {
              // Obligation doesn't exist yet, so we have to preload the deposit reserve
              this.preLoadedDepositReservesSameTx.push(this.reserve.address);
            }
          }
        } else if (action === 'liquidate' && this.outflowReserve.address !== this.reserve.address) {
          currentReserves = [this.outflowReserve, this.reserve];
        } else {
          currentReserves = [this.reserve];
        }
      } else {
        currentReserves = [this.reserve];
      }

      const uniqueReserveAddresses = new Set<Address>(this.depositReserves.concat(this.borrowReserves));
      const currentReserveAddresses = new Set<Address>(currentReserves.map((reserve) => reserve.address));

      // Union of addresses
      const allReservesExcludingCurrent = [...uniqueReserveAddresses].filter(
        (address) => !currentReserveAddresses.has(address)
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
      this.addRefreshReserveIxs([...currentReserveAddresses], addAsSupportIx);

      if (action === 'repayAndWithdraw' && addAsSupportIx === 'inBetween') {
        if (!isKaminoObligation(this.obligation)) {
          throw new Error(`obligation is not a KaminoObligation`);
        }
        const repayObligationLiquidity = this.obligation.getBorrowByReserve(this.reserve.address);
        if (!repayObligationLiquidity) {
          throw new Error(`Could not find debt reserve ${this.reserve.address} in obligation`);
        }
        const repaidBorrowReservesToSkip = repayObligationLiquidity.amount.lte(new Decimal(this.amount.toString()))
          ? [repayObligationLiquidity.reserveAddress]
          : [];
        await this.addRefreshObligationIx(addAsSupportIx, repaidBorrowReservesToSkip);
      } else {
        await this.addRefreshObligationIx(addAsSupportIx);
      }

      if (requestElevationGroup) {
        if (action === 'repay' || action === 'repayAndWithdrawV2') {
          if (!isKaminoObligation(this.obligation)) {
            throw new Error(`obligation is not a KaminoObligation`);
          }
          const repayObligationLiquidity = this.obligation.getBorrowByReserve(this.reserve.address);

          if (!repayObligationLiquidity) {
            throw new Error(`Could not find debt reserve ${this.reserve.address} in obligation`);
          }

          if (
            repayObligationLiquidity.amount.lte(new Decimal(this.amount.toString())) &&
            this.obligation.borrows.size === 1 &&
            this.obligation.state.elevationGroup !== 0
          ) {
            this.addRefreshReserveIxs(allReservesExcludingCurrent, 'cleanup');
            // Skip the borrow reserve, since we repay in the same tx
            await this.addRefreshObligationIx('cleanup', [this.reserve.address]);
            await this.addRequestElevationIx(overrideElevationGroupRequest ?? 0, 'cleanup', [this.reserve.address]);
          }
        } else if (action === 'depositAndBorrow' || action === 'borrow') {
          let newElevationGroup: number = -1;
          let addAsSupportIx: AuxiliaryIx = 'setup';
          let debtReserve = this.reserve;
          let collReserve = this.reserve;

          if (overrideElevationGroupRequest !== undefined) {
            newElevationGroup = overrideElevationGroupRequest;
          } else {
            if (action === 'depositAndBorrow') {
              debtReserve = this.outflowReserve!;
              addAsSupportIx = 'inBetween';
            } else if (action === 'borrow') {
              if (!isKaminoObligation(this.obligation)) {
                throw new Error(`obligation is not a KaminoObligation`);
              }
              const depositReserve = this.obligation.deposits.values().next().value;
              if (!depositReserve) {
                throw new Error('No deposit reserve found in obligation, cannot borrow against it');
              }
              collReserve = this.kaminoMarket.getExistingReserveByAddress(depositReserve.reserveAddress);

              addAsSupportIx = 'setup';
            }

            const groups = this.kaminoMarket.state.elevationGroups;

            const commonElevationGroups = this.kaminoMarket.getCommonElevationGroupsForPair(collReserve, debtReserve);

            if (commonElevationGroups.length === 0) {
              console.log('No common elevation groups found, staying with default');
            } else {
              const eModeGroupWithMaxLtvAndDebtReserve = commonElevationGroups.reduce((prev, curr) => {
                const prevGroup = groups.find((group) => group.id === prev);
                const currGroup = groups.find((group) => group.id === curr);
                return prevGroup!.ltvPct > currGroup!.ltvPct ? prev : curr;
              });

              const eModeGroup = groups.find((group) => group.id === eModeGroupWithMaxLtvAndDebtReserve)!.id;

              if (
                eModeGroup !== 0 &&
                eModeGroup !== (isKaminoObligation(this.obligation) ? this.obligation.state.elevationGroup : 0)
              ) {
                newElevationGroup = eModeGroup;
              }
            }
          }

          if (
            newElevationGroup >= 0 &&
            newElevationGroup !== (isKaminoObligation(this.obligation) ? this.obligation.state.elevationGroup : 0)
          ) {
            await this.addRequestElevationIx(newElevationGroup, addAsSupportIx);
            this.addRefreshReserveIxs(allReservesExcludingCurrent, addAsSupportIx);
            this.addRefreshReserveIxs([...currentReserveAddresses], addAsSupportIx);
            await this.addRefreshObligationIx(addAsSupportIx);

            if (action === 'borrow') {
              if (!isKaminoObligation(this.obligation)) {
                throw new Error(`obligation is not a KaminoObligation`);
              }
              this.obligation.refreshedStats.potentialElevationGroupUpdate = newElevationGroup;
            }
          }
        } else if (
          action === 'deposit' &&
          overrideElevationGroupRequest !== undefined &&
          overrideElevationGroupRequest !==
            (isKaminoObligation(this.obligation) ? this.obligation.state.elevationGroup : 0)
        ) {
          const addAsSupportIx: AuxiliaryIx = 'setup';
          console.log('Deposit: Requesting elevation group', overrideElevationGroupRequest);
          await this.addRequestElevationIx(overrideElevationGroupRequest, addAsSupportIx);
          this.addRefreshReserveIxs(allReservesExcludingCurrent, addAsSupportIx);
          this.addRefreshReserveIxs([...currentReserveAddresses], addAsSupportIx);
          await this.addRefreshObligationIx(addAsSupportIx);
        } else if (
          action === 'withdraw' &&
          overrideElevationGroupRequest !== undefined
          // Note: contrary to the 'deposit' case above, we allow requesting the same group as in the [stale, cached] obligation state, since our current use-case is "deposit X, withdraw Y"
        ) {
          console.log('Withdraw: Requesting elevation group', overrideElevationGroupRequest);
          // Skip the withdrawn reserve if we are in the process of closing it:
          const skipReserveIfClosing = this.amount.eq(new BN(U64_MAX)) ? [this.reserve.address] : [];
          await this.addRefreshObligationIx('cleanup', skipReserveIfClosing);
          await this.addRequestElevationIx(overrideElevationGroupRequest, 'cleanup', skipReserveIfClosing);
        }
      }

      if (!useV2Ixs) {
        if (addAsSupportIx === 'setup') {
          // If this is an setup ix (therefore not an in-between), it means it's either a one off action
          // or the first of a two-token-action
          if (action === 'liquidate') {
            await this.addRefreshFarmsForReserve([this.outflowReserve!], addAsSupportIx, ReserveFarmKind.Collateral);
            await this.addRefreshFarmsForReserve([this.reserve], addAsSupportIx, ReserveFarmKind.Debt);
          } else if (
            action === 'depositAndBorrow' ||
            action === 'depositCollateral' ||
            action === 'withdraw' ||
            action === 'deposit'
          ) {
            await this.addRefreshFarmsForReserve(
              currentReserves,
              addAsSupportIx,
              ReserveFarmKind.Collateral,
              undefined,
              twoTokenAction
            );
          } else if (action === 'repayAndWithdraw' || action === 'borrow' || action === 'repay') {
            await this.addRefreshFarmsForReserve(
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
          // add added to 'setup' ixs
          if (action === 'depositAndBorrow') {
            await this.addRefreshFarmsForReserve([this.outflowReserve!], addAsSupportIx, ReserveFarmKind.Debt);
          } else if (action === 'repayAndWithdraw') {
            await this.addRefreshFarmsForReserve([this.outflowReserve!], addAsSupportIx, ReserveFarmKind.Collateral);
          } else {
            throw new Error(`Could not decide on refresh farm for action ${action}`);
          }
        }
      }
    }
  }

  async addSupportIxs(
    action: ActionType,
    includeAtaIxs: boolean,
    requestElevationGroup: boolean,
    addInitObligationForFarm: boolean,
    useV2Ixs: boolean,
    scopeRefreshConfig: ScopePriceRefreshConfig | undefined,
    initUserMetadata: { skipInitialization: boolean; skipLutCreation: boolean },
    twoTokenAction: boolean = false,
    overrideElevationGroupRequest?: number
  ) {
    if (!['mint', 'redeem'].includes(action)) {
      const [, ownerUserMetadata] = await this.kaminoMarket.getUserMetadata(this.owner.address);
      if (!ownerUserMetadata && !initUserMetadata.skipInitialization) {
        let lookupTable: Address = DEFAULT_PUBLIC_KEY;
        if (!initUserMetadata.skipLutCreation) {
          const [createLutIx, lookupTableAddress] = await createLookupTableIx(this.kaminoMarket.getRpc(), this.owner);
          lookupTable = lookupTableAddress;
          this.setupIxs.push(createLutIx);
          this.setupIxsLabels.push(`createUserLutIx[${lookupTableAddress}]`);
        }
        await this.addInitUserMetadataIxs(lookupTable);
      }

      await this.addInitObligationIxs();
    }

    await this.addSupportIxsWithoutInitObligation(
      action,
      includeAtaIxs,
      useV2Ixs,
      'setup',
      requestElevationGroup,
      addInitObligationForFarm,
      twoTokenAction,
      overrideElevationGroupRequest
    );

    const allReserves = [
      ...new Set<Address>([
        ...this.depositReserves,
        ...this.borrowReserves,
        this.reserve.address,
        ...(this.outflowReserve ? [this.outflowReserve.address] : []),
        ...(this.preLoadedDepositReservesSameTx ? this.preLoadedDepositReservesSameTx : []),
      ]),
    ];
    const scopeTokensMap = getTokenIdsForScopeRefresh(this.kaminoMarket, allReserves);

    if (scopeTokensMap.size > 0 && scopeRefreshConfig) {
      for (const [configPubkey, config] of scopeRefreshConfig.scopeConfigurations) {
        const tokenIds = scopeTokensMap.get(config.oraclePrices);
        if (tokenIds && tokenIds.length > 0) {
          await this.addScopeRefreshIxs(scopeRefreshConfig.scope, tokenIds, configPubkey);
        }
      }
    }
  }

  private static optionalAccount(pubkey: Address): Option<Address> {
    if (isNotNullPubkey(pubkey)) {
      return some(pubkey);
    } else {
      return none();
    }
  }

  private addRefreshReserveIxs(reserves: Address[], addAsSupportIx: AuxiliaryIx = 'setup') {
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
          pythOracle: KaminoAction.optionalAccount(state.config.tokenInfo.pythConfiguration.price),
          switchboardPriceOracle: KaminoAction.optionalAccount(
            state.config.tokenInfo.switchboardConfiguration.priceAggregator
          ),
          switchboardTwapOracle: KaminoAction.optionalAccount(
            state.config.tokenInfo.switchboardConfiguration.twapAggregator
          ),
          scopePrices: KaminoAction.optionalAccount(state.config.tokenInfo.scopeConfiguration.priceFeed),
        },
        undefined,
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

  public static getRefreshAllReserves(kaminoMarket: KaminoMarket, reserves: Address[]): Instruction[] {
    return reserves.map((reserveAddress): Instruction => {
      const foundReserve = kaminoMarket.getReserveByAddress(reserveAddress);
      if (!foundReserve) {
        throw new Error(`Could not find reserve ${reserveAddress} in reserves`);
      }

      const { state } = foundReserve;
      return refreshReserve(
        {
          reserve: reserveAddress,
          lendingMarket: state.lendingMarket,
          pythOracle: this.optionalAccount(state.config.tokenInfo.pythConfiguration.price),
          switchboardPriceOracle: this.optionalAccount(state.config.tokenInfo.switchboardConfiguration.priceAggregator),
          switchboardTwapOracle: this.optionalAccount(state.config.tokenInfo.switchboardConfiguration.twapAggregator),
          scopePrices: this.optionalAccount(state.config.tokenInfo.scopeConfiguration.priceFeed),
        },
        undefined,
        kaminoMarket.programId
      );
    });
  }

  private async addRefreshObligationIx(
    addAsSupportIx: AuxiliaryIx = 'setup',
    skipReserves: Address[] = []
  ): Promise<void> {
    const marketAddress = this.kaminoMarket.getAddress();
    const obligationPda = await this.getObligationPda();
    let refreshObligationIx = refreshObligation(
      {
        lendingMarket: marketAddress,
        obligation: obligationPda,
      },
      undefined,
      this.kaminoMarket.programId
    );

    const skipReservesSet = new Set<Address>(skipReserves);

    const depositReservesList = this.getAdditionalDepositReservesList().filter(
      (reserve) => !skipReservesSet.has(reserve)
    );
    const depositReserveAccountMetas: AccountMeta[] = depositReservesList.map((reserve) => {
      return { address: reserve, role: AccountRole.WRITABLE };
    });

    const borrowReservesList = this.borrowReserves.filter((reserve) => !skipReservesSet.has(reserve));
    const borrowReserveAccountMetas: AccountMeta[] = borrowReservesList.map((reserve) => {
      return { address: reserve, role: AccountRole.WRITABLE };
    });

    const borrowReservesReferrerTokenStates: AccountMeta[] = [];
    if (isSome(this.referrer)) {
      borrowReservesReferrerTokenStates.push(
        ...(await Promise.all(
          borrowReservesList.map((reserve) => {
            return this.getReferrerTokenStateAccountMeta(reserve, true);
          })
        ))
      );
    }

    refreshObligationIx = {
      ...refreshObligationIx,
      accounts: refreshObligationIx.accounts!.concat([
        ...depositReserveAccountMetas,
        ...borrowReserveAccountMetas,
        ...borrowReservesReferrerTokenStates,
      ]),
    };

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

  private async addRequestElevationIx(
    elevationGroup: number,
    addAsSupportIx: AuxiliaryIx,
    skipReserves: Address[] = []
  ): Promise<void> {
    const obligationPda = await this.getObligationPda();
    const args: RequestElevationGroupArgs = {
      elevationGroup,
    };
    const accounts: RequestElevationGroupAccounts = {
      owner: this.owner,
      obligation: obligationPda,
      lendingMarket: this.kaminoMarket.getAddress(),
    };

    let requestElevationGroupIx = requestElevationGroup(args, accounts, undefined, this.kaminoMarket.programId);

    const skipReservesSet = new Set<Address>(skipReserves);

    const depositReservesList = this.getAdditionalDepositReservesList().filter(
      (reserve) => !skipReservesSet.has(reserve)
    );
    const depositReserveAccountMetas: AccountMeta[] = depositReservesList.map((reserve) => {
      return { address: reserve, role: AccountRole.WRITABLE };
    });

    const borrowReservesList = this.borrowReserves.filter((reserve) => !skipReservesSet.has(reserve));
    const borrowReserveAccountMetas: AccountMeta[] = borrowReservesList.map((reserve) => {
      return { address: reserve, role: AccountRole.WRITABLE };
    });

    const borrowReservesReferrerTokenStates: AccountMeta[] = [];
    if (isSome(this.referrer)) {
      borrowReservesReferrerTokenStates.push(
        ...(await Promise.all(
          borrowReservesList.map((reserve) => {
            return this.getReferrerTokenStateAccountMeta(reserve, false);
          })
        ))
      );
    }

    requestElevationGroupIx = {
      ...requestElevationGroupIx,
      accounts: requestElevationGroupIx.accounts!.concat([
        ...depositReserveAccountMetas,
        ...borrowReserveAccountMetas,
        ...borrowReservesReferrerTokenStates,
      ]),
    };

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

  private async addRefreshFarmsForReserve(
    reserves: KaminoReserve[],
    addAsSupportIx: AuxiliaryIx = 'setup',
    mode: typeof ReserveFarmKind.Collateral | typeof ReserveFarmKind.Debt,
    crank: TransactionSigner = this.payer,
    twoTokenAction: boolean = false
  ): Promise<void> {
    const farms: [typeof ReserveFarmKind.Collateral | typeof ReserveFarmKind.Debt, Address, Address, KaminoReserve][] =
      [];

    const obligationAddress = await this.getObligationPda();
    for (const kaminoReserve of reserves) {
      if (mode === ReserveFarmKind.Collateral && kaminoReserve.state.farmCollateral !== DEFAULT_PUBLIC_KEY) {
        farms.push([
          ReserveFarmKind.Collateral,
          kaminoReserve.state.farmCollateral,
          await obligationFarmStatePda(kaminoReserve.state.farmCollateral, obligationAddress),
          kaminoReserve,
        ]);
      }
      if (mode === ReserveFarmKind.Debt && kaminoReserve.state.farmDebt !== DEFAULT_PUBLIC_KEY) {
        farms.push([
          ReserveFarmKind.Debt,
          kaminoReserve.state.farmDebt,
          await obligationFarmStatePda(kaminoReserve.state.farmDebt, obligationAddress),
          kaminoReserve,
        ]);
      }
    }

    const lendingMarketAuthority = await this.kaminoMarket.getLendingMarketAuthority();
    for (const arg of farms) {
      const args: RefreshObligationFarmsForReserveArgs = { mode: arg[0].discriminator };
      const accounts: RefreshObligationFarmsForReserveAccounts = {
        crank,
        baseAccounts: {
          obligation: obligationAddress,
          lendingMarketAuthority,
          reserve: arg[3].address,
          reserveFarmState: arg[1],
          obligationFarmUserState: arg[2],
          lendingMarket: this.kaminoMarket.getAddress(),
        },
        farmsProgram: FARMS_PROGRAM_ID,
        rent: SYSVAR_RENT_ADDRESS,
        systemProgram: SYSTEM_PROGRAM_ADDRESS,
      };
      const refreshFarmForObligationix = refreshObligationFarmsForReserve(
        args,
        accounts,
        [],
        this.kaminoMarket.programId
      );

      if (addAsSupportIx === 'setup') {
        this.setupIxs.push(refreshFarmForObligationix);
        this.setupIxsLabels.push(
          `RefreshFarmForObligation[${
            arg[0].kind
          }, res=${arg[3].address.toString()}, obl=${await this.getObligationPda()}]`
        );
        if (twoTokenAction) {
          // If two token action, this refresh needs to be the first inbetween ix
          this.inBetweenIxs.push(refreshFarmForObligationix);
          this.inBetweenIxsLabels.push(
            `RefreshFarmForObligation[${
              arg[0].kind
            }, res=${arg[3].address.toString()}, obl=${await this.getObligationPda()}]`
          );
        } else {
          this.refreshFarmsCleanupTxnIxs.push(refreshFarmForObligationix);
          this.refreshFarmsCleanupTxnIxsLabels.push(
            `RefreshFarmForObligation[${
              arg[0].kind
            }, res=${arg[3].address.toString()}, obl=${await this.getObligationPda()}]`
          );
        }
      } else if (addAsSupportIx === 'inBetween') {
        this.inBetweenIxs.push(refreshFarmForObligationix);
        this.inBetweenIxsLabels.push(
          `RefreshFarmForObligation[${
            arg[0].kind
          }, res=${arg[3].address.toString()}, obl=${await this.getObligationPda()}]`
        );

        this.refreshFarmsCleanupTxnIxs.push(refreshFarmForObligationix);
        this.refreshFarmsCleanupTxnIxsLabels.push(
          `RefreshFarmForObligation[${
            arg[0].kind
          }, res=${arg[3].address.toString()}, obl=${await this.getObligationPda()}]`
        );
      }
    }
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
    const farms: [number, Address, Address][] = [];

    const obligationAddress = await this.getObligationPda();
    if (mode === ReserveFarmKind.Collateral && isNotNullPubkey(reserve.state.farmCollateral)) {
      const pda = await obligationFarmStatePda(reserve.state.farmCollateral, obligationAddress);
      const account = await fetchEncodedAccount(this.kaminoMarket.getRpc(), pda);
      if (!account.exists) {
        farms.push([ReserveFarmKind.Collateral.discriminator, reserve.state.farmCollateral, pda]);
      }
    }

    if (mode === ReserveFarmKind.Debt && isNotNullPubkey(reserve.state.farmDebt)) {
      const pda = await obligationFarmStatePda(reserve.state.farmDebt, obligationAddress);
      const account = await fetchEncodedAccount(this.kaminoMarket.getRpc(), pda);
      if (!account.exists) {
        farms.push([ReserveFarmKind.Debt.discriminator, reserve.state.farmDebt, pda]);
      }
    }

    const lendingMarketAuthority = await this.kaminoMarket.getLendingMarketAuthority();
    farms.forEach((arg: [number, Address, Address]) => {
      const args: InitObligationFarmsForReserveArgs = { mode: arg[0] };
      const accounts: InitObligationFarmsForReserveAccounts = {
        owner: isKaminoObligation(this.obligation) ? this.obligation.state.owner : this.owner.address,
        payer: this.owner,
        obligation: obligationAddress,
        lendingMarketAuthority,
        reserve: reserve.address,
        reserveFarmState: arg[1],
        obligationFarm: arg[2],
        lendingMarket: this.kaminoMarket.getAddress(),
        farmsProgram: FARMS_PROGRAM_ID,
        rent: SYSVAR_RENT_ADDRESS,
        systemProgram: SYSTEM_PROGRAM_ADDRESS,
      };
      const initObligationForFarm = initObligationFarmsForReserve(args, accounts, [], this.kaminoMarket.programId);
      if (addAsSupportIx === 'setup') {
        this.setupIxs.push(initObligationForFarm);
        this.setupIxsLabels.push(
          `InitObligationForFarm[${reserve.address.toString()}, ${obligationAddress.toString()}]`
        );
      } else if (addAsSupportIx === 'inBetween') {
        this.inBetweenIxs.push(initObligationForFarm);
        this.inBetweenIxsLabels.push(
          `InitObligationForFarm[${reserve.address.toString()}, ${obligationAddress.toString()}]`
        );
      }
    });
  }

  private async addInitObligationIxs(): Promise<void> {
    if (!isKaminoObligation(this.obligation)) {
      const obligationPda = await this.getObligationPda();
      const [userMetadataAddress] = await userMetadataPda(this.owner.address, this.kaminoMarket.programId);
      const initObligationIx = initObligation(
        {
          args: {
            tag: this.obligation.toArgs().tag,
            id: this.obligation.toArgs().id,
          },
        },
        {
          obligationOwner: this.owner,
          feePayer: this.payer,
          obligation: obligationPda,
          lendingMarket: this.kaminoMarket.getAddress(),
          seed1Account: this.obligation.toArgs().seed1,
          seed2Account: this.obligation.toArgs().seed2,
          ownerUserMetadata: userMetadataAddress,
          rent: SYSVAR_RENT_ADDRESS,
          systemProgram: SYSTEM_PROGRAM_ADDRESS,
        },
        undefined,
        this.kaminoMarket.programId
      );
      this.setupIxs.push(initObligationIx);
      this.setupIxsLabels.push(`InitObligation[${obligationPda.toString()}]`);
    }
  }

  private async addInitUserMetadataIxs(lookupTableAddress: Address): Promise<void> {
    const [userMetadataAddress] = await userMetadataPda(this.owner.address, this.kaminoMarket.programId);
    const referrerUserMetadataAddress = await KaminoAction.getReferrerMetadataAccount(
      this.referrer,
      this.kaminoMarket.programId
    );

    const initUserMetadataIx = initUserMetadata(
      {
        userLookupTable: lookupTableAddress,
      },
      {
        owner: this.owner,
        feePayer: this.payer,
        userMetadata: userMetadataAddress,
        referrerUserMetadata: referrerUserMetadataAddress,
        rent: SYSVAR_RENT_ADDRESS,
        systemProgram: SYSTEM_PROGRAM_ADDRESS,
      },
      undefined,
      this.kaminoMarket.programId
    );
    this.setupIxs.push(initUserMetadataIx);
    this.setupIxsLabels.push(`initUserMetadata[${userMetadataAddress.toString()}]`);
  }

  private addInitReferrerTokenStateIx(reserve: KaminoReserve, referrerTokenState: Address) {
    if (isNone(this.referrer)) {
      throw new Error('Referrer is not set');
    }
    const initReferrerTokenStateIx = initReferrerTokenState(
      {
        lendingMarket: this.kaminoMarket.getAddress(),
        payer: this.owner,
        reserve: reserve.address,
        referrer: this.referrer.value,
        referrerTokenState,
        rent: SYSVAR_RENT_ADDRESS,
        systemProgram: SYSTEM_PROGRAM_ADDRESS,
      },
      undefined,
      this.kaminoMarket.programId
    );
    this.setupIxs.unshift(initReferrerTokenStateIx);
    this.setupIxsLabels.unshift(`InitReferrerTokenState[${referrerTokenState.toString()} res=${reserve.address}]`);
  }

  private async addWithdrawReferrerFeesIxs(): Promise<void> {
    const referrerTokenStateAddress = await referrerTokenStatePda(
      this.owner.address,
      this.reserve.address,
      this.kaminoMarket.programId
    );

    const withdrawReferrerFeesIx = withdrawReferrerFees(
      {
        referrer: this.owner,
        lendingMarket: this.kaminoMarket.getAddress(),
        reserve: this.reserve.address,
        reserveLiquidityMint: this.reserve.getLiquidityMint(),
        referrerTokenState: referrerTokenStateAddress,
        reserveSupplyLiquidity: this.reserve.state.liquidity.supplyVault,
        referrerTokenAccount: await this.getUserTokenAccountAddress(this.reserve),
        lendingMarketAuthority: await this.kaminoMarket.getLendingMarketAuthority(),
        tokenProgram: this.reserve.getLiquidityTokenProgram(),
      },
      undefined,
      this.kaminoMarket.programId
    );

    this.lendingIxs.push(withdrawReferrerFeesIx);
    this.lendingIxsLabels.push(`WithdrawReferrerFeesIx[${this.owner.toString()}]`);
  }

  private addComputeBudgetIx(units: number) {
    this.computeBudgetIxs.push(buildComputeBudgetIx(units));
    this.computeBudgetIxsLabels.push(`AddComputeBudget[${units}]`);
  }

  private async addAtaIxs(action: ActionType) {
    if (this.mint === WRAPPED_SOL_MINT || this.secondaryMint === WRAPPED_SOL_MINT) {
      await this.updateWSOLAccount(action);
    }

    if ((action === 'withdraw' || action === 'borrow' || action === 'redeem') && this.mint !== WRAPPED_SOL_MINT) {
      const reserveAta = await this.getUserTokenAccountAddress(this.reserve);
      const [, createUserTokenAccountIx] = await createAssociatedTokenAccountIdempotentInstruction(
        this.owner,
        this.reserve.getLiquidityMint(),
        this.owner.address,
        this.reserve.getLiquidityTokenProgram(),
        reserveAta
      );

      this.setupIxs.unshift(createUserTokenAccountIx);
      this.setupIxsLabels.unshift(`CreateLiquidityUserAta[${reserveAta}]`);
    }

    if (action === 'liquidate') {
      if (!this.outflowReserve) {
        throw new Error(`Outflow reserve state not found ${this.secondaryMint}`);
      }
      const outflowReserveAta = await this.getUserTokenAccountAddress(this.outflowReserve);

      const [, createUserTokenAccountIx] = await createAssociatedTokenAccountIdempotentInstruction(
        this.owner,
        this.outflowReserve.getLiquidityMint(),
        this.owner.address,
        this.outflowReserve.getLiquidityTokenProgram(),
        outflowReserveAta
      );

      this.setupIxs.unshift(createUserTokenAccountIx);
      this.setupIxsLabels.unshift(`CreateUserAta[${outflowReserveAta}]`);

      const ctokenAta = await this.getUserCollateralAccountAddress(this.outflowReserve);
      const [, createUserCollateralAccountIx] = await createAssociatedTokenAccountIdempotentInstruction(
        this.owner,
        this.outflowReserve.getCTokenMint(),
        this.owner.address,
        TOKEN_PROGRAM_ADDRESS,
        ctokenAta
      );

      this.setupIxs.unshift(createUserCollateralAccountIx);
      this.setupIxsLabels.unshift(`CreateCollateralUserAta[${ctokenAta}]`);
    }

    if (action === 'depositAndBorrow' || (action === 'repayAndWithdraw' && this.secondaryMint !== WRAPPED_SOL_MINT)) {
      if (!this.outflowReserve) {
        throw new Error(`Outflow reserve state not found ${this.mint}`);
      }

      const additionalUserTokenAccountAddress = await this.getUserTokenAccountAddress(this.outflowReserve);

      const additionalUserTokenAccountInfo = await fetchEncodedAccount(
        this.kaminoMarket.getRpc(),
        additionalUserTokenAccountAddress
      );

      if (!additionalUserTokenAccountInfo.exists) {
        const [, createUserTokenAccountIx] = await createAssociatedTokenAccountIdempotentInstruction(
          this.owner,
          this.outflowReserve.getLiquidityMint(),
          this.owner.address,
          this.outflowReserve.getLiquidityTokenProgram(),
          additionalUserTokenAccountAddress
        );

        this.setupIxs.unshift(createUserTokenAccountIx);
        this.setupIxsLabels.unshift(`CreateAdditionalUserTokenAta[${this.owner}]`);
      }
    }

    if (action === 'withdraw' || action === 'mint' || action === 'deposit' || action === 'repayAndWithdraw') {
      const reserveAta = await this.getUserTokenAccountAddress(this.reserve);
      const [, createUserTokenAccountIx] = await createAssociatedTokenAccountIdempotentInstruction(
        this.owner,
        this.reserve.getLiquidityMint(),
        this.owner.address,
        this.reserve.getLiquidityTokenProgram(),
        reserveAta
      );
      this.setupIxs.unshift(createUserTokenAccountIx);
      this.setupIxsLabels.unshift(`CreateUserAta[${reserveAta}]`);
    }
    if (action === 'mint') {
      const ctokenAta = await this.getUserCollateralAccountAddress(this.reserve);
      const [, createUserCollateralAccountIx] = await createAssociatedTokenAccountIdempotentInstruction(
        this.owner,
        this.reserve.getCTokenMint(),
        this.owner.address,
        TOKEN_PROGRAM_ADDRESS,
        ctokenAta
      );

      this.setupIxs.unshift(createUserCollateralAccountIx);
      this.setupIxsLabels.unshift(`CreateCollateralUserAta[${ctokenAta.toString()}]`);
    }
  }

  private async updateWSOLAccount(action: ActionType) {
    const preIxs: Array<Instruction> = [];
    const postIxs: Array<Instruction> = [];
    const preIxsLabels: Array<string> = [];
    const postIxsLabels: Array<string> = [];

    if (action === 'depositAndBorrow' || action === 'repayAndWithdraw') {
      return;
    }

    let safeRepay = new BN(this.amount);

    if (
      isKaminoObligation(this.obligation) &&
      (action === 'repay' || action === 'repayAndWithdrawV2') &&
      this.amount.eq(new BN(U64_MAX))
    ) {
      const borrow = this.obligation.state.borrows.find(
        (borrow) => borrow.borrowReserve.toString() === this.reserve.address.toString()
      );

      if (!borrow) {
        throw Error(`Unable to find obligation borrow to repay for ${this.obligation.state.owner}`);
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

    let userTokenAccountAddress = await this.getUserTokenAccountAddress(this.reserve);
    if (this.secondaryMint === WRAPPED_SOL_MINT) {
      if (!this.outflowReserve) {
        throw new Error(`Outflow reserve state not found ${this.secondaryMint}`);
      }

      userTokenAccountAddress = await this.getUserTokenAccountAddress(this.outflowReserve);
    }

    const userWSOLAccountInfo = await fetchEncodedAccount(this.kaminoMarket.getRpc(), userTokenAccountAddress);

    const rentExemptLamports = await this.kaminoMarket.getRpc().getMinimumBalanceForRentExemption(165n).send();

    // Add rent exemption lamports for WSOL accounts that need to be pre-funded for inflow/send transactions
    const sendAction =
      action === 'deposit' ||
      action === 'repay' ||
      action === 'repayAndWithdrawV2' ||
      action === 'mint' ||
      (action === 'liquidate' && this.mint === WRAPPED_SOL_MINT); // only sync WSOL amount if liquidator repays SOL which is secondaryMint

    const transferLamportsIx = getTransferSolInstruction({
      amount: (userWSOLAccountInfo.exists ? 0n : rentExemptLamports) + (sendAction ? BigInt(safeRepay.toString()) : 0n),
      source: this.owner,
      destination: userTokenAccountAddress,
    });
    preIxs.push(transferLamportsIx);
    preIxsLabels.push(`TransferLamportsToUserAtaSOL[${userTokenAccountAddress}]`);

    const closeWSOLAccountIx = getCloseAccountInstruction(
      {
        owner: this.owner,
        account: userTokenAccountAddress,
        destination: this.owner.address,
      },
      { programAddress: TOKEN_PROGRAM_ADDRESS }
    );

    const syncIx = getSyncNativeInstruction(
      {
        account: userTokenAccountAddress,
      },
      { programAddress: TOKEN_PROGRAM_ADDRESS }
    );
    if (userWSOLAccountInfo.exists) {
      if (sendAction) {
        preIxs.push(syncIx);
        preIxsLabels.push(`SyncUserAtaSOL[${userTokenAccountAddress}]`);
      } else {
        postIxs.push(closeWSOLAccountIx);
        postIxsLabels.push(`CloseUserAtaSOL[${userTokenAccountAddress}]`);
      }
    } else {
      const [, createUserWSOLAccountIx] = await createAssociatedTokenAccountIdempotentInstruction(
        this.owner,
        WRAPPED_SOL_MINT,
        this.owner.address,
        TOKEN_PROGRAM_ADDRESS,
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
    inflowTokenMint: Address,
    outflowTokenMint: Address,
    signer: TransactionSigner,
    obligationOwner: Address,
    obligation: KaminoObligation | ObligationType,
    outflowAmount?: string | BN,
    referrer: Option<Address> = none(),
    currentSlot: Slot = 0n
  ) {
    const inflowReserve = kaminoMarket.getExistingReserveByMint(inflowTokenMint);
    const outflowReserve = kaminoMarket.getExistingReserveByMint(outflowTokenMint);

    const { kaminoObligation, depositReserves, borrowReserves, distinctReserveCount } =
      await KaminoAction.loadObligation(
        action,
        kaminoMarket,
        obligationOwner,
        inflowReserve.address,
        obligation,
        outflowReserve.address
      );
    const referrerKey = await this.getReferrerKey(kaminoMarket, signer.address, kaminoObligation, referrer);

    let secondaryMint: Address;
    let primaryMint: Address;

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
      signer,
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
    mint: Address,
    owner: TransactionSigner,
    kaminoMarket: KaminoMarket,
    currentSlot: Slot = 0n
  ) {
    const reserve = kaminoMarket.getReserveByMint(mint);
    if (reserve === undefined) {
      throw new Error(`Reserve ${mint} not found in market ${kaminoMarket.getAddress()}`);
    }

    const [{ createAtaIx }] = await createAtasIdempotent(owner, [
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

  async getObligationPda(): Promise<Address> {
    return isKaminoObligation(this.obligation)
      ? this.obligation.obligationAddress
      : await this.obligation.toPda(this.kaminoMarket.getAddress(), this.owner.address);
  }

  isObligationInitialized() {
    return this.obligation instanceof KaminoObligation;
  }

  getAdditionalDepositReservesList(): Address[] {
    const depositReservesList = this.depositReserves;

    // check if there's any member in the preloadedDepositReserves that is not in the depositReserves
    // if so, add it to the depositReserves
    for (let i = 0; i < this.preLoadedDepositReservesSameTx.length; i++) {
      const preloadedDepositReserve = this.preLoadedDepositReservesSameTx[i];

      // Check if the depositReserves array contains the current preloadedDepositReserve
      const found = this.depositReserves.some((depositReserve) => {
        return depositReserve === preloadedDepositReserve;
      });

      // If not found, push the current preloadedDepositReserve to the depositReserves array
      if (!found) {
        depositReservesList.push(this.preLoadedDepositReservesSameTx[i]);
      }
    }

    return depositReservesList;
  }

  private static async getReferrerMetadataAccount(
    referrer: Option<Address>,
    programId: Address
  ): Promise<Option<Address>> {
    if (isSome(referrer)) {
      return some((await userMetadataPda(referrer.value, programId))[0]);
    } else {
      return none();
    }
  }

  private async getReferrerTokenStateAccountMeta(reserve: Address, writable: boolean): Promise<AccountMeta> {
    if (isSome(this.referrer)) {
      return {
        address: await referrerTokenStatePda(this.referrer.value, reserve, this.kaminoMarket.programId),
        role: writable ? AccountRole.WRITABLE : AccountRole.READONLY,
      };
    } else {
      return {
        address: this.kaminoMarket.programId,
        role: AccountRole.READONLY,
      };
    }
  }

  private async getReferrerTokenStateAddress(reserve: Address): Promise<Option<Address>> {
    return KaminoAction.getReferrerTokenStateAddressImpl(this.referrer, reserve, this.kaminoMarket.programId);
  }

  getUserTokenAccountAddress(reserve: KaminoReserve): Promise<Address> {
    return getAssociatedTokenAddress(
      reserve.getLiquidityMint(),
      this.owner.address,
      reserve.getLiquidityTokenProgram()
    );
  }

  getTokenAccountAddressByUser(reserve: KaminoReserve, user: Address): Promise<Address> {
    return getAssociatedTokenAddress(reserve.getLiquidityMint(), user, reserve.getLiquidityTokenProgram());
  }

  getUserCollateralAccountAddress(reserve: KaminoReserve): Promise<Address> {
    return getAssociatedTokenAddress(reserve.getCTokenMint(), this.owner.address);
  }

  public static actionToIxs(action: KaminoAction): Array<Instruction> {
    const ixs: Instruction[] = [...action.computeBudgetIxs, ...action.setupIxs];
    ixs.push(...KaminoAction.actionToLendingIxs(action));
    ixs.push(...action.cleanupIxs);
    return ixs;
  }

  public static actionToLendingIxs(action: KaminoAction): Array<Instruction> {
    const ixs: Instruction[] = [];
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

  private static async getFarmAccountsForReserve(
    obligationAddress: Address,
    reserve: KaminoReserve
  ): Promise<{
    debtFarmAccounts: {
      obligationFarmUserState: Option<Address>;
      reserveFarmState: Option<Address>;
    };
    collateralFarmAccounts: {
      obligationFarmUserState: Option<Address>;
      reserveFarmState: Option<Address>;
    };
  }> {
    const collateralFarmAddress = reserve.getCollateralFarmAddress();
    let collateralFarmAccounts: {
      obligationFarmUserState: Option<Address>;
      reserveFarmState: Option<Address>;
    } = {
      obligationFarmUserState: none(),
      reserveFarmState: none(),
    };
    if (isSome(collateralFarmAddress)) {
      collateralFarmAccounts = {
        obligationFarmUserState: some(await obligationFarmStatePda(collateralFarmAddress.value, obligationAddress)),
        reserveFarmState: collateralFarmAddress,
      };
    }
    let debtFarmAccounts: {
      obligationFarmUserState: Option<Address>;
      reserveFarmState: Option<Address>;
    } = {
      obligationFarmUserState: none(),
      reserveFarmState: none(),
    };
    const debtFarmAddress = reserve.getDebtFarmAddress();
    if (isSome(debtFarmAddress)) {
      debtFarmAccounts = {
        obligationFarmUserState: some(await obligationFarmStatePda(debtFarmAddress.value, obligationAddress)),
        reserveFarmState: debtFarmAddress,
      };
    }
    return {
      debtFarmAccounts,
      collateralFarmAccounts,
    };
  }

  private static async getReferrerKey(
    kaminoMarket: KaminoMarket,
    owner: Address,
    kaminoObligation: KaminoObligation | null,
    referrer: Option<Address>
  ): Promise<Option<Address>> {
    let referrerKey: Option<Address> = none();
    if (isNone(referrer) || referrer.value === DEFAULT_PUBLIC_KEY) {
      if (kaminoObligation === null) {
        const [_, userMetadata] = await kaminoMarket.getUserMetadata(owner);
        if (userMetadata && userMetadata.referrer !== DEFAULT_PUBLIC_KEY) {
          referrerKey = some(userMetadata.referrer);
        }
      } else if (kaminoObligation.state.referrer !== DEFAULT_PUBLIC_KEY) {
        referrerKey = some(kaminoObligation.state.referrer);
      }
    } else {
      referrerKey = referrer;
    }
    return referrerKey;
  }

  private static async getReferrerTokenStateAddressImpl(
    referrer: Option<Address>,
    reserve: Address,
    programId: Address
  ): Promise<Option<Address>> {
    if (isSome(referrer)) {
      return some(await referrerTokenStatePda(referrer.value, reserve, programId));
    }
    return none();
  }
}
