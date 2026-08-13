import { getConnectionPool } from '../utils/connection';
import { EXAMPLE_USDC_VAULT } from '../utils/constants';
import { Farms } from '@kamino-finance/farms-sdk';
import Decimal from 'decimal.js/decimal';
import {
  getCurrentLedgerInstant,
  getMedianSlotDurationInMsFromLastEpochs,
  KaminoManager,
  KaminoVault,
} from '@kamino-finance/klend-sdk';
import {
  printHoldingsWithUSDValue,
  printVaultOverview,
  printReservesOverviewMap,
  printReservesAllocationOverviewMap,
  printPubkeyHashMap,
  printMarketsOverviewMap,
} from '../utils/helpers';

(async () => {
  const c = getConnectionPool();
  const slotDuration = await getMedianSlotDurationInMsFromLastEpochs();

  const kaminoManager = new KaminoManager(c.rpc, slotDuration);
  const currentLedgerInstant = await getCurrentLedgerInstant(c.rpc, 'confirmed');
  const { slot } = currentLedgerInstant;

  // print vault state as it is on chain
  const vault = new KaminoVault(c.rpc, EXAMPLE_USDC_VAULT);
  const vaultState = await vault.getState();

  // pre-load vault reserves once and pass to all methods (avoids redundant RPC calls)
  const vaultReservesMap = await kaminoManager.loadVaultReserves(vaultState);
  const kaminoMarkets = await kaminoManager.loadKaminoMarketsForVaultReserves(vaultReservesMap);
  const farmsMap = await kaminoManager.loadVaultFarmStates([vaultState], vaultReservesMap);
  const farmsClient = new Farms(c.rpc);
  const globalConfig = await kaminoManager.loadKVaultGlobalConfig();

  // read how many tokens represents 1 share
  const tokensPerShare = await kaminoManager.getTokensPerShareSingleVault(vault, slot, vaultReservesMap, slot);
  console.log('Tokens per share:', tokensPerShare.toString());

  // read share price in USD
  const price = new Decimal(1.0); // hardcoded, this has to be read
  const sharePrice = await kaminoManager.getSharePriceInUSD(vault, price, slot, vaultReservesMap, slot);
  console.log('Share price:', sharePrice.toString());

  // read vault fees (management and performance)
  const fees = kaminoManager.getVaultFeesPct(vaultState);
  console.log('Vault fees:', fees);

  // read vault holdings (total balance, available, invested)
  const holdings = await kaminoManager.getVaultHoldings(vaultState, slot, vaultReservesMap, slot);
  holdings.print();

  // read vault holdings (total balance, available, invested) in dollars
  const tokenPrice = new Decimal(0.1); // hardcoded, this has to be the real price for the token of the vault
  const holdingsInUSD = await kaminoManager.getVaultHoldingsWithPrice(
    vaultState,
    tokenPrice,
    slot,
    vaultReservesMap,
    slot
  );
  printHoldingsWithUSDValue(holdingsInUSD);

  // read the overview of a vault, which contain all the main info: holdings, reserve details, theoretical APY at the slot provided, utilization ratio (weighted average of reserves), borrowed amount against the provided liquidity in reserves
  const vaultOverview = await kaminoManager.getVaultOverview(
    vault,
    tokenPrice,
    slot,
    vaultReservesMap,
    kaminoMarkets,
    farmsMap,
    farmsClient,
    globalConfig,
    slot
  );
  printVaultOverview(vaultOverview);

  // read the total supplied tokens from the vault into reserves, the total borrowed against these tokens and the utilization ratio
  const totalBorrowedAndInvested = await kaminoManager.getTotalBorrowedAndInvested(vaultState, slot, vaultReservesMap);
  console.log('Total borrowed and invested:', totalBorrowedAndInvested);

  // read the overview of the reserves in the vault allocation
  const reservesOverview = await kaminoManager.getVaultReservesDetails(vaultState, slot, vaultReservesMap);
  printReservesOverviewMap(reservesOverview);

  // get the vault APY assuming all tokens are all the time invested
  const apy = await kaminoManager.getVaultTheoreticalAPY(vaultState, slot, vaultReservesMap);
  console.log('Vault APY:', apy.toString());

  // read the total interest earned by the vault since its inception, including the perf fees
  const totalInterestEarned = await kaminoManager.getVaultCumulativeInterest(vaultState);
  console.log('Total interest earned:', totalInterestEarned.toString());

  // simulate holdings and earned interest at a given slot in the future
  const futureSlot = slot + 100n;
  const holdingsWithInterest = await kaminoManager.calculateSimulatedHoldingsWithInterest(
    vaultState,
    futureSlot,
    vaultReservesMap,
    undefined,
    currentLedgerInstant
  );
  holdingsWithInterest.holdings.print();
  console.log('Simuated earned interest', holdingsWithInterest.earnedInterest.toString());

  // read the list of all reserves that are part of the vault allocation
  const reserves = kaminoManager.getVaultReserves(vaultState);
  reserves.forEach((reserve) => {
    console.log(`Reserve pubkey:`, reserve.toString());
  });

  // retrieve all the tokens that can be use as collateral by the users who borrow the token in the vault alongside details about the min and max loan to value ratio
  const vaultCollaterals = await kaminoManager.getVaultCollaterals(vaultState, slot, vaultReservesMap, kaminoMarkets);
  printMarketsOverviewMap(vaultCollaterals);

  // read the reserve allocation weights in percentage
  const allocationDistributionPcts = kaminoManager.getAllocationsDistribuionPct(vaultState);
  printPubkeyHashMap(allocationDistributionPcts);

  // read the details (allocation weight, cap, ctokens) for each reserve in vault allocation
  const vaultAllocations = kaminoManager.getVaultAllocations(vaultState);
  printReservesAllocationOverviewMap(vaultAllocations);

  // // read how many tokens from the vault were invested in a specific reserve
  const reservePubkey = reserves[0]; // hardcoded, this has to be the reserve we want to check
  const kaminoReserve = vaultReservesMap.get(reservePubkey);
  const suppliedInReserve = kaminoManager.getSuppliedInReserve(vaultState, slot, kaminoReserve!);
  console.log('Vault tokens supplied in reserve:', suppliedInReserve.toString());
})().catch(async (e) => {
  console.error(e);
});
