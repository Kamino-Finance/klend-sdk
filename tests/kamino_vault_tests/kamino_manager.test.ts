import { initEnv, pythMSolPrice, pythUsdcPrice } from '../setup_utils';
import Decimal from 'decimal.js';
import {
  buildAndSendTxn,
  buildComputeBudgetIx,
  CollateralConfig,
  DebtConfig,
  getTokenAccountBalance,
  KaminoManager,
  LendingMarket,
  MarketWithAddress,
  newFlat,
  Reserve,
  ReserveWithAddress,
  sleep,
} from '../../src/lib';
import { KaminoVault, KaminoVaultConfig, ReserveAllocationConfig } from '../../src/classes/vault';
import { createMint } from '../token_utils';
import { NATIVE_MINT, TOKEN_PROGRAM_ID } from '@solana/spl-token';
import {
  createMarketWithTwoAssets,
  createTwoMarketsWithTwoAssets,
  createVaultsWithTwoReservesMarketsWithTwoAssets,
} from './kamino_manager_setup_utils';
import { Keypair, LAMPORTS_PER_SOL } from '@solana/web3.js';
import { assert } from 'chai';

describe('Kamino Manager Tests', function () {
  it('kamino_manager_init_market', async function () {
    const env = await initEnv('localnet');
    const kaminoManager = new KaminoManager(env.provider.connection);

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
  });

  it('kamino_manager_add_assets_to_market', async function () {
    const env = await initEnv('localnet');
    const kaminoManager = new KaminoManager(env.provider.connection);

    const mintUSDC = await createMint(env, env.admin.publicKey, 6);

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

    // Create Asset Configs and add them to the market
    const solConfig = new CollateralConfig({
      mint: NATIVE_MINT,
      mintTokenProgram: TOKEN_PROGRAM_ID,
      tokenName: 'SOL',
      mintDecimals: 9,
      priceFeed: {
        pythPrice: pythMSolPrice,
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
        pythPrice: pythUsdcPrice,
      },
      borrowRateCurve: newFlat(100),
    });

    const { reserve: solReserveKp, txnIxns: createsolReserveTxnIxns } = await kaminoManager.addAssetToMarketIxs({
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

    const { vault: vaultKp, ixns: instructions } = await kaminoManager.createVaultIxs(kaminoVaultConfig);
    await buildAndSendTxn(env.provider.connection, env.admin, instructions, [vaultKp], [], 'InitVault');
  });

  it('kamino_manager_update_reserve_oracle', async function () {
    const env = await initEnv('localnet');
    const kaminoManager = new KaminoManager(env.provider.connection);
    const marketAccounts = await createMarketWithTwoAssets(env, kaminoManager);

    const marketWithAddress: MarketWithAddress = {
      address: marketAccounts.marketAddress,
      state: (await LendingMarket.fetch(env.provider.connection, marketAccounts.marketAddress))!,
    };

    const solReserveWithAddress: ReserveWithAddress = {
      address: marketAccounts.solReserve,
      state: (await Reserve.fetch(env.provider.connection, marketAccounts.solReserve))!,
    };

    // Get oracle configs
    const oracleConfigs = await kaminoManager.getScopeOracleConfigs();

    // Update using oracle configs (0 for SOL/USD and 52 for SOL/USD twap)
    const updateReserveIx = await kaminoManager.updateReserveScopeOracleConfigurationIxs(
      marketWithAddress,
      solReserveWithAddress,
      oracleConfigs[0],
      oracleConfigs[52]
    );
    await buildAndSendTxn(env.provider.connection, env.admin, updateReserveIx, [], [], 'UpdateReserveScopeFeed');
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

    const { vault: vaultKp, ixns: instructions } = await kaminoManager.createVaultIxs(kaminoVaultConfig);
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

    const ix1 = await kaminoManager.updateVaultReserveAllocationIxs(vault, firstReserveAllocationConfig);
    const ix2 = await kaminoManager.updateVaultReserveAllocationIxs(vault, secondReserveAllocationConfig);

    const _updateTxSignature = await buildAndSendTxn(
      env.provider.connection,
      env.admin,
      [ix1, ix2],
      [],
      [],
      'UpdateVaultReserveAllocation'
    );

    await sleep(2000);
    const latestVaultState = await vault.reloadState(env.provider.connection);

    assert.equal(latestVaultState.vaultAllocationStrategy[0].targetAllocationWeight.toNumber(), 100);
    assert.equal(latestVaultState.vaultAllocationStrategy[1].targetAllocationWeight.toNumber(), 200);
    assert.equal(
      latestVaultState.vaultAllocationStrategy[0].tokenAllocationCap.toNumber(),
      100 * 10 ** usdcReserveWithAddress1.state.liquidity.mintDecimals.toNumber()
    );
    assert.equal(
      latestVaultState.vaultAllocationStrategy[1].tokenAllocationCap.toNumber(),
      50 * 10 ** usdcReserveWithAddress2.state.liquidity.mintDecimals.toNumber()
    );
    assert(latestVaultState.vaultAllocationStrategy[0].reserve.equals(usdcReserveWithAddress1.address));
    assert(latestVaultState.vaultAllocationStrategy[1].reserve.equals(usdcReserveWithAddress2.address));
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

    const depositIx = await kaminoManager.depositToVaultIxs(user.publicKey, solVault, solAmountToDeposit);

    const _despositTxSignature = await buildAndSendTxn(
      env.provider.connection,
      user,
      [...depositIx],
      [],
      [],
      'DepositToVault'
    );

    await sleep(2000);
    const latestVaultState = await solVault.reloadState(env.provider.connection);
    const vaultTokenVaultBalance = await getTokenAccountBalance(env.provider, latestVaultState.tokenVault);
    const userSharesBalance = await kaminoManager.getUserSharesBalanceSingleVault(user.publicKey, solVault);

    assert.equal(latestVaultState.tokenAvailable.toNumber(), solAmountToDeposit.toNumber() * 10 ** 9);
    assert.equal(latestVaultState.sharesIssued.toNumber(), solAmountToDeposit.toNumber() * 10 ** 9);
    assert.equal(vaultTokenVaultBalance, latestVaultState.tokenAvailable.toNumber());
    assert.equal(userSharesBalance.toNumber(), latestVaultState.sharesIssued.toNumber() / 10 ** 6);
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
    const depositIx = await kaminoManager.depositToVaultIxs(user.publicKey, solVault, solAmountToDeposit);

    const _depositTxSignature = await buildAndSendTxn(
      env.provider.connection,
      user,
      [...depositIx],
      [],
      [],
      'DepositToVault'
    );

    await solVault.reloadState(env.provider.connection);

    // Withdraw from Vault
    const userSharesForVault = await kaminoManager.getUserSharesBalanceSingleVault(user.publicKey, solVault);

    console.log('userSharesForVault: ', userSharesForVault);

    const withdrawIxs = await kaminoManager.withdrawFromVaultIxs(
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

    await sleep(2000);
    const latestVaultState = await solVault.reloadState(env.provider.connection);
    const vaultTokenVaultBalance = await getTokenAccountBalance(env.provider, latestVaultState.tokenVault);
    const userSharesBalance = await kaminoManager.getUserSharesBalanceSingleVault(user.publicKey, solVault);

    assert.equal(latestVaultState.tokenAvailable.toNumber(), 0);
    assert.equal(vaultTokenVaultBalance, latestVaultState.tokenAvailable.toNumber());
    assert.equal(userSharesBalance.toNumber(), 0);
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
    const depositIx = await kaminoManager.depositToVaultIxs(user.publicKey, solVault, solAmountToDeposit);

    const _depositTxSignature = await buildAndSendTxn(
      env.provider.connection,
      user,
      [...depositIx],
      [],
      [],
      'DepositToVault'
    );

    await solVault.reloadState(env.provider.connection);

    // Withdraw from Vault
    const userSharesForVault = await kaminoManager.getUserSharesBalanceSingleVault(user.publicKey, solVault);

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
