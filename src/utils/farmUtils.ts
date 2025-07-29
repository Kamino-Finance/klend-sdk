import { Address, Rpc, Slot, SolanaRpcApi } from '@solana/kit';
import { Decimal } from 'decimal.js';
import { FarmIncentives, Farms } from '@kamino-finance/farms-sdk';
import { getFarmIncentives } from '@kamino-finance/farms-sdk/dist/utils/apy';
import { DEFAULT_PUBLIC_KEY } from '@kamino-finance/farms-sdk';
import { Reserve } from '../@codegen/klend/accounts';
import { KaminoReserve } from '../lib';
import { getMintDecimals } from '@kamino-finance/kliquidity-sdk';

export interface ReserveIncentives {
  collateralFarmIncentives: FarmIncentives;
  debtFarmIncentives: FarmIncentives;
}

export async function getReserveFarmRewardsAPY(
  rpc: Rpc<SolanaRpcApi>,
  recentSlotDurationMs: number,
  reserve: Address,
  reserveLiquidityTokenPrice: Decimal,
  kaminoLendProgramId: Address,
  farmsClient: Farms,
  slot: Slot,
  reserveState?: Reserve,
  cTokenMintDecimals?: number
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

  const reserveAccount = reserveState ? reserveState : await Reserve.fetch(rpc, reserve, kaminoLendProgramId);
  if (!reserveAccount) {
    throw new Error(`Reserve ${reserve} not found`);
  }

  const kaminoReserve = await KaminoReserve.initializeFromAddress(reserve, rpc, recentSlotDurationMs, reserveAccount);

  const farmCollateral = kaminoReserve.state.farmCollateral;
  const farmDebt = kaminoReserve.state.farmDebt;

  const stakedTokenMintDecimals = kaminoReserve.getMintDecimals();
  const reserveCtokenPrice = reserveLiquidityTokenPrice.div(kaminoReserve.getEstimatedCollateralExchangeRate(slot, 0));
  const cTokenMint = kaminoReserve.getCTokenMint();
  const cTokenDecimals = cTokenMintDecimals ? cTokenMintDecimals : await getMintDecimals(rpc, cTokenMint);

  if (farmCollateral !== DEFAULT_PUBLIC_KEY) {
    const farmIncentivesCollateral = await getFarmIncentives(
      farmsClient,
      farmCollateral,
      reserveCtokenPrice,
      cTokenDecimals
    );
    reserveIncentives.collateralFarmIncentives = farmIncentivesCollateral;
  }

  if (farmDebt !== DEFAULT_PUBLIC_KEY) {
    const farmIncentivesDebt = await getFarmIncentives(
      farmsClient,
      farmDebt,
      reserveLiquidityTokenPrice,
      stakedTokenMintDecimals
    );
    reserveIncentives.debtFarmIncentives = farmIncentivesDebt;
  }

  return reserveIncentives;
}
