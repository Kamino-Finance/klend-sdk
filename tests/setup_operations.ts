import { Keypair, PublicKey, SystemProgram, SYSVAR_RENT_PUBKEY, TransactionSignature } from '@solana/web3.js';
import * as anchor from '@coral-xyz/anchor';

import {
  initLendingMarket,
  InitLendingMarketAccounts,
  InitLendingMarketArgs,
  initReserve,
  InitReserveAccounts,
  KaminoAction,
  KaminoMarket,
  LendingMarket,
  lendingMarketAuthPda,
  Reserve,
  reservePdas,
  sleep,
  updateLendingMarket,
  UpdateLendingMarketAccounts,
  UpdateLendingMarketArgs,
  updateEntireReserveConfig,
  UpdateEntireReserveConfigAccounts,
  UpdateEntireReserveConfigArgs,
} from '../src';
import { buildAndSendTxnWithLogs, buildVersionedTransaction } from '../src/utils';
import { Env } from './setup_utils';
import { TOKEN_PROGRAM_ID } from '@solana/spl-token';
import { ElevationGroupFields, ReserveConfig } from '../src/idl_codegen/types';
import { BN } from '@coral-xyz/anchor';

export async function createMarket(env: Env): Promise<[TransactionSignature, Keypair]> {
  const args: InitLendingMarketArgs = {
    quoteCurrency: Array(32).fill(0),
  };

  const marketAccount = Keypair.generate();
  const size = LendingMarket.layout.span + 8;
  const [lendingMarketAuthority, _] = lendingMarketAuthPda(marketAccount.publicKey, env.program.programId);
  const createMarketIx = SystemProgram.createAccount({
    fromPubkey: env.admin.publicKey,
    newAccountPubkey: marketAccount.publicKey,
    lamports: await env.provider.connection.getMinimumBalanceForRentExemption(size),
    space: size,
    programId: env.program.programId,
  });

  const accounts: InitLendingMarketAccounts = {
    lendingMarketOwner: env.admin.publicKey,
    lendingMarket: marketAccount.publicKey,
    lendingMarketAuthority: lendingMarketAuthority,
    systemProgram: SystemProgram.programId,
    rent: SYSVAR_RENT_PUBKEY,
  };

  const ix = initLendingMarket(args, accounts);
  const tx = await buildVersionedTransaction(env.provider.connection, env.admin.publicKey, [createMarketIx, ix]);

  const sig = await buildAndSendTxnWithLogs(env.provider.connection, tx, env.admin, [marketAccount]);
  return [sig, marketAccount];
}

export async function createReserve(
  env: Env,
  lendingMarket: PublicKey,
  liquidityMint: PublicKey
): Promise<[TransactionSignature, Keypair]> {
  const reserveAccount = Keypair.generate();
  const size = Reserve.layout.span + 8;
  const [lendingMarketAuthority, _] = lendingMarketAuthPda(lendingMarket, env.program.programId);
  const createReserveIx = SystemProgram.createAccount({
    fromPubkey: env.admin.publicKey,
    newAccountPubkey: reserveAccount.publicKey,
    lamports: await env.provider.connection.getMinimumBalanceForRentExemption(size),
    space: size,
    programId: env.program.programId,
  });

  const { liquiditySupplyVault, collateralMint, collateralSupplyVault, feeVault } = await reservePdas(
    env.program.programId,
    lendingMarket,
    liquidityMint
  );

  const accounts: InitReserveAccounts = {
    lendingMarketOwner: env.admin.publicKey,
    lendingMarket: lendingMarket,
    lendingMarketAuthority: lendingMarketAuthority,
    reserve: reserveAccount.publicKey,
    reserveLiquidityMint: liquidityMint,
    reserveLiquiditySupply: liquiditySupplyVault,
    feeReceiver: feeVault,
    reserveCollateralMint: collateralMint,
    reserveCollateralSupply: collateralSupplyVault,
    tokenProgram: TOKEN_PROGRAM_ID,
    systemProgram: SystemProgram.programId,
    rent: SYSVAR_RENT_PUBKEY,
  };

  const ix = initReserve(accounts);
  const tx = await buildVersionedTransaction(env.provider.connection, env.admin.publicKey, [createReserveIx, ix]);

  const sig = await buildAndSendTxnWithLogs(env.provider.connection, tx, env.admin, [reserveAccount]);
  return [sig, reserveAccount];
}

export async function updateReserve(
  env: Env,
  reserve: PublicKey,
  config: ReserveConfig
): Promise<TransactionSignature> {
  await sleep(2000);
  const reserveState: Reserve = (await Reserve.fetch(env.provider.connection, reserve))!;

  const layout = ReserveConfig.layout();
  const data = Buffer.alloc(1000);
  const len = layout.encode(config.toEncodable(), data);

  const args: UpdateEntireReserveConfigArgs = {
    mode: new anchor.BN(25),
    value: [...data.slice(0, len)],
  };

  const accounts: UpdateEntireReserveConfigAccounts = {
    lendingMarketOwner: env.admin.publicKey,
    lendingMarket: reserveState.lendingMarket,
    reserve: reserve,
  };

  const ix = updateEntireReserveConfig(args, accounts);
  const tx = await buildVersionedTransaction(env.provider.connection, env.admin.publicKey, [ix]);

  const sig = await buildAndSendTxnWithLogs(env.provider.connection, tx, env.admin, []);
  return sig;
}

const VALUE_BYTE_MAX_ARRAY_LEN_MARKET_UPDATE = 72;

// TODO: Make it more generic
export async function updateMarketElevationGroup(env: Env, market: PublicKey): Promise<TransactionSignature> {
  await sleep(2000);
  const marketState: LendingMarket = (await LendingMarket.fetch(env.provider.connection, market))!;

  const elevationGroup: ElevationGroupFields = {
    maxLiquidationBonusBps: 100,
    id: 1,
    ltvPct: 90,
    liquidationThresholdPct: 95,
    allowNewLoans: 1,
    reserved: [0, 0],
    padding: new Array(20).fill(new BN(0)),
  };

  const buffer = Buffer.alloc(VALUE_BYTE_MAX_ARRAY_LEN_MARKET_UPDATE);
  buffer.writeUInt16LE(elevationGroup.maxLiquidationBonusBps, 0);
  buffer.writeUInt8(elevationGroup.id, 2);
  buffer.writeUInt8(elevationGroup.ltvPct, 3);
  buffer.writeUInt8(elevationGroup.liquidationThresholdPct, 4);
  buffer.writeUInt8(elevationGroup.allowNewLoans, 5);

  const args: UpdateLendingMarketArgs = {
    mode: new anchor.BN(9), // Elevation group enum value
    value: [...buffer],
  };

  const accounts: UpdateLendingMarketAccounts = {
    lendingMarketOwner: marketState.lendingMarketOwner,
    lendingMarket: market,
  };

  const ix = updateLendingMarket(args, accounts);
  const tx = await buildVersionedTransaction(env.provider.connection, env.admin.publicKey, [ix]);

  const sig = await buildAndSendTxnWithLogs(env.provider.connection, tx, env.admin, [], false, 'UpdateElevationGroup');
  return sig;
}

export async function updateMarketReferralFeeBps(
  env: Env,
  market: PublicKey,
  referralFeeBps: number
): Promise<TransactionSignature> {
  await sleep(2000);
  const marketState: LendingMarket = (await LendingMarket.fetch(env.provider.connection, market))!;

  const buffer = Buffer.alloc(VALUE_BYTE_MAX_ARRAY_LEN_MARKET_UPDATE);
  buffer.writeUInt16LE(referralFeeBps, 0);

  const args: UpdateLendingMarketArgs = {
    mode: new BN(10), // UpdateLendingMarketMode.UpdateReferralFeeBps.discriminator
    value: [...buffer],
  };

  const accounts: UpdateLendingMarketAccounts = {
    lendingMarketOwner: marketState.lendingMarketOwner,
    lendingMarket: market,
  };

  const ix = updateLendingMarket(args, accounts);
  const tx = await buildVersionedTransaction(env.provider.connection, env.admin.publicKey, [ix]);

  const sig = await buildAndSendTxnWithLogs(env.provider.connection, tx, env.admin, []);
  await sleep(2000);
  return sig;
}

export async function updateMarketMultiplierPoints(
  env: Env,
  market: PublicKey,
  value: number
): Promise<TransactionSignature> {
  await sleep(2000);
  const marketState: LendingMarket = (await LendingMarket.fetch(env.provider.connection, market))!;

  const buffer = Buffer.alloc(VALUE_BYTE_MAX_ARRAY_LEN_MARKET_UPDATE);
  for (let i = 0; i < 8; i++) {
    buffer.writeUInt8(value, i);
  }

  const args: UpdateLendingMarketArgs = {
    mode: new BN(11), // UpdateLendingMarketMode.UpdateMultiplierPoints.discriminator,
    value: [...buffer],
  };

  const accounts: UpdateLendingMarketAccounts = {
    lendingMarketOwner: marketState.lendingMarketOwner,
    lendingMarket: market,
  };

  const ix = updateLendingMarket(args, accounts);
  const tx = await buildVersionedTransaction(env.provider.connection, env.admin.publicKey, [ix]);

  const sig = await buildAndSendTxnWithLogs(env.provider.connection, tx, env.admin, []);
  await sleep(2000);
  return sig;
}

export async function reloadReservesAndRefreshMarket(env: Env, kaminoMarket: KaminoMarket) {
  await kaminoMarket.reload();
  await refreshReserves(env, kaminoMarket);
  await sleep(2000);
  await kaminoMarket.reload();
}

export async function refreshReserves(env: Env, kaminoMarket: KaminoMarket) {
  const ixns = KaminoAction.getRefreshAllReserves(kaminoMarket, [...kaminoMarket.reserves.keys()]);

  const tx = await buildVersionedTransaction(env.provider.connection, env.admin.publicKey, ixns);
  const txHash = await buildAndSendTxnWithLogs(env.provider.connection, tx, env.admin, [], false, 'RefreshReserves');
  await env.provider.connection.confirmTransaction(txHash, 'confirmed');
}
