import {
  MultiplyObligation,
  PROGRAM_ID,
  buildAndSendTxn,
  buildAndSendTxnWithLogs,
  getComputeBudgetAndPriorityFeeIxs,
  getUserLutAddressAndSetupIxs,
  getWithdrawWithLeverageIxs,
  lamportsToNumberDecimal,
} from '@kamino-finance/klend-sdk';
import { getConnection } from './utils/connection';
import { getKeypair } from './utils/keypair';
import BN from 'bn.js';
import { JLP_MARKET, JLP_MARKET_LUT, JLP_MINT, JUP_QUOTE_BUFFER_BPS, USDC_MINT } from './utils/constants';
import { executeUserSetupLutsTransactions, getMarket } from './utils/helpers';
import { getKaminoResources } from './utils/kamino_resources';
import { PublicKey } from '@solana/web3.js';
import Decimal from 'decimal.js';
import { Scope } from '@kamino-finance/scope-sdk/';
import { KswapSdk, RouteOutput } from '@kamino-finance/kswap-sdk/dist';
import { getKswapQuoter, getKswapSwapper, getTokenPriceFromJupWithFallback, KSWAP_API } from './utils/kswap_utils';
import { buildVersionedTransactionSync, getLookupTableAccountsFromAddresses } from '../src';

// For this example we are only using JLP/USDC multiply
// This can be also used for leverage by using the correct type when creating the obligation
(async () => {
  const connection = getConnection();
  const wallet = getKeypair();

  const market = await getMarket({ connection, marketPubkey: JLP_MARKET });
  const scope = new Scope('mainnet-beta', connection);
  const kswapSdk = new KswapSdk(KSWAP_API, connection);

  const collTokenMint = JLP_MINT;
  const debtTokenMint = USDC_MINT;
  // const vaultType = 'multiply';
  const leverage = 3; // 3x leverage/ 3x multiply
  const withdrawAmount = new Decimal(3); // 3 USDC - can also withdraw all by specifying isClosingPosition: true
  const slippageBps = 30;

  const kaminoResources = await getKaminoResources();

  const multiplyColPairs = kaminoResources.multiplyLUTsPairs[collTokenMint.toString()] || {};
  const multiplyLut = multiplyColPairs[debtTokenMint.toString()] || [];

  const multiplyLutKeys = multiplyLut.map((lut) => new PublicKey(lut));

  const multiplyMints: { coll: PublicKey; debt: PublicKey }[] = [{ coll: collTokenMint, debt: debtTokenMint }];
  const leverageMints: { coll: PublicKey; debt: PublicKey }[] = [];
  multiplyMints.push({
    coll: new PublicKey(collTokenMint),
    debt: new PublicKey(debtTokenMint),
  });

  // This is the setup step that should happen each time the user has to extend it's LookupTable with missing keys
  // Or when the user doesn't have his LUT and UserMetadata table created yet
  // This will return an empty array in case the lut is already created and extended
  const [userLookupTable, txsIxs] = await getUserLutAddressAndSetupIxs(
    market,
    wallet.publicKey,
    PublicKey.default,
    true, // always extending LUT
    multiplyMints,
    leverageMints
  );

  const debtTokenReserve = market.getReserveByMint(debtTokenMint);
  const collTokenReserve = market.getReserveByMint(collTokenMint);

  await executeUserSetupLutsTransactions(connection, wallet, txsIxs);

  const obligationType = new MultiplyObligation(collTokenMint, debtTokenMint, PROGRAM_ID); // new LeverageObligation(collTokenMint, debtTokenMint, PROGRAM_ID); for leverage
  const obligationAddress = obligationType.toPda(market.getAddress(), wallet.publicKey);
  const obligation = await market.getObligationByAddress(obligationAddress);
  const deposited = lamportsToNumberDecimal(
    Array.from(obligation!.deposits.values())[0]?.amount.toString() || '0',
    collTokenReserve?.state.liquidity.mintDecimals.toNumber()!
  );
  const borrowed = lamportsToNumberDecimal(
    Array.from(obligation!.borrows.values())[0]?.amount.toString() || '0',
    debtTokenReserve?.state.liquidity.mintDecimals.toNumber()!
  );

  const currentSlot = await market.getConnection().getSlot();

  // Price A in B callback can be defined in different ways. Here we use jupiter price API
  const getPriceAinB = async (tokenAMint: PublicKey, tokenBMint: PublicKey): Promise<Decimal> => {
    const price = await getTokenPriceFromJupWithFallback(kswapSdk, tokenAMint, tokenBMint);
    return new Decimal(price);
  };

  const priceCollToDebt = await getPriceAinB(collTokenMint, debtTokenMint);

  console.log('Price debt to coll', priceCollToDebt.toString());

  const computeIxs = getComputeBudgetAndPriorityFeeIxs(1_400_000, new Decimal(500000));

  const withdrawWithLeverageRoutes = await getWithdrawWithLeverageIxs<RouteOutput>({
    owner: wallet.publicKey,
    kaminoMarket: market,
    debtTokenMint: debtTokenMint,
    collTokenMint: collTokenMint,
    obligation: obligation!, // obligation does not exist as we are creating it with this deposit
    deposited: deposited,
    borrowed: borrowed,
    referrer: PublicKey.default,
    currentSlot,
    withdrawAmount,
    priceCollToDebt,
    slippagePct: new Decimal(slippageBps / 100),
    isClosingPosition: true, // if true, withdraws all the collateral and closes the position
    selectedTokenMint: debtTokenMint, // the token we are withdrawing into
    budgetAndPriorityFeeIxs: computeIxs,
    kamino: undefined, // this is only used for kamino liquidity tokens which is currently not supported
    scopeRefreshConfig: { scope, scopeFeed: 'hubble' },
    quoteBufferBps: new Decimal(JUP_QUOTE_BUFFER_BPS),
    isKtoken: async (token: PublicKey | string): Promise<boolean> => {
      return false;
    }, // should return true if the token is a ktoken which is currently not supported
    quoter: getKswapQuoter(
      kswapSdk,
      wallet.publicKey,
      slippageBps,
      market.getReserveByMint(collTokenMint)!,
      market.getReserveByMint(debtTokenMint)!
    ), // IMPORTANT!: For deposit the input mint is the debt token mint and the output mint is the collateral token
    swapper: getKswapSwapper(kswapSdk, wallet.publicKey, slippageBps),
    useV2Ixs: true,
  });

  const klendLookupTableKeys: PublicKey[] = [];
  klendLookupTableKeys.push(userLookupTable);
  klendLookupTableKeys.push(...multiplyLutKeys);
  klendLookupTableKeys.push(JLP_MARKET_LUT);

  const [blockhash, klendLutAccounts] = await Promise.all([
    connection.getLatestBlockhash('finalized'),
    await getLookupTableAccountsFromAddresses(connection, klendLookupTableKeys),
  ]);

  console.log(`depositWithLeverageRoutes length`, withdrawWithLeverageRoutes.length);
  const simulationTxs = await Promise.all(
    withdrawWithLeverageRoutes.map(async (route, i) => {
      const ixs = route.ixs;
      const lookupTables = route.lookupTables;
      lookupTables.push(...klendLutAccounts);

      try {
        const transaction = buildVersionedTransactionSync(wallet.publicKey, ixs, blockhash.blockhash, lookupTables);

        const simulation = await connection.simulateTransaction(transaction, {
          sigVerify: false,
          commitment: 'confirmed',
        });

        if (simulation.value.err) {
          console.log(`Simulation failed for route ${i}`, simulation.value.err);
          return undefined;
        }

        return {
          tx: transaction,
          routeOutput: route.quote!,
          swapInputs: route.swapInputs,
        };
      } catch (e) {
        console.log(`Simulation failed for route ${i}`, e);
        return undefined;
      }
    })
  );

  const passingSimulationTxs = simulationTxs.filter((tx) => tx !== undefined);

  const transactionToExecute = passingSimulationTxs.reduce((bestTx, currentTx) => {
    const inputMintReserve = market.getReserveByMint(bestTx.swapInputs.inputMint)!;
    const outputMintReserve = market.getReserveByMint(bestTx.swapInputs.outputMint)!;
    if (!currentTx) return bestTx;
    if (!bestTx) return currentTx;
    const best = bestTx.routeOutput;
    const current = currentTx.routeOutput;
    const inAmountBest = new Decimal(best.amountsExactIn.amountIn.toString()).div(inputMintReserve.getMintFactor());
    const minAmountOutBest = new Decimal(best.amountsExactIn.amountOutGuaranteed.toString()).div(
      outputMintReserve.getMintFactor()
    );
    const priceAInBBest = minAmountOutBest.div(inAmountBest);
    const inAmountCurrent = new Decimal(current.amountsExactIn.amountIn.toString()).div(
      inputMintReserve.getMintFactor()
    );
    const minAmountOutCurrent = new Decimal(current.amountsExactIn.amountOutGuaranteed.toString()).div(
      outputMintReserve.getMintFactor()
    );
    const priceAInBCurrent = minAmountOutCurrent.div(inAmountCurrent);
    return priceAInBBest.greaterThan(priceAInBCurrent) ? bestTx : currentTx;
  });

  if (!transactionToExecute) {
    console.log('No passing simulation txs');
    return;
  }

  console.log('Best route type: ', transactionToExecute.routeOutput.routerType);

  const txHash = await buildAndSendTxnWithLogs(connection, transactionToExecute.tx, wallet, [], true);

  console.log('txHash', txHash);
})().catch(async (e) => {
  console.error(e);
});
