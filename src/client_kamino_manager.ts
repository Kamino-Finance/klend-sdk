import dotenv from 'dotenv';
import { Command } from 'commander';
import {
  ComputeBudgetProgram,
  Connection,
  Keypair,
  PublicKey,
  Signer,
  Transaction,
  TransactionInstruction,
  TransactionSignature,
  VersionedTransaction,
} from '@solana/web3.js';
import {
  AssetReserveConfigCli,
  Chain,
  DEFAULT_RECENT_SLOT_DURATION_MS,
  encodeTokenName,
  getMedianSlotDurationInMsFromLastEpochs,
  initLookupTableIx,
  KaminoManager,
  KaminoMarket,
  KaminoVault,
  KaminoVaultConfig,
  lamportsToDecimal,
  LendingMarket,
  MAINNET_BETA_CHAIN_ID,
  parseZeroPaddedUtf8,
  printHoldings,
  Reserve,
  ReserveAllocationConfig,
  ReserveWithAddress,
  signSendAndConfirmRawTransactionWithRetry,
  sleep,
  Web3Client,
} from './lib';
import * as anchor from '@coral-xyz/anchor';
import { binary_to_base58 } from 'base58-js';
import {
  BorrowRateCurve,
  CurvePointFields,
  PriceHeuristic,
  ReserveConfig,
  ReserveConfigFields,
  ScopeConfiguration,
  TokenInfo,
  WithdrawalCaps,
} from './idl_codegen/types';
import { Fraction } from './classes/fraction';
import Decimal from 'decimal.js';
import { BN } from '@coral-xyz/anchor';
import { PythConfiguration, SwitchboardConfiguration } from './idl_codegen_kamino_vault/types';
import * as fs from 'fs';
import { MarketWithAddress } from './utils/managerTypes';
import {
  ManagementFeeBps,
  PendingVaultAdmin,
  PerformanceFeeBps,
} from './idl_codegen_kamino_vault/types/VaultConfigField';
import { getAccountOwner } from './utils/rpc';
import { getAssociatedTokenAddressSync } from '@solana/spl-token';

dotenv.config({
  path: `.env${process.env.ENV ? '.' + process.env.ENV : ''}`,
});

async function main() {
  const commands = new Command();

  commands.name('kamino-manager-cli').description('CLI to interact with the kvaults and klend programs');

  commands
    .command('create-market')
    .requiredOption(
      `--mode <string>`,
      'simulate - to print txn simulation, inspect - to get txn simulation in explorer, execute - execute txn, multisig - to get bs58 txn for multisig usage'
    )
    .option(`--staging`, 'If true, will use the staging programs')
    .option(`--multisig <string>`, 'If using multisig mode this is required, otherwise will be ignored')
    .action(async ({ mode, staging, multisig }) => {
      const env = initializeClient(mode === 'multisig', staging);

      if (mode === 'multisig' && !multisig) {
        throw new Error('If using multisig mode, multisig pubkey is required');
      }

      const multisigPk = multisig ? new PublicKey(multisig) : PublicKey.default;

      const kaminoManager = new KaminoManager(
        env.connection,
        DEFAULT_RECENT_SLOT_DURATION_MS,
        env.kLendProgramId,
        env.kVaultProgramId
      );

      const { market: marketKp, ixs: createMarketIxs } = await kaminoManager.createMarketIxs({
        admin: mode === 'multisig' ? multisigPk : env.payer.publicKey,
      });

      await processTxn(env.client, env.payer, createMarketIxs, mode, 2500, [marketKp]);

      mode === 'execute' && console.log('Market created:', marketKp.publicKey.toBase58());
    });

  commands
    .command('add-asset-to-market')
    .requiredOption('--market <string>', 'Market address to add asset to')
    .requiredOption('--mint <string>', 'Reserve liquidity token mint')
    .requiredOption('--mint-program-id <string>', 'Reserve liquidity token mint program id')
    .requiredOption('--reserve-config-path <string>', 'Path for the reserve config')
    .requiredOption(
      `--mode <string>`,
      'simulate - to print txn simulation, inspect - to get txn simulation in explorer, execute - execute txn, multisig - to get bs58 txn for multisig usage'
    )
    .option(`--staging`, 'If true, will use the staging programs')
    .option(`--multisig <string>`, 'If using multisig mode this is required, otherwise will be ignored')
    .action(async ({ market, mint, mintProgramId, reserveConfigPath, mode, staging, multisig }) => {
      const env = initializeClient(mode === 'multisig', staging);
      const tokenMint = new PublicKey(mint);
      const tokenMintProgramId = new PublicKey(mintProgramId);
      const marketAddress = new PublicKey(market);

      if (mode === 'multisig' && !multisig) {
        throw new Error('If using multisig mode, multisig is required');
      }

      const multisigPk = multisig ? new PublicKey(multisig) : PublicKey.default;
      const kaminoManager = new KaminoManager(
        env.connection,
        DEFAULT_RECENT_SLOT_DURATION_MS,
        env.kLendProgramId,
        env.kVaultProgramId
      );

      const reserveConfigFromFile = JSON.parse(fs.readFileSync(reserveConfigPath, 'utf8'));

      const reserveConfig = parseReserveConfigFromFile(reserveConfigFromFile);
      const assetConfig = new AssetReserveConfigCli(tokenMint, tokenMintProgramId, reserveConfig);

      const adminAta =
        mode === 'multisig'
          ? getAssociatedTokenAddressSync(tokenMint, multisigPk)
          : getAssociatedTokenAddressSync(tokenMint, env.payer.publicKey);

      const { reserve, txnIxs } = await kaminoManager.addAssetToMarketIxs({
        admin: mode === 'multisig' ? multisigPk : env.payer.publicKey,
        adminLiquiditySource: adminAta,
        marketAddress: marketAddress,
        assetConfig: assetConfig,
      });

      console.log('reserve: ', reserve.publicKey);

      const _createReserveSig = await processTxn(env.client, env.payer, txnIxs[0], mode, 2500, [reserve]);

      const _updateReserveSig = await processTxn(env.client, env.payer, txnIxs[1], mode, 2500, [], 400_000);

      mode === 'execute' &&
        console.log(
          'Reserve Created with config:',
          JSON.parse(JSON.stringify(reserveConfig)),
          '\nreserve address:',
          reserve.publicKey.toBase58()
        );
    });

  commands
    .command('update-reserve-config')
    .requiredOption('--reserve <string>', 'Reserve address')
    .requiredOption('--reserve-config-path <string>', 'Path for the reserve config')
    .requiredOption(
      `--mode <string>`,
      'simulate - to print txn simulation, inspect - to get txn simulation in explorer, execute - execute txn, multisig - to get bs58 txn for multisig usage'
    )
    .option('--update-entire-config', 'If set, it will update entire reserve config in 1 instruction')
    .option(`--staging`, 'If true, will use the staging programs')
    .action(async ({ reserve, reserveConfigPath, mode, updateEntireConfig, staging, multisig }) => {
      const env = initializeClient(mode === 'multisig', staging);
      const reserveAddress = new PublicKey(reserve);
      const reserveState = await Reserve.fetch(env.connection, reserveAddress, env.kLendProgramId);
      if (!reserveState) {
        throw new Error('Reserve not found');
      }

      const marketAddress = reserveState.lendingMarket;
      const marketState = await LendingMarket.fetch(env.connection, marketAddress, env.kLendProgramId);
      if (!marketState) {
        throw new Error('Market not found');
      }
      const marketWithAddress: MarketWithAddress = {
        address: marketAddress,
        state: marketState,
      };

      if (mode === 'multisig' && !multisig) {
        throw new Error('If using multisig mode, multisig is required');
      }

      const kaminoManager = new KaminoManager(
        env.connection,
        DEFAULT_RECENT_SLOT_DURATION_MS,
        env.kLendProgramId,
        env.kVaultProgramId
      );

      const reserveConfigFromFile = JSON.parse(fs.readFileSync(reserveConfigPath, 'utf8'));

      const reserveConfig = parseReserveConfigFromFile(reserveConfigFromFile);

      const ixs = await kaminoManager.updateReserveIxs(
        marketWithAddress,
        reserveAddress,
        reserveConfig,
        reserveState,
        updateEntireConfig
      );

      const _updateReserveSig = await processTxn(env.client, env.payer, ixs, mode, 2500, [], 400_000);

      mode === 'execute' && console.log('Reserve Updated with config -> ', JSON.parse(JSON.stringify(reserveConfig)));
    });

  commands
    .command('download-reserve-config')
    .requiredOption('--reserve <string>', 'Reserve address')
    .option(`--staging`, 'If true, will use the staging programs')
    .action(async ({ reserve, staging }) => {
      const env = initializeClient(false, staging);
      const reserveAddress = new PublicKey(reserve);
      const reserveState = await Reserve.fetch(env.connection, reserveAddress, env.kLendProgramId);
      if (!reserveState) {
        throw new Error('Reserve not found');
      }

      fs.mkdirSync('./configs/' + reserveState.lendingMarket.toBase58(), { recursive: true });

      const decoder = new TextDecoder('utf-8');
      const reserveName = decoder.decode(Uint8Array.from(reserveState.config.tokenInfo.name)).replace(/\0/g, '');

      const reserveConfigDisplay = parseReserveConfigToFile(reserveState.config);

      fs.writeFileSync(
        './configs/' + reserveState.lendingMarket.toBase58() + '/' + reserveName + '.json',
        JSON.stringify(reserveConfigDisplay, null, 2)
      );
    });

  commands
    .command('create-vault')
    .requiredOption('--mint <string>', 'Vault token mint')
    .requiredOption(
      `--mode <string>`,
      'simulate - to print txn simulation, inspect - to get txn simulation in explorer, execute - execute txn, multisig - to get bs58 txn for multisig usage'
    )
    .requiredOption('--name <string>', 'The onchain name of the strat')
    .requiredOption('--tokenName <string>', 'The name of the token in the vault')
    .requiredOption('--extraTokenName <string>', 'The extra string appended to the token symbol')
    .option(`--staging`, 'If true, will use the staging programs')
    .option(`--multisig <string>`, 'If using multisig mode this is required, otherwise will be ignored')
    .action(async ({ mint, mode, name, tokenName, extraTokenName, staging, multisig }) => {
      const env = initializeClient(mode === 'multisig', staging);
      const tokenMint = new PublicKey(mint);

      if (mode === 'multisig' && !multisig) {
        throw new Error('If using multisig mode, multisig is required');
      }

      const multisigPk = multisig ? new PublicKey(multisig) : PublicKey.default;
      const kaminoManager = new KaminoManager(
        env.connection,
        DEFAULT_RECENT_SLOT_DURATION_MS,
        env.kLendProgramId,
        env.kVaultProgramId
      );

      const tokenProgramID = await getAccountOwner(env.connection, tokenMint);
      const kaminoVaultConfig = new KaminoVaultConfig({
        admin: mode === 'multisig' ? multisigPk : env.payer.publicKey,
        tokenMint: tokenMint,
        tokenMintProgramId: tokenProgramID,
        performanceFeeRatePercentage: new Decimal(0.0),
        managementFeeRatePercentage: new Decimal(0.0),
        name,
        vaultTokenSymbol: tokenName,
        vaultTokenName: extraTokenName,
      });

      const { vault: vaultKp, initVaultIxs: instructions } = await kaminoManager.createVaultIxs(kaminoVaultConfig);

      const _createVaultSig = await processTxn(
        env.client,
        env.payer,
        [...instructions.initVaultIxs, instructions.createLUTIx, instructions.initSharesMetadataIx],
        mode,
        2500,
        [vaultKp]
      );
      await sleep(2000);
      const _populateLUTSig = await processTxn(env.client, env.payer, instructions.populateLUTIxs, mode, 2500, []);

      const _setSharesMetadataSig = await processTxn(
        env.client,
        env.payer,
        [instructions.initSharesMetadataIx],
        mode,
        2500,
        []
      );
      mode === 'execute' && console.log('Vault created:', vaultKp.publicKey.toBase58());
    });

  commands
    .command('set-shares-metadata')
    .requiredOption('--vault <string>', 'Vault address')
    .requiredOption('--symbol <string>', 'The symbol of the kVault token')
    .requiredOption('--extraName <string>', 'The name of the kVault token, appended to the symbol')
    .action(async ({ vault, symbol, extraName }) => {
      const env = initializeClient(false, false);
      const kVault = new KaminoVault(new PublicKey(vault));

      const kaminoManager = new KaminoManager(
        env.connection,
        DEFAULT_RECENT_SLOT_DURATION_MS,
        env.kLendProgramId,
        env.kVaultProgramId
      );
      const ix = await kaminoManager.getSetSharesMetadataIx(kVault, symbol, extraName);

      await processTxn(env.client, env.payer, [ix], 'execute', 2500, []);
    });

  commands
    .command('update-vault-pending-admin')
    .requiredOption('--vault <string>', 'Vault address')
    .requiredOption('--new-admin <string>', 'Pubkey of the new admin')
    .requiredOption(
      `--mode <string>`,
      'simulate - to print txn simulation, inspect - to get txn simulation in explorer, execute - execute txn, multisig - to get bs58 txn for multisig usage'
    )
    .option(`--staging`, 'If true, will use the staging programs')
    .option(`--multisig <string>`, 'If using multisig mode this is required, otherwise will be ignored')
    .action(async ({ vault, newAdmin, mode, staging, multisig }) => {
      const env = initializeClient(mode === 'multisig', staging);
      const vaultAddress = new PublicKey(vault);

      if (mode === 'multisig' && !multisig) {
        throw new Error('If using multisig mode, multisig is required');
      }

      const kaminoManager = new KaminoManager(
        env.connection,
        DEFAULT_RECENT_SLOT_DURATION_MS,
        env.kLendProgramId,
        env.kVaultProgramId
      );

      const kaminoVault = new KaminoVault(vaultAddress, undefined, env.kVaultProgramId);
      const instructions = await kaminoManager.updateVaultConfigIxs(kaminoVault, new PendingVaultAdmin(), newAdmin);

      const updateVaultPendingAdminSig = await processTxn(
        env.client,
        env.payer,
        [instructions.updateVaultConfigIx, ...instructions.updateLUTIxs],
        mode,
        2500,
        []
      );

      mode === 'execute' && console.log('Pending admin updated:', updateVaultPendingAdminSig);
    });

  commands
    .command('update-vault-config')
    .requiredOption('--vault <string>', 'Vault address')
    .requiredOption('--field <string>', 'The field to update')
    .requiredOption('--value <string>', 'The value to update the field to')
    .requiredOption(
      `--mode <string>`,
      'simulate - to print txn simulation, inspect - to get txn simulation in explorer, execute - execute txn, multisig - to get bs58 txn for multisig usage'
    )
    .option(`--staging`, 'If true, will use the staging programs')
    .option(`--multisig <string>`, 'If using multisig mode this is required, otherwise will be ignored')
    .action(async ({ vault, field, value, mode, staging, multisig }) => {
      const env = initializeClient(mode === 'multisig', staging);
      const vaultAddress = new PublicKey(vault);

      if (mode === 'multisig' && !multisig) {
        throw new Error('If using multisig mode, multisig is required');
      }

      const kaminoManager = new KaminoManager(
        env.connection,
        DEFAULT_RECENT_SLOT_DURATION_MS,
        env.kLendProgramId,
        env.kVaultProgramId
      );

      const kaminoVault = new KaminoVault(vaultAddress, undefined, env.kVaultProgramId);
      const instructions = await kaminoManager.updateVaultConfigIxs(kaminoVault, field, value);

      const updateVaultPendingAdminSig = await processTxn(
        env.client,
        env.payer,
        [instructions.updateVaultConfigIx, ...instructions.updateLUTIxs],
        mode,
        2500,
        []
      );

      mode === 'execute' && console.log('Vault updated:', updateVaultPendingAdminSig);
    });

  commands
    .command('update-vault-mgmt-fee')
    .requiredOption('--vault <string>', 'Vault address')
    .requiredOption('--fee-bps <string>', 'Pubkey of the new admin')
    .requiredOption(
      `--mode <string>`,
      'simulate - to print txn simulation, inspect - to get txn simulation in explorer, execute - execute txn, multisig - to get bs58 txn for multisig usage'
    )
    .option(`--staging`, 'If true, will use the staging programs')
    .option(`--multisig <string>`, 'If using multisig mode this is required, otherwise will be ignored')
    .action(async ({ vault, feeBps, mode, staging, multisig }) => {
      const env = initializeClient(mode === 'multisig', staging);
      const vaultAddress = new PublicKey(vault);

      if (mode === 'multisig' && !multisig) {
        throw new Error('If using multisig mode, multisig is required');
      }

      const kaminoManager = new KaminoManager(
        env.connection,
        DEFAULT_RECENT_SLOT_DURATION_MS,
        env.kLendProgramId,
        env.kVaultProgramId
      );

      const kaminoVault = new KaminoVault(vaultAddress, undefined, env.kVaultProgramId);
      const instructions = await kaminoManager.updateVaultConfigIxs(kaminoVault, new ManagementFeeBps(), feeBps);

      const updateVaultConfigSig = await processTxn(
        env.client,
        env.payer,
        [instructions.updateVaultConfigIx, ...instructions.updateLUTIxs],
        mode,
        2500,
        []
      );

      mode === 'execute' && console.log('Management fee updated:', updateVaultConfigSig);
    });

  commands
    .command('insert-into-lut')
    .requiredOption('--lut <string>', 'Lookup table address')
    .requiredOption('--addresses <string>', 'The addresses to insert into the LUT, space separated')
    .requiredOption(
      `--mode <string>`,
      'simulate - to print txn simulation, inspect - to get txn simulation in explorer, execute - execute txn, multisig - to get bs58 txn for multisig usage'
    )
    .option(`--staging`, 'If true, will use the staging programs')
    .option(`--multisig <string>`, 'If using multisig mode this is required, otherwise will be ignored')
    .action(async ({ lut, addresses, mode, staging, multisig }) => {
      const env = initializeClient(mode === 'multisig', staging);
      const lutAddress = new PublicKey(lut);

      const addressesArr = addresses.split(' ').map((address: string) => new PublicKey(address));

      if (mode === 'multisig' && !multisig) {
        throw new Error('If using multisig mode, multisig is required');
      }

      const kaminoManager = new KaminoManager(
        env.connection,
        DEFAULT_RECENT_SLOT_DURATION_MS,
        env.kLendProgramId,
        env.kVaultProgramId
      );

      const instructions = await kaminoManager.insertIntoLUTIxs(env.payer.publicKey, lutAddress, addressesArr);

      const updateVaultConfigSig = await processTxn(env.client, env.payer, instructions, mode, 2500, []);

      mode === 'execute' && console.log('Management fee updated:', updateVaultConfigSig);
    });

  commands.command('create-lut').action(async () => {
    const env = initializeClient(false, false);
    const initLutIx = initLookupTableIx(env.payer.publicKey, await env.connection.getSlot());

    const updateVaultConfigSig = await processTxn(env.client, env.payer, [initLutIx[0]], 'execute', 2500, []);
    console.log(`LUT created: ${initLutIx[1].toString()} tx id: ${updateVaultConfigSig}`);
  });

  commands
    .command('sync-vault-lut')
    .requiredOption('--vault <string>', 'The vault address to sync')
    .requiredOption(
      `--mode <string>`,
      'simulate - to print txn simulation, inspect - to get txn simulation in explorer, execute - execute txn, multisig - to get bs58 txn for multisig usage'
    )
    .option(`--staging`, 'If true, will use the staging programs')
    .option(`--multisig <string>`, 'If using multisig mode this is required, otherwise will be ignored')
    .action(async ({ vault, mode, staging, multisig }) => {
      const env = initializeClient(mode === 'multisig', staging);
      const vaultAddress = new PublicKey(vault);

      if (mode === 'multisig' && !multisig) {
        throw new Error('If using multisig mode, multisig is required');
      }

      const kaminoManager = new KaminoManager(
        env.connection,
        DEFAULT_RECENT_SLOT_DURATION_MS,
        env.kLendProgramId,
        env.kVaultProgramId
      );

      const kaminoVault = new KaminoVault(vaultAddress, undefined, env.kVaultProgramId);
      const syncLUTIxs = await kaminoManager.syncVaultLUTIxs(kaminoVault);

      // if we need to create the LUT we have to do that in a separate tx and wait a little bit after
      if (syncLUTIxs.setupLUTIfNeededIxs.length > 0) {
        const setupLUTSig = await processTxn(env.client, env.payer, syncLUTIxs.setupLUTIfNeededIxs, mode, 2500, []);
        await sleep(2000);
        mode === 'execute' && console.log('LUT created and set to the vault:', setupLUTSig);
      }
      // if there are accounts to be added to the LUT we have to do that in a separate tx
      for (const ix of syncLUTIxs.syncLUTIxs) {
        const insertIntoLUTSig = await processTxn(env.client, env.payer, [ix], mode, 2500, []);
        mode === 'execute' && console.log('Accounts added to the LUT:', insertIntoLUTSig);
      }
    });

  commands
    .command('update-vault-perf-fee')
    .requiredOption('--vault <string>', 'Vault address')
    .requiredOption('--fee-bps <string>', 'Pubkey of the new admin')
    .requiredOption(
      `--mode <string>`,
      'simulate - to print txn simulation, inspect - to get txn simulation in explorer, execute - execute txn, multisig - to get bs58 txn for multisig usage'
    )
    .option(`--staging`, 'If true, will use the staging programs')
    .option(`--multisig <string>`, 'If using multisig mode this is required, otherwise will be ignored')
    .action(async ({ vault, feeBps, mode, staging, multisig }) => {
      const env = initializeClient(mode === 'multisig', staging);
      const vaultAddress = new PublicKey(vault);

      if (mode === 'multisig' && !multisig) {
        throw new Error('If using multisig mode, multisig is required');
      }

      const kaminoManager = new KaminoManager(
        env.connection,
        DEFAULT_RECENT_SLOT_DURATION_MS,
        env.kLendProgramId,
        env.kVaultProgramId
      );

      const kaminoVault = new KaminoVault(vaultAddress, undefined, env.kVaultProgramId);
      const instructions = await kaminoManager.updateVaultConfigIxs(kaminoVault, new PerformanceFeeBps(), feeBps);

      const updateVaultPerfFeeSig = await processTxn(
        env.client,
        env.payer,
        [instructions.updateVaultConfigIx, ...instructions.updateLUTIxs],
        mode,
        2500,
        []
      );

      mode === 'execute' && console.log('Performance fee updated:', updateVaultPerfFeeSig);
    });

  commands
    .command('accept-vault-ownership')
    .requiredOption('--vault <string>', 'Vault address')
    .requiredOption(
      `--mode <string>`,
      'simulate - to print txn simulation, inspect - to get txn simulation in explorer, execute - execute txn, multisig - to get bs58 txn for multisig usage'
    )
    .option(`--staging`, 'If true, will use the staging programs')
    .option(`--multisig <string>`, 'If using multisig mode this is required, otherwise will be ignored')
    .action(async ({ vault, mode, staging, multisig }) => {
      const env = initializeClient(mode === 'multisig', staging);
      const vaultAddress = new PublicKey(vault);

      if (mode === 'multisig' && !multisig) {
        throw new Error('If using multisig mode, multisig is required');
      }

      const kaminoManager = new KaminoManager(
        env.connection,
        DEFAULT_RECENT_SLOT_DURATION_MS,
        env.kLendProgramId,
        env.kVaultProgramId
      );

      const kaminoVault = new KaminoVault(vaultAddress, undefined, env.kVaultProgramId);
      const instructions = await kaminoManager.acceptVaultOwnershipIxs(kaminoVault);

      const acceptVaultOwnershipSig = await processTxn(
        env.client,
        env.payer,
        [instructions.acceptVaultOwnershipIx, ...instructions.updateLUTIxs],
        mode,
        2500,
        []
      );

      mode === 'execute' && console.log('Vault ownership accepted:', acceptVaultOwnershipSig);
    });

  commands
    .command('give-up-pending-fees')
    .requiredOption('--vault <string>', 'Vault address')
    .requiredOption('--max-amount-to-give-up <string>', 'Max amount to give up')
    .requiredOption(
      `--mode <string>`,
      'simulate - to print txn simulation, inspect - to get txn simulation in explorer, execute - execute txn, multisig - to get bs58 txn for multisig usage'
    )
    .option(`--staging`, 'If true, will use the staging programs')
    .option(`--multisig <string>`, 'If using multisig mode this is required, otherwise will be ignored')
    .action(async ({ vault, maxAmountToGiveUp, mode, staging, multisig }) => {
      const env = initializeClient(mode === 'multisig', staging);
      const vaultAddress = new PublicKey(vault);

      if (mode === 'multisig' && !multisig) {
        throw new Error('If using multisig mode, multisig is required');
      }

      const kaminoManager = new KaminoManager(
        env.connection,
        DEFAULT_RECENT_SLOT_DURATION_MS,
        env.kLendProgramId,
        env.kVaultProgramId
      );

      const kaminoVault = new KaminoVault(vaultAddress, undefined, env.kVaultProgramId);
      const instruction = await kaminoManager.giveUpPendingFeesIx(kaminoVault, new Decimal(maxAmountToGiveUp));

      const giveUpPendingFeesSig = await processTxn(env.client, env.payer, [instruction], mode, 2500, []);

      mode === 'execute' && console.log('Give up pending fees tx:', giveUpPendingFeesSig);
    });

  commands
    .command('withdraw-pending-fees')
    .requiredOption('--vault <string>', 'Vault address')
    .requiredOption(
      `--mode <string>`,
      'simulate - to print txn simulation, inspect - to get txn simulation in explorer, execute - execute txn, multisig - to get bs58 txn for multisig usage'
    )
    .option(`--staging`, 'If true, will use the staging programs')
    .option(`--multisig <string>`, 'If using multisig mode this is required, otherwise will be ignored')
    .action(async ({ vault, mode, staging, multisig }) => {
      const env = initializeClient(mode === 'multisig', staging);
      const vaultAddress = new PublicKey(vault);

      if (mode === 'multisig' && !multisig) {
        throw new Error('If using multisig mode, multisig is required');
      }

      const kaminoManager = new KaminoManager(
        env.connection,
        DEFAULT_RECENT_SLOT_DURATION_MS,
        env.kLendProgramId,
        env.kVaultProgramId
      );

      const kaminoVault = new KaminoVault(vaultAddress, undefined, env.kVaultProgramId);
      const instructions = await kaminoManager.withdrawPendingFeesIxs(
        kaminoVault,
        await env.connection.getSlot('confirmed')
      );

      const withdrawPendingFeesSig = await processTxn(env.client, env.payer, instructions, mode, 2500, []);

      mode === 'execute' && console.log('Pending fees withdrawn:', withdrawPendingFeesSig);
    });

  commands
    .command('stake')
    .requiredOption('--vault <string>', 'Vault address')
    .requiredOption(
      `--mode <string>`,
      'simulate - to print txn simulation, inspect - to get txn simulation in explorer, execute - execute txn, multisig - to get bs58 txn for multisig usage'
    )
    .option(`--staging`, 'If true, will use the staging programs')
    .option(`--multisig <string>`, 'If using multisig mode this is required, otherwise will be ignored')
    .action(async ({ vault, mode, staging, multisig }) => {
      const env = initializeClient(mode === 'multisig', staging);
      const vaultAddress = new PublicKey(vault);

      const kaminoVault = new KaminoVault(vaultAddress, undefined, env.kVaultProgramId);

      const stakeIxs = await new KaminoManager(
        env.connection,
        DEFAULT_RECENT_SLOT_DURATION_MS,
        env.kLendProgramId,
        env.kVaultProgramId
      ).stakeSharesIxs(env.payer.publicKey, kaminoVault);

      if (mode === 'multisig' && !multisig) {
        throw new Error('If using multisig mode, multisig is required');
      }
      const withdrawPendingFeesSig = await processTxn(env.client, env.payer, stakeIxs, mode, 2500, []);

      mode === 'execute' && console.log('Stake into vault farm:', withdrawPendingFeesSig);
    });

  commands
    .command('update-vault-reserve-allocation')
    .requiredOption('--vault <string>', 'Vault address')
    .requiredOption('--reserve <string>', 'Reserve address')
    .requiredOption('--allocation-weight <number>', 'Allocation weight')
    .requiredOption('--allocation-cap <string>', 'Allocation cap decimal value')
    .requiredOption(
      `--mode <string>`,
      'simulate - to print txn simulation, inspect - to get txn simulation in explorer, execute - execute txn, multisig - to get bs58 txn for multisig usage'
    )
    .option(`--staging`, 'If true, will use the staging programs')
    .option(`--multisig <string>`, 'If using multisig mode this is required, otherwise will be ignored')
    .action(async ({ vault, reserve, allocationWeight, allocationCap, mode, staging, multisig }) => {
      const env = initializeClient(mode === 'multisig', staging);
      const reserveAddress = new PublicKey(reserve);
      const vaultAddress = new PublicKey(vault);
      const allocationWeightValue = Number(allocationWeight);
      const allocationCapDecimal = new Decimal(allocationCap);

      if (mode === 'multisig' && !multisig) {
        throw new Error('If using multisig mode, multisig is required');
      }

      const kaminoManager = new KaminoManager(
        env.connection,
        DEFAULT_RECENT_SLOT_DURATION_MS,
        env.kLendProgramId,
        env.kVaultProgramId
      );
      const reserveState = await Reserve.fetch(env.connection, reserveAddress, env.kLendProgramId);
      if (!reserveState) {
        throw new Error('Reserve not found');
      }

      const reserveWithAddress: ReserveWithAddress = {
        address: reserveAddress,
        state: reserveState,
      };
      const firstReserveAllocationConfig = new ReserveAllocationConfig(
        reserveWithAddress,
        allocationWeightValue,
        allocationCapDecimal
      );
      const kaminoVault = new KaminoVault(vaultAddress, undefined, env.kVaultProgramId);
      const instructions = await kaminoManager.updateVaultReserveAllocationIxs(
        kaminoVault,
        firstReserveAllocationConfig
      );

      const updateVaultAllocationSig = await processTxn(
        env.client,
        env.payer,
        [instructions.updateReserveAllocationIx, ...instructions.updateLUTIxs],
        mode,
        2500,
        []
      );

      mode === 'execute' && console.log('Vault allocation updated:', updateVaultAllocationSig);
    });

  commands
    .command('deposit')
    .requiredOption('--vault <string>', 'Vault address')
    .requiredOption('--amount <number>', 'Token amount to deposit, in decimals')
    .requiredOption(
      `--mode <string>`,
      'simulate - to print txn simulation, inspect - to get txn simulation in explorer, execute - execute txn, multisig - to get bs58 txn for multisig usage'
    )
    .option(`--staging`, 'If true, will use the staging programs')
    .option(`--multisig <string>`, 'If using multisig mode this is required, otherwise will be ignored')
    .action(async ({ vault, amount, mode, staging, multisig }) => {
      const env = initializeClient(mode === 'multisig', staging);
      const vaultAddress = new PublicKey(vault);

      if (mode === 'multisig' && !multisig) {
        throw new Error('If using multisig mode, multisig is required');
      }

      const kaminoManager = new KaminoManager(
        env.connection,
        DEFAULT_RECENT_SLOT_DURATION_MS,
        env.kLendProgramId,
        env.kVaultProgramId
      );

      const kaminoVault = new KaminoVault(vaultAddress, undefined, env.kVaultProgramId);
      const depositInstructions = await kaminoManager.depositToVaultIxs(env.payer.publicKey, kaminoVault, amount);
      const instructions = [...depositInstructions.depositIxs, ...depositInstructions.stakeInFarmIfNeededIxs];

      const depositSig = await processTxn(env.client, env.payer, instructions, mode, 2500, [], 800_000);

      mode === 'execute' && console.log('User deposit:', depositSig);
    });

  commands
    .command('withdraw')
    .requiredOption('--vault <string>', 'Vault address')
    .requiredOption('--amount <number>', 'Shares amount to withdraw')
    .requiredOption(
      `--mode <string>`,
      'simulate - to print txn simulation, inspect - to get txn simulation in explorer, execute - execute txn, multisig - to get bs58 txn for multisig usage'
    )
    .option(`--staging`, 'If true, will use the staging programs')
    .option(`--multisig <string>`, 'If using multisig mode this is required, otherwise will be ignored')
    .action(async ({ vault, amount, mode, staging, multisig }) => {
      const env = initializeClient(mode === 'multisig', staging);
      const vaultAddress = new PublicKey(vault);

      if (mode === 'multisig' && !multisig) {
        throw new Error('If using multisig mode, multisig is required');
      }

      const kaminoManager = new KaminoManager(
        env.connection,
        DEFAULT_RECENT_SLOT_DURATION_MS,
        env.kLendProgramId,
        env.kVaultProgramId
      );

      const kaminoVault = new KaminoVault(vaultAddress, undefined, env.kVaultProgramId);
      const withdrawIxs = await kaminoManager.withdrawFromVaultIxs(
        env.payer.publicKey,
        kaminoVault,
        new Decimal(amount),
        await env.connection.getSlot('confirmed')
      );

      const withdrawSig = await processTxn(
        env.client,
        env.payer,
        [...withdrawIxs.unstakeFromFarmIfNeededIxs, ...withdrawIxs.withdrawIxs],
        mode,
        2500,
        [],
        800_000
      );

      mode === 'execute' && console.log('User withdraw:', withdrawSig);
    });

  commands
    .command('invest-all-reserves')
    .requiredOption('--vault <string>', 'Vault address')
    .requiredOption(
      `--mode <string>`,
      'simulate - to print txn simulation, inspect - to get txn simulation in explorer, execute - execute txn, multisig - to get bs58 txn for multisig usage'
    )
    .option(`--staging`, 'If true, will use the staging programs')
    .option(`--multisig <string>`, 'If using multisig mode this is required, otherwise will be ignored')
    .action(async ({ vault, mode, staging, multisig }) => {
      const env = initializeClient(mode === 'multisig', staging);
      const vaultAddress = new PublicKey(vault);

      if (mode === 'multisig' && !multisig) {
        throw new Error('If using multisig mode, multisig is required');
      }

      const kaminoManager = new KaminoManager(
        env.connection,
        DEFAULT_RECENT_SLOT_DURATION_MS,
        env.kLendProgramId,
        env.kVaultProgramId
      );

      const kaminoVault = new KaminoVault(vaultAddress, undefined, env.kVaultProgramId);
      const instructions = await kaminoManager.investAllReservesIxs(env.payer.publicKey, kaminoVault);

      for (let i = 0; i < instructions.length; i++) {
        const txInstructions: TransactionInstruction[] = [];
        txInstructions.push(instructions[i]);
        const investReserveSig = await processTxn(env.client, env.payer, txInstructions, mode, 2500, [], 800000);

        mode === 'execute' && console.log('Reserve invested:', investReserveSig);
      }
    });

  commands
    .command('invest-single-reserve')
    .requiredOption('--vault <string>', 'Vault address')
    .requiredOption('--reserve <string>', 'Reserve address')
    .requiredOption(
      `--mode <string>`,
      'simulate - to print txn simulation, inspect - to get txn simulation in explorer, execute - execute txn, multisig - to get bs58 txn for multisig usage'
    )
    .option(`--staging`, 'If true, will use the staging programs')
    .option(`--multisig <string>`, 'If using multisig mode this is required, otherwise will be ignored')
    .action(async ({ vault, reserve, mode, staging, multisig }) => {
      const env = initializeClient(mode === 'multisig', staging);
      const vaultAddress = new PublicKey(vault);

      if (mode === 'multisig' && !multisig) {
        throw new Error('If using multisig mode, multisig is required');
      }

      const kaminoManager = new KaminoManager(
        env.connection,
        DEFAULT_RECENT_SLOT_DURATION_MS,
        env.kLendProgramId,
        env.kVaultProgramId
      );

      const kaminoVault = new KaminoVault(vaultAddress, undefined, env.kVaultProgramId);
      const reserveState = await Reserve.fetch(env.connection, new PublicKey(reserve), env.kLendProgramId);
      if (!reserveState) {
        throw new Error('Reserve not found');
      }

      const reserveWithAddress: ReserveWithAddress = {
        address: new PublicKey(reserve),
        state: reserveState,
      };

      const instructions = await kaminoManager.investSingleReserveIxs(
        env.payer.publicKey,
        kaminoVault,
        reserveWithAddress
      );
      const investReserveSig = await processTxn(env.client, env.payer, instructions, mode, 2500, [], 800_000);

      mode === 'execute' && console.log('Reserve invested:', investReserveSig);
    });

  // commands
  //   .command('close-vault')
  //   .requiredOption('--vault <string>', 'Vault address')
  //   .option(`--staging`, 'If true, will use the staging programs')
  //   .action(async ({vault, staging}) => {
  //     const env = initializeClient(false, staging);
  //     const vaultAddress = new PublicKey(vault);

  //     const kaminoManager = new KaminoManager(env.connection, env.kLendProgramId, env.kVaultProgramId);

  //     const kaminoVault = new KaminoVault(vaultAddress, undefined, env.kVaultProgramId);
  //     const instructions = await kaminoManager.closeVault(kaminoVault);

  //     const closeVaultSig = await processTxn(env.client, env.payer, [instructions], 'execute', 2500, []);
  //     console.log('Vault closed:', closeVaultSig);
  //   });

  commands
    .command('get-vault-colls')
    .requiredOption('--vault <string>', 'Vault address')
    .action(async ({ vault }) => {
      const env = initializeClient(false, false);
      const slotDuration = await getMedianSlotDurationInMsFromLastEpochs();

      const kaminoManager = new KaminoManager(env.connection, slotDuration, env.kLendProgramId, env.kVaultProgramId);

      const vaultAddress = new PublicKey(vault);
      const vaultState = await new KaminoVault(vaultAddress, undefined, env.kVaultProgramId).getState(env.connection);
      const vaultCollaterals = await kaminoManager.getVaultCollaterals(
        vaultState,
        await env.connection.getSlot('confirmed')
      );
      vaultCollaterals.forEach((collateral) => {
        console.log('reserve ', collateral.address);
        console.log('market overview', collateral.reservesAsCollateral);
        console.log('min LTV', collateral.minLTVPct);
        console.log('max LTV', collateral.maxLTVPct);
      });
    });

  commands
    .command('get-vault-overview')
    .requiredOption('--vault <string>', 'Vault address')
    .action(async ({ vault }) => {
      const env = initializeClient(false, false);
      const slotDuration = await getMedianSlotDurationInMsFromLastEpochs();

      const kaminoManager = new KaminoManager(env.connection, slotDuration, env.kLendProgramId, env.kVaultProgramId);

      const vaultAddress = new PublicKey(vault);
      const vaultState = await new KaminoVault(vaultAddress, undefined, env.kVaultProgramId).getState(env.connection);
      const vaultOverview = await kaminoManager.getVaultOverview(
        vaultState,
        new Decimal(1.0),
        await env.connection.getSlot('confirmed')
      );

      console.log('vaultOverview', vaultOverview);
    });

  commands
    .command('get-vault-allocation-distribution')
    .requiredOption('--vault <string>', 'Vault address')
    .action(async ({ vault }) => {
      const env = initializeClient(false, false);
      const slotDuration = await getMedianSlotDurationInMsFromLastEpochs();

      const kaminoManager = new KaminoManager(env.connection, slotDuration, env.kLendProgramId, env.kVaultProgramId);

      const vaultAddress = new PublicKey(vault);
      const vaultState = await new KaminoVault(vaultAddress, undefined, env.kVaultProgramId).getState(env.connection);
      const allocationDistribution = kaminoManager.getAllocationsDistribuionPct(vaultState);

      allocationDistribution.forEach((allocation, reserveAddress) => {
        console.log('reserve ', reserveAddress);
        console.log('allocation', allocation);
      });
    });

  commands
    .command('get-user-shares-for-vault')
    .requiredOption('--vault <string>', 'Vault address')
    .requiredOption('--wallet <string>', 'User wailt address')
    .action(async ({ vault, wallet }) => {
      const env = initializeClient(false, false);
      const slotDuration = await getMedianSlotDurationInMsFromLastEpochs();

      const kaminoManager = new KaminoManager(env.connection, slotDuration, env.kLendProgramId, env.kVaultProgramId);

      const vaultAddress = new PublicKey(vault);
      const walletAddress = new PublicKey(wallet);
      const kaminoVault = new KaminoVault(vaultAddress, undefined, env.kVaultProgramId);
      const userShares = await kaminoManager.getUserSharesBalanceSingleVault(walletAddress, kaminoVault);
      console.log(`User shares for vault ${vaultAddress.toBase58()}: ${userShares}`);
    });

  commands
    .command('get-user-shares-all-vaults')
    .requiredOption('--wallet <string>', 'User wailt address')
    .action(async ({ wallet }) => {
      const env = initializeClient(false, false);
      const slotDuration = await getMedianSlotDurationInMsFromLastEpochs();

      const kaminoManager = new KaminoManager(env.connection, slotDuration, env.kLendProgramId, env.kVaultProgramId);

      const walletAddress = new PublicKey(wallet);
      const userShares = await kaminoManager.getUserSharesBalanceAllVaults(walletAddress);
      userShares.forEach((userShares, vaultAddress) => {
        console.log(`User shares for vault ${vaultAddress}: ${userShares}`);
      });
    });

  commands
    .command('get-tokens-per-share')
    .requiredOption('--vault <string>', 'Vault address')
    .action(async ({ vault }) => {
      const env = initializeClient(false, false);
      const slotDuration = await getMedianSlotDurationInMsFromLastEpochs();

      const kaminoManager = new KaminoManager(env.connection, slotDuration, env.kLendProgramId, env.kVaultProgramId);

      const vaultAddress = new PublicKey(vault);
      const kaminoVault = new KaminoVault(vaultAddress, undefined, env.kVaultProgramId);
      const tokensPerShare = await kaminoManager.getTokensPerShareSingleVault(
        kaminoVault,
        await env.connection.getSlot('confirmed')
      );
      console.log(`Tokens per share for vault ${vaultAddress.toBase58()}: ${tokensPerShare}`);
    });

  commands
    .command('print-vault')
    .requiredOption('--vault <string>', 'Vault address')
    .action(async ({ vault }) => {
      const env = initializeClient(false, false);
      const slotDuration = await getMedianSlotDurationInMsFromLastEpochs();

      const kaminoManager = new KaminoManager(env.connection, slotDuration, env.kLendProgramId, env.kVaultProgramId);

      const vaultAddress = new PublicKey(vault);
      const kaminoVault = new KaminoVault(vaultAddress, undefined, env.kVaultProgramId);
      await kaminoVault.getState(env.connection);

      const slot = await env.connection.getSlot('confirmed');
      const tokensPerShare = await kaminoManager.getTokensPerShareSingleVault(kaminoVault, slot);
      const holdings = await kaminoManager.getVaultHoldings(kaminoVault.state!, slot);

      const vaultState = kaminoVault.state!;

      const sharesIssued = lamportsToDecimal(
        vaultState.sharesIssued.toString(),
        vaultState.sharesMintDecimals.toString()
      );

      const vaultOverview = await kaminoManager.getVaultOverview(vaultState, new Decimal(1.0), slot);

      console.log('farm', vaultState.vaultFarm.toString());
      console.log('vault token mint', vaultState.tokenMint.toBase58());
      console.log('Name: ', kaminoManager.getDecodedVaultName(kaminoVault.state!));
      console.log('Shares issued: ', sharesIssued);
      printHoldings(holdings);
      console.log(`Tokens per share for vault ${vaultAddress.toBase58()}: ${tokensPerShare}`);
      console.log('vaultOverview', vaultOverview);
    });

  commands.command('get-oracle-mappings').action(async () => {
    const env = initializeClient(false, false);
    const kaminoManager = new KaminoManager(
      env.connection,
      DEFAULT_RECENT_SLOT_DURATION_MS,
      env.kLendProgramId,
      env.kVaultProgramId
    );

    console.log('Getting  oracle mappings');
    const oracleConfigs = await kaminoManager.getScopeOracleConfigs();
    console.log('oracleConfigs', JSON.parse(JSON.stringify(oracleConfigs)));
  });

  commands.command('get-all-vaults').action(async () => {
    const env = initializeClient(false, false);
    const slotDuration = await getMedianSlotDurationInMsFromLastEpochs();

    const kaminoManager = new KaminoManager(env.connection, slotDuration, env.kLendProgramId, env.kVaultProgramId);
    const allVaults = await kaminoManager.getAllVaults();
    console.log('all vaults', allVaults);
  });

  commands.command('get-all-vaults-pks').action(async () => {
    const env = initializeClient(false, false);
    const kaminoManager = new KaminoManager(
      env.connection,
      DEFAULT_RECENT_SLOT_DURATION_MS,
      env.kLendProgramId,
      env.kVaultProgramId
    );

    const allVaults = await kaminoManager.getAllVaults();
    console.log(
      'all vaults',
      allVaults.map((vault) => vault.address.toBase58())
    );
  });

  commands
    .command('get-simulated-interest-and-fees')
    .requiredOption('--vault <string>', 'Vault address')
    .action(async ({ vault }) => {
      const env = initializeClient(false, false);

      const vaultAddress = new PublicKey(vault);
      const slotDuration = await getMedianSlotDurationInMsFromLastEpochs();

      const kaminoManager = new KaminoManager(env.connection, slotDuration, env.kLendProgramId, env.kVaultProgramId);
      const vaultState = await new KaminoVault(vaultAddress, undefined, env.kVaultProgramId).getState(env.connection);

      const simulatedHoldings = await kaminoManager.calculateSimulatedHoldingsWithInterest(vaultState);

      console.log('Simulated holdings with interest', simulatedHoldings);
      const simulatedFees = await kaminoManager.calculateSimulatedFees(vaultState, simulatedHoldings);

      console.log('Simulated fees', simulatedFees);
    });

  commands
    .command('download-lending-market-config')
    .requiredOption('--lending-market <string>', 'Lending Market Address')
    .option(`--staging`, 'If true, will use the staging programs')
    .action(async ({ lendingMarket, staging }) => {
      const env = initializeClient(false, staging);
      const lendingMarketAddress = new PublicKey(lendingMarket);
      const lendingMarketState = await LendingMarket.fetch(env.connection, lendingMarketAddress, env.kLendProgramId);

      if (!lendingMarketState) {
        throw new Error('Lending Market not found');
      }

      fs.mkdirSync('./configs/' + lendingMarketAddress.toBase58(), { recursive: true });

      const lendingMarketConfigForFile = lendingMarketState.toJSON();

      fs.writeFileSync(
        './configs/' + lendingMarketAddress.toBase58() + '/market-' + lendingMarketAddress.toBase58() + '.json',
        JSON.stringify(lendingMarketConfigForFile, null, 2)
      );
    });

  commands
    .command('compute-alloc')
    .requiredOption('--vault <string>', 'Vault address')
    .action(async ({ vault }) => {
      const env = initializeClient(false, false);

      const vaultAddress = new PublicKey(vault);
      const slotDuration = await getMedianSlotDurationInMsFromLastEpochs();

      const kaminoManager = new KaminoManager(env.connection, slotDuration, env.kLendProgramId, env.kVaultProgramId);
      const vaultState = await new KaminoVault(vaultAddress, undefined, env.kVaultProgramId).getState(env.connection);

      const computedAllocation = await kaminoManager.getVaultComputedReservesAllocation(vaultState);
      console.log('computedAllocation', computedAllocation);
    });

  commands
    .command('download-lending-market-config-and-all-reserves-configs')
    .requiredOption('--lending-market <string>', 'Lending Market Address')
    .option(`--staging`, 'If true, will use the staging programs')
    .action(async ({ lendingMarket, staging }) => {
      const env = initializeClient(false, staging);
      const decoder = new TextDecoder('utf-8');
      const lendingMarketAddress = new PublicKey(lendingMarket);

      const kaminoMarket = await KaminoMarket.load(
        env.connection,
        lendingMarketAddress,
        DEFAULT_RECENT_SLOT_DURATION_MS,
        env.kLendProgramId
      );

      if (!kaminoMarket) {
        throw new Error('Lending Market not found');
      }

      const lendingMarketState = await LendingMarket.fetch(env.connection, lendingMarketAddress, env.kLendProgramId);

      if (!lendingMarketState) {
        throw new Error('Lending Market not found');
      }

      fs.mkdirSync('./configs/' + lendingMarketAddress.toBase58(), { recursive: true });

      const lendingMarketConfigForFile = lendingMarketState.toJSON();

      fs.writeFileSync(
        './configs/' + lendingMarketAddress.toBase58() + '/market-' + lendingMarketAddress.toBase58() + '.json',
        JSON.stringify(lendingMarketConfigForFile, null, 2)
      );

      kaminoMarket.reserves.forEach(async (reserve) => {
        const reserveState = reserve.state;
        const reserveName = decoder.decode(Uint8Array.from(reserveState.config.tokenInfo.name)).replace(/\0/g, '');

        const reserveConfigDisplay = parseReserveConfigToFile(reserveState.config);

        fs.writeFileSync(
          './configs/' + lendingMarketAddress.toBase58() + '/' + reserveName + '.json',
          JSON.stringify(reserveConfigDisplay, null, 2)
        );
      });
    });

  commands
    .command('update-lending-market-from-config')
    .requiredOption('--lending-market <string>', 'Lending Market address')
    .requiredOption('--lending-market-config-path <string>', 'Path for the market config')
    .requiredOption(
      `--mode <string>`,
      'simulate - to print txn simulation, inspect - to get txn simulation in explorer, execute - execute txn, multisig - to get bs58 txn for multisig usage'
    )
    .option(`--staging`, 'If true, will use the staging programs')
    .action(async ({ lendingMarket, lendingMarketConfigPath, mode, staging }) => {
      const env = initializeClient(mode === 'multisig', staging);
      const lendingMarketAddress = new PublicKey(lendingMarket);
      const lendingMarketState = await LendingMarket.fetch(env.connection, lendingMarketAddress, env.kLendProgramId);
      if (!lendingMarketState) {
        throw new Error('Lending Market not found');
      }
      const marketWithAddress = {
        address: lendingMarketAddress,
        state: lendingMarketState,
      };

      if (mode === 'multisig') {
        throw new Error('If using multisig mode, multisig is required');
      }

      const kaminoManager = new KaminoManager(
        env.connection,
        DEFAULT_RECENT_SLOT_DURATION_MS,
        env.kLendProgramId,
        env.kVaultProgramId
      );

      const newLendingMarket = LendingMarket.fromJSON(JSON.parse(fs.readFileSync(lendingMarketConfigPath, 'utf8')));

      const ixs = kaminoManager.updateLendingMarketIxs(marketWithAddress, newLendingMarket);

      // executing 6 ixs in a txn to make sure they fit
      for (let ixnIndex = 0; ixnIndex < ixs.length; ixnIndex += 6) {
        const ixnToExecute = ixs.slice(ixnIndex, ixnIndex + 6);
        const _updateLendingMarketSig = await processTxn(env.client, env.payer, ixnToExecute, mode, 2500, [], 400_000);
      }

      mode === 'execute' &&
        console.log('Reserve Updated with new config -> ', JSON.parse(JSON.stringify(newLendingMarket)));
    });

  commands
    .command('update-lending-market-owner')
    .requiredOption('--lending-market <string>', 'Lending Market address')
    .requiredOption(
      `--mode <string>`,
      'simulate - to print txn simulation, inspect - to get txn simulation in explorer, execute - execute txn, multisig - to get bs58 txn for multisig usage'
    )
    .option(`--staging`, 'If true, will use the staging programs')
    .action(async ({ lendingMarket, mode, staging }) => {
      const env = initializeClient(mode === 'multisig', staging);
      const lendingMarketAddress = new PublicKey(lendingMarket);
      const lendingMarketState = await LendingMarket.fetch(env.connection, lendingMarketAddress, env.kLendProgramId);
      if (!lendingMarketState) {
        throw new Error('Lending Market not found');
      }
      const marketWithAddress = {
        address: lendingMarketAddress,
        state: lendingMarketState,
      };

      if (mode === 'multisig') {
        throw new Error('If using multisig mode, multisig is required');
      }

      const kaminoManager = new KaminoManager(
        env.connection,
        DEFAULT_RECENT_SLOT_DURATION_MS,
        env.kLendProgramId,
        env.kVaultProgramId
      );

      const ix = kaminoManager.updateLendingMarketOwnerIxs(marketWithAddress);

      const _updateLendingMarketSig = await processTxn(env.client, env.payer, [ix], mode, 2500, [], 400_000);

      mode === 'execute' &&
        console.log(
          'Lending market admin updated to the new admin -> ',
          JSON.parse(JSON.stringify(lendingMarketState.lendingMarketOwnerCached))
        );
    });

  commands
    .command('update-lending-market-name')
    .requiredOption('--lending-market <string>', 'Lending Market address')
    .requiredOption('--new-name <string>', 'Lending Market address')
    .requiredOption(
      `--mode <string>`,
      'simulate - to print txn simulation, inspect - to get txn simulation in explorer, execute - execute txn, multisig - to get bs58 txn for multisig usage'
    )
    .option(`--staging`, 'If true, will use the staging programs')
    .action(async ({ lendingMarket, newName, mode, staging }) => {
      const env = initializeClient(mode === 'multisig', staging);
      const lendingMarketAddress = new PublicKey(lendingMarket);
      const lendingMarketState = await LendingMarket.fetch(env.connection, lendingMarketAddress, env.kLendProgramId);
      if (!lendingMarketState) {
        throw new Error('Lending Market not found');
      }
      const marketWithAddress = {
        address: lendingMarketAddress,
        state: lendingMarketState,
      };

      if (mode === 'multisig') {
        throw new Error('If using multisig mode, multisig is required');
      }

      const kaminoManager = new KaminoManager(
        env.connection,
        DEFAULT_RECENT_SLOT_DURATION_MS,
        env.kLendProgramId,
        env.kVaultProgramId
      );

      const currentName = parseZeroPaddedUtf8(lendingMarketState.name);
      const newNameEncoded = encodeTokenName(newName);

      console.log('Current name: ', currentName, ' encoded: ', lendingMarketState.name);
      console.log('New name: ', newName, ' encoded: ', newNameEncoded);

      // @ts-ignore
      const newLendingMarket: LendingMarket = {
        ...lendingMarketState,
        name: newNameEncoded,
      };

      const ixs = kaminoManager.updateLendingMarketIxs(marketWithAddress, newLendingMarket);

      const _updateLendingMarketSig = await processTxn(env.client, env.payer, ixs, mode, 2500, [], 400_000);

      mode === 'execute' &&
        console.log(
          'Lending market name updated to -> ',
          JSON.parse(JSON.stringify(lendingMarketState.lendingMarketOwnerCached))
        );
    });

  commands
    .command('update-reserve-config-debt-cap')
    .requiredOption('--reserve <string>', 'Lending Market address')
    .requiredOption(
      `--mode <string>`,
      'simulate - to print txn simulation, inspect - to get txn simulation in explorer, execute - execute txn, multisig - to get bs58 txn for multisig usage'
    )
    .option(`--staging`, 'If true, will use the staging programs')
    .action(async ({ reserve, mode, staging }) => {
      const env = initializeClient(mode === 'multisig', staging);
      const reserveAddress = new PublicKey(reserve);
      const reserveState = await Reserve.fetch(env.connection, reserveAddress, env.kLendProgramId);
      if (!reserveState) {
        throw new Error('Reserve not found');
      }

      const lendingMarketAddress = reserveState.lendingMarket;
      const lendingMarketState = await LendingMarket.fetch(env.connection, lendingMarketAddress, env.kLendProgramId);
      if (!lendingMarketState) {
        throw new Error('Lending Market not found');
      }

      const marketWithAddress = {
        address: lendingMarketAddress,
        state: lendingMarketState,
      };

      if (mode === 'multisig') {
        throw new Error('If using multisig mode, multisig is required');
      }

      const kaminoManager = new KaminoManager(
        env.connection,
        DEFAULT_RECENT_SLOT_DURATION_MS,
        env.kLendProgramId,
        env.kVaultProgramId
      );

      const newReserveConfigFields: ReserveConfigFields = {
        ...reserveState.config,
        borrowLimit: new BN(1000),
      };
      const newReserveConfig: ReserveConfig = new ReserveConfig(newReserveConfigFields);

      const ixs = await kaminoManager.updateReserveIxs(marketWithAddress, reserveAddress, newReserveConfig);

      const _updateLendingMarketSig = await processTxn(env.client, env.payer, ixs, mode, 2500, [], 400_000);

      mode === 'execute' &&
        console.log(
          'Lending market name updated to -> ',
          JSON.parse(JSON.stringify(lendingMarketState.lendingMarketOwnerCached))
        );
    });

  await commands.parseAsync();
}

main()
  .then(() => {
    process.exit();
  })
  .catch((e) => {
    console.error('\n\nKamino CLI exited with error:\n\n', e);
    process.exit(1);
  });

export function parseKeypairFile(file: string): Keypair {
  return Keypair.fromSecretKey(Buffer.from(JSON.parse(require('fs').readFileSync(file))));
}

function initializeClient(multisig: boolean, staging: boolean): Env {
  const admin = process.env.ADMIN!;
  const rpc = process.env.RPC!;
  const kLendProgramId = staging ? process.env.KLEND_PROGRAM_ID_STAGING! : process.env.KLEND_PROGRAM_ID_MAINNET!;
  const kVaultProgramId = staging ? process.env.KVAULT_PROGRAM_ID_STAGING! : process.env.KVAULT_PROGRAM_ID_MAINNET!;

  // Get connection first
  const env: Env = setUpProgram({
    adminFilePath: admin,
    rpc: rpc,
    kLendProgramId: new PublicKey(kLendProgramId),
    kVaultProgramId: new PublicKey(kVaultProgramId),
  });

  !multisig && console.log('\nSettings ⚙️');
  !multisig && console.log('Admin:', admin);
  !multisig && console.log('Rpc:', rpc);
  !multisig && console.log('kLendProgramId:', kLendProgramId);
  !multisig && console.log('kVaultProgramId:', kVaultProgramId);

  return env;
}

function setUpProgram(args: {
  adminFilePath: string;
  rpc: string;
  kLendProgramId: PublicKey;
  kVaultProgramId: PublicKey;
}): Env {
  const chain: Chain = {
    name: 'mainnet-beta',
    endpoint: args.rpc,
    wsEndpoint: args.rpc,
    chainID: MAINNET_BETA_CHAIN_ID,
    displayName: 'Mainnet Beta (Triton)',
  };
  const client = new Web3Client(chain);
  const connection = client.sendConnection;
  const payer = parseKeypairFile(args.adminFilePath);
  const wallet = new anchor.Wallet(payer);
  const provider = new anchor.AnchorProvider(connection, wallet, anchor.AnchorProvider.defaultOptions());

  return {
    provider,
    payer,
    client,
    connection,
    kLendProgramId: args.kLendProgramId,
    kVaultProgramId: args.kVaultProgramId,
  };
}

export type Env = {
  provider: anchor.AnchorProvider;
  payer: Keypair;
  connection: Connection;
  client: Web3Client;
  kLendProgramId: PublicKey;
  kVaultProgramId: PublicKey;
};

async function processTxn(
  web3Client: Web3Client,
  admin: Keypair,
  ixs: TransactionInstruction[],
  mode: string,
  priorityFeeMultiplier: number = 2500,
  extraSigners: Signer[],
  computeUnits: number = 200_000,
  priorityFeeLamports: number = 1000
): Promise<TransactionSignature> {
  if (mode !== 'inspect' && mode !== 'simulate' && mode !== 'execute' && mode !== 'multisig') {
    throw new Error('Invalid mode: ' + mode + '. Must be one of: inspect/simulate/execute/multisig');
  }
  if (mode === 'multisig') {
    const { blockhash } = await web3Client.connection.getLatestBlockhash();
    const txn = new Transaction();
    txn.add(...ixs);
    txn.recentBlockhash = blockhash;
    txn.feePayer = admin.publicKey;

    console.log(binary_to_base58(txn.serializeMessage()));

    return '';
  } else {
    const microLamport = priorityFeeLamports * 10 ** 6; // 1000 lamports
    const microLamportsPrioritizationFee = microLamport / computeUnits;

    const tx = new Transaction();
    const { blockhash } = await web3Client.connection.getLatestBlockhash();
    if (priorityFeeMultiplier) {
      const priorityFeeIxn = createAddExtraComputeUnitFeeTransaction(
        computeUnits,
        microLamportsPrioritizationFee * priorityFeeMultiplier
      );
      tx.add(...priorityFeeIxn);
    }
    tx.recentBlockhash = blockhash;
    tx.feePayer = admin.publicKey;
    tx.add(...ixs);

    if (mode === 'execute') {
      return await signSendAndConfirmRawTransactionWithRetry({
        mainConnection: web3Client.sendConnection,
        extraConnections: [],
        tx: new VersionedTransaction(tx.compileMessage()),
        signers: [admin, ...extraSigners],
        commitment: 'confirmed',
        sendTransactionOptions: {
          skipPreflight: true,
          preflightCommitment: 'confirmed',
        },
      });
    } else if (mode === 'simulate') {
      const simulation = await web3Client.sendConnection.simulateTransaction(
        new VersionedTransaction(tx.compileMessage())
      );
      if (simulation.value.logs && simulation.value.logs.length > 0) {
        console.log('Simulation: \n' + simulation.value.logs);
      } else {
        console.log('Simulation failed: \n' + simulation.value.err);
      }
    } else if (mode === 'inspect') {
      console.log(
        'Tx in B64',
        `https://explorer.solana.com/tx/inspector?message=${encodeURIComponent(
          tx.serializeMessage().toString('base64')
        )}`
      );
    }
    return '';
  }
}

function createAddExtraComputeUnitFeeTransaction(units: number, microLamports: number): TransactionInstruction[] {
  const ixs: TransactionInstruction[] = [];
  ixs.push(ComputeBudgetProgram.setComputeUnitLimit({ units }));
  ixs.push(ComputeBudgetProgram.setComputeUnitPrice({ microLamports: new Decimal(microLamports).floor().toNumber() }));
  return ixs;
}

function parseReserveConfigFromFile(reserveConfigFromFile: any): ReserveConfig {
  const reserveConfigFields: ReserveConfigFields = {
    status: reserveConfigFromFile.status,
    loanToValuePct: reserveConfigFromFile.loanToValuePct,
    liquidationThresholdPct: reserveConfigFromFile.liquidationThresholdPct,
    minLiquidationBonusBps: reserveConfigFromFile.minLiquidationBonusBps,
    protocolLiquidationFeePct: reserveConfigFromFile.protocolLiquidationFeePct,
    protocolOrderExecutionFeePct: reserveConfigFromFile.protocolOrderExecutionFeePct,
    protocolTakeRatePct: reserveConfigFromFile.protocolTakeRatePct,
    assetTier: reserveConfigFromFile.assetTier,
    maxLiquidationBonusBps: reserveConfigFromFile.maxLiquidationBonusBps,
    badDebtLiquidationBonusBps: reserveConfigFromFile.badDebtLiquidationBonusBps,
    fees: {
      borrowFeeSf: Fraction.fromDecimal(new Decimal(reserveConfigFromFile.fees.borrowFee)).valueSf,
      flashLoanFeeSf: Fraction.fromDecimal(new Decimal(reserveConfigFromFile.fees.flashLoanFee)).valueSf,
      padding: Array(8).fill(0),
    },
    depositLimit: new BN(reserveConfigFromFile.depositLimit),
    borrowLimit: new BN(reserveConfigFromFile.borrowLimit),
    tokenInfo: {
      name: encodeTokenName(reserveConfigFromFile.tokenInfo.name),
      heuristic: new PriceHeuristic({
        lower: new BN(reserveConfigFromFile.tokenInfo.heuristic.lower),
        upper: new BN(reserveConfigFromFile.tokenInfo.heuristic.upper),
        exp: new BN(reserveConfigFromFile.tokenInfo.heuristic.exp),
      }),
      maxTwapDivergenceBps: new BN(reserveConfigFromFile.tokenInfo.maxTwapDivergenceBps),
      maxAgePriceSeconds: new BN(reserveConfigFromFile.tokenInfo.maxAgePriceSeconds),
      maxAgeTwapSeconds: new BN(reserveConfigFromFile.tokenInfo.maxAgeTwapSeconds),
      ...parseOracleConfiguration(reserveConfigFromFile),
      blockPriceUsage: reserveConfigFromFile.tokenInfo.blockPriceUsage,
      reserved: Array(7).fill(0),
      padding: Array(19).fill(new BN(0)),
    } as TokenInfo,
    borrowRateCurve: parseBorrowRateCurve(reserveConfigFromFile),
    depositWithdrawalCap: new WithdrawalCaps({
      configCapacity: new BN(reserveConfigFromFile.depositWithdrawalCap.configCapacity),
      currentTotal: new BN(0),
      lastIntervalStartTimestamp: new BN(0),
      configIntervalLengthSeconds: new BN(reserveConfigFromFile.depositWithdrawalCap.configIntervalLengthSeconds),
    }),
    debtWithdrawalCap: new WithdrawalCaps({
      configCapacity: new BN(reserveConfigFromFile.debtWithdrawalCap.configCapacity),
      currentTotal: new BN(0),
      lastIntervalStartTimestamp: new BN(0),
      configIntervalLengthSeconds: new BN(reserveConfigFromFile.debtWithdrawalCap.configIntervalLengthSeconds),
    }),
    deleveragingMarginCallPeriodSecs: new BN(reserveConfigFromFile.deleveragingMarginCallPeriodSecs),
    borrowFactorPct: new BN(reserveConfigFromFile.borrowFactorPct),
    elevationGroups: reserveConfigFromFile.elevationGroups,
    deleveragingThresholdDecreaseBpsPerDay: new BN(reserveConfigFromFile.deleveragingThresholdDecreaseBpsPerDay),
    disableUsageAsCollOutsideEmode: reserveConfigFromFile.disableUsageAsCollOutsideEmode,
    utilizationLimitBlockBorrowingAbovePct: reserveConfigFromFile.utilizationLimitBlockBorrowingAbovePct,
    hostFixedInterestRateBps: reserveConfigFromFile.hostFixedInterestRateBps,
    autodeleverageEnabled: reserveConfigFromFile.autodeleverageEnabled,
    borrowLimitOutsideElevationGroup: new BN(reserveConfigFromFile.borrowLimitOutsideElevationGroup),
    borrowLimitAgainstThisCollateralInElevationGroup: parseReserveBorrowLimitAgainstCollInEmode(reserveConfigFromFile),
    deleveragingBonusIncreaseBpsPerDay: new BN(reserveConfigFromFile.deleveragingBonusIncreaseBpsPerDay),
    reserved1: Array(1).fill(0),
    reserved2: Array(9).fill(0),
  };

  return new ReserveConfig(reserveConfigFields);
}

function parseOracleConfiguration(reserveConfigFromFile: any): {
  pythConfiguration: PythConfiguration;
  switchboardConfiguration: SwitchboardConfiguration;
  scopeConfiguration: ScopeConfiguration;
} {
  const pythConfiguration = new PythConfiguration({
    price: new PublicKey(reserveConfigFromFile.tokenInfo.pythConfiguration.price),
  });
  const switchboardConfiguration = new SwitchboardConfiguration({
    priceAggregator: new PublicKey(reserveConfigFromFile.tokenInfo.switchboardConfiguration.priceAggregator),
    twapAggregator: new PublicKey(reserveConfigFromFile.tokenInfo.switchboardConfiguration.twapAggregator),
  });
  const priceChain = [65535, 65535, 65535, 65535];
  const twapChain = [65535, 65535, 65535, 65535];

  const priceChainFromFile: number[] = reserveConfigFromFile.tokenInfo.scopeConfiguration.priceChain;
  const twapChainFromFile: number[] = reserveConfigFromFile.tokenInfo.scopeConfiguration.twapChain;

  priceChainFromFile.forEach((value, index) => (priceChain[index] = value));
  twapChainFromFile.forEach((value, index) => (twapChain[index] = value));

  const scopeConfiguration = new ScopeConfiguration({
    priceFeed: new PublicKey(reserveConfigFromFile.tokenInfo.scopeConfiguration.priceFeed),
    priceChain: priceChain,
    twapChain: twapChain,
  });

  return {
    pythConfiguration,
    switchboardConfiguration,
    scopeConfiguration,
  };
}

function parseBorrowRateCurve(reserveConfigFromFile: any): BorrowRateCurve {
  const curvePoints: CurvePointFields[] = [];

  reserveConfigFromFile.borrowRateCurve.points.forEach((curvePoint: { utilizationRateBps: any; borrowRateBps: any }) =>
    curvePoints.push({
      utilizationRateBps: curvePoint.utilizationRateBps,
      borrowRateBps: curvePoint.borrowRateBps,
    })
  );

  const finalCurvePoints: CurvePointFields[] = Array(11).fill(curvePoints[curvePoints.length - 1]);

  curvePoints.forEach((curvePoint, index) => (finalCurvePoints[index] = curvePoint));

  const borrowRateCurve = new BorrowRateCurve({ points: finalCurvePoints });

  return borrowRateCurve;
}

function parseReserveBorrowLimitAgainstCollInEmode(reserveConfigFromFile: any): BN[] {
  const reserveBorrowLimitAgainstCollInEmode: BN[] = Array(32).fill(new BN(0));

  reserveConfigFromFile.borrowLimitAgainstThisCollateralInElevationGroup.forEach(
    (limit: any, index: number) => (reserveBorrowLimitAgainstCollInEmode[index] = new BN(limit))
  );

  return reserveBorrowLimitAgainstCollInEmode;
}

function parseReserveConfigToFile(reserveConfig: ReserveConfig) {
  const decoder = new TextDecoder('utf-8');

  return {
    status: reserveConfig.status,
    loanToValuePct: reserveConfig.loanToValuePct,
    liquidationThresholdPct: reserveConfig.liquidationThresholdPct,
    minLiquidationBonusBps: reserveConfig.minLiquidationBonusBps,
    protocolLiquidationFeePct: reserveConfig.protocolLiquidationFeePct,
    protocolOrderExecutionFeePct: reserveConfig.protocolOrderExecutionFeePct,
    protocolTakeRatePct: reserveConfig.protocolTakeRatePct,
    assetTier: reserveConfig.assetTier,
    maxLiquidationBonusBps: reserveConfig.maxLiquidationBonusBps,
    badDebtLiquidationBonusBps: reserveConfig.badDebtLiquidationBonusBps,
    fees: {
      borrowFee: new Fraction(reserveConfig.fees.borrowFeeSf).toDecimal().toString(),
      flashLoanFee: new Fraction(reserveConfig.fees.flashLoanFeeSf).toDecimal().toString(),
      padding: Array(8).fill(0),
    },
    depositLimit: reserveConfig.depositLimit.toString(),
    borrowLimit: reserveConfig.borrowLimit.toString(),
    tokenInfo: {
      name: decoder.decode(Uint8Array.from(reserveConfig.tokenInfo.name)).replace(/\0/g, ''),
      heuristic: {
        exp: reserveConfig.tokenInfo.heuristic.exp.toString(),
        lower: reserveConfig.tokenInfo.heuristic.lower.toString(),
        upper: reserveConfig.tokenInfo.heuristic.upper.toString(),
      },
      maxTwapDivergenceBps: reserveConfig.tokenInfo.maxTwapDivergenceBps.toString(),
      maxAgePriceSeconds: reserveConfig.tokenInfo.maxAgePriceSeconds.toString(),
      maxAgeTwapSeconds: reserveConfig.tokenInfo.maxAgeTwapSeconds.toString(),
      scopeConfiguration: reserveConfig.tokenInfo.scopeConfiguration,
      switchboardConfiguration: reserveConfig.tokenInfo.switchboardConfiguration,
      pythConfiguration: reserveConfig.tokenInfo.pythConfiguration,
      blockPriceUsage: reserveConfig.tokenInfo.blockPriceUsage,
    },
    borrowRateCurve: reserveConfig.borrowRateCurve,
    depositWithdrawalCap: reserveConfig.depositWithdrawalCap,
    debtWithdrawalCap: reserveConfig.debtWithdrawalCap,
    deleveragingMarginCallPeriodSecs: reserveConfig.deleveragingMarginCallPeriodSecs.toString(),
    borrowFactorPct: reserveConfig.borrowFactorPct.toString(),
    elevationGroups: reserveConfig.elevationGroups,
    deleveragingThresholdDecreaseBpsPerDay: reserveConfig.deleveragingThresholdDecreaseBpsPerDay.toString(),
    disableUsageAsCollOutsideEmode: reserveConfig.disableUsageAsCollOutsideEmode,
    utilizationLimitBlockBorrowingAbovePct: reserveConfig.utilizationLimitBlockBorrowingAbovePct,
    hostFixedInterestRateBps: reserveConfig.hostFixedInterestRateBps,
    autodeleverageEnabled: reserveConfig.autodeleverageEnabled,
    borrowLimitOutsideElevationGroup: reserveConfig.borrowLimitOutsideElevationGroup.toString(),
    borrowLimitAgainstThisCollateralInElevationGroup:
      reserveConfig.borrowLimitAgainstThisCollateralInElevationGroup.map((entry) => entry.toString()),
    deleveragingBonusIncreaseBpsPerDay: reserveConfig.deleveragingBonusIncreaseBpsPerDay.toString(),
    reserved1: Array(2).fill(0),
    reserved2: Array(9).fill(0),
  };
}
