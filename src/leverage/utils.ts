import { Kamino, StrategyWithAddress } from '@kamino-finance/kliquidity-sdk';
import { KaminoMarket, KaminoReserve, lamportsToNumberDecimal } from '../classes';
import {
  Address,
  Instruction,
  GetAccountInfoApi,
  Rpc,
  GetTokenAccountBalanceApi,
  TransactionSigner,
} from '@solana/kit';
import Decimal from 'decimal.js';
import { getLookupTableAccounts, getTokenAccountBalanceDecimal } from '../utils';
import { numberToLamportsDecimal } from '../classes/utils';
import BN from 'bn.js';
import { PriceAinBProvider, SwapInputs, SwapQuote, SwapIxs, SwapIxsProvider } from './types';

export interface KaminoSwapperIxBuilder {
  (
    input: DepositAmountsForSwap,
    tokenAMint: Address,
    tokenBMint: Address,
    owner: TransactionSigner,
    slippage: Decimal,
    allKeys: Address[]
  ): Promise<[Instruction[], Address[]]>;
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
  depositor: TransactionSigner,
  slippagePct: Decimal,
  swapper: SwapIxsProvider<QuoteResponse>,
  priceAinB: PriceAinBProvider,
  includeAtaIxs: boolean = true
): Promise<SwapIxsProvider<QuoteResponse>> {
  return async (
    inputs: SwapInputs,
    klendAccounts: Array<Address>,
    quote: SwapQuote<QuoteResponse>
  ): Promise<Array<SwapIxs<QuoteResponse>>> => {
    const slippageBps = new Decimal(slippagePct).mul('100');
    const mintInDecimals = kaminoMarket.getExistingReserveByMint(inputs.inputMint).getMintDecimals();
    const amountIn = lamportsToNumberDecimal(inputs.inputAmountLamports, mintInDecimals);
    console.debug('Depositing token', inputs.inputMint, ' for ', inputs.outputMint, 'ktoken');
    if (inputs.amountDebtAtaBalance === undefined) {
      throw Error('Amount in debt ATA balance is undefined for leverage ktoken deposit');
    }

    const ixWithLookup = (await getKtokenDepositIxs(
      kaminoMarket.getRpc(),
      kamino,
      depositor,
      inputs.inputMint,
      inputs.outputMint,
      amountIn,
      slippageBps,
      inputs.amountDebtAtaBalance,
      swapper,
      priceAinB,
      includeAtaIxs,
      klendAccounts,
      quote
    ))!;

    const luts = await getLookupTableAccounts(kaminoMarket.getRpc(), ixWithLookup.lookupTablesAddresses);

    return [
      {
        preActionIxs: [],
        swapIxs: ixWithLookup.instructions,
        lookupTables: luts,
        // TODO: Ktoken only supports one swap at a time for now (to be updated if we enable ktokens)
        quote: {
          priceAInB: new Decimal(0),
          quoteResponse: undefined,
        },
      },
    ];
  };
}

export async function getKtokenDepositIxs<QuoteResponse>(
  rpc: Rpc<GetAccountInfoApi & GetTokenAccountBalanceApi>,
  kamino: Kamino,
  depositor: TransactionSigner,
  depositTokenMint: Address,
  ktokenMint: Address,
  amountToDeposit: Decimal,
  slippageBps: Decimal,
  amountExpectedDepositAtaBalance: Decimal,
  swapper: SwapIxsProvider<QuoteResponse>,
  priceAinB: PriceAinBProvider,
  includeAtaIxs: boolean = true,
  klendAccounts: Array<Address>,
  quote: SwapQuote<QuoteResponse>
) {
  const kaminoStrategy = await kamino.getStrategyByKTokenMint(ktokenMint);
  const tokenAMint = kaminoStrategy?.strategy.tokenAMint!;
  const tokenBMint = kaminoStrategy?.strategy.tokenBMint!;
  const priceAinBDecimal = await priceAinB(tokenAMint, tokenBMint);

  if (tokenAMint === depositTokenMint) {
    const bBalance = await getTokenAccountBalanceDecimal(rpc, tokenBMint, depositor.address);
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
      includeAtaIxs
    );
  } else if (tokenBMint === depositTokenMint) {
    const aBalance = await getTokenAccountBalanceDecimal(rpc, tokenAMint, depositor.address);
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
      includeAtaIxs
    );
  } else {
    throw Error('Deposit token is neither A nor B in the strategy');
  }
}

export async function getKtokenToTokenSwapper<QuoteResponse>(
  kaminoMarket: KaminoMarket,
  kamino: Kamino,
  depositor: TransactionSigner,
  swapper: SwapIxsProvider<QuoteResponse>
): Promise<SwapIxsProvider<QuoteResponse>> {
  return async (inputs: SwapInputs, klendAccounts: Array<Address>, quote: SwapQuote<QuoteResponse>) => {
    const amountInDecimals = kaminoMarket.getExistingReserveByMint(inputs.inputMint).getMintDecimals();
    const amountToWithdraw = lamportsToNumberDecimal(inputs.inputAmountLamports, amountInDecimals);
    const kaminoStrategy = await kamino.getStrategyByKTokenMint(inputs.inputMint);

    console.log('Withdrawing ktoken', inputs.inputMint.toString(), ' for ', inputs.outputMint.toString(), 'token');

    const ixWithdraw = (await getKtokenWithdrawIxs(kamino, depositor, kaminoStrategy!, amountToWithdraw))!;

    const [estimatedAOut, estimatedBOut] = await getKtokenWithdrawEstimatesAndPrice(
      kamino,
      kaminoStrategy!,
      amountToWithdraw
    );

    if (inputs.outputMint === kaminoStrategy!.strategy.tokenAMint!) {
      const swapArray = await swapper(
        {
          inputAmountLamports: estimatedBOut,
          inputMint: kaminoStrategy!.strategy.tokenBMint!,
          outputMint: kaminoStrategy!.strategy.tokenAMint!,
          amountDebtAtaBalance: new Decimal(0),
        },
        klendAccounts,
        quote
      );
      // TODO: Ktoken only supports one swap at a time for now (to be updated if we enable ktokens)
      const swap = swapArray[0];

      return [
        {
          preActionIxs: [],
          swapIxs: [...ixWithdraw.prerequisiteIxs, ixWithdraw.withdrawIx, ...swap.swapIxs],
          lookupTables: swap.lookupTables,
          quote: swap.quote,
        },
      ];
    } else if (inputs.outputMint === kaminoStrategy!.strategy.tokenBMint) {
      const swapArray = await swapper(
        {
          inputAmountLamports: estimatedAOut,
          inputMint: kaminoStrategy!.strategy.tokenAMint!,
          outputMint: kaminoStrategy!.strategy.tokenBMint!,
          amountDebtAtaBalance: new Decimal(0),
        },
        klendAccounts,
        quote
      );
      // TODO: Ktoken only supports one swap at a time for now (to be updated if we enable ktokens)
      const swap = swapArray[0];

      return [
        {
          preActionIxs: [],
          swapIxs: [...ixWithdraw.prerequisiteIxs, ixWithdraw.withdrawIx, ...swap.swapIxs],
          lookupTables: swap.lookupTables,
          quote: swap.quote,
        },
      ];
    } else {
      throw Error('Deposit token is neither A nor B in the strategy');
    }
  };
}

export async function getKtokenWithdrawIxs(
  kamino: Kamino,
  withdrawer: TransactionSigner,
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
  swapper: SwapIxsProvider<QuoteResponse>,
  klendAccounts: Array<Address>,
  swapQuote: SwapQuote<QuoteResponse>
): KaminoSwapperIxBuilder {
  return async (
    input: DepositAmountsForSwap,
    tokenAMint: Address,
    tokenBMint: Address,
    _owner: TransactionSigner,
    _slippage: Decimal,
    _allKeys: Address[]
  ): Promise<[Instruction[], Address[]]> => {
    if (input.tokenBToSwapAmount.lt(0)) {
      const swapperIxsArray = await swapper(
        {
          inputAmountLamports: input.tokenBToSwapAmount.abs(),
          inputMint: tokenBMint,
          outputMint: tokenAMint,
          amountDebtAtaBalance: undefined,
        },
        klendAccounts,
        swapQuote
      );
      // TODO: Ktoken only supports one swap at a time for now (to be updated if we enable ktokens)
      const swapperIxs = swapperIxsArray[0];
      return [swapperIxs.swapIxs, swapperIxs.lookupTables.map((lt) => lt.address)];
    } else if (input.tokenAToSwapAmount.lt(0)) {
      const swapperIxsArray = await swapper(
        {
          inputAmountLamports: input.tokenAToSwapAmount.abs(),
          inputMint: tokenAMint,
          outputMint: tokenBMint,
          amountDebtAtaBalance: undefined,
        },
        klendAccounts,
        swapQuote
      );
      // TODO: Ktoken only supports one swap at a time for now (to be updated if we enable ktokens)
      const swapperIxs = swapperIxsArray[0];
      return [swapperIxs.swapIxs, swapperIxs.lookupTables.map((lt) => lt.address)];
    } else {
      throw Error('Nothing to swap');
    }
  };
}

export const getExpectedTokenBalanceAfterBorrow = async (
  rpc: Rpc<GetAccountInfoApi & GetTokenAccountBalanceApi>,
  mint: Address,
  owner: Address,
  amountToBorrowLamports: Decimal,
  amountToBorrowMintDecimals: number
): Promise<Decimal> => {
  const initialUserTokenABalance = await getTokenAccountBalanceDecimal(rpc, mint, owner);

  return initialUserTokenABalance
    .add(lamportsToNumberDecimal(amountToBorrowLamports, amountToBorrowMintDecimals))
    .toDecimalPlaces(amountToBorrowMintDecimals);
};

export const isBorrowingEnabled = (reserve: KaminoReserve) => {
  return reserve.state.config.borrowLimit.gt(new BN(0));
};
