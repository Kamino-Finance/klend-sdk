import { Command } from 'commander';
import {
  KaminoAction,
  KaminoMarket,
  KaminoObligation,
  PROGRAM_ID,
  STAGING_PROGRAM_ID,
  getAllUserMetadatasWithFilter,
  getProgramId,
  toJson,
} from './lib';
import * as fs from 'fs';
import { Connection, GetProgramAccountsFilter, Keypair, PublicKey } from '@solana/web3.js';
import { BN } from '@coral-xyz/anchor';
import { Reserve } from './idl_codegen/accounts';
import { buildAndSendTxnWithLogs, buildVersionedTransaction } from './utils/instruction';
import { VanillaObligation } from './utils/ObligationType';
import { parseTokenSymbol } from './classes/utils';
import { Env, initEnv } from '../tests/setup_utils';
import { initializeFarmsForReserve } from '../tests/farms_operations';

const STAGING_LENDING_MARKET = new PublicKey('6WVSwDQXrBZeQVnu6hpnsRZhodaJTZBUaC334SiiBKdb');
const MAINNET_LENDING_MARKET = new PublicKey('7u3HeHxYDLhnCoErrtycNokbQYbWGzLs6JSDqGAv5PfF');

async function main() {
  const commands = new Command();

  commands.name('klend-cli').description('CLI to interact with the klend program');

  commands
    .command('print-borrow-rate')
    .option(`--url <string>`, 'The admin keypair file')
    .option(`--token <string>`, 'The token symbol')
    .option(`--cluster <string>`, 'staging or mainnet-beta')
    .action(async ({ url, token, cluster }) => {
      const connection = new Connection(url, {});

      const programId = getProgramId(cluster);
      const kaminoMarket = await getMarket(connection, programId);

      const reserve = kaminoMarket.getReserveBySymbol(token);

      const borrowApr = reserve!.calculateBorrowAPR();
      const utilizationRatio = reserve!.calculateUtilizationRatio();

      console.log(
        `Reserve: ${parseTokenSymbol(
          reserve!.state.config.tokenInfo.name
        )} Borrow Rate: ${borrowApr} Utilization Ratio: ${utilizationRatio}`
      );
    });

  commands
    .command('print-obligation')
    .option(`--rpc <string>`, 'The rpc url')
    .option(`--cluster <string>`, 'staging or mainnet-beta')
    .option(`--obligation <string>`, 'The obligation id')
    .action(async ({ rpc, cluster, obligation }) => {
      const connection = new Connection(rpc, {});
      const kaminoMarket = await getMarket(connection, cluster);
      const kaminoObligation = await KaminoObligation.load(kaminoMarket, new PublicKey(obligation));
      console.log(toJson(kaminoObligation?.refreshedStats));
    });

  commands
    .command('print-reserve')
    .option(`--url <string>`, 'The admin keypair file')
    .option(`--reserve <string>`, 'Reserve address')
    .option(`--symbol <string>`, 'Symbol (optional)')
    .action(async ({ url, reserve, symbol }) => {
      const connection = new Connection(url, {});
      await printReserve(connection, reserve, symbol);
    });

  commands
    .command('deposit')
    .option(`--url <string>`, 'Custom RPC URL')
    .option(`--owner <string>`, 'Custom RPC URL')
    .option(`--token <string>`, 'Custom RPC URL')
    .option(`--amount <string>`, 'Custom RPC URL')
    .action(async ({ url, owner, token, amount }) => {
      const wallet = parseKeypairFile(owner);
      const connection = new Connection(url, {});
      const depositAmount = new BN(amount);
      await deposit(connection, wallet, token, depositAmount);
    });

  commands
    .command('withdraw')
    .option(`--url <string>`, 'Custom RPC URL')
    .option(`--owner <string>`, 'Custom RPC URL')
    .option(`--token <string>`, 'Custom RPC URL')
    .option(`--amount <string>`, 'Custom RPC URL')
    .action(async ({ url, owner, token, amount }) => {
      const wallet = parseKeypairFile(owner);
      const connection = new Connection(url, {});
      const depositAmount = new BN(amount);
      await withdraw(connection, wallet, token, depositAmount);
    });

  commands
    .command('borrow')
    .option(`--url <string>`, 'Custom RPC URL')
    .option(`--owner <string>`, 'Custom RPC URL')
    .option(`--token <string>`, 'Custom RPC URL')
    .option(`--amount <string>`, 'Custom RPC URL')
    .action(async ({ url, owner, token, amount }) => {
      const wallet = parseKeypairFile(owner);
      const connection = new Connection(url, {});
      const borrowAmount = new BN(amount);
      await borrow(connection, wallet, token, borrowAmount);
    });

  commands
    .command('repay')
    .option(`--url <string>`, 'Custom RPC URL')
    .option(`--owner <string>`, 'Custom RPC URL')
    .option(`--token <string>`, 'Custom RPC URL')
    .option(`--amount <string>`, 'Custom RPC URL')
    .action(async ({ url, owner, token, amount }) => {
      const wallet = parseKeypairFile(owner);
      const connection = new Connection(url, {});
      const borrowAmount = new BN(amount);
      await repay(connection, wallet, token, borrowAmount);
    });

  commands
    .command('init-farms-for-reserve')
    .option(`--cluster <string>`, 'Custom RPC URL')
    .option(`--owner <string>`, 'Owner keypair file')
    .option(`--reserve <string>`, 'Reserve pubkey')
    .option(`--farms-global-config <string>`, 'Reserve pubkey')
    .option(`--kind <string>`, '`Debt` or `Collateral`')
    .option(`--multisig`, 'Wether to use multisig or not -> prints bs58 txn')
    .option(`--simulate`, 'Wether to simulate the transaction or not')
    .action(async ({ cluster, owner, reserve, farmsGlobalConfig, kind, multisig, simulate }) => {
      const admin = parseKeypairFile(owner);
      const env = await initEnv(cluster, admin);
      await initFarmsForReserveCommand(env, reserve, kind, farmsGlobalConfig, multisig, simulate);
    });

  commands
    .command('download-user-metadatas-without-lut')
    .option(`--cluster <string>`, 'Custom RPC URL')
    .option(`--program <string>`, 'Program pubkey')
    .option(`--output <string>`, 'Output file path - will print to stdout if not provided')
    .action(async ({ cluster, program, output }) => {
      const env = await initEnv(cluster);
      await downloadUserMetadatasWithFilter(
        env,
        [
          {
            memcmp: {
              offset: 48,
              bytes: PublicKey.default.toBase58(),
            },
          },
        ],
        output,
        new PublicKey(program)
      );
    });

  commands
    .command('download-user-metadatas-without-owner')
    .option(`--cluster <string>`, 'Custom RPC URL')
    .option(`--program <string>`, 'Program pubkey')
    .option(`--output <string>`, 'Output file path - will print to stdout if not provided')
    .action(async ({ cluster, program, output }) => {
      const env = await initEnv(cluster);
      await downloadUserMetadatasWithFilter(
        env,
        [
          {
            memcmp: {
              offset: 80,
              bytes: PublicKey.default.toBase58(),
            },
          },
        ],
        output,
        new PublicKey(program)
      );
    });

  commands
    .command('download-user-metadatas-without-owner-and-lut')
    .option(`--cluster <string>`, 'Custom RPC URL')
    .option(`--program <string>`, 'Program pubkey')
    .option(`--output <string>`, 'Output file path - will print to stdout if not provided')
    .action(async ({ cluster, program, output }) => {
      const env = await initEnv(cluster);
      await downloadUserMetadatasWithFilter(
        env,
        [
          {
            memcmp: {
              offset: 80,
              bytes: PublicKey.default.toBase58(),
            },
          },
          {
            memcmp: {
              offset: 48,
              bytes: PublicKey.default.toBase58(),
            },
          },
        ],
        output,
        new PublicKey(program)
      );
    });

  await commands.parseAsync();
}

async function deposit(connection: Connection, wallet: Keypair, token: string, depositAmount: BN) {
  const programId = getProgramId('staging');
  const kaminoMarket = await getMarket(connection, programId);
  const kaminoAction = await KaminoAction.buildDepositTxns(
    kaminoMarket,
    depositAmount,
    kaminoMarket.getReserveBySymbol(token)!.getLiquidityMint(),
    wallet.publicKey,
    new VanillaObligation(STAGING_LENDING_MARKET)
  );
  console.log('User obligation', kaminoAction.obligation!.obligationAddress.toString());

  const tx = await buildVersionedTransaction(connection, wallet.publicKey, [
    ...kaminoAction.setupIxs,
    ...kaminoAction.lendingIxs,
    ...kaminoAction.cleanupIxs,
  ]);

  console.log('Deposit SetupIxns:', kaminoAction.setupIxsLabels);
  console.log('Deposit LendingIxns:', kaminoAction.lendingIxsLabels);
  console.log('Deposit CleanupIxns:', kaminoAction.cleanupIxsLabels);
  await buildAndSendTxnWithLogs(connection, tx, wallet, []);
}

async function withdraw(connection: Connection, wallet: Keypair, token: string, depositAmount: BN) {
  const programId = getProgramId('staging');
  const kaminoMarket = await getMarket(connection, programId);
  const kaminoAction = await KaminoAction.buildWithdrawTxns(
    kaminoMarket,
    depositAmount,
    kaminoMarket.getReserveBySymbol(token)!.getLiquidityMint(),
    wallet.publicKey,
    new VanillaObligation(new PublicKey(STAGING_LENDING_MARKET))
  );
  console.log('User obligation', kaminoAction.obligation!.obligationAddress.toString());

  const tx = await buildVersionedTransaction(connection, wallet.publicKey, [
    ...kaminoAction.setupIxs,
    ...kaminoAction.lendingIxs,
    ...kaminoAction.cleanupIxs,
  ]);

  console.log('Withdraw SetupIxns:', kaminoAction.setupIxsLabels);
  console.log('Withdraw LendingIxns:', kaminoAction.lendingIxsLabels);
  console.log('Withdraw CleanupIxns:', kaminoAction.cleanupIxsLabels);
  await buildAndSendTxnWithLogs(connection, tx, wallet, []);
}

async function borrow(connection: Connection, wallet: Keypair, token: string, borrowAmount: BN) {
  const programId = getProgramId('staging');
  const kaminoMarket = await getMarket(connection, programId);
  const kaminoAction = await KaminoAction.buildBorrowTxns(
    kaminoMarket,
    borrowAmount,
    kaminoMarket.getReserveBySymbol(token)!.getLiquidityMint(),
    wallet.publicKey,
    new VanillaObligation(new PublicKey(STAGING_LENDING_MARKET))
  );
  console.log('User obligation', kaminoAction.obligation!.obligationAddress.toString());

  const tx = await buildVersionedTransaction(connection, wallet.publicKey, [
    ...kaminoAction.setupIxs,
    ...kaminoAction.lendingIxs,
    ...kaminoAction.cleanupIxs,
  ]);

  console.log('Borrow SetupIxns:', kaminoAction.setupIxsLabels);
  console.log('Borrow LendingIxns:', kaminoAction.lendingIxsLabels);
  console.log('Borrow CleanupIxns:', kaminoAction.cleanupIxsLabels);
  await buildAndSendTxnWithLogs(connection, tx, wallet, []);
}

async function repay(connection: Connection, wallet: Keypair, token: string, borrowAmount: BN) {
  const programId = getProgramId('staging');
  const kaminoMarket = await getMarket(connection, programId);
  const kaminoAction = await KaminoAction.buildRepayTxns(
    kaminoMarket,
    borrowAmount,
    kaminoMarket.getReserveBySymbol(token)!.getLiquidityMint(),
    wallet.publicKey,
    new VanillaObligation(new PublicKey(STAGING_LENDING_MARKET))
  );
  console.log('User obligation', kaminoAction.obligation!.obligationAddress.toString());

  const tx = await buildVersionedTransaction(connection, wallet.publicKey, [
    ...kaminoAction.setupIxs,
    ...kaminoAction.lendingIxs,
    ...kaminoAction.cleanupIxs,
  ]);

  console.log('Repay SetupIxns:', kaminoAction.setupIxsLabels);
  console.log('Repay LendingIxns:', kaminoAction.lendingIxsLabels);
  console.log('Repay CleanupIxns:', kaminoAction.cleanupIxsLabels);
  await buildAndSendTxnWithLogs(connection, tx, wallet, []);
}

async function printReserve(connection: Connection, reserve?: string, symbol?: string) {
  const programId = getProgramId('staging');
  const kaminoMarket = await getMarket(connection, programId);
  const result = reserve
    ? kaminoMarket.getReserveByAddress(new PublicKey(reserve))
    : kaminoMarket.getReserveBySymbol(symbol!);
  console.log(result);
  console.log(result?.stats?.reserveDepositLimit.toString());
}

async function initFarmsForReserveCommand(
  env: Env,
  reserve: string,
  kind: string,
  farmsGlobalConfig: string,
  multisig: boolean,
  simulate: boolean,
  programId: PublicKey = PROGRAM_ID
) {
  const reserveState = await Reserve.fetch(env.provider.connection, new PublicKey(reserve), programId);
  await initializeFarmsForReserve(
    env,
    reserveState!!.lendingMarket,
    new PublicKey(reserve),
    kind,
    multisig,
    simulate,
    farmsGlobalConfig
  );
}

async function getMarket(connection: Connection, programId: PublicKey) {
  let marketAddress: PublicKey;
  if (programId.equals(STAGING_PROGRAM_ID)) {
    marketAddress = STAGING_LENDING_MARKET;
  } else if (programId.equals(PROGRAM_ID)) {
    marketAddress = MAINNET_LENDING_MARKET;
  } else {
    throw new Error(`Unknown program id: ${programId.toString()}`);
  }
  const kaminoMarket = await KaminoMarket.load(connection, marketAddress, programId);
  if (kaminoMarket === null) {
    throw new Error(`${programId.toString()} Kamino market ${marketAddress.toBase58()} not found`);
  }
  return kaminoMarket;
}

async function downloadUserMetadatasWithFilter(
  env: Env,
  filter: GetProgramAccountsFilter[],
  output: string,
  programId: PublicKey
) {
  const userMetadatas = await getAllUserMetadatasWithFilter(env.provider.connection, filter, programId);

  // help mapping
  const userPubkeys = userMetadatas.map((userMetadatas) => userMetadatas.address.toString());

  if (output) {
    fs.writeFileSync(output, JSON.stringify(userPubkeys, null, 2));
  } else {
    for (const userPubkey of userPubkeys) {
      console.log(userPubkey);
    }
  }
  console.log('Total of ' + userPubkeys.length + ' userMetadatas filtered');
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
