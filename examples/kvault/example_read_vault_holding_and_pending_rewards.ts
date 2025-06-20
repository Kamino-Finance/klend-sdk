import { getConnectionPool } from '../utils/connection';
import Decimal from 'decimal.js/decimal';
import {
  DEFAULT_PUBLIC_KEY,
  getMedianSlotDurationInMsFromLastEpochs,
  KaminoManager,
  KaminoVault,
  Reserve,
  UserState,
  WRAPPED_SOL_MINT,
} from '@kamino-finance/klend-sdk';
import { calculatePendingRewards, Farms, FarmState, getUserStatePDA } from '@kamino-finance/farms-sdk';
import { lamportsToDecimal } from '../../src';
import { Address, address } from '@solana/kit';

export const getKaminoAllPricesAPI = 'https://api.hubbleprotocol.io/prices?env=mainnet-beta&source=scope';

(async () => {
  const vaultAddress = address('<YOUR_VAULT>');
  const vaultHolder = address('<YOUR_WALLET>');

  const c = getConnectionPool();
  const farmsClient = new Farms(c.rpc);
  const slotDuration = await getMedianSlotDurationInMsFromLastEpochs();

  const kaminoManager = new KaminoManager(c.rpc, slotDuration);

  const vault = new KaminoVault(vaultAddress);
  const vaultState = await vault.getState(c.rpc); // this reads the vault state from the chain and set is, if not set it will fetch it from the chain any time we use it

  // get how many shares the user has
  const userShares = await kaminoManager.getUserSharesBalanceSingleVault(vaultHolder, vault);

  const tokensPerShare = await kaminoManager.getTokensPerShareSingleVault(vault);
  const userHoldings = userShares.totalShares.mul(tokensPerShare);
  console.log('User token holdings:', userHoldings.toString());

  // for each reserve in the allocation compute the potential user farm state and check if there are pending rewards
  const reserves = kaminoManager.getVaultAllocations(vaultState);

  const farmUserStatesAddresses: Address[] = [];
  for (const reserve of reserves.keys()) {
    const reserveState = await Reserve.fetch(c.rpc, reserve);
    if (!reserveState) {
      console.log('Reserve state not found:', reserve);
      continue;
    }

    if (reserveState.farmCollateral === DEFAULT_PUBLIC_KEY) {
      continue;
    } else {
      const delegateePDA = kaminoManager.computeUserFarmStateForUserInVault(
        farmsClient.getProgramID(),
        vault.address,
        reserve,
        vaultHolder
      );

      const farmUserState = await getUserStatePDA(
        farmsClient.getProgramID(),
        reserveState.farmCollateral,
        delegateePDA[0]
      );

      farmUserStatesAddresses.push(farmUserState);
    }
  }

  const pendingRewardsPerToken: Map<Address, Decimal> = new Map();
  const currentTimestamp = new Decimal(new Date().getTime() / 1000);
  const farmUserStates = await UserState.fetchMultiple(c.rpc, farmUserStatesAddresses, farmsClient.getProgramID());

  for (const farmUserState of farmUserStates) {
    if (!farmUserState) {
      continue;
    }

    const farmState = await FarmState.fetch(c.rpc, farmUserState.farmState);
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
    const pricesMap = new Map<Address, Decimal>();
    for (const price of pricesJson) {
      pricesMap.set(address(price.mint), new Decimal(price.usdPrice));
    }

    const SOL_PRICE = pricesMap.get(WRAPPED_SOL_MINT);

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
