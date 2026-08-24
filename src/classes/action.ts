import {
  AccountRole,
  Address,
  fetchEncodedAccount,
  AccountMeta,
  AccountSignerMeta,
  Instruction,
  isNone,
  isSome,
  none,
  Option,
  some,
  TransactionSigner,
} from '@solana/kit';
import type { LedgerInstant } from '../utils/ledger';
import BN from 'bn.js';
import Decimal from 'decimal.js';
import {
  abortObligationOwnershipTransfer,
  acceptObligationOwnership,
  approveObligationOwnershipTransfer,
  borrowObligationLiquidity,
  borrowObligationLiquidityV2,
  depositAndWithdraw,
  depositObligationCollateral,
  depositObligationCollateralV2,
  depositReserveLiquidity,
  depositReserveLiquidityAndObligationCollateral,
  depositReserveLiquidityAndObligationCollateralV2,
  enqueueToWithdraw,
  fillBorrowOrderV2,
  initiateObligationOwnershipTransfer,
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
  rolloverFixedTermBorrow,
  setBorrowOrderV2,
  setObligationOrder,
  updateObligationConfig,
  type UpdateObligationConfigAccounts,
  withdrawObligationCollateralAndRedeemReserveCollateral,
  withdrawObligationCollateralAndRedeemReserveCollateralV2,
  withdrawObligationCollateralV2,
  withdrawQueuedLiquidity,
  withdrawReferrerFees,
} from '../@codegen/klend/instructions';
import {
  buildComputeBudgetIx,
  createAssociatedTokenAccountIdempotentInstruction,
  createAtasIdempotent,
  createLookupTableIx,
  DEFAULT_PUBLIC_KEY,
  getAssociatedTokenAddress,
  getEventAuthorityPda,
  globalConfigPda,
  isNotNullPubkey,
  obligationFarmStatePda,
  ObligationType,
  ownerQueuedCollateralVaultPda,
  referrerTokenStatePda,
  ScopePriceRefreshConfig,
  SOL_PADDING_FOR_INTEREST,
  U64_MAX,
  userMetadataPda,
  withdrawTicketPda,
  WRAPPED_SOL_MINT,
} from '../utils';
import { KaminoBorrowOrder } from './borrowOrder';
import { FixedRateReserveKind } from '../utils/ReserveKind';
import { getTokenIdsForScopeRefresh, KaminoMarket } from './market';
import { isKaminoObligation, KaminoObligation } from './obligation';
import { KaminoReserve } from './reserve';
import { ProgressCallbackType, ReserveFarmKind, UpdateObligationConfigMode } from '../@codegen/klend/types';
import { Reserve } from '../@codegen/klend/accounts';
import { VanillaObligation } from '../utils/ObligationType';
import { Scope } from '@kamino-finance/scope-sdk';
import { ObligationOrderAtIndex } from './obligationOrder';
import { ASSOCIATED_TOKEN_PROGRAM_ADDRESS, TOKEN_PROGRAM_ADDRESS } from '@solana-program/token';
import { SYSVAR_INSTRUCTIONS_ADDRESS, SYSVAR_RENT_ADDRESS } from '@solana/sysvars';
import {
  getCloseAccountInstruction,
  getSyncNativeInstruction,
  TOKEN_2022_PROGRAM_ADDRESS,
} from '@solana-program/token-2022';
import { getTransferSolInstruction, SYSTEM_PROGRAM_ADDRESS } from '@solana-program/system';
import { noopSigner } from '../utils/signer';
import {
  BuildDepositTxnsProps,
  BuildBorrowTxnsProps,
  BuildBorrowRolloverConfigIxsProps,
  BuildDepositReserveLiquidityTxnsProps,
  BuildRedeemReserveCollateralTxnsProps,
  BuildWithdrawTxnsProps,
  BuildWithdrawFromObligationAndEnqueueTxnsProps,
  BuildRepayTxnsProps,
  BuildDepositAndBorrowTxnsProps,
  BuildRefreshObligationTxnsProps,
  BuildRolloverFixedTermBorrowTxnsProps,
  BuildRequestElevationGroupTxnsProps,
  BuildDepositAndWithdrawV2TxnsProps,
  BuildRepayAndWithdrawTxnsProps,
  BuildRepayAndWithdrawV2TxnsProps,
  BuildLiquidateTxnsProps,
  BuildWithdrawReferrerFeeTxnsProps,
  BuildDepositObligationCollateralTxnsProps,
  BuildDepositAndSetBorrowOrderTxnsProps,
  BuildDepositAndFillBorrowOrderTxnsProps,
  InitializeActionProps,
  ObligationCustomizations,
} from './actionTypes';

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
  | 'depositAndWithdraw'
  | 'withdrawAndEnqueue'
  | 'setBorrowOrder'
  | 'fillBorrowOrder';

export type AuxiliaryIx = 'setup' | 'inBetween' | 'cleanup';
type InitUserMetadataConfig = { skipInitialization: boolean; skipLutCreation: boolean };

interface InstructionBundle {
  ixs: Instruction[];
  labels: string[];
  luts: Address[];
}

interface AddSupportIxsOptions {
  action: ActionType;
  includeAtaIxs: boolean;
  requestElevationGroup?: boolean;
  addInitObligationForFarm?: boolean;
  useV2Ixs: boolean;
  scopeRefreshConfig: ScopePriceRefreshConfig | undefined;
  initUserMetadata: InitUserMetadataConfig;
  twoTokenAction?: boolean;
  overrideElevationGroupRequest?: number;
  addUserAndObligationInitIxs?: boolean;
}

interface DepositSupportIxsOptions {
  addUserAndObligationInitIxs?: boolean;
  addInitObligationForFarm?: boolean;
}

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
  luts: Array<Address>;

  inBetweenIxs: Array<Instruction>;
  inBetweenIxsLabels: Array<string>;

  lendingIxs: Array<Instruction>;
  lendingIxsLabels: Array<string>;

  postLendingIxs: Array<Instruction>;
  postLendingIxsLabels: Array<string>;

  cleanupIxs: Array<Instruction>;
  cleanupIxsLabels: Array<string>;

  refreshFarmsCleanupTxnIxs: Array<Instruction>;
  refreshFarmsCleanupTxnIxsLabels: Array<string>;

  depositReserves: Array<Address>;
  borrowReserves: Array<Address>;

  preLoadedDepositReservesSameTx: Array<Address>;

  currentLedgerInstant: LedgerInstant;

  permissionAuthority?: TransactionSigner;

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
    currentLedgerInstant: LedgerInstant,
    secondaryMint?: Address,
    outflowReserveState?: KaminoReserve,
    outflowAmount?: string | BN,
    referrer: Option<Address> = none(),
    payer?: TransactionSigner,
    permissionAuthority?: TransactionSigner
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
    this.luts = [];
    this.inBetweenIxs = [];
    this.inBetweenIxsLabels = [];
    this.lendingIxs = [];
    this.lendingIxsLabels = [];
    this.postLendingIxs = [];
    this.postLendingIxsLabels = [];
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
    this.currentLedgerInstant = currentLedgerInstant;
    this.permissionAuthority = permissionAuthority;
  }

  private appendLendingIx(ix: Instruction): void {
    if (!this.permissionAuthority) {
      this.lendingIxs.push(ix);
      return;
    }
    const permissioner: AccountSignerMeta = {
      address: this.permissionAuthority.address,
      role: AccountRole.READONLY_SIGNER,
      signer: this.permissionAuthority,
    };
    this.lendingIxs.push({
      ...ix,
      accounts: (ix.accounts ?? []).concat(permissioner),
    });
  }

  static async initialize(props: InitializeActionProps) {
    const {
      kaminoMarket,
      action,
      amount,
      reserveAddress,
      owner,
      obligation,
      referrer = none(),
      currentLedgerInstant,
      payer = owner,
      permissionAuthority = undefined,
    } = props;

    const reserve = kaminoMarket.getReserveByAddress(reserveAddress);
    if (reserve === undefined) {
      throw new Error(`Reserve ${reserveAddress} not found in market ${kaminoMarket.getAddress()}`);
    }

    const { kaminoObligation, depositReserves, borrowReserves, distinctReserveCount } =
      await KaminoAction.loadObligation(
        action,
        kaminoMarket,
        owner.address,
        reserve.address,
        obligation,
        undefined,
        currentLedgerInstant
      );

    const referrerKey = await this.getReferrerKey(kaminoMarket, owner.address, kaminoObligation, referrer);

    return new KaminoAction(
      kaminoMarket,
      owner,
      kaminoObligation || obligation,
      reserve.getLiquidityMint(),
      distinctReserveCount,
      amount,
      depositReserves,
      borrowReserves,
      reserve,
      currentLedgerInstant,
      undefined,
      undefined,
      undefined,
      referrerKey,
      payer,
      permissionAuthority
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
    outflowReserve?: Address,
    currentLedgerInstant?: LedgerInstant
  ) {
    let kaminoObligation: KaminoObligation | null;
    const depositReserves: Array<Address> = [];
    const borrowReserves: Array<Address> = [];
    if (obligation instanceof KaminoObligation) {
      kaminoObligation = obligation;
    } else {
      const obligationAddress = await obligation.toPda(kaminoMarket.getAddress(), owner);
      kaminoObligation = await KaminoObligation.load(kaminoMarket, obligationAddress, currentLedgerInstant);
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

  static async buildRefreshObligationTxns(props: BuildRefreshObligationTxnsProps) {
    const { kaminoMarket, payer, obligation, extraComputeBudget = 1_000_000, currentLedgerInstant } = props;
    //  placeholder for action initialization
    const firstReserve = obligation.getDeposits()[0].reserveAddress;
    const firstKaminoReserve = kaminoMarket.getReserveByAddress(firstReserve);
    if (!firstKaminoReserve) {
      throw new Error(`Reserve ${firstReserve} not found`);
    }
    const axn = await KaminoAction.initialize({
      kaminoMarket,
      action: 'refreshObligation',
      amount: '0',
      reserveAddress: firstKaminoReserve.address,
      owner: noopSigner(obligation.state.owner), // owner does not need to sign for refresh
      obligation,
      currentLedgerInstant,
    });

    if (extraComputeBudget > 0) {
      axn.addComputeBudgetIx(extraComputeBudget);
    }

    await axn.addRefreshObligation(payer);

    return axn;
  }

  static async buildRequestElevationGroupTxns(props: BuildRequestElevationGroupTxnsProps) {
    const {
      kaminoMarket,
      owner,
      obligation,
      elevationGroup,
      extraComputeBudget = 1_000_000,
      currentLedgerInstant,
    } = props;
    const firstReserve = obligation.state.deposits.find((x) => x.depositReserve !== DEFAULT_PUBLIC_KEY)!.depositReserve;
    const firstKaminoReserve = kaminoMarket.getReserveByAddress(firstReserve);
    if (!firstKaminoReserve) {
      throw new Error(`Reserve ${firstReserve} not found`);
    }
    const axn = await KaminoAction.initialize({
      kaminoMarket,
      action: 'requestElevationGroup',
      amount: '0',
      reserveAddress: firstKaminoReserve.address,
      owner,
      obligation,
      currentLedgerInstant,
    });

    if (extraComputeBudget > 0) {
      axn.addComputeBudgetIx(extraComputeBudget);
    }

    await axn.addRefreshObligation(owner);
    await axn.addRequestElevationIx(elevationGroup, 'setup');

    return axn;
  }

  static async buildDepositTxns(props: BuildDepositTxnsProps) {
    return KaminoAction.buildDepositTxnsInternal(props);
  }

  private static async buildDepositTxnsInternal(
    props: BuildDepositTxnsProps,
    supportOptions: DepositSupportIxsOptions = {}
  ) {
    const {
      kaminoMarket,
      amount,
      reserveAddress,
      owner,
      obligation,
      useV2Ixs,
      scopeRefreshConfig,
      extraComputeBudget = 1_000_000,
      includeAtaIxs = true,
      requestElevationGroup = false,
      initUserMetadata = { skipInitialization: false, skipLutCreation: false },
      referrer = none(),
      currentLedgerInstant,
      overrideElevationGroupRequest,
      permissionAuthority = undefined,
      obligationCustomizations,
    } = props;

    const axn = await KaminoAction.initialize({
      kaminoMarket,
      action: 'deposit',
      amount,
      reserveAddress,
      owner,
      obligation,
      referrer,
      currentLedgerInstant,
      permissionAuthority,
    });
    applyObligationCustomizations(axn, obligationCustomizations);
    const addInitObligationForFarm = supportOptions.addInitObligationForFarm ?? true;
    const addUserAndObligationInitIxs = supportOptions.addUserAndObligationInitIxs ?? true;

    if (extraComputeBudget > 0) {
      axn.addComputeBudgetIx(extraComputeBudget);
    }

    await axn.addSupportIxs({
      action: 'deposit',
      includeAtaIxs,
      requestElevationGroup,
      addInitObligationForFarm,
      useV2Ixs,
      scopeRefreshConfig,
      initUserMetadata,
      overrideElevationGroupRequest,
      addUserAndObligationInitIxs,
    });
    if (useV2Ixs) {
      await axn.addDepositIxV2();
    } else {
      await axn.addDepositIx();
    }
    axn.addRefreshFarmsCleanupTxnIxsToCleanupIxs();

    return axn;
  }

  static async buildDepositAndSetBorrowOrderTxns(props: BuildDepositAndSetBorrowOrderTxnsProps) {
    const { borrowOrder, orderIdx, minExpectedCurrentRemainingDebtAmount, ...depositProps } = props;

    const axn = await KaminoAction.buildDepositTxns(depositProps);

    const obligationAddress = await axn.getObligationPda();
    const setBorrowOrderIxs = await KaminoAction.buildSetBorrowOrderIxs(
      props.owner,
      props.kaminoMarket,
      obligationAddress,
      borrowOrder,
      orderIdx,
      minExpectedCurrentRemainingDebtAmount
    );
    axn.postLendingIxs.push(...setBorrowOrderIxs);
    axn.postLendingIxsLabels.push('setBorrowOrder');

    return axn;
  }

  /**
   * Builds a transaction that rolls an existing borrow over from one reserve into another (the
   * `rolloverFixedTermBorrow` instruction). The target reserve may be fixed-term or variable/open-term.
   * The program requires a single signer (the `payer`) but not specifically the obligation owner, so the
   * transaction can be signed by the owner directly or cranked by a keeper.
   *
   * The returned action includes the setup refresh/farm-init instructions and the rollover instruction.
   * The program enforces several additional rollover preconditions at execution time (shared liquidity
   * mint, rollover config opt-in, matching borrow factor, target rate/term limits, the market's rollover
   * execution window, etc.) that this method does not pre-validate; a violation fails the transaction.
   * Rollover is configured on the borrow via {@link KaminoAction.buildBorrowRolloverConfigIxs}.
   */
  static async buildRolloverFixedTermBorrowTxns(props: BuildRolloverFixedTermBorrowTxnsProps) {
    const {
      kaminoMarket,
      obligation,
      sourceReserveAddress,
      targetReserveAddress,
      payer,
      scopeRefreshConfig,
      extraComputeBudget = 1_000_000,
      currentLedgerInstant,
    } = props;

    const sourceReserve = kaminoMarket.getReserveByAddress(sourceReserveAddress);
    if (!sourceReserve) {
      throw new Error(`Source reserve ${sourceReserveAddress} not found in market ${kaminoMarket.getAddress()}`);
    }
    const targetReserve = kaminoMarket.getReserveByAddress(targetReserveAddress);
    if (!targetReserve) {
      throw new Error(`Target reserve ${targetReserveAddress} not found in market ${kaminoMarket.getAddress()}`);
    }

    // The rollover only ever moves liquidity between the two reserves' vaults (it never touches a user
    // token account), so the program rejects a mint mismatch. Fail early with a clearer message.
    if (sourceReserve.getLiquidityMint() !== targetReserve.getLiquidityMint()) {
      throw new Error(
        `Rollover target reserve ${targetReserveAddress} liquidity mint ${targetReserve.getLiquidityMint()} does not match source reserve ${sourceReserveAddress} mint ${sourceReserve.getLiquidityMint()}`
      );
    }

    const axn = await KaminoAction.initialize({
      kaminoMarket,
      action: 'refreshObligation',
      amount: '0',
      reserveAddress: sourceReserve.address,
      // The rollover's only signer is `payer`; this owner slot just supplies the owner pubkey for
      // PDA/account derivation and never signs (the caller passes the owner as `payer` if they sign).
      owner: noopSigner(obligation.state.owner),
      obligation,
      currentLedgerInstant,
      payer,
    });

    if (extraComputeBudget > 0) {
      axn.addComputeBudgetIx(extraComputeBudget);
    }

    await axn.addRolloverFixedTermBorrowSupportIxs(sourceReserve, targetReserve, scopeRefreshConfig);
    await axn.addRolloverFixedTermBorrowIx(sourceReserve, targetReserve);

    return axn;
  }

  /**
   * Emits the setup instructions for a rollover: refreshes every reserve the obligation touches (plus the
   * source and target), then refreshes the obligation. No farm-refresh instructions are emitted - the
   * `rolloverFixedTermBorrow` handler refreshes the source and target debt farms internally. The source's
   * and target's debt obligation farm-user-states are initialized first if missing, since that internal
   * refresh loads them and fails if absent (the source's usually already exists from its borrow, but not
   * guaranteed if its debt farm was added later); both inits are idempotent no-ops when already present.
   *
   * When a {@link ScopePriceRefreshConfig} is provided, the Scope price refresh is prepended so the reserve
   * refreshes below (which read the Scope feed) succeed for Scope-priced reserves.
   */
  private async addRolloverFixedTermBorrowSupportIxs(
    sourceReserve: KaminoReserve,
    targetReserve: KaminoReserve,
    scopeRefreshConfig: ScopePriceRefreshConfig | undefined
  ): Promise<void> {
    // The source's and target's existence checks are independent, so run them concurrently; append the ixs
    // source-then-target afterwards to keep the emitted order deterministic.
    const [sourceInitIxs, targetInitIxs] = await Promise.all([
      this.buildInitObligationForFarmIxs(sourceReserve, ReserveFarmKind.Debt),
      this.buildInitObligationForFarmIxs(targetReserve, ReserveFarmKind.Debt),
    ]);
    this.pushInitObligationForFarmIxs([...sourceInitIxs, ...targetInitIxs], 'setup');

    // Refresh every reserve the obligation touches (the source is already among its borrows) plus the
    // target, which may be new to the obligation.
    const reservesToRefresh = [
      ...new Set<Address>([...this.depositReserves, ...this.borrowReserves, targetReserve.address]),
    ];

    // For Scope-priced reserves the refreshReserve ixs below read the Scope price feed, which must have been
    // refreshed earlier in the transaction; prepend the Scope refresh covering this same reserve set (the
    // target included). addScopeRefreshIxs unshifts, so it lands ahead of the reserve refreshes.
    const scopeTokensMap = getTokenIdsForScopeRefresh(this.kaminoMarket, reservesToRefresh);
    if (scopeTokensMap.size > 0 && scopeRefreshConfig) {
      for (const [configPubkey, config] of scopeRefreshConfig.scopeConfigurations) {
        const tokenIds = scopeTokensMap.get(config.oraclePrices);
        if (tokenIds && tokenIds.length > 0) {
          await this.addScopeRefreshIxs(scopeRefreshConfig.scope, tokenIds, configPubkey);
        }
      }
    }

    this.addRefreshReserveIxs(reservesToRefresh, 'setup');

    // refresh_obligation only validates the obligation's current reserves, so the target is intentionally
    // not added here (it is refreshed as a reserve above).
    await this.addRefreshObligationIx('setup');
  }

  /**
   * Appends the `rolloverFixedTermBorrow` instruction, resolving the source/target reserve vaults and
   * their debt-farm accounts (the on-chain handler refreshes debt farms only).
   */
  private async addRolloverFixedTermBorrowIx(
    sourceReserve: KaminoReserve,
    targetReserve: KaminoReserve
  ): Promise<void> {
    const farmsProgramId = this.kaminoMarket.farmsProgramId;

    const [obligationPda, lendingMarketAuthority] = await Promise.all([
      this.getObligationPda(),
      this.kaminoMarket.getLendingMarketAuthority(),
    ]);
    // Source and target farm accounts are independent, so resolve them concurrently.
    const [{ debtFarmAccounts: sourceFarmsAccounts }, { debtFarmAccounts: targetFarmsAccounts }] = await Promise.all([
      KaminoAction.getFarmAccountsForReserve(obligationPda, sourceReserve, farmsProgramId),
      KaminoAction.getFarmAccountsForReserve(obligationPda, targetReserve, farmsProgramId),
    ]);

    const rolloverIx = rolloverFixedTermBorrow(
      {
        rolloverAccounts: {
          payer: this.payer,
          obligation: obligationPda,
          lendingMarket: this.kaminoMarket.getAddress(),
          lendingMarketAuthority,
          sourceBorrowReserve: sourceReserve.address,
          targetBorrowReserve: targetReserve.address,
          liquidityMint: sourceReserve.getLiquidityMint(),
          sourceBorrowReserveLiquidity: sourceReserve.state.liquidity.supplyVault,
          targetBorrowReserveLiquidity: targetReserve.state.liquidity.supplyVault,
          tokenProgram: sourceReserve.getLiquidityTokenProgram(),
        },
        sourceFarmsAccounts,
        targetFarmsAccounts,
        farmsProgram: farmsProgramId,
      },
      undefined,
      this.kaminoMarket.programId
    );

    this.lendingIxs.push(rolloverIx);
    this.lendingIxsLabels.push(
      `rolloverFixedTermBorrow[source=${sourceReserve.address}, target=${targetReserve.address}]`
    );
  }

  async addScopeRefreshIxs(scope: Scope, tokens: number[], scopeConfig: Address) {
    const refreshIx = await scope.refreshPriceListIx({ config: scopeConfig }, tokens);
    if (refreshIx) {
      this.setupIxsLabels.unshift(`refreshScopePrices`);
      this.setupIxs.unshift(refreshIx);
    }
  }

  /**
   * Add the opt-in borrow support instructions used when creating and filling a borrow order from vaults.
   * These setup instructions mirror the borrow builder's user-metadata initialization, elevation switching,
   * and Scope refresh flow for an existing obligation.
   */
  async addBorrowOrderSupportIxs(
    scopeRefreshConfig: ScopePriceRefreshConfig | undefined,
    initUserMetadata: { skipInitialization: boolean; skipLutCreation: boolean } = {
      skipInitialization: false,
      skipLutCreation: false,
    },
    requestElevationGroup: boolean = false,
    overrideElevationGroupRequest?: number
  ) {
    if (!isKaminoObligation(this.obligation)) {
      throw new Error('Borrow order support ixs require an existing KaminoObligation');
    }

    await this.maybeAddUserMetadataIxs(initUserMetadata);

    if (requestElevationGroup) {
      const newElevationGroup = this.getBorrowElevationGroupRequest(overrideElevationGroupRequest);
      if (newElevationGroup !== undefined) {
        await this.addBorrowElevationSupportIxs(newElevationGroup, 'setup', true);
      }
    }

    await this.addSupportScopeRefreshIxs(scopeRefreshConfig);
  }

  static async buildBorrowTxns(props: BuildBorrowTxnsProps) {
    const {
      kaminoMarket,
      amount,
      reserveAddress,
      owner,
      obligation,
      useV2Ixs,
      scopeRefreshConfig,
      extraComputeBudget = 1_000_000,
      includeAtaIxs = true,
      requestElevationGroup = false,
      initUserMetadata = { skipInitialization: false, skipLutCreation: false },
      referrer = none(),
      currentLedgerInstant,
      overrideElevationGroupRequest,
      rollOver = false,
      permissionAuthority = undefined,
      obligationCustomizations,
    } = props;

    const axn = await KaminoAction.initialize({
      kaminoMarket,
      action: 'borrow',
      amount,
      reserveAddress,
      owner,
      obligation,
      referrer,
      currentLedgerInstant,
      permissionAuthority,
    });
    applyObligationCustomizations(axn, obligationCustomizations);
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

    await axn.addSupportIxs({
      action: 'borrow',
      includeAtaIxs,
      requestElevationGroup,
      addInitObligationForFarm,
      useV2Ixs,
      scopeRefreshConfig,
      initUserMetadata,
      overrideElevationGroupRequest,
    });
    if (useV2Ixs) {
      await axn.addBorrowIxV2();
    } else {
      await axn.addBorrowIx();
    }
    if (rollOver && axn.reserve.getKind().isFixedRate()) {
      await axn.addBorrowRolloverConfigIxs();
    }
    axn.addRefreshFarmsCleanupTxnIxsToCleanupIxs();

    return axn;
  }

  static async buildDepositReserveLiquidityTxns(props: BuildDepositReserveLiquidityTxnsProps) {
    const {
      kaminoMarket,
      amount,
      reserveAddress,
      owner,
      obligation,
      scopeRefreshConfig,
      extraComputeBudget = 1_000_000,
      includeAtaIxs = true,
      requestElevationGroup = false,
      referrer = none(),
      currentLedgerInstant,
      permissionAuthority = undefined,
    } = props;

    const axn = await KaminoAction.initialize({
      kaminoMarket,
      action: 'mint',
      amount,
      reserveAddress,
      owner,
      obligation,
      referrer,
      currentLedgerInstant,
      permissionAuthority,
    });
    if (extraComputeBudget > 0) {
      axn.addComputeBudgetIx(extraComputeBudget);
    }

    await axn.addSupportIxs({
      action: 'mint',
      includeAtaIxs,
      requestElevationGroup,
      addInitObligationForFarm: false,
      useV2Ixs: true,
      scopeRefreshConfig,
      initUserMetadata: { skipInitialization: true, skipLutCreation: true },
    });
    await axn.addDepositReserveLiquidityIx();
    axn.addRefreshFarmsCleanupTxnIxsToCleanupIxs();
    return axn;
  }

  static async buildRedeemReserveCollateralTxns(props: BuildRedeemReserveCollateralTxnsProps) {
    const {
      kaminoMarket,
      amount,
      reserveAddress,
      owner,
      obligation,
      scopeRefreshConfig,
      extraComputeBudget = 1_000_000,
      includeAtaIxs = true,
      requestElevationGroup = false,
      referrer = none(),
      currentLedgerInstant,
    } = props;

    const axn = await KaminoAction.initialize({
      kaminoMarket,
      action: 'redeem',
      amount,
      reserveAddress,
      owner,
      obligation,
      referrer,
      currentLedgerInstant,
    });
    if (extraComputeBudget > 0) {
      axn.addComputeBudgetIx(extraComputeBudget);
    }

    await axn.addSupportIxs({
      action: 'redeem',
      includeAtaIxs,
      requestElevationGroup,
      addInitObligationForFarm: false,
      useV2Ixs: true,
      scopeRefreshConfig,
      initUserMetadata: { skipInitialization: true, skipLutCreation: true },
    });
    await axn.addRedeemReserveCollateralIx();
    axn.addRefreshFarmsCleanupTxnIxsToCleanupIxs();
    return axn;
  }

  static async buildDepositObligationCollateralTxns(props: BuildDepositObligationCollateralTxnsProps) {
    const {
      kaminoMarket,
      amount,
      reserveAddress,
      owner,
      obligation,
      useV2Ixs,
      scopeRefreshConfig,
      extraComputeBudget = 1_000_000,
      includeAtaIxs = true,
      requestElevationGroup = false,
      initUserMetadata = { skipInitialization: false, skipLutCreation: false },
      referrer = none(),
      currentLedgerInstant,
      permissionAuthority = undefined,
    } = props;
    const axn = await KaminoAction.initialize({
      kaminoMarket,
      action: 'depositCollateral',
      amount,
      reserveAddress,
      owner,
      obligation,
      referrer,
      currentLedgerInstant,
      permissionAuthority,
    });
    const addInitObligationForFarm = true;

    if (extraComputeBudget > 0) {
      axn.addComputeBudgetIx(extraComputeBudget);
    }

    await axn.addSupportIxs({
      action: 'depositCollateral',
      includeAtaIxs,
      requestElevationGroup,
      addInitObligationForFarm,
      useV2Ixs,
      scopeRefreshConfig,
      initUserMetadata,
    });
    if (useV2Ixs) {
      await axn.addDepositObligationCollateralIxV2();
    } else {
      await axn.addDepositObligationCollateralIx();
    }
    axn.addRefreshFarmsCleanupTxnIxsToCleanupIxs();
    return axn;
  }

  static async buildDepositAndBorrowTxns(props: BuildDepositAndBorrowTxnsProps) {
    const {
      kaminoMarket,
      depositAmount,
      depositReserveAddress,
      borrowAmount,
      borrowReserveAddress,
      owner,
      obligation,
      useV2Ixs,
      scopeRefreshConfig,
      extraComputeBudget = 1_000_000,
      includeAtaIxs = true,
      requestElevationGroup = false,
      overrideElevationGroupRequest,
      initUserMetadata = { skipInitialization: false, skipLutCreation: false },
      referrer = none(),
      currentLedgerInstant,
      rollOver = false,
      permissionAuthority = undefined,
    } = props;
    const axn = await KaminoAction.initializeMultiTokenAction(
      kaminoMarket,
      'depositAndBorrow',
      depositAmount,
      depositReserveAddress,
      borrowReserveAddress,
      owner,
      owner.address,
      obligation,
      borrowAmount,
      referrer,
      currentLedgerInstant,
      permissionAuthority
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
    await axn.addSupportIxs({
      action: 'deposit',
      includeAtaIxs,
      requestElevationGroup,
      addInitObligationForFarm: addInitObligationForFarmForDeposit,
      useV2Ixs,
      scopeRefreshConfig: undefined,
      initUserMetadata,
      twoTokenAction,
    });

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
      useV2Ixs,
      overrideElevationGroupRequest
    );
    if (rollOver && axn.outflowReserve?.getKind().isFixedRate()) {
      const obligationAddress = await axn.getObligationPda();
      const rolloverIxs = KaminoAction.buildBorrowRolloverConfigIxs({
        reserve: axn.outflowReserve,
        rollover: true,
        openTermAllowed: false,
        owner: axn.owner,
        obligation: obligationAddress,
        lendingMarket: axn.kaminoMarket.getAddress(),
        programId: axn.kaminoMarket.programId,
      });
      axn.postLendingIxs.push(...rolloverIxs);
      axn.postLendingIxsLabels.push('updateObligationConfig[BorrowRolloverConfig]');
    }
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

  static async buildDepositAndWithdrawV2Txns(props: BuildDepositAndWithdrawV2TxnsProps) {
    const {
      kaminoMarket,
      depositAmount,
      depositReserveAddress,
      withdrawAmount,
      withdrawReserveAddress,
      owner,
      currentLedgerInstant,
      obligation,
      scopeRefreshConfig,
      extraComputeBudget = 1_000_000,
      includeAtaIxs = true,
      requestElevationGroup = false,
      initUserMetadata = { skipInitialization: false, skipLutCreation: false },
      referrer = none(),
      permissionAuthority = undefined,
    } = props;
    const axn = await KaminoAction.initializeMultiTokenAction(
      kaminoMarket,
      'depositAndWithdraw',
      depositAmount,
      depositReserveAddress,
      withdrawReserveAddress,
      owner,
      owner.address,
      obligation,
      withdrawAmount,
      referrer,
      currentLedgerInstant,
      permissionAuthority
    );
    const addInitObligationForFarm = true;
    const twoTokenAction = true;
    if (extraComputeBudget > 0) {
      axn.addComputeBudgetIx(extraComputeBudget);
    }

    await axn.addSupportIxs({
      action: 'depositAndWithdraw',
      includeAtaIxs,
      requestElevationGroup,
      addInitObligationForFarm,
      useV2Ixs: true,
      scopeRefreshConfig,
      initUserMetadata,
      twoTokenAction,
    });
    const withdrawCollateralAmount = axn.getWithdrawCollateralAmount(axn.outflowReserve!, axn.outflowAmount!);
    await axn.addDepositAndWithdrawV2Ixs(withdrawCollateralAmount);

    return axn;
  }

  static async buildRepayAndWithdrawV2Txns(props: BuildRepayAndWithdrawV2TxnsProps) {
    const {
      kaminoMarket,
      repayAmount,
      repayReserveAddress,
      withdrawAmount,
      withdrawReserveAddress,
      payer,
      currentLedgerInstant,
      obligation,
      scopeRefreshConfig,
      extraComputeBudget = 1_000_000,
      includeAtaIxs = true,
      requestElevationGroup = false,
      initUserMetadata = { skipInitialization: false, skipLutCreation: false },
      referrer = none(),
    } = props;
    const axn = await KaminoAction.initializeMultiTokenAction(
      kaminoMarket,
      'repayAndWithdrawV2',
      repayAmount,
      repayReserveAddress,
      withdrawReserveAddress,
      payer,
      payer.address,
      obligation,
      withdrawAmount,
      referrer,
      currentLedgerInstant
    );
    const addInitObligationForFarm = true;
    const twoTokenAction = true;
    if (extraComputeBudget > 0) {
      axn.addComputeBudgetIx(extraComputeBudget);
    }

    await axn.addSupportIxs({
      action: 'repayAndWithdrawV2',
      includeAtaIxs,
      requestElevationGroup,
      addInitObligationForFarm,
      useV2Ixs: true,
      scopeRefreshConfig,
      initUserMetadata,
      twoTokenAction,
    });
    const withdrawCollateralAmount = axn.getWithdrawCollateralAmount(axn.outflowReserve!, axn.outflowAmount!);
    await axn.addRepayAndWithdrawV2Ixs(withdrawCollateralAmount);

    return axn;
  }

  static async buildRepayAndWithdrawTxns(props: BuildRepayAndWithdrawTxnsProps) {
    const {
      kaminoMarket,
      repayAmount,
      repayReserveAddress,
      withdrawAmount,
      withdrawReserveAddress,
      payer,
      currentLedgerInstant,
      obligation,
      useV2Ixs,
      scopeRefreshConfig,
      extraComputeBudget = 1_000_000,
      includeAtaIxs = true,
      requestElevationGroup = false,
      initUserMetadata = { skipInitialization: false, skipLutCreation: false },
      referrer = none(),
    } = props;
    const axn = await KaminoAction.initializeMultiTokenAction(
      kaminoMarket,
      'repayAndWithdraw',
      repayAmount,
      repayReserveAddress,
      withdrawReserveAddress,
      payer,
      payer.address,
      obligation,
      withdrawAmount,
      referrer,
      currentLedgerInstant
    );
    const addInitObligationForFarmForRepay = true;
    const addInitObligationForFarmForWithdraw = false;
    const twoTokenAction = true;
    if (extraComputeBudget > 0) {
      axn.addComputeBudgetIx(extraComputeBudget);
    }

    await axn.addSupportIxs({
      action: 'repay',
      includeAtaIxs,
      requestElevationGroup,
      addInitObligationForFarm: addInitObligationForFarmForRepay,
      useV2Ixs,
      scopeRefreshConfig: undefined,
      initUserMetadata,
      twoTokenAction,
    });

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

  static async buildWithdrawTxns(props: BuildWithdrawTxnsProps) {
    const {
      kaminoMarket,
      amount,
      reserveAddress,
      owner,
      obligation,
      useV2Ixs,
      scopeRefreshConfig,
      extraComputeBudget = 1_000_000,
      includeAtaIxs = true,
      requestElevationGroup = false,
      initUserMetadata = { skipInitialization: false, skipLutCreation: false },
      referrer = none(),
      currentLedgerInstant,
      overrideElevationGroupRequest,
      obligationCustomizations,
    } = props;

    const axn = await KaminoAction.initialize({
      kaminoMarket,
      action: 'withdraw',
      amount,
      reserveAddress,
      owner,
      obligation,
      referrer,
      currentLedgerInstant,
    });
    const addInitObligationForFarm = true;

    if (extraComputeBudget > 0) {
      axn.addComputeBudgetIx(extraComputeBudget);
    }

    applyObligationCustomizations(axn, obligationCustomizations);

    await axn.addSupportIxs({
      action: 'withdraw',
      includeAtaIxs,
      requestElevationGroup,
      addInitObligationForFarm,
      useV2Ixs,
      scopeRefreshConfig,
      initUserMetadata,
      overrideElevationGroupRequest,
    });

    const collateralAmount = axn.getWithdrawCollateralAmount(axn.reserve, axn.amount);
    if (useV2Ixs) {
      await axn.addWithdrawIxV2(collateralAmount);
    } else {
      await axn.addWithdrawIx(collateralAmount);
    }

    axn.addRefreshFarmsCleanupTxnIxsToCleanupIxs();

    return axn;
  }

  static async buildWithdrawFromObligationAndEnqueueTxns(props: BuildWithdrawFromObligationAndEnqueueTxnsProps) {
    const {
      kaminoMarket,
      withdrawAmount,
      reserveAddress,
      owner,
      obligation,
      scopeRefreshConfig,
      extraComputeBudget = 1_000_000,
      includeAtaIxs = true,
      requestElevationGroup = false,
      initUserMetadata = { skipInitialization: false, skipLutCreation: false },
      referrer = none(),
      currentLedgerInstant,
      userDestinationLiquidityAta,
      progressCallbackType = new ProgressCallbackType.None(),
      progressCallbackCustomAccount0 = none(),
      progressCallbackCustomAccount1 = none(),
    } = props;

    const axn = await KaminoAction.initialize({
      kaminoMarket,
      action: 'withdrawAndEnqueue',
      amount: withdrawAmount,
      reserveAddress,
      owner,
      obligation,
      referrer,
      currentLedgerInstant,
    });

    if (extraComputeBudget > 0) {
      axn.addComputeBudgetIx(extraComputeBudget);
    }

    await axn.addSupportIxs({
      action: 'withdrawAndEnqueue',
      includeAtaIxs,
      requestElevationGroup,
      addInitObligationForFarm: true,
      useV2Ixs: true,
      scopeRefreshConfig,
      initUserMetadata,
    });

    const withdrawCollateralAmount = axn.getWithdrawCollateralAmount(axn.reserve, axn.amount);
    await axn.addWithdrawObligationCollateralIxV2(withdrawCollateralAmount);

    const destinationLiquidityAta = userDestinationLiquidityAta ?? (await axn.getUserTokenAccountAddress(axn.reserve));
    const enqueueIx = await KaminoAction.buildEnqueueToWithdrawIx(
      owner,
      kaminoMarket,
      axn.reserve,
      withdrawCollateralAmount,
      destinationLiquidityAta,
      progressCallbackType,
      progressCallbackCustomAccount0,
      progressCallbackCustomAccount1
    );
    axn.lendingIxs.push(enqueueIx);
    axn.lendingIxsLabels.push(`enqueueToWithdraw`);

    axn.addRefreshFarmsCleanupTxnIxsToCleanupIxs();

    return axn;
  }

  /**
   * Build repay transactions
   * @param props - BuildRepayTxnsProps containing all required and optional parameters
   */
  static async buildRepayTxns(props: BuildRepayTxnsProps) {
    const {
      kaminoMarket,
      amount,
      reserveAddress,
      owner,
      obligation,
      useV2Ixs,
      scopeRefreshConfig,
      currentLedgerInstant,
      payer = owner,
      extraComputeBudget = 1_000_000,
      includeAtaIxs = true,
      requestElevationGroup = false,
      initUserMetadata = { skipInitialization: false, skipLutCreation: false },
      referrer = none(),
    } = props;

    const axn = await KaminoAction.initialize({
      kaminoMarket,
      action: 'repay',
      amount,
      reserveAddress,
      owner,
      obligation,
      referrer,
      currentLedgerInstant,
      payer,
    });
    const addInitObligationForFarm = true;

    if (extraComputeBudget > 0) {
      axn.addComputeBudgetIx(extraComputeBudget);
    }

    await axn.addSupportIxs({
      action: 'repay',
      includeAtaIxs,
      requestElevationGroup,
      addInitObligationForFarm,
      useV2Ixs,
      scopeRefreshConfig,
      initUserMetadata,
    });
    if (useV2Ixs) {
      await axn.addRepayIxV2();
    } else {
      await axn.addRepayIx();
    }
    axn.addRefreshFarmsCleanupTxnIxsToCleanupIxs();

    return axn;
  }

  static async buildLiquidateTxns(props: BuildLiquidateTxnsProps): Promise<KaminoAction> {
    const {
      kaminoMarket,
      amount,
      minCollateralReceiveAmount,
      repayReserveAddress,
      withdrawReserveAddress,
      liquidator,
      obligationOwner,
      obligation,
      useV2Ixs,
      scopeRefreshConfig,
      extraComputeBudget = 1_000_000,
      includeAtaIxs = true,
      requestElevationGroup = false,
      initUserMetadata = { skipInitialization: false, skipLutCreation: false },
      referrer = none(),
      maxAllowedLtvOverridePercent = 0,
      currentLedgerInstant,
      permissionAuthority = undefined,
    } = props;
    const axn = await KaminoAction.initializeMultiTokenAction(
      kaminoMarket,
      'liquidate',
      amount,
      repayReserveAddress,
      withdrawReserveAddress,
      liquidator,
      obligationOwner,
      obligation,
      minCollateralReceiveAmount,
      referrer,
      currentLedgerInstant,
      permissionAuthority
    );
    const addInitObligationForFarm = true;

    if (extraComputeBudget > 0) {
      axn.addComputeBudgetIx(extraComputeBudget);
    }

    await axn.addSupportIxs({
      action: 'liquidate',
      includeAtaIxs,
      requestElevationGroup,
      addInitObligationForFarm,
      useV2Ixs,
      scopeRefreshConfig,
      initUserMetadata,
    });
    if (useV2Ixs) {
      await axn.addLiquidateIxV2(maxAllowedLtvOverridePercent);
    } else {
      await axn.addLiquidateIx(maxAllowedLtvOverridePercent);
    }
    axn.addRefreshFarmsCleanupTxnIxsToCleanupIxs();

    return axn;
  }

  static async buildWithdrawReferrerFeeTxns(props: BuildWithdrawReferrerFeeTxnsProps) {
    const { owner, reserveAddress, kaminoMarket, currentLedgerInstant } = props;
    const { axn, createAtaIxs } = await KaminoAction.initializeWithdrawReferrerFees(
      reserveAddress,
      owner,
      kaminoMarket,
      currentLedgerInstant
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

  /**
   * Builds an instruction for the current obligation owner to initiate an ownership transfer
   * to a new owner. Once this instruction succeeds, the obligation is locked for user-facing
   * operations until the transfer is approved by the global admin and accepted by the new owner
   * (or aborted by the current owner).
   *
   * Four-step flow:
   * 1. Current owner calls this (buildInitiateObligationOwnershipTransferIxn)
   * 2. Global admin calls buildApproveObligationOwnershipTransferIxn
   * 3. New owner calls buildAcceptObligationOwnershipIxn
   *
   * Between steps 1 and 2 the current owner can also call
   * {@link buildAbortObligationOwnershipTransferIxn} to cancel.
   */
  static buildInitiateObligationOwnershipTransferIxn(
    owner: TransactionSigner,
    kaminoMarket: KaminoMarket,
    obligation: KaminoObligation,
    newOwner: Address
  ): Instruction {
    return initiateObligationOwnershipTransfer(
      { newOwner },
      {
        owner,
        obligation: obligation.obligationAddress,
        instructionSysvarAccount: SYSVAR_INSTRUCTIONS_ADDRESS,
      },
      undefined,
      kaminoMarket.programId
    );
  }

  /**
   * Builds an instruction for the global admin to approve a pending obligation ownership transfer.
   * Must be called after {@link buildInitiateObligationOwnershipTransferIxn} and before
   * {@link buildAcceptObligationOwnershipIxn}.
   *
   * `pendingOwner` must match the pending owner set on the obligation; if omitted it is read from
   * {@link KaminoObligation.state.pendingOwner}.
   */
  static async buildApproveObligationOwnershipTransferIxn(
    globalAdmin: TransactionSigner,
    kaminoMarket: KaminoMarket,
    obligation: KaminoObligation,
    pendingOwner?: Address
  ): Promise<Instruction> {
    const globalConfig = await globalConfigPda(kaminoMarket.programId);
    return approveObligationOwnershipTransfer(
      {
        globalAdmin,
        globalConfig,
        obligation: obligation.obligationAddress,
        pendingOwner: pendingOwner ?? obligation.state.pendingOwner,
        instructionSysvarAccount: SYSVAR_INSTRUCTIONS_ADDRESS,
      },
      undefined,
      kaminoMarket.programId
    );
  }

  /**
   * Builds an instruction for the pending owner (set via
   * {@link buildInitiateObligationOwnershipTransferIxn} and approved via
   * {@link buildApproveObligationOwnershipTransferIxn}) to accept and finalize the ownership transfer.
   */
  static buildAcceptObligationOwnershipIxn(
    pendingOwner: TransactionSigner,
    kaminoMarket: KaminoMarket,
    obligation: KaminoObligation
  ): Instruction {
    return acceptObligationOwnership(
      {
        pendingOwner,
        obligation: obligation.obligationAddress,
        instructionSysvarAccount: SYSVAR_INSTRUCTIONS_ADDRESS,
      },
      undefined,
      kaminoMarket.programId
    );
  }

  /**
   * Builds an instruction for the current obligation owner to abort an in-progress ownership
   * transfer. Valid only while the transfer is in the Initiated state (i.e. has not yet been
   * approved by the global admin).
   */
  static buildAbortObligationOwnershipTransferIxn(
    owner: TransactionSigner,
    kaminoMarket: KaminoMarket,
    obligation: KaminoObligation
  ): Instruction {
    return abortObligationOwnershipTransfer(
      {
        owner,
        obligation: obligation.obligationAddress,
        instructionSysvarAccount: SYSVAR_INSTRUCTIONS_ADDRESS,
      },
      undefined,
      kaminoMarket.programId
    );
  }

  /**
   * Builds an instruction for enqueueing a withdrawal request to the withdraw queue.
   * This is used when there isn't enough liquidity to immediately withdraw.
   */
  static async buildEnqueueToWithdrawIx(
    owner: TransactionSigner,
    kaminoMarket: KaminoMarket,
    reserve: KaminoReserve,
    collateralAmount: BN,
    userDestinationLiquidityTa: Address,
    progressCallbackType:
      | ProgressCallbackType.None
      | ProgressCallbackType.KlendQueueAccountingHandlerOnKvault = new ProgressCallbackType.None(),
    progressCallbackCustomAccount0: Option<Address> = none(),
    progressCallbackCustomAccount1: Option<Address> = none()
  ): Promise<Instruction> {
    const lendingMarketAuthority = await kaminoMarket.getLendingMarketAuthority();
    const userSourceCollateralTa = await getAssociatedTokenAddress(reserve.getCTokenMint(), owner.address);
    const withdrawTicket = await withdrawTicketPda(
      reserve.address,
      BigInt(reserve.state.withdrawQueue.nextIssuedTicketSequenceNumber.toString()),
      kaminoMarket.programId
    );
    const ownerQueuedCollateralVault = await ownerQueuedCollateralVaultPda(
      reserve.address,
      owner.address,
      kaminoMarket.programId
    );

    return enqueueToWithdraw(
      {
        collateralAmount,
        progressCallbackType,
      },
      {
        owner,
        lendingMarket: kaminoMarket.getAddress(),
        lendingMarketAuthority,
        reserve: reserve.address,
        userSourceCollateralTa,
        userDestinationLiquidityTa,
        reserveLiquidityMint: reserve.getLiquidityMint(),
        reserveCollateralMint: reserve.getCTokenMint(),
        collateralTokenProgram: TOKEN_PROGRAM_ADDRESS,
        withdrawTicket,
        ownerQueuedCollateralVault,
        systemProgram: SYSTEM_PROGRAM_ADDRESS,
        progressCallbackCustomAccount0,
        progressCallbackCustomAccount1,
        instructionSysvarAccount: SYSVAR_INSTRUCTIONS_ADDRESS,
      },
      undefined,
      kaminoMarket.programId
    );
  }

  /**
   * Builds an instruction for withdrawing queued liquidity (permissionless).
   * This allows anyone to process a withdraw ticket when liquidity becomes available.
   */
  static async buildWithdrawQueuedLiquidityIx(
    payer: TransactionSigner,
    kaminoMarket: KaminoMarket,
    reserve: KaminoReserve,
    withdrawTicket: Address,
    withdrawTicketOwner: Address,
    userDestinationLiquidity: Address,
    progressCallbackProgram: Option<Address> = none(),
    progressCallbackCustomAccount0: Option<Address> = none(),
    progressCallbackCustomAccount1: Option<Address> = none()
  ): Promise<Instruction> {
    const lendingMarketAuthority = await kaminoMarket.getLendingMarketAuthority();
    const resolvedProgressCallbackProgram = isNone(progressCallbackProgram)
      ? some(SYSTEM_PROGRAM_ADDRESS)
      : progressCallbackProgram;
    const resolvedProgressCallbackCustomAccount0 = isNone(progressCallbackCustomAccount0)
      ? some(SYSTEM_PROGRAM_ADDRESS)
      : progressCallbackCustomAccount0;
    const resolvedProgressCallbackCustomAccount1 = isNone(progressCallbackCustomAccount1)
      ? some(SYSTEM_PROGRAM_ADDRESS)
      : progressCallbackCustomAccount1;
    const ownerQueuedCollateralVault = await ownerQueuedCollateralVaultPda(
      reserve.address,
      withdrawTicketOwner,
      kaminoMarket.programId
    );

    return withdrawQueuedLiquidity(
      {
        payer,
        lendingMarket: kaminoMarket.getAddress(),
        lendingMarketAuthority,
        reserve: reserve.address,
        reserveLiquidityMint: reserve.getLiquidityMint(),
        reserveCollateralMint: reserve.getCTokenMint(),
        reserveLiquiditySupply: reserve.state.liquidity.supplyVault,
        ownerQueuedCollateralVault,
        userDestinationLiquidity,
        collateralTokenProgram: TOKEN_PROGRAM_ADDRESS,
        liquidityTokenProgram: reserve.getLiquidityTokenProgram(),
        withdrawTicket,
        withdrawTicketOwner,
        associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ADDRESS,
        systemProgram: SYSTEM_PROGRAM_ADDRESS,
        progressCallbackProgram: resolvedProgressCallbackProgram,
        progressCallbackCustomAccount0: resolvedProgressCallbackCustomAccount0,
        progressCallbackCustomAccount1: resolvedProgressCallbackCustomAccount1,
        instructionSysvarAccount: SYSVAR_INSTRUCTIONS_ADDRESS,
      },
      undefined,
      kaminoMarket.programId
    );
  }

  /**
   * Builds instructions for setting a borrow order on an obligation.
   * Includes an idempotent ATA creation for the filled debt destination when setting an order.
   *
   * @param owner - the obligation owner and signer for the instruction
   * @param kaminoMarket - the lending market that owns the obligation
   * @param obligation - the obligation to attach the borrow order to
   * @param borrowOrder - the order to set, or null to cancel the existing order
   * @param orderIdx - which of the obligation's borrow orders to write
   * @param minExpectedCurrentRemainingDebtAmount - minimum expected remaining debt amount
   */
  static async buildSetBorrowOrderIxs(
    owner: TransactionSigner,
    kaminoMarket: KaminoMarket,
    obligation: KaminoObligation | Address,
    borrowOrder: KaminoBorrowOrder | null,
    orderIdx: number,
    minExpectedCurrentRemainingDebtAmount: BN = new BN(0)
  ): Promise<Instruction[]> {
    let obligationAddress: Address;
    let order: KaminoBorrowOrder;

    if (obligation instanceof KaminoObligation) {
      obligationAddress = obligation.obligationAddress;
      order = borrowOrder ?? KaminoBorrowOrder.createCancelBorrowOrder(obligation.getBorrowOrder(orderIdx));
    } else {
      obligationAddress = obligation;
      if (!borrowOrder) {
        throw new Error(
          'Cancelling a borrow order is not supported when passing in an obligation address, pass in a KaminoObligation instead'
        );
      }
      order = borrowOrder;
    }

    const ixs: Instruction[] = [];

    if (borrowOrder) {
      const debtTokenProgram = kaminoMarket.getLiquidityTokenProgramByMint(order.debtLiquidityMint);
      const [, createDebtAtaIx] = await createAssociatedTokenAccountIdempotentInstruction(
        owner,
        order.debtLiquidityMint,
        owner.address,
        debtTokenProgram
      );
      ixs.push(createDebtAtaIx);
    }

    const eventAuthority = await getEventAuthorityPda(kaminoMarket.programId);
    // Any reserve with the matching debt mint works here — the program only uses it for
    // price and decimals in the min-value check, which are the same across all reserve kinds.
    const reserve = kaminoMarket.getExistingReservesByMint(order.debtLiquidityMint)[0];

    ixs.push(
      setBorrowOrderV2(
        {
          orderIdx,
          orderConfig: order.toConfigArgs(),
          minExpectedCurrentRemainingDebtAmount,
        },
        {
          owner,
          obligation: obligationAddress,
          lendingMarket: kaminoMarket.getAddress(),
          reserve: reserve.address,
          filledDebtDestination: order.filledDebtDestination,
          debtLiquidityMint: order.debtLiquidityMint,
          eventAuthority,
          program: kaminoMarket.programId,
          instructionSysvarAccount: SYSVAR_INSTRUCTIONS_ADDRESS,
        },
        undefined,
        kaminoMarket.programId
      )
    );

    return ixs;
  }

  /**
   * Builds an instruction for filling a borrow order on an obligation.
   * This allows lenders to provide liquidity for fixed-term loan requests.
   * @param payer - the signer paying for the transaction
   * @param kaminoMarket - the lending market that owns the obligation
   * @param obligation - the obligation that holds the borrow order
   * @param reserve - the reserve that provides the borrow liquidity
   * @param currentTimestamp - current unix time in seconds, used to resolve which order is still fillable
   * @param orderIdx - which of the obligation's borrow orders to fill; omit to fill its only fillable one
   */
  static async buildFillBorrowOrderIx(
    payer: TransactionSigner,
    kaminoMarket: KaminoMarket,
    obligation: KaminoObligation,
    reserve: KaminoReserve,
    currentTimestamp: number,
    orderIdx: number = obligation.requireSoleActiveBorrowOrderIdx(currentTimestamp)
  ): Promise<Instruction> {
    const obligationAddress = obligation.obligationAddress;
    const { debtFarmAccounts: farmsAccounts } = await KaminoAction.getFarmAccountsForReserve(
      obligationAddress,
      reserve,
      kaminoMarket.farmsProgramId
    );

    const referrer = obligation.state.referrer;
    const referrerTokenState =
      referrer !== DEFAULT_PUBLIC_KEY
        ? some(await referrerTokenStatePda(referrer, reserve.address, kaminoMarket.programId))
        : none<Address>();

    const eventAuthority = await getEventAuthorityPda(kaminoMarket.programId);

    // The fill delegates to the normal borrow logic, which uses the obligation's deposit reserves (passed as
    // remaining accounts) to update elevation-group debt trackers. Append them when the obligation is in an
    // elevation group, mirroring addBorrowIx; outside an elevation group they are not needed.
    const remainingAccounts: AccountMeta[] =
      obligation.state.elevationGroup > 0
        ? obligation.getDeposits().map((position) => ({ address: position.reserveAddress, role: AccountRole.WRITABLE }))
        : [];

    return fillBorrowOrderV2(
      { orderIdx },
      {
        borrowAccounts: {
          payer,
          obligation: obligationAddress,
          lendingMarket: kaminoMarket.getAddress(),
          lendingMarketAuthority: await kaminoMarket.getLendingMarketAuthority(),
          borrowReserve: reserve.address,
          borrowReserveLiquidityMint: reserve.getLiquidityMint(),
          reserveSourceLiquidity: reserve.state.liquidity.supplyVault,
          borrowReserveLiquidityFeeReceiver: reserve.state.liquidity.feeVault,
          // The program pins this to the order's `filled_debt_destination` (which the borrower chose and need
          // not be the owner's canonical ATA), so pass that account rather than re-deriving the owner's ATA.
          userDestinationLiquidity: obligation.getBorrowOrder(orderIdx).filledDebtDestination,
          referrerTokenState,
          tokenProgram: reserve.getLiquidityTokenProgram(),
          instructionSysvarAccount: SYSVAR_INSTRUCTIONS_ADDRESS,
        },
        farmsAccounts,
        farmsProgram: kaminoMarket.farmsProgramId,
        eventAuthority,
        program: kaminoMarket.programId,
      },
      remainingAccounts,
      kaminoMarket.programId
    );
  }

  /**
   * Builds a lender flow that deposits liquidity into the reserve matching a borrower's borrow order and fills
   * that order in the same flow. The lender deposit is recorded as lender obligation collateral, not as cTokens
   * in the lender's wallet. The fill reserve is selected from the order's debt mint among the
   * reserves that can fill the order on-chain (the term + rate gates of
   * {@link KaminoObligation.getCompatibleBorrowOrderFillReserves}); a fixed-term order is restricted to
   * fixed/maturity-term reserves (never an open-term float reserve). Among those, it picks the lender-favorable
   * one: the highest peak borrow rate, tie-broken by the shortest remaining term (the shortest active cap among
   * configured term and/or seconds until maturity). It throws if no reserve can fill the order. By default the
   * lender deposits exactly enough to fully fill the order (its
   * remaining debt plus the borrow origination/referrer fees); pass `amount` to deposit a specific amount
   * instead - a smaller amount may partially fill the order (subject to the order's on-chain min-fill and
   * min-remainder constraints), a larger one fully fills it and leaves the excess as lender obligation collateral.
   *
   * The borrower's obligation is expected to hold an active borrow order. When the flow requires accounts that can
   * be initialized before the main deposit/fill transaction - lender metadata, the lender obligation, lender
   * collateral farm state, borrower debt farm state, or the referrer's token state for the fill reserve - the
   * result returns those setup instructions separately in `preFillSetupIxs`. Send them before the main `action`
   * when the array is non-empty. This means the lender may pay rent for borrower-side accounts, and that rent is
   * not reclaimable.
   *
   * @returns the composed {@link KaminoAction} together with the chosen fill reserve and the deposited amount.
   */
  static async buildDepositAndFillBorrowOrderTxns(
    props: BuildDepositAndFillBorrowOrderTxnsProps
  ): Promise<DepositAndFillBorrowOrderResult> {
    const {
      kaminoMarket,
      lender,
      borrowerObligation,
      amount,
      orderIdx,
      lenderObligation = new VanillaObligation(kaminoMarket.programId),
      useV2Ixs = true,
      scopeRefreshConfig,
      extraComputeBudget = 1_000_000,
      includeAtaIxs = true,
      referrer = none(),
      currentLedgerInstant,
    } = props;

    const currentTimestamp = Number(currentLedgerInstant.blockTime);
    const filledOrderIdx = orderIdx ?? borrowerObligation.requireSoleActiveBorrowOrderIdx(currentTimestamp);
    const borrowOrder = borrowerObligation.getBorrowOrder(filledOrderIdx);
    if (!borrowOrder.isActive()) {
      throw new Error(
        `Borrow order ${filledOrderIdx} on obligation ${borrowerObligation.obligationAddress} has no remaining debt to fill`
      );
    }

    // Select the fill reserve of the order's debt mint with the lender-favorable policy (highest peak borrow
    // rate, tie-broken by shortest remaining term; a fixed-term order never uses an open-term float reserve).
    const fillReserve = KaminoObligation.selectBorrowOrderFillReserve(kaminoMarket, borrowOrder, currentTimestamp);
    if (fillReserve === undefined) {
      throw new Error(
        `No reserve of mint ${borrowOrder.debtLiquidityMint} can fill the borrow order on obligation ` +
          `${borrowerObligation.obligationAddress} (order max rate ${borrowOrder.maxBorrowRateBps} bps, ` +
          `min term ${borrowOrder.minDebtTermSeconds.toString()}s)`
      );
    }

    const preFillSetup = await KaminoAction.buildDepositAndFillBorrowOrderSetupIxs({
      kaminoMarket,
      lender,
      lenderObligation,
      borrowerObligation,
      fillReserve,
      referrer,
    });

    // Omitting `amount` deposits exactly enough to fully fill the order: its remaining debt plus the on-chain
    // origination fee (getBorrowOrderRemainingDebtAmountWithFees returns the exact rounded-fee integer). A
    // provided `amount` is deposited as-is - a smaller one partially fills the order, a larger one fully fills it
    // with the excess left as lender obligation collateral; the on-chain fill borrows at most the order's
    // remaining amount, bounded by the available liquidity.
    const hasReferrer = borrowerObligation.state.referrer !== DEFAULT_PUBLIC_KEY;
    const depositedAmount =
      amount !== undefined
        ? new BN(amount)
        : new BN(
            KaminoObligation.getBorrowOrderRemainingDebtAmountWithFees(
              borrowOrder,
              kaminoMarket,
              fillReserve,
              hasReferrer
            ).toFixed(0)
          );

    // The lender deposit must go into the lender's obligation, not to the lender's cToken ATA. The deposit marks
    // the fill reserve stale, so the fill re-refreshes it together with the borrower's obligation reserves,
    // refreshes the borrower's obligation, then fills - all appended after the deposit instruction. The deposit,
    // obligation refresh, and fill instructions are independent, so build them in parallel.
    const refreshReserveIxs = KaminoAction.getRefreshAllReserves(kaminoMarket, [
      ...new Set<Address>([fillReserve.address, ...borrowerObligation.getAllReserves()]),
    ]);
    const [action, refreshBorrowerObligationIx, fillBorrowOrderIx] = await Promise.all([
      KaminoAction.buildDepositTxnsInternal(
        {
          kaminoMarket,
          amount: depositedAmount,
          reserveAddress: fillReserve.address,
          owner: lender,
          obligation: lenderObligation,
          useV2Ixs,
          scopeRefreshConfig,
          extraComputeBudget,
          includeAtaIxs,
          initUserMetadata: { skipInitialization: true, skipLutCreation: true },
          referrer,
          currentLedgerInstant,
        },
        {
          addUserAndObligationInitIxs: false,
          addInitObligationForFarm: false,
        }
      ),
      borrowerObligation.getRefreshObligationIx(),
      KaminoAction.buildFillBorrowOrderIx(
        lender,
        kaminoMarket,
        borrowerObligation,
        fillReserve,
        currentTimestamp,
        filledOrderIdx
      ),
    ]);

    action.lendingIxs.push(...refreshReserveIxs, refreshBorrowerObligationIx, fillBorrowOrderIx);
    action.lendingIxsLabels.push(
      ...refreshReserveIxs.map(() => 'refreshReserve'),
      `refreshObligation[${borrowerObligation.obligationAddress}]`,
      'fillBorrowOrder'
    );

    return {
      action,
      fillReserve,
      depositedAmount,
      preFillSetupIxs: preFillSetup.ixs,
      preFillSetupIxsLabels: preFillSetup.labels,
      preFillSetupLuts: preFillSetup.luts,
    };
  }

  async addDepositReserveLiquidityIx() {
    this.lendingIxsLabels.push(`depositReserveLiquidity`);
    this.appendLendingIx(
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
    this.appendLendingIx(
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
      this.reserve,
      this.kaminoMarket.farmsProgramId
    );
    this.lendingIxsLabels.push(`depositReserveLiquidityAndObligationCollateralV2`);
    this.appendLendingIx(
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
          farmsProgram: this.kaminoMarket.farmsProgramId,
        },
        undefined,
        this.kaminoMarket.programId
      )
    );
  }

  /// @deprecated -- use addDepositObligationCollateralIxV2 instead
  async addDepositObligationCollateralIx() {
    this.lendingIxsLabels.push(`depositObligationCollateral`);
    this.appendLendingIx(
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
      this.reserve,
      this.kaminoMarket.farmsProgramId
    );

    this.lendingIxsLabels.push(`depositObligationCollateralV2`);
    this.appendLendingIx(
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
          farmsProgram: this.kaminoMarket.farmsProgramId,
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
    this.appendLendingIx(borrowIx);
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
      this.reserve,
      this.kaminoMarket.farmsProgramId
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
        farmsProgram: this.kaminoMarket.farmsProgramId,
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
    this.appendLendingIx(borrowIx);
  }

  /**
   * Creates the instructions to configure rollover settings for fixed-rate borrows: 4, plus one more when
   * {@link BuildBorrowRolloverConfigIxsProps.fixedTermRolloverWindowDurationDays} is given.
   *
   * @param props - BuildBorrowRolloverConfigIxsProps containing all required parameters
   * @returns Array of update obligation config instructions
   */
  static buildBorrowRolloverConfigIxs(props: BuildBorrowRolloverConfigIxsProps): Instruction[] {
    const {
      reserve,
      rollover,
      openTermAllowed,
      fixedTermRolloverWindowDurationDays,
      owner,
      obligation,
      lendingMarket,
      programId,
    } = props;
    const reserveKind = reserve.getKind() as FixedRateReserveKind;
    const borrowRateBps = reserveKind.borrowRateBps;
    const maxBorrowRateBpsBytes = Buffer.alloc(4);
    maxBorrowRateBpsBytes.writeUInt32LE(borrowRateBps, 0);

    const minDebtTermSecondsBytes = Buffer.alloc(8);
    minDebtTermSecondsBytes.writeBigUInt64LE(BigInt(reserveKind.debtTermSeconds.toString()), 0);

    const accounts: UpdateObligationConfigAccounts = {
      owner,
      obligation,
      borrowReserve: some(reserve.address),
      depositReserve: none<Address>(),
      lendingMarket,
    };

    const rolloverValue = rollover ? 1 : 0;
    const openTermAllowedValue = openTermAllowed ? 1 : 0;

    const enabledIx = updateObligationConfig(
      { mode: new UpdateObligationConfigMode.FixedTermRolloverEnabled(), value: Uint8Array.from([rolloverValue]) },
      accounts,
      undefined,
      programId
    );
    const maxBorrowRateIx = updateObligationConfig(
      { mode: new UpdateObligationConfigMode.FixedTermRolloverMaxBorrowRateBps(), value: maxBorrowRateBpsBytes },
      accounts,
      undefined,
      programId
    );
    const minDebtTermIx = updateObligationConfig(
      { mode: new UpdateObligationConfigMode.FixedTermRolloverMinDebtTermSeconds(), value: minDebtTermSecondsBytes },
      accounts,
      undefined,
      programId
    );
    const openTermAllowedIx = updateObligationConfig(
      {
        mode: new UpdateObligationConfigMode.FixedTermRolloverOpenTermAllowed(),
        value: Uint8Array.from([openTermAllowedValue]),
      },
      accounts,
      undefined,
      programId
    );

    // On-chain check_enabled_rollover_config_integrity runs after each config update.
    // It requires max_borrow_rate_bps > 0 when either auto-rollover or migration-to-fixed is enabled,
    // and requires min_debt_term_seconds > 0 when migration-to-fixed is enabled.
    // So when enabling rollover, set criteria first and then enable it.
    // When disabling rollover, clear the enabled flag first and then zero the criteria.
    const ixs = rollover
      ? [maxBorrowRateIx, minDebtTermIx, enabledIx, openTermAllowedIx]
      : [enabledIx, openTermAllowedIx, maxBorrowRateIx, minDebtTermIx];

    if (fixedTermRolloverWindowDurationDays !== undefined) {
      // Written through a u8 buffer rather than `Uint8Array.from`, which would silently wrap a value the
      // on-chain field cannot hold (300 days becoming 44).
      const windowDurationDaysBytes = Buffer.alloc(1);
      windowDurationDaysBytes.writeUInt8(fixedTermRolloverWindowDurationDays);
      // A non-zero window is rejected while auto-rollover is on and the min debt term is zero, so this goes
      // last either way: by now the enabling path has set the term, and the disabling path has cleared the flag.
      ixs.push(
        updateObligationConfig(
          {
            mode: new UpdateObligationConfigMode.FixedTermRolloverWindowDurationDays(),
            value: windowDurationDaysBytes,
          },
          accounts,
          undefined,
          programId
        )
      );
    }

    return ixs;
  }

  private async addBorrowRolloverConfigIxs(): Promise<void> {
    const obligation = await this.getObligationPda();
    const rolloverIxs = KaminoAction.buildBorrowRolloverConfigIxs({
      reserve: this.reserve,
      rollover: true,
      openTermAllowed: false,
      owner: this.owner,
      obligation,
      lendingMarket: this.kaminoMarket.getAddress(),
      programId: this.kaminoMarket.programId,
    });

    this.lendingIxs.push(...rolloverIxs);
    this.lendingIxsLabels.push('updateObligationConfig[BorrowRolloverConfig]');
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
      this.reserve,
      this.kaminoMarket.farmsProgramId
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
          farmsProgram: this.kaminoMarket.farmsProgramId,
        },
        undefined,
        this.kaminoMarket.programId
      )
    );
  }

  async addWithdrawObligationCollateralIxV2(collateralAmount: BN): Promise<void> {
    const obligationAddress = await this.getObligationPda();
    const { collateralFarmAccounts: farmsAccounts } = await KaminoAction.getFarmAccountsForReserve(
      obligationAddress,
      this.reserve,
      this.kaminoMarket.farmsProgramId
    );
    this.lendingIxsLabels.push(`withdrawObligationCollateralV2`);
    this.lendingIxs.push(
      withdrawObligationCollateralV2(
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
            reserveSourceCollateral: this.reserve.state.collateral.supplyVault,
            userDestinationCollateral: await this.getUserCollateralAccountAddress(this.reserve),
            tokenProgram: TOKEN_PROGRAM_ADDRESS,
            instructionSysvarAccount: SYSVAR_INSTRUCTIONS_ADDRESS,
          },
          farmsAccounts,
          farmsProgram: this.kaminoMarket.farmsProgramId,
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
      this.reserve,
      this.kaminoMarket.farmsProgramId
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
        farmsProgram: this.kaminoMarket.farmsProgramId,
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
      this.outflowReserve,
      this.kaminoMarket.farmsProgramId
    );
    const { debtFarmAccounts } = await KaminoAction.getFarmAccountsForReserve(
      obligationAddress,
      this.reserve,
      this.kaminoMarket.farmsProgramId
    );

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
        farmsProgram: this.kaminoMarket.farmsProgramId,
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
      this.reserve,
      this.kaminoMarket.farmsProgramId
    );
    const { collateralFarmAccounts: withdrawFarmsAccounts } = await KaminoAction.getFarmAccountsForReserve(
      obligationAddress,
      this.outflowReserve,
      this.kaminoMarket.farmsProgramId
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
        farmsProgram: this.kaminoMarket.farmsProgramId,
      },
      undefined,
      this.kaminoMarket.programId
    );

    depositAndWithdrawIx = {
      ...depositAndWithdrawIx,
      accounts: depositAndWithdrawIx.accounts!.concat(depositReserveAccountMetas).concat(borrowReserveAccountMetas),
    };

    this.appendLendingIx(depositAndWithdrawIx);
  }

  async addDepositAndBorrowIx() {
    this.lendingIxsLabels.push(`depositReserveLiquidityAndObligationCollateral`);
    this.lendingIxsLabels.push(`borrowObligationLiquidity`);
    this.appendLendingIx(
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

    this.appendLendingIx(borrowIx);
  }

  async addDepositAndBorrowIxV2(): Promise<void> {
    const obligationAddress = await this.getObligationPda();
    const { collateralFarmAccounts: collateralFarmsAccounts } = await KaminoAction.getFarmAccountsForReserve(
      obligationAddress,
      this.reserve,
      this.kaminoMarket.farmsProgramId
    );

    this.lendingIxsLabels.push(`depositReserveLiquidityAndObligationCollateralV2`);
    this.lendingIxsLabels.push(`borrowObligationLiquidityV2`);
    this.appendLendingIx(
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
          farmsProgram: this.kaminoMarket.farmsProgramId,
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
      this.outflowReserve,
      this.kaminoMarket.farmsProgramId
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
        farmsProgram: this.kaminoMarket.farmsProgramId,
      },
      undefined,
      this.kaminoMarket.programId
    );

    borrowIx = {
      ...borrowIx,
      accounts: borrowIx.accounts!.concat(depositReserveAccountMetas),
    };

    this.appendLendingIx(borrowIx);
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
      this.reserve,
      this.kaminoMarket.farmsProgramId
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
        farmsProgram: this.kaminoMarket.farmsProgramId,
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
      this.outflowReserve,
      this.kaminoMarket.farmsProgramId
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
          farmsProgram: this.kaminoMarket.farmsProgramId,
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
    this.appendLendingIx(liquidateIx);
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
      this.outflowReserve,
      this.kaminoMarket.farmsProgramId
    );
    const { debtFarmAccounts: debtFarmsAccounts } = await KaminoAction.getFarmAccountsForReserve(
      await this.getObligationPda(),
      this.reserve,
      this.kaminoMarket.farmsProgramId
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
        farmsProgram: this.kaminoMarket.farmsProgramId,
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
    this.appendLendingIx(liquidateIx);
  }

  async addInBetweenIxs(
    action: ActionType,
    includeAtaIxs: boolean,
    requestElevationGroup: boolean,
    addInitObligationForFarm: boolean,
    useV2Ixs: boolean,
    overrideElevationGroupRequest?: number
  ) {
    await this.addSupportIxsWithoutInitObligation(
      action,
      includeAtaIxs,
      useV2Ixs,
      'inBetween',
      requestElevationGroup,
      addInitObligationForFarm,
      false,
      overrideElevationGroupRequest
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
        'withdrawAndEnqueue',
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
          action === 'withdrawAndEnqueue' ||
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
          let newElevationGroup: number | undefined;
          let addAsSupportIx: AuxiliaryIx = 'setup';
          const currentElevationGroup = isKaminoObligation(this.obligation) ? this.obligation.state.elevationGroup : 0;

          if (overrideElevationGroupRequest !== undefined) {
            newElevationGroup = overrideElevationGroupRequest;
          } else {
            if (action === 'depositAndBorrow') {
              addAsSupportIx = 'inBetween';
              const nextElevationGroup = this.getPreferredElevationGroupForBorrowPair(
                this.reserve,
                this.outflowReserve!
              );
              if (nextElevationGroup !== undefined && nextElevationGroup !== currentElevationGroup) {
                newElevationGroup = nextElevationGroup;
              }
            } else {
              newElevationGroup = this.getBorrowElevationGroupRequest();
            }
          }

          if (
            newElevationGroup !== undefined &&
            newElevationGroup !== (isKaminoObligation(this.obligation) ? this.obligation.state.elevationGroup : 0)
          ) {
            await this.addBorrowElevationSupportIxs(newElevationGroup, addAsSupportIx, action === 'borrow');
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
            action === 'withdrawAndEnqueue' ||
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

  async addSupportIxs({
    action,
    includeAtaIxs,
    requestElevationGroup = false,
    addInitObligationForFarm = false,
    useV2Ixs,
    scopeRefreshConfig,
    initUserMetadata,
    twoTokenAction = false,
    overrideElevationGroupRequest,
    addUserAndObligationInitIxs,
  }: AddSupportIxsOptions) {
    const shouldAddUserAndObligationInitIxs = addUserAndObligationInitIxs ?? !['mint', 'redeem'].includes(action);
    if (shouldAddUserAndObligationInitIxs) {
      await this.maybeAddUserMetadataIxs(initUserMetadata);
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

    await this.addSupportScopeRefreshIxs(scopeRefreshConfig);
  }

  private getSupportScopeRefreshReserves(): Address[] {
    return [
      ...new Set<Address>([
        ...this.depositReserves,
        ...this.borrowReserves,
        this.reserve.address,
        ...(this.outflowReserve ? [this.outflowReserve.address] : []),
        ...(this.preLoadedDepositReservesSameTx ? this.preLoadedDepositReservesSameTx : []),
      ]),
    ];
  }

  private async addSupportScopeRefreshIxs(scopeRefreshConfig: ScopePriceRefreshConfig | undefined) {
    const scopeTokensMap = getTokenIdsForScopeRefresh(this.kaminoMarket, this.getSupportScopeRefreshReserves());

    if (scopeTokensMap.size > 0 && scopeRefreshConfig) {
      for (const [configPubkey, config] of scopeRefreshConfig.scopeConfigurations) {
        const tokenIds = scopeTokensMap.get(config.oraclePrices);
        if (tokenIds && tokenIds.length > 0) {
          await this.addScopeRefreshIxs(scopeRefreshConfig.scope, tokenIds, configPubkey);
        }
      }
    }
  }

  private static emptyInstructionBundle(): InstructionBundle {
    return { ixs: [], labels: [], luts: [] };
  }

  private static appendInstructionBundle(target: InstructionBundle, source: InstructionBundle): void {
    target.ixs.push(...source.ixs);
    target.labels.push(...source.labels);
    target.luts.push(...source.luts);
  }

  private static combineInstructionBundles(...sources: InstructionBundle[]): InstructionBundle {
    const bundle = KaminoAction.emptyInstructionBundle();
    sources.forEach((source) => KaminoAction.appendInstructionBundle(bundle, source));
    return bundle;
  }

  private appendInstructionBundle(bundle: InstructionBundle, addAsSupportIx: AuxiliaryIx = 'setup'): void {
    if (addAsSupportIx === 'setup') {
      this.setupIxs.push(...bundle.ixs);
      this.setupIxsLabels.push(...bundle.labels);
    } else if (addAsSupportIx === 'inBetween') {
      this.inBetweenIxs.push(...bundle.ixs);
      this.inBetweenIxsLabels.push(...bundle.labels);
    } else {
      this.cleanupIxs.push(...bundle.ixs);
      this.cleanupIxsLabels.push(...bundle.labels);
    }
    this.luts.push(...bundle.luts);
  }

  private async maybeAddUserMetadataIxs(initUserMetadata: InitUserMetadataConfig) {
    this.appendInstructionBundle(
      await KaminoAction.buildUserMetadataSetupIxs({
        kaminoMarket: this.kaminoMarket,
        owner: this.owner,
        payer: this.payer,
        referrer: this.referrer,
        initUserMetadata,
      })
    );
  }

  private static async buildUserMetadataSetupIxs({
    kaminoMarket,
    owner,
    payer,
    referrer,
    initUserMetadata: initUserMetadataConfig,
  }: {
    kaminoMarket: KaminoMarket;
    owner: TransactionSigner;
    payer: TransactionSigner;
    referrer: Option<Address>;
    initUserMetadata: InitUserMetadataConfig;
  }): Promise<InstructionBundle> {
    const bundle = KaminoAction.emptyInstructionBundle();
    const [, ownerUserMetadata] = await kaminoMarket.getUserMetadata(owner.address);
    if (ownerUserMetadata || initUserMetadataConfig.skipInitialization) {
      return bundle;
    }

    let lookupTable: Address = DEFAULT_PUBLIC_KEY;
    if (!initUserMetadataConfig.skipLutCreation) {
      const [createLutIx, lookupTableAddress] = await createLookupTableIx(kaminoMarket.getRpc(), owner);
      lookupTable = lookupTableAddress;
      bundle.ixs.push(createLutIx);
      bundle.labels.push(`createUserLutIx[${lookupTableAddress}]`);
      bundle.luts.push(lookupTableAddress);
    }

    const [userMetadataAddress] = await userMetadataPda(owner.address, kaminoMarket.programId);
    const referrerUserMetadataAddress = await KaminoAction.getReferrerMetadataAccount(referrer, kaminoMarket.programId);
    bundle.ixs.push(
      initUserMetadata(
        {
          userLookupTable: lookupTable,
        },
        {
          owner,
          feePayer: payer,
          userMetadata: userMetadataAddress,
          referrerUserMetadata: referrerUserMetadataAddress,
          rent: SYSVAR_RENT_ADDRESS,
          systemProgram: SYSTEM_PROGRAM_ADDRESS,
        },
        undefined,
        kaminoMarket.programId
      )
    );
    bundle.labels.push(`initUserMetadata[${userMetadataAddress.toString()}]`);
    return bundle;
  }

  private async addBorrowElevationSupportIxs(
    newElevationGroup: number,
    addAsSupportIx: AuxiliaryIx,
    trackPotentialElevationGroupUpdate: boolean = false
  ) {
    const currentReserveAddresses = new Set<Address>([this.reserve.address]);
    if (this.outflowReserve) {
      currentReserveAddresses.add(this.outflowReserve.address);
    }
    const allReservesExcludingCurrent = [...new Set<Address>(this.depositReserves.concat(this.borrowReserves))].filter(
      (address) => !currentReserveAddresses.has(address)
    );

    await this.addRequestElevationIx(newElevationGroup, addAsSupportIx);
    this.addRefreshReserveIxs(allReservesExcludingCurrent, addAsSupportIx);
    this.addRefreshReserveIxs([...currentReserveAddresses], addAsSupportIx);
    await this.addRefreshObligationIx(addAsSupportIx);

    if (trackPotentialElevationGroupUpdate && isKaminoObligation(this.obligation)) {
      this.obligation.refreshedStats.potentialElevationGroupUpdate = newElevationGroup;
    }
  }

  private getBorrowElevationGroupRequest(overrideElevationGroupRequest?: number): number | undefined {
    if (!isKaminoObligation(this.obligation)) {
      throw new Error(`obligation is not a KaminoObligation`);
    }

    let newElevationGroup: number | undefined = overrideElevationGroupRequest;

    if (newElevationGroup === undefined) {
      const depositReserve = this.obligation.deposits.values().next().value;
      if (!depositReserve) {
        throw new Error('No deposit reserve found in obligation, cannot borrow against it');
      }

      const collReserve = this.kaminoMarket.getExistingReserveByAddress(depositReserve.reserveAddress);
      newElevationGroup = this.getPreferredElevationGroupForBorrowPair(collReserve, this.reserve);
    }

    if (newElevationGroup === undefined || newElevationGroup === this.obligation.state.elevationGroup) {
      return undefined;
    }

    return newElevationGroup;
  }

  private getPreferredElevationGroupForBorrowPair(
    collReserve: KaminoReserve,
    debtReserve: KaminoReserve
  ): number | undefined {
    const selectedElevationGroupId = this.kaminoMarket.getPreferredElevationGroupForBorrowPair(
      collReserve,
      debtReserve
    );
    if (selectedElevationGroupId === 0) {
      console.log('No common elevation groups found, staying with default');
      return undefined;
    }
    return selectedElevationGroupId;
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

    // The token states of the borrows accruing referral fees must come first (see
    // `KaminoObligation.orderBorrowReservesForReferrerTokenStates`).
    const borrowReservesReferrerTokenStates: AccountMeta[] = [];
    if (isSome(this.referrer)) {
      borrowReservesReferrerTokenStates.push(
        ...(await Promise.all(
          KaminoObligation.orderBorrowReservesForReferrerTokenStates(this.kaminoMarket, borrowReservesList).map(
            (reserve) => {
              return this.getReferrerTokenStateAccountMeta(reserve, true);
            }
          )
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

    // The token states of the borrows accruing referral fees must come first (see
    // `KaminoObligation.orderBorrowReservesForReferrerTokenStates`).
    const borrowReservesReferrerTokenStates: AccountMeta[] = [];
    if (isSome(this.referrer)) {
      borrowReservesReferrerTokenStates.push(
        ...(await Promise.all(
          KaminoObligation.orderBorrowReservesForReferrerTokenStates(this.kaminoMarket, borrowReservesList).map(
            (reserve) => {
              return this.getReferrerTokenStateAccountMeta(reserve, false);
            }
          )
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
          await obligationFarmStatePda(
            kaminoReserve.state.farmCollateral,
            obligationAddress,
            this.kaminoMarket.farmsProgramId
          ),
          kaminoReserve,
        ]);
      }
      if (mode === ReserveFarmKind.Debt && kaminoReserve.state.farmDebt !== DEFAULT_PUBLIC_KEY) {
        farms.push([
          ReserveFarmKind.Debt,
          kaminoReserve.state.farmDebt,
          await obligationFarmStatePda(
            kaminoReserve.state.farmDebt,
            obligationAddress,
            this.kaminoMarket.farmsProgramId
          ),
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
        farmsProgram: this.kaminoMarket.farmsProgramId,
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
    this.pushInitObligationForFarmIxs(await this.buildInitObligationForFarmIxs(reserve, mode), addAsSupportIx);
  }

  /**
   * Appends already-built init-obligation-for-farm instructions (from {@link buildInitObligationForFarmIxs}) to
   * the requested support instruction list. Callers that build several reserves' ixs concurrently use this to
   * append them in a deterministic order afterwards.
   */
  private pushInitObligationForFarmIxs(initIxs: { ix: Instruction; label: string }[], addAsSupportIx: AuxiliaryIx) {
    const bundle = KaminoAction.emptyInstructionBundle();
    bundle.ixs.push(...initIxs.map(({ ix }) => ix));
    bundle.labels.push(...initIxs.map(({ label }) => label));
    this.appendInstructionBundle(bundle, addAsSupportIx);
  }

  /**
   * Builds the `initObligationFarmsForReserve` instruction(s) needed for this reserve's farm of the given kind,
   * without mutating the action. Returns an entry only when the reserve has that farm and the obligation's
   * farm-user-state does not yet exist. This lets callers fetch existence checks concurrently and then append the
   * resulting ixs in a deterministic order via {@link pushInitObligationForFarmIxs}.
   */
  private async buildInitObligationForFarmIxs(
    reserve: KaminoReserve,
    mode: typeof ReserveFarmKind.Collateral | typeof ReserveFarmKind.Debt
  ): Promise<{ ix: Instruction; label: string }[]> {
    const obligationAddress = await this.getObligationPda();
    const bundle = await KaminoAction.buildInitObligationFarmForReserveSetupIxs({
      kaminoMarket: this.kaminoMarket,
      reserve,
      mode,
      obligationAddress,
      obligationOwner: isKaminoObligation(this.obligation) ? this.obligation.state.owner : this.owner.address,
      // The farm user-state account is rent-paid by the transaction's payer, which is not necessarily
      // the obligation owner (e.g. a keeper-cranked rollover where `owner` is a non-signing noopSigner).
      payer: this.payer,
    });
    return bundle.ixs.map((ix, index) => ({ ix, label: bundle.labels[index] }));
  }

  private static async buildInitObligationFarmForReserveSetupIxs({
    kaminoMarket,
    reserve,
    mode,
    obligationAddress,
    obligationOwner,
    payer,
    label,
  }: {
    kaminoMarket: KaminoMarket;
    reserve: KaminoReserve;
    mode: typeof ReserveFarmKind.Collateral | typeof ReserveFarmKind.Debt;
    obligationAddress: Address;
    obligationOwner: Address;
    payer: TransactionSigner;
    label?: string;
  }): Promise<InstructionBundle> {
    const bundle = KaminoAction.emptyInstructionBundle();
    const farms: [number, Address, Address][] = [];

    if (mode === ReserveFarmKind.Collateral && isNotNullPubkey(reserve.state.farmCollateral)) {
      const pda = await obligationFarmStatePda(
        reserve.state.farmCollateral,
        obligationAddress,
        kaminoMarket.farmsProgramId
      );
      const account = await fetchEncodedAccount(kaminoMarket.getRpc(), pda);
      if (!account.exists) {
        farms.push([ReserveFarmKind.Collateral.discriminator, reserve.state.farmCollateral, pda]);
      }
    }

    if (mode === ReserveFarmKind.Debt && isNotNullPubkey(reserve.state.farmDebt)) {
      const pda = await obligationFarmStatePda(reserve.state.farmDebt, obligationAddress, kaminoMarket.farmsProgramId);
      const account = await fetchEncodedAccount(kaminoMarket.getRpc(), pda);
      if (!account.exists) {
        farms.push([ReserveFarmKind.Debt.discriminator, reserve.state.farmDebt, pda]);
      }
    }

    const lendingMarketAuthority = await kaminoMarket.getLendingMarketAuthority();
    farms.forEach((arg: [number, Address, Address]) => {
      const args: InitObligationFarmsForReserveArgs = { mode: arg[0] };
      const accounts: InitObligationFarmsForReserveAccounts = {
        owner: obligationOwner,
        payer,
        obligation: obligationAddress,
        lendingMarketAuthority,
        reserve: reserve.address,
        reserveFarmState: arg[1],
        obligationFarm: arg[2],
        lendingMarket: kaminoMarket.getAddress(),
        farmsProgram: kaminoMarket.farmsProgramId,
        rent: SYSVAR_RENT_ADDRESS,
        systemProgram: SYSTEM_PROGRAM_ADDRESS,
      };
      bundle.ixs.push(initObligationFarmsForReserve(args, accounts, [], kaminoMarket.programId));
      bundle.labels.push(label ?? `InitObligationForFarm[${reserve.address.toString()}, ${obligationAddress}]`);
    });
    return bundle;
  }

  private async addInitObligationIxs(): Promise<void> {
    this.appendInstructionBundle(
      await KaminoAction.buildInitObligationSetupIxs({
        kaminoMarket: this.kaminoMarket,
        owner: this.owner,
        payer: this.payer,
        obligation: this.obligation,
      })
    );
  }

  private static async buildInitObligationSetupIxs({
    kaminoMarket,
    owner,
    payer,
    obligation,
  }: {
    kaminoMarket: KaminoMarket;
    owner: TransactionSigner;
    payer: TransactionSigner;
    obligation: KaminoObligation | ObligationType;
  }): Promise<InstructionBundle> {
    const bundle = KaminoAction.emptyInstructionBundle();
    if (isKaminoObligation(obligation)) {
      return bundle;
    }

    const obligationPda = await obligation.toPda(kaminoMarket.getAddress(), owner.address);
    const [userMetadataAddress] = await userMetadataPda(owner.address, kaminoMarket.programId);
    const obligationArgs = obligation.toArgs();
    bundle.ixs.push(
      initObligation(
        {
          args: {
            tag: obligationArgs.tag,
            id: obligationArgs.id,
          },
        },
        {
          obligationOwner: owner,
          feePayer: payer,
          obligation: obligationPda,
          lendingMarket: kaminoMarket.getAddress(),
          seed1Account: obligationArgs.seed1,
          seed2Account: obligationArgs.seed2,
          ownerUserMetadata: userMetadataAddress,
          rent: SYSVAR_RENT_ADDRESS,
          systemProgram: SYSTEM_PROGRAM_ADDRESS,
        },
        undefined,
        kaminoMarket.programId
      )
    );
    bundle.labels.push(`InitObligation[${obligationPda.toString()}]`);
    return bundle;
  }

  private static async buildDepositOwnerPreActionSetupIxs({
    kaminoMarket,
    owner,
    payer,
    obligation,
    reserve,
    referrer,
    initUserMetadata,
  }: {
    kaminoMarket: KaminoMarket;
    owner: TransactionSigner;
    payer: TransactionSigner;
    obligation: KaminoObligation | ObligationType;
    reserve: KaminoReserve;
    referrer: Option<Address>;
    initUserMetadata: InitUserMetadataConfig;
  }): Promise<InstructionBundle> {
    const obligationAddress = isKaminoObligation(obligation)
      ? obligation.obligationAddress
      : await obligation.toPda(kaminoMarket.getAddress(), owner.address);

    const userMetadataSetup = await KaminoAction.buildUserMetadataSetupIxs({
      kaminoMarket,
      owner,
      payer,
      referrer,
      initUserMetadata,
    });
    const obligationSetup = await KaminoAction.buildInitObligationSetupIxs({ kaminoMarket, owner, payer, obligation });
    const farmSetup = await KaminoAction.buildInitObligationFarmForReserveSetupIxs({
      kaminoMarket,
      reserve,
      mode: ReserveFarmKind.Collateral,
      obligationAddress,
      obligationOwner: isKaminoObligation(obligation) ? obligation.state.owner : owner.address,
      payer,
      label: `InitObligationForFarm[${reserve.address.toString()}, ${obligationAddress.toString()}]`,
    });

    return KaminoAction.combineInstructionBundles(userMetadataSetup, obligationSetup, farmSetup);
  }

  private static async buildDepositAndFillBorrowOrderSetupIxs({
    kaminoMarket,
    lender,
    lenderObligation,
    borrowerObligation,
    fillReserve,
    referrer,
  }: {
    kaminoMarket: KaminoMarket;
    lender: TransactionSigner;
    lenderObligation: KaminoObligation | ObligationType;
    borrowerObligation: KaminoObligation;
    fillReserve: KaminoReserve;
    referrer: Option<Address>;
  }): Promise<InstructionBundle> {
    const [lenderSetup, borrowerDebtFarmSetup, borrowerReferrerTokenStateSetup] = await Promise.all([
      KaminoAction.buildDepositOwnerPreActionSetupIxs({
        kaminoMarket,
        owner: lender,
        payer: lender,
        obligation: lenderObligation,
        reserve: fillReserve,
        referrer,
        initUserMetadata: { skipInitialization: false, skipLutCreation: false },
      }),
      KaminoAction.buildInitObligationFarmForReserveSetupIxs({
        kaminoMarket,
        reserve: fillReserve,
        mode: ReserveFarmKind.Debt,
        obligationAddress: borrowerObligation.obligationAddress,
        obligationOwner: borrowerObligation.state.owner,
        payer: lender,
        label: 'initObligationFarmsForReserve[debt]',
      }),
      KaminoAction.buildReferrerTokenStateSetupIxs({
        kaminoMarket,
        payer: lender,
        reserve: fillReserve,
        referrer: borrowerObligation.state.referrer,
      }),
    ]);

    return KaminoAction.combineInstructionBundles(lenderSetup, borrowerDebtFarmSetup, borrowerReferrerTokenStateSetup);
  }

  private static async buildReferrerTokenStateSetupIxs({
    kaminoMarket,
    payer,
    reserve,
    referrer,
  }: {
    kaminoMarket: KaminoMarket;
    payer: TransactionSigner;
    reserve: KaminoReserve;
    referrer: Address;
  }): Promise<InstructionBundle> {
    const bundle = KaminoAction.emptyInstructionBundle();
    if (referrer === DEFAULT_PUBLIC_KEY) {
      return bundle;
    }

    const referrerTokenState = await referrerTokenStatePda(referrer, reserve.address, kaminoMarket.programId);
    const referrerTokenStateAccount = await fetchEncodedAccount(kaminoMarket.getRpc(), referrerTokenState);
    if (referrerTokenStateAccount.exists) {
      return bundle;
    }

    bundle.ixs.push(
      initReferrerTokenState(
        {
          lendingMarket: kaminoMarket.getAddress(),
          payer,
          reserve: reserve.address,
          referrer,
          referrerTokenState,
          rent: SYSVAR_RENT_ADDRESS,
          systemProgram: SYSTEM_PROGRAM_ADDRESS,
        },
        undefined,
        kaminoMarket.programId
      )
    );
    bundle.labels.push('initReferrerTokenState');
    return bundle;
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

    if (
      (action === 'withdraw' || action === 'withdrawAndEnqueue' || action === 'borrow' || action === 'redeem') &&
      this.mint !== WRAPPED_SOL_MINT
    ) {
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
    if (action === 'mint' || action === 'withdrawAndEnqueue') {
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
        this.currentLedgerInstant,
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

    const isValidTokenAccount =
      userWSOLAccountInfo.exists &&
      (userWSOLAccountInfo.programAddress === TOKEN_PROGRAM_ADDRESS ||
        userWSOLAccountInfo.programAddress === TOKEN_2022_PROGRAM_ADDRESS);

    const transferLamportsIx = getTransferSolInstruction({
      amount: (isValidTokenAccount ? 0n : rentExemptLamports) + (sendAction ? BigInt(safeRepay.toString()) : 0n),
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

    this.setupIxs.unshift(...preIxs);
    this.setupIxsLabels.unshift(...preIxsLabels);
    this.cleanupIxs.push(...postIxs);
    this.cleanupIxsLabels.push(...postIxsLabels);
  }

  static async initializeMultiTokenAction(
    kaminoMarket: KaminoMarket,
    action: ActionType,
    inflowAmount: string | BN,
    inflowReserveAddress: Address,
    outflowReserveAddress: Address,
    signer: TransactionSigner,
    obligationOwner: Address,
    obligation: KaminoObligation | ObligationType,
    outflowAmount: string | BN | undefined,
    referrer: Option<Address>,
    currentLedgerInstant: LedgerInstant,
    permissionAuthority?: TransactionSigner
  ) {
    const inflowReserve = kaminoMarket.getExistingReserveByAddress(inflowReserveAddress);
    const outflowReserve = kaminoMarket.getExistingReserveByAddress(outflowReserveAddress);

    const { kaminoObligation, depositReserves, borrowReserves, distinctReserveCount } =
      await KaminoAction.loadObligation(
        action,
        kaminoMarket,
        obligationOwner,
        inflowReserve.address,
        obligation,
        outflowReserve.address,
        currentLedgerInstant
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
      primaryMint = inflowReserve.getLiquidityMint();
      secondaryMint = outflowReserve.getLiquidityMint();
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
      currentLedgerInstant,
      secondaryMint,
      outflowReserve,
      outflowAmount,
      referrerKey,
      undefined,
      permissionAuthority
    );
  }

  static async initializeWithdrawReferrerFees(
    reserveAddress: Address,
    owner: TransactionSigner,
    kaminoMarket: KaminoMarket,
    currentLedgerInstant: LedgerInstant
  ) {
    const reserve = kaminoMarket.getReserveByAddress(reserveAddress);
    if (reserve === undefined) {
      throw new Error(`Reserve ${reserveAddress} not found in market ${kaminoMarket.getAddress()}`);
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
        reserve.getLiquidityMint(),
        0,
        new BN(0),
        [],
        [],
        reserve,
        currentLedgerInstant,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined
      ),
      createAtaIxs: [createAtaIx],
    };
  }

  /**
   * Converts a liquidity `amount` to withdraw from `reserve` into the cToken amount the withdraw instruction takes,
   * at the reserve's exchange rate estimated at this action's {@link currentLedgerInstant}.
   */
  getWithdrawCollateralAmount(reserve: KaminoReserve, amount: BN): BN {
    const collateralExchangeRate = reserve.getEstimatedCollateralExchangeRate(
      this.currentLedgerInstant,
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
    ixs.push(...action.postLendingIxs);
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
    labels.push(...action.postLendingIxsLabels);
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
    reserve: KaminoReserve,
    farmsProgramId?: Address
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
        obligationFarmUserState: some(
          await obligationFarmStatePda(collateralFarmAddress.value, obligationAddress, farmsProgramId)
        ),
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
        obligationFarmUserState: some(
          await obligationFarmStatePda(debtFarmAddress.value, obligationAddress, farmsProgramId)
        ),
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

/**
 * Result of {@link KaminoAction.buildDepositAndFillBorrowOrderTxns}.
 */
export interface DepositAndFillBorrowOrderResult {
  /**
   * Setup instructions that must be sent before `action` when non-empty. These create accounts that are safe to
   * initialize before the main deposit/fill transaction, such as lender user metadata, the lender obligation,
   * lender collateral farm state, borrower debt farm state, or referrer token state.
   */
  preFillSetupIxs: Instruction[];
  /**
   * Labels for `preFillSetupIxs`.
   */
  preFillSetupIxsLabels: string[];
  /**
   * Lookup table addresses created by `preFillSetupIxs`.
   */
  preFillSetupLuts: Address[];
  /**
   * The composed main action: the lender deposit, reserve refreshes, borrower-obligation refresh, and fill. Send
   * `preFillSetupIxs` first when they are non-empty.
   */
  action: KaminoAction;
  /**
   * The reserve selected for the fill: among the order's debt-mint reserves that can fill it on-chain (a
   * fixed-term order excludes open-term float reserves), the lender-favorable one - highest peak borrow rate,
   * tie-broken by shortest remaining term.
   */
  fillReserve: KaminoReserve;
  /**
   * The liquidity amount the lender deposits: the `amount` prop when provided, otherwise exactly enough to fully
   * fill the order (its remaining debt plus the borrow origination/referrer fees).
   */
  depositedAmount: BN;
}

/**
 * Applies `obligationCustomizations` to an in-progress `KaminoAction`. Adds reserves that will be present at execution
 * time but missing from the obligation snapshot, and removes reserves that will be gone before the action runs.
 */
function applyObligationCustomizations(axn: KaminoAction, customizations: ObligationCustomizations | undefined): void {
  if (!customizations) {
    return;
  }
  axn.depositReserves.push(...(customizations.addedDepositReserves ?? []));
  axn.borrowReserves.push(...(customizations.addedBorrowReserves ?? []));
  const removedBorrowSet = new Set<Address>(customizations.removedBorrowReserves ?? []);
  const removedDepositSet = new Set<Address>(customizations.removedDepositReserves ?? []);
  axn.borrowReserves = axn.borrowReserves.filter((r) => !removedBorrowSet.has(r));
  axn.depositReserves = axn.depositReserves.filter((r) => !removedDepositSet.has(r));
}
