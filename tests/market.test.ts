import { Connection, Keypair, LAMPORTS_PER_SOL, PublicKey, Transaction, TransactionInstruction } from '@solana/web3.js';
import Decimal from 'decimal.js';
import BN from 'bn.js';
import * as anchor from '@coral-xyz/anchor';
import {
  getBorrowRate,
  KaminoAction,
  KaminoMarket,
  PROGRAM_ID,
  sleep,
  STAGING_PROGRAM_ID,
  WRAPPED_SOL_MINT,
} from '../src';
import * as assert from 'assert';
import {
  buildAndSendTxnWithLogs,
  VanillaObligation,
  sendTransactionV0,
  buildVersionedTransaction,
  sendAndConfirmVersionedTransaction,
} from '../src';
import { createLookupTable, endpointFromCluster, initEnv, makeReserveConfig } from './setup_utils';
import { createMarket, createReserve, updateMarketElevationGroup, updateReserve } from './setup_operations';
import { createAta } from './token_utils';
import { NATIVE_MINT, TOKEN_PROGRAM_ID, Token } from '@solana/spl-token';
import { ReserveConfig } from '../src/idl_codegen/types';

const assertAlmostEqual = (v1: number, v2: number, epsilon_pct = 1) => {
  const res = (Math.abs(v1 - v2) / v1) * 100 <= epsilon_pct;
  if (!res) {
    console.log(`assertAlmostEqual failed: ${v1} vs ${v2}`);
    assert.ok(res);
  }
};

describe('Main lending market instruction tests', function () {
  it.skip('reads_kamino_lending_main_market', async function () {
    const connection = new Connection(endpointFromCluster('mainnet-beta'), {
      commitment: 'finalized',
    });

    const lendingMarketAddress = new PublicKey('6WVSwDQXrBZeQVnu6hpnsRZhodaJTZBUaC334SiiBKdb');

    const market = (await KaminoMarket.load(connection, lendingMarketAddress, STAGING_PROGRAM_ID))!;
    const reserve = market.getReserveBySymbol('SOL');

    assert.equal(reserve!.stats!.decimals, 9);
    assert.ok(reserve!.stats!.protocolTakeRate < 1);
  });

  it('calculate_borrow_rate', async function () {
    const curve: [number, number][] = [
      [0, 0.00001],
      [0.5, 1.0],
      [0.6, 1.2],
      [0.7, 1.4],
      [1, 2.0],
    ];

    // Interpolate between points
    assertAlmostEqual(getBorrowRate(0.66, curve), 1.32, 0.001);
    assertAlmostEqual(getBorrowRate(0.44, curve), 0.88, 0.001);
    assertAlmostEqual(getBorrowRate(0.33, curve), 0.66, 0.001);
    assertAlmostEqual(getBorrowRate(0.77, curve), 1.54, 0.001);

    // Interpolate at point ends
    assertAlmostEqual(getBorrowRate(0.6, curve), 1.2, 0.001);
    assertAlmostEqual(getBorrowRate(0.4, curve), 0.8, 0.001);
    assertAlmostEqual(getBorrowRate(0.3, curve), 0.6, 0.001);

    // Interpolate at the ends
    assertAlmostEqual(getBorrowRate(1.0, curve), 2.0, 0.001);
    assertAlmostEqual(getBorrowRate(0.0, curve), 0.00001, 0.001);
  });

  it.skip('reads_kamino_lending_primary_market_devnet', async function () {
    const connection = new Connection(endpointFromCluster('mainnet-beta'), {
      commitment: 'finalized',
    });

    const lendingMarketAddress = new PublicKey('6WVSwDQXrBZeQVnu6hpnsRZhodaJTZBUaC334SiiBKdb');

    const market = (await KaminoMarket.load(connection, lendingMarketAddress, STAGING_PROGRAM_ID))!;

    const reserve = market.getReserveBySymbol('SOL');
    const optimalUtilizationRate = reserve!.stats!.borrowCurve[1][0];
    assert.equal(optimalUtilizationRate, 0.8);
  });

  it('performs_a_deposit_sol', async function () {
    const symbol = 'SOL';
    const depositAmount = new BN('100');
    const env = await initEnv('localnet');

    await sleep(2000);

    const [createMarketSig, lendingMarket] = await createMarket(env);
    console.log(createMarketSig);
    await sleep(2000);

    await sleep(2000);
    const [, reserve] = await createReserve(env, lendingMarket.publicKey, NATIVE_MINT);
    await sleep(2000);

    const reserveConfig = makeReserveConfig(symbol);
    await updateReserve(env, reserve.publicKey, reserveConfig);
    await sleep(2000);

    const kaminoMarket = (await KaminoMarket.load(env.provider.connection, lendingMarket.publicKey, PROGRAM_ID, true))!;

    const depositBefore = await kaminoMarket.getObligationDepositByWallet(
      env.admin.publicKey,
      NATIVE_MINT,
      new VanillaObligation(PROGRAM_ID)
    );

    const kaminoAction = await KaminoAction.buildDepositTxns(
      kaminoMarket,
      depositAmount,
      NATIVE_MINT,
      env.admin.publicKey,
      new VanillaObligation(PROGRAM_ID)
    );

    const tx = await buildVersionedTransaction(env.provider.connection, env.admin.publicKey, [
      ...kaminoAction.setupIxs,
      ...kaminoAction.lendingIxs,
      ...kaminoAction.cleanupIxs,
    ]);
    const _txHash = await buildAndSendTxnWithLogs(env.provider.connection, tx, env.admin, []);

    const depositAfter = await kaminoMarket.getObligationDepositByWallet(
      env.admin.publicKey,
      NATIVE_MINT,
      new VanillaObligation(PROGRAM_ID)
    );

    assertAlmostEqual(
      depositAmount.toNumber(),
      new Decimal(depositAfter).sub(new Decimal(depositBefore)).toNumber(),
      1
    );
  });

  it('performs_a_deposit_to_specific_pool_usdh', async function () {
    const env = await initEnv('localnet');

    await sleep(2000);
    const symbol = 'USDH';

    const [createMarketSig, lendingMarket] = await createMarket(env);
    console.log(createMarketSig);
    await sleep(2000);

    const usdh = await createMint(env.provider, env.admin.publicKey, 6);
    await sleep(2000);
    const [, reserve] = await createReserve(env, lendingMarket.publicKey, usdh);
    await sleep(2000);

    const reserveConfig = makeReserveConfig(symbol);
    await updateReserve(env, reserve.publicKey, reserveConfig);
    await sleep(2000);

    const [, usdhAta] = await createAta(env, env.admin.publicKey, usdh);
    await sleep(2000);
    await mintTo(env.provider, usdh, usdhAta, 1000_000000);

    const kaminoMarket = (await KaminoMarket.load(env.provider.connection, lendingMarket.publicKey, PROGRAM_ID, true))!;

    const depositAmount = new BN('100');

    const depositBefore = await kaminoMarket.getObligationDepositByWallet(
      env.admin.publicKey,
      usdh,
      new VanillaObligation(PROGRAM_ID)
    );

    const kaminoAction = await KaminoAction.buildDepositTxns(
      kaminoMarket,
      depositAmount,
      usdh,
      env.admin.publicKey,
      new VanillaObligation(PROGRAM_ID)
    );

    const tx = await buildVersionedTransaction(env.provider.connection, env.admin.publicKey, [
      ...kaminoAction.setupIxs,
      ...kaminoAction.lendingIxs,
      ...kaminoAction.cleanupIxs,
    ]);
    const _txHash = await buildAndSendTxnWithLogs(env.provider.connection, tx, env.admin, []);

    const depositAfter = await kaminoMarket.getObligationDepositByWallet(
      env.admin.publicKey,
      usdh,
      new VanillaObligation(PROGRAM_ID)
    );

    assertAlmostEqual(
      depositAmount.toNumber(),
      new Decimal(depositAfter).sub(new Decimal(depositBefore)).toNumber(),
      1
    );
  });

  it('performs_a_deposit_and_borrow_same_tx', async function () {
    const borrowSymbol = 'USDH';
    const depositSymbol = 'SOL';
    const depositAmount = new BN('100000');
    const borrowAmount = new BN('10');

    const env = await initEnv('localnet');

    await sleep(2000);

    const [createMarketSig, lendingMarket] = await createMarket(env);
    console.log(createMarketSig);
    await sleep(2000);

    await updateMarketElevationGroup(env, lendingMarket.publicKey);
    await sleep(2000);

    const usdh = await createMint(env.provider, env.admin.publicKey, 6);
    await sleep(2000);
    const [, usdhReserve] = await createReserve(env, lendingMarket.publicKey, usdh);
    await sleep(2000);

    const [, solReserve] = await createReserve(env, lendingMarket.publicKey, NATIVE_MINT);
    await sleep(2000);

    await updateReserve(
      env,
      solReserve.publicKey,
      new ReserveConfig({
        ...makeReserveConfig(depositSymbol),
        elevationGroups: [1, 0, 0, 0, 0],
      })
    );
    await sleep(2000);
    await updateReserve(
      env,
      usdhReserve.publicKey,
      new ReserveConfig({
        ...makeReserveConfig(borrowSymbol),
        elevationGroups: [1, 0, 0, 0, 0],
      })
    );

    await sleep(2000);

    const kaminoMarket = (await KaminoMarket.load(env.provider.connection, lendingMarket.publicKey, PROGRAM_ID, true))!;

    const depositor = Keypair.generate();
    await env.provider.connection.requestAirdrop(depositor.publicKey, 10 * LAMPORTS_PER_SOL);
    await sleep(2000);

    const [, usdhAta] = await createAta(env, depositor.publicKey, usdh);
    await sleep(2000);
    await mintTo(env.provider, usdh, usdhAta, 1000_000000);
    await sleep(2000);

    const kaminoDepositAction = await KaminoAction.buildDepositTxns(
      kaminoMarket,
      borrowAmount.mul(new BN(10)),
      usdh,
      depositor.publicKey,
      new VanillaObligation(PROGRAM_ID)
    );

    const depositTx = await buildVersionedTransaction(env.provider.connection, depositor.publicKey, [
      ...kaminoDepositAction.setupIxs,
      ...kaminoDepositAction.lendingIxs,
      ...kaminoDepositAction.cleanupIxs,
    ]);
    const _depositTxHash = await buildAndSendTxnWithLogs(env.provider.connection, depositTx, depositor, []);

    const kaminoDepositAndBorrowAction = await KaminoAction.buildDepositAndBorrowTxns(
      kaminoMarket,
      depositAmount,
      NATIVE_MINT,
      borrowAmount,
      usdh,
      env.admin.publicKey,
      new VanillaObligation(PROGRAM_ID),
      1_400_000,
      true,
      true
    );
    console.log('kaminoDepositAndBorrowAction.setupIxs', kaminoDepositAndBorrowAction.setupIxsLabels);
    console.log('kaminoDepositAndBorrowAction.lendingIxs', kaminoDepositAndBorrowAction.lendingIxsLabels);
    console.log('kaminoDepositAndBorrowAction.inBetweenIxs', kaminoDepositAndBorrowAction.inBetweenIxsLabels);
    console.log('kaminoDepositAndBorrowAction.cleanupIxs', kaminoDepositAndBorrowAction.cleanupIxsLabels);

    const ixs: TransactionInstruction[] = [];
    ixs.push(
      ...kaminoDepositAndBorrowAction.setupIxs,
      ...[kaminoDepositAndBorrowAction.lendingIxs[0]],
      ...kaminoDepositAndBorrowAction.inBetweenIxs,
      ...[kaminoDepositAndBorrowAction.lendingIxs[1]],
      ...kaminoDepositAndBorrowAction.cleanupIxs
    );

    const lookupTable = await createLookupTable(
      env,
      ixs
        .map((ixn) => ixn.keys)
        .flat()
        .map((key) => key.pubkey)
    );
    await sleep(2000);

    const tx = await buildVersionedTransaction(env.provider.connection, depositor.publicKey, ixs, [...[], lookupTable]);
    tx.sign([depositor]);
    tx.sign([env.admin]);

    await sendAndConfirmVersionedTransaction(env.provider.connection, tx, 'confirmed');

    await sleep(2000);

    const obligation = await kaminoMarket.getObligationByWallet(env.admin.publicKey, new VanillaObligation(PROGRAM_ID));
    assert.equal(obligation?.state.elevationGroup, 1);
    assert.equal(obligation?.getNumberOfPositions(), 2);
    assert.deepEqual(obligation?.refreshedStats.potentialElevationGroupUpdate, [1]);

    const prevStats = obligation!.refreshedStats;

    const { stats: newStatsPostDeposit } = obligation!.getSimulatedObligationStats(
      new Decimal(500),
      'deposit',
      WRAPPED_SOL_MINT,
      kaminoMarket,
      kaminoMarket.reserves
    );

    assert.ok(newStatsPostDeposit.loanToValue < prevStats.loanToValue);

    const { stats: newStatsPostWithdraw } = obligation!.getSimulatedObligationStats(
      new Decimal(500),
      'withdraw',
      WRAPPED_SOL_MINT,
      kaminoMarket,
      kaminoMarket.reserves
    );

    assert.ok(newStatsPostWithdraw.loanToValue > prevStats.loanToValue);

    const { stats: newStatsPostBorrow } = obligation!.getSimulatedObligationStats(
      new Decimal(500),
      'borrow',
      usdh,
      kaminoMarket,
      kaminoMarket.reserves
    );

    assert.ok(newStatsPostBorrow.loanToValue > prevStats.loanToValue);

    const { stats: newStatsPostRepay } = obligation!.getSimulatedObligationStats(
      new Decimal(500),
      'repay',
      usdh,
      kaminoMarket,
      kaminoMarket.reserves
    );

    assert.ok(newStatsPostRepay.loanToValue < prevStats.loanToValue);
  });

  it('performs_a_repay_and_withdraw_same_tx', async function () {
    const borrowSymbol = 'USDH';
    const depositSymbol = 'SOL';
    const depositAmount = new BN('100000');
    const borrowAmount = new BN('10');

    const env = await initEnv('localnet');

    await sleep(2000);

    const [createMarketSig, lendingMarket] = await createMarket(env);
    console.log(createMarketSig);
    await sleep(2000);

    const usdh = await createMint(env.provider, env.admin.publicKey, 6);
    await sleep(2000);
    const [, usdhReserve] = await createReserve(env, lendingMarket.publicKey, usdh);
    await sleep(2000);

    const [, solReserve] = await createReserve(env, lendingMarket.publicKey, NATIVE_MINT);
    await sleep(2000);

    const depositReserveConfig = makeReserveConfig(depositSymbol);
    await updateReserve(env, solReserve.publicKey, depositReserveConfig);
    await sleep(2000);

    const borrowReserveConfig = makeReserveConfig(borrowSymbol);
    await updateReserve(env, usdhReserve.publicKey, borrowReserveConfig);
    await sleep(2000);

    const kaminoMarket = (await KaminoMarket.load(env.provider.connection, lendingMarket.publicKey, PROGRAM_ID, true))!;

    const depositor = Keypair.generate();
    await env.provider.connection.requestAirdrop(depositor.publicKey, 10 * LAMPORTS_PER_SOL);
    await sleep(2000);

    const [, usdhAta] = await createAta(env, depositor.publicKey, usdh);
    await sleep(2000);
    await mintTo(env.provider, usdh, usdhAta, 1000_000000);
    await sleep(2000);

    await createAta(env, env.admin.publicKey, usdh);
    await sleep(2000);

    const kaminoDepositAction = await KaminoAction.buildDepositTxns(
      kaminoMarket,
      borrowAmount.mul(new BN(10)),
      usdh,
      depositor.publicKey,
      new VanillaObligation(PROGRAM_ID),
      undefined,
      undefined,
      undefined,
      true,
      PublicKey.default
    );

    const depositTx = await buildVersionedTransaction(env.provider.connection, depositor.publicKey, [
      ...kaminoDepositAction.setupIxs,
      ...kaminoDepositAction.lendingIxs,
      ...kaminoDepositAction.cleanupIxs,
    ]);
    const depositTxHash = await buildAndSendTxnWithLogs(env.provider.connection, depositTx, depositor, []);
    console.log('Deposit ', depositTxHash.toString());

    const kaminoDepositAndBorrowAction = await KaminoAction.buildDepositAndBorrowTxns(
      kaminoMarket,
      depositAmount,
      NATIVE_MINT,
      borrowAmount,
      usdh,
      env.admin.publicKey,
      new VanillaObligation(PROGRAM_ID),
      1_400_000,
      undefined,
      undefined,
      true,
      PublicKey.default
    );
    console.log('kaminoBorrowAction.setupIxs', kaminoDepositAndBorrowAction.setupIxsLabels);
    console.log('kaminoBorrowAction.lendingIxs', kaminoDepositAndBorrowAction.lendingIxsLabels);
    console.log('kaminoBorrowAction.inBetweenIxs', kaminoDepositAndBorrowAction.inBetweenIxsLabels);
    console.log('kaminoBorrowAction.cleanupIxs', kaminoDepositAndBorrowAction.cleanupIxsLabels);

    const depositAndBorrowIxs: TransactionInstruction[] = [];
    depositAndBorrowIxs.push(
      ...kaminoDepositAndBorrowAction.setupIxs,
      ...[kaminoDepositAndBorrowAction.lendingIxs[0]],
      ...kaminoDepositAndBorrowAction.inBetweenIxs,
      ...[kaminoDepositAndBorrowAction.lendingIxs[1]],
      ...kaminoDepositAndBorrowAction.cleanupIxs
    );

    const lookupTable = await createLookupTable(
      env,
      depositAndBorrowIxs
        .map((ixn) => ixn.keys)
        .flat()
        .map((key) => key.pubkey)
    );
    await sleep(2000);

    const tx = await buildVersionedTransaction(env.provider.connection, depositor.publicKey, depositAndBorrowIxs, [
      ...[],
      lookupTable,
    ]);
    tx.sign([depositor]);
    tx.sign([env.admin]);

    await sendAndConfirmVersionedTransaction(env.provider.connection, tx, 'confirmed');
    await sleep(2000);

    const repayAmount = new BN('10');
    const withdrawAmount = new BN('100');

    const kaminoRepayAndWithdrawAction = await KaminoAction.buildRepayAndWithdrawTxns(
      kaminoMarket,
      repayAmount,
      usdh,
      withdrawAmount,
      NATIVE_MINT,
      env.admin.publicKey,
      new VanillaObligation(PROGRAM_ID),
      1_400_000,
      undefined,
      undefined,
      undefined,
      undefined,
      PublicKey.default
    );
    console.log('kaminoRepayAndWithdrawAction.setupIxs', kaminoRepayAndWithdrawAction.setupIxsLabels);
    console.log('kaminoRepayAndWithdrawAction.', kaminoRepayAndWithdrawAction.lendingIxsLabels);
    console.log('kaminoRepayAndWithdrawAction.inBetweenIxs', kaminoRepayAndWithdrawAction.inBetweenIxsLabels);
    console.log('kaminoRepayAndWithdrawAction.clos', kaminoRepayAndWithdrawAction.cleanupIxsLabels);
    const ixs: TransactionInstruction[] = [];
    ixs.push(
      ...kaminoRepayAndWithdrawAction.setupIxs,
      ...[kaminoRepayAndWithdrawAction.lendingIxs[0]],
      ...kaminoRepayAndWithdrawAction.inBetweenIxs,
      ...[kaminoRepayAndWithdrawAction.lendingIxs[1]],
      ...kaminoRepayAndWithdrawAction.cleanupIxs
    );

    const lookupTableRepay = await createLookupTable(
      env,
      ixs
        .map((ixn) => ixn.keys)
        .flat()
        .map((key) => key.pubkey)
    );
    await sleep(2000);

    const txRepay = await buildVersionedTransaction(env.provider.connection, depositor.publicKey, depositAndBorrowIxs, [
      ...[],
      lookupTableRepay,
    ]);
    txRepay.sign([depositor]);
    txRepay.sign([env.admin]);

    await sendAndConfirmVersionedTransaction(env.provider.connection, tx, 'confirmed');

    const txHash = await sendTransactionV0(env.provider.connection, env.admin, ixs, []);
    console.log('txHash', txHash);
  });

  it('performs_a_withdraw', async function () {
    const symbol = 'USDH';
    const depositAmount = new BN('100');

    const env = await initEnv('localnet');

    await sleep(2000);

    const [createMarketSig, lendingMarket] = await createMarket(env);
    console.log(createMarketSig);
    await sleep(2000);

    const usdh = await createMint(env.provider, env.admin.publicKey, 6);
    await sleep(2000);
    const [, usdhReserve] = await createReserve(env, lendingMarket.publicKey, usdh);
    await sleep(2000);

    const [, usdhAta] = await createAta(env, env.admin.publicKey, usdh);
    await sleep(2000);
    await mintTo(env.provider, usdh, usdhAta, 1000_000000);
    await sleep(2000);

    const reserveConfig = makeReserveConfig(symbol);
    await updateReserve(env, usdhReserve.publicKey, reserveConfig);
    await sleep(2000);

    const kaminoMarket = (await KaminoMarket.load(env.provider.connection, lendingMarket.publicKey, PROGRAM_ID, true))!;

    await sleep(2000);

    const kaminoDepositAction = await KaminoAction.buildDepositTxns(
      kaminoMarket,
      depositAmount,
      usdh,
      env.admin.publicKey,
      new VanillaObligation(PROGRAM_ID)
    );

    const depositTx = await buildVersionedTransaction(env.provider.connection, env.admin.publicKey, [
      ...kaminoDepositAction.setupIxs,
      ...kaminoDepositAction.lendingIxs,
      ...kaminoDepositAction.cleanupIxs,
    ]);
    const _depositTxHash = await buildAndSendTxnWithLogs(env.provider.connection, depositTx, env.admin, []);

    const depositBefore = await kaminoMarket.getObligationDepositByWallet(
      env.admin.publicKey,
      usdh,
      new VanillaObligation(PROGRAM_ID)
    );

    const kaminoWithdrawAction = await KaminoAction.buildWithdrawTxns(
      kaminoMarket,
      depositAmount,
      usdh,
      env.admin.publicKey,
      new VanillaObligation(PROGRAM_ID)
    );

    const tx = await buildVersionedTransaction(env.provider.connection, env.admin.publicKey, [
      ...kaminoWithdrawAction.setupIxs,
      ...kaminoWithdrawAction.lendingIxs,
      ...kaminoWithdrawAction.cleanupIxs,
    ]);
    const _txHash = await buildAndSendTxnWithLogs(env.provider.connection, tx, env.admin, []);

    const depositAfter = await kaminoMarket.getObligationDepositByWallet(
      env.admin.publicKey,
      usdh,
      new VanillaObligation(PROGRAM_ID)
    );

    assertAlmostEqual(
      new Decimal(depositBefore).sub(new Decimal(depositAfter)).toNumber(),
      depositAmount.toNumber(),
      20
    );
  });

  it('performs_a_borrow_and_repay_usdh', async function () {
    const borrowSymbol = 'USDH';
    const depositSymbol = 'SOL';
    const depositAmount = new BN('100000');
    const borrowAmount = new BN('10');

    const env = await initEnv('localnet');

    await sleep(2000);

    const [createMarketSig, lendingMarket] = await createMarket(env);
    console.log(createMarketSig);
    await sleep(2000);

    const usdh = await createMint(env.provider, env.admin.publicKey, 6);
    await sleep(2000);
    const [, usdhReserve] = await createReserve(env, lendingMarket.publicKey, usdh);
    await sleep(2000);

    const [, solReserve] = await createReserve(env, lendingMarket.publicKey, NATIVE_MINT);
    await sleep(2000);

    const depositReserveConfig = makeReserveConfig(depositSymbol);
    await updateReserve(env, solReserve.publicKey, depositReserveConfig);
    await sleep(2000);

    const borrowReserveConfig = makeReserveConfig(borrowSymbol);
    await updateReserve(env, usdhReserve.publicKey, borrowReserveConfig);
    await sleep(2000);

    const kaminoMarket = (await KaminoMarket.load(env.provider.connection, lendingMarket.publicKey, PROGRAM_ID, true))!;

    const depositor = Keypair.generate();
    await env.provider.connection.requestAirdrop(depositor.publicKey, 10 * LAMPORTS_PER_SOL);
    await sleep(2000);

    const [, usdhAta] = await createAta(env, depositor.publicKey, usdh);
    await sleep(2000);
    await mintTo(env.provider, usdh, usdhAta, 1000_000000);
    await sleep(2000);

    const depositActionDepositor = await KaminoAction.buildDepositTxns(
      kaminoMarket,
      borrowAmount.mul(new BN(10)),
      usdh,
      depositor.publicKey,
      new VanillaObligation(PROGRAM_ID)
    );

    {
      const tx = await buildVersionedTransaction(env.provider.connection, depositor.publicKey, [
        ...depositActionDepositor.setupIxs,
        ...depositActionDepositor.lendingIxs,
        ...depositActionDepositor.cleanupIxs,
      ]);
      const _txHash = await buildAndSendTxnWithLogs(env.provider.connection, tx, depositor, []);
    }

    const depositAction = await KaminoAction.buildDepositTxns(
      kaminoMarket,
      depositAmount,
      NATIVE_MINT,
      env.admin.publicKey,
      new VanillaObligation(PROGRAM_ID)
    );

    {
      const tx = await buildVersionedTransaction(env.provider.connection, env.admin.publicKey, [
        ...depositAction.setupIxs,
        ...depositAction.lendingIxs,
        ...depositAction.cleanupIxs,
      ]);
      const _txHash = await buildAndSendTxnWithLogs(env.provider.connection, tx, env.admin, []);
    }

    const borrowBefore = await kaminoMarket.getObligationBorrowByWallet(
      env.admin.publicKey,
      usdh,
      new VanillaObligation(PROGRAM_ID)
    );

    const borrowAction = await KaminoAction.buildBorrowTxns(
      kaminoMarket,
      borrowAmount,
      usdh,
      env.admin.publicKey,
      new VanillaObligation(PROGRAM_ID)
    );

    {
      const tx = await buildVersionedTransaction(env.provider.connection, env.admin.publicKey, [
        ...borrowAction.setupIxs,
        ...borrowAction.lendingIxs,
        ...borrowAction.cleanupIxs,
      ]);
      const _txHash = await buildAndSendTxnWithLogs(env.provider.connection, tx, env.admin, []);
    }

    const borrowAfter = await kaminoMarket.getObligationBorrowByWallet(
      env.admin.publicKey,
      usdh,
      new VanillaObligation(PROGRAM_ID)
    );
    assert.ok(new Decimal(borrowAfter).sub(new Decimal(borrowBefore)).greaterThan(0));

    const repayAction = await KaminoAction.buildRepayTxns(
      kaminoMarket,
      borrowAmount,
      usdh,
      env.admin.publicKey,
      new VanillaObligation(PROGRAM_ID)
    );

    {
      const tx = await buildVersionedTransaction(env.provider.connection, env.admin.publicKey, [
        ...repayAction.setupIxs,
        ...repayAction.lendingIxs,
        ...repayAction.cleanupIxs,
      ]);
      const _txHash = await buildAndSendTxnWithLogs(env.provider.connection, tx, env.admin, []);
    }

    const borrowFinal = await kaminoMarket.getObligationBorrowByWallet(
      env.admin.publicKey,
      usdh,
      new VanillaObligation(PROGRAM_ID)
    );
    console.log('borrowBefore', borrowBefore);
    console.log('borrowAfter', borrowAfter);
    console.log('borrowFinal', borrowFinal);
    assert.ok(new Decimal(borrowFinal).lessThan(new Decimal(borrowAfter)));
  });

  it('performs_a_borrow_and_repay_sol', async function () {
    const env = await initEnv('localnet');

    await sleep(2000);
    const depositSymbol = 'USDH';
    const borrowSymbol = 'SOL';
    const borrowAmount = new BN('100');

    const [createMarketSig, lendingMarket] = await createMarket(env);
    console.log(createMarketSig);
    await sleep(2000);

    const usdh = await createMint(env.provider, env.admin.publicKey, 6);
    await sleep(2000);
    const [, depositReserve] = await createReserve(env, lendingMarket.publicKey, usdh);
    const [, borrowReserve] = await createReserve(env, lendingMarket.publicKey, NATIVE_MINT);
    await sleep(2000);

    const depositReserveConfig = makeReserveConfig(depositSymbol);
    const borrowReserveConfig = makeReserveConfig(borrowSymbol);
    await updateReserve(env, depositReserve.publicKey, depositReserveConfig);
    await sleep(2000);
    await updateReserve(env, borrowReserve.publicKey, borrowReserveConfig);
    await sleep(2000);

    const [, usdhAta] = await createAta(env, env.admin.publicKey, usdh);
    await sleep(2000);
    await mintTo(env.provider, usdh, usdhAta, 1000_000000);

    const kaminoMarket = (await KaminoMarket.load(env.provider.connection, lendingMarket.publicKey, PROGRAM_ID, true))!;

    const depositAmount = new BN('100');

    const kaminoAction = await KaminoAction.buildDepositTxns(
      kaminoMarket,
      depositAmount,
      usdh,
      env.admin.publicKey,
      new VanillaObligation(PROGRAM_ID)
    );

    {
      const tx = await buildVersionedTransaction(env.provider.connection, env.admin.publicKey, [
        ...kaminoAction.setupIxs,
        ...kaminoAction.lendingIxs,
        ...kaminoAction.cleanupIxs,
      ]);
      const _txHash = await buildAndSendTxnWithLogs(env.provider.connection, tx, env.admin, []);
    }

    const depositor = Keypair.generate();
    await env.provider.connection.requestAirdrop(depositor.publicKey, 10 * LAMPORTS_PER_SOL);
    await sleep(2000);

    const kaminoDepositAction = await KaminoAction.buildDepositTxns(
      kaminoMarket,
      borrowAmount.mul(new BN(10)),
      NATIVE_MINT,
      depositor.publicKey,
      new VanillaObligation(PROGRAM_ID)
    );

    {
      const tx = await buildVersionedTransaction(env.provider.connection, depositor.publicKey, [
        ...kaminoDepositAction.setupIxs,
        ...kaminoDepositAction.lendingIxs,
        ...kaminoDepositAction.cleanupIxs,
      ]);
      const _txHash = await buildAndSendTxnWithLogs(env.provider.connection, tx, depositor, []);
    }

    const borrowBefore = await kaminoMarket.getObligationBorrowByWallet(
      env.admin.publicKey,
      NATIVE_MINT,
      new VanillaObligation(PROGRAM_ID)
    );

    const borrowAction = await KaminoAction.buildBorrowTxns(
      kaminoMarket,
      borrowAmount,
      NATIVE_MINT,
      env.admin.publicKey,
      new VanillaObligation(PROGRAM_ID)
    );

    {
      const tx = await buildVersionedTransaction(env.provider.connection, env.admin.publicKey, [
        ...borrowAction.setupIxs,
        ...borrowAction.lendingIxs,
        ...borrowAction.cleanupIxs,
      ]);
      const _txHash = await buildAndSendTxnWithLogs(env.provider.connection, tx, env.admin, []);
    }

    const borrowAfter = await kaminoMarket.getObligationBorrowByWallet(
      env.admin.publicKey,
      NATIVE_MINT,
      new VanillaObligation(PROGRAM_ID)
    );
    assert.ok(new Decimal(borrowAfter).sub(new Decimal(borrowBefore)).toNumber() > 0);

    const repayAction = await KaminoAction.buildRepayTxns(
      kaminoMarket,
      borrowAmount,
      NATIVE_MINT,
      env.admin.publicKey,
      new VanillaObligation(PROGRAM_ID)
    );

    {
      const tx = await buildVersionedTransaction(env.provider.connection, env.admin.publicKey, [
        ...repayAction.setupIxs,
        ...repayAction.lendingIxs,
        ...repayAction.cleanupIxs,
      ]);
      const _txHash = await buildAndSendTxnWithLogs(env.provider.connection, tx, env.admin, []);
    }

    const borrowFinal = await kaminoMarket.getObligationBorrowByWallet(
      env.admin.publicKey,
      NATIVE_MINT,
      new VanillaObligation(PROGRAM_ID)
    );
    console.log('borrowBefore', borrowBefore);
    console.log('borrowAfter', borrowAfter);
    console.log('borrowFinal', borrowFinal);
    assert.ok(new Decimal(borrowFinal).lessThan(new Decimal(borrowAfter)));
  });

  it.skip('fetches_all_obligations_from_the_lending_market', async function () {
    const connection = new Connection(endpointFromCluster('mainnet-beta'), {
      commitment: 'finalized',
    });
    const lendingMarketAddress = new PublicKey('6WVSwDQXrBZeQVnu6hpnsRZhodaJTZBUaC334SiiBKdb');

    const market = (await KaminoMarket.load(connection, lendingMarketAddress, STAGING_PROGRAM_ID))!;

    const obligations = await market.getAllObligationsForMarket();
    console.log('obligations', obligations);
  });

  it.skip('try_to_liquidate_an_obligation', async function () {
    const connection = new Connection(endpointFromCluster('mainnet-beta'), {
      commitment: 'finalized',
    });
    const lendingMarketAddress = new PublicKey('6WVSwDQXrBZeQVnu6hpnsRZhodaJTZBUaC334SiiBKdb');
    const market = (await KaminoMarket.load(connection, lendingMarketAddress, STAGING_PROGRAM_ID))!;

    const account = Keypair.fromSecretKey(Buffer.from(JSON.parse(require('fs').readFileSync('./tests/test.json'))));

    const repayAmount = new BN('1000');
    const repayTokenSymbol = 'USDC';
    const withdrawTokenSymbol = 'SOL';

    const usdhReserve = market.getReserveBySymbol(repayTokenSymbol);

    const solReserve = market.getReserveBySymbol(withdrawTokenSymbol);

    const obligationOwner = account.publicKey;
    const liquidateAction = await KaminoAction.buildLiquidateTxns(
      market,
      repayAmount,
      '0',
      usdhReserve!.getLiquidityMint(),
      solReserve!.getLiquidityMint(),
      account.publicKey,
      obligationOwner,
      new VanillaObligation(PROGRAM_ID)
    );
    console.log('liquidateAction.pre', liquidateAction.preTxnIxsLabels);
    console.log('liquidateAction.setup', liquidateAction.setupIxsLabels);

    const simulateTransaction = async (txn: Transaction, connection: Connection) => {
      const { blockhash } = await connection.getLatestBlockhash();
      txn.recentBlockhash = blockhash;
      txn.feePayer = account.publicKey;
      txn.sign(account);
      return connection.simulateTransaction(txn);
    };

    const txHash = await liquidateAction.simulateTransactions(simulateTransaction);
    console.log('txHash', txHash);
  });
});

it.skip('fetches_all_obligations_by_tag_from_given_market', async function () {
  const connection = new Connection(endpointFromCluster('mainnet-beta'), {
    commitment: 'finalized',
  });
  const lendingMarketAddress = new PublicKey('6WVSwDQXrBZeQVnu6hpnsRZhodaJTZBUaC334SiiBKdb');

  const market = (await KaminoMarket.load(connection, lendingMarketAddress, STAGING_PROGRAM_ID))!;

  const tag = VanillaObligation.tag;

  const obligations = await market.getAllObligationsByTag(tag, lendingMarketAddress);
  console.log('obligations', obligations);
  console.log('obligation');
});

it.skip('fetches_all_obligations_for_user', async function () {
  const connection = new Connection(endpointFromCluster('mainnet-beta'), {
    commitment: 'finalized',
  });
  const lendingMarketAddress = new PublicKey('6WVSwDQXrBZeQVnu6hpnsRZhodaJTZBUaC334SiiBKdb');

  const account = Keypair.fromSecretKey(Buffer.from(JSON.parse(require('fs').readFileSync('./tests/test.json'))));

  const market = (await KaminoMarket.load(connection, lendingMarketAddress, STAGING_PROGRAM_ID))!;

  const obligations = await market.getAllUserObligations(account.publicKey);
  console.log('obligations', obligations);
});

it.skip('fetches_all_obligations_for_user_by_tag', async function () {
  const connection = new Connection(endpointFromCluster('mainnet-beta'), {
    commitment: 'finalized',
  });
  const lendingMarketAddress = new PublicKey('6WVSwDQXrBZeQVnu6hpnsRZhodaJTZBUaC334SiiBKdb');

  const account = Keypair.fromSecretKey(Buffer.from(JSON.parse(require('fs').readFileSync('./tests/test.json'))));

  const market = (await KaminoMarket.load(connection, lendingMarketAddress, STAGING_PROGRAM_ID))!;

  const obligations = await market.getUserObligationsByTag(0, account.publicKey);
  console.log('obligations', obligations);
});

it.skip('fetches_all_market_reserves_prices', async function () {
  const connection = new Connection(endpointFromCluster('mainnet-beta'), {
    commitment: 'finalized',
  });
  const lendingMarketAddress = new PublicKey('7u3HeHxYDLhnCoErrtycNokbQYbWGzLs6JSDqGAv5PfF');
  const market = (await KaminoMarket.load(connection, lendingMarketAddress, PROGRAM_ID))!;
  const prices = await market.getAllScopePrices();
  console.log('prices', prices);
});

it.skip('get_obligation_by_address', async function () {
  const connection = new Connection(endpointFromCluster('mainnet-beta'), {
    commitment: 'finalized',
  });
  const lendingMarketAddress = new PublicKey('ARVAgHAZiNGCbZ8Cb4BitwZoNQ8eBWsk7ZeinPgmNjgi');

  const account = Keypair.fromSecretKey(Buffer.from(JSON.parse(require('fs').readFileSync('./tests/test.json'))));

  const market = (await KaminoMarket.load(connection, lendingMarketAddress, PROGRAM_ID))!;

  const allObligations = await market.getAllUserObligations(account.publicKey);
  const obligation = await market.getObligationByAddress(allObligations[0].obligationAddress);
  console.log('obligation', JSON.stringify(obligation));
  assert.equal(JSON.stringify(obligation), JSON.stringify(allObligations[0]));
  assert.equal(obligation?.getNumberOfPositions(), 4);
});

it.skip('get_multiple_obligation_by_address', async function () {
  const connection = new Connection(endpointFromCluster('mainnet-beta'), {
    commitment: 'finalized',
  });
  const lendingMarketAddress = new PublicKey('6WVSwDQXrBZeQVnu6hpnsRZhodaJTZBUaC334SiiBKdb');

  const account = Keypair.fromSecretKey(Buffer.from(JSON.parse(require('fs').readFileSync('./tests/test.json'))));

  const market = (await KaminoMarket.load(connection, lendingMarketAddress, STAGING_PROGRAM_ID))!;

  const allObligations = await market.getAllUserObligations(account.publicKey);
  const obligations = await market.getMultipleObligationsByAddress(
    allObligations.map((obligation) => obligation.obligationAddress)
  );

  let areAllTheSame = true;
  obligations.forEach((obligation, index) => {
    const initObligation = allObligations[index];
    if (JSON.stringify(obligation) !== JSON.stringify(initObligation)) {
      areAllTheSame = false;
    }
  });
  assert.ok(areAllTheSame);
});

export async function mintTo(
  provider: anchor.AnchorProvider,
  mintPubkey: PublicKey,
  tokenAccount: PublicKey,
  amount: number
) {
  const tx = new Transaction().add(
    Token.createMintToInstruction(
      TOKEN_PROGRAM_ID, // always TOKEN_PROGRAM_ID
      mintPubkey, // mint
      tokenAccount, // receiver (sholud be a token account)
      provider.wallet.publicKey, // mint authority
      [], // only multisig account will use. leave it empty now.
      amount // amount. if your decimals is 8, you mint 10^8 for 1 token.
    )
  );

  await provider.sendAndConfirm(tx);
}

export async function createMint(
  provider: anchor.AnchorProvider,
  authority: PublicKey,
  decimals: number = 6
): Promise<PublicKey> {
  const mint = anchor.web3.Keypair.generate();
  return await createMintFromKeypair(provider, authority, mint, decimals);
}

export async function createMintFromKeypair(
  provider: anchor.AnchorProvider,
  authority: PublicKey,
  mint: Keypair,
  decimals: number = 6
): Promise<PublicKey> {
  const instructions = await createMintInstructions(provider, authority, mint.publicKey, decimals);

  const tx = new anchor.web3.Transaction();
  tx.add(...instructions);

  await provider.sendAndConfirm(tx, [mint]);
  return mint.publicKey;
}

async function createMintInstructions(
  provider: anchor.AnchorProvider,
  authority: PublicKey,
  mint: PublicKey,
  decimals: number
): Promise<TransactionInstruction[]> {
  return [
    anchor.web3.SystemProgram.createAccount({
      fromPubkey: provider.wallet.publicKey,
      newAccountPubkey: mint,
      space: 82,
      lamports: await provider.connection.getMinimumBalanceForRentExemption(82),
      programId: TOKEN_PROGRAM_ID,
    }),
    Token.createInitMintInstruction(TOKEN_PROGRAM_ID, mint, decimals, authority, null),
  ];
}
