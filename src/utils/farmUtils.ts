import { Address, Rpc, SolanaRpcApi } from '@solana/kit';
import type { LedgerInstant } from './ledger';
import { Decimal } from 'decimal.js';
import {
  DEFAULT_PUBLIC_KEY,
  FarmIncentives,
  Farms,
  FarmState,
  getFarmIncentives,
  getFarmIncentivesWithExistentState,
} from '@kamino-finance/farms-sdk';
import { Reserve } from '../@codegen/klend/accounts';
import { KaminoReserve } from '../lib';

// Keep caller-supplied farm clients structural so linked SDK consumers do not hit
// nominal type errors from duplicate @kamino-finance/farms-sdk installs.
export type FarmsClient = Pick<Farms, 'getConnection' | 'getProgramID' | 'getAllUserStatesForFarm'>;

export interface ReserveIncentives {
  collateralFarmIncentives: FarmIncentives;
  debtFarmIncentives: FarmIncentives;
}

function toFarmsClient(farmsClient: FarmsClient): Farms {
  return new Farms(farmsClient.getConnection(), farmsClient.getProgramID());
}

export async function getFarmIncentivesForClient(
  farmsClient: FarmsClient,
  farm: Address,
  stakedTokenPrice: Decimal,
  stakedTokenMintDecimals: number,
  pricesMap?: Map<Address, Decimal>
): Promise<FarmIncentives> {
  return getFarmIncentives(toFarmsClient(farmsClient), farm, stakedTokenPrice, stakedTokenMintDecimals, pricesMap);
}

export async function getFarmIncentivesWithExistentStateForClient(
  farmsClient: FarmsClient,
  farm: Address,
  farmState: FarmState,
  stakedTokenPrice: Decimal,
  stakedTokenMintDecimals: number,
  pricesMap?: Map<Address, Decimal>
): Promise<FarmIncentives> {
  return getFarmIncentivesWithExistentState(
    toFarmsClient(farmsClient),
    farm,
    farmState,
    stakedTokenPrice,
    stakedTokenMintDecimals,
    pricesMap
  );
}

/**
 * Computes the farm APY built on top of the reserve's cToken (collateral farm) and the reserve's
 * borrow side (debt farm).
 *
 * @param reserveRewardsMaxAprBps - the parent lending market's `reserveRewardsMaxAprBps`
 *   (`kaminoMarket.state.reserveRewardsMaxAprBps`). Pass it when the market is already loaded to
 *   save a network call; when omitted, the reserve's lending market is fetched to read it.
 * @param klendProgramId - the klend program that owns the reserve; pass it on non-default
 *   deployments (e.g. staging), otherwise the mainnet program id is used.
 */
export async function getReserveFarmRewardsAPY(
  rpc: Rpc<SolanaRpcApi>,
  recentSlotDurationMs: number,
  reserve: Address,
  reserveLiquidityTokenPrice: Decimal,
  farmsClient: FarmsClient,
  ledgerInstant: LedgerInstant,
  reserveState: Reserve,
  tokensPrices?: Map<Address, Decimal>,
  reserveRewardsMaxAprBps?: number,
  klendProgramId?: Address
): Promise<ReserveIncentives> {
  const reserveIncentives: ReserveIncentives = {
    collateralFarmIncentives: {
      incentivesStats: [],
      totalIncentivesApy: 0,
    },
    debtFarmIncentives: {
      incentivesStats: [],
      totalIncentivesApy: 0,
    },
  };

  const kaminoReserve = await KaminoReserve.initializeFromAddress(
    reserve,
    rpc,
    recentSlotDurationMs,
    reserveState,
    undefined,
    undefined,
    reserveRewardsMaxAprBps,
    klendProgramId
  );

  const farmCollateral = kaminoReserve.state.farmCollateral;
  const farmDebt = kaminoReserve.state.farmDebt;

  const stakedTokenMintDecimals = kaminoReserve.getMintDecimals();
  const reserveCtokenPrice = reserveLiquidityTokenPrice.div(
    kaminoReserve.getEstimatedCollateralExchangeRate(ledgerInstant, 0)
  );

  if (farmCollateral !== DEFAULT_PUBLIC_KEY) {
    const farmIncentivesCollateral = await getFarmIncentivesForClient(
      farmsClient,
      farmCollateral,
      reserveCtokenPrice,
      stakedTokenMintDecimals,
      tokensPrices
    );
    reserveIncentives.collateralFarmIncentives = farmIncentivesCollateral;
  }

  if (farmDebt !== DEFAULT_PUBLIC_KEY) {
    const farmIncentivesDebt = await getFarmIncentivesForClient(
      farmsClient,
      farmDebt,
      reserveLiquidityTokenPrice,
      stakedTokenMintDecimals,
      tokensPrices
    );
    reserveIncentives.debtFarmIncentives = farmIncentivesDebt;
  }

  return reserveIncentives;
}
