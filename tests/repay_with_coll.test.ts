import Decimal from 'decimal.js';
import {
  borrow,
  createMarketWithTwoReservesToppedUp,
  deposit,
  makeReserveConfigWithBorrowFeeAndTakeRate,
  newUser,
} from './setup_utils';
import { VanillaObligation, getRepayWithCollSwapInputs, sleep } from '../src';
import { repayWithCollTestAdapter } from './repay_with_coll_utils';
import { Keypair, LAMPORTS_PER_SOL, PublicKey } from '@solana/web3.js';
import { getPriceMock } from './leverage_utils';
import { assert } from 'chai';
import { assertFuzzyEq, assertSwapInputsMatch } from './assert';
import { Fraction } from '../src/classes/fraction';
import { lamportsToNumberDecimal } from '../src/classes/utils';
import { updateMarketReferralFeeBps, updateReserve } from './setup_operations';

describe('Repay with collateral SDK tests', function () {
  it('repay_with_coll_partial_non_sol', async function () {
    const [collToken, debtToken] = ['MSOL', 'USDC'];
    const amountToDeposit = new Decimal(1.5);
    const amountToBorrow = new Decimal(10);
    const amountToRepay = amountToBorrow.div(2);
    const slippagePct = 0.5;

    console.log('Setting up market ===');
    const { env, kaminoMarket } = await createMarketWithTwoReservesToppedUp(
      [collToken, new Decimal(1000.05)],
      [debtToken, new Decimal(1000.05)]
    );
    const collTokenMint = kaminoMarket.getReserveBySymbol(collToken)?.getLiquidityMint()!;
    const debtTokenMint = kaminoMarket.getReserveBySymbol(debtToken)?.getLiquidityMint()!;

    console.log('Creating user ===');
    const borrower = await newUser(env, kaminoMarket, [
      [collToken, new Decimal(10)],
      [debtToken, new Decimal(10)],
    ]);

    console.log('Depositing coll ===');
    await sleep(1000);
    await deposit(env, kaminoMarket, borrower, collToken, amountToDeposit);

    console.log('Borrowing debt ===');
    await sleep(1000);
    await borrow(env, kaminoMarket, borrower, debtToken, amountToBorrow);

    console.log('Repaying with collateral ===');

    await sleep(2000);

    const obligationBefore = (await kaminoMarket.getUserObligationsByTag(VanillaObligation.tag, borrower.publicKey))[0];

    const repayWithCollTxRes = await repayWithCollTestAdapter(
      env,
      borrower,
      kaminoMarket,
      amountToRepay,
      debtTokenMint,
      collTokenMint,
      amountToBorrow.equals(amountToRepay),
      slippagePct,
      obligationBefore,
      (a: PublicKey, b: PublicKey) => getPriceMock(kaminoMarket, a, b),
      PublicKey.default
    );

    console.log('Repay with Coll txn:', repayWithCollTxRes);

    await sleep(2000);

    await kaminoMarket.reload();

    const obligationAfter = (await kaminoMarket.getUserObligationsByTag(VanillaObligation.tag, borrower.publicKey))[0];

    console.log('obligationBefore: ', obligationBefore.refreshedStats);
    console.log('obligationAfter: ', obligationAfter.refreshedStats);

    assertFuzzyEq(
      obligationBefore.refreshedStats.netAccountValue
        .sub(
          amountToRepay
            .mul(kaminoMarket.getReserveByMint(debtTokenMint)?.getReserveMarketPrice().toNumber()!)
            .mul(new Decimal(slippagePct).div('100'))
        )
        .toNumber(),
      obligationAfter.refreshedStats.netAccountValue.toNumber(),
      0.01
    );

    assertFuzzyEq(
      lamportsToNumberDecimal(
        new Fraction(obligationBefore.state.borrows[0].borrowedAmountSf).toDecimal(),
        kaminoMarket.getReserveByMint(debtTokenMint)?.state.liquidity.mintDecimals.toNumber()!
      ).sub(amountToRepay),
      lamportsToNumberDecimal(
        new Fraction(obligationAfter.state.borrows[0].borrowedAmountSf).toDecimal(),
        kaminoMarket.getReserveByMint(debtTokenMint)?.state.liquidity.mintDecimals.toNumber()!
      ),
      0.001
    );

    assertFuzzyEq(
      lamportsToNumberDecimal(
        obligationBefore.state.deposits[0].depositedAmount.toNumber(),
        kaminoMarket.getReserveByMint(collTokenMint)?.state.liquidity.mintDecimals.toNumber()!
      ).sub(
        amountToRepay.mul(1 + slippagePct / 100).mul(await getPriceMock(kaminoMarket, debtTokenMint, collTokenMint))
      ),
      lamportsToNumberDecimal(
        obligationAfter.state.deposits[0].depositedAmount.toNumber(),
        kaminoMarket.getReserveByMint(collTokenMint)?.state.liquidity.mintDecimals.toNumber()!
      ),
      0.001
    );
  });

  it('repay_with_coll_partial_sol_debt', async function () {
    const [collToken, debtToken] = ['MSOL', 'SOL'];
    const amountToDeposit = new Decimal(2.5);
    const amountToBorrow = new Decimal(1);
    const amountToRepay = amountToBorrow.div(2);
    const slippagePct = 0.5;

    console.log('Setting up market ===');
    const { env, kaminoMarket } = await createMarketWithTwoReservesToppedUp(
      [collToken, new Decimal(1000.05)],
      [debtToken, new Decimal(1000.05)]
    );
    const collTokenMint = kaminoMarket.getReserveBySymbol(collToken)?.getLiquidityMint()!;
    const debtTokenMint = kaminoMarket.getReserveBySymbol(debtToken)?.getLiquidityMint()!;

    console.log('Creating user ===');
    const borrower = await newUser(env, kaminoMarket, [
      [collToken, new Decimal(10)],
      [debtToken, new Decimal(10)],
    ]);

    console.log('Depositing coll ===');
    await sleep(1000);
    await deposit(env, kaminoMarket, borrower, collToken, amountToDeposit);

    console.log('Borrowing debt ===');
    await sleep(1000);
    await borrow(env, kaminoMarket, borrower, debtToken, amountToBorrow);

    console.log('Repaying with collateral ===');

    await sleep(2000);

    const obligationBefore = (await kaminoMarket.getUserObligationsByTag(VanillaObligation.tag, borrower.publicKey))[0];

    const repayWithCollTxRes = await repayWithCollTestAdapter(
      env,
      borrower,
      kaminoMarket,
      amountToRepay,
      debtTokenMint,
      collTokenMint,
      amountToBorrow.equals(amountToRepay),
      slippagePct,
      obligationBefore,
      (a: PublicKey, b: PublicKey) => getPriceMock(kaminoMarket, a, b),
      PublicKey.default
    );

    console.log('Repay with Coll txn:', repayWithCollTxRes);

    await sleep(2000);

    await kaminoMarket.reload();

    const obligationAfter = (await kaminoMarket.getUserObligationsByTag(VanillaObligation.tag, borrower.publicKey))[0];

    console.log('obligationBefore: ', obligationBefore.refreshedStats);
    console.log('obligationAfter: ', obligationAfter.refreshedStats);

    assertFuzzyEq(
      obligationBefore.refreshedStats.netAccountValue
        .sub(
          amountToRepay
            .mul(kaminoMarket.getReserveByMint(debtTokenMint)?.getReserveMarketPrice().toNumber()!)
            .mul(new Decimal(slippagePct).div('100'))
        )
        .toNumber(),
      obligationAfter.refreshedStats.netAccountValue.toNumber(),
      0.01
    );

    assertFuzzyEq(
      lamportsToNumberDecimal(
        new Fraction(obligationBefore.state.borrows[0].borrowedAmountSf).toDecimal(),
        kaminoMarket.getReserveByMint(debtTokenMint)?.state.liquidity.mintDecimals.toNumber()!
      ).sub(amountToRepay),
      lamportsToNumberDecimal(
        new Fraction(obligationAfter.state.borrows[0].borrowedAmountSf).toDecimal(),
        kaminoMarket.getReserveByMint(debtTokenMint)?.state.liquidity.mintDecimals.toNumber()!
      ),
      0.001
    );

    assertFuzzyEq(
      lamportsToNumberDecimal(
        obligationBefore.state.deposits[0].depositedAmount.toNumber(),
        kaminoMarket.getReserveByMint(collTokenMint)?.state.liquidity.mintDecimals.toNumber()!
      ).sub(
        amountToRepay.mul(1 + slippagePct / 100).mul(await getPriceMock(kaminoMarket, debtTokenMint, collTokenMint))
      ),
      lamportsToNumberDecimal(
        obligationAfter.state.deposits[0].depositedAmount.toNumber(),
        kaminoMarket.getReserveByMint(collTokenMint)?.state.liquidity.mintDecimals.toNumber()!
      ),
      0.001
    );
  });

  it('repay_with_coll_partial_sol_coll', async function () {
    const [collToken, debtToken] = ['SOL', 'USDC'];
    const amountToDeposit = new Decimal(2.5);
    const amountToBorrow = new Decimal(15);
    const amountToRepay = amountToBorrow.div(2);
    const slippagePct = 0.5;

    console.log('Setting up market ===');
    const { env, kaminoMarket } = await createMarketWithTwoReservesToppedUp(
      [collToken, new Decimal(1000.05)],
      [debtToken, new Decimal(1000.05)]
    );
    const collTokenMint = kaminoMarket.getReserveBySymbol(collToken)?.getLiquidityMint()!;
    const debtTokenMint = kaminoMarket.getReserveBySymbol(debtToken)?.getLiquidityMint()!;

    console.log('Creating user ===');
    const borrower = await newUser(env, kaminoMarket, [
      [collToken, new Decimal(10)],
      [debtToken, new Decimal(10)],
    ]);

    console.log('Depositing coll ===');
    await sleep(1000);
    await deposit(env, kaminoMarket, borrower, collToken, amountToDeposit);

    console.log('Borrowing debt ===');
    await sleep(1000);
    await borrow(env, kaminoMarket, borrower, debtToken, amountToBorrow);

    console.log('Repaying with collateral ===');

    await sleep(2000);

    const obligationBefore = (await kaminoMarket.getUserObligationsByTag(VanillaObligation.tag, borrower.publicKey))[0];

    const repayWithCollTxRes = await repayWithCollTestAdapter(
      env,
      borrower,
      kaminoMarket,
      amountToRepay,
      debtTokenMint,
      collTokenMint,
      amountToBorrow.equals(amountToRepay),
      slippagePct,
      obligationBefore,
      (a: PublicKey, b: PublicKey) => getPriceMock(kaminoMarket, a, b),
      PublicKey.default
    );

    console.log('Repay with Coll txn:', repayWithCollTxRes);

    await sleep(2000);

    await kaminoMarket.reload();

    const obligationAfter = (await kaminoMarket.getUserObligationsByTag(VanillaObligation.tag, borrower.publicKey))[0];

    console.log('obligationBefore: ', obligationBefore.refreshedStats);
    console.log('obligationAfter: ', obligationAfter.refreshedStats);

    assertFuzzyEq(
      obligationBefore.refreshedStats.netAccountValue
        .sub(
          amountToRepay
            .mul(kaminoMarket.getReserveByMint(debtTokenMint)?.getReserveMarketPrice().toNumber()!)
            .mul(new Decimal(slippagePct).div('100'))
        )
        .toNumber(),
      obligationAfter.refreshedStats.netAccountValue.toNumber(),
      0.01
    );

    assertFuzzyEq(
      lamportsToNumberDecimal(
        new Fraction(obligationBefore.state.borrows[0].borrowedAmountSf).toDecimal(),
        kaminoMarket.getReserveByMint(debtTokenMint)?.state.liquidity.mintDecimals.toNumber()!
      ).sub(amountToRepay),
      lamportsToNumberDecimal(
        new Fraction(obligationAfter.state.borrows[0].borrowedAmountSf).toDecimal(),
        kaminoMarket.getReserveByMint(debtTokenMint)?.state.liquidity.mintDecimals.toNumber()!
      ),
      0.001
    );

    assertFuzzyEq(
      lamportsToNumberDecimal(
        obligationBefore.state.deposits[0].depositedAmount.toNumber(),
        kaminoMarket.getReserveByMint(collTokenMint)?.state.liquidity.mintDecimals.toNumber()!
      ).sub(
        amountToRepay.mul(1 + slippagePct / 100).mul(await getPriceMock(kaminoMarket, debtTokenMint, collTokenMint))
      ),
      lamportsToNumberDecimal(
        obligationAfter.state.deposits[0].depositedAmount.toNumber(),
        kaminoMarket.getReserveByMint(collTokenMint)?.state.liquidity.mintDecimals.toNumber()!
      ),
      0.001
    );
  });

  it('repay_with_coll_full_non_sol', async function () {
    const [collToken, debtToken] = ['MSOL', 'USDC'];
    const amountToDeposit = new Decimal(1.5);
    const amountToBorrow = new Decimal(10);
    const amountToRepay = amountToBorrow;
    const slippagePct = 0.5;

    console.log('Setting up market ===');
    const { env, kaminoMarket } = await createMarketWithTwoReservesToppedUp(
      [collToken, new Decimal(1000.05)],
      [debtToken, new Decimal(1000.05)]
    );
    const collTokenMint = kaminoMarket.getReserveBySymbol(collToken)?.getLiquidityMint()!;
    const debtTokenMint = kaminoMarket.getReserveBySymbol(debtToken)?.getLiquidityMint()!;

    console.log('Creating user ===');
    const borrower = await newUser(env, kaminoMarket, [
      [collToken, new Decimal(10)],
      [debtToken, new Decimal(10)],
    ]);

    console.log('Depositing coll ===');
    await sleep(1000);
    await deposit(env, kaminoMarket, borrower, collToken, amountToDeposit);

    console.log('Borrowing debt ===');
    await sleep(1000);
    await borrow(env, kaminoMarket, borrower, debtToken, amountToBorrow);

    console.log('Repaying with collateral ===');

    await sleep(2000);

    const obligationBefore = (await kaminoMarket.getUserObligationsByTag(VanillaObligation.tag, borrower.publicKey))[0];

    const repayWithCollTxRes = await repayWithCollTestAdapter(
      env,
      borrower,
      kaminoMarket,
      amountToRepay,
      debtTokenMint,
      collTokenMint,
      amountToBorrow.equals(amountToRepay),
      slippagePct,
      obligationBefore,
      (a: PublicKey, b: PublicKey) => getPriceMock(kaminoMarket, a, b),
      PublicKey.default
    );

    const swapInputsCalcs = getRepayWithCollSwapInputs({
      repayAmount: amountToRepay,
      priceDebtToColl: new Decimal(await getPriceMock(kaminoMarket, debtToken, collToken)),
      slippagePct: new Decimal(slippagePct),
      kaminoMarket,
      debtTokenMint: new PublicKey(debtTokenMint),
      collTokenMint: new PublicKey(collTokenMint),
      obligation: obligationBefore,
      currentSlot: await kaminoMarket.getConnection().getSlot(),
    });

    assertSwapInputsMatch(swapInputsCalcs.swapInputs, repayWithCollTxRes?.swapInputs!);

    console.log('Repay with Coll txn:', repayWithCollTxRes);

    await sleep(2000);

    await kaminoMarket.reload();

    const obligationAfter = (await kaminoMarket.getUserObligationsByTag(VanillaObligation.tag, borrower.publicKey))[0];

    console.log('obligationBefore: ', obligationBefore.refreshedStats);
    console.log('obligationAfter: ', obligationAfter.refreshedStats);

    assert(
      lamportsToNumberDecimal(
        new Fraction(obligationAfter.state.borrows[0].borrowedAmountSf).toDecimal(),
        kaminoMarket.getReserveByMint(debtTokenMint)?.state.liquidity.mintDecimals.toNumber()!
      ).equals(0)
    );

    assertFuzzyEq(
      obligationBefore.refreshedStats.netAccountValue
        .sub(
          amountToRepay
            .mul(kaminoMarket.getReserveByMint(debtTokenMint)?.getReserveMarketPrice().toNumber()!)
            .mul(new Decimal(slippagePct).div('100'))
        )
        .toNumber(),
      obligationAfter.refreshedStats.netAccountValue.toNumber(),
      0.01
    );

    assertFuzzyEq(
      lamportsToNumberDecimal(
        obligationBefore.state.deposits[0].depositedAmount.toNumber(),
        kaminoMarket.getReserveByMint(collTokenMint)?.state.liquidity.mintDecimals.toNumber()!
      ).sub(
        amountToRepay.mul(1 + slippagePct / 100).mul(await getPriceMock(kaminoMarket, debtTokenMint, collTokenMint))
      ),
      lamportsToNumberDecimal(
        obligationAfter.state.deposits[0].depositedAmount.toNumber(),
        kaminoMarket.getReserveByMint(collTokenMint)?.state.liquidity.mintDecimals.toNumber()!
      ),
      0.001
    );

    assert(obligationAfter.loanToValue().equals(0));
  });

  it('repay_with_coll_full_sol_debt', async function () {
    const [collToken, debtToken] = ['MSOL', 'SOL'];
    const amountToDeposit = new Decimal(2.5);
    const amountToBorrow = new Decimal(1);
    const amountToRepay = amountToBorrow;
    const slippagePct = 0.5;

    console.log('Setting up market ===');
    const { env, kaminoMarket } = await createMarketWithTwoReservesToppedUp(
      [collToken, new Decimal(1000.05)],
      [debtToken, new Decimal(1000.05)]
    );
    const collTokenMint = kaminoMarket.getReserveBySymbol(collToken)?.getLiquidityMint()!;
    const debtTokenMint = kaminoMarket.getReserveBySymbol(debtToken)?.getLiquidityMint()!;

    console.log('Creating user ===');
    const borrower = await newUser(env, kaminoMarket, [
      [collToken, new Decimal(10)],
      [debtToken, new Decimal(10)],
    ]);

    console.log('Depositing coll ===');
    await sleep(1000);
    await deposit(env, kaminoMarket, borrower, collToken, amountToDeposit);

    console.log('Borrowing debt ===');
    await sleep(1000);
    await borrow(env, kaminoMarket, borrower, debtToken, amountToBorrow);

    console.log('Repaying with collateral ===');

    await sleep(2000);

    const obligationBefore = (await kaminoMarket.getUserObligationsByTag(VanillaObligation.tag, borrower.publicKey))[0];

    const repayWithCollTxRes = await repayWithCollTestAdapter(
      env,
      borrower,
      kaminoMarket,
      amountToRepay,
      debtTokenMint,
      collTokenMint,
      amountToBorrow.equals(amountToRepay),
      slippagePct,
      obligationBefore,
      (a: PublicKey, b: PublicKey) => getPriceMock(kaminoMarket, a, b),
      PublicKey.default
    );

    console.log('Repay with Coll txn:', repayWithCollTxRes);

    await sleep(2000);

    await kaminoMarket.reload();

    const obligationAfter = (await kaminoMarket.getUserObligationsByTag(VanillaObligation.tag, borrower.publicKey))[0];

    console.log('obligationBefore: ', obligationBefore.refreshedStats);
    console.log('obligationAfter: ', obligationAfter.refreshedStats);

    assert(
      lamportsToNumberDecimal(
        new Fraction(obligationAfter.state.borrows[0].borrowedAmountSf).toDecimal(),
        kaminoMarket.getReserveByMint(debtTokenMint)?.state.liquidity.mintDecimals.toNumber()!
      ).equals(0)
    );

    assertFuzzyEq(
      obligationBefore.refreshedStats.netAccountValue
        .sub(
          amountToRepay
            .mul(kaminoMarket.getReserveByMint(debtTokenMint)?.getReserveMarketPrice().toNumber()!)
            .mul(new Decimal(slippagePct).div('100'))
        )
        .toNumber(),
      obligationAfter.refreshedStats.netAccountValue.toNumber(),
      0.01
    );

    assertFuzzyEq(
      lamportsToNumberDecimal(
        obligationBefore.state.deposits[0].depositedAmount.toNumber(),
        kaminoMarket.getReserveByMint(collTokenMint)?.state.liquidity.mintDecimals.toNumber()!
      ).sub(
        amountToRepay.mul(1 + slippagePct / 100).mul(await getPriceMock(kaminoMarket, debtTokenMint, collTokenMint))
      ),
      lamportsToNumberDecimal(
        obligationAfter.state.deposits[0].depositedAmount.toNumber(),
        kaminoMarket.getReserveByMint(collTokenMint)?.state.liquidity.mintDecimals.toNumber()!
      ),
      0.001
    );

    assert(obligationAfter.loanToValue().equals(0));
  });

  it('repay_with_coll_full_sol_coll', async function () {
    const [collToken, debtToken] = ['SOL', 'USDC'];
    const amountToDeposit = new Decimal(2.5);
    const amountToBorrow = new Decimal(15);
    const amountToRepay = amountToBorrow;
    const slippagePct = 0.5;

    console.log('Setting up market ===');
    const { env, kaminoMarket } = await createMarketWithTwoReservesToppedUp(
      [collToken, new Decimal(1000.05)],
      [debtToken, new Decimal(1000.05)]
    );
    const collTokenMint = kaminoMarket.getReserveBySymbol(collToken)?.getLiquidityMint()!;
    const debtTokenMint = kaminoMarket.getReserveBySymbol(debtToken)?.getLiquidityMint()!;

    console.log('Creating user ===');
    const borrower = await newUser(env, kaminoMarket, [
      [collToken, new Decimal(10)],
      [debtToken, new Decimal(10)],
    ]);

    console.log('Depositing coll ===');
    await sleep(1000);
    await deposit(env, kaminoMarket, borrower, collToken, amountToDeposit);

    console.log('Borrowing debt ===');
    await sleep(1000);
    await borrow(env, kaminoMarket, borrower, debtToken, amountToBorrow);

    console.log('Repaying with collateral ===');

    await sleep(2000);

    const obligationBefore = (await kaminoMarket.getUserObligationsByTag(VanillaObligation.tag, borrower.publicKey))[0];

    const repayWithCollTxRes = await repayWithCollTestAdapter(
      env,
      borrower,
      kaminoMarket,
      amountToRepay,
      debtTokenMint,
      collTokenMint,
      amountToBorrow.equals(amountToRepay),
      slippagePct,
      obligationBefore,
      (a: PublicKey, b: PublicKey) => getPriceMock(kaminoMarket, a, b),
      PublicKey.default
    );

    console.log('Repay with Coll txn:', repayWithCollTxRes);

    await sleep(2000);

    await kaminoMarket.reload();

    const obligationAfter = (await kaminoMarket.getUserObligationsByTag(VanillaObligation.tag, borrower.publicKey))[0];

    console.log('obligationBefore: ', obligationBefore.refreshedStats);
    console.log('obligationAfter: ', obligationAfter.refreshedStats);

    assert(
      lamportsToNumberDecimal(
        new Fraction(obligationAfter.state.borrows[0].borrowedAmountSf).toDecimal(),
        kaminoMarket.getReserveByMint(debtTokenMint)?.state.liquidity.mintDecimals.toNumber()!
      ).equals(0)
    );

    assertFuzzyEq(
      obligationBefore.refreshedStats.netAccountValue
        .sub(
          amountToRepay
            .mul(kaminoMarket.getReserveByMint(debtTokenMint)?.getReserveMarketPrice().toNumber()!)
            .mul(new Decimal(slippagePct).div('100'))
        )
        .toNumber(),
      obligationAfter.refreshedStats.netAccountValue.toNumber(),
      0.01
    );

    assertFuzzyEq(
      lamportsToNumberDecimal(
        obligationBefore.state.deposits[0].depositedAmount.toNumber(),
        kaminoMarket.getReserveByMint(collTokenMint)?.state.liquidity.mintDecimals.toNumber()!
      ).sub(
        amountToRepay.mul(1 + slippagePct / 100).mul(await getPriceMock(kaminoMarket, debtTokenMint, collTokenMint))
      ),
      lamportsToNumberDecimal(
        obligationAfter.state.deposits[0].depositedAmount.toNumber(),
        kaminoMarket.getReserveByMint(collTokenMint)?.state.liquidity.mintDecimals.toNumber()!
      ),
      0.001
    );

    assert(obligationAfter.loanToValue().equals(0));
  });

  it('repay_with_coll_with_referrer_full_sol_coll', async function () {
    const [collToken, debtToken] = ['SOL', 'USDC'];
    const amountToDeposit = new Decimal(2.5);
    const amountToBorrow = new Decimal(15);
    const amountToRepay = amountToBorrow;
    const slippagePct = 0.5;

    console.log('Setting up market ===');
    const { env, kaminoMarket } = await createMarketWithTwoReservesToppedUp(
      [collToken, new Decimal(1000.05)],
      [debtToken, new Decimal(1000.05)]
    );

    await sleep(2000);
    await updateMarketReferralFeeBps(env, new PublicKey(kaminoMarket.address), 2000);

    const collTokenMint = kaminoMarket.getReserveBySymbol(collToken)?.getLiquidityMint()!;
    const debtTokenMint = kaminoMarket.getReserveBySymbol(debtToken)?.getLiquidityMint()!;

    const config = makeReserveConfigWithBorrowFeeAndTakeRate(debtToken);
    await sleep(2000);
    await updateReserve(env, kaminoMarket.getReserveBySymbol(debtToken)?.address!, config);
    await sleep(2000);

    const referrer = Keypair.generate();
    await env.provider.connection.requestAirdrop(referrer.publicKey, 2 * LAMPORTS_PER_SOL);

    console.log('Creating user ===');
    const borrower = await newUser(
      env,
      kaminoMarket,
      [
        [collToken, new Decimal(10)],
        [debtToken, new Decimal(10)],
      ],
      null,
      false,
      referrer
    );

    console.log('Depositing coll ===');
    await sleep(1000);
    await deposit(env, kaminoMarket, borrower, collToken, amountToDeposit);

    console.log('Borrowing debt ===');
    await sleep(1000);
    await borrow(env, kaminoMarket, borrower, debtToken, amountToBorrow);

    console.log('Repaying with collateral ===');

    await sleep(2000);

    const obligationBefore = (await kaminoMarket.getUserObligationsByTag(VanillaObligation.tag, borrower.publicKey))[0];

    const repayWithCollTxRes = await repayWithCollTestAdapter(
      env,
      borrower,
      kaminoMarket,
      amountToRepay,
      debtTokenMint,
      collTokenMint,
      amountToBorrow.equals(amountToRepay),
      slippagePct,
      obligationBefore,
      (a: PublicKey, b: PublicKey) => getPriceMock(kaminoMarket, a, b),
      PublicKey.default
    );

    console.log('Repay with Coll txn:', repayWithCollTxRes);

    await sleep(2000);

    await kaminoMarket.reload();

    const obligationAfter = (await kaminoMarket.getUserObligationsByTag(VanillaObligation.tag, borrower.publicKey))[0];

    console.log('obligationBefore: ', obligationBefore.refreshedStats);
    console.log('obligationAfter: ', obligationAfter.refreshedStats);

    assert(
      lamportsToNumberDecimal(
        new Fraction(obligationAfter.state.borrows[0].borrowedAmountSf).toDecimal(),
        kaminoMarket.getReserveByMint(debtTokenMint)?.state.liquidity.mintDecimals.toNumber()!
      ).equals(0)
    );

    assertFuzzyEq(
      obligationBefore.refreshedStats.netAccountValue
        .sub(
          amountToRepay
            .mul(kaminoMarket.getReserveByMint(debtTokenMint)?.getReserveMarketPrice().toNumber()!)
            .mul(new Decimal(slippagePct).div('100'))
        )
        .toNumber(),
      obligationAfter.refreshedStats.netAccountValue.toNumber(),
      0.01
    );

    assertFuzzyEq(
      lamportsToNumberDecimal(
        obligationBefore.state.deposits[0].depositedAmount.toNumber(),
        kaminoMarket.getReserveByMint(collTokenMint)?.state.liquidity.mintDecimals.toNumber()!
      ).sub(
        amountToRepay.mul(1 + slippagePct / 100).mul(await getPriceMock(kaminoMarket, debtTokenMint, collTokenMint))
      ),
      lamportsToNumberDecimal(
        obligationAfter.state.deposits[0].depositedAmount.toNumber(),
        kaminoMarket.getReserveByMint(collTokenMint)?.state.liquidity.mintDecimals.toNumber()!
      ),
      0.001
    );

    assert(obligationAfter.loanToValue().equals(0));

    const referrerDebtFeesUnclaimed = await kaminoMarket.getReferrerFeesUnclaimedForReserve(
      referrer.publicKey,
      kaminoMarket.getReserveByMint(debtTokenMint)!
    );

    assert(referrerDebtFeesUnclaimed.gt(0));
  });
});
