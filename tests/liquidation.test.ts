import {
  borrow,
  createMarketWithTwoReservesToppedUp,
  deposit,
  newUser,
  sendTransactionsFromAction,
} from './setup_utils';
import { KaminoAction, VanillaObligation } from '../src';
import { sleep } from '@hubbleprotocol/farms-sdk';
import Decimal from 'decimal.js';
import { updateReserve } from './setup_operations';
import { ReserveConfig } from '../src/idl_codegen/types';
import { waitUntilMatches } from './assert';
import { expect } from 'chai';
import { PublicKey } from '@solana/web3.js';

describe('liquidation', function () {
  it('liquidate_normal_loan', async function () {
    const [collToken, debtToken] = ['USDH', 'USDC'];

    const { env, kaminoMarket } = await createMarketWithTwoReservesToppedUp(
      [collToken, new Decimal(5000.05)],
      [debtToken, new Decimal(5000.05)]
    );

    const borrower = await newUser(env, kaminoMarket, [
      [collToken, new Decimal(2000)],
      [debtToken, new Decimal(0)],
    ]);
    const liquidator = await newUser(env, kaminoMarket, [[debtToken, new Decimal(2000)]]);

    await deposit(env, kaminoMarket, borrower, collToken, new Decimal(2000));
    await borrow(env, kaminoMarket, borrower, debtToken, new Decimal(1500));

    const obligation = (await kaminoMarket.getUserObligationsByTag(VanillaObligation.tag, borrower.publicKey))![0];
    const initialLtv = obligation.loanToValue();

    const collReserve = kaminoMarket.getReserveBySymbol(collToken)!;
    const debtReserve = kaminoMarket.getReserveBySymbol(debtToken)!;

    // Hack to make the loan liquidatable
    await updateReserve(
      env,
      collReserve.address,
      new ReserveConfig({
        ...collReserve.state.config,
        loanToValuePct: 50,
        liquidationThresholdPct: 51,
      })
    );
    await sleep(2000);

    const liquidateAction = await KaminoAction.buildLiquidateTxns(
      kaminoMarket,
      '300000000',
      '0',
      debtReserve.getLiquidityMint(),
      collReserve.getLiquidityMint(),
      liquidator.publicKey,
      borrower.publicKey,
      new VanillaObligation(kaminoMarket.programId),
      undefined,
      undefined,
      undefined,
      undefined,
      PublicKey.default
    );
    await sendTransactionsFromAction(env, liquidateAction, liquidator, [liquidator]);
    await waitUntilMatches(async () => {
      const obligationState = (await kaminoMarket.getObligationByAddress(obligation.obligationAddress))!;
      // assert we liquidated some of the collateral
      expect(obligationState.loanToValue().toNumber()).to.be.lt(initialLtv.toNumber());
    }, 5000);
  });

  it('liquidate_normal_loan_min_out', async function () {
    const [collToken, debtToken] = ['USDH', 'USDC'];

    const { env, kaminoMarket } = await createMarketWithTwoReservesToppedUp(
      [collToken, new Decimal(5000.05)],
      [debtToken, new Decimal(5000.05)]
    );

    const borrower = await newUser(env, kaminoMarket, [
      [collToken, new Decimal(2000)],
      [debtToken, new Decimal(0)],
    ]);
    const liquidator = await newUser(env, kaminoMarket, [[debtToken, new Decimal(2000)]]);

    await deposit(env, kaminoMarket, borrower, collToken, new Decimal(2000));
    await borrow(env, kaminoMarket, borrower, debtToken, new Decimal(1500));

    const obligation = (await kaminoMarket.getUserObligationsByTag(VanillaObligation.tag, borrower.publicKey))![0];
    const initialLtv = obligation.loanToValue();

    const collReserve = kaminoMarket.getReserveBySymbol(collToken)!;
    const debtReserve = kaminoMarket.getReserveBySymbol(debtToken)!;

    // Hack to make the loan liquidatable
    await updateReserve(
      env,
      collReserve.address,
      new ReserveConfig({
        ...collReserve.state.config,
        loanToValuePct: 50,
        liquidationThresholdPct: 51,
      })
    );
    await sleep(2000);

    const liquidateAction = await KaminoAction.buildLiquidateTxns(
      kaminoMarket,
      '300000000',
      '314999998',
      debtReserve.getLiquidityMint(),
      collReserve.getLiquidityMint(),
      liquidator.publicKey,
      borrower.publicKey,
      new VanillaObligation(kaminoMarket.programId),
      undefined,
      undefined,
      undefined,
      undefined,
      PublicKey.default
    );
    await sendTransactionsFromAction(env, liquidateAction, liquidator, [liquidator]);
    await waitUntilMatches(async () => {
      const obligationState = (await kaminoMarket.getObligationByAddress(obligation.obligationAddress))!;
      // assert we liquidated some of the collateral
      expect(obligationState.loanToValue().toNumber()).to.be.lt(initialLtv.toNumber());
    }, 5000);
  });

  it('liquidate_sol_collateral', async function () {
    const [collToken, debtToken] = ['SOL', 'USDC'];

    const { env, kaminoMarket } = await createMarketWithTwoReservesToppedUp(
      [collToken, new Decimal(1000.05)],
      [debtToken, new Decimal(1000.05)]
    );

    const borrower = await newUser(env, kaminoMarket, [
      [collToken, new Decimal(20)],
      [debtToken, new Decimal(0)],
    ]);
    const liquidator = await newUser(env, kaminoMarket, [[debtToken, new Decimal(2000)]]);

    await deposit(env, kaminoMarket, borrower, 'SOL', new Decimal(20));
    await borrow(env, kaminoMarket, borrower, 'USDC', new Decimal(300));

    const obligation = (await kaminoMarket.getUserObligationsByTag(VanillaObligation.tag, borrower.publicKey))![0];
    const initialLtv = obligation.loanToValue();

    const collReserve = kaminoMarket.getReserveBySymbol(collToken)!;
    const debtReserve = kaminoMarket.getReserveBySymbol(debtToken)!;
    // Hack to make the loan liquidatable
    await updateReserve(
      env,
      collReserve.address,
      new ReserveConfig({
        ...collReserve.state.config,
        loanToValuePct: 50,
        liquidationThresholdPct: 51,
      })
    );
    await sleep(2000);

    const liquidateAction = await KaminoAction.buildLiquidateTxns(
      kaminoMarket,
      '300000000',
      '0',
      debtReserve.getLiquidityMint(),
      collReserve.getLiquidityMint(),
      liquidator.publicKey,
      borrower.publicKey,
      new VanillaObligation(kaminoMarket.programId),
      undefined,
      undefined,
      undefined,
      undefined,
      PublicKey.default
    );
    await sendTransactionsFromAction(env, liquidateAction, liquidator, [liquidator]);
    await waitUntilMatches(async () => {
      const obligationState = (await kaminoMarket.getObligationByAddress(obligation.obligationAddress))!;
      // assert we liquidated some of the collateral
      expect(obligationState.loanToValue().toNumber()).to.be.lt(initialLtv.toNumber());
    }, 5000);
  });

  it('liquidate_sol_debt', async function () {
    const [collToken, debtToken] = ['USDC', 'SOL'];

    const { env, kaminoMarket } = await createMarketWithTwoReservesToppedUp(
      [collToken, new Decimal(1000.05)],
      [debtToken, new Decimal(1000.05)]
    );

    const borrower = await newUser(env, kaminoMarket, [
      [collToken, new Decimal(1000)],
      [debtToken, new Decimal(0)],
    ]);
    const liquidator = await newUser(env, kaminoMarket, [[debtToken, new Decimal(2000)]]);

    await deposit(env, kaminoMarket, borrower, collToken, new Decimal(1000));
    await borrow(env, kaminoMarket, borrower, debtToken, new Decimal(25));

    const obligation = (await kaminoMarket.getUserObligationsByTag(VanillaObligation.tag, borrower.publicKey))![0];
    const initialLtv = obligation.loanToValue();

    const collReserve = kaminoMarket.getReserveBySymbol(collToken)!;
    const debtReserve = kaminoMarket.getReserveBySymbol(debtToken)!;

    // Hack to make the loan liquidatable
    await updateReserve(
      env,
      collReserve.address,
      new ReserveConfig({
        ...collReserve.state.config,
        loanToValuePct: 50,
        liquidationThresholdPct: 51,
      })
    );
    await sleep(2000);

    const liquidateAction = await KaminoAction.buildLiquidateTxns(
      kaminoMarket,
      '25000000000',
      '0',
      debtReserve.getLiquidityMint(),
      collReserve.getLiquidityMint(),
      liquidator.publicKey,
      borrower.publicKey,
      new VanillaObligation(kaminoMarket.programId),
      0, // todo - this is a hack - the tx is too large so removed budget tx just to fit for test
      undefined,
      undefined,
      undefined,
      PublicKey.default
    );
    await sendTransactionsFromAction(env, liquidateAction, liquidator, [liquidator]);
    await waitUntilMatches(async () => {
      const obligationState = (await kaminoMarket.getObligationByAddress(obligation.obligationAddress))!;
      // assert we liquidated some of the collateral
      expect(obligationState.loanToValue().toNumber()).to.be.lt(initialLtv.toNumber());
    }, 5000);
  });

  it('liquidate_loan_with_same_collateral_and_debt_reserve', async function () {
    const [collToken, debtToken] = ['USDC', 'USDC'];

    const { env, kaminoMarket } = await createMarketWithTwoReservesToppedUp(
      [collToken, new Decimal(5000.05)],
      [debtToken, new Decimal(5000.05)]
    );

    const borrower = await newUser(env, kaminoMarket, [
      [collToken, new Decimal(2000)],
      [debtToken, new Decimal(0)],
    ]);
    const liquidator = await newUser(env, kaminoMarket, [[debtToken, new Decimal(2000)]]);

    await deposit(env, kaminoMarket, borrower, collToken, new Decimal(2000));
    await borrow(env, kaminoMarket, borrower, debtToken, new Decimal(1500));

    const obligation = (await kaminoMarket.getUserObligationsByTag(VanillaObligation.tag, borrower.publicKey))![0];
    const initialLtv = obligation.loanToValue();

    const collReserve = kaminoMarket.getReserveBySymbol(collToken)!;
    const debtReserve = kaminoMarket.getReserveBySymbol(debtToken)!;

    // Hack to make the loan liquidatable
    await updateReserve(
      env,
      collReserve.address,
      new ReserveConfig({
        ...collReserve.state.config,
        loanToValuePct: 50,
        liquidationThresholdPct: 51,
      })
    );
    await sleep(2000);

    const liquidateAction = await KaminoAction.buildLiquidateTxns(
      kaminoMarket,
      '300000000',
      '0',
      debtReserve.getLiquidityMint(),
      collReserve.getLiquidityMint(),
      liquidator.publicKey,
      borrower.publicKey,
      new VanillaObligation(kaminoMarket.programId),
      undefined,
      undefined,
      undefined,
      undefined,
      PublicKey.default
    );
    await sendTransactionsFromAction(env, liquidateAction, liquidator, [liquidator]);
    await waitUntilMatches(async () => {
      const obligationState = (await kaminoMarket.getObligationByAddress(obligation.obligationAddress))!;
      // assert we liquidated some of the collateral
      expect(obligationState.loanToValue().toNumber()).to.be.lt(initialLtv.toNumber());
    }, 5000);
  });
});
