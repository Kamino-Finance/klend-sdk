import { assert } from 'chai';
import { KaminoAction, PROGRAM_ID, VanillaObligation, numberToLamportsDecimal, sleep } from '../../src';
import { getObligationFarmState, initializeFarmsForReserve } from '../farms_operations';
import {
  deposit,
  sendTransactionsFromAction,
  borrow,
  newUser,
  createMarketWithTwoReservesToppedUp,
} from '../setup_utils';
import Decimal from 'decimal.js';

describe('init_and_refresh_farm_separate_deposit_tests', function () {
  it('init_refresh_farm_separate_deposit_coll_farm_only', async function () {
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
    // adding both coll and debt farms to ensure none is causing problems (we will have both for points anyway)
    await initializeFarmsForReserve(env, kaminoMarket.getAddress(), collReserve.address, 'Collateral', false, false);
    await initializeFarmsForReserve(env, kaminoMarket.getAddress(), collReserve.address, 'Debt', false, false);
    await sleep(2000);

    await kaminoMarket.reload();
    const toDeposit = 100;
    const depositReserveLiquidityAction = await KaminoAction.buildDepositReserveLiquidityTxns(
      kaminoMarket,
      numberToLamportsDecimal(toDeposit, collReserve.stats.decimals).floor().toString(),
      collReserve.getLiquidityMint(),
      borrower.publicKey,
      new VanillaObligation(PROGRAM_ID)
    );

    await sendTransactionsFromAction(env, depositReserveLiquidityAction, borrower, [borrower]);

    const obligationBeforeDeposit = (await kaminoMarket.getUserObligationsByTag(
      VanillaObligation.tag,
      borrower.publicKey
    ))![0];
    const obligationFarmStateBeforeDeposit = await getObligationFarmState(
      env,
      obligationBeforeDeposit,
      kaminoMarket.getReserveBySymbol(collToken)!.state.farmCollateral
    );
    assert.ok(obligationFarmStateBeforeDeposit?.activeStakeScaled === undefined);

    const depositObligationCollateralAction = await KaminoAction.buildDepositObligationCollateralTxns(
      kaminoMarket,
      numberToLamportsDecimal(toDeposit, collReserve.stats.decimals).floor().toString(),
      collReserve.getLiquidityMint(),
      borrower.publicKey,
      new VanillaObligation(PROGRAM_ID)
    );

    await sendTransactionsFromAction(env, depositObligationCollateralAction, borrower, [borrower]);

    const obligationAfterDeposit = (await kaminoMarket.getUserObligationsByTag(
      VanillaObligation.tag,
      borrower.publicKey
    ))![0];
    const obligationFarmStateAfterDeposit = await getObligationFarmState(
      env,
      obligationAfterDeposit,
      kaminoMarket.getReserveBySymbol(collToken)!.state.farmCollateral
    );
    assert.equal(
      obligationAfterDeposit.getDeposits()[0].amount.toNumber(),
      obligationFarmStateAfterDeposit?.activeStakeScaled.toNumber()
    );
  });

  it('init_refresh_farm_separate_deposit_debt_farm', async function () {
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
    await kaminoMarket.reload();
    const toDeposit = 100;
    const depositReserveLiquidityAction = await KaminoAction.buildDepositReserveLiquidityTxns(
      kaminoMarket,
      numberToLamportsDecimal(toDeposit + 1, collReserve.stats.decimals)
        .floor()
        .toString(),
      collReserve.getLiquidityMint(),
      borrower.publicKey,
      new VanillaObligation(PROGRAM_ID)
    );

    await sendTransactionsFromAction(env, depositReserveLiquidityAction, borrower, [borrower]);

    const obligationBeforeDeposit = (await kaminoMarket.getUserObligationsByTag(
      VanillaObligation.tag,
      borrower.publicKey
    ))![0];
    const obligationFarmStateBeforeDeposit = await getObligationFarmState(
      env,
      obligationBeforeDeposit,
      kaminoMarket.getReserveBySymbol(collToken)!.state.farmCollateral
    );
    assert.ok(obligationFarmStateBeforeDeposit?.activeStakeScaled === undefined);

    const depositObligationCollateralAction = await KaminoAction.buildDepositObligationCollateralTxns(
      kaminoMarket,
      numberToLamportsDecimal(toDeposit, collReserve.stats.decimals).floor().toString(),
      collReserve.getLiquidityMint(),
      borrower.publicKey,
      new VanillaObligation(PROGRAM_ID)
    );

    await sendTransactionsFromAction(env, depositObligationCollateralAction, borrower, [borrower]);

    const obligationAfterDeposit = (await kaminoMarket.getUserObligationsByTag(
      VanillaObligation.tag,
      borrower.publicKey
    ))![0];
    const obligationFarmStateAfterDeposit = await getObligationFarmState(
      env,
      obligationAfterDeposit,
      kaminoMarket.getReserveBySymbol(collToken)!.state.farmCollateral
    );
    assert.ok(obligationFarmStateAfterDeposit?.activeStakeScaled === undefined);
  });

  it('init_refresh_farm_separate_deposit_coll_farm_debt_farm', async function () {
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
    const depositReserveLiquidityAction = await KaminoAction.buildDepositReserveLiquidityTxns(
      kaminoMarket,
      numberToLamportsDecimal(toDeposit, collReserve.stats.decimals).floor().toString(),
      collReserve.getLiquidityMint(),
      borrower.publicKey,
      new VanillaObligation(PROGRAM_ID)
    );

    await sendTransactionsFromAction(env, depositReserveLiquidityAction, borrower, [borrower]);

    const obligationBeforeDeposit = (await kaminoMarket.getUserObligationsByTag(
      VanillaObligation.tag,
      borrower.publicKey
    ))![0];
    const obligationFarmStateBeforeDeposit = await getObligationFarmState(
      env,
      obligationBeforeDeposit,
      kaminoMarket.getReserveBySymbol(collToken)!.state.farmCollateral
    );
    assert.ok(obligationFarmStateBeforeDeposit?.activeStakeScaled === undefined);

    const depositObligationCollateralAction = await KaminoAction.buildDepositObligationCollateralTxns(
      kaminoMarket,
      numberToLamportsDecimal(toDeposit, collReserve.stats.decimals).floor().toString(),
      collReserve.getLiquidityMint(),
      borrower.publicKey,
      new VanillaObligation(PROGRAM_ID)
    );

    await sendTransactionsFromAction(env, depositObligationCollateralAction, borrower, [borrower]);

    const obligationAfterDeposit = (await kaminoMarket.getUserObligationsByTag(
      VanillaObligation.tag,
      borrower.publicKey
    ))![0];
    const obligationFarmStateAfterDeposit = await getObligationFarmState(
      env,
      obligationAfterDeposit,
      kaminoMarket.getReserveBySymbol(collToken)!.state.farmCollateral
    );
    assert.equal(
      obligationAfterDeposit.getDeposits()[0].amount.toNumber(),
      obligationFarmStateAfterDeposit?.activeStakeScaled.toNumber()
    );
  });

  it('init_refresh_farm_separate_deposit_sol_coll_farm_debt_farm', async function () {
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
    const toDeposit = 100;
    const depositReserveLiquidityAction = await KaminoAction.buildDepositReserveLiquidityTxns(
      kaminoMarket,
      numberToLamportsDecimal(toDeposit, collReserve.stats.decimals).floor().toString(),
      collReserve.getLiquidityMint(),
      borrower.publicKey,
      new VanillaObligation(PROGRAM_ID)
    );

    await sendTransactionsFromAction(env, depositReserveLiquidityAction, borrower, [borrower]);

    const obligationBeforeDeposit = (await kaminoMarket.getUserObligationsByTag(
      VanillaObligation.tag,
      borrower.publicKey
    ))![0];
    const obligationFarmStateBeforeDeposit = await getObligationFarmState(
      env,
      obligationBeforeDeposit,
      kaminoMarket.getReserveBySymbol(collToken)!.state.farmCollateral
    );
    assert.ok(obligationFarmStateBeforeDeposit?.activeStakeScaled === undefined);

    const depositObligationCollateralAction = await KaminoAction.buildDepositObligationCollateralTxns(
      kaminoMarket,
      numberToLamportsDecimal(toDeposit, collReserve.stats.decimals).floor().toString(),
      collReserve.getLiquidityMint(),
      borrower.publicKey,
      new VanillaObligation(PROGRAM_ID)
    );

    await sendTransactionsFromAction(env, depositObligationCollateralAction, borrower, [borrower]);

    const obligationAfterDeposit = (await kaminoMarket.getUserObligationsByTag(
      VanillaObligation.tag,
      borrower.publicKey
    ))![0];
    const obligationFarmStateAfterDeposit = await getObligationFarmState(
      env,
      obligationAfterDeposit,
      kaminoMarket.getReserveBySymbol(collToken)!.state.farmCollateral
    );
    assert.equal(
      obligationAfterDeposit.getDeposits()[0].amount.toNumber(),
      obligationFarmStateAfterDeposit?.activeStakeScaled.toNumber()
    );
  });

  it('init_refresh_farm_separate_deposit_coll_farm_sol_debt_farm', async function () {
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
    const depositReserveLiquidityAction = await KaminoAction.buildDepositReserveLiquidityTxns(
      kaminoMarket,
      numberToLamportsDecimal(toDeposit, collReserve.stats.decimals).floor().toString(),
      collReserve.getLiquidityMint(),
      borrower.publicKey,
      new VanillaObligation(PROGRAM_ID)
    );

    await sendTransactionsFromAction(env, depositReserveLiquidityAction, borrower, [borrower]);

    const obligationBeforeDeposit = (await kaminoMarket.getUserObligationsByTag(
      VanillaObligation.tag,
      borrower.publicKey
    ))![0];
    const obligationFarmStateBeforeDeposit = await getObligationFarmState(
      env,
      obligationBeforeDeposit,
      kaminoMarket.getReserveBySymbol(collToken)!.state.farmCollateral
    );
    assert.ok(obligationFarmStateBeforeDeposit?.activeStakeScaled === undefined);

    const depositObligationCollateralAction = await KaminoAction.buildDepositObligationCollateralTxns(
      kaminoMarket,
      numberToLamportsDecimal(toDeposit, collReserve.stats.decimals).floor().toString(),
      collReserve.getLiquidityMint(),
      borrower.publicKey,
      new VanillaObligation(PROGRAM_ID)
    );

    await sendTransactionsFromAction(env, depositObligationCollateralAction, borrower, [borrower]);

    const obligationAfterDeposit = (await kaminoMarket.getUserObligationsByTag(
      VanillaObligation.tag,
      borrower.publicKey
    ))![0];
    const obligationFarmStateAfterDeposit = await getObligationFarmState(
      env,
      obligationAfterDeposit,
      kaminoMarket.getReserveBySymbol(collToken)!.state.farmCollateral
    );
    assert.equal(
      obligationAfterDeposit.getDeposits()[0].amount.toNumber(),
      obligationFarmStateAfterDeposit?.activeStakeScaled.toNumber()
    );
  });
});
