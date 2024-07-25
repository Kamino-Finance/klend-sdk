import { NATIVE_MINT, TOKEN_PROGRAM_ID } from '@solana/spl-token';
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
import { createMint } from '../token_utils';
import { PublicKey } from '@solana/web3.js';
import Decimal from 'decimal.js';

// SOL & USDC just for testing purposes, can be any coin
export type MarketTestAccounts = {
  marketAddress: PublicKey;
  solReserve: PublicKey;
  usdcReserve: PublicKey;
  solReserveConfig: AssetReserveConfig;
  usdcReserveConfig: AssetReserveConfig;
};

export type VaultMarketAccounts = {
  solVaultAddress: PublicKey;
  usdcVaultAddress: PublicKey;
  marketAccounts: Array<MarketTestAccounts>;
};

export async function createMarketWithTwoAssets(
  env: Env,
  kaminoManager: KaminoManager,
  solConfigOverride?: AssetReserveConfig,
  usdcConfigOverride?: AssetReserveConfig,
  usdcMintOverride?: PublicKey
): Promise<MarketTestAccounts> {
  // Creating a market
  const { market: marketKp, ixns: createMarketIxns } = await kaminoManager.createMarketIxs({
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
  const solConfig = solConfigOverride
    ? solConfigOverride
    : new AssetReserveConfig({
        mint: NATIVE_MINT,
        mintTokenProgram: TOKEN_PROGRAM_ID,
        tokenName: 'SOL',
        mintDecimals: 9,
        priceFeed: {
          pythPrice: pythMSolPrice,
        },
        loanToValuePct: 70,
        liquidationThresholdPct: 75,
        borrowRateCurve: newFlat(0),
        depositLimit: new Decimal(1000.0),
        borrowLimit: new Decimal(0.0),
      });

  const usdcConfig = usdcConfigOverride
    ? usdcConfigOverride
    : new AssetReserveConfig({
        mint: mintUSDC,
        mintTokenProgram: TOKEN_PROGRAM_ID,
        tokenName: 'USDC',
        mintDecimals: 6,
        priceFeed: {
          pythPrice: pythUsdcPrice,
        },
        loanToValuePct: 0,
        liquidationThresholdPct: 0,
        borrowRateCurve: newFlat(100),
        depositLimit: new Decimal(1000.0),
        borrowLimit: new Decimal(750.0),
      });

  const { reserve: solReserveKp, txnIxns: createsolReserveTxnIxns } = await kaminoManager.addAssetToMarketIxs({
    admin: env.admin.publicKey,
    marketAddress: marketKp.publicKey,
    assetConfig: solConfig,
  });

  const _createsolReserveSig = await buildAndSendTxn(
    env.provider.connection,
    env.admin,
    createsolReserveTxnIxns[0],
    [solReserveKp],
    [],
    'KaminoManager_CreateSolReserve'
  );

  const computeBudgetIx = buildComputeBudgetIx(400_000);

  const _updatesolReserveSig = await buildAndSendTxn(
    env.provider.connection,
    env.admin,
    [computeBudgetIx, ...createsolReserveTxnIxns[1]],
    [],
    [],
    'KaminoManager_UpdateSolReserve'
  );

  const { reserve: usdcReserveKp, txnIxns: createusdcReserveTxnIxns } = await kaminoManager.addAssetToMarketIxs({
    admin: env.admin.publicKey,
    marketAddress: marketKp.publicKey,
    assetConfig: usdcConfig,
  });

  const _createusdcReserveSig = await buildAndSendTxn(
    env.provider.connection,
    env.admin,
    createusdcReserveTxnIxns[0],
    [usdcReserveKp],
    [],
    'KaminoManager_CreateUsdcReserve'
  );

  const _updateusdcReserveSig = await buildAndSendTxn(
    env.provider.connection,
    env.admin,
    [computeBudgetIx, ...createusdcReserveTxnIxns[1]],
    [],
    [],
    'KaminoManager_UpdateUsdcReserve'
  );

  return {
    marketAddress: marketKp.publicKey,
    solReserve: solReserveKp.publicKey,
    usdcReserve: usdcReserveKp.publicKey,
    solReserveConfig: solConfig,
    usdcReserveConfig: usdcConfig,
  };
}

export async function createTwoMarketsWithTwoAssets(
  env: Env,
  kaminoManager: KaminoManager,
  solConfigOverride?: CollateralConfig,
  usdcConfigOverride?: DebtConfig
): Promise<[MarketTestAccounts, MarketTestAccounts]> {
  const marketSetup1 = await createMarketWithTwoAssets(env, kaminoManager, solConfigOverride, usdcConfigOverride);
  const marketSetup2 = await createMarketWithTwoAssets(
    env,
    kaminoManager,
    solConfigOverride,
    usdcConfigOverride,
    marketSetup1.usdcReserveConfig.mint
  );

  return [marketSetup1, marketSetup2];
}

export async function createVaultsWithTwoReservesMarketsWithTwoAssets(
  env: Env,
  kaminoManager: KaminoManager,
  solConfigOverride?: CollateralConfig,
  usdcConfigOverride?: DebtConfig,
  weightsOverride?: Array<number>
): Promise<VaultMarketAccounts> {
  const marketSetup1 = await createMarketWithTwoAssets(env, kaminoManager, solConfigOverride, usdcConfigOverride);
  const marketSetup2 = await createMarketWithTwoAssets(
    env,
    kaminoManager,
    solConfigOverride,
    usdcConfigOverride,
    marketSetup1.usdcReserveConfig.mint
  );

  const weights = weightsOverride ? weightsOverride : [100, 200];

  // Create kamino vault config and add to the market
  const kaminoUsdcVaultConfig = new KaminoVaultConfig({
    admin: env.admin.publicKey,
    tokenMint: marketSetup1.usdcReserveConfig.mint,
    tokenMintProgramId: TOKEN_PROGRAM_ID,
    performanceFeeRate: new Decimal(0.0),
    managementFeeRate: new Decimal(0.0),
  });

  const kaminoSolVaultConfig = new KaminoVaultConfig({
    admin: env.admin.publicKey,
    tokenMint: marketSetup1.solReserveConfig.mint,
    tokenMintProgramId: TOKEN_PROGRAM_ID,
    performanceFeeRate: new Decimal(0.0),
    managementFeeRate: new Decimal(0.0),
  });

  const { vault: usdcVaultKp, ixns: usdcVaultCreateInstructions } = await kaminoManager.createVaultIxs(
    kaminoUsdcVaultConfig
  );
  await buildAndSendTxn(
    env.provider.connection,
    env.admin,
    usdcVaultCreateInstructions,
    [usdcVaultKp],
    [],
    'InitusdcVault'
  );

  const { vault: solVaultKp, ixns: solVaultCreateInstructions } = await kaminoManager.createVaultIxs(
    kaminoSolVaultConfig
  );
  await buildAndSendTxn(
    env.provider.connection,
    env.admin,
    solVaultCreateInstructions,
    [solVaultKp],
    [],
    'InitsolVault'
  );

  const usdcVault = new KaminoVault(usdcVaultKp.publicKey);
  const solVault = new KaminoVault(solVaultKp.publicKey);

  const usdcReserveWithAddress1: ReserveWithAddress = {
    address: marketSetup1.usdcReserve,
    state: (await Reserve.fetch(env.provider.connection, marketSetup1.usdcReserve))!,
  };
  const usdcReserveWithAddress2: ReserveWithAddress = {
    address: marketSetup2.usdcReserve,
    state: (await Reserve.fetch(env.provider.connection, marketSetup2.usdcReserve))!,
  };
  const solReserveWithAddress1: ReserveWithAddress = {
    address: marketSetup1.solReserve,
    state: (await Reserve.fetch(env.provider.connection, marketSetup1.solReserve))!,
  };
  const solReserveWithAddress2: ReserveWithAddress = {
    address: marketSetup2.solReserve,
    state: (await Reserve.fetch(env.provider.connection, marketSetup2.solReserve))!,
  };

  // Update Reserve Allocation
  const firstusdcReserveAllocationConfig = new ReserveAllocationConfig(
    usdcReserveWithAddress1,
    weights[0],
    new Decimal(100)
  );
  const secondusdcReserveAllocationConfig = new ReserveAllocationConfig(
    usdcReserveWithAddress2,
    weights[1],
    new Decimal(50)
  );

  const ix1 = await kaminoManager.updateVaultReserveAllocationIxs(usdcVault, firstusdcReserveAllocationConfig);
  const ix2 = await kaminoManager.updateVaultReserveAllocationIxs(usdcVault, secondusdcReserveAllocationConfig);

  await buildAndSendTxn(env.provider.connection, env.admin, [ix1, ix2], [], [], 'UpdateusdcVaultReserveAllocation');

  const firstsolReserveAllocationConfig = new ReserveAllocationConfig(
    solReserveWithAddress1,
    weights[0],
    new Decimal(100)
  );
  const secondsolReserveAllocationConfig = new ReserveAllocationConfig(
    solReserveWithAddress2,
    weights[1],
    new Decimal(50)
  );

  const computeBudgetIx = buildComputeBudgetIx(400_000);
  const ixn1 = await kaminoManager.updateVaultReserveAllocationIxs(solVault, firstsolReserveAllocationConfig);
  const ixn2 = await kaminoManager.updateVaultReserveAllocationIxs(solVault, secondsolReserveAllocationConfig);

  await buildAndSendTxn(
    env.provider.connection,
    env.admin,
    [computeBudgetIx, ixn1, ixn2],
    [],
    [],
    'UpdatesolVaultReserveAllocation'
  );

  return {
    usdcVaultAddress: usdcVaultKp.publicKey,
    solVaultAddress: solVaultKp.publicKey,
    marketAccounts: [marketSetup1, marketSetup2],
  };
}
