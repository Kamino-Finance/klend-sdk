/* eslint-disable @typescript-eslint/no-unused-vars */
import {
  address,
  Address,
  fetchEncodedAccount,
  fetchEncodedAccounts,
  GetAccountInfoApi,
  GetMultipleAccountsApi,
  Rpc,
} from "@solana/kit"
/* eslint-enable @typescript-eslint/no-unused-vars */
import BN from "bn.js" // eslint-disable-line @typescript-eslint/no-unused-vars
import * as borsh from "@coral-xyz/borsh" // eslint-disable-line @typescript-eslint/no-unused-vars
import { borshAddress } from "../utils" // eslint-disable-line @typescript-eslint/no-unused-vars
import * as types from "../types" // eslint-disable-line @typescript-eslint/no-unused-vars
import { PROGRAM_ID } from "../programId"

export interface VaultStateFields {
  vaultAdminAuthority: Address
  baseVaultAuthority: Address
  baseVaultAuthorityBump: BN
  tokenMint: Address
  tokenMintDecimals: BN
  tokenVault: Address
  tokenProgram: Address
  sharesMint: Address
  sharesMintDecimals: BN
  tokenAvailable: BN
  sharesIssued: BN
  availableCrankFunds: BN
  unallocatedWeight: BN
  performanceFeeBps: BN
  managementFeeBps: BN
  lastFeeChargeTimestamp: BN
  prevAumSf: BN
  pendingFeesSf: BN
  vaultAllocationStrategy: Array<types.VaultAllocationFields>
  padding1: Array<BN>
  minDepositAmount: BN
  minWithdrawAmount: BN
  minInvestAmount: BN
  minInvestDelaySlots: BN
  crankFundFeePerReserve: BN
  pendingAdmin: Address
  cumulativeEarnedInterestSf: BN
  cumulativeMgmtFeesSf: BN
  cumulativePerfFeesSf: BN
  name: Array<number>
  vaultLookupTable: Address
  vaultFarm: Address
  creationTimestamp: BN
  unallocatedTokensCap: BN
  allocationAdmin: Address
  padding3: Array<BN>
}

export interface VaultStateJSON {
  vaultAdminAuthority: string
  baseVaultAuthority: string
  baseVaultAuthorityBump: string
  tokenMint: string
  tokenMintDecimals: string
  tokenVault: string
  tokenProgram: string
  sharesMint: string
  sharesMintDecimals: string
  tokenAvailable: string
  sharesIssued: string
  availableCrankFunds: string
  unallocatedWeight: string
  performanceFeeBps: string
  managementFeeBps: string
  lastFeeChargeTimestamp: string
  prevAumSf: string
  pendingFeesSf: string
  vaultAllocationStrategy: Array<types.VaultAllocationJSON>
  padding1: Array<string>
  minDepositAmount: string
  minWithdrawAmount: string
  minInvestAmount: string
  minInvestDelaySlots: string
  crankFundFeePerReserve: string
  pendingAdmin: string
  cumulativeEarnedInterestSf: string
  cumulativeMgmtFeesSf: string
  cumulativePerfFeesSf: string
  name: Array<number>
  vaultLookupTable: string
  vaultFarm: string
  creationTimestamp: string
  unallocatedTokensCap: string
  allocationAdmin: string
  padding3: Array<string>
}

export class VaultState {
  readonly vaultAdminAuthority: Address
  readonly baseVaultAuthority: Address
  readonly baseVaultAuthorityBump: BN
  readonly tokenMint: Address
  readonly tokenMintDecimals: BN
  readonly tokenVault: Address
  readonly tokenProgram: Address
  readonly sharesMint: Address
  readonly sharesMintDecimals: BN
  readonly tokenAvailable: BN
  readonly sharesIssued: BN
  readonly availableCrankFunds: BN
  readonly unallocatedWeight: BN
  readonly performanceFeeBps: BN
  readonly managementFeeBps: BN
  readonly lastFeeChargeTimestamp: BN
  readonly prevAumSf: BN
  readonly pendingFeesSf: BN
  readonly vaultAllocationStrategy: Array<types.VaultAllocation>
  readonly padding1: Array<BN>
  readonly minDepositAmount: BN
  readonly minWithdrawAmount: BN
  readonly minInvestAmount: BN
  readonly minInvestDelaySlots: BN
  readonly crankFundFeePerReserve: BN
  readonly pendingAdmin: Address
  readonly cumulativeEarnedInterestSf: BN
  readonly cumulativeMgmtFeesSf: BN
  readonly cumulativePerfFeesSf: BN
  readonly name: Array<number>
  readonly vaultLookupTable: Address
  readonly vaultFarm: Address
  readonly creationTimestamp: BN
  readonly unallocatedTokensCap: BN
  readonly allocationAdmin: Address
  readonly padding3: Array<BN>

  static readonly discriminator = Buffer.from([
    228, 196, 82, 165, 98, 210, 235, 152,
  ])

  static readonly layout = borsh.struct<VaultState>([
    borshAddress("vaultAdminAuthority"),
    borshAddress("baseVaultAuthority"),
    borsh.u64("baseVaultAuthorityBump"),
    borshAddress("tokenMint"),
    borsh.u64("tokenMintDecimals"),
    borshAddress("tokenVault"),
    borshAddress("tokenProgram"),
    borshAddress("sharesMint"),
    borsh.u64("sharesMintDecimals"),
    borsh.u64("tokenAvailable"),
    borsh.u64("sharesIssued"),
    borsh.u64("availableCrankFunds"),
    borsh.u64("unallocatedWeight"),
    borsh.u64("performanceFeeBps"),
    borsh.u64("managementFeeBps"),
    borsh.u64("lastFeeChargeTimestamp"),
    borsh.u128("prevAumSf"),
    borsh.u128("pendingFeesSf"),
    borsh.array(types.VaultAllocation.layout(), 25, "vaultAllocationStrategy"),
    borsh.array(borsh.u128(), 256, "padding1"),
    borsh.u64("minDepositAmount"),
    borsh.u64("minWithdrawAmount"),
    borsh.u64("minInvestAmount"),
    borsh.u64("minInvestDelaySlots"),
    borsh.u64("crankFundFeePerReserve"),
    borshAddress("pendingAdmin"),
    borsh.u128("cumulativeEarnedInterestSf"),
    borsh.u128("cumulativeMgmtFeesSf"),
    borsh.u128("cumulativePerfFeesSf"),
    borsh.array(borsh.u8(), 40, "name"),
    borshAddress("vaultLookupTable"),
    borshAddress("vaultFarm"),
    borsh.u64("creationTimestamp"),
    borsh.u64("unallocatedTokensCap"),
    borshAddress("allocationAdmin"),
    borsh.array(borsh.u128(), 242, "padding3"),
  ])

  constructor(fields: VaultStateFields) {
    this.vaultAdminAuthority = fields.vaultAdminAuthority
    this.baseVaultAuthority = fields.baseVaultAuthority
    this.baseVaultAuthorityBump = fields.baseVaultAuthorityBump
    this.tokenMint = fields.tokenMint
    this.tokenMintDecimals = fields.tokenMintDecimals
    this.tokenVault = fields.tokenVault
    this.tokenProgram = fields.tokenProgram
    this.sharesMint = fields.sharesMint
    this.sharesMintDecimals = fields.sharesMintDecimals
    this.tokenAvailable = fields.tokenAvailable
    this.sharesIssued = fields.sharesIssued
    this.availableCrankFunds = fields.availableCrankFunds
    this.unallocatedWeight = fields.unallocatedWeight
    this.performanceFeeBps = fields.performanceFeeBps
    this.managementFeeBps = fields.managementFeeBps
    this.lastFeeChargeTimestamp = fields.lastFeeChargeTimestamp
    this.prevAumSf = fields.prevAumSf
    this.pendingFeesSf = fields.pendingFeesSf
    this.vaultAllocationStrategy = fields.vaultAllocationStrategy.map(
      (item) => new types.VaultAllocation({ ...item })
    )
    this.padding1 = fields.padding1
    this.minDepositAmount = fields.minDepositAmount
    this.minWithdrawAmount = fields.minWithdrawAmount
    this.minInvestAmount = fields.minInvestAmount
    this.minInvestDelaySlots = fields.minInvestDelaySlots
    this.crankFundFeePerReserve = fields.crankFundFeePerReserve
    this.pendingAdmin = fields.pendingAdmin
    this.cumulativeEarnedInterestSf = fields.cumulativeEarnedInterestSf
    this.cumulativeMgmtFeesSf = fields.cumulativeMgmtFeesSf
    this.cumulativePerfFeesSf = fields.cumulativePerfFeesSf
    this.name = fields.name
    this.vaultLookupTable = fields.vaultLookupTable
    this.vaultFarm = fields.vaultFarm
    this.creationTimestamp = fields.creationTimestamp
    this.unallocatedTokensCap = fields.unallocatedTokensCap
    this.allocationAdmin = fields.allocationAdmin
    this.padding3 = fields.padding3
  }

  static async fetch(
    rpc: Rpc<GetAccountInfoApi>,
    address: Address,
    programId: Address = PROGRAM_ID
  ): Promise<VaultState | null> {
    const info = await fetchEncodedAccount(rpc, address)

    if (!info.exists) {
      return null
    }
    if (info.programAddress !== programId) {
      throw new Error(
        `VaultStateFields account ${address} belongs to wrong program ${info.programAddress}, expected ${programId}`
      )
    }

    return this.decode(Buffer.from(info.data))
  }

  static async fetchMultiple(
    rpc: Rpc<GetMultipleAccountsApi>,
    addresses: Address[],
    programId: Address = PROGRAM_ID
  ): Promise<Array<VaultState | null>> {
    const infos = await fetchEncodedAccounts(rpc, addresses)

    return infos.map((info) => {
      if (!info.exists) {
        return null
      }
      if (info.programAddress !== programId) {
        throw new Error(
          `VaultStateFields account ${info.address} belongs to wrong program ${info.programAddress}, expected ${programId}`
        )
      }

      return this.decode(Buffer.from(info.data))
    })
  }

  static decode(data: Buffer): VaultState {
    if (!data.slice(0, 8).equals(VaultState.discriminator)) {
      throw new Error("invalid account discriminator")
    }

    const dec = VaultState.layout.decode(data.slice(8))

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
      performanceFeeBps: dec.performanceFeeBps,
      managementFeeBps: dec.managementFeeBps,
      lastFeeChargeTimestamp: dec.lastFeeChargeTimestamp,
      prevAumSf: dec.prevAumSf,
      pendingFeesSf: dec.pendingFeesSf,
      vaultAllocationStrategy: dec.vaultAllocationStrategy.map(
        (
          item: any /* eslint-disable-line @typescript-eslint/no-explicit-any */
        ) => types.VaultAllocation.fromDecoded(item)
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
      unallocatedTokensCap: dec.unallocatedTokensCap,
      allocationAdmin: dec.allocationAdmin,
      padding3: dec.padding3,
    })
  }

  toJSON(): VaultStateJSON {
    return {
      vaultAdminAuthority: this.vaultAdminAuthority,
      baseVaultAuthority: this.baseVaultAuthority,
      baseVaultAuthorityBump: this.baseVaultAuthorityBump.toString(),
      tokenMint: this.tokenMint,
      tokenMintDecimals: this.tokenMintDecimals.toString(),
      tokenVault: this.tokenVault,
      tokenProgram: this.tokenProgram,
      sharesMint: this.sharesMint,
      sharesMintDecimals: this.sharesMintDecimals.toString(),
      tokenAvailable: this.tokenAvailable.toString(),
      sharesIssued: this.sharesIssued.toString(),
      availableCrankFunds: this.availableCrankFunds.toString(),
      unallocatedWeight: this.unallocatedWeight.toString(),
      performanceFeeBps: this.performanceFeeBps.toString(),
      managementFeeBps: this.managementFeeBps.toString(),
      lastFeeChargeTimestamp: this.lastFeeChargeTimestamp.toString(),
      prevAumSf: this.prevAumSf.toString(),
      pendingFeesSf: this.pendingFeesSf.toString(),
      vaultAllocationStrategy: this.vaultAllocationStrategy.map((item) =>
        item.toJSON()
      ),
      padding1: this.padding1.map((item) => item.toString()),
      minDepositAmount: this.minDepositAmount.toString(),
      minWithdrawAmount: this.minWithdrawAmount.toString(),
      minInvestAmount: this.minInvestAmount.toString(),
      minInvestDelaySlots: this.minInvestDelaySlots.toString(),
      crankFundFeePerReserve: this.crankFundFeePerReserve.toString(),
      pendingAdmin: this.pendingAdmin,
      cumulativeEarnedInterestSf: this.cumulativeEarnedInterestSf.toString(),
      cumulativeMgmtFeesSf: this.cumulativeMgmtFeesSf.toString(),
      cumulativePerfFeesSf: this.cumulativePerfFeesSf.toString(),
      name: this.name,
      vaultLookupTable: this.vaultLookupTable,
      vaultFarm: this.vaultFarm,
      creationTimestamp: this.creationTimestamp.toString(),
      unallocatedTokensCap: this.unallocatedTokensCap.toString(),
      allocationAdmin: this.allocationAdmin,
      padding3: this.padding3.map((item) => item.toString()),
    }
  }

  static fromJSON(obj: VaultStateJSON): VaultState {
    return new VaultState({
      vaultAdminAuthority: address(obj.vaultAdminAuthority),
      baseVaultAuthority: address(obj.baseVaultAuthority),
      baseVaultAuthorityBump: new BN(obj.baseVaultAuthorityBump),
      tokenMint: address(obj.tokenMint),
      tokenMintDecimals: new BN(obj.tokenMintDecimals),
      tokenVault: address(obj.tokenVault),
      tokenProgram: address(obj.tokenProgram),
      sharesMint: address(obj.sharesMint),
      sharesMintDecimals: new BN(obj.sharesMintDecimals),
      tokenAvailable: new BN(obj.tokenAvailable),
      sharesIssued: new BN(obj.sharesIssued),
      availableCrankFunds: new BN(obj.availableCrankFunds),
      unallocatedWeight: new BN(obj.unallocatedWeight),
      performanceFeeBps: new BN(obj.performanceFeeBps),
      managementFeeBps: new BN(obj.managementFeeBps),
      lastFeeChargeTimestamp: new BN(obj.lastFeeChargeTimestamp),
      prevAumSf: new BN(obj.prevAumSf),
      pendingFeesSf: new BN(obj.pendingFeesSf),
      vaultAllocationStrategy: obj.vaultAllocationStrategy.map((item) =>
        types.VaultAllocation.fromJSON(item)
      ),
      padding1: obj.padding1.map((item) => new BN(item)),
      minDepositAmount: new BN(obj.minDepositAmount),
      minWithdrawAmount: new BN(obj.minWithdrawAmount),
      minInvestAmount: new BN(obj.minInvestAmount),
      minInvestDelaySlots: new BN(obj.minInvestDelaySlots),
      crankFundFeePerReserve: new BN(obj.crankFundFeePerReserve),
      pendingAdmin: address(obj.pendingAdmin),
      cumulativeEarnedInterestSf: new BN(obj.cumulativeEarnedInterestSf),
      cumulativeMgmtFeesSf: new BN(obj.cumulativeMgmtFeesSf),
      cumulativePerfFeesSf: new BN(obj.cumulativePerfFeesSf),
      name: obj.name,
      vaultLookupTable: address(obj.vaultLookupTable),
      vaultFarm: address(obj.vaultFarm),
      creationTimestamp: new BN(obj.creationTimestamp),
      unallocatedTokensCap: new BN(obj.unallocatedTokensCap),
      allocationAdmin: address(obj.allocationAdmin),
      padding3: obj.padding3.map((item) => new BN(item)),
    })
  }
}
