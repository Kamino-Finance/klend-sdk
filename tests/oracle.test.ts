import { OracleType, Scope } from '@hubbleprotocol/scope-sdk';
import { createMarket, createReserve, updateReserve } from './setup_operations';
import { DefaultConfigParams, initEnv, makeReserveConfig, sendTransactionsFromAction } from './setup_utils';
import { createAta, createMint, mintTo } from './token_utils';
import {
  DEFAULT_RECENT_SLOT_DURATION_MS,
  KaminoAction,
  KaminoMarket,
  PROGRAM_ID,
  VanillaObligation,
  sleep,
} from '../src';
import BN from 'bn.js';

describe('scope_oracle_tests', function () {
  it('JLP_scope', async function () {
    const env = await initEnv('localnet');
    const [, lendingMarket] = await createMarket(env);
    const jlp = await createMint(env, env.admin.publicKey, 6);
    const [, jlpReserve] = await createReserve(env, lendingMarket.publicKey, jlp);

    const scope = new Scope('localnet', env.provider.connection);
    const [, configAccount] = await scope.getFeedConfiguration({ feed: 'hubble' });
    const reserveConfig = makeReserveConfig('JLP', {
      ...DefaultConfigParams,
      priceFeed: {
        type: new OracleType.JupiterLpScope(),
        price: configAccount.oraclePrices,
        chain: [362].concat(Array(3).fill(65535)),
      },
    });
    await updateReserve(env, jlpReserve.publicKey, reserveConfig);

    const kaminoMarket = (await KaminoMarket.load(
      env.provider.connection,
      lendingMarket.publicKey,
      DEFAULT_RECENT_SLOT_DURATION_MS,
      PROGRAM_ID,
      true
    ))!;

    const [, jlpAta] = await createAta(env, env.admin.publicKey, jlp);
    await sleep(2000);
    await mintTo(env, jlp, jlpAta, 1000_000000);

    const kaminoAction = await KaminoAction.buildDepositTxns(
      kaminoMarket,
      new BN(1_000000),
      jlp,
      env.admin.publicKey,
      new VanillaObligation(PROGRAM_ID)
    );
    try {
      await sendTransactionsFromAction(env, kaminoAction, env.admin);
    } catch (e) {
      console.log('error', e);
    }
  });
  it('JLP_compute', async function () {
    const env = await initEnv('localnet');
    const [, lendingMarket] = await createMarket(env);
    const jlp = await createMint(env, env.admin.publicKey, 6);
    const [, jlpReserve] = await createReserve(env, lendingMarket.publicKey, jlp);

    const scope = new Scope('localnet', env.provider.connection);
    const [, configAccount] = await scope.getFeedConfiguration({ feed: 'hubble' });
    const reserveConfig = makeReserveConfig('JLP', {
      ...DefaultConfigParams,
      priceFeed: {
        type: new OracleType.JupiterLpScope(),
        price: configAccount.oraclePrices,
        chain: [136].concat(Array(3).fill(65535)),
      },
    });
    await updateReserve(env, jlpReserve.publicKey, reserveConfig);

    const kaminoMarket = (await KaminoMarket.load(
      env.provider.connection,
      lendingMarket.publicKey,
      DEFAULT_RECENT_SLOT_DURATION_MS,
      PROGRAM_ID,
      true
    ))!;

    const [, jlpAta] = await createAta(env, env.admin.publicKey, jlp);
    await sleep(2000);
    await mintTo(env, jlp, jlpAta, 1000_000000);

    const kaminoAction = await KaminoAction.buildDepositTxns(
      kaminoMarket,
      new BN(1_000000),
      jlp,
      env.admin.publicKey,
      new VanillaObligation(PROGRAM_ID)
    );
    try {
      await sendTransactionsFromAction(env, kaminoAction, env.admin);
    } catch (e) {
      console.log('error', e);
    }
  });
  it('JLP_fetch', async function () {
    const env = await initEnv('localnet');
    const [, lendingMarket] = await createMarket(env);
    const jlp = await createMint(env, env.admin.publicKey, 6);
    const [, jlpReserve] = await createReserve(env, lendingMarket.publicKey, jlp);

    const scope = new Scope('localnet', env.provider.connection);
    const [, configAccount] = await scope.getFeedConfiguration({ feed: 'hubble' });

    const reserveConfig = makeReserveConfig('JLP', {
      ...DefaultConfigParams,
      priceFeed: {
        type: new OracleType.JupiterLpFetch(),
        price: configAccount.oraclePrices,
        chain: [124].concat(Array(3).fill(65535)),
      },
    });
    await updateReserve(env, jlpReserve.publicKey, reserveConfig);

    const kaminoMarket = (await KaminoMarket.load(
      env.provider.connection,
      lendingMarket.publicKey,
      DEFAULT_RECENT_SLOT_DURATION_MS,
      PROGRAM_ID,
      true
    ))!;

    const [, jlpAta] = await createAta(env, env.admin.publicKey, jlp);
    await sleep(2000);
    await mintTo(env, jlp, jlpAta, 1000_000000);

    const kaminoAction = await KaminoAction.buildDepositTxns(
      kaminoMarket,
      new BN(1_000000),
      jlp,
      env.admin.publicKey,
      new VanillaObligation(PROGRAM_ID)
    );
    try {
      await sendTransactionsFromAction(env, kaminoAction, env.admin);
    } catch (e) {
      console.log('error', e);
    }
  });
  it('jitosol_spl_stake', async function () {
    const env = await initEnv('localnet');
    const [, lendingMarket] = await createMarket(env);
    const jitosol = await createMint(env, env.admin.publicKey, 9);
    const [, jitosolReserve] = await createReserve(env, lendingMarket.publicKey, jitosol);

    const scope = new Scope('localnet', env.provider.connection);
    const [, configAccount] = await scope.getFeedConfiguration({ feed: 'hubble' });

    const reserveConfig = makeReserveConfig('JITOSOL', {
      ...DefaultConfigParams,
      priceFeed: {
        type: new OracleType.SplStake(),
        price: configAccount.oraclePrices,
        chain: [51].concat(Array(3).fill(65535)),
      },
    });
    await updateReserve(env, jitosolReserve.publicKey, reserveConfig);

    const kaminoMarket = (await KaminoMarket.load(
      env.provider.connection,
      lendingMarket.publicKey,
      DEFAULT_RECENT_SLOT_DURATION_MS,
      PROGRAM_ID,
      true
    ))!;

    const [, jitosolAta] = await createAta(env, env.admin.publicKey, jitosol);
    await sleep(2000);
    await mintTo(env, jitosol, jitosolAta, 1000_000000000);

    const kaminoAction = await KaminoAction.buildDepositTxns(
      kaminoMarket,
      new BN(10_000000000),
      jitosol,
      env.admin.publicKey,
      new VanillaObligation(PROGRAM_ID)
    );
    try {
      await sendTransactionsFromAction(env, kaminoAction, env.admin);
    } catch (e) {
      console.log('error', e);
    }
  });
});
