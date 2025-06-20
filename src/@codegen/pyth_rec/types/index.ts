import * as VerificationLevel from "./VerificationLevel"

export { PriceFeedMessage } from "./PriceFeedMessage"
export type {
  PriceFeedMessageFields,
  PriceFeedMessageJSON,
} from "./PriceFeedMessage"
export { TwapPrice } from "./TwapPrice"
export type { TwapPriceFields, TwapPriceJSON } from "./TwapPrice"
export { MerklePriceUpdate } from "./MerklePriceUpdate"
export type {
  MerklePriceUpdateFields,
  MerklePriceUpdateJSON,
} from "./MerklePriceUpdate"
export { DataSource } from "./DataSource"
export type { DataSourceFields, DataSourceJSON } from "./DataSource"
export { PostUpdateAtomicParams } from "./PostUpdateAtomicParams"
export type {
  PostUpdateAtomicParamsFields,
  PostUpdateAtomicParamsJSON,
} from "./PostUpdateAtomicParams"
export { PostUpdateParams } from "./PostUpdateParams"
export type {
  PostUpdateParamsFields,
  PostUpdateParamsJSON,
} from "./PostUpdateParams"
export { PostTwapUpdateParams } from "./PostTwapUpdateParams"
export type {
  PostTwapUpdateParamsFields,
  PostTwapUpdateParamsJSON,
} from "./PostTwapUpdateParams"
export { VerificationLevel }

/**
 * * This enum represents how many guardian signatures were checked for a Pythnet price update
 *  * If full, guardian quorum has been attained
 *  * If partial, at least config.minimum signatures have been verified, but in the case config.minimum_signatures changes in the future we also include the number of signatures that were checked
 */
export type VerificationLevelKind =
  | VerificationLevel.Partial
  | VerificationLevel.Full
export type VerificationLevelJSON =
  | VerificationLevel.PartialJSON
  | VerificationLevel.FullJSON
