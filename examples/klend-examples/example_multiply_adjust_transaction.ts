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
import {
  JLP_MARKET,
  JLP_MARKET_LUT,
  JLP_MINT,
  JLP_RESERVE_JLP_MARKET,
  JUP_QUOTE_BUFFER_BPS,
  USDC_MINT,
  USDC_RESERVE_JLP_MARKET,
} from '../utils/constants';
import { executeUserSetupLutsTransactions, getMarket } from '../utils/helpers';
import { getKaminoResources } from '../utils/kamino_resources';
import { address, Address, none } from '@solana/kit';
import Decimal from 'decimal.js';
import { getJupiterPrice, getJupiterQuoter, getJupiterSwapper } from '../utils/jup_utils';
import { QuoteResponse } from '@jup-ag/api/dist/index.js';
import { Scope } from '@kamino-finance/scope-sdk/';
import { sendAndConfirmTx } from '../utils/tx';

// For this example we are only using JLP/USDC multiply
// This can be also used for leverage by using the correct type when creating the obligation
(async () => {
  const c = getConnectionPool();
  const wallet = await getKeypair();

  const market = await getMarket({ rpc: c.rpc, marketPubkey: JLP_MARKET });
  const scope = new Scope('mainnet-beta', c.rpc);

  const collTokenMint = JLP_MINT;
  const debtTokenMint = USDC_MINT;
  const collReserveAddress = JLP_RESERVE_JLP_MARKET;
  const debtReserveAddress = USDC_RESERVE_JLP_MARKET;
  // const vaultType = 'multiply';
  const targetLeverage = new Decimal(2); // 3x leverage/ 3x multiply
  const ogLeverage = new Decimal(3);
  const slippagePct = 0.1;

  const kaminoResources = await getKaminoResources();

  const multiplyColPairs = kaminoResources.multiplyLUTsPairs[collTokenMint.toString()] || {};
  const multiplyLut = multiplyColPairs[debtTokenMint.toString()] || [];

  const multiplyLutKeys = multiplyLut.map((lut) => address(lut));

  const multiplyReserveAddresses: { collReserve: Address; debtReserve: Address }[] = [
    { collReserve: collReserveAddress, debtReserve: debtReserveAddress },
  ];
  const leverageReserveAddresses: { collReserve: Address; debtReserve: Address }[] = [];
  multiplyReserveAddresses.push({
    collReserve: address(collReserveAddress),
    debtReserve: address(debtReserveAddress),
  });

  // This is the setup step that should happen each time the user has to extend it's LookupTable with missing keys
  // Or when the user doesn't have his LUT and UserMetadata table created yet
  // This will return an empty array in case the lut is already created and extended
  const [userLookupTable, txsIxs] = await getUserLutAddressAndSetupIxs(
    market,
    wallet,
    none(),
    true, // always extending LUT
    multiplyReserveAddresses,
    leverageReserveAddresses
  );

  const debtTokenReserve = market.getExistingReserveByAddress(debtReserveAddress);
  const collTokenReserve = market.getExistingReserveByAddress(collReserveAddress);

  await executeUserSetupLutsTransactions(c, wallet, txsIxs);

  const obligationType = new MultiplyObligation(collTokenMint, debtTokenMint, PROGRAM_ID); // new LeverageObligation(collTokenMint, debtTokenMint, PROGRAM_ID); for leverage
  const obligationAddress = await obligationType.toPda(market.getAddress(), wallet.address);
  const obligation = await market.getObligationByAddress(obligationAddress);
  const depositedLamports = obligation!.getDepositByReserve(collReserveAddress)!.amount;
  const borrowedLamports = obligation!.getBorrowByReserve(debtReserveAddress)!.amount;

  const scopeConfiguration = { scope, scopeConfigurations: await scope.getAllConfigurations() };
  const scopeRefreshIx = await getScopeRefreshIxForObligationAndReserves(
    market,
    collTokenReserve!,
    debtTokenReserve!,
    obligation!,
    scopeConfiguration
  );

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
  const userSolBalanceLamports = Number.parseInt(
    (await market.getRpc().getBalance(wallet.address).send()).value.toString()
  );
  const computeIxs = getComputeBudgetAndPriorityFeeIxs(1_400_000, new Decimal(500000));

  const { ixs, lookupTables, swapInputs } = (
    await getAdjustLeverageIxs<QuoteResponse>({
      owner: wallet,
      kaminoMarket: market,
      debtReserveAddress: debtReserveAddress,
      collReserveAddress: collReserveAddress,
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
      scopeRefreshIx,
      quoteBufferBps: new Decimal(JUP_QUOTE_BUFFER_BPS),
      quoter: getJupiterQuoter(slippagePct * 100, collTokenReserve!, debtTokenReserve!), // IMPORTANT!: For adjust DOWN the input mint is the coll token and the output mint is the debt token
      swapper: getJupiterSwapper(c.rpc, wallet.address),
      useV2Ixs: true,
      userSolBalanceLamports,
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
    const userSolBalanceLamports = Number.parseInt(
      (await market.getRpc().getBalance(wallet.address).send()).value.toString()
    );
    const computeIxs = getComputeBudgetAndPriorityFeeIxs(1_400_000, new Decimal(500000));

    const { ixs, lookupTables } = (
      await getAdjustLeverageIxs<QuoteResponse>({
        owner: wallet,
        kaminoMarket: market,
        debtReserveAddress: debtReserveAddress,
        collReserveAddress: collReserveAddress,
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
        scopeRefreshIx,
        quoteBufferBps: new Decimal(JUP_QUOTE_BUFFER_BPS),
        quoter: getJupiterQuoter(slippagePct * 100, debtTokenReserve!, collTokenReserve!), // IMPORTANT!: For adjust UP the input mint is the debt token and the output mint is the coll token
        swapper: getJupiterSwapper(c.rpc, wallet.address),
        useV2Ixs: true,
        userSolBalanceLamports,
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
