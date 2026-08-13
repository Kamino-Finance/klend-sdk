import { Scope } from '@kamino-finance/scope-sdk';
import {
  getUserLutAddressAndSetupIxs,
  getScopeRefreshIxForObligationAndReserves,
  KaminoMarket,
  KaminoObligation,
  KaminoReserve,
  LedgerInstant,
  ObligationStats,
  getCurrentLedgerInstant,
} from '@kamino-finance/klend-sdk';
import {
  Account,
  Address,
  address,
  createSolanaRpcSubscriptions,
  Instruction,
  none,
  Rpc,
  SolanaRpcApi,
  TransactionSigner,
} from '@solana/kit';
import { AddressLookupTable, fetchAllMaybeAddressLookupTable } from '@solana-program/address-lookup-table';
import Decimal from 'decimal.js';
import { JLP_MARKET, JLP_MARKET_LUT, MAIN_MARKET, MAIN_MARKET_LUT } from './constants';
import { initRpc, ConnectionPool } from './connection';
import { getMarket } from './helpers';
import { readKeypairFile } from './keypair';
import { getCompiledTransactionSize, sendAndConfirmTx, simulateTx } from './tx';
import { getKaminoResources } from './kamino_resources';

export type SwapExampleContext = {
  connection: ConnectionPool;
  wallet: TransactionSigner;
  market: KaminoMarket;
  obligation: KaminoObligation;
  currentSlot: bigint;
  currentLedgerInstant: LedgerInstant;
};

export async function loadSwapExampleContext(args: {
  rpcUrl: string;
  keypairPath: string;
  obligationAddress: Address;
  marketAddress?: Address;
}): Promise<SwapExampleContext> {
  const connection = buildConnectionPool(args.rpcUrl);
  const wallet = await readKeypairFile(args.keypairPath);
  const market = await getMarket({ rpc: connection.rpc, marketPubkey: args.marketAddress ?? MAIN_MARKET });
  const obligation = await market.getObligationByAddress(args.obligationAddress);

  if (!obligation) {
    throw new Error(`Obligation ${args.obligationAddress} was not found in market ${market.getAddress()}`);
  }

  if (obligation.state.owner !== wallet.address) {
    throw new Error(
      `Keypair ${wallet.address} does not own obligation ${args.obligationAddress}; owner is ${obligation.state.owner}`
    );
  }

  const currentLedgerInstant = await getCurrentLedgerInstant(connection.rpc, 'processed');
  return { connection, wallet, market, obligation, currentSlot: currentLedgerInstant.slot, currentLedgerInstant };
}

export function buildConnectionPool(rpcUrl: string): ConnectionPool {
  const rpc = initRpc(rpcUrl);
  const wsUrl = new URL(rpcUrl);
  if (wsUrl.protocol === 'https:') {
    wsUrl.protocol = 'wss:';
  } else if (wsUrl.protocol === 'http:') {
    wsUrl.protocol = 'ws:';
  }
  return {
    rpc,
    wsRpc: createSolanaRpcSubscriptions(wsUrl.href),
  };
}

export async function getScopeRefreshIxs(args: {
  market: KaminoMarket;
  obligation: KaminoObligation;
  reserveA: KaminoReserve;
  reserveB: KaminoReserve;
  rpc: Rpc<SolanaRpcApi>;
  scopeCluster?: string;
}): Promise<Instruction[]> {
  const scope = new Scope((args.scopeCluster ?? 'mainnet-beta') as any, args.rpc);
  const scopeConfiguration = { scope, scopeConfigurations: await scope.getAllConfigurations() };
  return getScopeRefreshIxForObligationAndReserves(
    args.market,
    args.reserveA,
    args.reserveB,
    args.obligation,
    scopeConfiguration
  );
}

export function getPositionAmountOrThrow(args: {
  obligation: KaminoObligation;
  reserve: KaminoReserve;
  kind: 'deposit' | 'borrow';
}): Decimal {
  const position =
    args.kind === 'deposit'
      ? args.obligation.getDepositByReserve(args.reserve.address)
      : args.obligation.getBorrowByReserve(args.reserve.address);

  if (!position) {
    throw new Error(
      `Obligation has no ${args.kind} position for ${args.reserve.symbol} (${args.reserve.getLiquidityMint()})`
    );
  }

  return position.amount.div(args.reserve.getMintFactor());
}

export function printObligationSummary(market: KaminoMarket, obligation: KaminoObligation): void {
  const stats: ObligationStats = obligation.refreshedStats;
  console.log('Obligation:', obligation.obligationAddress.toString());
  console.log('Owner:', obligation.state.owner.toString());
  console.log('Market:', market.getAddress().toString());
  console.log('Elevation group:', obligation.state.elevationGroup);
  console.log('Total deposit USD:', stats.userTotalDeposit.toFixed(6));
  console.log('Total borrow USD:', stats.userTotalBorrow.toFixed(6));
  console.log('LTV:', obligation.loanToValue().mul(100).toFixed(6), '%');

  console.log('\nDeposits:');
  for (const deposit of obligation.getDeposits()) {
    const reserve = market.getExistingReserveByAddress(deposit.reserveAddress);
    console.log(
      [
        `- ${reserve.symbol}`,
        `mint=${deposit.mintAddress}`,
        `reserve=${deposit.reserveAddress}`,
        `amount=${deposit.amount.div(reserve.getMintFactor()).toFixed()}`,
        `valueUsd=${deposit.marketValueRefreshed.toFixed(6)}`,
      ].join(' ')
    );
  }

  console.log('\nBorrows:');
  for (const borrow of obligation.getBorrows()) {
    const reserve = market.getExistingReserveByAddress(borrow.reserveAddress);
    console.log(
      [
        `- ${reserve.symbol}`,
        `mint=${borrow.mintAddress}`,
        `reserve=${borrow.reserveAddress}`,
        `amount=${borrow.amount.div(reserve.getMintFactor()).toFixed()}`,
        `valueUsd=${borrow.marketValueRefreshed.toFixed(6)}`,
      ].join(' ')
    );
  }
}

export async function executeOrSimulate(args: {
  connection: ConnectionPool;
  wallet: TransactionSigner;
  ixs: Instruction[];
  lookupTables: Account<AddressLookupTable>[];
  extraLookupTables: Address[];
  send: boolean;
  description: string;
}): Promise<void> {
  const lookupTables = await mergeLookupTables(args.connection.rpc, [args.lookupTables, args.extraLookupTables]);
  const lookupTableAddresses = lookupTables.map((lut) => lut.address);

  console.log('Instruction count:', args.ixs.length);
  console.log('Lookup table count:', lookupTables.length);

  if (args.send) {
    const signature = await sendAndConfirmTx(
      args.connection,
      args.wallet,
      args.ixs,
      [],
      lookupTableAddresses,
      args.description
    );
    console.log('Signature:', signature);
    return;
  }

  const simulation = await simulateTx(args.connection.rpc, args.wallet.address, args.ixs, lookupTables);
  console.log('Simulation result:', stringify(simulation.value));
  if (simulation.value.err) {
    throw new Error(`${args.description} simulation failed`);
  }
}

type SimulatingRoute<T> = {
  route: T;
  routeIndex: number;
  lookupTables: Account<AddressLookupTable>[];
  lookupTableAddresses: SelectedRouteLookupTableAddresses;
  score: Decimal;
};

type SelectedRouteLookupTableAddresses = {
  market: Address[];
  user: Address[];
  swapPair: Address[];
  findMinimal: Address[];
  manual: Address[];
};

export async function executeBestSimulatingRoute<
  T extends { ixs: Instruction[]; lookupTables: Account<AddressLookupTable>[] }
>(args: {
  connection: ConnectionPool;
  wallet: TransactionSigner;
  routes: T[];
  marketLookupTableAddress?: Address;
  userLookupTableAddress?: Address;
  swapPairLookupTableAddresses?: Address[];
  extraLookupTables: Address[];
  send: boolean;
  description: string;
  scoreRoute: (route: T, routeIndex: number) => Decimal.Value;
  printRoute: (route: T, routeIndex: number, score: Decimal) => void;
}): Promise<void> {
  console.log('Candidate routes:', args.routes.length);
  const passingRoutes: SimulatingRoute<T>[] = [];
  const failedRoutes: Array<{ routeIndex: number; err: unknown }> = [];

  for (let i = 0; i < args.routes.length; i++) {
    const route = args.routes[i];
    const routeAddresses = extractAddressesFromIxs(route.ixs);
    const findMinimalLookupTableAddresses = await findMinimalLookupTableAddressesForRoute(routeAddresses);
    const lookupTableAddresses = {
      market: args.marketLookupTableAddress ? [args.marketLookupTableAddress] : [],
      user: args.userLookupTableAddress ? [args.userLookupTableAddress] : [],
      swapPair: [
        ...(args.swapPairLookupTableAddresses ?? []),
        ...route.lookupTables.map((lookupTable) => lookupTable.address),
      ],
      findMinimal: findMinimalLookupTableAddresses,
      manual: args.extraLookupTables,
    };
    const lookupTables = await mergeLookupTables(args.connection.rpc, [
      lookupTableAddresses.market,
      lookupTableAddresses.user,
      lookupTableAddresses.swapPair,
      route.lookupTables,
      lookupTableAddresses.findMinimal,
      lookupTableAddresses.manual,
    ]);

    printRouteLookupTableCoverage(i, args.wallet.address, route.ixs, lookupTableAddresses, lookupTables);

    // A too-large transaction makes the RPC reject the simulate call with a thrown JSON-RPC error (not a
    // `value.err`), so catch it and treat the route as failed instead of aborting the whole loop.
    let simulation: Awaited<ReturnType<typeof simulateTx>>;
    try {
      simulation = await simulateTx(args.connection.rpc, args.wallet.address, route.ixs, lookupTables);
    } catch (err) {
      console.log(`Route ${i} simulation threw: ${stringify(err instanceof Error ? err.message : err)}`);
      failedRoutes.push({ routeIndex: i, err });
      continue;
    }

    if (simulation.value.err) {
      failedRoutes.push({ routeIndex: i, err: simulation.value.err });
      continue;
    }

    passingRoutes.push({
      route,
      routeIndex: i,
      lookupTables,
      lookupTableAddresses,
      score: new Decimal(args.scoreRoute(route, i)),
    });
  }

  if (passingRoutes.length === 0) {
    const firstFailure = failedRoutes[0];
    const failureMessage = firstFailure
      ? ` First failure was route ${firstFailure.routeIndex}: ${stringify(firstFailure.err)}`
      : '';
    throw new Error(`${args.description} had no passing KSwap routes.${failureMessage}`);
  }

  passingRoutes.sort((left, right) => {
    const scoreComparison = right.score.cmp(left.score);
    return scoreComparison === 0 ? left.routeIndex - right.routeIndex : scoreComparison;
  });

  const selected = passingRoutes[0];
  const selectedRoute = selected.route;

  console.log(`Passing simulated routes: ${passingRoutes.length}/${args.routes.length}`);
  console.log(`Selected route: ${selected.routeIndex} (swapOutAmount ${selected.score.toFixed()})`);
  console.log(`Transaction: ${selectedRoute.ixs.length} instructions, ${selected.lookupTables.length} LUTs`);
  printSelectedLookupTables(selected.lookupTableAddresses, selected.lookupTables);
  args.printRoute(selectedRoute, selected.routeIndex, selected.score);

  if (args.send) {
    const signature = await sendAndConfirmTx(
      args.connection,
      args.wallet,
      selectedRoute.ixs,
      [],
      selected.lookupTables.map((lut) => lut.address),
      args.description
    );
    console.log('Signature:', signature);
    return;
  }

  if (failedRoutes.length > 0) {
    console.log('Failed simulated routes:', failedRoutes.length);
  }
}

export function getMarketLookupTableAddress(marketAddress: Address): Address | undefined {
  if (marketAddress === MAIN_MARKET) {
    return MAIN_MARKET_LUT;
  }
  if (marketAddress === JLP_MARKET) {
    return JLP_MARKET_LUT;
  }
  return undefined;
}

export async function setupUserLookupTable(args: {
  connection: ConnectionPool;
  wallet: TransactionSigner;
  market: KaminoMarket;
  obligation: KaminoObligation;
  // Either pass a flat list of reserves to involve (base-paired automatically — fine for in-place swaps), or pass
  // explicit coll/debt pairs. The pairs become `multiplyReserveAddresses` in getUserLutAddressAndSetupIxs, which
  // derives each pair's multiply-obligation PDA + obligation-farm-user-states into the user LUT — so for a multiply
  // migration, pass the exact { coll, sourceDebt } and { coll, newDebt } pairs to cover the NEW obligation.
  reserves?: Address[];
  reservePairs?: { coll: Address; debt: Address }[];
  sendSetupTransactions: boolean;
}): Promise<Address> {
  const multiplyReservePairs = args.reservePairs ?? buildLookupTableReservePairs(args.reserves ?? []);
  const [userLookupTableAddress, setupIxsGroups] = await withoutConsoleLog(() =>
    getUserLutAddressAndSetupIxs(args.market, args.wallet, none(), true, multiplyReservePairs, [], args.obligation)
  );
  const setupIxsGroupsToSend = setupIxsGroups.filter((setupIxsGroup) => setupIxsGroup.length > 0);

  if (setupIxsGroupsToSend.length === 0) {
    console.log('User LUT ready:', userLookupTableAddress);
    return userLookupTableAddress;
  }

  console.log(`User LUT ${userLookupTableAddress} needs ${setupIxsGroupsToSend.length} setup transaction(s).`);
  if (!args.sendSetupTransactions) {
    console.log('Dry run: not sending user LUT setup transactions. Pass --send to set it up before the swap.');
    return userLookupTableAddress;
  }

  const startSlot = await args.connection.rpc.getSlot().send();
  for (const setupIxsGroup of setupIxsGroupsToSend) {
    await sendAndConfirmTx(args.connection, args.wallet, setupIxsGroup, [], [], 'setupUserLut');
  }
  await waitForNextSlot(args.connection.rpc, startSlot);
  console.log('User LUT setup complete:', userLookupTableAddress);
  return userLookupTableAddress;
}

export function printSimulationDetails(details: unknown): void {
  const simulationDetails = details as
    | {
        flashLoan?: {
          flashBorrowReserveMint?: Address;
          flashBorrowedAmount?: Decimal.Value;
          flashRepaidAmount?: Decimal.Value;
        };
        externalSwap?: {
          swapInMint?: Address;
          swapOutMint?: Address;
          swapInAmount?: Decimal.Value;
          swapOutAmount?: Decimal.Value;
        };
      }
    | undefined;

  const flashLoan = simulationDetails?.flashLoan;
  if (flashLoan) {
    console.log(
      [
        'Flash loan:',
        `mint=${flashLoan.flashBorrowReserveMint}`,
        `borrow=${formatAmount(flashLoan.flashBorrowedAmount)}`,
        `repay=${formatAmount(flashLoan.flashRepaidAmount)}`,
      ].join(' ')
    );
  }

  const externalSwap = simulationDetails?.externalSwap;
  if (externalSwap) {
    console.log(
      [
        'External swap:',
        `${formatAmount(externalSwap.swapInAmount)} ${externalSwap.swapInMint}`,
        '->',
        `${formatAmount(externalSwap.swapOutAmount)} ${externalSwap.swapOutMint}`,
      ].join(' ')
    );
  }
}

export async function getSwapPairLookupTableAddressesForMints(mints: Address[]): Promise<Address[]> {
  const resources = await getKaminoResources();
  const uniqueMints = [...new Set(mints.map((mint) => mint.toString()))];
  const lookupTables = new Set<string>();

  for (const mint of uniqueMints) {
    for (const lut of resources.multiplyLUTs?.[mint] ?? []) {
      lookupTables.add(lut);
    }
  }

  for (let i = 0; i < uniqueMints.length; i++) {
    for (let j = 0; j < uniqueMints.length; j++) {
      if (i === j) {
        continue;
      }

      const left = uniqueMints[i];
      const right = uniqueMints[j];
      const pairKey = `${left}-${right}`;

      for (const lut of resources.multiplyLUTsPairs?.[left]?.[right] ?? []) {
        lookupTables.add(lut);
      }
      for (const lut of resources.leverageLUTs?.[pairKey] ?? []) {
        lookupTables.add(lut);
      }

      const repayWithCollLut = resources.repayWithCollLUTs?.[pairKey];
      if (repayWithCollLut) {
        lookupTables.add(repayWithCollLut);
      }
    }
  }

  return [...lookupTables].map((lut) => address(lut));
}

function stringify(value: unknown): string {
  return JSON.stringify(
    value,
    (_, item) => (typeof item === 'bigint' ? item.toString() : item instanceof Decimal ? item.toFixed() : item),
    2
  );
}

function formatAmount(value: Decimal.Value | undefined): string {
  return value === undefined ? 'n/a' : new Decimal(value).toFixed();
}

function printSelectedLookupTables(
  lookupTableAddresses: SelectedRouteLookupTableAddresses,
  fetchedLookupTables: Account<AddressLookupTable>[]
): void {
  const fetchedLookupTableAddresses = new Set(fetchedLookupTables.map((lookupTable) => lookupTable.address.toString()));

  console.log('Lookup tables:');
  printLookupTableCategory('KLend market LUT', lookupTableAddresses.market, fetchedLookupTableAddresses);
  printLookupTableCategory('User LUT', lookupTableAddresses.user, fetchedLookupTableAddresses);
  printLookupTableCategory('Swap pair LUTs from API', lookupTableAddresses.swapPair, fetchedLookupTableAddresses);
  printLookupTableCategory('find-minimal LUTs', lookupTableAddresses.findMinimal, fetchedLookupTableAddresses);
  if (lookupTableAddresses.manual.length > 0) {
    printLookupTableCategory('Manual LUTs', lookupTableAddresses.manual, fetchedLookupTableAddresses);
  }
  printLookupTableCategory(
    'Final merged LUTs',
    fetchedLookupTables.map((lookupTable) => lookupTable.address),
    fetchedLookupTableAddresses
  );
}

function printLookupTableCategory(label: string, addresses: Address[], fetchedLookupTableAddresses: Set<string>): void {
  const dedupedAddresses = dedupeAddresses(addresses);
  const fetchedCount = dedupedAddresses.filter((lookupTableAddress) =>
    fetchedLookupTableAddresses.has(lookupTableAddress.toString())
  ).length;

  console.log(`  ${label} (${fetchedCount}/${dedupedAddresses.length} fetched):`);
  if (dedupedAddresses.length === 0) {
    console.log('    - none');
    return;
  }

  for (const lookupTableAddress of dedupedAddresses) {
    const suffix = fetchedLookupTableAddresses.has(lookupTableAddress.toString()) ? '' : ' (not found)';
    console.log(`    - ${lookupTableAddress}${suffix}`);
  }
}

function buildLookupTableReservePairs(reserves: Address[]): { coll: Address; debt: Address }[] {
  // getUserLutAddressAndSetupIxs takes *reserve* addresses and only uses the pairs to gather the reserves/mints that
  // belong in the user's LUT (ATAs, cToken ATAs, farm states). The coll/debt grouping is incidental, so we base-pair
  // the given reserves — every reserve still ends up represented. We take reserve addresses directly (rather than
  // deriving them from mints) so this stays correct for fixed-rate reserves, where a mint maps to several reserves.
  const reserveAddresses = dedupeAddresses(reserves);
  if (reserveAddresses.length < 2) {
    return [];
  }

  const baseReserve = reserveAddresses[0];
  return reserveAddresses.slice(1).map((reserveAddress) => ({ coll: baseReserve, debt: reserveAddress }));
}

function dedupeAddresses(addresses: Address[]): Address[] {
  return [...new Map(addresses.map((item) => [item.toString(), item])).values()];
}

async function waitForNextSlot(rpc: Rpc<SolanaRpcApi>, startSlot: bigint): Promise<void> {
  let currentSlot = await rpc.getSlot().send();
  while (currentSlot <= startSlot) {
    await new Promise((resolve) => setTimeout(resolve, 400));
    currentSlot = await rpc.getSlot().send();
  }
}

async function withoutConsoleLog<T>(fn: () => Promise<T>): Promise<T> {
  const consoleLog = console.log;
  console.log = () => undefined;
  try {
    return await fn();
  } finally {
    console.log = consoleLog;
  }
}

function extractAddressesFromIxs(ixs: Instruction[]): string[] {
  return [
    ...new Set(
      ixs.flatMap((ix) => [
        ix.programAddress.toString(),
        ...(ix.accounts?.map((account) => account.address.toString()) ?? []),
      ])
    ),
  ];
}

// Diagnostic: for one candidate route, print the LUTs in use and how many of the route's accounts they cover.
// Accounts NOT in any LUT each cost 32 bytes in the message, so when a tx is too large this lists the exact
// culprits to add to a LUT.
function printRouteLookupTableCoverage(
  routeIndex: number,
  payer: Address,
  ixs: Instruction[],
  lookupTableAddresses: SelectedRouteLookupTableAddresses,
  lookupTables: Account<AddressLookupTable>[]
): void {
  const allAddresses = extractAddressesFromIxs(ixs);
  const lutKeys = new Set<string>();
  for (const lookupTable of lookupTables) {
    for (const key of lookupTable.data.addresses) {
      lutKeys.add(key.toString());
    }
  }
  const covered = allAddresses.filter((address) => lutKeys.has(address));
  const uncovered = allAddresses.filter((address) => !lutKeys.has(address));
  const size = getCompiledTransactionSize(payer, ixs, lookupTables);

  console.log(
    `Route ${routeIndex}: ${ixs.length} ixs, ${allAddresses.length} unique accounts — ${
      covered.length
    } covered by LUTs, ${uncovered.length} NOT covered (~${uncovered.length * 32} extra message bytes)`
  );
  console.log(
    `  Compiled size: ${size.rawBytes}/1232 raw bytes (${size.base64Bytes} base64) — ${
      size.fitsPacketLimit ? 'fits' : 'TOO LARGE'
    }`
  );
  console.log(
    `  LUT categories: market=${lookupTableAddresses.market.length} user=${lookupTableAddresses.user.length} ` +
      `swapPair=${lookupTableAddresses.swapPair.length} findMinimal=${lookupTableAddresses.findMinimal.length} ` +
      `manual=${lookupTableAddresses.manual.length}`
  );
  console.log(
    `  Merged LUTs (${lookupTables.length}): ` +
      lookupTables.map((lookupTable) => `${lookupTable.address}(${lookupTable.data.addresses.length} keys)`).join(', ')
  );
  if (uncovered.length > 0) {
    console.log('  Accounts NOT in any LUT:');
    for (const address of uncovered) {
      console.log(`    - ${address}`);
    }
  }
}

async function findMinimalLookupTableAddressesForRoute(addresses: string[]): Promise<Address[]> {
  if (addresses.length === 0) {
    return [];
  }

  const lutAddresses = new Set<string>();
  for (let i = 0; i < addresses.length; i += 100) {
    const chunk = addresses.slice(i, i + 100);
    const response = await fetch('https://api.kamino.finance/luts/find-minimal', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ addresses: chunk, verify: true }),
    });

    if (!response.ok) {
      console.log(`find-minimal LUT lookup failed: ${response.status} ${response.statusText}`);
      continue;
    }

    const body = (await response.json()) as { lutAddresses?: string[] } | string[];
    const addressesFromResponse = Array.isArray(body) ? body : body.lutAddresses;
    for (const lutAddress of addressesFromResponse ?? []) {
      lutAddresses.add(lutAddress);
    }
  }

  return [...lutAddresses].map((lut) => address(lut));
}

async function mergeLookupTables(
  rpc: Rpc<SolanaRpcApi>,
  lookupTableSources: Array<Account<AddressLookupTable>[] | Address[]>
): Promise<Account<AddressLookupTable>[]> {
  const fetchedLookupTables: Account<AddressLookupTable>[] = [];

  for (const source of lookupTableSources) {
    const addressesToFetch = source.filter((item): item is Address => typeof item === 'string');
    if (addressesToFetch.length === 0) {
      continue;
    }

    const maybeLookupTables = await fetchAllMaybeAddressLookupTable(rpc, addressesToFetch);
    for (const lookupTable of maybeLookupTables) {
      if (lookupTable.exists) {
        fetchedLookupTables.push(lookupTable);
      }
    }
  }

  const byAddress = new Map<Address, Account<AddressLookupTable>>();

  for (const lookupTable of [...lookupTableSources.flat(), ...fetchedLookupTables]) {
    if (typeof lookupTable === 'string') {
      continue;
    }
    byAddress.set(lookupTable.address, lookupTable);
  }

  return [...byAddress.values()];
}
