import BN from 'bn.js';
import {
  KaminoReserve,
  SwapInputs,
  SwapQuote,
  SwapIxs,
  SwapIxsProvider,
  SwapQuoteProvider,
} from '@kamino-finance/klend-sdk';
import { KswapSdk, RouteOutput, RouteParams, RouterType } from '@kamino-finance/kswap-sdk';
import { loadRouterContext } from '@kamino-finance/kswap-sdk/src/swap_api_utils/RouterContext';
import Decimal from 'decimal.js';
import { Address } from '@solana/kit';

export const KSWAP_API = 'https://api.kamino.finance/kswap';
const ALLOWED_ROUTERS: RouterType[] = ['dflow', 'metis', 'jupiterEuropa', 'okx', 'spur', 'lifi', 'titan'];

export async function getTokenPriceFromJupWithFallback(
  kswapSdk: KswapSdk,
  inputMint: Address,
  outputMint: Address
): Promise<number> {
  const params = {
    ids: inputMint.toString(),
    vsToken: outputMint.toString(),
  };
  const res = await kswapSdk.getJupiterPriceWithFallback(params);

  return Number(res.data[inputMint.toString()]?.price || 0);
}

export async function getTokenPriceFromBirdeye(
  kswapSdk: KswapSdk,
  inputMint: Address,
  outputMint: Address
): Promise<number> {
  const prices = await kswapSdk.getBatchTokenPrices([inputMint, outputMint]);
  const inputPrice = prices.get(inputMint.toString())?.value;
  const outputPrice = prices.get(outputMint.toString())?.value;

  if (!inputPrice || !Number.isFinite(inputPrice)) {
    throw new Error(`Missing KSwap/Birdeye price for input token ${inputMint}`);
  }
  if (!outputPrice || !Number.isFinite(outputPrice)) {
    throw new Error(`Missing KSwap/Birdeye price for output token ${outputMint}`);
  }

  return inputPrice / outputPrice;
}

export function getKswapQuoter(
  kswapSdk: KswapSdk,
  executor: Address,
  slippageBps: number,
  inputMintReserve: KaminoReserve,
  outputMintReserve: KaminoReserve,
  preferredMaxAccounts?: number | number[]
): SwapQuoteProvider<RouteOutput> {
  const quoter: SwapQuoteProvider<RouteOutput> = async (
    inputs: SwapInputs,
    klendAccounts: Array<Address>
  ): Promise<SwapQuote<RouteOutput>> => {
    const routeParams: RouteParams = {
      executor,
      tokenIn: inputs.inputMint,
      tokenOut: inputs.outputMint,
      amount: decimalLamportsToBn(inputs.inputAmountLamports),
      maxSlippageBps: slippageBps,
      wrapAndUnwrapSol: false,
      swapType: 'exactIn',
      routerTypes: ALLOWED_ROUTERS,
      includeRfq: false,
      includeLimoLogs: false,
      preferredMaxAccounts,
    };

    const routerContext = await loadRouterContext(kswapSdk.connection, inputs.inputMint, inputs.outputMint);
    const routeOutputs = await kswapSdk.getAllRoutes(routeParams, routerContext);

    const bestRoute = routeOutputs.routes.reduce((best, current) => {
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
      return priceAInBBest.greaterThan(priceAInBCurrent) ? best : current;
    });

    const inAmountBest = new Decimal(bestRoute.amountsExactIn.amountIn.toString()).div(
      inputMintReserve.getMintFactor()
    );
    const guaranteedOutBest = new Decimal(bestRoute.amountsExactIn.amountOutGuaranteed.toString()).div(
      outputMintReserve.getMintFactor()
    );
    // SDK contract: the quoter returns the SIMULATED (mid) priceAInB; the SDK applies its own slippage sizing buffer.
    // KSwap's `amountOutGuaranteed` already bakes in `maxSlippageBps`, so divide it back out to recover the mid out —
    // otherwise slippage is applied twice (here AND in the SDK), over-sizing the swap input and rejecting valid routes.
    // (Route ranking above is unaffected: the retention factor is constant across routes.)
    const slippageRetention = new Decimal(1).sub(new Decimal(slippageBps).div(10000));
    const midOutBest = guaranteedOutBest.div(slippageRetention);
    const priceAInBBest = midOutBest.div(inAmountBest);

    return {
      priceAInB: priceAInBBest,
      quoteResponse: bestRoute,
    };
  };

  return quoter;
}

export function getKswapSwapper(
  kswapSdk: KswapSdk,
  executor: Address,
  slippageBps: number,
  preferredMaxAccounts?: number | number[]
): SwapIxsProvider<RouteOutput> {
  const swapper: SwapIxsProvider<RouteOutput> = async (
    inputs: SwapInputs,
    klendAccounts: Array<Address>,
    quote: SwapQuote<RouteOutput>
  ): Promise<Array<SwapIxs<RouteOutput>>> => {
    const routeParams: RouteParams = {
      executor,
      tokenIn: inputs.inputMint,
      tokenOut: inputs.outputMint,
      amount: decimalLamportsToBn(inputs.inputAmountLamports),
      maxSlippageBps: slippageBps,
      wrapAndUnwrapSol: false,
      swapType: 'exactIn',
      routerTypes: ALLOWED_ROUTERS,
      includeRfq: false,
      includeLimoLogs: false,
      preferredMaxAccounts,
    };

    const routerContext = await loadRouterContext(kswapSdk.connection, inputs.inputMint, inputs.outputMint);
    const routeOutputs = await kswapSdk.getAllRoutes(routeParams, routerContext);

    // SDK contract: the swapper's `quote.priceAInB` must be the SIMULATED (mid) price too — the swap-coll deposit
    // sizing applies the SDK slippage buffer on top of it (see `SwapQuote.priceAInB`). KSwap's `amountOutGuaranteed`
    // already bakes in `maxSlippageBps`, so divide it back out to recover the mid out; otherwise slippage is applied
    // twice (here AND in the SDK), under-sizing the target-coll deposit. Mirrors `getKswapQuoter`.
    const slippageRetention = new Decimal(1).sub(new Decimal(slippageBps).div(10000));
    return routeOutputs.routes.map((routeOutput) => {
      const inAmount = new Decimal(routeOutput.amountsExactIn.amountIn.toString()).div(
        new Decimal(10).pow(routeOutput.inputTokenDecimals!)
      );
      const guaranteedOut = new Decimal(routeOutput.amountsExactIn.amountOutGuaranteed.toString()).div(
        new Decimal(10).pow(routeOutput.outputTokenDecimals!)
      );
      const midOut = guaranteedOut.div(slippageRetention);
      const priceAInB = midOut.div(inAmount);

      return {
        preActionIxs: [],
        swapIxs: routeOutput.instructions!.swapIxs!,
        lookupTables: routeOutput.lookupTableAccounts!,
        quote: {
          priceAInB: new Decimal(priceAInB),
          quoteResponse: routeOutput,
        },
      };
    });
  };

  return swapper;
}

function decimalLamportsToBn(amountLamports: Decimal): BN {
  return new BN(amountLamports.toDecimalPlaces(0, Decimal.ROUND_FLOOR).toFixed(0));
}
