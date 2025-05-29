import { BN } from '@coral-xyz/anchor';
import {
  KaminoReserve,
  SwapInputs,
  SwapQuote,
  SwapIxs,
  SwapIxsProvider,
  SwapQuoteProvider,
} from '@kamino-finance/klend-sdk';
import { KswapSdk, RouteOutput, RouteParams, RouterType } from '@kamino-finance/kswap-sdk/dist';
import { PublicKey } from '@solana/web3.js';
import Decimal from 'decimal.js';

export const KSWAP_API = 'https://api.kamino.finance/kswap';
const ALLOWED_ROUTERS: RouterType[] = ['dflow', 'jupiter', 'jupiterU', 'okx', 'jupiterLite'];

export async function getTokenPriceFromJupWithFallback(
  kswapSdk: KswapSdk,
  inputMint: PublicKey | string,
  outputMint: PublicKey | string
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
  inputMint: PublicKey | string,
  outputMint: PublicKey | string
): Promise<number> {
  const prices = await kswapSdk.getBatchTokenPrices([new PublicKey(inputMint), new PublicKey(outputMint)]);

  return prices[inputMint.toString()] / prices[outputMint.toString()];
}

export function getKswapQuoter(
  kswapSdk: KswapSdk,
  executor: PublicKey,
  slippageBps: number,
  inputMintReserve: KaminoReserve,
  outputMintReserve: KaminoReserve
): SwapQuoteProvider<RouteOutput> {
  const quoter: SwapQuoteProvider<RouteOutput> = async (
    inputs: SwapInputs,
    klendAccounts: Array<PublicKey>
  ): Promise<SwapQuote<RouteOutput>> => {
    const routeParams: RouteParams = {
      executor: executor,
      tokenIn: inputs.inputMint,
      tokenOut: inputs.outputMint,
      amount: new BN(inputs.inputAmountLamports.toDP(0).toString()),
      maxSlippageBps: slippageBps,
      wrapAndUnwrapSol: false,
      swapType: 'exactIn',
      routerTypes: ALLOWED_ROUTERS,
      includeRfq: false,
      includeLimoLogs: false,
    };

    const routeOutputs = await kswapSdk.getAllRoutes(routeParams);

    const bestRoute = routeOutputs.reduce((best, current) => {
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
    const minAmountOutBest = new Decimal(bestRoute.amountsExactIn.amountOutGuaranteed.toString()).div(
      outputMintReserve.getMintFactor()
    );
    const priceAInBBest = minAmountOutBest.div(inAmountBest);

    return {
      priceAInB: priceAInBBest,
      quoteResponse: bestRoute,
    };
  };

  return quoter;
}

export function getKswapSwapper(
  kswapSdk: KswapSdk,
  executor: PublicKey,
  slippageBps: number
): SwapIxsProvider<RouteOutput> {
  const swapper: SwapIxsProvider<RouteOutput> = async (
    inputs: SwapInputs,
    klendAccounts: Array<PublicKey>,
    quote: SwapQuote<RouteOutput>
  ): Promise<Array<SwapIxs<RouteOutput>>> => {
    const routeParams: RouteParams = {
      executor: executor,
      tokenIn: inputs.inputMint,
      tokenOut: inputs.outputMint,
      amount: new BN(inputs.inputAmountLamports.toString()),
      maxSlippageBps: slippageBps,
      wrapAndUnwrapSol: false,
      swapType: 'exactIn',
      routerTypes: ALLOWED_ROUTERS,
      includeRfq: false,
      includeLimoLogs: false,
    };

    const routeOutputs = await kswapSdk.getAllRoutes(routeParams);

    return routeOutputs.map((routeOutput) => {
      const inAmount = new Decimal(routeOutput.amountsExactIn.amountIn.toString()).div(routeOutput.inputTokenDecimals!);
      const minAmountOut = new Decimal(routeOutput.amountsExactIn.amountOutGuaranteed.toString()).div(
        routeOutput.outputTokenDecimals!
      );
      const priceAInB = minAmountOut.div(inAmount);
      return {
        preActionIxs: [],
        swapIxs: routeOutput.ixsRouter!,
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
