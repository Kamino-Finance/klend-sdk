import { getConnection } from '../utils/connection';
import Decimal from 'decimal.js/decimal';
import {
  getMedianSlotDurationInMsFromLastEpochs,
  KaminoManager,
  KaminoVault,
  PubkeyHashMap,
  Reserve,
  UserState,
} from '@kamino-finance/klend-sdk';
import { PublicKey } from '@solana/web3.js';
import { calculatePendingRewards, Farms, FarmState, getUserStatePDA } from '@kamino-finance/farms-sdk';
import { WSOLMint } from '@raydium-io/raydium-sdk-v2/lib';
import { lamportsToDecimal } from '../../src';

export const getKaminoAllPricesAPI = 'https://api.hubbleprotocol.io/prices?env=mainnet-beta&source=scope';

(async () => {
  const vaultAddress = new PublicKey('<YOUR_VAULT>');
  const vaultHolder = new PublicKey('<YOUR_WALLET>');

  const connection = getConnection();
  const farmsClient = new Farms(connection);
  const slotDuration = await getMedianSlotDurationInMsFromLastEpochs();

  const kaminoManager = new KaminoManager(connection, slotDuration);

  const vault = new KaminoVault(vaultAddress);
  const vaultState = await vault.getState(connection); // this reads the vault state from the chain and set is, if not set it will fetch it from the chain any time we use it

  // get how many shares the user has
  const userShares = await kaminoManager.getUserSharesBalanceSingleVault(vaultHolder, vault);

  const tokensPerShare = await kaminoManager.getTokensPerShareSingleVault(vault);
  const userHoldings = userShares.totalShares.mul(tokensPerShare);
  console.log('User token holdings:', userHoldings.toString());

  // for each reserve in the allocation compute the potential user farm state and check if there are pending rewards
  const reserves = kaminoManager.getVaultAllocations(vaultState);

  const farmUserStatesAddresses: PublicKey[] = [];
  for (const reserve of reserves.keys()) {
    const reserveState = await Reserve.fetch(connection, reserve);
    if (!reserveState) {
      console.log('Reserve state not found:', reserve);
      continue;
    }

    if (reserveState.farmCollateral.equals(PublicKey.default)) {
      continue;
    } else {
      const delegateePDA = kaminoManager.computeUserFarmStateForUserInVault(
        farmsClient.getProgramID(),
        vault.address,
        reserve,
        vaultHolder
      );

      const farmUserState = getUserStatePDA(farmsClient.getProgramID(), reserveState.farmCollateral, delegateePDA[0]);

      farmUserStatesAddresses.push(farmUserState);
    }
  }

  const pendingRewardsPerToken: PubkeyHashMap<PublicKey, Decimal> = new PubkeyHashMap();
  const currentTimestamp = new Decimal(new Date().getTime() / 1000);
  const farmUserStates = await UserState.fetchMultiple(connection, farmUserStatesAddresses, farmsClient.getProgramID());

  for (const farmUserState of farmUserStates) {
    if (!farmUserState) {
      continue;
    }

    const farmState = await FarmState.fetch(connection, farmUserState.farmState);
    const rewardInfos = farmState!.rewardInfos;
    for (let indexReward = 0; indexReward < rewardInfos.length; indexReward++) {
      const pendingReward = lamportsToDecimal(
        calculatePendingRewards(farmState!, farmUserState, indexReward, currentTimestamp, null),
        new Decimal(rewardInfos[indexReward].token.decimals.toString())
      );
      if (pendingReward.gt(0)) {
        const existentPendingRewardForToken = pendingRewardsPerToken.get(rewardInfos[indexReward].token.mint);
        if (existentPendingRewardForToken) {
          pendingRewardsPerToken.set(
            rewardInfos[indexReward].token.mint,
            existentPendingRewardForToken.add(pendingReward)
          );
        } else {
          pendingRewardsPerToken.set(rewardInfos[indexReward].token.mint, pendingReward);
        }
      }
    }

    // read the prices from Kamino price API
    const prices = await fetch(getKaminoAllPricesAPI);
    const pricesJson = await prices.json();
    const pricesMap = new PubkeyHashMap<PublicKey, Decimal>();
    for (const price of pricesJson) {
      pricesMap.set(new PublicKey(price.mint), new Decimal(price.usdPrice));
    }

    const SOL_PRICE = pricesMap.get(WSOLMint);

    for (const [tokenMint, pendingReward] of pendingRewardsPerToken.entries()) {
      const tokenPrice = pricesMap.get(tokenMint);
      console.log(`Pending reward ${tokenMint.toString()} in USD: ${pendingReward.mul(tokenPrice!).toString()}`);
      console.log(
        `Pending reward ${tokenMint.toString()} in SOL: ${pendingReward.mul(tokenPrice!).div(SOL_PRICE!).toString()}`
      );
    }
  }
})().catch(async (e) => {
  console.error(e);
});
