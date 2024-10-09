import { Kamino, StrategyWithAddress } from '@kamino-finance/kliquidity-sdk';
import { KaminoMarket, KaminoReserve, lamportsToNumberDecimal } from '../classes';
import { Connection, PublicKey, TransactionInstruction } from '@solana/web3.js';
import Decimal from 'decimal.js';
import { getLookupTableAccounts, getTokenAccountBalanceDecimal } from '../utils';
import { numberToLamportsDecimal } from '../classes/utils';
import BN from 'bn.js';
import { PriceAinBProvider, SwapInputs, SwapQuote, SwapQuoteIxs, SwapQuoteIxsProvider } from './types';

export interface KaminoSwapperIxBuilder {
  (
    input: DepositAmountsForSwap,
    tokenAMint: PublicKey,
    tokenBMint: PublicKey,
    owner: PublicKey,
    slippage: Decimal,
    allKeys: PublicKey[]
  ): Promise<[TransactionInstruction[], PublicKey[]]>;
}

export interface DepositAmountsForSwap {
  requiredAAmountToDeposit: Decimal;
  requiredBAmountToDeposit: Decimal;
  tokenAToSwapAmount: Decimal;
  tokenBToSwapAmount: Decimal;
}

export async function getTokenToKtokenSwapper<QuoteResponse>(
  kaminoMarket: KaminoMarket,
  kamino: Kamino,
  depositor: PublicKey,
  slippagePct: Decimal,
  swapper: SwapQuoteIxsProvider<QuoteResponse>,
  priceAinB: PriceAinBProvider,
  includeAtaIxns: boolean = true
): Promise<SwapQuoteIxsProvider<QuoteResponse>> {
  return async (
    inputs: SwapInputs,
    klendAccounts: Array<PublicKey>,
    quote: SwapQuote<QuoteResponse>
  ): Promise<SwapQuoteIxs> => {
    const slippageBps = new Decimal(slippagePct).mul('100');
    const mintInDecimals = kaminoMarket.getReserveByMint(inputs.inputMint)!.state.liquidity.mintDecimals.toNumber();
    const amountIn = lamportsToNumberDecimal(inputs.inputAmountLamports, mintInDecimals);
    console.debug('Depositing token', inputs.inputMint.toString(), ' for ', inputs.outputMint.toString(), 'ktoken');
    if (inputs.amountDebtAtaBalance === undefined) {
      throw Error('Amount in debt ATA balance is undefined for leverage ktoken deposit');
    }

    const ixWithLookup = (await getKtokenDepositIxs(
      kaminoMarket.getConnection(),
      kamino,
      depositor,
      inputs.inputMint,
      inputs.outputMint,
      amountIn,
      slippageBps,
      inputs.amountDebtAtaBalance,
      swapper,
      priceAinB,
      includeAtaIxns,
      klendAccounts,
      quote
    ))!;

    const luts = await getLookupTableAccounts(kaminoMarket.getConnection(), ixWithLookup.lookupTablesAddresses);

    return {
      preActionIxs: [],
      swapIxs: ixWithLookup.instructions,
      lookupTables: luts,
    };
  };
}

export async function getKtokenDepositIxs<QuoteResponse>(
  connection: Connection,
  kamino: Kamino,
  depositor: PublicKey,
  depositTokenMint: PublicKey,
  ktokenMint: PublicKey,
  amountToDeposit: Decimal,
  slippageBps: Decimal,
  amountExpectedDepositAtaBalance: Decimal,
  swapper: SwapQuoteIxsProvider<QuoteResponse>,
  priceAinB: PriceAinBProvider,
  includeAtaIxns: boolean = true,
  klendAccounts: Array<PublicKey>,
  quote: SwapQuote<QuoteResponse>
) {
  const kaminoStrategy = await kamino.getStrategyByKTokenMint(ktokenMint);
  const tokenAMint = kaminoStrategy?.strategy.tokenAMint!;
  const tokenBMint = kaminoStrategy?.strategy.tokenBMint!;
  const priceAinBDecimal = await priceAinB(tokenAMint, tokenBMint);

  if (tokenAMint.equals(depositTokenMint)) {
    const bBalance = await getTokenAccountBalanceDecimal(connection, tokenBMint, depositor);
    const tokensBalances = { a: amountExpectedDepositAtaBalance, b: bBalance };
    console.log('amountToDeposit', amountToDeposit);
    return await kamino.singleSidedDepositTokenA(
      kaminoStrategy!,
      amountToDeposit,
      depositor,
      slippageBps,
      undefined,
      swapProviderToKaminoSwapProvider(swapper, klendAccounts, quote),
      tokensBalances,
      priceAinBDecimal,
      includeAtaIxns
    );
  } else if (tokenBMint.equals(depositTokenMint)) {
    const aBalance = await getTokenAccountBalanceDecimal(connection, tokenAMint, depositor);
    const tokensBalances = { a: aBalance, b: amountExpectedDepositAtaBalance };
    return await kamino.singleSidedDepositTokenB(
      kaminoStrategy!,
      amountToDeposit,
      depositor,
      slippageBps,
      undefined,
      swapProviderToKaminoSwapProvider(swapper, klendAccounts, quote),
      tokensBalances,
      priceAinBDecimal,
      includeAtaIxns
    );
  } else {
    throw Error('Deposit token is neither A nor B in the strategy');
  }
}

export async function getKtokenToTokenSwapper<QuoteResponse>(
  kaminoMarket: KaminoMarket,
  kamino: Kamino,
  depositor: PublicKey,
  swapper: SwapQuoteIxsProvider<QuoteResponse>
): Promise<SwapQuoteIxsProvider<QuoteResponse>> {
  return async (inputs: SwapInputs, klendAccounts: Array<PublicKey>, quote: SwapQuote<QuoteResponse>) => {
    const amountInDecimals = kaminoMarket.getReserveByMint(inputs.inputMint)!.state.liquidity.mintDecimals.toNumber();
    const amountToWithdraw = lamportsToNumberDecimal(inputs.inputAmountLamports, amountInDecimals);
    const kaminoStrategy = await kamino.getStrategyByKTokenMint(inputs.inputMint);

    console.log('Withdrawing ktoken', inputs.inputMint.toString(), ' for ', inputs.outputMint.toString(), 'token');

    const ixWithdraw = (await getKtokenWithdrawIxs(kamino, depositor, kaminoStrategy!, amountToWithdraw))!;

    const [estimatedAOut, estimatedBOut] = await getKtokenWithdrawEstimatesAndPrice(
      kamino,
      kaminoStrategy!,
      amountToWithdraw
    );

    if (inputs.outputMint.equals(kaminoStrategy!.strategy.tokenAMint!)) {
      const { swapIxs, lookupTables } = await swapper(
        {
          inputAmountLamports: estimatedBOut,
          inputMint: kaminoStrategy!.strategy.tokenBMint!,
          outputMint: kaminoStrategy!.strategy.tokenAMint!,
          amountDebtAtaBalance: new Decimal(0),
        },
        klendAccounts,
        quote
      );

      return {
        preActionIxs: [],
        swapIxs: [...ixWithdraw.prerequisiteIxs, ixWithdraw.withdrawIx, ...swapIxs],
        lookupTables,
      };
    } else if (inputs.outputMint.equals(kaminoStrategy!.strategy.tokenBMint!)) {
      const { swapIxs, lookupTables } = await swapper(
        {
          inputAmountLamports: estimatedAOut,
          inputMint: kaminoStrategy!.strategy.tokenAMint!,
          outputMint: kaminoStrategy!.strategy.tokenBMint!,
          amountDebtAtaBalance: new Decimal(0),
        },
        klendAccounts,
        quote
      );

      return {
        preActionIxs: [],
        swapIxs: [...ixWithdraw.prerequisiteIxs, ixWithdraw.withdrawIx, ...swapIxs],
        lookupTables,
      };
    } else {
      throw Error('Deposit token is neither A nor B in the strategy');
    }
  };
}

export async function getKtokenWithdrawIxs(
  kamino: Kamino,
  withdrawer: PublicKey,
  kaminoStrategy: StrategyWithAddress,
  amountToWithdraw: Decimal
) {
  return await kamino.withdrawShares(kaminoStrategy!, amountToWithdraw, withdrawer);
}

export async function getKtokenWithdrawEstimatesAndPrice(
  kamino: Kamino,
  kaminoStrategy: StrategyWithAddress,
  amountToWithdraw: Decimal
) {
  const sharesData = await kamino.getStrategyShareData(kaminoStrategy);
  const withdrawPct = amountToWithdraw
    .div(
      lamportsToNumberDecimal(
        new Decimal(kaminoStrategy.strategy.sharesIssued.toString()),
        kaminoStrategy.strategy.sharesMintDecimals.toNumber()
      )
    )
    .toDecimalPlaces(18);

  const withdrawFee = new Decimal(10_000).sub(new Decimal(kaminoStrategy.strategy.withdrawFee.toString()));

  // TODO: Mihai/Marius improve - currently subtracting due to decimal accuracy issues compared to yvaults SC
  // for both A and B op: .sub(0.000002)

  const estimatedAOut = sharesData.balance.computedHoldings.invested.a
    .add(sharesData.balance.computedHoldings.available.a)
    .mul(withdrawPct)
    .toDecimalPlaces(kaminoStrategy.strategy.tokenAMintDecimals.toNumber(), 1)
    .sub(0.000002)
    .mul(withdrawFee)
    .div(10_000)
    .toDecimalPlaces(kaminoStrategy.strategy.tokenAMintDecimals.toNumber());

  const estimatedAOutDecimal = numberToLamportsDecimal(
    estimatedAOut,
    kaminoStrategy.strategy.tokenAMintDecimals.toNumber()
  ).floor();

  const estimatedBOut = sharesData.balance.computedHoldings.invested.b
    .add(sharesData.balance.computedHoldings.available.b)
    .mul(withdrawPct)
    .toDecimalPlaces(kaminoStrategy.strategy.tokenBMintDecimals.toNumber(), 1)
    .sub(0.000002)
    .mul(withdrawFee)
    .div(10_000)
    .toDecimalPlaces(kaminoStrategy.strategy.tokenAMintDecimals.toNumber());

  const estimatedBOutDecimal = numberToLamportsDecimal(
    estimatedBOut,
    kaminoStrategy.strategy.tokenBMintDecimals.toNumber()
  ).floor();

  console.log('a-out', estimatedAOutDecimal.toString());
  console.log('b-out', estimatedBOut.toString());
  return [estimatedAOutDecimal, estimatedBOutDecimal];
}

export function swapProviderToKaminoSwapProvider<QuoteResponse>(
  swapper: SwapQuoteIxsProvider<QuoteResponse>,
  klendAccounts: Array<PublicKey>,
  swapQuote: SwapQuote<QuoteResponse>
): KaminoSwapperIxBuilder {
  return async (
    input: DepositAmountsForSwap,
    tokenAMint: PublicKey,
    tokenBMint: PublicKey,
    _owner: PublicKey,
    _slippage: Decimal,
    _allKeys: PublicKey[]
  ): Promise<[TransactionInstruction[], PublicKey[]]> => {
    if (input.tokenBToSwapAmount.lt(0)) {
      const swapperIxs = await swapper(
        {
          inputAmountLamports: input.tokenBToSwapAmount.abs(),
          inputMint: tokenBMint,
          outputMint: tokenAMint,
          amountDebtAtaBalance: undefined,
        },
        klendAccounts,
        swapQuote
      );
      return [swapperIxs.swapIxs, swapperIxs.lookupTables.map((lt) => lt.key)];
    } else if (input.tokenAToSwapAmount.lt(0)) {
      const swapperIxs = await swapper(
        {
          inputAmountLamports: input.tokenAToSwapAmount.abs(),
          inputMint: tokenAMint,
          outputMint: tokenBMint,
          amountDebtAtaBalance: undefined,
        },
        klendAccounts,
        swapQuote
      );
      return [swapperIxs.swapIxs, swapperIxs.lookupTables.map((lt) => lt.key)];
    } else {
      throw Error('Nothing to swap');
    }
  };
}

export const getExpectedTokenBalanceAfterBorrow = async (
  connection: Connection,
  mint: PublicKey,
  owner: PublicKey,
  amountToBorrowLamports: Decimal,
  amountToBorrowmintDecimals: number
) => {
  const initialUserTokenABalance = await getTokenAccountBalanceDecimal(connection, mint, owner);

  return initialUserTokenABalance
    .add(lamportsToNumberDecimal(amountToBorrowLamports, amountToBorrowmintDecimals))
    .toDecimalPlaces(amountToBorrowmintDecimals);
};

export const isBorrowingEnabled = (reserve: KaminoReserve) => {
  return reserve.state.config.borrowLimit.gt(new BN(0));
};
