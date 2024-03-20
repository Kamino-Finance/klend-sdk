import { KaminoAction, KaminoMarket, KaminoObligation, numberToLamportsDecimal } from '../classes';
import { SwapInputs, SwapIxnsProvider, getFlashLoanInstructions, toJson } from '../leverage';
import {
  U64_MAX,
  getAtasWithCreateIxnsIfMissing,
  getComputeBudgetAndPriorityFeeIxns,
  removeBudgetAndAtaIxns,
} from '../utils';
import { PublicKey, TransactionInstruction } from '@solana/web3.js';
import Decimal from 'decimal.js';

export const repayWithCollCalcs = (props: {
  repayAmount: Decimal;
  priceDebtToColl: Decimal;
  slippagePct: Decimal;
  flashLoanFee: Decimal;
}): {
  repayAmount: Decimal;
  collToSwapIn: Decimal;
  swapDebtExpectedOut: Decimal;
} => {
  // Initialize local variables from the props object
  const { repayAmount, priceDebtToColl, slippagePct, flashLoanFee } = props;

  const slippage = slippagePct.div('100');

  const swapDebtExpectedOut = repayAmount.mul(new Decimal(1.0).add(flashLoanFee));
  const collToSwapIn = swapDebtExpectedOut.mul(new Decimal(1.0).add(slippage)).mul(priceDebtToColl);

  return {
    repayAmount,
    collToSwapIn,
    swapDebtExpectedOut,
  };
};

export const getRepayWithCollSwapInputs = (props: {
  repayAmount: Decimal;
  priceDebtToColl: Decimal;
  slippagePct: Decimal;
  kaminoMarket: KaminoMarket;
  debtTokenMint: PublicKey;
  collTokenMint: PublicKey;
  obligation: KaminoObligation;
  currentSlot: number;
}): {
  swapInputs: SwapInputs;
} => {
  const {
    repayAmount,
    priceDebtToColl,
    slippagePct,
    kaminoMarket,
    debtTokenMint,
    collTokenMint,
    obligation,
    currentSlot,
  } = props;
  const collReserve = kaminoMarket.getReserveByMint(collTokenMint);
  const debtReserve = kaminoMarket.getReserveByMint(debtTokenMint);
  const flashLoanFee = debtReserve?.getFlashLoanFee() || new Decimal(0);

  const irSlippageBpsForDebt = obligation!
    .estimateObligationInterestRate(
      debtReserve!,
      obligation?.state.borrows.find((borrow) => borrow.borrowReserve?.equals(debtReserve!.address))!,
      currentSlot
    )
    .toDecimalPlaces(debtReserve?.state.liquidity.mintDecimals.toNumber()!, Decimal.ROUND_CEIL);
  // add 0.1 to irSlippageBpsForDebt because we don't want to estimate slightly less than SC and end up not reapying enough
  const repayAmountIrAdjusted = repayAmount
    .mul(irSlippageBpsForDebt.add('0.1').div('10_000').add('1'))
    .toDecimalPlaces(debtReserve?.state.liquidity.mintDecimals.toNumber()!, Decimal.ROUND_CEIL);

  const repayCalcs = repayWithCollCalcs({
    repayAmount: repayAmountIrAdjusted,
    priceDebtToColl,
    slippagePct,
    flashLoanFee,
  });

  return {
    swapInputs: {
      inputAmountLamports: numberToLamportsDecimal(repayCalcs.collToSwapIn, collReserve!.stats.decimals)
        .ceil()
        .toNumber(),
      inputMint: collTokenMint,
      outputMint: debtTokenMint,
    },
  };
};

export const getRepayWithCollIxns = async (props: {
  kaminoMarket: KaminoMarket;
  budgetAndPriorityFeeIxns: TransactionInstruction[];
  amount: Decimal;
  debtTokenMint: PublicKey;
  collTokenMint: PublicKey;
  owner: PublicKey;
  priceDebtToColl: Decimal;
  slippagePct: Decimal;
  isClosingPosition: boolean;
  obligation: KaminoObligation;
  referrer: PublicKey;
  swapper: SwapIxnsProvider;
}): Promise<{ ixns: TransactionInstruction[]; lookupTablesAddresses: PublicKey[]; swapInputs: SwapInputs }> => {
  const {
    kaminoMarket,
    budgetAndPriorityFeeIxns,
    amount,
    debtTokenMint,
    collTokenMint,
    owner,
    priceDebtToColl,
    slippagePct,
    isClosingPosition,
    obligation,
    referrer,
    swapper,
  } = props;

  const connection = kaminoMarket.getConnection();
  const collReserve = kaminoMarket.getReserveByMint(collTokenMint);
  const debtReserve = kaminoMarket.getReserveByMint(debtTokenMint);
  // const solTokenReserve = kaminoMarket.getReserveByMint(WRAPPED_SOL_MINT);
  const flashLoanFee = debtReserve?.getFlashLoanFee() || new Decimal(0);

  const currentSlot = await kaminoMarket.getConnection().getSlot();
  const irSlippageBpsForDebt = obligation!
    .estimateObligationInterestRate(
      debtReserve!,
      obligation?.state.borrows.find((borrow) => borrow.borrowReserve?.equals(debtReserve!.address))!,
      currentSlot
    )
    .toDecimalPlaces(debtReserve?.state.liquidity.mintDecimals.toNumber()!, Decimal.ROUND_CEIL);
  // add 0.1 to irSlippageBpsForDebt because we don't want to estimate slightly less than SC and end up not reapying enough
  const repayAmount = amount
    .mul(irSlippageBpsForDebt.add('0.1').div('10_000').add('1'))
    .toDecimalPlaces(debtReserve?.state.liquidity.mintDecimals.toNumber()!, Decimal.ROUND_CEIL);

  const calcs = repayWithCollCalcs({
    repayAmount,
    priceDebtToColl,
    slippagePct,
    flashLoanFee,
  });

  console.log('repayWithCollSwapInputs', repayAmount, priceDebtToColl, slippagePct, flashLoanFee);

  console.log('Ops Calcs', toJson(calcs));

  // // 1. Create atas & budget txns
  const mintsToCreateAtas = [collTokenMint, debtTokenMint, collReserve!.getCTokenMint()];

  const budgetIxns = budgetAndPriorityFeeIxns || getComputeBudgetAndPriorityFeeIxns(3000000);
  const {
    atas: [, debtTokenAta],
    createAtasIxns,
    closeAtasIxns,
  } = await getAtasWithCreateIxnsIfMissing(connection, owner, mintsToCreateAtas);

  // 1. Flash borrow & repay the debt to repay amount needed
  const { flashBorrowIxn, flashRepayIxn } = getFlashLoanInstructions({
    borrowIxnIndex: budgetIxns.length + createAtasIxns.length,
    walletPublicKey: owner,
    lendingMarketAuthority: kaminoMarket.getLendingMarketAuthority(),
    lendingMarketAddress: kaminoMarket.getAddress(),
    reserve: debtReserve!,
    amountLamports: numberToLamportsDecimal(repayAmount, debtReserve!.stats.decimals).floor(),
    destinationAta: debtTokenAta,
    referrerAccount: kaminoMarket.programId,
    referrerTokenState: kaminoMarket.programId,
    programId: kaminoMarket.programId,
  });

  // 2. Repay using the flash borrowed funds & withdraw collateral to swap and pay the flash loan
  const repayAndWithdrawAction = await KaminoAction.buildRepayAndWithdrawTxns(
    kaminoMarket,
    isClosingPosition ? U64_MAX : numberToLamportsDecimal(repayAmount, debtReserve!.stats.decimals).floor().toString(),
    new PublicKey(debtTokenMint),
    numberToLamportsDecimal(calcs.collToSwapIn, collReserve!.stats.decimals).ceil().toString(),
    new PublicKey(collTokenMint),
    owner,
    obligation,
    0,
    false,
    undefined,
    undefined,
    isClosingPosition,
    referrer
  );

  console.log(
    'Expected to swap in',
    calcs.collToSwapIn.toString(),
    'coll for',
    calcs.swapDebtExpectedOut.toString(),
    'coll'
  );

  const swapInputs: SwapInputs = {
    inputAmountLamports: numberToLamportsDecimal(calcs.collToSwapIn, collReserve!.stats.decimals).ceil().toNumber(),
    inputMint: collTokenMint,
    outputMint: debtTokenMint,
  };

  // 3. Swap collateral to debt to repay flash loan
  const [swapIxns, lookupTablesAddresses] = await swapper(
    swapInputs.inputAmountLamports,
    swapInputs.inputMint,
    swapInputs.outputMint,
    slippagePct.toNumber()
  );

  const swapInstructions = removeBudgetAndAtaIxns(swapIxns, []);

  return {
    ixns: [
      ...budgetIxns,
      ...createAtasIxns,
      ...[flashBorrowIxn],
      ...repayAndWithdrawAction.setupIxs,
      ...[repayAndWithdrawAction.lendingIxs[0]],
      ...repayAndWithdrawAction.inBetweenIxs,
      ...[repayAndWithdrawAction.lendingIxs[1]],
      ...repayAndWithdrawAction.cleanupIxs,
      ...swapInstructions,
      ...[flashRepayIxn],
      ...closeAtasIxns,
    ],
    lookupTablesAddresses,
    swapInputs,
  };
};

export const estimateOperationsWithLeverageAccounts = (props: {
  kaminoMarket: KaminoMarket;
  obligation: KaminoObligation;
  collTokenMint: PublicKey;
  debtTokenMint: PublicKey;
}): {
  estimatedAccountsRequired: number;
} => {
  const { kaminoMarket, obligation, collTokenMint, debtTokenMint } = props;

  const hasReferrer = !obligation.state.referrer.equals(PublicKey.default);
  const collReserve = kaminoMarket.getReserveByMint(collTokenMint);
  const debtReserve = kaminoMarket.getReserveByMint(debtTokenMint);

  let accountsForBorrowsRefresh = 0;
  obligation.borrows.forEach((borrow) => {
    const borrowReserve = kaminoMarket.getReserveByMint(borrow.mintAddress);
    if (borrowReserve) {
      accountsForBorrowsRefresh =
        1 + // reserve address
        (hasReferrer ? 1 : 0) + // referrer token state
        (borrowReserve.state.config.tokenInfo.pythConfiguration.price.equals(PublicKey.default) ? 0 : 1) + // Pyth Oracle
        (borrowReserve?.state.config.tokenInfo.switchboardConfiguration.priceAggregator.equals(PublicKey.default)
          ? 0
          : 1) + // Switchboard Price Oracle
        (borrowReserve?.state.config.tokenInfo.switchboardConfiguration.twapAggregator.equals(PublicKey.default)
          ? 0
          : 1) + // Switchboard Twap Oracle
        (borrowReserve?.state.config.tokenInfo.scopeConfiguration.priceFeed.equals(PublicKey.default) ? 0 : 1); // Scope Prices
    }
  });
  let accountsForDepositsRefresh = 0;
  obligation.deposits.forEach((deposit) => {
    const depositReserves = kaminoMarket.getReserveByMint(deposit.mintAddress);
    if (depositReserves) {
      accountsForDepositsRefresh =
        1 + // reserve address
        (depositReserves.state.config.tokenInfo.pythConfiguration.price.equals(PublicKey.default) ? 0 : 1) + // Pyth Oracle
        (depositReserves?.state.config.tokenInfo.switchboardConfiguration.priceAggregator.equals(PublicKey.default)
          ? 0
          : 1) + // Switchboard Price Oracle
        (depositReserves?.state.config.tokenInfo.switchboardConfiguration.twapAggregator.equals(PublicKey.default)
          ? 0
          : 1) + // Switchboard Twap Oracle
        (depositReserves?.state.config.tokenInfo.scopeConfiguration.priceFeed.equals(PublicKey.default) ? 0 : 1); // Scope Prices
    }
  });

  const estimatedAccountsRequired =
    5 + // computeBudgetProgram, associatedTokenProgram, systemProgram, klendProgram, tokenProgram
    1 + // sysvar: instructions, sysvar: rent
    1 + // user wallet
    2 + // user atas for token A and token B
    2 + // mints for token A and token B
    2 + // ledning market, lending market authority
    1 + // reserve liquidity vault - token collateral
    2 + // reserve liquidity vault, reserve fee vault - token debt
    accountsForBorrowsRefresh + // accounts for refresh borrows + refresh obligation
    accountsForDepositsRefresh + // accounts for refresh deposits + refresh obligation
    (hasReferrer ? 1 : 0) + // if there is a referrer - referrer account address
    2 + // obligation, userMetadata
    (collReserve?.state.farmCollateral.equals(PublicKey.default) ? 0 : 2) + // farmState, obligationFarm (userState)
    (debtReserve?.state.farmDebt.equals(PublicKey.default) ? 0 : 2) + // farmState, obligationFarm (userState)
    (debtReserve?.state.farmDebt.equals(PublicKey.default) &&
    collReserve?.state.farmCollateral.equals(PublicKey.default)
      ? 0
      : 1) + // farmProgram
    2; // ctoken mint and ctoken reserve vault for collateral token
  return { estimatedAccountsRequired };
};
