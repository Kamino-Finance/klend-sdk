import { assert } from 'chai';
import { KaminoAction, PROGRAM_ID, VanillaObligation, fuzzyEq, numberToLamportsDecimal, sleep } from '../../src';
import { getObligationFarmState, initializeFarmsForReserve } from '../farms_operations';
import {
  borrow,
  createMarketWithTwoReservesToppedUp,
  deposit,
  newUser,
  sendTransactionsFromAction,
} from '../setup_utils';
import Decimal from 'decimal.js';
import { reloadReservesAndRefreshMarket } from '../setup_operations';

describe('init_and_refresh_farm_repay_tests', function () {
  it('init_refresh_farm_repay_coll_farm_only', async function () {
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
    await sleep(2000);

    await kaminoMarket.reload();
    const repayAction = await KaminoAction.buildRepayTxns(
      kaminoMarket,
      numberToLamportsDecimal(500, debtReserve.stats.decimals).floor().toString(),
      debtReserve.getLiquidityMint(),
      borrower.publicKey,
      new VanillaObligation(PROGRAM_ID),
      await env.provider.connection.getSlot()
    );

    await sendTransactionsFromAction(env, repayAction, borrower, [borrower]);

    const obligation = (await kaminoMarket.getUserObligationsByTag(VanillaObligation.tag, borrower.publicKey))![0];
    const obligationFarmState = await getObligationFarmState(
      env,
      obligation,
      kaminoMarket.getReserveBySymbol(debtToken)!.state.farmDebt
    );
    assert.equal(obligationFarmState, null);
  });

  it('init_refresh_farm_repay_debt_farm', async function () {
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
    // adding both coll and debt farms to ensure none is causing problems (we will have both for points anyway)
    await initializeFarmsForReserve(env, kaminoMarket.getAddress(), debtReserve.address, 'Collateral', false, false);
    await initializeFarmsForReserve(env, kaminoMarket.getAddress(), debtReserve.address, 'Debt', false, false);
    await sleep(2000);

    await kaminoMarket.reload();
    const repayAction = await KaminoAction.buildRepayTxns(
      kaminoMarket,
      numberToLamportsDecimal(500, debtReserve.stats.decimals).floor().toString(),
      debtReserve.getLiquidityMint(),
      borrower.publicKey,
      new VanillaObligation(PROGRAM_ID),
      await env.provider.connection.getSlot()
    );

    await sendTransactionsFromAction(env, repayAction, borrower, [borrower]);
    await sleep(2000);

    const obligation = (await kaminoMarket.getUserObligationsByTag(VanillaObligation.tag, borrower.publicKey))![0];
    const obligationFarmState = await getObligationFarmState(
      env,
      obligation,
      kaminoMarket.getReserveBySymbol(debtToken)!.state.farmDebt
    );
    console.log(obligation.getBorrows()[0].amount.toNumber() / debtReserve.getMintFactor().toNumber());
    console.log(obligationFarmState?.activeStakeScaled.toNumber()! / debtReserve.getMintFactor().toNumber());
    // assertion diff comes from the way we calculate in sdk vs SC?
    assert.ok(
      fuzzyEq(
        obligation.getBorrows()[0].amount.toNumber() / debtReserve.getMintFactor().toNumber(),
        obligationFarmState?.activeStakeScaled.toNumber()! / debtReserve.getMintFactor().toNumber(),
        0.001
      )
    );
  });

  it('init_refresh_farm_repay_coll_farm_debt_farm', async function () {
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
    const repayAction = await KaminoAction.buildRepayTxns(
      kaminoMarket,
      numberToLamportsDecimal(500, debtReserve.stats.decimals).floor().toString(),
      debtReserve.getLiquidityMint(),
      borrower.publicKey,
      new VanillaObligation(PROGRAM_ID),
      await env.provider.connection.getSlot()
    );

    await sendTransactionsFromAction(env, repayAction, borrower, [borrower]);
    await sleep(2000);

    const obligation = (await kaminoMarket.getUserObligationsByTag(VanillaObligation.tag, borrower.publicKey))![0];
    const obligationFarmState = await getObligationFarmState(
      env,
      obligation,
      kaminoMarket.getReserveBySymbol(debtToken)!.state.farmDebt
    );
    console.log(obligation.getBorrows()[0].amount.toNumber() / debtReserve.getMintFactor().toNumber());
    console.log(obligationFarmState?.activeStakeScaled.toNumber()! / debtReserve.getMintFactor().toNumber());
    // assertion in lamports
    assert.ok(
      fuzzyEq(
        obligation.getBorrows()[0].amount.toNumber() / debtReserve.getMintFactor().toNumber(),
        obligationFarmState?.activeStakeScaled.toNumber()! / debtReserve.getMintFactor().toNumber(),
        0.002
      )
    );
  });

  it('init_refresh_farm_repay_sol_coll_farm_debt_farm', async function () {
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
    const repayAction = await KaminoAction.buildRepayTxns(
      kaminoMarket,
      numberToLamportsDecimal(500, debtReserve.stats.decimals).floor().toString(),
      debtReserve.getLiquidityMint(),
      borrower.publicKey,
      new VanillaObligation(PROGRAM_ID),
      await env.provider.connection.getSlot()
    );

    await sendTransactionsFromAction(env, repayAction, borrower, [borrower]);
    await sleep(2000);

    const obligation = (await kaminoMarket.getUserObligationsByTag(VanillaObligation.tag, borrower.publicKey))![0];
    const obligationFarmState = await getObligationFarmState(
      env,
      obligation,
      kaminoMarket.getReserveBySymbol(debtToken)!.state.farmDebt
    );
    console.log(obligation.getBorrows()[0].amount.toNumber() / debtReserve.getMintFactor().toNumber());
    console.log(obligationFarmState?.activeStakeScaled.toNumber()! / debtReserve.getMintFactor().toNumber());
    // assertion in lamports
    assert.ok(
      fuzzyEq(
        obligation.getBorrows()[0].amount.toNumber() / debtReserve.getMintFactor().toNumber(),
        obligationFarmState?.activeStakeScaled.toNumber()! / debtReserve.getMintFactor().toNumber(),
        0.002
      )
    );
  });

  it('init_refresh_farm_repay_coll_farm_sol_debt_farm', async function () {
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
    const repayAction = await KaminoAction.buildRepayTxns(
      kaminoMarket,
      numberToLamportsDecimal(5, debtReserve.stats.decimals).floor().toString(),
      debtReserve.getLiquidityMint(),
      borrower.publicKey,
      new VanillaObligation(PROGRAM_ID),
      await env.provider.connection.getSlot()
    );

    await sendTransactionsFromAction(env, repayAction, borrower, [borrower]);
    await sleep(2000);

    const obligation = (await kaminoMarket.getUserObligationsByTag(VanillaObligation.tag, borrower.publicKey))![0];
    const obligationFarmState = await getObligationFarmState(
      env,
      obligation,
      kaminoMarket.getReserveBySymbol(debtToken)!.state.farmDebt
    );
    console.log(obligationFarmState?.activeStakeScaled.toNumber());
    // assertion in lamports
    assert.ok(
      fuzzyEq(
        obligation.getBorrows()[0].amount.toNumber() / debtReserve.getMintFactor().toNumber(),
        obligationFarmState?.activeStakeScaled.toNumber()! / debtReserve.getMintFactor().toNumber(),
        0.002
      )
    );
  });
});
