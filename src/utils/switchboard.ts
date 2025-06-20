import BN from 'bn.js';
import Decimal from 'decimal.js';
import { AggregatorAccountData } from '../@codegen/switchboard_v2/accounts/AggregatorAccountData';

export function getLatestAggregatorValue(aggregator: AggregatorAccountData, maxStaleness = 0): Decimal | null {
  if ((aggregator.latestConfirmedRound?.numSuccess ?? 0) === 0) {
    return null;
  }
  if (maxStaleness !== 0) {
    const now = new BN(Date.now() / 1000);
    const latestRoundTimestamp: BN = aggregator.latestConfirmedRound.roundOpenTimestamp;
    const staleness = now.sub(latestRoundTimestamp);
    if (staleness.gt(new BN(maxStaleness))) {
      return null;
    }
  }

  const mantissa = new Decimal(aggregator.latestConfirmedRound.result.mantissa.toString());
  const scale = aggregator.latestConfirmedRound.result.scale;

  const result = mantissa.div(new Decimal(10).pow(scale));
  return new Decimal(result.toPrecision(20));
}
