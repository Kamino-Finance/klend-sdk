import { Keypair, PublicKey } from '@solana/web3.js';
import { WSOL_MINT, getLocalSwapper, getPriceAinB } from './leverage_utils';
import { setupStrategyAndMarketWithInitialLiquidity, newUser, createLookupTable } from './setup_utils';
import Decimal from 'decimal.js';
import { assert } from 'chai';
import { TOKEN_PROGRAM_ID, Token } from '@solana/spl-token';
import { Price } from './kamino/price';
import { assertFuzzyEq } from './assert';
import { reloadReservesAndRefreshMarket } from './setup_operations';
import { sleep } from '../src/classes/utils';
import {
  getExpectedTokenBalanceAfterBorrow,
  getKtokenToTokenSwapper,
  getTokenToKtokenSwapper,
} from '../src/leverage/utils';
import { getAssociatedTokenAddress, getTokenAccountBalance } from '../src/utils/ata';
import { buildVersionedTransaction, sendAndConfirmVersionedTransaction } from '../src/utils/instruction';

describe('Leverage SDK kTokens swapper tests', function () {
  it('swap_A_to_kAB_A_is_SOL_B_is_SPL', async function () {
    const tokenBMintKey = generateKeypairGt(WSOL_MINT);
    const tokenASymbol = 'SOL';
    const tokenBSymbol = 'STSOL';
    const ktokenSymbol = 'kSOL-STSOL (Orca)';
    const { env, kaminoMarket, kamino } = await setupStrategyAndMarketWithInitialLiquidity({
      reserves: [
        [tokenASymbol, '0'],
        [tokenBSymbol, '0'],
        [ktokenSymbol, '1'],
      ],
      mintOverrides: {
        [tokenBSymbol]: tokenBMintKey,
      },
    });
    await sleep(2000);

    await reloadReservesAndRefreshMarket(env, kaminoMarket);

    const ktokenReserve = kaminoMarket.getReserveBySymbol(ktokenSymbol);
    const ktokenMint = ktokenReserve?.state.liquidity.mintPubkey!;
    const strategy = await kamino.getStrategyByKTokenMint(ktokenMint);
    const tokenAMint = strategy?.strategy.tokenAMint!;

    const depositor = await newUser(env, kaminoMarket, [[tokenASymbol, new Decimal(3)]]);
    await sleep(2000);

    const slippage = 0.01;
    const stsolToDeposit = 2;
    const decimalsStsol = 9;

    const expectedDebtTokenAtaBalance = await getExpectedTokenBalanceAfterBorrow(
      env.provider.connection,
      tokenAMint,
      depositor.publicKey,
      new Decimal(0),
      0
    );

    const swapper = await getTokenToKtokenSwapper(
      env.provider.connection,
      kaminoMarket,
      kamino,
      depositor.publicKey,
      getLocalSwapper(env, kaminoMarket, depositor.publicKey),
      getPriceAinB(kaminoMarket)
    );
    const [swapIxns] = await swapper(
      stsolToDeposit * 10 ** decimalsStsol,
      tokenAMint,
      ktokenMint,
      slippage,
      expectedDebtTokenAtaBalance
    );

    await sleep(2000);

    const swapperLookupTable = await createLookupTable(
      env,
      swapIxns
        .map((ixn) => ixn.keys)
        .flat()
        .map((key) => key.pubkey)
    );
    await sleep(2000);

    const tx = await buildVersionedTransaction(env.provider.connection, depositor.publicKey, swapIxns, [
      // ...lookupTableAddresses,
      swapperLookupTable,
    ]);
    tx.sign([depositor]);
    tx.sign([env.admin]);

    await sendAndConfirmVersionedTransaction(env.provider.connection, tx, 'processed', { skipPreflight: true });

    await sleep(2000);
    const depositorKtokenAta = await getAssociatedTokenAddress(ktokenMint, depositor.publicKey);
    const depositorKtokenBalance = await getTokenAccountBalance(env.provider, depositorKtokenAta);
    console.log('ktoken balance: ', depositorKtokenBalance);

    assert(depositorKtokenBalance > 0);
    const shareData = await kamino.getStrategyShareData(strategy?.address!);
    const usdInvested = 2 * 20;
    console.log('shareData ', JSON.stringify(shareData));
    const kTokenDecimals = (
      await new Token(env.provider.connection, ktokenMint, TOKEN_PROGRAM_ID, env.admin).getMintInfo()
    ).decimals;
    console.log('expected: ', (shareData.price.toNumber() * depositorKtokenBalance) / 10 ** kTokenDecimals);
    assertFuzzyEq((shareData.price.toNumber() * depositorKtokenBalance) / 10 ** kTokenDecimals, usdInvested, slippage);
  });

  it('swap_B_to_kAB_A_is_SOL_B_is_SPL', async function () {
    const tokenBMintKey = generateKeypairGt(WSOL_MINT);
    const tokenASymbol = 'SOL';
    const tokenBSymbol = 'STSOL';
    const ktokenSymbol = 'kSOL-STSOL (Orca)';
    const { env, kaminoMarket, kamino } = await setupStrategyAndMarketWithInitialLiquidity({
      reserves: [
        [tokenASymbol, '0'],
        [tokenBSymbol, '0'],
        [ktokenSymbol, '1'],
      ],
      mintOverrides: {
        [tokenBSymbol]: tokenBMintKey,
      },
    });
    await sleep(2000);

    await reloadReservesAndRefreshMarket(env, kaminoMarket);

    const ktokenReserve = kaminoMarket.getReserveBySymbol(ktokenSymbol);
    const ktokenMint = ktokenReserve?.state.liquidity.mintPubkey!;
    const strategy = await kamino.getStrategyByKTokenMint(ktokenMint);
    const tokenBMint = strategy?.strategy.tokenBMint!;

    const depositor = await newUser(env, kaminoMarket, [[tokenBSymbol, new Decimal(3)]]);
    await sleep(2000);

    const slippage = 0.01;
    const stsolToDeposit = 2;
    const decimalsStsol = 9;

    const expectedDebtTokenAtaBalance = await getExpectedTokenBalanceAfterBorrow(
      env.provider.connection,
      tokenBMint,
      depositor.publicKey,
      new Decimal(0),
      0
    );

    const swapper = await getTokenToKtokenSwapper(
      env.provider.connection,
      kaminoMarket,
      kamino,
      depositor.publicKey,
      getLocalSwapper(env, kaminoMarket, depositor.publicKey),
      getPriceAinB(kaminoMarket)
    );
    const [swapIxns] = await swapper(
      stsolToDeposit * 10 ** decimalsStsol,
      tokenBMint,
      ktokenMint,
      slippage,
      expectedDebtTokenAtaBalance
    );

    await sleep(2000);

    const swapperLookupTable = await createLookupTable(
      env,
      swapIxns
        .map((ixn) => ixn.keys)
        .flat()
        .map((key) => key.pubkey)
    );
    await sleep(2000);

    const tx = await buildVersionedTransaction(env.provider.connection, depositor.publicKey, swapIxns, [
      // ...lookupTableAddresses,
      swapperLookupTable,
    ]);
    tx.sign([depositor]);
    tx.sign([env.admin]);

    await sendAndConfirmVersionedTransaction(env.provider.connection, tx, 'processed', { skipPreflight: true });

    await sleep(2000);
    const depositorKtokenAta = await getAssociatedTokenAddress(ktokenMint, depositor.publicKey);
    const depositorKtokenBalance = await getTokenAccountBalance(env.provider, depositorKtokenAta);
    console.log('ktoken balance: ', depositorKtokenBalance);

    assert(depositorKtokenBalance > 0);
    const shareData = await kamino.getStrategyShareData(strategy?.address!);
    const usdInvested = 2 * 20;
    console.log('shareData ', JSON.stringify(shareData));
    const kTokenDecimals = (
      await new Token(env.provider.connection, ktokenMint, TOKEN_PROGRAM_ID, env.admin).getMintInfo()
    ).decimals;
    console.log('expected', (shareData.price.toNumber() * depositorKtokenBalance) / 10 ** kTokenDecimals);
    assertFuzzyEq((shareData.price.toNumber() * depositorKtokenBalance) / 10 ** kTokenDecimals, usdInvested, slippage);
  });

  it('swap_A_to_kAB_A_is_SPL_B_is_SOL', async function () {
    // ensuring that the order of A and B is kept as they are ordered based on mint pubkeys
    const tokenAMintKey = generateKeypairLt(WSOL_MINT);
    const tokenASymbol = 'USDH';
    const tokenBSymbol = 'SOL';
    const ktokenSymbol = 'kUSDH-SOL (Orca)';
    const { env, kaminoMarket, kamino } = await setupStrategyAndMarketWithInitialLiquidity({
      reserves: [
        [tokenASymbol, '0'],
        [tokenBSymbol, '0'],
        [ktokenSymbol, '1'],
      ],
      prices: {
        SOL: Price.SOL_USD_20,
        USDH: Price.USDC_USD_1,
      },
      mintOverrides: {
        [tokenASymbol]: tokenAMintKey,
      },
    });
    await sleep(2000);

    await reloadReservesAndRefreshMarket(env, kaminoMarket);

    const ktokenReserve = kaminoMarket.getReserveBySymbol(ktokenSymbol);
    const ktokenMint = ktokenReserve?.state.liquidity.mintPubkey!;
    const strategy = await kamino.getStrategyByKTokenMint(ktokenMint);
    const tokenAMint = strategy?.strategy.tokenAMint!;

    const depositor = await newUser(env, kaminoMarket, [[tokenASymbol, new Decimal(45)]]);
    await sleep(2000);

    const slippage = 0.01;
    const usdhToDeposit = 40;
    const depositDecimals = (
      await new Token(env.provider.connection, tokenAMint, TOKEN_PROGRAM_ID, env.admin).getMintInfo()
    ).decimals;

    const expectedDebtTokenAtaBalance = await getExpectedTokenBalanceAfterBorrow(
      env.provider.connection,
      tokenAMint,
      depositor.publicKey,
      new Decimal(0),
      0
    );

    const swapper = await getTokenToKtokenSwapper(
      env.provider.connection,
      kaminoMarket,
      kamino,
      depositor.publicKey,
      getLocalSwapper(env, kaminoMarket, depositor.publicKey),
      getPriceAinB(kaminoMarket)
    );
    const [swapIxns] = await swapper(
      usdhToDeposit * 10 ** depositDecimals,
      tokenAMint,
      ktokenMint,
      slippage,
      expectedDebtTokenAtaBalance
    );

    await sleep(2000);

    const swapperLookupTable = await createLookupTable(
      env,
      swapIxns
        .map((ixn) => ixn.keys)
        .flat()
        .map((key) => key.pubkey)
    );
    await sleep(2000);

    const tx = await buildVersionedTransaction(env.provider.connection, depositor.publicKey, swapIxns, [
      // ...lookupTableAddresses,
      swapperLookupTable,
    ]);
    tx.sign([depositor]);
    tx.sign([env.admin]);

    await sendAndConfirmVersionedTransaction(env.provider.connection, tx, 'processed', { skipPreflight: true });

    await sleep(2000);
    const depositorKtokenAta = await getAssociatedTokenAddress(ktokenMint, depositor.publicKey);
    const depositorKtokenBalance = await getTokenAccountBalance(env.provider, depositorKtokenAta);
    console.log('ktoken balance: ', depositorKtokenBalance);

    assert(depositorKtokenBalance > 0);
    const shareData = await kamino.getStrategyShareData(strategy?.address!);
    const usdInvested = 2 * 20;
    console.log('shareData ', JSON.stringify(shareData));
    const kTokenDecimals = (
      await new Token(env.provider.connection, ktokenMint, TOKEN_PROGRAM_ID, env.admin).getMintInfo()
    ).decimals;
    console.log('expected', (shareData.price.toNumber() * depositorKtokenBalance) / 10 ** kTokenDecimals);
    assertFuzzyEq((shareData.price.toNumber() * depositorKtokenBalance) / 10 ** kTokenDecimals, usdInvested, slippage);
  });

  it('swap_B_to_kAB_A_is_SPL_B_is_SOL', async function () {
    // ensuring that the order of A and B is kept as they are ordered based on mint pubkeys
    const tokenAMintKey = generateKeypairLt(WSOL_MINT);
    const tokenASymbol = 'USDH';
    const tokenBSymbol = 'SOL';
    const ktokenSymbol = 'kUSDH-SOL (Orca)';
    const { env, kaminoMarket, kamino } = await setupStrategyAndMarketWithInitialLiquidity({
      reserves: [
        [tokenASymbol, '0'],
        [tokenBSymbol, '0'],
        [ktokenSymbol, '1'],
      ],
      prices: {
        SOL: Price.SOL_USD_20,
        USDH: Price.USDC_USD_1,
      },
      mintOverrides: {
        [tokenASymbol]: tokenAMintKey,
      },
    });
    await sleep(2000);

    await reloadReservesAndRefreshMarket(env, kaminoMarket);

    const ktokenReserve = kaminoMarket.getReserveBySymbol(ktokenSymbol);
    const ktokenMint = ktokenReserve?.state.liquidity.mintPubkey!;
    const strategy = await kamino.getStrategyByKTokenMint(ktokenMint);
    const tokenBMint = strategy?.strategy.tokenBMint!;

    const depositor = await newUser(env, kaminoMarket, [[tokenBSymbol, new Decimal(3)]]);
    await sleep(2000);

    const slippage = 0.01;
    const solToDeposit = 2;
    const depositDecimals = 9;

    const expectedDebtTokenAtaBalance = await getExpectedTokenBalanceAfterBorrow(
      env.provider.connection,
      tokenBMint,
      depositor.publicKey,
      new Decimal(0),
      0
    );

    const swapper = await getTokenToKtokenSwapper(
      env.provider.connection,
      kaminoMarket,
      kamino,
      depositor.publicKey,
      getLocalSwapper(env, kaminoMarket, depositor.publicKey),
      getPriceAinB(kaminoMarket)
    );
    const [swapIxns] = await swapper(
      solToDeposit * 10 ** depositDecimals,
      tokenBMint,
      ktokenMint,
      slippage,
      expectedDebtTokenAtaBalance
    );

    await sleep(2000);

    const swapperLookupTable = await createLookupTable(
      env,
      swapIxns
        .map((ixn) => ixn.keys)
        .flat()
        .map((key) => key.pubkey)
    );
    await sleep(2000);

    const tx = await buildVersionedTransaction(env.provider.connection, depositor.publicKey, swapIxns, [
      // ...lookupTableAddresses,
      swapperLookupTable,
    ]);
    tx.sign([depositor]);
    tx.sign([env.admin]);

    await sendAndConfirmVersionedTransaction(env.provider.connection, tx, 'processed', { skipPreflight: true });

    await sleep(2000);
    const depositorKtokenAta = await getAssociatedTokenAddress(ktokenMint, depositor.publicKey);
    const depositorKtokenBalance = await getTokenAccountBalance(env.provider, depositorKtokenAta);
    console.log('ktoken balance: ', depositorKtokenBalance);

    assert(depositorKtokenBalance > 0);
    const shareData = await kamino.getStrategyShareData(strategy?.address!);
    const usdInvested = 2 * 20;
    console.log('shareData ', JSON.stringify(shareData));
    const kTokenDecimals = (
      await new Token(env.provider.connection, ktokenMint, TOKEN_PROGRAM_ID, env.admin).getMintInfo()
    ).decimals;
    console.log('expected', (shareData.price.toNumber() * depositorKtokenBalance) / 10 ** kTokenDecimals);
    assertFuzzyEq((shareData.price.toNumber() * depositorKtokenBalance) / 10 ** kTokenDecimals, usdInvested, slippage);
  });

  it('swap_A_to_kAB_A_is_SPL_B_is_SPL', async function () {
    // ensuring that the order of A and B is kept as they are ordered based on mint pubkeys
    const tokenBMintKey = Keypair.generate();
    const tokenAMintKey = generateKeypairLt(tokenBMintKey.publicKey);
    const tokenASymbol = 'USDH';
    const tokenBSymbol = 'USDC';
    const ktokenSymbol = 'kUSDH-USDC (Orca)';
    const { env, kaminoMarket, kamino } = await setupStrategyAndMarketWithInitialLiquidity({
      reserves: [
        [tokenASymbol, '0'],
        [tokenBSymbol, '0'],
        [ktokenSymbol, '1'],
      ],
      prices: {
        USDC: Price.USDC_USD_1,
        USDH: Price.USDC_USD_1,
      },
      mintOverrides: {
        [tokenASymbol]: tokenAMintKey,
        [tokenBSymbol]: tokenBMintKey,
      },
    });
    await sleep(2000);

    await reloadReservesAndRefreshMarket(env, kaminoMarket);

    const ktokenReserve = kaminoMarket.getReserveBySymbol(ktokenSymbol);
    const ktokenMint = ktokenReserve?.state.liquidity.mintPubkey!;
    const strategy = await kamino.getStrategyByKTokenMint(ktokenMint);
    const tokenAMint = strategy?.strategy.tokenAMint!;

    const depositor = await newUser(env, kaminoMarket, [[tokenASymbol, new Decimal(45)]]);
    await sleep(2000);

    const slippage = 0.01;
    const usdhToDeposit = 40;
    const depositDecimals = (
      await new Token(env.provider.connection, tokenAMint, TOKEN_PROGRAM_ID, env.admin).getMintInfo()
    ).decimals;

    const expectedDebtTokenAtaBalance = await getExpectedTokenBalanceAfterBorrow(
      env.provider.connection,
      tokenAMint,
      depositor.publicKey,
      new Decimal(0),
      0
    );
    const swapper = await getTokenToKtokenSwapper(
      env.provider.connection,
      kaminoMarket,
      kamino,
      depositor.publicKey,
      getLocalSwapper(env, kaminoMarket, depositor.publicKey),
      getPriceAinB(kaminoMarket)
    );
    const [swapIxns] = await swapper(
      usdhToDeposit * 10 ** depositDecimals,
      tokenAMint,
      ktokenMint,
      slippage,
      expectedDebtTokenAtaBalance
    );

    await sleep(2000);

    const swapperLookupTable = await createLookupTable(
      env,
      swapIxns
        .map((ixn) => ixn.keys)
        .flat()
        .map((key) => key.pubkey)
    );
    await sleep(2000);

    const tx = await buildVersionedTransaction(env.provider.connection, depositor.publicKey, swapIxns, [
      // ...lookupTableAddresses,
      swapperLookupTable,
    ]);
    tx.sign([depositor]);
    tx.sign([env.admin]);

    await sendAndConfirmVersionedTransaction(env.provider.connection, tx, 'processed', { skipPreflight: true });

    await sleep(2000);
    const depositorKtokenAta = await getAssociatedTokenAddress(ktokenMint, depositor.publicKey);
    const depositorKtokenBalance = await getTokenAccountBalance(env.provider, depositorKtokenAta);
    console.log('ktoken balance: ', depositorKtokenBalance);

    assert(depositorKtokenBalance > 0);
    const shareData = await kamino.getStrategyShareData(strategy?.address!);
    const usdInvested = 2 * 20;
    console.log('shareData ', JSON.stringify(shareData));
    const kTokenDecimals = (
      await new Token(env.provider.connection, ktokenMint, TOKEN_PROGRAM_ID, env.admin).getMintInfo()
    ).decimals;
    console.log('expected', (shareData.price.toNumber() * depositorKtokenBalance) / 10 ** kTokenDecimals);
    assertFuzzyEq((shareData.price.toNumber() * depositorKtokenBalance) / 10 ** kTokenDecimals, usdInvested, slippage);
  });

  it('swap_B_to_kAB_A_is_SPL_B_is_SPL', async function () {
    // ensuring that the order of A and B is kept as they are ordered based on mint pubkeys
    const tokenBMintKey = Keypair.generate();
    const tokenAMintKey = generateKeypairLt(tokenBMintKey.publicKey);
    const tokenASymbol = 'USDH';
    const tokenBSymbol = 'USDC';
    const ktokenSymbol = 'kUSDH-USDC (Orca)';
    const { env, kaminoMarket, kamino } = await setupStrategyAndMarketWithInitialLiquidity({
      reserves: [
        [tokenASymbol, '0'],
        [tokenBSymbol, '0'],
        [ktokenSymbol, '1'],
      ],
      prices: {
        USDC: Price.USDC_USD_1,
        USDH: Price.USDC_USD_1,
      },
      mintOverrides: {
        [tokenASymbol]: tokenAMintKey,
        [tokenBSymbol]: tokenBMintKey,
      },
    });

    await reloadReservesAndRefreshMarket(env, kaminoMarket);

    const ktokenReserve = kaminoMarket.getReserveBySymbol(ktokenSymbol);
    const ktokenMint = ktokenReserve?.state.liquidity.mintPubkey!;
    const strategy = await kamino.getStrategyByKTokenMint(ktokenMint);
    const tokenBMint = strategy?.strategy.tokenBMint!;

    const depositor = await newUser(env, kaminoMarket, [[tokenBSymbol, new Decimal(45)]]);

    const slippage = 0.01;
    const usdcToDeposit = 40;
    const depositDecimals = (
      await new Token(env.provider.connection, tokenBMint, TOKEN_PROGRAM_ID, env.admin).getMintInfo()
    ).decimals;

    const expectedDebtTokenAtaBalance = await getExpectedTokenBalanceAfterBorrow(
      env.provider.connection,
      tokenBMint,
      depositor.publicKey,
      new Decimal(0),
      0
    );

    const swapper = await getTokenToKtokenSwapper(
      env.provider.connection,
      kaminoMarket,
      kamino,
      depositor.publicKey,
      getLocalSwapper(env, kaminoMarket, depositor.publicKey),
      getPriceAinB(kaminoMarket)
    );
    const [swapIxns] = await swapper(
      usdcToDeposit * 10 ** depositDecimals,
      tokenBMint,
      ktokenMint,
      slippage,
      expectedDebtTokenAtaBalance
    );

    const swapperLookupTable = await createLookupTable(
      env,
      swapIxns
        .map((ixn) => ixn.keys)
        .flat()
        .map((key) => key.pubkey)
    );
    await sleep(2000);

    const tx = await buildVersionedTransaction(env.provider.connection, depositor.publicKey, swapIxns, [
      // ...lookupTableAddresses,
      swapperLookupTable,
    ]);
    tx.sign([depositor]);
    tx.sign([env.admin]);

    await sendAndConfirmVersionedTransaction(env.provider.connection, tx, 'processed', { skipPreflight: true });

    await sleep(2000);
    const depositorKtokenAta = await getAssociatedTokenAddress(ktokenMint, depositor.publicKey);
    const depositorKtokenBalance = await getTokenAccountBalance(env.provider, depositorKtokenAta);
    console.log('ktoken balance: ', depositorKtokenBalance);

    assert(depositorKtokenBalance > 0);
    const shareData = await kamino.getStrategyShareData(strategy?.address!);
    const usdInvested = 2 * 20;
    console.log('shareData ', JSON.stringify(shareData));
    const kTokenDecimals = (
      await new Token(env.provider.connection, ktokenMint, TOKEN_PROGRAM_ID, env.admin).getMintInfo()
    ).decimals;
    console.log('expected', (shareData.price.toNumber() * depositorKtokenBalance) / 10 ** kTokenDecimals);
    assertFuzzyEq((shareData.price.toNumber() * depositorKtokenBalance) / 10 ** kTokenDecimals, usdInvested, slippage);
  });

  it('swap_kAB_to_A_A_is_SOL_B_is_SPL', async function () {
    const tokenBMintKey = generateKeypairGt(WSOL_MINT);
    const tokenASymbol = 'SOL';
    const tokenBSymbol = 'STSOL';
    const ktokenSymbol = 'kSOL-STSOL (Orca)';
    const { env, kaminoMarket, kamino } = await setupStrategyAndMarketWithInitialLiquidity({
      reserves: [
        [tokenASymbol, '0'],
        [tokenBSymbol, '0'],
        [ktokenSymbol, '0'],
      ],
      mintOverrides: {
        [tokenBSymbol]: tokenBMintKey,
      },
    });

    await reloadReservesAndRefreshMarket(env, kaminoMarket);

    const ktokenReserve = kaminoMarket.getReserveBySymbol(ktokenSymbol);
    const ktokenMint = ktokenReserve?.state.liquidity.mintPubkey!;
    const strategy = await kamino.getStrategyByKTokenMint(ktokenMint);
    const tokenAMint = strategy?.strategy.tokenAMint!;

    const slippage = 0.01;
    const ktokenToWithdraw = 10000;
    const ktokenDecimals = (
      await new Token(env.provider.connection, ktokenMint, TOKEN_PROGRAM_ID, env.admin).getMintInfo()
    ).decimals;

    const depositor = await newUser(env, kaminoMarket, [[ktokenSymbol, new Decimal(ktokenToWithdraw)]], kamino);

    const swapper = await getKtokenToTokenSwapper(
      kaminoMarket,
      kamino,
      depositor.publicKey,
      getLocalSwapper(env, kaminoMarket, depositor.publicKey)
    );
    const [swapIxns] = await swapper(ktokenToWithdraw * 10 ** ktokenDecimals, ktokenMint, tokenAMint, slippage);

    const swapperLookupTable = await createLookupTable(
      env,
      swapIxns
        .map((ixn) => ixn.keys)
        .flat()
        .map((key) => key.pubkey)
    );
    await sleep(2000);

    const tx = await buildVersionedTransaction(env.provider.connection, depositor.publicKey, swapIxns, [
      // ...lookupTableAddresses,
      swapperLookupTable,
    ]);
    tx.sign([depositor]);
    tx.sign([env.admin]);
    const depositorTokenAAta = await getAssociatedTokenAddress(tokenAMint, depositor.publicKey);
    const depositorTokenABalanceBefore = await getTokenAccountBalance(env.provider, depositorTokenAAta);

    await sendAndConfirmVersionedTransaction(env.provider.connection, tx, 'processed', { skipPreflight: true });

    await sleep(2000);
    const depositorTokenABalanceAfter = await getTokenAccountBalance(env.provider, depositorTokenAAta);
    const tokenADecimals = (
      await new Token(env.provider.connection, tokenAMint, TOKEN_PROGRAM_ID, env.admin).getMintInfo()
    ).decimals;
    const tokenADiff = (depositorTokenABalanceAfter - depositorTokenABalanceBefore) / 10 ** tokenADecimals;
    console.log('tokenA balance diff: ', tokenADiff);

    assert(tokenADiff > 0);
    const shareData = await kamino.getStrategyShareData(strategy?.address!);
    console.log('shareData ', JSON.stringify(shareData));

    console.log(
      'expected',
      (shareData.price.toNumber() * ktokenToWithdraw) / shareData.balance.prices.aPrice.toNumber()
    );
    assertFuzzyEq(
      (shareData.price.toNumber() * ktokenToWithdraw) / shareData.balance.prices.aPrice.toNumber(),
      tokenADiff,
      slippage
    );
  });

  it('swap_kAB_to_B_A_is_SOL_B_is_SPL', async function () {
    const tokenBMintKey = generateKeypairGt(WSOL_MINT);
    const tokenASymbol = 'SOL';
    const tokenBSymbol = 'STSOL';
    const ktokenSymbol = 'kSOL-STSOL (Orca)';
    const { env, kaminoMarket, kamino } = await setupStrategyAndMarketWithInitialLiquidity({
      reserves: [
        [tokenASymbol, '0'],
        [tokenBSymbol, '0'],
        [ktokenSymbol, '0'],
      ],
      mintOverrides: {
        [tokenBSymbol]: tokenBMintKey,
      },
    });

    await reloadReservesAndRefreshMarket(env, kaminoMarket);

    const ktokenReserve = kaminoMarket.getReserveBySymbol(ktokenSymbol);
    const ktokenMint = ktokenReserve?.state.liquidity.mintPubkey!;
    const strategy = await kamino.getStrategyByKTokenMint(ktokenMint);
    const tokenBMint = strategy?.strategy.tokenBMint!;

    const slippage = 0.01;
    const ktokenToWithdraw = 10000;
    const ktokenDecimals = (
      await new Token(env.provider.connection, ktokenMint, TOKEN_PROGRAM_ID, env.admin).getMintInfo()
    ).decimals;

    const depositor = await newUser(env, kaminoMarket, [[ktokenSymbol, new Decimal(ktokenToWithdraw)]], kamino);

    const swapper = await getKtokenToTokenSwapper(
      kaminoMarket,
      kamino,
      depositor.publicKey,
      getLocalSwapper(env, kaminoMarket, depositor.publicKey)
    );
    const [swapIxns] = await swapper(ktokenToWithdraw * 10 ** ktokenDecimals, ktokenMint, tokenBMint, slippage);

    const swapperLookupTable = await createLookupTable(
      env,
      swapIxns
        .map((ixn) => ixn.keys)
        .flat()
        .map((key) => key.pubkey)
    );
    await sleep(2000);

    const tx = await buildVersionedTransaction(env.provider.connection, depositor.publicKey, swapIxns, [
      // ...lookupTableAddresses,
      swapperLookupTable,
    ]);
    tx.sign([depositor]);
    tx.sign([env.admin]);
    const depositorTokenBAta = await getAssociatedTokenAddress(tokenBMint, depositor.publicKey);
    const depositorTokenBBalanceBefore = await getTokenAccountBalance(env.provider, depositorTokenBAta);

    await sendAndConfirmVersionedTransaction(env.provider.connection, tx, 'processed', { skipPreflight: true });

    await sleep(2000);
    const depositorTokenBBalanceAfter = await getTokenAccountBalance(env.provider, depositorTokenBAta);
    const tokenBDecimals = (
      await new Token(env.provider.connection, tokenBMint, TOKEN_PROGRAM_ID, env.admin).getMintInfo()
    ).decimals;
    const tokenBDiff = (depositorTokenBBalanceAfter - depositorTokenBBalanceBefore) / 10 ** tokenBDecimals;
    console.log('tokenA balance diff: ', tokenBDiff);

    assert(tokenBDiff > 0);
    const shareData = await kamino.getStrategyShareData(strategy?.address!);
    console.log('shareData ', JSON.stringify(shareData));

    console.log(
      'expected',
      (shareData.price.toNumber() * ktokenToWithdraw) / shareData.balance.prices.bPrice.toNumber()
    );
    assertFuzzyEq(
      (shareData.price.toNumber() * ktokenToWithdraw) / shareData.balance.prices.bPrice.toNumber(),
      tokenBDiff,
      slippage
    );
  });

  it('swap_kAB_to_A_A_is_SPL_B_is_SOL', async function () {
    const tokenAMintKey = generateKeypairLt(WSOL_MINT);
    const tokenASymbol = 'USDH';
    const tokenBSymbol = 'SOL';
    const ktokenSymbol = 'kUSDH-SOL (Orca)';
    const { env, kaminoMarket, kamino } = await setupStrategyAndMarketWithInitialLiquidity({
      reserves: [
        [tokenASymbol, '0'],
        [tokenBSymbol, '0'],
        [ktokenSymbol, '0'],
      ],
      mintOverrides: {
        [tokenASymbol]: tokenAMintKey,
      },
    });

    await reloadReservesAndRefreshMarket(env, kaminoMarket);

    const ktokenReserve = kaminoMarket.getReserveBySymbol(ktokenSymbol);
    const ktokenMint = ktokenReserve?.state.liquidity.mintPubkey!;
    const strategy = await kamino.getStrategyByKTokenMint(ktokenMint);
    const tokenAMint = strategy?.strategy.tokenAMint!;

    const slippage = 0.001;
    const ktokenToWithdraw = 10000;
    const ktokenDecimals = (
      await new Token(env.provider.connection, ktokenMint, TOKEN_PROGRAM_ID, env.admin).getMintInfo()
    ).decimals;

    const depositor = await newUser(env, kaminoMarket, [[ktokenSymbol, new Decimal(ktokenToWithdraw)]], kamino);

    const swapper = await getKtokenToTokenSwapper(
      kaminoMarket,
      kamino,
      depositor.publicKey,
      getLocalSwapper(env, kaminoMarket, depositor.publicKey)
    );
    const [swapIxns] = await swapper(ktokenToWithdraw * 10 ** ktokenDecimals, ktokenMint, tokenAMint, slippage);

    const swapperLookupTable = await createLookupTable(
      env,
      swapIxns
        .map((ixn) => ixn.keys)
        .flat()
        .map((key) => key.pubkey)
    );
    await sleep(2000);

    const tx = await buildVersionedTransaction(env.provider.connection, depositor.publicKey, swapIxns, [
      // ...lookupTableAddresses,
      swapperLookupTable,
    ]);
    tx.sign([depositor]);
    tx.sign([env.admin]);
    const depositorTokenAAta = await getAssociatedTokenAddress(tokenAMint, depositor.publicKey);
    const depositorTokenABalanceBefore = await getTokenAccountBalance(env.provider, depositorTokenAAta);

    await sendAndConfirmVersionedTransaction(env.provider.connection, tx, 'processed', { skipPreflight: true });

    await sleep(2000);
    const depositorTokenABalanceAfter = await getTokenAccountBalance(env.provider, depositorTokenAAta);
    const tokenADecimals = (
      await new Token(env.provider.connection, tokenAMint, TOKEN_PROGRAM_ID, env.admin).getMintInfo()
    ).decimals;
    const tokenADiff = (depositorTokenABalanceAfter - depositorTokenABalanceBefore) / 10 ** tokenADecimals;
    console.log('tokenA balance diff: ', tokenADiff);

    assert(tokenADiff > 0);
    const shareData = await kamino.getStrategyShareData(strategy?.address!);
    console.log('shareData ', JSON.stringify(shareData));

    console.log(
      'expected',
      (shareData.price.toNumber() * ktokenToWithdraw) / shareData.balance.prices.aPrice.toNumber()
    );
    assertFuzzyEq(
      (shareData.price.toNumber() * ktokenToWithdraw) / shareData.balance.prices.aPrice.toNumber(),
      tokenADiff,
      slippage
    );
  });

  it('swap_kAB_to_B_A_is_SPL_B_is_SOL', async function () {
    const tokenAMintKey = generateKeypairLt(WSOL_MINT);
    const tokenASymbol = 'USDH';
    const tokenBSymbol = 'SOL';
    const ktokenSymbol = 'kUSDH-SOL (Orca)';
    const { env, kaminoMarket, kamino } = await setupStrategyAndMarketWithInitialLiquidity({
      reserves: [
        [tokenASymbol, '0'],
        [tokenBSymbol, '0'],
        [ktokenSymbol, '0'],
      ],
      mintOverrides: {
        [tokenASymbol]: tokenAMintKey,
      },
    });

    await reloadReservesAndRefreshMarket(env, kaminoMarket);

    const ktokenReserve = kaminoMarket.getReserveBySymbol(ktokenSymbol);
    const ktokenMint = ktokenReserve?.state.liquidity.mintPubkey!;
    const strategy = await kamino.getStrategyByKTokenMint(ktokenMint);
    const tokenBMint = strategy?.strategy.tokenBMint!;

    const slippage = 0.001;
    const ktokenToWithdraw = 10000;
    const ktokenDecimals = (
      await new Token(env.provider.connection, ktokenMint, TOKEN_PROGRAM_ID, env.admin).getMintInfo()
    ).decimals;

    const depositor = await newUser(env, kaminoMarket, [[ktokenSymbol, new Decimal(ktokenToWithdraw)]], kamino);

    const swapper = await getKtokenToTokenSwapper(
      kaminoMarket,
      kamino,
      depositor.publicKey,
      getLocalSwapper(env, kaminoMarket, depositor.publicKey)
    );
    const [swapIxns] = await swapper(ktokenToWithdraw * 10 ** ktokenDecimals, ktokenMint, tokenBMint, slippage);

    const swapperLookupTable = await createLookupTable(
      env,
      swapIxns
        .map((ixn) => ixn.keys)
        .flat()
        .map((key) => key.pubkey)
    );
    await sleep(2000);

    const tx = await buildVersionedTransaction(env.provider.connection, depositor.publicKey, swapIxns, [
      // ...lookupTableAddresses,
      swapperLookupTable,
    ]);
    tx.sign([depositor]);
    tx.sign([env.admin]);
    const depositorTokenBAta = await getAssociatedTokenAddress(tokenBMint, depositor.publicKey);
    const depositorTokenBBalanceBefore = await getTokenAccountBalance(env.provider, depositorTokenBAta);

    await sendAndConfirmVersionedTransaction(env.provider.connection, tx, 'processed', { skipPreflight: true });

    await sleep(2000);
    const depositorTokenBBalanceAfter = await getTokenAccountBalance(env.provider, depositorTokenBAta);
    const tokenBDecimals = (
      await new Token(env.provider.connection, tokenBMint, TOKEN_PROGRAM_ID, env.admin).getMintInfo()
    ).decimals;
    const tokenBDiff = (depositorTokenBBalanceAfter - depositorTokenBBalanceBefore) / 10 ** tokenBDecimals;
    console.log('tokenA balance diff: ', tokenBDiff);

    assert(tokenBDiff > 0);
    const shareData = await kamino.getStrategyShareData(strategy?.address!);
    console.log('shareData ', JSON.stringify(shareData));

    console.log(
      'expected',
      (shareData.price.toNumber() * ktokenToWithdraw) / shareData.balance.prices.bPrice.toNumber()
    );
    assertFuzzyEq(
      (shareData.price.toNumber() * ktokenToWithdraw) / shareData.balance.prices.bPrice.toNumber(),
      tokenBDiff,
      slippage
    );
  });

  it('swap_kAB_to_A_A_is_SPL_B_is_SPL', async function () {
    const tokenASymbol = 'USDH';
    const tokenBSymbol = 'USDC';
    const ktokenSymbol = 'kUSDH-USDC (Orca)';
    const tokenBMintKey = Keypair.generate();
    const tokenAMintKey = generateKeypairLt(tokenBMintKey.publicKey);
    const { env, kaminoMarket, kamino } = await setupStrategyAndMarketWithInitialLiquidity({
      reserves: [
        [tokenASymbol, '0'],
        [tokenBSymbol, '0'],
        [ktokenSymbol, '0'],
      ],
      mintOverrides: {
        [tokenASymbol]: tokenAMintKey,
        [tokenBSymbol]: tokenBMintKey,
      },
    });

    await reloadReservesAndRefreshMarket(env, kaminoMarket);

    const ktokenReserve = kaminoMarket.getReserveBySymbol(ktokenSymbol);
    const ktokenMint = ktokenReserve?.state.liquidity.mintPubkey!;
    const strategy = await kamino.getStrategyByKTokenMint(ktokenMint);
    const tokenAMint = strategy?.strategy.tokenAMint!;

    const slippage = 0.0001;
    const ktokenToWithdraw = 10000;
    const ktokenDecimals = (
      await new Token(env.provider.connection, ktokenMint, TOKEN_PROGRAM_ID, env.admin).getMintInfo()
    ).decimals;

    const depositor = await newUser(env, kaminoMarket, [[ktokenSymbol, new Decimal(ktokenToWithdraw)]], kamino);

    const swapper = await getKtokenToTokenSwapper(
      kaminoMarket,
      kamino,
      depositor.publicKey,
      getLocalSwapper(env, kaminoMarket, depositor.publicKey)
    );
    const [swapIxns] = await swapper(ktokenToWithdraw * 10 ** ktokenDecimals, ktokenMint, tokenAMint, slippage);

    const swapperLookupTable = await createLookupTable(
      env,
      swapIxns
        .map((ixn) => ixn.keys)
        .flat()
        .map((key) => key.pubkey)
    );
    await sleep(2000);

    const tx = await buildVersionedTransaction(env.provider.connection, depositor.publicKey, swapIxns, [
      // ...lookupTableAddresses,
      swapperLookupTable,
    ]);
    tx.sign([depositor]);
    tx.sign([env.admin]);
    const depositorTokenAAta = await getAssociatedTokenAddress(tokenAMint, depositor.publicKey);
    const depositorTokenABalanceBefore = await getTokenAccountBalance(env.provider, depositorTokenAAta);

    await sendAndConfirmVersionedTransaction(env.provider.connection, tx, 'processed', { skipPreflight: true });

    await sleep(2000);
    const depositorTokenABalanceAfter = await getTokenAccountBalance(env.provider, depositorTokenAAta);
    const tokenADecimals = (
      await new Token(env.provider.connection, tokenAMint, TOKEN_PROGRAM_ID, env.admin).getMintInfo()
    ).decimals;
    const tokenADiff = (depositorTokenABalanceAfter - depositorTokenABalanceBefore) / 10 ** tokenADecimals;
    console.log('tokenA balance diff: ', tokenADiff);

    assert(tokenADiff > 0);
    const shareData = await kamino.getStrategyShareData(strategy?.address!);
    console.log('shareData ', JSON.stringify(shareData));

    console.log(
      'expected',
      (shareData.price.toNumber() * ktokenToWithdraw) / shareData.balance.prices.aPrice.toNumber()
    );
    assertFuzzyEq(
      (shareData.price.toNumber() * ktokenToWithdraw) / shareData.balance.prices.aPrice.toNumber(),
      tokenADiff,
      slippage * 2
    );
  });

  it('swap_kAB_to_B_A_is_SPL_B_is_SPL', async function () {
    const tokenASymbol = 'USDH';
    const tokenBSymbol = 'USDC';
    const ktokenSymbol = 'kUSDH-USDC (Orca)';
    const tokenBMintKey = Keypair.generate();
    const tokenAMintKey = generateKeypairLt(tokenBMintKey.publicKey);
    const { env, kaminoMarket, kamino } = await setupStrategyAndMarketWithInitialLiquidity({
      reserves: [
        [tokenASymbol, '0'],
        [tokenBSymbol, '0'],
        [ktokenSymbol, '0'],
      ],
      mintOverrides: {
        [tokenASymbol]: tokenAMintKey,
        [tokenBSymbol]: tokenBMintKey,
      },
    });

    await reloadReservesAndRefreshMarket(env, kaminoMarket);

    const ktokenReserve = kaminoMarket.getReserveBySymbol(ktokenSymbol);
    const ktokenMint = ktokenReserve?.state.liquidity.mintPubkey!;
    const strategy = await kamino.getStrategyByKTokenMint(ktokenMint);
    const tokenBMint = strategy?.strategy.tokenBMint!;

    const slippage = 0.0001;
    const ktokenToWithdraw = 10000;
    const ktokenDecimals = (
      await new Token(env.provider.connection, ktokenMint, TOKEN_PROGRAM_ID, env.admin).getMintInfo()
    ).decimals;

    const depositor = await newUser(env, kaminoMarket, [[ktokenSymbol, new Decimal(ktokenToWithdraw)]], kamino);

    const swapper = await getKtokenToTokenSwapper(
      kaminoMarket,
      kamino,
      depositor.publicKey,
      getLocalSwapper(env, kaminoMarket, depositor.publicKey)
    );
    const [swapIxns] = await swapper(ktokenToWithdraw * 10 ** ktokenDecimals, ktokenMint, tokenBMint, slippage);

    const swapperLookupTable = await createLookupTable(
      env,
      swapIxns
        .map((ixn) => ixn.keys)
        .flat()
        .map((key) => key.pubkey)
    );
    await sleep(2000);

    const tx = await buildVersionedTransaction(env.provider.connection, depositor.publicKey, swapIxns, [
      // ...lookupTableAddresses,
      swapperLookupTable,
    ]);
    tx.sign([depositor]);
    tx.sign([env.admin]);
    const depositorTokenBAta = await getAssociatedTokenAddress(tokenBMint, depositor.publicKey);
    const depositorTokenBBalanceBefore = await getTokenAccountBalance(env.provider, depositorTokenBAta);

    await sendAndConfirmVersionedTransaction(env.provider.connection, tx, 'processed', { skipPreflight: true });

    await sleep(2000);
    const depositorTokenBBalanceAfter = await getTokenAccountBalance(env.provider, depositorTokenBAta);
    const tokenBDecimals = (
      await new Token(env.provider.connection, tokenBMint, TOKEN_PROGRAM_ID, env.admin).getMintInfo()
    ).decimals;
    const tokenBDiff = (depositorTokenBBalanceAfter - depositorTokenBBalanceBefore) / 10 ** tokenBDecimals;
    console.log('tokenA balance diff: ', tokenBDiff);

    assert(tokenBDiff > 0);
    const shareData = await kamino.getStrategyShareData(strategy?.address!);
    console.log('shareData ', JSON.stringify(shareData));

    console.log(
      'expected',
      (shareData.price.toNumber() * ktokenToWithdraw) / shareData.balance.prices.bPrice.toNumber()
    );
    assertFuzzyEq(
      (shareData.price.toNumber() * ktokenToWithdraw) / shareData.balance.prices.bPrice.toNumber(),
      tokenBDiff,
      slippage * 2
    );
  });
});

function generateKeypairLt(keyToCompare: PublicKey): Keypair {
  let isLessThan = false;
  let keypair = Keypair.generate();
  while (!isLessThan) {
    keypair = Keypair.generate();
    isLessThan = Buffer.compare(keyToCompare.toBuffer(), keypair.publicKey.toBuffer()) > 0;
  }
  return keypair;
}

function generateKeypairGt(keyToCompare: PublicKey): Keypair {
  let isGreaterThan = false;
  let keypair = Keypair.generate();
  while (!isGreaterThan) {
    keypair = Keypair.generate();
    isGreaterThan = Buffer.compare(keyToCompare.toBuffer(), keypair.publicKey.toBuffer()) < 0;
  }
  return keypair;
}
