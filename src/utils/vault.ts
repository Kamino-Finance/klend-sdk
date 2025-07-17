import { VaultState } from '../@codegen/kvault/accounts/VaultState';
import { VaultAllocation } from '../@codegen/kvault/types/VaultAllocation';

export function decodeVaultState(data: Buffer): VaultState {
  if (!VaultState.discriminator.equals(data.slice(0, 8))) {
    throw new Error('invalid account discriminator');
  }

  const dec = VaultState.layout.decode(data.slice(8));

  return new VaultState({
    vaultAdminAuthority: dec.vaultAdminAuthority,
    baseVaultAuthority: dec.baseVaultAuthority,
    baseVaultAuthorityBump: dec.baseVaultAuthorityBump,
    tokenMint: dec.tokenMint,
    tokenMintDecimals: dec.tokenMintDecimals,
    tokenVault: dec.tokenVault,
    tokenProgram: dec.tokenProgram,
    sharesMint: dec.sharesMint,
    sharesMintDecimals: dec.sharesMintDecimals,
    tokenAvailable: dec.tokenAvailable,
    sharesIssued: dec.sharesIssued,
    availableCrankFunds: dec.availableCrankFunds,
    unallocatedWeight: dec.unallocatedWeight,
    unallocatedTokensCap: dec.unallocatedTokensCap,
    performanceFeeBps: dec.performanceFeeBps,
    managementFeeBps: dec.managementFeeBps,
    lastFeeChargeTimestamp: dec.lastFeeChargeTimestamp,
    prevAumSf: dec.prevAumSf,
    pendingFeesSf: dec.pendingFeesSf,
    vaultAllocationStrategy: dec.vaultAllocationStrategy.map(
      (item: any /* eslint-disable-line @typescript-eslint/no-explicit-any */) => VaultAllocation.fromDecoded(item)
    ),
    padding1: dec.padding1,
    minDepositAmount: dec.minDepositAmount,
    minWithdrawAmount: dec.minWithdrawAmount,
    minInvestAmount: dec.minInvestAmount,
    minInvestDelaySlots: dec.minInvestDelaySlots,
    crankFundFeePerReserve: dec.crankFundFeePerReserve,
    pendingAdmin: dec.pendingAdmin,
    cumulativeEarnedInterestSf: dec.cumulativeEarnedInterestSf,
    cumulativeMgmtFeesSf: dec.cumulativeMgmtFeesSf,
    cumulativePerfFeesSf: dec.cumulativePerfFeesSf,
    name: dec.name,
    vaultLookupTable: dec.vaultLookupTable,
    vaultFarm: dec.vaultFarm,
    creationTimestamp: dec.creationTimestamp,
    allocationAdmin: dec.allocationAdmin,
    padding3: dec.padding3,
  });
}
