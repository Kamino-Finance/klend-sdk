import dotenv from 'dotenv';
import { Command } from 'commander';
import {
  ComputeBudgetProgram,
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
  buildComputeBudgetIx,
  Chain,
  encodeTokenName,
  KaminoManager,
  KaminoVault,
  KaminoVaultConfig,
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
  TokenInfo,
  WithdrawalCaps,
} from './idl_codegen/types';
import { Fraction } from './classes/fraction';
import Decimal from 'decimal.js';
import { BN } from '@coral-xyz/anchor';
import { PythConfiguration, ScopeConfiguration, SwitchboardConfiguration } from './idl_codegen_kamino_vault/types';
import * as fs from 'fs';
import { TOKEN_PROGRAM_ID } from '@solana/spl-token';

dotenv.config({
  path: `.env${process.env.ENV ? '.' + process.env.ENV : ''}`,
});

async function main() {
  const commands = new Command();

  commands.name('kamino-manager-cli').description('CLI to interact with the kvaults and klend programs');

  commands
    .command('create-market')
    .option(`--bs58`, 'If true, will print a bs58 txn instead of executing')
    .option(`--staging`, 'If true, will use the staging programs')
    .option(`--multisig <string>`, 'If using bs58 this is required, otherwise will be ignored')
    .action(async ({ bs58, staging, multisig }) => {
      const env = initializeClient(bs58, staging);

      if (bs58 && !multisig) {
        throw new Error('If using bs58, multisig is required');
      }

      const multisigPk = multisig ? new PublicKey(multisig) : PublicKey.default;

      const kaminoManager = new KaminoManager(env.provider.connection, env.kLendProgramId, env.kVaultProgramId);

      const { market: marketKp, ixns: createMarketIxns } = await kaminoManager.createMarketIxs({
        admin: bs58 ? multisigPk : env.payer.publicKey,
      });

      const _createMarketSig = await processTxn(env.client, env.payer, createMarketIxns, bs58, 2500, [marketKp]);

      !bs58 && console.log('Market created:', marketKp.publicKey.toBase58());
    });

  commands
    .command('add-asset-to-market')
    .requiredOption('--market <string>', 'Market addres to add asset to')
    .requiredOption('--mint <string>', 'Reserve liquidity token mint')
    .requiredOption('--mint-program-id <string>', 'Reserve liquidity token mint program id')
    .requiredOption('--reserve-config-path <string>', 'Path for the reserve config')
    .option(`--bs58`, 'If true, will print a bs58 txn instead of executing')
    .option(`--staging`, 'If true, will use the staging programs')
    .option(`--multisig <string>`, 'If using bs58 this is required, otherwise will be ignored')
    .action(async ({ market, mint, mintProgramId, reserveConfigPath, bs58, staging, multisig }) => {
      const env = initializeClient(bs58, staging);
      const tokenMint = new PublicKey(mint);
      const tokenMintProgramId = new PublicKey(mintProgramId);
      const marketAddress = new PublicKey(market);

      if (bs58 && !multisig) {
        throw new Error('If using bs58, multisig is required');
      }

      const multisigPk = multisig ? new PublicKey(multisig) : PublicKey.default;
      const kaminoManager = new KaminoManager(env.provider.connection, env.kLendProgramId, env.kVaultProgramId);

      const farmConfigFromFile = JSON.parse(fs.readFileSync(reserveConfigPath, 'utf8'));

      const reserveConfig = parseReserveConfigFromFile(farmConfigFromFile);
      const assetConfig = new AssetReserveConfigCli(tokenMint, tokenMintProgramId, reserveConfig);

      const { reserve, txnIxns } = await kaminoManager.addAssetToMarketIxs({
        admin: bs58 ? multisigPk : env.payer.publicKey,
        marketAddress: marketAddress,
        assetConfig: assetConfig,
      });

      console.log('reserve: ', reserve.publicKey);

      const _createReserveSig = await processTxn(env.client, env.payer, txnIxns[0], bs58, 2500, [reserve]);

      const computeBudgetIx = buildComputeBudgetIx(400_000);
      const _updateReserveSig = await processTxn(
        env.client,
        env.payer,
        [computeBudgetIx, ...txnIxns[1]],
        bs58,
        2500,
        []
      );

      !bs58 &&
        console.log(
          'Reserve Created',
          reserve.publicKey,
          'and config updated:',
          JSON.parse(JSON.stringify(reserveConfig))
        );
    });

  commands
    .command('create-vault')
    .requiredOption('--mint <string>', 'Vault token mint')
    .option(`--bs58`, 'If true, will print a bs58 txn instead of executing')
    .option(`--staging`, 'If true, will use the staging programs')
    .option(`--multisig <string>`, 'If using bs58 this is required, otherwise will be ignored')
    .action(async ({ mint, bs58, staging, multisig }) => {
      const env = initializeClient(bs58, staging);
      const tokenMint = new PublicKey(mint);

      if (bs58 && !multisig) {
        throw new Error('If using bs58, multisig is required');
      }

      const multisigPk = multisig ? new PublicKey(multisig) : PublicKey.default;
      const kaminoManager = new KaminoManager(env.provider.connection, env.kLendProgramId, env.kVaultProgramId);

      const kaminoVaultConfig = new KaminoVaultConfig({
        admin: bs58 ? multisigPk : env.payer.publicKey,
        tokenMint: tokenMint,
        tokenMintProgramId: TOKEN_PROGRAM_ID,
        performanceFeeRate: new Decimal(0.0),
        managementFeeRate: new Decimal(0.0),
      });

      const { vault: vaultKp, ixns: instructions } = await kaminoManager.createVaultIxs(kaminoVaultConfig);

      const _createVaultSig = await processTxn(env.client, env.payer, instructions, bs58, 2500, [vaultKp]);

      !bs58 && console.log('Vault created:', vaultKp.publicKey.toBase58());
    });

  commands
    .command('update-vault-reserve-allocation')
    .requiredOption('--vault <string>', 'Vault address')
    .requiredOption('--reserve <string>', 'Reserve address')
    .requiredOption('--allocation-weight <number>', 'Allocation weight')
    .requiredOption('--allocation-cap <string>', 'Allocation cap decimal value')
    .option(`--bs58`, 'If true, will print a bs58 txn instead of executing')
    .option(`--staging`, 'If true, will use the staging programs')
    .option(`--multisig <string>`, 'If using bs58 this is required, otherwise will be ignored')
    .action(async ({ vault, reserve, allocationWeight, allocationCap, bs58, staging, multisig }) => {
      const env = initializeClient(bs58, staging);
      const reserveAddress = new PublicKey(reserve);
      const vaultAddress = new PublicKey(vault);
      const allocationWeightValue = Number(allocationWeight);
      const allocationCapDecimal = new Decimal(allocationCap);

      if (bs58 && !multisig) {
        throw new Error('If using bs58, multisig is required');
      }

      const kaminoManager = new KaminoManager(env.provider.connection, env.kLendProgramId, env.kVaultProgramId);
      const reserveState = await Reserve.fetch(env.provider.connection, reserveAddress, env.kLendProgramId);
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

      const updateVaultAllocationSig = await processTxn(env.client, env.payer, [instructions], bs58, 2500, []);

      !bs58 && console.log('Vault allocation updated:', updateVaultAllocationSig);
    });

  commands.command('get-oracle-mappings').action(async () => {
    const env = initializeClient(false, false);
    const kaminoManager = new KaminoManager(env.provider.connection, env.kLendProgramId, env.kVaultProgramId);

    console.log('Getting  oracle mappings');
    const oracleConfigs = await kaminoManager.getScopeOracleConfigs();
    console.log('oracleConfigs', JSON.parse(JSON.stringify(oracleConfigs)));
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

function initializeClient(bs58: boolean, staging: boolean): Env {
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

  !bs58 && console.log('\nSettings ⚙️');
  !bs58 && console.log('Admin:', admin);
  !bs58 && console.log('Rpc:', rpc);
  !bs58 && console.log('kLendProgramId:', kLendProgramId);
  !bs58 && console.log('kVaultProgramId:', kVaultProgramId);

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
    kLendProgramId: args.kLendProgramId,
    kVaultProgramId: args.kVaultProgramId,
  };
}

export type Env = {
  provider: anchor.AnchorProvider;
  payer: Keypair;
  client: Web3Client;
  kLendProgramId: PublicKey;
  kVaultProgramId: PublicKey;
};

async function processTxn(
  web3Client: Web3Client,
  admin: Keypair,
  ixns: TransactionInstruction[],
  bs58: boolean,
  priorityFeeMultiplier: number = 2500,
  extraSigners: Signer[]
): Promise<TransactionSignature> {
  if (bs58) {
    const { blockhash } = await web3Client.connection.getLatestBlockhash();
    const txn = new Transaction();
    txn.add(...ixns);
    txn.recentBlockhash = blockhash;
    txn.feePayer = admin.publicKey;

    console.log(binary_to_base58(txn.serializeMessage()));

    return '';
  } else {
    const microLamport = 10 ** 6; // 1 lamport
    const computeUnits = 200_000;
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
    loanToValuePct: farmConfigFromFile.loan_to_value_pct,
    liquidationThresholdPct: farmConfigFromFile.liquidation_threshold_pct,
    minLiquidationBonusBps: farmConfigFromFile.min_liquidation_bonus_bps,
    protocolLiquidationFeePct: farmConfigFromFile,
    protocolTakeRatePct: farmConfigFromFile.protocol_liquidation_fee_pct,
    assetTier: farmConfigFromFile.asset_tier,
    multiplierSideBoost: farmConfigFromFile.multiplier_side_boost,
    maxLiquidationBonusBps: farmConfigFromFile.max_liquidation_bonus_bps,
    badDebtLiquidationBonusBps: farmConfigFromFile.bad_debt_liquidation_bonus_bps,
    fees: {
      borrowFeeSf: Fraction.fromDecimal(new Decimal(farmConfigFromFile.fees.borrow_fee)).valueSf,
      flashLoanFeeSf: Fraction.fromDecimal(new Decimal(farmConfigFromFile.fees.flash_loan_fee)).valueSf,
      padding: Array(6).fill(0),
    },
    depositLimit: new BN(farmConfigFromFile.deposit_limit),
    borrowLimit: new BN(farmConfigFromFile.borrow_limit),
    tokenInfo: {
      name: encodeTokenName(farmConfigFromFile.token_info.name),
      heuristic: new PriceHeuristic({
        lower: new BN(farmConfigFromFile.token_info.heuristic.lower),
        upper: new BN(farmConfigFromFile.token_info.heuristic.upper),
        exp: new BN(farmConfigFromFile.token_info.heuristic.exp),
      }),
      maxTwapDivergenceBps: new BN(farmConfigFromFile.token_info.max_twap_divergence_bps),
      maxAgePriceSeconds: new BN(farmConfigFromFile.token_info.max_age_price_seconds),
      maxAgeTwapSeconds: new BN(farmConfigFromFile.token_info.max_age_twap_seconds),
      ...parseOracleConfiguration(farmConfigFromFile),
      padding: Array(20).fill(new BN(0)),
    } as TokenInfo,
    borrowRateCurve: parseBorrowRateCurve(farmConfigFromFile),
    depositWithdrawalCap: new WithdrawalCaps({
      configCapacity: new BN(farmConfigFromFile.deposit_withdrawal_cap.config_capacity),
      currentTotal: new BN(0),
      lastIntervalStartTimestamp: new BN(0),
      configIntervalLengthSeconds: new BN(farmConfigFromFile.deposit_withdrawal_cap.config_interval_length_seconds),
    }),
    debtWithdrawalCap: new WithdrawalCaps({
      configCapacity: new BN(farmConfigFromFile.debt_withdrawal_cap.config_capacity),
      currentTotal: new BN(0),
      lastIntervalStartTimestamp: new BN(0),
      configIntervalLengthSeconds: new BN(farmConfigFromFile.debt_withdrawal_cap.config_interval_length_seconds),
    }),
    deleveragingMarginCallPeriodSecs: new BN(farmConfigFromFile.deleveraging_margin_call_period_secs),
    borrowFactorPct: new BN(farmConfigFromFile.borrow_factor_pct),
    elevationGroups: farmConfigFromFile.elevation_groups,
    deleveragingThresholdSlotsPerBps: new BN(farmConfigFromFile.deleveraging_threshold_slots_per_bps),
    multiplierTagBoost: farmConfigFromFile.multiplier_tag_boost,
    disableUsageAsCollOutsideEmode: farmConfigFromFile.disable_usage_as_coll_outside_emode,
    utilizationLimitBlockBorrowingAbove: farmConfigFromFile.utilization_limit_block_borrowing_above,
    hostFixedInterestRateBps: farmConfigFromFile.host_fixed_interest_rate_bps,
    borrowLimitOutsideElevationGroup: farmConfigFromFile.borrow_limit_outside_elevation_group,
    borrowLimitAgainstThisCollateralInElevationGroup: parseReserveBorrowLimitAgainstCollInEmode(farmConfigFromFile),
    reserved1: Array(2).fill(0),
  };

  return new ReserveConfig(reserveConfigFields);
}

function parseOracleConfiguration(farmConfigFromFile: any): {
  pythConfiguration: PythConfiguration;
  switchboardConfiguration: SwitchboardConfiguration;
  scopeConfiguration: ScopeConfiguration;
} {
  const pythConfiguration = new PythConfiguration({
    price: new PublicKey(farmConfigFromFile.token_info.pyth_configuration.price),
  });
  const switchboardConfiguration = new SwitchboardConfiguration({
    priceAggregator: new PublicKey(farmConfigFromFile.token_info.switchboard_configuration.price_aggregator),
    twapAggregator: new PublicKey(farmConfigFromFile.token_info.switchboard_configuration.twap_aggregator),
  });
  const priceChain = [65535, 65535, 65535, 65535];
  const twapChain = [65535, 65535, 65535, 65535];

  const priceChainFromFile: number[] = farmConfigFromFile.token_info.scope_configuration.price_chain;
  const twapChainFromFile: number[] = farmConfigFromFile.token_info.scope_configuration.twap_chain;

  priceChainFromFile.forEach((value, index) => (priceChain[index] = value));
  twapChainFromFile.forEach((value, index) => (twapChain[index] = value));

  const scopeConfiguration = new ScopeConfiguration({
    priceFeed: new PublicKey(farmConfigFromFile.token_info.scope_configuration.price_feed),
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

  farmConfigFromFile.borrow_rate_curve.forEach((curvePoint: { utilization_rate_bps: any; borrow_rate_bps: any }) =>
    curvePoints.push({
      utilizationRateBps: curvePoint.utilization_rate_bps,
      borrowRateBps: curvePoint.borrow_rate_bps,
    })
  );

  const finalCruvePoints: CurvePointFields[] = Array(11).fill(curvePoints[curvePoints.length - 1]);

  curvePoints.forEach((curvePoint, index) => (finalCruvePoints[index] = curvePoint));

  const borrowRateCurve = new BorrowRateCurve({ points: finalCruvePoints });

  return borrowRateCurve;
}

function parseReserveBorrowLimitAgainstCollInEmode(farmConfigFromFile: any): BN[] {
  const reserveBorrowLimitAgainstCollInEmode = Array(32).fill(new BN(0));

  farmConfigFromFile.reserve_borrow_limit_against_coll_in_emode.forEach(
    (limit: any, index: number) => (reserveBorrowLimitAgainstCollInEmode[index] = new BN(limit))
  );

  return reserveBorrowLimitAgainstCollInEmode;
}
