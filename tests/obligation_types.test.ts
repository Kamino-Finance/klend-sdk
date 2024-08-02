import { borrow, createMarketWithTwoReserves, deposit, newUser, reloadRefreshedMarket, round } from './setup_utils';
import Decimal from 'decimal.js';
import * as assert from 'assert';
import {
  LendingObligation,
  LeverageObligation,
  MultiplyObligation,
  PROGRAM_ID,
  VanillaObligation,
  sleep,
} from '../src';

describe('Obligation types tests', function () {
  it('Deposit multiple obligation types', async function () {
    const {
      env,
      kaminoMarket,
      firstMint: msolMint,
      secondMint: usdcMint,
    } = await createMarketWithTwoReserves('MSOL', 'USDC', false);
    const alice = await newUser(env, kaminoMarket, [
      ['MSOL', new Decimal(1000)],
      ['USDC', new Decimal(1000)],
    ]);
    const bob = await newUser(env, kaminoMarket, [
      ['MSOL', new Decimal(1000)],
      ['USDC', new Decimal(1000)],
    ]);

    await reloadRefreshedMarket(env, kaminoMarket);

    const msolPrice = kaminoMarket.getReserveByMint(msolMint)!.getReserveMarketPrice();
    const usdcPrice = kaminoMarket.getReserveByMint(usdcMint)!.getReserveMarketPrice();

    const p = PROGRAM_ID;
    const vanilla = new VanillaObligation(p);
    const lending = new LendingObligation(usdcMint, p);
    const multiply = new MultiplyObligation(msolMint, usdcMint, p);
    const leverage = new LeverageObligation(msolMint, usdcMint, p);
    // Alice
    await deposit(env, kaminoMarket, alice, 'MSOL', new Decimal(100), vanilla);
    await deposit(env, kaminoMarket, alice, 'USDC', new Decimal(50), vanilla);
    await deposit(env, kaminoMarket, alice, 'USDC', new Decimal(50), lending);
    await deposit(env, kaminoMarket, alice, 'MSOL', new Decimal(30), multiply);
    await deposit(env, kaminoMarket, alice, 'MSOL', new Decimal(31), leverage);

    await borrow(env, kaminoMarket, alice, 'USDC', new Decimal(5), false, vanilla);
    await borrow(env, kaminoMarket, alice, 'USDC', new Decimal(5), false, multiply);
    await borrow(env, kaminoMarket, alice, 'USDC', new Decimal(6), false, leverage);

    // Bob
    await deposit(env, kaminoMarket, bob, 'MSOL', new Decimal(11), vanilla);
    await deposit(env, kaminoMarket, bob, 'USDC', new Decimal(21), lending);
    await deposit(env, kaminoMarket, bob, 'MSOL', new Decimal(32), multiply);
    await deposit(env, kaminoMarket, bob, 'MSOL', new Decimal(33), leverage);

    await borrow(env, kaminoMarket, bob, 'USDC', new Decimal(5), false, vanilla);
    await borrow(env, kaminoMarket, bob, 'USDC', new Decimal(6), false, multiply);
    await borrow(env, kaminoMarket, bob, 'USDC', new Decimal(7), false, leverage);

    await sleep(2000);

    const expectedVanillaTvl =
      100 * msolPrice.toNumber() +
      50 * usdcPrice.toNumber() -
      5 * usdcPrice.toNumber() +
      11 * msolPrice.toNumber() -
      5 * usdcPrice.toNumber();
    const expectedLendingTvl = 50 * usdcPrice.toNumber() + 21 * usdcPrice.toNumber();
    const expectedMultiplyTvl =
      30 * msolPrice.toNumber() + 32 * msolPrice.toNumber() - 5 * usdcPrice.toNumber() - 6 * usdcPrice.toNumber();
    const expectedLeverageTvl =
      31 * msolPrice.toNumber() + 33 * msolPrice.toNumber() - 6 * usdcPrice.toNumber() - 7 * usdcPrice.toNumber();

    const vanillaTvl = await kaminoMarket.getTotalProductTvl(vanilla);
    const lendingTvl = await kaminoMarket.getTotalProductTvl(lending);
    const multiplyTvl = await kaminoMarket.getTotalProductTvl(multiply);
    const leverageTvl = await kaminoMarket.getTotalProductTvl(leverage);

    const precision = 5;
    assert.equal(round(vanillaTvl.tvl.toNumber(), precision), round(expectedVanillaTvl, precision));
    assert.equal(round(lendingTvl.tvl.toNumber(), precision), round(expectedLendingTvl, precision));
    assert.equal(round(multiplyTvl.tvl.toNumber(), precision), round(expectedMultiplyTvl, precision));
    assert.equal(round(leverageTvl.tvl.toNumber(), precision), round(expectedLeverageTvl, precision));
  });

  it('Estimate max leverage for eMode', async function () {
    const requestElevationGroup = true;
    const {
      env,
      kaminoMarket,
      firstMint: msolMint,
      secondMint: usdcMint,
    } = await createMarketWithTwoReserves('MSOL', 'USDC', requestElevationGroup);

    await reloadRefreshedMarket(env, kaminoMarket);

    const pairMaxLeverage = kaminoMarket.getMaxLeverageForPair(msolMint, usdcMint);

    console.log('Max Leverage ', pairMaxLeverage);

    const precision = 5;
    assert.equal(round(pairMaxLeverage, precision), 10); // Because eMode 95% LTV
  });

  it('Estimate max leverage no eMode', async function () {
    const requestElevationGroup = false;
    const {
      env,
      kaminoMarket,
      firstMint: msolMint,
      secondMint: usdcMint,
    } = await createMarketWithTwoReserves('MSOL', 'USDC', requestElevationGroup);

    await reloadRefreshedMarket(env, kaminoMarket);

    const pairMaxLeverage = kaminoMarket.getMaxLeverageForPair(msolMint, usdcMint);

    console.log('Max Leverage ', pairMaxLeverage);

    const precision = 5;
    assert.equal(round(pairMaxLeverage, precision), 4); // Because max LTV 75% LTV
  });

  it('Estimate max and liquidation ltv eMode', async function () {
    const requestElevationGroup = true;
    const { env, kaminoMarket } = await createMarketWithTwoReserves('USDH', 'USDC', requestElevationGroup);

    await reloadRefreshedMarket(env, kaminoMarket);

    const usdhMint = kaminoMarket.getReserveMintBySymbol('USDH')!;
    const usdcMint = kaminoMarket.getReserveMintBySymbol('USDC')!;

    const { maxLtv, liquidationLtv } = kaminoMarket.getMaxAndLiquidationLtvAndBorrowFactorForPair(usdhMint, usdcMint);

    console.log('Max Ltv ', maxLtv);
    console.log('Liquidation Ltv ', liquidationLtv);

    assert.equal(maxLtv, 0.9);
    assert.equal(liquidationLtv, 0.95);
  });

  it('Estimate max and liquidation ltv no eMode', async function () {
    const requestElevationGroup = false;
    const { env, kaminoMarket } = await createMarketWithTwoReserves('MSOL', 'USDC', requestElevationGroup);

    await reloadRefreshedMarket(env, kaminoMarket);

    const msolMint = kaminoMarket.getReserveMintBySymbol('MSOL')!;
    const usdcMint = kaminoMarket.getReserveMintBySymbol('USDC')!;

    const { maxLtv, liquidationLtv } = kaminoMarket.getMaxAndLiquidationLtvAndBorrowFactorForPair(msolMint, usdcMint);

    console.log('Max Ltv ', maxLtv);
    console.log('Liquidation Ltv ', liquidationLtv);

    assert.equal(maxLtv, 0.75);
    assert.equal(liquidationLtv, 0.85);
  });
});
