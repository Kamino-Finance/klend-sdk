import { getConnectionPool } from '../utils/connection';
import Decimal from 'decimal.js/decimal';
import {
  getMedianSlotDurationInMsFromLastEpochs,
  KaminoManager,
  KaminoVault,
  WRAPPED_SOL_MINT,
} from '@kamino-finance/klend-sdk';
import { Address, address } from '@solana/kit';
import { Farms } from '@kamino-finance/farms-sdk';

export const getKaminoAllPricesAPI = 'https://api.hubbleprotocol.io/prices?env=mainnet-beta&source=scope';

(async () => {
  const vaultAddress = address('<YOUR_VAULT>');
  const vaultHolder = address('<YOUR_WALLET>');

  const c = getConnectionPool();
  const farmsClient = new Farms(c.rpc);
  const slotDuration = await getMedianSlotDurationInMsFromLastEpochs();

  const kaminoManager = new KaminoManager(c.rpc, slotDuration);

  const vault = new KaminoVault(c.rpc, vaultAddress);
  const vaultState = await vault.getState(); // this reads the vault state from the chain and set is, if not set it will fetch it from the chain any time we use it

  // get how many shares the user has
  const userShares = await kaminoManager.getUserSharesBalanceSingleVault(vaultHolder, vault);

  const tokensPerShare = await kaminoManager.getTokensPerShareSingleVault(vault);
  const userHoldings = userShares.totalShares.mul(tokensPerShare);
  console.log('User token holdings:', userHoldings.toString());

  const pendingRewards = await kaminoManager.getAllPendingRewardsForUserInVault(vaultHolder, vault);

  // read the prices from Kamino price API
  const prices = await fetch(getKaminoAllPricesAPI);
  const pricesJson = await prices.json();
  const pricesMap = new Map<Address, Decimal>();
  for (const price of pricesJson) {
    pricesMap.set(address(price.mint), new Decimal(price.usdPrice));
  }

  const SOL_PRICE = pricesMap.get(WRAPPED_SOL_MINT);

  for (const [tokenMint, pendingReward] of pendingRewards.totalPendingRewards.entries()) {
    const tokenPrice = pricesMap.get(tokenMint);
    console.log(`Pending reward ${tokenMint.toString()} in USD: ${pendingReward.mul(tokenPrice!).toString()}`);
    console.log(
      `Pending reward ${tokenMint.toString()} in SOL: ${pendingReward.mul(tokenPrice!).div(SOL_PRICE!).toString()}`
    );
  }
})().catch(async (e) => {
  console.error(e);
});
