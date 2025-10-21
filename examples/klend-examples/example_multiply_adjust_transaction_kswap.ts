import {
  MultiplyObligation,
  PROGRAM_ID,
  getAdjustLeverageIxs,
  getComputeBudgetAndPriorityFeeIxs,
  getUserLutAddressAndSetupIxs,
  getScopeRefreshIxForObligationAndReserves,
} from '@kamino-finance/klend-sdk';
import { getConnectionPool } from '../utils/connection';
import { getKeypair } from '../utils/keypair';
import { JLP_MARKET, JLP_MARKET_LUT, JLP_MINT, JUP_QUOTE_BUFFER_BPS, USDC_MINT } from '../utils/constants';
import { executeUserSetupLutsTransactions, getMarket } from '../utils/helpers';
import { getKaminoResources } from '../utils/kamino_resources';
import Decimal from 'decimal.js';
import { Scope } from '@kamino-finance/scope-sdk/';
import { KswapSdk, RouteOutput } from '@kamino-finance/kswap-sdk/dist';
import { getKswapQuoter, getKswapSwapper, getTokenPriceFromJupWithFallback, KSWAP_API } from '../utils/kswap_utils';
import { address, Address, none } from '@solana/kit';
import { fetchAllAddressLookupTable } from '@solana-program/address-lookup-table';
import { sendAndConfirmTx, simulateTx } from '../utils/tx';

// For this example we are only using JLP/USDC multiply
// This can be also used for leverage by using the correct type when creating the obligation
(async () => {
  const c = getConnectionPool();
  const wallet = await getKeypair();

  const market = await getMarket({ rpc: c.rpc, marketPubkey: JLP_MARKET });
  const scope = new Scope('mainnet-beta', c.rpc);

  const collTokenMint = JLP_MINT;
  const debtTokenMint = USDC_MINT;
  // const vaultType = 'multiply';
  const targetLeverage = new Decimal(2); // 3x leverage/ 3x multiply
  const ogLeverage = new Decimal(3);
  const slippageBps = 30;
  const kswapSdk = new KswapSdk(KSWAP_API, c.legacyConnection);

  const kaminoResources = await getKaminoResources();

  const multiplyColPairs = kaminoResources.multiplyLUTsPairs[collTokenMint.toString()] || {};
  const multiplyLut = multiplyColPairs[debtTokenMint.toString()] || [];

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
    undefined,
    true, // always extending LUT
    multiplyMints,
    leverageMints
  );

  const debtTokenReserve = market.getReserveByMint(debtTokenMint)!;
  const collTokenReserve = market.getReserveByMint(collTokenMint)!;

  await executeUserSetupLutsTransactions(c, wallet, txsIxs);

  const obligationType = new MultiplyObligation(collTokenMint, debtTokenMint, PROGRAM_ID); // new LeverageObligation(collTokenMint, debtTokenMint, PROGRAM_ID); for leverage
  const obligationAddress = await obligationType.toPda(market.getAddress(), wallet.address);
  const obligation = await market.getObligationByAddress(obligationAddress)!;
  const depositedLamports = obligation!.getDepositByMint(collTokenMint)!.amount;
  const borrowedLamports = obligation!.getBorrowByMint(debtTokenMint)!.amount;

  const currentSlot = await c.rpc.getSlot().send();
  const scopeConfiguration = { scope, scopeConfigurations: await scope.getAllConfigurations() };
  const scopeRefreshIx = await getScopeRefreshIxForObligationAndReserves(
    market,
    collTokenReserve,
    debtTokenReserve,
    obligation!,
    scopeConfiguration
  );

  // Price A in B callback can be defined in different ways. Here we use jupiter price API
  const getPriceAinB = async (tokenAMint: Address, tokenBMint: Address): Promise<Decimal> => {
    const price = await getTokenPriceFromJupWithFallback(kswapSdk, tokenAMint, tokenBMint);
    return new Decimal(price);
  };

  const priceCollToDebt = await getPriceAinB(collTokenMint, debtTokenMint);
  const priceDebtToColl = await getPriceAinB(debtTokenMint, collTokenMint);

  console.log('Price coll to debt', priceCollToDebt.toString());
  console.log('Price debt to coll', priceDebtToColl.toString());

  // First adjust down to 2x leverage

  const userSolBalanceLamports = Number.parseInt(
    (await market.getRpc().getBalance(wallet.address).send()).value.toString()
  );

  const computeIxs = getComputeBudgetAndPriorityFeeIxs(1_400_000, new Decimal(500000));
  {
    const adjustUpWithLeverageRoutes = await getAdjustLeverageIxs<RouteOutput>({
      owner: wallet,
      kaminoMarket: market,
      debtTokenMint: debtTokenMint,
      collTokenMint: collTokenMint,
      obligation: obligation!, // obligation does not exist as we are creating it with this deposit
      depositedLamports,
      borrowedLamports,
      referrer: none(),
      currentSlot,
      targetLeverage: targetLeverage,
      priceCollToDebt,
      priceDebtToColl,
      slippagePct: new Decimal(slippageBps / 100),
      budgetAndPriorityFeeIxs: computeIxs,
      scopeRefreshIx,
      quoteBufferBps: new Decimal(JUP_QUOTE_BUFFER_BPS),
      quoter: getKswapQuoter(
        kswapSdk,
        wallet.address,
        slippageBps,
        market.getReserveByMint(collTokenMint)!,
        market.getReserveByMint(debtTokenMint)!
      ), // IMPORTANT!: For deposit the input mint is the debt token mint and the output mint is the collateral token
      swapper: getKswapSwapper(kswapSdk, wallet.address, slippageBps),
      useV2Ixs: true,
      userSolBalanceLamports,
    });
    const klendLookupTableKeys: Address[] = [];
    klendLookupTableKeys.push(userLookupTable);
    klendLookupTableKeys.push(...multiplyLutKeys);
    klendLookupTableKeys.push(JLP_MARKET_LUT);

    const [blockhash, klendLutAccounts] = await Promise.all([
      c.rpc.getLatestBlockhash({ commitment: 'finalized' }).send(),
      await fetchAllAddressLookupTable(c.rpc, klendLookupTableKeys),
    ]);

    console.log(`adjustUpWithLeverageRoutes length`, adjustUpWithLeverageRoutes.length);
    const simulationTxs = await Promise.all(
      adjustUpWithLeverageRoutes.map(async (route, i) => {
        const ixs = route.ixs;
        const lookupTables = route.lookupTables;
        lookupTables.push(...klendLutAccounts);

        try {
          const simulation = await simulateTx(c.rpc, wallet.address, ixs, lookupTables);

          if (simulation.value.err) {
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

    if (!passingSimulationTxs.length) {
      console.log('No passing simulation txs');
      return;
    }

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
      'adjustUpWithLeverageRoutes'
    );

    console.log('txHash', txHash);
  }
  // Now adjust back to 3x leverage

  {
    const userSolBalanceLamports = Number.parseInt(
      (await market.getRpc().getBalance(wallet.address).send()).value.toString()
    );
    const computeIxs = getComputeBudgetAndPriorityFeeIxs(1_400_000, new Decimal(500000));

    const adjustDownWithLeverageRoutes = await getAdjustLeverageIxs<RouteOutput>({
      owner: wallet,
      kaminoMarket: market,
      debtTokenMint: debtTokenMint,
      collTokenMint: collTokenMint,
      obligation: obligation!, // obligation does not exist as we are creating it with this deposit
      depositedLamports,
      borrowedLamports,
      referrer: none(),
      currentSlot,
      targetLeverage: ogLeverage,
      priceCollToDebt,
      priceDebtToColl,
      slippagePct: new Decimal(slippageBps),
      budgetAndPriorityFeeIxs: computeIxs,
      scopeRefreshIx,
      quoteBufferBps: new Decimal(JUP_QUOTE_BUFFER_BPS),
      quoter: getKswapQuoter(
        kswapSdk,
        wallet.address,
        slippageBps,
        market.getReserveByMint(debtTokenMint)!,
        market.getReserveByMint(collTokenMint)!
      ), // IMPORTANT!: For deposit the input mint is the debt token mint and the output mint is the collateral token
      swapper: getKswapSwapper(kswapSdk, wallet.address, slippageBps),
      useV2Ixs: true,
      userSolBalanceLamports,
    });

    const klendLookupTableKeys: Address[] = [];
    klendLookupTableKeys.push(userLookupTable);
    klendLookupTableKeys.push(...multiplyLutKeys);
    klendLookupTableKeys.push(JLP_MARKET_LUT);

    const [blockhash, klendLutAccounts] = await Promise.all([
      c.rpc.getLatestBlockhash({ commitment: 'finalized' }).send(),
      fetchAllAddressLookupTable(c.rpc, klendLookupTableKeys),
    ]);

    console.log(`adjustUpWithLeverageRoutes length`, adjustDownWithLeverageRoutes.length);
    const simulationTxs = await Promise.all(
      adjustDownWithLeverageRoutes.map(async (route, i) => {
        const ixs = route.ixs;
        const lookupTables = route.lookupTables;
        lookupTables.push(...klendLutAccounts);

        try {
          const simulation = await simulateTx(c.rpc, wallet.address, ixs, lookupTables);

          if (simulation.value.err) {
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

    const txHash = await sendAndConfirmTx(c, wallet, transactionToExecute.ixs, [], transactionToExecute.luts);

    console.log('txHash', txHash);
  }
})().catch(async (e) => {
  console.error(e);
});
