import {
  MultiplyObligation,
  PROGRAM_ID,
  getAdjustLeverageIxs,
  getComputeBudgetAndPriorityFeeIxs,
  getUserLutAddressAndSetupIxs,
} from '@kamino-finance/klend-sdk';
import { getConnectionPool } from './utils/connection';
import { getKeypair } from './utils/keypair';
import { JLP_MARKET, JLP_MARKET_LUT, JLP_MINT, JUP_QUOTE_BUFFER_BPS, USDC_MINT } from './utils/constants';
import { executeUserSetupLutsTransactions, getMarket } from './utils/helpers';
import { getKaminoResources } from './utils/kamino_resources';
import { address, Address, none } from '@solana/kit';
import Decimal from 'decimal.js';
import { getJupiterPrice, getJupiterQuoter, getJupiterSwapper } from './utils/jup_utils';
import { QuoteResponse } from '@jup-ag/api/dist/index.js';
import { Scope } from '@kamino-finance/scope-sdk/';
import { sendAndConfirmTx } from './utils/tx';

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
  const slippagePct = 0.1;

  const kaminoResources = await getKaminoResources();

  const multiplyColPairs = kaminoResources.multiplyLUTsPairs[collTokenMint.toString()] || {};
  const multiplyLut = multiplyColPairs[debtTokenMint.toString()] || [];

  const multiplyLutKeys = multiplyLut.map((lut) => address(lut));

  const multiplyMints: { coll: Address; debt: Address }[] = [{ coll: collTokenMint, debt: debtTokenMint }];
  const leverageMints: { coll: Address; debt: Address }[] = [];
  multiplyMints.push({
    coll: address(collTokenMint),
    debt: address(debtTokenMint),
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

  const debtTokenReserve = market.getReserveByMint(debtTokenMint);
  const collTokenReserve = market.getReserveByMint(collTokenMint);

  await executeUserSetupLutsTransactions(c, wallet, txsIxs);

  const obligationType = new MultiplyObligation(collTokenMint, debtTokenMint, PROGRAM_ID); // new LeverageObligation(collTokenMint, debtTokenMint, PROGRAM_ID); for leverage
  const obligationAddress = await obligationType.toPda(market.getAddress(), wallet.address);
  const obligation = await market.getObligationByAddress(obligationAddress);
  const depositedLamports = obligation!.getDepositByMint(collTokenMint)!.amount;
  const borrowedLamports = obligation!.getBorrowByMint(debtTokenMint)!.amount;

  const currentSlot = await c.rpc.getSlot().send();

  // Price A in B callback can be defined in different ways. Here we use jupiter price API
  const getPriceAinB = async (tokenAMint: Address, tokenBMint: Address): Promise<Decimal> => {
    const price = await getJupiterPrice(tokenAMint, tokenBMint);
    return new Decimal(price);
  };

  const priceCollToDebt = await getPriceAinB(collTokenMint, debtTokenMint);
  const priceDebtToColl = await getPriceAinB(debtTokenMint, collTokenMint);

  console.log('Price coll to debt', priceCollToDebt.toString());
  console.log('Price debt to coll', priceDebtToColl.toString());

  // First adjust down to 2x leverage

  const computeIxs = getComputeBudgetAndPriorityFeeIxs(1_400_000, new Decimal(500000));

  const { ixs, lookupTables, swapInputs } = (
    await getAdjustLeverageIxs<QuoteResponse>({
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
      slippagePct: new Decimal(slippagePct),
      budgetAndPriorityFeeIxs: computeIxs,
      scopeRefreshConfig: { scope, scopeConfigurations: await scope.getAllConfigurations() },
      quoteBufferBps: new Decimal(JUP_QUOTE_BUFFER_BPS),
      quoter: getJupiterQuoter(slippagePct * 100, collTokenReserve!, debtTokenReserve!), // IMPORTANT!: For adjust DOWN the input mint is the coll token and the output mint is the debt token
      swapper: getJupiterSwapper(c.rpc, wallet.address),
      useV2Ixs: true,
    })
  )[0];

  const lookupTableKeys = lookupTables.map((lut) => lut.address);
  lookupTableKeys.push(userLookupTable);
  lookupTableKeys.push(...multiplyLutKeys);
  lookupTableKeys.push(JLP_MARKET_LUT);

  const txHash = await sendAndConfirmTx(c, wallet, ixs, [], lookupTableKeys, 'adjustLeverage');

  console.log('txHash', txHash);

  // Now adjust back to 3x leverage

  {
    const computeIxs = getComputeBudgetAndPriorityFeeIxs(1_400_000, new Decimal(500000));

    const { ixs, lookupTables } = (
      await getAdjustLeverageIxs<QuoteResponse>({
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
        slippagePct: new Decimal(slippagePct),
        budgetAndPriorityFeeIxs: computeIxs,
        scopeRefreshConfig: { scope, scopeConfigurations: await scope.getAllConfigurations() },
        quoteBufferBps: new Decimal(JUP_QUOTE_BUFFER_BPS),
        quoter: getJupiterQuoter(slippagePct * 100, debtTokenReserve!, collTokenReserve!), // IMPORTANT!: For adjust UP the input mint is the debt token and the output mint is the coll token
        swapper: getJupiterSwapper(c.rpc, wallet.address),
        useV2Ixs: true,
      })
    )[0];

    const lookupTableKeys = lookupTables.map((lut) => lut.address);
    lookupTableKeys.push(userLookupTable);
    lookupTableKeys.push(...multiplyLutKeys);
    lookupTableKeys.push(JLP_MARKET_LUT);

    const txHash = await sendAndConfirmTx(c, wallet, ixs, [], lookupTableKeys, 'adjustLeverage');
    console.log('txHash', txHash);
  }
})().catch(async (e) => {
  console.error(e);
});
