import { Kamino, StrategyWithAddress } from '@kamino-finance/kliquidity-sdk';
import { KaminoMarket, KaminoReserve, lamportsToNumberDecimal } from '../classes';
import { Connection, PublicKey, TransactionInstruction } from '@solana/web3.js';
import { PriceAinBProvider, SwapIxnsProvider } from './operations';
import Decimal from 'decimal.js';
import { getTokenAccountBalanceDecimal } from '../utils';
import { numberToLamportsDecimal } from '../classes/utils';
import BN from 'bn.js';

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

export const getTokenToKtokenSwapper = async (
  connection: Connection,
  kaminoMarket: KaminoMarket,
  kamino: Kamino,
  depositor: PublicKey,
  swapper: SwapIxnsProvider,
  priceAinB: PriceAinBProvider,
  includeAtaIxns: boolean = true
): Promise<SwapIxnsProvider> => {
  return async (
    amountInLamports: number,
    amountInMint: PublicKey,
    amountOutMint: PublicKey,
    slippage: number,
    amountDebtAtaBalance?: Decimal
  ) => {
    const slippageBps = new Decimal(slippage).mul('100');
    const mintInDecimals = kaminoMarket.getReserveByMint(amountInMint)!.state.liquidity.mintDecimals.toNumber();
    const amountIn = lamportsToNumberDecimal(amountInLamports, mintInDecimals);
    console.debug('Depositing token', amountInMint.toString(), ' for ', amountOutMint.toString(), 'ktoken');
    if (amountDebtAtaBalance === undefined) {
      throw Error('Amount in debt ATA balance is undefined for leverage ktoken deposit');
    }

    const ixWithLookup = (await getKtokenDepositIxs(
      connection,
      kamino,
      depositor,
      amountInMint,
      amountOutMint,
      amountIn,
      slippageBps,
      amountDebtAtaBalance,
      swapper,
      priceAinB,
      includeAtaIxns
    ))!;
    return [ixWithLookup.instructions, ixWithLookup.lookupTablesAddresses];
  };
};

export async function getKtokenDepositIxs(
  connection: Connection,
  kamino: Kamino,
  depositor: PublicKey,
  depositTokenMint: PublicKey,
  ktokenMint: PublicKey,
  amountToDeposit: Decimal,
  slippageBps: Decimal,
  amountExpectedDepositAtaBalance: Decimal,
  swapper: SwapIxnsProvider,
  priceAinB: PriceAinBProvider,
  includeAtaIxns: boolean = true
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
      swapProviderToKaminoSwapProvider(swapper),
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
      swapProviderToKaminoSwapProvider(swapper),
      tokensBalances,
      priceAinBDecimal,
      includeAtaIxns
    );
  } else {
    throw Error('Deposit token is neither A nor B in the strategy');
  }
}

export const getKtokenToTokenSwapper = async (
  kaminoMarket: KaminoMarket,
  kamino: Kamino,
  depositor: PublicKey,
  swapper: SwapIxnsProvider
): Promise<SwapIxnsProvider> => {
  return async (amountInLamports: number, amountInMint: PublicKey, amountOutMint: PublicKey, slippage: number) => {
    const amountInDecimals = kaminoMarket.getReserveByMint(amountInMint)!.state.liquidity.mintDecimals.toNumber();
    const amountToWithdraw = lamportsToNumberDecimal(amountInLamports, amountInDecimals);
    const kaminoStrategy = await kamino.getStrategyByKTokenMint(amountInMint);

    console.log('Withdrawing ktoken', amountInMint.toString(), ' for ', amountOutMint.toString(), 'token');

    const ixWithdraw = (await getKtokenWithdrawIxs(kamino, depositor, kaminoStrategy!, amountToWithdraw))!;

    const [estimatedAOut, estimatedBOut] = await getKtokenWithdrawEstimatesAndPrice(
      kamino,
      kaminoStrategy!,
      amountToWithdraw
    );

    if (amountOutMint.equals(kaminoStrategy?.strategy.tokenAMint!)) {
      const [swapIxs, swapLookupTables] = await swapper(
        estimatedBOut.toNumber(),
        kaminoStrategy?.strategy.tokenBMint!,
        kaminoStrategy?.strategy.tokenAMint!,
        slippage
      );

      return [[...ixWithdraw.prerequisiteIxs, ixWithdraw.withdrawIx, ...swapIxs], swapLookupTables];
    } else if (amountOutMint.equals(kaminoStrategy?.strategy.tokenBMint!)) {
      const [swapIxs, swapLookupTables] = await swapper(
        estimatedAOut.toNumber(),
        kaminoStrategy?.strategy.tokenAMint!,
        kaminoStrategy?.strategy.tokenBMint!,
        slippage
      );

      return [[...ixWithdraw.prerequisiteIxs, ixWithdraw.withdrawIx, ...swapIxs], swapLookupTables];
    } else {
      throw Error('Deposit token is neither A nor B in the strategy');
    }
  };
};

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

export function swapProviderToKaminoSwapProvider(swapper: SwapIxnsProvider): KaminoSwapperIxBuilder {
  return async (
    input: DepositAmountsForSwap,
    tokenAMint: PublicKey,
    tokenBMint: PublicKey,
    _owner: PublicKey,
    slippageBps: Decimal,
    _allKeys: PublicKey[]
  ): Promise<[TransactionInstruction[], PublicKey[]]> => {
    if (input.tokenBToSwapAmount.lt(0)) {
      return await swapper(
        input.tokenBToSwapAmount.abs().toNumber(),
        tokenBMint,
        tokenAMint,
        slippageBps.toNumber() / 100
      );
    } else if (input.tokenAToSwapAmount.lt(0)) {
      return await swapper(
        input.tokenAToSwapAmount.abs().toNumber(),
        tokenAMint,
        tokenBMint,
        slippageBps.toNumber() / 100
      );
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
