import { KaminoAction, KaminoMarket, KaminoObligation, KaminoReserve } from '../classes';
import {
  getFlashLoanInstructions,
  SwapInputs,
  SwapQuote,
  SwapIxs,
  SwapIxsProvider,
  SwapQuoteProvider,
  LeverageIxsOutput,
  FlashLoanInfo,
} from '../leverage';
import {
  createAtasIdempotent,
  getComputeBudgetAndPriorityFeeIxs,
  removeBudgetIxs,
  U64_MAX,
  uniqueAccountsWithProgramIds,
} from '../utils';
import { AddressLookupTable } from '@solana-program/address-lookup-table';
import { Account, Address, Instruction, none, Option, Slot, TransactionSigner } from '@solana/kit';
import Decimal from 'decimal.js';
import { calcMaxWithdrawCollateral, calcRepayAmountWithSlippage } from './repay_with_collateral_calcs';

export type RepayWithCollIxsResponse<QuoteResponse> = {
  ixs: Instruction[];
  lookupTables: Account<AddressLookupTable>[];
  flashLoanInfo: FlashLoanInfo;
  swapInputs: SwapInputs;
  initialInputs: RepayWithCollInitialInputs<QuoteResponse>;
  quote?: QuoteResponse;
};

export type RepayWithCollInitialInputs<QuoteResponse> = {
  debtRepayAmountLamports: Decimal;
  flashRepayAmountLamports: Decimal;
  /**
   * The amount of collateral available to withdraw, if this is less than the swap input amount, then the swap may fail due to slippage, or tokens may be debited from the user's ATA, so the caller needs to check this
   */
  maxCollateralWithdrawLamports: Decimal;
  /**
   * The quote from the provided quoter
   */
  swapQuote: SwapQuote<QuoteResponse>;
  currentSlot: Slot;
  klendAccounts: Array<Address>;
};

interface RepayWithCollSwapInputsProps<QuoteResponse> {
  kaminoMarket: KaminoMarket;
  debtTokenMint: Address;
  collTokenMint: Address;
  owner: TransactionSigner;
  obligation: KaminoObligation;
  referrer: Option<Address>;
  currentSlot: Slot;
  repayAmount: Decimal;
  isClosingPosition: boolean;
  budgetAndPriorityFeeIxs?: Instruction[];
  scopeRefreshIx: Instruction[]; // no longer optional, can be empty
  useV2Ixs: boolean;
  quoter: SwapQuoteProvider<QuoteResponse>;
}

export enum MaxWithdrawLtvCheck {
  MAX_LTV,
  LIQUIDATION_THRESHOLD,
}

export async function getRepayWithCollSwapInputs<QuoteResponse>({
  collTokenMint,
  currentSlot,
  debtTokenMint,
  kaminoMarket,
  owner,
  obligation,
  quoter,
  referrer,
  repayAmount,
  isClosingPosition,
  budgetAndPriorityFeeIxs,
  scopeRefreshIx,
  useV2Ixs,
}: RepayWithCollSwapInputsProps<QuoteResponse>): Promise<{
  swapInputs: SwapInputs;
  flashLoanInfo: FlashLoanInfo;
  initialInputs: RepayWithCollInitialInputs<QuoteResponse>;
}> {
  const collReserve = kaminoMarket.getExistingReserveByMint(collTokenMint);
  const debtReserve = kaminoMarket.getExistingReserveByMint(debtTokenMint);

  const {
    repayAmountLamports,
    flashRepayAmountLamports,
    repayAmount: finalRepayAmount,
  } = calcRepayAmountWithSlippage(kaminoMarket, debtReserve, currentSlot, obligation, repayAmount, referrer);

  const debtPosition = obligation.getBorrowByReserve(debtReserve.address);
  const collPosition = obligation.getDepositByReserve(collReserve.address);
  if (!debtPosition) {
    throw new Error(
      `Debt position not found for ${debtReserve.stats.symbol} reserve ${debtReserve.address} in obligation ${obligation.obligationAddress}`
    );
  }
  if (!collPosition) {
    throw new Error(
      `Collateral position not found for ${collReserve.stats.symbol} reserve ${collReserve.address} in obligation ${obligation.obligationAddress}`
    );
  }
  const { maxWithdrawableCollLamports } = calcMaxWithdrawCollateral(
    kaminoMarket,
    obligation,
    collReserve.address,
    debtReserve.address,
    repayAmountLamports
  );

  const maxCollNeededFromOracle = getMaxCollateralFromRepayAmount(finalRepayAmount, debtReserve, collReserve);
  const inputAmountLamports = Decimal.min(maxWithdrawableCollLamports, maxCollNeededFromOracle);

  // Build the repay & withdraw collateral tx to get the number of accounts
  const klendIxs: LeverageIxsOutput = (
    await buildRepayWithCollateralIxs(
      kaminoMarket,
      debtReserve,
      collReserve,
      owner,
      obligation,
      referrer,
      currentSlot,
      budgetAndPriorityFeeIxs,
      scopeRefreshIx,
      [
        {
          preActionIxs: [],
          swapIxs: [],
          lookupTables: [],
          quote: {} as SwapQuote<QuoteResponse>,
        },
      ],
      isClosingPosition,
      repayAmountLamports,
      inputAmountLamports,
      useV2Ixs
    )
  )[0];
  const uniqueKlendAccounts = uniqueAccountsWithProgramIds(klendIxs.instructions);

  const swapQuoteInputs: SwapInputs = {
    inputAmountLamports,
    inputMint: collTokenMint,
    outputMint: debtTokenMint,
  };

  const swapQuote = await quoter(swapQuoteInputs, uniqueKlendAccounts);

  const swapQuotePxDebtToColl = swapQuote.priceAInB;
  const collSwapInLamports = flashRepayAmountLamports
    .div(debtReserve.getMintFactor())
    .div(swapQuotePxDebtToColl)
    .mul(collReserve.getMintFactor())
    .ceil();

  return {
    swapInputs: {
      inputAmountLamports: collSwapInLamports,
      minOutAmountLamports: flashRepayAmountLamports,
      inputMint: collTokenMint,
      outputMint: debtTokenMint,
    },
    flashLoanInfo: klendIxs.flashLoanInfo,
    initialInputs: {
      debtRepayAmountLamports: repayAmountLamports,
      flashRepayAmountLamports,
      maxCollateralWithdrawLamports: maxWithdrawableCollLamports,
      swapQuote,
      currentSlot,
      klendAccounts: uniqueKlendAccounts,
    },
  };
}

interface RepayWithCollIxsProps<QuoteResponse> extends RepayWithCollSwapInputsProps<QuoteResponse> {
  swapper: SwapIxsProvider<QuoteResponse>;
  logger?: (msg: string, ...extra: any[]) => void;
}

export async function getRepayWithCollIxs<QuoteResponse>({
  repayAmount,
  isClosingPosition,
  budgetAndPriorityFeeIxs,
  collTokenMint,
  currentSlot,
  debtTokenMint,
  kaminoMarket,
  owner,
  obligation,
  quoter,
  swapper,
  referrer,
  scopeRefreshIx,
  useV2Ixs,
  logger = console.log,
}: RepayWithCollIxsProps<QuoteResponse>): Promise<Array<RepayWithCollIxsResponse<QuoteResponse>>> {
  const { swapInputs, initialInputs } = await getRepayWithCollSwapInputs({
    collTokenMint,
    currentSlot,
    debtTokenMint,
    kaminoMarket,
    owner,
    obligation,
    quoter,
    referrer,
    repayAmount,
    isClosingPosition,
    budgetAndPriorityFeeIxs,
    scopeRefreshIx,
    useV2Ixs,
  });
  const { debtRepayAmountLamports, flashRepayAmountLamports, maxCollateralWithdrawLamports, swapQuote } = initialInputs;
  const { inputAmountLamports: collSwapInLamports } = swapInputs;

  const collReserve = kaminoMarket.getExistingReserveByMint(collTokenMint);
  const debtReserve = kaminoMarket.getExistingReserveByMint(debtTokenMint);

  // the client should use these values to prevent this input, but the tx may succeed, so we don't want to fail
  // there is also a chance that the tx will consume debt token from the user's ata which they would not expect
  if (collSwapInLamports.greaterThan(maxCollateralWithdrawLamports)) {
    logger(
      `Collateral swap in amount ${collSwapInLamports} exceeds max withdrawable collateral ${maxCollateralWithdrawLamports}, tx may fail with slippage`
    );
    swapInputs.inputAmountLamports = maxCollateralWithdrawLamports;
  }

  const actualSwapInLamports = Decimal.min(collSwapInLamports, maxCollateralWithdrawLamports);
  logger(
    `Expected to swap in: ${actualSwapInLamports.div(collReserve.getMintFactor())} ${
      collReserve.symbol
    }, for: ${flashRepayAmountLamports.div(debtReserve.getMintFactor())} ${debtReserve.symbol}, quoter px: ${
      swapQuote.priceAInB
    } ${debtReserve.symbol}/${collReserve.symbol}, required px: ${flashRepayAmountLamports
      .div(debtReserve.getMintFactor())
      .div(actualSwapInLamports.div(collReserve.getMintFactor()))} ${debtReserve.symbol}/${collReserve.symbol}`
  );

  const swapResponses = await swapper(swapInputs, initialInputs.klendAccounts, swapQuote);

  const repayWithCollateralIxs = await buildRepayWithCollateralIxs(
    kaminoMarket,
    debtReserve,
    collReserve,
    owner,
    obligation,
    referrer,
    currentSlot,
    budgetAndPriorityFeeIxs,
    scopeRefreshIx,
    swapResponses,
    isClosingPosition,
    debtRepayAmountLamports,
    swapInputs.inputAmountLamports,
    useV2Ixs
  );

  return repayWithCollateralIxs.map((ixs, index) => {
    return {
      ixs: ixs.instructions,
      lookupTables: swapResponses[index].lookupTables,
      swapInputs,
      flashLoanInfo: ixs.flashLoanInfo,
      initialInputs,
      quote: swapResponses[index].quote.quoteResponse,
    };
  });
}

async function buildRepayWithCollateralIxs<QuoteResponse>(
  market: KaminoMarket,
  debtReserve: KaminoReserve,
  collReserve: KaminoReserve,
  owner: TransactionSigner,
  obligation: KaminoObligation,
  referrer: Option<Address>,
  currentSlot: Slot,
  budgetAndPriorityFeeIxs: Instruction[] | undefined,
  scopeRefreshIx: Instruction[],
  swapQuoteIxsArray: SwapIxs<QuoteResponse>[],
  isClosingPosition: boolean,
  debtRepayAmountLamports: Decimal,
  collWithdrawLamports: Decimal,
  useV2Ixs: boolean
): Promise<LeverageIxsOutput[]> {
  // 1. Create atas & budget txns
  const budgetIxs = budgetAndPriorityFeeIxs || getComputeBudgetAndPriorityFeeIxs(1_400_000);

  const atas = [
    { mint: collReserve.getLiquidityMint(), tokenProgram: collReserve.getLiquidityTokenProgram() },
    { mint: debtReserve.getLiquidityMint(), tokenProgram: debtReserve.getLiquidityTokenProgram() },
  ];

  const atasAndIxs = await createAtasIdempotent(owner, atas);
  const [, { ata: debtTokenAta }] = atasAndIxs;

  // 2. Flash borrow & repay the debt to repay amount needed
  const { flashBorrowIx, flashRepayIx } = getFlashLoanInstructions({
    borrowIxIndex: atasAndIxs.length + (scopeRefreshIx.length > 0 ? 1 : 0),
    userTransferAuthority: owner,
    lendingMarketAuthority: await market.getLendingMarketAuthority(),
    lendingMarketAddress: market.getAddress(),
    reserve: debtReserve,
    amountLamports: debtRepayAmountLamports,
    destinationAta: debtTokenAta,
    // TODO(referrals): once we support referrals, we will have to replace the placeholder args below:
    referrerAccount: none(),
    referrerTokenState: none(),
    programId: market.programId,
  });

  const requestElevationGroup = !isClosingPosition && obligation.state.elevationGroup !== 0;

  const maxWithdrawLtvCheck = getMaxWithdrawLtvCheck(
    obligation,
    debtRepayAmountLamports,
    debtReserve,
    collWithdrawLamports,
    collReserve
  );

  // 3. Repay using the flash borrowed funds & withdraw collateral to swap and pay the flash loan
  let repayAndWithdrawAction;
  if (maxWithdrawLtvCheck === MaxWithdrawLtvCheck.MAX_LTV) {
    repayAndWithdrawAction = await KaminoAction.buildRepayAndWithdrawTxns(
      market,
      isClosingPosition ? U64_MAX : debtRepayAmountLamports.toString(),
      debtReserve.getLiquidityMint(),
      isClosingPosition ? U64_MAX : collWithdrawLamports.toString(),
      collReserve.getLiquidityMint(),
      owner,
      currentSlot,
      obligation,
      useV2Ixs,
      undefined,
      0,
      false,
      requestElevationGroup,
      undefined,
      referrer
    );
  } else {
    repayAndWithdrawAction = await KaminoAction.buildRepayAndWithdrawV2Txns(
      market,
      isClosingPosition ? U64_MAX : debtRepayAmountLamports.toString(),
      debtReserve.getLiquidityMint(),
      isClosingPosition ? U64_MAX : collWithdrawLamports.toString(),
      collReserve.getLiquidityMint(),
      owner,
      currentSlot,
      obligation,
      undefined,
      0,
      false,
      requestElevationGroup,
      undefined,
      referrer
    );
  }

  // 4. Swap collateral to debt to repay flash loan
  return swapQuoteIxsArray.map((swapQuoteIxs) => {
    const { preActionIxs, swapIxs } = swapQuoteIxs;
    const swapInstructions = removeBudgetIxs(swapIxs);

    const ixs = [
      ...scopeRefreshIx,
      ...atasAndIxs.map((x) => x.createAtaIx),
      flashBorrowIx,
      ...preActionIxs,
      ...KaminoAction.actionToIxs(repayAndWithdrawAction),
      ...swapInstructions,
      flashRepayIx,
      ...budgetIxs,
    ];

    const res: LeverageIxsOutput = {
      flashLoanInfo: {
        flashBorrowReserve: debtReserve.address,
        flashLoanFee: debtReserve.getFlashLoanFee(),
      },
      instructions: ixs,
    };

    return res;
  });
}

export const getMaxWithdrawLtvCheck = (
  obligation: KaminoObligation,
  repayAmountLamports: Decimal,
  debtReserve: KaminoReserve,
  collWithdrawAmount: Decimal,
  collReserve: KaminoReserve
) => {
  const [finalLtv, finalMaxLtv] = calculatePostOperationLtv(
    obligation,
    repayAmountLamports,
    debtReserve,
    collWithdrawAmount,
    collReserve
  );

  if (finalLtv.lte(finalMaxLtv)) {
    return MaxWithdrawLtvCheck.MAX_LTV;
  }

  return obligation.refreshedStats.userTotalBorrowBorrowFactorAdjusted.gte(obligation.refreshedStats.borrowLimit)
    ? MaxWithdrawLtvCheck.LIQUIDATION_THRESHOLD
    : MaxWithdrawLtvCheck.MAX_LTV;
};

function calculatePostOperationLtv(
  obligation: KaminoObligation,
  repayAmountLamports: Decimal,
  debtReserve: KaminoReserve,
  collWithdrawAmount: Decimal,
  collReserve: KaminoReserve
): [Decimal, Decimal] {
  const repayValue = repayAmountLamports
    .div(debtReserve.getMintFactor())
    .mul(debtReserve.getOracleMarketPrice())
    .mul(debtReserve.getBorrowFactor());
  const collWithdrawValue = collWithdrawAmount.div(collReserve.getMintFactor()).mul(collReserve.getOracleMarketPrice());

  // Calculate new borrow value and deposit value
  const newBorrowBfValue = Decimal.max(
    new Decimal(0),
    obligation.refreshedStats.userTotalBorrowBorrowFactorAdjusted.sub(repayValue)
  );
  const newDepositValue = Decimal.max(
    new Decimal(0),
    obligation.refreshedStats.userTotalDeposit.sub(collWithdrawValue)
  );

  const newMaxBorrowableValue = Decimal.max(
    new Decimal(0),
    obligation.refreshedStats.borrowLimit.sub(collWithdrawValue.mul(collReserve.stats.loanToValue))
  );

  const newMaxLtv = newMaxBorrowableValue.div(newDepositValue);

  // return final ltv and final max ltv
  return [newBorrowBfValue.div(newDepositValue), newMaxLtv];
}

export function getMaxCollateralFromRepayAmount(
  repayAmount: Decimal,
  debtReserve: KaminoReserve,
  collReserve: KaminoReserve
) {
  // sanity check: we have extra collateral to swap, but we want to ensure we don't quote for way more than needed and get a bad px
  return repayAmount
    .mul(debtReserve.getOracleMarketPrice())
    .div(collReserve.getOracleMarketPrice())
    .mul('1.1')
    .mul(collReserve.getMintFactor())
    .ceil();
}
