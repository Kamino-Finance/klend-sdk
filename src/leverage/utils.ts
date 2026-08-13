import type { Address, GetAccountInfoApi, GetTokenAccountBalanceApi, Rpc } from '@solana/kit';
import BN from 'bn.js';
import type Decimal from 'decimal.js';

import { type KaminoReserve, lamportsToNumberDecimal } from '../classes';
import { getTokenAccountBalanceDecimal, U64_MAX } from '../utils';
import type { FlashBorrowType } from './types';

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

/**
 * Returns true if flash loans are enabled on this reserve.
 * Flash loans are disabled when flashLoanFeeSf === U64_MAX (sentinel value).
 * Note: getFlashLoanFee() returns 0 for both "free" and "disabled", so we check the raw field.
 */
export function isFlashLoanEnabled(reserve: KaminoReserve): boolean {
  return reserve.state.config.fees.flashLoanFeeSf.toString() !== U64_MAX;
}

/**
 * Determines which token to flash borrow based on reserve capabilities.
 *
 * Checks:
 * 1. Whether flash loans are enabled on the reserve (flashLoanFeeSf !== U64_MAX)
 * 2. Whether the reserve has sufficient available liquidity to service the flash borrow AND,
 *    on a withdraw/close, the collateral redeem that happens in the same transaction.
 *
 * Coll-flash and the collateral redeem (WithdrawObligationCollateralAndRedeemReserveCollateral)
 * both draw from the collateral reserve within a single transaction, and the flash loan is not
 * repaid until after the redeem. So a thin collateral reserve can satisfy the flash borrow alone
 * yet still revert with InsufficientLiquidity (klend 6008) once the redeem is added on top.
 *
 * `redeemCollateralLamports` is required (not optional): every caller must pass the collateral that
 * its transaction redeems from the collateral reserve in the same tx, so coll-flash viability always
 * accounts for both legs. Pass 0 only when the op genuinely has no redeem (opens / leverage-up
 * deposits). Withdraw/close, deleverage (adjust-decrease) and repay-with-collateral all redeem.
 *
 * @param collReserve - The collateral reserve
 * @param debtReserve - The debt reserve
 * @param requiredCollLamports - Amount needed if flash borrowing collateral
 * @param requiredDebtLamports - Amount needed if flash borrowing debt
 * @param redeemCollateralLamports - Collateral liquidity redeemed from the collateral reserve in the
 *   same tx (the coll withdraw/redeem amount). 0 only when the op has no redeem leg. Coll-flash
 *   requires the reserve to cover `requiredCollLamports + redeemCollateralLamports`.
 * @returns 'coll' or 'debt'
 * @throws if neither reserve supports flash borrowing the required amount
 */
export function determineFlashBorrowType(
  collReserve: KaminoReserve,
  debtReserve: KaminoReserve,
  requiredCollLamports: Decimal,
  requiredDebtLamports: Decimal,
  redeemCollateralLamports: Decimal
): FlashBorrowType {
  const collEnabled = isFlashLoanEnabled(collReserve);
  const debtEnabled = isFlashLoanEnabled(debtReserve);

  const collLiquidity = collReserve.getLiquidityAvailableAmount();
  const debtLiquidity = debtReserve.getLiquidityAvailableAmount();

  // Coll-flash must leave enough liquidity for the in-tx collateral redeem too, not just the
  // flash borrow — otherwise the two collide and the redeem reverts (klend 6008).
  const requiredCollTotal = requiredCollLamports.add(redeemCollateralLamports);
  const collViable = collEnabled && collLiquidity.gte(requiredCollTotal);
  const debtViable = debtEnabled && debtLiquidity.gte(requiredDebtLamports);

  // Prefer the flash type the relevant reserve(s) can actually service. The old "always prefer
  // collateral" heuristic is wrong for thin/nascent LST reserves on withdraw/close: there the
  // collateral reserve is the constraint, so debt-flash (deep debt reserve) is the safe choice.
  if (collViable) return 'coll';
  if (debtViable) return 'debt';

  throw new Error(
    `Neither collateral nor debt reserve supports flash borrowing the required amount. ` +
      `Coll: enabled=${collEnabled}, available=${collLiquidity}, required=${requiredCollLamports}` +
      `${redeemCollateralLamports.gt(0) ? ` (+${redeemCollateralLamports} redeem = ${requiredCollTotal})` : ''}. ` +
      `Debt: enabled=${debtEnabled}, available=${debtLiquidity}, required=${requiredDebtLamports}.`
  );
}
