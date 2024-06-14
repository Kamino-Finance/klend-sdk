import { NATIVE_MINT } from '@solana/spl-token';
import {
  AssetReserveConfig,
  buildAndSendTxn,
  buildComputeBudgetIx,
  CollateralConfig,
  DebtConfig,
  KaminoManager,
  KaminoVault,
  KaminoVaultConfig,
  newFlat,
  Reserve,
  ReserveAllocationConfig,
  ReserveWithAddress,
} from '../../src';
import { Env, pythMSolPrice, pythUsdcPrice } from '../setup_utils';
import { OracleType } from '@hubbleprotocol/scope-sdk';
import { createMint } from '../token_utils';
import { PublicKey } from '@solana/web3.js';
import Decimal from 'decimal.js';

export type MarketTestAccounts = {
  marketAddress: PublicKey;
  collReserve: PublicKey;
  debtReserve: PublicKey;
  collReserveConfig: AssetReserveConfig;
  debtReserveConfig: AssetReserveConfig;
};

export type VaultMarketAccounts = {
  debtVaultAddress: PublicKey;
  collVaultAddress: PublicKey;
  marketAccounts: Array<MarketTestAccounts>;
};

export async function createMarketWithTwoAssets(
  env: Env,
  kaminoManager: KaminoManager,
  collConfigOverride?: AssetReserveConfig,
  debtConfigOverride?: AssetReserveConfig,
  usdcMintOverride?: PublicKey
): Promise<MarketTestAccounts> {
  // Creating a market
  const { market: marketKp, ixns: createMarketIxns } = await kaminoManager.createMarket({
    admin: env.admin.publicKey,
  });
  const _createMarketSig = await buildAndSendTxn(
    env.provider.connection,
    env.admin,
    createMarketIxns,
    [marketKp],
    [],
    'KaminoManager_CreateMarket'
  );

  const mintUSDC = usdcMintOverride ? usdcMintOverride : await createMint(env, env.admin.publicKey, 6);

  // Create Asset Configs and add them to the market
  const collConfig = collConfigOverride
    ? collConfigOverride
    : new AssetReserveConfig({
        mint: NATIVE_MINT,
        tokenName: 'SOL',
        mintDecimals: 9,
        priceFeed: {
          type: new OracleType.Pyth(),
          price: pythMSolPrice,
        },
        loanToValuePct: 70,
        liquidationThresholdPct: 75,
        borrowRateCurve: newFlat(0),
        depositLimit: new Decimal(1000.0),
        borrowLimit: new Decimal(0.0),
      });

  const debtConfig = debtConfigOverride
    ? debtConfigOverride
    : new AssetReserveConfig({
        mint: mintUSDC,
        tokenName: 'USDC',
        mintDecimals: 6,
        priceFeed: {
          type: new OracleType.Pyth(),
          price: pythUsdcPrice,
        },
        loanToValuePct: 0,
        liquidationThresholdPct: 0,
        borrowRateCurve: newFlat(100),
        depositLimit: new Decimal(1000.0),
        borrowLimit: new Decimal(750.0),
      });

  const { reserve: collReserveKp, txnIxns: createCollReserveTxnIxns } = await kaminoManager.addAssetToMarket({
    admin: env.admin.publicKey,
    marketAddress: marketKp.publicKey,
    assetConfig: collConfig,
  });

  const _createCollReserveSig = await buildAndSendTxn(
    env.provider.connection,
    env.admin,
    createCollReserveTxnIxns[0],
    [collReserveKp],
    [],
    'KaminoManager_CreateCollReserve'
  );

  const _updateCollReserveSig = await buildAndSendTxn(
    env.provider.connection,
    env.admin,
    createCollReserveTxnIxns[1],
    [],
    [],
    'KaminoManager_UpdateCollReserve'
  );

  const { reserve: debtReserveKp, txnIxns: createDebtReserveTxnIxns } = await kaminoManager.addAssetToMarket({
    admin: env.admin.publicKey,
    marketAddress: marketKp.publicKey,
    assetConfig: debtConfig,
  });

  const _createDebtReserveSig = await buildAndSendTxn(
    env.provider.connection,
    env.admin,
    createDebtReserveTxnIxns[0],
    [debtReserveKp],
    [],
    'KaminoManager_CreateDebtReserve'
  );

  const _updateDebtReserveSig = await buildAndSendTxn(
    env.provider.connection,
    env.admin,
    createDebtReserveTxnIxns[1],
    [],
    [],
    'KaminoManager_UpdateDebtReserve'
  );

  return {
    marketAddress: marketKp.publicKey,
    collReserve: collReserveKp.publicKey,
    debtReserve: debtReserveKp.publicKey,
    collReserveConfig: collConfig,
    debtReserveConfig: debtConfig,
  };
}

export async function createTwoMarketsWithTwoAssets(
  env: Env,
  kaminoManager: KaminoManager,
  collConfigOverride?: CollateralConfig,
  debtConfigOverride?: DebtConfig
): Promise<[MarketTestAccounts, MarketTestAccounts]> {
  const marketSetup1 = await createMarketWithTwoAssets(env, kaminoManager, collConfigOverride, debtConfigOverride);
  const marketSetup2 = await createMarketWithTwoAssets(
    env,
    kaminoManager,
    collConfigOverride,
    debtConfigOverride,
    marketSetup1.debtReserveConfig.mint
  );

  return [marketSetup1, marketSetup2];
}

export async function createVaultsWithTwoReservesMarketsWithTwoAssets(
  env: Env,
  kaminoManager: KaminoManager,
  collConfigOverride?: CollateralConfig,
  debtConfigOverride?: DebtConfig,
  weightsOverride?: Array<number>
): Promise<VaultMarketAccounts> {
  const marketSetup1 = await createMarketWithTwoAssets(env, kaminoManager, collConfigOverride, debtConfigOverride);
  const marketSetup2 = await createMarketWithTwoAssets(
    env,
    kaminoManager,
    collConfigOverride,
    debtConfigOverride,
    marketSetup1.debtReserveConfig.mint
  );

  const weights = weightsOverride ? weightsOverride : [100, 200];

  // Create kamino vault config and add to the market
  const kaminoDebtVaultConfig = new KaminoVaultConfig({
    admin: env.admin.publicKey,
    tokenMint: marketSetup1.debtReserveConfig.mint,
    performanceFeeRate: new Decimal(0.0),
    managementFeeRate: new Decimal(0.0),
  });

  const kaminoCollVaultConfig = new KaminoVaultConfig({
    admin: env.admin.publicKey,
    tokenMint: marketSetup1.collReserveConfig.mint,
    performanceFeeRate: new Decimal(0.0),
    managementFeeRate: new Decimal(0.0),
  });

  const [debtVaultKp, debtVaultCreateInstructions] = await kaminoManager.createVault(kaminoDebtVaultConfig);
  await buildAndSendTxn(
    env.provider.connection,
    env.admin,
    debtVaultCreateInstructions,
    [debtVaultKp],
    [],
    'InitDebtVault'
  );

  const [collVaultKp, collVaultCreateInstructions] = await kaminoManager.createVault(kaminoCollVaultConfig);
  await buildAndSendTxn(
    env.provider.connection,
    env.admin,
    collVaultCreateInstructions,
    [collVaultKp],
    [],
    'InitCollVault'
  );

  const debtVault = new KaminoVault(debtVaultKp.publicKey);
  const collVault = new KaminoVault(collVaultKp.publicKey);

  const debtReserveWithAddress1: ReserveWithAddress = {
    address: marketSetup1.debtReserve,
    state: (await Reserve.fetch(env.provider.connection, marketSetup1.debtReserve))!,
  };
  const debtReserveWithAddress2: ReserveWithAddress = {
    address: marketSetup2.debtReserve,
    state: (await Reserve.fetch(env.provider.connection, marketSetup2.debtReserve))!,
  };
  const collReserveWithAddress1: ReserveWithAddress = {
    address: marketSetup1.collReserve,
    state: (await Reserve.fetch(env.provider.connection, marketSetup1.collReserve))!,
  };
  const collReserveWithAddress2: ReserveWithAddress = {
    address: marketSetup2.collReserve,
    state: (await Reserve.fetch(env.provider.connection, marketSetup2.collReserve))!,
  };

  // Update Reserve Allocation
  const firstDebtReserveAllocationConfig = new ReserveAllocationConfig(
    debtReserveWithAddress1,
    weights[0],
    new Decimal(100)
  );
  const secondDebtReserveAllocationConfig = new ReserveAllocationConfig(
    debtReserveWithAddress2,
    weights[1],
    new Decimal(50)
  );

  const ix1 = await kaminoManager.updateVaultReserveAllocation(debtVault, firstDebtReserveAllocationConfig);
  const ix2 = await kaminoManager.updateVaultReserveAllocation(debtVault, secondDebtReserveAllocationConfig);

  await buildAndSendTxn(env.provider.connection, env.admin, [ix1, ix2], [], [], 'UpdateDebtVaultReserveAllocation');

  const firstCollReserveAllocationConfig = new ReserveAllocationConfig(
    collReserveWithAddress1,
    weights[0],
    new Decimal(100)
  );
  const secondCollReserveAllocationConfig = new ReserveAllocationConfig(
    collReserveWithAddress2,
    weights[1],
    new Decimal(50)
  );

  const computeBudgetIx = buildComputeBudgetIx(300_000);
  const ixn1 = await kaminoManager.updateVaultReserveAllocation(collVault, firstCollReserveAllocationConfig);
  const ixn2 = await kaminoManager.updateVaultReserveAllocation(collVault, secondCollReserveAllocationConfig);

  await buildAndSendTxn(
    env.provider.connection,
    env.admin,
    [computeBudgetIx, ixn1, ixn2],
    [],
    [],
    'UpdateCollVaultReserveAllocation'
  );

  return {
    debtVaultAddress: debtVaultKp.publicKey,
    collVaultAddress: collVaultKp.publicKey,
    marketAccounts: [marketSetup1, marketSetup2],
  };
}
