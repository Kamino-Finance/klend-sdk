import Decimal from 'decimal.js';
import {
  borrow,
  createLookupTable,
  createMarketWithTwoReservesToppedUp,
  deposit,
  initEnv,
  makeReserveConfig,
  newUser,
  sendTransactionsFromAction,
} from '../setup_utils';
import {
  KaminoAction,
  KaminoMarket,
  PROGRAM_ID,
  VanillaObligation,
  buildVersionedTransaction,
  sendAndConfirmVersionedTransaction,
  sleep,
  KaminoObligation,
  DEFAULT_RECENT_SLOT_DURATION_MS,
} from '../../src';
import { getObligationFarmState, initializeFarmsForReserve } from '../farms_operations';
import { assert } from 'chai';
import { Keypair, TransactionInstruction } from '@solana/web3.js';
import { fuzzyEq } from '../../src/leverage/calcs';
import { numberToLamportsDecimal } from '../../src/classes/utils';
import { createMarket, createReserve, updateReserve } from '../setup_operations';
import { NATIVE_MINT } from '@solana/spl-token';
import { createAta, createMint, mintTo } from '../token_utils';

describe('init_and_refresh_farm_deposit_borrow_and_repay_withdraw_tests', function () {
  it('init_refresh_farm_deposit_borrow_and_repay_withdraw_coll_farm_only', async function () {
    const [collToken, debtToken] = ['USDH', 'USDC'];

    const { env, kaminoMarket } = await createMarketWithTwoReservesToppedUp(
      [collToken, new Decimal(5000.05)],
      [debtToken, new Decimal(5000.05)]
    );

    const borrower = await newUser(env, kaminoMarket, [
      [collToken, new Decimal(2000)],
      [debtToken, new Decimal(0)],
    ]);

    await deposit(env, kaminoMarket, borrower, collToken, new Decimal(1500));
    await borrow(env, kaminoMarket, borrower, debtToken, new Decimal(1000));

    const collReserve = kaminoMarket.getReserveBySymbol(collToken)!;
    const debtReserve = kaminoMarket.getReserveBySymbol(debtToken)!;
    // adding both coll and debt farms to ensure none is causing problems (we will have both for points anyway)
    await initializeFarmsForReserve(env, kaminoMarket.getAddress(), collReserve.address, 'Collateral', false, false);
    await initializeFarmsForReserve(env, kaminoMarket.getAddress(), collReserve.address, 'Debt', false, false);
    await sleep(2000);

    await kaminoMarket.reload();
    const toDeposit = 100;
    const toBorrow = 100;
    const depositAndBorrowAction = await KaminoAction.buildDepositAndBorrowTxns(
      kaminoMarket,
      numberToLamportsDecimal(toDeposit, collReserve.stats.decimals).floor().toString(),
      collReserve.getLiquidityMint(),
      numberToLamportsDecimal(toBorrow, debtReserve.stats.decimals).floor().toString(),
      debtReserve.getLiquidityMint(),
      borrower.publicKey,
      new VanillaObligation(PROGRAM_ID)
    );

    const depositAndBorrowIxs: TransactionInstruction[] = [];
    depositAndBorrowIxs.push(
      ...depositAndBorrowAction.setupIxs,
      ...[depositAndBorrowAction.lendingIxs[0]],
      ...depositAndBorrowAction.inBetweenIxs,
      ...[depositAndBorrowAction.lendingIxs[1]],
      ...depositAndBorrowAction.cleanupIxs
    );

    console.log(
      depositAndBorrowAction.setupIxsLabels,
      depositAndBorrowAction.lendingIxsLabels[0],
      depositAndBorrowAction.inBetweenIxsLabels,
      depositAndBorrowAction.lendingIxsLabels[1],
      depositAndBorrowAction.cleanupIxsLabels
    );

    const depositAndBorrowLookupTable = await createLookupTable(
      env,
      depositAndBorrowIxs
        .map((ixn) => ixn.keys)
        .flat()
        .map((key) => key.pubkey)
    );
    await sleep(2000);

    const depositAndBorrowTx = await buildVersionedTransaction(
      env.provider.connection,
      borrower.publicKey,
      depositAndBorrowIxs,
      [depositAndBorrowLookupTable]
    );
    depositAndBorrowTx.sign([borrower]);

    await sendAndConfirmVersionedTransaction(env.provider.connection, depositAndBorrowTx, 'confirmed');

    const obligationAfterDepositAndBorrow = (await kaminoMarket.getUserObligationsByTag(
      VanillaObligation.tag,
      borrower.publicKey
    ))![0];
    const obligationCollFarmStateAfterDepositAndBorrow = await getObligationFarmState(
      env,
      obligationAfterDepositAndBorrow,
      kaminoMarket.getReserveBySymbol(collToken)!.state.farmCollateral
    );
    const obligationDebtFarmStateAfterDepositAndBorrow = await getObligationFarmState(
      env,
      obligationAfterDepositAndBorrow,
      kaminoMarket.getReserveBySymbol(debtToken)!.state.farmDebt
    );
    console.log(obligationAfterDepositAndBorrow);
    assert.equal(
      obligationAfterDepositAndBorrow.getDeposits()[0].amount.toNumber(),
      obligationCollFarmStateAfterDepositAndBorrow?.activeStakeScaled.toNumber()
    );
    assert.equal(undefined, obligationDebtFarmStateAfterDepositAndBorrow);

    const repayAndWithdrawAction = await KaminoAction.buildRepayAndWithdrawTxns(
      kaminoMarket,
      numberToLamportsDecimal(toBorrow, debtReserve.stats.decimals).floor().toString(),
      debtReserve.getLiquidityMint(),
      numberToLamportsDecimal(toDeposit, collReserve.stats.decimals).floor().toString(),
      collReserve.getLiquidityMint(),
      borrower.publicKey,
      await env.provider.connection.getSlot(),
      new VanillaObligation(PROGRAM_ID)
    );

    const repayAndWithdrawIxs: TransactionInstruction[] = [];
    repayAndWithdrawIxs.push(
      ...repayAndWithdrawAction.setupIxs,
      ...[repayAndWithdrawAction.lendingIxs[0]],
      ...repayAndWithdrawAction.inBetweenIxs,
      ...[repayAndWithdrawAction.lendingIxs[1]],
      ...repayAndWithdrawAction.cleanupIxs
    );

    console.log(
      repayAndWithdrawAction.setupIxsLabels,
      repayAndWithdrawAction.lendingIxsLabels[0],
      repayAndWithdrawAction.inBetweenIxsLabels,
      repayAndWithdrawAction.lendingIxsLabels[1],
      repayAndWithdrawAction.cleanupIxsLabels
    );

    const repayAndWithdrawLookupTable = await createLookupTable(
      env,
      repayAndWithdrawIxs
        .map((ixn) => ixn.keys)
        .flat()
        .map((key) => key.pubkey)
    );
    await sleep(2000);

    const repayAndWithdrawTx = await buildVersionedTransaction(
      env.provider.connection,
      borrower.publicKey,
      repayAndWithdrawIxs,
      [repayAndWithdrawLookupTable]
    );
    repayAndWithdrawTx.sign([borrower]);

    await sendAndConfirmVersionedTransaction(env.provider.connection, repayAndWithdrawTx, 'confirmed');

    const obligationAfterRepayAndWithdraw = (await kaminoMarket.getUserObligationsByTag(
      VanillaObligation.tag,
      borrower.publicKey
    ))![0];
    const obligationCollFarmStateAfterRepayAndWithdraw = await getObligationFarmState(
      env,
      obligationAfterRepayAndWithdraw,
      kaminoMarket.getReserveBySymbol(collToken)!.state.farmCollateral
    );
    const obligationDebtFarmStateAfterRepayAndWithdraw = await getObligationFarmState(
      env,
      obligationAfterRepayAndWithdraw,
      kaminoMarket.getReserveBySymbol(debtToken)!.state.farmDebt
    );
    assert.equal(
      obligationAfterRepayAndWithdraw.getDeposits()[0].amount.toNumber(),
      obligationCollFarmStateAfterRepayAndWithdraw?.activeStakeScaled.toNumber()
    );
    assert.equal(undefined, obligationDebtFarmStateAfterRepayAndWithdraw);
  });

  it('init_refresh_farm_deposit_borrow_and_repay_withdraw_debt_farm', async function () {
    const [collToken, debtToken] = ['USDH', 'USDC'];

    const { env, kaminoMarket } = await createMarketWithTwoReservesToppedUp(
      [collToken, new Decimal(5000.05)],
      [debtToken, new Decimal(5000.05)]
    );

    const borrower = await newUser(env, kaminoMarket, [
      [collToken, new Decimal(2000)],
      [debtToken, new Decimal(0)],
    ]);

    await deposit(env, kaminoMarket, borrower, collToken, new Decimal(1500));
    await borrow(env, kaminoMarket, borrower, debtToken, new Decimal(1000));

    const debtReserve = kaminoMarket.getReserveBySymbol(debtToken)!;
    const collReserve = kaminoMarket.getReserveBySymbol(collToken)!;
    // adding both coll and debt farms to ensure none is causing problems (we will have both for points anyway)
    await initializeFarmsForReserve(env, kaminoMarket.getAddress(), debtReserve.address, 'Collateral', false, false);
    await initializeFarmsForReserve(env, kaminoMarket.getAddress(), debtReserve.address, 'Debt', false, false);
    await sleep(2000);

    await kaminoMarket.reload();
    const toDeposit = 100;
    const toBorrow = 100;
    const depositAndBorrowAction = await KaminoAction.buildDepositAndBorrowTxns(
      kaminoMarket,
      numberToLamportsDecimal(toDeposit, collReserve.stats.decimals).floor().toString(),
      collReserve.getLiquidityMint(),
      numberToLamportsDecimal(toBorrow, debtReserve.stats.decimals).floor().toString(),
      debtReserve.getLiquidityMint(),
      borrower.publicKey,
      new VanillaObligation(PROGRAM_ID)
    );

    const depositAndBorrowIxs: TransactionInstruction[] = [];
    depositAndBorrowIxs.push(
      ...depositAndBorrowAction.setupIxs,
      ...[depositAndBorrowAction.lendingIxs[0]],
      ...depositAndBorrowAction.inBetweenIxs,
      ...[depositAndBorrowAction.lendingIxs[1]],
      ...depositAndBorrowAction.cleanupIxs
    );

    console.log(
      depositAndBorrowAction.setupIxsLabels,
      depositAndBorrowAction.lendingIxsLabels[0],
      depositAndBorrowAction.inBetweenIxsLabels,
      depositAndBorrowAction.lendingIxsLabels[1],
      depositAndBorrowAction.cleanupIxsLabels
    );

    const depositAndBorrowLookupTable = await createLookupTable(
      env,
      depositAndBorrowIxs
        .map((ixn) => ixn.keys)
        .flat()
        .map((key) => key.pubkey)
    );
    await sleep(2000);

    const depositAndBorrowTx = await buildVersionedTransaction(
      env.provider.connection,
      borrower.publicKey,
      depositAndBorrowIxs,
      [depositAndBorrowLookupTable]
    );
    depositAndBorrowTx.sign([borrower]);

    await sendAndConfirmVersionedTransaction(env.provider.connection, depositAndBorrowTx, 'confirmed');

    const obligationAfterDepositAndBorrow = (await kaminoMarket.getUserObligationsByTag(
      VanillaObligation.tag,
      borrower.publicKey
    ))![0];
    const obligationCollFarmStateAfterDepositAndBorrow = await getObligationFarmState(
      env,
      obligationAfterDepositAndBorrow,
      kaminoMarket.getReserveBySymbol(collToken)!.state.farmCollateral
    );
    const obligationDebtFarmStateAfterDepositAndBorrow = await getObligationFarmState(
      env,
      obligationAfterDepositAndBorrow,
      kaminoMarket.getReserveBySymbol(debtToken)!.state.farmDebt
    );
    console.log(obligationAfterDepositAndBorrow);
    assert.equal(undefined, obligationCollFarmStateAfterDepositAndBorrow);
    console.log(
      obligationAfterDepositAndBorrow.getBorrows()[0].amount.toNumber() / debtReserve.getMintFactor().toNumber()
    );
    console.log(
      obligationDebtFarmStateAfterDepositAndBorrow?.activeStakeScaled.toNumber()! /
        debtReserve.getMintFactor().toNumber()
    );
    assert.ok(
      fuzzyEq(
        obligationAfterDepositAndBorrow.getBorrows()[0].amount.toNumber() / debtReserve.getMintFactor().toNumber(),
        obligationDebtFarmStateAfterDepositAndBorrow?.activeStakeScaled.toNumber()! /
          debtReserve.getMintFactor().toNumber(),
        0.002
      )
    );

    const repayAndWithdrawAction = await KaminoAction.buildRepayAndWithdrawTxns(
      kaminoMarket,
      numberToLamportsDecimal(toBorrow, debtReserve.stats.decimals).floor().toString(),
      debtReserve.getLiquidityMint(),
      numberToLamportsDecimal(toDeposit, collReserve.stats.decimals).floor().toString(),
      collReserve.getLiquidityMint(),
      borrower.publicKey,
      await env.provider.connection.getSlot(),
      new VanillaObligation(PROGRAM_ID)
    );

    const repayAndWithdrawIxs: TransactionInstruction[] = [];
    repayAndWithdrawIxs.push(
      ...repayAndWithdrawAction.setupIxs,
      ...[repayAndWithdrawAction.lendingIxs[0]],
      ...repayAndWithdrawAction.inBetweenIxs,
      ...[repayAndWithdrawAction.lendingIxs[1]],
      ...repayAndWithdrawAction.cleanupIxs
    );

    console.log(
      repayAndWithdrawAction.setupIxsLabels,
      repayAndWithdrawAction.lendingIxsLabels[0],
      repayAndWithdrawAction.inBetweenIxsLabels,
      repayAndWithdrawAction.lendingIxsLabels[1],
      repayAndWithdrawAction.cleanupIxsLabels
    );

    const repayAndWithdrawLookupTable = await createLookupTable(
      env,
      repayAndWithdrawIxs
        .map((ixn) => ixn.keys)
        .flat()
        .map((key) => key.pubkey)
    );
    await sleep(2000);

    const repayAndWithdrawTx = await buildVersionedTransaction(
      env.provider.connection,
      borrower.publicKey,
      repayAndWithdrawIxs,
      [repayAndWithdrawLookupTable]
    );
    repayAndWithdrawTx.sign([borrower]);

    await sendAndConfirmVersionedTransaction(env.provider.connection, repayAndWithdrawTx, 'confirmed');

    const obligationAfterRepayAndWithdraw = (await kaminoMarket.getUserObligationsByTag(
      VanillaObligation.tag,
      borrower.publicKey
    ))![0];
    const obligationCollFarmStateAfterRepayAndWithdraw = await getObligationFarmState(
      env,
      obligationAfterRepayAndWithdraw,
      kaminoMarket.getReserveBySymbol(collToken)!.state.farmCollateral
    );
    const obligationDebtFarmStateAfterRepayAndWithdraw = await getObligationFarmState(
      env,
      obligationAfterRepayAndWithdraw,
      kaminoMarket.getReserveBySymbol(debtToken)!.state.farmDebt
    );
    assert.equal(undefined, obligationCollFarmStateAfterRepayAndWithdraw);
    assert.ok(
      fuzzyEq(
        obligationAfterRepayAndWithdraw.getBorrows()[0].amount.toNumber() / debtReserve.getMintFactor().toNumber(),
        obligationDebtFarmStateAfterRepayAndWithdraw?.activeStakeScaled.toNumber()! /
          debtReserve.getMintFactor().toNumber(),
        0.002
      )
    );
  });

  it('init_refresh_farm_deposit_borrow_and_repay_withdraw_coll_farm_debt_farm', async function () {
    const [collToken, debtToken] = ['USDH', 'USDC'];

    const { env, kaminoMarket } = await createMarketWithTwoReservesToppedUp(
      [collToken, new Decimal(5000.05)],
      [debtToken, new Decimal(5000.05)]
    );

    const borrower = await newUser(env, kaminoMarket, [
      [collToken, new Decimal(2000)],
      [debtToken, new Decimal(0)],
    ]);

    await deposit(env, kaminoMarket, borrower, collToken, new Decimal(1500));
    await borrow(env, kaminoMarket, borrower, debtToken, new Decimal(1000));

    const collReserve = kaminoMarket.getReserveBySymbol(collToken)!;
    const debtReserve = kaminoMarket.getReserveBySymbol(debtToken)!;
    // adding both coll and debt farms to ensure none is causing problems (we will have both for points anyway)
    await initializeFarmsForReserve(env, kaminoMarket.getAddress(), collReserve.address, 'Collateral', false, false);
    await initializeFarmsForReserve(env, kaminoMarket.getAddress(), collReserve.address, 'Debt', false, false);
    await initializeFarmsForReserve(env, kaminoMarket.getAddress(), debtReserve.address, 'Collateral', false, false);
    await initializeFarmsForReserve(env, kaminoMarket.getAddress(), debtReserve.address, 'Debt', false, false);
    await sleep(2000);

    await kaminoMarket.reload();
    const toDeposit = 100;
    const toBorrow = 100;
    const depositAndBorrowAction = await KaminoAction.buildDepositAndBorrowTxns(
      kaminoMarket,
      numberToLamportsDecimal(toDeposit, collReserve.stats.decimals).floor().toString(),
      collReserve.getLiquidityMint(),
      numberToLamportsDecimal(toBorrow, debtReserve.stats.decimals).floor().toString(),
      debtReserve.getLiquidityMint(),
      borrower.publicKey,
      new VanillaObligation(PROGRAM_ID)
    );

    const depositAndBorrowIxs: TransactionInstruction[] = [];
    depositAndBorrowIxs.push(
      ...depositAndBorrowAction.setupIxs,
      ...[depositAndBorrowAction.lendingIxs[0]],
      ...depositAndBorrowAction.inBetweenIxs,
      ...[depositAndBorrowAction.lendingIxs[1]],
      ...depositAndBorrowAction.cleanupIxs
    );

    console.log(
      depositAndBorrowAction.setupIxsLabels,
      depositAndBorrowAction.lendingIxsLabels[0],
      depositAndBorrowAction.inBetweenIxsLabels,
      depositAndBorrowAction.lendingIxsLabels[1],
      depositAndBorrowAction.cleanupIxsLabels
    );

    const depositAndBorrowLookupTable = await createLookupTable(
      env,
      depositAndBorrowIxs
        .map((ixn) => ixn.keys)
        .flat()
        .map((key) => key.pubkey)
    );
    await sleep(2000);

    const depositAndBorrowTx = await buildVersionedTransaction(
      env.provider.connection,
      borrower.publicKey,
      depositAndBorrowIxs,
      [depositAndBorrowLookupTable]
    );
    depositAndBorrowTx.sign([borrower]);

    await sendAndConfirmVersionedTransaction(env.provider.connection, depositAndBorrowTx, 'confirmed');

    const obligationAfterDepositAndBorrow = (await kaminoMarket.getUserObligationsByTag(
      VanillaObligation.tag,
      borrower.publicKey
    ))![0];
    const obligationCollFarmStateAfterDepositAndBorrow = await getObligationFarmState(
      env,
      obligationAfterDepositAndBorrow,
      kaminoMarket.getReserveBySymbol(collToken)!.state.farmCollateral
    );
    const obligationDebtFarmStateAfterDepositAndBorrow = await getObligationFarmState(
      env,
      obligationAfterDepositAndBorrow,
      kaminoMarket.getReserveBySymbol(debtToken)!.state.farmDebt
    );
    console.log(
      obligationAfterDepositAndBorrow.getBorrows()[0].amount.toNumber() / debtReserve.getMintFactor().toNumber()
    );
    console.log(
      obligationDebtFarmStateAfterDepositAndBorrow?.activeStakeScaled.toNumber()! /
        debtReserve.getMintFactor().toNumber()
    );
    assert.equal(
      obligationAfterDepositAndBorrow.getDeposits()[0].amount.toNumber(),
      obligationCollFarmStateAfterDepositAndBorrow?.activeStakeScaled.toNumber()
    );
    assert.ok(
      fuzzyEq(
        obligationAfterDepositAndBorrow.getBorrows()[0].amount.toNumber() / debtReserve.getMintFactor().toNumber(),
        obligationDebtFarmStateAfterDepositAndBorrow?.activeStakeScaled.toNumber()! /
          debtReserve.getMintFactor().toNumber(),
        0.0035
      )
    );

    const repayAndWithdrawAction = await KaminoAction.buildRepayAndWithdrawTxns(
      kaminoMarket,
      numberToLamportsDecimal(toBorrow, debtReserve.stats.decimals).floor().toString(),
      debtReserve.getLiquidityMint(),
      numberToLamportsDecimal(toDeposit, collReserve.stats.decimals).floor().toString(),
      collReserve.getLiquidityMint(),
      borrower.publicKey,
      await env.provider.connection.getSlot(),
      new VanillaObligation(PROGRAM_ID)
    );

    const repayAndWithdrawIxs: TransactionInstruction[] = [];
    repayAndWithdrawIxs.push(
      ...repayAndWithdrawAction.setupIxs,
      ...[repayAndWithdrawAction.lendingIxs[0]],
      ...repayAndWithdrawAction.inBetweenIxs,
      ...[repayAndWithdrawAction.lendingIxs[1]],
      ...repayAndWithdrawAction.cleanupIxs
    );

    console.log(
      repayAndWithdrawAction.setupIxsLabels,
      repayAndWithdrawAction.lendingIxsLabels[0],
      repayAndWithdrawAction.inBetweenIxsLabels,
      repayAndWithdrawAction.lendingIxsLabels[1],
      repayAndWithdrawAction.cleanupIxsLabels
    );

    const repayAndWithdrawLookupTable = await createLookupTable(
      env,
      repayAndWithdrawIxs
        .map((ixn) => ixn.keys)
        .flat()
        .map((key) => key.pubkey)
    );
    await sleep(2000);

    const repayAndWithdrawTx = await buildVersionedTransaction(
      env.provider.connection,
      borrower.publicKey,
      repayAndWithdrawIxs,
      [repayAndWithdrawLookupTable]
    );
    repayAndWithdrawTx.sign([borrower]);

    await sendAndConfirmVersionedTransaction(env.provider.connection, repayAndWithdrawTx, 'confirmed');

    const obligationAfterRepayAndWithdraw = (await kaminoMarket.getUserObligationsByTag(
      VanillaObligation.tag,
      borrower.publicKey
    ))![0];
    const obligationCollFarmStateAfterRepayAndWithdraw = await getObligationFarmState(
      env,
      obligationAfterRepayAndWithdraw,
      kaminoMarket.getReserveBySymbol(collToken)!.state.farmCollateral
    );
    const obligationDebtFarmStateAfterRepayAndWithdraw = await getObligationFarmState(
      env,
      obligationAfterRepayAndWithdraw,
      kaminoMarket.getReserveBySymbol(debtToken)!.state.farmDebt
    );
    assert.equal(
      obligationAfterRepayAndWithdraw.getDeposits()[0].amount.toNumber(),
      obligationCollFarmStateAfterRepayAndWithdraw?.activeStakeScaled.toNumber()
    );
    assert.ok(
      fuzzyEq(
        obligationAfterRepayAndWithdraw.getBorrows()[0].amount.toNumber() / debtReserve.getMintFactor().toNumber(),
        obligationDebtFarmStateAfterRepayAndWithdraw?.activeStakeScaled.toNumber()! /
          debtReserve.getMintFactor().toNumber(),
        0.0035
      )
    );
  });

  it('init_refresh_farm_deposit_borrow_and_repay_withdraw_sol_coll_farm_debt_farm', async function () {
    const [collToken, debtToken] = ['SOL', 'USDC'];

    const { env, kaminoMarket } = await createMarketWithTwoReservesToppedUp(
      [collToken, new Decimal(5000.05)],
      [debtToken, new Decimal(5000.05)]
    );

    const borrower = await newUser(env, kaminoMarket, [
      [collToken, new Decimal(2000)],
      [debtToken, new Decimal(0)],
    ]);

    await deposit(env, kaminoMarket, borrower, collToken, new Decimal(100));
    await borrow(env, kaminoMarket, borrower, debtToken, new Decimal(1000));

    const collReserve = kaminoMarket.getReserveBySymbol(collToken)!;
    const debtReserve = kaminoMarket.getReserveBySymbol(debtToken)!;
    // adding both coll and debt farms to ensure none is causing problems (we will have both for points anyway)
    await initializeFarmsForReserve(env, kaminoMarket.getAddress(), collReserve.address, 'Collateral', false, false);
    await initializeFarmsForReserve(env, kaminoMarket.getAddress(), collReserve.address, 'Debt', false, false);
    await initializeFarmsForReserve(env, kaminoMarket.getAddress(), debtReserve.address, 'Collateral', false, false);
    await initializeFarmsForReserve(env, kaminoMarket.getAddress(), debtReserve.address, 'Debt', false, false);
    await sleep(2000);

    await kaminoMarket.reload();
    const toDeposit = 10;
    const toBorrow = 100;
    const depositAndBorrowAction = await KaminoAction.buildDepositAndBorrowTxns(
      kaminoMarket,
      numberToLamportsDecimal(toDeposit, collReserve.stats.decimals).floor().toString(),
      collReserve.getLiquidityMint(),
      numberToLamportsDecimal(toBorrow, debtReserve.stats.decimals).floor().toString(),
      debtReserve.getLiquidityMint(),
      borrower.publicKey,
      new VanillaObligation(PROGRAM_ID)
    );

    const depositAndBorrowIxs: TransactionInstruction[] = [];
    depositAndBorrowIxs.push(
      ...depositAndBorrowAction.setupIxs,
      ...[depositAndBorrowAction.lendingIxs[0]],
      ...depositAndBorrowAction.inBetweenIxs,
      ...[depositAndBorrowAction.lendingIxs[1]],
      ...depositAndBorrowAction.cleanupIxs
    );

    console.log(
      depositAndBorrowAction.setupIxsLabels,
      depositAndBorrowAction.lendingIxsLabels[0],
      depositAndBorrowAction.inBetweenIxsLabels,
      depositAndBorrowAction.lendingIxsLabels[1],
      depositAndBorrowAction.cleanupIxsLabels
    );

    const depositAndBorrowLookupTable = await createLookupTable(
      env,
      depositAndBorrowIxs
        .map((ixn) => ixn.keys)
        .flat()
        .map((key) => key.pubkey)
    );
    await sleep(2000);

    const depositAndBorrowTx = await buildVersionedTransaction(
      env.provider.connection,
      borrower.publicKey,
      depositAndBorrowIxs,
      [depositAndBorrowLookupTable]
    );
    depositAndBorrowTx.sign([borrower]);

    await sendAndConfirmVersionedTransaction(env.provider.connection, depositAndBorrowTx, 'confirmed');

    const obligationAfterDepositAndBorrow = (await kaminoMarket.getUserObligationsByTag(
      VanillaObligation.tag,
      borrower.publicKey
    ))![0];
    const obligationCollFarmStateAfterDepositAndBorrow = await getObligationFarmState(
      env,
      obligationAfterDepositAndBorrow,
      kaminoMarket.getReserveBySymbol(collToken)!.state.farmCollateral
    );
    const obligationDebtFarmStateAfterDepositAndBorrow = await getObligationFarmState(
      env,
      obligationAfterDepositAndBorrow,
      kaminoMarket.getReserveBySymbol(debtToken)!.state.farmDebt
    );
    console.log(
      obligationAfterDepositAndBorrow.getBorrows()[0].amount.toNumber() / debtReserve.getMintFactor().toNumber()
    );
    console.log(
      obligationDebtFarmStateAfterDepositAndBorrow?.activeStakeScaled.toNumber()! /
        debtReserve.getMintFactor().toNumber()
    );
    assert.equal(
      obligationAfterDepositAndBorrow.getDeposits()[0].amount.toNumber(),
      obligationCollFarmStateAfterDepositAndBorrow?.activeStakeScaled.toNumber()
    );
    assert.ok(
      fuzzyEq(
        obligationAfterDepositAndBorrow.getBorrows()[0].amount.toNumber() / debtReserve.getMintFactor().toNumber(),
        obligationDebtFarmStateAfterDepositAndBorrow?.activeStakeScaled.toNumber()! /
          debtReserve.getMintFactor().toNumber(),
        0.0035
      )
    );

    const repayAndWithdrawAction = await KaminoAction.buildRepayAndWithdrawTxns(
      kaminoMarket,
      numberToLamportsDecimal(toBorrow, debtReserve.stats.decimals).floor().toString(),
      debtReserve.getLiquidityMint(),
      numberToLamportsDecimal(toDeposit, collReserve.stats.decimals).floor().toString(),
      collReserve.getLiquidityMint(),
      borrower.publicKey,
      await env.provider.connection.getSlot(),
      new VanillaObligation(PROGRAM_ID)
    );

    const repayAndWithdrawIxs: TransactionInstruction[] = [];
    repayAndWithdrawIxs.push(
      ...repayAndWithdrawAction.setupIxs,
      ...[repayAndWithdrawAction.lendingIxs[0]],
      ...repayAndWithdrawAction.inBetweenIxs,
      ...[repayAndWithdrawAction.lendingIxs[1]],
      ...repayAndWithdrawAction.cleanupIxs
    );

    console.log(
      repayAndWithdrawAction.setupIxsLabels,
      repayAndWithdrawAction.lendingIxsLabels[0],
      repayAndWithdrawAction.inBetweenIxsLabels,
      repayAndWithdrawAction.lendingIxsLabels[1],
      repayAndWithdrawAction.cleanupIxsLabels
    );

    const repayAndWithdrawLookupTable = await createLookupTable(
      env,
      repayAndWithdrawIxs
        .map((ixn) => ixn.keys)
        .flat()
        .map((key) => key.pubkey)
    );
    await sleep(2000);

    const repayAndWithdrawTx = await buildVersionedTransaction(
      env.provider.connection,
      borrower.publicKey,
      repayAndWithdrawIxs,
      [repayAndWithdrawLookupTable]
    );
    repayAndWithdrawTx.sign([borrower]);

    await sendAndConfirmVersionedTransaction(env.provider.connection, repayAndWithdrawTx, 'confirmed');

    const obligationAfterRepayAndWithdraw = (await kaminoMarket.getUserObligationsByTag(
      VanillaObligation.tag,
      borrower.publicKey
    ))![0];
    const obligationCollFarmStateAfterRepayAndWithdraw = await getObligationFarmState(
      env,
      obligationAfterRepayAndWithdraw,
      kaminoMarket.getReserveBySymbol(collToken)!.state.farmCollateral
    );
    const obligationDebtFarmStateAfterRepayAndWithdraw = await getObligationFarmState(
      env,
      obligationAfterRepayAndWithdraw,
      kaminoMarket.getReserveBySymbol(debtToken)!.state.farmDebt
    );
    assert.equal(
      obligationAfterRepayAndWithdraw.getDeposits()[0].amount.toNumber(),
      obligationCollFarmStateAfterRepayAndWithdraw?.activeStakeScaled.toNumber()
    );
    console.log(
      obligationAfterDepositAndBorrow.getBorrows()[0].amount.toNumber() / debtReserve.getMintFactor().toNumber()
    );
    console.log(
      obligationDebtFarmStateAfterDepositAndBorrow?.activeStakeScaled.toNumber()! /
        debtReserve.getMintFactor().toNumber()
    );
    assert.ok(
      fuzzyEq(
        obligationAfterRepayAndWithdraw.getBorrows()[0].amount.toNumber() / debtReserve.getMintFactor().toNumber(),
        obligationDebtFarmStateAfterRepayAndWithdraw?.activeStakeScaled.toNumber()! /
          debtReserve.getMintFactor().toNumber(),
        0.004
      )
    );
  });

  it('init_refresh_farm_deposit_borrow_and_repay_withdraw_coll_farm_sol_debt_farm', async function () {
    const [collToken, debtToken] = ['USDH', 'SOL'];

    const { env, kaminoMarket } = await createMarketWithTwoReservesToppedUp(
      [collToken, new Decimal(5000.05)],
      [debtToken, new Decimal(5000.05)]
    );

    const borrower = await newUser(env, kaminoMarket, [
      [collToken, new Decimal(2000)],
      [debtToken, new Decimal(0)],
    ]);

    await deposit(env, kaminoMarket, borrower, collToken, new Decimal(1000));
    await borrow(env, kaminoMarket, borrower, debtToken, new Decimal(10));

    const collReserve = kaminoMarket.getReserveBySymbol(collToken)!;
    const debtReserve = kaminoMarket.getReserveBySymbol(debtToken)!;
    // adding both coll and debt farms to ensure none is causing problems (we will have both in each reserve for points anyway)
    await initializeFarmsForReserve(env, kaminoMarket.getAddress(), collReserve.address, 'Collateral', false, false);
    await initializeFarmsForReserve(env, kaminoMarket.getAddress(), collReserve.address, 'Debt', false, false);
    await initializeFarmsForReserve(env, kaminoMarket.getAddress(), debtReserve.address, 'Collateral', false, false);
    await initializeFarmsForReserve(env, kaminoMarket.getAddress(), debtReserve.address, 'Debt', false, false);
    await sleep(2000);

    await kaminoMarket.reload();
    const toDeposit = 100;
    const toBorrow = 1;
    const depositAndBorrowAction = await KaminoAction.buildDepositAndBorrowTxns(
      kaminoMarket,
      numberToLamportsDecimal(toDeposit, collReserve.stats.decimals).floor().toString(),
      collReserve.getLiquidityMint(),
      numberToLamportsDecimal(toBorrow, debtReserve.stats.decimals).floor().toString(),
      debtReserve.getLiquidityMint(),
      borrower.publicKey,
      new VanillaObligation(PROGRAM_ID)
    );

    const depositAndBorrowIxs: TransactionInstruction[] = [];
    depositAndBorrowIxs.push(
      ...depositAndBorrowAction.setupIxs,
      ...[depositAndBorrowAction.lendingIxs[0]],
      ...depositAndBorrowAction.inBetweenIxs,
      ...[depositAndBorrowAction.lendingIxs[1]],
      ...depositAndBorrowAction.cleanupIxs
    );

    console.log(
      depositAndBorrowAction.setupIxsLabels,
      depositAndBorrowAction.lendingIxsLabels[0],
      depositAndBorrowAction.inBetweenIxsLabels,
      depositAndBorrowAction.lendingIxsLabels[1],
      depositAndBorrowAction.cleanupIxsLabels
    );

    const depositAndBorrowLookupTable = await createLookupTable(
      env,
      depositAndBorrowIxs
        .map((ixn) => ixn.keys)
        .flat()
        .map((key) => key.pubkey)
    );
    await sleep(2000);

    const depositAndBorrowTx = await buildVersionedTransaction(
      env.provider.connection,
      borrower.publicKey,
      depositAndBorrowIxs,
      [depositAndBorrowLookupTable]
    );
    depositAndBorrowTx.sign([borrower]);

    await sendAndConfirmVersionedTransaction(env.provider.connection, depositAndBorrowTx, 'confirmed');

    const obligationAfterDepositAndBorrow = (await kaminoMarket.getUserObligationsByTag(
      VanillaObligation.tag,
      borrower.publicKey
    ))![0];
    const obligationCollFarmStateAfterDepositAndBorrow = await getObligationFarmState(
      env,
      obligationAfterDepositAndBorrow,
      kaminoMarket.getReserveBySymbol(collToken)!.state.farmCollateral
    );
    const obligationDebtFarmStateAfterDepositAndBorrow = await getObligationFarmState(
      env,
      obligationAfterDepositAndBorrow,
      kaminoMarket.getReserveBySymbol(debtToken)!.state.farmDebt
    );
    console.log(obligationAfterDepositAndBorrow);
    assert.equal(
      obligationAfterDepositAndBorrow.getDeposits()[0].amount.toNumber(),
      obligationCollFarmStateAfterDepositAndBorrow?.activeStakeScaled.toNumber()
    );
    assert.ok(
      fuzzyEq(
        obligationAfterDepositAndBorrow.getBorrows()[0].amount.toNumber() / debtReserve.getMintFactor().toNumber(),
        obligationDebtFarmStateAfterDepositAndBorrow?.activeStakeScaled.toNumber()! /
          debtReserve.getMintFactor().toNumber(),
        0.002
      )
    );

    const repayAndWithdrawAction = await KaminoAction.buildRepayAndWithdrawTxns(
      kaminoMarket,
      numberToLamportsDecimal(toBorrow, debtReserve.stats.decimals).floor().toString(),
      debtReserve.getLiquidityMint(),
      numberToLamportsDecimal(toDeposit, collReserve.stats.decimals).floor().toString(),
      collReserve.getLiquidityMint(),
      borrower.publicKey,
      await env.provider.connection.getSlot(),
      new VanillaObligation(PROGRAM_ID)
    );

    const repayAndWithdrawIxs: TransactionInstruction[] = [];
    repayAndWithdrawIxs.push(
      ...repayAndWithdrawAction.setupIxs,
      ...[repayAndWithdrawAction.lendingIxs[0]],
      ...repayAndWithdrawAction.inBetweenIxs,
      ...[repayAndWithdrawAction.lendingIxs[1]],
      ...repayAndWithdrawAction.cleanupIxs
    );

    console.log(
      repayAndWithdrawAction.setupIxsLabels,
      repayAndWithdrawAction.lendingIxsLabels[0],
      repayAndWithdrawAction.inBetweenIxsLabels,
      repayAndWithdrawAction.lendingIxsLabels[1],
      repayAndWithdrawAction.cleanupIxsLabels
    );

    const repayAndWithdrawLookupTable = await createLookupTable(
      env,
      repayAndWithdrawIxs
        .map((ixn) => ixn.keys)
        .flat()
        .map((key) => key.pubkey)
    );
    await sleep(2000);

    const repayAndWithdrawTx = await buildVersionedTransaction(
      env.provider.connection,
      borrower.publicKey,
      repayAndWithdrawIxs,
      [repayAndWithdrawLookupTable]
    );
    repayAndWithdrawTx.sign([borrower]);

    await sendAndConfirmVersionedTransaction(env.provider.connection, repayAndWithdrawTx, 'confirmed');

    const obligationAfterRepayAndWithdraw = (await kaminoMarket.getUserObligationsByTag(
      VanillaObligation.tag,
      borrower.publicKey
    ))![0];
    const obligationCollFarmStateAfterRepayAndWithdraw = await getObligationFarmState(
      env,
      obligationAfterRepayAndWithdraw,
      kaminoMarket.getReserveBySymbol(collToken)!.state.farmCollateral
    );
    const obligationDebtFarmStateAfterRepayAndWithdraw = await getObligationFarmState(
      env,
      obligationAfterRepayAndWithdraw,
      kaminoMarket.getReserveBySymbol(debtToken)!.state.farmDebt
    );
    assert.equal(
      obligationAfterRepayAndWithdraw.getDeposits()[0].amount.toNumber(),
      obligationCollFarmStateAfterRepayAndWithdraw?.activeStakeScaled.toNumber()
    );
    assert.ok(
      fuzzyEq(
        obligationAfterRepayAndWithdraw.getBorrows()[0].amount.toNumber() / debtReserve.getMintFactor().toNumber(),
        obligationDebtFarmStateAfterRepayAndWithdraw?.activeStakeScaled.toNumber()! /
          debtReserve.getMintFactor().toNumber(),
        0.002
      )
    );
  });

  it('init_refresh_farm_deposit_borrow_and_repay_withdraw_coll_farm_debt_farm_3_deposits_5_borrows', async function () {
    const borrowAmount = 500000000;
    const env = await initEnv('localnet');

    const depositSymbols = ['SOL', 'USDH', 'USDC'];
    const borrowSymbols = ['SOL', 'UXD', 'STSOL', 'USDT', 'MSOL'];
    const [collToken, debtToken] = ['USDH', 'USDT'];

    const [createMarketSig, lendingMarket] = await createMarket(env);
    console.log(createMarketSig);
    await sleep(2000);

    const depositMints = [NATIVE_MINT];
    const borrowMints = [NATIVE_MINT];
    for (let index = 1; index < depositSymbols.length; index++) {
      depositMints.push(await createMint(env, env.admin.publicKey, 6));
    }
    for (let index = 1; index < borrowSymbols.length; index++) {
      borrowMints.push(await createMint(env, env.admin.publicKey, 6));
    }
    await sleep(2000);

    const [, solReserve] = await createReserve(env, lendingMarket.publicKey, NATIVE_MINT);
    await sleep(1000);

    const depositReserves = [solReserve];
    const borrowReserves = [solReserve];

    for (let index = 1; index < depositSymbols.length; index++) {
      const [, reserve] = await createReserve(env, lendingMarket.publicKey, depositMints[index]);
      depositReserves.push(reserve);
    }

    for (let index = 1; index < borrowSymbols.length; index++) {
      const [, reserve] = await createReserve(env, lendingMarket.publicKey, borrowMints[index]);
      borrowReserves.push(reserve);
    }
    await sleep(2000);

    await env.provider.connection.requestAirdrop(env.admin.publicKey, 1000000000000);

    for (let index = 1; index < depositSymbols.length; index++) {
      const [_, ata] = await createAta(env, env.admin.publicKey, depositMints[index]);
      await sleep(2000);
      await mintTo(env, depositMints[index], ata, 1000000000000);
      await sleep(1000);
    }
    await sleep(2000);

    // Update reserve configs deposits config from 1 because SOL updated in borrows
    for (let index = 1; index < depositSymbols.length; index++) {
      const reserveConfig = makeReserveConfig(depositSymbols[index]);
      await updateReserve(env, depositReserves[index].publicKey, reserveConfig);
      await sleep(1000);
    }

    for (let index = 0; index < borrowSymbols.length; index++) {
      const reserveConfig = makeReserveConfig(borrowSymbols[index]);
      await updateReserve(env, borrowReserves[index].publicKey, reserveConfig);
      await sleep(1000);
    }

    const kaminoMarket = (await KaminoMarket.load(
      env.provider.connection,
      lendingMarket.publicKey,
      DEFAULT_RECENT_SLOT_DURATION_MS,
      PROGRAM_ID,
      true
    ))!;
    await sleep(2000);

    // deposit from user to deposit reserves
    for (let index = 0; index < depositSymbols.length; index++) {
      const depositAction = await KaminoAction.buildDepositTxns(
        kaminoMarket!,
        '100000000000',
        depositMints[index],
        env.admin.publicKey,
        new VanillaObligation(PROGRAM_ID)
      );

      await sendTransactionsFromAction(env, depositAction, env.admin);
      await sleep(2000);
    }

    // Deposit from different depositor to the borrow reserves
    const depositor = Keypair.generate();
    await env.provider.connection.requestAirdrop(depositor.publicKey, 10000000000);
    await sleep(1000);
    for (let index = 1; index < borrowSymbols.length; index++) {
      const [_, ata] = await createAta(env, depositor.publicKey, borrowMints[index]);
      await sleep(1000);
      await mintTo(env, borrowMints[index], ata, 100000000000);
    }

    for (let index = 1; index < borrowSymbols.length; index++) {
      const depositAction = await KaminoAction.buildDepositTxns(
        kaminoMarket!,
        (borrowAmount * 10).toString(),
        borrowMints[index],
        depositor.publicKey,
        new VanillaObligation(PROGRAM_ID)
      );

      await sendTransactionsFromAction(env, depositAction, depositor, [depositor]);
      await sleep(2000);
    }

    const preBorrowAmounts: Decimal[] = [];

    // borrow and get initial borrows
    for (let index = 0; index < borrowSymbols.length; index++) {
      const borrowAction = await KaminoAction.buildBorrowTxns(
        kaminoMarket!,
        borrowAmount.toString(),
        borrowMints[index],
        env.admin.publicKey,
        new VanillaObligation(PROGRAM_ID),
        500_000
      );

      const borrowIxns = [...borrowAction.setupIxs, ...borrowAction.lendingIxs];

      // Create lookup table
      const borrowLookupTable = await createLookupTable(
        env,
        borrowIxns
          .map((ixn) => ixn.keys)
          .flat()
          .map((key) => key.pubkey)
      );
      await sleep(2000);

      const tx = await buildVersionedTransaction(env.provider.connection, env.admin.publicKey, borrowIxns, [
        borrowLookupTable,
      ]);
      tx.sign([env.admin]);

      await sendAndConfirmVersionedTransaction(env.provider.connection, tx, 'confirmed');

      await sleep(2000);

      const obligation = (await kaminoMarket!.getObligationByWallet(
        env.admin.publicKey,
        new VanillaObligation(PROGRAM_ID)
      ))!;

      const obligationLiquidity = obligation.state.borrows[index];
      preBorrowAmounts[index] = KaminoObligation.getBorrowAmount(obligationLiquidity);
    }

    const borrower = env.admin;
    const collReserve = kaminoMarket.getReserveBySymbol(collToken)!;
    const debtReserve = kaminoMarket.getReserveBySymbol(debtToken)!;

    await initializeFarmsForReserve(env, kaminoMarket.getAddress(), collReserve.address, 'Collateral', false, false);
    await initializeFarmsForReserve(env, kaminoMarket.getAddress(), collReserve.address, 'Debt', false, false);
    await initializeFarmsForReserve(env, kaminoMarket.getAddress(), debtReserve.address, 'Collateral', false, false);
    await initializeFarmsForReserve(env, kaminoMarket.getAddress(), debtReserve.address, 'Debt', false, false);
    await sleep(2000);
    await kaminoMarket.reload();

    const toDeposit = 100;
    const toBorrow = 1;
    const depositAndBorrowAction = await KaminoAction.buildDepositAndBorrowTxns(
      kaminoMarket,
      numberToLamportsDecimal(toDeposit, collReserve.stats.decimals).floor().toString(),
      collReserve.getLiquidityMint(),
      numberToLamportsDecimal(toBorrow, debtReserve.stats.decimals).floor().toString(),
      debtReserve.getLiquidityMint(),
      borrower.publicKey,
      new VanillaObligation(PROGRAM_ID)
    );

    const depositAndBorrowIxs: TransactionInstruction[] = [];
    depositAndBorrowIxs.push(
      ...depositAndBorrowAction.setupIxs,
      ...[depositAndBorrowAction.lendingIxs[0]],
      ...depositAndBorrowAction.inBetweenIxs,
      ...[depositAndBorrowAction.lendingIxs[1]],
      ...depositAndBorrowAction.cleanupIxs
    );

    console.log(
      depositAndBorrowAction.setupIxsLabels,
      depositAndBorrowAction.lendingIxsLabels[0],
      depositAndBorrowAction.inBetweenIxsLabels,
      depositAndBorrowAction.lendingIxsLabels[1],
      depositAndBorrowAction.cleanupIxsLabels
    );

    const depositAndBorrowLookupTable = await createLookupTable(
      env,
      depositAndBorrowIxs
        .map((ixn) => ixn.keys)
        .flat()
        .map((key) => key.pubkey)
    );
    await sleep(2000);

    const depositAndBorrowTx = await buildVersionedTransaction(
      env.provider.connection,
      borrower.publicKey,
      depositAndBorrowIxs,
      [depositAndBorrowLookupTable]
    );
    depositAndBorrowTx.sign([borrower]);

    await sendAndConfirmVersionedTransaction(env.provider.connection, depositAndBorrowTx, 'confirmed');
    await sleep(2000);

    const obligationAfterDepositAndBorrow = (await kaminoMarket.getUserObligationsByTag(
      VanillaObligation.tag,
      borrower.publicKey
    ))![0];
    const obligationCollFarmStateAfterDepositAndBorrow = await getObligationFarmState(
      env,
      obligationAfterDepositAndBorrow,
      kaminoMarket.getReserveBySymbol(collToken)!.state.farmCollateral
    );
    const obligationDebtFarmStateAfterDepositAndBorrow = await getObligationFarmState(
      env,
      obligationAfterDepositAndBorrow,
      kaminoMarket.getReserveBySymbol(debtToken)!.state.farmDebt
    );
    console.log(obligationAfterDepositAndBorrow);
    assert.equal(
      obligationAfterDepositAndBorrow.getDepositByReserve(collReserve.address)!.amount.toNumber(),
      obligationCollFarmStateAfterDepositAndBorrow?.activeStakeScaled.toNumber()
    );
    assert.ok(
      fuzzyEq(
        obligationAfterDepositAndBorrow.getBorrowByReserve(debtReserve.address)!.amount.toNumber() /
          debtReserve.getMintFactor().toNumber(),
        obligationDebtFarmStateAfterDepositAndBorrow?.activeStakeScaled.toNumber()! /
          debtReserve.getMintFactor().toNumber(),
        0.004
      )
    );

    const repayAndWithdrawAction = await KaminoAction.buildRepayAndWithdrawTxns(
      kaminoMarket,
      numberToLamportsDecimal(toBorrow, debtReserve.stats.decimals).floor().toString(),
      debtReserve.getLiquidityMint(),
      numberToLamportsDecimal(toDeposit, collReserve.stats.decimals).floor().toString(),
      collReserve.getLiquidityMint(),
      borrower.publicKey,
      await env.provider.connection.getSlot(),
      new VanillaObligation(PROGRAM_ID)
    );

    const repayAndWithdrawIxs: TransactionInstruction[] = [];
    repayAndWithdrawIxs.push(
      ...repayAndWithdrawAction.setupIxs,
      ...[repayAndWithdrawAction.lendingIxs[0]],
      ...repayAndWithdrawAction.inBetweenIxs,
      ...[repayAndWithdrawAction.lendingIxs[1]],
      ...repayAndWithdrawAction.cleanupIxs
    );

    console.log(
      repayAndWithdrawAction.setupIxsLabels,
      repayAndWithdrawAction.lendingIxsLabels[0],
      repayAndWithdrawAction.inBetweenIxsLabels,
      repayAndWithdrawAction.lendingIxsLabels[1],
      repayAndWithdrawAction.cleanupIxsLabels
    );

    const repayAndWithdrawLookupTable = await createLookupTable(
      env,
      repayAndWithdrawIxs
        .map((ixn) => ixn.keys)
        .flat()
        .map((key) => key.pubkey)
    );
    await sleep(2000);

    const repayAndWithdrawTx = await buildVersionedTransaction(
      env.provider.connection,
      borrower.publicKey,
      repayAndWithdrawIxs,
      [repayAndWithdrawLookupTable]
    );
    repayAndWithdrawTx.sign([borrower]);

    await sendAndConfirmVersionedTransaction(env.provider.connection, repayAndWithdrawTx, 'confirmed');

    const obligationAfterRepayAndWithdraw = (await kaminoMarket.getUserObligationsByTag(
      VanillaObligation.tag,
      borrower.publicKey
    ))![0];
    const obligationCollFarmStateAfterRepayAndWithdraw = await getObligationFarmState(
      env,
      obligationAfterRepayAndWithdraw,
      kaminoMarket.getReserveBySymbol(collToken)!.state.farmCollateral
    );
    const obligationDebtFarmStateAfterRepayAndWithdraw = await getObligationFarmState(
      env,
      obligationAfterRepayAndWithdraw,
      kaminoMarket.getReserveBySymbol(debtToken)!.state.farmDebt
    );
    assert.equal(
      obligationAfterRepayAndWithdraw.getDepositByReserve(collReserve.address)!.amount.toNumber(),
      obligationCollFarmStateAfterRepayAndWithdraw?.activeStakeScaled.toNumber()
    );
    assert.ok(
      fuzzyEq(
        obligationAfterRepayAndWithdraw.getBorrows()[0].amount.toNumber() / debtReserve.getMintFactor().toNumber(),
        obligationDebtFarmStateAfterRepayAndWithdraw?.activeStakeScaled.toNumber()! /
          debtReserve.getMintFactor().toNumber(),
        0.004
      )
    );
  });

  it('init_refresh_farm_deposit_borrow_and_repay_withdraw_coll_farm_sol_debt_farm_3_deposits_5_borrows', async function () {
    const borrowAmount = 500000000;
    const env = await initEnv('localnet');

    const depositSymbols = ['SOL', 'USDH', 'USDC', 'MSOL'];
    const borrowSymbols = ['SOL', 'UXD', 'STSOL', 'USDT'];
    const [collToken, debtToken] = ['MSOL', 'SOL'];

    const [createMarketSig, lendingMarket] = await createMarket(env);
    console.log(createMarketSig);
    await sleep(2000);

    const depositMints = [NATIVE_MINT];
    const borrowMints = [NATIVE_MINT];
    for (let index = 1; index < depositSymbols.length; index++) {
      depositMints.push(await createMint(env, env.admin.publicKey, 6));
    }
    for (let index = 1; index < borrowSymbols.length; index++) {
      borrowMints.push(await createMint(env, env.admin.publicKey, 6));
    }
    await sleep(2000);

    const [, solReserve] = await createReserve(env, lendingMarket.publicKey, NATIVE_MINT);
    await sleep(1000);

    const depositReserves = [solReserve];
    const borrowReserves = [solReserve];

    for (let index = 1; index < depositSymbols.length; index++) {
      const [, reserve] = await createReserve(env, lendingMarket.publicKey, depositMints[index]);
      depositReserves.push(reserve);
    }

    for (let index = 1; index < borrowSymbols.length; index++) {
      const [, reserve] = await createReserve(env, lendingMarket.publicKey, borrowMints[index]);
      borrowReserves.push(reserve);
    }
    await sleep(2000);

    await env.provider.connection.requestAirdrop(env.admin.publicKey, 1000000000000);

    for (let index = 1; index < depositSymbols.length; index++) {
      const [_, ata] = await createAta(env, env.admin.publicKey, depositMints[index]);
      await sleep(2000);
      await mintTo(env, depositMints[index], ata, 1000000000000);
      await sleep(1000);
    }
    await sleep(2000);

    // Update reserve configs deposits config from 1 because SOL updated in borrows
    for (let index = 1; index < depositSymbols.length; index++) {
      const reserveConfig = makeReserveConfig(depositSymbols[index]);
      await updateReserve(env, depositReserves[index].publicKey, reserveConfig);
      await sleep(1000);
    }

    for (let index = 0; index < borrowSymbols.length; index++) {
      const reserveConfig = makeReserveConfig(borrowSymbols[index]);
      await updateReserve(env, borrowReserves[index].publicKey, reserveConfig);
      await sleep(1000);
    }

    const kaminoMarket = (await KaminoMarket.load(
      env.provider.connection,
      lendingMarket.publicKey,
      DEFAULT_RECENT_SLOT_DURATION_MS,
      PROGRAM_ID,
      true
    ))!;
    await sleep(2000);

    // deposit from user to deposit reserves
    for (let index = 0; index < depositSymbols.length; index++) {
      const depositAction = await KaminoAction.buildDepositTxns(
        kaminoMarket!,
        '100000000000',
        depositMints[index],
        env.admin.publicKey,
        new VanillaObligation(PROGRAM_ID)
      );

      await sendTransactionsFromAction(env, depositAction, env.admin);
      await sleep(2000);
    }

    // Deposit from different depositor to the borrow reserves
    const depositor = Keypair.generate();
    await env.provider.connection.requestAirdrop(depositor.publicKey, 10000000000);
    await sleep(1000);
    for (let index = 1; index < borrowSymbols.length; index++) {
      const [_, ata] = await createAta(env, depositor.publicKey, borrowMints[index]);
      await sleep(1000);
      await mintTo(env, borrowMints[index], ata, 100000000000);
    }

    for (let index = 1; index < borrowSymbols.length; index++) {
      const depositAction = await KaminoAction.buildDepositTxns(
        kaminoMarket!,
        (borrowAmount * 10).toString(),
        borrowMints[index],
        depositor.publicKey,
        new VanillaObligation(PROGRAM_ID)
      );

      await sendTransactionsFromAction(env, depositAction, depositor, [depositor]);
      await sleep(2000);
    }

    const preBorrowAmounts: Decimal[] = [];

    // borrow and get initial borrows
    for (let index = 0; index < borrowSymbols.length; index++) {
      const borrowAction = await KaminoAction.buildBorrowTxns(
        kaminoMarket!,
        borrowAmount.toString(),
        borrowMints[index],
        env.admin.publicKey,
        new VanillaObligation(PROGRAM_ID),
        500_000
      );

      const borrowIxns = [...borrowAction.setupIxs, ...borrowAction.lendingIxs];

      // Create lookup table
      const borrowLookupTable = await createLookupTable(
        env,
        borrowIxns
          .map((ixn) => ixn.keys)
          .flat()
          .map((key) => key.pubkey)
      );
      await sleep(2000);

      const tx = await buildVersionedTransaction(env.provider.connection, env.admin.publicKey, borrowIxns, [
        borrowLookupTable,
      ]);
      tx.sign([env.admin]);

      await sendAndConfirmVersionedTransaction(env.provider.connection, tx, 'confirmed');

      await sleep(2000);

      const obligation = (await kaminoMarket!.getObligationByWallet(
        env.admin.publicKey,
        new VanillaObligation(PROGRAM_ID)
      ))!;

      const obligationLiquidity = obligation.state.borrows[index];
      preBorrowAmounts[index] = KaminoObligation.getBorrowAmount(obligationLiquidity);
    }

    const borrower = env.admin;
    const collReserve = kaminoMarket.getReserveBySymbol(collToken)!;
    const debtReserve = kaminoMarket.getReserveBySymbol(debtToken)!;

    await initializeFarmsForReserve(env, kaminoMarket.getAddress(), collReserve.address, 'Collateral', false, false);
    await initializeFarmsForReserve(env, kaminoMarket.getAddress(), collReserve.address, 'Debt', false, false);
    await initializeFarmsForReserve(env, kaminoMarket.getAddress(), debtReserve.address, 'Collateral', false, false);
    await initializeFarmsForReserve(env, kaminoMarket.getAddress(), debtReserve.address, 'Debt', false, false);
    await sleep(2000);
    await kaminoMarket.reload();

    const toDeposit = 100;
    const toBorrow = 1;
    const depositAndBorrowAction = await KaminoAction.buildDepositAndBorrowTxns(
      kaminoMarket,
      numberToLamportsDecimal(toDeposit, collReserve.stats.decimals).floor().toString(),
      collReserve.getLiquidityMint(),
      numberToLamportsDecimal(toBorrow, debtReserve.stats.decimals).floor().toString(),
      debtReserve.getLiquidityMint(),
      borrower.publicKey,
      new VanillaObligation(PROGRAM_ID)
    );

    const depositAndBorrowIxs: TransactionInstruction[] = [];
    depositAndBorrowIxs.push(
      ...depositAndBorrowAction.setupIxs,
      ...[depositAndBorrowAction.lendingIxs[0]],
      ...depositAndBorrowAction.inBetweenIxs,
      ...[depositAndBorrowAction.lendingIxs[1]],
      ...depositAndBorrowAction.cleanupIxs
    );

    console.log(
      depositAndBorrowAction.setupIxsLabels,
      depositAndBorrowAction.lendingIxsLabels[0],
      depositAndBorrowAction.inBetweenIxsLabels,
      depositAndBorrowAction.lendingIxsLabels[1],
      depositAndBorrowAction.cleanupIxsLabels
    );

    const depositAndBorrowLookupTable = await createLookupTable(
      env,
      depositAndBorrowIxs
        .map((ixn) => ixn.keys)
        .flat()
        .map((key) => key.pubkey)
    );
    await sleep(2000);

    const depositAndBorrowTx = await buildVersionedTransaction(
      env.provider.connection,
      borrower.publicKey,
      depositAndBorrowIxs,
      [depositAndBorrowLookupTable]
    );
    depositAndBorrowTx.sign([borrower]);

    await sendAndConfirmVersionedTransaction(env.provider.connection, depositAndBorrowTx, 'confirmed');
    await sleep(2000);

    const obligationAfterDepositAndBorrow = (await kaminoMarket.getUserObligationsByTag(
      VanillaObligation.tag,
      borrower.publicKey
    ))![0];
    const obligationCollFarmStateAfterDepositAndBorrow = await getObligationFarmState(
      env,
      obligationAfterDepositAndBorrow,
      kaminoMarket.getReserveBySymbol(collToken)!.state.farmCollateral
    );
    const obligationDebtFarmStateAfterDepositAndBorrow = await getObligationFarmState(
      env,
      obligationAfterDepositAndBorrow,
      kaminoMarket.getReserveBySymbol(debtToken)!.state.farmDebt
    );
    console.log(obligationAfterDepositAndBorrow);
    assert.ok(
      fuzzyEq(
        obligationAfterDepositAndBorrow.getDepositByReserve(collReserve.address)!.amount.toNumber(),
        obligationCollFarmStateAfterDepositAndBorrow?.activeStakeScaled.toNumber()!,
        1
      )
    );
    assert.ok(
      fuzzyEq(
        obligationAfterDepositAndBorrow.getBorrowByReserve(debtReserve.address)!.amount.toNumber() /
          debtReserve.getMintFactor().toNumber(),
        obligationDebtFarmStateAfterDepositAndBorrow?.activeStakeScaled.toNumber()! /
          debtReserve.getMintFactor().toNumber(),
        0.003
      )
    );

    const repayAndWithdrawAction = await KaminoAction.buildRepayAndWithdrawTxns(
      kaminoMarket,
      numberToLamportsDecimal(toBorrow, debtReserve.stats.decimals).floor().toString(),
      debtReserve.getLiquidityMint(),
      numberToLamportsDecimal(toDeposit, collReserve.stats.decimals).floor().toString(),
      collReserve.getLiquidityMint(),
      borrower.publicKey,
      await env.provider.connection.getSlot(),
      new VanillaObligation(PROGRAM_ID)
    );

    const repayAndWithdrawIxs: TransactionInstruction[] = [];
    repayAndWithdrawIxs.push(
      ...repayAndWithdrawAction.setupIxs,
      ...[repayAndWithdrawAction.lendingIxs[0]],
      ...repayAndWithdrawAction.inBetweenIxs,
      ...[repayAndWithdrawAction.lendingIxs[1]],
      ...repayAndWithdrawAction.cleanupIxs
    );

    console.log(
      repayAndWithdrawAction.setupIxsLabels,
      repayAndWithdrawAction.lendingIxsLabels[0],
      repayAndWithdrawAction.inBetweenIxsLabels,
      repayAndWithdrawAction.lendingIxsLabels[1],
      repayAndWithdrawAction.cleanupIxsLabels
    );

    const repayAndWithdrawLookupTable = await createLookupTable(
      env,
      repayAndWithdrawIxs
        .map((ixn) => ixn.keys)
        .flat()
        .map((key) => key.pubkey)
    );
    await sleep(2000);

    const repayAndWithdrawTx = await buildVersionedTransaction(
      env.provider.connection,
      borrower.publicKey,
      repayAndWithdrawIxs,
      [repayAndWithdrawLookupTable]
    );
    repayAndWithdrawTx.sign([borrower]);

    await sendAndConfirmVersionedTransaction(env.provider.connection, repayAndWithdrawTx, 'confirmed');

    const obligationAfterRepayAndWithdraw = (await kaminoMarket.getUserObligationsByTag(
      VanillaObligation.tag,
      borrower.publicKey
    ))![0];
    const obligationCollFarmStateAfterRepayAndWithdraw = await getObligationFarmState(
      env,
      obligationAfterRepayAndWithdraw,
      kaminoMarket.getReserveBySymbol(collToken)!.state.farmCollateral
    );
    const obligationDebtFarmStateAfterRepayAndWithdraw = await getObligationFarmState(
      env,
      obligationAfterRepayAndWithdraw,
      kaminoMarket.getReserveBySymbol(debtToken)!.state.farmDebt
    );
    assert.ok(
      fuzzyEq(
        obligationAfterRepayAndWithdraw.getDepositByReserve(collReserve.address)!.amount.toNumber(),
        obligationCollFarmStateAfterRepayAndWithdraw?.activeStakeScaled.toNumber()!,
        1
      )
    );
    assert.ok(
      fuzzyEq(
        obligationAfterRepayAndWithdraw.getBorrows()[0].amount.toNumber() / debtReserve.getMintFactor().toNumber(),
        obligationDebtFarmStateAfterRepayAndWithdraw?.activeStakeScaled.toNumber()! /
          debtReserve.getMintFactor().toNumber(),
        0.003
      )
    );
  });
});
