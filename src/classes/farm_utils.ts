import {
  Farms,
  FarmState,
  getUserStatePDA,
  UserState,
  FarmConfigOption,
  lamportsToCollDecimal,
  scaleDownWads,
  WAD,
  RewardInfo,
} from '@kamino-finance/farms-sdk';
import {
  address,
  Address,
  fetchEncodedAccount,
  generateKeyPairSigner,
  Instruction,
  Rpc,
  SolanaRpcApi,
  TransactionSigner,
} from '@solana/kit';
import Decimal from 'decimal.js/decimal';
import { DEFAULT_PUBLIC_KEY } from '../utils';
import { getScopePricesFromFarm } from '@kamino-finance/farms-sdk/dist/utils/option';

export const FARMS_GLOBAL_CONFIG_MAINNET: Address = address('6UodrBjL2ZreDy7QdR4YV1oxqMBjVYSEyrFpctqqwGwL');
export const FARMS_ADMIN_MAINNET: Address = address('BbM3mbcLsa3QcYEVx8iovwfKaA1iZ6DK5fEbbtHwS3N8');

export async function getFarmStakeIxs(
  rpc: Rpc<SolanaRpcApi>,
  user: TransactionSigner,
  lamportsToStake: Decimal,
  farmAddress: Address,
  fetchedFarmState?: FarmState
): Promise<Instruction[]> {
  const farmState = fetchedFarmState ? fetchedFarmState : await FarmState.fetch(rpc, farmAddress);
  if (!farmState) {
    throw new Error(`Farm state not found for ${farmAddress}`);
  }

  const farmClient = new Farms(rpc);
  const scopePricesArg = getScopePricesFromFarm(farmState);

  const stakeIxs: Instruction[] = [];
  const userState = await getUserStatePDA(farmClient.getProgramID(), farmAddress, user.address);
  const userStateExists = await fetchEncodedAccount(rpc, userState);
  if (!userStateExists.exists) {
    const createUserIx = await farmClient.createNewUserIx(user, farmAddress);
    stakeIxs.push(createUserIx);
  }

  const stakeIx = await farmClient.stakeIx(user, farmAddress, lamportsToStake, farmState.token.mint, scopePricesArg);
  stakeIxs.push(stakeIx);

  return stakeIxs;
}

export async function getFarmUserStatePDA(rpc: Rpc<SolanaRpcApi>, user: Address, farm: Address): Promise<Address> {
  const farmClient = new Farms(rpc);
  return getUserStatePDA(farmClient.getProgramID(), farm, user);
}

export async function getFarmUnstakeIx(
  rpc: Rpc<SolanaRpcApi>,
  user: TransactionSigner,
  lamportsToUnstake: Decimal,
  farmAddress: Address,
  fetchedFarmState?: FarmState
): Promise<Instruction> {
  const farmState = fetchedFarmState ? fetchedFarmState : await FarmState.fetch(rpc, farmAddress);
  if (!farmState) {
    throw new Error(`Farm state not found for ${farmAddress}`);
  }

  const farmClient = new Farms(rpc);
  const scopePricesArg = getScopePricesFromFarm(farmState);
  const scaledLamportsToUnstake = lamportsToUnstake.floor().mul(WAD);
  return farmClient.unstakeIx(user, farmAddress, scaledLamportsToUnstake, scopePricesArg);
}

// withdrawing from a farm is a 2 step operation: first we unstake the tokens from the farm, then we withdraw them
export async function getFarmWithdrawUnstakedDepositIx(
  rpc: Rpc<SolanaRpcApi>,
  user: TransactionSigner,
  farm: Address,
  stakeTokenMint: Address
): Promise<Instruction> {
  const farmClient = new Farms(rpc);
  const userState = await getUserStatePDA(farmClient.getProgramID(), farm, user.address);
  return farmClient.withdrawUnstakedDepositIx(user, userState, farm, stakeTokenMint);
}

export async function getFarmUnstakeAndWithdrawIxs(
  connection: Rpc<SolanaRpcApi>,
  user: TransactionSigner,
  lamportsToUnstake: Decimal,
  farmAddress: Address,
  fetchedFarmState?: FarmState
): Promise<UnstakeAndWithdrawFromFarmIxs> {
  const farmState = fetchedFarmState ? fetchedFarmState : await FarmState.fetch(connection, farmAddress);
  if (!farmState) {
    throw new Error(`Farm state not found for ${farmAddress}`);
  }

  const unstakeIx = await getFarmUnstakeIx(connection, user, lamportsToUnstake, farmAddress, farmState);
  const withdrawIx = await getFarmWithdrawUnstakedDepositIx(connection, user, farmAddress, farmState.token.mint);
  return { unstakeIx, withdrawIx };
}

export async function getSetupFarmIxsWithFarm(
  connection: Rpc<SolanaRpcApi>,
  farmAdmin: TransactionSigner,
  farmTokenMint: Address
): Promise<SetupFarmIxsWithFarm> {
  const farmClient = new Farms(connection);
  const farm = await generateKeyPairSigner();
  const ixs = await farmClient.createFarmIxs(farmAdmin, farm, FARMS_GLOBAL_CONFIG_MAINNET, farmTokenMint);
  return { farm, setupFarmIxs: ixs };
}

/**
 * Returns the number of tokens the user has staked in the farm
 * @param connection - the connection to the cluster
 * @param user - the user's public key
 * @param farm - the farm's public key
 * @param farmTokenDecimals - the decimals of the farm token
 * @returns the number of tokens the user has staked in the farm
 */
export async function getUserSharesInTokensStakedInFarm(
  rpc: Rpc<SolanaRpcApi>,
  user: Address,
  farm: Address,
  farmTokenDecimals: number
): Promise<Decimal> {
  const farmClient = new Farms(rpc);
  const userStatePDA = await getUserStatePDA(farmClient.getProgramID(), farm, user);
  // if the user state does not exist, return 0
  const userState = await fetchEncodedAccount(rpc, userStatePDA);
  if (!userState.exists) {
    return new Decimal(0);
  }

  // if the user state exists, return the user shares
  return farmClient.getUserTokensInUndelegatedFarm(user, farm, farmTokenDecimals);
}

export async function setVaultIdForFarmIx(
  rpc: Rpc<SolanaRpcApi>,
  farmAdmin: TransactionSigner,
  farm: Address,
  vault: Address
): Promise<Instruction> {
  const farmClient = new Farms(rpc);
  return farmClient.updateFarmConfigIx(
    farmAdmin,
    farm,
    DEFAULT_PUBLIC_KEY,
    new FarmConfigOption.UpdateVaultId(),
    vault
  );
}

export function getSharesInFarmUserPosition(userState: UserState, tokenDecimals: number): Decimal {
  return lamportsToCollDecimal(new Decimal(scaleDownWads(userState.activeStakeScaled)), tokenDecimals);
}

export type SetupFarmIxsWithFarm = {
  farm: TransactionSigner;
  setupFarmIxs: Instruction[];
};

export type UnstakeAndWithdrawFromFarmIxs = {
  unstakeIx: Instruction;
  withdrawIx: Instruction;
};

export function getRewardPerTimeUnitSecond(reward: RewardInfo) {
  const now = new Decimal(new Date().getTime()).div(1000);
  let rewardPerTimeUnitSecond = new Decimal(0);
  for (let i = 0; i < reward.rewardScheduleCurve.points.length - 1; i++) {
    const { tsStart: tsStartThisPoint, rewardPerTimeUnit } = reward.rewardScheduleCurve.points[i];
    const { tsStart: tsStartNextPoint } = reward.rewardScheduleCurve.points[i + 1];

    const thisPeriodStart = new Decimal(tsStartThisPoint.toString());
    const thisPeriodEnd = new Decimal(tsStartNextPoint.toString());
    const rps = new Decimal(rewardPerTimeUnit.toString());
    if (thisPeriodStart <= now && thisPeriodEnd >= now) {
      rewardPerTimeUnitSecond = rps;
      break;
    } else if (thisPeriodStart > now && thisPeriodEnd > now) {
      rewardPerTimeUnitSecond = rps;
      break;
    }
  }

  const rewardTokenDecimals = reward.token.decimals.toNumber();
  const rewardAmountPerUnitDecimals = new Decimal(10).pow(reward.rewardsPerSecondDecimals.toString());
  const rewardAmountPerUnitLamports = new Decimal(10).pow(rewardTokenDecimals.toString());

  const rpsAdjusted = new Decimal(rewardPerTimeUnitSecond.toString())
    .div(rewardAmountPerUnitDecimals)
    .div(rewardAmountPerUnitLamports);

  return rewardPerTimeUnitSecond ? rpsAdjusted : new Decimal(0);
}

/**
 * reads the pending rewards for a user in a vault farm
 * @param rpc - the rpc connection
 * @param userStateAddress - the address of the user state (computed differently depending on farm type)
 * @param farm - the address of the farm
 * @returns a map of the pending rewards per token
 */
export async function getUserPendingRewardsInFarm(
  rpc: Rpc<SolanaRpcApi>,
  userStateAddress: Address,
  farm: Address
): Promise<Map<Address, Decimal>> {
  const pendingRewardsPerToken: Map<Address, Decimal> = new Map();

  const farmClient = new Farms(rpc);
  // if the user state does not exist, return 0
  const userStateAccountInfo = await fetchEncodedAccount(rpc, userStateAddress);
  if (!userStateAccountInfo.exists) {
    return pendingRewardsPerToken;
  }
  const userState = UserState.decode(Buffer.from(userStateAccountInfo.data));

  const farmState = await FarmState.fetch(rpc, farm);
  if (!farmState) {
    throw new Error(`Farm state not found for ${farm}`);
  }

  const currentTimestamp = new Decimal(new Date().getTime() / 1000);
  const rawRewards = farmClient.getUserPendingRewards(userState, farmState, currentTimestamp, null);

  if (!rawRewards.hasReward) {
    return pendingRewardsPerToken;
  }

  for (let i = 0; i < rawRewards.userPendingRewardAmounts.length; i++) {
    const reward = rawRewards.userPendingRewardAmounts[i];
    const rewardToken = farmState.rewardInfos[i].token.mint;
    const existingReward = pendingRewardsPerToken.get(rewardToken);
    if (existingReward) {
      pendingRewardsPerToken.set(rewardToken, existingReward.add(reward));
    } else {
      pendingRewardsPerToken.set(rewardToken, reward);
    }
  }

  return pendingRewardsPerToken;
}
