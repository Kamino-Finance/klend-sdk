import {
  createLookupTable,
  createMarketWithTwoReserves,
  createMarketWithTwoReservesToppedUp,
  initEnv,
  makeReserveConfig,
  makeReserveConfigWithBorrowFee,
  makeReserveConfigWithBorrowFeeAndTakeRate,
  newUser,
  sendTransactionsFromAction,
} from './setup_utils';
import { createMarket, createReserve, updateMarketReferralFeeBps, updateReserve } from './setup_operations';
import {
  KaminoAction,
  KaminoMarket,
  PROGRAM_ID,
  fuzzyEq,
  getInitAllReferrerTokenStateIxns,
  sleep,
  KaminoObligation,
  DEFAULT_RECENT_SLOT_DURATION_MS,
} from '../src';
import {
  MultiplyObligation,
  VanillaObligation,
  buildAndSendTxnWithLogs,
  buildVersionedTransaction,
  getAssociatedTokenAddress,
  getTokenAccountBalance,
  getUserLutAddressAndSetupIxns,
  sendAndConfirmVersionedTransaction,
} from '../src/utils';
import { createAta, createMint, mintTo } from './token_utils';
import { assert } from 'chai';
import { Keypair, LAMPORTS_PER_SOL, PublicKey } from '@solana/web3.js';
import { LendingMarket } from '../src/idl_codegen/accounts/LendingMarket';
import { NATIVE_MINT } from '@solana/spl-token';
import Decimal from 'decimal.js';
import { depositLeverageTestAdapter, getPriceMock } from './leverage_utils';
import {
  getReferrerForShortUrl,
  getReferrerShortUrl,
  getTotalUsersReferred,
  createReferrerStateAndShortUrl,
  isShortUrlAvailable,
  updateReferrerStateAndShortUrl,
} from '../src/referrals/operations';

describe('Referrals Tests', function () {
  it('borrow_and_withdraw_referrer_fees_usdh', async function () {
    const borrowAmount = 5000000000;
    const protocolTakeRate = 0.0000001;
    const referralFee = 0.2;
    const env = await initEnv('localnet');

    const usdh = await createMint(env, env.admin.publicKey, 6);
    await sleep(2000);
    const [_signatureAta, usdhAta] = await createAta(env, env.admin.publicKey, usdh);
    await sleep(2000);

    const referrer = Keypair.generate();
    await env.provider.connection.requestAirdrop(referrer.publicKey, 2 * LAMPORTS_PER_SOL);

    const token = 'USDH';
    await mintTo(env, usdh, usdhAta, 100000000000);

    const [_createMarketSig, lendingMarket] = await createMarket(env);
    await sleep(2000);
    await updateMarketReferralFeeBps(env, lendingMarket.publicKey, 2000);
    const lendingMarketState = await LendingMarket.fetch(env.provider.connection, lendingMarket.publicKey);
    console.log('updateMarketReferralFeeBps ' + lendingMarketState?.referralFeeBps);
    const [_createReserveSig, usdhReserve] = await createReserve(env, lendingMarket.publicKey, usdh);
    await sleep(2000);

    const config = makeReserveConfigWithBorrowFee(token);
    await updateReserve(env, usdhReserve.publicKey, config);
    await sleep(2000);

    const kaminoMarket = await KaminoMarket.load(
      env.provider.connection,
      lendingMarket.publicKey,
      DEFAULT_RECENT_SLOT_DURATION_MS,
      PROGRAM_ID,
      true
    );

    await executeInitUserMetadataTx(kaminoMarket!, referrer);
    await sleep(2000);

    const depositAction = await KaminoAction.buildDepositTxns(
      kaminoMarket!,
      '10000000000',
      usdh,
      env.admin.publicKey,
      new VanillaObligation(PROGRAM_ID),
      1_000_000,
      true,
      false,
      true,
      referrer.publicKey
    );

    await sendTransactionsFromAction(env, depositAction, env.admin);
    await sleep(2000);

    const borrowAction = await KaminoAction.buildBorrowTxns(
      kaminoMarket!,
      borrowAmount.toString(),
      usdh,
      env.admin.publicKey,
      new VanillaObligation(PROGRAM_ID),
      1_000_000,
      true,
      false,
      true,
      referrer.publicKey
    );

    await sendTransactionsFromAction(env, borrowAction, env.admin);

    const [, userMetadata] = await kaminoMarket!.getUserMetadata(env.admin.publicKey)!;
    console.log('ref link', userMetadata!.referrer.toString());

    await sleep(5000);

    const referrerFeesCumulative = await kaminoMarket?.getReferrerFeesCumulativeForReserve(
      referrer.publicKey,
      kaminoMarket!.getReserveByMint(usdh)!
    )!;
    const referrerFeesUnclaimed = await kaminoMarket?.getReferrerFeesUnclaimedForReserve(
      referrer.publicKey,
      kaminoMarket!.getReserveByMint(usdh)!
    )!;

    fuzzyEq(referrerFeesCumulative, new Decimal(borrowAmount * protocolTakeRate * referralFee));
    fuzzyEq(referrerFeesUnclaimed, new Decimal(borrowAmount * protocolTakeRate * referralFee));

    const withdrawReferrerFeesAction = await KaminoAction.buildWithdrawReferrerFeeTxns(
      referrer.publicKey,
      usdh,
      kaminoMarket!
    );

    await sendTransactionsFromAction(env, withdrawReferrerFeesAction, referrer, [referrer]);

    await sleep(2000);

    const referrerFeesCumulativePostWithdraw = await kaminoMarket?.getReferrerFeesCumulativeForReserve(
      referrer.publicKey,
      kaminoMarket!.getReserveByMint(usdh)!
    )!;
    const referrerFeesUnclaimedPostWithdraw = await kaminoMarket?.getReferrerFeesUnclaimedForReserve(
      referrer.publicKey,
      kaminoMarket!.getReserveByMint(usdh)!
    )!;

    fuzzyEq(referrerFeesCumulativePostWithdraw, referrerFeesCumulative);
    assert(referrerFeesUnclaimedPostWithdraw?.eq(0));
  });

  it('borrow_and_compound_withdraw_referrer_fees_usdh', async function () {
    const borrowAmount = 5000000000;
    const protocolTakeRate = 0.0000001;
    const referralFee = 0.2;
    const env = await initEnv('localnet');

    const usdh = await createMint(env, env.admin.publicKey, 6);
    await sleep(2000);
    const [_signatureAta, usdhAta] = await createAta(env, env.admin.publicKey, usdh);
    await sleep(2000);

    const referrer = Keypair.generate();
    await env.provider.connection.requestAirdrop(referrer.publicKey, 2 * LAMPORTS_PER_SOL);

    const token = 'USDH';
    await mintTo(env, usdh, usdhAta, 100000000000);

    const [_createMarketSig, lendingMarket] = await createMarket(env);
    await sleep(2000);
    await updateMarketReferralFeeBps(env, lendingMarket.publicKey, 2000);
    const lendingMarketState = await LendingMarket.fetch(env.provider.connection, lendingMarket.publicKey);
    console.log('updateMarketReferralFeeBps ' + lendingMarketState?.referralFeeBps);
    const [_createReserveSig, usdhReserve] = await createReserve(env, lendingMarket.publicKey, usdh);
    await sleep(2000);

    const config = makeReserveConfigWithBorrowFeeAndTakeRate(token);
    await updateReserve(env, usdhReserve.publicKey, config);
    await sleep(2000);

    const kaminoMarket = (await KaminoMarket.load(
      env.provider.connection,
      lendingMarket.publicKey,
      DEFAULT_RECENT_SLOT_DURATION_MS,
      PROGRAM_ID,
      true
    ))!;

    await executeInitUserMetadataTx(kaminoMarket!, referrer);
    await sleep(2000);

    const depositAction = await KaminoAction.buildDepositTxns(
      kaminoMarket!,
      '10000000000',
      usdh,
      env.admin.publicKey,
      new VanillaObligation(PROGRAM_ID),
      1_000_000,
      true,
      false,
      true,
      referrer.publicKey
    );

    await sendTransactionsFromAction(env, depositAction, env.admin);
    await sleep(2000);

    const borrowAction = await KaminoAction.buildBorrowTxns(
      kaminoMarket!,
      borrowAmount.toString(),
      usdh,
      env.admin.publicKey,
      new VanillaObligation(PROGRAM_ID),
      1_000_000,
      true,
      false,
      true,
      referrer.publicKey
    );

    await sendTransactionsFromAction(env, borrowAction, env.admin);

    const [, userMetadata] = await kaminoMarket!.getUserMetadata(env.admin.publicKey)!;
    console.log('ref link', userMetadata!.referrer.toString());
    await sleep(2000);
    const obligation = (await kaminoMarket!.getObligationByWallet(
      env.admin.publicKey,
      new VanillaObligation(PROGRAM_ID)
    ))!;
    const obligationLiquidity = obligation.state.borrows[0];
    const borrowAmountPre = KaminoObligation.getBorrowAmount(obligationLiquidity);

    // await 5 seconds twice and refresh after each 5 seconds

    await sleep(5000);

    const refreshOligationAction = await KaminoAction.buildRefreshObligationTxns(
      kaminoMarket!,
      env.admin.publicKey,
      obligation!
    );

    await sendTransactionsFromAction(env, refreshOligationAction, env.admin, [env.admin]);

    await sleep(5000);

    await sendTransactionsFromAction(env, refreshOligationAction, env.admin, [env.admin]);

    await sleep(2000);

    const obligationPostRefresh = (await kaminoMarket!.getObligationByWallet(
      env.admin.publicKey,
      new VanillaObligation(PROGRAM_ID)
    ))!;
    const obligationLiquidityPost = obligationPostRefresh.state.borrows[0];
    const borrowAmountPost = KaminoObligation.getBorrowAmount(obligationLiquidityPost);

    const interestReferralFees = Math.trunc(borrowAmountPost!.sub(borrowAmountPre).toNumber() * 0.1 * 0.2);

    const referrerFeesCumulative = await kaminoMarket.getReferrerFeesCumulativeForReserve(
      referrer.publicKey,
      kaminoMarket!.getReserveByMint(usdh)!
    );
    const referrerFeesUnclaimed = await kaminoMarket.getReferrerFeesUnclaimedForReserve(
      referrer.publicKey,
      kaminoMarket!.getReserveByMint(usdh)!
    );

    const borrowReferrerFee = borrowAmount * protocolTakeRate * referralFee;

    console.log('actual: ' + referrerFeesCumulative + ' expected: ' + (borrowReferrerFee + interestReferralFees));
    fuzzyEq(referrerFeesCumulative, new Decimal(borrowReferrerFee + interestReferralFees));
    fuzzyEq(referrerFeesUnclaimed, new Decimal(borrowReferrerFee + interestReferralFees));

    const withdrawReferrerFeesAction = await KaminoAction.buildWithdrawReferrerFeeTxns(
      referrer.publicKey,
      usdh,
      kaminoMarket!
    );

    await sendTransactionsFromAction(env, withdrawReferrerFeesAction, referrer, [referrer]);
  });

  it('borrow_and_withdraw_referrer_fees_sol', async function () {
    const borrowAmount = 500000000;
    const protocolTakeRate = 0.0000001;
    const referralFee = 0.2;
    const env = await initEnv('localnet');

    const depositSymbol = 'USDH';
    const borrowSymbol = 'SOL';

    const [createMarketSig, lendingMarket] = await createMarket(env);
    console.log(createMarketSig);
    await sleep(2000);

    const usdh = await createMint(env, env.admin.publicKey, 6);
    await sleep(2000);

    const [, depositReserve] = await createReserve(env, lendingMarket.publicKey, usdh);
    const [, borrowReserve] = await createReserve(env, lendingMarket.publicKey, NATIVE_MINT);
    const [, usdhAta] = await createAta(env, env.admin.publicKey, usdh);
    await sleep(2000);

    await mintTo(env, usdh, usdhAta, 100000000000);
    await sleep(2000);

    const referrer = Keypair.generate();
    await env.provider.connection.requestAirdrop(referrer.publicKey, 2 * LAMPORTS_PER_SOL);

    await updateMarketReferralFeeBps(env, lendingMarket.publicKey, 2000);
    const lendingMarketState = await LendingMarket.fetch(env.provider.connection, lendingMarket.publicKey);
    console.log('updateMarketReferralFeeBps ' + lendingMarketState?.referralFeeBps);
    await sleep(2000);

    const depositReserveConfig = makeReserveConfig(depositSymbol);
    const borrowReserveConfig = makeReserveConfigWithBorrowFee(borrowSymbol);
    await updateReserve(env, depositReserve.publicKey, depositReserveConfig);
    await sleep(2000);
    await updateReserve(env, borrowReserve.publicKey, borrowReserveConfig);
    await sleep(2000);

    const kaminoMarket = (await KaminoMarket.load(
      env.provider.connection,
      lendingMarket.publicKey,
      DEFAULT_RECENT_SLOT_DURATION_MS,
      PROGRAM_ID,
      true
    ))!;

    await executeInitUserMetadataTx(kaminoMarket!, referrer);
    await sleep(2000);

    const depositAction = await KaminoAction.buildDepositTxns(
      kaminoMarket!,
      '10000000000',
      usdh,
      env.admin.publicKey,
      new VanillaObligation(PROGRAM_ID),
      1_000_000,
      true,
      false,
      true,
      referrer.publicKey
    );

    await sendTransactionsFromAction(env, depositAction, env.admin);
    await sleep(2000);

    const depositor = Keypair.generate();
    await env.provider.connection.requestAirdrop(depositor.publicKey, 10000000000);
    await sleep(2000);

    const kaminoDepositAction = await KaminoAction.buildDepositTxns(
      kaminoMarket!,
      '5000000000',
      NATIVE_MINT,
      depositor.publicKey,
      new VanillaObligation(PROGRAM_ID)
    );

    await sendTransactionsFromAction(env, kaminoDepositAction, depositor, [depositor]);

    await sleep(2000);

    const borrowAction = await KaminoAction.buildBorrowTxns(
      kaminoMarket!,
      borrowAmount.toString(),
      NATIVE_MINT,
      env.admin.publicKey,
      new VanillaObligation(PROGRAM_ID),
      1_000_000,
      true,
      false,
      true,
      referrer.publicKey
    );

    await sendTransactionsFromAction(env, borrowAction, env.admin);

    const [, userMetadata] = await kaminoMarket!.getUserMetadata(env.admin.publicKey)!;
    console.log('ref link', userMetadata!.referrer.toString());

    await sleep(5000);

    const referrerFeesCumulative = await kaminoMarket?.getReferrerFeesCumulativeForReserve(
      referrer.publicKey,
      kaminoMarket!.getReserveByMint(NATIVE_MINT)!
    );
    const referrerFeesUnclaimed = await kaminoMarket?.getReferrerFeesUnclaimedForReserve(
      referrer.publicKey,
      kaminoMarket!.getReserveByMint(NATIVE_MINT)!
    );

    console.log('fees', referrerFeesCumulative);
    fuzzyEq(referrerFeesCumulative, new Decimal(borrowAmount * protocolTakeRate * referralFee));
    fuzzyEq(referrerFeesUnclaimed, new Decimal(borrowAmount * protocolTakeRate * referralFee));

    const withdrawReferrerFeesAction = await KaminoAction.buildWithdrawReferrerFeeTxns(
      referrer.publicKey,
      NATIVE_MINT,
      kaminoMarket!
    );

    await sendTransactionsFromAction(env, withdrawReferrerFeesAction, referrer, [referrer]);

    await sleep(2000);

    const referrerFeesCumulativePostWithdraw = await kaminoMarket?.getReferrerFeesCumulativeForReserve(
      referrer.publicKey,
      kaminoMarket!.getReserveByMint(NATIVE_MINT)!
    );
    const referrerFeesUnclaimedPostWithdraw = await kaminoMarket?.getReferrerFeesUnclaimedForReserve(
      referrer.publicKey,
      kaminoMarket!.getReserveByMint(NATIVE_MINT)!
    );

    fuzzyEq(referrerFeesCumulativePostWithdraw, referrerFeesCumulative);
    assert(referrerFeesUnclaimedPostWithdraw?.eq(0));
  });

  it('borrow_and_compound_withdraw_referrer_fees_sol', async function () {
    const borrowAmount = 500000000;
    const protocolTakeRate = 0.0000001;
    const referralFee = 0.2;
    const env = await initEnv('localnet');

    const depositSymbol = 'USDH';
    const borrowSymbol = 'SOL';

    const [createMarketSig, lendingMarket] = await createMarket(env);
    console.log(createMarketSig);
    await sleep(2000);

    const usdh = await createMint(env, env.admin.publicKey, 6);
    await sleep(2000);

    const [, depositReserve] = await createReserve(env, lendingMarket.publicKey, usdh);
    const [, borrowReserve] = await createReserve(env, lendingMarket.publicKey, NATIVE_MINT);
    const [, usdhAta] = await createAta(env, env.admin.publicKey, usdh);
    await sleep(2000);

    await mintTo(env, usdh, usdhAta, 100000000000);
    await sleep(2000);

    const referrer = Keypair.generate();
    await env.provider.connection.requestAirdrop(referrer.publicKey, 2 * LAMPORTS_PER_SOL);

    await updateMarketReferralFeeBps(env, lendingMarket.publicKey, 2000);
    const lendingMarketState = await LendingMarket.fetch(env.provider.connection, lendingMarket.publicKey);
    console.log('updateMarketReferralFeeBps ' + lendingMarketState?.referralFeeBps);
    await sleep(2000);

    const depositReserveConfig = makeReserveConfig(depositSymbol);
    const borrowReserveConfig = makeReserveConfigWithBorrowFeeAndTakeRate(borrowSymbol);
    await updateReserve(env, depositReserve.publicKey, depositReserveConfig);
    await sleep(2000);
    await updateReserve(env, borrowReserve.publicKey, borrowReserveConfig);
    await sleep(2000);

    const kaminoMarket = (await KaminoMarket.load(
      env.provider.connection,
      lendingMarket.publicKey,
      DEFAULT_RECENT_SLOT_DURATION_MS,
      PROGRAM_ID,
      true
    ))!;

    await executeInitUserMetadataTx(kaminoMarket!, referrer);
    await sleep(2000);

    const depositAction = await KaminoAction.buildDepositTxns(
      kaminoMarket!,
      '10000000000',
      usdh,
      env.admin.publicKey,
      new VanillaObligation(PROGRAM_ID),
      1_000_000,
      true,
      false,
      true,
      referrer.publicKey
    );

    await sendTransactionsFromAction(env, depositAction, env.admin);
    await sleep(2000);

    const depositor = Keypair.generate();
    await env.provider.connection.requestAirdrop(depositor.publicKey, 10000000000);
    await sleep(2000);

    const kaminoDepositAction = await KaminoAction.buildDepositTxns(
      kaminoMarket!,
      '5000000000',
      NATIVE_MINT,
      depositor.publicKey,
      new VanillaObligation(PROGRAM_ID)
    );

    await sendTransactionsFromAction(env, kaminoDepositAction, depositor, [depositor]);

    await sleep(2000);

    const borrowAction = await KaminoAction.buildBorrowTxns(
      kaminoMarket!,
      borrowAmount.toString(),
      NATIVE_MINT,
      env.admin.publicKey,
      new VanillaObligation(PROGRAM_ID),
      1_000_000,
      true,
      false,
      true,
      referrer.publicKey
    );

    await sendTransactionsFromAction(env, borrowAction, depositor);

    const [, userMetadata] = await kaminoMarket!.getUserMetadata(env.admin.publicKey)!;
    console.log('ref link', userMetadata!.referrer.toString());
    await sleep(2000);

    const obligation = (await kaminoMarket!.getObligationByWallet(
      env.admin.publicKey,
      new VanillaObligation(PROGRAM_ID)
    ))!;

    const obligationLiquidity = obligation.state.borrows[0];
    const borrowAmountPre = KaminoObligation.getBorrowAmount(obligationLiquidity);

    // await 5 seconds twice and refresh after each 5 seconds

    await sleep(5000);

    const refreshOligationAction = await KaminoAction.buildRefreshObligationTxns(
      kaminoMarket!,
      env.admin.publicKey,
      obligation!
    );

    await sendTransactionsFromAction(env, refreshOligationAction, env.admin);

    await sleep(5000);

    await sendTransactionsFromAction(env, refreshOligationAction, env.admin);

    await sleep(2000);

    const obligationPostRefresh = (await kaminoMarket!.getObligationByWallet(
      env.admin.publicKey,
      new VanillaObligation(PROGRAM_ID)
    ))!;

    const obligationLiquidityPost = obligationPostRefresh.state.borrows[0];
    const borrowAmountPost = KaminoObligation.getBorrowAmount(obligationLiquidityPost);

    const interestReferralFees = Math.trunc(borrowAmountPost!.sub(borrowAmountPre!).toNumber() * 0.1 * 0.2);

    const referrerFeesCumulative = await kaminoMarket?.getReferrerFeesCumulativeForReserve(
      referrer.publicKey,
      kaminoMarket!.getReserveByMint(NATIVE_MINT)!
    );
    const referrerFeesUnclaimed = await kaminoMarket?.getReferrerFeesUnclaimedForReserve(
      referrer.publicKey,
      kaminoMarket!.getReserveByMint(NATIVE_MINT)!
    );

    const borrowReferrerFee = borrowAmount * protocolTakeRate * referralFee;

    console.log(
      'referrerFeesCumulative: ' + referrerFeesCumulative + ' expected: ' + (borrowReferrerFee + interestReferralFees)
    );

    fuzzyEq(referrerFeesCumulative, new Decimal(borrowReferrerFee + interestReferralFees));
    fuzzyEq(referrerFeesUnclaimed, new Decimal(borrowReferrerFee + interestReferralFees));

    const withdrawReferrerFeesAction = await KaminoAction.buildWithdrawReferrerFeeTxns(
      referrer.publicKey,
      NATIVE_MINT,
      kaminoMarket!
    );

    await sendTransactionsFromAction(env, withdrawReferrerFeesAction, referrer, [referrer]);
  });

  // In this test, all actions are built without a referrer, the only source of
  // a referrer being the userMetadata state which is initialized at the beginning
  // that state is used when creating the obligation which is then used to create
  // the referrerTokenStates. Those referrerTokenStates become initialized and are used
  it('borrow_compound_withdraw_initialized_referrer_link', async function () {
    const borrowAmount = 5000000000;
    const protocolTakeRate = 0.0000001;
    const referralFee = 0.2;
    const env = await initEnv('localnet');

    const usdh = await createMint(env, env.admin.publicKey, 6);
    await sleep(2000);
    const [_signatureAta, usdhAta] = await createAta(env, env.admin.publicKey, usdh);
    await sleep(2000);

    const referrer = Keypair.generate();
    await env.provider.connection.requestAirdrop(referrer.publicKey, 2 * LAMPORTS_PER_SOL);

    const token = 'USDH';
    await mintTo(env, usdh, usdhAta, 100000000000);

    const [_createMarketSig, lendingMarket] = await createMarket(env);
    await sleep(2000);
    await updateMarketReferralFeeBps(env, lendingMarket.publicKey, 2000);
    const lendingMarketState = await LendingMarket.fetch(env.provider.connection, lendingMarket.publicKey);
    console.log('updateMarketReferralFeeBps ' + lendingMarketState?.referralFeeBps);
    const [_createReserveSig, usdhReserve] = await createReserve(env, lendingMarket.publicKey, usdh);
    await sleep(2000);

    const config = makeReserveConfigWithBorrowFeeAndTakeRate(token);
    await updateReserve(env, usdhReserve.publicKey, config);
    await sleep(2000);

    const kaminoMarket = (await KaminoMarket.load(
      env.provider.connection,
      lendingMarket.publicKey,
      DEFAULT_RECENT_SLOT_DURATION_MS,
      PROGRAM_ID,
      true
    ))!;

    await executeInitUserMetadataTx(kaminoMarket!, referrer);
    await sleep(2000);

    await executeInitUserMetadataTx(kaminoMarket, env.admin, referrer.publicKey);
    await sleep(2000);
    const [, userMetadata] = await kaminoMarket!.getUserMetadata(env.admin.publicKey)!;
    console.log('ref link', userMetadata!.referrer.toString());

    // Further action are built without referrer -> It should be taken from referral_link/obligation

    const depositAction = await KaminoAction.buildDepositTxns(
      kaminoMarket!,
      '10000000000',
      usdh,
      env.admin.publicKey,
      new VanillaObligation(PROGRAM_ID),
      1_000_000,
      true,
      false,
      true
    );

    await sendTransactionsFromAction(env, depositAction, env.admin);
    await sleep(2000);

    const borrowAction = await KaminoAction.buildBorrowTxns(
      kaminoMarket!,
      borrowAmount.toString(),
      usdh,
      env.admin.publicKey,
      new VanillaObligation(PROGRAM_ID),
      1_000_000,
      true,
      false,
      true
    );

    await sendTransactionsFromAction(env, borrowAction, env.admin);

    await sleep(2000);
    const obligation = (await kaminoMarket!.getObligationByWallet(
      env.admin.publicKey,
      new VanillaObligation(PROGRAM_ID)
    ))!;
    const obligationliquidity = obligation.state.borrows[0];
    const borrowAmountPre = KaminoObligation.getBorrowAmount(obligationliquidity);

    // await 5 seconds twice and refresh after each 5 seconds

    await sleep(5000);

    const refreshOligationAction = await KaminoAction.buildRefreshObligationTxns(
      kaminoMarket!,
      env.admin.publicKey,
      obligation!
    );

    await sendTransactionsFromAction(env, refreshOligationAction, env.admin);

    await sleep(5000);

    await sendTransactionsFromAction(env, refreshOligationAction, env.admin);

    await sleep(2000);

    const obligationPostRefresh = (await kaminoMarket!.getObligationByWallet(
      env.admin.publicKey,
      new VanillaObligation(PROGRAM_ID)
    ))!;

    const obligationLiquidityPost = obligationPostRefresh.state.borrows[0];
    const borrowAmountPost = KaminoObligation.getBorrowAmount(obligationLiquidityPost);

    const interestReferralFees = Math.trunc(borrowAmountPost.sub(borrowAmountPre).toNumber() * 0.1 * 0.2);

    const referrerFeesCumulative = await kaminoMarket?.getReferrerFeesCumulativeForReserve(
      referrer.publicKey,
      kaminoMarket!.getReserveByMint(usdh)!
    );
    const referrerFeesUnclaimed = await kaminoMarket?.getReferrerFeesUnclaimedForReserve(
      referrer.publicKey,
      kaminoMarket!.getReserveByMint(usdh)!
    );

    const borrowReferrerFee = borrowAmount * protocolTakeRate * referralFee;

    console.log('actual: ' + referrerFeesCumulative + ' expected: ' + (borrowReferrerFee + interestReferralFees));
    fuzzyEq(referrerFeesCumulative, new Decimal(borrowReferrerFee + interestReferralFees));
    fuzzyEq(referrerFeesUnclaimed, new Decimal(borrowReferrerFee + interestReferralFees));

    const withdrawReferrerFeesAction = await KaminoAction.buildWithdrawReferrerFeeTxns(
      referrer.publicKey,
      usdh,
      kaminoMarket!
    );

    await sendTransactionsFromAction(env, withdrawReferrerFeesAction, referrer, [referrer]);
  });

  it('deposit_and_borrow_compound_withdraw_init_user_metadata', async function () {
    const borrowAmount = 5000000000;
    const protocolTakeRate = 0.0000001;
    const referralFee = 0.2;
    const env = await initEnv('localnet');

    const usdh = await createMint(env, env.admin.publicKey, 6);
    await sleep(2000);
    const [_signatureAta, usdhAta] = await createAta(env, env.admin.publicKey, usdh);
    await sleep(2000);

    const referrer = Keypair.generate();
    await env.provider.connection.requestAirdrop(referrer.publicKey, 2 * LAMPORTS_PER_SOL);

    const token = 'USDH';
    await mintTo(env, usdh, usdhAta, 100000000000);

    const [_createMarketSig, lendingMarket] = await createMarket(env);
    await sleep(2000);
    await updateMarketReferralFeeBps(env, lendingMarket.publicKey, 2000);
    const lendingMarketState = await LendingMarket.fetch(env.provider.connection, lendingMarket.publicKey);
    console.log('updateMarketReferralFeeBps ' + lendingMarketState?.referralFeeBps);
    const [_createReserveSig, usdhReserve] = await createReserve(env, lendingMarket.publicKey, usdh);
    await sleep(2000);

    const config = makeReserveConfigWithBorrowFeeAndTakeRate(token);
    await updateReserve(env, usdhReserve.publicKey, config);
    await sleep(2000);

    const kaminoMarket = (await KaminoMarket.load(
      env.provider.connection,
      lendingMarket.publicKey,
      DEFAULT_RECENT_SLOT_DURATION_MS,
      PROGRAM_ID,
      true
    ))!;

    await executeInitUserMetadataTx(kaminoMarket!, referrer);
    await sleep(2000);

    await executeInitUserMetadataTx(kaminoMarket!, env.admin, referrer.publicKey);
    await sleep(2000);
    const [, userMetadata] = await kaminoMarket!.getUserMetadata(env.admin.publicKey)!;
    console.log('userMetadata.referrer', userMetadata!.referrer.toString());
    assert(!userMetadata!.userLookupTable.equals(PublicKey.default));

    // Further action are built without referrer -> It should be taken from referral_link/obligation

    const depositAndBorrowAction = await KaminoAction.buildDepositAndBorrowTxns(
      kaminoMarket!,
      '10000000000',
      usdh,
      borrowAmount.toString(),
      usdh,
      env.admin.publicKey,
      new VanillaObligation(PROGRAM_ID)
    );

    const tx = await buildVersionedTransaction(env.provider.connection, env.admin.publicKey, [
      ...depositAndBorrowAction.setupIxs,
      depositAndBorrowAction.lendingIxs[0],
      ...depositAndBorrowAction.inBetweenIxs,
      depositAndBorrowAction.lendingIxs[1],
      ...depositAndBorrowAction.cleanupIxs,
    ]);

    console.log('SetupIxns:', depositAndBorrowAction.setupIxsLabels);
    console.log('InBetweenIxns:', depositAndBorrowAction.inBetweenIxsLabels);
    console.log('LendingIxns:', depositAndBorrowAction.lendingIxsLabels);
    console.log('CleanupIxns:', depositAndBorrowAction.cleanupIxsLabels);

    await buildAndSendTxnWithLogs(env.provider.connection, tx, env.admin, [env.admin]);
    await sleep(2000);

    const obligation = (await kaminoMarket!.getObligationByWallet(
      env.admin.publicKey,
      new VanillaObligation(PROGRAM_ID)
    ))!;
    const obligationLiquidity = obligation.state.borrows[0];
    const borrowAmountPre = KaminoObligation.getBorrowAmount(obligationLiquidity);

    // await 5 seconds twice and refresh after each 5 seconds

    await sleep(5000);

    const refreshOligationAction = await KaminoAction.buildRefreshObligationTxns(
      kaminoMarket!,
      env.admin.publicKey,
      obligation!
    );

    await sendTransactionsFromAction(env, refreshOligationAction, env.admin);

    await sleep(5000);

    await sendTransactionsFromAction(env, refreshOligationAction, env.admin);

    await sleep(2000);

    const obligationPostRefresh = (await kaminoMarket!.getObligationByWallet(
      env.admin.publicKey,
      new VanillaObligation(PROGRAM_ID)
    ))!;

    const obligationLiquidityPost = obligationPostRefresh.state.borrows[0];
    const borrowAmountPost = KaminoObligation.getBorrowAmount(obligationLiquidityPost);

    const interestReferralFees = Math.trunc(borrowAmountPost!.sub(borrowAmountPre!).toNumber() * 0.1 * 0.2);

    const referrerFeesCumulative = await kaminoMarket?.getReferrerFeesCumulativeForReserve(
      referrer.publicKey,
      kaminoMarket!.getReserveByMint(usdh)!
    );
    const referrerFeesUnclaimed = await kaminoMarket?.getReferrerFeesUnclaimedForReserve(
      referrer.publicKey,
      kaminoMarket!.getReserveByMint(usdh)!
    );

    const borrowReferrerFee = borrowAmount * protocolTakeRate * referralFee;

    console.log('actual: ' + referrerFeesCumulative + ' expected: ' + (borrowReferrerFee + interestReferralFees));
    fuzzyEq(referrerFeesCumulative, new Decimal(borrowReferrerFee + interestReferralFees));
    fuzzyEq(referrerFeesUnclaimed, new Decimal(borrowReferrerFee + interestReferralFees));

    const withdrawReferrerFeesAction = await KaminoAction.buildWithdrawReferrerFeeTxns(
      referrer.publicKey,
      usdh,
      kaminoMarket!
    );

    await sendTransactionsFromAction(env, withdrawReferrerFeesAction, referrer, [referrer]);
  });

  it('borrow_compound_withdraw_2_deposits_2_borrows_init_user_metadata', async function () {
    const borrowAmount = 500000000;
    const protocolTakeRate = 0.0000001;
    const referralFee = 0.2;
    const env = await initEnv('localnet');

    const usdhSymbol = 'USDH';
    const solSymbol = 'SOL';

    const [createMarketSig, lendingMarket] = await createMarket(env);
    console.log(createMarketSig);
    await sleep(2000);

    const usdh = await createMint(env, env.admin.publicKey, 6);
    await sleep(2000);

    const [, usdhReserve] = await createReserve(env, lendingMarket.publicKey, usdh);
    const [, solReserve] = await createReserve(env, lendingMarket.publicKey, NATIVE_MINT);
    const [, usdhAta] = await createAta(env, env.admin.publicKey, usdh);
    await sleep(2000);

    await mintTo(env, usdh, usdhAta, 100000000000);
    await sleep(2000);

    const referrer = Keypair.generate();
    await env.provider.connection.requestAirdrop(referrer.publicKey, 2 * LAMPORTS_PER_SOL);

    await updateMarketReferralFeeBps(env, lendingMarket.publicKey, 2000);
    const lendingMarketState = await LendingMarket.fetch(env.provider.connection, lendingMarket.publicKey);
    console.log('updateMarketReferralFeeBps ' + lendingMarketState?.referralFeeBps);
    await sleep(2000);

    const usdhReserveConfig = makeReserveConfigWithBorrowFeeAndTakeRate(usdhSymbol);
    const solReserveConfig = makeReserveConfigWithBorrowFeeAndTakeRate(solSymbol);
    await updateReserve(env, solReserve.publicKey, solReserveConfig);
    await sleep(2000);
    await updateReserve(env, usdhReserve.publicKey, usdhReserveConfig);
    await sleep(2000);

    const kaminoMarket = (await KaminoMarket.load(
      env.provider.connection,
      lendingMarket.publicKey,
      DEFAULT_RECENT_SLOT_DURATION_MS,
      PROGRAM_ID,
      true
    ))!;

    await executeInitUserMetadataTx(kaminoMarket!, referrer);
    await sleep(2000);

    await executeInitUserMetadataTx(kaminoMarket!, env.admin, referrer.publicKey);
    await sleep(2000);

    const depositAction = await KaminoAction.buildDepositTxns(
      kaminoMarket!,
      '10000000000',
      usdh,
      env.admin.publicKey,
      new VanillaObligation(PROGRAM_ID),
      1_000_000,
      true,
      false,
      true
    );

    await sendTransactionsFromAction(env, depositAction, env.admin);
    await sleep(2000);

    await env.provider.connection.requestAirdrop(env.admin.publicKey, 10000000000);
    await sleep(2000);

    const kaminoDepositAction = await KaminoAction.buildDepositTxns(
      kaminoMarket!,
      '5000000000',
      NATIVE_MINT,
      env.admin.publicKey,
      new VanillaObligation(PROGRAM_ID)
    );

    await sendTransactionsFromAction(env, kaminoDepositAction, env.admin);

    await sleep(2000);

    const borrowActionSol = await KaminoAction.buildBorrowTxns(
      kaminoMarket!,
      borrowAmount.toString(),
      NATIVE_MINT,
      env.admin.publicKey,
      new VanillaObligation(PROGRAM_ID),
      1_000_000,
      true,
      false,
      true
    );

    await sendTransactionsFromAction(env, borrowActionSol, env.admin);

    await sleep(2000);

    const obligationBetweenBorrows = (await kaminoMarket!.getObligationByWallet(
      env.admin.publicKey,
      new VanillaObligation(PROGRAM_ID)
    ))!;
    const obligationLiquiditySol = obligationBetweenBorrows.state.borrows[0];
    const borrowAmountPreSol = KaminoObligation.getBorrowAmount(obligationLiquiditySol);

    const borrowActionUsdh = await KaminoAction.buildBorrowTxns(
      kaminoMarket!,
      '500000000',
      usdh,
      env.admin.publicKey,
      new VanillaObligation(PROGRAM_ID),
      1_000_000,
      true,
      false,
      true
    );

    await sendTransactionsFromAction(env, borrowActionUsdh, env.admin);

    await sleep(2000);

    const obligation = (await kaminoMarket!.getObligationByWallet(
      env.admin.publicKey,
      new VanillaObligation(PROGRAM_ID)
    ))!;
    const obligationLiquidityUsdh = obligation.state.borrows[1];
    const borrowAmountPreUsdh = KaminoObligation.getBorrowAmount(obligationLiquidityUsdh);

    // await 5 seconds twice and refresh after each 5 seconds

    await sleep(5000);

    const refreshOligationAction = await KaminoAction.buildRefreshObligationTxns(
      kaminoMarket!,
      env.admin.publicKey,
      obligation!
    );

    await sendTransactionsFromAction(env, refreshOligationAction, env.admin);

    await sleep(5000);

    await sendTransactionsFromAction(env, refreshOligationAction, env.admin);

    await sleep(2000);

    const obligationPostRefresh = (await kaminoMarket!.getObligationByWallet(
      env.admin.publicKey,
      new VanillaObligation(PROGRAM_ID)
    ))!;

    const obligationLiquiditySolPost = obligationPostRefresh.state.borrows[0];
    const obligationLiquidityUsdhPost = obligationPostRefresh.state.borrows[1];
    const borrowAmountPostSol = KaminoObligation.getBorrowAmount(obligationLiquiditySolPost);
    const borrowAmountPostUsdh = KaminoObligation.getBorrowAmount(obligationLiquidityUsdhPost);

    const interestReferralFeesSol = Math.trunc(borrowAmountPostSol!.sub(borrowAmountPreSol!).toNumber() * 0.1 * 0.2);
    const interestReferralFeesUsdh = Math.trunc(borrowAmountPostUsdh!.sub(borrowAmountPreUsdh!).toNumber() * 0.1 * 0.2);

    const referrerFeesCumulativeSol = await kaminoMarket?.getReferrerFeesCumulativeForReserve(
      referrer.publicKey,
      kaminoMarket!.getReserveByMint(NATIVE_MINT)!
    );
    const referrerFeesUnclaimedSol = await kaminoMarket?.getReferrerFeesUnclaimedForReserve(
      referrer.publicKey,
      kaminoMarket!.getReserveByMint(NATIVE_MINT)!
    );

    const referrerFeesCumulativeUsdh = await kaminoMarket?.getReferrerFeesCumulativeForReserve(
      referrer.publicKey,
      kaminoMarket!.getReserveByMint(usdh)!
    );
    const referrerFeesUnclaimedUsdh = await kaminoMarket?.getReferrerFeesUnclaimedForReserve(
      referrer.publicKey,
      kaminoMarket!.getReserveByMint(usdh)!
    );

    const borrowReferrerFee = borrowAmount * protocolTakeRate * referralFee;

    console.log(
      'referrerFeesCumulative: ' +
        referrerFeesCumulativeSol +
        ' expected: ' +
        (borrowReferrerFee + interestReferralFeesSol)
    );

    console.log(
      'referrerFeesCumulative: ' +
        referrerFeesCumulativeUsdh +
        ' expected: ' +
        (borrowReferrerFee + interestReferralFeesUsdh)
    );

    fuzzyEq(referrerFeesCumulativeSol, new Decimal(borrowReferrerFee + interestReferralFeesSol));
    fuzzyEq(referrerFeesUnclaimedSol, new Decimal(borrowReferrerFee + interestReferralFeesSol));

    fuzzyEq(referrerFeesCumulativeUsdh, new Decimal(borrowReferrerFee + interestReferralFeesUsdh));
    fuzzyEq(referrerFeesUnclaimedUsdh, new Decimal(borrowReferrerFee + interestReferralFeesUsdh));

    const preReferrerSolBalance = 0;
    const preReferrerUsdhBalance = 0;

    const withdrawReferrerFeesActionSol = await KaminoAction.buildWithdrawReferrerFeeTxns(
      referrer.publicKey,
      NATIVE_MINT,
      kaminoMarket!
    );

    await sendTransactionsFromAction(env, withdrawReferrerFeesActionSol, referrer, [referrer]);

    await sleep(2000);

    const withdrawReferrerFeesActionUsdh = await KaminoAction.buildWithdrawReferrerFeeTxns(
      referrer.publicKey,
      usdh,
      kaminoMarket!
    );
    await sendTransactionsFromAction(env, withdrawReferrerFeesActionUsdh, referrer, [referrer]);

    await sleep(2000);

    const postReferrerSolBalance = await getTokenAccountBalance(
      env.provider,
      await getAssociatedTokenAddress(NATIVE_MINT, referrer.publicKey)
    );
    const postReferrerUsdhBalance = await getTokenAccountBalance(
      env.provider,
      await getAssociatedTokenAddress(usdh, referrer.publicKey)
    );

    console.log('sol - before: ' + preReferrerSolBalance + ' - after: ' + postReferrerSolBalance);
    console.log('usdh - before: ' + preReferrerUsdhBalance + ' - after: ' + postReferrerUsdhBalance);

    fuzzyEq(postReferrerSolBalance - preReferrerSolBalance, borrowReferrerFee + interestReferralFeesSol);
    fuzzyEq(postReferrerUsdhBalance - preReferrerUsdhBalance, borrowReferrerFee + interestReferralFeesUsdh);
  });

  it('borrow_compound_withdraw_3_deposits_5_borrows_init_user_metadata', async function () {
    const borrowAmount = 500000000;
    const protocolTakeRate = 0.0000001;
    const referralFee = 0.2;
    const env = await initEnv('localnet');

    const depositSymbols = ['SOL', 'USDH', 'USDC'];
    const borrowSymbols = ['SOL', 'DUST', 'STSOL', 'USDT', 'MSOL'];

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

    const referrer = Keypair.generate();
    await env.provider.connection.requestAirdrop(referrer.publicKey, 2 * LAMPORTS_PER_SOL);

    await updateMarketReferralFeeBps(env, lendingMarket.publicKey, 2000);
    const lendingMarketState = await LendingMarket.fetch(env.provider.connection, lendingMarket.publicKey);
    console.log('updateMarketReferralFeeBps ' + lendingMarketState?.referralFeeBps);
    await sleep(2000);

    // Update reserve configs deposits config from 1 because SOL updated in borrows
    for (let index = 1; index < depositSymbols.length; index++) {
      const reserveConfig = makeReserveConfig(depositSymbols[index]);
      await updateReserve(env, depositReserves[index].publicKey, reserveConfig);
      await sleep(1000);
    }

    for (let index = 0; index < borrowSymbols.length; index++) {
      const reserveConfig = makeReserveConfigWithBorrowFeeAndTakeRate(borrowSymbols[index]);
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

    await executeInitUserMetadataTx(kaminoMarket!, referrer);
    await sleep(2000);

    // Init user metadata
    await executeInitUserMetadataTx(kaminoMarket!, env.admin, referrer.publicKey);
    await sleep(2000);

    // Init all referrer token states
    const initAllReferrerTokenStatesIxns = await getInitAllReferrerTokenStateIxns({
      referrer: referrer.publicKey,
      kaminoMarket: kaminoMarket!,
    });

    // Create lookup table
    const initAllReferrerTokenStatesLookupTable = await createLookupTable(
      env,
      initAllReferrerTokenStatesIxns
        .map((ixn) => ixn.keys)
        .flat()
        .map((key) => key.pubkey)
    );
    await sleep(2000);

    const tx = await buildVersionedTransaction(
      env.provider.connection,
      referrer.publicKey,
      initAllReferrerTokenStatesIxns,
      [initAllReferrerTokenStatesLookupTable]
    );
    tx.sign([referrer]);

    await sendAndConfirmVersionedTransaction(env.provider.connection, tx, 'confirmed');

    await sleep(2000);
    // deposit from user to depoit reserves
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

    // borrow and get initial borrows for assertions
    for (let index = 0; index < borrowSymbols.length; index++) {
      const borrowAction = await KaminoAction.buildBorrowTxns(
        kaminoMarket!,
        borrowAmount.toString(),
        borrowMints[index],
        env.admin.publicKey,
        new VanillaObligation(PROGRAM_ID),
        1_500_000
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

    // await 5 seconds twice and refresh after each 5 seconds
    const obligation = await kaminoMarket!.getObligationByWallet(
      env.admin.publicKey,
      new VanillaObligation(PROGRAM_ID)
    );
    await sleep(5000);

    const refreshOligationAction = await KaminoAction.buildRefreshObligationTxns(
      kaminoMarket!,
      env.admin.publicKey,
      obligation!
    );

    await sendTransactionsFromAction(env, refreshOligationAction, env.admin);

    await sleep(5000);

    await sendTransactionsFromAction(env, refreshOligationAction, env.admin);

    await sleep(2000);

    const obligationPostRefresh = (await kaminoMarket!.getObligationByWallet(
      env.admin.publicKey,
      new VanillaObligation(PROGRAM_ID)
    ))!;

    const expectedFees: number[] = [];

    // asserting referrals acumulations per mint
    for (let index = 0; index < borrowSymbols.length; index++) {
      const obligationLiquidityPost = obligationPostRefresh.state.borrows[index];
      const borrowAmountPost = KaminoObligation.getBorrowAmount(obligationLiquidityPost);
      const interestReferralFees = Math.trunc(borrowAmountPost!.sub(preBorrowAmounts[index]).toNumber() * 0.1 * 0.2);
      const referrerFeesCumulative = await kaminoMarket?.getReferrerFeesCumulativeForReserve(
        referrer.publicKey,
        kaminoMarket!.getReserveByMint(borrowMints[index])!
      );
      const referrerFeesUnclaimed = await kaminoMarket?.getReferrerFeesUnclaimedForReserve(
        referrer.publicKey,
        kaminoMarket!.getReserveByMint(borrowMints[index])!
      );

      const borrowReferrerFee = borrowAmount * protocolTakeRate * referralFee;

      console.log('actual: ' + referrerFeesCumulative + ' expected: ' + (borrowReferrerFee + interestReferralFees));
      fuzzyEq(referrerFeesCumulative, new Decimal(borrowReferrerFee + interestReferralFees));
      fuzzyEq(referrerFeesUnclaimed, new Decimal(borrowReferrerFee + interestReferralFees));
      expectedFees.push(borrowReferrerFee + interestReferralFees);
    }

    // withdrawing and asserting referrer ata balances
    for (let index = 0; index < borrowSymbols.length; index++) {
      const preReferrerBalance = 0;

      const withdrawReferrerFeesAction = await KaminoAction.buildWithdrawReferrerFeeTxns(
        referrer.publicKey,
        borrowMints[index],
        kaminoMarket!
      );

      await sendTransactionsFromAction(env, withdrawReferrerFeesAction, referrer, [referrer]);

      await sleep(2000);

      const postReferrerBalance = await getTokenAccountBalance(
        env.provider,
        await getAssociatedTokenAddress(borrowMints[index], referrer.publicKey)
      );

      console.log('before: ' + preReferrerBalance + ' - after: ' + postReferrerBalance);

      fuzzyEq(postReferrerBalance - preReferrerBalance, expectedFees[index]);
    }
  });

  it('deposit_first_time_leverage_deposit_again_same_leverage_with_referrer_withdraw_fees', async function () {
    const [collToken, debtToken] = ['SOL', 'USDC'];
    const depositToken = debtToken;
    const getPrice = (a: string, b: string) => getPriceMock(kaminoMarket, a, b);
    const slippagePct = 0.01;
    const [depositAmountFirst, depositAmountSecond] = [new Decimal(5), new Decimal(3)];
    const targetLeverage = new Decimal(3);

    console.log('Setting up market ===');
    const { env, kaminoMarket } = await createMarketWithTwoReservesToppedUp(
      [collToken, new Decimal(2000.05)],
      [debtToken, new Decimal(2000.05)]
    );
    await sleep(2000);

    const referrer = Keypair.generate();
    await env.provider.connection.requestAirdrop(referrer.publicKey, 2 * LAMPORTS_PER_SOL);
    await sleep(2000);

    await updateMarketReferralFeeBps(env, kaminoMarket.getAddress(), 2000);
    await sleep(2000);

    const debtReserveConfig = makeReserveConfigWithBorrowFeeAndTakeRate(debtToken);
    await updateReserve(env, kaminoMarket.getReserveBySymbol(debtToken)!.address, debtReserveConfig);
    await sleep(2000);

    kaminoMarket.reload();
    await sleep(2000);

    console.log('Creating user ===');
    const borrower = await newUser(
      env,
      kaminoMarket,
      [
        [collToken, new Decimal(20)],
        [debtToken, new Decimal(20)],
      ],
      null,
      false,
      referrer
    );

    await sleep(2000);

    console.log('Depositing with leverage ===');
    await depositLeverageTestAdapter(
      env,
      borrower,
      kaminoMarket,
      depositToken,
      collToken,
      debtToken,
      depositAmountFirst,
      targetLeverage,
      slippagePct,
      getPrice,
      referrer.publicKey
    );

    const obligation = (await kaminoMarket.getUserObligationsByTag(MultiplyObligation.tag, borrower.publicKey))[0];
    const [leverage, _ltv] = [obligation.refreshedStats.leverage, obligation.loanToValue()];

    await sleep(3000);

    await depositLeverageTestAdapter(
      env,
      borrower,
      kaminoMarket,
      depositToken,
      collToken,
      debtToken,
      depositAmountSecond,
      new Decimal(leverage.toString()),
      slippagePct,
      getPrice,
      referrer.publicKey
    );

    await sleep(8000);

    {
      const obligation = (await kaminoMarket.getUserObligationsByTag(MultiplyObligation.tag, borrower.publicKey))[0];

      const refreshOligationAction = await KaminoAction.buildRefreshObligationTxns(
        kaminoMarket!,
        env.admin.publicKey,
        obligation!
      );

      await sendTransactionsFromAction(env, refreshOligationAction, env.admin);
    }

    await sleep(2000);

    const referrerFeesCumulative = await kaminoMarket?.getReferrerFeesCumulativeForReserve(
      referrer.publicKey,
      kaminoMarket.getReserveBySymbol(debtToken)!
    );

    console.log('referrerFeesCumulative: ' + referrerFeesCumulative);

    fuzzyEq(referrerFeesCumulative, 2);

    const debtReserve = kaminoMarket.getReserveBySymbol(debtToken);

    const withdrawReferrerFeesAction = await KaminoAction.buildWithdrawReferrerFeeTxns(
      referrer.publicKey,
      debtReserve!.getLiquidityMint(),
      kaminoMarket!
    );

    await sendTransactionsFromAction(env, withdrawReferrerFeesAction, referrer, [referrer]);

    await sleep(2000);

    const referrerBalance = await getTokenAccountBalance(
      env.provider,
      await getAssociatedTokenAddress(
        kaminoMarket.getReserveBySymbol(debtToken)!.getLiquidityMint(),
        referrer.publicKey
      )
    );

    console.log('referrerBalance: ' + referrerBalance);

    fuzzyEq(new Decimal(referrerBalance), referrerFeesCumulative);
  });

  it('init_referrer_state_and_short_url_check_available_update_check_available', async function () {
    const env = await initEnv('localnet');
    await sleep(2000);

    const referrer = Keypair.generate();
    await env.provider.connection.requestAirdrop(referrer.publicKey, 2 * LAMPORTS_PER_SOL);
    await sleep(2000);

    const shortUrl = generateShortUrl();

    const [, lendingMarket] = await createMarket(env);

    const kaminoMarket = (await KaminoMarket.load(
      env.provider.connection,
      lendingMarket.publicKey,
      DEFAULT_RECENT_SLOT_DURATION_MS,
      PROGRAM_ID,
      true
    ))!;

    await executeInitUserMetadataTx(kaminoMarket!, referrer);
    await sleep(2000);

    const _initSig = await createReferrerStateAndShortUrl({ connection: env.provider.connection, referrer, shortUrl });
    await sleep(2000);

    const urlAvailable = await isShortUrlAvailable(env.provider.connection, shortUrl);
    assert(urlAvailable === false);

    const [, onChainShortUrl] = await getReferrerShortUrl(env.provider.connection, referrer.publicKey);
    assert(onChainShortUrl === shortUrl);

    const onChainReferrerForShortUrl = await getReferrerForShortUrl(env.provider.connection, shortUrl);
    assert(onChainReferrerForShortUrl.toString() === referrer.publicKey.toString());

    const newShortUrl = generateShortUrl();

    const _updateSig = await updateReferrerStateAndShortUrl({
      connection: env.provider.connection,
      referrer,
      newShortUrl,
    });
    await sleep(2000);

    const urlAvailable2 = await isShortUrlAvailable(env.provider.connection, shortUrl);
    assert(urlAvailable2 === true);

    const [, newOnChainShortUrl] = await getReferrerShortUrl(env.provider.connection, referrer.publicKey);
    assert(newOnChainShortUrl === newShortUrl);

    const onChainReferrerForNewShortUrl = await getReferrerForShortUrl(env.provider.connection, newShortUrl);
    assert(onChainReferrerForNewShortUrl.toString() === referrer.publicKey.toString());
  });

  it('three_users_referred_check_amount', async function () {
    const borrowAmount = 5000000;
    const collToken = 'MSOL';
    const debtToken = 'USDH';
    const {
      env,
      firstMint: collMint,
      secondMint: debtMint,
      kaminoMarket,
    } = await createMarketWithTwoReserves(collToken, debtToken, false);

    const referrer = Keypair.generate();
    await env.provider.connection.requestAirdrop(referrer.publicKey, 2 * LAMPORTS_PER_SOL);

    const depositorOnly = Keypair.generate();
    await env.provider.connection.requestAirdrop(depositorOnly.publicKey, 2 * LAMPORTS_PER_SOL);
    const [_signatureAta, secondMintDepositorAta] = await createAta(env, depositorOnly.publicKey, debtMint);
    await sleep(2000);
    await mintTo(env, debtMint, secondMintDepositorAta, 100000000000);
    await sleep(2000);

    await executeInitUserMetadataTx(kaminoMarket!, referrer);
    await sleep(2000);

    const depositAction = await KaminoAction.buildDepositTxns(
      kaminoMarket!,
      '10000000000',
      debtMint,
      depositorOnly.publicKey,
      new VanillaObligation(PROGRAM_ID),
      1_000_000,
      true,
      false,
      true
    );

    await sendTransactionsFromAction(env, depositAction, depositorOnly, [depositorOnly]);
    await sleep(2000);

    for (let i = 0; i < 3; i++) {
      const borrower = Keypair.generate();
      await env.provider.connection.requestAirdrop(borrower.publicKey, 2 * LAMPORTS_PER_SOL);
      const [_signatureAta, firstMintBorrowerAta] = await createAta(env, borrower.publicKey, collMint);
      await sleep(2000);
      await mintTo(env, collMint, firstMintBorrowerAta, 100000000000);
      await sleep(2000);

      const depositAction = await KaminoAction.buildDepositTxns(
        kaminoMarket!,
        '10000000000',
        collMint,
        borrower.publicKey,
        new VanillaObligation(PROGRAM_ID),
        1_000_000,
        true,
        false,
        true,
        referrer.publicKey
      );

      await sendTransactionsFromAction(env, depositAction, borrower, [borrower]);
      await sleep(2000);

      const borrowAction = await KaminoAction.buildBorrowTxns(
        kaminoMarket!,
        borrowAmount.toString(),
        debtMint,
        borrower.publicKey,
        new VanillaObligation(PROGRAM_ID),
        1_000_000,
        true,
        false,
        true,
        referrer.publicKey
      );

      await sendTransactionsFromAction(env, borrowAction, borrower, [borrower]);
      await sleep(2000);

      const amountUsersReferred = await getTotalUsersReferred(env.provider.connection, referrer.publicKey);
      assert(amountUsersReferred === i + 1);
    }
  });
});

const executeInitUserMetadataTx = async (
  kaminoMarket: KaminoMarket,
  owner: Keypair,
  referrer: PublicKey = PublicKey.default
) => {
  const [_userLutAddressAddress, userMetadataIxs] = await getUserLutAddressAndSetupIxns(
    kaminoMarket,
    owner.publicKey,
    referrer,
    false,
    undefined
  );

  const tx = await buildVersionedTransaction(kaminoMarket.getConnection(), owner.publicKey, userMetadataIxs[0]);
  tx.sign([owner]);

  await sendAndConfirmVersionedTransaction(kaminoMarket.getConnection(), tx, 'confirmed');

  console.log('Init User metadata');
};

function generateShortUrl(): string {
  let result = '';
  const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
  const charactersLength = characters.length;
  for (let index = 0; index < 32; index++) {
    result += characters.charAt(Math.floor(Math.random() * charactersLength));
  }
  return result;
}
