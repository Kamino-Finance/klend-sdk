import { Address, Option, Slot, TransactionSigner } from '@solana/kit';
import BN from 'bn.js';
import { ObligationType, ScopePriceRefreshConfig } from '../utils';
import { KaminoObligation } from './obligation';
import { KaminoMarket } from './market';
import { KaminoReserve } from './reserve';
import { ActionType } from './action';
import { KaminoBorrowOrder } from './borrowOrder';
import { ProgressCallbackType } from '../@codegen/klend/types';

/**
 * Optional adjustments to the obligation snapshot that `KaminoAction` is built against.
 * Use when the obligation will be mutated by another instruction in the same transaction so that the action's internal
 * `refresh_obligation` / `refresh_reserve` accounts reflect the state at the time those instructions actually execute.
 */
export interface ObligationCustomizations {
  /** Reserves that will be deposit-side at execution time but are not in the obligation snapshot. */
  addedDepositReserves?: Address[];
  /** Reserves that will be borrow-side at execution time but are not in the obligation snapshot. */
  addedBorrowReserves?: Address[];
  /** Reserves that were borrow-side in the obligation snapshot but will be fully repaid by an earlier ix. */
  removedBorrowReserves?: Address[];
  /** Reserves that were deposit-side in the obligation snapshot but will be fully withdrawn by an earlier ix. */
  removedDepositReserves?: Address[];
}

/**
 * Props for KaminoAction.initialize
 */
export interface InitializeActionProps {
  kaminoMarket: KaminoMarket;
  action: ActionType;
  amount: string | BN;
  reserveAddress: Address;
  owner: TransactionSigner;
  obligation: KaminoObligation | ObligationType;
  referrer?: Option<Address>;
  currentSlot: Slot;
  payer?: TransactionSigner;
  permissionAuthority?: TransactionSigner;
}

/**
 * Props for KaminoAction.buildDepositTxns
 */
export interface BuildDepositTxnsProps {
  kaminoMarket: KaminoMarket;
  amount: string | BN;
  reserveAddress: Address;
  owner: TransactionSigner;
  obligation: KaminoObligation | ObligationType;
  useV2Ixs: boolean;
  scopeRefreshConfig: ScopePriceRefreshConfig | undefined;
  extraComputeBudget?: number;
  includeAtaIxs?: boolean;
  requestElevationGroup?: boolean;
  initUserMetadata?: { skipInitialization: boolean; skipLutCreation: boolean };
  referrer?: Option<Address>;
  currentSlot: Slot;
  overrideElevationGroupRequest?: number;
  permissionAuthority?: TransactionSigner;
  obligationCustomizations?: ObligationCustomizations;
}

/**
 * Props for KaminoAction.buildBorrowTxns
 */
export interface BuildBorrowTxnsProps {
  kaminoMarket: KaminoMarket;
  amount: string | BN;
  reserveAddress: Address;
  owner: TransactionSigner;
  obligation: KaminoObligation | ObligationType;
  useV2Ixs: boolean;
  scopeRefreshConfig: ScopePriceRefreshConfig | undefined;
  extraComputeBudget?: number;
  includeAtaIxs?: boolean;
  requestElevationGroup?: boolean;
  initUserMetadata?: { skipInitialization: boolean; skipLutCreation: boolean };
  referrer?: Option<Address>;
  currentSlot: Slot;
  overrideElevationGroupRequest?: number;
  rollOver?: boolean;
  permissionAuthority?: TransactionSigner;
  obligationCustomizations?: ObligationCustomizations;
}

/**
 * Props for KaminoAction.buildBorrowRolloverConfigIxs
 */
export interface BuildBorrowRolloverConfigIxsProps {
  reserve: KaminoReserve;
  rollover: boolean;
  /**
   * Whether a fixed-term borrow may roll over into an open-term (variable-rate) reserve (`fixedToOpen`).
   * Required and independent of {@link rollover} (which toggles fixed-to-fixed auto-rollover): the caller must
   * decide explicitly. Fixed-rate flows pass `false` today; the knob exists for future open-term rollover support.
   */
  openTermAllowed: boolean;
  /**
   * Optional per-borrow override of the market's fixed-term rollover window, in whole days; `0` (or omitted)
   * leaves the market's own window in force. Only customizes the window's duration — it can neither enable nor
   * disable rollover — and the program rejects a non-zero value on a borrow that accepts open-term targets only
   * (i.e. whose min debt term is zero).
   */
  fixedTermRolloverWindowDurationDays?: number;
  owner: TransactionSigner;
  obligation: Address;
  lendingMarket: Address;
  programId: Address;
}

/**
 * Props for KaminoAction.buildDepositReserveLiquidityTxns
 */
export interface BuildDepositReserveLiquidityTxnsProps {
  kaminoMarket: KaminoMarket;
  amount: string | BN;
  reserveAddress: Address;
  owner: TransactionSigner;
  obligation: KaminoObligation | ObligationType;
  scopeRefreshConfig: ScopePriceRefreshConfig | undefined;
  extraComputeBudget?: number;
  includeAtaIxs?: boolean;
  requestElevationGroup?: boolean;
  referrer?: Option<Address>;
  currentSlot: Slot;
  permissionAuthority?: TransactionSigner;
}

/**
 * Props for KaminoAction.buildRedeemReserveCollateralTxns
 */
export interface BuildRedeemReserveCollateralTxnsProps {
  kaminoMarket: KaminoMarket;
  amount: string | BN;
  reserveAddress: Address;
  owner: TransactionSigner;
  obligation: KaminoObligation | ObligationType;
  scopeRefreshConfig: ScopePriceRefreshConfig | undefined;
  extraComputeBudget?: number;
  includeAtaIxs?: boolean;
  requestElevationGroup?: boolean;
  referrer?: Option<Address>;
  currentSlot: Slot;
}

/**
 * Props for KaminoAction.buildWithdrawTxns
 */
export interface BuildWithdrawTxnsProps {
  kaminoMarket: KaminoMarket;
  amount: string | BN;
  reserveAddress: Address;
  owner: TransactionSigner;
  obligation: KaminoObligation | ObligationType;
  useV2Ixs: boolean;
  scopeRefreshConfig: ScopePriceRefreshConfig | undefined;
  extraComputeBudget?: number;
  includeAtaIxs?: boolean;
  requestElevationGroup?: boolean;
  initUserMetadata?: { skipInitialization: boolean; skipLutCreation: boolean };
  referrer?: Option<Address>;
  currentSlot: Slot;
  overrideElevationGroupRequest?: number;
  obligationCustomizations?: ObligationCustomizations;
}

/**
 * Props for KaminoAction.buildWithdrawFromObligationAndEnqueueTxns
 */
export interface BuildWithdrawFromObligationAndEnqueueTxnsProps {
  kaminoMarket: KaminoMarket;
  /** Amount of liquidity to withdraw (in base units). */
  withdrawAmount: string | BN;
  reserveAddress: Address;
  owner: TransactionSigner;
  obligation: KaminoObligation | ObligationType;
  scopeRefreshConfig: ScopePriceRefreshConfig | undefined;
  extraComputeBudget?: number;
  includeAtaIxs?: boolean;
  requestElevationGroup?: boolean;
  initUserMetadata?: { skipInitialization: boolean; skipLutCreation: boolean };
  referrer?: Option<Address>;
  currentSlot: Slot;
  userDestinationLiquidityAta?: Address;
  progressCallbackType?: ProgressCallbackType.None | ProgressCallbackType.KlendQueueAccountingHandlerOnKvault;
  progressCallbackCustomAccount0?: Option<Address>;
  progressCallbackCustomAccount1?: Option<Address>;
}

/**
 * Props for KaminoAction.buildRepayTxns
 */
export interface BuildRepayTxnsProps {
  kaminoMarket: KaminoMarket;
  amount: string | BN;
  reserveAddress: Address;
  owner: TransactionSigner;
  obligation: KaminoObligation | ObligationType;
  useV2Ixs: boolean;
  scopeRefreshConfig: ScopePriceRefreshConfig | undefined;
  currentSlot: Slot;
  extraComputeBudget?: number;
  includeAtaIxs?: boolean;
  requestElevationGroup?: boolean;
  payer?: TransactionSigner;
  initUserMetadata?: { skipInitialization: boolean; skipLutCreation: boolean };
  referrer?: Option<Address>;
}

/**
 * Props for KaminoAction.buildDepositAndBorrowTxns
 */
export interface BuildDepositAndBorrowTxnsProps {
  kaminoMarket: KaminoMarket;
  depositAmount: string | BN;
  depositReserveAddress: Address;
  borrowAmount: string | BN;
  borrowReserveAddress: Address;
  owner: TransactionSigner;
  obligation: KaminoObligation | ObligationType;
  useV2Ixs: boolean;
  scopeRefreshConfig: ScopePriceRefreshConfig | undefined;
  extraComputeBudget?: number;
  includeAtaIxs?: boolean;
  requestElevationGroup?: boolean;
  /**
   * Elevation group to request explicitly during the deposit+borrow. When omitted (and `requestElevationGroup` is
   * true) the action auto-selects the highest-LTV common group for the (collateral, debt) pair. When provided, that
   * exact group is requested instead.
   */
  overrideElevationGroupRequest?: number;
  initUserMetadata?: { skipInitialization: boolean; skipLutCreation: boolean };
  referrer?: Option<Address>;
  currentSlot: Slot;
  rollOver?: boolean;
  permissionAuthority?: TransactionSigner;
}

/**
 * Props for KaminoAction.buildRefreshObligationTxns
 */
export interface BuildRefreshObligationTxnsProps {
  kaminoMarket: KaminoMarket;
  payer: TransactionSigner;
  obligation: KaminoObligation;
  extraComputeBudget?: number;
  currentSlot: Slot;
}

/**
 * Props for KaminoAction.buildRequestElevationGroupTxns
 */
export interface BuildRequestElevationGroupTxnsProps {
  kaminoMarket: KaminoMarket;
  owner: TransactionSigner;
  obligation: KaminoObligation;
  elevationGroup: number;
  extraComputeBudget?: number;
  currentSlot: Slot;
}

/**
 * Props for KaminoAction.buildDepositAndWithdrawV2Txns
 */
export interface BuildDepositAndWithdrawV2TxnsProps {
  kaminoMarket: KaminoMarket;
  depositAmount: string | BN;
  depositReserveAddress: Address;
  withdrawAmount: string | BN;
  withdrawReserveAddress: Address;
  owner: TransactionSigner;
  currentSlot: Slot;
  obligation: KaminoObligation | ObligationType;
  scopeRefreshConfig: ScopePriceRefreshConfig | undefined;
  extraComputeBudget?: number;
  includeAtaIxs?: boolean;
  requestElevationGroup?: boolean;
  initUserMetadata?: { skipInitialization: boolean; skipLutCreation: boolean };
  referrer?: Option<Address>;
  permissionAuthority?: TransactionSigner;
}

/**
 * Props for KaminoAction.buildRepayAndWithdrawTxns
 */
export interface BuildRepayAndWithdrawTxnsProps {
  kaminoMarket: KaminoMarket;
  repayAmount: string | BN;
  repayReserveAddress: Address;
  withdrawAmount: string | BN;
  withdrawReserveAddress: Address;
  payer: TransactionSigner;
  currentSlot: Slot;
  obligation: KaminoObligation | ObligationType;
  useV2Ixs: boolean;
  scopeRefreshConfig: ScopePriceRefreshConfig | undefined;
  extraComputeBudget?: number;
  includeAtaIxs?: boolean;
  requestElevationGroup?: boolean;
  initUserMetadata?: { skipInitialization: boolean; skipLutCreation: boolean };
  referrer?: Option<Address>;
}

/**
 * Props for KaminoAction.buildRepayAndWithdrawV2Txns
 */
export interface BuildRepayAndWithdrawV2TxnsProps {
  kaminoMarket: KaminoMarket;
  repayAmount: string | BN;
  repayReserveAddress: Address;
  withdrawAmount: string | BN;
  withdrawReserveAddress: Address;
  payer: TransactionSigner;
  currentSlot: Slot;
  obligation: KaminoObligation | ObligationType;
  scopeRefreshConfig: ScopePriceRefreshConfig | undefined;
  extraComputeBudget?: number;
  includeAtaIxs?: boolean;
  requestElevationGroup?: boolean;
  initUserMetadata?: { skipInitialization: boolean; skipLutCreation: boolean };
  referrer?: Option<Address>;
}

/**
 * Props for KaminoAction.buildLiquidateTxns
 */
export interface BuildLiquidateTxnsProps {
  kaminoMarket: KaminoMarket;
  amount: string | BN;
  minCollateralReceiveAmount: string | BN;
  repayReserveAddress: Address;
  withdrawReserveAddress: Address;
  liquidator: TransactionSigner;
  obligationOwner: Address;
  obligation: KaminoObligation | ObligationType;
  useV2Ixs: boolean;
  scopeRefreshConfig?: ScopePriceRefreshConfig;
  extraComputeBudget?: number;
  includeAtaIxs?: boolean;
  requestElevationGroup?: boolean;
  initUserMetadata?: { skipInitialization: boolean; skipLutCreation: boolean };
  referrer?: Option<Address>;
  maxAllowedLtvOverridePercent?: number;
  currentSlot: Slot;
  permissionAuthority?: TransactionSigner;
}

/**
 * Props for KaminoAction.buildWithdrawReferrerFeeTxns
 */
export interface BuildWithdrawReferrerFeeTxnsProps {
  owner: TransactionSigner;
  reserveAddress: Address;
  kaminoMarket: KaminoMarket;
  currentSlot: Slot;
}

/**
 * Props for KaminoAction.buildDepositObligationCollateralTxns
 */
export interface BuildDepositObligationCollateralTxnsProps {
  kaminoMarket: KaminoMarket;
  amount: string | BN;
  reserveAddress: Address;
  owner: TransactionSigner;
  obligation: KaminoObligation | ObligationType;
  useV2Ixs: boolean;
  scopeRefreshConfig: ScopePriceRefreshConfig | undefined;
  extraComputeBudget?: number;
  includeAtaIxs?: boolean;
  requestElevationGroup?: boolean;
  initUserMetadata?: { skipInitialization: boolean; skipLutCreation: boolean };
  referrer?: Option<Address>;
  currentSlot: Slot;
  permissionAuthority?: TransactionSigner;
}

/**
 * Props for KaminoAction.buildEnqueueToWithdrawIx
 */
export interface BuildEnqueueToWithdrawIxProps {
  owner: TransactionSigner;
  kaminoMarket: KaminoMarket;
  reserve: KaminoReserve;
  collateralAmount: BN;
  userDestinationLiquidityTa: Address;
  progressCallbackType?: ProgressCallbackType.None | ProgressCallbackType.KlendQueueAccountingHandlerOnKvault;
  progressCallbackCustomAccount0?: Option<Address>;
  progressCallbackCustomAccount1?: Option<Address>;
}

/**
 * Props for KaminoAction.buildWithdrawQueuedLiquidityIx
 */
export interface BuildWithdrawQueuedLiquidityIxProps {
  payer: TransactionSigner;
  kaminoMarket: KaminoMarket;
  reserve: KaminoReserve;
  withdrawTicket: Address;
  withdrawTicketOwner: Address;
  userDestinationLiquidity: Address;
  progressCallbackProgram?: Option<Address>;
  progressCallbackCustomAccount0?: Option<Address>;
  progressCallbackCustomAccount1?: Option<Address>;
}

/**
 * Props for KaminoAction.buildDepositAndSetBorrowOrderTxns
 */
export interface BuildDepositAndSetBorrowOrderTxnsProps {
  kaminoMarket: KaminoMarket;
  amount: string | BN;
  reserveAddress: Address;
  owner: TransactionSigner;
  obligation: KaminoObligation | ObligationType;
  borrowOrder: KaminoBorrowOrder;
  /** Which of the obligation's borrow orders to write. */
  orderIdx: number;
  useV2Ixs: boolean;
  scopeRefreshConfig: ScopePriceRefreshConfig | undefined;
  minExpectedCurrentRemainingDebtAmount?: BN;
  extraComputeBudget?: number;
  includeAtaIxs?: boolean;
  requestElevationGroup?: boolean;
  initUserMetadata?: { skipInitialization: boolean; skipLutCreation: boolean };
  referrer?: Option<Address>;
  currentSlot: Slot;
  overrideElevationGroupRequest?: number;
  permissionAuthority?: TransactionSigner;
}

/**
 * Props for KaminoAction.buildDepositAndFillBorrowOrderTxns: a lender deposits liquidity into a lender obligation
 * for the reserve matching a borrower's borrow order, then fills that order.
 */
export interface BuildDepositAndFillBorrowOrderTxnsProps {
  kaminoMarket: KaminoMarket;
  /** The lender: pays for, supplies the liquidity to, and signs the fill. */
  lender: TransactionSigner;
  /** The borrower's obligation holding the borrow orders, the {@link orderIdx}-th of which is filled. */
  borrowerObligation: KaminoObligation;
  /**
   * Optional. The liquidity amount the lender deposits. Omit to deposit exactly enough to fully fill the order
   * (its remaining debt plus the borrow origination fee). A smaller amount may partially fill the order - the
   * program borrows at most the order's remaining amount, bounded by available liquidity, so it fills by roughly
   * the deposit minus the inclusive origination fee when this deposit is the reserve's binding liquidity. A
   * partial fill is only accepted on-chain if it satisfies the order's min-fill and min-remainder constraints:
   * the filled value must be at least the market's min_borrow_order_fill_value, and the leftover remaining order
   * value must not become dust - otherwise the fill is rejected (BorrowOrderFillValueTooSmall /
   * BorrowOrderValueTooSmall). An amount at or above the full-fill amount fully fills the order, with any excess
   * simply remaining as the lender's deposited liquidity.
   */
  amount?: string | BN;
  /**
   * Optional. Which of the borrower's borrow-order slots to fill. Only needed when the borrower has several
   * orders open at once; when omitted, their single fillable order is filled.
   */
  orderIdx?: number;
  /**
   * Optional. The lender's obligation that receives the deposited collateral. Defaults to the lender's vanilla
   * obligation, creating it if needed.
   */
  lenderObligation?: KaminoObligation | ObligationType;
  /** Whether to use the v2 deposit-to-obligation instruction. Defaults to true when omitted. */
  useV2Ixs?: boolean;
  scopeRefreshConfig?: ScopePriceRefreshConfig | undefined;
  extraComputeBudget?: number;
  includeAtaIxs?: boolean;
  referrer?: Option<Address>;
  currentSlot: Slot;
  /** Current unix time in seconds, used to resolve {@link orderIdx} when it is omitted. */
  currentTimestamp: number;
}

/**
 * Props for KaminoAction.buildRolloverFixedTermBorrowTxns
 */
export interface BuildRolloverFixedTermBorrowTxnsProps {
  kaminoMarket: KaminoMarket;
  /** The obligation holding the borrow to roll over. */
  obligation: KaminoObligation;
  /** Reserve of the existing borrow being rolled over (the source). */
  sourceReserveAddress: Address;
  /**
   * Reserve to roll the borrow into (the target). It may be a fixed-term or a variable/open-term reserve.
   * The program enforces several preconditions on it at execution time - see
   * {@link KaminoAction.buildRolloverFixedTermBorrowTxns}.
   */
  targetReserveAddress: Address;
  /**
   * The transaction's signer (and fee payer). The program requires exactly one signer but not
   * specifically the obligation owner, so this may be the owner themselves or any crank/keeper.
   */
  payer: TransactionSigner;
  /**
   * Optional Scope price-refresh config. Required for markets/reserves priced by Scope oracles: the reserve
   * refreshes in this flow read the Scope price feed, which must be refreshed earlier in the same transaction.
   * When provided, the builder prepends the necessary Scope refresh(es) covering the source, target, and the
   * obligation's reserves.
   */
  scopeRefreshConfig?: ScopePriceRefreshConfig;
  extraComputeBudget?: number;
  currentSlot: Slot;
}
