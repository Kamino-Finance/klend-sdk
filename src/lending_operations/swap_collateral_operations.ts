import {
  ElevationGroupDescription,
  FeeCalculation,
  KaminoAction,
  KaminoMarket,
  KaminoObligation,
  KaminoReserve,
} from '../classes';
import { FlashLoanInfo, getFlashLoanInstructions, SwapIxsProvider, SwapQuoteProvider } from '../leverage';
import {
  createAtasIdempotent,
  DEFAULT_MAX_COMPUTE_UNITS,
  getAssociatedTokenAddress,
  getComputeBudgetAndPriorityFeeIxs,
  U64_MAX,
  uniqueAccountsWithProgramIds,
  WRAPPED_SOL_MINT,
} from '../utils';
import { Account, Address, Instruction, isSome, none, Option, Slot, TransactionSigner } from '@solana/kit';
import Decimal from 'decimal.js';
import { TOKEN_PROGRAM_ADDRESS } from '@solana-program/token';
import { AddressLookupTable } from '@solana-program/address-lookup-table';
import { getCloseAccountInstruction } from '@solana-program/token-2022';

/**
 * Inputs to the `getSwapCollIxs()` operation.
 */
export interface SwapCollIxsInputs<QuoteResponse> {
  /**
   * The amount of source collateral to be swapped-in for the target collateral.
   * This value will be treated exactly (i.e. slippage is not applied here) and thus must not exceed the collateral's
   * total amount.
   */
  sourceCollSwapAmount: Decimal;

  /**
   * If true, the source collateral will be closed - whatever amount is left after withdrawing `sourceCollSwapAmount`
   * will be transferred to the user.
   */
  isClosingSourceColl: boolean;

  /**
   * The mint of the source collateral token (i.e. the current one).
   */
  sourceCollTokenMint: Address;

  /**
   * The mint of the target collateral token (i.e. the new one).
   */
  targetCollTokenMint: Address;

  /**
   * An elevation group ID that the obligation should end up with after the collateral swap - it will be requested by
   * this operation (if different from the obligation's current elevation group).
   */
  newElevationGroup: number;

  // Note: the undocumented inputs below all have their most usual meaning used across the SDK.

  market: KaminoMarket;
  owner: TransactionSigner;
  obligation: KaminoObligation;
  referrer: Option<Address>;
  currentSlot: Slot;
  budgetAndPriorityFeeIxs?: Instruction[];
  scopeRefreshIx: Instruction[];
  useV2Ixs: boolean;
  quoter: SwapQuoteProvider<QuoteResponse>;
  swapper: SwapIxsProvider<QuoteResponse>;
  logger?: (msg: string, ...extra: any[]) => void;
}

/**
 * Outputs from the `getSwapCollIxs()` operation.
 */
export interface SwapCollIxsOutputs<QuoteResponse> {
  /**
   * Instructions for on-chain execution.
   */
  ixs: Instruction[];

  /**
   * Required LUTs.
   */
  lookupTables: Account<AddressLookupTable>[];

  /**
   * Whether the swap is using V2 instructions.
   */
  useV2Ixs: boolean;

  /**
   * Informational-only details of the token amounts/fees/rates that were used during construction of `ixs`.
   */
  simulationDetails: {
    /**
     * Details related to the flash-loan operation needed during collateral swap.
     */
    flashLoan: {
      /**
       * The amount of flash-borrowed target collateral.
       * It is also *exactly the amount of target collateral that gets added to the obligation*.
       */
      targetCollFlashBorrowedAmount: Decimal;

      /**
       * The flash-repaid amount.
       * Simply a `targetCollFlashBorrowedAmount` + any flash-loan fees.
       */
      targetCollFlashRepaidAmount: Decimal;
    };

    /**
     * Details related to the external DEX's swap operation (i.e. `swapper` input) needed during collateral swap.
     */
    externalSwap: {
      /**
       * The amount swapped-in to an external DEX.
       * It is also *exactly the amount of source collateral that gets removed from the obligation* (i.e. echoed back
       * `sourceCollSwapAmount` input).
       */
      sourceCollSwapInAmount: Decimal;

      /**
       * The amount swapped-out from an external DEX.
       * Please note that this field will be equal to the `flashBorrow.targetCollFlashRepaidAmount`, but an actual
       * on-chain swap-out is subject to slippage.
       */
      targetCollSwapOutAmount: Decimal;

      /**
       * The verbatim response coming from the input `quoter`.
       */
      quoteResponse?: QuoteResponse;
    };
  };
}

/**
 * Constructs instructions needed to partially/fully swap the given source collateral for some other collateral type.
 */
export async function getSwapCollIxs<QuoteResponse>(
  inputs: SwapCollIxsInputs<QuoteResponse>
): Promise<Array<SwapCollIxsOutputs<QuoteResponse>>> {
  const [args, context] = extractArgsAndContext(inputs);

  // Conceptually, we need to construct the following ixs:
  //  0. any set-up, like budgeting and ATAs
  //  1. `flash-borrowed target coll = targetCollReserve.flashBorrow()`
  //  2. `targetCollReserve.deposit(flash-borrowed target coll)`
  //  3. `sourceCollReserve.withdraw(requested amount to be coll-swapped)`
  //  4. `externally-swapped target coll = externalDex.swap(withdrawn current coll)`
  //  5. `flashRepay(externally-swapped target coll)`
  // However, there is a cyclic dependency:
  //  - To construct 4. (specifically, to query the external swap quote), we need to know all accounts used by Kamino's
  //    own ixs.
  //  - To construct 1. (i.e. flash-borrow), we need to know the target collateral swap-out from 4.

  // Construct the Klend's own ixs with a fake swap-out (only to learn the klend accounts used):

  const fakeKlendIxs = await getKlendIxs(args, FAKE_TARGET_COLL_SWAP_OUT_AMOUNT, context, inputs.scopeRefreshIx);
  const klendAccounts = uniqueAccountsWithProgramIds(listIxs(fakeKlendIxs));

  // Construct the external swap ixs (and learn the actual swap-out amount):
  const externalSwapIxsArray = await getExternalSwapIxs(args, klendAccounts, context);

  return Promise.all(
    externalSwapIxsArray.map(async (externalSwapIxs) => {
      // We now have the full information needed to simulate the end-state, so let's check that the operation is legal:
      context.logger(
        `Expected to swap ${args.sourceCollSwapAmount} ${context.sourceCollReserve.symbol} collateral into ${externalSwapIxs.swapOutAmount} ${context.targetCollReserve.symbol} collateral`
      );
      checkResultingObligationValid(args, externalSwapIxs.swapOutAmount, context);

      // Construct the Klend's own ixs with an actual swap-out amount:
      const klendIxs = await getKlendIxs(args, externalSwapIxs.swapOutAmount, context, inputs.scopeRefreshIx);

      return {
        ixs: listIxs(klendIxs, externalSwapIxs.ixs),
        lookupTables: externalSwapIxs.luts,
        useV2Ixs: context.useV2Ixs,
        simulationDetails: {
          flashLoan: {
            targetCollFlashBorrowedAmount: klendIxs.simulationDetails.targetCollFlashBorrowedAmount,
            targetCollFlashRepaidAmount: externalSwapIxs.swapOutAmount,
          },
          externalSwap: {
            sourceCollSwapInAmount: args.sourceCollSwapAmount, // repeated `/inputs.sourceCollSwapAmount`, only for clarity
            targetCollSwapOutAmount: externalSwapIxs.swapOutAmount, // repeated `../flashLoan.targetCollFlashRepaidAmount`, only for clarity
            quoteResponse: externalSwapIxs.simulationDetails.quoteResponse,
          },
        },
      };
    })
  );
}

type SwapCollArgs = {
  sourceCollSwapAmount: Decimal;
  isClosingSourceColl: boolean;
  newElevationGroup: ElevationGroupDescription | null;
};

type SwapCollContext<QuoteResponse> = {
  budgetAndPriorityFeeIxs: Instruction[];
  market: KaminoMarket;
  sourceCollReserve: KaminoReserve;
  targetCollReserve: KaminoReserve;
  owner: TransactionSigner;
  obligation: KaminoObligation;
  quoter: SwapQuoteProvider<QuoteResponse>;
  swapper: SwapIxsProvider<QuoteResponse>;
  referrer: Option<Address>;
  currentSlot: Slot;
  useV2Ixs: boolean;
  scopeRefreshIx: Instruction[];
  logger: (msg: string, ...extra: any[]) => void;
};

function extractArgsAndContext<QuoteResponse>(
  inputs: SwapCollIxsInputs<QuoteResponse>
): [SwapCollArgs, SwapCollContext<QuoteResponse>] {
  if (inputs.sourceCollTokenMint === inputs.targetCollTokenMint) {
    throw new Error(`Cannot swap from/to the same collateral`);
  }
  if (inputs.sourceCollSwapAmount.lte(0)) {
    throw new Error(`Cannot swap a negative amount`);
  }
  return [
    {
      sourceCollSwapAmount: inputs.sourceCollSwapAmount,
      isClosingSourceColl: inputs.isClosingSourceColl,
      newElevationGroup: inputs.market.getExistingElevationGroup(inputs.newElevationGroup, 'Newly-requested'),
    },
    {
      budgetAndPriorityFeeIxs:
        inputs.budgetAndPriorityFeeIxs || getComputeBudgetAndPriorityFeeIxs(DEFAULT_MAX_COMPUTE_UNITS),
      sourceCollReserve: inputs.market.getExistingReserveByMint(inputs.sourceCollTokenMint, 'Current collateral'),
      targetCollReserve: inputs.market.getExistingReserveByMint(inputs.targetCollTokenMint, 'Target collateral'),
      logger: console.log,
      market: inputs.market,
      obligation: inputs.obligation,
      owner: inputs.owner,
      quoter: inputs.quoter,
      swapper: inputs.swapper,
      referrer: inputs.referrer,
      scopeRefreshIx: inputs.scopeRefreshIx,
      currentSlot: inputs.currentSlot,
      useV2Ixs: inputs.useV2Ixs,
    },
  ];
}

const FAKE_TARGET_COLL_SWAP_OUT_AMOUNT = new Decimal(1); // see the lengthy `getSwapCollIxs()` impl comment

type SwapCollKlendIxs = {
  setupIxs: Instruction[];
  targetCollFlashBorrowIx: Instruction;
  depositTargetCollIxs: Instruction[];
  withdrawSourceCollIxs: Instruction[];
  targetCollFlashRepayIx: Instruction;
  cleanupIxs: Instruction[];
  flashLoanInfo: FlashLoanInfo;
  simulationDetails: {
    targetCollFlashBorrowedAmount: Decimal;
  };
};

async function getKlendIxs(
  args: SwapCollArgs,
  targetCollSwapOutAmount: Decimal,
  context: SwapCollContext<any>,
  scopeRefreshIx: Instruction[]
): Promise<SwapCollKlendIxs> {
  const { ataCreationIxs, targetCollAta } = await getAtaCreationIxs(context);
  const setupIxs = [...ataCreationIxs];

  if (scopeRefreshIx) {
    setupIxs.unshift(...scopeRefreshIx);
  }

  const targetCollFlashBorrowedAmount = calculateTargetCollFlashBorrowedAmount(targetCollSwapOutAmount, context);
  const { targetCollFlashBorrowIx, targetCollFlashRepayIx } = await getTargetCollFlashLoanIxs(
    targetCollFlashBorrowedAmount,
    setupIxs.length,
    targetCollAta,
    context
  );

  const depositTargetCollIxs = await getDepositTargetCollIxs(targetCollFlashBorrowedAmount, context);
  const withdrawSourceCollIxs = await getWithdrawSourceCollIxs(
    args,
    depositTargetCollIxs.removesElevationGroup,
    context
  );

  const cleanupIxs = [...(await getAtaCloseIxs(context)), ...context.budgetAndPriorityFeeIxs];

  return {
    setupIxs,
    flashLoanInfo: {
      flashBorrowReserve: context.targetCollReserve.address,
      flashLoanFee: context.targetCollReserve.getFlashLoanFee(),
    },
    targetCollFlashBorrowIx,
    depositTargetCollIxs: depositTargetCollIxs.ixs,
    withdrawSourceCollIxs,
    targetCollFlashRepayIx,
    cleanupIxs,
    simulationDetails: {
      targetCollFlashBorrowedAmount,
    },
  };
}

function calculateTargetCollFlashBorrowedAmount(
  targetCollFlashRepaidAmount: Decimal,
  context: SwapCollContext<any>
): Decimal {
  const { protocolFees, referrerFees } = context.targetCollReserve.calculateFees(
    targetCollFlashRepaidAmount.mul(context.targetCollReserve.getMintFactor()),
    context.targetCollReserve.getFlashLoanFee(),
    FeeCalculation.Inclusive, // denotes that the amount parameter above means "to be repaid" (not "borrowed")
    context.market.state.referralFeeBps,
    isSome(context.referrer)
  );
  const targetCollFlashLoanFee = protocolFees.add(referrerFees).div(context.targetCollReserve.getMintFactor());
  return targetCollFlashRepaidAmount.sub(targetCollFlashLoanFee);
}

async function getAtaCreationIxs(context: SwapCollContext<any>) {
  const atasAndAtaCreationIxs = await createAtasIdempotent(context.owner, [
    {
      mint: context.sourceCollReserve.getLiquidityMint(),
      tokenProgram: context.sourceCollReserve.getLiquidityTokenProgram(),
    },
    {
      mint: context.targetCollReserve.getLiquidityMint(),
      tokenProgram: context.targetCollReserve.getLiquidityTokenProgram(),
    },
  ]);
  return {
    ataCreationIxs: atasAndAtaCreationIxs.map((tuple) => tuple.createAtaIx),
    targetCollAta: atasAndAtaCreationIxs[1].ata,
  };
}

async function getAtaCloseIxs(context: SwapCollContext<any>) {
  const ataCloseIxs: Instruction[] = [];
  if (
    context.sourceCollReserve.getLiquidityMint() === WRAPPED_SOL_MINT ||
    context.targetCollReserve.getLiquidityMint() === WRAPPED_SOL_MINT
  ) {
    const owner = context.owner;
    const wsolAta = await getAssociatedTokenAddress(WRAPPED_SOL_MINT, owner.address);
    ataCloseIxs.push(
      getCloseAccountInstruction(
        { account: wsolAta, owner, destination: owner.address },
        { programAddress: TOKEN_PROGRAM_ADDRESS }
      )
    );
  }
  return ataCloseIxs;
}

async function getTargetCollFlashLoanIxs(
  targetCollAmount: Decimal,
  flashBorrowIxIndex: number,
  destinationAta: Address,
  context: SwapCollContext<any>
) {
  const { flashBorrowIx: targetCollFlashBorrowIx, flashRepayIx: targetCollFlashRepayIx } = getFlashLoanInstructions({
    borrowIxIndex: flashBorrowIxIndex,
    userTransferAuthority: context.owner,
    lendingMarketAuthority: await context.market.getLendingMarketAuthority(),
    lendingMarketAddress: context.market.getAddress(),
    reserve: context.targetCollReserve,
    amountLamports: targetCollAmount.mul(context.targetCollReserve.getMintFactor()),
    destinationAta,
    // TODO(referrals): once we support referrals, we will have to replace the placeholder args below:
    referrerAccount: none(),
    referrerTokenState: none(),
    programId: context.market.programId,
  });
  return { targetCollFlashBorrowIx, targetCollFlashRepayIx };
}

type DepositTargetCollIxs = {
  removesElevationGroup: boolean;
  ixs: Instruction[];
};

async function getDepositTargetCollIxs(
  targetCollAmount: Decimal,
  context: SwapCollContext<any>
): Promise<DepositTargetCollIxs> {
  const removesElevationGroup = mustRemoveElevationGroupBeforeDeposit(context);
  const depositCollAction = await KaminoAction.buildDepositTxns(
    context.market,
    targetCollAmount.mul(context.targetCollReserve.getMintFactor()).toString(), // in lamports
    context.targetCollReserve.getLiquidityMint(),
    context.owner,
    context.obligation,
    context.useV2Ixs,
    undefined, // we create the scope refresh ix outside of KaminoAction
    0, // no extra compute budget
    false, // we do not need ATA ixs here (we construct and close them ourselves)
    removesElevationGroup, // we may need to (temporarily) remove the elevation group; the same or a different one will be set on withdraw, if requested
    { skipInitialization: true, skipLutCreation: true }, // we are dealing with an existing obligation, no need to create user metadata
    context.referrer,
    context.currentSlot,
    removesElevationGroup ? 0 : undefined // only applicable when removing the group
  );
  return {
    ixs: KaminoAction.actionToIxs(depositCollAction),
    removesElevationGroup,
  };
}

function mustRemoveElevationGroupBeforeDeposit(context: SwapCollContext<any>): boolean {
  if (context.obligation.deposits.has(context.targetCollReserve.address)) {
    return false; // the target collateral already was a reserve in the obligation, so we do not affect any potential elevation group
  }
  const currentElevationGroupId = context.obligation.state.elevationGroup;
  if (currentElevationGroupId == 0) {
    return false; // simply nothing to remove
  }
  if (!context.targetCollReserve.state.config.elevationGroups.includes(currentElevationGroupId)) {
    return true; // the target collateral reserve is NOT in the obligation's group - must remove the group
  }
  const currentElevationGroup = context.market.getElevationGroup(currentElevationGroupId);
  if (context.obligation.deposits.size >= currentElevationGroup.maxReservesAsCollateral) {
    return true; // the obligation is already at its elevation group's deposits count limit - must remove the group
  }
  return false; // the obligation has some elevation group and the new collateral can be added to it
}

async function getWithdrawSourceCollIxs(
  args: SwapCollArgs,
  depositRemovedElevationGroup: boolean,
  context: SwapCollContext<any>
): Promise<Instruction[]> {
  const withdrawnSourceCollLamports = args.isClosingSourceColl
    ? U64_MAX
    : args.sourceCollSwapAmount.mul(context.sourceCollReserve.getMintFactor()).toString();
  const requestedElevationGroup = elevationGroupIdToRequestAfterWithdraw(args, depositRemovedElevationGroup, context);
  const withdrawCollAction = await KaminoAction.buildWithdrawTxns(
    context.market,
    withdrawnSourceCollLamports,
    context.sourceCollReserve.getLiquidityMint(),
    context.owner,
    context.obligation,
    context.useV2Ixs,
    undefined, // we create the scope refresh ix outside of KaminoAction
    0, // no extra compute budget
    false, // we do not need ATA ixs here (we construct and close them ourselves)
    requestedElevationGroup !== undefined, // the `elevationGroupIdToRequestAfterWithdraw()` has already decided on this
    { skipInitialization: true, skipLutCreation: true }, // we are dealing with an existing obligation, no need to create user metadata
    context.referrer,
    context.currentSlot,
    requestedElevationGroup,
    context.obligation.deposits.has(context.targetCollReserve.address) // if our obligation already had the target coll...
      ? undefined // ... then we need no customizations here, but otherwise...
      : {
          addedDepositReserves: [context.targetCollReserve.address], // ... we need to inform our infra that the obligation now has one more reserve that needs refreshing.
        }
  );
  return KaminoAction.actionToIxs(withdrawCollAction);
}

function elevationGroupIdToRequestAfterWithdraw(
  args: SwapCollArgs,
  depositRemovedElevationGroup: boolean,
  context: SwapCollContext<any>
): number | undefined {
  const obligationInitialElevationGroup = context.obligation.state.elevationGroup;
  const requestedElevationGroupId = args.newElevationGroup?.elevationGroup ?? 0;
  if (requestedElevationGroupId === 0) {
    // the user doesn't want any elevation group, and...
    if (obligationInitialElevationGroup === 0) {
      return undefined; // ... he already didn't have it - fine!
    }
    if (depositRemovedElevationGroup) {
      return undefined; // ... our deposit already forced us to remove it - fine!
    }
    return 0; // ... but he *did have one*, and our deposit didn't need to remove it - so we remove it now, just to satisfy him
  } else {
    // the user wants some elevation group, and...
    if (depositRemovedElevationGroup) {
      return requestedElevationGroupId; // ...our deposit forced us to remove it - so we now request the new one, whatever it is
    }
    if (obligationInitialElevationGroup === requestedElevationGroupId) {
      return undefined; // ...and he already had exactly this one - fine!
    }
    return requestedElevationGroupId; // ...and he had some different one - so we request the new one
  }
}

type ExternalSwapIxs<QuoteResponse> = {
  swapOutAmount: Decimal;
  ixs: Instruction[];
  luts: Account<AddressLookupTable>[];
  simulationDetails: {
    quoteResponse?: QuoteResponse;
  };
};

async function getExternalSwapIxs<QuoteResponse>(
  args: SwapCollArgs,
  klendAccounts: Address[],
  context: SwapCollContext<QuoteResponse>
): Promise<Array<ExternalSwapIxs<QuoteResponse>>> {
  const externalSwapInputs = {
    inputAmountLamports: args.sourceCollSwapAmount.mul(context.sourceCollReserve.getMintFactor()),
    inputMint: context.sourceCollReserve.getLiquidityMint(),
    outputMint: context.targetCollReserve.getLiquidityMint(),
  };
  const externalSwapQuote = await context.quoter(externalSwapInputs, klendAccounts);
  const externalSwapIxsAndLuts = await context.swapper(externalSwapInputs, klendAccounts, externalSwapQuote);

  // Note: we can ignore the returned `preActionIxs` field - we do not request any of them from the swapper.
  return externalSwapIxsAndLuts.map((externalSwapIxsAndLuts) => {
    const swapOutAmount = externalSwapIxsAndLuts.quote.priceAInB.mul(args.sourceCollSwapAmount);
    return {
      swapOutAmount,
      ixs: externalSwapIxsAndLuts.swapIxs,
      luts: externalSwapIxsAndLuts.lookupTables,
      simulationDetails: {
        quoteResponse: externalSwapIxsAndLuts.quote.quoteResponse,
      },
    };
  });
}

function checkResultingObligationValid(
  args: SwapCollArgs,
  targetCollAmount: Decimal,
  context: SwapCollContext<any>
): void {
  // The newly-requested elevation group must have its conditions satisfied:
  if (args.newElevationGroup !== null) {
    // Note: we cannot use the existing `isLoanEligibleForElevationGroup()`, since it operates on a `KaminoObligation`,
    // and our instance is stale (we want to assert on the state *after* potential changes).

    // Let's start with the (simpler) debt reserve - it cannot change during a coll-swap:
    const debtReserveAddresses = [...context.obligation.borrows.keys()];
    if (debtReserveAddresses.length > 1) {
      throw new Error(
        `The obligation with ${debtReserveAddresses.length} debt reserves cannot request any elevation group`
      );
    }
    if (debtReserveAddresses.length == 1) {
      const debtReserveAddress = debtReserveAddresses[0];
      if (args.newElevationGroup.debtReserve !== debtReserveAddress) {
        throw new Error(
          `The obligation with debt reserve ${debtReserveAddress} cannot request elevation group ${args.newElevationGroup.elevationGroup}`
        );
      }
    }

    // Now the coll reserves: this requires first finding out the resulting set of deposits:
    const collReserveAddresses = new Set<Address>([
      ...context.obligation.deposits.keys(),
      context.targetCollReserve.address,
    ]);
    if (args.isClosingSourceColl) {
      collReserveAddresses.delete(context.sourceCollReserve.address);
    }
    if (collReserveAddresses.size > args.newElevationGroup.maxReservesAsCollateral) {
      throw new Error(
        `The obligation with ${collReserveAddresses.size} collateral reserves cannot request elevation group ${args.newElevationGroup.elevationGroup}`
      );
    }
    for (const collReserveAddress of [...collReserveAddresses]) {
      if (!args.newElevationGroup.collateralReserves.has(collReserveAddress)) {
        throw new Error(
          `The obligation with collateral reserve ${collReserveAddress} cannot request elevation group ${args.newElevationGroup.elevationGroup}`
        );
      }
    }
  }

  // The LTV cannot be exceeded:
  const effectiveWithdrawAmount = args.isClosingSourceColl
    ? context.obligation.getDepositAmountByReserve(context.sourceCollReserve)
    : args.sourceCollSwapAmount;
  const resultingStats = context.obligation.getPostSwapCollObligationStats({
    withdrawAmountLamports: effectiveWithdrawAmount.mul(context.sourceCollReserve.getMintFactor()),
    withdrawReserveAddress: context.sourceCollReserve.address,
    depositAmountLamports: targetCollAmount.mul(context.targetCollReserve.getMintFactor()),
    depositReserveAddress: context.targetCollReserve.address,
    market: context.market,
    newElevationGroup: args.newElevationGroup?.elevationGroup ?? 0,
    slot: context.currentSlot,
  });
  const maxLtv = resultingStats.borrowLimit.div(resultingStats.userTotalCollateralDeposit);
  if (resultingStats.loanToValue > maxLtv) {
    throw new Error(
      `Swapping collateral ${effectiveWithdrawAmount} ${context.sourceCollReserve.symbol} into ${targetCollAmount} ${context.targetCollReserve.symbol} would result in the obligation's LTV ${resultingStats.loanToValue} exceeding its max LTV ${maxLtv}`
    );
  }
}

function listIxs(klendIxs: SwapCollKlendIxs, externalSwapIxs?: Instruction[]): Instruction[] {
  return [
    ...klendIxs.setupIxs,
    klendIxs.targetCollFlashBorrowIx,
    ...klendIxs.depositTargetCollIxs,
    ...klendIxs.withdrawSourceCollIxs,
    ...(externalSwapIxs || []),
    klendIxs.targetCollFlashRepayIx,
    ...klendIxs.cleanupIxs,
  ];
}
