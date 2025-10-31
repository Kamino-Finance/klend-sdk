import dotenv from 'dotenv';
import { Command } from 'commander';
import { Address, address, Instruction } from '@solana/kit';
import {
  AssetReserveConfigCli,
  calculateAPYFromAPR,
  createLookupTableIx,
  DEFAULT_PUBLIC_KEY,
  DEFAULT_RECENT_SLOT_DURATION_MS,
  encodeTokenName,
  extendLookupTableIxs,
  getMedianSlotDurationInMsFromLastEpochs,
  globalConfigPda,
  initLookupTableIx,
  KaminoManager,
  KaminoMarket,
  KaminoReserve,
  KaminoVault,
  KaminoVaultConfig,
  lamportsToDecimal,
  LendingMarket,
  parseZeroPaddedUtf8,
  Reserve,
  ReserveAllocationConfig,
  ReserveWithAddress,
  sleep,
} from '../lib';
import {
  BorrowRateCurve,
  CurvePointFields,
  PriceHeuristic,
  ReserveConfig,
  ReserveConfigFields,
  ScopeConfiguration,
  TokenInfo,
  WithdrawalCaps,
} from '../@codegen/klend/types';
import { Fraction } from '../classes/fraction';
import Decimal from 'decimal.js';
import BN from 'bn.js';
import { PythConfiguration, SwitchboardConfiguration } from '../@codegen/kvault/types';
import * as fs from 'fs';
import { MarketWithAddress } from '../utils/managerTypes';
import { ManagementFeeBps, PendingVaultAdmin, PerformanceFeeBps } from '../@codegen/kvault/types/VaultConfigField';
import { getAccountOwner } from '../utils/rpc';
import { fetchMint, findAssociatedTokenPda } from '@solana-program/token-2022';
import { initEnv, ManagerEnv } from './tx/ManagerEnv';
import { processTx } from './tx/processor';
import { getPriorityFeeAndCuIxs } from '../client/tx/priorityFee';
import { fetchAddressLookupTable, fetchAllAddressLookupTable } from '@solana-program/address-lookup-table';
import { noopSigner, parseKeypairFile } from '../utils/signer';

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
      'simulate|multisig|execute - simulate - to print txn simulation and to get tx simulation link in explorer, execute - execute tx, multisig - to get bs58 tx for multisig usage'
    )
    .option(`--staging`, 'If true, will use the staging programs')
    .option(`--multisig <string>`, 'If using multisig mode this is required, otherwise will be ignored')
    .action(async ({ mode, staging, multisig }) => {
      if (mode === 'multisig' && !multisig) {
        throw new Error('If using multisig mode, multisig pubkey is required');
      }
      const ms = multisig ? address(multisig) : undefined;
      const env = await initEnv(ms, staging);
      const admin = await env.getSigner();

      const kaminoManager = new KaminoManager(
        env.c.rpc,
        DEFAULT_RECENT_SLOT_DURATION_MS,
        env.klendProgramId,
        env.kvaultProgramId
      );

      const { market: marketKp, ixs: createMarketIxs } = await kaminoManager.createMarketIxs({
        admin,
      });

      await processTx(
        env.c,
        admin,
        [
          ...createMarketIxs,
          ...getPriorityFeeAndCuIxs({
            priorityFeeMultiplier: 2500,
          }),
        ],
        mode,
        []
      );

      mode === 'execute' && console.log('Market created:', marketKp.address);
    });

  commands
    .command('add-asset-to-market')
    .requiredOption('--market <string>', 'Market address to add asset to')
    .requiredOption('--mint <string>', 'Reserve liquidity token mint')
    .requiredOption('--reserve-config-path <string>', 'Path for the reserve config')
    .requiredOption(
      `--mode <string>`,
      'simulate|multisig|execute - simulate - to print txn simulation and to get tx simulation link in explorer, execute - execute tx, multisig - to get bs58 tx for multisig usage'
    )
    .option(`--staging`, 'If true, will use the staging programs')
    .action(async ({ market, mint, reserveConfigPath, mode, staging }) => {
      const env = await initEnv(undefined, staging);
      const tokenMint = address(mint);
      const marketAddress = address(market);
      const existingMarket = await KaminoMarket.load(
        env.c.rpc,
        marketAddress,
        DEFAULT_RECENT_SLOT_DURATION_MS,
        env.klendProgramId,
        false
      );
      if (existingMarket === null) {
        throw new Error(`Market ${marketAddress} does not exist`);
      }
      const signer = await env.getSigner({ market: existingMarket });
      const mintAccount = await fetchMint(env.c.rpc, mint);
      const tokenMintProgramId = mintAccount.programAddress;
      const kaminoManager = new KaminoManager(
        env.c.rpc,
        DEFAULT_RECENT_SLOT_DURATION_MS,
        env.klendProgramId,
        env.kvaultProgramId
      );

      const reserveConfigFromFile = JSON.parse(fs.readFileSync(reserveConfigPath, 'utf8'));

      const reserveConfig = parseReserveConfigFromFile(reserveConfigFromFile);
      const assetConfig = new AssetReserveConfigCli(tokenMint, tokenMintProgramId, reserveConfig);

      const [adminAta] = await findAssociatedTokenPda({
        mint: tokenMint,
        owner: signer.address,
        tokenProgram: tokenMintProgramId,
      });

      const { reserve, txnIxs } = await kaminoManager.addAssetToMarketIxs({
        admin: signer,
        adminLiquiditySource: adminAta,
        marketAddress: marketAddress,
        assetConfig: assetConfig,
      });

      console.log('reserve: ', reserve.address);

      const _createReserveSig = await processTx(
        env.c,
        signer,
        [
          ...txnIxs[0],
          ...getPriorityFeeAndCuIxs({
            priorityFeeMultiplier: 2500,
          }),
        ],
        mode,
        []
      );

      const [lut, createLutIxs] = await createUpdateReserveConfigLutIxs(env, marketAddress, reserve.address);

      await processTx(
        env.c,
        signer,
        [
          ...createLutIxs,
          ...getPriorityFeeAndCuIxs({
            priorityFeeMultiplier: 2500,
          }),
        ],
        mode
      );

      const lutAcc = await fetchAddressLookupTable(env.c.rpc, lut);
      const _updateReserveSig = await processTx(
        env.c,
        signer,
        [
          ...txnIxs[1],
          ...getPriorityFeeAndCuIxs({
            priorityFeeMultiplier: 2500,
            computeUnits: 400_000,
          }),
        ],
        mode,
        [lutAcc]
      );

      mode === 'execute' &&
        console.log(
          'Reserve Created with config:',
          JSON.parse(JSON.stringify(reserveConfig)),
          '\nreserve address:',
          reserve.address
        );
    });

  commands
    .command('update-reserve-config')
    .requiredOption('--reserve <string>', 'Reserve address')
    .requiredOption('--reserve-config-path <string>', 'Path for the reserve config')
    .requiredOption(
      `--mode <string>`,
      'simulate|multisig|execute - simulate - to print txn simulation and to get tx simulation link in explorer, execute - execute tx, multisig - to get bs58 tx for multisig usage'
    )
    .option('--update-entire-config', 'If set, it will update entire reserve config in 1 instruction')
    .option(`--staging`, 'If true, will use the staging programs')
    .action(async ({ reserve, reserveConfigPath, mode, updateEntireConfig, staging }) => {
      const env = await initEnv(undefined, staging);
      const reserveAddress = address(reserve);
      const reserveState = await Reserve.fetch(env.c.rpc, reserveAddress, env.klendProgramId);
      if (reserveState === null) {
        throw new Error(`Reserve ${reserveAddress} not found`);
      }

      const marketAddress = reserveState.lendingMarket;
      const marketState = await KaminoMarket.load(
        env.c.rpc,
        marketAddress,
        DEFAULT_RECENT_SLOT_DURATION_MS,
        env.klendProgramId,
        false
      );
      if (marketState === null) {
        throw new Error(`Market ${marketAddress} not found`);
      }
      const signer = await env.getSigner({ market: marketState });
      const marketWithAddress: MarketWithAddress = {
        address: marketAddress,
        state: marketState.state,
      };

      const kaminoManager = new KaminoManager(
        env.c.rpc,
        DEFAULT_RECENT_SLOT_DURATION_MS,
        env.klendProgramId,
        env.kvaultProgramId
      );

      const reserveConfigFromFile = JSON.parse(fs.readFileSync(reserveConfigPath, 'utf8'));

      const reserveConfig = parseReserveConfigFromFile(reserveConfigFromFile);

      const ixs = await kaminoManager.updateReserveIxs(
        signer,
        marketWithAddress,
        reserveAddress,
        reserveConfig,
        reserveState,
        updateEntireConfig
      );

      await processTx(
        env.c,
        signer,
        [
          ...ixs,
          ...getPriorityFeeAndCuIxs({
            priorityFeeMultiplier: 2500,
            computeUnits: 400_000,
          }),
        ],
        mode,
        []
      );
      mode === 'execute' && console.log('Reserve Updated with config -> ', JSON.parse(JSON.stringify(reserveConfig)));
    });

  commands
    .command('download-reserve-config')
    .requiredOption('--reserve <string>', 'Reserve address')
    .option(`--staging`, 'If true, will use the staging programs')
    .action(async ({ reserve, staging }) => {
      const env = await initEnv(undefined, staging);
      const reserveAddress = address(reserve);
      const reserveState = await Reserve.fetch(env.c.rpc, reserveAddress, env.klendProgramId);
      if (!reserveState) {
        throw new Error('Reserve not found');
      }

      fs.mkdirSync('./configs/' + reserveState.lendingMarket, { recursive: true });

      const decoder = new TextDecoder('utf-8');
      const reserveName = decoder.decode(Uint8Array.from(reserveState.config.tokenInfo.name)).replace(/\0/g, '');

      const reserveConfigDisplay = parseReserveConfigToFile(reserveState.config);

      fs.writeFileSync(
        './configs/' + reserveState.lendingMarket + '/' + reserveName + '.json',
        JSON.stringify(reserveConfigDisplay, null, 2)
      );
    });

  commands
    .command('create-vault')
    .requiredOption('--mint <string>', 'Vault token mint')
    .requiredOption(
      `--mode <string>`,
      'simulate|multisig|execute - simulate - to print txn simulation and to get tx simulation link in explorer, execute - execute tx, multisig - to get bs58 tx for multisig usage'
    )
    .requiredOption('--name <string>', 'The onchain name of the strat')
    .requiredOption('--tokenName <string>', 'The name of the token in the vault')
    .requiredOption('--extraTokenName <string>', 'The extra string appended to the token symbol')
    .option(`--staging`, 'If true, will use the staging programs')
    .option(`--multisig <string>`, 'If using multisig mode this is required, otherwise will be ignored')
    .action(async ({ mint, mode, name, tokenName, extraTokenName, staging, multisig }) => {
      if (mode === 'multisig' && !multisig) {
        throw new Error('If using multisig mode, multisig is required');
      }
      const ms = multisig ? address(multisig) : undefined;
      const env = await initEnv(staging, ms);
      const tokenMint = address(mint);

      const kaminoManager = new KaminoManager(
        env.c.rpc,
        DEFAULT_RECENT_SLOT_DURATION_MS,
        env.klendProgramId,
        env.kvaultProgramId
      );

      const admin = await env.getSigner();
      const tokenProgramID = await getAccountOwner(env.c.rpc, tokenMint);
      const kaminoVaultConfig = new KaminoVaultConfig({
        admin,
        tokenMint: tokenMint,
        tokenMintProgramId: tokenProgramID,
        performanceFeeRatePercentage: new Decimal(0.0),
        managementFeeRatePercentage: new Decimal(0.0),
        name,
        vaultTokenSymbol: tokenName,
        vaultTokenName: extraTokenName,
      });

      const { vault: vaultKp, initVaultIxs: instructions } = await kaminoManager.createVaultIxs(kaminoVaultConfig);

      await processTx(
        env.c,
        admin,
        [
          ...instructions.createAtaIfNeededIxs,
          ...instructions.initVaultIxs,
          instructions.createLUTIx,
          instructions.setFarmToVaultIx,
          ...getPriorityFeeAndCuIxs({
            priorityFeeMultiplier: 2500,
          }),
        ],
        mode,
        []
      );
      await sleep(2000);
      // create the farm
      await processTx(
        env.c,
        admin,
        [
          ...instructions.createVaultFarm.setupFarmIxs,
          ...instructions.createVaultFarm.updateFarmIxs,
          ...getPriorityFeeAndCuIxs({
            priorityFeeMultiplier: 2500,
          }),
        ],
        mode,
        []
      );
      await sleep(2000);
      await processTx(
        env.c,
        admin,
        [
          ...instructions.populateLUTIxs,
          ...instructions.cleanupIxs,
          ...getPriorityFeeAndCuIxs({
            priorityFeeMultiplier: 2500,
          }),
        ],
        mode,
        []
      );

      await processTx(
        env.c,
        admin,
        [
          instructions.initSharesMetadataIx,
          ...getPriorityFeeAndCuIxs({
            priorityFeeMultiplier: 2500,
          }),
        ],
        mode,
        []
      );
      mode === 'execute' && console.log('Vault created:', vaultKp.address);
    });

  commands
    .command('set-shares-metadata')
    .requiredOption('--vault <string>', 'Vault address')
    .requiredOption(
      `--mode <string>`,
      'simulate|multisig|execute - simulate - to print txn simulation and to get tx simulation link in explorer, execute - execute tx, multisig - to get bs58 tx for multisig usage'
    )
    .requiredOption('--symbol <string>', 'The symbol of the kVault token')
    .requiredOption('--extraName <string>', 'The name of the kVault token, appended to the symbol')
    .option(`--staging`, 'If true, will use the staging programs')
    .action(async ({ vault, mode, symbol, extraName, staging }) => {
      const env = await initEnv(undefined, staging);
      const kVault = new KaminoVault(env.c.rpc, address(vault));

      const kaminoManager = new KaminoManager(
        env.c.rpc,
        DEFAULT_RECENT_SLOT_DURATION_MS,
        env.klendProgramId,
        env.kvaultProgramId
      );
      const vaultState = await kVault.getState();
      const signer = await env.getSigner({ vaultState });
      const ix = await kaminoManager.getSetSharesMetadataIx(signer, kVault, symbol, extraName);

      await processTx(
        env.c,
        signer,
        [
          ix,
          ...getPriorityFeeAndCuIxs({
            priorityFeeMultiplier: 2500,
          }),
        ],
        mode,
        []
      );
    });

  commands
    .command('update-vault-pending-admin')
    .requiredOption('--vault <string>', 'Vault address')
    .requiredOption('--new-admin <string>', 'Pubkey of the new admin')
    .requiredOption(
      `--mode <string>`,
      'simulate|multisig|execute - simulate - to print txn simulation and to get tx simulation link in explorer, execute - execute tx, multisig - to get bs58 tx for multisig usage'
    )
    .option(`--staging`, 'If true, will use the staging programs')
    .action(async ({ vault, newAdmin, mode, staging }) => {
      const env = await initEnv(staging);
      const vaultAddress = address(vault);

      const kaminoManager = new KaminoManager(
        env.c.rpc,
        DEFAULT_RECENT_SLOT_DURATION_MS,
        env.klendProgramId,
        env.kvaultProgramId
      );

      const kaminoVault = new KaminoVault(env.c.rpc, vaultAddress, undefined, env.kvaultProgramId);
      const vaultState = await kaminoVault.getState();
      const signer = await env.getSigner({ vaultState });

      const instructions = await kaminoManager.updateVaultConfigIxs(
        kaminoVault,
        new PendingVaultAdmin(),
        newAdmin,
        signer,
        undefined,
        true
      );

      await processTx(
        env.c,
        signer,
        [
          instructions.updateVaultConfigIx,
          ...instructions.updateLUTIxs,
          ...getPriorityFeeAndCuIxs({
            priorityFeeMultiplier: 2500,
          }),
        ],
        mode,
        []
      );

      mode === 'execute' && console.log(`Pending admin updated to ${newAdmin}`);
    });

  commands
    .command('update-vault-config')
    .requiredOption('--vault <string>', 'Vault address')
    .requiredOption('--field <string>', 'The field to update')
    .requiredOption('--value <string>', 'The value to update the field to')
    .requiredOption(
      `--mode <string>`,
      'simulate|multisig|execute - simulate - to print txn simulation and to get tx simulation link in explorer, execute - execute tx, multisig - to get bs58 tx for multisig usage'
    )
    .option(`--staging`, 'If true, will use the staging programs')
    .option(`--skip-lut-update`, 'If set, it will skip the LUT update')
    .option(
      `--lutSigner <string>`,
      'If set, it will use the provided signer instead of the default one for the LUT update'
    )
    .action(async ({ vault, field, value, mode, staging, skipLutUpdate, lutSigner }) => {
      const env = await initEnv(staging);
      const vaultAddress = address(vault);

      const kaminoManager = new KaminoManager(
        env.c.rpc,
        DEFAULT_RECENT_SLOT_DURATION_MS,
        env.klendProgramId,
        env.kvaultProgramId
      );

      const kaminoVault = new KaminoVault(env.c.rpc, vaultAddress, undefined, env.kvaultProgramId);
      const vaultState = await kaminoVault.getState();
      const signer = await env.getSigner({ vaultState });

      let lutSignerOrUndefined = undefined;
      if (lutSigner) {
        lutSignerOrUndefined = await parseKeypairFile(lutSigner as string);
      }

      const shouldSkipLutUpdate = !!skipLutUpdate;
      const instructions = await kaminoManager.updateVaultConfigIxs(
        kaminoVault,
        field,
        value,
        signer,
        lutSignerOrUndefined,
        shouldSkipLutUpdate
      );

      await processTx(
        env.c,
        signer,
        [
          instructions.updateVaultConfigIx,
          ...instructions.updateLUTIxs,
          ...getPriorityFeeAndCuIxs({
            priorityFeeMultiplier: 2500,
          }),
        ],
        mode,
        []
      );

      mode === 'execute' && console.log('Vault updated');
    });

  commands
    .command('update-vault-mgmt-fee')
    .requiredOption('--vault <string>', 'Vault address')
    .requiredOption('--fee-bps <string>', 'Pubkey of the new admin')
    .requiredOption(
      `--mode <string>`,
      'simulate|multisig|execute - simulate - to print txn simulation and to get tx simulation link in explorer, execute - execute tx, multisig - to get bs58 tx for multisig usage'
    )
    .option(`--staging`, 'If true, will use the staging programs')
    .action(async ({ vault, feeBps, mode, staging }) => {
      const env = await initEnv(staging);
      const vaultAddress = address(vault);

      const kaminoManager = new KaminoManager(
        env.c.rpc,
        DEFAULT_RECENT_SLOT_DURATION_MS,
        env.klendProgramId,
        env.kvaultProgramId
      );

      const kaminoVault = new KaminoVault(env.c.rpc, vaultAddress, undefined, env.kvaultProgramId);
      const vaultState = await kaminoVault.getState();
      const signer = await env.getSigner({ vaultState });
      const instructions = await kaminoManager.updateVaultConfigIxs(
        kaminoVault,
        new ManagementFeeBps(),
        feeBps,
        signer
      );

      await processTx(
        env.c,
        signer,
        [
          instructions.updateVaultConfigIx,
          ...instructions.updateLUTIxs,
          ...getPriorityFeeAndCuIxs({
            priorityFeeMultiplier: 2500,
          }),
        ],
        mode,
        []
      );

      mode === 'execute' && console.log('Management fee updated');
    });

  commands
    .command('insert-into-lut')
    .requiredOption('--lut <string>', 'Lookup table address')
    .requiredOption('--addresses <string>', 'The addresses to insert into the LUT, space separated')
    .requiredOption(
      `--mode <string>`,
      'simulate|multisig|execute - simulate - to print txn simulation and to get tx simulation link in explorer, execute - execute tx, multisig - to get bs58 tx for multisig usage'
    )
    .option(`--staging`, 'If true, will use the staging programs')
    .option(`--multisig <string>`, 'If using multisig mode this is required, otherwise will be ignored')
    .option(`--signer <string>`, 'If set, it will use the provided signer instead of the default one')
    .action(async ({ lut, addresses, mode, staging, multisig, signer }) => {
      const env = await initEnv(multisig, staging);
      const lutAddress = address(lut);
      let txSigner = await env.getSigner();
      // if the signer is provided (path to a keypair) we use it, otherwise we use the default one
      if (signer) {
        txSigner = await parseKeypairFile(signer as string);
      }
      const addressesArr = addresses.split(' ').map((a: string) => address(a));

      if (mode === 'multisig' && !multisig) {
        throw new Error('If using multisig mode, multisig is required');
      }

      const kaminoManager = new KaminoManager(
        env.c.rpc,
        DEFAULT_RECENT_SLOT_DURATION_MS,
        env.klendProgramId,
        env.kvaultProgramId
      );

      const instructions = await kaminoManager.insertIntoLutIxs(txSigner, lutAddress, addressesArr);

      await processTx(
        env.c,
        txSigner,
        [
          ...instructions,
          ...getPriorityFeeAndCuIxs({
            priorityFeeMultiplier: 2500,
          }),
        ],
        mode,
        []
      );

      mode === 'execute' && console.log('Management fee updated');
    });

  commands.command('create-lut').action(async () => {
    const env = await initEnv(false);
    const signer = await env.getSigner();
    const [initLutIx, lutAddress] = await initLookupTableIx(signer, await env.c.rpc.getSlot().send());

    await processTx(
      env.c,
      signer,
      [
        initLutIx,
        ...getPriorityFeeAndCuIxs({
          priorityFeeMultiplier: 2500,
        }),
      ],
      'execute',
      []
    );
    console.log(`LUT created: ${lutAddress}`);
  });

  commands
    .command('sync-vault-lut')
    .requiredOption('--vault <string>', 'The vault address to sync')
    .requiredOption(
      `--mode <string>`,
      'simulate|multisig|execute - simulate - to print txn simulation and to get tx simulation link in explorer, execute - execute tx, multisig - to get bs58 tx for multisig usage'
    )
    .option(`--staging`, 'If true, will use the staging programs')
    .option(`--signer <string>`, 'If set, it will use the provided signer instead of the default one')
    .action(async ({ vault, mode, staging, signer }) => {
      const env = await initEnv(staging);
      const vaultAddress = address(vault);

      const kaminoManager = new KaminoManager(
        env.c.rpc,
        DEFAULT_RECENT_SLOT_DURATION_MS,
        env.klendProgramId,
        env.kvaultProgramId
      );

      const kaminoVault = new KaminoVault(env.c.rpc, vaultAddress, undefined, env.kvaultProgramId);
      const vaultState = await kaminoVault.getState();
      let txSigner = await env.getSigner({ vaultState });
      // if the signer is provided (path to a keypair) we use it, otherwise we use the default one
      if (signer) {
        txSigner = await parseKeypairFile(signer as string);
      }
      const syncLUTIxs = await kaminoManager.syncVaultLUTIxs(txSigner, kaminoVault);

      // if we need to create the LUT we have to do that in a separate tx and wait a little bit after
      if (syncLUTIxs.setupLUTIfNeededIxs.length > 0) {
        await processTx(
          env.c,
          txSigner,
          [
            ...syncLUTIxs.setupLUTIfNeededIxs,
            ...getPriorityFeeAndCuIxs({
              priorityFeeMultiplier: 2500,
            }),
          ],
          mode,
          []
        );
        await sleep(2000);
        mode === 'execute' && console.log('LUT created and set to the vault');
      }
      // if there are accounts to be added to the LUT we have to do that in a separate tx
      for (const ix of syncLUTIxs.syncLUTIxs) {
        await processTx(
          env.c,
          txSigner,
          [
            ix,
            ...getPriorityFeeAndCuIxs({
              priorityFeeMultiplier: 2500,
            }),
          ],
          mode,
          []
        );
        mode === 'execute' && console.log('Accounts added to the LUT');
      }
    });

  commands
    .command('update-vault-perf-fee')
    .requiredOption('--vault <string>', 'Vault address')
    .requiredOption('--fee-bps <string>', 'Pubkey of the new admin')
    .requiredOption(
      `--mode <string>`,
      'simulate|multisig|execute - simulate - to print txn simulation and to get tx simulation link in explorer, execute - execute tx, multisig - to get bs58 tx for multisig usage'
    )
    .option(`--staging`, 'If true, will use the staging programs')
    .action(async ({ vault, feeBps, mode, staging }) => {
      const env = await initEnv(staging);
      const vaultAddress = address(vault);

      const kaminoManager = new KaminoManager(
        env.c.rpc,
        DEFAULT_RECENT_SLOT_DURATION_MS,
        env.klendProgramId,
        env.kvaultProgramId
      );

      const kaminoVault = new KaminoVault(env.c.rpc, vaultAddress, undefined, env.kvaultProgramId);
      const vaultState = await kaminoVault.getState();
      const signer = await env.getSigner({ vaultState });
      const instructions = await kaminoManager.updateVaultConfigIxs(
        kaminoVault,
        new PerformanceFeeBps(),
        feeBps,
        signer
      );

      await processTx(
        env.c,
        signer,
        [
          instructions.updateVaultConfigIx,
          ...instructions.updateLUTIxs,
          ...getPriorityFeeAndCuIxs({
            priorityFeeMultiplier: 2500,
          }),
        ],
        mode,
        []
      );

      mode === 'execute' && console.log('Performance fee updated');
    });

  commands
    .command('accept-vault-ownership')
    .requiredOption('--vault <string>', 'Vault address')
    .requiredOption(
      `--mode <string>`,
      'simulate|multisig|execute - simulate - to print txn simulation and to get tx simulation link in explorer, execute - execute tx, multisig - to get bs58 tx for multisig usage'
    )
    .option(`--staging`, 'If true, will use the staging programs')
    .action(async ({ vault, mode, staging }) => {
      const env = await initEnv(staging);
      const vaultAddress = address(vault);

      const kaminoManager = new KaminoManager(
        env.c.rpc,
        DEFAULT_RECENT_SLOT_DURATION_MS,
        env.klendProgramId,
        env.kvaultProgramId
      );

      const kaminoVault = new KaminoVault(env.c.rpc, vaultAddress, undefined, env.kvaultProgramId);
      const vaultState = await kaminoVault.getState();
      const pendingAdmin = await env.getSigner({
        vaultState,
        useVaultPendingAdmin: true,
      });
      const instructions = await kaminoManager.acceptVaultOwnershipIxs(kaminoVault, pendingAdmin);

      await processTx(
        env.c,
        pendingAdmin,
        [
          instructions.acceptVaultOwnershipIx,
          ...getPriorityFeeAndCuIxs({
            priorityFeeMultiplier: 2500,
          }),
        ],
        mode,
        []
      );

      mode === 'execute' && console.log(`Vault ownership accepted by ${pendingAdmin.address}`);

      await processTx(
        env.c,
        pendingAdmin,
        [
          instructions.initNewLUTIx,
          ...getPriorityFeeAndCuIxs({
            priorityFeeMultiplier: 2500,
          }),
        ],
        mode,
        []
      );

      mode === 'execute' && console.log('Initialized new LUT and updated vault config');

      // send the LUT mgmt ixs one by one
      const lutIxs = [...instructions.updateLUTIxs];
      for (let i = 0; i < lutIxs.length; i++) {
        const lutIxsGroup = lutIxs.slice(i, i + 1);
        await processTx(
          env.c,
          pendingAdmin,
          [
            ...lutIxsGroup,
            ...getPriorityFeeAndCuIxs({
              priorityFeeMultiplier: 2500,
            }),
          ],
          mode,
          []
        );
        mode === 'execute' && console.log('LUT updated');
      }
    });

  commands
    .command('give-up-pending-fees')
    .requiredOption('--vault <string>', 'Vault address')
    .requiredOption('--max-amount-to-give-up <string>', 'Max amount to give up')
    .requiredOption(
      `--mode <string>`,
      'simulate|multisig|execute - simulate - to print txn simulation and to get tx simulation link in explorer, execute - execute tx, multisig - to get bs58 tx for multisig usage'
    )
    .option(`--staging`, 'If true, will use the staging programs')
    .action(async ({ vault, maxAmountToGiveUp, mode, staging, multisig }) => {
      const env = await initEnv(multisig, staging);
      const vaultAddress = address(vault);

      const kaminoManager = new KaminoManager(
        env.c.rpc,
        DEFAULT_RECENT_SLOT_DURATION_MS,
        env.klendProgramId,
        env.kvaultProgramId
      );

      const kaminoVault = new KaminoVault(env.c.rpc, vaultAddress, undefined, env.kvaultProgramId);
      const vaultState = await kaminoVault.getState();
      const signer = await env.getSigner({ vaultState });
      const instruction = await kaminoManager.giveUpPendingFeesIx(kaminoVault, new Decimal(maxAmountToGiveUp), signer);

      await processTx(
        env.c,
        signer,
        [
          instruction,
          ...getPriorityFeeAndCuIxs({
            priorityFeeMultiplier: 2500,
          }),
        ],
        mode,
        []
      );

      mode === 'execute' && console.log('Gave up pending fees');
    });

  commands
    .command('withdraw-pending-fees')
    .requiredOption('--vault <string>', 'Vault address')
    .requiredOption(
      `--mode <string>`,
      'simulate|multisig|execute - simulate - to print txn simulation and to get tx simulation link in explorer, execute - execute tx, multisig - to get bs58 tx for multisig usage'
    )
    .option(`--staging`, 'If true, will use the staging programs')
    .action(async ({ vault, mode, staging }) => {
      const env = await initEnv(staging);
      const vaultAddress = address(vault);

      const kaminoManager = new KaminoManager(
        env.c.rpc,
        DEFAULT_RECENT_SLOT_DURATION_MS,
        env.klendProgramId,
        env.kvaultProgramId
      );

      const kaminoVault = new KaminoVault(env.c.rpc, vaultAddress, undefined, env.kvaultProgramId);
      const vaultState = await kaminoVault.getState();
      const signer = await env.getSigner({ vaultState });

      const instructions = await kaminoManager.withdrawPendingFeesIxs(
        kaminoVault,
        await env.c.rpc.getSlot({ commitment: 'confirmed' }).send(),
        signer
      );

      await processTx(
        env.c,
        signer,
        [
          ...instructions,
          ...getPriorityFeeAndCuIxs({
            priorityFeeMultiplier: 2500,
          }),
        ],
        mode,
        []
      );

      mode === 'execute' && console.log('Pending fees withdrawn');
    });

  commands
    .command('remove-vault-allocation')
    .requiredOption('--vault <string>', 'Vault address')
    .requiredOption('--reserve <string>', 'Reserve address')
    .requiredOption(
      `--mode <string>`,
      'simulate|multisig|execute - simulate - to print txn simulation and to get tx simulation link in explorer, execute - execute tx, multisig - to get bs58 tx for multisig usage'
    )
    .option(`--staging`, 'If true, will use the staging programs')
    .action(async ({ vault, reserve, mode, staging }) => {
      const env = await initEnv(staging);
      const reserveAddress = address(reserve);
      const vaultAddress = address(vault);

      const kaminoManager = new KaminoManager(
        env.c.rpc,
        DEFAULT_RECENT_SLOT_DURATION_MS,
        env.klendProgramId,
        env.kvaultProgramId
      );

      const kaminoVault = new KaminoVault(env.c.rpc, vaultAddress, undefined, env.kvaultProgramId);
      const vaultState = await kaminoVault.getState();
      const signer = await env.getSigner({ vaultState });

      const ixs = await kaminoManager.fullRemoveReserveFromVaultIxs(signer, kaminoVault, reserveAddress);

      const transactionIxs = [
        ...ixs,
        ...getPriorityFeeAndCuIxs({
          priorityFeeMultiplier: 2500,
          computeUnits: 1_000_000,
        }),
      ];

      const lookupTableAddresses = [];
      if (vaultState.vaultLookupTable !== DEFAULT_PUBLIC_KEY) {
        lookupTableAddresses.push(vaultState.vaultLookupTable);
      }
      const lookupTables = await fetchAllAddressLookupTable(env.c.rpc, lookupTableAddresses);

      await processTx(env.c, signer, transactionIxs, mode, lookupTables);
      mode === 'execute' && console.log('Vault allocation removed');
    });

  commands
    .command('stake')
    .requiredOption('--vault <string>', 'Vault address')
    .requiredOption(
      `--mode <string>`,
      'simulate|multisig|execute - simulate - to print txn simulation and to get tx simulation link in explorer, execute - execute tx, multisig - to get bs58 tx for multisig usage'
    )
    .option(`--staging`, 'If true, will use the staging programs')
    .option(`--multisig <string>`, 'If using multisig mode this is required, otherwise will be ignored')
    .action(async ({ vault, mode, staging, multisig }) => {
      if (mode === 'multisig' && !multisig) {
        throw new Error('If using multisig mode, multisig is required');
      }
      const ms = multisig ? address(multisig) : undefined;
      const env = await initEnv(staging, ms);
      const user = await env.getSigner();
      const vaultAddress = address(vault);

      const kaminoVault = new KaminoVault(env.c.rpc, vaultAddress, undefined, env.kvaultProgramId);

      const stakeIxs = await new KaminoManager(
        env.c.rpc,
        DEFAULT_RECENT_SLOT_DURATION_MS,
        env.klendProgramId,
        env.kvaultProgramId
      ).stakeSharesIxs(user, kaminoVault);
      await processTx(
        env.c,
        user,
        [
          ...stakeIxs,
          ...getPriorityFeeAndCuIxs({
            priorityFeeMultiplier: 2500,
          }),
        ],
        mode,
        []
      );

      mode === 'execute' && console.log('Staked into vault farm');
    });

  commands
    .command('update-vault-reserve-allocation')
    .requiredOption('--vault <string>', 'Vault address')
    .requiredOption('--reserve <string>', 'Reserve address')
    .requiredOption(
      `--mode <string>`,
      'simulate|multisig|execute - simulate - to print txn simulation and to get tx simulation link in explorer, execute - execute tx, multisig - to get bs58 tx for multisig usage'
    )
    .option('--allocation-weight <number>', 'Allocation weight')
    .option('--allocation-cap <string>', 'Allocation cap decimal value')
    .option(`--staging`, 'If true, will use the staging programs')
    .option(`--multisig <string>`, 'If using multisig mode this is required, otherwise will be ignored')
    .option(`--skip-lut-update`, 'If set, it will skip the LUT update')
    .action(async ({ vault, reserve, mode, allocationWeight, allocationCap, staging, multisig, skipLutUpdate }) => {
      if (mode === 'multisig' && !multisig) {
        throw new Error('If using multisig mode, multisig is required');
      }
      const ms = multisig ? address(multisig) : undefined;
      const env = await initEnv(staging, ms);
      const reserveAddress = address(reserve);
      const vaultAddress = address(vault);
      const kaminoVault = new KaminoVault(env.c.rpc, vaultAddress, undefined, env.kvaultProgramId);
      const vaultState = await kaminoVault.getState();
      const signer = await env.getSigner({ vaultState });
      const shouldUpdateLut = skipLutUpdate ? false : true;
      let allocationWeightValue: number;
      let allocationCapDecimal: Decimal;

      const kaminoManager = new KaminoManager(
        env.c.rpc,
        DEFAULT_RECENT_SLOT_DURATION_MS,
        env.klendProgramId,
        env.kvaultProgramId
      );
      const reserveState = await Reserve.fetch(env.c.rpc, reserveAddress, env.klendProgramId);
      if (!reserveState) {
        throw new Error('Reserve not found');
      }

      const existentAllocation = kaminoManager.getVaultAllocations(vaultState).get(reserveAddress);

      if (allocationWeight) {
        allocationWeightValue = Number(allocationWeight);
      } else if (existentAllocation) {
        allocationWeightValue = existentAllocation.targetWeight.toNumber();
      } else {
        throw new Error('Allocation weight is required');
      }

      if (allocationCap) {
        allocationCapDecimal = new Decimal(allocationCap);
      } else if (existentAllocation) {
        allocationCapDecimal = existentAllocation.tokenAllocationCap.div(
          new Decimal(10).pow(Number(vaultState.tokenMintDecimals.toString()))
        );
      } else {
        throw new Error('Allocation cap is required');
      }

      console.log('allocationWeightValue', allocationWeightValue);
      console.log('allocationCapDecimal', allocationCapDecimal.toString());

      const reserveWithAddress: ReserveWithAddress = {
        address: reserveAddress,
        state: reserveState,
      };
      const firstReserveAllocationConfig = new ReserveAllocationConfig(
        reserveWithAddress,
        allocationWeightValue,
        allocationCapDecimal
      );

      const instructions = await kaminoManager.updateVaultReserveAllocationIxs(
        kaminoVault,
        firstReserveAllocationConfig,
        signer
      );
      const txInstructions = [
        instructions.updateReserveAllocationIx,
        ...instructions.updateLUTIxs,
        ...getPriorityFeeAndCuIxs({
          priorityFeeMultiplier: 2500,
        }),
      ];
      if (shouldUpdateLut) {
        txInstructions.push(...instructions.updateLUTIxs);
      }
      await processTx(env.c, signer, txInstructions, mode, []);

      mode === 'execute' && console.log('Vault allocation updated');
    });

  commands
    .command('deposit')
    .requiredOption('--vault <string>', 'Vault address')
    .requiredOption('--amount <number>', 'Token amount to deposit, in decimals')
    .requiredOption(
      `--mode <string>`,
      'simulate|multisig|execute - simulate - to print txn simulation and to get tx simulation link in explorer, execute - execute tx, multisig - to get bs58 tx for multisig usage'
    )
    .option(`--staging`, 'If true, will use the staging programs')
    .option(`--multisig <string>`, 'If using multisig mode this is required, otherwise will be ignored')
    .action(async ({ vault, amount, mode, staging, multisig }) => {
      if (mode === 'multisig' && !multisig) {
        throw new Error('If using multisig mode, multisig is required');
      }
      const env = await initEnv(staging, multisig);
      const vaultAddress = address(vault);

      const kaminoManager = new KaminoManager(
        env.c.rpc,
        DEFAULT_RECENT_SLOT_DURATION_MS,
        env.klendProgramId,
        env.kvaultProgramId
      );

      const kaminoVault = new KaminoVault(env.c.rpc, vaultAddress, undefined, env.kvaultProgramId);
      const payer = await env.getSigner();
      const depositInstructions = await kaminoManager.depositToVaultIxs(payer, kaminoVault, amount);
      const instructions = [...depositInstructions.depositIxs, ...depositInstructions.stakeInFarmIfNeededIxs];

      await processTx(
        env.c,
        payer,
        [
          ...instructions,
          ...getPriorityFeeAndCuIxs({
            priorityFeeMultiplier: 2500,
            computeUnits: 800_000,
          }),
        ],
        mode,
        []
      );

      mode === 'execute' && console.log('User deposited');
    });

  commands
    .command('withdraw')
    .requiredOption('--vault <string>', 'Vault address')
    .requiredOption('--amount <number>', 'Shares amount to withdraw')
    .requiredOption(
      `--mode <string>`,
      'simulate|multisig|execute - simulate - to print txn simulation and to get tx simulation link in explorer, execute - execute tx, multisig - to get bs58 tx for multisig usage'
    )
    .option(`--staging`, 'If true, will use the staging programs')
    .option(`--multisig <string>`, 'If using multisig mode this is required, otherwise will be ignored')
    .action(async ({ vault, amount, mode, staging, multisig }) => {
      if (mode === 'multisig' && !multisig) {
        throw new Error('If using multisig mode, multisig is required');
      }
      const env = await initEnv(multisig, staging);
      const signer = await env.getSigner();
      const vaultAddress = address(vault);

      const kaminoManager = new KaminoManager(
        env.c.rpc,
        DEFAULT_RECENT_SLOT_DURATION_MS,
        env.klendProgramId,
        env.kvaultProgramId
      );

      const kaminoVault = new KaminoVault(env.c.rpc, vaultAddress, undefined, env.kvaultProgramId);
      const vaultState = await kaminoVault.getState();
      const lookupTableAddresses = [];
      if (vaultState.vaultLookupTable !== DEFAULT_PUBLIC_KEY) {
        lookupTableAddresses.push(vaultState.vaultLookupTable);
      }
      const lookupTables = await fetchAllAddressLookupTable(env.c.rpc, lookupTableAddresses);
      const withdrawIxs = await kaminoManager.withdrawFromVaultIxs(
        signer,
        kaminoVault,
        new Decimal(amount),
        await env.c.rpc.getSlot({ commitment: 'confirmed' }).send()
      );

      await processTx(
        env.c,
        signer,
        [
          ...withdrawIxs.unstakeFromFarmIfNeededIxs,
          ...withdrawIxs.withdrawIxs,
          ...withdrawIxs.postWithdrawIxs,
          ...getPriorityFeeAndCuIxs({
            priorityFeeMultiplier: 2500,
            computeUnits: 800_000,
          }),
        ],
        mode,
        lookupTables
      );

      mode === 'execute' && console.log('User withdrew');
    });

  commands
    .command('invest-all-reserves')
    .requiredOption('--vault <string>', 'Vault address')
    .requiredOption(
      `--mode <string>`,
      'simulate|multisig|execute - simulate - to print txn simulation and to get tx simulation link in explorer, execute - execute tx, multisig - to get bs58 tx for multisig usage'
    )
    .option(`--staging`, 'If true, will use the staging programs')
    .option(`--multisig <string>`, 'If using multisig mode this is required, otherwise will be ignored')
    .action(async ({ vault, mode, staging, multisig }) => {
      if (mode === 'multisig' && !multisig) {
        throw new Error('If using multisig mode, multisig is required');
      }
      const ms = multisig ? address(multisig) : undefined;
      const env = await initEnv(staging, ms);
      const payer = await env.getSigner();
      const vaultAddress = address(vault);

      const kaminoManager = new KaminoManager(
        env.c.rpc,
        DEFAULT_RECENT_SLOT_DURATION_MS,
        env.klendProgramId,
        env.kvaultProgramId
      );

      const kaminoVault = new KaminoVault(env.c.rpc, vaultAddress, undefined, env.kvaultProgramId);
      const instructions = await kaminoManager.investAllReservesIxs(payer, kaminoVault);

      for (let i = 0; i < instructions.length; i++) {
        const txInstructions: Instruction[] = [];
        txInstructions.push();
        await processTx(
          env.c,
          payer,
          [
            instructions[i],
            ...getPriorityFeeAndCuIxs({
              priorityFeeMultiplier: 2500,
              computeUnits: 800_000,
            }),
          ],
          mode,
          []
        );
        mode === 'execute' && console.log('Reserves invested');
      }
    });

  commands
    .command('invest-single-reserve')
    .requiredOption('--vault <string>', 'Vault address')
    .requiredOption('--reserve <string>', 'Reserve address')
    .requiredOption(
      `--mode <string>`,
      'simulate|multisig|execute - simulate - to print txn simulation and to get tx simulation link in explorer, execute - execute tx, multisig - to get bs58 tx for multisig usage'
    )
    .option(`--staging`, 'If true, will use the staging programs')
    .option(`--multisig <string>`, 'If using multisig mode this is required, otherwise will be ignored')
    .action(async ({ vault, reserve, mode, staging, multisig }) => {
      if (mode === 'multisig' && !multisig) {
        throw new Error('If using multisig mode, multisig is required');
      }
      const ms = multisig ? address(multisig) : undefined;
      const env = await initEnv(staging, ms);
      const vaultAddress = address(vault);

      const kaminoManager = new KaminoManager(
        env.c.rpc,
        DEFAULT_RECENT_SLOT_DURATION_MS,
        env.klendProgramId,
        env.kvaultProgramId
      );

      const kaminoVault = new KaminoVault(env.c.rpc, vaultAddress, undefined, env.kvaultProgramId);

      const reserveAddress = address(reserve);
      const reserveState = await Reserve.fetch(env.c.rpc, reserveAddress, env.klendProgramId);
      if (!reserveState) {
        throw new Error('Reserve not found');
      }

      const reserveWithAddress: ReserveWithAddress = {
        address: reserveAddress,
        state: reserveState,
      };

      const payer = await env.getSigner();
      const instructions = await kaminoManager.investSingleReserveIxs(payer, kaminoVault, reserveWithAddress);
      await processTx(
        env.c,
        payer,
        [
          ...instructions,
          ...getPriorityFeeAndCuIxs({
            priorityFeeMultiplier: 2500,
            computeUnits: 800_000,
          }),
        ],
        mode,
        []
      );
      mode === 'execute' && console.log(`Reserve ${reserveAddress} invested`);
    });

  // commands
  //   .command('close-vault')
  //   .requiredOption('--vault <string>', 'Vault address')
  //   .option(`--staging`, 'If true, will use the staging programs')
  //   .action(async ({vault, staging}) => {
  //     const env = await initEnv(false, staging);
  //     const vaultAddress = address(vault);

  //     const kaminoManager = new KaminoManager(env.connection, env.klendProgramId, env.kvaultProgramId);

  //     const kaminoVault = new KaminoVault(vaultAddress, undefined, env.kvaultProgramId);
  //     const instructions = await kaminoManager.closeVault(kaminoVault);

  //     const closeVaultSig = await processTxn(env.client, env.payer, [instructions], 'execute', 2500, []);
  //     console.log('Vault closed:', closeVaultSig);
  //   });

  commands
    .command('get-vault-colls')
    .requiredOption('--vault <string>', 'Vault address')
    .option(`--staging`, 'If true, will use the staging programs')
    .action(async ({ vault, staging }) => {
      const env = await initEnv(staging);
      const slotDuration = await getMedianSlotDurationInMsFromLastEpochs();

      const kaminoManager = new KaminoManager(env.c.rpc, slotDuration, env.klendProgramId, env.kvaultProgramId);

      const vaultAddress = address(vault);
      const vaultState = await new KaminoVault(env.c.rpc, vaultAddress, undefined, env.kvaultProgramId).getState();
      const vaultCollaterals = await kaminoManager.getVaultCollaterals(
        vaultState,
        await env.c.rpc.getSlot({ commitment: 'confirmed' }).send()
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
    .option(`--staging`, 'If true, will use the staging programs')
    .option(`--token-price <number>`, 'Vault token price in USD')
    .action(async ({ vault, staging, tokenPrice }) => {
      const env = await initEnv(staging);
      const slotDuration = await getMedianSlotDurationInMsFromLastEpochs();

      const kaminoManager = new KaminoManager(env.c.rpc, slotDuration, env.klendProgramId, env.kvaultProgramId);

      const vaultAddress = address(vault);
      const kaminoVault = new KaminoVault(env.c.rpc, vaultAddress, undefined, env.kvaultProgramId);
      const vaultOverview = await kaminoManager.getVaultOverview(
        kaminoVault,
        new Decimal(tokenPrice),
        await env.c.rpc.getSlot({ commitment: 'confirmed' }).send()
      );

      console.log('vaultOverview', vaultOverview);
      vaultOverview.reservesFarmsIncentives.reserveFarmsIncentives.forEach((incentive, reserveAddress) => {
        console.log('reserve ', reserveAddress);
        console.log('reserve incentive', incentive);
      });
      console.log('totalIncentivesAPY', vaultOverview.reservesFarmsIncentives.totalIncentivesAPY.toString());
    });

  commands
    .command('get-vault-farm-apy')
    .requiredOption('--vault <string>', 'Vault address')
    .requiredOption('--token-price <number>', 'Vault token price in USD')
    .option(`--staging`, 'If true, will use the staging programs')
    .action(async ({ vault, tokenPrice, staging }) => {
      const env = await initEnv(staging);
      const slotDuration = await getMedianSlotDurationInMsFromLastEpochs();

      const kaminoManager = new KaminoManager(env.c.rpc, slotDuration, env.klendProgramId, env.kvaultProgramId);

      const kaminoVault = new KaminoVault(env.c.rpc, address(vault), undefined, env.kvaultProgramId, slotDuration);
      const farmAPY = await kaminoManager.getVaultFarmRewardsAPY(kaminoVault, new Decimal(tokenPrice));
      console.log('farmAPY', farmAPY);
    });

  commands
    .command('get-reserve-farms-apy')
    .requiredOption('--reserve <string>', 'Reserve address')
    .requiredOption('--token-price <number>', 'Reserve token price in USD')
    .option(`--staging`, 'If true, will use the staging programs')
    .action(async ({ reserve, tokenPrice, staging }) => {
      const env = await initEnv(staging);
      const slotDuration = await getMedianSlotDurationInMsFromLastEpochs();

      const kaminoManager = new KaminoManager(env.c.rpc, slotDuration, env.klendProgramId, env.kvaultProgramId);

      const farmAPY = await kaminoManager.getReserveFarmRewardsAPY(address(reserve), new Decimal(tokenPrice));
      console.log('farmAPY', farmAPY);
    });

  commands
    .command('get-vault-all-mints')
    .option(`--staging`, 'If true, will use the staging programs')
    .option(`--vault <string>`, 'Vault address')
    .action(async ({ staging, vault }) => {
      const env = await initEnv(staging);
      const slotDuration = await getMedianSlotDurationInMsFromLastEpochs();

      const kaminoManager = new KaminoManager(env.c.rpc, slotDuration, env.klendProgramId, env.kvaultProgramId);

      const vaultAddress = address(vault);
      const kaminoVault = new KaminoVault(env.c.rpc, vaultAddress, undefined, env.kvaultProgramId, slotDuration);

      const allVaultsTokenMints = await kaminoManager.getAllVaultsTokenMintsIncludingRewards([kaminoVault]);
      console.log('allVaultsTokenMints', allVaultsTokenMints);
    });

  commands
    .command('get-vault-allocation-distribution')
    .requiredOption('--vault <string>', 'Vault address')
    .option(`--staging`, 'If true, will use the staging programs')
    .action(async ({ vault, staging }) => {
      const env = await initEnv(staging);
      const slotDuration = await getMedianSlotDurationInMsFromLastEpochs();

      const kaminoManager = new KaminoManager(env.c.rpc, slotDuration, env.klendProgramId, env.kvaultProgramId);

      const vaultAddress = address(vault);
      const vaultState = await new KaminoVault(
        env.c.rpc,
        vaultAddress,
        undefined,
        env.kvaultProgramId,
        slotDuration
      ).getState();
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
    .option(`--staging`, 'If true, will use the staging programs')
    .action(async ({ vault, wallet, staging }) => {
      const env = await initEnv(staging);
      const slotDuration = await getMedianSlotDurationInMsFromLastEpochs();

      const kaminoManager = new KaminoManager(env.c.rpc, slotDuration, env.klendProgramId, env.kvaultProgramId);

      const vaultAddress = address(vault);
      const walletAddress = address(wallet);
      const kaminoVault = new KaminoVault(env.c.rpc, vaultAddress, undefined, env.kvaultProgramId, slotDuration);
      const userShares = await kaminoManager.getUserSharesBalanceSingleVault(walletAddress, kaminoVault);
      console.log(
        `User shares for vault ${vaultAddress}: unstaked shares: ${userShares.unstakedShares} staked shares: ${userShares.stakedShares} total shares: ${userShares.totalShares}`
      );
    });

  commands
    .command('get-user-shares-all-vaults')
    .requiredOption('--wallet <string>', 'User wailt address')
    .option(`--staging`, 'If true, will use the staging programs')
    .action(async ({ wallet, staging }) => {
      const env = await initEnv(staging);
      const slotDuration = await getMedianSlotDurationInMsFromLastEpochs();

      const kaminoManager = new KaminoManager(env.c.rpc, slotDuration, env.klendProgramId, env.kvaultProgramId);

      const walletAddress = address(wallet);
      const userShares = await kaminoManager.getUserSharesBalanceAllVaults(walletAddress);

      console.log(`${userShares.size} positions for wallet ${walletAddress}`);
      userShares.forEach((userShares, vaultAddress) => {
        console.log(
          `User shares for vault ${vaultAddress}: staked shares ${userShares.stakedShares} unstaked shares ${userShares.unstakedShares} total shares ${userShares.totalShares}`
        );
      });
    });

  commands
    .command('get-tokens-per-share')
    .requiredOption('--vault <string>', 'Vault address')
    .option(`--staging`, 'If true, will use the staging programs')
    .action(async ({ vault, staging }) => {
      const env = await initEnv(staging);
      const slotDuration = await getMedianSlotDurationInMsFromLastEpochs();

      const kaminoManager = new KaminoManager(env.c.rpc, slotDuration, env.klendProgramId, env.kvaultProgramId);

      const vaultAddress = address(vault);
      const kaminoVault = new KaminoVault(env.c.rpc, vaultAddress, undefined, env.kvaultProgramId, slotDuration);
      const tokensPerShare = await kaminoManager.getTokensPerShareSingleVault(
        kaminoVault,
        await env.c.rpc.getSlot({ commitment: 'confirmed' }).send()
      );
      console.log(`Tokens per share for vault ${vaultAddress.toBase58()}: ${tokensPerShare}`);
    });

  commands
    .command('print-vault')
    .requiredOption('--vault <string>', 'Vault address')
    .option(`--staging`, 'If true, will use the staging programs')
    .action(async ({ vault, staging }) => {
      const env = await initEnv(staging);
      const slotDuration = await getMedianSlotDurationInMsFromLastEpochs();

      const kaminoManager = new KaminoManager(env.c.rpc, slotDuration, env.klendProgramId, env.kvaultProgramId);

      const vaultAddress = address(vault);
      const kaminoVault = new KaminoVault(env.c.rpc, vaultAddress, undefined, env.kvaultProgramId, slotDuration);
      const vaultState = await kaminoVault.getState();

      const slot = await env.c.rpc.getSlot({ commitment: 'confirmed' }).send();
      const tokensPerShare = await kaminoManager.getTokensPerShareSingleVault(kaminoVault, slot);
      const holdings = await kaminoManager.getVaultHoldings(kaminoVault.state!, slot);

      const sharesIssued = lamportsToDecimal(
        vaultState.sharesIssued.toString(),
        vaultState.sharesMintDecimals.toString()
      );

      const vaultOverview = await kaminoManager.getVaultOverview(kaminoVault, new Decimal(1.0), slot);

      console.log('farm', vaultState.vaultFarm.toString());
      console.log('vault token mint', vaultState.tokenMint);
      console.log('Name: ', kaminoManager.getDecodedVaultName(kaminoVault.state!));
      console.log('Shares issued: ', sharesIssued);
      holdings.print();
      console.log(`Tokens per share for vault ${vaultAddress}: ${tokensPerShare}`);
      console.log('vaultOverview', vaultOverview);

      for (const [reserveAddress, reserveOverview] of vaultOverview.reservesOverview) {
        console.log(`reserve ${reserveAddress} supplyAPY ${reserveOverview.supplyAPY}`);
      }
    });

  commands.command('get-cumulative-delegated-farms-rewards').action(async () => {
    const env = await initEnv();
    const kaminoManager = new KaminoManager(
      env.c.rpc,
      DEFAULT_RECENT_SLOT_DURATION_MS,
      env.klendProgramId,
      env.kvaultProgramId
    );
    const cumulativeRewards = await kaminoManager.getCumulativeDelegatedFarmsRewardsIssuedForAllVaults();
    cumulativeRewards.forEach((reward, tokenMint) => {
      console.log(`token mint ${tokenMint} rewards issued (lamports) ${reward}`);
    });
  });

  commands.command('get-vaults-with-delegated-farm').action(async () => {
    const env = await initEnv();
    const kaminoManager = new KaminoManager(
      env.c.rpc,
      DEFAULT_RECENT_SLOT_DURATION_MS,
      env.klendProgramId,
      env.kvaultProgramId
    );

    const vaultsWithDelegatedFarm = await kaminoManager.getVaultsWithDelegatedFarm();
    vaultsWithDelegatedFarm.forEach((delegatedFarm, vault) => {
      console.log(`vault ${vault} delegated farm ${delegatedFarm}`);
    });
  });

  commands
    .command('simulate-reserve-apy')
    .requiredOption('--reserve <string>', 'Reserve address')
    .action(async ({ reserve }) => {
      const env = await initEnv();

      const reserveState = await Reserve.fetch(env.c.rpc, address(reserve), env.klendProgramId);
      if (!reserveState) {
        throw new Error('Reserve not found');
      }

      const kaminoReserve = await KaminoReserve.initializeFromAddress(
        address(reserve),
        env.c.rpc,
        DEFAULT_RECENT_SLOT_DURATION_MS,
        reserveState
      );

      const slot = await env.c.rpc.getSlot({ commitment: 'confirmed' }).send();
      const amount = new Decimal(0);
      const simulatedApr = kaminoReserve.calcSimulatedSupplyAPR(amount, 'deposit', slot, 0);
      console.log('simulated apr', simulatedApr);
      const apy = calculateAPYFromAPR(simulatedApr);
      console.log('simulated apy', apy);

      const computedAPR = kaminoReserve.calculateSupplyAPR(slot, 0);
      console.log('computed apr', computedAPR);
      const computedAPY = kaminoReserve.totalSupplyAPY(slot);
      console.log('computed apy', computedAPY);
    });

  commands
    .command('get-oracle-mappings')
    .requiredOption('--lending-market <string>', 'Lending Market Address')
    .option(`--staging`, 'If true, will use the staging programs')
    .action(async ({ staging, lendingMarket }) => {
      const env = await initEnv(staging);
      const kaminoManager = new KaminoManager(
        env.c.rpc,
        DEFAULT_RECENT_SLOT_DURATION_MS,
        env.klendProgramId,
        env.kvaultProgramId
      );
      const market = await KaminoMarket.load(
        env.c.rpc,
        address(lendingMarket),
        DEFAULT_RECENT_SLOT_DURATION_MS,
        env.klendProgramId
      );
      if (!market) {
        throw Error(`Lending market ${lendingMarket} not found`);
      }

      console.log('Getting  oracle mappings');
      const oracleConfigs = await kaminoManager.getScopeOracleConfigs(market);
      for (const [oraclePrices, configs] of oracleConfigs.entries()) {
        console.log(`OraclePrices pubkey: ${oraclePrices}`, 'Configs:', JSON.parse(JSON.stringify(configs)));
      }
    });

  commands
    .command('get-all-vaults')
    .option(`--staging`, 'If true, will use the staging programs')
    .action(async ({ staging }) => {
      const env = await initEnv(staging);
      const slotDuration = await getMedianSlotDurationInMsFromLastEpochs();

      const kaminoManager = new KaminoManager(env.c.rpc, slotDuration, env.klendProgramId, env.kvaultProgramId);
      const allVaults = await kaminoManager.getAllVaults();
      console.log('all vaults', allVaults);
    });

  commands
    .command('get-all-vaults-for-token')
    .requiredOption('--token <string>', 'Token address')
    .option(`--staging`, 'If true, will use the staging programs')
    .action(async ({ token, staging }) => {
      const env = await initEnv(staging);
      const slotDuration = await getMedianSlotDurationInMsFromLastEpochs();

      const kaminoManager = new KaminoManager(env.c.rpc, slotDuration, env.klendProgramId, env.kvaultProgramId);
      const allVaults = await kaminoManager.getAllVaultsForToken(address(token));
      console.log('all vaults for token ', token, allVaults);
    });

  commands
    .command('get-all-vaults-pks')
    .option(`--staging`, 'If true, will use the staging programs')
    .action(async ({ staging }) => {
      const env = await initEnv(staging);
      const kaminoManager = new KaminoManager(
        env.c.rpc,
        DEFAULT_RECENT_SLOT_DURATION_MS,
        env.klendProgramId,
        env.kvaultProgramId
      );

      const allVaults = await kaminoManager.getAllVaults();
      console.log(
        'all vaults',
        allVaults.map((vault) => vault.address)
      );
    });

  commands
    .command('get-simulated-interest-and-fees')
    .requiredOption('--vault <string>', 'Vault address')
    .option(`--staging`, 'If true, will use the staging programs')
    .action(async ({ vault, staging }) => {
      const env = await initEnv(staging);

      const vaultAddress = address(vault);
      const slotDuration = await getMedianSlotDurationInMsFromLastEpochs();

      const kaminoManager = new KaminoManager(env.c.rpc, slotDuration, env.klendProgramId, env.kvaultProgramId);
      const vaultState = await new KaminoVault(
        env.c.rpc,
        vaultAddress,
        undefined,
        env.kvaultProgramId,
        slotDuration
      ).getState();

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
      const env = await initEnv(false, staging);
      const lendingMarketAddress = address(lendingMarket);
      const lendingMarketState = await LendingMarket.fetch(env.c.rpc, lendingMarketAddress, env.klendProgramId);

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
    .option(`--staging`, 'If true, will use the staging programs')
    .action(async ({ vault, staging }) => {
      const env = await initEnv(staging);

      const vaultAddress = address(vault);
      const slotDuration = await getMedianSlotDurationInMsFromLastEpochs();

      const kaminoManager = new KaminoManager(env.c.rpc, slotDuration, env.klendProgramId, env.kvaultProgramId);
      const vaultState = await new KaminoVault(
        env.c.rpc,
        vaultAddress,
        undefined,
        env.kvaultProgramId,
        slotDuration
      ).getState();

      const computedAllocation = await kaminoManager.getVaultComputedReservesAllocation(vaultState);
      console.log('computedAllocation', computedAllocation);
    });

  commands
    .command('download-lending-market-config-and-all-reserves-configs')
    .requiredOption('--lending-market <string>', 'Lending Market Address')
    .option(`--staging`, 'If true, will use the staging programs')
    .action(async ({ lendingMarket, staging }) => {
      const env = await initEnv(false, staging);
      const decoder = new TextDecoder('utf-8');
      const lendingMarketAddress = address(lendingMarket);

      const kaminoMarket = await KaminoMarket.load(
        env.c.rpc,
        lendingMarketAddress,
        DEFAULT_RECENT_SLOT_DURATION_MS,
        env.klendProgramId
      );

      if (!kaminoMarket) {
        throw new Error('Lending Market not found');
      }

      const lendingMarketState = await LendingMarket.fetch(env.c.rpc, lendingMarketAddress, env.klendProgramId);

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
      'simulate|multisig|execute - simulate - to print txn simulation and to get tx simulation link in explorer, execute - execute tx, multisig - to get bs58 tx for multisig usage'
    )
    .option(`--staging`, 'If true, will use the staging programs')
    .action(async ({ lendingMarket, lendingMarketConfigPath, mode, staging }) => {
      const env = await initEnv(staging);
      const lendingMarketAddress = address(lendingMarket);
      const lendingMarketAccount = await KaminoMarket.load(
        env.c.rpc,
        lendingMarketAddress,
        DEFAULT_RECENT_SLOT_DURATION_MS,
        env.klendProgramId,
        false
      );
      if (lendingMarketAccount === null) {
        throw new Error(`Lending market ${lendingMarketAddress} not found`);
      }
      const marketWithAddress = {
        address: lendingMarketAddress,
        state: lendingMarketAccount.state,
      };

      const kaminoManager = new KaminoManager(
        env.c.rpc,
        DEFAULT_RECENT_SLOT_DURATION_MS,
        env.klendProgramId,
        env.kvaultProgramId
      );

      const newLendingMarket = LendingMarket.fromJSON(JSON.parse(fs.readFileSync(lendingMarketConfigPath, 'utf8')));

      const signer = await env.getSigner({ market: lendingMarketAccount });
      const ixs = kaminoManager.updateLendingMarketIxs(signer, marketWithAddress, newLendingMarket);

      // executing 6 ixs in a txn to make sure they fit
      for (let ixIndex = 0; ixIndex < ixs.length; ixIndex += 6) {
        const ixsToExecute = ixs.slice(ixIndex, ixIndex + 6);
        await processTx(
          env.c,
          signer,
          [
            ...ixsToExecute,
            ...getPriorityFeeAndCuIxs({
              priorityFeeMultiplier: 2500,
              computeUnits: 400_000,
            }),
          ],
          mode,
          []
        );
      }

      mode === 'execute' &&
        console.log('Reserve Updated with new config -> ', JSON.parse(JSON.stringify(newLendingMarket)));
    });

  commands
    .command('update-lending-market-owner')
    .requiredOption('--lending-market <string>', 'Lending Market address')
    .requiredOption(
      `--mode <string>`,
      'simulate|multisig|execute - simulate - to print txn simulation and to get tx simulation link in explorer, execute - execute tx, multisig - to get bs58 tx for multisig usage'
    )
    .option(`--staging`, 'If true, will use the staging programs')
    .action(async ({ lendingMarket, mode, staging }) => {
      const env = await initEnv(staging);
      const lendingMarketAddress = address(lendingMarket);
      const lendingMarketState = await KaminoMarket.load(
        env.c.rpc,
        lendingMarketAddress,
        DEFAULT_RECENT_SLOT_DURATION_MS,
        env.klendProgramId,
        false
      );
      if (lendingMarketState === null) {
        throw new Error('Lending Market not found');
      }
      const marketWithAddress = {
        address: lendingMarketAddress,
        state: lendingMarketState.state,
      };

      const kaminoManager = new KaminoManager(
        env.c.rpc,
        DEFAULT_RECENT_SLOT_DURATION_MS,
        env.klendProgramId,
        env.kvaultProgramId
      );
      const lendingMarketOwnerCached = await env.getSigner({
        market: lendingMarketState,
        useLendingMarketOwnerCached: true,
      });

      const ix = kaminoManager.updateLendingMarketOwnerIxs(marketWithAddress, lendingMarketOwnerCached);

      await processTx(
        env.c,
        lendingMarketOwnerCached,
        [
          ix,
          ...getPriorityFeeAndCuIxs({
            priorityFeeMultiplier: 2500,
            computeUnits: 400_000,
          }),
        ],
        mode,
        []
      );

      mode === 'execute' &&
        console.log('Lending market admin updated to the new admin -> ', lendingMarketOwnerCached.address);
    });

  commands
    .command('update-lending-market-name')
    .requiredOption('--lending-market <string>', 'Lending Market address')
    .requiredOption('--new-name <string>', 'Lending Market address')
    .requiredOption(
      `--mode <string>`,
      'simulate|multisig|execute - simulate - to print txn simulation and to get tx simulation link in explorer, execute - execute tx, multisig - to get bs58 tx for multisig usage'
    )
    .option(`--staging`, 'If true, will use the staging programs')
    .action(async ({ lendingMarket, newName, mode, staging }) => {
      const env = await initEnv(staging);
      const lendingMarketAddress = address(lendingMarket);
      const lendingMarketState = await KaminoMarket.load(
        env.c.rpc,
        lendingMarketAddress,
        DEFAULT_RECENT_SLOT_DURATION_MS,
        env.klendProgramId,
        false
      );
      if (lendingMarketState === null) {
        throw new Error('Lending Market not found');
      }
      const marketWithAddress = {
        address: lendingMarketAddress,
        state: lendingMarketState.state,
      };

      const kaminoManager = new KaminoManager(
        env.c.rpc,
        DEFAULT_RECENT_SLOT_DURATION_MS,
        env.klendProgramId,
        env.kvaultProgramId
      );

      const currentName = parseZeroPaddedUtf8(lendingMarketState.state.name);
      const newNameEncoded = encodeTokenName(newName);

      console.log('Current name: ', currentName, ' encoded: ', lendingMarketState.state.name);
      console.log('New name: ', newName, ' encoded: ', newNameEncoded);

      const newLendingMarket = new LendingMarket({
        ...lendingMarketState.state,
        name: newNameEncoded,
      });

      const signer = await env.getSigner({ market: lendingMarketState });
      const ixs = kaminoManager.updateLendingMarketIxs(signer, marketWithAddress, newLendingMarket);

      await processTx(
        env.c,
        signer,
        [
          ...ixs,
          ...getPriorityFeeAndCuIxs({
            priorityFeeMultiplier: 2500,
            computeUnits: 400_00,
          }),
        ],
        mode,
        []
      );

      mode === 'execute' &&
        console.log(
          'Lending market name updated to -> ',
          JSON.parse(JSON.stringify(lendingMarketState.state.lendingMarketOwnerCached))
        );
    });

  commands
    .command('update-reserve-config-debt-cap')
    .requiredOption('--reserve <string>', 'Lending Market address')
    .requiredOption(
      `--mode <string>`,
      'simulate|multisig|execute - simulate - to print txn simulation and to get tx simulation link in explorer, execute - execute tx, multisig - to get bs58 tx for multisig usage'
    )
    .option(`--staging`, 'If true, will use the staging programs')
    .action(async ({ reserve, mode, staging }) => {
      const env = await initEnv(staging);
      const reserveAddress = address(reserve);
      const reserveState = await Reserve.fetch(env.c.rpc, reserveAddress, env.klendProgramId);
      if (!reserveState) {
        throw new Error('Reserve not found');
      }

      const lendingMarketAddress = reserveState.lendingMarket;
      const lendingMarketState = await KaminoMarket.load(
        env.c.rpc,
        lendingMarketAddress,
        DEFAULT_RECENT_SLOT_DURATION_MS,
        env.klendProgramId,
        false
      );
      if (lendingMarketState === null) {
        throw new Error('Lending Market not found');
      }

      const marketWithAddress = {
        address: lendingMarketAddress,
        state: lendingMarketState.state,
      };

      const kaminoManager = new KaminoManager(
        env.c.rpc,
        DEFAULT_RECENT_SLOT_DURATION_MS,
        env.klendProgramId,
        env.kvaultProgramId
      );

      const newReserveConfigFields: ReserveConfigFields = {
        ...reserveState.config,
        borrowLimit: new BN(1000),
      };
      const newReserveConfig: ReserveConfig = new ReserveConfig(newReserveConfigFields);

      const admin = await env.getSigner({ market: lendingMarketState });

      const ixs = await kaminoManager.updateReserveIxs(admin, marketWithAddress, reserveAddress, newReserveConfig);

      await processTx(
        env.c,
        admin,
        [
          ...ixs,
          ...getPriorityFeeAndCuIxs({
            priorityFeeMultiplier: 2500,
            computeUnits: 400_000,
          }),
        ],
        mode,
        []
      );

      mode === 'execute' && console.log(`Reserve ${reserveAddress} debt cap updated`);
    });

  commands
    .command('get-market-or-vault-admin-info')
    .requiredOption('--address <string>', 'Address of the market or vault')
    .option(`--staging`, 'If true, will use the staging programs')
    .action(async ({ address: addr, staging }) => {
      const env = await initEnv(staging);
      const adminInfo = await KaminoManager.getMarketOrVaultAdminInfo(env.c.rpc, address(addr));
      console.log(adminInfo);
    });

  commands
    .command('claim-rewards-for-vault')
    .requiredOption('--vault <string>', 'Vault address')
    .requiredOption(
      `--mode <string>`,
      'simulate|multisig|execute - simulate - to print txn simulation and to get tx simulation link in explorer, execute - execute tx, multisig - to get bs58 tx for multisig usage'
    )
    .option(`--staging`, 'If true, will use the staging programs')
    .option(`--user <string>`, 'User address')
    .action(async ({ vault, mode, staging, user }) => {
      const env = await initEnv(staging);
      const vaultAddress = address(vault);
      const kaminoVault = new KaminoVault(env.c.rpc, vaultAddress);
      const kaminoManager = new KaminoManager(
        env.c.rpc,
        DEFAULT_RECENT_SLOT_DURATION_MS,
        env.klendProgramId,
        env.kvaultProgramId
      );
      const userWallet = user ? noopSigner(address(user)) : await env.getSigner();
      const rewardsIxs = await kaminoManager.getClaimAllRewardsForVaultIxs(userWallet, kaminoVault);

      if (rewardsIxs.length > 0) {
        await processTx(
          env.c,
          userWallet,
          [
            ...rewardsIxs,
            ...getPriorityFeeAndCuIxs({
              priorityFeeMultiplier: 2500,
              computeUnits: 400_000,
            }),
          ],
          mode,
          []
        );
      } else {
        console.log('No rewards to claim');
      }
    });

  await commands.parseAsync();
}

main()
  .then(() => {
    process.exit();
  })
  .catch((e) => {
    console.error('\n\nKamino manager CLI exited with error:\n\n', e);
    process.exit(1);
  });

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
    price: address(reserveConfigFromFile.tokenInfo.pythConfiguration.price),
  });
  const switchboardConfiguration = new SwitchboardConfiguration({
    priceAggregator: address(reserveConfigFromFile.tokenInfo.switchboardConfiguration.priceAggregator),
    twapAggregator: address(reserveConfigFromFile.tokenInfo.switchboardConfiguration.twapAggregator),
  });
  const priceChain = [65535, 65535, 65535, 65535];
  const twapChain = [65535, 65535, 65535, 65535];

  const priceChainFromFile: number[] = reserveConfigFromFile.tokenInfo.scopeConfiguration.priceChain;
  const twapChainFromFile: number[] = reserveConfigFromFile.tokenInfo.scopeConfiguration.twapChain;

  priceChainFromFile.forEach((value, index) => (priceChain[index] = value));
  twapChainFromFile.forEach((value, index) => (twapChain[index] = value));

  const scopeConfiguration = new ScopeConfiguration({
    priceFeed: address(reserveConfigFromFile.tokenInfo.scopeConfiguration.priceFeed),
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

async function createUpdateReserveConfigLutIxs(
  env: ManagerEnv,
  lendingMarketAddress: Address,
  reserveAddress: Address
): Promise<[Address, Instruction[]]> {
  const globalConfigAddress = await globalConfigPda(env.klendProgramId);
  const contents = [globalConfigAddress, lendingMarketAddress, reserveAddress];
  const signer = await env.getSigner();
  const [createIx, lut] = await createLookupTableIx(env.c.rpc, signer);
  const extendIxs = extendLookupTableIxs(signer, lut, contents);
  return [lut, [createIx, ...extendIxs]];
}
