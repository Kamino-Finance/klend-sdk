import BN from 'bn.js';
import Decimal from 'decimal.js';
import { Address, Instruction, lamports, TransactionSigner } from '@solana/kit';
import { TOKEN_PROGRAM_ADDRESS } from '@solana-program/token';
import { getCloseAccountInstruction } from '@solana-program/token-2022';
import { VaultState } from '../@codegen/kvault/accounts';
import {
  topupRewards,
  TopupRewardsAccounts,
  TopupRewardsArgs,
  withdrawRewards,
  WithdrawRewardsAccounts,
  WithdrawRewardsArgs,
} from '../@codegen/kvault/instructions';
import { createAtasIdempotent, getTransferWsolIxs } from '../utils/ata';
import { SECONDS_PER_YEAR } from '../utils/constants';
import { WRAPPED_SOL_MINT } from '../utils/consts';
import { noopSigner } from '../utils/signer';
import { numberToLamportsDecimal } from './utils';
import type { KaminoVault } from './vault';
import { TopupVaultRewardsIxs, WithdrawVaultRewardsIxs } from './vault_types';

type PreparedVaultRewardsTransfer = {
  tokenAccount: Address;
  tokenAmountLamports: Decimal;
  prerequisiteIxs: Instruction[];
  cleanupIxs: Instruction[];
};

async function prepareVaultRewardsTransfer(
  owner: TransactionSigner,
  vaultState: VaultState,
  tokenAmount: Decimal,
  wrapWsol: boolean
): Promise<PreparedVaultRewardsTransfer> {
  const tokenMintDecimals = vaultState.tokenMintDecimals.toNumber();
  const tokenAmountLamports = numberToLamportsDecimal(tokenAmount, tokenMintDecimals).floor();
  if (tokenAmount.gt(0) && tokenAmountLamports.lte(0)) {
    throw new Error(`Reward amount ${tokenAmount.toFixed()} rounds to 0 lamports at ${tokenMintDecimals} decimals`);
  }

  const [{ ata: tokenAccount, createAtaIx }] = await createAtasIdempotent(owner, [
    {
      mint: vaultState.tokenMint,
      tokenProgram: vaultState.tokenProgram,
    },
  ]);
  const prerequisiteIxs: Instruction[] = [createAtaIx];
  const cleanupIxs: Instruction[] = [];

  if (vaultState.tokenMint === WRAPPED_SOL_MINT) {
    if (wrapWsol) {
      prerequisiteIxs.push(
        ...getTransferWsolIxs(
          owner,
          tokenAccount,
          lamports(BigInt(tokenAmountLamports.toString())),
          vaultState.tokenProgram
        )
      );
    }
    cleanupIxs.push(
      getCloseAccountInstruction(
        {
          account: tokenAccount,
          owner,
          destination: owner.address,
        },
        { programAddress: TOKEN_PROGRAM_ADDRESS }
      )
    );
  }

  return {
    tokenAccount,
    tokenAmountLamports,
    prerequisiteIxs,
    cleanupIxs,
  };
}

export async function buildTopupVaultRewardsIxs(
  kaminoVaultProgramId: Address,
  payer: TransactionSigner,
  vault: KaminoVault,
  tokenAmount: Decimal
): Promise<TopupVaultRewardsIxs> {
  const vaultState = await vault.getState();
  const { tokenAccount, tokenAmountLamports, prerequisiteIxs, cleanupIxs } = await prepareVaultRewardsTransfer(
    payer,
    vaultState,
    tokenAmount,
    true
  );
  const accounts: TopupRewardsAccounts = {
    payer,
    vaultState: vault.address,
    tokenMint: vaultState.tokenMint,
    tokenVault: vaultState.tokenVault,
    payerTokenTa: tokenAccount,
    tokenProgram: vaultState.tokenProgram,
  };
  const args: TopupRewardsArgs = {
    amount: new BN(tokenAmountLamports.toString()),
  };

  return {
    prerequisiteIxs,
    topupIxs: [topupRewards(args, accounts, undefined, kaminoVaultProgramId)],
    cleanupIxs,
  };
}

export async function buildWithdrawVaultRewardsIxs(
  kaminoVaultProgramId: Address,
  vault: KaminoVault,
  tokenAmount: Decimal,
  vaultAdminAuthority?: TransactionSigner
): Promise<WithdrawVaultRewardsIxs> {
  const vaultState = await vault.getState();
  const vaultAdmin = vaultAdminAuthority ?? noopSigner(vaultState.vaultAdminAuthority);
  const { tokenAccount, tokenAmountLamports, prerequisiteIxs, cleanupIxs } = await prepareVaultRewardsTransfer(
    vaultAdmin,
    vaultState,
    tokenAmount,
    false
  );
  const accounts: WithdrawRewardsAccounts = {
    vaultAdminAuthority: vaultAdmin,
    vaultState: vault.address,
    tokenMint: vaultState.tokenMint,
    tokenVault: vaultState.tokenVault,
    baseVaultAuthority: vaultState.baseVaultAuthority,
    withdrawTokenAccount: tokenAccount,
    tokenProgram: vaultState.tokenProgram,
  };
  const args: WithdrawRewardsArgs = {
    amount: new BN(tokenAmountLamports.toString()),
  };

  return {
    prerequisiteIxs,
    withdrawIxs: [withdrawRewards(args, accounts, undefined, kaminoVaultProgramId)],
    cleanupIxs,
  };
}

/** Calculate the fixed-emission reward APR/APY from a token-lamport rate and token-denominated net AUM. */
export function calculateVaultRewardsAprApy(
  rewardPerSecondLamports: Decimal,
  tokenMintDecimals: number,
  netAumTokens: Decimal
): { apr: Decimal; apy: Decimal } {
  if (rewardPerSecondLamports.lte(0) || netAumTokens.lte(0)) {
    return {
      apr: new Decimal(0),
      apy: new Decimal(0),
    };
  }

  const rewardsPerYearTokens = rewardPerSecondLamports
    .mul(SECONDS_PER_YEAR)
    .div(new Decimal(10).pow(tokenMintDecimals));
  const apr = rewardsPerYearTokens.div(netAumTokens);

  return {
    apr,
    // The program emits a fixed token amount per second rather than maintaining a percentage rate
    // as AUM grows, so the reward-only annual yield is linear and does not compound.
    apy: apr,
  };
}
