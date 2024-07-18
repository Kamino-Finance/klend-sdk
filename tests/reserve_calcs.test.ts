import { BN } from '@coral-xyz/anchor';
import { expect } from 'chai';
import { testCurve, testKaminoReserve } from './setup_utils';

describe('reserve_calcs', function () {
  it('reserve_calculate_estimated_and_stale_supply', async function () {
    const reserve = testKaminoReserve({
      liquidityAvailableAmount: new BN(1000000),
      collTotalSupply: new BN(1000000000),
      borrowRateCurve: testCurve(),
      protocolTakeRatePct: 15,
      borrowedAmount: new BN(100000000),
      accumulatedReferrerFeesSf: new BN(0),
    });
    const totalSupplyStale = reserve.getTotalSupply();
    const totalSupplyPlusInterest = reserve.getEstimatedTotalSupply(5, 0);
    const accumulatedProtocolFees = reserve.getAccumulatedProtocolFees();
    const { accumulatedProtocolFees: estimatedAccumulatedProtocolFees } = reserve.getEstimatedAccumulatedProtocolFees(
      1000,
      0
    );

    expect(totalSupplyStale.toString()).eq('1000000.000000000086736173798840352915036');
    expect(totalSupplyPlusInterest.toString()).eq('1000000.000000000086736173799489749616243');
    expect(accumulatedProtocolFees.toString()).eq('0');
    expect(estimatedAccumulatedProtocolFees.toFixed()).eq('0.0000000000000000000229198835920763525402574346465545');
  });
});

it('reserve_calculated_estimated_supply_with_host_fixed_interest_rate', async function () {
  const reserve = testKaminoReserve({
    liquidityAvailableAmount: new BN(1000000),
    collTotalSupply: new BN(1000000000),
    borrowRateCurve: testCurve(),
    protocolTakeRatePct: 15,
    borrowedAmount: new BN(100000000),
    accumulatedReferrerFeesSf: new BN(0),
    hostFixedInterestRateBps: 1000,
  });
  const totalSupplyStale = reserve.getTotalSupply();
  const totalSupplyPlusInterest = reserve.getEstimatedTotalSupply(5, 0);

  const accumulatedProtocolFees = reserve.getAccumulatedProtocolFees();
  const {
    accumulatedProtocolFees: estimatedAccumulatedProtocolFees,
    compoundedFixedHostFee,
    compoundedVariableProtocolFee,
  } = reserve.getEstimatedAccumulatedProtocolFees(1000, 0);

  expect(totalSupplyStale.toString()).eq('1000000.000000000086736173798840352915036');
  expect(totalSupplyPlusInterest.toString()).eq('1000000.000000000086736173799489749620361');

  expect(accumulatedProtocolFees.toString()).eq('0');
  expect(estimatedAccumulatedProtocolFees.toFixed()).eq('0.000000000000000137542330260089777451133815435695863');
  expect(estimatedAccumulatedProtocolFees.toString()).equals(
    compoundedFixedHostFee.plus(compoundedVariableProtocolFee).toString()
  );
});
