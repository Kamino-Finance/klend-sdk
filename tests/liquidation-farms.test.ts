import {
  borrow,
  createLookupTable,
  createMarketWithTwoReservesToppedUp,
  deposit,
  Env,
  newUser,
  sendTransactionsFromAction,
} from './setup_utils';
import {
  buildVersionedTransaction,
  extendLookupTableIxs,
  getUserLutAddressAndSetupIxns,
  KaminoAction,
  KaminoMarket,
  sendAndConfirmVersionedTransaction,
  VanillaObligation,
} from '../src';
import { sleep } from '@hubbleprotocol/farms-sdk';
import Decimal from 'decimal.js';
import { updateReserve } from './setup_operations';
import { ReserveConfig } from '../src/idl_codegen/types';
import { waitUntilMatches } from './assert';
import { expect } from 'chai';
import { Keypair, PublicKey } from '@solana/web3.js';
import { initializeFarmsForReserve } from './farms_operations';

describe('liquidation_farms', function () {
  it('liquidate_loan_with_coll_farm_on_loan_coll', async function () {
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

    await initializeFarmsForReserve(env, kaminoMarket.getAddress(), collReserve.address, 'Collateral', true, true);

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
    await kaminoMarket.reload();
    const liquidatorLut = await createLiquidatorLut(env, kaminoMarket, liquidator);

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
    await sendTransactionsFromAction(env, liquidateAction, liquidator, [liquidator], [liquidatorLut]);
    await waitUntilMatches(async () => {
      const obligationState = (await kaminoMarket.getObligationByAddress(obligation.obligationAddress))!;
      // assert we liquidated some of the collateral
      expect(obligationState.loanToValue().toNumber()).to.be.lt(initialLtv.toNumber());
    }, 5000);
  });

  it('liquidate_loan_with_coll_farm_on_loan_debt', async function () {
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

    await initializeFarmsForReserve(env, kaminoMarket.getAddress(), debtReserve.address, 'Collateral', true, true);

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
    await kaminoMarket.reload();
    const liquidatorLut = await createLiquidatorLut(env, kaminoMarket, liquidator);

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
    await sendTransactionsFromAction(env, liquidateAction, liquidator, [liquidator], [liquidatorLut]);
    await waitUntilMatches(async () => {
      const obligationState = (await kaminoMarket.getObligationByAddress(obligation.obligationAddress))!;
      // assert we liquidated some of the collateral
      expect(obligationState.loanToValue().toNumber()).to.be.lt(initialLtv.toNumber());
    }, 5000);
  });

  it('liquidate_loan_with_debt_farm_on_loan_coll', async function () {
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

    await initializeFarmsForReserve(env, kaminoMarket.getAddress(), collReserve.address, 'Debt', true, true);

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
    await kaminoMarket.reload();
    const liquidatorLut = await createLiquidatorLut(env, kaminoMarket, liquidator);

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
    await sendTransactionsFromAction(env, liquidateAction, liquidator, [liquidator], [liquidatorLut]);
    await waitUntilMatches(async () => {
      const obligationState = (await kaminoMarket.getObligationByAddress(obligation.obligationAddress))!;
      // assert we liquidated some of the collateral
      expect(obligationState.loanToValue().toNumber()).to.be.lt(initialLtv.toNumber());
    }, 5000);
  });

  it('liquidate_loan_with_debt_farm_on_loan_debt', async function () {
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

    await initializeFarmsForReserve(env, kaminoMarket.getAddress(), debtReserve.address, 'Debt', true, true);

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
    await kaminoMarket.reload();
    const liquidatorLut = await createLiquidatorLut(env, kaminoMarket, liquidator);

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
    await sendTransactionsFromAction(env, liquidateAction, liquidator, [liquidator], [liquidatorLut]);
    await waitUntilMatches(async () => {
      const obligationState = (await kaminoMarket.getObligationByAddress(obligation.obligationAddress))!;
      // assert we liquidated some of the collateral
      expect(obligationState.loanToValue().toNumber()).to.be.lt(initialLtv.toNumber());
    }, 5000);
  });

  it('liquidate_loan_with_coll_and_debt_farm_on_loan_coll', async function () {
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

    await initializeFarmsForReserve(env, kaminoMarket.getAddress(), collReserve.address, 'Collateral', true, true);
    await initializeFarmsForReserve(env, kaminoMarket.getAddress(), collReserve.address, 'Debt', true, true);

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
    await kaminoMarket.reload();
    const liquidatorLut = await createLiquidatorLut(env, kaminoMarket, liquidator);

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
    await sendTransactionsFromAction(env, liquidateAction, liquidator, [liquidator], [liquidatorLut]);
    await waitUntilMatches(async () => {
      const obligationState = (await kaminoMarket.getObligationByAddress(obligation.obligationAddress))!;
      // assert we liquidated some of the collateral
      expect(obligationState.loanToValue().toNumber()).to.be.lt(initialLtv.toNumber());
    }, 5000);
  });

  it('liquidate_loan_with_coll_and_debt_farm_on_loan_debt', async function () {
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

    await initializeFarmsForReserve(env, kaminoMarket.getAddress(), debtReserve.address, 'Collateral', true, true);
    await initializeFarmsForReserve(env, kaminoMarket.getAddress(), debtReserve.address, 'Debt', true, true);

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
    await kaminoMarket.reload();
    const liquidatorLut = await createLiquidatorLut(env, kaminoMarket, liquidator);

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
    await sendTransactionsFromAction(env, liquidateAction, liquidator, [liquidator], [liquidatorLut]);
    await waitUntilMatches(async () => {
      const obligationState = (await kaminoMarket.getObligationByAddress(obligation.obligationAddress))!;
      // assert we liquidated some of the collateral
      expect(obligationState.loanToValue().toNumber()).to.be.lt(initialLtv.toNumber());
    }, 5000);
  });

  it('liquidate_loan_with_sol_coll_and_debt_farm_respectively_on_loan_coll_and_debt', async function () {
    const [collToken, debtToken] = ['SOL', 'USDC'];

    const { env, kaminoMarket } = await createMarketWithTwoReservesToppedUp(
      [collToken, new Decimal(5000.05)],
      [debtToken, new Decimal(5000.05)]
    );

    const borrower = await newUser(env, kaminoMarket, [
      [collToken, new Decimal(2000)],
      [debtToken, new Decimal(0)],
    ]);
    const liquidator = await newUser(env, kaminoMarket, [[debtToken, new Decimal(2000)]]);

    await deposit(env, kaminoMarket, borrower, collToken, new Decimal(75));
    await borrow(env, kaminoMarket, borrower, debtToken, new Decimal(1500));

    const obligation = (await kaminoMarket.getUserObligationsByTag(VanillaObligation.tag, borrower.publicKey))![0];
    const initialLtv = obligation.loanToValue();

    const collReserve = kaminoMarket.getReserveBySymbol(collToken)!;
    const debtReserve = kaminoMarket.getReserveBySymbol(debtToken)!;

    await initializeFarmsForReserve(env, kaminoMarket.getAddress(), collReserve.address, 'Collateral', true, true);
    await initializeFarmsForReserve(env, kaminoMarket.getAddress(), debtReserve.address, 'Debt', true, true);

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
    await kaminoMarket.reload();
    const liquidatorLut = await createLiquidatorLut(env, kaminoMarket, liquidator);

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

    const lookupTable = await createLookupTable(
      env,
      [...liquidateAction.setupIxs, ...liquidateAction.lendingIxs, ...liquidateAction.cleanupIxs]
        .map((ixn) => ixn.keys)
        .flat()
        .map((key) => key.pubkey)
    );
    await sleep(2000);

    await sendTransactionsFromAction(env, liquidateAction, liquidator, [liquidator], [liquidatorLut, lookupTable]);
    await waitUntilMatches(async () => {
      const obligationState = (await kaminoMarket.getObligationByAddress(obligation.obligationAddress))!;
      // assert we liquidated some of the collateral
      expect(obligationState.loanToValue().toNumber()).to.be.lt(initialLtv.toNumber());
    }, 5000);
  });

  it('liquidate_loan_with_coll_and_debt_farm_respectively_on_loan_coll_and_debt', async function () {
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

    await initializeFarmsForReserve(env, kaminoMarket.getAddress(), collReserve.address, 'Collateral', true, true);
    await initializeFarmsForReserve(env, kaminoMarket.getAddress(), debtReserve.address, 'Debt', true, true);

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
    await kaminoMarket.reload();
    const liquidatorLut = await createLiquidatorLut(env, kaminoMarket, liquidator);

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

    const lookupTable = await createLookupTable(
      env,
      [...liquidateAction.setupIxs, ...liquidateAction.lendingIxs, ...liquidateAction.cleanupIxs]
        .map((ixn) => ixn.keys)
        .flat()
        .map((key) => key.pubkey)
    );
    await sleep(2000);

    await sendTransactionsFromAction(env, liquidateAction, liquidator, [liquidator], [liquidatorLut, lookupTable]);
    await waitUntilMatches(async () => {
      const obligationState = (await kaminoMarket.getObligationByAddress(obligation.obligationAddress))!;
      // assert we liquidated some of the collateral
      expect(obligationState.loanToValue().toNumber()).to.be.lt(initialLtv.toNumber());
    }, 5000);
  });

  it('liquidate_loan_with_sol_coll_and_debt_farm_opposite_on_loan_coll_and_debt', async function () {
    const [collToken, debtToken] = ['SOL', 'USDC'];

    const { env, kaminoMarket } = await createMarketWithTwoReservesToppedUp(
      [collToken, new Decimal(5000.05)],
      [debtToken, new Decimal(5000.05)]
    );

    const borrower = await newUser(env, kaminoMarket, [
      [collToken, new Decimal(2000)],
      [debtToken, new Decimal(0)],
    ]);
    const liquidator = await newUser(env, kaminoMarket, [[debtToken, new Decimal(2000)]]);

    await deposit(env, kaminoMarket, borrower, collToken, new Decimal(75));
    await borrow(env, kaminoMarket, borrower, debtToken, new Decimal(1500));

    const obligation = (await kaminoMarket.getUserObligationsByTag(VanillaObligation.tag, borrower.publicKey))![0];
    const initialLtv = obligation.loanToValue();

    const collReserve = kaminoMarket.getReserveBySymbol(collToken)!;
    const debtReserve = kaminoMarket.getReserveBySymbol(debtToken)!;

    await initializeFarmsForReserve(env, kaminoMarket.getAddress(), collReserve.address, 'Debt', true, true);
    await initializeFarmsForReserve(env, kaminoMarket.getAddress(), debtReserve.address, 'Collateral', true, true);

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
    await kaminoMarket.reload();
    const liquidatorLut = await createLiquidatorLut(env, kaminoMarket, liquidator);

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

    const lookupTable = await createLookupTable(
      env,
      [...liquidateAction.setupIxs, ...liquidateAction.lendingIxs, ...liquidateAction.cleanupIxs]
        .map((ixn) => ixn.keys)
        .flat()
        .map((key) => key.pubkey)
    );
    await sleep(2000);

    await sendTransactionsFromAction(env, liquidateAction, liquidator, [liquidator], [liquidatorLut, lookupTable]);
    await waitUntilMatches(async () => {
      const obligationState = (await kaminoMarket.getObligationByAddress(obligation.obligationAddress))!;
      // assert we liquidated some of the collateral
      expect(obligationState.loanToValue().toNumber()).to.be.lt(initialLtv.toNumber());
    }, 5000);
  });

  it('liquidate_loan_with_coll_and_debt_farm_opposite_on_loan_coll_and_debt', async function () {
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

    await initializeFarmsForReserve(env, kaminoMarket.getAddress(), collReserve.address, 'Debt', true, true);
    await initializeFarmsForReserve(env, kaminoMarket.getAddress(), debtReserve.address, 'Collateral', true, true);

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
    await kaminoMarket.reload();
    const liquidatorLut = await createLiquidatorLut(env, kaminoMarket, liquidator);

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

    const lookupTable = await createLookupTable(
      env,
      [...liquidateAction.setupIxs, ...liquidateAction.lendingIxs, ...liquidateAction.cleanupIxs]
        .map((ixn) => ixn.keys)
        .flat()
        .map((key) => key.pubkey)
    );
    await sleep(2000);

    await sendTransactionsFromAction(env, liquidateAction, liquidator, [liquidator], [liquidatorLut, lookupTable]);
    await waitUntilMatches(async () => {
      const obligationState = (await kaminoMarket.getObligationByAddress(obligation.obligationAddress))!;
      // assert we liquidated some of the collateral
      expect(obligationState.loanToValue().toNumber()).to.be.lt(initialLtv.toNumber());
    }, 5000);
  });

  it('liquidate_loan_with_sol_coll_and_debt_farm_on_loan_both_coll_and_debt', async function () {
    const [collToken, debtToken] = ['SOL', 'USDC'];

    const { env, kaminoMarket } = await createMarketWithTwoReservesToppedUp(
      [collToken, new Decimal(5000.05)],
      [debtToken, new Decimal(5000.05)]
    );

    const borrower = await newUser(env, kaminoMarket, [
      [collToken, new Decimal(2000)],
      [debtToken, new Decimal(0)],
    ]);
    const liquidator = await newUser(env, kaminoMarket, [[debtToken, new Decimal(2000)]]);

    await deposit(env, kaminoMarket, borrower, collToken, new Decimal(75));
    await borrow(env, kaminoMarket, borrower, debtToken, new Decimal(1500));

    const obligation = (await kaminoMarket.getUserObligationsByTag(VanillaObligation.tag, borrower.publicKey))![0];
    const initialLtv = obligation.loanToValue();

    const collReserve = kaminoMarket.getReserveBySymbol(collToken)!;
    const debtReserve = kaminoMarket.getReserveBySymbol(debtToken)!;

    await initializeFarmsForReserve(env, kaminoMarket.getAddress(), collReserve.address, 'Collateral', true, true);
    await initializeFarmsForReserve(env, kaminoMarket.getAddress(), collReserve.address, 'Debt', true, true);
    await initializeFarmsForReserve(env, kaminoMarket.getAddress(), debtReserve.address, 'Collateral', true, true);
    await initializeFarmsForReserve(env, kaminoMarket.getAddress(), debtReserve.address, 'Debt', true, true);

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
    await kaminoMarket.reload();
    const liquidatorLut = await createLiquidatorLut(env, kaminoMarket, liquidator);

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

    const lookupTable = await createLookupTable(
      env,
      [...liquidateAction.setupIxs, ...liquidateAction.lendingIxs, ...liquidateAction.cleanupIxs]
        .map((ixn) => ixn.keys)
        .flat()
        .map((key) => key.pubkey)
    );
    await sleep(2000);

    await sendTransactionsFromAction(env, liquidateAction, liquidator, [liquidator], [liquidatorLut, lookupTable]);
    await waitUntilMatches(async () => {
      const obligationState = (await kaminoMarket.getObligationByAddress(obligation.obligationAddress))!;
      // assert we liquidated some of the collateral
      expect(obligationState.loanToValue().toNumber()).to.be.lt(initialLtv.toNumber());
    }, 5000);
  });

  it('liquidate_loan_with_coll_and_debt_farm_on_loan_both_coll_and_debt', async function () {
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

    await initializeFarmsForReserve(env, kaminoMarket.getAddress(), collReserve.address, 'Collateral', true, true);
    await initializeFarmsForReserve(env, kaminoMarket.getAddress(), collReserve.address, 'Debt', true, true);
    await initializeFarmsForReserve(env, kaminoMarket.getAddress(), debtReserve.address, 'Collateral', true, true);
    await initializeFarmsForReserve(env, kaminoMarket.getAddress(), debtReserve.address, 'Debt', true, true);

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
    await kaminoMarket.reload();
    const liquidatorLut = await createLiquidatorLut(env, kaminoMarket, liquidator);

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

    const lookupTable = await createLookupTable(
      env,
      [...liquidateAction.setupIxs, ...liquidateAction.lendingIxs, ...liquidateAction.cleanupIxs]
        .map((ixn) => ixn.keys)
        .flat()
        .map((key) => key.pubkey)
    );
    await sleep(2000);

    await sendTransactionsFromAction(env, liquidateAction, liquidator, [liquidator], [liquidatorLut, lookupTable]);
    await waitUntilMatches(async () => {
      const obligationState = (await kaminoMarket.getObligationByAddress(obligation.obligationAddress))!;
      // assert we liquidated some of the collateral
      expect(obligationState.loanToValue().toNumber()).to.be.lt(initialLtv.toNumber());
    }, 5000);
  });
});

async function createLiquidatorLut(env: Env, market: KaminoMarket, liquidator: Keypair): Promise<PublicKey> {
  const [liquidatorLookupTable, txsIxns] = await getUserLutAddressAndSetupIxns(market, liquidator.publicKey);
  const reserves = [...market.reserves.keys()];
  const farmCollateralStates: PublicKey[] = market.getReserves().map((reserve) => reserve.state.farmCollateral);
  const farmDebtStates: PublicKey[] = market.getReserves().map((reserve) => reserve.state.farmDebt);
  const farmStates = new Set(
    farmCollateralStates.concat(farmDebtStates).filter((address) => address.equals(PublicKey.default) === false)
  );
  const extraLutIxs = extendLookupTableIxs(liquidator.publicKey, liquidatorLookupTable, [...reserves, ...farmStates]);
  for (const txIxns of [...txsIxns, extraLutIxs]) {
    const tx = await buildVersionedTransaction(env.provider.connection, liquidator.publicKey, txIxns);
    tx.sign([liquidator]);
    await sendAndConfirmVersionedTransaction(env.provider.connection, tx, 'confirmed');
    await sleep(2000);
  }
  return liquidatorLookupTable;
}
