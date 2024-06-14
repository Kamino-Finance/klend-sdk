import { initEnv, pythMSolPrice, pythUsdcPrice } from '../setup_utils';
import Decimal from 'decimal.js';
import {
  buildAndSendTxn,
  CollateralConfig,
  DebtConfig,
  KaminoManager,
  newFlat,
  Reserve,
  ReserveWithAddress,
} from '../../src/lib';
import { KaminoVault, KaminoVaultConfig, ReserveAllocationConfig } from '../../src/classes/vault';
import { createMint } from '../token_utils';
import { NATIVE_MINT } from '@solana/spl-token';
import { OracleType } from '@hubbleprotocol/scope-sdk';
import {
  createMarketWithTwoAssets,
  createTwoMarketsWithTwoAssets,
  createVaultsWithTwoReservesMarketsWithTwoAssets,
} from './kamino_manager_setup_utils';
import { Keypair, LAMPORTS_PER_SOL } from '@solana/web3.js';

describe('Kamino Manager Tests', function () {
  it('kamino_manager_init_market', async function () {
    const env = await initEnv('localnet');
    const kaminoManager = new KaminoManager(env.provider.connection);

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
  });

  it('kamino_manager_add_assets_to_market', async function () {
    const env = await initEnv('localnet');
    const kaminoManager = new KaminoManager(env.provider.connection);

    const mintUSDC = await createMint(env, env.admin.publicKey, 6);

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

    // Create Asset Configs and add them to the market
    const collConfig = new CollateralConfig({
      mint: NATIVE_MINT,
      tokenName: 'SOL',
      mintDecimals: 9,
      priceFeed: {
        type: new OracleType.Pyth(),
        price: pythMSolPrice,
      },
      loanToValuePct: 70,
      liquidationThresholdPct: 75,
    });

    const debtConfig = new DebtConfig({
      mint: mintUSDC,
      tokenName: 'USDC',
      mintDecimals: 6,
      priceFeed: {
        type: new OracleType.Pyth(),
        price: pythUsdcPrice,
      },
      borrowRateCurve: newFlat(100),
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
      'KaminoManager_CreateCollReserve'
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
      'KaminoManager_CreateDebtReserve'
    );
  });

  it('kamino_manager_create_vault', async function () {
    const env = await initEnv('localnet');
    const kaminoManager = new KaminoManager(env.provider.connection);

    const marketAccounts = await createMarketWithTwoAssets(env, kaminoManager);

    // Create kamino vault config and add to the market
    const kaminoVaultConfig = new KaminoVaultConfig({
      admin: env.admin.publicKey,
      tokenMint: marketAccounts.debtReserveConfig.mint,
      performanceFeeRate: new Decimal(0.0),
      managementFeeRate: new Decimal(0.0),
    });

    const [vaultKp, instructions] = await kaminoManager.createVault(kaminoVaultConfig);
    await buildAndSendTxn(env.provider.connection, env.admin, instructions, [vaultKp], [], 'InitVault');
  });

  it('kamino_manager_update_vault_allocation', async function () {
    const env = await initEnv('localnet');
    const kaminoManager = new KaminoManager(env.provider.connection);

    const [marketAccounts1, marketAccounts2] = await createTwoMarketsWithTwoAssets(env, kaminoManager);

    // Create kamino vault config and add to the market
    const kaminoVaultConfig = new KaminoVaultConfig({
      admin: env.admin.publicKey,
      tokenMint: marketAccounts1.debtReserveConfig.mint,
      performanceFeeRate: new Decimal(0.0),
      managementFeeRate: new Decimal(0.0),
    });

    const [vaultKp, instructions] = await kaminoManager.createVault(kaminoVaultConfig);
    await buildAndSendTxn(env.provider.connection, env.admin, instructions, [vaultKp], [], 'InitVault');

    const vault = new KaminoVault(vaultKp.publicKey);

    const reserveStates = await Reserve.fetchMultiple(env.provider.connection, [
      marketAccounts1.debtReserve,
      marketAccounts2.debtReserve,
    ]);

    const debtReserveWithAddress1: ReserveWithAddress = {
      address: marketAccounts1.debtReserve,
      state: reserveStates[0]!,
    };
    const debtReserveWithAddress2: ReserveWithAddress = {
      address: marketAccounts2.debtReserve,
      state: reserveStates[1]!,
    };

    // Update Reserve Allocation
    const firstReserveAllocationConfig = new ReserveAllocationConfig(debtReserveWithAddress1, 100, new Decimal(100));
    const secondReserveAllocationConfig = new ReserveAllocationConfig(debtReserveWithAddress2, 200, new Decimal(50));

    const ix1 = await kaminoManager.updateVaultReserveAllocation(vault, firstReserveAllocationConfig);
    const ix2 = await kaminoManager.updateVaultReserveAllocation(vault, secondReserveAllocationConfig);

    const _updateTxSignature = await buildAndSendTxn(
      env.provider.connection,
      env.admin,
      [ix1, ix2],
      [],
      [],
      'UpdateVaultReserveAllocation'
    );
  });

  it('kamino_manager_deposit_to_vault', async function () {
    const env = await initEnv('localnet');
    const kaminoManager = new KaminoManager(env.provider.connection);

    const vaultMarketAccounts = await createVaultsWithTwoReservesMarketsWithTwoAssets(env, kaminoManager);

    const solAmount = 10;
    const solAmountToDeposit = new Decimal(3.0);

    const user = Keypair.generate();
    await env.provider.connection.requestAirdrop(user.publicKey, solAmount * LAMPORTS_PER_SOL);

    const collVault = new KaminoVault(vaultMarketAccounts.collVaultAddress);

    const depositIx = await kaminoManager.depositToVault(user.publicKey, collVault, solAmountToDeposit);

    const _updateTxSignature = await buildAndSendTxn(
      env.provider.connection,
      user,
      [...depositIx],
      [],
      [],
      'DepositToVault'
    );
  });
});
