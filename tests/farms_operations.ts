import {
  Keypair,
  PublicKey,
  SystemProgram,
  SYSVAR_RENT_PUBKEY,
  TransactionSignature,
  VersionedTransaction,
} from '@solana/web3.js';
import { Env } from './setup_utils';
import { initFarmsForReserve, KaminoObligation, LendingMarket, lendingMarketAuthPda, Reserve, sleep } from '../src';
import { ReserveFarmKind } from '../src/idl_codegen/types';
import { buildAndSendTxnWithLogs, buildVersionedTransaction } from '../src/utils';
import Decimal from 'decimal.js';
import { FarmConfigOption, Farms, farmsId, getFarmAuthorityPDA, UserState } from '@hubbleprotocol/farms-sdk';
import base58 from 'bs58';
import { base64 } from '@coral-xyz/anchor/dist/cjs/utils/bytes';

export async function initializeFarmsForReserve(
  env: Env,
  lendingMarket: PublicKey,
  reserve: PublicKey,
  kind: string,
  multisig: boolean,
  simulate: boolean,
  farmsGlobalConfigOverride?: string
) {
  const farmsGlobalConfig = farmsGlobalConfigOverride ?? '6UodrBjL2ZreDy7QdR4YV1oxqMBjVYSEyrFpctqqwGwL';

  const [lendingMarketAuthority, _] = lendingMarketAuthPda(lendingMarket, env.program.programId);

  const lendingMarketOwner = (await LendingMarket.fetch(env.provider.connection, lendingMarket))?.lendingMarketOwner!;

  const SIZE_FARM_STATE = 8336;
  const farmState: Keypair = Keypair.generate();
  const createFarmIx = SystemProgram.createAccount({
    fromPubkey: env.admin.publicKey,
    newAccountPubkey: farmState.publicKey,
    space: SIZE_FARM_STATE,
    lamports: await env.provider.connection.getMinimumBalanceForRentExemption(SIZE_FARM_STATE),
    programId: farmsId,
  });

  const ix = initFarmsForReserve(
    {
      mode: ReserveFarmKind.fromDecoded({ [kind]: '' }).discriminator,
    },
    {
      lendingMarketOwner: lendingMarketOwner,
      lendingMarket,
      lendingMarketAuthority,
      reserve,
      farmsProgram: farmsId,
      farmsGlobalConfig: new PublicKey(farmsGlobalConfig),
      farmState: farmState.publicKey,
      farmsVaultAuthority: getFarmAuthorityPDA(farmsId, farmState.publicKey),
      rent: SYSVAR_RENT_PUBKEY,
      systemProgram: SystemProgram.programId,
    }
  );

  const tx = await buildVersionedTransaction(env.provider.connection, lendingMarketOwner, [createFarmIx, ix]);

  if (simulate) {
    await simulateClientTransaction(env, tx);
  } else {
    if (multisig) {
      console.log(base58.encode(tx.message.serialize()));
    } else {
      if (!env.admin.publicKey.equals(lendingMarketOwner)) {
        throw new Error('Lending market owner must be the admin');
      }
      const sig = await buildAndSendTxnWithLogs(env.provider.connection, tx, env.admin, [farmState], true);
      console.log('Transaction signature: ' + sig);
    }
  }
}

async function simulateClientTransaction(env: Env, tx: VersionedTransaction) {
  const txSimulate = await env.provider.connection.simulateTransaction(tx);
  console.log(txSimulate.value.logs);

  const baseUrl = 'https://explorer.solana.com/tx/inspector?';

  const sanitisedUrl = baseUrl + 'message=' + encodeURIComponent(base64.encode(Buffer.from(tx.message.serialize())));

  console.log('Simulation explorer URL: ', sanitisedUrl);
}

export async function addRewardToFarm(
  env: Env,
  rewardMint: PublicKey,
  reserve: PublicKey,
  kind: string,
  farmsGlobalConfigOverride?: string
): Promise<TransactionSignature> {
  const farmsGlobalConfig = new PublicKey(farmsGlobalConfigOverride ?? '6UodrBjL2ZreDy7QdR4YV1oxqMBjVYSEyrFpctqqwGwL');
  const farmsClient = new Farms(env.provider.connection);
  const reserveState: Reserve = (await Reserve.fetch(env.provider.connection, reserve))!!;
  const farmAddress = kind === 'Collateral' ? reserveState.farmCollateral : reserveState.farmDebt;
  const tokenProgram = (await env.provider.connection.getAccountInfo(rewardMint))!.owner;
  const ix = await farmsClient.addRewardToFarmIx(env.admin.publicKey, farmsGlobalConfig, farmAddress, rewardMint, tokenProgram);
  const tx = await buildVersionedTransaction(env.provider.connection, env.admin.publicKey, [ix]);
  const sig = await buildAndSendTxnWithLogs(env.provider.connection, tx, env.admin, []);
  return sig;
}

export async function topUpRewardToFarm(
  env: Env,
  rewardMint: PublicKey,
  amount: Decimal,
  reserve: PublicKey,
  kind: string
): Promise<TransactionSignature> {
  const farmsClient = new Farms(env.provider.connection);
  await sleep(3000);
  const reserveState: Reserve = (await Reserve.fetch(env.provider.connection, reserve))!!;
  const farmAddress = kind === 'Collateral' ? reserveState.farmCollateral : reserveState.farmDebt;

  const ix = await farmsClient.addRewardAmountToFarmIx(env.admin.publicKey, farmAddress, rewardMint, amount);
  const tx = await buildVersionedTransaction(env.provider.connection, env.admin.publicKey, [ix]);
  const sig = await buildAndSendTxnWithLogs(env.provider.connection, tx, env.admin, []);
  return sig;
}

export async function updateRps(
  env: Env,
  rewardMint: PublicKey,
  rps: number,
  reserve: PublicKey,
  kind: string
): Promise<TransactionSignature> {
  const farmsClient = new Farms(env.provider.connection);
  await sleep(3000);
  const reserveState: Reserve = (await Reserve.fetch(env.provider.connection, reserve))!!;
  const farmAddress = kind === 'Collateral' ? reserveState.farmCollateral : reserveState.farmDebt;
  const ix = await farmsClient.updateFarmConfigIx(
    env.admin.publicKey,
    farmAddress,
    rewardMint,
    new FarmConfigOption.UpdateRewardRps(),
    rps
  );
  const tx = await buildVersionedTransaction(env.provider.connection, env.admin.publicKey, [ix]);
  const sig = await buildAndSendTxnWithLogs(env.provider.connection, tx, env.admin, []);
  return sig;
}

export async function getObligationFarmState(
  env: Env,
  obligation: KaminoObligation,
  farm: PublicKey
): Promise<UserState | null> {
  const BASE_SEED_USER_STATE = Buffer.from('user');
  const pda = PublicKey.findProgramAddressSync(
    [BASE_SEED_USER_STATE, farm.toBytes(), obligation.obligationAddress.toBytes()],
    farmsId
  )[0];

  return await UserState.fetch(env.provider.connection, pda);
}
