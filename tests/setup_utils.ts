import * as anchor from '@coral-xyz/anchor';
import { BN } from '@coral-xyz/anchor';
import Decimal from 'decimal.js';

import {
  AddressLookupTableProgram,
  ConnectionConfig,
  Keypair,
  LAMPORTS_PER_SOL,
  PublicKey,
  SYSVAR_RENT_PUBKEY,
  SystemProgram,
  TransactionInstruction,
  TransactionSignature,
} from '@solana/web3.js';
import {
  buildAndSendTxnWithLogs,
  buildVersionedTransaction,
  checkIfAccountExists,
  createAssociatedTokenAccountIdempotentInstruction,
  DEFAULT_RECENT_SLOT_DURATION_MS,
  getAssociatedTokenAddress,
  getDepositWsolIxns,
  getUserLutAddressAndSetupIxns,
  idl,
  initReferrerTokenState,
  KaminoAction,
  KaminoMarket,
  lamportsToNumberDecimal,
  NULL_PUBKEY,
  numberToLamportsDecimal,
  ObligationType,
  PROGRAM_ID,
  referrerTokenStatePda,
  sleep,
  toJson,
  U64_MAX,
  VanillaObligation,
} from '../src';
import {
  BorrowRateCurve,
  BorrowRateCurveFields,
  CurvePoint,
  PriceHeuristic,
  PythConfiguration,
  ReserveConfig,
  ReserveConfigFields,
  ScopeConfiguration,
  SwitchboardConfiguration,
  TokenInfo,
  WithdrawalCaps,
} from '../src/idl_codegen/types';
import {
  createMarket,
  createReserve,
  updateMarketElevationGroup,
  updateMarketMultiplierPoints,
  updateReserve,
} from './setup_operations';
import { createAta, createMint, getBurnFromIx, getMintToIx, mintTo } from './token_utils';
import {
  TOKEN_PROGRAM_ID,
  createTransferCheckedInstruction,
  getMint,
  createCloseAccountInstruction,
} from '@solana/spl-token';
import { Price, PriceFeed, getPriceAcc } from './kamino/price';
import { AssetQuantityTuple, isKToken } from './kamino/utils';
import {
  crankStrategyScopePrices,
  createKTokenStrategy,
  createKaminoClient,
  mintKTokenToUser,
  mintToUser,
  setUpCollateralInfo,
  setUpGlobalConfig,
} from './kamino/kamino_operations';
import { OracleType, Scope, U16_MAX } from '@hubbleprotocol/scope-sdk';
import { addKTokenScopePriceMapping, createScopeFeed } from './kamino/scope';
import { Kamino } from '@hubbleprotocol/kamino-sdk';
import { Fraction, ZERO_FRACTION } from '../src/classes/fraction';
import { WRAPPED_SOL_MINT } from '@jup-ag/core';

export type Cluster = 'localnet' | 'devnet' | 'mainnet-beta';

export type Env = {
  provider: anchor.AnchorProvider;
  program: anchor.Program;
  admin: Keypair;
  wallet: anchor.Wallet;

  /**
   * Unique identifier for the test case
   * - used to create unique scope feeds
   */
  testCase: string;
};

export async function initEnv(cluster: Cluster | string, adminKeypair: Keypair | null = null): Promise<Env> {
  const endpoint = endpointFromCluster(cluster);

  const config: ConnectionConfig = {
    commitment: 'processed',
    confirmTransactionInitialTimeout: 220000,
  };

  console.log(`Connecting to ${endpoint}...`);
  const connection = new anchor.web3.Connection(endpoint, config);

  const admin = adminKeypair ?? Keypair.generate();

  if (cluster === 'localnet' || cluster === 'devnet') {
    await connection.requestAirdrop(admin.publicKey, 10 * LAMPORTS_PER_SOL);
    await sleep(2000);
  }

  const wallet = new anchor.Wallet(admin);
  const provider = new anchor.AnchorProvider(connection, wallet, {
    preflightCommitment: 'processed',
  });

  const env: Env = {
    provider: new anchor.AnchorProvider(connection, wallet, {
      preflightCommitment: 'processed',
    }),
    program: new anchor.Program(idl, PROGRAM_ID, provider),
    admin,
    wallet,
    testCase: `${Date.now().toString()}-${Math.floor(Math.random() * 1000000) + 1}`,
  };

  return env;
}

export function endpointFromCluster(cluster: Cluster | string): string {
  if (cluster === 'localnet') {
    return 'http://127.0.0.1:8899';
  } else if (cluster === 'devnet') {
    return 'https://api.devnet.solana.com';
  } else if (cluster === 'mainnet-beta') {
    return 'https://api.mainnet-beta.solana.com';
  } else {
    return cluster;
  }
}

export const makeReserveConfigWithBorrowFee = (tokenName: string) => {
  return makeReserveConfig(tokenName, { ...DefaultConfigParams, borrowFeeSf: Fraction.fromBps(new Decimal(0.1)) });
};

export const makeReserveConfigWithBorrowFeeAndTakeRate = (tokenName: string) => {
  return makeMockOracleConfig(tokenName, {
    ...DefaultConfigParams,
    borrowFeeSf: Fraction.fromBps(new Decimal(0.1)),
    protocolTakeRate: 10,
  });
};

export type ConfigParams = {
  loanToValuePct: number;
  maxLiquidationBonusBps: number;
  minLiquidationBonusBps: number;
  badDebtLiquidationBonusBps: number;
  liquidationThreshold: number;
  borrowFeeSf: Fraction;
  flashLoanFeeSf: Fraction;
  protocolTakeRate: number;
  elevationGroups: number[];
  priceFeed: PriceFeed | null;
  borrowLimit: BN;
};

export const DefaultConfigParams: ConfigParams = {
  loanToValuePct: 75,
  maxLiquidationBonusBps: 500,
  minLiquidationBonusBps: 200,
  badDebtLiquidationBonusBps: 10,
  liquidationThreshold: 85,
  borrowFeeSf: ZERO_FRACTION,
  flashLoanFeeSf: ZERO_FRACTION,
  protocolTakeRate: 0,
  elevationGroups: [0, 0, 0, 0, 0],
  priceFeed: null,
  borrowLimit: new BN(10_000_000_000_000),
};

export const makeReserveConfig = (tokenName: string, params: ConfigParams = DefaultConfigParams) => {
  const pythUsdcPrice = new PublicKey('Gnt27xtC473ZT2Mw5u8wZ68Z3gULkSTb5DuxJy7eJotD');
  const pythMSolPrice = new PublicKey('E4v1BBgoso9s64TQvmyownAVJbhbEPGyzA3qn4n46qj9');
  const priceToOracleMap = {
    SOL: pythMSolPrice,
    STSOL: pythMSolPrice,
    MSOL: pythMSolPrice,
    USDC: pythUsdcPrice,
    USDH: pythUsdcPrice,
    USDT: pythUsdcPrice,
    UXD: pythUsdcPrice,
    PYUSD: pythUsdcPrice,
  };

  const priceFeed = params.priceFeed
    ? params.priceFeed
    : {
        type: new OracleType.Pyth(),
        price: priceToOracleMap[tokenName],
        chain: undefined,
      };

  const reserveConfig: ReserveConfigFields = {
    status: 0,
    loanToValuePct: params.loanToValuePct,
    liquidationThresholdPct: params.liquidationThreshold,
    minLiquidationBonusBps: params.minLiquidationBonusBps,
    protocolLiquidationFeePct: 0,
    protocolTakeRatePct: params.protocolTakeRate,
    assetTier: 0,
    multiplierSideBoost: Array(2).fill(1),
    maxLiquidationBonusBps: params.maxLiquidationBonusBps,
    badDebtLiquidationBonusBps: params.badDebtLiquidationBonusBps,
    fees: {
      borrowFeeSf: params.borrowFeeSf.getValue(),
      flashLoanFeeSf: params.flashLoanFeeSf.getValue(),
      padding: Array(6).fill(0),
    },
    depositLimit: new BN(10_000_000_000_000),
    borrowLimit: params.borrowLimit,
    tokenInfo: {
      name: encodeTokenName(tokenName),
      heuristic: new PriceHeuristic({
        lower: new BN(0),
        upper: new BN(0),
        exp: new BN(0),
      }),
      maxTwapDivergenceBps: new BN(0),
      maxAgePriceSeconds: new BN(1_000_000_000),
      maxAgeTwapSeconds: new BN(0),
      ...getOracleConfigs(priceFeed),
      padding: Array(20).fill(new BN(0)),
    } as TokenInfo,
    borrowRateCurve: new BorrowRateCurve({
      points: [
        new CurvePoint({ utilizationRateBps: 0, borrowRateBps: 1 }),
        new CurvePoint({ utilizationRateBps: 100, borrowRateBps: 100 }),
        new CurvePoint({ utilizationRateBps: 10000, borrowRateBps: 100000 }),
        ...Array(8).fill(new CurvePoint({ utilizationRateBps: 10000, borrowRateBps: 100000 })),
      ],
    } as BorrowRateCurveFields),
    depositWithdrawalCap: new WithdrawalCaps({
      configCapacity: new BN(0),
      currentTotal: new BN(0),
      lastIntervalStartTimestamp: new BN(0),
      configIntervalLengthSeconds: new BN(0),
    }),
    debtWithdrawalCap: new WithdrawalCaps({
      configCapacity: new BN(0),
      currentTotal: new BN(0),
      lastIntervalStartTimestamp: new BN(0),
      configIntervalLengthSeconds: new BN(0),
    }),
    deleveragingMarginCallPeriodSecs: new BN(259200), // 3 days
    borrowFactorPct: new BN(100),
    elevationGroups: params.elevationGroups,
    deleveragingThresholdSlotsPerBps: new BN(7200), // 0.01% per hour
    multiplierTagBoost: Array(8).fill(1),
    disableUsageAsCollOutsideEmode: 0,
    borrowLimitOutsideElevationGroup: new BN(U64_MAX),
    borrowLimitAgainstThisCollateralInElevationGroup: [...Array(32)].map(() => new BN(0)),
    utilizationLimitBlockBorrowingAbove: 0,
    hostFixedInterestRateBps: 0,
    reserved1: Array(3).fill(0),
  };
  return new ReserveConfig(reserveConfig);
};

export function getOracleConfigs(priceFeed: PriceFeed): {
  pythConfiguration: PythConfiguration;
  switchboardConfiguration: SwitchboardConfiguration;
  scopeConfiguration: ScopeConfiguration;
} {
  let pythConfiguration = new PythConfiguration({
    price: NULL_PUBKEY,
  });
  let switchboardConfiguration = new SwitchboardConfiguration({
    priceAggregator: NULL_PUBKEY,
    twapAggregator: NULL_PUBKEY,
  });
  let scopeConfiguration = new ScopeConfiguration({
    priceFeed: NULL_PUBKEY,
    priceChain: [65535, 65535, 65535, 65535],
    twapChain: [65535, 65535, 65535, 65535],
  });

  const { type, price, chain } = priceFeed;

  switch (type.kind) {
    case new OracleType.Pyth().kind: {
      pythConfiguration = new PythConfiguration({ price });
      break;
    }
    case new OracleType.SwitchboardV2().kind: {
      switchboardConfiguration = new SwitchboardConfiguration({
        ...switchboardConfiguration,
        priceAggregator: price,
      });
      break;
    }
    case new OracleType.KToken().kind: {
      scopeConfiguration = new ScopeConfiguration({
        ...scopeConfiguration,
        priceFeed: price,
        priceChain: chain!.concat(Array(4 - chain!.length).fill(U16_MAX)),
      });
      break;
    }
    default:
      throw new Error('Invalid oracle type');
  }
  return {
    pythConfiguration,
    switchboardConfiguration,
    scopeConfiguration,
  };
}

// For tests with multiple tokens where we don't have oracles for all in SDK
export const makeMockOracleConfig = (tokenName: string, params: ConfigParams = DefaultConfigParams) => {
  const pythUsdcPrice = new PublicKey('Gnt27xtC473ZT2Mw5u8wZ68Z3gULkSTb5DuxJy7eJotD');
  const pythMSolPrice = new PublicKey('E4v1BBgoso9s64TQvmyownAVJbhbEPGyzA3qn4n46qj9');

  let oracle = pythUsdcPrice;
  if (tokenName === 'SOL' || tokenName === 'MSOL') {
    oracle = pythMSolPrice;
  }

  console.log('makeReserveConfig', tokenName, oracle.toString());

  const reserveConfig: ReserveConfigFields = {
    status: 0,
    loanToValuePct: params.loanToValuePct,
    liquidationThresholdPct: params.liquidationThreshold,
    minLiquidationBonusBps: params.minLiquidationBonusBps,
    protocolLiquidationFeePct: 0,
    protocolTakeRatePct: params.protocolTakeRate,
    assetTier: 0,
    multiplierSideBoost: Array(2).fill(1),
    maxLiquidationBonusBps: params.maxLiquidationBonusBps,
    badDebtLiquidationBonusBps: params.badDebtLiquidationBonusBps,
    fees: {
      borrowFeeSf: params.borrowFeeSf.getValue(),
      flashLoanFeeSf: params.flashLoanFeeSf.getValue(),
      padding: Array(6).fill(0),
    },
    depositLimit: new BN(10_000_000_000_000),
    borrowLimit: new BN(10_000_000_000_000),
    tokenInfo: {
      name: encodeTokenName(tokenName),
      heuristic: new PriceHeuristic({
        lower: new BN(0),
        upper: new BN(0),
        exp: new BN(0),
      }),
      maxTwapDivergenceBps: new BN(0),
      maxAgePriceSeconds: new BN(1_000_000_000),
      maxAgeTwapSeconds: new BN(0),
      scopeConfiguration: new ScopeConfiguration({
        priceFeed: NULL_PUBKEY,
        priceChain: [0, 65535, 65535, 65535],
        twapChain: [0, 65535, 65535, 65535],
      }),
      switchboardConfiguration: new SwitchboardConfiguration({
        priceAggregator: NULL_PUBKEY,
        twapAggregator: NULL_PUBKEY,
      }),
      pythConfiguration: new PythConfiguration({
        price: oracle,
      }),
      padding: Array(20).fill(new BN(0)),
    } as TokenInfo,
    borrowRateCurve: new BorrowRateCurve({
      points: [
        new CurvePoint({ utilizationRateBps: 0, borrowRateBps: 1 }),
        new CurvePoint({ utilizationRateBps: 100, borrowRateBps: 100 }),
        new CurvePoint({ utilizationRateBps: 10000, borrowRateBps: 100000 }),
        ...Array(8).fill(new CurvePoint({ utilizationRateBps: 10000, borrowRateBps: 100000 })),
      ],
    } as BorrowRateCurveFields),
    depositWithdrawalCap: new WithdrawalCaps({
      configCapacity: new BN(0),
      currentTotal: new BN(0),
      lastIntervalStartTimestamp: new BN(0),
      configIntervalLengthSeconds: new BN(0),
    }),
    debtWithdrawalCap: new WithdrawalCaps({
      configCapacity: new BN(0),
      currentTotal: new BN(0),
      lastIntervalStartTimestamp: new BN(0),
      configIntervalLengthSeconds: new BN(0),
    }),
    deleveragingMarginCallPeriodSecs: new BN(259200), // 3 days
    borrowFactorPct: new BN(100),
    elevationGroups: [...Array(20)].map(() => 0),
    utilizationLimitBlockBorrowingAbove: 0,
    deleveragingThresholdSlotsPerBps: new BN(7200), // 0.01% per hour
    multiplierTagBoost: Array(8).fill(0),
    disableUsageAsCollOutsideEmode: 0,
    borrowLimitOutsideElevationGroup: new BN(10_000_000_000_000),
    borrowLimitAgainstThisCollateralInElevationGroup: [...Array(32)].map(() => new BN(0)),
    hostFixedInterestRateBps: 0,
    reserved1: Array(3).fill(0),
  };
  return new ReserveConfig(reserveConfig);
};

const encodeTokenName = (tokenName: string): number[] => {
  const buffer: Buffer = Buffer.alloc(32);

  const tokenNameEncoded = new Uint8Array(32);
  const s: Uint8Array = new TextEncoder().encode(tokenName);
  tokenNameEncoded.set(s);
  for (let i = 0; i < tokenNameEncoded.length; i++) {
    buffer[i] = tokenNameEncoded[i];
  }

  const result = [...buffer];
  return result;
};

export const sendTransactionsFromAction = async (
  env: Env,
  kaminoAction: KaminoAction,
  signers: Array<Keypair> = [],
  loookupTables: Array<PublicKey> = []
): Promise<TransactionSignature> => {
  if (kaminoAction.preTxnIxs.length > 0) {
    const preTxn = await buildVersionedTransaction(
      env.provider.connection,
      env.admin.publicKey,
      kaminoAction.preTxnIxs
    );
    console.log('PreTxnIxns:', kaminoAction.preTxnIxsLabels);
    const txHash = await buildAndSendTxnWithLogs(env.provider.connection, preTxn, env.admin, signers);
    console.log(`PreTxnIxns hash: ${txHash}`);
    await sleep(2000);
  }

  const tx = await buildVersionedTransaction(
    env.provider.connection,
    env.admin.publicKey,
    [...kaminoAction.setupIxs, ...kaminoAction.lendingIxs, ...kaminoAction.cleanupIxs],
    loookupTables
  );

  console.log('SetupIxns:', kaminoAction.setupIxsLabels);
  console.log('LendingIxns:', kaminoAction.lendingIxsLabels);
  console.log('CleanupIxns:', kaminoAction.cleanupIxsLabels);

  return await buildAndSendTxnWithLogs(env.provider.connection, tx, env.admin, signers);
};

export const createMarketWithLoan = async (deposit: BN, borrow: BN) => {
  const env = await initEnv('localnet');
  const symbol = 'USDH';

  const [createMarketSig, lendingMarket] = await createMarket(env);
  console.log(createMarketSig);
  await sleep(2000);

  const usdh = await createMint(env, env.admin.publicKey, 6);
  await sleep(2000);
  const [, reserve] = await createReserve(env, lendingMarket.publicKey, usdh);
  await sleep(2000);

  const reserveConfig = makeReserveConfig(symbol);
  await updateReserve(env, reserve.publicKey, reserveConfig);
  await sleep(2000);

  const [, usdhAta] = await createAta(env, env.admin.publicKey, usdh);
  await sleep(2000);
  await mintTo(env, usdh, usdhAta, 1000_000000);
  await sleep(2000);

  const kaminoMarket = (await KaminoMarket.load(
    env.provider.connection,
    lendingMarket.publicKey,
    DEFAULT_RECENT_SLOT_DURATION_MS,
    PROGRAM_ID,
    true
  ))!;

  if (deposit.gt(new BN(0))) {
    const depositAction = await KaminoAction.buildDepositTxns(
      kaminoMarket,
      deposit,
      usdh,
      env.admin.publicKey,
      new VanillaObligation(PROGRAM_ID),
      1_000_000,
      true
    );
    await sendTransactionsFromAction(env, depositAction);
    await sleep(2000);
  }
  if (borrow.gt(new BN(0))) {
    const borrowAction = await KaminoAction.buildBorrowTxns(
      kaminoMarket,
      borrow,
      usdh,
      env.admin.publicKey,
      new VanillaObligation(PROGRAM_ID),
      1_000_000,
      true
    );
    await sendTransactionsFromAction(env, borrowAction);
    await sleep(2000);
  }

  await kaminoMarket.refreshAll();
  const obligation = new VanillaObligation(PROGRAM_ID).toPda(kaminoMarket.getAddress(), env.admin.publicKey);
  return { env, reserve, kaminoMarket, obligation };
};

export type ReserveSpec = {
  symbol: string;
  tokenProgram: PublicKey;
};

export const createMarketWithTwoReserves = async (
  firstReserve: string | ReserveSpec,
  secondReserve: string | ReserveSpec,
  requestElevationGroup: boolean
) => {
  const env = await initEnv('localnet');
  const firstReserveSpec =
    typeof firstReserve === 'string' ? { symbol: firstReserve, tokenProgram: TOKEN_PROGRAM_ID } : firstReserve;
  const secondReserveSpec =
    typeof secondReserve === 'string' ? { symbol: secondReserve, tokenProgram: TOKEN_PROGRAM_ID } : secondReserve;

  const [createMarketSig, lendingMarket] = await createMarket(env);
  console.log(createMarketSig);

  await updateMarketMultiplierPoints(env, lendingMarket.publicKey, 1);

  const [firstMint, secondMint] = await Promise.all([
    firstReserveSpec.symbol === 'SOL'
      ? WRAPPED_SOL_MINT
      : createMint(env, env.admin.publicKey, 6, Keypair.generate(), firstReserveSpec.tokenProgram),
    secondReserveSpec.symbol === 'SOL'
      ? WRAPPED_SOL_MINT
      : createMint(env, env.admin.publicKey, 6, Keypair.generate(), secondReserveSpec.tokenProgram),
  ]);

  await sleep(2000);
  const [[, firstReserveAddress], [, secondReserveAddress]] = await Promise.all([
    createReserve(env, lendingMarket.publicKey, firstMint, firstReserveSpec.tokenProgram),
    createReserve(env, lendingMarket.publicKey, secondMint, secondReserveSpec.tokenProgram),
  ]);

  if (requestElevationGroup) {
    await sleep(1000);
    await updateMarketElevationGroup(env, lendingMarket.publicKey, secondReserveAddress.publicKey);
  }

  const extraParams: ConfigParams = requestElevationGroup
    ? {
        ...DefaultConfigParams,
        elevationGroups: [1, 0, 0, 0, 0],
      }
    : {
        ...DefaultConfigParams,
      };
  const firstReserveConfig = makeReserveConfig(firstReserveSpec.symbol, extraParams);
  const secondReserveConfig = makeReserveConfig(secondReserveSpec.symbol, extraParams);

  await Promise.all([
    updateReserve(env, firstReserveAddress.publicKey, firstReserveConfig),
    updateReserve(env, secondReserveAddress.publicKey, secondReserveConfig),
  ]);
  await sleep(1000);

  const kaminoMarket = (await KaminoMarket.load(
    env.provider.connection,
    lendingMarket.publicKey,
    DEFAULT_RECENT_SLOT_DURATION_MS,
    PROGRAM_ID,
    true
  ))!;

  return { env, firstMint, secondMint, kaminoMarket };
};

export const createMarketWithTwoReservesToppedUp = async (
  first: [string, Decimal],
  second: [string, Decimal],
  requestElevationGroup: boolean = false
) => {
  const [firstSymbol, firstAmount] = first;
  const [secondSymbol, secondAmount] = second;

  const { env, firstMint, secondMint, kaminoMarket } = await createMarketWithTwoReserves(
    firstSymbol,
    secondSymbol,
    requestElevationGroup
  );

  const whale = await newUser(env, kaminoMarket, [
    [firstSymbol, firstAmount],
    [secondSymbol, secondAmount],
  ]);

  await deposit(env, kaminoMarket, whale, firstSymbol, firstAmount);
  await deposit(env, kaminoMarket, whale, secondSymbol, secondAmount);

  return { env, firstMint, secondMint, kaminoMarket };
};

export const newUser = async (
  env: Env,
  kaminoMarket: KaminoMarket,
  balances: [string, Decimal][],
  kamino: Kamino | null = null,
  mintIntoWsolAta: boolean = false,
  referrer: Keypair | null = null
) => {
  const depositor = Keypair.generate();
  await env.provider.connection.requestAirdrop(depositor.publicKey, 2 * LAMPORTS_PER_SOL);

  await kaminoMarket.loadReserves();
  await sleep(2000);
  for (const [symbol, amount] of balances) {
    if (amount.gt(0)) {
      const reserve = kaminoMarket.getReserveBySymbol(symbol);
      if (!reserve) {
        throw new Error(`Reserve ${symbol} not found`);
      }
      const mint = reserve.getLiquidityMint();
      console.log('reserve.getLiquidityMint()', reserve.getLiquidityMint());

      if (mint.equals(WRAPPED_SOL_MINT)) {
        const [ata, ix] = createAssociatedTokenAccountIdempotentInstruction(
          depositor.publicKey,
          mint,
          depositor.publicKey,
          TOKEN_PROGRAM_ID
        );
        const lamports = amount.toNumber() * LAMPORTS_PER_SOL;
        await env.provider.connection.requestAirdrop(depositor.publicKey, lamports);
        await sleep(3000);

        if (mintIntoWsolAta) {
          // Should never have to do this in fact
          // user simply has SOL
          const depositWsol = getDepositWsolIxns(depositor.publicKey, ata, new Decimal(lamports));
          const tx = await buildVersionedTransaction(env.provider.connection, depositor.publicKey, [
            ix,
            ...depositWsol,
          ]);
          const txHash = await buildAndSendTxnWithLogs(
            env.provider.connection,
            tx,
            depositor,
            [],
            false,
            'Wsol ATA topup'
          );
          await env.provider.connection.confirmTransaction(txHash, 'confirmed');
        }
      } else if (isKToken(symbol)) {
        const strategy = await kamino?.getStrategyByKTokenMint(mint);
        await mintKTokenToUser(env, kamino!, depositor, env.admin, strategy!.strategy.sharesMint);
        await sleep(1000);
        const ktokenReserve = kaminoMarket.getReserveByMint(mint);
        const priceFeedAddress = ktokenReserve?.state.config.tokenInfo.scopeConfiguration.priceFeed;
        const chain = ktokenReserve?.state.config.tokenInfo.scopeConfiguration.priceChain;
        const priceFeed = {
          type: new OracleType.KToken(),
          price: priceFeedAddress!,
          chain,
        };
        await crankStrategyScopePrices(env, kamino!, kaminoMarket.scope, strategy!, symbol, priceFeed);
      } else {
        const [ata, ix] = createAssociatedTokenAccountIdempotentInstruction(
          depositor.publicKey,
          mint,
          env.admin.publicKey,
          reserve.getLiquidityTokenProgram()
        );
        await mintTo(env, mint, ata, amount.toNumber() * 10 ** reserve.state.liquidity.mintDecimals.toNumber(), [ix]);
      }
    }
  }

  await initUserMetadataAndReferrerAccounts(env, kaminoMarket, depositor, referrer);
  await sleep(2000);
  return depositor;
};

export const balance = async (
  env: Env,
  user: Keypair,
  kaminoMarket: KaminoMarket,
  symbol: string,
  ifSolGetWsolBalance: boolean = false
) => {
  const reserve = kaminoMarket.getReserveBySymbol(symbol);
  if (!reserve) {
    throw new Error(`Reserve ${symbol} not found`);
  }
  const mint = reserve.getLiquidityMint();

  if (mint.equals(WRAPPED_SOL_MINT) && !ifSolGetWsolBalance) {
    const balance = (await env.provider.connection.getBalance(user.publicKey)) / LAMPORTS_PER_SOL;
    return balance;
  }

  const ata = getAssociatedTokenAddress(mint, user.publicKey);
  if (await checkIfAccountExists(env.provider.connection, ata)) {
    const balance = await env.provider.connection.getTokenAccountBalance(ata);
    return balance.value.uiAmount;
  }

  return 0;
};

export const deposit = async (
  env: Env,
  kaminoMarket: KaminoMarket,
  user: Keypair,
  symbol: string,
  amount: Decimal,
  obligationType: ObligationType = new VanillaObligation(PROGRAM_ID),
  ixnsOnly: boolean = false // TODO: remove this
): Promise<TransactionInstruction[] | TransactionSignature> => {
  const reserve = kaminoMarket.getReserveBySymbol(symbol);
  if (!reserve) {
    throw new Error(`Reserve ${symbol} not found`);
  }

  console.log(
    'Depositing',
    symbol,
    reserve.stats.symbol,
    numberToLamportsDecimal(amount, reserve.stats.decimals).floor().toString(),
    reserve.address.toString()
  );
  const kaminoAction = await KaminoAction.buildDepositTxns(
    kaminoMarket,
    numberToLamportsDecimal(amount, reserve.stats.decimals).floor().toString(),
    reserve.getLiquidityMint(),
    user.publicKey,
    obligationType
  );

  const ixns = [...kaminoAction.setupIxs, ...kaminoAction.lendingIxs, ...kaminoAction.cleanupIxs];
  if (ixnsOnly === true) {
    return ixns;
  } else {
    const tx = await buildVersionedTransaction(env.provider.connection, user.publicKey, ixns);

    const txHash = await buildAndSendTxnWithLogs(env.provider.connection, tx, user, [], false, 'Deposit');
    await env.provider.connection.confirmTransaction(txHash, 'confirmed');
    return txHash;
  }
};

export const borrow = async (
  env: Env,
  kaminoMarket: KaminoMarket,
  user: Keypair,
  symbol: string,
  amount: Decimal,
  obligationType: ObligationType = new VanillaObligation(PROGRAM_ID)
) => {
  const reserve = kaminoMarket.getReserveBySymbol(symbol);
  if (!reserve) {
    throw new Error(`Reserve ${symbol} not found`);
  }

  const kaminoAction = await KaminoAction.buildBorrowTxns(
    kaminoMarket,
    numberToLamportsDecimal(amount, reserve.stats.decimals).floor().toString(),
    reserve.getLiquidityMint(),
    user.publicKey,
    obligationType
  );

  const tx = await buildVersionedTransaction(env.provider.connection, user.publicKey, [
    ...kaminoAction.setupIxs,
    ...kaminoAction.lendingIxs,
    ...kaminoAction.cleanupIxs,
  ]);
  const txHash = await buildAndSendTxnWithLogs(env.provider.connection, tx, user, [], false, 'Borrow');
  await env.provider.connection.confirmTransaction(txHash, 'confirmed');
};

export async function getLocalSwapIxs(
  env: Env,
  inputMintAmount: Decimal,
  outputMintAmount: Decimal,
  tokenAMint: PublicKey,
  tokenBMint: PublicKey,
  user: PublicKey
): Promise<[TransactionInstruction[], PublicKey[]]> {
  const tokenAAta = getAssociatedTokenAddress(tokenAMint, user);
  const tokenBAta = getAssociatedTokenAddress(tokenBMint, user);
  console.log('inputMintAmount', inputMintAmount.toString());
  console.log('outputMintAmount', outputMintAmount.toString());

  const inputMint = await getMint(env.provider.connection, tokenAMint);
  const outputMint = await getMint(env.provider.connection, tokenBMint);
  const inputMintDecimals = inputMint.decimals;
  const outputMintDecimals = outputMint.decimals;

  const aToBurn = inputMintAmount.mul(new Decimal(10).pow(inputMintDecimals));
  const bToMint = outputMintAmount.mul(new Decimal(10).pow(outputMintDecimals));

  const burnFromIxns: TransactionInstruction[] = [];
  if (tokenAMint.equals(WRAPPED_SOL_MINT)) {
    // When it comes to SOL
    // going to assume the swap is always wsol ata -> new wsol ata
    // therefore burn == send that amount to a new random user newly created
    // If we're 'selling' 'sol' it means we actually need to transfer wsols to the admin
    const sourceWsolAta = await getAssociatedTokenAddress(WRAPPED_SOL_MINT, user, false);
    const [wsolAtaForAdmin, createWSOLAccountIx] = createAssociatedTokenAccountIdempotentInstruction(
      env.admin.publicKey,
      WRAPPED_SOL_MINT,
      env.admin.publicKey,
      TOKEN_PROGRAM_ID
    );

    const transferIx = createTransferCheckedInstruction(
      sourceWsolAta,
      WRAPPED_SOL_MINT,
      wsolAtaForAdmin,
      user,
      aToBurn.floor().toNumber(),
      9,
      [],
      TOKEN_PROGRAM_ID
    );

    const closeWSOLAccountIx = createCloseAccountInstruction(
      wsolAtaForAdmin,
      env.admin.publicKey,
      env.admin.publicKey,
      [],
      TOKEN_PROGRAM_ID
    );

    console.log('Swapping in', tokenAMint.toString(), 'as wsol', aToBurn.floor().toNumber());
    burnFromIxns.push(createWSOLAccountIx, transferIx, closeWSOLAccountIx);
  } else {
    console.log('Swapping in', tokenAMint.toString(), aToBurn.floor().toNumber(), 'from ata', tokenAAta.toString());
    burnFromIxns.push(getBurnFromIx(user, tokenAMint, tokenAAta, aToBurn.floor().toNumber()));
  }

  const mintToIxns: TransactionInstruction[] = [];
  if (tokenBMint.equals(WRAPPED_SOL_MINT)) {
    // We need to receive sol, so we're just going to transfer into the user's wsol ata
    // from the admin's wsol ata

    await env.provider.connection.requestAirdrop(env.admin.publicKey, bToMint.ceil().toNumber());
    await sleep(3000);

    const userWsolAta = await getAssociatedTokenAddress(WRAPPED_SOL_MINT, user, false);

    // create wsol ata for admin
    const [wsolAtaForAdmin, createWSOLAccountIx] = createAssociatedTokenAccountIdempotentInstruction(
      env.admin.publicKey,
      WRAPPED_SOL_MINT,
      env.admin.publicKey,
      TOKEN_PROGRAM_ID
    );

    const closeWSOLAccountIx = createCloseAccountInstruction(
      wsolAtaForAdmin,
      env.admin.publicKey,
      env.admin.publicKey,
      [],
      TOKEN_PROGRAM_ID
    );

    const depositIntoWsolAta = getDepositWsolIxns(env.admin.publicKey, wsolAtaForAdmin, bToMint.ceil());

    const transferIx = createTransferCheckedInstruction(
      wsolAtaForAdmin,
      WRAPPED_SOL_MINT,
      userWsolAta,
      env.admin.publicKey,
      bToMint.floor().toNumber(),
      9,
      [],
      TOKEN_PROGRAM_ID
    );

    console.log(
      'Swapping out',
      tokenBMint.toString(),
      'as wsol',
      bToMint.floor().toNumber(),
      'ata',
      userWsolAta.toString()
    );
    mintToIxns.push(createWSOLAccountIx, ...depositIntoWsolAta, transferIx, closeWSOLAccountIx);
  } else {
    console.log('Swapping out', tokenBMint.toString(), bToMint.floor().toNumber(), 'ata', tokenBAta.toString());
    mintToIxns.push(getMintToIx(env.admin.publicKey, tokenBMint, tokenBAta, bToMint.floor().toNumber()));
  }

  return [[...mintToIxns, ...burnFromIxns], []];
}

export async function swapLocal(
  env: Env,
  inputMintAmount: Decimal,
  outputMintAmount: Decimal,
  tokenAMint: PublicKey,
  tokenBMint: PublicKey,
  user: Keypair
) {
  const [swapIxns] = await getLocalSwapIxs(
    env,
    inputMintAmount,
    outputMintAmount,
    tokenAMint,
    tokenBMint,
    user.publicKey
  );

  const tx = await buildVersionedTransaction(env.provider.connection, user.publicKey, swapIxns);
  const txHash = await buildAndSendTxnWithLogs(env.provider.connection, tx, user, [env.admin], false, 'Swap');
  await env.provider.connection.confirmTransaction(txHash, 'confirmed');
}

export const getLocalKaminoSwapper = async (env: Env) => {
  return async (
    input: DepositAmountsForSwap,
    tokenAMint: PublicKey,
    tokenBMint: PublicKey,
    owner: PublicKey,
    _slippage: Decimal,
    _allKeys: PublicKey[]
  ) => {
    const aDecimals = (await getMint(env.provider.connection, tokenAMint)).decimals;
    const bDecimals = (await getMint(env.provider.connection, tokenBMint)).decimals;

    console.log(
      'Calling getLocalKaminoSwapper',
      toJson(input),
      tokenAMint.toString(),
      tokenBMint.toString(),
      owner.toString(),
      input.tokenBToSwapAmount.lt(0),
      input.tokenAToSwapAmount.lt(0)
    );
    if (input.tokenBToSwapAmount.lt(0)) {
      return await getLocalSwapIxs(
        env,
        lamportsToNumberDecimal(input.tokenBToSwapAmount.abs(), bDecimals),
        lamportsToNumberDecimal(input.requiredAAmountToDeposit.abs(), aDecimals),
        tokenBMint,
        tokenAMint,
        owner
      );
    } else if (input.tokenAToSwapAmount.lt(0)) {
      return await getLocalSwapIxs(
        env,
        lamportsToNumberDecimal(input.tokenAToSwapAmount.abs().floor(), aDecimals),
        lamportsToNumberDecimal(input.requiredBAmountToDeposit.abs().floor(), bDecimals),
        tokenAMint,
        tokenBMint,
        owner
      );
    } else {
      console.log('Edge case');
    }
  };
};

export const createLookupTable = async (env: Env, keys: PublicKey[]): Promise<PublicKey> => {
  const [createIxn, table] = AddressLookupTableProgram.createLookupTable({
    payer: env.admin.publicKey,
    authority: env.admin.publicKey,
    recentSlot: await env.provider.connection.getSlot('finalized'),
  });

  {
    const tx = await buildVersionedTransaction(env.provider.connection, env.admin.publicKey, [createIxn]);
    const _sig = await buildAndSendTxnWithLogs(env.provider.connection, tx, env.admin, [], false, 'Create LUT');
    await sleep(2000);
  }

  const chunkSize = 20;
  for (let i = 0; i < keys.length; i += chunkSize) {
    const chunk = keys.slice(i, i + chunkSize);

    const extendIxn = AddressLookupTableProgram.extendLookupTable({
      payer: env.admin.publicKey,
      authority: env.admin.publicKey,
      lookupTable: table,
      addresses: chunk,
    });

    const tx = await buildVersionedTransaction(env.provider.connection, env.admin.publicKey, [extendIxn]);
    const _sig = await buildAndSendTxnWithLogs(env.provider.connection, tx, env.admin, [], false, 'Extend LUT');
  }

  return table;
};

const initUserMetadataAndReferrerAccounts = async (
  env: Env,
  kaminoMarket: KaminoMarket,
  user: Keypair,
  referrer: Keypair | null
) => {
  const referrerKey = referrer === null ? PublicKey.default : referrer.publicKey;
  const [, initReferrerUserMetadataIxns] = await getUserLutAddressAndSetupIxns(
    kaminoMarket,
    referrerKey,
    PublicKey.default,
    false,
    [],
    [],
    undefined,
    user.publicKey
  );
  // Create user metadata + referrer token state for this user so it doesn't propagate
  // in the other ixns balances
  const [, initUserMetadataIx] = await getUserLutAddressAndSetupIxns(kaminoMarket, user.publicKey, referrerKey, false);
  const initReferrerUserMetadataIxn = referrerKey.equals(PublicKey.default) ? [] : initReferrerUserMetadataIxns[0];
  const initreferrerTokenStateIxs: TransactionInstruction[] = [];
  for (const reserve of kaminoMarket.reserves.values()) {
    const referrerTokenStateAddress = referrerTokenStatePda(referrerKey, reserve.address, kaminoMarket.programId)[0];

    if (await checkIfAccountExists(env.provider.connection, referrerTokenStateAddress)) {
      continue;
    }

    const initreferrerTokenStateIx = initReferrerTokenState(
      {
        referrer: referrerKey,
      },
      {
        lendingMarket: kaminoMarket.getAddress(),
        payer: user.publicKey,
        reserve: reserve.address,
        referrerTokenState: referrerTokenStateAddress,
        rent: SYSVAR_RENT_PUBKEY,
        systemProgram: SystemProgram.programId,
      }
    );

    initreferrerTokenStateIxs.push(initreferrerTokenStateIx);
  }

  const tx = await buildVersionedTransaction(env.provider.connection, user.publicKey, [
    ...initReferrerUserMetadataIxn,
    ...initUserMetadataIx[0],
    ...initreferrerTokenStateIxs,
  ]);

  await sleep(2000);
  const _sig = await buildAndSendTxnWithLogs(
    env.provider.connection,
    tx,
    user,
    referrer === null ? [] : [referrer!],
    false,
    'Init UserMetadata and Referral'
  );
};

export const reloadRefreshedMarket = async (env: Env, kaminoMarket: KaminoMarket) => {
  const reserves = [...kaminoMarket.reserves.keys()];
  const refreshIxns = KaminoAction.getRefreshAllReserves(kaminoMarket, reserves);
  await buildAndSendTxnWithLogs(
    env.provider.connection,
    await buildVersionedTransaction(env.provider.connection, env.admin.publicKey, refreshIxns),
    env.admin,
    [],
    true,
    'refresh'
  );

  await sleep(2000);
  await kaminoMarket.reload();
};

export const round = (value: number, precision: number): number => {
  const multiplier = Math.pow(10, precision);
  return Math.round(value * multiplier) / multiplier;
};

/**
 * Sorts kTokens to the end of the list so that dependent mints are created first
 * @param a
 * @param b
 */
const kTokenComparator = ([a]: AssetQuantityTuple, [b]: AssetQuantityTuple) => {
  if (isKToken(a) && isKToken(b)) {
    return 0;
  }
  if (isKToken(a)) {
    return 1;
  }
  if (isKToken(b)) {
    return -1;
  }
  return a.localeCompare(b);
};

export async function setupStrategyAndMarketWithInitialLiquidity({
  reserves = [
    ['USDH', '0'],
    ['USDC', '0'],
  ],
  prices = {
    SOL: Price.SOL_USD_20,
    USDH: Price.USDC_USD_1,
    USDC: Price.USDC_USD_1,
    STSOL: Price.STSOL_USD_20,
    MSOL: Price.SOL_USD_20,
  },
  mintOverrides = {},
}: {
  reserves?: AssetQuantityTuple[];
  prices?: Record<string, Price>;
  mintOverrides?: Record<string, Keypair>;
} = {}) {
  const env = await initEnv('localnet');

  const firstDepositor = Keypair.generate();
  await env.provider.connection.requestAirdrop(firstDepositor.publicKey, LAMPORTS_PER_SOL);
  await sleep(2000);

  const [, lendingMarket] = await createMarket(env);
  const kamino = createKaminoClient(env);
  const scope = new Scope('localnet', env.provider.connection);
  const scopeFeed = await createScopeFeed(env, scope);
  await setUpGlobalConfig(env, kamino, scopeFeed);
  await setUpCollateralInfo(env, kamino);

  await sleep(2000);
  const kaminoMarket = (await KaminoMarket.load(
    env.provider.connection,
    lendingMarket.publicKey,
    DEFAULT_RECENT_SLOT_DURATION_MS,
    PROGRAM_ID,
    true
  ))!;

  // 1. Create reserves with initial liquidity
  // eslint-disable-next-line no-restricted-syntax
  for (const [symbol, initialLiquidity] of reserves.sort(kTokenComparator)) {
    // Give all SOL derivatives 9 dp or else the kamino dex pools will be 1:1000 - weird pricing
    const decimals = symbol.endsWith('SOL') ? 9 : 6;
    const initialLiquidityLamports = numberToLamportsDecimal(initialLiquidity, decimals).toNumber();
    console.log(
      `Creating ${symbol} reserve with ${initialLiquidityLamports} lamports initial liquidity (${initialLiquidity})`
    );
    if (mintOverrides) {
      const override = mintOverrides[symbol];
      if (override) {
        console.log(`Overriding ${symbol} mint with ${override.publicKey.toBase58()}`);
        await sleep(2000);
        await createMintAndReserve(
          env,
          kaminoMarket,
          kamino,
          symbol,
          initialLiquidityLamports,
          firstDepositor,
          decimals,
          prices,
          override
        );
        continue;
      }
    }
    const [, reserve] = await createMintAndReserve(
      env,
      kaminoMarket,
      kamino,
      symbol,
      initialLiquidityLamports,
      firstDepositor,
      decimals,
      prices
    );
    console.log(`Created ${symbol} reserve with address: ${reserve.toBase58()}`);
  }

  await kaminoMarket.reload();

  return {
    env,
    kaminoMarket,
    kamino,
  };
}

export async function createMintAndReserve(
  env: Env,
  kaminoMarket: KaminoMarket,
  kamino: Kamino,
  symbol: string,
  initialSupplyLamports: number,
  initialDepositor: Keypair,
  decimals: number,
  prices: Record<string, Price>,
  mintOverride: Keypair | null = null
): Promise<[PublicKey, PublicKey, ReserveConfig]> {
  let mint: PublicKey;
  let priceFeed: PriceFeed;
  if (isKToken(symbol)) {
    await kaminoMarket.reload();
    const strategy = await createKTokenStrategy(env, kamino, kaminoMarket, symbol, prices);
    const scope = new Scope('localnet', env.provider.connection);
    priceFeed = await addKTokenScopePriceMapping(env, scope, symbol, strategy);
    mint = strategy.strategy.sharesMint;
    if (initialSupplyLamports > 0) {
      await sleep(2000);
      await mintKTokenToUser(env, kamino, initialDepositor, env.admin, strategy.strategy.sharesMint);
    }
    await sleep(2000);
    await crankStrategyScopePrices(env, kamino, scope, strategy, symbol, priceFeed);
  } else {
    priceFeed = getPriceAcc(prices[symbol]);
    if (symbol === 'SOL') {
      mint = WRAPPED_SOL_MINT;
    } else {
      if (mintOverride) {
        mint = await createMint(env, env.admin.publicKey, decimals, mintOverride);
      } else {
        mint = await createMint(env, env.admin.publicKey, decimals);
      }
    }
    if (initialSupplyLamports > 0) {
      await sleep(2000);
      await mintToUser(env, mint, initialDepositor.publicKey, initialSupplyLamports, env.admin, false);
    }
  }
  await sleep(2000);

  const [, reserve] = await createReserve(env, kaminoMarket.getAddress(), mint);
  const config = !isKToken(symbol)
    ? makeReserveConfig(symbol, { ...DefaultConfigParams, priceFeed })
    : makeReserveConfig(symbol, { ...DefaultConfigParams, priceFeed, borrowLimit: new BN(0) });

  await sleep(2000);
  await updateReserve(env, reserve.publicKey, config);
  await sleep(2000);
  await kaminoMarket.reload();

  if (initialSupplyLamports > 0) {
    await sleep(2000);
    const depositAction = await KaminoAction.buildDepositReserveLiquidityTxns(
      kaminoMarket!,
      initialSupplyLamports.toString(),
      mint,
      initialDepositor.publicKey,
      new VanillaObligation(PROGRAM_ID),
      1_000_000,
      true
    );
    await sendTransactionsFromAction(env, depositAction, [initialDepositor]);
  }

  return [mint, reserve.publicKey, config];
}

export const bufferToNumberArray = (buffer: Buffer): number[] => {
  return Array.from(new Uint8Array(buffer));
};

export interface DepositAmountsForSwap {
  requiredAAmountToDeposit: Decimal;
  requiredBAmountToDeposit: Decimal;
  tokenAToSwapAmount: Decimal;
  tokenBToSwapAmount: Decimal;
}

export interface SwapperIxBuilder {
  (
    input: DepositAmountsForSwap,
    tokenAMint: PublicKey,
    tokenBMint: PublicKey,
    owner: PublicKey,
    slippage: Decimal,
    allKeys: PublicKey[]
  ): Promise<[TransactionInstruction[], PublicKey[]]>;
}
