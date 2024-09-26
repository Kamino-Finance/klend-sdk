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
  KaminoManager,
  KaminoMarket,
  KaminoVault,
  KaminoVaultConfig,
  LendingMarket,
  MAINNET_BETA_CHAIN_ID,
  Reserve,
  ReserveAllocationConfig,
  ReserveWithAddress,
  signSendAndConfirmRawTransactionWithRetry,
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
import { TOKEN_PROGRAM_ID } from '@solana/spl-token';
import { MarketWithAddress } from './utils/managerTypes';

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

      const kaminoManager = new KaminoManager(env.connection, env.kLendProgramId, env.kVaultProgramId);

      const { market: marketKp, ixns: createMarketIxns } = await kaminoManager.createMarketIxs({
        admin: mode === 'multisig' ? multisigPk : env.payer.publicKey,
      });

      const _createMarketSig = await processTxn(env.client, env.payer, createMarketIxns, mode, 2500, [marketKp]);

      mode === 'execute' && console.log('Market created:', marketKp.publicKey.toBase58());
    });

  commands
    .command('add-asset-to-market')
    .requiredOption('--market <string>', 'Market addres to add asset to')
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
      const kaminoManager = new KaminoManager(env.connection, env.kLendProgramId, env.kVaultProgramId);

      const reserveConfigFromFile = JSON.parse(fs.readFileSync(reserveConfigPath, 'utf8'));

      const reserveConfig = parseReserveConfigFromFile(reserveConfigFromFile);
      const assetConfig = new AssetReserveConfigCli(tokenMint, tokenMintProgramId, reserveConfig);

      const { reserve, txnIxns } = await kaminoManager.addAssetToMarketIxs({
        admin: mode === 'multisig' ? multisigPk : env.payer.publicKey,
        marketAddress: marketAddress,
        assetConfig: assetConfig,
      });

      console.log('reserve: ', reserve.publicKey);

      const _createReserveSig = await processTxn(env.client, env.payer, txnIxns[0], mode, 2500, [reserve]);

      const _updateReserveSig = await processTxn(env.client, env.payer, txnIxns[1], mode, 2500, [], 400_000);

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

      const kaminoManager = new KaminoManager(env.connection, env.kLendProgramId, env.kVaultProgramId);

      const reserveConfigFromFile = JSON.parse(fs.readFileSync(reserveConfigPath, 'utf8'));

      const reserveConfig = parseReserveConfigFromFile(reserveConfigFromFile);

      const ixns = await kaminoManager.updateReserveIxs(
        marketWithAddress,
        reserveAddress,
        reserveConfig,
        reserveState,
        updateEntireConfig
      );

      const _updateReserveSig = await processTxn(env.client, env.payer, ixns, mode, 2500, [], 400_000);

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
    .option(`--staging`, 'If true, will use the staging programs')
    .option(`--multisig <string>`, 'If using multisig mode this is required, otherwise will be ignored')
    .action(async ({ mint, mode, staging, multisig }) => {
      const env = initializeClient(mode === 'multisig', staging);
      const tokenMint = new PublicKey(mint);

      if (mode === 'multisig' && !multisig) {
        throw new Error('If using multisig mode, multisig is required');
      }

      const multisigPk = multisig ? new PublicKey(multisig) : PublicKey.default;
      const kaminoManager = new KaminoManager(env.connection, env.kLendProgramId, env.kVaultProgramId);

      const kaminoVaultConfig = new KaminoVaultConfig({
        admin: mode === 'multisig' ? multisigPk : env.payer.publicKey,
        tokenMint: tokenMint,
        tokenMintProgramId: TOKEN_PROGRAM_ID,
        performanceFeeRate: new Decimal(0.0),
        managementFeeRate: new Decimal(0.0),
      });

      const { vault: vaultKp, ixns: instructions } = await kaminoManager.createVaultIxs(kaminoVaultConfig);

      const _createVaultSig = await processTxn(env.client, env.payer, instructions, mode, 2500, [vaultKp]);

      mode === 'execute' && console.log('Vault created:', vaultKp.publicKey.toBase58());
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

      const kaminoManager = new KaminoManager(env.connection, env.kLendProgramId, env.kVaultProgramId);
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

      const updateVaultAllocationSig = await processTxn(env.client, env.payer, [instructions], mode, 2500, []);

      mode === 'execute' && console.log('Vault allocation updated:', updateVaultAllocationSig);
    });

  commands.command('get-oracle-mappings').action(async () => {
    const env = initializeClient(false, false);
    const kaminoManager = new KaminoManager(env.connection, env.kLendProgramId, env.kVaultProgramId);

    console.log('Getting  oracle mappings');
    const oracleConfigs = await kaminoManager.getScopeOracleConfigs();
    console.log('oracleConfigs', JSON.parse(JSON.stringify(oracleConfigs)));
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

      const kaminoManager = new KaminoManager(env.connection, env.kLendProgramId, env.kVaultProgramId);

      const newLendingMarket = LendingMarket.fromJSON(JSON.parse(fs.readFileSync(lendingMarketConfigPath, 'utf8')));

      const ixns = kaminoManager.updateLendingMarketIxs(marketWithAddress, newLendingMarket);

      // executing 6 ixns in a txn to make sure they fit
      for (let ixnIndex = 0; ixnIndex < ixns.length; ixnIndex += 6) {
        const ixnToExecute = ixns.slice(ixnIndex, ixnIndex + 6);
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
      if (!lendingMarketState) {
        throw new Error('Lending Market not found');
      }

      if (mode === 'multisig') {
        throw new Error('If using multisig mode, multisig is required');
      }

      const kaminoManager = new KaminoManager(env.connection, env.kLendProgramId, env.kVaultProgramId);

      const ixn = kaminoManager.updateLendingMarketOwnerIxs(marketWithAddress);

      const _updateLendingMarketSig = await processTxn(env.client, env.payer, [ixn], mode, 2500, [], 400_000);

      mode === 'execute' &&
        console.log(
          'Lending market admin updated to the new admin -> ',
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
  ixns: TransactionInstruction[],
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
    txn.add(...ixns);
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
    tx.add(...ixns);

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
      console.log('Simulation: \n' + simulation.value.logs);
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
  const ixns: TransactionInstruction[] = [];
  ixns.push(ComputeBudgetProgram.setComputeUnitLimit({ units }));
  ixns.push(ComputeBudgetProgram.setComputeUnitPrice({ microLamports }));
  return ixns;
}

function parseReserveConfigFromFile(farmConfigFromFile: any): ReserveConfig {
  const reserveConfigFields: ReserveConfigFields = {
    status: farmConfigFromFile.status,
    loanToValuePct: farmConfigFromFile.loanToValuePct,
    liquidationThresholdPct: farmConfigFromFile.liquidationThresholdPct,
    minLiquidationBonusBps: farmConfigFromFile.minLiquidationBonusBps,
    protocolLiquidationFeePct: farmConfigFromFile.protocolLiquidationFeePct,
    protocolTakeRatePct: farmConfigFromFile.protocolLiquidationFeePct,
    assetTier: farmConfigFromFile.assetTier,
    maxLiquidationBonusBps: farmConfigFromFile.maxLiquidationBonusBps,
    badDebtLiquidationBonusBps: farmConfigFromFile.badDebtLiquidationBonusBps,
    fees: {
      borrowFeeSf: Fraction.fromDecimal(new Decimal(farmConfigFromFile.fees.borrowFee)).valueSf,
      flashLoanFeeSf: Fraction.fromDecimal(new Decimal(farmConfigFromFile.fees.flashLoanFee)).valueSf,
      padding: Array(8).fill(0),
    },
    depositLimit: new BN(farmConfigFromFile.depositLimit),
    borrowLimit: new BN(farmConfigFromFile.borrowLimit),
    tokenInfo: {
      name: encodeTokenName(farmConfigFromFile.tokenInfo.name),
      heuristic: new PriceHeuristic({
        lower: new BN(farmConfigFromFile.tokenInfo.heuristic.lower),
        upper: new BN(farmConfigFromFile.tokenInfo.heuristic.upper),
        exp: new BN(farmConfigFromFile.tokenInfo.heuristic.exp),
      }),
      maxTwapDivergenceBps: new BN(farmConfigFromFile.tokenInfo.maxTwapDivergenceBps),
      maxAgePriceSeconds: new BN(farmConfigFromFile.tokenInfo.maxAgePriceSeconds),
      maxAgeTwapSeconds: new BN(farmConfigFromFile.tokenInfo.maxAgeTwapSeconds),
      ...parseOracleConfiguration(farmConfigFromFile),
      blockPriceUsage: farmConfigFromFile.tokenInfo.blockPriceUsage,
      reserved: Array(7).fill(0),
      padding: Array(19).fill(new BN(0)),
    } as TokenInfo,
    borrowRateCurve: parseBorrowRateCurve(farmConfigFromFile),
    depositWithdrawalCap: new WithdrawalCaps({
      configCapacity: new BN(farmConfigFromFile.depositWithdrawalCap.configCapacity),
      currentTotal: new BN(0),
      lastIntervalStartTimestamp: new BN(0),
      configIntervalLengthSeconds: new BN(farmConfigFromFile.depositWithdrawalCap.configIntervalLengthSeconds),
    }),
    debtWithdrawalCap: new WithdrawalCaps({
      configCapacity: new BN(farmConfigFromFile.debtWithdrawalCap.configCapacity),
      currentTotal: new BN(0),
      lastIntervalStartTimestamp: new BN(0),
      configIntervalLengthSeconds: new BN(farmConfigFromFile.debtWithdrawalCap.configIntervalLengthSeconds),
    }),
    deleveragingMarginCallPeriodSecs: new BN(farmConfigFromFile.deleveragingMarginCallPeriodSecs),
    borrowFactorPct: new BN(farmConfigFromFile.borrowFactorPct),
    elevationGroups: farmConfigFromFile.elevationGroups,
    deleveragingThresholdSlotsPerBps: new BN(farmConfigFromFile.deleveragingThresholdSlotsPerBps),
    disableUsageAsCollOutsideEmode: farmConfigFromFile.disableUsageAsCollOutsideEmode,
    utilizationLimitBlockBorrowingAbove: farmConfigFromFile.utilizationLimitBlockBorrowingAbove,
    hostFixedInterestRateBps: farmConfigFromFile.hostFixedInterestRateBps,
    borrowLimitOutsideElevationGroup: new BN(farmConfigFromFile.borrowLimitOutsideElevationGroup),
    borrowLimitAgainstThisCollateralInElevationGroup: parseReserveBorrowLimitAgainstCollInEmode(farmConfigFromFile),
    reserved1: Array(2).fill(0),
    reserved2: Array(2).fill(0),
    reserved3: Array(8).fill(0),
  };

  return new ReserveConfig(reserveConfigFields);
}

function parseOracleConfiguration(farmConfigFromFile: any): {
  pythConfiguration: PythConfiguration;
  switchboardConfiguration: SwitchboardConfiguration;
  scopeConfiguration: ScopeConfiguration;
} {
  const pythConfiguration = new PythConfiguration({
    price: new PublicKey(farmConfigFromFile.tokenInfo.pythConfiguration.price),
  });
  const switchboardConfiguration = new SwitchboardConfiguration({
    priceAggregator: new PublicKey(farmConfigFromFile.tokenInfo.switchboardConfiguration.priceAggregator),
    twapAggregator: new PublicKey(farmConfigFromFile.tokenInfo.switchboardConfiguration.twapAggregator),
  });
  const priceChain = [65535, 65535, 65535, 65535];
  const twapChain = [65535, 65535, 65535, 65535];

  const priceChainFromFile: number[] = farmConfigFromFile.tokenInfo.scopeConfiguration.priceChain;
  const twapChainFromFile: number[] = farmConfigFromFile.tokenInfo.scopeConfiguration.twapChain;

  priceChainFromFile.forEach((value, index) => (priceChain[index] = value));
  twapChainFromFile.forEach((value, index) => (twapChain[index] = value));

  const scopeConfiguration = new ScopeConfiguration({
    priceFeed: new PublicKey(farmConfigFromFile.tokenInfo.scopeConfiguration.priceFeed),
    priceChain: priceChain,
    twapChain: twapChain,
  });

  return {
    pythConfiguration,
    switchboardConfiguration,
    scopeConfiguration,
  };
}

function parseBorrowRateCurve(farmConfigFromFile: any): BorrowRateCurve {
  const curvePoints: CurvePointFields[] = [];

  farmConfigFromFile.borrowRateCurve.points.forEach((curvePoint: { utilizationRateBps: any; borrowRateBps: any }) =>
    curvePoints.push({
      utilizationRateBps: curvePoint.utilizationRateBps,
      borrowRateBps: curvePoint.borrowRateBps,
    })
  );

  const finalCruvePoints: CurvePointFields[] = Array(11).fill(curvePoints[curvePoints.length - 1]);

  curvePoints.forEach((curvePoint, index) => (finalCruvePoints[index] = curvePoint));

  const borrowRateCurve = new BorrowRateCurve({ points: finalCruvePoints });

  return borrowRateCurve;
}

function parseReserveBorrowLimitAgainstCollInEmode(farmConfigFromFile: any): BN[] {
  const reserveBorrowLimitAgainstCollInEmode: BN[] = Array(32).fill(new BN(0));

  farmConfigFromFile.borrowLimitAgainstThisCollateralInElevationGroup.forEach(
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
    protocolTakeRatePct: reserveConfig.protocolLiquidationFeePct,
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
    deleveragingThresholdSlotsPerBps: reserveConfig.deleveragingThresholdSlotsPerBps.toString(),
    disableUsageAsCollOutsideEmode: reserveConfig.disableUsageAsCollOutsideEmode,
    utilizationLimitBlockBorrowingAbove: reserveConfig.utilizationLimitBlockBorrowingAbove,
    hostFixedInterestRateBps: reserveConfig.hostFixedInterestRateBps,
    borrowLimitOutsideElevationGroup: reserveConfig.borrowLimitOutsideElevationGroup.toString(),
    borrowLimitAgainstThisCollateralInElevationGroup:
      reserveConfig.borrowLimitAgainstThisCollateralInElevationGroup.map((entry) => entry.toString()),
    reserved1: Array(2).fill(0),
    reserved2: Array(2).fill(0),
    reserved3: Array(8).fill(0),
  };
}
