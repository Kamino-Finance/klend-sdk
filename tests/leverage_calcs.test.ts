import {
  FormTabs,
  toJson,
  calculateMultiplyEffects,
  depositLeverageKtokenCalcs,
  depositLeverageCalcs,
  PriceAinBProvider,
} from '../src/leverage';
import Decimal from 'decimal.js';
import { assert } from 'chai';

import {
  MSOL_MINT,
  SOL_MINT,
  TBTC_MINT,
  USDC_MINT,
  WSOL_MINT,
  getJupiterPrice,
  getPriceByTokenMintDecimal,
} from './leverage_utils';
import { Connection, Keypair, PublicKey } from '@solana/web3.js';
import { assertFuzzyEq } from './assert';
import { Kamino, StrategyWithAddress, TokenAmounts } from '@hubbleprotocol/kamino-sdk';
import { WhirlpoolStrategy } from '@hubbleprotocol/kamino-sdk/dist/kamino-client/accounts';
import { BN } from 'bn.js';
import { WhirlpoolStrategyFields } from '@hubbleprotocol/kamino-sdk/src/kamino-client/accounts/WhirlpoolStrategy';

describe('Leverage calculation tests', function () {
  it('calculate_given_deposit_and_leverage_in_debt_token', async function () {
    // Depositing 1 SOL, targeting 3x leverage
    // MSOL/SOL price = 30/25 = 1.2
    // 1 SOL deposit -> leverage 3 -> SOL collateral = 3 SOL
    // coll value = 3 SOL / 1.2 = 2.5 MSOL
    // net value = 1 SOL
    // debt value = 2 SOL

    const collTokenMint = MSOL_MINT;
    const debtTokenMint = SOL_MINT;
    const selectedTokenMint = debtTokenMint;

    const [deposited, borrowed] = [new Decimal(0), new Decimal(0)];
    const [depositAmount, withdrawAmount] = [new Decimal(1.0), new Decimal(0)];
    const targetLeverage = new Decimal(3);
    const priceCollToDebt = await getJupiterPrice(collTokenMint, debtTokenMint);
    const priceDebtToColl = await getJupiterPrice(debtTokenMint, collTokenMint);

    const res = await calculateMultiplyEffects(getPriceByTokenMintDecimal, {
      depositAmount,
      withdrawAmount,
      deposited,
      borrowed,
      debtTokenMint,
      selectedTokenMint,
      collTokenMint,
      targetLeverage,
      activeTab: FormTabs.deposit,
      flashBorrowReserveFlashLoanFeePercentage: new Decimal(0.0),
      debtBorrowFactorPct: new Decimal(100),
      priceCollToDebt,
      priceDebtToColl,
    });

    console.log('calculateMultiplyEffects: ', toJson(res));
    assert.equal(res.totalDeposited.toString(), '2.5');
    assert.equal(res.totalBorrowed.toString(), '2');
  });

  it('calculate_deposit_calcs_simple_token', async function () {
    const priceDebtToColl = new Decimal(0.8744719466019417);
    const res = depositLeverageCalcs({
      depositAmount: new Decimal(1),
      depositTokenIsCollToken: false,
      depositTokenIsSol: true,
      priceDebtToColl,
      targetLeverage: new Decimal(4.95),
      slippagePct: new Decimal(0.5),
      flashLoanFee: new Decimal(0.01),
    });

    const finalLeverage = new Decimal(1).div(
      new Decimal(1).minus(res.debtTokenToBorrow.mul(priceDebtToColl).div(res.collTokenToDeposit))
    );

    console.log('depositLeverageCalcs: ', toJson(res));
    console.log('Final leverage: ', finalLeverage.toString());

    assertFuzzyEq(finalLeverage, new Decimal(4.95));
  });

  it('calculate_deposit_calcs_sol', async function () {
    const priceDebtToColl = new Decimal(0.036301336599528215);
    const res = depositLeverageCalcs({
      depositAmount: new Decimal(5),
      depositTokenIsCollToken: true,
      depositTokenIsSol: true,
      priceDebtToColl,
      targetLeverage: new Decimal(3),
      slippagePct: new Decimal(0.0),
      flashLoanFee: new Decimal(0),
    });

    // Ops Calcs {
    //   "flashBorrowInCollToken": "5.000999900009999000099990000999900010003",
    //   "initDepositInSol": "5",
    //   "debtTokenToBorrow": "275.4719505322557058183323271399737363102",
    //   "collTokenToDeposit": "15",
    //   "swapDebtTokenIn": "275.4719505322557058183323271399737363102",
    //   "swapCollTokenExpectedOut": "9.999000099990000999900009999000099989997"
    // }

    const finalLeverage = new Decimal(1).div(
      new Decimal(1).minus(res.debtTokenToBorrow.mul(priceDebtToColl).div(res.collTokenToDeposit))
    );

    console.log('depositLeverageCalcs: ', toJson(res));
    console.log('Final leverage: ', finalLeverage.toString());

    assert.equal(
      res.swapCollTokenExpectedOut.toNumber() + res.initDepositInSol.toNumber(),
      res.collTokenToDeposit.toNumber()
    );

    assertFuzzyEq(finalLeverage, new Decimal(3));
  });

  it('calculate_deposit_calcs_debt_sol', async function () {
    const priceDebtToColl = new Decimal(0.036301336599528215);
    const res = depositLeverageCalcs({
      depositAmount: new Decimal(5),
      depositTokenIsCollToken: false,
      depositTokenIsSol: false,
      priceDebtToColl,
      targetLeverage: new Decimal(3),
      slippagePct: new Decimal(0.01),
      flashLoanFee: new Decimal(0),
    });

    // Ops Calcs {
    //   "flashBorrowInCollToken": "0.5443567419703321253623912826152154353691",
    //   "initDepositInSol": "0",
    //   "debtTokenToBorrow": "9.997000899730080975707287813655903229024",
    //   "collTokenToDeposit": "0.5443567419703321253623912826152154353691",
    //   "swapDebtTokenIn": "9.997000899730080975707287813655903229024",
    //   "swapCollTokenExpectedOut": "0.5443567419703321253623912826152154353691"
    // }

    const finalLeverage = new Decimal(1).div(
      new Decimal(1).minus(res.debtTokenToBorrow.mul(priceDebtToColl).div(res.collTokenToDeposit))
    );

    console.log('depositLeverageCalcs: ', toJson(res));
    console.log('Final leverage: ', finalLeverage.toString());

    assert.equal(
      res.swapCollTokenExpectedOut.toNumber() + res.initDepositInSol.toNumber(),
      res.collTokenToDeposit.toNumber()
    );

    assertFuzzyEq(finalLeverage, new Decimal(3));
  });

  it('calculate_leverage_sol_debt_deposit_simple', async function () {
    // kAB - 0 deposit collateral
    // A - 5 deposit debt
    // AtoKAB = 20
    // leverage = 5
    const slippage = 0.01;

    const { flashBorrowInCollToken, initDepositInSol, collTokenToDeposit, debtTokenToBorrow } = depositLeverageCalcs({
      depositAmount: new Decimal(5),
      depositTokenIsCollToken: false,
      depositTokenIsSol: true,
      priceDebtToColl: new Decimal(20),
      targetLeverage: new Decimal(5),
      slippagePct: new Decimal(slippage),
      flashLoanFee: new Decimal(0.01),
    });

    console.log(
      toJson({
        flashBorrowInCollToken,
        initDepositInSol,
        collTokenToDeposit,
        debtTokenToBorrow,
      })
    );

    assert.equal(initDepositInSol.toNumber(), 5);
    assertFuzzyEq(collTokenToDeposit.toNumber(), 475.96, 0.01);
    assertFuzzyEq(flashBorrowInCollToken.toNumber(), 480.72, 0.01);
    assertFuzzyEq(debtTokenToBorrow.toNumber(), 19.03, 0.01);
  });

  it('calculate_deposit_calcs_k_token', async function () {
    const priceDebtToColl = new Decimal(20);
    const res = await depositLeverageKtokenCalcs({
      depositAmount: new Decimal(1),
      depositTokenIsCollToken: false,
      depositTokenIsSol: true,
      priceDebtToColl,
      targetLeverage: new Decimal(4.95),
      slippagePct: new Decimal(0.5),
      flashLoanFee: new Decimal(0),
      ...strategyWithHoldings(new Decimal('40000'), new Decimal('1000'), new Decimal('20000')),
    });

    const finalLeverage = new Decimal(1).div(
      new Decimal(1).minus(res.debtTokenToBorrow.mul(priceDebtToColl).div(res.collTokenToDeposit))
    );

    console.log(`depositLeverageKtokenCalcs: ${toJson(res)}`);
    console.log('Final leverage: ', finalLeverage.toString());
    assertFuzzyEq(finalLeverage, new Decimal(4.95), 0.01);
  });

  it('calculate_given_deposit_and_leverage_in_coll_token', async function () {
    // Depositing 1 SOL, targeting 3x leverage
    // MSOL/SOL price = 30/25 = 1.2
    // 1 SOL deposit = 1/1.2 = 0.8333333333333334 MSOL deposit
    // leverage 3 -> SOL collateral = 3 SOL
    // coll value = 3 SOL / 1.2 = 2.5 MSOL
    // net value = 1 SOL
    // debt value = 2 SOL

    const collTokenMint = MSOL_MINT;
    const debtTokenMint = SOL_MINT;
    const selectedTokenMint = collTokenMint;

    const [deposited, borrowed] = [new Decimal(0), new Decimal(0)];
    const [depositAmount, withdrawAmount] = [new Decimal('0.8333333333333334'), new Decimal(0)];
    const targetLeverage = new Decimal(3);
    const priceCollToDebt = await getJupiterPrice(collTokenMint, debtTokenMint);
    const priceDebtToColl = await getJupiterPrice(debtTokenMint, collTokenMint);

    const res = await calculateMultiplyEffects(getPriceByTokenMintDecimal, {
      depositAmount,
      withdrawAmount,
      deposited,
      borrowed,
      debtTokenMint,
      selectedTokenMint,
      collTokenMint,
      targetLeverage,
      activeTab: FormTabs.deposit,
      flashBorrowReserveFlashLoanFeePercentage: new Decimal(0.0),
      debtBorrowFactorPct: new Decimal(100),
      priceCollToDebt,
      priceDebtToColl,
    });

    console.log('calculateMultiplyEffects: ', toJson(res));
    assert.equal(res.totalDeposited.toString(), '2.5');
    assert.equal(res.totalBorrowed.toString(), '2');
  });

  it('calculate_given_deposit_and_leverage_in_debt_token_with_existing_position', async function () {
    // MSOL/SOL price = 30/25 = 1.2
    // Existing position {coll: 25 MSOL (30 SOL), debt: 20 SOL}
    // Leverage is 3x
    // Net value: 10 SOL

    // Depositing 1 SOL, targeting 3x leverage
    // New net value: 11 SOL
    // New collateral value: 33 SOL; 33 / 1.2 = 27.5 MSOL
    // New debt value: 33 - 11 = 22 SOL

    const collTokenMint = MSOL_MINT;
    const debtTokenMint = SOL_MINT;
    const selectedTokenMint = debtTokenMint;

    const [deposited, borrowed] = [new Decimal('25.0'), new Decimal('20.0')];
    const [depositAmount, withdrawAmount] = [new Decimal('1.0'), new Decimal('0')];
    const targetLeverage = new Decimal('3');
    const priceCollToDebt = await getJupiterPrice(collTokenMint, debtTokenMint);
    const priceDebtToColl = await getJupiterPrice(debtTokenMint, collTokenMint);

    const res = await calculateMultiplyEffects(getPriceByTokenMintDecimal, {
      depositAmount,
      withdrawAmount,
      deposited,
      borrowed,
      debtTokenMint,
      selectedTokenMint,
      collTokenMint,
      targetLeverage,
      activeTab: FormTabs.deposit,
      flashBorrowReserveFlashLoanFeePercentage: new Decimal(0.0),
      debtBorrowFactorPct: new Decimal(100),
      priceCollToDebt,
      priceDebtToColl,
    });

    console.log('calculateMultiplyEffects: ', toJson(res));
    assertFuzzyEq(res.totalDeposited.toString(), '27.5');
    assertFuzzyEq(res.totalBorrowed.toString(), '22.0');
  });

  it('calculate_given_deposit_and_leverage_in_coll_token_with_existing_position', async function () {
    // MSOL/SOL price = 30/25 = 1.2
    // Existing position {coll: 25 MSOL (30 SOL), debt: 20 SOL}
    // Leverage is 3x
    // Net value: 10 SOL

    // Depositing 1 SOL, targeting 3x leverage
    // New net value: 11 SOL
    // New collateral value: 33 SOL; 33 / 1.2 = 27.5 MSOL
    // New debt value: 33 - 11 = 22 SOL

    const collTokenMint = MSOL_MINT;
    const debtTokenMint = SOL_MINT;
    const selectedTokenMint = collTokenMint;

    const [deposited, borrowed] = [new Decimal('25.0'), new Decimal('20.0')];
    const [depositAmount, withdrawAmount] = [new Decimal('0.8333333333333334'), new Decimal(0)];
    const targetLeverage = new Decimal('3');
    const priceCollToDebt = await getJupiterPrice(collTokenMint, debtTokenMint);
    const priceDebtToColl = await getJupiterPrice(debtTokenMint, collTokenMint);

    const res = await calculateMultiplyEffects(getPriceByTokenMintDecimal, {
      depositAmount,
      withdrawAmount,
      deposited,
      borrowed,
      debtTokenMint,
      selectedTokenMint,
      collTokenMint,
      targetLeverage,
      activeTab: FormTabs.deposit,
      flashBorrowReserveFlashLoanFeePercentage: new Decimal(0.0),
      debtBorrowFactorPct: new Decimal(100),
      priceCollToDebt,
      priceDebtToColl,
    });

    console.log('calculateMultiplyEffects: ', toJson(res));
    assertFuzzyEq(res.totalDeposited.toString(), '27.5');
    assertFuzzyEq(res.totalBorrowed.toString(), '22.0');
  });

  it('calculate_given_withdraw_and_leverage_in_debt_token', async function () {
    // MSOL/SOL: 1.2
    // Net value: 10 SOL
    // Leverage: 5x
    // Collateral value: 50 SOL; 50 / 1.2 = 41.66666666666667 MSOL
    // Debt value: 40 SOL

    // Withdrawing 1 SOL, targeting same (5x) leverage
    // Net value drops by 1 SOL = 9 SOL
    // Therefore:
    // Collateral value: 45 SOL; 45 / 1.2 = 37.5 MSOL
    // Debt value: 45 - 9 = 36 SOL

    const collTokenMint = MSOL_MINT;
    const debtTokenMint = SOL_MINT;
    const selectedTokenMint = debtTokenMint;

    const [deposited, borrowed] = [new Decimal('41.66666666666667'), new Decimal('40')];
    const [depositAmount, withdrawAmount] = [new Decimal('0'), new Decimal('1')];
    const targetLeverage = new Decimal('5');
    const priceCollToDebt = await getJupiterPrice(collTokenMint, debtTokenMint);
    const priceDebtToColl = await getJupiterPrice(debtTokenMint, collTokenMint);

    const res = await calculateMultiplyEffects(getPriceByTokenMintDecimal, {
      depositAmount,
      withdrawAmount,
      deposited,
      borrowed,
      debtTokenMint,
      selectedTokenMint,
      collTokenMint,
      targetLeverage,
      activeTab: FormTabs.withdraw,
      flashBorrowReserveFlashLoanFeePercentage: new Decimal(0.0),
      debtBorrowFactorPct: new Decimal(100),
      priceCollToDebt,
      priceDebtToColl,
    });

    console.log('calculateMultiplyEffects: ', toJson(res));
    assertFuzzyEq(res.totalDeposited, new Decimal('37.5'));
    assertFuzzyEq(res.totalBorrowed.toString(), new Decimal('36.0'));
  });

  it('calculate_given_withdraw_and_leverage_in_coll_token', async function () {
    // MSOL/SOL: 1.2
    // Net value: 10 SOL
    // Leverage: 5x
    // Collateral value: 50 SOL; 50 / 1.2 = 41.66666666666667 MSOL
    // Debt value: 40 SOL

    // Withdrawing 1 SOL = 1 / 1.2 = 0.8333333333333334 MSOL, targeting same (5x) leverage
    // Net value drops by 1 SOL = 9 SOL
    // Therefore:
    // Collateral value: 45 SOL; 45 / 1.2 = 37.5 MSOL
    // Debt value: 45 - 9 = 36 SOL

    const collTokenMint = MSOL_MINT;
    const debtTokenMint = SOL_MINT;
    const selectedTokenMint = collTokenMint;

    const [deposited, borrowed] = [new Decimal('41.66666666666667'), new Decimal('40')];
    const [depositAmount, withdrawAmount] = [new Decimal('0'), new Decimal('0.8333333333333334')];
    const targetLeverage = new Decimal('5');
    const priceCollToDebt = await getJupiterPrice(collTokenMint, debtTokenMint);
    const priceDebtToColl = await getJupiterPrice(debtTokenMint, collTokenMint);

    const res = await calculateMultiplyEffects(getPriceByTokenMintDecimal, {
      depositAmount,
      withdrawAmount,
      deposited,
      borrowed,
      debtTokenMint,
      selectedTokenMint,
      collTokenMint,
      targetLeverage,
      activeTab: FormTabs.withdraw,
      flashBorrowReserveFlashLoanFeePercentage: new Decimal(0.0),
      debtBorrowFactorPct: new Decimal(100),
      priceCollToDebt,
      priceDebtToColl,
    });

    console.log('calculateMultiplyEffects: ', toJson(res));
    assertFuzzyEq(res.totalDeposited, new Decimal('37.5'));
    assertFuzzyEq(res.totalBorrowed.toString(), new Decimal('36.0'));
  });

  // TODO: marius test deposit when existing position also

  it('calculate_given_adjust_and_net_value', async function () {
    // MSOL/SOL: 1.2
    // Net value: 10 SOL
    // Leverage: 5x
    // Collateral value: 50 SOL; 50 / 1.2 = 41.66666666666667 MSOL
    // Debt value: 40 SOL

    // Targeting 3x leverage instead
    // Net value: 10 SOL
    // Collateral value: 30 SOL; 30 / 1.2 = 25 MSOL -> diff = 41.66666666666667 - 25 = 16.66666666666667 MSOL
    // Debt value: 30 - 10 = 20 SOL                 -> diff = 40 - 20 = 20 SOL

    const collTokenMint = MSOL_MINT;
    const debtTokenMint = SOL_MINT;
    const selectedTokenMint = collTokenMint;

    const [deposited, borrowed] = [new Decimal('41.66666666666667'), new Decimal('40')];
    const [depositAmount, withdrawAmount] = [new Decimal('0'), new Decimal('0.0')];
    const targetLeverage = new Decimal('3');
    const priceCollToDebt = await getJupiterPrice(collTokenMint, debtTokenMint);
    const priceDebtToColl = await getJupiterPrice(debtTokenMint, collTokenMint);

    const res = await calculateMultiplyEffects(getPriceByTokenMintDecimal, {
      depositAmount,
      withdrawAmount,
      deposited,
      borrowed,
      debtTokenMint,
      selectedTokenMint,
      collTokenMint,
      targetLeverage,
      activeTab: FormTabs.adjust,
      flashBorrowReserveFlashLoanFeePercentage: new Decimal(0.0),
      debtBorrowFactorPct: new Decimal(100),
      priceCollToDebt,
      priceDebtToColl,
    });

    console.log('calculateMultiplyEffects: ', toJson(res));
    assertFuzzyEq(res.totalDeposited, new Decimal('25'));
    assertFuzzyEq(res.totalBorrowed.toString(), new Decimal('20'));
  });

  it('calculate_given_withdraw_and_net_value_significant_decimals_tBTC', async function () {
    const collTokenMint = TBTC_MINT;
    const debtTokenMint = SOL_MINT;
    const selectedTokenMint = debtTokenMint;

    const [deposited, borrowed] = [new Decimal('0.00005008'), new Decimal('0.02')];
    const [depositAmount, withdrawAmount] = [new Decimal('0'), new Decimal('0.0')];
    const targetLeverage = new Decimal('3');
    const priceCollToDebt = await getJupiterPrice(collTokenMint, debtTokenMint);
    const priceDebtToColl = await getJupiterPrice(debtTokenMint, collTokenMint);

    const res = await calculateMultiplyEffects(getPriceByTokenMintDecimal, {
      depositAmount,
      withdrawAmount,
      deposited,
      borrowed,
      debtTokenMint,
      selectedTokenMint,
      collTokenMint,
      targetLeverage,
      activeTab: FormTabs.withdraw,
      flashBorrowReserveFlashLoanFeePercentage: new Decimal(0.0),
      debtBorrowFactorPct: new Decimal(100),
      priceCollToDebt,
      priceDebtToColl,
    });

    console.log('calculateMultiplyEffects: ', toJson(res));
    assert.ok(res.totalDeposited.gt(new Decimal('0')));
    assert.ok(res.netValue.gt(new Decimal('0')));
  });

  it('calculate_given_adjust_and_net_value_mainnet', async function () {
    // MSOL/SOL: 1.12
    // Net value: 3.88 SOL
    // Leverage: 3.09x
    // Collateral value: 3.88 * 3.09 = 11.99 SOL -> 11.99 / 1.12 = 10.71 MSOL
    // Debt value: 11.99 - 3.88 = 8.11 SOL

    // Targeting 2x leverage instead
    // Net value: 3.88 SOL

    // Collateral: 3.88 * 2 = 7.76 sol -> 7.76 / 1.12 = 6.93 MSOL
    // Net value: 3.88 SOL
    // Debt value: 7.76 - 3.88 = 3.88 SOL
    // Leverage: 7.76 / 3.88 = 2

    // Adjustments: 10.71 - 6.93 = 3.780000000000001 MSOL gone (withdraw)
    // Adjustments: 8.11 - 3.88 = 4.23 SOL gone (repay)
    // Rate: 4.23 / 3.78 = 1.1190476190476193

    const getPriceToUsd = async (tokenMint: PublicKey | string): Promise<Decimal> => {
      if (tokenMint.toString() === SOL_MINT.toString()) {
        return Promise.resolve(new Decimal(25.26));
      }
      if (tokenMint.toString() === WSOL_MINT.toString()) {
        return Promise.resolve(new Decimal(25.26));
      }
      if (tokenMint.toString() === MSOL_MINT.toString()) {
        return Promise.resolve(new Decimal(28.41));
      }
      if (tokenMint.toString() === USDC_MINT.toString()) {
        return Promise.resolve(new Decimal(1.0));
      }

      throw new Error('Invalid token mint');
    };

    const collTokenMint = MSOL_MINT;
    const debtTokenMint = SOL_MINT;
    const selectedTokenMint = collTokenMint;

    const [deposited, borrowed] = [new Decimal('10.68'), new Decimal('8.12')];
    const [depositAmount, withdrawAmount] = [new Decimal('0'), new Decimal('0.0')];
    const targetLeverage = new Decimal('2');
    const priceCollToDebt = await getJupiterPrice(collTokenMint, debtTokenMint, getPriceToUsd);
    const priceDebtToColl = await getJupiterPrice(debtTokenMint, collTokenMint);

    const res = await calculateMultiplyEffects(getPriceToUsd, {
      depositAmount,
      withdrawAmount,
      deposited,
      borrowed,
      debtTokenMint,
      selectedTokenMint,
      collTokenMint,
      targetLeverage,
      activeTab: FormTabs.adjust,
      flashBorrowReserveFlashLoanFeePercentage: new Decimal(0.0),
      debtBorrowFactorPct: new Decimal(100),
      priceCollToDebt,
      priceDebtToColl,
    });

    console.log('calculateMultiplyEffects: ', toJson(res));
    assertFuzzyEq(res.totalDeposited, new Decimal('6.9206335797254487854'));
    assertFuzzyEq(res.totalBorrowed.toString(), new Decimal('3.8918289786223277908'));
  });

  it('calculate_leverage_ktoken_deposits_non_sol_deposit_coll', async function () {
    // kAB - 100 deposit collateral
    // A - debt
    // AtoKAB = 20
    // leverage = 5
    const slippage = 0.01;

    const { flashBorrowInDebtToken, initDepositInSol, collTokenToDeposit, debtTokenToBorrow } =
      await depositLeverageKtokenCalcs({
        depositAmount: new Decimal(100),
        depositTokenIsCollToken: true,
        depositTokenIsSol: false,
        priceDebtToColl: new Decimal(20),
        targetLeverage: new Decimal(5),
        slippagePct: new Decimal(slippage),
        flashLoanFee: new Decimal(0.01),
        ...strategyWithHoldings(new Decimal('2000'), new Decimal('2000'), new Decimal('100')),
      });

    console.log(
      toJson({
        flashBorrowInDebtToken,
        initDepositInSol,
        collTokenToDeposit,
        debtTokenToBorrow,
      })
    );

    assertFuzzyEq(collTokenToDeposit.toNumber(), 480.76, slippage);
    assertFuzzyEq(flashBorrowInDebtToken.toNumber(), 19.04, slippage);
    assertFuzzyEq(debtTokenToBorrow.toNumber(), 19.23, slippage);
  });

  it('calculate_leverage_ktoken_deposits_sol_deposit_debt', async function () {
    // kAB - 0 deposit collateral
    // A - 5 deposit debt
    // AtoKAB = 20
    // leverage = 5
    const slippage = 0.01;

    const { flashBorrowInDebtToken, initDepositInSol, collTokenToDeposit, debtTokenToBorrow } =
      await depositLeverageKtokenCalcs({
        depositAmount: new Decimal(5),
        depositTokenIsCollToken: false,
        depositTokenIsSol: true,
        priceDebtToColl: new Decimal(20),
        targetLeverage: new Decimal(5),
        slippagePct: new Decimal(slippage),
        flashLoanFee: new Decimal(0.01),
        ...strategyWithHoldings(new Decimal('4000'), new Decimal('100'), new Decimal('2000')),
      });

    console.log(
      toJson({
        flashBorrowInDebtToken,
        initDepositInSol,
        collTokenToDeposit,
        debtTokenToBorrow,
      })
    );

    assert.equal(initDepositInSol.toNumber(), 5);
    assertFuzzyEq(collTokenToDeposit.toNumber(), 475.96, 0.01);
    assertFuzzyEq(flashBorrowInDebtToken.toNumber(), 18.99, 0.01);
    assertFuzzyEq(debtTokenToBorrow.toNumber(), 19.18, 0.01);
  });

  it('calculate_leverage_ktoken_deposits_non_sol_deposit_debt', async function () {
    // kAB - 0 deposit collateral
    // A - 5 deposit debt
    // AtoKAB = 20
    // leverage = 5
    const slippage = 0.01;

    const { flashBorrowInDebtToken, initDepositInSol, collTokenToDeposit, debtTokenToBorrow } =
      await depositLeverageKtokenCalcs({
        depositAmount: new Decimal(5),
        depositTokenIsCollToken: false,
        depositTokenIsSol: false,
        priceDebtToColl: new Decimal(20),
        targetLeverage: new Decimal(5),
        slippagePct: new Decimal(slippage),
        flashLoanFee: new Decimal(0.01),
        ...strategyWithHoldings(new Decimal('4000'), new Decimal('100'), new Decimal('2000')),
      });

    console.log(
      toJson({
        flashBorrowInDebtToken,
        initDepositInSol,
        collTokenToDeposit,
        debtTokenToBorrow,
      })
    );

    assert.equal(initDepositInSol.toNumber(), 0);
    assertFuzzyEq(collTokenToDeposit.toNumber(), 475.96, 0.01);
    assertFuzzyEq(flashBorrowInDebtToken.toNumber(), 18.99, 0.01);
    assertFuzzyEq(debtTokenToBorrow.toNumber(), 19.18, 0.01);
  });
});

// describe('calcAdjustAmounts', () => {
//   test('adjust leverage from 2 to 3', () => {
//     const currentDepositPosition = new Decimal(100);
//     const currentBorrowPosition = new Decimal(55);
//     const params: AdjustLeverageParams = {
//       targetLeverage: 3,
//       currentDepositPosition: currentDepositPosition,
//       currentBorrowPosition: currentBorrowPosition,
//       priceCollToDebt: 1.1,
//     };
//     const result = calcAdjustAmounts(params);

//     const totalDeposit = currentDepositPosition.add(result.adjustDepositPosition);
//     const totalBorrow = currentBorrowPosition.add(result.adjustBorrowPosition);
//     const ltv = totalBorrow.div(totalDeposit.mul(params.priceCollToDebt));
//     expect(calcLeverageFromLtv(ltv.toNumber())).toBeCloseTo(params.targetLeverage);
//   });

//   test('adjust leverage from 2 to 1.5', () => {
//     const currentDepositPosition = new Decimal(100);
//     const currentBorrowPosition = new Decimal(55);
//     const params: AdjustLeverageParams = {
//       targetLeverage: 1.5,
//       currentDepositPosition: currentDepositPosition,
//       currentBorrowPosition: currentBorrowPosition,
//       priceCollToDebt: 1.1,
//     };
//     const result = calcAdjustAmounts(params);

//     const totalDeposit = currentDepositPosition.add(result.adjustDepositPosition);
//     const totalBorrow = currentBorrowPosition.add(result.adjustBorrowPosition);
//     const ltv = totalBorrow.div(totalDeposit.mul(params.priceCollToDebt));
//     expect(calcLeverageFromLtv(ltv.toNumber())).toBeCloseTo(params.targetLeverage);
//   });
// });

// describe('calcWithdrawBorrowTokenAmount', () => {
//   test('calculate tokenB repayment with LTV 0.5', () => {
//     const deposited = 100;
//     const borrowed = 55;

//     const params: CalcWithdrawBorrowTokenAmountParams = {
//       targetLTV: 0.5,
//       withdrawAmount: 10,
//       priceCollToDebt: 1.1,
//     };

//     const result = calcWithdrawBorrowTokenAmount(params);

//     const depositedFinal = new Decimal(deposited).minus(10);
//     const borrowedFinal = new Decimal(borrowed).minus(result);
//     const ltv = borrowedFinal.div(depositedFinal.mul(params.priceCollToDebt)).toNumber();

//     expect(ltv).toBeCloseTo(params.targetLTV, 5);
//   });

//   test('calculate tokenB repayment with LTV 0.64', () => {
//     const deposited = 0.082866772;
//     const borrowed = 0.058559703;

//     const params: CalcWithdrawBorrowTokenAmountParams = {
//       targetLTV: 0.642429919,
//       withdrawAmount: 0.041433386,
//       priceCollToDebt: 1.1,
//     };

//     const result = calcWithdrawBorrowTokenAmount(params);

//     const depositedFinal = new Decimal(deposited).minus(params.withdrawAmount);
//     const borrowedFinal = new Decimal(borrowed).minus(result);
//     const ltv = borrowedFinal.div(depositedFinal.mul(params.priceCollToDebt)).toNumber();
//     console.log('depositedFinal', depositedFinal.toNumber(), 'borrowedFinal', borrowedFinal.toNumber(), 'ltv', ltv);

//     expect(ltv).toBeCloseTo(params.targetLTV, 5);
//   });
// });

function strategyWithHoldings(
  sharesIssued: Decimal,
  a: Decimal,
  b: Decimal
): {
  kamino: Kamino;
  strategy: StrategyWithAddress;
  strategyHoldings: TokenAmounts;
  priceAinB: PriceAinBProvider;
  debtTokenMint: PublicKey;
} {
  const tokenAMint = Keypair.generate().publicKey;
  const strategy: StrategyWithAddress = {
    address: Keypair.generate().publicKey,
    strategy: new WhirlpoolStrategy({
      ...emptyStrategyFields(),
      sharesIssued: new BN(sharesIssued.mul(10 ** 6).toString()),
      sharesMintDecimals: new BN('6'),
      kaminoRewards: [],
      tokenAMintDecimals: new BN('6'),
      tokenBMintDecimals: new BN('6'),
      tokenAMint,
    }),
  };
  return {
    strategy,
    strategyHoldings: {
      a: a.mul(10 ** 6),
      b: b.mul(10 ** 6),
    },
    debtTokenMint: tokenAMint,
    priceAinB: async () => b.div(a),
    kamino: new Kamino('localnet', new Connection('http://localhost:8899')),
  };
}

function emptyStrategyFields(): WhirlpoolStrategyFields {
  return {
    adminAuthority: PublicKey.default,
    globalConfig: PublicKey.default,
    baseVaultAuthority: PublicKey.default,
    baseVaultAuthorityBump: new BN('0'),
    pool: PublicKey.default,
    poolTokenVaultA: PublicKey.default,
    poolTokenVaultB: PublicKey.default,
    tickArrayLower: PublicKey.default,
    tickArrayUpper: PublicKey.default,
    position: PublicKey.default,
    positionMint: PublicKey.default,
    positionMetadata: PublicKey.default,
    positionTokenAccount: PublicKey.default,
    tokenAVault: PublicKey.default,
    tokenBVault: PublicKey.default,
    tokenAVaultAuthority: PublicKey.default,
    tokenBVaultAuthority: PublicKey.default,
    tokenAVaultAuthorityBump: new BN('0'),
    tokenBVaultAuthorityBump: new BN('0'),
    tokenAMint: PublicKey.default,
    tokenBMint: PublicKey.default,
    tokenAMintDecimals: new BN('0'),
    tokenBMintDecimals: new BN('0'),
    tokenAAmounts: new BN('0'),
    tokenBAmounts: new BN('0'),
    tokenACollateralId: new BN('0'),
    tokenBCollateralId: new BN('0'),
    scopePrices: PublicKey.default,
    scopeProgram: PublicKey.default,
    sharesMint: PublicKey.default,
    sharesMintDecimals: new BN('0'),
    sharesMintAuthority: PublicKey.default,
    sharesMintAuthorityBump: new BN('0'),
    sharesIssued: new BN('0'),
    status: new BN('0'),
    reward0Amount: new BN('0'),
    reward0Vault: PublicKey.default,
    reward0CollateralId: new BN('0'),
    reward0Decimals: new BN('0'),
    reward1Amount: new BN('0'),
    reward1Vault: PublicKey.default,
    reward1CollateralId: new BN('0'),
    reward1Decimals: new BN('0'),
    reward2Amount: new BN('0'),
    reward2Vault: PublicKey.default,
    reward2CollateralId: new BN('0'),
    reward2Decimals: new BN('0'),
    depositCapUsd: new BN('0'),
    feesACumulative: new BN('0'),
    feesBCumulative: new BN('0'),
    reward0AmountCumulative: new BN('0'),
    reward1AmountCumulative: new BN('0'),
    reward2AmountCumulative: new BN('0'),
    depositCapUsdPerIxn: new BN('0'),
    withdrawalCapA: {
      configCapacity: new BN('0'),
      currentTotal: new BN('0'),
      lastIntervalStartTimestamp: new BN('0'),
      configIntervalLengthSeconds: new BN('0'),
    },
    withdrawalCapB: {
      configCapacity: new BN('0'),
      currentTotal: new BN('0'),
      lastIntervalStartTimestamp: new BN('0'),
      configIntervalLengthSeconds: new BN('0'),
    },
    maxPriceDeviationBps: new BN('0'),
    swapVaultMaxSlippageBps: 0,
    swapVaultMaxSlippageFromReferenceBps: 0,
    strategyType: new BN('0'),
    padding0: new BN('0'),
    withdrawFee: new BN('0'),
    feesFee: new BN('0'),
    reward0Fee: new BN('0'),
    reward1Fee: new BN('0'),
    reward2Fee: new BN('0'),
    positionTimestamp: new BN('0'),
    kaminoRewards: [],
    strategyDex: new BN('0'),
    raydiumProtocolPositionOrBaseVaultAuthority: PublicKey.default,
    allowDepositWithoutInvest: new BN('0'),
    raydiumPoolConfigOrBaseVaultAuthority: PublicKey.default,
    depositBlocked: 0,
    creationStatus: 0,
    investBlocked: 0,
    /** share_calculation_method can be either DOLAR_BASED=0 or PROPORTION_BASED=1 */
    shareCalculationMethod: 0,
    withdrawBlocked: 0,
    reservedFlag2: 0,
    localAdminBlocked: 0,
    flashVaultSwapAllowed: 0,
    referenceSwapPriceA: {
      value: new BN('0'),
      exp: new BN('0'),
    },
    referenceSwapPriceB: {
      value: new BN('0'),
      exp: new BN('0'),
    },
    isCommunity: 0,
    rebalanceType: 0,
    padding1: [],
    rebalanceRaw: {
      params: [],
      state: [],
      referencePriceType: 0,
    },
    padding2: [],
    tokenAFeesFromRewardsCumulative: new BN('0'),
    tokenBFeesFromRewardsCumulative: new BN('0'),
    strategyLookupTable: PublicKey.default,
    lastSwapUnevenStepTimestamp: new BN('0'),
    farm: PublicKey.default,
    padding3: new BN('0'),
    padding4: [],
    padding5: [],
    padding6: [],
    padding7: [],
  };
}
