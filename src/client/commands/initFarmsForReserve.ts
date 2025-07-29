import { Address, generateKeyPairSigner, TransactionSigner } from '@solana/kit';
import {
  DEFAULT_RECENT_SLOT_DURATION_MS,
  initFarmsForReserve as initFarmsForReserveIx,
  KaminoMarket,
  lendingMarketAuthPda,
  Reserve,
} from '../../../src';
import { ReserveFarmKind } from '../../../src/@codegen/klend/types';
import { getFarmAuthorityPDA } from '@kamino-finance/farms-sdk';
import { getCreateAccountInstruction, SYSTEM_PROGRAM_ADDRESS } from '@solana-program/system';
import { SYSVAR_RENT_ADDRESS } from '@solana/sysvars';
import { CliEnv, SendTxMode } from '../tx/CliEnv';
import { processTx } from '../tx/processor';

export async function initFarmsForReserve(
  env: CliEnv,
  mode: SendTxMode,
  reserve: Address,
  kind: string
): Promise<void> {
  const reserveState = await Reserve.fetch(env.c.rpc, reserve, env.klendProgramId);
  if (reserveState === null) {
    throw new Error(`Reserve ${reserve} not found`);
  }
  const { lendingMarket } = reserveState;

  const [lendingMarketAuthority] = await lendingMarketAuthPda(lendingMarket, env.klendProgramId);
  const market = await KaminoMarket.load(
    env.c.rpc,
    lendingMarket,
    DEFAULT_RECENT_SLOT_DURATION_MS,
    env.klendProgramId,
    false
  );

  if (!market) {
    throw new Error(`Market ${lendingMarket} not found`);
  }
  const signer = await env.getSigner(market);

  const SIZE_FARM_STATE = 8336n;
  const farmState: TransactionSigner = await generateKeyPairSigner();
  const createFarmIx = getCreateAccountInstruction({
    payer: signer,
    newAccount: farmState,
    lamports: await env.c.rpc.getMinimumBalanceForRentExemption(SIZE_FARM_STATE).send(),
    space: SIZE_FARM_STATE,
    programAddress: env.farmsProgramId,
  });

  const ix = initFarmsForReserveIx(
    {
      mode: ReserveFarmKind.fromDecoded({ [kind]: '' }).discriminator,
    },
    {
      lendingMarketOwner: signer,
      lendingMarket,
      lendingMarketAuthority,
      reserve,
      farmsProgram: env.farmsProgramId,
      farmsGlobalConfig: env.farmsGlobalConfig,
      farmState: farmState.address,
      farmsVaultAuthority: await getFarmAuthorityPDA(env.farmsProgramId, farmState.address),
      rent: SYSVAR_RENT_ADDRESS,
      systemProgram: SYSTEM_PROGRAM_ADDRESS,
    }
  );

  await processTx(env.c, signer, [createFarmIx, ix], mode);
}
