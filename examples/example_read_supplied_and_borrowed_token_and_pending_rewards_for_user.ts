import Decimal from 'decimal.js/decimal';
import {
  getMedianSlotDurationInMsFromLastEpochs,
  KaminoManager,
  KaminoMarket,
  KaminoVault,
  lamportsToDecimal,
  LendingObligation,
  ObligationTypeTag,
  PubkeyHashMap,
  Reserve,
  UserState,
  VanillaObligation,
} from '@kamino-finance/klend-sdk';
import { PublicKey } from '@solana/web3.js';
import { calculatePendingRewards, Farms, FarmState, getUserStatePDA } from '@kamino-finance/farms-sdk';
import { WSOLMint } from '@raydium-io/raydium-sdk-v2/lib';
import { getConnection } from './utils/connection';
import { getMarket } from './utils/helpers';

export const getKaminoAllPricesAPI = 'https://api.hubbleprotocol.io/prices?env=mainnet-beta&source=scope';

(async () => {
  const user = new PublicKey('<USER_WALLET>');
  const market = new PublicKey('<MARKET_ADDRESS>');
  const supplyReserve = new PublicKey('<SUPPLY_RESERVE_ADDRESS>');
  const borrowReserve = new PublicKey('<BORROW_RESERVE_ADDRESS>');

  const connection = getConnection();
  const farmsClient = new Farms(connection);
  const slotDuration = await getMedianSlotDurationInMsFromLastEpochs();
  const kaminoManager = new KaminoManager(connection, slotDuration);

  // read how many tokens the user has supplied in the supply reserve
  const marketState = await KaminoMarket.load(connection, market, slotDuration);
  if (!marketState) {
    throw Error(`Could not load market ${market.toString()}`);
  }

  const borrowReserveKamino = marketState.getReserveByAddress(borrowReserve);
  if (!borrowReserveKamino) {
    throw Error(`Could not load borrow reserve ${borrowReserve.toString()}`);
  }
  const supplyReserveKamino = marketState.getReserveByAddress(supplyReserve);
  if (!supplyReserveKamino) {
    throw Error(`Could not load supply reserve ${supplyReserve.toString()}`);
  }

  const userObligation = await marketState.getObligationByWallet(user, new VanillaObligation(marketState.programId));
  if (!userObligation) {
    throw Error(`Could not load user obligation ${user.toString()}`);
  }

  const deposit = userObligation.getDepositAmountByReserve(supplyReserveKamino);
  const borrow = userObligation.getBorrowAmountByReserve(borrowReserveKamino);
  console.log(`borrowed from reserve ${borrowReserve.toString()} amount: ${borrow.toString()}`);
  console.log(`deposit in reserve ${supplyReserve.toString()} amount: ${deposit.toString()}`);
  // print extra stats
  console.log('stats', userObligation.refreshedStats);

  // read userFarmState for user
  const debtFarm = borrowReserveKamino.state.farmDebt;
  if (debtFarm.equals(PublicKey.default)) {
    return;
  }

  const farmUserStateAddress = getUserStatePDA(farmsClient.getProgramID(), debtFarm, userObligation.obligationAddress);
  const farmUserState = await UserState.fetch(connection, farmUserStateAddress, farmsClient.getProgramID());
  if (!farmUserState) {
    throw Error(`Could not load farm user state ${farmUserStateAddress.toString()}`);
  }
  const farmState = await FarmState.fetch(connection, farmUserState.farmState);
  if (!farmState) {
    throw Error(`Could not load farm state ${farmUserState.farmState.toString()}`);
  }

  const pendingRewardsPerToken: PubkeyHashMap<PublicKey, Decimal> = new PubkeyHashMap();
  const currentTimestamp = new Decimal(new Date().getTime() / 1000);

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
      `Pending debt farm reward ${tokenMint.toString()} in SOL: ${pendingReward.mul(tokenPrice!).div(SOL_PRICE!).toString()}`
    );
  }
})().catch(async (e) => {
  console.error(e);
});
