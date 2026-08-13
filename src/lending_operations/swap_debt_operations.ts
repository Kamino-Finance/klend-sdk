import {
  ElevationGroupDescription,
  KaminoAction,
  KaminoMarket,
  KaminoObligation,
  KaminoReserve,
  ObligationStats,
  Position,
  FixedTermReorigination,
} from '../classes';
import { calcFlashLoanFees } from './repay_with_collateral_calcs';
import { FlashLoanInfo, getFlashLoanInstructions, SwapIxsProvider, SwapQuoteProvider } from '../leverage';
import { determineSwapDebtFlashBorrowType } from './swap_flash_borrow_selection';
import { Obligation } from '../@codegen/klend/accounts';
import {
  ACCOUNT_DISCOVERY_QUOTER,
  ACCOUNT_DISCOVERY_SWAPPER,
  createAtasIdempotent,
  DEFAULT_MAX_COMPUTE_UNITS,
  getAssociatedTokenAddress,
  getComputeBudgetAndPriorityFeeIxs,
  getObligationType,
  KlendAccountsResult,
  ObligationType,
  removeBudgetIxs,
  toKlendAccountsResult,
  U64_MAX,
  uniqueAccountsWithProgramIds,
  WRAPPED_SOL_MINT,
} from '../utils';
// ObligationTypeTag is imported from the leaf module, not the '../utils' barrel: the
// DEBT_SEEDED_OBLIGATION_TAGS / FIXED_RATE_OBLIGATION_TAGS Sets below read it at module-eval
// time, and the barrel's live re-export is `undefined` during circular init
// (utils ⇄ lending_operations). ObligationType.ts only imports kit + pubkey, so it is always
// fully evaluated by the time this module's top level runs.
import { ObligationTypeTag } from '../utils/ObligationType';
import { assertPositiveFiniteDecimal, getSlippageFactor } from './swap_calcs';
import { Account, Address, Instruction, isSome, none, Option, some, TransactionSigner } from '@solana/kit';
import Decimal from 'decimal.js';
import { TOKEN_PROGRAM_ADDRESS } from '@solana-program/token';
import { AddressLookupTable } from '@solana-program/address-lookup-table';
import { getCloseAccountInstruction } from '@solana-program/token-2022';
import { bufferWithdrawForRedeemDrift, haircutPullForRedeemDrift, redeemWithdrawAmount } from './redeem_drift';
import { resolveSourceDebtEarlyRepayPenaltyLamports, resolveSourceDebtRepayLamports } from './swap_debt_sizing';
import {
  DistributiveOmit,
  LedgerInstant,
  LedgerInstantCompatible,
  requireMatchingLedgerInstant,
  resolveLedgerInput,
} from '../utils/ledger';
import { Slot } from '@solana/kit';

export { resolveSourceDebtEarlyRepayPenaltyLamports, resolveSourceDebtRepayLamports } from './swap_debt_sizing';

/**
 * Which debt token to flash borrow for a swap-debt operation.
 *
 * - `targetDebt`: flash borrow target debt → swap target → source → repay source → borrow target → flash repay.
 * - `sourceDebt`: flash borrow source debt → repay source → borrow target → swap target → source → flash repay.
 *
 * When omitted on the inputs, a liquidity-aware default is chosen (see `getSwapDebtIxs`): the side
 * that can serve the flash loan is preferred (target debt when both are viable), so a thin/fixed-rate
 * debt reserve is avoided whenever the other side has enough liquidity.
 */
export type SwapDebtFlashBorrowToken = 'sourceDebt' | 'targetDebt';

export interface SwapDebtIxsInputs<QuoteResponse> {
  /**
   * Amount of source debt to be reduced (i.e. replaced with target debt), in source-debt token units.
   * The obligation's source debt will be repaid by this amount.
   */
  sourceDebtSwapAmount: Decimal;

  /**
   * If true, the full outstanding source debt will be repaid (regardless of `sourceDebtSwapAmount`).
   */
  isClosingSourceDebt: boolean;

  sourceDebtReserveAddress: Address;
  targetDebtReserveAddress: Address;

  /**
   * Which debt side to flash borrow. When omitted, a liquidity-aware default is used (see
   * `getSwapDebtIxs`): the viable side is chosen, preferring `targetDebt` when both are viable.
   */
  flashBorrowToken?: SwapDebtFlashBorrowToken;

  /**
   * Elevation group the obligation should end up with after the swap.
   *
   * Leave `undefined` to use the default selection: an in-place vanilla/lending swap keeps the obligation's current
   * group, and a Multiply/Leverage migration into a NEW target obligation auto-selects the highest-LTV common
   * elevation group for the (collateral, new debt) pair (or none). Pass a number — including `0` (no emode) — to
   * request exactly that group.
   *
   * NOTE: for a Multiply/Leverage migration that grows an ALREADY-EXISTING target obligation, the target's
   * elevation group is never changed; passing a group that differs from its current one is rejected rather than
   * silently ignored.
   */
  newElevationGroup?: number;

  market: KaminoMarket;
  owner: TransactionSigner;
  obligation: KaminoObligation;
  referrer: Option<Address>;
  currentSlot: Slot;
  currentLedgerInstant?: LedgerInstant;
  /**
   * Slippage percentage for the external swap (e.g. 0.5 for 0.5%). Used to size the flash loan above the strict
   * minimum so that the swap does not fail.
   */
  slippagePct: Decimal;
  budgetAndPriorityFeeIxs?: Instruction[];
  scopeRefreshIx: Instruction[];
  useV2Ixs: boolean;
  quoter: SwapQuoteProvider<QuoteResponse>;
  swapper: SwapIxsProvider<QuoteResponse>;
  logger?: (msg: string, ...extra: unknown[]) => void;
}

export type SwapDebtIxsParams<QuoteResponse> = LedgerInstantCompatible<SwapDebtIxsInputs<QuoteResponse>>;

/**
 * One built route returned by {@link getSwapDebtIxs}. `getSwapDebtIxs` returns an array of these — one per route the
 * `swapper` produced — and does NOT pre-validate them against the downstream repay/flash-repay amount (see the
 * `getSwapDebtIxs` doc). The caller picks a route via its own simulation/filtering.
 */
export interface SwapDebtIxsOutputs<QuoteResponse> {
  ixs: Instruction[];
  lookupTables: Account<AddressLookupTable>[];
  useV2Ixs: boolean;
  simulationDetails: {
    flashLoan: {
      flashBorrowReserveMint: Address;
      flashBorrowedAmount: Decimal;
      flashRepaidAmount: Decimal;
    };
    externalSwap: {
      swapInMint: Address;
      swapOutMint: Address;
      swapInAmount: Decimal;
      swapOutAmount: Decimal;
      quoteResponse?: QuoteResponse;
    };
    /**
     * For a debt-seeded obligation (Multiply or Leverage) migrated by swap-debt, the address of the target
     * obligation the position is moved into — the same obligation type, seeded with the new debt. It may be a
     * brand-new obligation or a pre-existing one being grown by a partial swap. Undefined for the in-place
     * vanilla/lending swap flows.
     */
    newObligationAddress?: Address;
    /**
     * For a Multiply/Leverage migration, the collateral amount (in target/collateral token units, not lamports)
     * moved from the old obligation into the target. Equals the whole collateral for a full swap, or the
     * proportional slice for a partial swap. Undefined for the in-place vanilla/lending swap flows.
     */
    migratedCollateralAmount?: Decimal;
    /**
     * For a Multiply/Leverage migration, the old debt amount (in source-debt token units, not lamports) repaid on
     * the old obligation. Equals the full outstanding (plus interest buffer) for a full swap, or `sourceDebtSwapAmount`
     * for a partial swap. Undefined for the in-place vanilla/lending swap flows.
     */
    repaidOldDebtAmount?: Decimal;
    /**
     * Early-repay penalty (in source-debt lamports) charged on-chain when the SOURCE debt being repaid is a fixed-term
     * reserve repaid before maturity (additive to the repay). 0 / undefined for open-term source debt.
     */
    earlyRepayPenaltyLamports?: Decimal;
    /**
     * When the TARGET debt is a fixed-rate reserve, the terms the new debt is originated with (fresh term/maturity/rate;
     * rollover is reset). Undefined when the target debt is variable/open-term.
     */
    reorigination?: FixedTermReorigination;
  };
}

/**
 * Constructs instructions needed to partially/fully swap the given source debt for some other debt.
 *
 * Route contract — IMPORTANT for callers: this returns ONE built `SwapDebtIxsOutputs` per route the `swapper`
 * returns, in the swapper's order, with a complete transaction assembled around each. The routes are NOT
 * pre-validated against the downstream repay / flash-repay requirement: the SDK does not drop or re-order routes by
 * predicted output (the swapper may legitimately return constrained routes alongside its best one). Each route's
 * own swap instruction carries a `min_out`, and the downstream repay/flash-repay reverts on-chain if a route
 * under-delivers — that is the enforcement layer. Callers are expected to choose between the returned routes by
 * running their own simulation/filtering (e.g. simulate each and pick the first that lands, or rank by simulated
 * output) rather than assuming `result[0]` is viable.
 */
export async function getSwapDebtIxs<QuoteResponse>(
  rawInputs: SwapDebtIxsParams<QuoteResponse>
): Promise<Array<SwapDebtIxsOutputs<QuoteResponse>>> {
  // Validate before the compatibility path performs any RPC lookup.
  getSlippageFactor(rawInputs.slippagePct);
  const sourceDebtReserve = rawInputs.market.getExistingReserveByAddress(rawInputs.sourceDebtReserveAddress);
  const targetDebtReserve = rawInputs.market.getExistingReserveByAddress(rawInputs.targetDebtReserveAddress);
  const ledger = await resolveLedgerInput(
    rawInputs.market.getRpc(),
    rawInputs.currentSlot,
    rawInputs.currentLedgerInstant,
    sourceDebtReserve.getKind().isFixedRate() || !targetDebtReserve.state.config.debtMaturityTimestamp.eqn(0),
    'getSwapDebtIxs'
  );
  const normalizedInputs = { ...rawInputs, ...ledger };
  const tag = normalizedInputs.obligation.obligationTag;

  // Liquidity-aware default for the flash-borrow side when the caller omits it: prefer the side
  // that can actually serve the flash loan (targetDebt when both are viable), so a thin/fixed-rate
  // debt reserve is avoided whenever the other side has enough liquidity.
  const inputs: SwapDebtIxsInputs<QuoteResponse> = normalizedInputs.flashBorrowToken
    ? normalizedInputs
    : {
        ...normalizedInputs,
        flashBorrowToken: resolveDefaultSwapDebtFlashBorrowToken(normalizedInputs),
      };

  // These obligation types bake the debt into the PDA seeds (variable Multiply/Leverage use the debt *mint*; their
  // fixed-rate variants tags 4/6 use the debt *reserve*), so the debt cannot change in place — the position must be
  // physically migrated into a new obligation *of the same type* (with the new debt). The in-place Flow A/B below
  // would derive a different PDA and fail (or worse, produce an inconsistent position), so never let these fall
  // through to it.
  if (DEBT_SEEDED_OBLIGATION_TAGS.has(tag)) {
    // Multiply/Leverage (variable tags 1/3 and fixed-rate tags 4/6). The position is migrated into an obligation of
    // the SAME type re-seeded with the new debt (`getObligationType` seeds 1/3 by mint and 4/6 by reserve address).
    // A full swap (isClosingSourceDebt=true) repays the whole old debt, withdraws all collateral and empties the old
    // obligation. A partial swap repays a portion of the old debt and moves a proportional slice of collateral,
    // leaving the old obligation alive (smaller) and growing/creating the target obligation. For fixed-rate variants
    // the old-debt repay is sized with the early-repay penalty and the new debt is originated fresh-term with rollover
    // reset (see `prepareMultiplySwap` / `getFixedTermReorigination`).
    return getSwapDebtForMultiply(inputs);
  }

  if (inputs.flashBorrowToken === 'targetDebt') {
    return getSwapDebtViaTargetDebt(inputs);
  }
  return getSwapDebtViaSourceDebt(inputs);
}

/**
 * Inputs for {@link getSwapDebtKlendAccounts}: the routing/sizing inputs of {@link getSwapDebtIxs} minus the
 * quoter/swapper (and logger), since the klend account footprint is discovered without an external swap.
 */
export type SwapDebtKlendAccountsInputs = DistributiveOmit<SwapDebtIxsParams<unknown>, 'quoter' | 'swapper' | 'logger'>;

/**
 * Light helper: returns the exact, final set of klend accounts (and program ids) a {@link getSwapDebtIxs} call with
 * the same inputs would consume, plus their count, WITHOUT calling the quoter/swapper. The operation computes this
 * same set from its klend ixs before quoting and the set is invariant to the swap amounts, so the count is accurate
 * and final — the FE can use it to know how many accounts remain for the external swap within the tx account limit.
 */
export async function getSwapDebtKlendAccounts(inputs: SwapDebtKlendAccountsInputs): Promise<KlendAccountsResult> {
  // Validate slippagePct early (throws on out-of-range) to match `getSwapDebtIxs`, so the light helper and the real
  // operation reject the same inputs even though the account set itself does not depend on slippage. Factor discarded.
  getSlippageFactor(inputs.slippagePct);
  const sourceDebtReserve = inputs.market.getExistingReserveByAddress(inputs.sourceDebtReserveAddress);
  const targetDebtReserve = inputs.market.getExistingReserveByAddress(inputs.targetDebtReserveAddress);
  const ledger = await resolveLedgerInput(
    inputs.market.getRpc(),
    inputs.currentSlot,
    inputs.currentLedgerInstant,
    sourceDebtReserve.getKind().isFixedRate() || !targetDebtReserve.state.config.debtMaturityTimestamp.eqn(0),
    'getSwapDebtKlendAccounts'
  );
  const baseInputs: SwapDebtIxsInputs<unknown> & { currentSlot: Slot } = {
    ...inputs,
    ...ledger,
    quoter: ACCOUNT_DISCOVERY_QUOTER,
    swapper: ACCOUNT_DISCOVERY_SWAPPER,
  };
  // Resolve an omitted flash-borrow side with the SAME liquidity-aware default `getSwapDebtIxs` uses, so the account
  // footprint reported here matches the route the real operation would build. Without this the helper silently fell
  // back to sourceDebt while `getSwapDebtIxs` could pick targetDebt (or vice-versa), giving the FE an account count
  // for the wrong route.
  const fullInputs: SwapDebtIxsInputs<unknown> = baseInputs.flashBorrowToken
    ? baseInputs
    : { ...baseInputs, flashBorrowToken: resolveDefaultSwapDebtFlashBorrowToken(baseInputs) };

  // Debt-seeded tags (variable Multiply/Leverage 1/3 and fixed-rate 4/6) migrate via the multiply path; their account
  // footprint is discovered through `getMultiplyKlendAccounts`. Fixed-rate variants are supported (penalty-aware repay
  // + fresh-term origination), so there is no gate here — mirrors the main `getSwapDebtIxs` dispatch.
  const tag = inputs.obligation.obligationTag;
  if (DEBT_SEEDED_OBLIGATION_TAGS.has(tag)) {
    return toKlendAccountsResult(await getMultiplyKlendAccounts(fullInputs));
  }

  const [args, context] = extractArgsAndContext(fullInputs);
  const { klendAccounts } =
    fullInputs.flashBorrowToken === 'targetDebt'
      ? await computeTargetDebtKlendAccounts(args, context)
      : await computeSourceDebtKlendAccounts(args, context);
  return toKlendAccountsResult(klendAccounts);
}

/** Multiply/Leverage migration variant of the klend account discovery used by {@link getSwapDebtKlendAccounts}. */
async function getMultiplyKlendAccounts<QuoteResponse>(
  inputs: SwapDebtIxsInputs<QuoteResponse>
): Promise<Array<Address>> {
  const [args, context] = extractArgsAndContext(inputs);
  const prep = await prepareMultiplySwap(args, context);
  const direction = buildMultiplyDirection(requireResolvedFlashBorrowToken(inputs), context, prep);
  const buildKlend = makeMultiplyBuildKlend(context, prep, direction);
  const { klendAccounts } = await computeMultiplyKlendAccounts(args, context, direction, buildKlend);
  return klendAccounts;
}

/**
 * Both multiply entrypoints run behind `getSwapDebtIxs` / `getSwapDebtKlendAccounts`, which resolve an omitted
 * `flashBorrowToken` through `resolveDefaultSwapDebtFlashBorrowToken` before dispatching. A silent `?? 'sourceDebt'`
 * fallback here could route account discovery to a different tx shape than the one the builder resolves, so an
 * unresolved token is a caller bug — fail loudly instead of guessing a side.
 */
function requireResolvedFlashBorrowToken<QuoteResponse>(
  inputs: SwapDebtIxsInputs<QuoteResponse>
): SwapDebtFlashBorrowToken {
  if (!inputs.flashBorrowToken) {
    throw new Error(
      'flashBorrowToken must be resolved before the multiply swap-debt flow (see resolveDefaultSwapDebtFlashBorrowToken)'
    );
  }
  return inputs.flashBorrowToken;
}

/**
 * Liquidity-aware default for the swap-debt flash-borrow side when the caller omits it. Delegates to
 * `determineSwapDebtFlashBorrowType` (prefers `targetDebt` when both are viable; falls back to the
 * other side, or throws if neither can serve the flash). Uses oracle prices for the source→target
 * price needed to size the flash loan.
 */
function resolveDefaultSwapDebtFlashBorrowToken<QuoteResponse>(
  inputs: SwapDebtIxsInputs<QuoteResponse> & { currentSlot: Slot }
): SwapDebtFlashBorrowToken {
  const sourceReserve = inputs.market.getExistingReserveByAddress(inputs.sourceDebtReserveAddress);
  const targetReserve = inputs.market.getExistingReserveByAddress(inputs.targetDebtReserveAddress);
  const targetPrice = targetReserve.getOracleMarketPrice();
  const sourcePrice = sourceReserve.getOracleMarketPrice();
  // Both oracle prices feed the source→target ratio that sizes the flash loan. A non-positive/non-finite price can't
  // size the swap — fail fast with a clear error rather than silently routing to `sourceDebt` (which masked a bad
  // oracle) or dividing through to Infinity/NaN lamports.
  assertPositiveFiniteDecimal('swap-debt source oracle price', sourcePrice);
  assertPositiveFiniteDecimal('swap-debt target oracle price', targetPrice);
  return determineSwapDebtFlashBorrowType({
    kaminoMarket: inputs.market,
    obligation: inputs.obligation,
    sourceDebtReserveAddress: inputs.sourceDebtReserveAddress,
    targetDebtReserveAddress: inputs.targetDebtReserveAddress,
    amount: inputs.sourceDebtSwapAmount,
    isClosingSourceDebt: inputs.isClosingSourceDebt,
    priceSourceToTarget: sourcePrice.div(targetPrice),
    slippagePct: inputs.slippagePct,
    currentSlot: inputs.currentSlot,
    currentLedgerInstant: inputs.currentLedgerInstant,
  });
}

/**
 * Obligation tags whose PDA seeds include the debt, so the debt can never be swapped in place — only by migrating
 * the position into a new obligation. Vanilla (0), Lending (2) and LendingObligationFixedRate (5) are intentionally
 * excluded: their seeds do not encode the debt, so the in-place swap-debt flow applies to them.
 */
// NOTE: these module-level sets use the on-chain tag *literals* rather than `ObligationTypeTag.*` on purpose. The
// enum lives in the `../utils` barrel, which participates in an import cycle with this module; referencing it at
// module-init time can observe an uninitialised enum (`undefined.Multiply`) depending on load order. The literal
// values are fixed by the on-chain program and are documented inline; the enum is still used in function bodies.
const DEBT_SEEDED_OBLIGATION_TAGS: ReadonlySet<number> = new Set<number>([
  1, // Multiply: seeds [collMint, debtMint]
  3, // Leverage: seeds [collMint, debtMint]
  4, // MultiplyFixedRate: seeds [collReserve, debtReserve]
  6, // LeverageFixedRate: seeds [collReserve, debtReserve]
]);

// ===========================================================================================================
// Shared context
// ===========================================================================================================

type SwapDebtArgs = {
  sourceDebtSwapAmount: Decimal;
  isClosingSourceDebt: boolean;
  // Resolved form of `SwapDebtIxsInputs.newElevationGroup`: `undefined` = caller did not specify a group (use the
  // default selection), `null` = explicit group 0 (no emode), otherwise the requested group's description.
  newElevationGroup: ElevationGroupDescription | null | undefined;
  slippagePct: Decimal;
};

type SwapDebtContext<QuoteResponse> = {
  market: KaminoMarket;
  sourceDebtReserve: KaminoReserve;
  targetDebtReserve: KaminoReserve;
  owner: TransactionSigner;
  obligation: KaminoObligation;
  quoter: SwapQuoteProvider<QuoteResponse>;
  swapper: SwapIxsProvider<QuoteResponse>;
  referrer: Option<Address>;
  currentSlot: Slot;
  currentLedgerInstant?: LedgerInstant;
  budgetAndPriorityFeeIxs: Instruction[];
  scopeRefreshIx: Instruction[];
  useV2Ixs: boolean;
  logger: (msg: string, ...extra: unknown[]) => void;
};

function extractArgsAndContext<QuoteResponse>(
  inputs: SwapDebtIxsInputs<QuoteResponse>
): [SwapDebtArgs, SwapDebtContext<QuoteResponse>] {
  if (inputs.sourceDebtReserveAddress === inputs.targetDebtReserveAddress) {
    throw new Error('Cannot swap from/to the same debt');
  }
  const sourceDebtReserve = inputs.market.getExistingReserveByAddress(inputs.sourceDebtReserveAddress, 'Source debt');
  const targetDebtReserve = inputs.market.getExistingReserveByAddress(inputs.targetDebtReserveAddress, 'Target debt');
  // Swap-debt borrows the target debt; reject up front if the target is a fixed-term reserve past its debt maturity
  // (the on-chain borrow would revert with ReserveDebtMaturityReached).
  const currentSlot = inputs.currentSlot ?? inputs.currentLedgerInstant?.slot;
  if (currentSlot === undefined) {
    throw new Error('swap-debt inputs were not normalized with a current slot');
  }
  if (!targetDebtReserve.state.config.debtMaturityTimestamp.eqn(0)) {
    targetDebtReserve.assertCanOriginateDebt(
      Number(
        requireMatchingLedgerInstant(currentSlot, inputs.currentLedgerInstant, 'extractSwapDebtArgsAndContext')
          .blockTime
      )
    );
  }
  if (!inputs.obligation.getBorrowByReserve(sourceDebtReserve.address)) {
    throw new Error(
      `Obligation ${inputs.obligation.obligationAddress} has no borrow in source debt reserve ${sourceDebtReserve.address}`
    );
  }
  // `sourceDebtSwapAmount` only constrains a PARTIAL swap; a full close ignores it entirely (the repay is sized from
  // the full outstanding + interest buffer, see `resolveSourceDebtRepayLamports`). Gate both the positivity and the
  // upper-bound checks behind `!isClosingSourceDebt` so this matches `getSwapDebtObligationsPreview`'s contract — a
  // caller can preview AND build a full close with `sourceDebtSwapAmount = 0`.
  if (!inputs.isClosingSourceDebt) {
    if (inputs.sourceDebtSwapAmount.lte(0)) {
      throw new Error('Cannot swap a non-positive amount');
    }
    // The caller must not size around an impossible repay. The on-chain repay is capped at the outstanding amount
    // anyway, but the flash-loan / external-swap / target-borrow sizing here would all be built around the inflated
    // input, producing confusing failures later. Fail fast.
    const outstandingSourceDebt = inputs.obligation.getBorrowAmountByReserve(sourceDebtReserve);
    if (inputs.sourceDebtSwapAmount.gt(outstandingSourceDebt)) {
      throw new Error(
        `sourceDebtSwapAmount ${inputs.sourceDebtSwapAmount} exceeds the obligation's current ${sourceDebtReserve.symbol} debt (${outstandingSourceDebt}); pass isClosingSourceDebt=true to swap the full position`
      );
    }
  }
  return [
    {
      sourceDebtSwapAmount: inputs.sourceDebtSwapAmount,
      isClosingSourceDebt: inputs.isClosingSourceDebt,
      newElevationGroup:
        inputs.newElevationGroup === undefined
          ? undefined
          : inputs.market.getExistingElevationGroup(inputs.newElevationGroup, 'Newly-requested'),
      slippagePct: inputs.slippagePct,
    },
    {
      market: inputs.market,
      sourceDebtReserve,
      targetDebtReserve,
      owner: inputs.owner,
      obligation: inputs.obligation,
      quoter: inputs.quoter,
      swapper: inputs.swapper,
      referrer: inputs.referrer,
      currentSlot,
      currentLedgerInstant: inputs.currentLedgerInstant,
      budgetAndPriorityFeeIxs:
        inputs.budgetAndPriorityFeeIxs || getComputeBudgetAndPriorityFeeIxs(DEFAULT_MAX_COMPUTE_UNITS),
      scopeRefreshIx: inputs.scopeRefreshIx,
      useV2Ixs: inputs.useV2Ixs,
      logger: inputs.logger ?? console.log,
    },
  ];
}

// ===========================================================================================================
// Flow A: flash borrow TARGET debt
// ===========================================================================================================

/**
 * Account-discovery prefix shared by the targetDebt flow and its light `getSwapDebtKlendAccounts` path: size an
 * initial flash-borrow estimate from oracle prices, build the klend ixs, and collect their unique accounts. The
 * account set is invariant to the (still-estimated) amounts, so the returned `klendAccounts` is the final set the
 * real flow uses for the quoter.
 */
async function computeTargetDebtKlendAccounts<QuoteResponse>(
  args: SwapDebtArgs,
  context: SwapDebtContext<QuoteResponse>
): Promise<{
  klendAccounts: Array<Address>;
  sourceRepayLamports: Decimal;
  sourceEarlyRepayPenaltyLamports: Decimal;
  sourceFundingLamports: Decimal;
  estFlashBorrowLamports: Decimal;
}> {
  const sourceRepayLamports = resolveSourceDebtRepayLamports({
    market: context.market,
    obligation: context.obligation,
    sourceDebtReserve: context.sourceDebtReserve,
    isClosingSourceDebt: args.isClosingSourceDebt,
    sourceDebtSwapAmount: args.sourceDebtSwapAmount,
    currentSlot: context.currentSlot,
  });
  // Caller contract: `priceAInB` from the quoter is the SIMULATED (mid) price, not the slippage-baked guaranteed
  // price. The SDK applies its own sizing buffer (currently tied to `slippagePct`, conceptually a separate knob from
  // the on-chain swap min_out) so the flash borrow covers worst-case execution drift between quote and swap.
  const swapSizingBufferDivisor = getSlippageFactor(args.slippagePct);
  // For a fixed-term source debt, the repay debits `repay + early-repay penalty` on-chain. The swap must therefore
  // produce principal + penalty source debt, even though the repay instruction's amount stays the principal.
  const sourceEarlyRepayPenaltyLamports = resolveSourceDebtEarlyRepayPenaltyLamports({
    obligation: context.obligation,
    sourceDebtReserve: context.sourceDebtReserve,
    repayPrincipalLamports: sourceRepayLamports,
    currentSlot: context.currentSlot,
    currentLedgerInstant: context.currentLedgerInstant,
  });
  const sourceFundingLamports = sourceRepayLamports.add(sourceEarlyRepayPenaltyLamports);

  // Initial estimate using oracle prices so we can build klend ixs for account discovery.
  const sourceOraclePx = context.sourceDebtReserve.getOracleMarketPrice();
  const targetOraclePx = context.targetDebtReserve.getOracleMarketPrice();
  assertPositiveFiniteDecimal('swap-debt source oracle price (targetDebt account discovery)', sourceOraclePx);
  assertPositiveFiniteDecimal('swap-debt target oracle price (targetDebt account discovery)', targetOraclePx);
  const oraclePx = sourceOraclePx.div(targetOraclePx); // price of 1 source denominated in target
  const estFlashBorrowLamports = sourceFundingLamports
    .div(context.sourceDebtReserve.getMintFactor())
    .mul(oraclePx)
    .div(swapSizingBufferDivisor)
    .mul(context.targetDebtReserve.getMintFactor())
    .ceil();

  // Build fake klend ixs to learn accounts.
  const estFlashRepayLamports = calculateFlashRepayLamports(context.targetDebtReserve, estFlashBorrowLamports, context);
  const fakeKlend = await getTargetDebtKlendIxs(
    args,
    context,
    estFlashBorrowLamports,
    estFlashRepayLamports,
    sourceRepayLamports
  );
  const klendAccounts = uniqueAccountsWithProgramIds(listTargetDebtIxs(fakeKlend));
  return {
    klendAccounts,
    sourceRepayLamports,
    sourceEarlyRepayPenaltyLamports,
    sourceFundingLamports,
    estFlashBorrowLamports,
  };
}

async function getSwapDebtViaTargetDebt<QuoteResponse>(
  inputs: SwapDebtIxsInputs<QuoteResponse>
): Promise<Array<SwapDebtIxsOutputs<QuoteResponse>>> {
  const [args, context] = extractArgsAndContext(inputs);

  const {
    klendAccounts,
    sourceRepayLamports,
    sourceEarlyRepayPenaltyLamports,
    sourceFundingLamports,
    estFlashBorrowLamports,
  } = await computeTargetDebtKlendAccounts(args, context);
  const swapSizingBufferDivisor = getSlippageFactor(args.slippagePct);

  // Query the quoter with estFlashBorrow as the input amount (targetDebt → sourceDebt).
  const swapInputs = {
    inputAmountLamports: estFlashBorrowLamports,
    inputMint: context.targetDebtReserve.getLiquidityMint(),
    outputMint: context.sourceDebtReserve.getLiquidityMint(),
  };
  const swapQuote = await context.quoter(swapInputs, klendAccounts);
  // `priceAInB` divides the flash-borrow sizing below; a non-positive/non-finite quote would yield Infinity/NaN
  // lamports. Fail fast at the boundary.
  assertPositiveFiniteDecimal('swap-debt swap quote priceAInB (target→source)', swapQuote.priceAInB);
  // Required: swap output ≥ sourceFundingLamports (= principal + early-repay penalty). Real swap output =
  // flashBorrow × actualPrice where actualPrice ≥ priceAInB × (1 - swapSizingBufferPct) under typical execution drift.
  //   flashBorrow ≥ sourceFundingLamports / (priceAInB × (1 - swapSizingBufferPct))
  //              = sourceFundingLamports / priceAInB / swapSizingBufferDivisor
  // Excess sourceDebt the swap produces stays in the user ATA.
  const actualFlashBorrowLamports = new Decimal(sourceFundingLamports)
    .div(context.sourceDebtReserve.getMintFactor())
    .div(swapQuote.priceAInB)
    .div(swapSizingBufferDivisor)
    .mul(context.targetDebtReserve.getMintFactor())
    .ceil();

  // Call swapper with the actual input amount.
  const actualSwapInputs = {
    inputAmountLamports: actualFlashBorrowLamports,
    inputMint: context.targetDebtReserve.getLiquidityMint(),
    outputMint: context.sourceDebtReserve.getLiquidityMint(),
  };
  const swapResponses = await context.swapper(actualSwapInputs, klendAccounts, swapQuote);

  // No off-chain viability filter on per-route price: the flash borrow was sized to `sourceFundingLamports`
  // (principal + early-repay penalty) with the SDK `swapSizingBufferPct` headroom above the bare minimum, and the
  // swap ix the swapper builds carries its own `min_out` (the route's guaranteed output). If a route under-delivers
  // at execution time, the swap's `min_out` (or the downstream sourceDebt repay, which needs `sourceFundingLamports`
  // in the ATA) will revert the tx — that is the correct behaviour, caught at simulation. `swapOutLamports` retained
  // for simulationDetails downstream.
  const routeResponses = swapResponses.map((swapResp) => {
    const swapOutLamports = swapResp.quote.priceAInB
      .mul(actualFlashBorrowLamports)
      .div(context.targetDebtReserve.getMintFactor())
      .mul(context.sourceDebtReserve.getMintFactor());
    return { swapResp, swapOutLamports };
  });
  if (routeResponses.length === 0) {
    throw new Error(`Swapper returned no routes for targetDebt → sourceDebt`);
  }

  return Promise.all(
    routeResponses.map(async ({ swapResp, swapOutLamports }) => {
      const actualFlashRepayLamports = calculateFlashRepayLamports(
        context.targetDebtReserve,
        actualFlashBorrowLamports,
        context
      );
      checkResultingObligationValid(args, sourceRepayLamports, actualFlashRepayLamports, context, 'targetDebt');

      const klendIxs = await getTargetDebtKlendIxs(
        args,
        context,
        actualFlashBorrowLamports,
        actualFlashRepayLamports,
        sourceRepayLamports
      );

      return {
        ixs: listTargetDebtIxs(klendIxs, [...swapResp.preActionIxs, ...removeBudgetIxs(swapResp.swapIxs)]),
        lookupTables: swapResp.lookupTables,
        useV2Ixs: context.useV2Ixs,
        simulationDetails: {
          flashLoan: {
            flashBorrowReserveMint: context.targetDebtReserve.getLiquidityMint(),
            flashBorrowedAmount: actualFlashBorrowLamports.div(context.targetDebtReserve.getMintFactor()),
            flashRepaidAmount: klendIxs.simulationDetails.flashRepayLamports.div(
              context.targetDebtReserve.getMintFactor()
            ),
          },
          externalSwap: {
            swapInMint: context.targetDebtReserve.getLiquidityMint(),
            swapOutMint: context.sourceDebtReserve.getLiquidityMint(),
            swapInAmount: actualFlashBorrowLamports.div(context.targetDebtReserve.getMintFactor()),
            swapOutAmount: swapOutLamports.div(context.sourceDebtReserve.getMintFactor()),
            quoteResponse: swapResp.quote.quoteResponse,
          },
          earlyRepayPenaltyLamports: sourceEarlyRepayPenaltyLamports,
          reorigination: context.targetDebtReserve.getFixedTermReorigination(),
        },
      };
    })
  );
}

type SwapDebtViaTargetKlendIxs = {
  setupIxs: Instruction[];
  targetDebtFlashBorrowIx: Instruction;
  repaySourceIxs: Instruction[];
  borrowTargetIxs: Instruction[];
  targetDebtFlashRepayIx: Instruction;
  cleanupIxs: Instruction[];
  flashLoanInfo: FlashLoanInfo;
  simulationDetails: {
    flashRepayLamports: Decimal;
  };
};

async function getTargetDebtKlendIxs(
  args: SwapDebtArgs,
  context: SwapDebtContext<any>,
  flashBorrowLamports: Decimal,
  flashRepayLamports: Decimal,
  sourceRepayLamports: Decimal
): Promise<SwapDebtViaTargetKlendIxs> {
  const { ataCreationIxs, targetDebtAta } = await getAtaCreationIxs(context);
  const setupIxs = [...ataCreationIxs];
  if (context.scopeRefreshIx?.length) {
    setupIxs.unshift(...context.scopeRefreshIx);
  }

  const { flashBorrowIx: targetDebtFlashBorrowIx, flashRepayIx: targetDebtFlashRepayIx } = getFlashLoanInstructions({
    borrowIxIndex: setupIxs.length,
    userTransferAuthority: context.owner,
    lendingMarketAuthority: await context.market.getLendingMarketAuthority(),
    lendingMarketAddress: context.market.getAddress(),
    reserve: context.targetDebtReserve,
    amountLamports: flashBorrowLamports,
    destinationAta: targetDebtAta,
    referrerAccount: none(),
    referrerTokenState: none(),
    programId: context.market.programId,
  });

  // Repay source debt with the swap output (swap happens between flash-borrow and repay in final instruction order).
  const repayAction = await KaminoAction.buildRepayTxns({
    kaminoMarket: context.market,
    amount: args.isClosingSourceDebt ? U64_MAX : sourceRepayLamports.toFixed(0),
    reserveAddress: context.sourceDebtReserve.address,
    owner: context.owner,
    obligation: context.obligation,
    useV2Ixs: context.useV2Ixs,
    scopeRefreshConfig: undefined,
    currentSlot: context.currentSlot,
    payer: context.owner,
    extraComputeBudget: 0,
    includeAtaIxs: false,
    requestElevationGroup: false,
    initUserMetadata: { skipInitialization: true, skipLutCreation: true },
    referrer: context.referrer,
  });
  const repaySourceIxs = removeBudgetIxs(KaminoAction.actionToIxs(repayAction));

  // Borrow target debt (amount = flashRepay) to pay the flash loan back.
  // `undefined` (caller did not specify a group) keeps the obligation's current group; an explicit group (including
  // `null` = group 0 / no emode) is honored as requested.
  const finalElevationGroupId =
    args.newElevationGroup === undefined
      ? context.obligation.state.elevationGroup
      : args.newElevationGroup?.elevationGroup ?? 0;
  const requestsElevationGroupChange = finalElevationGroupId !== context.obligation.state.elevationGroup;
  const borrowAction = await KaminoAction.buildBorrowTxns({
    kaminoMarket: context.market,
    amount: flashRepayLamports.toFixed(0),
    reserveAddress: context.targetDebtReserve.address,
    owner: context.owner,
    obligation: context.obligation,
    useV2Ixs: context.useV2Ixs,
    scopeRefreshConfig: undefined,
    extraComputeBudget: 0,
    includeAtaIxs: false,
    requestElevationGroup: requestsElevationGroupChange,
    initUserMetadata: { skipInitialization: true, skipLutCreation: true },
    referrer: context.referrer,
    currentSlot: context.currentSlot,
    overrideElevationGroupRequest: requestsElevationGroupChange ? finalElevationGroupId : undefined,
    obligationCustomizations: {
      // If we fully closed the source debt in the prior repay, the obligation no longer holds it and the refresh
      // accounts must reflect that.
      removedBorrowReserves: args.isClosingSourceDebt ? [context.sourceDebtReserve.address] : [],
    },
  });
  const borrowTargetIxs = removeBudgetIxs(KaminoAction.actionToIxs(borrowAction));

  const cleanupIxs = [...(await getAtaCloseIxs(context)), ...context.budgetAndPriorityFeeIxs];

  return {
    setupIxs,
    targetDebtFlashBorrowIx,
    repaySourceIxs,
    borrowTargetIxs,
    targetDebtFlashRepayIx,
    cleanupIxs,
    flashLoanInfo: {
      flashBorrowReserve: context.targetDebtReserve.address,
      flashLoanFee: context.targetDebtReserve.getFlashLoanFee(),
    },
    simulationDetails: {
      flashRepayLamports,
    },
  };
}

function listTargetDebtIxs(klend: SwapDebtViaTargetKlendIxs, externalSwapIxs?: Instruction[]): Instruction[] {
  return [
    ...klend.setupIxs,
    klend.targetDebtFlashBorrowIx,
    ...(externalSwapIxs || []),
    ...klend.repaySourceIxs,
    ...klend.borrowTargetIxs,
    klend.targetDebtFlashRepayIx,
    ...klend.cleanupIxs,
  ];
}

// ===========================================================================================================
// Flow B: flash borrow SOURCE debt
// ===========================================================================================================

/**
 * Account-discovery prefix shared by the sourceDebt flow and its light `getSwapDebtKlendAccounts` path. As with the
 * targetDebt prefix, the returned `klendAccounts` is the final set (invariant to the estimated amounts).
 */
async function computeSourceDebtKlendAccounts<QuoteResponse>(
  args: SwapDebtArgs,
  context: SwapDebtContext<QuoteResponse>
): Promise<{
  klendAccounts: Array<Address>;
  sourceRepayLamports: Decimal;
  sourceEarlyRepayPenaltyLamports: Decimal;
  sourceFundingLamports: Decimal;
  flashRepayLamports: Decimal;
  estBorrowTargetLamports: Decimal;
}> {
  const sourceRepayLamports = resolveSourceDebtRepayLamports({
    market: context.market,
    obligation: context.obligation,
    sourceDebtReserve: context.sourceDebtReserve,
    isClosingSourceDebt: args.isClosingSourceDebt,
    sourceDebtSwapAmount: args.sourceDebtSwapAmount,
    currentSlot: context.currentSlot,
  });
  // See target-debt flow for the SDK sizing-buffer contract (currently == slippagePct, future cappable).
  const swapSizingBufferDivisor = getSlippageFactor(args.slippagePct);
  // For a fixed-term source debt, the on-chain repay debits `repay + early-repay penalty`. We flash-borrow source
  // debt and repay it directly, so the flash-borrow must be principal + penalty (the repay instruction amount stays
  // the principal — see `getSourceDebtKlendIxs`).
  const sourceEarlyRepayPenaltyLamports = resolveSourceDebtEarlyRepayPenaltyLamports({
    obligation: context.obligation,
    sourceDebtReserve: context.sourceDebtReserve,
    repayPrincipalLamports: sourceRepayLamports,
    currentSlot: context.currentSlot,
    currentLedgerInstant: context.currentLedgerInstant,
  });
  const sourceFundingLamports = sourceRepayLamports.add(sourceEarlyRepayPenaltyLamports);

  // Flash borrow = source funding amount (principal + penalty). Flash repay = flashBorrow + fee.
  const flashRepayLamports = calculateFlashRepayLamports(context.sourceDebtReserve, sourceFundingLamports, context);

  // Estimate target debt borrow using oracle prices. priceSourceInTarget = oracle_source / oracle_target.
  // Both prices feed the ratio below; a non-positive/non-finite value on either side would propagate
  // Infinity/NaN/negative lamports into the estimated borrow and account discovery.
  const sourceOraclePx = context.sourceDebtReserve.getOracleMarketPrice();
  const targetOraclePx = context.targetDebtReserve.getOracleMarketPrice();
  assertPositiveFiniteDecimal('swap-debt source oracle price', sourceOraclePx);
  assertPositiveFiniteDecimal('swap-debt target oracle price', targetOraclePx);
  const oraclePx = sourceOraclePx.div(targetOraclePx);
  const estBorrowTargetLamports = flashRepayLamports
    .div(context.sourceDebtReserve.getMintFactor())
    .mul(oraclePx)
    .div(swapSizingBufferDivisor)
    .mul(context.targetDebtReserve.getMintFactor())
    .ceil();

  const fakeKlendIxs = await getSourceDebtKlendIxs(
    args,
    context,
    sourceFundingLamports,
    sourceRepayLamports,
    estBorrowTargetLamports
  );
  const klendAccounts = uniqueAccountsWithProgramIds(listSourceDebtIxs(fakeKlendIxs));
  return {
    klendAccounts,
    sourceRepayLamports,
    sourceEarlyRepayPenaltyLamports,
    sourceFundingLamports,
    flashRepayLamports,
    estBorrowTargetLamports,
  };
}

async function getSwapDebtViaSourceDebt<QuoteResponse>(
  inputs: SwapDebtIxsInputs<QuoteResponse>
): Promise<Array<SwapDebtIxsOutputs<QuoteResponse>>> {
  const [args, context] = extractArgsAndContext(inputs);

  const {
    klendAccounts,
    sourceRepayLamports,
    sourceEarlyRepayPenaltyLamports,
    sourceFundingLamports,
    flashRepayLamports,
    estBorrowTargetLamports,
  } = await computeSourceDebtKlendAccounts(args, context);
  const swapSizingBufferDivisor = getSlippageFactor(args.slippagePct);

  // Query quoter with estBorrowTarget as swap input (targetDebt → sourceDebt).
  const swapInputs = {
    inputAmountLamports: estBorrowTargetLamports,
    inputMint: context.targetDebtReserve.getLiquidityMint(),
    outputMint: context.sourceDebtReserve.getLiquidityMint(),
  };
  const swapQuote = await context.quoter(swapInputs, klendAccounts);
  assertPositiveFiniteDecimal('swap-debt swap quote priceAInB (sourceDebt route)', swapQuote.priceAInB);
  // borrowTarget × priceAInB × (1 - sizingBuffer) ≥ flashRepayLamports → divide by both.
  const actualBorrowTargetLamports = new Decimal(flashRepayLamports)
    .div(context.sourceDebtReserve.getMintFactor())
    .div(swapQuote.priceAInB)
    .div(swapSizingBufferDivisor)
    .mul(context.targetDebtReserve.getMintFactor())
    .ceil();

  const actualSwapInputs = {
    inputAmountLamports: actualBorrowTargetLamports,
    inputMint: context.targetDebtReserve.getLiquidityMint(),
    outputMint: context.sourceDebtReserve.getLiquidityMint(),
  };
  const swapResponses = await context.swapper(actualSwapInputs, klendAccounts, swapQuote);

  // See targetDebt flow for rationale: no off-chain viability filter — slippage buffer + the
  // swap ix's own `min_out` + the on-chain flash repay step gate any bad fills.
  const routeResponses = swapResponses.map((swapResp) => {
    const swapOutLamports = swapResp.quote.priceAInB
      .mul(actualBorrowTargetLamports)
      .div(context.targetDebtReserve.getMintFactor())
      .mul(context.sourceDebtReserve.getMintFactor());
    return { swapResp, swapOutLamports };
  });
  if (routeResponses.length === 0) {
    throw new Error(`Swapper returned no routes for targetDebt → sourceDebt (sourceDebt flash flow)`);
  }

  return Promise.all(
    routeResponses.map(async ({ swapResp, swapOutLamports }) => {
      checkResultingObligationValid(args, sourceRepayLamports, actualBorrowTargetLamports, context, 'sourceDebt');

      const klendIxs = await getSourceDebtKlendIxs(
        args,
        context,
        sourceFundingLamports,
        sourceRepayLamports,
        actualBorrowTargetLamports
      );

      return {
        ixs: listSourceDebtIxs(klendIxs, [...swapResp.preActionIxs, ...removeBudgetIxs(swapResp.swapIxs)]),
        lookupTables: swapResp.lookupTables,
        useV2Ixs: context.useV2Ixs,
        simulationDetails: {
          flashLoan: {
            flashBorrowReserveMint: context.sourceDebtReserve.getLiquidityMint(),
            flashBorrowedAmount: sourceFundingLamports.div(context.sourceDebtReserve.getMintFactor()),
            flashRepaidAmount: flashRepayLamports.div(context.sourceDebtReserve.getMintFactor()),
          },
          externalSwap: {
            swapInMint: context.targetDebtReserve.getLiquidityMint(),
            swapOutMint: context.sourceDebtReserve.getLiquidityMint(),
            swapInAmount: actualBorrowTargetLamports.div(context.targetDebtReserve.getMintFactor()),
            swapOutAmount: swapOutLamports.div(context.sourceDebtReserve.getMintFactor()),
            quoteResponse: swapResp.quote.quoteResponse,
          },
          earlyRepayPenaltyLamports: sourceEarlyRepayPenaltyLamports,
          reorigination: context.targetDebtReserve.getFixedTermReorigination(),
        },
      };
    })
  );
}

type SwapDebtViaSourceKlendIxs = {
  setupIxs: Instruction[];
  sourceDebtFlashBorrowIx: Instruction;
  repaySourceIxs: Instruction[];
  borrowTargetIxs: Instruction[];
  sourceDebtFlashRepayIx: Instruction;
  cleanupIxs: Instruction[];
  flashLoanInfo: FlashLoanInfo;
};

async function getSourceDebtKlendIxs(
  args: SwapDebtArgs,
  context: SwapDebtContext<any>,
  flashBorrowLamports: Decimal,
  repaySourcePrincipalLamports: Decimal,
  borrowTargetLamports: Decimal
): Promise<SwapDebtViaSourceKlendIxs> {
  const { ataCreationIxs, sourceDebtAta } = await getAtaCreationIxs(context);
  const setupIxs = [...ataCreationIxs];
  if (context.scopeRefreshIx?.length) {
    setupIxs.unshift(...context.scopeRefreshIx);
  }

  const { flashBorrowIx: sourceDebtFlashBorrowIx, flashRepayIx: sourceDebtFlashRepayIx } = getFlashLoanInstructions({
    borrowIxIndex: setupIxs.length,
    userTransferAuthority: context.owner,
    lendingMarketAuthority: await context.market.getLendingMarketAuthority(),
    lendingMarketAddress: context.market.getAddress(),
    reserve: context.sourceDebtReserve,
    amountLamports: flashBorrowLamports,
    destinationAta: sourceDebtAta,
    referrerAccount: none(),
    referrerTokenState: none(),
    programId: context.market.programId,
  });

  // 1. Repay source debt using flash-borrowed tokens. The repay instruction amount is the principal only; on-chain
  // the fixed-term early-repay penalty is debited on top, which is why the flash-borrow above is sized to
  // principal + penalty (the source ATA must hold enough to cover `repay + penalty`).
  const repayAction = await KaminoAction.buildRepayTxns({
    kaminoMarket: context.market,
    amount: args.isClosingSourceDebt ? U64_MAX : repaySourcePrincipalLamports.toFixed(0),
    reserveAddress: context.sourceDebtReserve.address,
    owner: context.owner,
    obligation: context.obligation,
    useV2Ixs: context.useV2Ixs,
    scopeRefreshConfig: undefined,
    currentSlot: context.currentSlot,
    payer: context.owner,
    extraComputeBudget: 0,
    includeAtaIxs: false,
    requestElevationGroup: false,
    initUserMetadata: { skipInitialization: true, skipLutCreation: true },
    referrer: context.referrer,
  });
  const repaySourceIxs = removeBudgetIxs(KaminoAction.actionToIxs(repayAction));

  // 2. Borrow target debt.
  // `undefined` (caller did not specify a group) keeps the obligation's current group; an explicit group (including
  // `null` = group 0 / no emode) is honored as requested.
  const finalElevationGroupId =
    args.newElevationGroup === undefined
      ? context.obligation.state.elevationGroup
      : args.newElevationGroup?.elevationGroup ?? 0;
  const requestsElevationGroupChange = finalElevationGroupId !== context.obligation.state.elevationGroup;
  const borrowAction = await KaminoAction.buildBorrowTxns({
    kaminoMarket: context.market,
    amount: borrowTargetLamports.toFixed(0),
    reserveAddress: context.targetDebtReserve.address,
    owner: context.owner,
    obligation: context.obligation,
    useV2Ixs: context.useV2Ixs,
    scopeRefreshConfig: undefined,
    extraComputeBudget: 0,
    includeAtaIxs: false,
    requestElevationGroup: requestsElevationGroupChange,
    initUserMetadata: { skipInitialization: true, skipLutCreation: true },
    referrer: context.referrer,
    currentSlot: context.currentSlot,
    overrideElevationGroupRequest: requestsElevationGroupChange ? finalElevationGroupId : undefined,
    obligationCustomizations: {
      // If we fully closed the source debt in the prior repay, the obligation no longer holds it and the refresh
      // accounts must reflect that.
      removedBorrowReserves: args.isClosingSourceDebt ? [context.sourceDebtReserve.address] : [],
    },
  });
  const borrowTargetIxs = removeBudgetIxs(KaminoAction.actionToIxs(borrowAction));

  const cleanupIxs = [...(await getAtaCloseIxs(context)), ...context.budgetAndPriorityFeeIxs];

  return {
    setupIxs,
    sourceDebtFlashBorrowIx,
    repaySourceIxs,
    borrowTargetIxs,
    sourceDebtFlashRepayIx,
    cleanupIxs,
    flashLoanInfo: {
      flashBorrowReserve: context.sourceDebtReserve.address,
      flashLoanFee: context.sourceDebtReserve.getFlashLoanFee(),
    },
  };
}

function listSourceDebtIxs(klend: SwapDebtViaSourceKlendIxs, externalSwapIxs?: Instruction[]): Instruction[] {
  return [
    ...klend.setupIxs,
    klend.sourceDebtFlashBorrowIx,
    ...klend.repaySourceIxs,
    ...klend.borrowTargetIxs,
    ...(externalSwapIxs || []),
    klend.sourceDebtFlashRepayIx,
    ...klend.cleanupIxs,
  ];
}

// ===========================================================================================================
// Shared helpers
// ===========================================================================================================

export type MultiplyMigrationSizing = {
  /** Old-debt repay (lamports). Full close: outstanding + interest + buffer; partial: `sourceDebtSwapAmount`. */
  oldDebtRepayLamports: Decimal;
  /** Proportional fraction of the position being moved: `f = oldDebtRepay / totalOldDebt`, clamped to [0, 1]. */
  f: Decimal;
  /** Collateral to move (liquidity lamports) = `floor(f * collateralSnapshot)`. Full close: `floor(snapshot)`. */
  collToMoveLamports: Decimal;
  /** Whether the migration empties the old obligation (full close). */
  isFullMigration: boolean;
};

/**
 * Sizes a multiply/leverage debt-swap migration. The collateral moved is proportional to the debt repaid so the
 * position's LTV is preserved on both sides (the moved slice and the remaining old obligation keep ~the original
 * LTV). A full swap (`isClosingSourceDebt`) degenerates to `f = 1` and moves the whole (floored) collateral
 * snapshot, reproducing the pre-partial full-migration behaviour exactly. Shared by the builder and the FE preview
 * so the previewed and executed sizing match.
 *
 * `collToMoveLamports` is floored so that we re-deposit a whole, conservative number of liquidity lamports into the
 * target — the amount we re-deposit is therefore always ≤ what the old-obligation withdraw makes available (the
 * on-chain withdraw rounds the liquidity→cToken conversion UP, see the builder), so there is never a "deposit more
 * than available" failure. Note this floor does NOT make the old obligation strictly healthier: the on-chain withdraw
 * removes up to ~1 cToken more than `floor(f · snapshot)` and the repay is `ceil`-rounded, so the old obligation's
 * post-op LTV deviates from the exact proportional target by sub-unit dust in either direction — negligible for
 * health, and the explicit old-obligation LTV check covers the result regardless. `f` is clamped to 1 defensively
 * (the partial repay is already capped against the outstanding debt upstream, but the `ceil` in the repay sizing
 * could otherwise push the ratio a hair above 1).
 */
export function computeMultiplyMigrationSizing(params: {
  oldDebtRepayLamports: Decimal;
  totalOldDebtLamports: Decimal;
  collateralSnapshotLamports: Decimal;
  isClosingSourceDebt: boolean;
}): MultiplyMigrationSizing {
  const { oldDebtRepayLamports, totalOldDebtLamports, collateralSnapshotLamports, isClosingSourceDebt } = params;
  if (totalOldDebtLamports.lte(0)) {
    throw new Error('Cannot size a multiply debt-swap migration against a non-positive outstanding debt');
  }
  if (isClosingSourceDebt) {
    return {
      oldDebtRepayLamports,
      f: new Decimal(1),
      collToMoveLamports: collateralSnapshotLamports.floor(),
      isFullMigration: true,
    };
  }
  const f = Decimal.min(oldDebtRepayLamports.div(totalOldDebtLamports), new Decimal(1));
  return {
    oldDebtRepayLamports,
    f,
    collToMoveLamports: f.mul(collateralSnapshotLamports).floor(),
    isFullMigration: false,
  };
}

function calculateFlashRepayLamports(
  reserve: KaminoReserve,
  flashBorrowLamports: Decimal,
  context: SwapDebtContext<any>
): Decimal {
  return computeFlashRepayLamports(
    reserve,
    flashBorrowLamports,
    context.market.state.referralFeeBps,
    isSome(context.referrer)
  );
}

/**
 * Pure helper exposed for unit testing: computes the flash-repay amount (in lamports) for a flash-borrow of
 * `flashBorrowLamports` on `reserve`. Ceils the result so the resulting amount is always an integer number of
 * lamports that is at least the (potentially fractional) fee-included sum. The borrow ix later uses `.toFixed(0)`
 * which would otherwise round half-to-up and could under-borrow by 1 lamport, causing the flash repay to fail.
 */
export function computeFlashRepayLamports(
  reserve: KaminoReserve,
  flashBorrowLamports: Decimal,
  referralFeeBps: number,
  hasReferrer: boolean
): Decimal {
  return calcFlashLoanFees({
    reserve,
    referralFeeBps,
    hasReferral: hasReferrer,
    flashBorrowAmountLamports: flashBorrowLamports,
  }).flashRepayDebitLamports.ceil();
}

async function getAtaCreationIxs(context: SwapDebtContext<any>) {
  const atasAndIxs = await createAtasIdempotent(context.owner, [
    {
      mint: context.sourceDebtReserve.getLiquidityMint(),
      tokenProgram: context.sourceDebtReserve.getLiquidityTokenProgram(),
    },
    {
      mint: context.targetDebtReserve.getLiquidityMint(),
      tokenProgram: context.targetDebtReserve.getLiquidityTokenProgram(),
    },
  ]);
  return {
    ataCreationIxs: atasAndIxs.map((t) => t.createAtaIx),
    sourceDebtAta: atasAndIxs[0].ata,
    targetDebtAta: atasAndIxs[1].ata,
  };
}

async function getAtaCloseIxs(context: SwapDebtContext<any>) {
  const ataCloseIxs: Instruction[] = [];
  if (
    context.sourceDebtReserve.getLiquidityMint() === WRAPPED_SOL_MINT ||
    context.targetDebtReserve.getLiquidityMint() === WRAPPED_SOL_MINT
  ) {
    const wsolAta = await getAssociatedTokenAddress(WRAPPED_SOL_MINT, context.owner.address);
    ataCloseIxs.push(
      getCloseAccountInstruction(
        { account: wsolAta, owner: context.owner, destination: context.owner.address },
        { programAddress: TOKEN_PROGRAM_ADDRESS }
      )
    );
  }
  return ataCloseIxs;
}

function checkResultingObligationValid(
  args: SwapDebtArgs,
  sourceRepayLamports: Decimal,
  targetBorrowLamports: Decimal,
  context: SwapDebtContext<any>,
  flow: SwapDebtFlashBorrowToken
): void {
  // Resolve the elevation group the obligation will END UP in, with the SAME rule the builders use: omitted
  // (`undefined`) keeps the obligation's CURRENT group, explicit `0`/`null` means no emode, an explicit group means
  // that group. Validating/simulating at this resolved group (rather than treating omitted as group 0) keeps the
  // precheck aligned with execution — in particular it never validates an existing emode obligation at group 0, which
  // would falsely reject it or hide an incompatibility the on-chain borrow then hits.
  const resolvedElevationGroup: ElevationGroupDescription | null =
    args.newElevationGroup === undefined
      ? context.market.getExistingElevationGroup(context.obligation.state.elevationGroup)
      : args.newElevationGroup;
  const resolvedElevationGroupId = resolvedElevationGroup?.elevationGroup ?? 0;

  // Elevation group validity: only meaningful for a non-zero (emode) resulting group.
  if (resolvedElevationGroup !== null) {
    // Determine the resulting set of borrow reserves.
    const borrowReserveAddresses = new Set<Address>([
      ...context.obligation.borrows.keys(),
      context.targetDebtReserve.address,
    ]);
    if (args.isClosingSourceDebt) {
      borrowReserveAddresses.delete(context.sourceDebtReserve.address);
    }
    if (borrowReserveAddresses.size > 1) {
      throw new Error(
        `The obligation with ${borrowReserveAddresses.size} debt reserves cannot request any elevation group`
      );
    }
    if (borrowReserveAddresses.size === 1) {
      const only = [...borrowReserveAddresses][0];
      if (resolvedElevationGroup.debtReserve !== only) {
        throw new Error(
          `The obligation with debt reserve ${only} cannot request elevation group ${resolvedElevationGroup.elevationGroup}`
        );
      }
    }
    // Collateral reserves unchanged, but they must still all be compatible with the resulting group.
    for (const collReserveAddress of context.obligation.deposits.keys()) {
      if (!resolvedElevationGroup.collateralReserves.has(collReserveAddress)) {
        throw new Error(
          `The obligation with collateral reserve ${collReserveAddress} cannot request elevation group ${resolvedElevationGroup.elevationGroup}`
        );
      }
    }
    if (context.obligation.deposits.size > resolvedElevationGroup.maxReservesAsCollateral) {
      throw new Error(
        `The obligation with ${context.obligation.deposits.size} collateral reserves cannot request elevation group ${resolvedElevationGroup.elevationGroup}`
      );
    }
  }

  // Resulting LTV check. The on-chain obligation debt grows by `borrow.liquidityAmount + reserve.originationFee`,
  // so we feed the fee-included amount into the simulation. This single change addresses both consequences Silviu
  // flagged in PR comment #3268776841: "underestimates final LTV and borrow-limit usage" — the obligation-level
  // borrow-limit "usage" surfaces in `userTotalBorrowBorrowFactorAdjusted`, which `getPostSwapDebtObligationStats`
  // now computes from the fee-included amount. The reserve-level `borrow_limit` is enforced by the borrow ix
  // on-chain; we don't duplicate it client-side here (stale snapshot, no alternative-flow to recommend).
  const targetBorrowLamportsWithFees = KaminoObligation.getDebtWithFeesForBorrowAmount(
    targetBorrowLamports,
    context.market,
    context.targetDebtReserve,
    isSome(context.referrer)
  );
  const resultingStats = context.obligation.getPostSwapDebtObligationStats({
    repayAmountLamports: sourceRepayLamports,
    repayReserveAddress: context.sourceDebtReserve.address,
    borrowAmountLamports: targetBorrowLamportsWithFees,
    borrowReserveAddress: context.targetDebtReserve.address,
    newElevationGroup: resolvedElevationGroupId,
    market: context.market,
    slot: context.currentSlot,
  });
  const maxLtv = resultingStats.borrowLimit.div(resultingStats.userTotalCollateralDeposit);
  if (resultingStats.loanToValue > maxLtv) {
    throw new Error(
      `Swap debt (${flow}) would result in the obligation's LTV ${resultingStats.loanToValue} exceeding its max LTV ${maxLtv}`
    );
  }
}

// ===========================================================================================================
// Flow C: debt-seeded obligation (variable-rate Multiply / Leverage) — migrate the whole position to a new
// obligation of the same type with a different debt. (Fixed-rate variants are gated upstream for now.)
//
// These obligations' PDAs are derived from (coll, debt), so changing the debt means a different obligation. We
// flash-borrow one of the debts, fully repay + withdraw the old position, init a new obligation of the SAME type
// re-seeded with the new debt, deposit the same collateral, borrow the new debt, and swap new↔old to settle the
// flash loan. The default (sourceDebt) ordering is shown below; targetDebt swaps early (see listMultiplyIxs).
//
// Final ix order (sourceDebt):
//   [scopeRefresh, atas(old,new,coll), flashBorrow(old), repay+withdraw(old, U64_MAX/U64_MAX),
//    init+deposit+borrow(new), swap(new→old), flashRepay(old), cleanup]
// ===========================================================================================================

async function getSwapDebtForMultiply<QuoteResponse>(
  inputs: SwapDebtIxsInputs<QuoteResponse>
): Promise<Array<SwapDebtIxsOutputs<QuoteResponse>>> {
  const [args, context] = extractArgsAndContext(inputs);
  const prep = await prepareMultiplySwap(args, context);
  const direction = buildMultiplyDirection(requireResolvedFlashBorrowToken(inputs), context, prep);
  return runMultiplySwapFlow(args, context, prep, direction);
}

/**
 * Resolves the multiply debt-swap {@link MultiplyFlashDirection} for the caller's flash-borrow token: which reserve
 * is flash-borrowed, how much the swap must yield, and how the flash-borrow / new-borrow amounts derive from the
 * swap input. Both directions reach the same end state; they differ only in which reserve's flash liquidity is
 * consumed and in instruction ordering. Shared by the builder flow and the light `getSwapDebtKlendAccounts` path.
 */
function buildMultiplyDirection<QuoteResponse>(
  flashBorrowToken: SwapDebtFlashBorrowToken,
  context: SwapDebtContext<QuoteResponse>,
  prep: MultiplySwapPrep
): MultiplyFlashDirection {
  const { sourceDebtReserve, targetDebtReserve } = context;
  // Size the flash-borrow / swap against the funding amount (principal + fixed-term early-repay penalty) so the old
  // obligation's repay debit of `repay + penalty` is covered. The repay-instruction amount itself stays on the
  // principal (`oldDebtRepayLamports`, used inside the klend builder).
  const { oldDebtFundingLamports } = prep;
  return flashBorrowToken === 'targetDebt'
    ? {
        // Flash-borrow the NEW debt and swap it to old debt up front to repay the position (swap happens early).
        // The swap need only cover the old-debt repay (incl. penalty); the new obligation then borrows the flash
        // repay (borrowed amount + fee) to settle the loan.
        flashBorrowToken,
        minSwapOutLamports: oldDebtFundingLamports,
        resolveAmounts: (swapInputLamports) => ({
          flashBorrowLamports: swapInputLamports,
          newDebtBorrowLamports: calculateFlashRepayLamports(targetDebtReserve, swapInputLamports, context),
        }),
      }
    : {
        // Flash-borrow the OLD debt to repay the position, then borrow the new debt and swap it back to repay the
        // flash loan (swap happens late). The flash-borrow must cover the repay + penalty, the swap must cover the
        // flash repay (funding + fee), and the new obligation borrows exactly what we swap.
        flashBorrowToken,
        minSwapOutLamports: calculateFlashRepayLamports(sourceDebtReserve, oldDebtFundingLamports, context),
        resolveAmounts: (swapInputLamports) => ({
          flashBorrowLamports: oldDebtFundingLamports,
          newDebtBorrowLamports: swapInputLamports,
        }),
      };
}

/** Builds the per-swap-input klend-ix builder for a multiply debt swap. Shared by the flow and the light path. */
function makeMultiplyBuildKlend<QuoteResponse>(
  context: SwapDebtContext<QuoteResponse>,
  prep: MultiplySwapPrep,
  direction: MultiplyFlashDirection
): (swapInputLamports: Decimal) => Promise<SwapDebtForMultiplyKlendIxs> {
  return (swapInputLamports: Decimal) => {
    const { flashBorrowLamports, newDebtBorrowLamports } = direction.resolveAmounts(swapInputLamports);
    return buildSwapDebtForMultiplyKlendIxs(
      context,
      prep,
      direction.flashBorrowToken,
      flashBorrowLamports,
      newDebtBorrowLamports
    );
  };
}

/**
 * Account-discovery prefix shared by {@link runMultiplySwapFlow} and the light `getSwapDebtKlendAccounts` path:
 * estimate the new-debt swap input from oracle prices, build the klend ixs, and collect their unique accounts.
 */
async function computeMultiplyKlendAccounts<QuoteResponse>(
  args: SwapDebtArgs,
  context: SwapDebtContext<QuoteResponse>,
  direction: MultiplyFlashDirection,
  buildKlend: (swapInputLamports: Decimal) => Promise<SwapDebtForMultiplyKlendIxs>
): Promise<{ klendAccounts: Array<Address>; estSwapInputLamports: Decimal }> {
  const { sourceDebtReserve, targetDebtReserve } = context;
  const { flashBorrowToken, minSwapOutLamports } = direction;

  // SDK sizing buffer (see flow A for full contract). FE passes mid `priceAInB`; SDK divides by
  // `(1 - swapSizingBufferPct/100)` so the worst-case real fill still produces `minSwapOutLamports`.
  const swapSizingBufferDivisor = getSlippageFactor(args.slippagePct);

  // Estimate the new-debt swap input from oracle prices (new tokens per old = oracle_old / oracle_new, e.g.
  // 1 USDC @ $1 = 0.05 JITOSOL @ $20) so we can build fake ixs for account discovery.
  // Both prices feed the ratio; guard both so a bad source oracle cannot propagate Infinity/NaN lamports either.
  const sourceOraclePxOld = sourceDebtReserve.getOracleMarketPrice();
  const targetOraclePxNew = targetDebtReserve.getOracleMarketPrice();
  assertPositiveFiniteDecimal('swap-debt (multiply) source oracle price', sourceOraclePxOld);
  assertPositiveFiniteDecimal('swap-debt (multiply) target oracle price', targetOraclePxNew);
  const oraclePxNewPerOld = sourceOraclePxOld.div(targetOraclePxNew);
  const estSwapInputLamports = minSwapOutLamports
    .div(sourceDebtReserve.getMintFactor())
    .mul(oraclePxNewPerOld)
    .div(swapSizingBufferDivisor)
    .mul(targetDebtReserve.getMintFactor())
    .ceil();

  const fakeKlendIxs = await buildKlend(estSwapInputLamports);
  const klendAccounts = uniqueAccountsWithProgramIds(listMultiplyIxs(fakeKlendIxs, flashBorrowToken));
  return { klendAccounts, estSwapInputLamports };
}

type MultiplySwapPrep = {
  collReserve: KaminoReserve;
  /**
   * The obligation the position is migrated into: an already-loaded {@link KaminoObligation} (grow it in place,
   * no InitObligation) when the target obligation already exists, or an {@link ObligationType} (init a new one)
   * when it does not.
   */
  targetObligation: KaminoObligation | ObligationType;
  newObligationAddress: Address;
  /** Whether the target obligation does not exist yet (init + seed) vs already exists (grow). */
  isNewTarget: boolean;
  /** The target's elevation group: its current group when it exists, 0/auto-selected when it is new. */
  newTargetElevationGroup: number;
  /**
   * Elevation-group request for the deposit+borrow into the target, resolved once by {@link planMultiplyMigration} so
   * the builder, the resulting-health validation and the FE preview all agree. `requestTargetElevationGroup` maps
   * onto `buildDepositAndBorrowTxns`' `requestElevationGroup`, and `targetElevationGroupOverride` onto its
   * `overrideElevationGroupRequest` (`undefined` → let the action auto-select the best common group).
   */
  requestTargetElevationGroup: boolean;
  targetElevationGroupOverride: number | undefined;
  /**
   * The CONCRETE elevation group the target obligation will end up in (existing target → its current group; new
   * target → the requested override, the auto-selected best common group, or 0 for no emode). Used by the new-target
   * LTV precheck and the FE preview so both project the position at exactly the group execution requests.
   */
  targetResultingElevationGroup: number;
  oldDebtRepayLamports: Decimal;
  /**
   * Old-debt early-repay penalty (in source-debt lamports). Non-zero only when the old debt is a fixed-term reserve
   * repaid before maturity. It funds the on-chain `repay + penalty` debit and must NOT change the repay-instruction
   * amount, the collateral fraction, or the LTV projection.
   */
  oldDebtEarlyRepayPenaltyLamports: Decimal;
  /** Old-debt funding = repay principal + penalty; the flash-borrow / swap must make this much old debt available. */
  oldDebtFundingLamports: Decimal;
  collToRedepositLamports: Decimal;
  /**
   * What the target obligation actually receives: equal to `collToRedepositLamports` for a partial
   * migration (the buffered withdraw funds the exact re-deposit), haircut by the redeem-drift factor
   * for a full migration (the U64_MAX withdraw redeems the *actual* balance, of which
   * `collToRedepositLamports` is only the off-chain estimate). See `redeem_drift.ts`.
   */
  collDepositLamports: Decimal;
  /** Cap for the (buffered) partial-migration withdraw: the floored collateral snapshot. */
  maxCollWithdrawLamports: Decimal;
  /** Whether the old obligation is emptied (full close) vs left alive and smaller (partial). */
  isFullMigration: boolean;
};

/**
 * Shared validation + derivation for both multiply debt-swap directions: derive the (single) collateral and old
 * debt from the obligation, resolve the migration-target obligation (existing or new), and size the old-debt repay
 * + the proportional collateral slice. For a full swap (`isClosingSourceDebt`) the whole position is moved
 * (`f = 1`). For a partial swap only the fraction `f = repay / outstanding` of the collateral is moved so the LTV
 * is preserved on both sides. For a NEW target, the elevation group honors `args.newElevationGroup` when the caller
 * specified one (including 0 = no emode, validated to be a usable common group), otherwise it is auto-selected for
 * the (collateral, new debt) pair (highest-LTV common group, or none). An EXISTING target always keeps its current
 * group; a request to a different group is rejected.
 */
async function prepareMultiplySwap(args: SwapDebtArgs, context: SwapDebtContext<any>): Promise<MultiplySwapPrep> {
  return planMultiplyMigration({
    market: context.market,
    obligation: context.obligation,
    sourceDebtReserve: context.sourceDebtReserve,
    targetDebtReserve: context.targetDebtReserve,
    // Collapse the resolved description back to a raw group id: `undefined` = caller did not specify (default
    // selection), `null` = group 0 / no emode, a description = that group.
    requestedElevationGroupId:
      args.newElevationGroup === undefined ? undefined : args.newElevationGroup?.elevationGroup ?? 0,
    isClosingSourceDebt: args.isClosingSourceDebt,
    sourceDebtSwapAmount: args.sourceDebtSwapAmount,
    currentSlot: context.currentSlot,
    currentLedgerInstant: context.currentLedgerInstant,
  });
}

/**
 * Pure planning core of a Multiply/Leverage debt-swap migration, shared by the builder ({@link prepareMultiplySwap})
 * and the FE preview ({@link getSwapDebtObligationsPreview}) so the two can never drift on target selection,
 * elevation group, or collateral sizing (the drift this consolidation prevents). It needs only market/obligation/
 * reserve data plus the requested amount and group — no signer, quoter or swapper — so it runs unchanged in a
 * read-only preview.
 *
 * `requestedElevationGroupId` is the raw group id the caller wants the target to end in: `undefined` = default
 * selection (a NEW target auto-picks the highest-LTV common group for the (collateral, new debt) pair, an EXISTING
 * target keeps its current group), `0` = no emode, N = exactly that group (validated to be a usable common group for
 * a new target; rejected for an existing target whose current group differs, since a migration never regroups it).
 */
async function planMultiplyMigration(params: {
  market: KaminoMarket;
  obligation: KaminoObligation;
  sourceDebtReserve: KaminoReserve;
  targetDebtReserve: KaminoReserve;
  requestedElevationGroupId: number | undefined;
  isClosingSourceDebt: boolean;
  sourceDebtSwapAmount: Decimal;
  currentSlot: Slot;
  currentLedgerInstant?: LedgerInstant;
}): Promise<MultiplySwapPrep> {
  const {
    market,
    obligation,
    sourceDebtReserve,
    targetDebtReserve,
    requestedElevationGroupId,
    isClosingSourceDebt,
    sourceDebtSwapAmount,
    currentSlot,
    currentLedgerInstant,
  } = params;

  // A multiply obligation holds exactly one collateral and one debt; derive both from the snapshot.
  const deposits = obligation.getDeposits();
  const borrows = obligation.getBorrows();
  if (deposits.length !== 1 || borrows.length !== 1) {
    throw new Error(
      `Multiply obligation ${obligation.obligationAddress} must have exactly one collateral and one debt (found ${deposits.length} collateral, ${borrows.length} debt)`
    );
  }
  const collReserve = market.getExistingReserveByAddress(deposits[0].reserveAddress, 'Collateral');
  const oldDebtMint = borrows[0].mintAddress;
  if (sourceDebtReserve.getLiquidityMint() !== oldDebtMint) {
    throw new Error(
      `sourceDebtReserve mint ${sourceDebtReserve.getLiquidityMint()} does not match the obligation's debt mint ${oldDebtMint}`
    );
  }

  // Reject a non-closing swap of the FULL outstanding debt. `sourceDebtSwapAmount >= outstanding` with
  // `isClosingSourceDebt=false` would clamp the proportional factor to 1 (withdrawing ~all collateral) while repaying
  // only the snapshot amount WITHOUT the full-close interest buffer — leaving accrued-interest dust as residual debt
  // in an effectively-emptied old obligation. A full swap must go through `isClosingSourceDebt=true`, which sizes the
  // repay with the interest buffer and closes the old obligation cleanly.
  if (!isClosingSourceDebt) {
    if (sourceDebtSwapAmount.lte(0)) {
      throw new Error('Cannot swap a non-positive amount');
    }
    const outstanding = obligation.getBorrowAmountByReserve(sourceDebtReserve);
    if (sourceDebtSwapAmount.gt(outstanding)) {
      throw new Error(
        `sourceDebtSwapAmount ${sourceDebtSwapAmount} exceeds the obligation's current ${sourceDebtReserve.symbol} debt (${outstanding}); pass isClosingSourceDebt=true to swap the full position`
      );
    }
    if (sourceDebtSwapAmount.eq(outstanding)) {
      throw new Error(
        `sourceDebtSwapAmount ${sourceDebtSwapAmount} equals the obligation's current ${sourceDebtReserve.symbol} debt (${outstanding}); pass isClosingSourceDebt=true to swap the full position (a non-closing full repay would clamp to a full migration but leave accrued-interest dust in the old obligation)`
      );
    }
  }

  // The obligation the position is migrated into — the SAME type as the old one (Multiply→Multiply,
  // Leverage→Leverage; fixed-rate variants are gated upstream for now), just seeded with the new debt.
  // `getObligationType` resolves the mint seeds per tag and preserves the type tag. The PDA is seeded by the
  // position's OWNER (the only account that can sign the init / hold the migrated position).
  const newObligationType = getObligationType(
    market,
    obligation.obligationTag,
    some(collReserve.address),
    some(targetDebtReserve.address)
  );
  const newObligationAddress = await newObligationType.toPda(market.getAddress(), obligation.state.owner);

  // The target obligation may already exist (grow it) or not (init a new one). When it exists we (1) keep its type
  // identical to the old one, (2) ensure it holds exactly the (collateral, new debt) pair — a multiply/leverage
  // obligation has a single collateral + single debt — and (3) leave its elevation group untouched (no silent
  // regroup). When it is new, passing the `ObligationType` makes the deposit+borrow action emit InitObligation and
  // auto-select the best common elevation group, the same path the production multiply-deposit flow uses.
  const existingTarget = await market.getObligationByAddress(newObligationAddress);
  if (existingTarget !== null) {
    if (existingTarget.obligationTag !== obligation.obligationTag) {
      throw new Error(
        `target obligation ${newObligationAddress} has type tag ${existingTarget.obligationTag} but the migrated obligation is tag ${obligation.obligationTag}; the target's type must match`
      );
    }
    // Compatibility is keyed by RESERVE, not mint. Multiply/Leverage PDAs are mint-seeded, but obligation positions
    // are keyed by reserve address and a market can have multiple reserves for the same mint (e.g. a float-rate and a
    // fixed-rate reserve). A mint-only check would accept a target that already holds the same mint through a
    // DIFFERENT reserve, after which depositAndBorrow would add a second reserve position and break the
    // single-collateral/single-debt assumption the rest of this flow relies on.
    const targetDeposits = existingTarget.getDeposits();
    const targetBorrows = existingTarget.getBorrows();
    const collOk =
      targetDeposits.length === 0 ||
      (targetDeposits.length === 1 && targetDeposits[0].reserveAddress === collReserve.address);
    const debtOk =
      targetBorrows.length === 0 ||
      (targetBorrows.length === 1 && targetBorrows[0].reserveAddress === targetDebtReserve.address);
    if (!collOk || !debtOk) {
      throw new Error(
        `target obligation ${newObligationAddress} already holds an incompatible position; a partial swap can only grow a target holding exactly (collateral reserve ${collReserve.address}, debt reserve ${targetDebtReserve.address})`
      );
    }
  }
  const isNewTarget = existingTarget === null;
  const targetObligation: KaminoObligation | ObligationType = existingTarget ?? newObligationType;
  const newTargetElevationGroup = existingTarget?.state.elevationGroup ?? 0;

  // Resolve the elevation group the deposit+borrow into the target should request. See the function doc for the
  // semantics of `requestedElevationGroupId`.
  let requestTargetElevationGroup: boolean;
  let targetElevationGroupOverride: number | undefined;
  if (isNewTarget) {
    if (requestedElevationGroupId === undefined) {
      requestTargetElevationGroup = market.getCommonElevationGroupsForPair(collReserve, targetDebtReserve).length > 0;
      targetElevationGroupOverride = undefined;
    } else if (requestedElevationGroupId === 0) {
      // Explicit "no emode": leave the brand-new obligation at the default group 0 (request nothing).
      requestTargetElevationGroup = false;
      targetElevationGroupOverride = undefined;
    } else {
      const commonGroups = market.getCommonElevationGroupsForPair(collReserve, targetDebtReserve);
      if (!commonGroups.includes(requestedElevationGroupId)) {
        throw new Error(
          `requested elevation group ${requestedElevationGroupId} is not a usable common group for collateral reserve ${
            collReserve.address
          } and target debt reserve ${targetDebtReserve.address} (usable: ${commonGroups.join(', ') || 'none'})`
        );
      }
      requestTargetElevationGroup = true;
      targetElevationGroupOverride = requestedElevationGroupId;
    }
  } else {
    if (requestedElevationGroupId !== undefined && requestedElevationGroupId !== newTargetElevationGroup) {
      throw new Error(
        `target obligation ${newObligationAddress} is already in elevation group ${newTargetElevationGroup}; the migration cannot move an existing obligation to requested elevation group ${requestedElevationGroupId}`
      );
    }
    requestTargetElevationGroup = false;
    targetElevationGroupOverride = undefined;
  }

  // The CONCRETE group the target ends in — used by the new-target LTV precheck and the FE preview so both project
  // the position at exactly the group execution requests (existing target keeps its own; new target uses the
  // override, the auto-selected best common group, or 0).
  const targetResultingElevationGroup = !isNewTarget
    ? newTargetElevationGroup
    : targetElevationGroupOverride !== undefined
    ? targetElevationGroupOverride
    : requestTargetElevationGroup
    ? market.getPreferredElevationGroupForBorrowPair(collReserve, targetDebtReserve)
    : 0;

  // Size the old-debt repay (full + IR buffer, or the partial amount) and the proportional collateral slice. The
  // slice is floored so the re-deposit is a conservative whole amount that never exceeds what the (ceil-rounded)
  // on-chain withdraw frees up; the resulting old-obligation LTV deviation is dust (see
  // computeMultiplyMigrationSizing) and is independently checked below.
  const oldDebtRepayLamports = resolveSourceDebtRepayLamports({
    market,
    obligation,
    sourceDebtReserve,
    isClosingSourceDebt,
    sourceDebtSwapAmount,
    currentSlot,
  });
  const sizing = computeMultiplyMigrationSizing({
    oldDebtRepayLamports,
    totalOldDebtLamports: borrows[0].amount,
    collateralSnapshotLamports: deposits[0].amount,
    isClosingSourceDebt,
  });
  if (sizing.collToMoveLamports.lte(0)) {
    throw new Error(
      `Multiply debt swap moves no collateral: sourceDebtSwapAmount ${sourceDebtSwapAmount} is too small relative to the position`
    );
  }

  // Fixed-term old debt charges an early-repay penalty on top of the repay. The flash-borrow / swap must produce
  // principal + penalty old debt so the repay+withdraw of the old obligation succeeds; the repay instruction amount
  // and the collateral fraction stay on the principal.
  const oldDebtEarlyRepayPenaltyLamports = resolveSourceDebtEarlyRepayPenaltyLamports({
    obligation,
    sourceDebtReserve,
    repayPrincipalLamports: sizing.oldDebtRepayLamports,
    currentSlot,
    currentLedgerInstant,
  });

  return {
    collReserve,
    targetObligation,
    newObligationAddress,
    isNewTarget,
    newTargetElevationGroup,
    requestTargetElevationGroup,
    targetElevationGroupOverride,
    targetResultingElevationGroup,
    oldDebtRepayLamports: sizing.oldDebtRepayLamports,
    oldDebtEarlyRepayPenaltyLamports,
    oldDebtFundingLamports: sizing.oldDebtRepayLamports.add(oldDebtEarlyRepayPenaltyLamports),
    collToRedepositLamports: sizing.collToMoveLamports,
    collDepositLamports: sizing.isFullMigration
      ? haircutPullForRedeemDrift(sizing.collToMoveLamports)
      : sizing.collToMoveLamports,
    maxCollWithdrawLamports: deposits[0].amount.floor(),
    isFullMigration: sizing.isFullMigration,
  };
}

/**
 * How a multiply debt swap maps the (always newDebt → oldDebt) swap onto a flash loan. The two concrete directions
 * are built in {@link getSwapDebtForMultiply}.
 */
type MultiplyFlashDirection = {
  flashBorrowToken: SwapDebtFlashBorrowToken;
  /** Minimum amount of old debt the swap must output. */
  minSwapOutLamports: Decimal;
  /** Given the resolved new-debt swap input, the flash-borrow amount and the new obligation's borrow amount. */
  resolveAmounts: (swapInputLamports: Decimal) => { flashBorrowLamports: Decimal; newDebtBorrowLamports: Decimal };
};

/**
 * Shared driver for both multiply debt-swap directions. The swap is always newDebt → oldDebt; `direction` decides
 * which debt is flash-borrowed, how much the swap must yield, and how the flash-borrow / new-borrow amounts derive
 * from the swap input. Steps: estimate the swap input from oracle prices for account discovery → quote → size the
 * actual input from the live quote → filter viable routes → validate the resulting LTV once → build per route.
 */
async function runMultiplySwapFlow<QuoteResponse>(
  args: SwapDebtArgs,
  context: SwapDebtContext<QuoteResponse>,
  prep: MultiplySwapPrep,
  direction: MultiplyFlashDirection
): Promise<Array<SwapDebtIxsOutputs<QuoteResponse>>> {
  const { sourceDebtReserve, targetDebtReserve } = context;
  const { collReserve, newObligationAddress, oldDebtRepayLamports } = prep;
  const { flashBorrowToken, minSwapOutLamports } = direction;
  const newDebtMint = targetDebtReserve.getLiquidityMint();
  const oldDebtMint = sourceDebtReserve.getLiquidityMint();
  const flashBorrowReserve = flashBorrowToken === 'targetDebt' ? targetDebtReserve : sourceDebtReserve;

  const buildKlend = makeMultiplyBuildKlend(context, prep, direction);

  const { klendAccounts, estSwapInputLamports } = await computeMultiplyKlendAccounts(
    args,
    context,
    direction,
    buildKlend
  );
  const swapSizingBufferDivisor = getSlippageFactor(args.slippagePct);

  // Quote newDebt → oldDebt; size the actual swap input so real fill at `priceAInB × (1 - buffer)`
  // still produces ≥ minSwapOutLamports.
  const swapInputs = { inputAmountLamports: estSwapInputLamports, inputMint: newDebtMint, outputMint: oldDebtMint };
  const swapQuote = await context.quoter(swapInputs, klendAccounts);
  assertPositiveFiniteDecimal('swap-debt (multiply) swap quote priceAInB', swapQuote.priceAInB);
  const actualSwapInputLamports = minSwapOutLamports
    .div(sourceDebtReserve.getMintFactor())
    .div(swapQuote.priceAInB)
    .div(swapSizingBufferDivisor)
    .mul(targetDebtReserve.getMintFactor())
    .ceil();

  const swapResponses = await context.swapper(
    { inputAmountLamports: actualSwapInputLamports, inputMint: newDebtMint, outputMint: oldDebtMint },
    klendAccounts,
    swapQuote
  );

  // No off-chain price filter (see flow A/B comment). Slippage buffer + on-chain min_out + the
  // downstream sourceDebt repay step gate any route that under-delivers at execution time.
  const routeResponses = swapResponses.map((swapResp) => {
    const swapOutLamports = swapResp.quote.priceAInB
      .mul(actualSwapInputLamports)
      .div(targetDebtReserve.getMintFactor())
      .mul(sourceDebtReserve.getMintFactor());
    return { swapResp, swapOutLamports };
  });
  if (routeResponses.length === 0) {
    throw new Error(`Swapper returned no routes for the multiply debt swap`);
  }

  const { flashBorrowLamports, newDebtBorrowLamports } = direction.resolveAmounts(actualSwapInputLamports);
  const flashRepayLamports = calculateFlashRepayLamports(flashBorrowReserve, flashBorrowLamports, context);

  // The resulting obligations (the old one after the partial repay/withdraw, and the target after the
  // deposit/borrow) are identical across routes, so validate them once rather than per route.
  checkResultingMultiplyObligationsValid(context, prep, newDebtBorrowLamports);

  return Promise.all(
    routeResponses.map(async ({ swapResp, swapOutLamports }) => {
      const klendIxs = await buildKlend(actualSwapInputLamports);

      return {
        ixs: listMultiplyIxs(klendIxs, flashBorrowToken, [
          ...swapResp.preActionIxs,
          ...removeBudgetIxs(swapResp.swapIxs),
        ]),
        lookupTables: swapResp.lookupTables,
        useV2Ixs: context.useV2Ixs,
        simulationDetails: {
          flashLoan: {
            flashBorrowReserveMint: flashBorrowReserve.getLiquidityMint(),
            flashBorrowedAmount: flashBorrowLamports.div(flashBorrowReserve.getMintFactor()),
            flashRepaidAmount: flashRepayLamports.div(flashBorrowReserve.getMintFactor()),
          },
          externalSwap: {
            swapInMint: newDebtMint,
            swapOutMint: oldDebtMint,
            swapInAmount: actualSwapInputLamports.div(targetDebtReserve.getMintFactor()),
            swapOutAmount: swapOutLamports.div(sourceDebtReserve.getMintFactor()),
            quoteResponse: swapResp.quote.quoteResponse,
          },
          newObligationAddress,
          migratedCollateralAmount: prep.collDepositLamports.div(collReserve.getMintFactor()),
          repaidOldDebtAmount: oldDebtRepayLamports.div(sourceDebtReserve.getMintFactor()),
          earlyRepayPenaltyLamports: prep.oldDebtEarlyRepayPenaltyLamports,
          reorigination: targetDebtReserve.getFixedTermReorigination(),
        },
      };
    })
  );
}

type SwapDebtForMultiplyKlendIxs = {
  setupIxs: Instruction[];
  flashBorrowIx: Instruction;
  repayWithdrawOldIxs: Instruction[];
  depositBorrowNewIxs: Instruction[];
  flashRepayIx: Instruction;
  cleanupIxs: Instruction[];
  flashLoanInfo: FlashLoanInfo;
};

async function buildSwapDebtForMultiplyKlendIxs(
  context: SwapDebtContext<any>,
  prep: MultiplySwapPrep,
  flashBorrowToken: SwapDebtFlashBorrowToken,
  flashBorrowLamports: Decimal,
  newDebtBorrowLamports: Decimal
): Promise<SwapDebtForMultiplyKlendIxs> {
  const { market, sourceDebtReserve, targetDebtReserve, owner, obligation, currentSlot, referrer } = context;
  const {
    collReserve,
    targetObligation,
    isFullMigration,
    oldDebtRepayLamports,
    collToRedepositLamports,
    requestTargetElevationGroup,
    targetElevationGroupOverride,
  } = prep;

  // ATAs for the old debt, the new debt and the collateral (redeem/deposit). The flash loan is taken in whichever
  // debt the caller selected, so its destination ATA is chosen accordingly.
  const atasAndIxs = await createAtasIdempotent(owner, [
    { mint: sourceDebtReserve.getLiquidityMint(), tokenProgram: sourceDebtReserve.getLiquidityTokenProgram() },
    { mint: targetDebtReserve.getLiquidityMint(), tokenProgram: targetDebtReserve.getLiquidityTokenProgram() },
    { mint: collReserve.getLiquidityMint(), tokenProgram: collReserve.getLiquidityTokenProgram() },
  ]);
  const sourceDebtAta = atasAndIxs[0].ata;
  const targetDebtAta = atasAndIxs[1].ata;
  const setupIxs = atasAndIxs.map((t) => t.createAtaIx);
  if (context.scopeRefreshIx?.length) {
    setupIxs.unshift(...context.scopeRefreshIx);
  }

  // 'sourceDebt' → flash-borrow the old debt; 'targetDebt' → flash-borrow the new debt.
  const flashBorrowReserve = flashBorrowToken === 'targetDebt' ? targetDebtReserve : sourceDebtReserve;
  const flashBorrowAta = flashBorrowToken === 'targetDebt' ? targetDebtAta : sourceDebtAta;

  const { flashBorrowIx, flashRepayIx } = getFlashLoanInstructions({
    borrowIxIndex: setupIxs.length,
    userTransferAuthority: owner,
    lendingMarketAuthority: await market.getLendingMarketAuthority(),
    lendingMarketAddress: market.getAddress(),
    reserve: flashBorrowReserve,
    amountLamports: flashBorrowLamports,
    destinationAta: flashBorrowAta,
    referrerAccount: none(),
    referrerTokenState: none(),
    programId: market.programId,
  });

  // 1. Repay the old debt and withdraw collateral from the old obligation. A full migration empties it
  // (repay/withdraw U64_MAX → repay all debt, redeem all cTokens). A partial migration repays exactly
  // `oldDebtRepayLamports` and withdraws `collToRedepositLamports` of *liquidity* — `buildRepayAndWithdrawTxns`
  // converts that to a cToken amount internally with a CEIL (getWithdrawCollateralAmount). NOTE: that CEIL only
  // guarantees the redeem covers `collToRedepositLamports` at the *estimated* exchange rate — at the *actual*
  // execution-slot rate the floor-rounded redeem can still pay out a few lamports less, so the withdraw is
  // additionally buffered (see `redeem_drift.ts`) to keep the exact re-deposit below funded. The excess lands in
  // the wallet; the old obligation gives up marginally more collateral than the floored slice (a
  // health-negligible dust effect that the old-obligation LTV check accounts for — that check is optimistic only by
  // this same dust). Use the V1/V2-aware builder so the whole migration transaction is coherent with the caller's
  // `useV2Ixs` (the new deposit+borrow below and the returned metadata both honor it).
  const repayAmount = isFullMigration ? U64_MAX : oldDebtRepayLamports.toFixed(0);
  const withdrawAmount = redeemWithdrawAmount(collToRedepositLamports, isFullMigration, prep.maxCollWithdrawLamports);
  const repayWithdrawAction = await KaminoAction.buildRepayAndWithdrawTxns({
    kaminoMarket: market,
    repayAmount,
    repayReserveAddress: sourceDebtReserve.address,
    withdrawAmount,
    withdrawReserveAddress: collReserve.address,
    payer: owner,
    currentSlot,
    obligation,
    useV2Ixs: context.useV2Ixs,
    scopeRefreshConfig: undefined,
    extraComputeBudget: 0,
    includeAtaIxs: false,
    requestElevationGroup: false,
    initUserMetadata: { skipInitialization: true, skipLutCreation: true },
    referrer,
  });
  const repayWithdrawOldIxs = removeBudgetIxs(KaminoAction.actionToIxs(repayWithdrawAction));

  // 2. Deposit the collateral and borrow the new debt into the target obligation. The elevation-group request was
  // resolved once in `prepareMultiplySwap` (see {@link MultiplySwapPrep}). For a NEW target (`targetObligation` is an
  // `ObligationType`, not a loaded obligation) the action emits the InitObligation ix and requests
  // `targetElevationGroupOverride` when set — or, when it is undefined and `requestTargetElevationGroup` is true,
  // auto-selects the highest-LTV common group (via getPreferredElevationGroupForBorrowPair, the production
  // multiply-deposit behavior). For an ALREADY-EXISTING target we pass the loaded obligation (no InitObligation) with
  // `requestTargetElevationGroup: false`, so its current elevation group is respected — a partial swap never silently
  // regroups an existing position.
  const depositBorrowAction = await KaminoAction.buildDepositAndBorrowTxns({
    kaminoMarket: market,
    // Full migrations haircut the deposit against the U64_MAX redeem of the actual balance;
    // partial migrations deposit exactly, funded by the buffered withdraw above (see prep docs).
    depositAmount: prep.collDepositLamports.toFixed(0),
    depositReserveAddress: collReserve.address,
    borrowAmount: newDebtBorrowLamports.toFixed(0),
    borrowReserveAddress: targetDebtReserve.address,
    owner,
    obligation: targetObligation,
    useV2Ixs: context.useV2Ixs,
    scopeRefreshConfig: undefined,
    extraComputeBudget: 0,
    includeAtaIxs: false,
    requestElevationGroup: requestTargetElevationGroup,
    overrideElevationGroupRequest: targetElevationGroupOverride,
    initUserMetadata: { skipInitialization: true, skipLutCreation: true },
    referrer,
    currentSlot,
  });
  const depositBorrowNewIxs = removeBudgetIxs(KaminoAction.actionToIxs(depositBorrowAction));

  const cleanupIxs = [...(await getMultiplyAtaCloseIxs(context, collReserve)), ...context.budgetAndPriorityFeeIxs];

  return {
    setupIxs,
    flashBorrowIx,
    repayWithdrawOldIxs,
    depositBorrowNewIxs,
    flashRepayIx,
    cleanupIxs,
    flashLoanInfo: {
      flashBorrowReserve: flashBorrowReserve.address,
      flashLoanFee: flashBorrowReserve.getFlashLoanFee(),
    },
  };
}

function listMultiplyIxs(
  klend: SwapDebtForMultiplyKlendIxs,
  flashBorrowToken: SwapDebtFlashBorrowToken,
  externalSwapIxs?: Instruction[]
): Instruction[] {
  if (flashBorrowToken === 'targetDebt') {
    // Early swap: flashBorrow(new) → swap(new→old) → repay+withdraw(old) → init+deposit+borrow(new) → flashRepay(new).
    return [
      ...klend.setupIxs,
      klend.flashBorrowIx,
      ...(externalSwapIxs || []),
      ...klend.repayWithdrawOldIxs,
      ...klend.depositBorrowNewIxs,
      klend.flashRepayIx,
      ...klend.cleanupIxs,
    ];
  }
  // Late swap: flashBorrow(old) → repay+withdraw(old) → init+deposit+borrow(new) → swap(new→old) → flashRepay(old).
  return [
    ...klend.setupIxs,
    klend.flashBorrowIx,
    ...klend.repayWithdrawOldIxs,
    ...klend.depositBorrowNewIxs,
    ...(externalSwapIxs || []),
    klend.flashRepayIx,
    ...klend.cleanupIxs,
  ];
}

async function getMultiplyAtaCloseIxs(context: SwapDebtContext<any>, collReserve: KaminoReserve) {
  const ataCloseIxs: Instruction[] = [];
  if (
    context.sourceDebtReserve.getLiquidityMint() === WRAPPED_SOL_MINT ||
    context.targetDebtReserve.getLiquidityMint() === WRAPPED_SOL_MINT ||
    collReserve.getLiquidityMint() === WRAPPED_SOL_MINT
  ) {
    // Closing a native-mint (WSOL) token account is the standard unwrap: it transfers the *entire* remaining
    // balance (including any leftover collateral dust we deliberately did not re-deposit) back to the owner as SOL
    // and closes the account. Unlike non-native mints, close does not require a zero balance here.
    const wsolAta = await getAssociatedTokenAddress(WRAPPED_SOL_MINT, context.owner.address);
    ataCloseIxs.push(
      getCloseAccountInstruction(
        { account: wsolAta, owner: context.owner, destination: context.owner.address },
        { programAddress: TOKEN_PROGRAM_ADDRESS }
      )
    );
  }
  return ataCloseIxs;
}

/**
 * Validate the obligations a multiply/leverage debt swap produces:
 *  (a) the TARGET obligation (new or grown) stays within its (collateral, new debt) pair max LTV and at/above the
 *      market's minimum net value;
 *  (b) for a PARTIAL swap, the OLD obligation remains healthy after the proportional repay/withdraw — its LTV must
 *      not exceed its pair max and its net value must stay at/above the market minimum (a full swap empties it, so
 *      there is nothing to check).
 *
 * The on-chain debt grows by the borrow + origination fee, so the fee-included amount is fed into every check. All
 * checks are pure (no extra RPC) so a caller can size around them before sending. The error message for the new
 * target's LTV is kept verbatim from the previous full-swap-only validation for compatibility.
 */
function checkResultingMultiplyObligationsValid(
  context: SwapDebtContext<any>,
  prep: MultiplySwapPrep,
  newDebtBorrowLamports: Decimal
): void {
  const { market, sourceDebtReserve, targetDebtReserve, obligation, currentSlot } = context;
  const {
    collReserve,
    collToRedepositLamports,
    collDepositLamports,
    oldDebtRepayLamports,
    isFullMigration,
    isNewTarget,
    targetObligation,
    newTargetElevationGroup,
    targetResultingElevationGroup,
  } = prep;
  // The on-chain `min_net_value_in_obligation` invariant is applied PER POSITION (each collateral/debt position's
  // post-action market value, when non-zero, must clear the threshold), not against the whole-obligation net value.
  // We deliberately validate the stricter whole-obligation net value here (net ≤ any single position value): it is a
  // conservative early reject and, for the single-collateral/single-debt Multiply/Leverage shape with the dust-level
  // default threshold, the LTV check above already fires first in any realistic case. Not worth matching 1:1.
  const minNetValue = market.getMinNetValueObligation();

  const newDebtWithFeesLamports = KaminoObligation.getDebtWithFeesForBorrowAmount(
    newDebtBorrowLamports,
    market,
    targetDebtReserve,
    isSome(context.referrer)
  );

  // (a) Target obligation health.
  if (isNewTarget) {
    // Brand-new obligation: there is no on-chain position to simulate against, so use the (collateral, new debt) pair
    // LTV/borrow-factor directly, AT THE CONCRETE ELEVATION GROUP the deposit+borrow will land in
    // (`targetResultingElevationGroup`) so the precheck matches what executes. In an emode group `maxLtv` is the
    // group's (higher) LTV and `borrowFactor` is 1; at group 0 it falls back to the reserves' own LTV and borrow factor.
    const { maxLtv, borrowFactor } = market.getMaxAndLiquidationLtvAndBorrowFactorForPair(
      collReserve.address,
      targetDebtReserve.address,
      targetResultingElevationGroup
    );
    // Validate against the ACTUAL deposit (haircut on full migrations), not the pre-haircut slice.
    const collValueUsd = collDepositLamports.div(collReserve.getMintFactor()).mul(collReserve.getOracleMarketPrice());
    const debtValueUsd = newDebtWithFeesLamports
      .div(targetDebtReserve.getMintFactor())
      .mul(targetDebtReserve.getOracleMarketPrice());
    const loanToValue = debtValueUsd.mul(borrowFactor).div(collValueUsd);
    if (loanToValue.gt(maxLtv)) {
      throw new Error(
        `Multiply debt swap would result in the new obligation's LTV ${loanToValue} exceeding its max LTV ${maxLtv}`
      );
    }
    const netValueUsd = collValueUsd.sub(debtValueUsd);
    if (netValueUsd.lt(minNetValue)) {
      throw new Error(
        `Multiply debt swap would create a new obligation with net value ${netValueUsd} below the market minimum ${minNetValue}`
      );
    }
  } else {
    // Existing target: simulate adding the slice onto its current position, AT ITS CURRENT elevation group (the
    // builder never regroups an existing target — it requests no group change). Validate against the obligation's
    // OWN borrow limit at that group, derived from the same simulation — NOT
    // `getMaxAndLiquidationLtvAndBorrowFactorForPair`, which returns the best common pair group's (higher) max LTV.
    // Using the pair max would falsely accept a position that is over the active group's borrow limit but under the
    // best-pair limit, returning a route the program will reject. `borrowLimit` and `loanToValue` here are both
    // computed at `elevationGroupOverride`, so `borrowLimit / userTotalCollateralDeposit` is the active max LTV
    // (matching how the vanilla flow's `checkResultingObligationValid` validates).
    const target = targetObligation as KaminoObligation;
    const { stats } = target.getSimulatedObligationStats({
      action: 'depositAndBorrow',
      // The ACTUAL deposit (haircut on full migrations), not the pre-haircut slice.
      amountCollateral: collDepositLamports,
      collateralReserveAddress: collReserve.address,
      amountDebt: newDebtWithFeesLamports,
      debtReserveAddress: targetDebtReserve.address,
      market,
      reserves: market.reserves,
      slot: currentSlot,
      elevationGroupOverride: newTargetElevationGroup,
    });
    const activeMaxLtv = stats.borrowLimit.div(stats.userTotalCollateralDeposit);
    if (stats.loanToValue.gt(activeMaxLtv)) {
      throw new Error(
        `Multiply debt swap would result in the target obligation's LTV ${stats.loanToValue} exceeding its max LTV ${activeMaxLtv} at its current elevation group ${newTargetElevationGroup}`
      );
    }
    if (stats.netAccountValue.lt(minNetValue)) {
      throw new Error(
        `Multiply debt swap would leave the target obligation with net value ${stats.netAccountValue} below the market minimum ${minNetValue}`
      );
    }
  }

  // (b) Old obligation health — only for a partial swap (a full swap empties the old obligation).
  if (!isFullMigration) {
    const bufferedWithdrawLamports = bufferWithdrawForRedeemDrift(
      collToRedepositLamports,
      prep.maxCollWithdrawLamports
    );
    const { stats } = obligation.getSimulatedObligationStats({
      action: 'repayAndWithdraw',
      amountDebt: oldDebtRepayLamports,
      debtReserveAddress: sourceDebtReserve.address,
      amountCollateral: bufferedWithdrawLamports,
      collateralReserveAddress: collReserve.address,
      market,
      reserves: market.reserves,
      slot: currentSlot,
    });
    // The old obligation keeps its CURRENT elevation group across a partial swap (the simulation uses its own group
    // by default). Validate against its own borrow limit at that group — not the best common pair group, which could
    // be higher and would falsely accept an old position left over its active group's max LTV.
    const activeMaxLtv = stats.borrowLimit.div(stats.userTotalCollateralDeposit);
    if (stats.loanToValue.gt(activeMaxLtv)) {
      throw new Error(
        `Multiply debt swap would leave the old obligation's LTV ${stats.loanToValue} exceeding its max LTV ${activeMaxLtv}`
      );
    }
    if (stats.netAccountValue.lt(minNetValue)) {
      throw new Error(
        `Multiply debt swap would leave the old obligation with net value ${stats.netAccountValue} below the market minimum ${minNetValue}`
      );
    }
  }
}

export interface SwapDebtObligationsPreviewInputs {
  market: KaminoMarket;
  /** The OLD Multiply/Leverage obligation being (partially) migrated, already loaded. */
  obligation: KaminoObligation;
  sourceDebtReserveAddress: Address;
  targetDebtReserveAddress: Address;
  /** Amount of source debt to repay/swap, in source-debt token units. Ignored when `isClosingSourceDebt`. */
  sourceDebtSwapAmount: Decimal;
  isClosingSourceDebt: boolean;
  /**
   * Which debt the execution will flash-borrow — MUST match the `flashBorrowToken` passed to `getSwapDebtIxs`. It
   * changes the new-debt amount through flash fees ('targetDebt' adds the target reserve's flash fee, 'sourceDebt'
   * the source reserve's), so the preview projects the matching target debt/LTV instead of an unfee'd estimate.
   */
  flashBorrowToken: SwapDebtFlashBorrowToken;
  /**
   * The elevation group the target should end up in — MUST match the `newElevationGroup` passed to `getSwapDebtIxs`,
   * so the preview projects the target at the same group execution will request. `undefined` = default selection (a
   * NEW target auto-picks the best common group, an EXISTING target keeps its current one), a number (including 0 =
   * no emode) = exactly that group. Omitting this while execution passes 0 would make the preview model a healthier
   * emode target than the transaction produces.
   */
  newElevationGroup?: number;
  slot: Slot;
  currentLedgerInstant?: LedgerInstant;
  referrer: Option<Address>;
  /**
   * Slippage percentage for the external swap (e.g. 0.5 for 0.5%). Kept for parity with the execution inputs; the
   * preview's new-debt amount is an oracle-price estimate (see `moved.newDebtBorrowedLamports`), so it does not bias
   * the estimate by slippage.
   */
  slippagePct: Decimal;
}

export type SwapDebtObligationsPreviewParams =
  | SwapDebtObligationsPreviewInputs
  | (Omit<SwapDebtObligationsPreviewInputs, 'slot'> & {
      slot?: Slot;
      currentLedgerInstant: LedgerInstant;
    });

export interface SwapDebtObligationPreviewSide {
  stats: ObligationStats;
  deposits: Map<Address, Position>;
  borrows: Map<Address, Position>;
}

export interface SwapDebtObligationsPreview {
  /** The OLD obligation after the (partial) repay+withdraw. `closed` when a full swap empties it. */
  old: SwapDebtObligationPreviewSide & { closed: boolean };
  /** The TARGET obligation after the deposit+borrow. `isNew` when it does not exist on-chain yet. */
  new: SwapDebtObligationPreviewSide & { isNew: boolean; address: Address };
  /**
   * The amounts the swap moves, in lamports. `oldDebtRepaidLamports` is exact (the same sizing the builder uses).
   * `collateralLamports` is the collateral the TARGET obligation actually receives — the redeem-drift-haircut deposit
   * on a full migration, the bare slice on a partial — matching the builder's deposit (the old obligation's withdraw
   * is sized separately/buffered). `newDebtBorrowedLamports` is an oracle-price estimate of the new borrow — the
   * executed amount differs by the live swap quote + slippage.
   */
  moved: { collateralLamports: Decimal; oldDebtRepaidLamports: Decimal; newDebtBorrowedLamports: Decimal };
}

/**
 * Preview what BOTH obligations look like after a Multiply/Leverage debt swap, without building or sending a
 * transaction — useful for a UI that wants to show the projected position before the user signs.
 *
 * It shares the builder's planning core ({@link planMultiplyMigration}) for target selection, elevation group and
 * collateral sizing, so the projection cannot drift from what {@link getSwapDebtIxs} executes — provided the caller
 * passes the SAME `newElevationGroup` and `flashBorrowToken`. The OLD obligation is simulated through a
 * `repayAndWithdraw` of the proportional slice (marked `closed` for a full swap, which empties it). The TARGET is
 * simulated through a `depositAndBorrow` at its resulting elevation group (its current group when it already exists,
 * the requested/auto-selected group when new). The new debt is estimated from oracle prices, includes the chosen
 * flash side's flash fee and the origination fee so the projected LTV lines up with on-chain — the executed borrow
 * still differs by the live swap quote + slippage.
 */
export async function getSwapDebtObligationsPreview(
  inputs: SwapDebtObligationsPreviewParams
): Promise<SwapDebtObligationsPreview> {
  const { market, obligation, sourceDebtSwapAmount, isClosingSourceDebt, flashBorrowToken, referrer } = inputs;
  // This preview models the Multiply/Leverage CROSS-OBLIGATION migration (old obligation shrinks/closes, target
  // obligation is created or grown), including the fixed-rate variants (tags 4/6). It does NOT model the in-place
  // vanilla/lending swap-debt flow (which keeps the same obligation and never moves collateral) — guarding here
  // mirrors the builder's dispatch in `getSwapDebtIxs` so callers can't get a nonsensical projection for those tags.
  const tag = obligation.obligationTag;
  if (!DEBT_SEEDED_OBLIGATION_TAGS.has(tag)) {
    throw new Error(
      `getSwapDebtObligationsPreview only models Multiply (${ObligationTypeTag.Multiply}/${ObligationTypeTag.MultiplyFixedRate}) ` +
        `and Leverage (${ObligationTypeTag.Leverage}/${ObligationTypeTag.LeverageFixedRate}) migrations; obligation tag ${tag} ` +
        `is not supported (vanilla/lending swap-debt is in-place)`
    );
  }

  if (inputs.sourceDebtReserveAddress === inputs.targetDebtReserveAddress) {
    throw new Error('Cannot swap from/to the same debt');
  }
  const sourceDebtReserve = market.getExistingReserveByAddress(inputs.sourceDebtReserveAddress, 'Source debt');
  const targetDebtReserve = market.getExistingReserveByAddress(inputs.targetDebtReserveAddress, 'Target debt');
  const ledger = await resolveLedgerInput(
    market.getRpc(),
    inputs.slot,
    inputs.currentLedgerInstant,
    sourceDebtReserve.getKind().isFixedRate() || !targetDebtReserve.state.config.debtMaturityTimestamp.eqn(0),
    'getSwapDebtObligationsPreview'
  );
  const slot = ledger.currentSlot;
  if (!targetDebtReserve.state.config.debtMaturityTimestamp.eqn(0)) {
    targetDebtReserve.assertCanOriginateDebt(
      Number(requireMatchingLedgerInstant(slot, ledger.currentLedgerInstant, 'getSwapDebtObligationsPreview').blockTime)
    );
  }

  // Share the builder's planning core: single-coll/debt + mint validation, the `>= outstanding` non-closing guard,
  // target obligation selection, the resolved elevation group, and the repay/collateral sizing — so preview and
  // execution can't diverge on any of those.
  const plan = await planMultiplyMigration({
    market,
    obligation,
    sourceDebtReserve,
    targetDebtReserve,
    requestedElevationGroupId: inputs.newElevationGroup,
    isClosingSourceDebt,
    sourceDebtSwapAmount,
    currentSlot: slot,
    currentLedgerInstant: ledger.currentLedgerInstant,
  });
  const {
    collReserve,
    targetObligation,
    newObligationAddress,
    isNewTarget,
    targetResultingElevationGroup,
    oldDebtRepayLamports,
    oldDebtFundingLamports,
    collToRedepositLamports,
    collDepositLamports,
    maxCollWithdrawLamports,
    isFullMigration,
  } = plan;

  const oldCollWithdrawLamports = isFullMigration
    ? collToRedepositLamports
    : bufferWithdrawForRedeemDrift(collToRedepositLamports, maxCollWithdrawLamports);

  // Estimate the new-debt borrow from oracle prices, mirroring the builder's two flash directions EXACTLY (same fee
  // order) so the projection doesn't drift on integer/ceil/min-fee rounding:
  //  - 'targetDebt': the swap input is the old-debt repay converted to target lamports; the new obligation then
  //    borrows that input + the TARGET reserve's flash fee. So: convert first, then apply the target flash fee.
  //  - 'sourceDebt': the swap must cover the SOURCE flash repay (old debt + source flash fee, computed in source
  //    lamports), and the new obligation borrows exactly that swap input. So: apply the source flash fee in source
  //    lamports first, then convert to target — no second fee.
  // (The preview uses the oracle price where the builder uses the live quote, so the executed borrow still differs by
  // the live swap quote + slippage.)
  const sourceOraclePxPreview = sourceDebtReserve.getOracleMarketPrice();
  const targetOraclePxPreview = targetDebtReserve.getOracleMarketPrice();
  assertPositiveFiniteDecimal('swap-debt (multiply preview) source oracle price', sourceOraclePxPreview);
  assertPositiveFiniteDecimal('swap-debt (multiply preview) target oracle price', targetOraclePxPreview);
  const oraclePxNewPerOld = sourceOraclePxPreview.div(targetOraclePxPreview);
  const sourceToTargetLamports = (sourceLamports: Decimal): Decimal =>
    sourceLamports
      .div(sourceDebtReserve.getMintFactor())
      .mul(oraclePxNewPerOld)
      .mul(targetDebtReserve.getMintFactor())
      .ceil();
  // Size from the FUNDING amount (principal + fixed-term early-repay penalty), exactly like the builder's
  // `buildMultiplyDirection`: the swap must produce principal + penalty old debt, so the new-debt borrow the
  // execution requests derives from the funding, not the bare repay principal. For open-term old debt the penalty
  // is 0 and funding == principal (unchanged behaviour).
  const newDebtBorrowLamports =
    flashBorrowToken === 'targetDebt'
      ? computeFlashRepayLamports(
          targetDebtReserve,
          sourceToTargetLamports(oldDebtFundingLamports),
          market.state.referralFeeBps,
          isSome(referrer)
        )
      : sourceToTargetLamports(
          computeFlashRepayLamports(
            sourceDebtReserve,
            oldDebtFundingLamports,
            market.state.referralFeeBps,
            isSome(referrer)
          )
        );
  const newDebtWithFeesLamports = KaminoObligation.getDebtWithFeesForBorrowAmount(
    newDebtBorrowLamports,
    market,
    targetDebtReserve,
    isSome(referrer)
  );

  // OLD obligation after the (partial) repay+withdraw — withdraw the buffered amount the builder actually removes.
  const oldSim = obligation.getSimulatedObligationStats({
    action: 'repayAndWithdraw',
    amountDebt: oldDebtRepayLamports,
    debtReserveAddress: sourceDebtReserve.address,
    amountCollateral: oldCollWithdrawLamports,
    collateralReserveAddress: collReserve.address,
    market,
    reserves: market.reserves,
    slot,
  });

  // TARGET obligation after the deposit+borrow — grown (existing) or initialised from empty (new), both at the
  // resulting elevation group the builder requests (`plan.targetResultingElevationGroup`).
  let newSide: SwapDebtObligationPreviewSide & { isNew: boolean; address: Address };
  if (!isNewTarget) {
    const sim = (targetObligation as KaminoObligation).getSimulatedObligationStats({
      action: 'depositAndBorrow',
      amountCollateral: collDepositLamports,
      collateralReserveAddress: collReserve.address,
      amountDebt: newDebtWithFeesLamports,
      debtReserveAddress: targetDebtReserve.address,
      market,
      reserves: market.reserves,
      slot,
      elevationGroupOverride: targetResultingElevationGroup,
    });
    newSide = { isNew: false, address: newObligationAddress, ...sim };
  } else {
    // Project a brand-new obligation: simulate the seeding deposit+borrow against EMPTY obligation state, in the
    // elevation group the on-chain init will land in. We build the empty base arrays here (rather than via a
    // KaminoObligation helper) to keep this preview self-contained — mirrors `KaminoObligation`'s own empty state.
    const emptyState = Obligation.decode(
      Buffer.concat([Obligation.discriminator, Buffer.alloc(Obligation.layout.span)])
    );
    const sim = KaminoObligation.simulateObligationStats({
      baseDeposits: emptyState.deposits,
      baseBorrows: emptyState.borrows,
      elevationGroup: targetResultingElevationGroup,
      action: 'depositAndBorrow',
      amountCollateral: collDepositLamports,
      collateralReserveAddress: collReserve.address,
      amountDebt: newDebtWithFeesLamports,
      debtReserveAddress: targetDebtReserve.address,
      market,
      slot,
    });
    newSide = { isNew: true, address: newObligationAddress, ...sim };
  }

  return {
    old: { closed: isFullMigration, ...oldSim },
    new: newSide,
    moved: {
      collateralLamports: collDepositLamports,
      oldDebtRepaidLamports: oldDebtRepayLamports,
      newDebtBorrowedLamports: newDebtBorrowLamports,
    },
  };
}
