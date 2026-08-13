import { Address, address } from '@solana/kit';
import Decimal from 'decimal.js';
import { ReserveWhitelistEntry } from '../@codegen/kvault/accounts';
import { getReserveWhitelistEntryPda } from '../classes/vault';
import { KaminoReserve, lamportsToDecimal } from '../lib';
import { ManagerEnv, initEnv } from './tx/ManagerEnv';
import type { PrintableFarmIncentives, PrintableReserveAllocation, ReserveWhitelistStatus } from './types';

export async function loadReserveWhitelistStatus(
  env: ManagerEnv,
  reserveAddress: Address
): Promise<ReserveWhitelistStatus> {
  const pda = await getReserveWhitelistEntryPda(reserveAddress, env.kvaultProgramId);
  const entry = await ReserveWhitelistEntry.fetch(env.c.rpc, pda, env.kvaultProgramId);
  const whitelistInvest = entry ? entry.whitelistInvest : 0;
  const whitelistAddAllocation = entry ? entry.whitelistAddAllocation : 0;

  return {
    reserveAddress,
    pda,
    entry,
    whitelistInvest,
    whitelistAddAllocation,
    whitelistedForInvest: whitelistInvest !== 0,
    whitelistedForAddAllocation: whitelistAddAllocation !== 0,
  };
}

export function printReserveWhitelistStatus(status: ReserveWhitelistStatus): void {
  console.log(`Reserve ${status.reserveAddress}`);
  console.log(`  PDA: ${status.pda}${status.entry ? '' : ' (not initialized)'}`);
  if (status.entry) {
    console.log(`  tokenMint: ${status.entry.tokenMint}`);
  }
  console.log(`  invest: ${status.whitelistedForInvest ? 'whitelisted' : 'not whitelisted'}`);
  console.log(`  addAllocation: ${status.whitelistedForAddAllocation ? 'whitelisted' : 'not whitelisted'}`);
  console.log(`  whitelistInvest: ${status.whitelistInvest}`);
  console.log(`  whitelistAddAllocation: ${status.whitelistAddAllocation}`);
  console.log(
    `  fullyWhitelisted: ${status.whitelistedForInvest && status.whitelistedForAddAllocation ? 'yes' : 'no'}`
  );
}

export async function checkReserveWhitelistCommand({
  reserve,
  staging,
  devnet,
}: {
  reserve: string;
  staging?: boolean;
  devnet?: boolean;
}): Promise<void> {
  const env = await initEnv(staging, undefined, undefined, undefined, devnet);
  const reserveAddress = address(reserve);
  printReserveWhitelistStatus(await loadReserveWhitelistStatus(env, reserveAddress));
}

export function formatApy(value: Decimal.Value): string {
  const decimal = new Decimal(value);
  return `${decimal.toString()} (${decimal.mul(100).toFixed(6)}%)`;
}

export function printVaultReserveAllocations(
  allocations: Map<Address, PrintableReserveAllocation>,
  vaultReservesMap: Map<Address, KaminoReserve>
): void {
  console.log('Reserve allocations:');
  if (allocations.size === 0) {
    console.log('  None');
    return;
  }

  const totalWeight = Array.from(allocations.values()).reduce(
    (sum, allocation) => sum.add(allocation.targetWeight),
    new Decimal(0)
  );

  allocations.forEach((allocation, reserveAddress) => {
    const reserve = vaultReservesMap.get(reserveAddress);
    const targetWeightPct = totalWeight.isZero() ? new Decimal(0) : allocation.targetWeight.mul(100).div(totalWeight);

    console.log(`  reserve ${reserveAddress}`);
    if (reserve) {
      console.log(`    symbol: ${reserve.symbol}`);
      console.log(`    mint: ${reserve.getLiquidityMint()}`);
    }
    console.log(`    targetWeight: ${allocation.targetWeight.toString()}`);
    console.log(`    targetWeightPct: ${targetWeightPct.toString()}%`);
    console.log(`    tokenAllocationCapLamports: ${allocation.tokenAllocationCapLamports.toString()}`);
    if (reserve) {
      console.log(
        `    tokenAllocationCap: ${lamportsToDecimal(
          allocation.tokenAllocationCapLamports,
          reserve.getMintDecimals()
        ).toString()}`
      );
    }
    if (allocation.ctokenAllocationCapLamports !== undefined) {
      console.log(`    ctokenAllocationCapLamports: ${allocation.ctokenAllocationCapLamports.toString()}`);
    }
    console.log(`    ctokenAllocationLamports: ${allocation.ctokenAllocationLamports.toString()}`);
  });
}

function printFarmIncentives(prefix: string, incentives: PrintableFarmIncentives): void {
  console.log(`${prefix}totalIncentivesApy: ${formatApy(incentives.totalIncentivesApy)}`);

  if (incentives.incentivesStats.length === 0) {
    console.log(`${prefix}rewards: none`);
    return;
  }

  incentives.incentivesStats.forEach((reward, index) => {
    console.log(`${prefix}reward ${index + 1}:`);
    console.log(`${prefix}  mint: ${reward.rewardMint}`);
    console.log(`${prefix}  decimals: ${reward.rewardDecimals.toString()}`);
    console.log(`${prefix}  hasRewardAvailable: ${reward.hasRewardAvailable}`);
    console.log(`${prefix}  incentivesApy: ${formatApy(reward.incentivesApy)}`);
    console.log(`${prefix}  value: ${reward.value.toString()}`);
    console.log(`${prefix}  dailyRewards: ${reward.dailyRewards.toString()}`);
    console.log(`${prefix}  weeklyRewards: ${reward.weeklyRewards.toString()}`);
    console.log(`${prefix}  monthlyRewards: ${reward.monthlyRewards.toString()}`);
    console.log(`${prefix}  yearlyRewards: ${reward.yearlyRewards.toString()}`);
  });
}

export function printVaultReserveFarmIncentives(
  reserveFarmsIncentives: Map<Address, PrintableFarmIncentives>,
  totalIncentivesAPY: Decimal
): void {
  console.log('Reserve farm incentives:');
  if (reserveFarmsIncentives.size === 0) {
    console.log('  None');
  }

  reserveFarmsIncentives.forEach((incentives, reserveAddress) => {
    console.log(`  reserve ${reserveAddress}`);
    printFarmIncentives('    ', incentives);
  });

  console.log(`  totalWeightedIncentivesAPY: ${formatApy(totalIncentivesAPY)}`);
}
