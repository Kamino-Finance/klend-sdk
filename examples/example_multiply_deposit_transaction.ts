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
import { JLP_MARKET, JLP_MARKET_LUT, JLP_MINT, JUP_QUOTE_BUFFER_BPS, USDC_MINT } from './utils/constants';
import { executeUserSetupLutsTransactions, getMarket } from './utils/helpers';
import { getKaminoResources } from './utils/kamino_resources';
import { address, Address, none } from '@solana/kit';
import Decimal from 'decimal.js';
import { getJupiterPrice, getJupiterQuoter, getJupiterSwapper } from './utils/jup_utils';
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
  const amountToDeposit = new Decimal(5); // 5 USDC
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

  await executeUserSetupLutsTransactions(c, wallet, txsIxs);

  const obligationType = new MultiplyObligation(collTokenMint, debtTokenMint, PROGRAM_ID); // new LeverageObligation(collTokenMint, debtTokenMint, PROGRAM_ID); for leverage
  const obligationAddress = await obligationType.toPda(market.getAddress(), wallet.address);

  const currentSlot = await c.rpc.getSlot().send();

  // Price A in B callback can be defined in different ways. Here we use jupiter price API
  const getPriceAinB = async (tokenAMint: Address, tokenBMint: Address): Promise<Decimal> => {
    const price = await getJupiterPrice(tokenAMint, tokenBMint);
    return new Decimal(price);
  };

  const priceDebtToColl = await getPriceAinB(debtTokenMint, collTokenMint);

  console.log('Price debt to coll', priceDebtToColl.toString());

  const computeIxs = getComputeBudgetAndPriorityFeeIxs(1_400_000, new Decimal(500000));

  const { ixs, lookupTables, swapInputs } = (
    await getDepositWithLeverageIxs({
      owner: wallet,
      kaminoMarket: market,
      debtTokenMint: debtTokenMint,
      collTokenMint: collTokenMint,
      depositAmount: amountToDeposit,
      priceDebtToColl: priceDebtToColl,
      slippagePct: new Decimal(slippagePct),
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
      isKtoken: async (token: Address): Promise<boolean> => {
        return false;
      }, // should return true if the token is a ktoken which is currently not supported
      quoter: getJupiterQuoter(
        slippagePct * 100,
        market.getReserveByMint(debtTokenMint)!,
        market.getReserveByMint(collTokenMint)!
      ), // IMPORTANT!: For deposit the input mint is the debt token mint and the output mint is the collateral token
      swapper: getJupiterSwapper(c.rpc, wallet.address),
      useV2Ixs: true,
    })
  )[0];

  const lookupTableKeys = lookupTables.map((lut) => lut.address);
  lookupTableKeys.push(userLookupTable);
  lookupTableKeys.push(...multiplyLutKeys);
  lookupTableKeys.push(JLP_MARKET_LUT);

  const txHash = await sendAndConfirmTx(c, wallet, ixs, [], lookupTableKeys, 'depositWithLeverage');

  console.log('txHash', txHash);
})().catch(async (e) => {
  console.error(e);
});
