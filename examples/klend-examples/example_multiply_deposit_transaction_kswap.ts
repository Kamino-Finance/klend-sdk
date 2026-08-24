import {
  FlashBorrowType,
  MultiplyObligation,
  ObligationTypeTag,
  PROGRAM_ID,
  getComputeBudgetAndPriorityFeeIxs,
  getDepositWithLeverageIxs,
  getUserLutAddressAndSetupIxs,
  getScopeRefreshIxForObligationAndReserves,
  getCurrentLedgerInstant,
} from '@kamino-finance/klend-sdk';
import { getConnectionPool } from '../utils/connection';
import { getKeypair } from '../utils/keypair';
import {
  JLP_MARKET,
  JLP_MINT,
  JUP_QUOTE_BUFFER_BPS,
  USDC_MINT,
  JLP_MARKET_LUT,
  JLP_RESERVE_JLP_MARKET,
  USDC_RESERVE_JLP_MARKET,
} from '../utils/constants';
import { executeUserSetupLutsTransactions, getMarket } from '../utils/helpers';
import { getKaminoResources } from '../utils/kamino_resources';
import Decimal from 'decimal.js';
import { Scope } from '@kamino-finance/scope-sdk/';
import { getKswapQuoter, getKswapSwapper, getTokenPriceFromBirdeye, KSWAP_API } from '../utils/kswap_utils';
import { KswapSdk } from '@kamino-finance/kswap-sdk';
import { address, Address, none } from '@solana/kit';
import { getFlashBorrowTypeFromEnv } from '../utils/env';
import { executeBestSimulatingRoute } from '../utils/swap_examples';
// For this example we are only using JLP/USDC multiply
// This can be also used for leverage by using the correct type when creating the obligation
(async () => {
  const c = getConnectionPool();
  const wallet = await getKeypair();

  const market = await getMarket({ rpc: c.rpc, marketPubkey: JLP_MARKET });
  const scope = new Scope('mainnet-beta', c.rpc);
  const kswapSdk = new KswapSdk(KSWAP_API, c.rpc, c.wsRpc);

  const collTokenMint = JLP_MINT;
  const debtTokenMint = USDC_MINT;
  const collReserveAddress = JLP_RESERVE_JLP_MARKET;
  const debtReserveAddress = USDC_RESERVE_JLP_MARKET;
  // const vaultType = 'multiply';
  const leverage = 3; // 3x leverage/ 3x multiply
  const amountToDeposit = new Decimal(5); // 5 USDC
  const slippageBps = 30;
  // Ask KSwap to prefer routes with fewer accounts so the combined deposit+borrow+flash+swap tx fits within the
  // 64-account-lock limit. An array requests route options at each budget (the best-simulating one is then picked).
  const preferredMaxAccounts = [16, 26, 36];
  // Optional: set to 'coll' or 'debt' to override which token is flash borrowed (default: 'coll' for deposit)
  const flashBorrowType: FlashBorrowType | undefined = getFlashBorrowTypeFromEnv();

  const kaminoResources = await getKaminoResources();

  const multiplyColPairs = kaminoResources.multiplyLUTsPairs[collTokenMint] || {};
  const multiplyLut = multiplyColPairs[debtTokenMint] || [];
  const multiplyLutKeys = multiplyLut.map((lut) => address(lut));

  const multiplyReserveAddresses: { coll: Address; debt: Address }[] = [
    { coll: collReserveAddress, debt: debtReserveAddress },
  ];
  const leverageReserveAddresses: { coll: Address; debt: Address }[] = [];
  multiplyReserveAddresses.push({
    coll: collReserveAddress,
    debt: debtReserveAddress,
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

  await executeUserSetupLutsTransactions(c, wallet, txsIxs);

  const obligationType = new MultiplyObligation(collTokenMint, debtTokenMint, PROGRAM_ID); // new LeverageObligation(collTokenMint, debtTokenMint, PROGRAM_ID); for leverage
  const obligationAddress = await obligationType.toPda(market.getAddress(), wallet.address);

  const currentLedgerInstant = await getCurrentLedgerInstant(c.rpc, 'processed');

  const collTokenReserve = market.getExistingReserveByAddress(collReserveAddress);
  const debtTokenReserve = market.getExistingReserveByAddress(debtReserveAddress);
  const obligation = await market.getObligationByAddress(obligationAddress)!;

  const scopeConfiguration = { scope, scopeConfigurations: await scope.getAllConfigurations() };
  const scopeRefreshIx = await getScopeRefreshIxForObligationAndReserves(
    market,
    collTokenReserve!,
    debtTokenReserve!,
    obligation!,
    scopeConfiguration
  );

  // Price A in B callback can be defined in different ways. Here we use jupiter price API
  const getPriceAinB = async (tokenAMint: Address, tokenBMint: Address): Promise<Decimal> => {
    const price = await getTokenPriceFromBirdeye(kswapSdk, tokenAMint, tokenBMint);
    return new Decimal(price);
  };

  const priceDebtToColl = await getPriceAinB(debtTokenMint, collTokenMint);

  console.log('Price debt to coll', priceDebtToColl.toString());

  const computeIxs = getComputeBudgetAndPriorityFeeIxs(1_400_000, new Decimal(500000));

  const depositWithLeverageRoutes = await getDepositWithLeverageIxs({
    owner: wallet,
    kaminoMarket: market,
    debtReserveAddress: debtReserveAddress,
    collReserveAddress: collReserveAddress,
    depositAmount: amountToDeposit,
    priceDebtToColl: priceDebtToColl,
    slippagePct: new Decimal(slippageBps / 100),
    obligation: null, // obligation does not exist as we are creating it with this deposit
    referrer: none(),
    currentLedgerInstant,
    targetLeverage: new Decimal(leverage),
    selectedTokenMint: debtTokenMint, // the token we are using to deposit
    obligationTypeTagOverride: ObligationTypeTag.Multiply, // or leverage
    scopeRefreshIx,
    budgetAndPriorityFeeIxs: computeIxs,
    quoteBufferBps: new Decimal(JUP_QUOTE_BUFFER_BPS),
    quoter: getKswapQuoter(
      kswapSdk,
      wallet.address,
      slippageBps,
      debtTokenReserve,
      collTokenReserve,
      preferredMaxAccounts
    ), // IMPORTANT!: For deposit the input mint is the debt token mint and the output mint is the collateral token
    swapper: getKswapSwapper(kswapSdk, wallet.address, slippageBps, preferredMaxAccounts),
    useV2Ixs: true,
    rollOver: false,
    flashBorrowType,
  });

  console.log(`depositWithLeverageRoutes length`, depositWithLeverageRoutes.length);

  // Pick the best route by simulation, merging all LUT sources so dense KSwap routes fit within account-lock limits:
  // KLend market LUT + user LUT + the public-API multiply LUTs + each route's own LUTs + the find-minimal LUTs that
  // `executeBestSimulatingRoute` fetches per route. This is what fixes `TooManyAccountLocks` on multi-hop routes, and
  // it reports per-route failures cleanly instead of crashing when none pass.
  await executeBestSimulatingRoute({
    connection: c,
    wallet,
    routes: depositWithLeverageRoutes,
    marketLookupTableAddress: JLP_MARKET_LUT,
    userLookupTableAddress: userLookupTable,
    swapPairLookupTableAddresses: multiplyLutKeys,
    extraLookupTables: [],
    send: true,
    description: 'depositWithLeverage',
    // Prefer the route with the best guaranteed swap price (output per input).
    scoreRoute: (route) => {
      const quote = route.quote;
      if (!quote) {
        return 0;
      }
      const inReserve =
        route.swapInputs.inputMint === collTokenReserve.getLiquidityMint() ? collTokenReserve : debtTokenReserve;
      const outReserve =
        route.swapInputs.outputMint === collTokenReserve.getLiquidityMint() ? collTokenReserve : debtTokenReserve;
      const inAmount = new Decimal(quote.amountsExactIn.amountIn.toString()).div(inReserve.getMintFactor());
      const outAmount = new Decimal(quote.amountsExactIn.amountOutGuaranteed.toString()).div(
        outReserve.getMintFactor()
      );
      return inAmount.isZero() ? 0 : outAmount.div(inAmount).toNumber();
    },
    printRoute: (route, routeIndex) => {
      console.log(`Route ${routeIndex} router: ${route.quote?.routerType}`);
    },
  });
})().catch(async (e) => {
  console.error(e);
});
