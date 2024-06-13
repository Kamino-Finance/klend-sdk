import { Env, createLookupTable, initEnv, makeReserveConfig, sendTransactionsFromAction } from '../setup_utils';
import { createMarket, createReserve, updateReserve } from '../setup_operations';
import { addRewardToFarm, initializeFarmsForReserve, topUpRewardToFarm, updateRps } from '../farms_operations';
import { createAta, createMint, mintTo } from '../token_utils';
import Decimal from 'decimal.js';
import { DEFAULT_RECENT_SLOT_DURATION_MS, KaminoAction, KaminoMarket, PROGRAM_ID, Reserve } from '../../src';
import { sleep, VanillaObligation } from '../../src';
import { PublicKey } from '@solana/web3.js';
import { FarmState } from '@hubbleprotocol/farms-sdk';
import * as assert from 'assert';

describe('farming_lending_market', function () {
  it('create_farm_for_reserve', async function () {
    const env = await initEnv('localnet');

    const [createMarketSig, lendingMarket] = await createMarket(env);
    await sleep(2000);
    console.log(createMarketSig);

    const usdh = await createMint(env, env.admin.publicKey, 6);
    await sleep(2000);
    const [createReserveSig, reserve] = await createReserve(env, lendingMarket.publicKey, usdh);
    console.log(createReserveSig);
    await sleep(2000);

    const config = makeReserveConfig('USDH');
    const updateReserveSig = await updateReserve(env, reserve.publicKey, config);
    console.log(updateReserveSig);
    await sleep(2000);

    await initializeFarmsForReserve(env, lendingMarket.publicKey, reserve.publicKey, 'Collateral', false, false);
  });

  it('add_reward_to_farm', async function () {
    const env = await initEnv('localnet');

    const [createMarketSig, lendingMarket] = await createMarket(env);
    console.log(createMarketSig);
    await sleep(2000);

    const usdh = await createMint(env, env.admin.publicKey, 6);
    await sleep(2000);
    const [_signatureAta, usdhAta] = await createAta(env, env.admin.publicKey, usdh);
    await sleep(2000);

    await mintTo(env, usdh, usdhAta, 1000000000);

    const [_createReserveSig, reserve] = await createReserve(env, lendingMarket.publicKey, usdh);
    await sleep(2000);

    const config = makeReserveConfig('USDH');
    const kind = 'Collateral';
    const updateReserveSig = await updateReserve(env, reserve.publicKey, config);
    await sleep(2000);

    console.log(updateReserveSig);

    await initializeFarmsForReserve(env, lendingMarket.publicKey, reserve.publicKey, kind, false, false);
    await sleep(2000);

    await addRewardToFarm(env, usdh, reserve.publicKey, kind);
    await sleep(2000);

    const reserveState: Reserve = (await Reserve.fetch(env.provider.connection, reserve.publicKey))!!;
    const farmAddress = kind === 'Collateral' ? reserveState.farmCollateral : reserveState.farmDebt;

    await topUpRewardToFarm(env, usdh, new Decimal('100'), reserve.publicKey, kind);
    await sleep(2000);
    await updateRps(env, usdh, 5, reserve.publicKey, kind);
    await sleep(2000);

    const farmState = (await FarmState.fetch(env.provider.connection, farmAddress))!;
    assert.ok(farmState.rewardInfos[0].rewardsAvailable.toNumber() > 0);
    assert.ok(farmState.rewardInfos[0].token.mint.toString() === usdh.toString());
    assert.ok(farmState.rewardInfos[0].rewardScheduleCurve.points[0].rewardPerTimeUnit.toNumber() === 5);
  });

  it('farm_reward_info', async function () {
    const env = await initEnv('localnet');
    const kind = 'Collateral';
    const [initTotalDeposit, initTotalBorrow] = [200_000_000, 70_000_000];
    const { kaminoMarket } = await createRewardsScenario(env, kind, initTotalDeposit, initTotalBorrow);

    await sleep(2000);
    await kaminoMarket.loadReserves();

    // Farm info
    const getRewardPrice = async (_mint: PublicKey) => 1.0;
    const { depositingRewards, borrowingRewards } = await kaminoMarket.getReserveFarmInfo(
      kaminoMarket.getReserveBySymbol('USDH')!.getLiquidityMint(),
      getRewardPrice
    );
    console.log('Collateral Rewards', depositingRewards);
    console.log('Debt Rewards', borrowingRewards);
  });
});

const createRewardsScenario = async (env: Env, kind: string, deposit: number, borrow: number) => {
  const [createMarketSig, lendingMarket] = await createMarket(env);
  console.log(createMarketSig);

  const symbol = 'USDH';
  const usdh = await createMint(env, env.admin.publicKey, 6);
  await sleep(2000);
  const [_signatureAta, usdhAta] = await createAta(env, env.admin.publicKey, usdh);
  await sleep(2000);

  await mintTo(env, usdh, usdhAta, 1000000000);

  const [_createReserveSig, reserve] = await createReserve(env, lendingMarket.publicKey, usdh);
  await sleep(2000);

  const config = makeReserveConfig(symbol);
  const updateReserveSig = await updateReserve(env, reserve.publicKey, config);
  console.log('Update Reserve', updateReserveSig);
  await sleep(2000);

  await initializeFarmsForReserve(env, lendingMarket.publicKey, reserve.publicKey, kind, false, false);
  await sleep(2000);

  const addRewardSignature = await addRewardToFarm(env, usdh, reserve.publicKey, kind);
  console.log('Add Reward', addRewardSignature);
  await sleep(2000);

  const topUpRewardToFarmSignature = await topUpRewardToFarm(env, usdh, new Decimal('100'), reserve.publicKey, kind);
  console.log('Top up reward', topUpRewardToFarmSignature);
  await sleep(2000);

  const updateRpsSig = await updateRps(env, usdh, 5, reserve.publicKey, kind);
  console.log('Update rps', updateRpsSig);
  await sleep(2000);

  const kaminoMarket = (await KaminoMarket.load(
    env.provider.connection,
    lendingMarket.publicKey,
    DEFAULT_RECENT_SLOT_DURATION_MS,
    PROGRAM_ID,
    true
  ))!;

  if (deposit > 0) {
    const depositAction = await KaminoAction.buildDepositTxns(
      kaminoMarket,
      deposit.toString(),
      usdh,
      env.admin.publicKey,
      new VanillaObligation(PROGRAM_ID),
      1_000_000,
      true
    );
    const depositSetupLut = await createLookupTable(
      env,
      depositAction.setupIxs
        .map((ixn) => ixn.keys)
        .flat()
        .map((key) => key.pubkey)
    );
    await sleep(2000);
    await sendTransactionsFromAction(env, depositAction, env.admin, [], [depositSetupLut]);
    await sleep(2000);
  }

  if (borrow > 0) {
    const borrowAction = await KaminoAction.buildBorrowTxns(
      kaminoMarket,
      borrow.toString(),
      usdh,
      env.admin.publicKey,
      new VanillaObligation(PROGRAM_ID),
      1_000_000,
      true
    );
    await sendTransactionsFromAction(env, borrowAction, env.admin);
    await sleep(2000);
  }

  return { kaminoMarket, reserve };
};
