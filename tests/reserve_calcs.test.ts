import { KaminoReserve, Reserve, ReserveFields } from '../src';
import { BN } from '@coral-xyz/anchor';
import Decimal from 'decimal.js';
import { Connection, PublicKey } from '@solana/web3.js';
import { CurvePointFields } from '../src/idl_codegen/types';
import { expect } from 'chai';
import { endpointFromCluster } from './setup_utils';

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

    expect(totalSupplyStale.toString()).eq('1000000.000000000086736173798840352915036');
    expect(totalSupplyPlusInterest.toString()).eq('1000000.000000000086736173799489749616243');
  });
});

function testKaminoReserve(args: TestReserveFields): KaminoReserve {
  const state = testReserve(args);
  return new KaminoReserve(
    state,
    PublicKey.default,
    {
      price: new Decimal(1),
      timestamp: BigInt(0),
      decimals: new Decimal(0),
      mintAddress: PublicKey.default,
      valid: true,
    },
    new Connection(endpointFromCluster('localnet'))
  );
}

type TestReserveFields = {
  lastUpdateSlot?: number;
  collTotalSupply?: BN;
  liquidityAvailableAmount?: BN;
  borrowedAmount?: BN;
  accumulatedProtocolFees?: BN;
  accumulatedReferrerFeesSf?: BN;
  pendingReferrerFeesSf?: BN;
  borrowRateCurve?: Array<CurvePointFields>;
  protocolTakeRatePct?: number;
};

function testReserve({
  lastUpdateSlot,
  collTotalSupply,
  liquidityAvailableAmount,
  borrowedAmount,
  accumulatedProtocolFees,
  accumulatedReferrerFeesSf,
  pendingReferrerFeesSf,
  borrowRateCurve,
  protocolTakeRatePct,
}: TestReserveFields): Reserve {
  const r = getDefaultReserveFields();
  r.lastUpdate.slot = lastUpdateSlot ? new BN(lastUpdateSlot) : r.lastUpdate.slot;
  r.collateral.mintTotalSupply = collTotalSupply || r.collateral.mintTotalSupply;
  r.liquidity.availableAmount = liquidityAvailableAmount || r.liquidity.availableAmount;
  r.liquidity.borrowedAmountSf = borrowedAmount || r.liquidity.borrowedAmountSf;
  r.liquidity.accumulatedProtocolFeesSf = accumulatedProtocolFees || r.liquidity.accumulatedProtocolFeesSf;
  r.liquidity.accumulatedReferrerFeesSf = accumulatedReferrerFeesSf || r.liquidity.accumulatedReferrerFeesSf;
  r.liquidity.pendingReferrerFeesSf = pendingReferrerFeesSf || r.liquidity.pendingReferrerFeesSf;
  r.config.borrowRateCurve.points = borrowRateCurve || r.config.borrowRateCurve.points;
  r.config.protocolTakeRatePct = protocolTakeRatePct || r.config.protocolTakeRatePct;
  return new Reserve(r);
}

function testCurve(): Array<CurvePointFields> {
  return [
    {
      utilizationRateBps: 0,
      borrowRateBps: 1,
    },
    {
      utilizationRateBps: 8000,
      borrowRateBps: 300,
    },
    {
      utilizationRateBps: 8500,
      borrowRateBps: 670,
    },
    {
      utilizationRateBps: 9000,
      borrowRateBps: 1500,
    },
    {
      utilizationRateBps: 9500,
      borrowRateBps: 3354,
    },
    {
      utilizationRateBps: 10000,
      borrowRateBps: 7500,
    },
  ];
}

function getDefaultReserveFields(): ReserveFields {
  return {
    collateral: {
      mintPubkey: PublicKey.default,
      mintTotalSupply: new BN(0),
      padding1: [],
      padding2: [],
      supplyVault: PublicKey.default,
    },
    config: {
      assetTier: 0,
      badDebtLiquidationBonusBps: 0,
      borrowFactorPct: new BN(0),
      borrowLimit: new BN(0),
      borrowRateCurve: {
        points: [],
      },
      debtWithdrawalCap: {
        configCapacity: new BN(0),
        configIntervalLengthSeconds: new BN(0),
        currentTotal: new BN(0),
        lastIntervalStartTimestamp: new BN(0),
      },
      deleveragingMarginCallPeriodSecs: new BN(0),
      deleveragingThresholdSlotsPerBps: new BN(0),
      depositLimit: new BN(0),
      depositWithdrawalCap: {
        configCapacity: new BN(0),
        configIntervalLengthSeconds: new BN(0),
        currentTotal: new BN(0),
        lastIntervalStartTimestamp: new BN(0),
      },
      elevationGroups: [],
      fees: {
        borrowFeeSf: new BN(0),
        flashLoanFeeSf: new BN(0),
        padding: [],
      },
      disableUsageAsCollOutsideEmode: 0,
      liquidationThresholdPct: 0,
      loanToValuePct: 0,
      maxLiquidationBonusBps: 0,
      minLiquidationBonusBps: 0,
      multiplierSideBoost: [],
      multiplierTagBoost: [],
      protocolLiquidationFeePct: 0,
      protocolTakeRatePct: 0,
      reserved0: [],
      reserved1: [],
      status: 0,
      tokenInfo: {
        heuristic: {
          exp: new BN(0),
          lower: new BN(0),
          upper: new BN(0),
        },
        maxAgePriceSeconds: new BN(0),
        maxAgeTwapSeconds: new BN(0),
        maxTwapDivergenceBps: new BN(0),
        name: [],
        padding: [],
        pythConfiguration: {
          price: PublicKey.default,
        },
        scopeConfiguration: {
          priceChain: [],
          priceFeed: PublicKey.default,
          twapChain: [],
        },
        switchboardConfiguration: {
          priceAggregator: PublicKey.default,
          twapAggregator: PublicKey.default,
        },
      },
    },
    configPadding: [],
    farmCollateral: PublicKey.default,
    farmDebt: PublicKey.default,
    lastUpdate: {
      placeholder: [],
      priceStatus: 0,
      slot: new BN(0),
      stale: 0,
    },
    lendingMarket: PublicKey.default,
    liquidity: {
      absoluteReferralRateSf: new BN(0),
      accumulatedProtocolFeesSf: new BN(0),
      accumulatedReferrerFeesSf: new BN(0),
      availableAmount: new BN(0),
      borrowLimitCrossedSlot: new BN(0),
      borrowedAmountSf: new BN(0),
      cumulativeBorrowRateBsf: {
        padding: [],
        value: [],
      },
      depositLimitCrossedSlot: new BN(0),
      feeVault: PublicKey.default,
      marketPriceLastUpdatedTs: new BN(0),
      marketPriceSf: new BN(0),
      mintDecimals: new BN(6),
      mintPubkey: PublicKey.default,
      padding2: [],
      padding3: [],
      pendingReferrerFeesSf: new BN(0),
      supplyVault: PublicKey.default,
    },
    padding: [],
    reserveCollateralPadding: [],
    reserveLiquidityPadding: [],
    version: new BN(0),
  };
}
