import {
  KaminoReserve,
  SwapInputs,
  SwapQuote,
  SwapIxs,
  SwapIxsProvider,
  SwapQuoteProvider,
} from '@kamino-finance/klend-sdk';
import { AddressLookupTableAccount, Connection, PublicKey, TransactionInstruction } from '@solana/web3.js';
import axios from 'axios';
import {
  createJupiterApiClient,
  Instruction,
  QuoteGetRequest,
  QuoteResponse,
  ResponseError,
  SwapInfo,
  SwapInstructionsPostRequest,
  SwapInstructionsResponse,
  SwapMode,
} from '@jup-ag/api/dist/index.js';
import Decimal from 'decimal.js';

const DEFAULT_MAX_ACCOUNTS_BUFFER = 2;
const MAX_LOCKED_ACCOUNTS = 64;
const JUPITER_PRICE_API = 'https://lite-api.jup.ag/price/v2';
const JUPITER_SWAP_API = 'https://lite-api.jup.ag/swap/v1';

const swapApiClient = createJupiterApiClient({
  basePath: JUPITER_SWAP_API,
});

export type ErrorBody = {
  error: string;
  error_code: string;
};

export type SwapTxResponse = {
  swapTxs: SwapTxs;
  swapLookupTableAccounts: AddressLookupTableAccount[];
  swapResponse: SwapResponse;
};

export type SwapResponse = {
  swapInAmountLamports: Decimal;
  swapOutAmountLamports: Decimal;
  swapMinOutAmountLamports: Decimal;
};

export type SwapTxs = {
  setupIxs: TransactionInstruction[];
  swapIxs: TransactionInstruction[];
  cleanupIxs: TransactionInstruction[];
};

export async function getJupiterPrice(inputMint: PublicKey | string, outputMint: PublicKey | string): Promise<number> {
  const params = {
    ids: inputMint.toString(),
    vsToken: outputMint.toString(),
  };

  const res = await axios.get(JUPITER_PRICE_API, { params });
  return res.data.data[inputMint.toString()]?.price || 0;
}

export type SwapConfig = {
  txAccounts?: Set<string>;
  txAccountsBuffer?: number;
  onlyDirectRoutes?: boolean;
  wrapAndUnwrapSol?: boolean;
  slippageBps: number;
  destinationTokenAccount?: PublicKey;
  feePerCULamports?: Decimal;
  swapMode?: SwapMode;
  useTokenLedger?: boolean;
};

async function quote(
  inputMint: PublicKey,
  outputMint: PublicKey,
  amountLamports: Decimal,
  { swapMode = SwapMode.ExactIn, onlyDirectRoutes = true, slippageBps }: SwapConfig,
  maxAccs?: number
): Promise<QuoteResponse> {
  try {
    const quoteParameters: QuoteGetRequest = {
      inputMint: inputMint.toBase58(),
      outputMint: outputMint.toBase58(),
      amount: amountLamports.floor().toNumber(),
      slippageBps: slippageBps,
      onlyDirectRoutes,
      swapMode,
      ...(maxAccs ? { maxAccounts: maxAccs } : {}),
    };
    return await swapApiClient.quoteGet(quoteParameters);
  } catch (e) {
    if (e instanceof ResponseError) {
      const body = (await e.response.json()) as ErrorBody;
      throw new JupQuoteResponseError(e, body);
    }
    throw e;
  }
}

export function getJupiterQuoter(
  slippageBps: number,
  inputMintReserve: KaminoReserve,
  outputMintReserve: KaminoReserve
) {
  const maxAccsBuffer = 2;

  const quoter: SwapQuoteProvider<QuoteResponse> = async (
    inputs: SwapInputs,
    klendAccounts: Array<PublicKey>
  ): Promise<SwapQuote<QuoteResponse>> => {
    const txAccs = new Set(...klendAccounts.map((a) => a.toBase58()));
    const maxAccounts = getMaxAccountsWithBuffer(txAccs.size, maxAccsBuffer);
    const quoteResponse = await quote(
      inputs.inputMint,
      inputs.outputMint,
      inputs.inputAmountLamports,
      {
        slippageBps: slippageBps,
        wrapAndUnwrapSol: false,
        onlyDirectRoutes: false,
      },
      maxAccounts
    );

    const inAmount = new Decimal(quoteResponse.inAmount).div(inputMintReserve.getMintFactor());
    const minAmountOut = new Decimal(quoteResponse.otherAmountThreshold).div(outputMintReserve.getMintFactor());
    const priceAInB = minAmountOut.div(inAmount);

    return {
      priceAInB,
      quoteResponse,
    };
  };

  return quoter;
}

export function getJupiterSwapper(connection: Connection, payer: PublicKey): SwapIxsProvider<QuoteResponse> {
  const swapper: SwapIxsProvider<QuoteResponse> = async (
    inputs: SwapInputs,
    klendAccounts: Array<PublicKey>,
    quote: SwapQuote<QuoteResponse>
  ): Promise<Array<SwapIxs<QuoteResponse>>> => {
    const scaledQuoteResponse = scaleJupQuoteResponse(quote.quoteResponse!, new Decimal(inputs.inputAmountLamports));
    const { swapTxs, swapLookupTableAccounts } = await swapTxFromQuote(connection, payer, scaledQuoteResponse, {
      slippageBps: 100,
      wrapAndUnwrapSol: false,
    });
    return [
      {
        preActionIxs: [],
        swapIxs: [...swapTxs.setupIxs, ...swapTxs.swapIxs, ...swapTxs.cleanupIxs],
        lookupTables: swapLookupTableAccounts,
        quote: {
          priceAInB: new Decimal(quote.priceAInB),
          quoteResponse: scaledQuoteResponse,
        },
      },
    ];
  };

  return swapper;
}

async function swapTxFromQuote(
  connection: Connection,
  payer: PublicKey,
  quote: QuoteResponse,
  swapConfig: SwapConfig
): Promise<SwapTxResponse> {
  let swap: SwapInstructionsResponse;
  try {
    const swapParameters: SwapInstructionsPostRequest = {
      swapRequest: {
        userPublicKey: payer.toBase58(),
        quoteResponse: quote,
        computeUnitPriceMicroLamports:
          swapConfig.feePerCULamports
            ?.mul(10 ** 6)
            .ceil()
            .toNumber() ?? 1,
        wrapAndUnwrapSol: swapConfig?.wrapAndUnwrapSol ?? false,
        destinationTokenAccount: swapConfig?.destinationTokenAccount?.toBase58() ?? undefined,
      },
    };
    swap = await swapApiClient.swapInstructionsPost(swapParameters);
  } catch (e) {
    if (e instanceof ResponseError) {
      const body = (await e.response.json()) as ErrorBody;
      throw new JupSwapResponseError(e, body);
    }
    throw e;
  }
  const swapLookupTableAccounts = await getLookupTableAccountsFromKeys(
    connection,
    swap.addressLookupTableAddresses.map((k) => new PublicKey(k))
  );

  const swapIxs = [transformResponseIx(swap.swapInstruction)];
  return {
    swapTxs: {
      setupIxs: transformResponseIxs(swap.setupInstructions),
      swapIxs,
      cleanupIxs: transformResponseIxs(swap.cleanupInstruction ? [swap.cleanupInstruction] : []),
    },
    swapLookupTableAccounts,
    swapResponse: {
      swapInAmountLamports:
        swapConfig.swapMode === SwapMode.ExactIn ? new Decimal(quote.inAmount) : new Decimal(quote.outAmount),
      swapOutAmountLamports: new Decimal(quote.outAmount),
      swapMinOutAmountLamports: new Decimal(quote.otherAmountThreshold),
    },
  };
}

export function scaleJupQuoteResponse(ogQuote: QuoteResponse, swapInputAmountLamports: Decimal): QuoteResponse {
  const ogInLamports = new Decimal(ogQuote.inAmount);
  const ogOutLamports = new Decimal(ogQuote.outAmount);
  const ogOtherAmountThreshold = new Decimal(ogQuote.otherAmountThreshold);
  const scale = swapInputAmountLamports.div(ogInLamports);
  const scaledOutLamports = ogOutLamports.mul(scale).floor();
  const scaledOtherAmountThreshold = ogOtherAmountThreshold.mul(scale).floor();
  const newRoutes = ogQuote.routePlan.map((r) => {
    const ogSwapInfo = r.swapInfo;
    const newSwapInfo: SwapInfo = {
      ...ogSwapInfo,
      inAmount: new Decimal(r.swapInfo.inAmount).mul(scale).ceil().toString(),
      outAmount: new Decimal(r.swapInfo.outAmount).mul(scale).floor().toString(),
      feeAmount: new Decimal(r.swapInfo.feeAmount).mul(scale).ceil().toString(),
    };
    return {
      ...r,
      swapInfo: newSwapInfo,
    };
  });
  const newQuote = {
    ...ogQuote,
    inAmount: swapInputAmountLamports.toString(),
    outAmount: scaledOutLamports.toString(),
    otherAmountThreshold: scaledOtherAmountThreshold.toString(),
    routePlan: newRoutes,
  };
  return newQuote;
}

export function getMaxAccountsWithBuffer(
  numberOfUniqueAccs: number,
  buffer: number = DEFAULT_MAX_ACCOUNTS_BUFFER
): number {
  return maxLockedAccounts(numberOfUniqueAccs + buffer);
}

export function maxLockedAccounts(count: number): number {
  return MAX_LOCKED_ACCOUNTS - count;
}

/**
 * Wrapper to read the response body multiple times
 */
export class JupQuoteResponseError extends Error {
  err: ResponseError;
  body: ErrorBody;

  constructor(err: ResponseError, body: ErrorBody) {
    super(
      `Received ${err.response.statusText} (${err.response.status}) error response for jup quote. Request url: ${
        err.response.url
      } \nResponse body:\n${JSON.stringify(body, null, 2)}`
    );
    this.err = err;
    this.body = body;
  }
}

/**
 * Wrapper to read the response body multiple times
 */
export class JupSwapResponseError extends Error {
  err: ResponseError;
  body: ErrorBody;

  constructor(err: ResponseError, body: ErrorBody) {
    super(
      `Received ${err.response.statusText} (${err.response.status}) error response for jup swap. Request url: ${
        err.response.url
      } \nResponse body:\n${JSON.stringify(body, null, 2)}`
    );
    this.err = err;
    this.body = body;
  }
}

export const getLookupTableAccountsFromKeys = async (
  connection: Connection,
  keys: PublicKey[]
): Promise<AddressLookupTableAccount[]> => {
  const lookupTableAccounts: AddressLookupTableAccount[] = [];

  for (const lookupTable of keys) {
    const lookupTableAccount = await connection
      .getAddressLookupTable(new PublicKey(lookupTable))
      .then((res) => res.value);

    if (!lookupTableAccount) {
      throw new Error('lookup table is not found');
    }

    lookupTableAccounts.push(lookupTableAccount);
  }

  return lookupTableAccounts;
};

export function transformResponseIx(ix: Instruction): TransactionInstruction {
  return new TransactionInstruction({
    programId: new PublicKey(ix.programId),
    keys: ix.accounts.map((k) => ({
      pubkey: new PublicKey(k.pubkey),
      isSigner: k.isSigner,
      isWritable: k.isWritable,
    })),
    data: ix.data ? Buffer.from(ix.data, 'base64') : undefined,
  });
}

export function transformResponseIxs(ixs: Instruction[]): TransactionInstruction[] {
  return ixs.map((ix) => transformResponseIx(ix));
}
