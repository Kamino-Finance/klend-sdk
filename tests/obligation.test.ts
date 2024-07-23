import {
  DefaultConfigParams,
  createMarketWithLoan,
  makeReserveConfig,
  createMarketWithTwoReservesToppedUp,
  newUser,
  deposit,
  sendTransactionsFromAction,
} from './setup_utils';
import { assert, expect } from 'chai';
import { BN } from '@coral-xyz/anchor';
import {
  fuzzyEq,
  initObligation,
  initUserMetadata,
  KaminoAction,
  PROGRAM_ID,
  sendTransactionV0,
  userMetadataPda,
  VanillaObligation,
} from '../src';
import { PublicKey, SystemProgram, SYSVAR_RENT_PUBKEY } from '@solana/web3.js';
import { sleep } from '@hubbleprotocol/farms-sdk';
import { updateReserve, updateReserveSingleValue } from './setup_operations';
import Decimal from 'decimal.js';
import { waitUntilMatches } from './assert';
import { UpdateConfigMode } from '../src/idl_codegen/types';

describe('obligation', function () {
  it('retrieve_a_fresh_obligation', async function () {
    const { env, kaminoMarket, obligation } = await createMarketWithLoan(new BN(0), new BN(0));

    const obligationType = new VanillaObligation(PROGRAM_ID);
    const [userMetadataAddress, _bump] = userMetadataPda(env.admin.publicKey);
    const initReferralIx = initUserMetadata(
      {
        userLookupTable: PublicKey.default,
      },
      {
        owner: env.admin.publicKey,
        feePayer: env.admin.publicKey,
        userMetadata: userMetadataAddress,
        referrerUserMetadata: kaminoMarket.programId,
        rent: SYSVAR_RENT_PUBKEY,
        systemProgram: SystemProgram.programId,
      }
    );
    const initObligationIx = initObligation(
      {
        args: {
          tag: obligationType.toArgs().tag,
          id: obligationType.toArgs().id,
        },
      },
      {
        obligationOwner: env.admin.publicKey,
        feePayer: env.admin.publicKey,
        obligation,
        lendingMarket: kaminoMarket.getAddress(),
        seed1Account: obligationType.toArgs().seed1,
        seed2Account: obligationType.toArgs().seed2,
        ownerUserMetadata: userMetadataAddress,
        rent: SYSVAR_RENT_PUBKEY,
        systemProgram: SystemProgram.programId,
      }
    );
    await sendTransactionV0(env.provider.connection, env.admin, [initReferralIx, initObligationIx]);
    await sleep(2000);
    const fetchedObligation = (await kaminoMarket.getObligationByAddress(obligation))!;

    expect(fetchedObligation).not.null;
    expect(fetchedObligation.state.owner.toBase58()).eq(env.admin.publicKey.toBase58());
    expect(fetchedObligation.loanToValue().toString()).eq('0');
    expect(fetchedObligation.getNumberOfPositions()).eq(0);
  });

  it('get_all_obligations_for_lending_market', async function () {
    const [usdh, usdc] = ['USDH', 'USDC'];

    const { env, kaminoMarket } = await createMarketWithTwoReservesToppedUp(
      [usdh, new Decimal(5000.05)],
      [usdc, new Decimal(5000.05)]
    );

    const user1 = await newUser(env, kaminoMarket, [[usdc, new Decimal(2000)]]);
    await deposit(env, kaminoMarket, user1, usdc, new Decimal(2000));
    const user2 = await newUser(env, kaminoMarket, [[usdc, new Decimal(2000)]]);
    await deposit(env, kaminoMarket, user2, usdc, new Decimal(2000));
    const user3 = await newUser(env, kaminoMarket, [[usdc, new Decimal(2000)]]);
    await deposit(env, kaminoMarket, user3, usdc, new Decimal(2000));

    await waitUntilMatches(async () => {
      const obligations = await kaminoMarket.getAllObligationsForMarket();
      expect(obligations.length).eq(4); // 3 users + initial obligation
    });
  });

  it('retrieve_an_active_obligation', async function () {
    const { env, kaminoMarket, obligation } = await createMarketWithLoan(new BN(100), new BN(50));
    const fetchedObligation = (await kaminoMarket.getObligationByAddress(obligation))!;

    expect(fetchedObligation).not.null;
    expect(fetchedObligation.state.owner.toBase58()).eq(env.admin.publicKey.toBase58());
    fuzzyEq(fetchedObligation.loanToValue(), '0.5');
  });

  it('retrieve_obligation_interest_rate', async function () {
    const { env, kaminoMarket, obligation } = await createMarketWithLoan(new BN(5000), new BN(1000));

    const reserve = kaminoMarket.getReserves()[0];
    const reserveConfig = makeReserveConfig(reserve.symbol, {
      ...DefaultConfigParams,
      protocolTakeRate: 100,
    });
    await updateReserve(env, reserve.address, reserveConfig);

    await sleep(8000);

    const fetchedObligation = (await kaminoMarket.getObligationByAddress(obligation))!;

    // Reload the reserve to get the updated config
    await reserve.load(reserve.tokenOraclePrice);

    const interestRate = fetchedObligation.estimateObligationInterestRate(
      kaminoMarket,
      reserve,
      fetchedObligation.state.borrows[0],
      await env.provider.connection.getSlot()
    );

    console.log('interest rate: ' + interestRate);

    const currentSlot = await kaminoMarket.getConnection().getSlot();

    assert(interestRate.gt(1));
    assert.ok(fuzzyEq(interestRate, 1));

    const reserveBorrowApr = reserve.totalBorrowAPY(currentSlot);
    assert(reserveBorrowApr > 1);

    const reserveSupplyApr = reserve.totalSupplyAPY(currentSlot);
    assert(reserveSupplyApr === 0);
  });

  it('request_elevation_group_update_on_borrow', async function () {
    const [usdh, usdc] = ['USDH', 'USDC'];

    const { env, secondMint, kaminoMarket } = await createMarketWithTwoReservesToppedUp(
      [usdh, new Decimal(5000.05)],
      [usdc, new Decimal(5000.05)],
      true
    );

    const user1 = await newUser(env, kaminoMarket, [[usdh, new Decimal(2000)]]);
    await deposit(env, kaminoMarket, user1, usdh, new Decimal(2000));

    const buffer = Buffer.alloc(8 * 32);
    buffer.writeBigUint64LE(BigInt(10_000), 0);

    const collReserve = kaminoMarket.getReserveBySymbol(usdh);

    await updateReserveSingleValue(
      env,
      collReserve!,
      buffer,
      UpdateConfigMode.UpdateBorrowLimitsInElevationGroupAgainstThisReserve.discriminator + 1 // discriminator + 1 matches the enum
    );

    const obligationBefore = (await kaminoMarket.getObligationByWallet(
      user1.publicKey,
      new VanillaObligation(PROGRAM_ID)
    ))!;

    const liquidationLtvBefore = obligationBefore.refreshedStats.liquidationLtv;

    const borrowAction = await KaminoAction.buildBorrowTxns(
      kaminoMarket,
      '1000',
      secondMint,
      user1.publicKey,
      new VanillaObligation(PROGRAM_ID),
      300_000,
      true,
      true
    );

    await sendTransactionsFromAction(env, borrowAction, user1, [user1]);

    const obligationAfter = (await kaminoMarket.getObligationByWallet(
      user1.publicKey,
      new VanillaObligation(PROGRAM_ID)
    ))!;

    const liquidationLtvAfter = obligationAfter.refreshedStats.liquidationLtv;

    assert(liquidationLtvAfter > liquidationLtvBefore);
  });
});
