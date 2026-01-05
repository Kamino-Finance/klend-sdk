import { Command } from 'commander';
import {
  DEFAULT_RECENT_SLOT_DURATION_MS,
  KaminoMarket,
  KaminoObligation,
  getProgramId,
  toJson,
  getAllObligationAccounts,
  getAllLendingMarketAccounts,
  KaminoManager,
  DEFAULT_PUBLIC_KEY,
} from '../lib';
import { address, Base58EncodedBytes } from '@solana/kit';
import BN from 'bn.js';
import { getMedianSlotDurationInMsFromLastEpochs, parseTokenSymbol } from '../classes/utils';
import { initEnv, SendTxMode } from './tx/CliEnv';
import { getMarket } from './services/market';
import { withdraw } from './commands/withdraw';
import { repay } from './commands/repay';
import { deposit } from './commands/deposit';
import { borrow } from './commands/borrow';
import { downloadUserMetadatasWithFilter } from './services/userMetadata';
import { initFarmsForReserve } from './commands/initFarmsForReserve';
import { printReserve } from './commands/printReserve';
import { printAllReserveAccounts } from './commands/printAllReserveAccounts';

async function main() {
  const commands = new Command();

  commands.name('klend-cli').description('CLI to interact with the klend program');

  commands
    .command('print-borrow-rate')
    .option(`--url <string>`, 'The admin keypair file')
    .option(`--token <string>`, 'The token symbol')
    .option(`--cluster <string>`, 'staging or mainnet-beta')
    .action(async ({ url, token, cluster }) => {
      const env = await initEnv(url);

      const programId = getProgramId(cluster);
      const kaminoMarket = await getMarket(env.c.rpc, programId);

      const reserve = kaminoMarket.getReserveBySymbol(token);

      const slot = await env.c.rpc.getSlot().send();

      const borrowApr = reserve!.calculateBorrowAPR(slot, kaminoMarket.state.referralFeeBps);
      const utilizationRatio = reserve!.calculateUtilizationRatio();

      console.log(
        `Reserve: ${parseTokenSymbol(
          reserve!.state.config.tokenInfo.name
        )} Borrow Rate: ${borrowApr} Utilization Ratio: ${utilizationRatio}`
      );
    });

  commands
    .command('print-all-lending-market-accounts')
    .option(`--rpc <string>`, 'The RPC URL')
    .action(async ({ rpc }) => {
      const env = await initEnv(rpc);
      let count = 0;
      for await (const [address, lendingMarketAccount] of getAllLendingMarketAccounts(env.c.rpc)) {
        count++;
        console.log(
          address.toString(),
          lendingMarketAccount.riskCouncil.toString(),
          lendingMarketAccount.autodeleverageEnabled,
          lendingMarketAccount.individualAutodeleverageMarginCallPeriodSecs.toString()
        );
      }
      console.log(`Total lending markets: ${count}`);
    });

  commands
    .command('print-all-markets-lite')
    .option(`--rpc <string>`, 'The RPC URL')
    .action(async ({ rpc }) => {
      const startTime = Date.now();
      const env = await initEnv(rpc);

      const slotDuration = await getMedianSlotDurationInMsFromLastEpochs();
      const kaminoManager = new KaminoManager(env.c.rpc, slotDuration);
      const allMarkets = await kaminoManager.getAllMarkets();
      for (const market of allMarkets) {
        console.log(
          `Market: ${market.getName()} Address: ${
            market.address
          } Deposit TVL: ${market.getTotalDepositTVL()} Borrow TVL: ${market.getTotalBorrowTVL()} TVL: ${market
            .getTotalDepositTVL()
            .minus(market.getTotalBorrowTVL())}`
        );
      }

      const duration = Date.now() - startTime;
      console.log(`Execution duration: ${duration}ms`);
    });

  commands
    .command('print-obligation')
    .option(`--rpc <string>`, 'The rpc url')
    .option(`--cluster <string>`, 'staging or mainnet-beta')
    .option(`--obligation <string>`, 'The obligation id')
    .action(async ({ rpc, cluster, obligation }) => {
      const env = await initEnv(rpc);
      const kaminoMarket = await getMarket(env.c.rpc, cluster);
      const kaminoObligation = await KaminoObligation.load(kaminoMarket, address(obligation));
      console.log(toJson(kaminoObligation?.refreshedStats));
    });

  commands
    .command('print-all-obligation-accounts')
    .option(`--rpc <string>`, 'The RPC URL')
    .action(async ({ rpc }) => {
      const env = await initEnv(rpc);
      let count = 0;
      for await (const [address, obligationAccount] of getAllObligationAccounts(env.c.rpc)) {
        count++;
        if (
          obligationAccount.autodeleverageTargetLtvPct > 0 ||
          obligationAccount.autodeleverageMarginCallStartedTimestamp.toNumber() > 0
        ) {
          console.log(address.toString(), toJson(obligationAccount.toJSON()));
        }
      }
      console.log(`Total obligations: ${count}`);
    });

  commands
    .command('print-reserve')
    .option(`--url <string>`, 'The admin keypair file')
    .option(`--reserve <string>`, 'Reserve address')
    .option(`--symbol <string>`, 'Symbol (optional)')
    .action(async ({ url, reserve, symbol }) => {
      const env = await initEnv(url);
      await printReserve(env.c.rpc, reserve, symbol);
    });

  commands
    .command('print-all-reserve-accounts')
    .option(`--rpc <string>`, 'The RPC URL')
    .action(async ({ rpc }) => {
      const env = await initEnv(rpc);
      await printAllReserveAccounts(env.c.rpc);
    });

  commands
    .command('deposit')
    .option(`--url <string>`, 'Custom RPC URL')
    .option(`--owner <string>`, 'Custom RPC URL')
    .option(`--token <string>`, 'Custom RPC URL')
    .option(`--amount <string>`, 'Custom RPC URL')
    .action(async ({ url, owner, token, amount }) => {
      const depositAmount = new BN(amount);
      const env = await initEnv(url, owner);
      await deposit(env, 'execute', token, depositAmount);
    });

  commands
    .command('withdraw')
    .option(`--url <string>`, 'Custom RPC URL')
    .option(`--owner <string>`, 'Custom RPC URL')
    .option(`--token <string>`, 'Custom RPC URL')
    .option(`--amount <string>`, 'Custom RPC URL')
    .action(async ({ url, owner, token, amount }) => {
      const withdrawAmount = new BN(amount);
      const env = await initEnv(url, owner);
      await withdraw(env, 'execute', token, withdrawAmount);
    });

  commands
    .command('borrow')
    .option(`--url <string>`, 'Custom RPC URL')
    .option(`--owner <string>`, 'Custom RPC URL')
    .option(`--token <string>`, 'Custom RPC URL')
    .option(`--amount <string>`, 'Custom RPC URL')
    .action(async ({ url, owner, token, amount }) => {
      const borrowAmount = new BN(amount);
      const env = await initEnv(url, owner);
      await borrow(env, 'execute', token, borrowAmount);
    });

  commands
    .command('repay')
    .option(`--url <string>`, 'Custom RPC URL')
    .option(`--owner <string>`, 'Custom RPC URL')
    .option(`--token <string>`, 'Custom RPC URL')
    .option(`--amount <string>`, 'Custom RPC URL')
    .action(async ({ url, owner, token, amount }) => {
      const repayAmount = new BN(amount);
      const env = await initEnv(url, owner);
      await repay(env, 'execute', token, repayAmount);
    });

  commands
    .command('init-farms-for-reserve')
    .option(`--cluster <string>`, 'Custom RPC URL')
    .option(`--owner <string>`, 'Owner keypair file')
    .option(`--reserve <string>`, 'Reserve pubkey')
    .option(`--farms-global-config <string>`, 'Reserve pubkey')
    .option(`--kind <string>`, '`Debt` or `Collateral`')
    .option(`--multisig`, 'Whether to use multisig or not -> prints bs58 txn')
    .option(`--simulate`, 'Whether to simulate the transaction or not')
    .action(async ({ cluster, owner, reserve, farmsGlobalConfig, kind, multisig, simulate }) => {
      const env = await initEnv(cluster, owner, multisig, {
        farmsGlobalConfig,
      });
      const mode: SendTxMode = simulate ? 'simulate' : multisig ? 'multisig' : 'execute';
      await initFarmsForReserve(env, mode, address(reserve), kind);
    });

  commands
    .command('download-user-metadatas-without-lut')
    .option(`--cluster <string>`, 'Custom RPC URL')
    .option(`--program <string>`, 'Program pubkey')
    .option(`--output <string>`, 'Output file path - will print to stdout if not provided')
    .action(async ({ cluster, program, output }) => {
      const env = await initEnv(cluster);
      await downloadUserMetadatasWithFilter(
        env.c,
        [
          {
            memcmp: {
              offset: 48n,
              bytes: DEFAULT_PUBLIC_KEY.toString() as Base58EncodedBytes,
              encoding: 'base58',
            },
          },
        ],
        output,
        address(program)
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
        env.c,
        [
          {
            memcmp: {
              offset: 80n,
              bytes: DEFAULT_PUBLIC_KEY.toString() as Base58EncodedBytes,
              encoding: 'base58',
            },
          },
        ],
        output,
        address(program)
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
        env.c,
        [
          {
            memcmp: {
              offset: 80n,
              bytes: DEFAULT_PUBLIC_KEY.toString() as Base58EncodedBytes,
              encoding: 'base58',
            },
          },
          {
            memcmp: {
              offset: 48n,
              bytes: DEFAULT_PUBLIC_KEY.toString() as Base58EncodedBytes,
              encoding: 'base58',
            },
          },
        ],
        output,
        address(program)
      );
    });

  commands
    .command('get-user-obligation-for-reserve')
    .option(`--cluster <string>`, 'Custom RPC URL')
    .option(`--program <string>`, 'Program pubkey')
    .option(`--lending-market <string>`, 'Lending market to fetch for')
    .option(`--user <string>`, 'User address to fetch for')
    .option(`--reserve <string>`, 'Reserve to fetch for')
    .action(async ({ cluster, program, lendingMarket, user, reserve }) => {
      const env = await initEnv(cluster);
      const programId = address(program);
      const marketAddress = address(lendingMarket);
      const kaminoMarket = await KaminoMarket.load(
        env.c.rpc,
        marketAddress,
        DEFAULT_RECENT_SLOT_DURATION_MS,
        programId
      );

      const obligations = await kaminoMarket!.getAllUserObligationsForReserve(address(user), address(reserve));

      for (const obligation of obligations) {
        console.log('obligation address: ', obligation.obligationAddress.toString());
      }
    });

  commands
    .command('get-user-vanilla-obligation-for-reserve')
    .option(`--cluster <string>`, 'Custom RPC URL')
    .option(`--program <string>`, 'Program pubkey')
    .option(`--lending-market <string>`, 'Lending market to fetch for')
    .option(`--user <string>`, 'User address to fetch for')
    .action(async ({ cluster, program, lendingMarket, user }) => {
      const env = await initEnv(cluster);
      const programId = address(program);
      const marketAddress = address(lendingMarket);
      const kaminoMarket = await KaminoMarket.load(
        env.c.rpc,
        marketAddress,
        DEFAULT_RECENT_SLOT_DURATION_MS,
        programId
      );

      const obligation = await kaminoMarket!.getUserVanillaObligation(address(user));

      console.log('obligation address: ', obligation ? obligation?.obligationAddress.toString() : 'null');
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
