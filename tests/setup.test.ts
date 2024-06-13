import { initEnv, makeReserveConfig, newUser, sendTransactionsFromAction } from './setup_utils';
import { createMarket, createReserve, updateReserve } from './setup_operations';
import { DEFAULT_RECENT_SLOT_DURATION_MS, KaminoAction, KaminoMarket, PROGRAM_ID, sleep } from '../src';
import { lendingMarketAuthPda, VanillaObligation } from '../src/utils';
import { createAta, createMint, mintTo } from './token_utils';
import { expect } from 'chai';
import { PublicKey } from '@solana/web3.js';
import Decimal from 'decimal.js';

describe('setup_lending_market', function () {
  it('init_env', async function () {
    const _env = await initEnv('localnet');
  });

  it('create_market', async function () {
    const env = await initEnv('localnet');

    const [sig, lendingMarket] = await createMarket(env);
    await sleep(2000);
    console.log(sig);

    const market = await KaminoMarket.load(
      env.provider.connection,
      lendingMarket.publicKey,
      DEFAULT_RECENT_SLOT_DURATION_MS,
      PROGRAM_ID,
      true
    );
    expect(market).not.eq(null);
    expect(market!.getAddress().toBase58()).eq(lendingMarket.publicKey.toBase58());
    expect(market!.getLendingMarketAuthority().toBase58()).eq(
      lendingMarketAuthPda(lendingMarket.publicKey)[0].toBase58()
    );
  });

  it('create_reserve', async function () {
    const env = await initEnv('localnet');

    const [createMarketSig, lendingMarket] = await createMarket(env);
    console.log(createMarketSig);
    await sleep(2000);

    const usdh = await createMint(env, env.admin.publicKey, 6);
    await sleep(2000);
    const [createReserveSig, _reserve] = await createReserve(env, lendingMarket.publicKey, usdh);
    console.log(createReserveSig);
  });

  it('update_reserve', async function () {
    const env = await initEnv('localnet');

    const [createMarketSig, lendingMarket] = await createMarket(env);
    console.log(createMarketSig);
    await sleep(2000);

    const usdh = await createMint(env, env.admin.publicKey, 6);
    await sleep(2000);
    const [createReserveSig, _reserve] = await createReserve(env, lendingMarket.publicKey, usdh);
    console.log(createReserveSig);

    const config = makeReserveConfig('USDH');
    const updateReserveSig = await updateReserve(env, _reserve.publicKey, config);

    console.log(updateReserveSig);
  });

  it('deposit', async function () {
    const env = await initEnv('localnet');

    const usdh = await createMint(env, env.admin.publicKey, 6);
    await sleep(2000);
    const [signatureAta, usdhAta] = await createAta(env, env.admin.publicKey, usdh);
    console.log(signatureAta);
    await sleep(2000);

    const token = 'USDH';
    await mintTo(env, usdh, usdhAta, 1000000000);

    const [createMarketSig, lendingMarket] = await createMarket(env);
    console.log(createMarketSig);
    await sleep(2000);

    const [createReserveSig, usdhReserve] = await createReserve(env, lendingMarket.publicKey, usdh);
    console.log(createReserveSig);
    await sleep(2000);

    const config = makeReserveConfig(token);
    const updateReserveSig = await updateReserve(env, usdhReserve.publicKey, config);
    console.log(updateReserveSig);
    await sleep(2000);

    const kaminoMarket = await KaminoMarket.load(
      env.provider.connection,
      lendingMarket.publicKey,
      DEFAULT_RECENT_SLOT_DURATION_MS,
      PROGRAM_ID,
      true
    );

    const depositAction = await KaminoAction.buildDepositTxns(
      kaminoMarket!,
      '100',
      usdh,
      env.admin.publicKey,
      new VanillaObligation(PROGRAM_ID),
      1_000_000,
      true
    );

    console.log('User obligation', depositAction.getObligationPda().toString());

    await sendTransactionsFromAction(env, depositAction);
  });

  it('withdraw', async function () {
    const env = await initEnv('localnet');

    const usdh = await createMint(env, env.admin.publicKey, 6);
    await sleep(2000);
    const [_signatureAta, usdhAta] = await createAta(env, env.admin.publicKey, usdh);
    await sleep(2000);

    const token = 'USDH';
    await mintTo(env, usdh, usdhAta, 1000000000);

    const [_createMarketSig, lendingMarket] = await createMarket(env);
    await sleep(2000);
    const [_createReserveSig, usdhReserve] = await createReserve(env, lendingMarket.publicKey, usdh);
    await sleep(2000);

    const config = makeReserveConfig(token);
    const _updateReserveSig = await updateReserve(env, usdhReserve.publicKey, config);
    await sleep(2000);

    const kaminoMarket = await KaminoMarket.load(
      env.provider.connection,
      lendingMarket.publicKey,
      DEFAULT_RECENT_SLOT_DURATION_MS,
      PROGRAM_ID,
      true
    );

    const depositAction = await KaminoAction.buildDepositTxns(
      kaminoMarket!,
      '100',
      usdh,
      env.admin.publicKey,
      new VanillaObligation(PROGRAM_ID),
      1_000_000,
      true
    );

    await sendTransactionsFromAction(env, depositAction);
    await sleep(2000);

    const withdrawAction = await KaminoAction.buildWithdrawTxns(
      kaminoMarket!,
      '50',
      usdh,
      env.admin.publicKey,
      new VanillaObligation(PROGRAM_ID),
      1_000_000,
      true
    );

    await sendTransactionsFromAction(env, withdrawAction);
  });

  it('borrow', async function () {
    const env = await initEnv('localnet');

    const usdh = await createMint(env, env.admin.publicKey, 6);
    await sleep(2000);
    const [_signatureAta, usdhAta] = await createAta(env, env.admin.publicKey, usdh);
    await sleep(2000);

    const token = 'USDH';
    await mintTo(env, usdh, usdhAta, 1000000000);

    const [_createMarketSig, lendingMarket] = await createMarket(env);
    await sleep(2000);
    const [_createReserveSig, usdhReserve] = await createReserve(env, lendingMarket.publicKey, usdh);
    await sleep(2000);

    const config = makeReserveConfig(token);
    const _updateReserveSig = await updateReserve(env, usdhReserve.publicKey, config);
    await sleep(2000);

    const kaminoMarket = await KaminoMarket.load(
      env.provider.connection,
      lendingMarket.publicKey,
      DEFAULT_RECENT_SLOT_DURATION_MS,
      PROGRAM_ID,
      true
    );

    const depositAction = await KaminoAction.buildDepositTxns(
      kaminoMarket!,
      '100',
      usdh,
      env.admin.publicKey,
      new VanillaObligation(PROGRAM_ID),
      1_000_000,
      true
    );

    await sendTransactionsFromAction(env, depositAction);
    await sleep(2000);

    const borrowAction = await KaminoAction.buildBorrowTxns(
      kaminoMarket!,
      '50',
      usdh,
      env.admin.publicKey,
      new VanillaObligation(PROGRAM_ID),
      1_000_000,
      true
    );

    await sendTransactionsFromAction(env, borrowAction);
  });

  it('repay', async function () {
    const env = await initEnv('localnet');

    const usdh = await createMint(env, env.admin.publicKey, 6);
    await sleep(2000);
    const [_signatureAta, usdhAta] = await createAta(env, env.admin.publicKey, usdh);
    await sleep(2000);

    const token = 'USDH';
    await mintTo(env, usdh, usdhAta, 1000000000);

    const [_createMarketSig, lendingMarket] = await createMarket(env);
    await sleep(2000);
    const [_createReserveSig, usdhReserve] = await createReserve(env, lendingMarket.publicKey, usdh);
    await sleep(2000);

    const config = makeReserveConfig(token);
    await updateReserve(env, usdhReserve.publicKey, config);
    await sleep(2000);

    const kaminoMarket = await KaminoMarket.load(
      env.provider.connection,
      lendingMarket.publicKey,
      DEFAULT_RECENT_SLOT_DURATION_MS,
      PROGRAM_ID,
      true
    );

    const depositAction = await KaminoAction.buildDepositTxns(
      kaminoMarket!,
      '100',
      usdh,
      env.admin.publicKey,
      new VanillaObligation(PROGRAM_ID),
      1_000_000,
      true
    );

    await sendTransactionsFromAction(env, depositAction);
    await sleep(2000);

    const borrowAction = await KaminoAction.buildBorrowTxns(
      kaminoMarket!,
      '70',
      usdh,
      env.admin.publicKey,
      new VanillaObligation(PROGRAM_ID),
      1_000_000,
      true,
      undefined,
      true,
      PublicKey.default
    );

    await sendTransactionsFromAction(env, borrowAction);
    await sleep(2000);

    const repayAction = await KaminoAction.buildRepayTxns(
      kaminoMarket!,
      '50',
      usdh,
      env.admin.publicKey,
      new VanillaObligation(PROGRAM_ID),
      await env.provider.connection.getSlot(),
      undefined,
      1_000_000,
      true,
      undefined,
      undefined,
      PublicKey.default
    );

    await sendTransactionsFromAction(env, repayAction);
  });

  it('permissionless_repay', async function () {
    const env = await initEnv('localnet');

    const usdh = await createMint(env, env.admin.publicKey, 6);
    await sleep(2000);
    const [_signatureAta, usdhAta] = await createAta(env, env.admin.publicKey, usdh);
    await sleep(2000);

    const token = 'USDH';
    await mintTo(env, usdh, usdhAta, 1000000000);

    const [_createMarketSig, lendingMarket] = await createMarket(env);
    await sleep(2000);
    const [_createReserveSig, usdhReserve] = await createReserve(env, lendingMarket.publicKey, usdh);
    await sleep(2000);

    const config = makeReserveConfig(token);
    await updateReserve(env, usdhReserve.publicKey, config);
    await sleep(2000);

    const kaminoMarket = await KaminoMarket.load(
      env.provider.connection,
      lendingMarket.publicKey,
      DEFAULT_RECENT_SLOT_DURATION_MS,
      PROGRAM_ID,
      true
    );

    const depositAction = await KaminoAction.buildDepositTxns(
      kaminoMarket!,
      '100',
      usdh,
      env.admin.publicKey,
      new VanillaObligation(PROGRAM_ID),
      1_000_000,
      true
    );

    await sendTransactionsFromAction(env, depositAction);
    await sleep(2000);

    const borrowAction = await KaminoAction.buildBorrowTxns(
      kaminoMarket!,
      '70',
      usdh,
      env.admin.publicKey,
      new VanillaObligation(PROGRAM_ID),
      1_000_000,
      true,
      undefined,
      true,
      PublicKey.default
    );

    await sendTransactionsFromAction(env, borrowAction);
    await sleep(2000);

    const repayer = await newUser(env, kaminoMarket!, [['USDH', new Decimal('500000')]]);

    const repayAction = await KaminoAction.buildRepayTxns(
      kaminoMarket!,
      '50',
      usdh,
      env.admin.publicKey,
      new VanillaObligation(PROGRAM_ID),
      await env.provider.connection.getSlot(),
      repayer.publicKey,
      1_000_000,
      true,
      undefined,
      undefined,
      PublicKey.default
    );

    await sendTransactionsFromAction(env, repayAction, [repayer]);
  });
});
