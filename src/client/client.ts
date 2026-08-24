import dotenv from 'dotenv';
import { Command } from 'commander';
import {
  KaminoMarket,
  KaminoObligation,
  toJson,
  getAllObligationAccounts,
  getAllLendingMarketAccounts,
  KaminoManager,
  DEFAULT_PUBLIC_KEY,
  getCurrentLedgerInstant,
} from '../lib';
import { address, Base58EncodedBytes } from '@solana/kit';
import BN from 'bn.js';
import { LendingMarket } from '../@codegen/klend/accounts';
import { getMedianSlotDurationInMsFromLastEpochs, parseTokenSymbol } from '../classes/utils';
import { initEnv, parseEnv, SendTxMode } from './tx/CliEnv';
import { getMarket } from './services/market';
import { withdraw } from './commands/withdraw';
import { repay } from './commands/repay';
import { deposit } from './commands/deposit';
import { borrow } from './commands/borrow';
import { downloadUserMetadatasWithFilter } from './services/userMetadata';
import { initFarmsForReserve } from './commands/initFarmsForReserve';
import { printReserve } from './commands/printReserve';
import { printAllReserveAccounts } from './commands/printAllReserveAccounts';
import { processTx } from './tx/processor';

dotenv.config({
  path: `.env${process.env.ENV ? '.' + process.env.ENV : ''}`,
});

async function main() {
  const commands = new Command();

  commands.name('klend-cli').description('CLI to interact with the klend program');

  commands
    .command('print-borrow-rate')
    .option(`--rpc <string>`, 'Custom RPC URL')
    .requiredOption(`--reserveAddress <string>`, 'The reserve address')
    .requiredOption(`--market <string>`, 'The lending market address')
    .option(`--env <string>`, 'Environment: mainnet-beta (default), staging, devnet')
    .action(async ({ rpc, reserveAddress, market, env: envFlag }) => {
      const env = await initEnv(parseEnv(envFlag), undefined, false, undefined, rpc);
      const kaminoMarket = await getMarket(
        env.c.rpc,
        address(market),
        env.klendProgramId,
        await getMedianSlotDurationInMsFromLastEpochs()
      );

      const reserve = kaminoMarket.getReserveByAddress(address(reserveAddress));

      const currentLedgerInstant = await getCurrentLedgerInstant(env.c.rpc);

      const borrowApr = reserve!.calculateBorrowAPR(currentLedgerInstant, kaminoMarket.state.referralFeeBps);
      const utilizationRatio = reserve!.calculateUtilizationRatio();

      console.log(
        `Reserve: ${parseTokenSymbol(
          reserve!.state.config.tokenInfo.name
        )} Borrow Rate: ${borrowApr} Utilization Ratio: ${utilizationRatio}`
      );
    });

  commands
    .command('print-all-lending-market-accounts')
    .option(`--rpc <string>`, 'Custom RPC URL')
    .option(`--env <string>`, 'Environment: mainnet-beta (default), staging, devnet')
    .action(async ({ rpc, env: envFlag }) => {
      const env = await initEnv(parseEnv(envFlag), undefined, false, undefined, rpc);
      let count = 0;
      for await (const [address, lendingMarketAccount] of getAllLendingMarketAccounts(env.c.rpc, env.klendProgramId)) {
        count++;
        console.log(
          address.toString(),
          lendingMarketAccount.emergencyCouncil.toString(),
          lendingMarketAccount.autodeleverageEnabled,
          lendingMarketAccount.individualAutodeleverageMarginCallPeriodSecs.toString()
        );
      }
      console.log(`Total lending markets: ${count}`);
    });

  commands
    .command('print-all-markets-lite')
    .option(`--rpc <string>`, 'Custom RPC URL')
    .option(`--env <string>`, 'Environment: mainnet-beta (default), staging, devnet')
    .action(async ({ rpc, env: envFlag }) => {
      const startTime = Date.now();
      const env = await initEnv(parseEnv(envFlag), undefined, false, undefined, rpc);

      const slotDuration = await getMedianSlotDurationInMsFromLastEpochs();
      const kaminoManager = new KaminoManager(
        env.c.rpc,
        slotDuration,
        env.klendProgramId,
        undefined,
        undefined,
        env.farmsProgramId
      );
      const allMarkets = await kaminoManager.getAllMarkets(env.klendProgramId);
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
    .option(`--rpc <string>`, 'Custom RPC URL')
    .requiredOption(`--market <string>`, 'The lending market address')
    .requiredOption(`--obligation <string>`, 'The obligation id')
    .option(`--env <string>`, 'Environment: mainnet-beta (default), staging, devnet')
    .action(async ({ rpc, market, obligation, env: envFlag }) => {
      const env = await initEnv(parseEnv(envFlag), undefined, false, undefined, rpc);
      const kaminoMarket = await getMarket(
        env.c.rpc,
        address(market),
        env.klendProgramId,
        await getMedianSlotDurationInMsFromLastEpochs()
      );
      const kaminoObligation = await KaminoObligation.load(kaminoMarket, address(obligation));
      console.log(toJson(kaminoObligation?.refreshedStats));
    });

  commands
    .command('print-all-obligation-accounts')
    .option(`--rpc <string>`, 'Custom RPC URL')
    .option(`--env <string>`, 'Environment: mainnet-beta (default), staging, devnet')
    .action(async ({ rpc, env: envFlag }) => {
      const env = await initEnv(parseEnv(envFlag), undefined, false, undefined, rpc);
      let count = 0;
      for await (const [address, obligationAccount] of getAllObligationAccounts(env.c.rpc, env.klendProgramId)) {
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
    .option(`--rpc <string>`, 'Custom RPC URL')
    .requiredOption(`--market <string>`, 'The lending market address')
    .option(`--reserve <string>`, 'Reserve address')
    .requiredOption(`--reserve <string>`, 'Reserve address')
    .option(`--env <string>`, 'Environment: mainnet-beta (default), staging, devnet')
    .action(async ({ rpc, market, reserve, env: envFlag }) => {
      const env = await initEnv(parseEnv(envFlag), undefined, false, undefined, rpc);
      await printReserve(env.c.rpc, address(market), env.klendProgramId, reserve);
    });

  commands
    .command('print-all-reserve-accounts')
    .option(`--rpc <string>`, 'Custom RPC URL')
    .option(`--env <string>`, 'Environment: mainnet-beta (default), staging, devnet')
    .action(async ({ rpc, env: envFlag }) => {
      const env = await initEnv(parseEnv(envFlag), undefined, false, undefined, rpc);
      await printAllReserveAccounts(env.c.rpc, env.klendProgramId);
    });

  commands
    .command('deposit')
    .option(`--rpc <string>`, 'Custom RPC URL')
    .requiredOption(`--owner <string>`, 'Owner keypair file')
    .requiredOption(`--reserveAddress <string>`, 'Reserve address')
    .requiredOption(`--amount <string>`, 'Amount to deposit')
    .requiredOption(`--market <string>`, 'The lending market address')
    .option(`--env <string>`, 'Environment: mainnet-beta (default), staging, devnet')
    .action(async ({ rpc, owner, reserveAddress, amount, market, env: envFlag }) => {
      const depositAmount = new BN(amount);
      const env = await initEnv(parseEnv(envFlag), owner, false, undefined, rpc);
      await deposit(env, 'execute', reserveAddress, depositAmount, address(market));
    });

  commands
    .command('withdraw')
    .option(`--rpc <string>`, 'Custom RPC URL')
    .requiredOption(`--owner <string>`, 'Owner keypair file')
    .requiredOption(`--reserveAddress <string>`, 'Reserve address')
    .requiredOption(`--amount <string>`, 'Amount to withdraw')
    .requiredOption(`--market <string>`, 'The lending market address')
    .option(`--env <string>`, 'Environment: mainnet-beta (default), staging, devnet')
    .action(async ({ rpc, owner, reserveAddress, amount, market, env: envFlag }) => {
      const withdrawAmount = new BN(amount);
      const env = await initEnv(parseEnv(envFlag), owner, false, undefined, rpc);
      await withdraw(env, 'execute', reserveAddress, withdrawAmount, address(market));
    });

  commands
    .command('borrow')
    .option(`--rpc <string>`, 'Custom RPC URL')
    .requiredOption(`--owner <string>`, 'Owner keypair file')
    .requiredOption(`--reserveAddress <string>`, 'Reserve address')
    .requiredOption(`--amount <string>`, 'Amount to borrow')
    .requiredOption(`--market <string>`, 'The lending market address')
    .option(`--env <string>`, 'Environment: mainnet-beta (default), staging, devnet')
    .action(async ({ rpc, owner, reserveAddress, amount, market, env: envFlag }) => {
      const borrowAmount = new BN(amount);
      const env = await initEnv(parseEnv(envFlag), owner, false, undefined, rpc);
      await borrow(env, 'execute', reserveAddress, borrowAmount, address(market));
    });

  commands
    .command('repay')
    .option(`--rpc <string>`, 'Custom RPC URL')
    .requiredOption(`--owner <string>`, 'Owner keypair file')
    .requiredOption(`--reserveAddress <string>`, 'Reserve address')
    .requiredOption(`--amount <string>`, 'Amount to repay')
    .requiredOption(`--market <string>`, 'The lending market address')
    .option(`--env <string>`, 'Environment: mainnet-beta (default), staging, devnet')
    .action(async ({ rpc, owner, reserveAddress, amount, market, env: envFlag }) => {
      const repayAmount = new BN(amount);
      const env = await initEnv(parseEnv(envFlag), owner, false, undefined, rpc);
      await repay(env, 'execute', reserveAddress, repayAmount, address(market));
    });

  commands
    .command('init-farms-for-reserve')
    .option(`--rpc <string>`, 'Custom RPC URL')
    .requiredOption(`--owner <string>`, 'Owner keypair file')
    .requiredOption(`--reserve <string>`, 'Reserve pubkey')
    .option(`--farms-global-config <string>`, 'Farms global config pubkey (defaults based on --env)')
    .requiredOption(`--kind <string>`, '`Debt` or `Collateral`')
    .option(`--multisig`, 'Whether to use multisig or not -> prints bs58 txn')
    .option(`--simulate`, 'Whether to simulate the transaction or not')
    .option(`--env <string>`, 'Environment: mainnet-beta (default), staging, devnet')
    .action(async ({ rpc, owner, reserve, farmsGlobalConfig, kind, multisig, simulate, env: envFlag }) => {
      const env = await initEnv(
        parseEnv(envFlag),
        owner,
        multisig,
        {
          farmsGlobalConfig: farmsGlobalConfig ? address(farmsGlobalConfig) : undefined,
        },
        rpc
      );
      const mode: SendTxMode = simulate ? 'simulate' : multisig ? 'multisig' : 'execute';
      await initFarmsForReserve(env, mode, address(reserve), kind);
    });

  commands
    .command('download-user-metadatas-without-lut')
    .option(`--rpc <string>`, 'Custom RPC URL')
    .option(`--program <string>`, 'Program pubkey')
    .option(`--output <string>`, 'Output file path - will print to stdout if not provided')
    .option(`--env <string>`, 'Environment: mainnet-beta (default), staging, devnet')
    .action(async ({ rpc, program, output, env: envFlag }) => {
      const env = await initEnv(parseEnv(envFlag), undefined, false, undefined, rpc);
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
        program ? address(program) : env.klendProgramId
      );
    });

  commands
    .command('download-user-metadatas-without-owner')
    .option(`--rpc <string>`, 'Custom RPC URL')
    .option(`--program <string>`, 'Program pubkey')
    .option(`--output <string>`, 'Output file path - will print to stdout if not provided')
    .option(`--env <string>`, 'Environment: mainnet-beta (default), staging, devnet')
    .action(async ({ rpc, program, output, env: envFlag }) => {
      const env = await initEnv(parseEnv(envFlag), undefined, false, undefined, rpc);
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
        program ? address(program) : env.klendProgramId
      );
    });

  commands
    .command('download-user-metadatas-without-owner-and-lut')
    .option(`--rpc <string>`, 'Custom RPC URL')
    .option(`--program <string>`, 'Program pubkey')
    .option(`--output <string>`, 'Output file path - will print to stdout if not provided')
    .option(`--env <string>`, 'Environment: mainnet-beta (default), staging, devnet')
    .action(async ({ rpc, program, output, env: envFlag }) => {
      const env = await initEnv(parseEnv(envFlag), undefined, false, undefined, rpc);
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
        program ? address(program) : env.klendProgramId
      );
    });

  commands
    .command('get-user-obligation-for-reserve')
    .option(`--rpc <string>`, 'Custom RPC URL')
    .option(`--program <string>`, 'Program pubkey (overrides --env)')
    .requiredOption(`--lending-market <string>`, 'Lending market to fetch for')
    .requiredOption(`--user <string>`, 'User address to fetch for')
    .requiredOption(`--reserve <string>`, 'Reserve to fetch for')
    .option(`--env <string>`, 'Environment: mainnet-beta (default), staging, devnet')
    .action(async ({ rpc, program, lendingMarket, user, reserve, env: envFlag }) => {
      const env = await initEnv(parseEnv(envFlag), undefined, false, undefined, rpc);
      const programId = program ? address(program) : env.klendProgramId;
      const marketAddress = address(lendingMarket);
      const kaminoMarket = await KaminoMarket.load(
        env.c.rpc,
        marketAddress,
        await getMedianSlotDurationInMsFromLastEpochs(),
        programId
      );

      const currentLedgerInstant = await getCurrentLedgerInstant(env.c.rpc);
      const obligations = await kaminoMarket!.getAllUserObligationsForReserve(
        address(user),
        address(reserve),
        currentLedgerInstant
      );

      for (const obligation of obligations) {
        console.log('obligation address: ', obligation.obligationAddress.toString());
      }
    });

  commands
    .command('get-user-vanilla-obligation-for-reserve')
    .option(`--rpc <string>`, 'Custom RPC URL')
    .option(`--program <string>`, 'Program pubkey (overrides --env)')
    .requiredOption(`--lending-market <string>`, 'Lending market to fetch for')
    .requiredOption(`--user <string>`, 'User address to fetch for')
    .option(`--env <string>`, 'Environment: mainnet-beta (default), staging, devnet')
    .action(async ({ rpc, program, lendingMarket, user, env: envFlag }) => {
      const env = await initEnv(parseEnv(envFlag), undefined, false, undefined, rpc);
      const programId = program ? address(program) : env.klendProgramId;
      const marketAddress = address(lendingMarket);
      const kaminoMarket = await KaminoMarket.load(
        env.c.rpc,
        marketAddress,
        await getMedianSlotDurationInMsFromLastEpochs(),
        programId
      );

      const obligation = await kaminoMarket!.getUserVanillaObligation(address(user));

      console.log('obligation address: ', obligation ? obligation?.obligationAddress.toString() : 'null');
    });

  commands
    .command('update-borrow-order-flags')
    .option(`--rpc <string>`, 'Custom RPC URL')
    .requiredOption(`--owner <string>`, 'Owner keypair file')
    .requiredOption(`--market <string>`, 'The lending market address')
    .requiredOption(`--enabled <boolean>`, 'Enable or disable borrow orders (true/false)', (v) => v === 'true')
    .option(`--min-bo-fill-value <string>`, 'Minimum borrow order fill value (u64)')
    .option(`--multisig`, 'Whether to use multisig or not -> prints bs58 txn')
    .option(`--simulate`, 'Whether to simulate the transaction or not')
    .option(`--env <string>`, 'Environment: mainnet-beta (default), staging, devnet')
    .action(async ({ rpc, owner, market, enabled, minBoFillValue, multisig, simulate, env: envFlag }) => {
      const env = await initEnv(parseEnv(envFlag), owner, multisig, undefined, rpc);
      const kaminoMarket = await getMarket(
        env.c.rpc,
        address(market),
        env.klendProgramId,
        await getMedianSlotDurationInMsFromLastEpochs()
      );
      const signer = await env.getSigner(kaminoMarket);
      const mode: SendTxMode = simulate ? 'simulate' : multisig ? 'multisig' : 'execute';
      const enabledValue = enabled ? 1 : 0;
      const newMarket = new LendingMarket({
        ...kaminoMarket.state,
        borrowOrderCreationEnabled: enabledValue,
        borrowOrderExecutionEnabled: enabledValue,
        ...(minBoFillValue !== undefined && { minBorrowOrderFillValue: new BN(minBoFillValue) }),
      });
      const kaminoManager = new KaminoManager(
        env.c.rpc,
        await getMedianSlotDurationInMsFromLastEpochs(),
        env.klendProgramId
      );
      const ixs = kaminoManager.updateLendingMarketIxs(
        signer,
        { address: kaminoMarket.address, state: kaminoMarket.state },
        newMarket
      );

      await processTx(env.c, signer, ixs, mode);
      console.log(`Borrow order creation and execution ${enabled ? 'enabled' : 'disabled'} on market ${market}`);
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
