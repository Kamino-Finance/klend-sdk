import { Keypair, PublicKey } from '@solana/web3.js';
import Decimal from 'decimal.js';
import { Env, createLookupTable, getLocalSwapIxs } from './setup_utils';
import { Kamino } from '@hubbleprotocol/kamino-sdk';
import { MultiplyObligation, ObligationTypeTag } from '../src/utils/ObligationType';
import { isKToken } from './kamino/utils';
import {
  getDepositWithLeverageIxns,
  getWithdrawWithLeverageIxns,
  getAdjustLeverageIxns,
  PriceAinBProvider,
  SwapIxnsProvider,
  IsKtokenProvider,
} from '../src/leverage/operations';
import { KaminoMarket } from '../src/classes/market';
import { getUserLutAddressAndSetupIxns } from '../src/utils/userMetadata';
import { buildVersionedTransaction, sendAndConfirmVersionedTransaction } from '../src/utils/instruction';
import { lamportsToNumberDecimal as fromLamports, sleep } from '../src/classes/utils';
import { KaminoReserve } from '../src/classes/reserve';

export const pk = () => Keypair.generate().publicKey;
export const USDC_MINT = pk();
export const SOL_MINT = new PublicKey('So11111111111111111111111111111111111111111');
export const WSOL_MINT = new PublicKey('So11111111111111111111111111111111111111112');
export const MSOL_MINT = pk();
export const TBTC_MINT = pk();
export const DECIMALS = 6;

export const getPriceByTokenMintDecimal = (tokenMint: PublicKey | string): Decimal => {
  if (tokenMint.toString() === SOL_MINT.toString()) {
    return new Decimal(25.0);
  }
  if (tokenMint.toString() === WSOL_MINT.toString()) {
    return new Decimal(25.0);
  }
  if (tokenMint.toString() === MSOL_MINT.toString()) {
    return new Decimal(30.0);
  }
  if (tokenMint.toString() === USDC_MINT.toString()) {
    return new Decimal(1.0);
  }
  if (tokenMint.toString() === TBTC_MINT.toString()) {
    return new Decimal(30000.0);
  }

  throw new Error('Invalid token mint');
};

export const getJupiterPrice = (
  inputMint: PublicKey,
  outputMint: PublicKey,
  getUsdPrice: (tokenMint: PublicKey | string) => Decimal = getPriceByTokenMintDecimal
) => {
  // a to b
  // a_to_usd
  // b_to_usd
  // a_to_usd / b_to_usd
  const inputToUsdPrice = getUsdPrice(inputMint);
  const outputToUsdPrice = getUsdPrice(outputMint);
  return inputToUsdPrice.dividedBy(outputToUsdPrice);
};

export const depositLeverageTestAdapter = async (
  env: Env,
  user: Keypair,
  kaminoMarket: KaminoMarket,
  selectedToken: string, // TODO marius convert all of these to PublicKey
  collToken: string,
  debtToken: string,
  amount: Decimal,
  targetLeverage: Decimal,
  slippagePct: number,
  getJupPrice: (inputMint: string, outputMint: string) => Promise<number>,
  referrer: PublicKey = PublicKey.default,
  kamino?: Kamino
) => {
  if (!amount) {
    return;
  }

  const collReserve = kaminoMarket.getReserveBySymbol(collToken);
  const debtReserve = kaminoMarket.getReserveBySymbol(debtToken);

  const collTokenMint = collReserve!.getLiquidityMint();
  const debtTokenMint = debtReserve!.getLiquidityMint();
  const selectedTokenMint = selectedToken === collToken ? collTokenMint : debtTokenMint;

  const priceDebtToColl = new Decimal(await getJupPrice(debtToken, collToken));
  const priceCollToDebt = new Decimal(await getJupPrice(collToken, debtToken));
  if (!priceDebtToColl || !priceCollToDebt) {
    throw new Error('Price is not loaded. Please, reload the page and try again');
  }

  let userLut: PublicKey | undefined = undefined;
  const [userLookupTable, txsIxns] = await getUserLutAddressAndSetupIxns(
    kaminoMarket,
    user.publicKey,
    referrer,
    kamino ? true : false
  );

  userLut = userLookupTable;
  for (const txIxns of txsIxns) {
    const tx = await buildVersionedTransaction(env.provider.connection, user.publicKey, txIxns);
    tx.sign([user]);

    const _txid = await sendAndConfirmVersionedTransaction(env.provider.connection, tx, 'confirmed');
    await sleep(2000);
  }

  const obligationType = new MultiplyObligation(collTokenMint, debtTokenMint, kaminoMarket.programId);
  const obligation = await kaminoMarket.getObligationByAddress(
    obligationType.toPda(kaminoMarket.getAddress(), user.publicKey)
  );

  const { ixns, lookupTablesAddresses, swapInputs } = await getDepositWithLeverageIxns({
    connection: env.provider.connection,
    user: user.publicKey,
    amount: amount,
    selectedTokenMint: selectedTokenMint,
    collTokenMint: collTokenMint,
    debtTokenMint: debtTokenMint,
    targetLeverage: targetLeverage,
    kaminoMarket: kaminoMarket,
    slippagePct: new Decimal(slippagePct),
    priceDebtToColl: priceDebtToColl,
    swapper: getLocalSwapper(env, kaminoMarket, user.publicKey),
    referrer: referrer,
    isKtoken: getIsKtoken(kaminoMarket),
    priceAinB: getPriceAinB(kaminoMarket),
    kamino,
    obligationTypeTagOverride: ObligationTypeTag.Multiply,
    obligation,
  });

  // Create lookup table
  const lookupTable = await createLookupTable(
    env,
    ixns
      .map((ixn) => ixn.keys)
      .flat()
      .map((key) => key.pubkey)
  );
  await sleep(2000);

  const lookupTables: PublicKey[] = [...lookupTablesAddresses, lookupTable];
  if (userLut) {
    lookupTables.push(userLut);
  }

  const tx = await buildVersionedTransaction(env.provider.connection, user.publicKey, ixns, lookupTables);
  tx.sign([user]);
  tx.sign([env.admin]);

  const txid = await sendAndConfirmVersionedTransaction(env.provider.connection, tx, 'confirmed');
  return {
    txid,
    collTokenMint,
    debtTokenMint,
    swapInputs,
  };
};

export const withdrawLeverageTestAdapter = async (
  env: Env,
  user: Keypair,
  kaminoMarket: KaminoMarket,
  selectedToken: string, // TODO marius convert all of these to PublicKey
  collToken: string,
  debtToken: string,
  amount: Decimal,
  slippagePct: number,
  depositedLamports: Decimal,
  borrowedLamports: Decimal,
  isClosingPosition: boolean,
  getJupPrice: (inputMint: string, outputMint: string) => Promise<number>,
  referrer: PublicKey = PublicKey.default,
  kamino?: Kamino
) => {
  if (!amount) {
    return;
  }

  console.log('WithdrawLeverage');

  const collReserve = kaminoMarket.getReserveBySymbol(collToken);
  const debtReserve = kaminoMarket.getReserveBySymbol(debtToken);

  const collTokenMint = collReserve!.getLiquidityMint();
  const debtTokenMint = debtReserve!.getLiquidityMint();
  const selectedTokenMint = selectedToken === collToken ? collTokenMint : debtTokenMint;

  const deposited = fromLamports(depositedLamports, collReserve!.stats.decimals);
  const borrowed = fromLamports(borrowedLamports, debtReserve!.stats.decimals);
  console.log('borrowedLamports, debtReserve!.stats.decimals', borrowedLamports);

  const priceDebtToColl = new Decimal(await getJupPrice(debtToken, collToken));
  const priceCollToDebt = new Decimal(await getJupPrice(collToken, debtToken));
  if (!priceDebtToColl || !priceCollToDebt) {
    throw new Error('Price is not loaded. Please, reload the page and try again');
  }

  let userLut: PublicKey | undefined = undefined;
  if (isKToken(collToken)) {
    const [userLookupTable, txsIxns] = await getUserLutAddressAndSetupIxns(
      kaminoMarket,
      user.publicKey,
      referrer,
      true
    );

    userLut = userLookupTable;
    for (const txIxns of txsIxns) {
      const tx = await buildVersionedTransaction(env.provider.connection, user.publicKey, txIxns);
      tx.sign([user]);

      const _txid = await sendAndConfirmVersionedTransaction(env.provider.connection, tx, 'confirmed');
      await sleep(2000);
    }
  }

  const obligationType = new MultiplyObligation(collTokenMint, debtTokenMint, kaminoMarket.programId);
  const obligation = await kaminoMarket.getObligationByAddress(
    obligationType.toPda(kaminoMarket.getAddress(), user.publicKey)
  );

  const { ixns, lookupTablesAddresses, swapInputs } = await getWithdrawWithLeverageIxns({
    connection: env.provider.connection,
    user: user.publicKey,
    amount,
    deposited,
    borrowed,
    collTokenMint,
    debtTokenMint,
    selectedTokenMint,
    priceCollToDebt,
    isClosingPosition,
    kaminoMarket,
    slippagePct,
    swapper: getLocalSwapper(env, kaminoMarket, user.publicKey),
    referrer: referrer,
    isKtoken: getIsKtoken(kaminoMarket),
    kamino,
    obligationTypeTagOverride: ObligationTypeTag.Multiply,
    obligation,
  });

  // Create lookup table
  const lookupTable = await createLookupTable(
    env,
    ixns
      .map((ixn) => ixn.keys)
      .flat()
      .map((key) => key.pubkey)
  );
  await sleep(2000);

  const lookupTables: PublicKey[] = [...lookupTablesAddresses, lookupTable];
  if (userLut) {
    lookupTables.push(userLut);
  }

  const tx = await buildVersionedTransaction(env.provider.connection, user.publicKey, ixns, lookupTables);
  tx.sign([user]);
  tx.sign([env.admin]);

  const txid = await sendAndConfirmVersionedTransaction(env.provider.connection, tx, 'confirmed');

  return {
    txid,
    collTokenMint,
    debtTokenMint,
    swapInputs,
  };
};

export const adjustLeverageTestAdapter = async (
  env: Env,
  user: Keypair,
  kaminoMarket: KaminoMarket,
  collToken: string,
  debtToken: string,
  slippagePct: number,
  depositedLamports: Decimal,
  borrowedLamports: Decimal,
  targetLeverage: Decimal,
  getJupPrice: (inputMint: string, outputMint: string) => Promise<number>,
  referrer: PublicKey = PublicKey.default,
  kamino?: Kamino
) => {
  const collReserve = kaminoMarket.getReserveBySymbol(collToken);
  const debtReserve = kaminoMarket.getReserveBySymbol(debtToken);

  const priceDebtToColl = new Decimal(await getJupPrice(debtToken, collToken));
  const priceCollToDebt = new Decimal(await getJupPrice(collToken, debtToken));
  if (!priceDebtToColl || !priceCollToDebt) {
    throw new Error('Price is not loaded. Please, reload the page and try again');
  }

  let userLut: PublicKey | undefined = undefined;
  if (isKToken(collToken)) {
    const [userLookupTable, txsIxns] = await getUserLutAddressAndSetupIxns(
      kaminoMarket,
      user.publicKey,
      referrer,
      true
    );

    userLut = userLookupTable;
    for (const txIxns of txsIxns) {
      const tx = await buildVersionedTransaction(env.provider.connection, user.publicKey, txIxns);
      tx.sign([user]);

      const _txid = await sendAndConfirmVersionedTransaction(env.provider.connection, tx, 'confirmed');
      await sleep(2000);
    }
  }

  const obligationType = new MultiplyObligation(
    collReserve?.getLiquidityMint()!,
    debtReserve?.getLiquidityMint()!,
    kaminoMarket.programId
  );
  const obligation = await kaminoMarket.getObligationByAddress(
    obligationType.toPda(kaminoMarket.getAddress(), user.publicKey)
  );

  const { ixns, lookupTablesAddresses, swapInputs } = await getAdjustLeverageIxns({
    connection: env.provider.connection,
    user: user.publicKey,
    kaminoMarket,
    priceDebtToColl,
    priceCollToDebt,
    targetLeverage,
    slippagePct,
    depositedLamports,
    borrowedLamports,
    collTokenMint: collReserve!.getLiquidityMint(),
    debtTokenMint: debtReserve!.getLiquidityMint(),
    swapper: getLocalSwapper(env, kaminoMarket, user.publicKey),
    referrer,
    isKtoken: getIsKtoken(kaminoMarket),
    priceAinB: getPriceAinB(kaminoMarket),
    kamino,
    obligationTypeTagOverride: ObligationTypeTag.Multiply,
    obligation,
  });

  // Create lookup table
  const lookupTable = await createLookupTable(
    env,
    ixns
      .map((ixn) => ixn.keys)
      .flat()
      .map((key) => key.pubkey)
  );
  await sleep(2000);

  const lookupTables: PublicKey[] = [...lookupTablesAddresses, lookupTable];
  if (userLut) {
    lookupTables.push(userLut);
  }

  const tx = await buildVersionedTransaction(env.provider.connection, user.publicKey, ixns, lookupTables);
  tx.sign([user]);
  tx.sign([env.admin]);

  const txid = await sendAndConfirmVersionedTransaction(env.provider.connection, tx, 'confirmed');

  return {
    txid,
    collTokenMint: collReserve?.getLiquidityMint(),
    debtTokenMint: debtReserve?.getLiquidityMint(),
    swapInputs,
  };
};

export const getPriceMock = async (
  kaminoMarket: KaminoMarket,
  tokenA: string | PublicKey,
  tokenB: string | PublicKey
): Promise<number> => {
  let tokenAReserve: KaminoReserve | undefined = undefined;
  let tokenBReserve: KaminoReserve | undefined = undefined;

  if (typeof tokenA === 'string') {
    tokenAReserve = kaminoMarket.getReserveBySymbol(tokenA);
  } else {
    tokenAReserve = kaminoMarket.getReserveByMint(tokenA);
  }
  if (typeof tokenB === 'string') {
    tokenBReserve = kaminoMarket.getReserveBySymbol(tokenB);
  } else {
    tokenBReserve = kaminoMarket.getReserveByMint(tokenB);
  }

  let aPrice = 0;
  if (tokenA === 'USD') {
    aPrice = 1.0;
  } else {
    aPrice = tokenAReserve!.getReserveMarketPrice().toNumber();
  }

  let bPrice = 0;
  if (tokenB === 'USD') {
    bPrice = 1.0;
  } else {
    bPrice = tokenBReserve!.getReserveMarketPrice().toNumber()!;
  }

  if (aPrice === 0 || bPrice === 0) {
    throw Error('Price is not loaded.');
  }

  console.log('aPrice', aPrice);
  console.log('bPrice', bPrice);
  console.log('tokenA', tokenA);
  console.log('tokenB', tokenB);

  return aPrice && bPrice ? aPrice / bPrice : 0;
};

export const getPriceAinB = (kaminoMarket: KaminoMarket): PriceAinBProvider => {
  return async (tokenA: PublicKey, tokenB: PublicKey): Promise<Decimal> => {
    let tokenAReserve: KaminoReserve | undefined = undefined;
    let tokenBReserve: KaminoReserve | undefined = undefined;

    if (typeof tokenA === 'string') {
      tokenAReserve = kaminoMarket.getReserveBySymbol(tokenA);
    } else {
      tokenAReserve = kaminoMarket.getReserveByMint(tokenA);
    }
    if (typeof tokenB === 'string') {
      tokenBReserve = kaminoMarket.getReserveBySymbol(tokenB);
    } else {
      tokenBReserve = kaminoMarket.getReserveByMint(tokenB);
    }

    const aPrice = tokenAReserve!.getReserveMarketPrice().toNumber();
    const bPrice = tokenBReserve!.getReserveMarketPrice().toNumber();

    if (aPrice === 0 || bPrice === 0) {
      throw Error('Price is not loaded.');
    }

    console.log('aPrice', aPrice);
    console.log('bPrice', bPrice);
    console.log('tokenA', tokenA);
    console.log('tokenB', tokenB);

    return new Decimal(aPrice && bPrice ? aPrice / bPrice : 0);
  };
};

export const getLocalSwapper = (env: Env, kaminoMarket: KaminoMarket, user: PublicKey): SwapIxnsProvider => {
  return async (amountInLamports: number, amountInMint: PublicKey, amountOutMint: PublicKey, slippage: number) => {
    const priceInToOut = await getPriceMock(kaminoMarket, amountInMint, amountOutMint);
    const slippageFactor = new Decimal(slippage).div('100').add('1');
    const reserveIn = kaminoMarket.getReserveByMint(amountInMint);
    const amountIn = fromLamports(amountInLamports, reserveIn!.stats.decimals);
    const expectedCollOut = amountIn.mul(priceInToOut).div(slippageFactor);
    console.log(
      'Swapping in',
      amountIn.toString(),
      'debt for',
      expectedCollOut.toString(),
      'coll, at price',
      priceInToOut
    );
    return getLocalSwapIxs(env, amountIn, expectedCollOut, amountInMint, amountOutMint, user);
  };
};

export const getIsKtoken = (kaminoMarket: KaminoMarket): IsKtokenProvider => {
  return async (token: PublicKey | string): Promise<boolean> => {
    if (typeof token === 'string') {
      return token.startsWith('k');
    } else {
      const reserve = kaminoMarket.getReserveByMint(token);
      return reserve!.symbol.startsWith('k');
    }
  };
};
