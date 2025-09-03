import { Address, Instruction, Slot, Option, none, TransactionSigner, lamports } from '@solana/kit';
import Decimal from 'decimal.js';
import {
  KaminoAction,
  KaminoMarket,
  KaminoObligation,
  KaminoReserve,
  lamportsToNumberDecimal as fromLamports,
  getTokenIdsForScopeRefresh,
  isKaminoObligation,
  toJson,
} from '../classes';
import { getFlashLoanInstructions } from './instructions';

import { numberToLamportsDecimal as toLamports } from '../classes';
import {
  LeverageObligation,
  MultiplyObligation,
  ObligationType,
  ObligationTypeTag,
  SOL_DECIMALS,
  ScopePriceRefreshConfig,
  U64_MAX,
  createAtasIdempotent,
  getAssociatedTokenAddress,
  getComputeBudgetAndPriorityFeeIxs,
  getTransferWsolIxs,
  removeBudgetIxs,
  uniqueAccountsWithProgramIds,
  WRAPPED_SOL_MINT,
  DEFAULT_PUBLIC_KEY,
} from '../utils';
import {
  adjustDepositLeverageCalcs,
  adjustWithdrawLeverageCalcs,
  calcAdjustAmounts,
  depositLeverageCalcs,
  depositLeverageKtokenCalcs,
  withdrawLeverageCalcs,
} from './calcs';
import { Kamino, StrategyWithAddress } from '@kamino-finance/kliquidity-sdk';
import { getExpectedTokenBalanceAfterBorrow, getKtokenToTokenSwapper, getTokenToKtokenSwapper } from './utils';
import { FullBPS } from '@kamino-finance/kliquidity-sdk/dist/utils/CreationParameters';
import {
  AdjustLeverageCalcsResult,
  AdjustLeverageInitialInputs,
  AdjustLeverageIxsResponse,
  AdjustLeverageProps,
  AdjustLeverageSwapInputsProps,
  DepositLeverageCalcsResult,
  DepositLeverageInitialInputs,
  DepositWithLeverageProps,
  DepositWithLeverageSwapInputsProps,
  DepositLeverageIxsResponse,
  PriceAinBProvider,
  SwapInputs,
  SwapIxs,
  SwapIxsProvider,
  WithdrawLeverageCalcsResult,
  WithdrawLeverageInitialInputs,
  WithdrawLeverageIxsResponse,
  WithdrawWithLeverageProps,
  WithdrawWithLeverageSwapInputsProps,
  LeverageIxsOutput,
  FlashLoanInfo,
} from './types';
import { TOKEN_PROGRAM_ADDRESS } from '@solana-program/token';
import { findAssociatedTokenPda, getCloseAccountInstruction } from '@solana-program/token-2022';
import { LAMPORTS_PER_SOL } from '../utils/consts';
import { fetchAddressLookupTable } from '@solana-program/address-lookup-table';

export const WITHDRAW_SLOT_OFFSET = 150; // Offset for the withdraw slot to underestimate the exchange rate

export async function getDepositWithLeverageSwapInputs<QuoteResponse>({
  owner,
  kaminoMarket,
  debtTokenMint,
  collTokenMint,
  depositAmount,
  priceDebtToColl,
  slippagePct,
  obligation,
  referrer,
  currentSlot,
  targetLeverage,
  selectedTokenMint,
  kamino,
  obligationTypeTagOverride,
  scopeRefreshConfig,
  budgetAndPriorityFeeIxs,
  quoteBufferBps,
  priceAinB,
  isKtoken,
  quoter,
  useV2Ixs,
  elevationGroupOverride,
}: DepositWithLeverageSwapInputsProps<QuoteResponse>): Promise<{
  flashLoanInfo: FlashLoanInfo;
  swapInputs: SwapInputs;
  initialInputs: DepositLeverageInitialInputs<QuoteResponse>;
}> {
  const collReserve = kaminoMarket.getExistingReserveByMint(collTokenMint);
  const debtReserve = kaminoMarket.getExistingReserveByMint(debtTokenMint);
  const solTokenReserve = kaminoMarket.getReserveByMint(WRAPPED_SOL_MINT);
  const flashLoanFee = collReserve.getFlashLoanFee() || new Decimal(0);

  const selectedTokenIsCollToken = selectedTokenMint === collTokenMint;
  const depositTokenIsSol = !solTokenReserve ? false : selectedTokenMint === solTokenReserve!.getLiquidityMint();

  const collIsKtoken = await isKtoken(collTokenMint);
  const strategy = collIsKtoken ? (await kamino!.getStrategyByKTokenMint(collTokenMint))! : undefined;

  const calcs = await getDepositWithLeverageCalcs(
    depositAmount,
    selectedTokenIsCollToken,
    collIsKtoken,
    depositTokenIsSol,
    priceDebtToColl,
    targetLeverage,
    slippagePct,
    flashLoanFee,
    kamino,
    strategy,
    debtTokenMint,
    priceAinB,
    debtReserve!
  );

  console.log('Ops Calcs', toJson(calcs));

  const obligationType = checkObligationType(obligationTypeTagOverride, collTokenMint, debtTokenMint, kaminoMarket);

  // Build the repay & withdraw collateral tx to get the number of accounts
  const klendIxs: LeverageIxsOutput = (
    await buildDepositWithLeverageIxs(
      kaminoMarket,
      debtReserve,
      collReserve,
      owner,
      obligation ? obligation : obligationType,
      referrer,
      currentSlot,
      depositTokenIsSol,
      scopeRefreshConfig,
      calcs,
      budgetAndPriorityFeeIxs,
      [
        {
          preActionIxs: [],
          swapIxs: [],
          lookupTables: [],
          quote: {
            priceAInB: new Decimal(0), // not used
            quoteResponse: undefined,
          },
        },
      ],
      strategy,
      collIsKtoken,
      useV2Ixs,
      elevationGroupOverride
    )
  )[0];

  const uniqueKlendAccounts = uniqueAccountsWithProgramIds(klendIxs.instructions);

  const swapInputAmount = toLamports(
    !collIsKtoken ? calcs.swapDebtTokenIn : calcs.singleSidedDepositKtokenOnly,
    debtReserve.stats.decimals
  ).ceil();

  const swapInputsForQuote: SwapInputs = {
    inputAmountLamports: swapInputAmount.mul(new Decimal(1).add(quoteBufferBps.div(FullBPS))),
    inputMint: debtTokenMint,
    outputMint: collTokenMint,
    amountDebtAtaBalance: new Decimal(0), // Only needed for ktokens swaps
  };

  const swapQuote = await quoter(swapInputsForQuote, uniqueKlendAccounts);

  const quotePriceCalcs = await getDepositWithLeverageCalcs(
    depositAmount,
    selectedTokenIsCollToken,
    collIsKtoken,
    depositTokenIsSol,
    swapQuote.priceAInB,
    targetLeverage,
    slippagePct,
    flashLoanFee,
    kamino,
    strategy,
    debtTokenMint,
    priceAinB,
    debtReserve!
  );

  const swapInputAmountQuotePrice = toLamports(
    !collIsKtoken ? quotePriceCalcs.swapDebtTokenIn : quotePriceCalcs.singleSidedDepositKtokenOnly,
    debtReserve.stats.decimals
  ).ceil();

  let expectedDebtTokenAtaBalance = new Decimal(0);

  if (collIsKtoken) {
    let futureBalanceInAta = new Decimal(0);
    if (debtTokenMint === WRAPPED_SOL_MINT) {
      futureBalanceInAta = futureBalanceInAta.add(
        !collIsKtoken ? quotePriceCalcs.initDepositInSol : quotePriceCalcs.initDepositInSol
      );
    }
    futureBalanceInAta = futureBalanceInAta.add(
      !collIsKtoken ? quotePriceCalcs.debtTokenToBorrow : quotePriceCalcs.flashBorrowInDebtTokenKtokenOnly
    );
    expectedDebtTokenAtaBalance = await getExpectedTokenBalanceAfterBorrow(
      kaminoMarket.getRpc(),
      debtTokenMint,
      owner.address,
      toLamports(futureBalanceInAta.toDecimalPlaces(debtReserve.stats.decimals), debtReserve.stats.decimals),
      debtReserve.state.liquidity.mintDecimals.toNumber()
    );
  }

  return {
    swapInputs: {
      inputAmountLamports: swapInputAmountQuotePrice,
      minOutAmountLamports: toLamports(
        !collIsKtoken ? quotePriceCalcs.flashBorrowInCollToken : quotePriceCalcs.flashBorrowInDebtTokenKtokenOnly,
        !collIsKtoken ? collReserve.stats.decimals : debtReserve.stats.decimals
      ),
      inputMint: debtTokenMint,
      outputMint: collTokenMint,
      amountDebtAtaBalance: expectedDebtTokenAtaBalance,
    },
    flashLoanInfo: klendIxs.flashLoanInfo,
    initialInputs: {
      calcs: quotePriceCalcs,
      swapQuote,
      currentSlot,
      collIsKtoken,
      strategy,
      obligation: obligation ? obligation : obligationType,
      klendAccounts: uniqueKlendAccounts,
    },
  };
}

async function getDepositWithLeverageCalcs(
  depositAmount: Decimal,
  selectedTokenIsCollToken: boolean,
  collIsKtoken: boolean,
  depositTokenIsSol: boolean,
  priceDebtToColl: Decimal,
  targetLeverage: Decimal,
  slippagePct: Decimal,
  flashLoanFee: Decimal,
  kamino: Kamino | undefined,
  strategy: StrategyWithAddress | undefined,
  debtTokenMint: Address,
  priceAinB: PriceAinBProvider,
  debtReserve: KaminoReserve
): Promise<DepositLeverageCalcsResult> {
  let calcs: DepositLeverageCalcsResult;
  if (!collIsKtoken) {
    calcs = depositLeverageCalcs({
      depositAmount: depositAmount,
      depositTokenIsCollToken: selectedTokenIsCollToken,
      depositTokenIsSol,
      priceDebtToColl,
      targetLeverage,
      slippagePct,
      flashLoanFee,
    });
  } else {
    calcs = await depositLeverageKtokenCalcs({
      kamino: kamino!,
      strategy: strategy!,
      debtTokenMint,
      depositAmount: depositAmount,
      depositTokenIsCollToken: selectedTokenIsCollToken,
      depositTokenIsSol,
      priceDebtToColl,
      targetLeverage,
      slippagePct,
      flashLoanFee,
      priceAinB,
    });
    // Rounding to exact number of decimals so this value is passed through in all calcs without rounding inconsistencies
    calcs.flashBorrowInDebtTokenKtokenOnly = calcs.flashBorrowInDebtTokenKtokenOnly.toDecimalPlaces(
      debtReserve!.state.liquidity.mintDecimals.toNumber()!,
      Decimal.ROUND_CEIL
    );
    calcs.debtTokenToBorrow = calcs.debtTokenToBorrow.toDecimalPlaces(
      debtReserve!.state.liquidity.mintDecimals.toNumber()!,
      Decimal.ROUND_CEIL
    );
    calcs.singleSidedDepositKtokenOnly = calcs.singleSidedDepositKtokenOnly.toDecimalPlaces(
      debtReserve!.state.liquidity.mintDecimals.toNumber()!,
      Decimal.ROUND_CEIL
    );
  }
  return calcs;
}

export async function getDepositWithLeverageIxs<QuoteResponse>({
  owner,
  kaminoMarket,
  debtTokenMint,
  collTokenMint,
  depositAmount,
  priceDebtToColl,
  slippagePct,
  obligation,
  referrer,
  currentSlot,
  targetLeverage,
  selectedTokenMint,
  kamino,
  obligationTypeTagOverride,
  scopeRefreshConfig,
  budgetAndPriorityFeeIxs,
  quoteBufferBps,
  priceAinB,
  isKtoken,
  quoter,
  swapper,
  elevationGroupOverride,
  useV2Ixs,
}: DepositWithLeverageProps<QuoteResponse>): Promise<Array<DepositLeverageIxsResponse<QuoteResponse>>> {
  const { swapInputs, initialInputs } = await getDepositWithLeverageSwapInputs({
    owner,
    kaminoMarket,
    debtTokenMint,
    collTokenMint,
    depositAmount,
    priceDebtToColl,
    slippagePct,
    obligation,
    referrer,
    currentSlot,
    targetLeverage,
    selectedTokenMint,
    kamino,
    obligationTypeTagOverride,
    scopeRefreshConfig,
    budgetAndPriorityFeeIxs,
    quoteBufferBps,
    priceAinB,
    isKtoken,
    quoter,
    useV2Ixs,
  });

  let depositSwapper: SwapIxsProvider<QuoteResponse>;

  if (!initialInputs.collIsKtoken) {
    depositSwapper = swapper;
  } else {
    if (kamino === undefined) {
      throw Error('Ktoken use as collateral for leverage without Kamino instance');
    }
    depositSwapper = await getTokenToKtokenSwapper(kaminoMarket, kamino, owner, slippagePct, swapper, priceAinB, false);
  }

  const swapsArray = await depositSwapper(swapInputs, initialInputs.klendAccounts, initialInputs.swapQuote);

  if (initialInputs.collIsKtoken) {
    if (initialInputs.strategy && initialInputs.strategy.strategy.strategyLookupTable !== DEFAULT_PUBLIC_KEY) {
      const strategyLut = await fetchAddressLookupTable(
        kaminoMarket.getRpc(),
        initialInputs.strategy.strategy.strategyLookupTable
      );
      swapsArray.forEach((swap) => {
        swap.lookupTables.push(strategyLut);
      });
    } else {
      console.log('Strategy lookup table not found');
    }
  }

  const collReserve = kaminoMarket.getReserveByMint(collTokenMint);
  const debtReserve = kaminoMarket.getReserveByMint(debtTokenMint);
  const solTokenReserve = kaminoMarket.getReserveByMint(WRAPPED_SOL_MINT);
  const depositTokenIsSol = !solTokenReserve ? false : selectedTokenMint === solTokenReserve!.getLiquidityMint();

  const depositWithLeverageIxs = await buildDepositWithLeverageIxs(
    kaminoMarket,
    debtReserve!,
    collReserve!,
    owner,
    initialInputs.obligation,
    referrer,
    currentSlot,
    depositTokenIsSol,
    scopeRefreshConfig,
    initialInputs.calcs,
    budgetAndPriorityFeeIxs,
    swapsArray.map((swap) => {
      return {
        preActionIxs: [],
        swapIxs: swap.swapIxs,
        lookupTables: swap.lookupTables,
        quote: swap.quote,
      };
    }),
    initialInputs.strategy,
    initialInputs.collIsKtoken,
    useV2Ixs,
    elevationGroupOverride
  );

  return depositWithLeverageIxs.map((depositWithLeverageIxs, index) => {
    return {
      ixs: depositWithLeverageIxs.instructions,
      flashLoanInfo: depositWithLeverageIxs.flashLoanInfo,
      lookupTables: swapsArray[index].lookupTables,
      swapInputs,
      initialInputs,
      quote: swapsArray[index].quote.quoteResponse,
    };
  });
}

async function buildDepositWithLeverageIxs<QuoteResponse>(
  market: KaminoMarket,
  debtReserve: KaminoReserve,
  collReserve: KaminoReserve,
  owner: TransactionSigner,
  obligation: KaminoObligation | ObligationType | undefined,
  referrer: Option<Address>,
  currentSlot: Slot,
  depositTokenIsSol: boolean,
  scopeRefreshConfig: ScopePriceRefreshConfig | undefined,
  calcs: DepositLeverageCalcsResult,
  budgetAndPriorityFeeIxs: Instruction[] | undefined,
  swapQuoteIxsArray: SwapIxs<QuoteResponse>[],
  strategy: StrategyWithAddress | undefined,
  collIsKtoken: boolean,
  useV2Ixs: boolean,
  elevationGroupOverride?: number
): Promise<LeverageIxsOutput[]> {
  const collTokenMint = collReserve.getLiquidityMint();
  const debtTokenMint = debtReserve.getLiquidityMint();
  const [[collTokenAta], [debtTokenAta]] = await Promise.all([
    findAssociatedTokenPda({
      owner: owner.address,
      mint: collTokenMint,
      tokenProgram: collReserve.getLiquidityTokenProgram(),
    }),
    findAssociatedTokenPda({
      owner: owner.address,
      mint: debtTokenMint,
      tokenProgram: debtReserve.getLiquidityTokenProgram(),
    }),
  ]);

  // 1. Create atas & budget ixs
  const { budgetIxs, createAtasIxs, scopeRefreshIx } = await getSetupIxs(
    owner,
    market,
    obligation,
    collTokenMint,
    collReserve,
    collIsKtoken,
    debtTokenMint,
    debtReserve,
    strategy,
    scopeRefreshConfig,
    budgetAndPriorityFeeIxs
  );

  const fillWsolAtaIxs: Instruction[] = [];
  if (depositTokenIsSol) {
    fillWsolAtaIxs.push(
      ...getTransferWsolIxs(
        owner,
        await getAssociatedTokenAddress(WRAPPED_SOL_MINT, owner.address),
        lamports(BigInt(toLamports(calcs.initDepositInSol, SOL_DECIMALS).ceil().toString()))
      )
    );
  }

  // 2. Flash borrow & repay the collateral amount needed for given leverage
  // if user deposits coll, then we borrow the diff, else we borrow the entire amount
  const { flashBorrowIx, flashRepayIx } = getFlashLoanInstructions({
    borrowIxIndex:
      budgetIxs.length + createAtasIxs.length + fillWsolAtaIxs.length + (scopeRefreshIx.length > 0 ? 1 : 0),
    userTransferAuthority: owner,
    lendingMarketAuthority: await market.getLendingMarketAuthority(),
    lendingMarketAddress: market.getAddress(),
    reserve: !collIsKtoken ? collReserve : debtReserve,
    amountLamports: toLamports(
      !collIsKtoken ? calcs.flashBorrowInCollToken : calcs.flashBorrowInDebtTokenKtokenOnly,
      !collIsKtoken ? collReserve.stats.decimals : debtReserve.stats.decimals
    ),
    destinationAta: !collIsKtoken ? collTokenAta : debtTokenAta,
    // TODO(referrals): once we support referrals, we will have to replace the placeholder args below:
    referrerAccount: none(),
    referrerTokenState: none(),
    programId: market.programId,
  });

  // 3. Deposit initial tokens + borrowed tokens into reserve
  const kaminoDepositAndBorrowAction = await KaminoAction.buildDepositAndBorrowTxns(
    market,
    toLamports(!collIsKtoken ? calcs.collTokenToDeposit : calcs.collTokenToDeposit, collReserve.stats.decimals)
      .floor()
      .toString(),
    collTokenMint,
    toLamports(!collIsKtoken ? calcs.debtTokenToBorrow : calcs.debtTokenToBorrow, debtReserve.stats.decimals)
      .ceil()
      .toString(),
    debtTokenMint,
    owner,
    obligation!,
    useV2Ixs,
    undefined,
    0,
    false,
    elevationGroupOverride === 0 ? false : true, // emode
    { skipInitialization: true, skipLutCreation: true }, // to be checked and created in a setup tx in the UI
    referrer,
    currentSlot
  );

  return swapQuoteIxsArray.map((swapQuoteIxs) => {
    // 4. Swap
    const { swapIxs } = swapQuoteIxs;
    const swapInstructions = removeBudgetIxs(swapIxs);
    const flashBorrowReserve = !collIsKtoken ? collReserve : debtReserve;
    const flashLoanInfo = {
      flashBorrowReserve: flashBorrowReserve.address,
      flashLoanFee: flashBorrowReserve.getFlashLoanFee(),
    };

    return {
      flashLoanInfo,
      instructions: [
        ...scopeRefreshIx,
        ...budgetIxs,
        ...createAtasIxs,
        ...fillWsolAtaIxs,
        ...[flashBorrowIx],
        ...(collIsKtoken ? swapInstructions : []),
        ...KaminoAction.actionToIxs(kaminoDepositAndBorrowAction),
        ...(collIsKtoken ? [] : swapInstructions),
        ...[flashRepayIx],
      ],
    };
  });
}

export async function getWithdrawWithLeverageSwapInputs<QuoteResponse>({
  owner,
  kaminoMarket,
  debtTokenMint,
  collTokenMint,
  deposited,
  borrowed,
  obligation,
  referrer,
  currentSlot,
  withdrawAmount,
  priceCollToDebt,
  slippagePct,
  isClosingPosition,
  selectedTokenMint,
  budgetAndPriorityFeeIxs,
  kamino,
  scopeRefreshConfig,
  quoteBufferBps,
  isKtoken,
  quoter,
  useV2Ixs,
}: WithdrawWithLeverageSwapInputsProps<QuoteResponse>): Promise<{
  swapInputs: SwapInputs;
  flashLoanInfo: FlashLoanInfo;
  initialInputs: WithdrawLeverageInitialInputs<QuoteResponse>;
}> {
  const collReserve = kaminoMarket.getReserveByMint(collTokenMint);
  const debtReserve = kaminoMarket.getReserveByMint(debtTokenMint);
  const flashLoanFee = debtReserve!.getFlashLoanFee() || new Decimal(0);
  const selectedTokenIsCollToken = selectedTokenMint === collTokenMint;
  const collIsKtoken = await isKtoken(collTokenMint);
  const strategy = collIsKtoken ? (await kamino!.getStrategyByKTokenMint(collTokenMint))! : undefined;

  const inputTokenIsSol = selectedTokenMint === WRAPPED_SOL_MINT;

  const calcs = withdrawLeverageCalcs(
    kaminoMarket,
    collReserve!,
    debtReserve!,
    priceCollToDebt,
    withdrawAmount,
    deposited,
    borrowed,
    currentSlot,
    isClosingPosition,
    selectedTokenIsCollToken,
    selectedTokenMint,
    obligation,
    flashLoanFee,
    slippagePct
  );

  const klendIxs = (
    await buildWithdrawWithLeverageIxs(
      kaminoMarket,
      debtReserve!,
      collReserve!,
      owner,
      obligation,
      referrer,
      currentSlot,
      isClosingPosition,
      inputTokenIsSol,
      scopeRefreshConfig,
      calcs,
      budgetAndPriorityFeeIxs,
      [
        {
          preActionIxs: [],
          swapIxs: [],
          lookupTables: [],
          quote: {
            priceAInB: new Decimal(0), // not used
            quoteResponse: undefined,
          },
        },
      ],
      strategy,
      collIsKtoken,
      useV2Ixs
    )
  )[0];

  const uniqueKlendAccounts = uniqueAccountsWithProgramIds(klendIxs.instructions);

  const swapInputAmount = toLamports(calcs.collTokenSwapIn, collReserve!.getMintDecimals()).ceil();

  const swapInputsForQuote: SwapInputs = {
    inputAmountLamports: swapInputAmount.mul(new Decimal(1).add(quoteBufferBps.div(FullBPS))),
    inputMint: collTokenMint,
    outputMint: debtTokenMint,
    amountDebtAtaBalance: undefined, // Only needed for ktokens deposits
  };

  const swapQuote = await quoter(swapInputsForQuote, uniqueKlendAccounts);

  const calcsQuotePrice = withdrawLeverageCalcs(
    kaminoMarket,
    collReserve!,
    debtReserve!,
    !collIsKtoken ? swapQuote.priceAInB : priceCollToDebt,
    withdrawAmount,
    deposited,
    borrowed,
    currentSlot,
    isClosingPosition,
    selectedTokenIsCollToken,
    selectedTokenMint,
    obligation,
    flashLoanFee,
    slippagePct
  );

  const swapInputAmountQuotePrice = toLamports(calcsQuotePrice.collTokenSwapIn, collReserve!.getMintDecimals()).ceil();

  return {
    swapInputs: {
      inputAmountLamports: swapInputAmountQuotePrice,
      minOutAmountLamports: calcsQuotePrice.repayAmount,
      inputMint: collTokenMint,
      outputMint: debtTokenMint,
      amountDebtAtaBalance: new Decimal(0), // Only needed for ktokens deposits
    },
    flashLoanInfo: klendIxs.flashLoanInfo,
    initialInputs: {
      calcs: calcsQuotePrice,
      swapQuote,
      currentSlot,
      collIsKtoken,
      strategy,
      obligation,
      klendAccounts: uniqueKlendAccounts,
    },
  };
}

export async function getWithdrawWithLeverageIxs<QuoteResponse>({
  owner,
  kaminoMarket,
  debtTokenMint,
  collTokenMint,
  obligation,
  deposited,
  borrowed,
  referrer,
  currentSlot,
  withdrawAmount,
  priceCollToDebt,
  slippagePct,
  isClosingPosition,
  selectedTokenMint,
  budgetAndPriorityFeeIxs,
  kamino,
  scopeRefreshConfig,
  quoteBufferBps,
  isKtoken,
  quoter,
  swapper,
  useV2Ixs,
}: WithdrawWithLeverageProps<QuoteResponse>): Promise<Array<WithdrawLeverageIxsResponse<QuoteResponse>>> {
  const collReserve = kaminoMarket.getReserveByMint(collTokenMint);
  const debtReserve = kaminoMarket.getReserveByMint(debtTokenMint);

  const inputTokenIsSol = selectedTokenMint === WRAPPED_SOL_MINT;
  const { swapInputs, initialInputs } = await getWithdrawWithLeverageSwapInputs({
    owner,
    kaminoMarket,
    debtTokenMint,
    collTokenMint,
    deposited,
    borrowed,
    obligation,
    referrer,
    currentSlot,
    withdrawAmount,
    priceCollToDebt,
    slippagePct,
    isClosingPosition,
    selectedTokenMint,
    budgetAndPriorityFeeIxs,
    kamino,
    scopeRefreshConfig,
    quoteBufferBps,
    isKtoken,
    quoter,
    useV2Ixs,
  });

  let withdrawSwapper: SwapIxsProvider<QuoteResponse>;

  if (initialInputs.collIsKtoken) {
    if (kamino === undefined) {
      throw Error('Ktoken use as collateral for leverage without Kamino instance');
    }
    withdrawSwapper = await getKtokenToTokenSwapper(kaminoMarket, kamino, owner, swapper);
  } else {
    withdrawSwapper = swapper;
  }

  const swapsArray = await withdrawSwapper(swapInputs, initialInputs.klendAccounts, initialInputs.swapQuote);

  if (initialInputs.collIsKtoken) {
    if (initialInputs.strategy?.strategy.strategyLookupTable) {
      const strategyLut = await fetchAddressLookupTable(
        kaminoMarket.getRpc(),
        initialInputs.strategy.strategy.strategyLookupTable
      );
      swapsArray.forEach((swap) => {
        swap.lookupTables.push(strategyLut);
      });
    } else {
      console.log('Strategy lookup table not found');
    }
  }

  const withdrawWithLeverageIxs = await buildWithdrawWithLeverageIxs<QuoteResponse>(
    kaminoMarket,
    debtReserve!,
    collReserve!,
    owner,
    obligation,
    referrer,
    currentSlot,
    isClosingPosition,
    inputTokenIsSol,
    scopeRefreshConfig,
    initialInputs.calcs,
    budgetAndPriorityFeeIxs,
    swapsArray.map((swap) => {
      return {
        preActionIxs: [],
        swapIxs: swap.swapIxs,
        lookupTables: swap.lookupTables,
        quote: swap.quote,
      };
    }),
    initialInputs.strategy,
    initialInputs.collIsKtoken,
    useV2Ixs
  );

  // Send ixs and lookup tables
  return withdrawWithLeverageIxs.map((ixs, index) => {
    return {
      ixs: ixs.instructions,
      flashLoanInfo: ixs.flashLoanInfo,
      lookupTables: swapsArray[index].lookupTables,
      swapInputs,
      initialInputs: initialInputs,
      quote: swapsArray[index].quote.quoteResponse,
    };
  });
}

export async function buildWithdrawWithLeverageIxs<QuoteResponse>(
  market: KaminoMarket,
  debtReserve: KaminoReserve,
  collReserve: KaminoReserve,
  owner: TransactionSigner,
  obligation: KaminoObligation,
  referrer: Option<Address>,
  currentSlot: Slot,
  isClosingPosition: boolean,
  depositTokenIsSol: boolean,
  scopeRefreshConfig: ScopePriceRefreshConfig | undefined,
  calcs: WithdrawLeverageCalcsResult,
  budgetAndPriorityFeeIxs: Instruction[] | undefined,
  swapQuoteIxsArray: SwapIxs<QuoteResponse>[],
  strategy: StrategyWithAddress | undefined,
  collIsKtoken: boolean,
  useV2Ixs: boolean
): Promise<LeverageIxsOutput[]> {
  const collTokenMint = collReserve.getLiquidityMint();
  const debtTokenMint = debtReserve.getLiquidityMint();
  const debtTokenAta = await getAssociatedTokenAddress(
    debtTokenMint,
    owner.address,
    debtReserve.getLiquidityTokenProgram()
  );
  // 1. Create atas & budget txns & user metadata

  const { budgetIxs, createAtasIxs, scopeRefreshIx } = await getSetupIxs(
    owner,
    market,
    obligation,
    collTokenMint,
    collReserve,
    collIsKtoken,
    debtTokenMint,
    debtReserve,
    strategy,
    scopeRefreshConfig,
    budgetAndPriorityFeeIxs
  );

  const closeWsolAtaIxs: Instruction[] = [];
  if (depositTokenIsSol || debtTokenMint === WRAPPED_SOL_MINT) {
    const wsolAta = await getAssociatedTokenAddress(WRAPPED_SOL_MINT, owner.address);
    closeWsolAtaIxs.push(
      getCloseAccountInstruction(
        {
          owner,
          destination: owner.address,
          account: wsolAta,
        },
        { programAddress: TOKEN_PROGRAM_ADDRESS }
      )
    );
  }

  // TODO: Mihai/Marius check if we can improve this logic and not convert any SOL
  // This is here so that we have enough wsol to repay in case the kAB swapped to sol after estimates is not enough
  const fillWsolAtaIxs: Instruction[] = [];
  if (debtTokenMint === WRAPPED_SOL_MINT) {
    const halfSolBalance =
      Number.parseInt((await market.getRpc().getBalance(owner.address).send()).value.toString()) / LAMPORTS_PER_SOL / 2;
    const balanceToWrap = halfSolBalance < 0.1 ? halfSolBalance : 0.1;
    fillWsolAtaIxs.push(
      ...getTransferWsolIxs(
        owner,
        await getAssociatedTokenAddress(WRAPPED_SOL_MINT, owner.address),
        lamports(BigInt(toLamports(balanceToWrap, SOL_DECIMALS).ceil().toString()))
      )
    );
  }

  // 2. Prepare the flash borrow and flash repay amounts and ixs
  // We borrow exactly how much we need to repay
  // and repay that + flash amount fee
  const { flashBorrowIx, flashRepayIx } = getFlashLoanInstructions({
    borrowIxIndex:
      budgetIxs.length + createAtasIxs.length + fillWsolAtaIxs.length + (scopeRefreshIx.length > 0 ? 1 : 0),
    userTransferAuthority: owner,
    lendingMarketAuthority: await market.getLendingMarketAuthority(),
    lendingMarketAddress: market.getAddress(),
    reserve: debtReserve!,
    amountLamports: toLamports(calcs.repayAmount, debtReserve!.stats.decimals),
    destinationAta: debtTokenAta,
    // TODO(referrals): once we support referrals, we will have to replace the placeholder args below:
    referrerAccount: none(),
    referrerTokenState: none(),
    programId: market.programId,
  });

  // 3. Repay borrowed tokens and Withdraw tokens from reserve that will be swapped to repay flash loan
  const repayAndWithdrawAction = await KaminoAction.buildRepayAndWithdrawTxns(
    market,
    isClosingPosition ? U64_MAX : toLamports(calcs.repayAmount, debtReserve!.stats.decimals).floor().toString(),
    debtTokenMint,
    isClosingPosition
      ? U64_MAX
      : toLamports(calcs.depositTokenWithdrawAmount, collReserve!.stats.decimals).ceil().toString(),
    collTokenMint,
    owner,
    currentSlot,
    obligation,
    useV2Ixs,
    undefined,
    0,
    false,
    false,
    { skipInitialization: true, skipLutCreation: true }, // to be checked and created in a setup tx in the UI (won't be the case for withdraw anyway as this would be created in deposit)
    referrer
  );

  return swapQuoteIxsArray.map((swapQuoteIxs) => {
    const swapInstructions = removeBudgetIxs(swapQuoteIxs.swapIxs);

    return {
      flashLoanInfo: {
        flashLoanFee: debtReserve.getFlashLoanFee(),
        flashBorrowReserve: debtReserve.address,
      },
      instructions: [
        ...scopeRefreshIx,
        ...budgetIxs,
        ...createAtasIxs,
        ...fillWsolAtaIxs,
        ...[flashBorrowIx],
        ...KaminoAction.actionToIxs(repayAndWithdrawAction),
        ...swapInstructions,
        ...[flashRepayIx],
        ...closeWsolAtaIxs,
      ],
    };
  });
}

export async function getAdjustLeverageSwapInputs<QuoteResponse>({
  owner,
  kaminoMarket,
  debtTokenMint,
  collTokenMint,
  obligation,
  depositedLamports,
  borrowedLamports,
  referrer,
  currentSlot,
  targetLeverage,
  priceCollToDebt,
  priceDebtToColl,
  slippagePct,
  budgetAndPriorityFeeIxs,
  kamino,
  scopeRefreshConfig,
  quoteBufferBps,
  isKtoken,
  quoter,
  useV2Ixs,
  withdrawSlotOffset,
}: AdjustLeverageSwapInputsProps<QuoteResponse>): Promise<{
  swapInputs: SwapInputs;
  flashLoanInfo: FlashLoanInfo;
  initialInputs: AdjustLeverageInitialInputs<QuoteResponse>;
}> {
  const collReserve = kaminoMarket.getReserveByMint(collTokenMint)!;
  const debtReserve = kaminoMarket.getReserveByMint(debtTokenMint)!;
  const deposited = fromLamports(depositedLamports, collReserve.stats.decimals);
  const borrowed = fromLamports(borrowedLamports, debtReserve.stats.decimals);
  const collIsKtoken = await isKtoken(collTokenMint);
  const strategy = collIsKtoken ? (await kamino!.getStrategyByKTokenMint(collTokenMint))! : undefined;

  // Getting current flash loan fee
  const currentLeverage = obligation.refreshedStats.leverage;
  const isDepositViaLeverage = targetLeverage.gte(new Decimal(currentLeverage));
  let flashLoanFee;
  if (isDepositViaLeverage) {
    flashLoanFee = collReserve.getFlashLoanFee() || new Decimal(0);
  } else {
    flashLoanFee = debtReserve.getFlashLoanFee() || new Decimal(0);
  }

  const { adjustDepositPosition, adjustBorrowPosition } = calcAdjustAmounts({
    currentDepositPosition: deposited,
    currentBorrowPosition: borrowed,
    targetLeverage: targetLeverage,
    priceCollToDebt: priceCollToDebt,
    flashLoanFee: new Decimal(flashLoanFee),
  });

  const isDeposit = adjustDepositPosition.gte(0) && adjustBorrowPosition.gte(0);
  if (isDepositViaLeverage !== isDeposit) {
    throw new Error('Invalid target leverage');
  }

  if (isDeposit) {
    const calcs = await adjustDepositLeverageCalcs(
      kaminoMarket,
      owner.address,
      debtReserve!,
      adjustDepositPosition,
      adjustBorrowPosition,
      priceDebtToColl,
      flashLoanFee,
      slippagePct,
      collIsKtoken
    );

    // Build the repay & withdraw collateral tx to get the number of accounts
    const klendIxs: LeverageIxsOutput = (
      await buildIncreaseLeverageIxs(
        owner,
        kaminoMarket,
        collTokenMint,
        debtTokenMint,
        obligation,
        referrer,
        currentSlot,
        calcs,
        strategy,
        scopeRefreshConfig,
        collIsKtoken,
        [
          {
            preActionIxs: [],
            swapIxs: [],
            lookupTables: [],
            quote: {
              priceAInB: new Decimal(0), // not used
              quoteResponse: undefined,
            },
          },
        ],
        budgetAndPriorityFeeIxs,
        useV2Ixs
      )
    )[0];

    const uniqueKlendAccounts = uniqueAccountsWithProgramIds(klendIxs.instructions);

    const swapInputAmount = toLamports(
      !collIsKtoken ? calcs.borrowAmount : calcs.amountToFlashBorrowDebt,
      debtReserve.stats.decimals
    ).ceil();

    const swapInputsForQuote: SwapInputs = {
      inputAmountLamports: swapInputAmount.mul(new Decimal(1).add(quoteBufferBps.div(FullBPS))),
      inputMint: debtTokenMint,
      outputMint: collTokenMint,
      amountDebtAtaBalance: new Decimal(0), // Only needed for ktokens swaps
    };

    const swapQuote = await quoter(swapInputsForQuote, uniqueKlendAccounts);

    const {
      adjustDepositPosition: adjustDepositPositionQuotePrice,
      adjustBorrowPosition: adjustBorrowPositionQuotePrice,
    } = calcAdjustAmounts({
      currentDepositPosition: deposited,
      currentBorrowPosition: borrowed,
      targetLeverage: targetLeverage,
      priceCollToDebt: new Decimal(1).div(swapQuote.priceAInB),
      flashLoanFee: new Decimal(flashLoanFee),
    });

    const calcsQuotePrice = await adjustDepositLeverageCalcs(
      kaminoMarket,
      owner.address,
      debtReserve,
      adjustDepositPositionQuotePrice,
      adjustBorrowPositionQuotePrice,
      swapQuote.priceAInB,
      flashLoanFee,
      slippagePct,
      collIsKtoken
    );

    const swapInputAmountQuotePrice = toLamports(
      !collIsKtoken ? calcsQuotePrice.borrowAmount : calcsQuotePrice.amountToFlashBorrowDebt,
      debtReserve.getMintDecimals()
    ).ceil();

    let expectedDebtTokenAtaBalance = new Decimal(0);
    if (collIsKtoken) {
      expectedDebtTokenAtaBalance = await getExpectedTokenBalanceAfterBorrow(
        kaminoMarket.getRpc(),
        debtTokenMint,
        owner.address,
        toLamports(
          !collIsKtoken ? calcsQuotePrice.borrowAmount : calcsQuotePrice.amountToFlashBorrowDebt,
          debtReserve.stats.decimals
        ).floor(),
        debtReserve.getMintDecimals()
      );
    }

    return {
      swapInputs: {
        inputAmountLamports: swapInputAmountQuotePrice,
        minOutAmountLamports: toLamports(
          !collIsKtoken ? calcsQuotePrice.adjustDepositPosition : calcsQuotePrice.amountToFlashBorrowDebt,
          !collIsKtoken ? collReserve.stats.decimals : debtReserve!.stats.decimals
        ),
        inputMint: debtTokenMint,
        outputMint: collTokenMint,
        amountDebtAtaBalance: expectedDebtTokenAtaBalance,
      },
      flashLoanInfo: klendIxs.flashLoanInfo,
      initialInputs: {
        calcs: calcsQuotePrice,
        swapQuote,
        currentSlot,
        collIsKtoken,
        strategy,
        obligation: obligation,
        klendAccounts: uniqueKlendAccounts,
        isDeposit: isDeposit,
      },
    };
  } else {
    const calcs = adjustWithdrawLeverageCalcs(adjustDepositPosition, adjustBorrowPosition, flashLoanFee, slippagePct);

    const klendIxs: LeverageIxsOutput = (
      await buildDecreaseLeverageIxs(
        owner,
        kaminoMarket,
        collTokenMint,
        debtTokenMint,
        obligation,
        referrer,
        currentSlot,
        calcs,
        strategy,
        scopeRefreshConfig,
        collIsKtoken,
        [
          {
            preActionIxs: [],
            swapIxs: [],
            lookupTables: [],
            quote: {
              priceAInB: new Decimal(0), // not used
              quoteResponse: undefined,
            },
          },
        ],
        budgetAndPriorityFeeIxs,
        useV2Ixs,
        withdrawSlotOffset
      )
    )[0];

    const uniqueKlendAccounts = uniqueAccountsWithProgramIds(klendIxs.instructions);

    const swapInputAmount = toLamports(
      calcs.withdrawAmountWithSlippageAndFlashLoanFee,
      collReserve.state.liquidity.mintDecimals.toNumber()
    ).ceil();

    const swapInputsForQuote: SwapInputs = {
      inputAmountLamports: swapInputAmount.mul(new Decimal(1).add(quoteBufferBps.div(FullBPS))),
      inputMint: collTokenMint,
      outputMint: debtTokenMint,
      amountDebtAtaBalance: undefined, // Only needed for ktokens deposits
    };

    const swapQuote = await quoter(swapInputsForQuote, uniqueKlendAccounts);

    const {
      adjustDepositPosition: adjustDepositPositionQuotePrice,
      adjustBorrowPosition: adjustBorrowPositionQuotePrice,
    } = calcAdjustAmounts({
      currentDepositPosition: deposited,
      currentBorrowPosition: borrowed,
      targetLeverage: targetLeverage,
      priceCollToDebt: swapQuote.priceAInB,
      flashLoanFee: new Decimal(flashLoanFee),
    });

    const calcsQuotePrice = adjustWithdrawLeverageCalcs(
      adjustDepositPositionQuotePrice,
      adjustBorrowPositionQuotePrice,
      flashLoanFee,
      slippagePct
    );

    const swapInputAmountQuotePrice = toLamports(
      calcsQuotePrice.withdrawAmountWithSlippageAndFlashLoanFee,
      collReserve.getMintDecimals()
    ).ceil();

    return {
      swapInputs: {
        inputAmountLamports: swapInputAmountQuotePrice,
        minOutAmountLamports: toLamports(calcsQuotePrice.adjustBorrowPosition.abs(), debtReserve.stats.decimals),
        inputMint: collTokenMint,
        outputMint: debtTokenMint,
        amountDebtAtaBalance: undefined, // Only needed for ktokens deposits
      },
      flashLoanInfo: klendIxs.flashLoanInfo,
      initialInputs: {
        calcs: calcsQuotePrice,
        swapQuote,
        currentSlot,
        collIsKtoken,
        strategy,
        obligation,
        klendAccounts: uniqueKlendAccounts,
        isDeposit,
      },
    };
  }
}

export async function getAdjustLeverageIxs<QuoteResponse>({
  owner,
  kaminoMarket,
  debtTokenMint,
  collTokenMint,
  obligation,
  depositedLamports,
  borrowedLamports,
  referrer,
  currentSlot,
  targetLeverage,
  priceCollToDebt,
  priceDebtToColl,
  slippagePct,
  budgetAndPriorityFeeIxs,
  kamino,
  scopeRefreshConfig,
  quoteBufferBps,
  priceAinB,
  isKtoken,
  quoter,
  swapper,
  useV2Ixs,
  withdrawSlotOffset,
}: AdjustLeverageProps<QuoteResponse>): Promise<Array<AdjustLeverageIxsResponse<QuoteResponse>>> {
  const { swapInputs, initialInputs } = await getAdjustLeverageSwapInputs({
    owner,
    kaminoMarket,
    debtTokenMint,
    collTokenMint,
    obligation,
    depositedLamports,
    borrowedLamports,
    referrer,
    currentSlot,
    targetLeverage,
    priceCollToDebt,
    priceDebtToColl,
    slippagePct,
    budgetAndPriorityFeeIxs,
    kamino,
    scopeRefreshConfig,
    quoteBufferBps,
    priceAinB,
    isKtoken,
    quoter,
    useV2Ixs,
  });

  // leverage increased so we need to deposit and borrow more
  if (initialInputs.isDeposit) {
    let depositSwapper: SwapIxsProvider<QuoteResponse>;

    if (initialInputs.collIsKtoken) {
      if (kamino === undefined) {
        throw Error('Ktoken use as collateral for leverage without Kamino instance');
      }
      depositSwapper = await getTokenToKtokenSwapper(
        kaminoMarket,
        kamino,
        owner,
        slippagePct,
        swapper,
        priceAinB,
        false
      );
    } else {
      depositSwapper = swapper;
    }

    const swapsArray = await depositSwapper(swapInputs, initialInputs.klendAccounts, initialInputs.swapQuote);

    const increaseLeverageIxs = await buildIncreaseLeverageIxs(
      owner,
      kaminoMarket,
      collTokenMint,
      debtTokenMint,
      obligation,
      referrer,
      currentSlot,
      initialInputs.calcs,
      initialInputs.strategy,
      scopeRefreshConfig,
      initialInputs.collIsKtoken,
      swapsArray.map((swap) => {
        return {
          preActionIxs: [],
          swapIxs: swap.swapIxs,
          lookupTables: swap.lookupTables,
          quote: swap.quote,
        };
      }),
      budgetAndPriorityFeeIxs,
      useV2Ixs
    );
    return increaseLeverageIxs.map((ixs, index) => {
      return {
        ixs: ixs.instructions,
        flashLoanInfo: ixs.flashLoanInfo,
        lookupTables: swapsArray[index].lookupTables,
        swapInputs,
        initialInputs,
        quote: swapsArray[index].quote.quoteResponse,
      };
    });
  } else {
    console.log('Decreasing leverage');

    let withdrawSwapper: SwapIxsProvider<QuoteResponse>;

    if (initialInputs.collIsKtoken) {
      if (kamino === undefined) {
        throw Error('Ktoken use as collateral for leverage without Kamino instance');
      }
      withdrawSwapper = await getKtokenToTokenSwapper(kaminoMarket, kamino, owner, swapper);
    } else {
      withdrawSwapper = swapper;
    }

    // 5. Get swap ixs
    const swapsArray = await withdrawSwapper(swapInputs, initialInputs.klendAccounts, initialInputs.swapQuote);

    const decreaseLeverageIxs = await buildDecreaseLeverageIxs(
      owner,
      kaminoMarket,
      collTokenMint,
      debtTokenMint,
      obligation,
      referrer,
      currentSlot,
      initialInputs.calcs,
      initialInputs.strategy,
      scopeRefreshConfig,
      initialInputs.collIsKtoken,
      swapsArray.map((swap) => {
        return {
          preActionIxs: [],
          swapIxs: swap.swapIxs,
          lookupTables: swap.lookupTables,
          quote: swap.quote,
        };
      }),
      budgetAndPriorityFeeIxs,
      useV2Ixs,
      withdrawSlotOffset
    );

    return decreaseLeverageIxs.map((ixs, index) => {
      return {
        ixs: ixs.instructions,
        flashLoanInfo: ixs.flashLoanInfo,
        lookupTables: swapsArray[index].lookupTables,
        swapInputs,
        initialInputs,
        quote: swapsArray[index].quote.quoteResponse,
      };
    });
  }
}

/**
 * Deposit and borrow tokens if leverage increased
 */
async function buildIncreaseLeverageIxs<QuoteResponse>(
  owner: TransactionSigner,
  kaminoMarket: KaminoMarket,
  collTokenMint: Address,
  debtTokenMint: Address,
  obligation: KaminoObligation,
  referrer: Option<Address>,
  currentSlot: Slot,
  calcs: AdjustLeverageCalcsResult,
  strategy: StrategyWithAddress | undefined,
  scopeRefreshConfig: ScopePriceRefreshConfig | undefined,
  collIsKtoken: boolean,
  swapQuoteIxsArray: SwapIxs<QuoteResponse>[],
  budgetAndPriorityFeeIxs: Instruction[] | undefined,
  useV2Ixs: boolean
): Promise<LeverageIxsOutput[]> {
  const collReserve = kaminoMarket.getExistingReserveByMint(collTokenMint);
  const debtReserve = kaminoMarket.getExistingReserveByMint(debtTokenMint);
  const [debtTokenAta, collTokenAta] = await Promise.all([
    getAssociatedTokenAddress(debtTokenMint, owner.address, debtReserve.getLiquidityTokenProgram()),
    getAssociatedTokenAddress(collTokenMint, owner.address, collReserve.getLiquidityTokenProgram()),
  ]);

  // 1. Create atas & budget txns
  const { budgetIxs, createAtasIxs, scopeRefreshIx } = await getSetupIxs(
    owner,
    kaminoMarket,
    obligation,
    collTokenMint,
    collReserve,
    collIsKtoken,
    debtTokenMint,
    debtReserve,
    strategy,
    scopeRefreshConfig,
    budgetAndPriorityFeeIxs
  );

  // 2. Create borrow flash loan instruction
  const { flashBorrowIx, flashRepayIx } = getFlashLoanInstructions({
    borrowIxIndex: budgetIxs.length + createAtasIxs.length + (scopeRefreshIx.length > 0 ? 1 : 0), // TODO: how about user metadata ixs
    userTransferAuthority: owner,
    lendingMarketAuthority: await kaminoMarket.getLendingMarketAuthority(),
    lendingMarketAddress: kaminoMarket.getAddress(),
    reserve: !collIsKtoken ? collReserve! : debtReserve!,
    amountLamports: toLamports(
      !collIsKtoken ? calcs.adjustDepositPosition : calcs.amountToFlashBorrowDebt,
      !collIsKtoken ? collReserve!.stats.decimals : debtReserve!.stats.decimals
    ),
    destinationAta: !collIsKtoken ? collTokenAta : debtTokenAta,
    // TODO(referrals): once we support referrals, we will have to replace the placeholder args below:
    referrerAccount: none(),
    referrerTokenState: none(),
    programId: kaminoMarket.programId,
  });

  const depositAction = await KaminoAction.buildDepositTxns(
    kaminoMarket,
    toLamports(calcs.adjustDepositPosition, collReserve!.stats.decimals).floor().toString(),
    collTokenMint,
    owner,
    obligation,
    useV2Ixs,
    undefined,
    0,
    false,
    false,
    { skipInitialization: true, skipLutCreation: true },
    referrer,
    currentSlot
  );

  // 4. Borrow tokens in borrow token reserve that will be swapped to repay flash loan
  const borrowAction = await KaminoAction.buildBorrowTxns(
    kaminoMarket,
    toLamports(calcs.borrowAmount, debtReserve!.stats.decimals).ceil().toString(),
    debtTokenMint,
    owner,
    obligation,
    useV2Ixs,
    undefined,
    0,
    false,
    false,
    { skipInitialization: true, skipLutCreation: true }, // to be checked and create in a setup tx in the UI (won't be the case for adjust anyway as this would be created in deposit)
    referrer,
    currentSlot
  );

  return swapQuoteIxsArray.map((swapQuoteIxs) => {
    const swapInstructions = removeBudgetIxs(swapQuoteIxs.swapIxs);

    const ixs = [
      ...scopeRefreshIx,
      ...budgetIxs,
      ...createAtasIxs,
      ...[flashBorrowIx],
      ...(collIsKtoken ? swapInstructions : []),
      ...KaminoAction.actionToIxs(depositAction),
      ...KaminoAction.actionToIxs(borrowAction),
      ...(collIsKtoken ? [] : swapInstructions),
      ...[flashRepayIx],
    ];

    const flashBorrowReserve = !collIsKtoken ? collReserve! : debtReserve!;
    const res: LeverageIxsOutput = {
      flashLoanInfo: {
        flashBorrowReserve: flashBorrowReserve.address,
        flashLoanFee: flashBorrowReserve.getFlashLoanFee(),
      },
      instructions: ixs,
    };

    return res;
  });
}

/**
 * Withdraw and repay tokens if leverage decreased
 */
async function buildDecreaseLeverageIxs<QuoteResponse>(
  owner: TransactionSigner,
  kaminoMarket: KaminoMarket,
  collTokenMint: Address,
  debtTokenMint: Address,
  obligation: KaminoObligation,
  referrer: Option<Address>,
  currentSlot: Slot,
  calcs: AdjustLeverageCalcsResult,
  strategy: StrategyWithAddress | undefined,
  scopeRefreshConfig: ScopePriceRefreshConfig | undefined,
  collIsKtoken: boolean,
  swapQuoteIxsArray: SwapIxs<QuoteResponse>[],
  budgetAndPriorityFeeIxs: Instruction[] | undefined,
  useV2Ixs: boolean,
  withdrawSlotOffset: number = WITHDRAW_SLOT_OFFSET
): Promise<LeverageIxsOutput[]> {
  const collReserve = kaminoMarket.getExistingReserveByMint(collTokenMint);
  const debtReserve = kaminoMarket.getExistingReserveByMint(debtTokenMint);
  const [debtTokenAta] = await findAssociatedTokenPda({
    owner: owner.address,
    mint: debtTokenMint,
    tokenProgram: debtReserve.getLiquidityTokenProgram(),
  });

  // 1. Create atas & budget txns
  const { budgetIxs, createAtasIxs, scopeRefreshIx } = await getSetupIxs(
    owner,
    kaminoMarket,
    obligation,
    collTokenMint,
    collReserve,
    collIsKtoken,
    debtTokenMint,
    debtReserve,
    strategy,
    scopeRefreshConfig,
    budgetAndPriorityFeeIxs
  );

  // TODO: Mihai/Marius check if we can improve this logic and not convert any SOL
  // This is here so that we have enough wsol to repay in case the kAB swapped to sol after estimates is not enough
  const closeWsolAtaIxs: Instruction[] = [];
  const fillWsolAtaIxs: Instruction[] = [];
  if (debtTokenMint === WRAPPED_SOL_MINT) {
    const wsolAta = await getAssociatedTokenAddress(WRAPPED_SOL_MINT, owner.address);

    closeWsolAtaIxs.push(
      getCloseAccountInstruction(
        {
          owner,
          account: wsolAta,
          destination: owner.address,
        },
        { programAddress: TOKEN_PROGRAM_ADDRESS }
      )
    );

    const halfSolBalance =
      Number.parseInt((await kaminoMarket.getRpc().getBalance(owner.address).send()).value.toString()) /
      LAMPORTS_PER_SOL /
      2;
    const balanceToWrap = halfSolBalance < 0.1 ? halfSolBalance : 0.1;
    fillWsolAtaIxs.push(
      ...getTransferWsolIxs(
        owner,
        wsolAta,
        lamports(BigInt(toLamports(balanceToWrap, debtReserve!.stats.decimals).ceil().toString()))
      )
    );
  }

  // 3. Flash borrow & repay amount to repay (debt)
  const { flashBorrowIx, flashRepayIx } = getFlashLoanInstructions({
    borrowIxIndex:
      budgetIxs.length + createAtasIxs.length + fillWsolAtaIxs.length + (scopeRefreshIx.length > 0 ? 1 : 0),
    userTransferAuthority: owner,
    lendingMarketAuthority: await kaminoMarket.getLendingMarketAuthority(),
    lendingMarketAddress: kaminoMarket.getAddress(),
    reserve: debtReserve!,
    amountLamports: toLamports(Decimal.abs(calcs.adjustBorrowPosition), debtReserve!.stats.decimals),
    destinationAta: debtTokenAta,
    // TODO(referrals): once we support referrals, we will have to replace the placeholder args below:
    referrerAccount: none(),
    referrerTokenState: none(),
    programId: kaminoMarket.programId,
  });

  // 4. Actually do the repay of the flash borrowed amounts
  const repayAction = await KaminoAction.buildRepayTxns(
    kaminoMarket,
    toLamports(Decimal.abs(calcs.adjustBorrowPosition), debtReserve!.stats.decimals).floor().toString(),
    debtTokenMint,
    owner,
    obligation,
    useV2Ixs,
    undefined,
    currentSlot,
    undefined,
    0,
    false,
    false,
    { skipInitialization: true, skipLutCreation: true }, // to be checked and create in a setup tx in the UI (won't be the case for adjust anyway as this would be created in deposit)
    referrer
  );

  const withdrawSlot = currentSlot - BigInt(withdrawSlotOffset);
  // 6. Withdraw collateral (a little bit more to be able to pay for the slippage on swap)
  const withdrawAction = await KaminoAction.buildWithdrawTxns(
    kaminoMarket,
    toLamports(calcs.withdrawAmountWithSlippageAndFlashLoanFee, collReserve!.stats.decimals).ceil().toString(),
    collTokenMint,
    owner,
    obligation,
    useV2Ixs,
    undefined,
    0,
    false,
    false,
    { skipInitialization: true, skipLutCreation: true }, // to be checked and create in a setup tx in the UI (won't be the case for adjust anyway as this would be created in deposit)
    referrer,
    withdrawSlot
  );

  return swapQuoteIxsArray.map((swapQuoteIxs) => {
    const swapInstructions = removeBudgetIxs(swapQuoteIxs.swapIxs);

    const ixs = [
      ...scopeRefreshIx,
      ...budgetIxs,
      ...createAtasIxs,
      ...fillWsolAtaIxs,
      ...[flashBorrowIx],
      ...KaminoAction.actionToIxs(repayAction),
      ...KaminoAction.actionToIxs(withdrawAction),
      ...swapInstructions,
      ...[flashRepayIx],
      ...closeWsolAtaIxs,
    ];

    const res: LeverageIxsOutput = {
      flashLoanInfo: {
        flashBorrowReserve: debtReserve!.address,
        flashLoanFee: debtReserve!.getFlashLoanFee(),
      },
      instructions: ixs,
    };

    return res;
  });
}

export const getSetupIxs = async (
  owner: TransactionSigner,
  kaminoMarket: KaminoMarket,
  obligation: KaminoObligation | ObligationType | undefined,
  collTokenMint: Address,
  collReserve: KaminoReserve,
  collIsKtoken: boolean,
  debtTokenMint: Address,
  debtReserve: KaminoReserve,
  strategy: StrategyWithAddress | undefined,
  scopeRefreshConfig: ScopePriceRefreshConfig | undefined,
  budgetAndPriorityFeeIxs: Instruction[] | undefined
) => {
  const budgetIxs = budgetAndPriorityFeeIxs || getComputeBudgetAndPriorityFeeIxs(3000000);

  const mintsWithTokenPrograms = getTokenMintsWithTokenPrograms(
    collTokenMint,
    collReserve,
    debtTokenMint,
    debtReserve,
    collIsKtoken,
    strategy
  );

  const createAtasIxs = (await createAtasIdempotent(owner, mintsWithTokenPrograms)).map((x) => x.createAtaIx);

  const scopeRefreshIx = await getScopeRefreshIx(
    kaminoMarket,
    collReserve,
    debtReserve,
    obligation,
    scopeRefreshConfig
  );

  return {
    budgetIxs,
    createAtasIxs,
    scopeRefreshIx,
  };
};

export const getScopeRefreshIx = async (
  market: KaminoMarket,
  collReserve: KaminoReserve,
  debtReserve: KaminoReserve,
  obligation: KaminoObligation | ObligationType | undefined,
  scopeRefreshConfig: ScopePriceRefreshConfig | undefined
): Promise<Instruction[]> => {
  const allReserves =
    obligation && isKaminoObligation(obligation)
      ? [
          ...new Set<Address>([
            ...obligation.getDeposits().map((x) => x.reserveAddress),
            ...obligation.getBorrows().map((x) => x.reserveAddress),
            collReserve.address,
            debtReserve.address,
          ]),
        ]
      : [...new Set<Address>([collReserve.address, debtReserve.address])];

  const scopeRefreshIxs: Instruction[] = [];
  const scopeTokensMap = getTokenIdsForScopeRefresh(market, allReserves);

  if (scopeTokensMap.size > 0 && scopeRefreshConfig) {
    for (const [configPubkey, config] of scopeRefreshConfig.scopeConfigurations) {
      const tokenIds = scopeTokensMap.get(config.oraclePrices);
      if (tokenIds && tokenIds.length > 0) {
        const refreshIx = await scopeRefreshConfig.scope.refreshPriceListIx({ config: configPubkey }, tokenIds);
        if (refreshIx) {
          scopeRefreshIxs.push(refreshIx);
        }
      }
    }
  }

  return scopeRefreshIxs;
};

const checkObligationType = (
  obligationTypeTag: ObligationTypeTag,
  collTokenMint: Address,
  debtTokenMint: Address,
  kaminoMarket: KaminoMarket
) => {
  let obligationType: ObligationType;
  if (obligationTypeTag === ObligationTypeTag.Multiply) {
    // multiply
    obligationType = new MultiplyObligation(collTokenMint, debtTokenMint, kaminoMarket.programId);
  } else if (obligationTypeTag === ObligationTypeTag.Leverage) {
    // leverage
    obligationType = new LeverageObligation(collTokenMint, debtTokenMint, kaminoMarket.programId);
  } else {
    throw Error('Obligation type tag not supported for leverage, please use 1 - multiply or 3 - leverage');
  }

  return obligationType;
};

type MintWithTokenProgram = {
  mint: Address;
  tokenProgram: Address;
};

const getTokenMintsWithTokenPrograms = (
  collTokenMint: Address,
  collReserve: KaminoReserve,
  debtTokenMint: Address,
  debtReserve: KaminoReserve,
  collIsKtoken: boolean,
  strategy: StrategyWithAddress | undefined
): Array<MintWithTokenProgram> => {
  const mintsWithTokenPrograms = [
    {
      mint: collTokenMint,
      tokenProgram: collReserve.getLiquidityTokenProgram(),
    },
    {
      mint: debtTokenMint,
      tokenProgram: debtReserve.getLiquidityTokenProgram(),
    },
    {
      mint: collReserve.getCTokenMint(),
      tokenProgram: TOKEN_PROGRAM_ADDRESS,
    },
  ];

  if (collIsKtoken) {
    let kTokenAta: Address;
    let kTokenTokenProgram: Address;
    if (strategy!.strategy.tokenAMint === debtTokenMint) {
      kTokenAta = strategy!.strategy.tokenBMint;
      kTokenTokenProgram =
        strategy!.strategy.tokenBTokenProgram === DEFAULT_PUBLIC_KEY
          ? TOKEN_PROGRAM_ADDRESS
          : strategy!.strategy.tokenBTokenProgram;
    } else {
      kTokenAta = strategy!.strategy.tokenAMint;
      kTokenTokenProgram =
        strategy!.strategy.tokenATokenProgram === DEFAULT_PUBLIC_KEY
          ? TOKEN_PROGRAM_ADDRESS
          : strategy!.strategy.tokenATokenProgram;
    }

    mintsWithTokenPrograms.push({
      mint: kTokenAta,
      tokenProgram: kTokenTokenProgram,
    });
  }

  return mintsWithTokenPrograms;
};
