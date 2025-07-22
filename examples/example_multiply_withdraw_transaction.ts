import {
  MultiplyObligation,
  PROGRAM_ID,
  getComputeBudgetAndPriorityFeeIxs,
  getUserLutAddressAndSetupIxs,
  getWithdrawWithLeverageIxs,
  lamportsToNumberDecimal,
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
  const leverage = 3; // 3x leverage/ 3x multiply
  const withdrawAmount = new Decimal(3); // 3 USDC - can also withdraw all by specifying isClosingPosition: true
  const slippagePct = 0.1;

  const kaminoResources = await getKaminoResources();

  const multiplyColPairs = kaminoResources.multiplyLUTsPairs[collTokenMint.toString()] || {};
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

  const debtTokenReserve = market.getReserveByMint(debtTokenMint);
  const collTokenReserve = market.getReserveByMint(collTokenMint);

  await executeUserSetupLutsTransactions(c, wallet, txsIxs);

  const obligationType = new MultiplyObligation(collTokenMint, debtTokenMint, PROGRAM_ID); // new LeverageObligation(collTokenMint, debtTokenMint, PROGRAM_ID); for leverage
  const obligationAddress = await obligationType.toPda(market.getAddress(), wallet.address);
  const obligation = await market.getObligationByAddress(obligationAddress);
  const deposited = lamportsToNumberDecimal(
    Array.from(obligation!.deposits.values())[0]?.amount.toString() || '0',
    collTokenReserve?.state.liquidity.mintDecimals.toNumber()!
  );
  const borrowed = lamportsToNumberDecimal(
    Array.from(obligation!.borrows.values())[0]?.amount.toString() || '0',
    debtTokenReserve?.state.liquidity.mintDecimals.toNumber()!
  );

  const currentSlot = await c.rpc.getSlot().send();

  // Price A in B callback can be defined in different ways. Here we use jupiter price API
  const getPriceAinB = async (tokenAMint: Address, tokenBMint: Address): Promise<Decimal> => {
    const price = await getJupiterPrice(tokenAMint, tokenBMint);
    return new Decimal(price);
  };

  const priceCollToDebt = await getPriceAinB(collTokenMint, debtTokenMint);

  console.log('Price debt to coll', priceCollToDebt.toString());

  const computeIxs = getComputeBudgetAndPriorityFeeIxs(1_400_000, new Decimal(500000));

  const { ixs, lookupTables, swapInputs } = (
    await getWithdrawWithLeverageIxs<QuoteResponse>({
      owner: wallet,
      kaminoMarket: market,
      debtTokenMint: debtTokenMint,
      collTokenMint: collTokenMint,
      obligation: obligation!, // obligation does not exist as we are creating it with this deposit
      deposited: deposited,
      borrowed: borrowed,
      referrer: none(),
      currentSlot,
      withdrawAmount,
      priceCollToDebt,
      slippagePct: new Decimal(slippagePct),
      isClosingPosition: true, // if true, withdraws all the collateral and closes the position
      selectedTokenMint: debtTokenMint, // the token we are withdrawing into
      budgetAndPriorityFeeIxs: computeIxs,
      kamino: undefined, // this is only used for kamino liquidity tokens which is currently not supported
      scopeRefreshConfig: { scope, scopeConfigurations: await scope.getAllConfigurations() },
      quoteBufferBps: new Decimal(JUP_QUOTE_BUFFER_BPS),
      isKtoken: async (token: Address): Promise<boolean> => {
        return false;
      }, // should return true if the token is a ktoken which is currently not supported
      quoter: getJupiterQuoter(slippagePct * 100, collTokenReserve!, debtTokenReserve!), // IMPORTANT!: For withdraw the input mint is the coll token mint and the output mint is the debt token
      swapper: getJupiterSwapper(c.rpc, wallet.address),
      useV2Ixs: true,
    })
  )[0];

  const lookupTableKeys = lookupTables.map((lut) => lut.address);
  lookupTableKeys.push(userLookupTable);
  lookupTableKeys.push(...multiplyLutKeys);
  lookupTableKeys.push(JLP_MARKET_LUT);

  const txHash = await sendAndConfirmTx(c, wallet, ixs, [], lookupTableKeys, 'withdrawLeverage');

  console.log('txHash', txHash);
})().catch(async (e) => {
  console.error(e);
});
