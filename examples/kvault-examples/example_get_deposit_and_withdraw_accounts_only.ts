import { getConnectionPool } from '../utils/connection';
import { getKeypair } from '../utils/keypair';
import { EXAMPLE_USDC_VAULT } from '../utils/constants';
import BN from 'bn.js';
import Decimal from 'decimal.js/decimal';
import {
  AllDepositAccounts,
  AllWithdrawAccounts,
  deposit,
  DepositArgs,
  getMedianSlotDurationInMsFromLastEpochs,
  KaminoVault,
  KaminoVaultClient,
  numberToLamportsDecimal,
  withdraw,
  WithdrawAccounts,
  WithdrawArgs,
  withdrawFromAvailable,
  WithdrawFromAvailableAccounts,
  WithdrawFromAvailableArgs,
} from '@kamino-finance/klend-sdk';
import { sendAndConfirmTx } from '../utils/tx';

/**
 * This example demonstrates how to use getDepositAccounts and getWithdrawAccounts
 * to retrieve the resolved on-chain accounts needed for vault deposit/withdraw instructions,
 * and then build the instructions manually.
 *
 * This is useful when you need full control over instruction construction,
 * for example when building CPI calls, custom transaction builders, or composing
 * vault operations with other instructions in a specific way.
 */
(async () => {
  const c = getConnectionPool();
  const user = await getKeypair();
  const slotDuration = await getMedianSlotDurationInMsFromLastEpochs();

  const vaultClient = new KaminoVaultClient(c.rpc, slotDuration);
  const vault = new KaminoVault(c.rpc, EXAMPLE_USDC_VAULT);
  const vaultState = await vault.getState();

  // ============================================================
  // DEPOSIT: get accounts and build the instruction manually
  // ============================================================

  const depositResult: AllDepositAccounts = await vaultClient.getDepositAccounts(user, vault);

  // Build the deposit instruction with your own amount
  const usdcToDeposit = new Decimal(100.0);
  const depositAmountLamports = numberToLamportsDecimal(usdcToDeposit, vaultState.tokenMintDecimals.toNumber()).floor();
  const depositArgs: DepositArgs = {
    maxAmount: new BN(depositAmountLamports.toString()),
  };
  const depositIxRaw = deposit(depositArgs, depositResult.depositAccounts, undefined, vaultClient.getProgramID());

  // Append the remaining accounts (vault reserves + lending markets)
  const depositIx = {
    ...depositIxRaw,
    accounts: [...(depositIxRaw.accounts ?? []), ...depositResult.remainingAccounts],
  };

  // Send the deposit transaction, including stake instructions if the vault has a farm
  await sendAndConfirmTx(
    c,
    user,
    [depositIx, ...(depositResult.stakeSharesIxs ?? [])],
    [],
    [vaultState.vaultLookupTable],
    'DepositToVault (manual accounts)'
  );

  // ============================================================
  // WITHDRAW FROM RESERVE: get accounts and build the instruction manually
  // ============================================================

  // Load the vault's allocated reserves to pick one to withdraw from
  const vaultReservesMap = await vaultClient.loadVaultReserves(vaultState);
  const reserves = Array.from(vaultReservesMap.values());

  if (reserves.length > 0) {
    // Pick the first allocated reserve to withdraw from
    const reserve = reserves[0]!;
    const withdrawResult: AllWithdrawAccounts = await vaultClient.getWithdrawAccounts(
      user,
      vault,
      { address: reserve.address, state: reserve.state },
      vaultReservesMap
    );

    // Build the withdraw instruction
    const sharesToWithdraw = new Decimal(50.0);
    const shareAmountLamports = numberToLamportsDecimal(
      sharesToWithdraw,
      vaultState.sharesMintDecimals.toNumber()
    ).floor();
    const withdrawArgs: WithdrawArgs = {
      sharesAmount: new BN(shareAmountLamports.toString()),
    };
    const withdrawIxRaw = withdraw(
      withdrawArgs,
      withdrawResult.withdrawAccounts as WithdrawAccounts,
      undefined,
      vaultClient.getProgramID()
    );

    // Append the remaining accounts
    const withdrawIx = {
      ...withdrawIxRaw,
      accounts: [...(withdrawIxRaw.accounts ?? []), ...withdrawResult.remainingAccounts],
    };

    // Send: unstake first (if farm), then withdraw
    await sendAndConfirmTx(
      c,
      user,
      [...(withdrawResult.unstakeSharesIxs ?? []), withdrawIx],
      [],
      [vaultState.vaultLookupTable],
      'WithdrawFromVault via reserve (manual accounts)'
    );
  }

  // ============================================================
  // WITHDRAW FROM AVAILABLE ONLY: no reserve needed
  // ============================================================

  const withdrawAvailableResult: AllWithdrawAccounts = await vaultClient.getWithdrawAccounts(user, vault);

  // Build the withdrawFromAvailable instruction
  const sharesToWithdrawFromAvailable = new Decimal(10.0);
  const shareAmountLamportsAvailable = numberToLamportsDecimal(
    sharesToWithdrawFromAvailable,
    vaultState.sharesMintDecimals.toNumber()
  ).floor();
  const withdrawFromAvailableArgs: WithdrawFromAvailableArgs = {
    sharesAmount: new BN(shareAmountLamportsAvailable.toString()),
  };
  const withdrawFromAvailableIx = withdrawFromAvailable(
    withdrawFromAvailableArgs,
    withdrawAvailableResult.withdrawAccounts as WithdrawFromAvailableAccounts,
    undefined,
    vaultClient.getProgramID()
  );

  // Send: unstake first (if farm), then withdraw from available
  await sendAndConfirmTx(
    c,
    user,
    [...(withdrawAvailableResult.unstakeSharesIxs ?? []), withdrawFromAvailableIx],
    [],
    [vaultState.vaultLookupTable],
    'WithdrawFromAvailable (manual accounts)'
  );
})().catch(async (e) => {
  console.error(e);
});
