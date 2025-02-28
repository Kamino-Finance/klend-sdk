import {
  MultiplyObligation,
  PROGRAM_ID,
  buildAndSendTxn,
  getAdjustLeverageIxns,
  getComputeBudgetAndPriorityFeeIxns,
  getUserLutAddressAndSetupIxns,
} from '@kamino-finance/klend-sdk';
import { getConnection } from './utils/connection';
import { getKeypair } from './utils/keypair';
import { JLP_MARKET, JLP_MARKET_LUT, JLP_MINT, JUP_QUOTE_BUFFER_BPS, USDC_MINT } from './utils/constants';
import { executeUserSetupLutsTransactions, getMarket } from './utils/helpers';
import { getKaminoResources } from './utils/kamino_resources';
import { PublicKey } from '@solana/web3.js';
import Decimal from 'decimal.js';
import { getJupiterPrice, getJupiterQuoter, getJupiterSwapper } from './utils/jup_utils';
import { QuoteResponse } from '@jup-ag/api/dist/index.js';

// For this example we are only using JLP/USDC multiply
// This can be also used for leverage by using the correct type when creating the obligation
(async () => {
  const connection = getConnection();
  const wallet = getKeypair();

  const market = await getMarket({ connection, marketPubkey: JLP_MARKET });

  const collTokenMint = JLP_MINT;
  const debtTokenMint = USDC_MINT;
  // const vaultType = 'multiply';
  const targetLeverage = new Decimal(2); // 3x leverage/ 3x multiply
  const ogLeverage = new Decimal(3);
  const slippagePct = 0.1;

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
  const [userLookupTable, txsIxns] = await getUserLutAddressAndSetupIxns(
    market,
    wallet.publicKey,
    PublicKey.default,
    true, // always extending LUT
    multiplyMints,
    leverageMints
  );

  const debtTokenReserve = market.getReserveByMint(debtTokenMint);
  const collTokenReserve = market.getReserveByMint(collTokenMint);

  await executeUserSetupLutsTransactions(connection, wallet, txsIxns);

  const obligationType = new MultiplyObligation(collTokenMint, debtTokenMint, PROGRAM_ID); // new LeverageObligation(collTokenMint, debtTokenMint, PROGRAM_ID); for leverage
  const obligationAddress = obligationType.toPda(market.getAddress(), wallet.publicKey);
  const obligation = await market.getObligationByAddress(obligationAddress);
  const depositedLamports = obligation!.getDepositByMint(collTokenMint)!.amount;
  const borrowedLamports = obligation!.getBorrowByMint(debtTokenMint)!.amount;

  const currentSlot = await market.getConnection().getSlot();

  // Price A in B callback can be defined in different ways. Here we use jupiter price API
  const getPriceAinB = async (tokenAMint: PublicKey, tokenBMint: PublicKey): Promise<Decimal> => {
    const price = await getJupiterPrice(tokenAMint, tokenBMint);
    return new Decimal(price);
  };

  const priceCollToDebt = await getPriceAinB(collTokenMint, debtTokenMint);
  const priceDebtToColl = await getPriceAinB(debtTokenMint, collTokenMint);

  console.log('Price debt to coll', priceCollToDebt.toString());
  console.log('Price coll to debt', priceDebtToColl.toString());

  // First adjust down to 2x leverage

  const computeIxs = getComputeBudgetAndPriorityFeeIxns(1_400_000, new Decimal(500000));

  const { ixs, lookupTables, swapInputs } = await getAdjustLeverageIxns<QuoteResponse>({
    owner: wallet.publicKey,
    kaminoMarket: market,
    debtTokenMint: debtTokenMint,
    collTokenMint: collTokenMint,
    obligation: obligation!, // obligation does not exist as we are creating it with this deposit
    depositedLamports,
    borrowedLamports,
    referrer: PublicKey.default,
    currentSlot,
    targetLeverage: targetLeverage,
    priceCollToDebt,
    priceDebtToColl,
    slippagePct: new Decimal(slippagePct),
    budgetAndPriorityFeeIxs: computeIxs,
    kamino: undefined, // this is only used for kamino liquidity tokens which is currently not supported
    scopeFeed: 'hubble',
    quoteBufferBps: new Decimal(JUP_QUOTE_BUFFER_BPS),
    priceAinB: getPriceAinB,
    isKtoken: async (token: PublicKey | string): Promise<boolean> => {
      return false;
    }, // should return true if the token is a ktoken which is currently not supported
    quoter: getJupiterQuoter(slippagePct * 100, collTokenReserve!, debtTokenReserve!), // IMPORTANT!: For adjust DOWN the input mint is the coll token and the output mint is the debt token
    swapper: getJupiterSwapper(connection, wallet.publicKey),
    useV2Ixs: true,
  });

  const lookupTableKeys = lookupTables.map((lut) => lut.key);
  lookupTableKeys.push(userLookupTable);
  lookupTableKeys.push(...multiplyLutKeys);
  lookupTableKeys.push(JLP_MARKET_LUT);

  const txHash = await buildAndSendTxn(connection, wallet, ixs, [], lookupTableKeys);

  console.log('txHash', txHash);

  // Now adjust back to 3x leverage

  {
    const computeIxs = getComputeBudgetAndPriorityFeeIxns(1_400_000, new Decimal(500000));

    const { ixs, lookupTables, swapInputs } = await getAdjustLeverageIxns<QuoteResponse>({
      owner: wallet.publicKey,
      kaminoMarket: market,
      debtTokenMint: debtTokenMint,
      collTokenMint: collTokenMint,
      obligation: obligation!, // obligation does not exist as we are creating it with this deposit
      depositedLamports,
      borrowedLamports,
      referrer: PublicKey.default,
      currentSlot,
      targetLeverage: ogLeverage,
      priceCollToDebt,
      priceDebtToColl,
      slippagePct: new Decimal(slippagePct),
      budgetAndPriorityFeeIxs: computeIxs,
      kamino: undefined, // this is only used for kamino liquidity tokens which is currently not supported
      scopeFeed: 'hubble',
      quoteBufferBps: new Decimal(JUP_QUOTE_BUFFER_BPS),
      priceAinB: getPriceAinB,
      isKtoken: async (token: PublicKey | string): Promise<boolean> => {
        return false;
      }, // should return true if the token is a ktoken which is currently not supported
      quoter: getJupiterQuoter(slippagePct * 100, debtTokenReserve!, collTokenReserve!), // IMPORTANT!: For adjust UP the input mint is the debt token and the output mint is the coll token
      swapper: getJupiterSwapper(connection, wallet.publicKey),
      useV2Ixs: true,
    });

    const lookupTableKeys = lookupTables.map((lut) => lut.key);
    lookupTableKeys.push(userLookupTable);
    lookupTableKeys.push(...multiplyLutKeys);
    lookupTableKeys.push(JLP_MARKET_LUT);

    const txHash = await buildAndSendTxn(connection, wallet, ixs, [], lookupTableKeys);

    console.log('txHash', txHash);
  }
})().catch(async (e) => {
  console.error(e);
});
