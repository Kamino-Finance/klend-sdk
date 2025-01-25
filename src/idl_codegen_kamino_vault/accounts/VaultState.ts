import { PublicKey, Connection } from "@solana/web3.js"
import BN from "bn.js" // eslint-disable-line @typescript-eslint/no-unused-vars
import * as borsh from "@coral-xyz/borsh" // eslint-disable-line @typescript-eslint/no-unused-vars
import * as types from "../types" // eslint-disable-line @typescript-eslint/no-unused-vars
import { PROGRAM_ID } from "../programId"

export interface VaultStateFields {
  adminAuthority: PublicKey
  baseVaultAuthority: PublicKey
  baseVaultAuthorityBump: BN
  tokenMint: PublicKey
  tokenMintDecimals: BN
  tokenVault: PublicKey
  tokenProgram: PublicKey
  sharesMint: PublicKey
  sharesMintDecimals: BN
  tokenAvailable: BN
  sharesIssued: BN
  availableCrankFunds: BN
  padding0: BN
  performanceFeeBps: BN
  managementFeeBps: BN
  lastFeeChargeTimestamp: BN
  prevAumSf: BN
  pendingFeesSf: BN
  vaultAllocationStrategy: Array<types.VaultAllocationFields>
  minDepositAmount: BN
  minWithdrawAmount: BN
  minInvestAmount: BN
  minInvestDelaySlots: BN
  crankFundFeePerReserve: BN
  pendingAdmin: PublicKey
  cumulativeEarnedInterestSf: BN
  cumulativeMgmtFeesSf: BN
  cumulativePerfFeesSf: BN
  name: Array<number>
  vaultLookupTable: PublicKey
  vaultFarm: PublicKey
  creationTimestamp: BN
  padding1: BN
  padding2: Array<BN>
}

export interface VaultStateJSON {
  adminAuthority: string
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
  padding0: string
  performanceFeeBps: string
  managementFeeBps: string
  lastFeeChargeTimestamp: string
  prevAumSf: string
  pendingFeesSf: string
  vaultAllocationStrategy: Array<types.VaultAllocationJSON>
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
  padding1: string
  padding2: Array<string>
}

export class VaultState {
  readonly adminAuthority: PublicKey
  readonly baseVaultAuthority: PublicKey
  readonly baseVaultAuthorityBump: BN
  readonly tokenMint: PublicKey
  readonly tokenMintDecimals: BN
  readonly tokenVault: PublicKey
  readonly tokenProgram: PublicKey
  readonly sharesMint: PublicKey
  readonly sharesMintDecimals: BN
  readonly tokenAvailable: BN
  readonly sharesIssued: BN
  readonly availableCrankFunds: BN
  readonly padding0: BN
  readonly performanceFeeBps: BN
  readonly managementFeeBps: BN
  readonly lastFeeChargeTimestamp: BN
  readonly prevAumSf: BN
  readonly pendingFeesSf: BN
  readonly vaultAllocationStrategy: Array<types.VaultAllocation>
  readonly minDepositAmount: BN
  readonly minWithdrawAmount: BN
  readonly minInvestAmount: BN
  readonly minInvestDelaySlots: BN
  readonly crankFundFeePerReserve: BN
  readonly pendingAdmin: PublicKey
  readonly cumulativeEarnedInterestSf: BN
  readonly cumulativeMgmtFeesSf: BN
  readonly cumulativePerfFeesSf: BN
  readonly name: Array<number>
  readonly vaultLookupTable: PublicKey
  readonly vaultFarm: PublicKey
  readonly creationTimestamp: BN
  readonly padding1: BN
  readonly padding2: Array<BN>

  static readonly discriminator = Buffer.from([
    228, 196, 82, 165, 98, 210, 235, 152,
  ])

  static readonly layout = borsh.struct([
    borsh.publicKey("adminAuthority"),
    borsh.publicKey("baseVaultAuthority"),
    borsh.u64("baseVaultAuthorityBump"),
    borsh.publicKey("tokenMint"),
    borsh.u64("tokenMintDecimals"),
    borsh.publicKey("tokenVault"),
    borsh.publicKey("tokenProgram"),
    borsh.publicKey("sharesMint"),
    borsh.u64("sharesMintDecimals"),
    borsh.u64("tokenAvailable"),
    borsh.u64("sharesIssued"),
    borsh.u64("availableCrankFunds"),
    borsh.u64("padding0"),
    borsh.u64("performanceFeeBps"),
    borsh.u64("managementFeeBps"),
    borsh.u64("lastFeeChargeTimestamp"),
    borsh.u128("prevAumSf"),
    borsh.u128("pendingFeesSf"),
    borsh.array(types.VaultAllocation.layout(), 10, "vaultAllocationStrategy"),
    borsh.u64("minDepositAmount"),
    borsh.u64("minWithdrawAmount"),
    borsh.u64("minInvestAmount"),
    borsh.u64("minInvestDelaySlots"),
    borsh.u64("crankFundFeePerReserve"),
    borsh.publicKey("pendingAdmin"),
    borsh.u128("cumulativeEarnedInterestSf"),
    borsh.u128("cumulativeMgmtFeesSf"),
    borsh.u128("cumulativePerfFeesSf"),
    borsh.array(borsh.u8(), 40, "name"),
    borsh.publicKey("vaultLookupTable"),
    borsh.publicKey("vaultFarm"),
    borsh.u64("creationTimestamp"),
    borsh.u64("padding1"),
    borsh.array(borsh.u128(), 244, "padding2"),
  ])

  constructor(fields: VaultStateFields) {
    this.adminAuthority = fields.adminAuthority
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
    this.padding0 = fields.padding0
    this.performanceFeeBps = fields.performanceFeeBps
    this.managementFeeBps = fields.managementFeeBps
    this.lastFeeChargeTimestamp = fields.lastFeeChargeTimestamp
    this.prevAumSf = fields.prevAumSf
    this.pendingFeesSf = fields.pendingFeesSf
    this.vaultAllocationStrategy = fields.vaultAllocationStrategy.map(
      (item) => new types.VaultAllocation({ ...item })
    )
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
    this.padding1 = fields.padding1
    this.padding2 = fields.padding2
  }

  static async fetch(
    c: Connection,
    address: PublicKey,
    programId: PublicKey = PROGRAM_ID
  ): Promise<VaultState | null> {
    const info = await c.getAccountInfo(address)

    if (info === null) {
      return null
    }
    if (!info.owner.equals(programId)) {
      throw new Error("account doesn't belong to this program")
    }

    return this.decode(info.data)
  }

  static async fetchMultiple(
    c: Connection,
    addresses: PublicKey[],
    programId: PublicKey = PROGRAM_ID
  ): Promise<Array<VaultState | null>> {
    const infos = await c.getMultipleAccountsInfo(addresses)

    return infos.map((info) => {
      if (info === null) {
        return null
      }
      if (!info.owner.equals(programId)) {
        throw new Error("account doesn't belong to this program")
      }

      return this.decode(info.data)
    })
  }

  static decode(data: Buffer): VaultState {
    if (!data.slice(0, 8).equals(VaultState.discriminator)) {
      throw new Error("invalid account discriminator")
    }

    const dec = VaultState.layout.decode(data.slice(8))

    return new VaultState({
      adminAuthority: dec.adminAuthority,
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
      padding0: dec.padding0,
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
      padding1: dec.padding1,
      padding2: dec.padding2,
    })
  }

  toJSON(): VaultStateJSON {
    return {
      adminAuthority: this.adminAuthority.toString(),
      baseVaultAuthority: this.baseVaultAuthority.toString(),
      baseVaultAuthorityBump: this.baseVaultAuthorityBump.toString(),
      tokenMint: this.tokenMint.toString(),
      tokenMintDecimals: this.tokenMintDecimals.toString(),
      tokenVault: this.tokenVault.toString(),
      tokenProgram: this.tokenProgram.toString(),
      sharesMint: this.sharesMint.toString(),
      sharesMintDecimals: this.sharesMintDecimals.toString(),
      tokenAvailable: this.tokenAvailable.toString(),
      sharesIssued: this.sharesIssued.toString(),
      availableCrankFunds: this.availableCrankFunds.toString(),
      padding0: this.padding0.toString(),
      performanceFeeBps: this.performanceFeeBps.toString(),
      managementFeeBps: this.managementFeeBps.toString(),
      lastFeeChargeTimestamp: this.lastFeeChargeTimestamp.toString(),
      prevAumSf: this.prevAumSf.toString(),
      pendingFeesSf: this.pendingFeesSf.toString(),
      vaultAllocationStrategy: this.vaultAllocationStrategy.map((item) =>
        item.toJSON()
      ),
      minDepositAmount: this.minDepositAmount.toString(),
      minWithdrawAmount: this.minWithdrawAmount.toString(),
      minInvestAmount: this.minInvestAmount.toString(),
      minInvestDelaySlots: this.minInvestDelaySlots.toString(),
      crankFundFeePerReserve: this.crankFundFeePerReserve.toString(),
      pendingAdmin: this.pendingAdmin.toString(),
      cumulativeEarnedInterestSf: this.cumulativeEarnedInterestSf.toString(),
      cumulativeMgmtFeesSf: this.cumulativeMgmtFeesSf.toString(),
      cumulativePerfFeesSf: this.cumulativePerfFeesSf.toString(),
      name: this.name,
      vaultLookupTable: this.vaultLookupTable.toString(),
      vaultFarm: this.vaultFarm.toString(),
      creationTimestamp: this.creationTimestamp.toString(),
      padding1: this.padding1.toString(),
      padding2: this.padding2.map((item) => item.toString()),
    }
  }

  static fromJSON(obj: VaultStateJSON): VaultState {
    return new VaultState({
      adminAuthority: new PublicKey(obj.adminAuthority),
      baseVaultAuthority: new PublicKey(obj.baseVaultAuthority),
      baseVaultAuthorityBump: new BN(obj.baseVaultAuthorityBump),
      tokenMint: new PublicKey(obj.tokenMint),
      tokenMintDecimals: new BN(obj.tokenMintDecimals),
      tokenVault: new PublicKey(obj.tokenVault),
      tokenProgram: new PublicKey(obj.tokenProgram),
      sharesMint: new PublicKey(obj.sharesMint),
      sharesMintDecimals: new BN(obj.sharesMintDecimals),
      tokenAvailable: new BN(obj.tokenAvailable),
      sharesIssued: new BN(obj.sharesIssued),
      availableCrankFunds: new BN(obj.availableCrankFunds),
      padding0: new BN(obj.padding0),
      performanceFeeBps: new BN(obj.performanceFeeBps),
      managementFeeBps: new BN(obj.managementFeeBps),
      lastFeeChargeTimestamp: new BN(obj.lastFeeChargeTimestamp),
      prevAumSf: new BN(obj.prevAumSf),
      pendingFeesSf: new BN(obj.pendingFeesSf),
      vaultAllocationStrategy: obj.vaultAllocationStrategy.map((item) =>
        types.VaultAllocation.fromJSON(item)
      ),
      minDepositAmount: new BN(obj.minDepositAmount),
      minWithdrawAmount: new BN(obj.minWithdrawAmount),
      minInvestAmount: new BN(obj.minInvestAmount),
      minInvestDelaySlots: new BN(obj.minInvestDelaySlots),
      crankFundFeePerReserve: new BN(obj.crankFundFeePerReserve),
      pendingAdmin: new PublicKey(obj.pendingAdmin),
      cumulativeEarnedInterestSf: new BN(obj.cumulativeEarnedInterestSf),
      cumulativeMgmtFeesSf: new BN(obj.cumulativeMgmtFeesSf),
      cumulativePerfFeesSf: new BN(obj.cumulativePerfFeesSf),
      name: obj.name,
      vaultLookupTable: new PublicKey(obj.vaultLookupTable),
      vaultFarm: new PublicKey(obj.vaultFarm),
      creationTimestamp: new BN(obj.creationTimestamp),
      padding1: new BN(obj.padding1),
      padding2: obj.padding2.map((item) => new BN(item)),
    })
  }
}
