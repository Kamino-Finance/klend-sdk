import { initEnv, pythMSolPrice, pythUsdcPrice } from '../setup_utils';
import Decimal from 'decimal.js';
import {
  buildAndSendTxn,
  buildComputeBudgetIx,
  CollateralConfig,
  DebtConfig,
  KaminoManager,
  newFlat,
  Reserve,
  ReserveWithAddress,
} from '../../src/lib';
import { KaminoVault, KaminoVaultConfig, ReserveAllocationConfig } from '../../src/classes/vault';
import { createMint } from '../token_utils';
import { NATIVE_MINT, TOKEN_PROGRAM_ID } from '@solana/spl-token';
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
    const solConfig = new CollateralConfig({
      mint: NATIVE_MINT,
      mintTokenProgram: TOKEN_PROGRAM_ID,
      tokenName: 'SOL',
      mintDecimals: 9,
      priceFeed: {
        type: new OracleType.Pyth(),
        price: pythMSolPrice,
      },
      loanToValuePct: 70,
      liquidationThresholdPct: 75,
    });

    const usdcConfig = new DebtConfig({
      mint: mintUSDC,
      mintTokenProgram: TOKEN_PROGRAM_ID,
      tokenName: 'USDC',
      mintDecimals: 6,
      priceFeed: {
        type: new OracleType.Pyth(),
        price: pythUsdcPrice,
      },
      borrowRateCurve: newFlat(100),
    });

    const { reserve: solReserveKp, txnIxns: createsolReserveTxnIxns } = await kaminoManager.addAssetToMarket({
      admin: env.admin.publicKey,
      marketAddress: marketKp.publicKey,
      assetConfig: solConfig,
    });

    const computeBudgetIx = buildComputeBudgetIx(400_000);

    const _createsolReserveSig = await buildAndSendTxn(
      env.provider.connection,
      env.admin,
      createsolReserveTxnIxns[0],
      [solReserveKp],
      [],
      'KaminoManager_CreateSolReserve'
    );

    const _updatesolReserveSig = await buildAndSendTxn(
      env.provider.connection,
      env.admin,
      [computeBudgetIx, ...createsolReserveTxnIxns[1]],
      [],
      [],
      'KaminoManager_UpdateSolReserve'
    );

    const { reserve: usdcReserveKp, txnIxns: createusdcReserveTxnIxns } = await kaminoManager.addAssetToMarket({
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
  });

  it('kamino_manager_create_vault', async function () {
    const env = await initEnv('localnet');
    const kaminoManager = new KaminoManager(env.provider.connection);

    const marketAccounts = await createMarketWithTwoAssets(env, kaminoManager);

    // Create kamino vault config and add to the market
    const kaminoVaultConfig = new KaminoVaultConfig({
      admin: env.admin.publicKey,
      tokenMint: marketAccounts.usdcReserveConfig.mint,
      tokenMintProgramId: TOKEN_PROGRAM_ID,
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
      tokenMint: marketAccounts1.usdcReserveConfig.mint,
      tokenMintProgramId: TOKEN_PROGRAM_ID,
      performanceFeeRate: new Decimal(0.0),
      managementFeeRate: new Decimal(0.0),
    });

    const [vaultKp, instructions] = await kaminoManager.createVault(kaminoVaultConfig);
    await buildAndSendTxn(env.provider.connection, env.admin, instructions, [vaultKp], [], 'InitVault');

    const vault = new KaminoVault(vaultKp.publicKey);

    const reserveStates = await Reserve.fetchMultiple(env.provider.connection, [
      marketAccounts1.usdcReserve,
      marketAccounts2.usdcReserve,
    ]);

    const usdcReserveWithAddress1: ReserveWithAddress = {
      address: marketAccounts1.usdcReserve,
      state: reserveStates[0]!,
    };
    const usdcReserveWithAddress2: ReserveWithAddress = {
      address: marketAccounts2.usdcReserve,
      state: reserveStates[1]!,
    };

    // Update Reserve Allocation
    const firstReserveAllocationConfig = new ReserveAllocationConfig(usdcReserveWithAddress1, 100, new Decimal(100));
    const secondReserveAllocationConfig = new ReserveAllocationConfig(usdcReserveWithAddress2, 200, new Decimal(50));

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

    const solVault = new KaminoVault(vaultMarketAccounts.solVaultAddress);

    const depositIx = await kaminoManager.depositToVault(user.publicKey, solVault, solAmountToDeposit);

    const _despositTxSignature = await buildAndSendTxn(
      env.provider.connection,
      user,
      [...depositIx],
      [],
      [],
      'DepositToVault'
    );
  });

  it('kamino_manager_withdraw_from_vault_uninvested', async function () {
    const env = await initEnv('localnet');
    const kaminoManager = new KaminoManager(env.provider.connection);

    const vaultMarketAccounts = await createVaultsWithTwoReservesMarketsWithTwoAssets(env, kaminoManager);

    const solAmount = 10;
    const solAmountToDeposit = new Decimal(3.0);

    const user = Keypair.generate();
    await env.provider.connection.requestAirdrop(user.publicKey, solAmount * LAMPORTS_PER_SOL);

    const solVault = new KaminoVault(vaultMarketAccounts.solVaultAddress);

    // Deposit to Vault
    const depositIx = await kaminoManager.depositToVault(user.publicKey, solVault, solAmountToDeposit);

    const _depositTxSignature = await buildAndSendTxn(
      env.provider.connection,
      user,
      [...depositIx],
      [],
      [],
      'DepositToVault'
    );

    await solVault.reload(env.provider.connection);

    // Withdraw from Vault
    const userSharesForVault = await kaminoManager.getUserVaultSharesBalance(user.publicKey, solVault);

    console.log('userSharesForVault: ', userSharesForVault);

    const withdrawIxs = await kaminoManager.withdrawFromVault(
      user.publicKey,
      solVault,
      userSharesForVault,
      await env.provider.connection.getSlot('confirmed')
    );

    const _withdrawTxSignature = await buildAndSendTxn(
      env.provider.connection,
      user,
      [...withdrawIxs],
      [],
      [],
      'WithdrawFromVault'
    );
  });

  it('kamino_manager_invest', async function () {
    const env = await initEnv('localnet');
    const kaminoManager = new KaminoManager(env.provider.connection);

    const vaultMarketAccounts = await createVaultsWithTwoReservesMarketsWithTwoAssets(env, kaminoManager);

    const solAmount = 10;
    const solAmountToDeposit = new Decimal(3.0);

    const user = Keypair.generate();
    await env.provider.connection.requestAirdrop(user.publicKey, solAmount * LAMPORTS_PER_SOL);

    const solVault = new KaminoVault(vaultMarketAccounts.solVaultAddress);

    // Deposit to Vault
    const depositIx = await kaminoManager.depositToVault(user.publicKey, solVault, solAmountToDeposit);

    const _depositTxSignature = await buildAndSendTxn(
      env.provider.connection,
      user,
      [...depositIx],
      [],
      [],
      'DepositToVault'
    );

    await solVault.reload(env.provider.connection);

    // Withdraw from Vault
    const userSharesForVault = await kaminoManager.getUserVaultSharesBalance(user.publicKey, solVault);

    console.log('userSharesForVault: ', userSharesForVault);

    // const investIxs = await kaminoManager.investAllReserves(solVault);

    // TODO: This won't work until we update the SDK to the latest version of klend master codegen
    // Current SDK is running on an older version of the codegen, for latest klend deployed on mainnet
    // const _withdrawTxSignature = await buildAndSendTxn(
    //   env.provider.connection,
    //   env.admin,
    //   [...investIxs],
    //   [],
    //   [],
    //   'InvestAll'
    // );
  });
});
