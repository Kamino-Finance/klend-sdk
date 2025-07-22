import {
  MultiplyObligation,
  ObligationTypeTag,
  PROGRAM_ID,
  getComputeBudgetAndPriorityFeeIxs,
  getDepositWithLeverageIxs,
  getUserLutAddressAndSetupIxs,
} from '@kamino-finance/klend-sdk';
import { getConnectionPool } from './utils/connection';
import { getKeypair } from './utils/keypair';
import { JLP_MARKET, JLP_MINT, JUP_QUOTE_BUFFER_BPS, USDC_MINT, JLP_MARKET_LUT } from './utils/constants';
import { executeUserSetupLutsTransactions, getMarket } from './utils/helpers';
import { getKaminoResources } from './utils/kamino_resources';
import Decimal from 'decimal.js';
import { Scope } from '@kamino-finance/scope-sdk/';
import { getKswapQuoter, getKswapSwapper, getTokenPriceFromJupWithFallback, KSWAP_API } from './utils/kswap_utils';
import { KswapSdk } from '@kamino-finance/kswap-sdk';
import { address, Address, none } from '@solana/kit';
import { fetchAllAddressLookupTable } from '@solana-program/address-lookup-table';
import { sendAndConfirmTx, simulateTx } from './utils/tx';
// For this example we are only using JLP/USDC multiply
// This can be also used for leverage by using the correct type when creating the obligation
(async () => {
  const c = getConnectionPool();
  const wallet = await getKeypair();

  const market = await getMarket({ rpc: c.rpc, marketPubkey: JLP_MARKET });
  const scope = new Scope('mainnet-beta', c.rpc);
  const kswapSdk = new KswapSdk(KSWAP_API, c.legacyConnection);

  const collTokenMint = JLP_MINT;
  const debtTokenMint = USDC_MINT;
  // const vaultType = 'multiply';
  const leverage = 3; // 3x leverage/ 3x multiply
  const amountToDeposit = new Decimal(5); // 5 USDC
  const slippageBps = 30;

  const kaminoResources = await getKaminoResources();

  const multiplyColPairs = kaminoResources.multiplyLUTsPairs[collTokenMint] || {};
  const multiplyLut = multiplyColPairs[debtTokenMint] || [];
  const multiplyLutKeys = multiplyLut.map((lut) => address(lut));

  const multiplyMints: { coll: Address; debt: Address }[] = [{ coll: collTokenMint, debt: debtTokenMint }];
  const leverageMints: { coll: Address; debt: Address }[] = [];
  multiplyMints.push({
    coll: collTokenMint,
    debt: debtTokenMint,
  });

  // This is the setup step that should happen each time the user has to extend it's LookupTable with missing keys
  // Or when the user doesn't have his LUT and UserMetadata table created yet
  // This will return an empty array in case the lut is already created and extended
  const [userLookupTable, txsIxs] = await getUserLutAddressAndSetupIxs(
    market,
    wallet,
    none(),
    true, // always extending LUT
    multiplyMints,
    leverageMints
  );

  await executeUserSetupLutsTransactions(c, wallet, txsIxs);

  const obligationType = new MultiplyObligation(collTokenMint, debtTokenMint, PROGRAM_ID); // new LeverageObligation(collTokenMint, debtTokenMint, PROGRAM_ID); for leverage
  const obligationAddress = await obligationType.toPda(market.getAddress(), wallet.address);

  const currentSlot = await c.rpc.getSlot().send();

  // Price A in B callback can be defined in different ways. Here we use jupiter price API
  const getPriceAinB = async (tokenAMint: Address, tokenBMint: Address): Promise<Decimal> => {
    const price = await getTokenPriceFromJupWithFallback(kswapSdk, tokenAMint, tokenBMint);
    return new Decimal(price);
  };

  const priceDebtToColl = await getPriceAinB(debtTokenMint, collTokenMint);

  console.log('Price debt to coll', priceDebtToColl.toString());

  const computeIxs = getComputeBudgetAndPriorityFeeIxs(1_400_000, new Decimal(500000));

  const depositWithLeverageRoutes = await getDepositWithLeverageIxs({
    owner: wallet,
    kaminoMarket: market,
    debtTokenMint: debtTokenMint,
    collTokenMint: collTokenMint,
    depositAmount: amountToDeposit,
    priceDebtToColl: priceDebtToColl,
    slippagePct: new Decimal(slippageBps / 100),
    obligation: null, // obligation does not exist as we are creating it with this deposit
    referrer: none(),
    currentSlot,
    targetLeverage: new Decimal(leverage),
    selectedTokenMint: debtTokenMint, // the token we are using to deposit
    kamino: undefined, // this is only used for kamino liquidity tokens which is currently not supported
    obligationTypeTagOverride: ObligationTypeTag.Multiply, // or leverage
    scopeRefreshConfig: { scope, scopeConfigurations: await scope.getAllConfigurations() },
    budgetAndPriorityFeeIxs: computeIxs,
    quoteBufferBps: new Decimal(JUP_QUOTE_BUFFER_BPS),
    priceAinB: getPriceAinB,
    isKtoken: async (token: Address | string): Promise<boolean> => {
      return false;
    }, // should return true if the token is a ktoken which is currently not supported
    quoter: getKswapQuoter(
      kswapSdk,
      wallet.address,
      slippageBps,
      market.getReserveByMint(debtTokenMint)!,
      market.getReserveByMint(collTokenMint)!
    ), // IMPORTANT!: For deposit the input mint is the debt token mint and the output mint is the collateral token
    swapper: getKswapSwapper(kswapSdk, wallet.address, slippageBps),
    useV2Ixs: true,
  });

  const klendLookupTableKeys: Address[] = [];
  klendLookupTableKeys.push(userLookupTable);
  klendLookupTableKeys.push(...multiplyLutKeys);
  klendLookupTableKeys.push(JLP_MARKET_LUT);

  const [blockhash, klendLutAccounts] = await Promise.all([
    c.rpc.getLatestBlockhash({ commitment: 'finalized' }).send(),
    await fetchAllAddressLookupTable(c.rpc, klendLookupTableKeys),
  ]);

  console.log(`depositWithLeverageRoutes length`, depositWithLeverageRoutes.length);
  const simulationTxs = await Promise.all(
    depositWithLeverageRoutes.map(async (route, i) => {
      const ixs = route.ixs;
      const lookupTables = route.lookupTables;
      lookupTables.push(...klendLutAccounts);

      try {
        const simulation = await simulateTx(c.rpc, wallet.address, ixs, lookupTables);

        if (!simulation || simulation.value.err) {
          console.log(`Simulation failed for route ${i}`, simulation.value.err);
          return undefined;
        }

        return {
          ixs,
          luts: lookupTables.map((l) => l.address),
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

  const txHash = await sendAndConfirmTx(
    c,
    wallet,
    transactionToExecute.ixs,
    [],
    transactionToExecute.luts,
    'depositWithLeverage'
  );

  console.log('txHash', txHash);
})().catch(async (e) => {
  console.error(e);
});
