import { address, Address } from "@solana/kit" // eslint-disable-line @typescript-eslint/no-unused-vars
import BN from "bn.js" // eslint-disable-line @typescript-eslint/no-unused-vars
import * as types from "../types" // eslint-disable-line @typescript-eslint/no-unused-vars
import * as borsh from "@coral-xyz/borsh"
import { borshAddress } from "../utils"

export interface ObligationOrderFields {
  /**
   * A threshold value used by the condition (scaled [Fraction]).
   * The exact meaning depends on the specific [Self::condition_type].
   *
   * Examples:
   * - when `condition_type == 2 (UserLtvBelow)`:
   * then a value of `0.455` here means that the order is active only when the obligation's
   * user LTV is less than `0.455` (i.e. < 45.5%).
   * - when `condition_type == 3 (DebtCollPriceRatioAbove)`:
   * assuming the obligation uses BTC collateral for SOL debt, then a value of `491.3` here
   * means that the order is active only when the BTC-SOL price is greater than `491.3` (i.e.
   * > 491.3 SOL per BTC).
   */
  conditionThresholdSf: BN
  /**
   * A configuration parameter used by the opportunity (scaled [Fraction]).
   * The exact meaning depends on the specific [Self::opportunity_type].
   *
   * Examples:
   * - when `opportunity_type == 0 (DeleverageSingleDebtAmount)`:
   * Assuming the obligation uses BTC collateral for SOL debt, then a value of `1_234_000_000`
   * here means that a liquidator may repay up to 1234000000 lamports (i.e. 1.234 SOL) on this
   * obligation.
   * Note: the special value of [Fraction::MAX] is *not* allowed in this case.
   * - when `opportunity_type == 1 (DeleverageAllDebtAmount)`:
   * The only allowed value in this case is [Fraction::MAX] (to emphasize that *all* debt
   * should be repaid).
   */
  opportunityParameterSf: BN
  /**
   * A *minimum* additional fraction of collateral transferred to the liquidator, in bps.
   *
   * The minimum bonus is applied exactly when the [Self::condition_threshold_sf] is met, and
   * grows linearly towards the [Self::max_execution_bonus_bps].
   *
   * Example: a value of `50` here means 50bps == 0.5% bonus for an "LTV > 65%" order, when
   * executed precisely at the moment LTV exceeds 65%.
   */
  minExecutionBonusBps: number
  /**
   * A *maximum* additional fraction of collateral transferred to the liquidator, in bps.
   *
   * The maximum bonus is applied at the relevant "extreme" state of the obligation, i.e.:
   * - for a stop-loss condition, it is a point at which the obligation becomes liquidatable;
   * - for a take-profit condition, it is a point at which obligation has 0% LTV.
   *
   * In non-extreme states, the actual bonus value is interpolated linearly, starting from
   * [Self::min_execution_bonus_bps] (at the point specified by the order's condition).
   *
   * Example: a value of `300` here means 300bps == 3.0% bonus for a "debt/coll price > 140"
   * order, when executed at a higher price = 200, at which the obligation's LTV happens to
   * be equal to its liquidation LTV.
   */
  maxExecutionBonusBps: number
  /**
   * Serialized [ConditionType].
   * The entire order is void when this is zeroed (i.e. representing [ConditionType::Never]).
   *
   * Example: a value of `2` here denotes `UserLtvBelow` condition type. Of course, to
   * interpret this condition, we also need to take the [Self::condition_threshold_sf] into
   * account.
   */
  conditionType: number
  /**
   * Serialized [OpportunityType].
   *
   * Example: a value of `0` here denotes `DeleverageSingleDebtAmount` opportunity. Of course, to
   * interpret this opportunity, we also need to take the [Self::opportunity_parameter_sf] into
   * account.
   */
  opportunityType: number
  /**
   * Internal padding.
   * The fields above take up 2+2+1+1 bytes = 48 bits, which means we need 80 bits = 10 bytes to
   * align with `u128`s.
   */
  padding1: Array<number>
  /**
   * End padding.
   * The total size of a single instance is 8*u128 = 128 bytes.
   */
  padding2: Array<BN>
}

export interface ObligationOrderJSON {
  /**
   * A threshold value used by the condition (scaled [Fraction]).
   * The exact meaning depends on the specific [Self::condition_type].
   *
   * Examples:
   * - when `condition_type == 2 (UserLtvBelow)`:
   * then a value of `0.455` here means that the order is active only when the obligation's
   * user LTV is less than `0.455` (i.e. < 45.5%).
   * - when `condition_type == 3 (DebtCollPriceRatioAbove)`:
   * assuming the obligation uses BTC collateral for SOL debt, then a value of `491.3` here
   * means that the order is active only when the BTC-SOL price is greater than `491.3` (i.e.
   * > 491.3 SOL per BTC).
   */
  conditionThresholdSf: string
  /**
   * A configuration parameter used by the opportunity (scaled [Fraction]).
   * The exact meaning depends on the specific [Self::opportunity_type].
   *
   * Examples:
   * - when `opportunity_type == 0 (DeleverageSingleDebtAmount)`:
   * Assuming the obligation uses BTC collateral for SOL debt, then a value of `1_234_000_000`
   * here means that a liquidator may repay up to 1234000000 lamports (i.e. 1.234 SOL) on this
   * obligation.
   * Note: the special value of [Fraction::MAX] is *not* allowed in this case.
   * - when `opportunity_type == 1 (DeleverageAllDebtAmount)`:
   * The only allowed value in this case is [Fraction::MAX] (to emphasize that *all* debt
   * should be repaid).
   */
  opportunityParameterSf: string
  /**
   * A *minimum* additional fraction of collateral transferred to the liquidator, in bps.
   *
   * The minimum bonus is applied exactly when the [Self::condition_threshold_sf] is met, and
   * grows linearly towards the [Self::max_execution_bonus_bps].
   *
   * Example: a value of `50` here means 50bps == 0.5% bonus for an "LTV > 65%" order, when
   * executed precisely at the moment LTV exceeds 65%.
   */
  minExecutionBonusBps: number
  /**
   * A *maximum* additional fraction of collateral transferred to the liquidator, in bps.
   *
   * The maximum bonus is applied at the relevant "extreme" state of the obligation, i.e.:
   * - for a stop-loss condition, it is a point at which the obligation becomes liquidatable;
   * - for a take-profit condition, it is a point at which obligation has 0% LTV.
   *
   * In non-extreme states, the actual bonus value is interpolated linearly, starting from
   * [Self::min_execution_bonus_bps] (at the point specified by the order's condition).
   *
   * Example: a value of `300` here means 300bps == 3.0% bonus for a "debt/coll price > 140"
   * order, when executed at a higher price = 200, at which the obligation's LTV happens to
   * be equal to its liquidation LTV.
   */
  maxExecutionBonusBps: number
  /**
   * Serialized [ConditionType].
   * The entire order is void when this is zeroed (i.e. representing [ConditionType::Never]).
   *
   * Example: a value of `2` here denotes `UserLtvBelow` condition type. Of course, to
   * interpret this condition, we also need to take the [Self::condition_threshold_sf] into
   * account.
   */
  conditionType: number
  /**
   * Serialized [OpportunityType].
   *
   * Example: a value of `0` here denotes `DeleverageSingleDebtAmount` opportunity. Of course, to
   * interpret this opportunity, we also need to take the [Self::opportunity_parameter_sf] into
   * account.
   */
  opportunityType: number
  /**
   * Internal padding.
   * The fields above take up 2+2+1+1 bytes = 48 bits, which means we need 80 bits = 10 bytes to
   * align with `u128`s.
   */
  padding1: Array<number>
  /**
   * End padding.
   * The total size of a single instance is 8*u128 = 128 bytes.
   */
  padding2: Array<string>
}

/**
 * A single obligation order.
 * See [Obligation::orders].
 */
export class ObligationOrder {
  /**
   * A threshold value used by the condition (scaled [Fraction]).
   * The exact meaning depends on the specific [Self::condition_type].
   *
   * Examples:
   * - when `condition_type == 2 (UserLtvBelow)`:
   * then a value of `0.455` here means that the order is active only when the obligation's
   * user LTV is less than `0.455` (i.e. < 45.5%).
   * - when `condition_type == 3 (DebtCollPriceRatioAbove)`:
   * assuming the obligation uses BTC collateral for SOL debt, then a value of `491.3` here
   * means that the order is active only when the BTC-SOL price is greater than `491.3` (i.e.
   * > 491.3 SOL per BTC).
   */
  readonly conditionThresholdSf: BN
  /**
   * A configuration parameter used by the opportunity (scaled [Fraction]).
   * The exact meaning depends on the specific [Self::opportunity_type].
   *
   * Examples:
   * - when `opportunity_type == 0 (DeleverageSingleDebtAmount)`:
   * Assuming the obligation uses BTC collateral for SOL debt, then a value of `1_234_000_000`
   * here means that a liquidator may repay up to 1234000000 lamports (i.e. 1.234 SOL) on this
   * obligation.
   * Note: the special value of [Fraction::MAX] is *not* allowed in this case.
   * - when `opportunity_type == 1 (DeleverageAllDebtAmount)`:
   * The only allowed value in this case is [Fraction::MAX] (to emphasize that *all* debt
   * should be repaid).
   */
  readonly opportunityParameterSf: BN
  /**
   * A *minimum* additional fraction of collateral transferred to the liquidator, in bps.
   *
   * The minimum bonus is applied exactly when the [Self::condition_threshold_sf] is met, and
   * grows linearly towards the [Self::max_execution_bonus_bps].
   *
   * Example: a value of `50` here means 50bps == 0.5% bonus for an "LTV > 65%" order, when
   * executed precisely at the moment LTV exceeds 65%.
   */
  readonly minExecutionBonusBps: number
  /**
   * A *maximum* additional fraction of collateral transferred to the liquidator, in bps.
   *
   * The maximum bonus is applied at the relevant "extreme" state of the obligation, i.e.:
   * - for a stop-loss condition, it is a point at which the obligation becomes liquidatable;
   * - for a take-profit condition, it is a point at which obligation has 0% LTV.
   *
   * In non-extreme states, the actual bonus value is interpolated linearly, starting from
   * [Self::min_execution_bonus_bps] (at the point specified by the order's condition).
   *
   * Example: a value of `300` here means 300bps == 3.0% bonus for a "debt/coll price > 140"
   * order, when executed at a higher price = 200, at which the obligation's LTV happens to
   * be equal to its liquidation LTV.
   */
  readonly maxExecutionBonusBps: number
  /**
   * Serialized [ConditionType].
   * The entire order is void when this is zeroed (i.e. representing [ConditionType::Never]).
   *
   * Example: a value of `2` here denotes `UserLtvBelow` condition type. Of course, to
   * interpret this condition, we also need to take the [Self::condition_threshold_sf] into
   * account.
   */
  readonly conditionType: number
  /**
   * Serialized [OpportunityType].
   *
   * Example: a value of `0` here denotes `DeleverageSingleDebtAmount` opportunity. Of course, to
   * interpret this opportunity, we also need to take the [Self::opportunity_parameter_sf] into
   * account.
   */
  readonly opportunityType: number
  /**
   * Internal padding.
   * The fields above take up 2+2+1+1 bytes = 48 bits, which means we need 80 bits = 10 bytes to
   * align with `u128`s.
   */
  readonly padding1: Array<number>
  /**
   * End padding.
   * The total size of a single instance is 8*u128 = 128 bytes.
   */
  readonly padding2: Array<BN>

  constructor(fields: ObligationOrderFields) {
    this.conditionThresholdSf = fields.conditionThresholdSf
    this.opportunityParameterSf = fields.opportunityParameterSf
    this.minExecutionBonusBps = fields.minExecutionBonusBps
    this.maxExecutionBonusBps = fields.maxExecutionBonusBps
    this.conditionType = fields.conditionType
    this.opportunityType = fields.opportunityType
    this.padding1 = fields.padding1
    this.padding2 = fields.padding2
  }

  static layout(property?: string) {
    return borsh.struct(
      [
        borsh.u128("conditionThresholdSf"),
        borsh.u128("opportunityParameterSf"),
        borsh.u16("minExecutionBonusBps"),
        borsh.u16("maxExecutionBonusBps"),
        borsh.u8("conditionType"),
        borsh.u8("opportunityType"),
        borsh.array(borsh.u8(), 10, "padding1"),
        borsh.array(borsh.u128(), 5, "padding2"),
      ],
      property
    )
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  static fromDecoded(obj: any) {
    return new ObligationOrder({
      conditionThresholdSf: obj.conditionThresholdSf,
      opportunityParameterSf: obj.opportunityParameterSf,
      minExecutionBonusBps: obj.minExecutionBonusBps,
      maxExecutionBonusBps: obj.maxExecutionBonusBps,
      conditionType: obj.conditionType,
      opportunityType: obj.opportunityType,
      padding1: obj.padding1,
      padding2: obj.padding2,
    })
  }

  static toEncodable(fields: ObligationOrderFields) {
    return {
      conditionThresholdSf: fields.conditionThresholdSf,
      opportunityParameterSf: fields.opportunityParameterSf,
      minExecutionBonusBps: fields.minExecutionBonusBps,
      maxExecutionBonusBps: fields.maxExecutionBonusBps,
      conditionType: fields.conditionType,
      opportunityType: fields.opportunityType,
      padding1: fields.padding1,
      padding2: fields.padding2,
    }
  }

  toJSON(): ObligationOrderJSON {
    return {
      conditionThresholdSf: this.conditionThresholdSf.toString(),
      opportunityParameterSf: this.opportunityParameterSf.toString(),
      minExecutionBonusBps: this.minExecutionBonusBps,
      maxExecutionBonusBps: this.maxExecutionBonusBps,
      conditionType: this.conditionType,
      opportunityType: this.opportunityType,
      padding1: this.padding1,
      padding2: this.padding2.map((item) => item.toString()),
    }
  }

  static fromJSON(obj: ObligationOrderJSON): ObligationOrder {
    return new ObligationOrder({
      conditionThresholdSf: new BN(obj.conditionThresholdSf),
      opportunityParameterSf: new BN(obj.opportunityParameterSf),
      minExecutionBonusBps: obj.minExecutionBonusBps,
      maxExecutionBonusBps: obj.maxExecutionBonusBps,
      conditionType: obj.conditionType,
      opportunityType: obj.opportunityType,
      padding1: obj.padding1,
      padding2: obj.padding2.map((item) => new BN(item)),
    })
  }

  toEncodable() {
    return ObligationOrder.toEncodable(this)
  }
}
