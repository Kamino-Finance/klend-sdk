import { LoanArgs, MarketArgs, ReserveArgs } from './models';
import {
  buildAndSendTxn,
  KaminoMarket,
  KaminoObligation,
  KaminoReserve,
  lamportsToNumberDecimal,
  getMedianSlotDurationInMsFromLastEpochs,
  PubkeyHashMap,
  MarketOverview,
  ReserveOverview,
  pubkeyHashMapToJson,
  ReserveAllocationOverview,
  VaultHoldingsWithUSDValue,
  VaultOverview,
} from '@kamino-finance/klend-sdk';
import Decimal from 'decimal.js';
import { FarmState, RewardInfo } from '@kamino-finance/farms-sdk';
import { Scope } from '@kamino-finance/scope-sdk';
import { aprToApy, KaminoPrices } from '@kamino-finance/kliquidity-sdk';
import { Connection, Keypair, PublicKey, TransactionInstruction } from '@solana/web3.js';

/**
 * Get Kamino Lending Market
 * @param connection
 * @param marketPubkey
 */
export async function getMarket({ connection, marketPubkey }: MarketArgs) {
  const slotDuration = await getMedianSlotDurationInMsFromLastEpochs();
  const market = await KaminoMarket.load(connection, marketPubkey, slotDuration);
  if (!market) {
    throw Error(`Could not load market ${marketPubkey.toString()}`);
  }
  return market;
}

/**
 * Get loan for loan (obligation) public key
 * @param args
 */
export async function getLoan(args: LoanArgs): Promise<KaminoObligation | null> {
  const market = await getMarket(args);
  return market.getObligationByAddress(args.obligationPubkey);
}

export async function loadReserveData({ connection, marketPubkey, mintPubkey }: ReserveArgs) {
  const market = await getMarket({ connection, marketPubkey });
  const reserve = market.getReserveByMint(mintPubkey);
  if (!reserve) {
    throw Error(`Could not load reserve for ${mintPubkey.toString()}`);
  }
  const currentSlot = await connection.getSlot();

  return { market, reserve, currentSlot };
}

/**
 * Get reserve rewards APY
 */
export async function getReserveRewardsApy(args: ReserveArgs) {
  const { market, reserve } = await loadReserveData(args);
  const rewardApys: { rewardApy: Decimal; rewardInfo: RewardInfo }[] = [];

  const scope = new Scope('mainnet-beta', args.connection);
  const oraclePrices = await scope.getOraclePrices();
  const prices = await market.getAllScopePrices(scope, oraclePrices);

  const farmStates = await FarmState.fetchMultiple(args.connection, [
    reserve.state.farmDebt,
    reserve.state.farmCollateral,
  ]);

  // We are not calculating APY for debt rewards
  const isDebtReward = false;

  for (const farmState of farmStates.filter((x) => x !== null)) {
    for (const rewardInfo of farmState!.rewardInfos.filter((x) => !x.token.mint.equals(PublicKey.default))) {
      const { apy } = calculateRewardApy(prices, reserve, rewardInfo, isDebtReward);
      rewardApys.push({ rewardApy: apy, rewardInfo });
    }
  }
  return rewardApys;
}

/**
 * Get APY/APR of a farm with rewards
 * @param prices
 * @param reserve
 * @param rewardInfo
 * @param isDebtReward
 */
export function calculateRewardApy(
  prices: KaminoPrices,
  reserve: KaminoReserve,
  rewardInfo: RewardInfo,
  isDebtReward: boolean
) {
  const { decimals } = reserve.stats;
  const totalBorrows = reserve.getBorrowedAmount();
  const totalSupply = reserve.getTotalSupply();
  const mintAddress = reserve.getLiquidityMint();
  const totalAmount = isDebtReward
    ? lamportsToNumberDecimal(totalBorrows, decimals)
    : lamportsToNumberDecimal(totalSupply, decimals);
  const totalValue = totalAmount.mul(prices.spot[mintAddress.toString()].price);
  const rewardPerTimeUnitSecond = getRewardPerTimeUnitSecond(rewardInfo);
  const rewardsInYear = rewardPerTimeUnitSecond.mul(60 * 60 * 24 * 365);
  const rewardsInYearValue = rewardsInYear.mul(prices.spot[rewardInfo.token.mint.toString()].price);
  const apr = rewardsInYearValue.div(totalValue);
  return { apr, apy: aprToApy(apr, 1) };
}

function getRewardPerTimeUnitSecond(reward: RewardInfo) {
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

export async function executeUserSetupLutsTransactions(
  connection: Connection,
  wallet: Keypair,
  setupIxns: Array<Array<TransactionInstruction>>
) {
  for (const setupIxnsGroup of setupIxns) {
    if (setupIxnsGroup.length === 0) {
      continue;
    }
    const txHash = await buildAndSendTxn(connection, wallet, setupIxnsGroup, [], []);
    console.log('txHash', txHash);
  }
}

export function printReservesOverviewMap(map: PubkeyHashMap<PublicKey, ReserveOverview>) {
  map.forEach((value, key) => {
    console.log('Reserve:', key.toString());
    printReserveOverview(value);
  });
}

export function printReserveOverview(reserveOverview: ReserveOverview) {
  console.log('Total borrowed from reserve:', reserveOverview.totalBorrowedAmount.toString());
  console.log('Borrowed from the supplied amount:', reserveOverview.amountBorrowedFromSupplied.toString());
  console.log('Supplied:', reserveOverview.suppliedAmount.toString());
  console.log('Utilization ratio:', reserveOverview.utilizationRatio.toString());
  console.log('Liquidation Threshold Pct:', reserveOverview.liquidationThresholdPct.toString());
  console.log('Supply APY:', reserveOverview.supplyAPY.toString());
  console.log('Lending market:', reserveOverview.market.toString());
}

export function printMarketsOverviewMap(map: PubkeyHashMap<PublicKey, MarketOverview>) {
  map.forEach((value, key) => {
    console.log('Reserve:', key.toString());
    printMarketOverview(value);
  });
}

export function printMarketOverview(marketOverview: MarketOverview) {
  console.log('Market overview:');
  console.log('  Address:', marketOverview.address.toString());
  console.log('  Min LTV percentage:', marketOverview.minLTVPct.toString());
  console.log('  Max LTV percentage:', marketOverview.maxLTVPct.toString());
  marketOverview.reservesAsCollateral.forEach((reserve, _) => {
    console.log('    Liquidation LTV percentage:', reserve.liquidationLTVPct.toString());
  });
}

export function printReservesAllocationOverviewMap(map: PubkeyHashMap<PublicKey, ReserveAllocationOverview>) {
  map.forEach((value, key) => {
    console.log('Reserve:', key.toString());
    printReserveAllocationOverview(value);
  });
}

export function printReserveAllocationOverview(reserveAllocationOverview: ReserveAllocationOverview) {
  console.log('Reserve allocation overview:');
  console.log('  Target weight:', reserveAllocationOverview.targetWeight.toString());
  console.log('  Token allocation cap:', reserveAllocationOverview.tokenAllocationCap.toString());
  console.log('  Ctoken allocation:', reserveAllocationOverview.ctokenAllocation.toString());
}

export function printPubkeyHashMap<V>(map: PubkeyHashMap<PublicKey, V>) {
  console.log(pubkeyHashMapToJson(map));
}

export function printHoldingsWithUSDValue(holdings: VaultHoldingsWithUSDValue) {
  console.log('Holdings with USD value:');
  console.log('  Available:', holdings.availableUSD.toString());
  console.log('  Invested:', holdings.investedUSD.toString());
  console.log('  Total including pending fees:', holdings.totalUSDIncludingFees.toString());
  console.log('  Pending fees:', holdings.pendingFeesUSD.toString());
  console.log('  Invested in reserves:', pubkeyHashMapToJson(holdings.investedInReservesUSD));
}

export function printVaultOverview(vaultOverview: VaultOverview) {
  console.log('Vault overview:');
  printHoldingsWithUSDValue(vaultOverview.holdingsUSD);
  console.log('  Theoretical Supply APY:', vaultOverview.theoreticalSupplyAPY.toString());
  console.log('  Utilization ratio:', vaultOverview.utilizationRatio.toString());
  console.log('  Total supplied:', vaultOverview.totalSupplied.toString());
  console.log('  Borrowed amount:', vaultOverview.totalBorrowed.toString());

  vaultOverview.reservesOverview.forEach((reserveOverview, pubkey) => {
    console.log('  Reserve:', pubkey.toString());
    console.log('    Total borrowed from reserve:', reserveOverview.totalBorrowedAmount.toString());
    console.log('    Supplied:', reserveOverview.suppliedAmount.toString());
    console.log('    Utilization ratio:', reserveOverview.utilizationRatio.toString());
    console.log('    Liquidation Threshold Pct:', reserveOverview.liquidationThresholdPct.toString());
    console.log('    Supply APY:', reserveOverview.supplyAPY.toString());
    console.log('    Lending market:', reserveOverview.market.toString());
  });
}
