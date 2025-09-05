import { KaminoReserve, lamportsToNumberDecimal } from '../classes';
import { Address, GetAccountInfoApi, Rpc, GetTokenAccountBalanceApi } from '@solana/kit';
import Decimal from 'decimal.js';
import { getTokenAccountBalanceDecimal } from '../utils';
import BN from 'bn.js';

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
