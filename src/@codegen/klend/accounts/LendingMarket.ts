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

export interface LendingMarketFields {
  version: BN
  bumpSeed: BN
  lendingMarketOwner: Address
  lendingMarketOwnerCached: Address
  quoteCurrency: Array<number>
  referralFeeBps: number
  emergencyMode: number
  autodeleverageEnabled: number
  borrowDisabled: number
  priceRefreshTriggerToMaxAgePct: number
  liquidationMaxDebtCloseFactorPct: number
  insolvencyRiskUnhealthyLtvPct: number
  minFullLiquidationValueThreshold: BN
  maxLiquidatableDebtMarketValueAtOnce: BN
  reserved0: Array<number>
  globalAllowedBorrowValue: BN
  emergencyCouncil: Address
  reserved1: Array<number>
  elevationGroups: Array<types.ElevationGroupFields>
  elevationGroupPadding: Array<BN>
  minNetValueInObligationSf: BN
  minValueSkipLiquidationLtvChecks: BN
  name: Array<number>
  minValueSkipLiquidationBfChecks: BN
  individualAutodeleverageMarginCallPeriodSecs: BN
  minInitialDepositAmount: BN
  obligationOrderExecutionEnabled: number
  immutable: number
  obligationOrderCreationEnabled: number
  priceTriggeredLiquidationDisabled: number
  matureReserveDebtLiquidationEnabled: number
  obligationBorrowDebtTermLiquidationEnabled: number
  borrowOrderCreationEnabled: number
  borrowOrderExecutionEnabled: number
  proposerAuthority: Address
  minBorrowOrderFillValue: BN
  withdrawTicketIssuanceEnabled: number
  withdrawTicketRedemptionEnabled: number
  obligationBorrowRolloverConfigurationEnabled: number
  obligationBorrowMigrationToFixedExecutionEnabled: number
  withdrawTicketCancellationEnabled: number
  disableNonceBlock: number
  reserveRewardsMaxAprBps: number
  minWithdrawQueuedLiquidityValue: BN
  fixedTermRolloverWindowDurationSeconds: BN
  openTermRolloverWindowDurationSeconds: BN
  minPartialRolloverValue: BN
  termBasedFullLiquidationDurationSecs: BN
  permissioningAuthority: Address
  permissionedOps: BN
  padding1: Array<BN>
}

export interface LendingMarketJSON {
  version: string
  bumpSeed: string
  lendingMarketOwner: string
  lendingMarketOwnerCached: string
  quoteCurrency: Array<number>
  referralFeeBps: number
  emergencyMode: number
  autodeleverageEnabled: number
  borrowDisabled: number
  priceRefreshTriggerToMaxAgePct: number
  liquidationMaxDebtCloseFactorPct: number
  insolvencyRiskUnhealthyLtvPct: number
  minFullLiquidationValueThreshold: string
  maxLiquidatableDebtMarketValueAtOnce: string
  reserved0: Array<number>
  globalAllowedBorrowValue: string
  emergencyCouncil: string
  reserved1: Array<number>
  elevationGroups: Array<types.ElevationGroupJSON>
  elevationGroupPadding: Array<string>
  minNetValueInObligationSf: string
  minValueSkipLiquidationLtvChecks: string
  name: Array<number>
  minValueSkipLiquidationBfChecks: string
  individualAutodeleverageMarginCallPeriodSecs: string
  minInitialDepositAmount: string
  obligationOrderExecutionEnabled: number
  immutable: number
  obligationOrderCreationEnabled: number
  priceTriggeredLiquidationDisabled: number
  matureReserveDebtLiquidationEnabled: number
  obligationBorrowDebtTermLiquidationEnabled: number
  borrowOrderCreationEnabled: number
  borrowOrderExecutionEnabled: number
  proposerAuthority: string
  minBorrowOrderFillValue: string
  withdrawTicketIssuanceEnabled: number
  withdrawTicketRedemptionEnabled: number
  obligationBorrowRolloverConfigurationEnabled: number
  obligationBorrowMigrationToFixedExecutionEnabled: number
  withdrawTicketCancellationEnabled: number
  disableNonceBlock: number
  reserveRewardsMaxAprBps: number
  minWithdrawQueuedLiquidityValue: string
  fixedTermRolloverWindowDurationSeconds: string
  openTermRolloverWindowDurationSeconds: string
  minPartialRolloverValue: string
  termBasedFullLiquidationDurationSecs: string
  permissioningAuthority: string
  permissionedOps: string
  padding1: Array<string>
}

export class LendingMarket {
  readonly version: BN
  readonly bumpSeed: BN
  readonly lendingMarketOwner: Address
  readonly lendingMarketOwnerCached: Address
  readonly quoteCurrency: Array<number>
  readonly referralFeeBps: number
  readonly emergencyMode: number
  readonly autodeleverageEnabled: number
  readonly borrowDisabled: number
  readonly priceRefreshTriggerToMaxAgePct: number
  readonly liquidationMaxDebtCloseFactorPct: number
  readonly insolvencyRiskUnhealthyLtvPct: number
  readonly minFullLiquidationValueThreshold: BN
  readonly maxLiquidatableDebtMarketValueAtOnce: BN
  readonly reserved0: Array<number>
  readonly globalAllowedBorrowValue: BN
  readonly emergencyCouncil: Address
  readonly reserved1: Array<number>
  readonly elevationGroups: Array<types.ElevationGroup>
  readonly elevationGroupPadding: Array<BN>
  readonly minNetValueInObligationSf: BN
  readonly minValueSkipLiquidationLtvChecks: BN
  readonly name: Array<number>
  readonly minValueSkipLiquidationBfChecks: BN
  readonly individualAutodeleverageMarginCallPeriodSecs: BN
  readonly minInitialDepositAmount: BN
  readonly obligationOrderExecutionEnabled: number
  readonly immutable: number
  readonly obligationOrderCreationEnabled: number
  readonly priceTriggeredLiquidationDisabled: number
  readonly matureReserveDebtLiquidationEnabled: number
  readonly obligationBorrowDebtTermLiquidationEnabled: number
  readonly borrowOrderCreationEnabled: number
  readonly borrowOrderExecutionEnabled: number
  readonly proposerAuthority: Address
  readonly minBorrowOrderFillValue: BN
  readonly withdrawTicketIssuanceEnabled: number
  readonly withdrawTicketRedemptionEnabled: number
  readonly obligationBorrowRolloverConfigurationEnabled: number
  readonly obligationBorrowMigrationToFixedExecutionEnabled: number
  readonly withdrawTicketCancellationEnabled: number
  readonly disableNonceBlock: number
  readonly reserveRewardsMaxAprBps: number
  readonly minWithdrawQueuedLiquidityValue: BN
  readonly fixedTermRolloverWindowDurationSeconds: BN
  readonly openTermRolloverWindowDurationSeconds: BN
  readonly minPartialRolloverValue: BN
  readonly termBasedFullLiquidationDurationSecs: BN
  readonly permissioningAuthority: Address
  readonly permissionedOps: BN
  readonly padding1: Array<BN>

  static readonly discriminator = Buffer.from([
    246, 114, 50, 98, 72, 157, 28, 120,
  ])

  static readonly layout = borsh.struct<LendingMarket>([
    borsh.u64("version"),
    borsh.u64("bumpSeed"),
    borshAddress("lendingMarketOwner"),
    borshAddress("lendingMarketOwnerCached"),
    borsh.array(borsh.u8(), 32, "quoteCurrency"),
    borsh.u16("referralFeeBps"),
    borsh.u8("emergencyMode"),
    borsh.u8("autodeleverageEnabled"),
    borsh.u8("borrowDisabled"),
    borsh.u8("priceRefreshTriggerToMaxAgePct"),
    borsh.u8("liquidationMaxDebtCloseFactorPct"),
    borsh.u8("insolvencyRiskUnhealthyLtvPct"),
    borsh.u64("minFullLiquidationValueThreshold"),
    borsh.u64("maxLiquidatableDebtMarketValueAtOnce"),
    borsh.array(borsh.u8(), 8, "reserved0"),
    borsh.u64("globalAllowedBorrowValue"),
    borshAddress("emergencyCouncil"),
    borsh.array(borsh.u8(), 8, "reserved1"),
    borsh.array(types.ElevationGroup.layout(), 32, "elevationGroups"),
    borsh.array(borsh.u64(), 90, "elevationGroupPadding"),
    borsh.u128("minNetValueInObligationSf"),
    borsh.u64("minValueSkipLiquidationLtvChecks"),
    borsh.array(borsh.u8(), 32, "name"),
    borsh.u64("minValueSkipLiquidationBfChecks"),
    borsh.u64("individualAutodeleverageMarginCallPeriodSecs"),
    borsh.u64("minInitialDepositAmount"),
    borsh.u8("obligationOrderExecutionEnabled"),
    borsh.u8("immutable"),
    borsh.u8("obligationOrderCreationEnabled"),
    borsh.u8("priceTriggeredLiquidationDisabled"),
    borsh.u8("matureReserveDebtLiquidationEnabled"),
    borsh.u8("obligationBorrowDebtTermLiquidationEnabled"),
    borsh.u8("borrowOrderCreationEnabled"),
    borsh.u8("borrowOrderExecutionEnabled"),
    borshAddress("proposerAuthority"),
    borsh.u64("minBorrowOrderFillValue"),
    borsh.u8("withdrawTicketIssuanceEnabled"),
    borsh.u8("withdrawTicketRedemptionEnabled"),
    borsh.u8("obligationBorrowRolloverConfigurationEnabled"),
    borsh.u8("obligationBorrowMigrationToFixedExecutionEnabled"),
    borsh.u8("withdrawTicketCancellationEnabled"),
    borsh.u8("disableNonceBlock"),
    borsh.u16("reserveRewardsMaxAprBps"),
    borsh.u64("minWithdrawQueuedLiquidityValue"),
    borsh.u64("fixedTermRolloverWindowDurationSeconds"),
    borsh.u64("openTermRolloverWindowDurationSeconds"),
    borsh.u64("minPartialRolloverValue"),
    borsh.u64("termBasedFullLiquidationDurationSecs"),
    borshAddress("permissioningAuthority"),
    borsh.u64("permissionedOps"),
    borsh.array(borsh.u64(), 153, "padding1"),
  ])

  constructor(fields: LendingMarketFields) {
    this.version = fields.version
    this.bumpSeed = fields.bumpSeed
    this.lendingMarketOwner = fields.lendingMarketOwner
    this.lendingMarketOwnerCached = fields.lendingMarketOwnerCached
    this.quoteCurrency = fields.quoteCurrency
    this.referralFeeBps = fields.referralFeeBps
    this.emergencyMode = fields.emergencyMode
    this.autodeleverageEnabled = fields.autodeleverageEnabled
    this.borrowDisabled = fields.borrowDisabled
    this.priceRefreshTriggerToMaxAgePct = fields.priceRefreshTriggerToMaxAgePct
    this.liquidationMaxDebtCloseFactorPct =
      fields.liquidationMaxDebtCloseFactorPct
    this.insolvencyRiskUnhealthyLtvPct = fields.insolvencyRiskUnhealthyLtvPct
    this.minFullLiquidationValueThreshold =
      fields.minFullLiquidationValueThreshold
    this.maxLiquidatableDebtMarketValueAtOnce =
      fields.maxLiquidatableDebtMarketValueAtOnce
    this.reserved0 = fields.reserved0
    this.globalAllowedBorrowValue = fields.globalAllowedBorrowValue
    this.emergencyCouncil = fields.emergencyCouncil
    this.reserved1 = fields.reserved1
    this.elevationGroups = fields.elevationGroups.map(
      (item) => new types.ElevationGroup({ ...item })
    )
    this.elevationGroupPadding = fields.elevationGroupPadding
    this.minNetValueInObligationSf = fields.minNetValueInObligationSf
    this.minValueSkipLiquidationLtvChecks =
      fields.minValueSkipLiquidationLtvChecks
    this.name = fields.name
    this.minValueSkipLiquidationBfChecks =
      fields.minValueSkipLiquidationBfChecks
    this.individualAutodeleverageMarginCallPeriodSecs =
      fields.individualAutodeleverageMarginCallPeriodSecs
    this.minInitialDepositAmount = fields.minInitialDepositAmount
    this.obligationOrderExecutionEnabled =
      fields.obligationOrderExecutionEnabled
    this.immutable = fields.immutable
    this.obligationOrderCreationEnabled = fields.obligationOrderCreationEnabled
    this.priceTriggeredLiquidationDisabled =
      fields.priceTriggeredLiquidationDisabled
    this.matureReserveDebtLiquidationEnabled =
      fields.matureReserveDebtLiquidationEnabled
    this.obligationBorrowDebtTermLiquidationEnabled =
      fields.obligationBorrowDebtTermLiquidationEnabled
    this.borrowOrderCreationEnabled = fields.borrowOrderCreationEnabled
    this.borrowOrderExecutionEnabled = fields.borrowOrderExecutionEnabled
    this.proposerAuthority = fields.proposerAuthority
    this.minBorrowOrderFillValue = fields.minBorrowOrderFillValue
    this.withdrawTicketIssuanceEnabled = fields.withdrawTicketIssuanceEnabled
    this.withdrawTicketRedemptionEnabled =
      fields.withdrawTicketRedemptionEnabled
    this.obligationBorrowRolloverConfigurationEnabled =
      fields.obligationBorrowRolloverConfigurationEnabled
    this.obligationBorrowMigrationToFixedExecutionEnabled =
      fields.obligationBorrowMigrationToFixedExecutionEnabled
    this.withdrawTicketCancellationEnabled =
      fields.withdrawTicketCancellationEnabled
    this.disableNonceBlock = fields.disableNonceBlock
    this.reserveRewardsMaxAprBps = fields.reserveRewardsMaxAprBps
    this.minWithdrawQueuedLiquidityValue =
      fields.minWithdrawQueuedLiquidityValue
    this.fixedTermRolloverWindowDurationSeconds =
      fields.fixedTermRolloverWindowDurationSeconds
    this.openTermRolloverWindowDurationSeconds =
      fields.openTermRolloverWindowDurationSeconds
    this.minPartialRolloverValue = fields.minPartialRolloverValue
    this.termBasedFullLiquidationDurationSecs =
      fields.termBasedFullLiquidationDurationSecs
    this.permissioningAuthority = fields.permissioningAuthority
    this.permissionedOps = fields.permissionedOps
    this.padding1 = fields.padding1
  }

  static async fetch(
    rpc: Rpc<GetAccountInfoApi>,
    address: Address,
    programId: Address = PROGRAM_ID
  ): Promise<LendingMarket | null> {
    const info = await fetchEncodedAccount(rpc, address)

    if (!info.exists) {
      return null
    }
    if (info.programAddress !== programId) {
      throw new Error(
        `LendingMarketFields account ${address} belongs to wrong program ${info.programAddress}, expected ${programId}`
      )
    }

    return this.decode(Buffer.from(info.data))
  }

  static async fetchMultiple(
    rpc: Rpc<GetMultipleAccountsApi>,
    addresses: Address[],
    programId: Address = PROGRAM_ID
  ): Promise<Array<LendingMarket | null>> {
    const infos = await fetchEncodedAccounts(rpc, addresses)

    return infos.map((info) => {
      if (!info.exists) {
        return null
      }
      if (info.programAddress !== programId) {
        throw new Error(
          `LendingMarketFields account ${info.address} belongs to wrong program ${info.programAddress}, expected ${programId}`
        )
      }

      return this.decode(Buffer.from(info.data))
    })
  }

  static decode(data: Buffer): LendingMarket {
    if (!data.slice(0, 8).equals(LendingMarket.discriminator)) {
      throw new Error("invalid account discriminator")
    }

    const dec = LendingMarket.layout.decode(data.slice(8))

    return new LendingMarket({
      version: dec.version,
      bumpSeed: dec.bumpSeed,
      lendingMarketOwner: dec.lendingMarketOwner,
      lendingMarketOwnerCached: dec.lendingMarketOwnerCached,
      quoteCurrency: dec.quoteCurrency,
      referralFeeBps: dec.referralFeeBps,
      emergencyMode: dec.emergencyMode,
      autodeleverageEnabled: dec.autodeleverageEnabled,
      borrowDisabled: dec.borrowDisabled,
      priceRefreshTriggerToMaxAgePct: dec.priceRefreshTriggerToMaxAgePct,
      liquidationMaxDebtCloseFactorPct: dec.liquidationMaxDebtCloseFactorPct,
      insolvencyRiskUnhealthyLtvPct: dec.insolvencyRiskUnhealthyLtvPct,
      minFullLiquidationValueThreshold: dec.minFullLiquidationValueThreshold,
      maxLiquidatableDebtMarketValueAtOnce:
        dec.maxLiquidatableDebtMarketValueAtOnce,
      reserved0: dec.reserved0,
      globalAllowedBorrowValue: dec.globalAllowedBorrowValue,
      emergencyCouncil: dec.emergencyCouncil,
      reserved1: dec.reserved1,
      elevationGroups: dec.elevationGroups.map(
        (
          item: any /* eslint-disable-line @typescript-eslint/no-explicit-any */
        ) => types.ElevationGroup.fromDecoded(item)
      ),
      elevationGroupPadding: dec.elevationGroupPadding,
      minNetValueInObligationSf: dec.minNetValueInObligationSf,
      minValueSkipLiquidationLtvChecks: dec.minValueSkipLiquidationLtvChecks,
      name: dec.name,
      minValueSkipLiquidationBfChecks: dec.minValueSkipLiquidationBfChecks,
      individualAutodeleverageMarginCallPeriodSecs:
        dec.individualAutodeleverageMarginCallPeriodSecs,
      minInitialDepositAmount: dec.minInitialDepositAmount,
      obligationOrderExecutionEnabled: dec.obligationOrderExecutionEnabled,
      immutable: dec.immutable,
      obligationOrderCreationEnabled: dec.obligationOrderCreationEnabled,
      priceTriggeredLiquidationDisabled: dec.priceTriggeredLiquidationDisabled,
      matureReserveDebtLiquidationEnabled:
        dec.matureReserveDebtLiquidationEnabled,
      obligationBorrowDebtTermLiquidationEnabled:
        dec.obligationBorrowDebtTermLiquidationEnabled,
      borrowOrderCreationEnabled: dec.borrowOrderCreationEnabled,
      borrowOrderExecutionEnabled: dec.borrowOrderExecutionEnabled,
      proposerAuthority: dec.proposerAuthority,
      minBorrowOrderFillValue: dec.minBorrowOrderFillValue,
      withdrawTicketIssuanceEnabled: dec.withdrawTicketIssuanceEnabled,
      withdrawTicketRedemptionEnabled: dec.withdrawTicketRedemptionEnabled,
      obligationBorrowRolloverConfigurationEnabled:
        dec.obligationBorrowRolloverConfigurationEnabled,
      obligationBorrowMigrationToFixedExecutionEnabled:
        dec.obligationBorrowMigrationToFixedExecutionEnabled,
      withdrawTicketCancellationEnabled: dec.withdrawTicketCancellationEnabled,
      disableNonceBlock: dec.disableNonceBlock,
      reserveRewardsMaxAprBps: dec.reserveRewardsMaxAprBps,
      minWithdrawQueuedLiquidityValue: dec.minWithdrawQueuedLiquidityValue,
      fixedTermRolloverWindowDurationSeconds:
        dec.fixedTermRolloverWindowDurationSeconds,
      openTermRolloverWindowDurationSeconds:
        dec.openTermRolloverWindowDurationSeconds,
      minPartialRolloverValue: dec.minPartialRolloverValue,
      termBasedFullLiquidationDurationSecs:
        dec.termBasedFullLiquidationDurationSecs,
      permissioningAuthority: dec.permissioningAuthority,
      permissionedOps: dec.permissionedOps,
      padding1: dec.padding1,
    })
  }

  toJSON(): LendingMarketJSON {
    return {
      version: this.version.toString(),
      bumpSeed: this.bumpSeed.toString(),
      lendingMarketOwner: this.lendingMarketOwner,
      lendingMarketOwnerCached: this.lendingMarketOwnerCached,
      quoteCurrency: this.quoteCurrency,
      referralFeeBps: this.referralFeeBps,
      emergencyMode: this.emergencyMode,
      autodeleverageEnabled: this.autodeleverageEnabled,
      borrowDisabled: this.borrowDisabled,
      priceRefreshTriggerToMaxAgePct: this.priceRefreshTriggerToMaxAgePct,
      liquidationMaxDebtCloseFactorPct: this.liquidationMaxDebtCloseFactorPct,
      insolvencyRiskUnhealthyLtvPct: this.insolvencyRiskUnhealthyLtvPct,
      minFullLiquidationValueThreshold:
        this.minFullLiquidationValueThreshold.toString(),
      maxLiquidatableDebtMarketValueAtOnce:
        this.maxLiquidatableDebtMarketValueAtOnce.toString(),
      reserved0: this.reserved0,
      globalAllowedBorrowValue: this.globalAllowedBorrowValue.toString(),
      emergencyCouncil: this.emergencyCouncil,
      reserved1: this.reserved1,
      elevationGroups: this.elevationGroups.map((item) => item.toJSON()),
      elevationGroupPadding: this.elevationGroupPadding.map((item) =>
        item.toString()
      ),
      minNetValueInObligationSf: this.minNetValueInObligationSf.toString(),
      minValueSkipLiquidationLtvChecks:
        this.minValueSkipLiquidationLtvChecks.toString(),
      name: this.name,
      minValueSkipLiquidationBfChecks:
        this.minValueSkipLiquidationBfChecks.toString(),
      individualAutodeleverageMarginCallPeriodSecs:
        this.individualAutodeleverageMarginCallPeriodSecs.toString(),
      minInitialDepositAmount: this.minInitialDepositAmount.toString(),
      obligationOrderExecutionEnabled: this.obligationOrderExecutionEnabled,
      immutable: this.immutable,
      obligationOrderCreationEnabled: this.obligationOrderCreationEnabled,
      priceTriggeredLiquidationDisabled: this.priceTriggeredLiquidationDisabled,
      matureReserveDebtLiquidationEnabled:
        this.matureReserveDebtLiquidationEnabled,
      obligationBorrowDebtTermLiquidationEnabled:
        this.obligationBorrowDebtTermLiquidationEnabled,
      borrowOrderCreationEnabled: this.borrowOrderCreationEnabled,
      borrowOrderExecutionEnabled: this.borrowOrderExecutionEnabled,
      proposerAuthority: this.proposerAuthority,
      minBorrowOrderFillValue: this.minBorrowOrderFillValue.toString(),
      withdrawTicketIssuanceEnabled: this.withdrawTicketIssuanceEnabled,
      withdrawTicketRedemptionEnabled: this.withdrawTicketRedemptionEnabled,
      obligationBorrowRolloverConfigurationEnabled:
        this.obligationBorrowRolloverConfigurationEnabled,
      obligationBorrowMigrationToFixedExecutionEnabled:
        this.obligationBorrowMigrationToFixedExecutionEnabled,
      withdrawTicketCancellationEnabled: this.withdrawTicketCancellationEnabled,
      disableNonceBlock: this.disableNonceBlock,
      reserveRewardsMaxAprBps: this.reserveRewardsMaxAprBps,
      minWithdrawQueuedLiquidityValue:
        this.minWithdrawQueuedLiquidityValue.toString(),
      fixedTermRolloverWindowDurationSeconds:
        this.fixedTermRolloverWindowDurationSeconds.toString(),
      openTermRolloverWindowDurationSeconds:
        this.openTermRolloverWindowDurationSeconds.toString(),
      minPartialRolloverValue: this.minPartialRolloverValue.toString(),
      termBasedFullLiquidationDurationSecs:
        this.termBasedFullLiquidationDurationSecs.toString(),
      permissioningAuthority: this.permissioningAuthority,
      permissionedOps: this.permissionedOps.toString(),
      padding1: this.padding1.map((item) => item.toString()),
    }
  }

  static fromJSON(obj: LendingMarketJSON): LendingMarket {
    return new LendingMarket({
      version: new BN(obj.version),
      bumpSeed: new BN(obj.bumpSeed),
      lendingMarketOwner: address(obj.lendingMarketOwner),
      lendingMarketOwnerCached: address(obj.lendingMarketOwnerCached),
      quoteCurrency: obj.quoteCurrency,
      referralFeeBps: obj.referralFeeBps,
      emergencyMode: obj.emergencyMode,
      autodeleverageEnabled: obj.autodeleverageEnabled,
      borrowDisabled: obj.borrowDisabled,
      priceRefreshTriggerToMaxAgePct: obj.priceRefreshTriggerToMaxAgePct,
      liquidationMaxDebtCloseFactorPct: obj.liquidationMaxDebtCloseFactorPct,
      insolvencyRiskUnhealthyLtvPct: obj.insolvencyRiskUnhealthyLtvPct,
      minFullLiquidationValueThreshold: new BN(
        obj.minFullLiquidationValueThreshold
      ),
      maxLiquidatableDebtMarketValueAtOnce: new BN(
        obj.maxLiquidatableDebtMarketValueAtOnce
      ),
      reserved0: obj.reserved0,
      globalAllowedBorrowValue: new BN(obj.globalAllowedBorrowValue),
      emergencyCouncil: address(obj.emergencyCouncil),
      reserved1: obj.reserved1,
      elevationGroups: obj.elevationGroups.map((item) =>
        types.ElevationGroup.fromJSON(item)
      ),
      elevationGroupPadding: obj.elevationGroupPadding.map(
        (item) => new BN(item)
      ),
      minNetValueInObligationSf: new BN(obj.minNetValueInObligationSf),
      minValueSkipLiquidationLtvChecks: new BN(
        obj.minValueSkipLiquidationLtvChecks
      ),
      name: obj.name,
      minValueSkipLiquidationBfChecks: new BN(
        obj.minValueSkipLiquidationBfChecks
      ),
      individualAutodeleverageMarginCallPeriodSecs: new BN(
        obj.individualAutodeleverageMarginCallPeriodSecs
      ),
      minInitialDepositAmount: new BN(obj.minInitialDepositAmount),
      obligationOrderExecutionEnabled: obj.obligationOrderExecutionEnabled,
      immutable: obj.immutable,
      obligationOrderCreationEnabled: obj.obligationOrderCreationEnabled,
      priceTriggeredLiquidationDisabled: obj.priceTriggeredLiquidationDisabled,
      matureReserveDebtLiquidationEnabled:
        obj.matureReserveDebtLiquidationEnabled,
      obligationBorrowDebtTermLiquidationEnabled:
        obj.obligationBorrowDebtTermLiquidationEnabled,
      borrowOrderCreationEnabled: obj.borrowOrderCreationEnabled,
      borrowOrderExecutionEnabled: obj.borrowOrderExecutionEnabled,
      proposerAuthority: address(obj.proposerAuthority),
      minBorrowOrderFillValue: new BN(obj.minBorrowOrderFillValue),
      withdrawTicketIssuanceEnabled: obj.withdrawTicketIssuanceEnabled,
      withdrawTicketRedemptionEnabled: obj.withdrawTicketRedemptionEnabled,
      obligationBorrowRolloverConfigurationEnabled:
        obj.obligationBorrowRolloverConfigurationEnabled,
      obligationBorrowMigrationToFixedExecutionEnabled:
        obj.obligationBorrowMigrationToFixedExecutionEnabled,
      withdrawTicketCancellationEnabled: obj.withdrawTicketCancellationEnabled,
      disableNonceBlock: obj.disableNonceBlock,
      reserveRewardsMaxAprBps: obj.reserveRewardsMaxAprBps,
      minWithdrawQueuedLiquidityValue: new BN(
        obj.minWithdrawQueuedLiquidityValue
      ),
      fixedTermRolloverWindowDurationSeconds: new BN(
        obj.fixedTermRolloverWindowDurationSeconds
      ),
      openTermRolloverWindowDurationSeconds: new BN(
        obj.openTermRolloverWindowDurationSeconds
      ),
      minPartialRolloverValue: new BN(obj.minPartialRolloverValue),
      termBasedFullLiquidationDurationSecs: new BN(
        obj.termBasedFullLiquidationDurationSecs
      ),
      permissioningAuthority: address(obj.permissioningAuthority),
      permissionedOps: new BN(obj.permissionedOps),
      padding1: obj.padding1.map((item) => new BN(item)),
    })
  }
}
