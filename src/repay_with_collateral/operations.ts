import { KaminoAction, KaminoMarket, KaminoObligation, numberToLamportsDecimal } from '../classes';
import { SwapIxnsProvider, getFlashLoanInstructions, toJson } from '../leverage';
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
  collToSwapIn: Decimal;
  swapDebtExpectedOut: Decimal;
} => {
  // Initialize local variables from the props object
  const { repayAmount, priceDebtToColl, slippagePct, flashLoanFee } = props;

  const slippage = slippagePct.div('100');

  const swapDebtExpectedOut = repayAmount.mul(new Decimal(1.0).add(flashLoanFee));
  const collToSwapIn = swapDebtExpectedOut.mul(new Decimal(1.0).add(slippage)).mul(priceDebtToColl);

  return {
    collToSwapIn,
    swapDebtExpectedOut,
  };
};

// TODO: allow repay from KTOKENS coll

export const getRepayWithCollIxns = async (props: {
  kaminoMarket: KaminoMarket;
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
}): Promise<{ ixns: TransactionInstruction[]; lookupTablesAddresses: PublicKey[] }> => {
  const {
    kaminoMarket,
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

  console.log('Ops Calcs', toJson(calcs));

  // // 1. Create atas & budget txns
  const mintsToCreateAtas = [collTokenMint, debtTokenMint, collReserve!.getCTokenMint()];

  const budgetIxns = getComputeBudgetAndPriorityFeeIxns(3000000);
  const {
    atas: [collTokenAta, debtTokenAta],
    createAtasIxns,
    closeAtasIxns,
  } = await getAtasWithCreateIxnsIfMissing(connection, owner, mintsToCreateAtas);

  console.log('User Atas', toJson({ collTokenAta: collTokenAta.toString(), debtTokenAta: debtTokenAta.toString() }));

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
  });

  // 2. Repay using the flash borrowed funds
  const repayAction = await KaminoAction.buildRepayTxns(
    kaminoMarket,
    isClosingPosition ? U64_MAX : numberToLamportsDecimal(repayAmount, debtReserve!.stats.decimals).floor().toString(),
    new PublicKey(debtTokenMint),
    owner,
    obligation,
    undefined,
    0,
    false,
    undefined,
    undefined,
    referrer
  );

  // 3. Withdraw collateral to swap and pay the flash loan
  const withdrawAction = await KaminoAction.buildWithdrawTxns(
    kaminoMarket,
    numberToLamportsDecimal(calcs.collToSwapIn, collReserve!.stats.decimals).ceil().toString(),
    new PublicKey(collTokenMint),
    owner,
    obligation,
    0,
    false,
    undefined,
    undefined,
    referrer
  );

  console.log(
    'Expected to swap in',
    calcs.collToSwapIn.toString(),
    'coll for',
    calcs.swapDebtExpectedOut.toString(),
    'coll'
  );

  // 4. Swap collateral to debt to repay flash loan
  const [swapIxns, lookupTablesAddresses] = await swapper(
    numberToLamportsDecimal(calcs.collToSwapIn, collReserve!.stats.decimals).ceil().toNumber(),
    collTokenMint,
    debtTokenMint,
    slippagePct.toNumber()
  );

  const swapInstructions = removeBudgetAndAtaIxns(swapIxns, []);

  return {
    ixns: [
      ...budgetIxns,
      ...createAtasIxns,
      ...[flashBorrowIxn],
      ...repayAction.setupIxs,
      ...repayAction.lendingIxs,
      ...repayAction.cleanupIxs,
      ...withdrawAction.setupIxs,
      ...withdrawAction.lendingIxs,
      ...withdrawAction.cleanupIxs,
      ...swapInstructions,
      ...[flashRepayIxn],
      ...closeAtasIxns,
    ],
    lookupTablesAddresses,
  };
};
