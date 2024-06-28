import {
  createAddExtraComputeUnitsIx,
  createTransactionWithExtraBudget,
  Dex,
  Kamino,
  sendTransactionWithLogs,
  sleep,
  StrategyWithAddress,
  TOKEN_PROGRAM_ID,
} from '@hubbleprotocol/kamino-sdk';
import { Keypair, PublicKey, SystemProgram, Transaction } from '@solana/web3.js';
import * as KaminoInstructions from '@hubbleprotocol/kamino-sdk/dist/kamino-client/instructions';
import { PROGRAM_ID_CLI as WHIRLPOOL_PROGRAM_ID } from '@hubbleprotocol/kamino-sdk/dist/whirpools-client/programId';

import {
  GlobalConfigOption,
  GlobalConfigOptionKind,
  UpdateCollateralInfoMode,
} from '@hubbleprotocol/kamino-sdk/dist/kamino-client/types';
import { GlobalConfig } from '@hubbleprotocol/kamino-sdk/dist/kamino-client/accounts';
import * as anchor from '@coral-xyz/anchor';
import {
  AllowDepositWithoutInvest,
  UpdateDepositCap,
  UpdateDepositCapIxn,
  UpdateMaxDeviationBps,
} from '@hubbleprotocol/kamino-sdk/dist/kamino-client/types/StrategyConfigOption';
import Decimal from 'decimal.js';
import {
  DEFAULT_MAX_PRICE_AGE,
  DeployedPool,
  getCollInfoEncodedName,
  getKTokenSymbols,
  updateCollateralInfo,
  updateStrategyConfig,
} from './utils';
import { CollateralToken, collateralTokenToNumber } from './token-utils';
import { initializeWhirlpool } from './orca';
import { initializeRaydiumPool } from './raydium';
import { addScopePriceMapping, crankAndFetchScopePrice } from './scope';
import { Scope } from '@hubbleprotocol/scope-sdk';
import { Price, PriceFeed } from './price';
import { Env } from '../setup_utils';
import {
  buildAndSendTxnWithLogs,
  buildVersionedTransaction,
  createAssociatedTokenAccountIdempotentInstruction,
  getDepositWsolIxns,
  KaminoMarket,
  lamportsToNumberDecimal,
  sendAndConfirmVersionedTransaction,
} from '../../src';
import { WSOL_MINT } from '../leverage_utils';
import { getMintToIx } from '../token_utils';

export function createKaminoClient(
  env: Env,
  globalConfig: PublicKey = new PublicKey('GKnHiWh3RRrE1zsNzWxRkomymHc374TvJPSTv2wPeYdB')
): Kamino {
  return new Kamino(
    'localnet',
    env.provider.connection,
    globalConfig,
    new PublicKey('E6qbhrt4pFmCotNUSSEh6E5cRQCEJpMcd79Z56EG9KY'),
    WHIRLPOOL_PROGRAM_ID,
    new PublicKey('devi51mZmdwUJGU9hjN27vEz64Gps7uUefqxg27EAtH')
  );
}

export async function setUpGlobalConfig(
  env: Env,
  kamino: Kamino,
  scopePrices: PublicKey = new PublicKey('3NJYftD5sjVfxSnUdZ1wVML8f3aC6mp1CXCL6L7TnU8C'),
  scopeProgram: PublicKey = new PublicKey('HFn8GnPADiny6XqUoWE8uRPPxb29ikn4yTuPa9MF2fWJ')
): Promise<PublicKey> {
  const globalConfig = Keypair.generate();

  const createGlobalConfigIx = await kamino.createAccountRentExempt(
    env.admin.publicKey,
    globalConfig.publicKey,
    kamino.getProgram().account.globalConfig.size
  );

  const accounts: KaminoInstructions.InitializeGlobalConfigAccounts = {
    adminAuthority: env.admin.publicKey,
    globalConfig: globalConfig.publicKey,
    systemProgram: SystemProgram.programId,
  };

  const initializeGlobalConfigIx = KaminoInstructions.initializeGlobalConfig(accounts);

  const tx = new Transaction().add(createGlobalConfigIx).add(initializeGlobalConfigIx);
  const sig = await sendTransactionWithLogs(
    kamino.getConnection(),
    tx,
    env.admin.publicKey,
    [env.admin, globalConfig]
    // 'finalized'
  );

  console.log(`Initialize Kamino Global Config: ${globalConfig.publicKey.toString()}`);
  console.log(`Initialize Kamino Global Config txn: ${sig}`);

  kamino.setGlobalConfig(globalConfig.publicKey);

  // Now set the Scope accounts
  await updateGlobalConfig(
    env,
    kamino,
    kamino.getGlobalConfig(),
    '0',
    new GlobalConfigOption.ScopeProgramId(),
    scopeProgram.toString(),
    'key'
  );

  await updateGlobalConfig(
    env,
    kamino,
    kamino.getGlobalConfig(),
    '0',
    new GlobalConfigOption.ScopePriceId(),
    scopePrices.toString(),
    'key'
  );

  return globalConfig.publicKey;
}

export async function updateGlobalConfig(
  env: Env,
  kamino: Kamino,
  globalConfig: PublicKey,
  keyIndex: string,
  globalConfigOption: GlobalConfigOptionKind,
  flagValue: string,
  flagValueType: string
) {
  let value: bigint | PublicKey | boolean;
  if (flagValueType === 'number') {
    console.log('flagvalue is number');
    value = BigInt(flagValue);
  } else if (flagValueType === 'bool') {
    if (flagValue === 'false') {
      value = false;
    } else if (flagValue === 'true') {
      value = true;
    } else {
      throw new Error('the provided flag value is not valid bool');
    }
  } else if (flagValueType === 'key') {
    value = new PublicKey(flagValue);
  } else {
    throw new Error("flagValueType must be 'number', 'bool', or 'key'");
  }

  const index = Number.parseInt(keyIndex, 10);
  const formattedValue = getGlobalConfigValue(value);
  const args: KaminoInstructions.UpdateGlobalConfigArgs = {
    key: globalConfigOption.discriminator,
    index,
    value: formattedValue,
  };
  const accounts: KaminoInstructions.UpdateGlobalConfigAccounts = {
    adminAuthority: env.admin.publicKey,
    globalConfig,
    systemProgram: SystemProgram.programId,
  };

  const updateConfigIx = KaminoInstructions.updateGlobalConfig(args, accounts);
  const tx = new Transaction().add(updateConfigIx);
  const sig = await sendTransactionWithLogs(kamino.getConnection(), tx, env.admin.publicKey, [env.admin]);

  console.log('Update Global Config ', globalConfigOption.toJSON(), sig);
}

export function getGlobalConfigValue(value: PublicKey | bigint | boolean): number[] {
  let buffer: Buffer;
  if (value instanceof PublicKey) {
    buffer = value.toBuffer();
  } else if (typeof value === 'boolean') {
    buffer = Buffer.alloc(32);
    if (value) {
      buffer.writeUInt8(1, 0);
    } else {
      buffer.writeUInt8(0, 0);
    }
  } else if (typeof value === 'bigint') {
    buffer = Buffer.alloc(32);
    buffer.writeBigUInt64LE(value); // Because we send 32 bytes and a u64 has 8 bytes, we write it in LE
  } else {
    throw Error('wrong type for value');
  }
  return [...buffer];
}

export async function createDexPool(
  env: Env,
  kamino: Kamino,
  dex: Dex,
  tokenA: PublicKey,
  tokenB: PublicKey,
  lowerRange?: string,
  upperRange?: string,
  priceAinB?: Decimal
): Promise<PublicKey> {
  let pool: DeployedPool;
  switch (dex) {
    case 'ORCA':
      pool = await initializeWhirlpool(env, 1, tokenA, tokenB, kamino, lowerRange, upperRange, priceAinB);
      break;
    case 'RAYDIUM':
      pool = await initializeRaydiumPool(env, 1, tokenA, tokenB);
      break;
    default:
      throw new Error(`Dex ${dex} is not supported`);
  }
  return pool.pool;
}

export async function createKaminoStrategy(
  env: Env,
  kamino: Kamino,
  pool: PublicKey,
  dex: Dex,
  tokenA: [CollateralToken, PublicKey, number[]],
  tokenB: [CollateralToken, PublicKey, number[]]
): Promise<PublicKey> {
  // const globalConfig = await setUpGlobalConfig(kamino, signer, fixtures.scopeProgram, fixtures.scopePrices);
  const [tokenASymbol, tokenAMint, tokenAScopeChain] = tokenA;
  const [tokenBSymbol, tokenBMint, tokenBScopeChain] = tokenB;

  const tokenACollateralInfoIdx = collateralTokenToNumber(tokenASymbol);
  const tokenBCollateralInfoIdx = collateralTokenToNumber(tokenBSymbol);
  await sleep(1000);

  await updateCollateralInfoForToken(
    env,
    tokenACollateralInfoIdx,
    tokenAScopeChain,
    kamino.getGlobalConfig(),
    tokenASymbol,
    [0],
    tokenAMint
  );

  await updateCollateralInfoForToken(
    env,
    tokenBCollateralInfoIdx,
    tokenBScopeChain,
    kamino.getGlobalConfig(),
    tokenBSymbol,
    [0],
    tokenBMint
  );

  // @ts-ignore
  const treasuryFeeVaults = await kamino.getTreasuryFeeVaultPDAs(tokenAMint, tokenBMint);
  const updateTreasuryFeeA = await updateTreasuryFeeVault(
    env,
    kamino.getGlobalConfig(),
    tokenASymbol,
    tokenAMint,
    treasuryFeeVaults.treasuryFeeTokenAVault,
    treasuryFeeVaults.treasuryFeeVaultAuthority
  );
  console.log('updateTreasuryFeeA tx', updateTreasuryFeeA);

  const updateTreasuryFeeB = await updateTreasuryFeeVault(
    env,
    kamino.getGlobalConfig(),
    tokenBSymbol,
    tokenBMint,
    treasuryFeeVaults.treasuryFeeTokenBVault,
    treasuryFeeVaults.treasuryFeeVaultAuthority
  );
  console.log('updateTreasuryFeeB tx', updateTreasuryFeeB);

  await sleep(100);

  let strategyAddress: PublicKey;
  switch (dex) {
    case 'RAYDIUM':
      strategyAddress = await createRaydiumStrategy(env, kamino, pool);
      break;
    case 'ORCA':
      strategyAddress = await createOrcaStrategy(env, kamino, pool);
      break;
    default:
      throw new Error(`Dex ${dex} is not supported`);
  }

  await updateStrategyConfig(env, strategyAddress, new UpdateDepositCapIxn(), new Decimal('1000000000000000'));
  await updateStrategyConfig(env, strategyAddress, new UpdateDepositCap(), new Decimal('10000000000000000'));
  await updateStrategyConfig(env, strategyAddress, new UpdateMaxDeviationBps(), new Decimal(100));
  await updateStrategyConfig(env, strategyAddress, new AllowDepositWithoutInvest(), new Decimal(1));
  await updateStrategyConfig(env, strategyAddress, new UpdateMaxDeviationBps(), new Decimal(5000));

  const strategyLookupTable = await kamino.setupStrategyLookupTable(env.admin, strategyAddress);
  console.log(`Created strategy ${strategyAddress.toString()} for ${dex} pool ${pool.toString()}`);
  console.log(
    `Created strategy lookup table ${strategyLookupTable.toString()} for strategy ${strategyAddress.toString()}`
  );

  return strategyAddress;
}

export async function openPosition(
  kamino: Kamino,
  owner: Keypair,
  strategy: PublicKey,
  priceLower: string,
  priceUpper: string
): Promise<PublicKey> {
  // Open position
  const positionMint = Keypair.generate();
  const openPositionIx = await kamino.openPosition(
    strategy,
    positionMint.publicKey,
    new Decimal(priceLower),
    new Decimal(priceUpper)
  );

  const tx = createTransactionWithExtraBudget(1000000);
  tx.add(openPositionIx);
  const res = await sendTransactionWithLogs(
    kamino.getConnection(),
    tx,
    owner.publicKey,
    [owner, positionMint],
    'confirmed',
    true
  );
  console.log('open position tx hash', res);
  console.log('new position has been opened', positionMint.publicKey.toString());
  return positionMint.publicKey;
}

async function createRaydiumStrategy(env: Env, kamino: Kamino, raydiumPool: PublicKey): Promise<PublicKey> {
  const { connection } = env.provider;
  const signer = env.admin;
  const createRaydiumTx = createTransactionWithExtraBudget();
  const newRaydiumStrategy = Keypair.generate();
  const createRaydiumStrategyAccountIx = await kamino.createStrategyAccount(
    signer.publicKey,
    newRaydiumStrategy.publicKey
  );

  createRaydiumTx.add(createRaydiumStrategyAccountIx);
  const raydiumStrategyIx = await kamino.createStrategy(
    newRaydiumStrategy.publicKey,
    raydiumPool,
    signer.publicKey,
    'RAYDIUM'
  );

  createRaydiumTx.add(raydiumStrategyIx);
  const raydiumTxHash = await sendTransactionWithLogs(connection, createRaydiumTx, signer.publicKey, [
    signer,
    newRaydiumStrategy,
  ]);
  console.log('transaction hash', raydiumTxHash);
  console.log('new Raydium strategy has been created', newRaydiumStrategy.publicKey.toString());
  return newRaydiumStrategy.publicKey;
}

async function createOrcaStrategy(env: Env, kamino: Kamino, whirlpool: PublicKey): Promise<PublicKey> {
  const signer = env.admin;
  const tx = createTransactionWithExtraBudget();
  const newOrcaStrategy = Keypair.generate();
  const createStrategyAccountIx = await kamino.createStrategyAccount(signer.publicKey, newOrcaStrategy.publicKey);
  tx.add(createStrategyAccountIx);
  const orcaStrategyIx = await kamino.createStrategy(newOrcaStrategy.publicKey, whirlpool, signer.publicKey, 'ORCA');
  tx.add(orcaStrategyIx);

  const txHash = await sendTransactionWithLogs(env.provider.connection, tx, signer.publicKey, [
    signer,
    newOrcaStrategy,
  ]);
  console.log('transaction hash', txHash);
  console.log('new Orca strategy has been created', newOrcaStrategy.publicKey.toString());
  return newOrcaStrategy.publicKey;
}

export async function setUpCollateralInfo(env: Env, kamino: Kamino): Promise<PublicKey> {
  const collInfo = Keypair.generate();

  const createCollateralInfoIx = await kamino.createAccountRentExempt(
    env.admin.publicKey,
    collInfo.publicKey,
    kamino.getProgram().account.collateralInfos.size
  );

  const accounts: KaminoInstructions.InitializeCollateralInfoAccounts = {
    adminAuthority: env.admin.publicKey,
    globalConfig: kamino.getGlobalConfig(),
    systemProgram: SystemProgram.programId,
    collInfo: collInfo.publicKey,
  };

  const initializeCollateralInfosIx = KaminoInstructions.initializeCollateralInfo(accounts);

  const tx = new Transaction().add(createCollateralInfoIx).add(initializeCollateralInfosIx);
  const sig = await sendTransactionWithLogs(
    kamino.getConnection(),
    tx,
    env.admin.publicKey,
    [env.admin, collInfo]
    // 'finalized'
  );

  console.log(`Initialize Coll Info: ${collInfo.publicKey.toString()}`);
  console.log(`Initialize Coll Info txn: ${sig}`);

  // Now set the collateral infos into the global config
  await updateGlobalConfig(
    env,
    kamino,
    kamino.getGlobalConfig(),
    '0',
    new GlobalConfigOption.UpdateTokenInfos(),
    collInfo.publicKey.toString(),
    'key'
  );

  return collInfo.publicKey;
}

export async function updateCollateralInfoForToken(
  env: Env,
  collTokenIndex: number,
  scopeChain: number[],
  globalConfig: PublicKey,
  collateralToken: string,
  twapChain: number[],
  tokenMint: PublicKey
) {
  const { connection } = env.provider;
  const signer = env.admin;
  // Set Mint
  await updateCollateralInfo(
    connection,
    signer,
    globalConfig,
    collTokenIndex,
    new UpdateCollateralInfoMode.CollateralId(),
    tokenMint
  );

  // Set Label
  await updateCollateralInfo(
    connection,
    signer,
    globalConfig,
    collTokenIndex,
    new UpdateCollateralInfoMode.UpdateName(),
    getCollInfoEncodedName(collateralToken)
  );

  // todo
  // Set Twap
  // await updateCollateralInfo(
  //   connection,
  //   signer,
  //   globalConfig,
  //   collTokenIndex,
  //   new UpdateCollateralInfoMode.UpdateScopeTwap(),
  //   twapChain
  // );

  // Set Scope Chain
  await updateCollateralInfo(
    connection,
    signer,
    globalConfig,
    collTokenIndex,
    new UpdateCollateralInfoMode.UpdateScopeChain(),
    scopeChain
  );

  // Set Twap Max Age
  await updateCollateralInfo(
    connection,
    signer,
    globalConfig,
    collTokenIndex,
    new UpdateCollateralInfoMode.UpdateTwapMaxAge(),
    BigInt(DEFAULT_MAX_PRICE_AGE)
  );

  // Set Price Max Age
  await updateCollateralInfo(
    connection,
    signer,
    globalConfig,
    collTokenIndex,
    new UpdateCollateralInfoMode.UpdatePriceMaxAge(),
    BigInt(DEFAULT_MAX_PRICE_AGE)
  );
}

export async function updateTreasuryFeeVault(
  env: Env,
  globalConfig: PublicKey,
  collateralToken: CollateralToken,
  tokenMint: PublicKey,
  treasuryFeeTokenVault: PublicKey,
  treasuryFeeVaultAuthority: PublicKey
): Promise<string> {
  const args: KaminoInstructions.UpdateTreasuryFeeVaultArgs = {
    collateralId: collateralTokenToNumber(collateralToken),
  };

  const config = await GlobalConfig.fetch(env.provider.connection, globalConfig);
  if (!config) {
    throw new Error(`Error retrieving the config ${globalConfig.toString()}`);
  }

  const accounts: KaminoInstructions.UpdateTreasuryFeeVaultAccounts = {
    signer: config.adminAuthority,
    globalConfig: globalConfig,
    feeMint: tokenMint,
    treasuryFeeVault: treasuryFeeTokenVault,
    treasuryFeeVaultAuthority: treasuryFeeVaultAuthority,
    tokenInfos: config.tokenInfos,
    systemProgram: anchor.web3.SystemProgram.programId,
    rent: anchor.web3.SYSVAR_RENT_PUBKEY,
    tokenProgram: TOKEN_PROGRAM_ID,
  };

  const tx = new Transaction();
  const ix = KaminoInstructions.updateTreasuryFeeVault(args, accounts);
  tx.add(ix);

  const hash = await sendTransactionWithLogs(env.provider.connection, tx, env.admin.publicKey, [env.admin]);
  console.log('updateTreasuryFeeVault ix:', hash);
  if (!hash) {
    throw new Error('Hash for updateTreasuryFeeVault tx not found');
  }
  return hash;
}

export async function getStrategyByKTokenMint(
  kamino: Kamino,
  kToken: PublicKey
): Promise<StrategyWithAddress | undefined> {
  const allStrategies = await kamino.getAllStrategiesWithFilters({});
  return allStrategies.find((s) => s.strategy.sharesMint.equals(kToken));
}

export async function crankStrategyScopePrices(
  env: Env,
  kamino: Kamino,
  scope: Scope,
  strategy: StrategyWithAddress,
  symbol: string,
  priceFeed: PriceFeed
): Promise<void> {
  const collInfos = await kamino.getCollateralInfos();
  const tokenAInfo = collInfos.find((c) => c.mint.equals(strategy.strategy.tokenAMint))!;
  const tokenBInfo = collInfos.find((c) => c.mint.equals(strategy.strategy.tokenBMint))!;
  const initialKTokenPrice = await crankAndFetchScopePrice(env, scope, priceFeed.chain!);
  console.log(`Scope KToken price for ${symbol} is $${initialKTokenPrice}`);
  const tokenAPrice = await crankAndFetchScopePrice(env, scope, tokenAInfo.scopePriceChain);
  console.log(`Scope Token A price for ${symbol} is $${tokenAPrice}`);
  const tokenBPrice = await crankAndFetchScopePrice(env, scope, tokenBInfo.scopePriceChain);
  console.log(`Scope Token B price for ${symbol} is $${tokenBPrice}`);
}

export async function createKTokenStrategy(
  env: Env,
  kamino: Kamino,
  kaminoMarket: KaminoMarket,
  symbol: string,
  prices: Record<string, Price>
): Promise<StrategyWithAddress> {
  const [dex, tokenA, tokenB] = getKTokenSymbols(symbol);
  console.log('Creating strategy for', symbol, 'with', dex, tokenA, tokenB);
  const reserveA = kaminoMarket.getReserveBySymbol(tokenA);
  if (!reserveA) {
    throw new Error(`${tokenA} reserve not found`);
  }
  const reserveB = kaminoMarket.getReserveBySymbol(tokenB);
  if (!reserveB) {
    throw new Error(`${tokenB} reserve not found`);
  }
  const mintA = reserveA.getLiquidityMint();
  const mintB = reserveB.getLiquidityMint();
  console.log(
    'tokenA, mintA',
    tokenA.toString(),
    mintA.toString(),
    'tokenB, reserveB',
    tokenB.toString(),
    mintB.toString()
  );
  const scope = new Scope('localnet', env.provider.connection);
  const tokenAOracle = prices[tokenA];
  const tokenBOracle = prices[tokenB];
  const tokenAScopeChain = await addScopePriceMapping(env, scope, tokenA, tokenAOracle);
  const tokenBScopeChain = await addScopePriceMapping(env, scope, tokenB, tokenBOracle);
  const tokenAPrice = await crankAndFetchScopePrice(env, scope, tokenAScopeChain);
  const tokenBPrice = await crankAndFetchScopePrice(env, scope, tokenBScopeChain);
  const priceAinB = tokenAPrice.div(tokenBPrice);
  const lowerRange = priceAinB.mul(new Decimal('0.97')).toString();
  const upperRange = priceAinB.mul(new Decimal('1.03')).toString();
  const pool = await createDexPool(env, kamino, dex, mintA, mintB, lowerRange, upperRange, priceAinB);
  const strategyPubkey = await createKaminoStrategy(
    env,
    kamino,
    pool,
    dex,
    [tokenA as CollateralToken, mintA, tokenAScopeChain],
    [tokenB as CollateralToken, mintB, tokenBScopeChain]
  );
  await sleep(2000);
  console.log('lowerRange', lowerRange, 'upperRange', upperRange);
  await openPosition(kamino, env.admin, strategyPubkey, lowerRange, upperRange);
  const strategy = (await kamino.getStrategyByAddress(strategyPubkey))!;
  console.log(
    `Created ${symbol} kamino strategy with address: ${strategyPubkey.toBase58()}, kToken mint: ${strategy.sharesMint.toBase58()}`
  );
  return { address: strategyPubkey, strategy };
}

export async function mintKTokenToUser(
  env: Env,
  kamino: Kamino,
  user: Keypair,
  swapMintAuthority: Keypair,
  kTokenMint: PublicKey
): Promise<void> {
  const { address, strategy } = (await getStrategyByKTokenMint(kamino, kTokenMint))!;
  const px = await kamino.getStrategyShareData(address);
  console.log(
    `Kamino strategy stats before user deposit - A invested: ${px.balance.computedHoldings.invested.a.toString()} A not invested: ${lamportsToNumberDecimal(
      strategy.tokenAAmounts.toNumber(),
      strategy.tokenAMintDecimals.toNumber()
    )}, A price: ${px.balance.prices.aPrice.toString()}, B invested: ${px.balance.computedHoldings.invested.b.toString()}, B not invested: ${lamportsToNumberDecimal(
      strategy.tokenBAmounts.toNumber(),
      strategy.tokenBMintDecimals.toNumber()
    )}, tokenB price: ${px.balance.prices.bPrice.toString()}, shares issued: ${lamportsToNumberDecimal(
      strategy.sharesIssued.toNumber(),
      strategy.sharesMintDecimals.toNumber()
    )}, share price: ${px.price.toString()}`
  );
  // Currently just minting a largo number of kTokens to the user to avoid calculating the exact amount
  await mintToUser(
    env,
    strategy.tokenAMint,
    user.publicKey,
    1000000000000,
    strategy.tokenAMint.equals(WSOL_MINT) ? user : swapMintAuthority,
    true
  );
  await mintToUser(
    env,
    strategy.tokenBMint,
    user.publicKey,
    1000000000000,
    strategy.tokenBMint.equals(WSOL_MINT) ? user : swapMintAuthority,
    true
  );
  await sleep(2000);
  const budgetIx = createAddExtraComputeUnitsIx(1_400_000);
  const [, sharesAtaIx] = createAssociatedTokenAccountIdempotentInstruction(user.publicKey, strategy.sharesMint);
  const depositIx = await kamino.deposit(
    { address, strategy },
    new Decimal('1000'),
    new Decimal('1000'),
    user.publicKey
  );
  const investIx = await kamino.invest(address, user.publicKey);
  const tx = await buildVersionedTransaction(
    env.provider.connection,
    user.publicKey,
    [budgetIx, sharesAtaIx, depositIx, investIx],
    [strategy.strategyLookupTable]
  );
  tx.sign([user]);
  const txid = await sendAndConfirmVersionedTransaction(env.provider.connection, tx, 'confirmed');

  console.log(`Invested in ${address.toBase58()} with ${txid}`);
  await sleep(2000);
  const strategyPostDeposit = (await kamino.getStrategyByAddress(address))!;
  const postDepositPx = await kamino.getStrategyShareData(address);
  console.log(
    `Kamino strategy stats after user deposit - A invested: ${postDepositPx.balance.computedHoldings.invested.a.toString()} A not invested: ${lamportsToNumberDecimal(
      strategyPostDeposit.tokenAAmounts.toNumber(),
      strategy.tokenAMintDecimals.toNumber()
    )}, A price: ${postDepositPx.balance.prices.aPrice.toString()}, B invested: ${postDepositPx.balance.computedHoldings.invested.b.toString()}, B not invested: ${lamportsToNumberDecimal(
      strategyPostDeposit.tokenBAmounts.toNumber(),
      strategy.tokenBMintDecimals.toNumber()
    )}, B price: ${postDepositPx.balance.prices.bPrice.toString()}, shares issued: ${lamportsToNumberDecimal(
      strategyPostDeposit.sharesIssued.toNumber(),
      strategy.sharesMintDecimals.toNumber()
    )}, share price: ${postDepositPx.price.toString()}`
  );
}

export async function mintToUser(
  env: Env,
  mint: PublicKey,
  user: PublicKey,
  amountLamports: number,
  mintAuthority: Keypair,
  mintIntoWsolAta: boolean = false,
  tokenProgram: PublicKey = TOKEN_PROGRAM_ID
) {
  if (mint.equals(WSOL_MINT)) {
    const [ata, ix] = createAssociatedTokenAccountIdempotentInstruction(user, mint, user);

    await env.provider.connection.requestAirdrop(user, amountLamports);
    await sleep(3000);

    if (mintIntoWsolAta) {
      // Should never have to do this in fact
      // user simply has SOL
      // The Kamino sdk does not currently wrap SOL automatically
      const depositWsol = getDepositWsolIxns(user, ata, new Decimal(amountLamports));
      const tx = await buildVersionedTransaction(env.provider.connection, mintAuthority.publicKey, [
        ix,
        ...depositWsol,
      ]);
      const txHash = await buildAndSendTxnWithLogs(
        env.provider.connection,
        tx,
        mintAuthority,
        [mintAuthority!],
        false,
        'Wsol ATA topup'
      );
      await env.provider.connection.confirmTransaction(txHash, 'confirmed');
    }
  } else {
    const [ata, ix] = createAssociatedTokenAccountIdempotentInstruction(
      user,
      mint,
      mintAuthority.publicKey,
      tokenProgram
    );
    const instruction = getMintToIx(mintAuthority.publicKey, mint, ata, amountLamports, tokenProgram);

    const tx = await buildVersionedTransaction(env.provider.connection, env.admin.publicKey, [ix, instruction]);

    const sig = await buildAndSendTxnWithLogs(env.provider.connection, tx, env.wallet.payer, [mintAuthority]);
    return sig;
  }
}
