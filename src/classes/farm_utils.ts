import { BN } from '@coral-xyz/anchor';
import {
  Farms,
  FarmState,
  getUserStatePDA,
  UserState,
  FarmConfigOption,
  lamportsToCollDecimal,
  scaleDownWads,
  WAD,
} from '@kamino-finance/farms-sdk';
import { Connection, Keypair, PublicKey, TransactionInstruction } from '@solana/web3.js';
import Decimal from 'decimal.js/decimal';

export const FARMS_GLOBAL_CONFIG_MAINNET: PublicKey = new PublicKey('6UodrBjL2ZreDy7QdR4YV1oxqMBjVYSEyrFpctqqwGwL');

export async function getFarmStakeIxs(
  connection: Connection,
  user: PublicKey,
  lamportsToStake: Decimal,
  farmAddress: PublicKey,
  fetchedFarmState?: FarmState
): Promise<TransactionInstruction[]> {
  const farmState = fetchedFarmState ? fetchedFarmState : await FarmState.fetch(connection, farmAddress);
  if (!farmState) {
    throw new Error(`Farm state not found for ${farmAddress}`);
  }

  const farmClient = new Farms(connection);
  const scopePricesArg = farmState.scopePrices.equals(PublicKey.default)
    ? farmClient.getProgramID()
    : farmState!.scopePrices;

  const stakeIxs: TransactionInstruction[] = [];
  const userState = getUserStatePDA(farmClient.getProgramID(), farmAddress, user);
  const userStateExists = await connection.getAccountInfo(userState);
  if (!userStateExists) {
    const createUserIx = farmClient.createNewUserIx(user, farmAddress);
    stakeIxs.push(createUserIx);
  }

  const stakeIx = farmClient.stakeIx(user, farmAddress, lamportsToStake, farmState.token.mint, scopePricesArg);
  stakeIxs.push(stakeIx);

  return stakeIxs;
}

export async function getFarmUserStatePDA(
  connection: Connection,
  user: PublicKey,
  farm: PublicKey
): Promise<PublicKey> {
  const farmClient = new Farms(connection);
  return getUserStatePDA(farmClient.getProgramID(), farm, user);
}

export async function getFarmUnstakeIx(
  connection: Connection,
  user: PublicKey,
  lamportsToUnstake: Decimal,
  farmAddress: PublicKey,
  fetchedFarmState?: FarmState
): Promise<TransactionInstruction> {
  const farmState = fetchedFarmState ? fetchedFarmState : await FarmState.fetch(connection, farmAddress);
  if (!farmState) {
    throw new Error(`Farm state not found for ${farmAddress}`);
  }

  const farmClient = new Farms(connection);
  const scopePricesArg = farmState.scopePrices.equals(PublicKey.default)
    ? farmClient.getProgramID()
    : farmState!.scopePrices;
  const userState = getUserStatePDA(farmClient.getProgramID(), farmAddress, user);
  if (!userState) {
    throw new Error(`User state not found for ${user}`);
  }

  const scaledLamportsToUnstake = new BN(lamportsToUnstake.floor().toString()).mul(new BN(WAD.toString()));
  return farmClient.unstakeIx(user, farmAddress, scaledLamportsToUnstake.toString(), scopePricesArg);
}

// withdrawing from a farm is a 2 step operation: first we unstake the tokens from the farm, then we withdraw them
export async function getFarmWithdrawUnstakedDepositIx(
  connection: Connection,
  user: PublicKey,
  farm: PublicKey,
  stakeTokenMint: PublicKey
): Promise<TransactionInstruction> {
  const farmClient = new Farms(connection);

  const userState = getUserStatePDA(farmClient.getProgramID(), farm, user);
  return farmClient.withdrawUnstakedDepositIx(user, userState, farm, stakeTokenMint);
}

export async function getFarmUnstakeAndWithdrawIxs(
  connection: Connection,
  user: PublicKey,
  lamportsToUnstake: Decimal,
  farmAddress: PublicKey,
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
  connection: Connection,
  farmAdmin: Keypair,
  farmTokenMint: PublicKey
): Promise<SetupFarmIxsWithFarm> {
  const farmClient = new Farms(connection);
  const farm = new Keypair();
  const ixs = await farmClient.createFarmIx(farmAdmin.publicKey, farm, FARMS_GLOBAL_CONFIG_MAINNET, farmTokenMint);
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
  connection: Connection,
  user: PublicKey,
  farm: PublicKey,
  farmTokenDecimals: number
): Promise<Decimal> {
  const farmClient = new Farms(connection);
  const userStatePDA = getUserStatePDA(farmClient.getProgramID(), farm, user);
  // if the user state does not exist, return 0
  const userState = await connection.getAccountInfo(userStatePDA);
  if (!userState) {
    return new Decimal(0);
  }

  // if the user state exists, return the user shares
  return farmClient.getUserTokensInUndelegatedFarm(user, farm, farmTokenDecimals);
}

export async function setVaultIdForFarmIx(
  connection: Connection,
  farmAdmin: PublicKey,
  farm: PublicKey,
  vault: PublicKey
): Promise<TransactionInstruction> {
  const farmClient = new Farms(connection);
  return farmClient.updateFarmConfigIx(farmAdmin, farm, PublicKey.default, new FarmConfigOption.UpdateVaultId(), vault);
}

export function getSharesInFarmUserPosition(userState: UserState, tokenDecimals: number): Decimal {
  return lamportsToCollDecimal(new Decimal(scaleDownWads(userState.activeStakeScaled)), tokenDecimals);
}

export type SetupFarmIxsWithFarm = {
  farm: Keypair;
  setupFarmIxs: TransactionInstruction[];
};

export type UnstakeAndWithdrawFromFarmIxs = {
  unstakeIx: TransactionInstruction;
  withdrawIx: TransactionInstruction;
};
