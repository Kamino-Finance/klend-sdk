import {
  balance,
  borrow,
  createMarketWithTwoReserves,
  createMarketWithTwoReservesToppedUp,
  deposit,
  newUser,
  swapLocal,
} from './setup_utils';
import Decimal from 'decimal.js';
import * as assert from 'assert';
import { MultiplyObligation, fuzzyEq, sleep } from '../src';

import {
  U64_MAX,
  getAdjustLeverageSwapInputs,
  getDepositWithLeverageSwapInputs,
  getWithdrawWithLeverageSwapInputs,
  toJson,
} from '../src/lib';
import {
  adjustLeverageTestAdapter,
  depositLeverageTestAdapter,
  getPriceMock,
  withdrawLeverageTestAdapter,
} from './leverage_utils';
import { assertSwapInputsMatch } from './assert';
import { lamportsToNumberDecimal } from '../src/classes/utils';
import { updateReserveSingleValue } from './setup_operations';
import { UpdateConfigMode } from '../src/idl_codegen/types';

// TODO: test with sol and wrapped sol
// - [x] test when the one of the tokens is 0 entirely
// - [x] test when either of the tokens is SOL and borrow/deposit is the other one, basically all 4 permutations
// - test when the user already has a wrapped sol account
// - test with farms

describe('Leverage SDK tests', function () {
  it('basics: set up market, deposit, borrow, swap', async function () {
    const {
      env,
      kaminoMarket,
      firstMint: msolMint,
      secondMint: usdcMint,
    } = await createMarketWithTwoReserves('MSOL', 'USDC', false);
    const whale = await newUser(env, kaminoMarket, [
      ['MSOL', new Decimal(20)],
      ['USDC', new Decimal(20)],
    ]);
    const borrower = await newUser(env, kaminoMarket, [
      ['MSOL', new Decimal(10)],
      ['USDC', new Decimal(10)],
    ]);

    // Top up reserves
    await deposit(env, kaminoMarket, whale, 'MSOL', new Decimal(10));
    await deposit(env, kaminoMarket, whale, 'USDC', new Decimal(10));

    // Borrower
    await deposit(env, kaminoMarket, borrower, 'MSOL', new Decimal(10));
    await borrow(env, kaminoMarket, borrower, 'USDC', new Decimal(10));

    {
      const usdcBalance = await balance(env, whale, kaminoMarket, 'USDC');
      const msolBalance = await balance(env, whale, kaminoMarket, 'MSOL');
      assert.equal(msolBalance, 10);
      assert.equal(usdcBalance, 10);
    }

    // Swap 10 msol to 20 usdc
    await swapLocal(env, new Decimal(5), new Decimal(20), msolMint, usdcMint, whale);

    {
      const usdcBalance = await balance(env, whale, kaminoMarket, 'USDC');
      const msolBalance = await balance(env, whale, kaminoMarket, 'MSOL');
      assert.equal(msolBalance, 5);
      assert.equal(usdcBalance, 30);
    }
  });

  it('basics: set up market, deposit, borrow, swap from and into SOL', async function () {
    const {
      env,
      kaminoMarket,
      firstMint: solMint,
      secondMint: usdcMint,
    } = await createMarketWithTwoReserves('SOL', 'USDC', false);

    const whale = await newUser(
      env,
      kaminoMarket,
      [
        ['SOL', new Decimal(20)],
        ['USDC', new Decimal(20)],
      ],
      null,
      true
    );

    {
      const usdcBalance = await balance(env, whale, kaminoMarket, 'USDC');
      const solBalance = await balance(env, whale, kaminoMarket, 'SOL', true);
      console.log('SOL BALANCE', solBalance);
      assert.equal(solBalance, 20);
      assert.equal(usdcBalance, 20);
    }

    // Swap 5 sol to 20 usdc
    await swapLocal(env, new Decimal(5), new Decimal(20), solMint, usdcMint, whale);

    {
      const solBalance = await balance(env, whale, kaminoMarket, 'SOL', true);
      const usdcBalance = await balance(env, whale, kaminoMarket, 'USDC');
      assert.equal(solBalance, 15);
      assert.equal(usdcBalance, 40);
    }

    console.log('Swapping back into SOL');
    await sleep(2000);

    // Swap 1 usdc to 1 sol
    await swapLocal(env, new Decimal(1), new Decimal(1), usdcMint, solMint, whale);

    {
      const solBalance = await balance(env, whale, kaminoMarket, 'SOL', true);
      const usdcBalance = await balance(env, whale, kaminoMarket, 'USDC');
      assert.equal(solBalance, 16);
      assert.equal(usdcBalance, 39);
    }
  });

  it('deposit first time with leverage debt token simple, non sol', async function () {
    const [collToken, debtToken] = ['MSOL', 'USDC'];
    const depositToken = debtToken;

    console.log('Setting up market ===');
    const { env, kaminoMarket } = await createMarketWithTwoReservesToppedUp(
      [collToken, new Decimal(1000.05)],
      [debtToken, new Decimal(1000.05)]
    );

    console.log('Creating user ===');
    const borrower = await newUser(env, kaminoMarket, [
      [collToken, new Decimal(10)],
      [debtToken, new Decimal(10)],
    ]);

    console.log('Depositing with leverage ===');
    await sleep(2000);
    await depositLeverageTestAdapter(
      env,
      borrower,
      kaminoMarket,
      depositToken,
      collToken,
      debtToken,
      new Decimal(5),
      new Decimal(3),
      0.01,
      (a: string, b: string) => getPriceMock(kaminoMarket, a, b)
    );

    const obligation = (await kaminoMarket.getUserObligationsByTag(MultiplyObligation.tag, borrower.publicKey))[0];
    const [leverage, ltv] = [obligation.refreshedStats.leverage, obligation.loanToValue()];

    console.log('leverage: ', leverage);
    console.log('ltv: ', ltv.toNumber());

    assert.ok(fuzzyEq(leverage, 3, 0.001));
  });

  it('deposit first time with leverage debt token simple, no balance other token, non sol', async function () {
    const [collToken, debtToken] = ['MSOL', 'USDC'];
    const depositToken = debtToken;

    console.log('Setting up market ===');
    const { env, kaminoMarket } = await createMarketWithTwoReservesToppedUp(
      [collToken, new Decimal(1000.05)],
      [debtToken, new Decimal(1000.05)]
    );

    console.log('Creating user ===');
    const borrower = await newUser(env, kaminoMarket, [
      [collToken, new Decimal(0)],
      [debtToken, new Decimal(10)],
    ]);

    console.log('Depositing with leverage ===');
    await sleep(2000);
    await depositLeverageTestAdapter(
      env,
      borrower,
      kaminoMarket,
      depositToken,
      collToken,
      debtToken,
      new Decimal(5),
      new Decimal(3),
      0.01,
      (a: string, b: string) => getPriceMock(kaminoMarket, a, b)
    );

    const obligation = (await kaminoMarket.getUserObligationsByTag(MultiplyObligation.tag, borrower.publicKey))[0];
    const [leverage, ltv] = [obligation.refreshedStats.leverage, obligation.loanToValue()];

    console.log('leverage: ', leverage);
    console.log('ltv: ', ltv.toNumber());

    assert.ok(fuzzyEq(leverage, 3, 0.001));
  });

  it('deposit first time with leverage debt token simple, no balance other token, sol', async function () {
    const [collToken, debtToken] = ['SOL', 'USDC'];
    const depositToken = debtToken;

    console.log('Setting up market ===');
    const { env, kaminoMarket } = await createMarketWithTwoReservesToppedUp(
      [collToken, new Decimal(1000.05)],
      [debtToken, new Decimal(1000.05)]
    );

    console.log('Creating user ===');
    const borrower = await newUser(env, kaminoMarket, [
      [collToken, new Decimal(0)],
      [debtToken, new Decimal(10)],
    ]);

    console.log('Depositing with leverage ===');
    await sleep(2000);
    await depositLeverageTestAdapter(
      env,
      borrower,
      kaminoMarket,
      depositToken,
      collToken,
      debtToken,
      new Decimal(5),
      new Decimal(3),
      0.01,
      (a: string, b: string) => getPriceMock(kaminoMarket, a, b)
    );

    const obligation = (await kaminoMarket.getUserObligationsByTag(MultiplyObligation.tag, borrower.publicKey))[0];
    const [leverage, ltv] = [obligation.refreshedStats.leverage, obligation.loanToValue()];

    console.log('leverage: ', leverage);
    console.log('ltv: ', ltv.toNumber());

    assert.ok(fuzzyEq(leverage, 3, 0.001));
  });

  it('deposit first time with leverage coll token simple, no balance other token, non sol', async function () {
    const [collToken, debtToken] = ['MSOL', 'USDC'];
    const depositToken = collToken;
    const depositAmount = new Decimal(5);
    const targetLeverage = new Decimal(3);
    const slippagePct = 0.01;

    console.log('Setting up market ===');
    const { env, kaminoMarket } = await createMarketWithTwoReservesToppedUp(
      [collToken, new Decimal(1000.05)],
      [debtToken, new Decimal(1000.05)]
    );

    console.log('Creating user ===');
    const borrower = await newUser(env, kaminoMarket, [
      [collToken, new Decimal(10)],
      [debtToken, new Decimal(0)],
    ]);

    console.log('Depositing with leverage ===');
    await sleep(2000);

    const collBalanceBeforeDeposit = await balance(env, borrower, kaminoMarket, collToken);
    const debtBalanceBeforeDeposit = await balance(env, borrower, kaminoMarket, debtToken);

    await depositLeverageTestAdapter(
      env,
      borrower,
      kaminoMarket,
      depositToken,
      collToken,
      debtToken,
      depositAmount,
      targetLeverage,
      slippagePct,
      (a: string, b: string) => getPriceMock(kaminoMarket, a, b)
    );

    await sleep(2000);

    const collBalanceAfterDeposit = await balance(env, borrower, kaminoMarket, collToken);
    const debtBalanceAfterDeposit = await balance(env, borrower, kaminoMarket, debtToken);

    const obligation = (await kaminoMarket.getUserObligationsByTag(MultiplyObligation.tag, borrower.publicKey))[0];
    const [leverage, ltv] = [obligation.refreshedStats.leverage, obligation.loanToValue()];

    console.log('leverage: ', leverage);
    console.log('ltv: ', ltv.toNumber());

    console.log(
      'Balances',
      toJson({
        collBalanceBeforeDeposit,
        collBalanceAfterDeposit,
        debtBalanceBeforeDeposit,
        debtBalanceAfterDeposit,
      })
    );

    assert.ok(fuzzyEq(leverage, 3, 0.001));
  });

  it('deposit first time with leverage coll token simple, no balance other token, sol', async function () {
    const [collToken, debtToken] = ['SOL', 'USDC'];
    const depositToken = collToken;
    const depositAmount = new Decimal(5);
    const targetLeverage = new Decimal(3);
    const slippagePct = 0.01;

    console.log('Setting up market ===');
    const { env, kaminoMarket } = await createMarketWithTwoReservesToppedUp(
      [collToken, new Decimal(1000.05)],
      [debtToken, new Decimal(1000.05)]
    );

    console.log('Creating user ===');
    const borrower = await newUser(env, kaminoMarket, [
      [collToken, new Decimal(10)],
      [debtToken, new Decimal(0)],
    ]);

    console.log('Depositing with leverage ===');
    await sleep(2000);

    const collBalanceBeforeDeposit = await balance(env, borrower, kaminoMarket, collToken);
    const debtBalanceBeforeDeposit = await balance(env, borrower, kaminoMarket, debtToken);

    await depositLeverageTestAdapter(
      env,
      borrower,
      kaminoMarket,
      depositToken,
      collToken,
      debtToken,
      depositAmount,
      targetLeverage,
      slippagePct,
      (a: string, b: string) => getPriceMock(kaminoMarket, a, b)
    );

    await sleep(2000);

    const collBalanceAfterDeposit = await balance(env, borrower, kaminoMarket, collToken);
    const debtBalanceAfterDeposit = await balance(env, borrower, kaminoMarket, debtToken);

    const obligation = (await kaminoMarket.getUserObligationsByTag(MultiplyObligation.tag, borrower.publicKey))[0];
    const [leverage, ltv] = [obligation.refreshedStats.leverage, obligation.loanToValue()];

    console.log('leverage: ', leverage);
    console.log('ltv: ', ltv.toNumber());

    console.log(
      'Balances',
      toJson({
        collBalanceBeforeDeposit,
        collBalanceAfterDeposit,
        debtBalanceBeforeDeposit,
        debtBalanceAfterDeposit,
      })
    );

    assert.ok(fuzzyEq(leverage, 3, 0.001));
  });

  it('deposit first time with leverage coll token simple, sol', async function () {
    const [collToken, debtToken] = ['SOL', 'USDC'];
    const depositToken = collToken;
    const depositAmount = new Decimal(5);
    const targetLeverage = new Decimal(3);
    const slippagePct = 0.01;

    console.log('Setting up market ===');
    const { env, kaminoMarket } = await createMarketWithTwoReservesToppedUp(
      [collToken, new Decimal(1000.05)],
      [debtToken, new Decimal(1000.05)]
    );

    console.log('Creating user ===');
    const borrower = await newUser(env, kaminoMarket, [
      [collToken, new Decimal(10)],
      [debtToken, new Decimal(10)],
    ]);

    await sleep(2000);
    const collBalanceBeforeDeposit = await balance(env, borrower, kaminoMarket, collToken);
    const debtBalanceBeforeDeposit = await balance(env, borrower, kaminoMarket, debtToken);

    console.log('Depositing with leverage ===');
    await sleep(2000);
    await depositLeverageTestAdapter(
      env,
      borrower,
      kaminoMarket,
      depositToken,
      collToken,
      debtToken,
      depositAmount,
      targetLeverage,
      slippagePct,
      (a: string, b: string) => getPriceMock(kaminoMarket, a, b)
    );

    await sleep(2000);

    const collBalanceAfterDeposit = await balance(env, borrower, kaminoMarket, collToken);
    const debtBalanceAfterDeposit = await balance(env, borrower, kaminoMarket, debtToken);

    const obligation = (await kaminoMarket.getUserObligationsByTag(MultiplyObligation.tag, borrower.publicKey))[0];
    const [leverage, ltv] = [obligation.refreshedStats.leverage, obligation.loanToValue()];

    console.log('leverage: ', leverage);
    console.log('ltv: ', ltv.toNumber());

    assert.ok(fuzzyEq(leverage, targetLeverage.toNumber(), 0.001));

    console.log(
      'Balances',
      toJson({
        collBalanceBeforeDeposit,
        debtBalanceBeforeDeposit,
        collBalanceAfterDeposit,
        debtBalanceAfterDeposit,
      })
    );

    assert.ok(fuzzyEq(debtBalanceAfterDeposit!, debtBalanceBeforeDeposit!));
    assert.ok(fuzzyEq(collBalanceAfterDeposit!, collBalanceBeforeDeposit! - depositAmount.toNumber(), 0.1));
  });

  it('deposit first time with leverage debt token simple, sol', async function () {
    const [collToken, debtToken] = ['SOL', 'USDC'];
    const depositToken = debtToken;
    const depositAmount = new Decimal(5);
    const targetLeverage = new Decimal(3);
    const slippagePct = 0.01;

    console.log('Setting up market ===');
    const { env, kaminoMarket } = await createMarketWithTwoReservesToppedUp(
      [collToken, new Decimal(1000.05)],
      [debtToken, new Decimal(1000.05)]
    );

    console.log('Creating user ===');
    const borrower = await newUser(env, kaminoMarket, [
      [collToken, new Decimal(10)],
      [debtToken, new Decimal(10)],
    ]);

    await sleep(2000);
    const collBalanceBeforeDeposit = await balance(env, borrower, kaminoMarket, collToken);
    const debtBalanceBeforeDeposit = await balance(env, borrower, kaminoMarket, debtToken);

    console.log('Depositing with leverage ===');
    await sleep(2000);
    await depositLeverageTestAdapter(
      env,
      borrower,
      kaminoMarket,
      depositToken,
      collToken,
      debtToken,
      depositAmount,
      targetLeverage,
      slippagePct,
      (a: string, b: string) => getPriceMock(kaminoMarket, a, b)
    );

    await sleep(2000);

    const collBalanceAfterDeposit = await balance(env, borrower, kaminoMarket, collToken);
    const debtBalanceAfterDeposit = await balance(env, borrower, kaminoMarket, debtToken);

    const obligation = (await kaminoMarket.getUserObligationsByTag(MultiplyObligation.tag, borrower.publicKey))[0];
    const [leverage, ltv] = [obligation.refreshedStats.leverage, obligation.loanToValue()];

    console.log('leverage: ', leverage);
    console.log('ltv: ', ltv.toNumber());

    assert.ok(fuzzyEq(leverage, targetLeverage.toNumber(), 0.001));

    console.log(
      'Balances',
      toJson({
        collBalanceBeforeDeposit,
        debtBalanceBeforeDeposit,
        collBalanceAfterDeposit,
        debtBalanceAfterDeposit,
        depositAmount,
      })
    );

    assert.ok(fuzzyEq(debtBalanceAfterDeposit!, debtBalanceBeforeDeposit! - depositAmount.toNumber()));
    assert.ok(fuzzyEq(collBalanceAfterDeposit!, collBalanceBeforeDeposit!, 0.1));
  });

  it('deposit first time with leverage coll token simple', async function () {
    const [collToken, debtToken] = ['MSOL', 'USDC'];
    const depositToken = collToken;

    console.log('Setting up market ===');
    const { env, kaminoMarket } = await createMarketWithTwoReservesToppedUp(
      [collToken, new Decimal(1000.05)],
      [debtToken, new Decimal(1000.05)]
    );

    console.log('Creating user ===');
    const borrower = await newUser(env, kaminoMarket, [
      [collToken, new Decimal(10)],
      [debtToken, new Decimal(10)],
    ]);

    console.log('Depositing with leverage ===');
    await depositLeverageTestAdapter(
      env,
      borrower,
      kaminoMarket,
      depositToken,
      collToken,
      debtToken,
      new Decimal(5),
      new Decimal(3),
      0.01,
      (a: string, b: string) => getPriceMock(kaminoMarket, a, b)
    );

    const obligation = (await kaminoMarket.getUserObligationsByTag(MultiplyObligation.tag, borrower.publicKey))[0];
    const [leverage, ltv] = [obligation.refreshedStats.leverage, obligation.loanToValue()];

    console.log('leverage: ', leverage);
    console.log('ltv: ', ltv.toNumber());

    assert.ok(fuzzyEq(leverage, 3, 0.001));
  });

  // TODO marius assert net value
  it('deposit first time with leverage debt token, deposit again same leverage', async function () {
    const [collToken, debtToken] = ['MSOL', 'USDC'];
    const depositToken = debtToken;
    const getPrice = (a: string, b: string) => getPriceMock(kaminoMarket, a, b);
    const slippagePct = 0.01;
    const [depositAmountFirst, depositAmountSecond] = [new Decimal(5), new Decimal(3)];
    const targetLeverage = new Decimal(3);

    console.log('Setting up market ===');
    const { env, kaminoMarket } = await createMarketWithTwoReservesToppedUp(
      [collToken, new Decimal(1000.05)],
      [debtToken, new Decimal(1000.05)]
    );

    console.log('Creating user ===');
    const borrower = await newUser(env, kaminoMarket, [
      [collToken, new Decimal(20)],
      [debtToken, new Decimal(20)],
    ]);

    const collBalanceBeforeDeposit = await balance(env, borrower, kaminoMarket, collToken);
    const debtBalanceBeforeDeposit = await balance(env, borrower, kaminoMarket, debtToken);

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
      getPrice
    );

    const obligation = (await kaminoMarket.getUserObligationsByTag(MultiplyObligation.tag, borrower.publicKey))[0];
    const [leverage, _ltv] = [obligation.refreshedStats.leverage, obligation.loanToValue()];
    assert.ok(fuzzyEq(leverage, 3, 0.001));

    await sleep(2000);

    const collBalanceAfterDeposit = await balance(env, borrower, kaminoMarket, collToken);
    const debtBalanceAfterDeposit = await balance(env, borrower, kaminoMarket, debtToken);

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
      getPrice
    );

    await sleep(2000);
    {
      const obligation = (await kaminoMarket.getUserObligationsByTag(MultiplyObligation.tag, borrower.publicKey))[0];
      console.log('obligation', obligation.refreshedStats);
      console.log('obligation leverage', obligation.refreshedStats.leverage);
      const [leverage, _ltv] = [obligation.refreshedStats.leverage, obligation.loanToValue()];
      assert.ok(fuzzyEq(leverage, targetLeverage.toNumber(), 0.01));
    }

    const collBalanceAfterSecondDeposit = await balance(env, borrower, kaminoMarket, collToken);
    const debtBalanceAfterSecondDeposit = await balance(env, borrower, kaminoMarket, debtToken);

    console.log(
      'Balances After deposit',
      toJson({
        collBalanceBeforeDeposit,
        debtBalanceBeforeDeposit,
        collBalanceAfterDeposit,
        debtBalanceAfterDeposit,
        collBalanceAfterSecondDeposit,
        debtBalanceAfterSecondDeposit,
      })
    );

    assert.ok(fuzzyEq(collBalanceAfterDeposit!, collBalanceBeforeDeposit!));
    assert.ok(fuzzyEq(debtBalanceAfterDeposit!, debtBalanceBeforeDeposit! - depositAmountFirst.toNumber()));
    assert.ok(fuzzyEq(collBalanceAfterSecondDeposit!, collBalanceBeforeDeposit!));
    assert.ok(
      fuzzyEq(
        debtBalanceAfterSecondDeposit!,
        debtBalanceBeforeDeposit! - depositAmountFirst.toNumber()! - depositAmountSecond.toNumber()!
      )
    );
  });

  it('deposit first time with leverage coll token, deposit again same leverage', async function () {
    const [collToken, debtToken] = ['MSOL', 'USDC'];
    const depositToken = collToken;
    const depositAmount = new Decimal(5);

    console.log('Setting up market ===');
    const { env, kaminoMarket } = await createMarketWithTwoReservesToppedUp(
      [collToken, new Decimal(1000.05)],
      [debtToken, new Decimal(1000.05)]
    );

    console.log('Creating user ===');
    const borrower = await newUser(env, kaminoMarket, [
      [collToken, new Decimal(20)],
      [debtToken, new Decimal(20)],
    ]);

    console.log('Depositing with leverage ===');
    await depositLeverageTestAdapter(
      env,
      borrower,
      kaminoMarket,
      depositToken,
      collToken,
      debtToken,
      depositAmount,
      new Decimal(3),
      0.01,
      (a: string, b: string) => getPriceMock(kaminoMarket, a, b)
    );

    const obligation = (await kaminoMarket.getUserObligationsByTag(MultiplyObligation.tag, borrower.publicKey))[0];
    const [leverage, ltv, netValue, totalBorrow, totalDeposit] = [
      obligation.refreshedStats.leverage,
      obligation.loanToValue(),
      obligation.refreshedStats.netAccountValue,
      obligation.refreshedStats.userTotalBorrow,
      obligation.refreshedStats.userTotalDeposit,
    ];

    const collPrice = await getPriceMock(kaminoMarket, collToken, 'USD');
    console.log('First time: leverage: ', leverage);
    console.log('First time: ltv: ', ltv.toNumber());
    console.log('First time: netValue: ', netValue);
    console.log('First time: totalBorrow: ', totalBorrow);
    console.log('First time: totalDeposit: ', totalDeposit);
    console.log('First time: netCalculated: ', depositAmount.mul(collPrice));

    console.log('First time: collPrice: ', collPrice);

    assert.ok(fuzzyEq(leverage, 3, 0.001));
    assert.ok(fuzzyEq(netValue, depositAmount.mul(collPrice), 0.1));

    await sleep(2000);

    await depositLeverageTestAdapter(
      env,
      borrower,
      kaminoMarket,
      depositToken,
      collToken,
      debtToken,
      new Decimal(5),
      new Decimal(leverage.toString()),
      0.01,
      (a: string, b: string) => getPriceMock(kaminoMarket, a, b)
    );

    {
      const obligation = (await kaminoMarket.getUserObligationsByTag(MultiplyObligation.tag, borrower.publicKey))[0];
      const [leverage, ltv] = [obligation.refreshedStats.leverage, obligation.loanToValue()];
      console.log('Second time leverage: ', leverage);
      console.log('Second time ltv: ', ltv.toNumber());
      assert.ok(fuzzyEq(leverage, 3, 0.001));
    }
  });

  // TODO test with more coll types, decimal variations
  it('deposit first time with leverage coll token, then withdraw, simple, non-sol', async function () {
    const [collToken, debtToken] = ['MSOL', 'USDC'];
    const [depositToken, withdrawToken] = [collToken, collToken];
    const slippagePct = 0.01;

    console.log('Setting up market ===');
    const { env, kaminoMarket } = await createMarketWithTwoReservesToppedUp(
      [collToken, new Decimal(1000.05)],
      [debtToken, new Decimal(1000.05)]
    );

    console.log('Creating user ===');
    const borrower = await newUser(env, kaminoMarket, [
      [collToken, new Decimal(20)],
      [debtToken, new Decimal(20)],
    ]);

    console.log('Depositing with leverage ===', depositToken);
    await depositLeverageTestAdapter(
      env,
      borrower,
      kaminoMarket,
      depositToken,
      collToken,
      debtToken,
      new Decimal(5),
      new Decimal(3),
      slippagePct,
      (a: string, b: string) => getPriceMock(kaminoMarket, a, b)
    );

    const obligation = (await kaminoMarket.getUserObligationsByTag(MultiplyObligation.tag, borrower.publicKey))[0];
    const [leverage, ltv, netValue] = [
      obligation.refreshedStats.leverage,
      obligation.loanToValue(),
      obligation.refreshedStats.netAccountValue,
    ];

    console.log('First time: leverage: ', leverage);
    console.log('First time: ltv: ', ltv.toNumber());
    console.log('First time: netValue: ', netValue);

    assert.ok(fuzzyEq(leverage, 3, 0.001));

    await sleep(2000);

    console.log('Withdrawing with leverage ===', withdrawToken);
    await withdrawLeverageTestAdapter(
      env,
      borrower,
      kaminoMarket,
      withdrawToken,
      collToken,
      debtToken,
      new Decimal(1),
      slippagePct,
      new Decimal(obligation.getDeposits()[0].amount),
      new Decimal(obligation.getBorrows()[0].amount),
      false,
      (a: string, b: string) => getPriceMock(kaminoMarket, a, b)
    );

    {
      const obligation = (await kaminoMarket.getUserObligationsByTag(MultiplyObligation.tag, borrower.publicKey))[0];
      const [leverage, ltv, netValue] = [
        obligation.refreshedStats.leverage,
        obligation.loanToValue(),
        obligation.refreshedStats.netAccountValue,
      ];
      console.log('Second time leverage: ', leverage);
      console.log('Second time ltv: ', ltv.toNumber());
      console.log('First time: netValue: ', netValue);
      assert.ok(fuzzyEq(leverage, 3, 0.001));
    }
  });

  it('deposit first time with leverage coll token, zero balance other, then withdraw, simple, sol', async function () {
    const [collToken, debtToken] = ['SOL', 'USDC'];
    const [depositToken, withdrawToken] = [collToken, collToken];
    const slippagePct = 0.01;
    const depositAmount = new Decimal(5);
    const targetLeverage = new Decimal(3);
    const withdrawAmount = new Decimal(1);

    console.log('Setting up market ===');
    const { env, kaminoMarket } = await createMarketWithTwoReservesToppedUp(
      [collToken, new Decimal(1000.05)],
      [debtToken, new Decimal(1000.05)]
    );

    console.log('Creating user ===');
    const borrower = await newUser(env, kaminoMarket, [
      [collToken, new Decimal(20)],
      [debtToken, new Decimal(0)],
    ]);

    await sleep(2000);

    const collBalanceBeforeDeposit = await balance(env, borrower, kaminoMarket, collToken);
    const debtBalanceBeforeDeposit = await balance(env, borrower, kaminoMarket, debtToken);

    console.log('Depositing with leverage ===', depositToken);
    await depositLeverageTestAdapter(
      env,
      borrower,
      kaminoMarket,
      depositToken,
      collToken,
      debtToken,
      depositAmount,
      targetLeverage,
      slippagePct,
      (a: string, b: string) => getPriceMock(kaminoMarket, a, b)
    );

    await sleep(2000);

    const obligation = (await kaminoMarket.getUserObligationsByTag(MultiplyObligation.tag, borrower.publicKey))[0];
    const [leverage, ltv, netValue] = [
      obligation.refreshedStats.leverage,
      obligation.loanToValue(),
      obligation.refreshedStats.netAccountValue,
    ];

    const collBalanceAfterDeposit = await balance(env, borrower, kaminoMarket, collToken);
    const debtBalanceAfterDeposit = await balance(env, borrower, kaminoMarket, debtToken);

    console.log('First time: leverage: ', leverage);
    console.log('First time: ltv: ', ltv.toNumber());
    console.log('First time: netValue: ', netValue);

    console.log(
      'Balances',
      toJson({
        collBalanceBeforeDeposit,
        debtBalanceBeforeDeposit,
        collBalanceAfterDeposit,
        debtBalanceAfterDeposit,
      })
    );

    assert.ok(fuzzyEq(leverage, 3, 0.001));

    console.log('Withdrawing with leverage ===', withdrawToken);
    await withdrawLeverageTestAdapter(
      env,
      borrower,
      kaminoMarket,
      withdrawToken,
      collToken,
      debtToken,
      withdrawAmount,
      slippagePct,
      new Decimal(obligation.getDeposits()[0].amount),
      new Decimal(obligation.getBorrows()[0].amount),
      false,
      (a: string, b: string) => getPriceMock(kaminoMarket, a, b)
    );

    await sleep(2000);
    {
      const obligation = (await kaminoMarket.getUserObligationsByTag(MultiplyObligation.tag, borrower.publicKey))[0];
      const [leverage, ltv, netValue] = [
        obligation.refreshedStats.leverage,
        obligation.loanToValue(),
        obligation.refreshedStats.netAccountValue,
      ];
      console.log('Second time leverage: ', leverage);
      console.log('Second time ltv: ', ltv.toNumber());
      console.log('First time: netValue: ', netValue);
      assert.ok(fuzzyEq(leverage, 3, 0.001));
    }

    const collBalanceAfterWithdraw = await balance(env, borrower, kaminoMarket, collToken);
    const debtBalanceAfterWithdraw = await balance(env, borrower, kaminoMarket, debtToken);

    console.log(
      'Balances',
      toJson({
        collBalanceBeforeDeposit,
        debtBalanceBeforeDeposit,
        collBalanceAfterDeposit,
        debtBalanceAfterDeposit,
        collBalanceAfterWithdraw,
        debtBalanceAfterWithdraw,
        withdrawAmount,
        diff: collBalanceAfterWithdraw! - withdrawAmount.toNumber(),
      })
    );

    assert.ok(fuzzyEq(collBalanceBeforeDeposit!, collBalanceAfterDeposit! + depositAmount.toNumber(), 0.5));
    assert.ok(fuzzyEq(debtBalanceBeforeDeposit!, debtBalanceAfterDeposit!, 0.001));
    assert.ok(fuzzyEq(collBalanceAfterDeposit!, collBalanceAfterWithdraw! - withdrawAmount.toNumber(), 0.1));
    assert.ok(fuzzyEq(debtBalanceAfterDeposit!, debtBalanceAfterWithdraw!, 0.001));
  });

  it('deposit first time with leverage debt token, then withdraw, non-sol', async function () {
    const [collToken, debtToken] = ['MSOL', 'USDC'];
    const [depositToken, withdrawToken] = [debtToken, debtToken];
    const slippagePct = 0.01;
    const depositAmount = new Decimal(5);
    const targetLeverage = new Decimal(3);
    const withdrawAmount = new Decimal(1);

    console.log('Setting up market ===');
    const { env, kaminoMarket } = await createMarketWithTwoReservesToppedUp(
      [collToken, new Decimal(1000.05)],
      [debtToken, new Decimal(1000.05)]
    );

    console.log('Creating user ===');
    const borrower = await newUser(env, kaminoMarket, [
      [collToken, new Decimal(20)],
      [debtToken, new Decimal(20)],
    ]);

    const collBalanceBeforeDeposit = await balance(env, borrower, kaminoMarket, collToken);
    const debtBalanceBeforeDeposit = await balance(env, borrower, kaminoMarket, debtToken);

    console.log('Depositing with leverage ===', depositToken);
    await depositLeverageTestAdapter(
      env,
      borrower,
      kaminoMarket,
      depositToken,
      collToken,
      debtToken,
      depositAmount,
      targetLeverage,
      slippagePct,
      (a: string, b: string) => getPriceMock(kaminoMarket, a, b)
    );

    await sleep(2000);

    const collBalanceAfterDeposit = await balance(env, borrower, kaminoMarket, collToken);
    const debtBalanceAfterDeposit = await balance(env, borrower, kaminoMarket, debtToken);

    assert.ok(fuzzyEq(collBalanceAfterDeposit!, collBalanceBeforeDeposit!));
    assert.ok(fuzzyEq(debtBalanceAfterDeposit!, debtBalanceBeforeDeposit! - depositAmount.toNumber()));

    const obligation = (await kaminoMarket.getUserObligationsByTag(MultiplyObligation.tag, borrower.publicKey))[0];
    const [leverage, ltv, netValue] = [
      obligation.refreshedStats.leverage,
      obligation.loanToValue(),
      obligation.refreshedStats.netAccountValue,
    ];

    console.log('First time: leverage: ', leverage);
    console.log('First time: ltv: ', ltv.toNumber());
    console.log('First time: netValue: ', netValue);

    assert.ok(fuzzyEq(leverage, 3, 0.001));

    await sleep(2000);

    console.log('Withdrawing with leverage ===', withdrawToken);
    await withdrawLeverageTestAdapter(
      env,
      borrower,
      kaminoMarket,
      withdrawToken,
      collToken,
      debtToken,
      withdrawAmount,
      slippagePct,
      new Decimal(obligation.getDeposits()[0].amount),
      new Decimal(obligation.getBorrows()[0].amount),
      false,
      (a: string, b: string) => getPriceMock(kaminoMarket, a, b)
    );

    await sleep(2000);

    const collBalanceAfterWithdraw = await balance(env, borrower, kaminoMarket, collToken);
    const debtBalanceAfterWithdraw = await balance(env, borrower, kaminoMarket, debtToken);

    {
      const obligation = (await kaminoMarket.getUserObligationsByTag(MultiplyObligation.tag, borrower.publicKey))[0];
      const [leverage, ltv, netValue] = [
        obligation.refreshedStats.leverage,
        obligation.loanToValue(),
        obligation.refreshedStats.netAccountValue,
      ];
      console.log('Second time leverage: ', leverage);
      console.log('Second time ltv: ', ltv.toNumber());
      console.log('First time: netValue: ', netValue);
      assert.ok(fuzzyEq(leverage, 3, 0.001));
    }

    console.log(
      'Balances',
      toJson({
        collBalanceBeforeDeposit,
        debtBalanceBeforeDeposit,
        collBalanceAfterDeposit,
        debtBalanceAfterDeposit,
        collBalanceAfterWithdraw,
        debtBalanceAfterWithdraw,
      })
    );

    assert.ok(fuzzyEq(collBalanceAfterWithdraw!, collBalanceAfterDeposit!));
    assert.ok(fuzzyEq(debtBalanceAfterWithdraw!, debtBalanceAfterDeposit! + withdrawAmount.toNumber(), 0.01));
  });

  it('short: deposit first time with leverage debt token, then withdraw, non-sol', async function () {
    const [collToken, debtToken] = ['USDC', 'SOL'];
    const [depositToken, withdrawToken] = [debtToken, debtToken];
    const slippagePct = 0.01;
    const depositAmount = new Decimal(5);
    const targetLeverage = new Decimal(3);
    const withdrawAmount = new Decimal(1);

    console.log('Setting up market ===');
    const { env, kaminoMarket } = await createMarketWithTwoReservesToppedUp(
      [collToken, new Decimal(1000.05)],
      [debtToken, new Decimal(1000.05)]
    );

    console.log('Creating user ===');
    const borrower = await newUser(env, kaminoMarket, [
      [collToken, new Decimal(0)],
      [debtToken, new Decimal(20)],
    ]);

    const collBalanceBeforeDeposit = await balance(env, borrower, kaminoMarket, collToken);
    const debtBalanceBeforeDeposit = await balance(env, borrower, kaminoMarket, debtToken);

    console.log('Depositing with leverage ===', depositToken);
    await depositLeverageTestAdapter(
      env,
      borrower,
      kaminoMarket,
      depositToken,
      collToken,
      debtToken,
      depositAmount,
      targetLeverage,
      slippagePct,
      (a: string, b: string) => getPriceMock(kaminoMarket, a, b)
    );

    await sleep(2000);

    const collBalanceAfterDeposit = await balance(env, borrower, kaminoMarket, collToken);
    const debtBalanceAfterDeposit = await balance(env, borrower, kaminoMarket, debtToken);

    console.log(
      'Balances',
      toJson({
        collBalanceBeforeDeposit,
        debtBalanceBeforeDeposit,
        collBalanceAfterDeposit,
        debtBalanceAfterDeposit,
        depositAmount,
      })
    );

    assert.ok(fuzzyEq(collBalanceAfterDeposit!, collBalanceBeforeDeposit!));
    assert.ok(fuzzyEq(debtBalanceAfterDeposit!, debtBalanceBeforeDeposit! - depositAmount.toNumber(), 0.5));

    const obligation = (await kaminoMarket.getUserObligationsByTag(MultiplyObligation.tag, borrower.publicKey))[0];
    const [leverage, ltv, netValue] = [
      obligation.refreshedStats.leverage,
      obligation.loanToValue(),
      obligation.refreshedStats.netAccountValue,
    ];

    console.log('First time: leverage: ', leverage);
    console.log('First time: ltv: ', ltv.toNumber());
    console.log('First time: netValue: ', netValue);

    assert.ok(fuzzyEq(leverage, 3, 0.001));

    await sleep(2000);

    console.log('Withdrawing with leverage ===', withdrawToken);
    const res = await withdrawLeverageTestAdapter(
      env,
      borrower,
      kaminoMarket,
      withdrawToken,
      collToken,
      debtToken,
      withdrawAmount,
      slippagePct,
      new Decimal(obligation.getDeposits()[0].amount),
      new Decimal(obligation.getBorrows()[0].amount),
      false,
      (a: string, b: string) => getPriceMock(kaminoMarket, a, b)
    );

    const currentSlot = await kaminoMarket.getConnection().getSlot();

    const swapInputsCalcs = getWithdrawWithLeverageSwapInputs({
      amount: withdrawAmount,
      deposited: lamportsToNumberDecimal(
        obligation.getDeposits()[0].amount,
        kaminoMarket.getReserveBySymbol(collToken)?.state.liquidity.mintDecimals.toNumber()!
      ),
      borrowed: lamportsToNumberDecimal(
        obligation.getBorrows()[0].amount,
        kaminoMarket.getReserveBySymbol(debtToken)?.state.liquidity.mintDecimals.toNumber()!
      ),
      priceCollToDebt: new Decimal(await getPriceMock(kaminoMarket, collToken, debtToken)),
      slippagePct,
      isClosingPosition: false,
      kaminoMarket,
      selectedTokenMint: kaminoMarket.getReserveBySymbol(withdrawToken)?.getLiquidityMint()!,
      debtTokenMint: kaminoMarket.getReserveBySymbol(debtToken)?.getLiquidityMint()!,
      collTokenMint: kaminoMarket.getReserveBySymbol(collToken)?.getLiquidityMint()!,
      userObligation: obligation,
      currentSlot,
    });

    assertSwapInputsMatch(swapInputsCalcs.swapInputs, res?.swapInputs!);

    await sleep(2000);

    const collBalanceAfterWithdraw = await balance(env, borrower, kaminoMarket, collToken);
    const debtBalanceAfterWithdraw = await balance(env, borrower, kaminoMarket, debtToken);

    {
      const obligation = (await kaminoMarket.getUserObligationsByTag(MultiplyObligation.tag, borrower.publicKey))[0];
      const [leverage, ltv, netValue] = [
        obligation.refreshedStats.leverage,
        obligation.loanToValue(),
        obligation.refreshedStats.netAccountValue,
      ];
      console.log('Second time leverage: ', leverage);
      console.log('Second time ltv: ', ltv.toNumber());
      console.log('First time: netValue: ', netValue);
      assert.ok(fuzzyEq(leverage, 3, 0.001));
    }

    console.log(
      'Balances',
      toJson({
        collBalanceBeforeDeposit,
        debtBalanceBeforeDeposit,
        collBalanceAfterDeposit,
        debtBalanceAfterDeposit,
        collBalanceAfterWithdraw,
        debtBalanceAfterWithdraw,
      })
    );

    assert.ok(fuzzyEq(collBalanceAfterWithdraw!, collBalanceAfterDeposit!));
    assert.ok(fuzzyEq(debtBalanceAfterWithdraw!, debtBalanceAfterDeposit! + withdrawAmount.toNumber(), 0.01));
  });

  it('deposit first time with leverage coll token, then close position', async function () {
    const [collToken, debtToken] = ['MSOL', 'USDC'];
    const [depositToken, withdrawToken] = [collToken, collToken];
    const slippagePct = 0.01;
    const closePosition = true;
    const depositAmount = new Decimal(5);
    const targetLeverage = new Decimal(3);

    console.log('Setting up market ===');
    const { env, kaminoMarket } = await createMarketWithTwoReservesToppedUp(
      [collToken, new Decimal(1000.05)],
      [debtToken, new Decimal(1000.05)]
    );

    console.log('Creating user ===');
    const borrower = await newUser(env, kaminoMarket, [
      [collToken, new Decimal(20)],
      [debtToken, new Decimal(20)],
    ]);

    const collBalanceBeforeDeposit = await balance(env, borrower, kaminoMarket, collToken);
    const debtBalanceBeforeDeposit = await balance(env, borrower, kaminoMarket, debtToken);

    console.log('Depositing with leverage ===', depositToken);
    await depositLeverageTestAdapter(
      env,
      borrower,
      kaminoMarket,
      depositToken,
      collToken,
      debtToken,
      depositAmount,
      targetLeverage,
      slippagePct,
      (a: string, b: string) => getPriceMock(kaminoMarket, a, b)
    );

    await sleep(2000);

    const obligation = (await kaminoMarket.getUserObligationsByTag(MultiplyObligation.tag, borrower.publicKey))[0];
    const [leverage, ltv, netValue] = [
      obligation.refreshedStats.leverage,
      obligation.loanToValue(),
      obligation.refreshedStats.netAccountValue,
    ];

    console.log('First time: leverage: ', leverage);
    console.log('First time: ltv: ', ltv.toNumber());
    console.log('First time: netValue: ', netValue);

    const collBalanceAfterDeposit = await balance(env, borrower, kaminoMarket, collToken);
    const debtBalanceAfterDeposit = await balance(env, borrower, kaminoMarket, debtToken);

    assert.ok(fuzzyEq(collBalanceAfterDeposit!, collBalanceBeforeDeposit! - depositAmount.toNumber()));
    assert.ok(fuzzyEq(debtBalanceBeforeDeposit!, debtBalanceAfterDeposit!));

    assert.ok(fuzzyEq(leverage, targetLeverage.toNumber(), 0.001));

    await sleep(2000);

    console.log('Withdrawing with leverage ===', withdrawToken);
    await withdrawLeverageTestAdapter(
      env,
      borrower,
      kaminoMarket,
      withdrawToken,
      collToken,
      debtToken,
      new Decimal(1),
      slippagePct,
      new Decimal(obligation.getDeposits()[0].amount),
      new Decimal(obligation.getBorrows()[0].amount),
      closePosition,
      (a: string, b: string) => getPriceMock(kaminoMarket, a, b)
    );

    {
      await sleep(2000);
      const obligation = (await kaminoMarket.getUserObligationsByTag(MultiplyObligation.tag, borrower.publicKey))[0];
      assert.ok(obligation === undefined);
    }

    const collBalanceAfterWithdraw = await balance(env, borrower, kaminoMarket, collToken);
    const debtBalanceAfterWithdraw = await balance(env, borrower, kaminoMarket, debtToken);

    console.log(
      'Balances',
      toJson({
        collBalanceBeforeDeposit,
        debtBalanceBeforeDeposit,
        collBalanceAfterDeposit,
        debtBalanceAfterDeposit,
        collBalanceAfterWithdraw,
        debtBalanceAfterWithdraw,
      })
    );

    assert.ok(fuzzyEq(collBalanceBeforeDeposit!, collBalanceAfterWithdraw!, 0.2));
    assert.ok(fuzzyEq(debtBalanceBeforeDeposit!, debtBalanceAfterWithdraw!, 0.2));
  });

  it('deposit first time with leverage coll token, sol, then close position', async function () {
    const [collToken, debtToken] = ['SOL', 'USDC'];
    const [depositToken, withdrawToken] = [collToken, collToken];
    const slippagePct = 0.01;
    const closePosition = true;
    const depositAmount = new Decimal(5);
    const targetLeverage = new Decimal(3);

    console.log('Setting up market ===');
    const { env, kaminoMarket } = await createMarketWithTwoReservesToppedUp(
      [collToken, new Decimal(1000.05)],
      [debtToken, new Decimal(1000.05)]
    );

    console.log('Creating user ===');
    const borrower = await newUser(env, kaminoMarket, [
      [collToken, new Decimal(20)],
      [debtToken, new Decimal(0)],
    ]);

    const collBalanceBeforeDeposit = await balance(env, borrower, kaminoMarket, collToken);
    const debtBalanceBeforeDeposit = await balance(env, borrower, kaminoMarket, debtToken);

    console.log('Depositing with leverage ===', depositToken);
    await depositLeverageTestAdapter(
      env,
      borrower,
      kaminoMarket,
      depositToken,
      collToken,
      debtToken,
      depositAmount,
      targetLeverage,
      slippagePct,
      (a: string, b: string) => getPriceMock(kaminoMarket, a, b)
    );

    await sleep(2000);

    const obligation = (await kaminoMarket.getUserObligationsByTag(MultiplyObligation.tag, borrower.publicKey))[0];
    const [leverage, ltv, netValue] = [
      obligation.refreshedStats.leverage,
      obligation.loanToValue(),
      obligation.refreshedStats.netAccountValue,
    ];

    console.log('First time: leverage: ', leverage);
    console.log('First time: ltv: ', ltv.toNumber());
    console.log('First time: netValue: ', netValue);

    const collBalanceAfterDeposit = await balance(env, borrower, kaminoMarket, collToken);
    const debtBalanceAfterDeposit = await balance(env, borrower, kaminoMarket, debtToken);

    console.log(
      'Balances',
      toJson({
        collBalanceBeforeDeposit,
        debtBalanceBeforeDeposit,
        collBalanceAfterDeposit,
        debtBalanceAfterDeposit,
        depositAmount,
        diff: collBalanceBeforeDeposit! - depositAmount.toNumber(),
      })
    );

    assert.ok(fuzzyEq(collBalanceAfterDeposit!, collBalanceBeforeDeposit! - depositAmount.toNumber(), 0.5));
    assert.ok(fuzzyEq(debtBalanceBeforeDeposit!, debtBalanceAfterDeposit!));

    assert.ok(fuzzyEq(leverage, targetLeverage.toNumber(), 0.001));

    await sleep(2000);

    console.log('Withdrawing with leverage ===', withdrawToken);
    await withdrawLeverageTestAdapter(
      env,
      borrower,
      kaminoMarket,
      withdrawToken,
      collToken,
      debtToken,
      new Decimal(1),
      slippagePct,
      new Decimal(obligation.getDeposits()[0].amount),
      new Decimal(obligation.getBorrows()[0].amount),
      closePosition,
      (a: string, b: string) => getPriceMock(kaminoMarket, a, b)
    );

    {
      await sleep(2000);
      const obligation = (await kaminoMarket.getUserObligationsByTag(MultiplyObligation.tag, borrower.publicKey))[0];
      assert.ok(obligation === undefined);
    }

    const collBalanceAfterWithdraw = await balance(env, borrower, kaminoMarket, collToken);
    const debtBalanceAfterWithdraw = await balance(env, borrower, kaminoMarket, debtToken);

    console.log(
      'Balances',
      toJson({
        collBalanceBeforeDeposit,
        debtBalanceBeforeDeposit,
        collBalanceAfterDeposit,
        debtBalanceAfterDeposit,
        collBalanceAfterWithdraw,
        debtBalanceAfterWithdraw,
      })
    );

    assert.ok(fuzzyEq(collBalanceBeforeDeposit!, collBalanceAfterWithdraw!, 0.03));

    // TODO we could improve the accuracy here
    assert.ok(fuzzyEq(debtBalanceBeforeDeposit!, debtBalanceAfterWithdraw!, 0.2));
  });

  it('deposit first time with leverage debt token, then adjust up, non-sol', async function () {
    const [collToken, debtToken] = ['MSOL', 'USDC'];
    const [depositToken, withdrawToken] = [debtToken, debtToken];
    const slippagePct = 0.01;
    const targetLeverage = new Decimal(2);
    const depositAmount = new Decimal(5);

    console.log('Setting up market ===');
    const { env, kaminoMarket } = await createMarketWithTwoReservesToppedUp(
      [collToken, new Decimal(1000.05)],
      [debtToken, new Decimal(1000.05)]
    );

    console.log('Creating user ===');
    const borrower = await newUser(env, kaminoMarket, [
      [collToken, new Decimal(20)],
      [debtToken, new Decimal(20)],
    ]);

    const collBalanceBeforeDeposit = await balance(env, borrower, kaminoMarket, collToken);
    const debtBalanceBeforeDeposit = await balance(env, borrower, kaminoMarket, debtToken);

    console.log('Depositing with leverage ===', depositToken);
    await depositLeverageTestAdapter(
      env,
      borrower,
      kaminoMarket,
      depositToken,
      collToken,
      debtToken,
      depositAmount,
      targetLeverage,
      slippagePct,
      (a: string, b: string) => getPriceMock(kaminoMarket, a, b)
    );

    await sleep(2000);

    const collBalanceAfterDeposit = await balance(env, borrower, kaminoMarket, collToken);
    const debtBalanceAfterDeposit = await balance(env, borrower, kaminoMarket, debtToken);

    const obligation = (await kaminoMarket.getUserObligationsByTag(MultiplyObligation.tag, borrower.publicKey))[0];
    const [initialLeverage, ltv, netValue] = [
      obligation.refreshedStats.leverage,
      obligation.loanToValue(),
      obligation.refreshedStats.netAccountValue,
    ];

    console.log('First time: leverage: ', initialLeverage);
    console.log('First time: ltv: ', ltv.toNumber());
    console.log('First time: netValue: ', netValue);

    assert.ok(fuzzyEq(initialLeverage, targetLeverage, 0.001));

    assert.equal(collBalanceAfterDeposit, collBalanceBeforeDeposit);
    assert.equal(debtBalanceAfterDeposit, debtBalanceBeforeDeposit! - depositAmount.toNumber());

    await sleep(2000);

    console.log('Adjusting with leverage up ===', withdrawToken);
    const res = await adjustLeverageTestAdapter(
      env,
      borrower,
      kaminoMarket,
      collToken,
      debtToken,
      slippagePct,
      obligation.getDeposits()[0].amount,
      obligation.getBorrows()[0].amount,
      initialLeverage.add(1),
      (a: string, b: string) => getPriceMock(kaminoMarket, a, b)
    );

    const swapInputsCalcs = getAdjustLeverageSwapInputs({
      deposited: lamportsToNumberDecimal(
        obligation.getDeposits()[0].amount,
        kaminoMarket.getReserveBySymbol(collToken)?.state.liquidity.mintDecimals.toNumber()!
      ),
      borrowed: lamportsToNumberDecimal(
        obligation.getBorrows()[0].amount,
        kaminoMarket.getReserveBySymbol(debtToken)?.state.liquidity.mintDecimals.toNumber()!
      ),
      priceCollToDebt: new Decimal(await getPriceMock(kaminoMarket, collToken, debtToken)),
      priceDebtToColl: new Decimal(await getPriceMock(kaminoMarket, debtToken, collToken)),
      slippagePct,
      targetLeverage: initialLeverage.add(1),
      kaminoMarket,
      debtTokenMint: kaminoMarket.getReserveBySymbol(debtToken)?.getLiquidityMint()!,
      collTokenMint: kaminoMarket.getReserveBySymbol(collToken)?.getLiquidityMint()!,
    });

    assertSwapInputsMatch(swapInputsCalcs.swapInputs, res?.swapInputs!);

    {
      const obligation = (await kaminoMarket.getUserObligationsByTag(MultiplyObligation.tag, borrower.publicKey))[0];
      const [leverage, ltv, netValue] = [
        obligation.refreshedStats.leverage,
        obligation.loanToValue(),
        obligation.refreshedStats.netAccountValue,
      ];
      console.log('Second time leverage: ', leverage);
      console.log('Second time ltv: ', ltv.toNumber());
      console.log('First time: netValue: ', netValue);
      assert.ok(fuzzyEq(leverage, initialLeverage.add(1), 0.001));
    }

    const collBalanceAfterLeverage = await balance(env, borrower, kaminoMarket, collToken);
    const debtBalanceAfterLeverage = await balance(env, borrower, kaminoMarket, debtToken);

    console.log(
      'Balances',
      toJson({
        collBalanceBeforeDeposit,
        debtBalanceBeforeDeposit,
        collBalanceAfterDeposit,
        debtBalanceAfterDeposit,
        collBalanceAfterLeverage,
        debtBalanceAfterLeverage,
      })
    );

    assert.ok(fuzzyEq(collBalanceAfterDeposit!, collBalanceAfterLeverage!));
    assert.ok(fuzzyEq(debtBalanceAfterDeposit!, debtBalanceAfterLeverage!));
  });

  it('deposit first time with leverage debt token, then adjust down, non-sol', async function () {
    const [collToken, debtToken] = ['MSOL', 'USDC'];
    const [depositToken, withdrawToken] = [debtToken, debtToken];
    const slippagePct = 0.01;
    const targetLeverage = new Decimal(3);
    const depositAmount = new Decimal(5);

    console.log('Setting up market ===');
    const { env, kaminoMarket } = await createMarketWithTwoReservesToppedUp(
      [collToken, new Decimal(1000.05)],
      [debtToken, new Decimal(1000.05)]
    );

    console.log('Creating user ===');
    const borrower = await newUser(env, kaminoMarket, [
      [collToken, new Decimal(20)],
      [debtToken, new Decimal(20)],
    ]);

    const collBalanceBeforeDeposit = await balance(env, borrower, kaminoMarket, collToken);
    const debtBalanceBeforeDeposit = await balance(env, borrower, kaminoMarket, debtToken);
    const debtPrice = await getPriceMock(kaminoMarket, debtToken, 'USD');

    console.log('Depositing with leverage ===', depositToken);
    await depositLeverageTestAdapter(
      env,
      borrower,
      kaminoMarket,
      depositToken,
      collToken,
      debtToken,
      depositAmount,
      targetLeverage,
      slippagePct,
      (a: string, b: string) => getPriceMock(kaminoMarket, a, b)
    );

    await sleep(2000);

    const collBalanceAfterDeposit = await balance(env, borrower, kaminoMarket, collToken);
    const debtBalanceAfterDeposit = await balance(env, borrower, kaminoMarket, debtToken);
    console.log(
      'Balances After deposit',
      toJson({
        collBalanceBeforeDeposit,
        debtBalanceBeforeDeposit,
        collBalanceAfterDeposit,
        debtBalanceAfterDeposit,
      })
    );

    assert.equal(collBalanceAfterDeposit, collBalanceBeforeDeposit);
    assert.equal(debtBalanceAfterDeposit, debtBalanceBeforeDeposit! - depositAmount.toNumber());

    const obligation = (await kaminoMarket.getUserObligationsByTag(MultiplyObligation.tag, borrower.publicKey))[0];
    const [initialLeverage, ltv, netValue] = [
      obligation.refreshedStats.leverage,
      obligation.loanToValue(),
      obligation.refreshedStats.netAccountValue,
    ];

    console.log('First time: leverage: ', initialLeverage);
    console.log('First time: ltv: ', ltv.toNumber());
    console.log('First time: netValue: ', netValue);
    console.log('First time: depositAmount.toNumber() * debtPrice: ', depositAmount.toNumber() * debtPrice);

    assert.ok(fuzzyEq(initialLeverage, targetLeverage.toNumber(), 0.001));
    assert.ok(fuzzyEq(netValue, depositAmount.toNumber() * debtPrice, 0.1));

    await sleep(2000);

    console.log('Adjusting with leverage down ===', withdrawToken);
    await adjustLeverageTestAdapter(
      env,
      borrower,
      kaminoMarket,
      collToken,
      debtToken,
      slippagePct,
      obligation.getDeposits()[0].amount,
      obligation.getBorrows()[0].amount,
      initialLeverage.sub(1),
      (a: string, b: string) => getPriceMock(kaminoMarket, a, b)
    );

    await sleep(2000);

    {
      const obligation = (await kaminoMarket.getUserObligationsByTag(MultiplyObligation.tag, borrower.publicKey))[0];
      const [leverage, ltv, netValue] = [
        obligation.refreshedStats.leverage,
        obligation.loanToValue(),
        obligation.refreshedStats.netAccountValue,
      ];
      console.log('Second time leverage: ', leverage);
      console.log('Second time ltv: ', ltv.toNumber());
      console.log('Second time: netValue: ', netValue);
      console.log('Second time: depositAmount.toNumber() * debtPrice: ', depositAmount.toNumber() * debtPrice);
      assert.ok(fuzzyEq(leverage, initialLeverage.sub(1), 0.001));
      assert.ok(fuzzyEq(netValue, depositAmount.toNumber() * debtPrice, 0.1));
    }

    const collBalanceAfterLeverage = await balance(env, borrower, kaminoMarket, collToken);
    const debtBalanceAfterLeverage = await balance(env, borrower, kaminoMarket, debtToken);

    console.log(
      'Balances',
      toJson({
        collBalanceBeforeDeposit,
        debtBalanceBeforeDeposit,
        collBalanceAfterDeposit,
        debtBalanceAfterDeposit,
        collBalanceAfterLeverage,
        debtBalanceAfterLeverage,
      })
    );

    assert.equal(collBalanceAfterDeposit, collBalanceAfterLeverage);
    assert.ok(fuzzyEq(debtBalanceAfterDeposit!, debtBalanceAfterLeverage!));
  });

  it('deposit first time with leverage coll token, then adjust up, sol', async function () {
    const [collToken, debtToken] = ['SOL', 'USDC'];
    const [depositToken, withdrawToken] = [collToken, collToken];
    const slippagePct = 0.01;
    const targetLeverage = new Decimal(2);
    const depositAmount = new Decimal(5);

    console.log('Setting up market ===');
    const { env, kaminoMarket } = await createMarketWithTwoReservesToppedUp(
      [collToken, new Decimal(1000.05)],
      [debtToken, new Decimal(1000.05)]
    );

    console.log('Creating user ===');
    const borrower = await newUser(env, kaminoMarket, [
      [collToken, new Decimal(20)],
      [debtToken, new Decimal(0)],
    ]);

    const collBalanceBeforeDeposit = await balance(env, borrower, kaminoMarket, collToken);
    const debtBalanceBeforeDeposit = await balance(env, borrower, kaminoMarket, debtToken);

    console.log('Depositing with leverage ===', depositToken);
    await depositLeverageTestAdapter(
      env,
      borrower,
      kaminoMarket,
      depositToken,
      collToken,
      debtToken,
      depositAmount,
      targetLeverage,
      slippagePct,
      (a: string, b: string) => getPriceMock(kaminoMarket, a, b)
    );

    await sleep(2000);

    const collBalanceAfterDeposit = await balance(env, borrower, kaminoMarket, collToken);
    const debtBalanceAfterDeposit = await balance(env, borrower, kaminoMarket, debtToken);

    const obligation = (await kaminoMarket.getUserObligationsByTag(MultiplyObligation.tag, borrower.publicKey))[0];
    const [initialLeverage, ltv, firstTimeNetValue] = [
      obligation.refreshedStats.leverage,
      obligation.loanToValue(),
      obligation.refreshedStats.netAccountValue,
    ];

    console.log('First time: leverage: ', initialLeverage);
    console.log('First time: ltv: ', ltv.toNumber());
    console.log('First time: netValue: ', firstTimeNetValue);
    console.log(
      'Balances',
      toJson({
        collBalanceBeforeDeposit,
        debtBalanceBeforeDeposit,
        collBalanceAfterDeposit,
        debtBalanceAfterDeposit,
        diff: collBalanceBeforeDeposit! - depositAmount.toNumber(),
      })
    );

    assert.ok(fuzzyEq(initialLeverage, targetLeverage, 0.001));
    assert.ok(fuzzyEq(collBalanceAfterDeposit!, collBalanceBeforeDeposit! - depositAmount.toNumber(), 0.1));
    assert.ok(fuzzyEq(debtBalanceAfterDeposit!, debtBalanceBeforeDeposit!));

    await sleep(2000);

    console.log('Adjusting with leverage up ===', withdrawToken);
    await adjustLeverageTestAdapter(
      env,
      borrower,
      kaminoMarket,
      collToken,
      debtToken,
      slippagePct,
      obligation.getDeposits()[0].amount,
      obligation.getBorrows()[0].amount,
      initialLeverage.add(1),
      (a: string, b: string) => getPriceMock(kaminoMarket, a, b)
    );

    const obligationReloaded = (
      await kaminoMarket.getUserObligationsByTag(MultiplyObligation.tag, borrower.publicKey)
    )[0];
    const [secondTimeLeverage, secondTimeLtv, secondTimeNetValue] = [
      obligationReloaded.refreshedStats.leverage,
      obligationReloaded.loanToValue(),
      obligationReloaded.refreshedStats.netAccountValue,
    ];
    console.log('Second time leverage: ', secondTimeLeverage);
    console.log('Second time ltv: ', secondTimeLtv.toNumber());
    console.log('Second time: netValue: ', secondTimeNetValue);
    console.log('Second time: netValueDiffs: ', firstTimeNetValue, secondTimeNetValue);

    assert.ok(fuzzyEq(secondTimeLeverage, initialLeverage.add(1), 0.001));
    assert.ok(fuzzyEq(firstTimeNetValue, secondTimeNetValue, 0.02));

    const collBalanceAfterLeverage = await balance(env, borrower, kaminoMarket, collToken);
    const debtBalanceAfterLeverage = await balance(env, borrower, kaminoMarket, debtToken);

    console.log(
      'Balances',
      toJson({
        collBalanceBeforeDeposit,
        debtBalanceBeforeDeposit,
        collBalanceAfterDeposit,
        debtBalanceAfterDeposit,
        collBalanceAfterLeverage,
        debtBalanceAfterLeverage,
      })
    );

    assert.ok(fuzzyEq(collBalanceAfterDeposit!, collBalanceAfterLeverage!));
    assert.ok(fuzzyEq(debtBalanceAfterDeposit!, debtBalanceAfterLeverage!));
  });

  it('deposit first time with leverage coll token, then adjust down, sol', async function () {
    const [collToken, debtToken] = ['SOL', 'USDC'];
    const [depositToken, withdrawToken] = [collToken, collToken];
    const slippagePct = 0.01;
    const targetLeverage = new Decimal(2);
    const depositAmount = new Decimal(5);

    console.log('Setting up market ===');
    const { env, kaminoMarket } = await createMarketWithTwoReservesToppedUp(
      [collToken, new Decimal(1000.05)],
      [debtToken, new Decimal(1000.05)]
    );

    console.log('Creating user ===');
    const borrower = await newUser(env, kaminoMarket, [
      [collToken, new Decimal(20)],
      [debtToken, new Decimal(0)],
    ]);

    const collBalanceBeforeDeposit = await balance(env, borrower, kaminoMarket, collToken);
    const debtBalanceBeforeDeposit = await balance(env, borrower, kaminoMarket, debtToken);

    console.log('Depositing with leverage ===', depositToken);
    const res = await depositLeverageTestAdapter(
      env,
      borrower,
      kaminoMarket,
      depositToken,
      collToken,
      debtToken,
      depositAmount,
      targetLeverage,
      slippagePct,
      (a: string, b: string) => getPriceMock(kaminoMarket, a, b)
    );

    await kaminoMarket.reload();

    const swapInputsCalcs = getDepositWithLeverageSwapInputs({
      depositAmount,
      priceDebtToColl: new Decimal(await getPriceMock(kaminoMarket, debtToken, collToken)),
      slippagePct: new Decimal(slippagePct),
      targetLeverage,
      kaminoMarket,
      selectedTokenMint: kaminoMarket.getReserveBySymbol(depositToken)?.getLiquidityMint()!,
      debtTokenMint: kaminoMarket.getReserveBySymbol(debtToken)?.getLiquidityMint()!,
      collTokenMint: kaminoMarket.getReserveBySymbol(collToken)?.getLiquidityMint()!,
    });

    assertSwapInputsMatch(swapInputsCalcs.swapInputs, res?.swapInputs!);

    await sleep(2000);

    const collBalanceAfterDeposit = await balance(env, borrower, kaminoMarket, collToken);
    const debtBalanceAfterDeposit = await balance(env, borrower, kaminoMarket, debtToken);

    const obligation = (await kaminoMarket.getUserObligationsByTag(MultiplyObligation.tag, borrower.publicKey))[0];
    const [initialLeverage, ltv, netValue] = [
      obligation.refreshedStats.leverage,
      obligation.loanToValue(),
      obligation.refreshedStats.netAccountValue,
    ];

    console.log('First time: leverage: ', initialLeverage);
    console.log('First time: ltv: ', ltv.toNumber());
    console.log('First time: netValue: ', netValue);
    console.log(
      'Balances',
      toJson({
        collBalanceBeforeDeposit,
        debtBalanceBeforeDeposit,
        collBalanceAfterDeposit,
        debtBalanceAfterDeposit,
        diff: collBalanceBeforeDeposit! - depositAmount.toNumber(),
      })
    );

    assert.ok(fuzzyEq(initialLeverage, targetLeverage, 0.001));

    assert.ok(fuzzyEq(collBalanceAfterDeposit!, collBalanceBeforeDeposit! - depositAmount.toNumber(), 0.1));
    assert.ok(fuzzyEq(debtBalanceAfterDeposit!, debtBalanceBeforeDeposit!));

    await sleep(2000);

    console.log('Adjusting with leverage down ===', withdrawToken);
    const resAdjustDown = await adjustLeverageTestAdapter(
      env,
      borrower,
      kaminoMarket,
      collToken,
      debtToken,
      slippagePct,
      obligation.getDeposits()[0].amount,
      obligation.getBorrows()[0].amount,
      initialLeverage.sub(1),
      (a: string, b: string) => getPriceMock(kaminoMarket, a, b)
    );

    const swapInputsCalcsAdjustDown = getAdjustLeverageSwapInputs({
      deposited: lamportsToNumberDecimal(
        obligation.getDeposits()[0].amount,
        kaminoMarket.getReserveBySymbol(collToken)?.state.liquidity.mintDecimals.toNumber()!
      ),
      borrowed: lamportsToNumberDecimal(
        obligation.getBorrows()[0].amount,
        kaminoMarket.getReserveBySymbol(debtToken)?.state.liquidity.mintDecimals.toNumber()!
      ),
      priceCollToDebt: new Decimal(await getPriceMock(kaminoMarket, collToken, debtToken)),
      priceDebtToColl: new Decimal(await getPriceMock(kaminoMarket, debtToken, collToken)),
      slippagePct,
      targetLeverage: initialLeverage.sub(1),
      kaminoMarket,
      debtTokenMint: kaminoMarket.getReserveBySymbol(debtToken)?.getLiquidityMint()!,
      collTokenMint: kaminoMarket.getReserveBySymbol(collToken)?.getLiquidityMint()!,
    });

    assertSwapInputsMatch(swapInputsCalcsAdjustDown.swapInputs, resAdjustDown?.swapInputs!);

    {
      const obligation = (await kaminoMarket.getUserObligationsByTag(MultiplyObligation.tag, borrower.publicKey))[0];
      const [leverage, ltv, netValue] = [
        obligation.refreshedStats.leverage,
        obligation.loanToValue(),
        obligation.refreshedStats.netAccountValue,
      ];
      console.log('Second time leverage: ', leverage);
      console.log('Second time ltv: ', ltv.toNumber());
      console.log('First time: netValue: ', netValue);
      assert.ok(fuzzyEq(leverage, initialLeverage.sub(1), 0.001));
    }

    const collBalanceAfterLeverage = await balance(env, borrower, kaminoMarket, collToken);
    const debtBalanceAfterLeverage = await balance(env, borrower, kaminoMarket, debtToken);

    console.log(
      'Balances',
      toJson({
        collBalanceBeforeDeposit,
        debtBalanceBeforeDeposit,
        collBalanceAfterDeposit,
        debtBalanceAfterDeposit,
        collBalanceAfterLeverage,
        debtBalanceAfterLeverage,
      })
    );

    assert.ok(fuzzyEq(collBalanceAfterDeposit!, collBalanceAfterLeverage!));
    assert.ok(fuzzyEq(debtBalanceAfterDeposit!, debtBalanceAfterLeverage!));
  });

  it('emode deposit first time with leverage coll token simple, no balance other token, non sol', async function () {
    const [collToken, debtToken] = ['MSOL', 'USDC'];
    const depositToken = collToken;
    const depositAmount = new Decimal(5);
    const targetLeverage = new Decimal(8);
    const slippagePct = 0.01;

    console.log('Setting up market ===');
    const requestElevationGroup = true;
    const { env, kaminoMarket } = await createMarketWithTwoReservesToppedUp(
      [collToken, new Decimal(1000.05)],
      [debtToken, new Decimal(1000.05)],
      requestElevationGroup
    );

    const collReserve = kaminoMarket.getReserveBySymbol(collToken);

    const buffer = Buffer.alloc(8 * 32);
    buffer.writeBigUint64LE(BigInt(U64_MAX), 0);

    await updateReserveSingleValue(
      env,
      collReserve!,
      buffer,
      UpdateConfigMode.UpdateBorrowLimitsInElevationGroupAgainstThisReserve.discriminator + 1 // discriminator + 1 matches the enum
    );

    console.log('Creating user ===');
    const borrower = await newUser(env, kaminoMarket, [
      [collToken, new Decimal(10)],
      [debtToken, new Decimal(0)],
    ]);

    console.log('Depositing with leverage ===');
    await sleep(2000);

    const collBalanceBeforeDeposit = await balance(env, borrower, kaminoMarket, collToken);
    const debtBalanceBeforeDeposit = await balance(env, borrower, kaminoMarket, debtToken);

    await depositLeverageTestAdapter(
      env,
      borrower,
      kaminoMarket,
      depositToken,
      collToken,
      debtToken,
      depositAmount,
      targetLeverage,
      slippagePct,
      (a: string, b: string) => getPriceMock(kaminoMarket, a, b)
    );

    await sleep(2000);

    const collBalanceAfterDeposit = await balance(env, borrower, kaminoMarket, collToken);
    const debtBalanceAfterDeposit = await balance(env, borrower, kaminoMarket, debtToken);

    const obligation = (await kaminoMarket.getUserObligationsByTag(MultiplyObligation.tag, borrower.publicKey))[0];
    const [leverage, ltv] = [obligation.refreshedStats.leverage, obligation.loanToValue()];

    console.log('leverage: ', leverage);
    console.log('ltv: ', ltv.toNumber());

    console.log(
      'Balances',
      toJson({
        collBalanceBeforeDeposit,
        collBalanceAfterDeposit,
        debtBalanceBeforeDeposit,
        debtBalanceAfterDeposit,
      })
    );

    assert.ok(fuzzyEq(leverage, targetLeverage.toNumber(), 0.006));
  });
});
