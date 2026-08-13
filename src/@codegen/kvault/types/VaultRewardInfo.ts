import { address, Address } from "@solana/kit" // eslint-disable-line @typescript-eslint/no-unused-vars
import BN from "bn.js" // eslint-disable-line @typescript-eslint/no-unused-vars
import * as types from "../types" // eslint-disable-line @typescript-eslint/no-unused-vars
import * as borsh from "@coral-xyz/borsh"
import { borshAddress } from "../utils"

export interface VaultRewardInfoFields {
  rewardPerSecond: BN
  lastIssuanceTs: BN
  rewardsAvailable: BN
  cumulativeRewardsDistributedAnalytics: BN
  padding: Array<BN>
}

export interface VaultRewardInfoJSON {
  rewardPerSecond: string
  lastIssuanceTs: string
  rewardsAvailable: string
  cumulativeRewardsDistributedAnalytics: string
  padding: Array<string>
}

export class VaultRewardInfo {
  readonly rewardPerSecond: BN
  readonly lastIssuanceTs: BN
  readonly rewardsAvailable: BN
  readonly cumulativeRewardsDistributedAnalytics: BN
  readonly padding: Array<BN>

  constructor(fields: VaultRewardInfoFields) {
    this.rewardPerSecond = fields.rewardPerSecond
    this.lastIssuanceTs = fields.lastIssuanceTs
    this.rewardsAvailable = fields.rewardsAvailable
    this.cumulativeRewardsDistributedAnalytics =
      fields.cumulativeRewardsDistributedAnalytics
    this.padding = fields.padding
  }

  static layout(property?: string) {
    return borsh.struct(
      [
        borsh.u64("rewardPerSecond"),
        borsh.u64("lastIssuanceTs"),
        borsh.u64("rewardsAvailable"),
        borsh.u64("cumulativeRewardsDistributedAnalytics"),
        borsh.array(borsh.u64(), 8, "padding"),
      ],
      property
    )
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  static fromDecoded(obj: any) {
    return new VaultRewardInfo({
      rewardPerSecond: obj.rewardPerSecond,
      lastIssuanceTs: obj.lastIssuanceTs,
      rewardsAvailable: obj.rewardsAvailable,
      cumulativeRewardsDistributedAnalytics:
        obj.cumulativeRewardsDistributedAnalytics,
      padding: obj.padding,
    })
  }

  static toEncodable(fields: VaultRewardInfoFields) {
    return {
      rewardPerSecond: fields.rewardPerSecond,
      lastIssuanceTs: fields.lastIssuanceTs,
      rewardsAvailable: fields.rewardsAvailable,
      cumulativeRewardsDistributedAnalytics:
        fields.cumulativeRewardsDistributedAnalytics,
      padding: fields.padding,
    }
  }

  toJSON(): VaultRewardInfoJSON {
    return {
      rewardPerSecond: this.rewardPerSecond.toString(),
      lastIssuanceTs: this.lastIssuanceTs.toString(),
      rewardsAvailable: this.rewardsAvailable.toString(),
      cumulativeRewardsDistributedAnalytics:
        this.cumulativeRewardsDistributedAnalytics.toString(),
      padding: this.padding.map((item) => item.toString()),
    }
  }

  static fromJSON(obj: VaultRewardInfoJSON): VaultRewardInfo {
    return new VaultRewardInfo({
      rewardPerSecond: new BN(obj.rewardPerSecond),
      lastIssuanceTs: new BN(obj.lastIssuanceTs),
      rewardsAvailable: new BN(obj.rewardsAvailable),
      cumulativeRewardsDistributedAnalytics: new BN(
        obj.cumulativeRewardsDistributedAnalytics
      ),
      padding: obj.padding.map((item) => new BN(item)),
    })
  }

  toEncodable() {
    return VaultRewardInfo.toEncodable(this)
  }
}
