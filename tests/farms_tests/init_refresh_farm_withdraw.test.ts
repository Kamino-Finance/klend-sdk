import { assert } from 'chai';
import { getObligationFarmState, initializeFarmsForReserve } from '../farms_operations';
import {
  borrow,
  createLookupTable,
  createMarketWithTwoReservesToppedUp,
  deposit,
  newUser,
  sendTransactionsFromAction,
} from '../setup_utils';
import { KaminoAction, PROGRAM_ID, VanillaObligation, numberToLamportsDecimal, sleep } from '../../src';
import Decimal from 'decimal.js';
import { reloadReservesAndRefreshMarket } from '../setup_operations';

describe('init_and_refresh_farm_withdraw_tests', function () {
  it('init_refresh_farm_withdraw_coll_farm_only', async function () {
    const [collToken, debtToken] = ['USDH', 'USDC'];

    const { env, kaminoMarket } = await createMarketWithTwoReservesToppedUp(
      [collToken, new Decimal(5000.05)],
      [debtToken, new Decimal(5000.05)]
    );
    await reloadReservesAndRefreshMarket(env, kaminoMarket);
    const borrower = await newUser(env, kaminoMarket, [
      [collToken, new Decimal(2000)],
      [debtToken, new Decimal(0)],
    ]);

    await deposit(env, kaminoMarket, borrower, collToken, new Decimal(1500));
    await borrow(env, kaminoMarket, borrower, debtToken, new Decimal(1000));

    const collReserve = kaminoMarket.getReserveBySymbol(collToken)!;
    // adding both coll and debt farms to ensure none is causing problems (we will have both for points anyway)
    await initializeFarmsForReserve(env, kaminoMarket.getAddress(), collReserve.address, 'Collateral', false, false);
    await initializeFarmsForReserve(env, kaminoMarket.getAddress(), collReserve.address, 'Debt', false, false);
    await sleep(2000);

    await kaminoMarket.reload();
    const withdrawAction = await KaminoAction.buildWithdrawTxns(
      kaminoMarket,
      numberToLamportsDecimal(100, collReserve.stats.decimals).floor().toString(),
      collReserve.getLiquidityMint(),
      borrower.publicKey,
      new VanillaObligation(PROGRAM_ID)
    );

    await sendTransactionsFromAction(env, withdrawAction, borrower, [borrower]);

    const obligation = (await kaminoMarket.getUserObligationsByTag(VanillaObligation.tag, borrower.publicKey))![0];
    const obligationFarmState = await getObligationFarmState(
      env,
      obligation,
      kaminoMarket.getReserveBySymbol(collToken)!.state.farmCollateral
    );
    assert.equal(obligation.getDeposits()[0].amount.toNumber(), obligationFarmState?.activeStakeScaled.toNumber()!);
  });

  it('init_refresh_farm_withdraw_debt_farm', async function () {
    const [collToken, debtToken] = ['USDH', 'USDC'];

    const { env, kaminoMarket } = await createMarketWithTwoReservesToppedUp(
      [collToken, new Decimal(5000.05)],
      [debtToken, new Decimal(5000.05)]
    );
    await reloadReservesAndRefreshMarket(env, kaminoMarket);
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
    const withdrawAction = await KaminoAction.buildWithdrawTxns(
      kaminoMarket,
      numberToLamportsDecimal(100, collReserve.stats.decimals).floor().toString(),
      collReserve.getLiquidityMint(),
      borrower.publicKey,
      new VanillaObligation(PROGRAM_ID)
    );

    await sendTransactionsFromAction(env, withdrawAction, borrower, [borrower]);

    const obligation = (await kaminoMarket.getUserObligationsByTag(VanillaObligation.tag, borrower.publicKey))![0];
    const obligationFarmState = await getObligationFarmState(
      env,
      obligation,
      kaminoMarket.getReserveBySymbol(collToken)!.state.farmCollateral
    );
    assert.equal(obligationFarmState, undefined);
  });

  it('init_refresh_farm_withdraw_coll_farm_debt_farm', async function () {
    const [collToken, debtToken] = ['USDH', 'USDC'];

    const { env, kaminoMarket } = await createMarketWithTwoReservesToppedUp(
      [collToken, new Decimal(5000.05)],
      [debtToken, new Decimal(5000.05)]
    );
    await reloadReservesAndRefreshMarket(env, kaminoMarket);
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
    const withdrawAction = await KaminoAction.buildWithdrawTxns(
      kaminoMarket,
      numberToLamportsDecimal(100, collReserve.stats.decimals).floor().toString(),
      collReserve.getLiquidityMint(),
      borrower.publicKey,
      new VanillaObligation(PROGRAM_ID)
    );

    await sendTransactionsFromAction(env, withdrawAction, borrower, [borrower]);

    const obligation = (await kaminoMarket.getUserObligationsByTag(VanillaObligation.tag, borrower.publicKey))![0];
    const obligationFarmState = await getObligationFarmState(
      env,
      obligation,
      kaminoMarket.getReserveBySymbol(collToken)!.state.farmCollateral
    );
    assert.equal(obligation.getDeposits()[0].amount.toNumber(), obligationFarmState?.activeStakeScaled.toNumber()!);
  });

  it('init_refresh_farm_withdraw_sol_coll_farm_debt_farm', async function () {
    const [collToken, debtToken] = ['SOL', 'USDC'];

    const { env, kaminoMarket } = await createMarketWithTwoReservesToppedUp(
      [collToken, new Decimal(5000.05)],
      [debtToken, new Decimal(5000.05)]
    );
    await reloadReservesAndRefreshMarket(env, kaminoMarket);
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
    const withdrawAction = await KaminoAction.buildWithdrawTxns(
      kaminoMarket,
      numberToLamportsDecimal(10, collReserve.stats.decimals).floor().toString(),
      collReserve.getLiquidityMint(),
      borrower.publicKey,
      new VanillaObligation(PROGRAM_ID)
    );

    const withdrawLookupTable = await createLookupTable(
      env,
      [...withdrawAction.setupIxs, ...withdrawAction.lendingIxs, ...withdrawAction.cleanupIxs]
        .map((ixn) => ixn.keys)
        .flat()
        .map((key) => key.pubkey)
    );
    await sleep(2000);

    await sendTransactionsFromAction(env, withdrawAction, borrower, [borrower], [withdrawLookupTable]);

    const obligation = (await kaminoMarket.getUserObligationsByTag(VanillaObligation.tag, borrower.publicKey))![0];
    const obligationFarmState = await getObligationFarmState(
      env,
      obligation,
      kaminoMarket.getReserveBySymbol(collToken)!.state.farmCollateral
    );
    assert.equal(obligation.getDeposits()[0].amount.toNumber(), obligationFarmState?.activeStakeScaled.toNumber()!);
  });

  it('init_refresh_farm_withdraw_coll_farm_sol_debt_farm', async function () {
    const [collToken, debtToken] = ['USDH', 'SOL'];

    const { env, kaminoMarket } = await createMarketWithTwoReservesToppedUp(
      [collToken, new Decimal(5000.05)],
      [debtToken, new Decimal(5000.05)]
    );
    await reloadReservesAndRefreshMarket(env, kaminoMarket);
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
    const withdrawAction = await KaminoAction.buildWithdrawTxns(
      kaminoMarket,
      numberToLamportsDecimal(100, collReserve.stats.decimals).floor().toString(),
      collReserve.getLiquidityMint(),
      borrower.publicKey,
      new VanillaObligation(PROGRAM_ID)
    );

    const withdrawLookupTable = await createLookupTable(
      env,
      [...withdrawAction.setupIxs, ...withdrawAction.lendingIxs, ...withdrawAction.cleanupIxs]
        .map((ixn) => ixn.keys)
        .flat()
        .map((key) => key.pubkey)
    );
    await sleep(2000);

    await sendTransactionsFromAction(env, withdrawAction, borrower, [borrower], [withdrawLookupTable]);

    const obligation = (await kaminoMarket.getUserObligationsByTag(VanillaObligation.tag, borrower.publicKey))![0];
    const obligationFarmState = await getObligationFarmState(
      env,
      obligation,
      kaminoMarket.getReserveBySymbol(collToken)!.state.farmCollateral
    );
    assert.equal(obligation.getDeposits()[0].amount.toNumber(), obligationFarmState?.activeStakeScaled.toNumber()!);
  });
});
