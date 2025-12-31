import { Address, Option, Slot, TransactionSigner } from '@solana/kit';
import BN from 'bn.js';
import { ObligationType, ScopePriceRefreshConfig } from '../utils';
import { KaminoObligation } from './obligation';
import { KaminoMarket } from './market';
import { ActionType } from './action';

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
  currentSlot?: Slot;
  payer?: TransactionSigner;
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
  currentSlot?: Slot;
  overrideElevationGroupRequest?: number;
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
  currentSlot?: Slot;
  overrideElevationGroupRequest?: number;
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
  currentSlot?: Slot;
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
  currentSlot?: Slot;
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
  currentSlot?: Slot;
  overrideElevationGroupRequest?: number;
  obligationCustomizations?: {
    addedDepositReserves?: Address[];
  };
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
  initUserMetadata?: { skipInitialization: boolean; skipLutCreation: boolean };
  referrer?: Option<Address>;
  currentSlot?: Slot;
}

/**
 * Props for KaminoAction.buildRefreshObligationTxns
 */
export interface BuildRefreshObligationTxnsProps {
  kaminoMarket: KaminoMarket;
  payer: TransactionSigner;
  obligation: KaminoObligation;
  extraComputeBudget?: number;
  currentSlot?: Slot;
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
  currentSlot?: Slot;
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
  currentSlot?: Slot;
}

/**
 * Props for KaminoAction.buildWithdrawReferrerFeeTxns
 */
export interface BuildWithdrawReferrerFeeTxnsProps {
  owner: TransactionSigner;
  reserveAddress: Address;
  kaminoMarket: KaminoMarket;
  currentSlot?: Slot;
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
  currentSlot?: Slot;
}

/**
 * Props for KaminoAction.initializeMultiTokenAction
 */
export interface InitializeMultiTokenActionProps {
  kaminoMarket: KaminoMarket;
  action: ActionType;
  inflowAmount: string | BN;
  inflowReserveAddress: Address;
  outflowReserveAddress: Address;
  signer: TransactionSigner;
  obligationOwner: Address;
  obligation: KaminoObligation | ObligationType;
  outflowAmount?: string | BN;
  referrer?: Option<Address>;
  currentSlot?: Slot;
}
