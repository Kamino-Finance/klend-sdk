import { PublicKey, Connection, Transaction, TransactionInstruction, Keypair } from '@solana/web3.js';
import * as anchor from '@coral-xyz/anchor';
import Decimal from 'decimal.js';
import { getStartTickIndex, priceToSqrtX64 } from '@orca-so/whirlpool-sdk';
import * as WhirlpoolInstructions from '@kamino-finance/kliquidity-sdk/dist/whirlpools-client/instructions';
import { sendTransactionWithLogs, TOKEN_PROGRAM_ID, Kamino } from '@kamino-finance/kliquidity-sdk';
import { PROGRAM_ID_CLI as WHIRLPOOL_PROGRAM_ID } from '@kamino-finance/kliquidity-sdk/dist/whirlpools-client/programId';
import { Whirlpool } from '@kamino-finance/kliquidity-sdk/dist/whirlpools-client/accounts';
import { orderMints, DeployedPool, range, getMintDecimals } from './utils';
import { Env } from '../setup_utils';

export async function initializeWhirlpool(
  env: Env,
  tickSize: number,
  tokenMintA: PublicKey,
  tokenMintB: PublicKey,
  kamino: Kamino,
  lowerRange?: string,
  upperRange?: string,
  priceAinB: Decimal = new Decimal(1)
): Promise<DeployedPool> {
  const config = Keypair.generate();

  {
    const initialiseConfigArgs: WhirlpoolInstructions.InitializeConfigArgs = {
      feeAuthority: env.admin.publicKey,
      collectProtocolFeesAuthority: env.admin.publicKey,
      rewardEmissionsSuperAuthority: env.admin.publicKey,
      defaultProtocolFeeRate: 0,
    };

    const initialiseConfigAccounts: WhirlpoolInstructions.InitializeConfigAccounts = {
      config: config.publicKey,
      funder: env.admin.publicKey,
      systemProgram: anchor.web3.SystemProgram.programId,
    };

    const tx = new Transaction();
    const initializeIx = WhirlpoolInstructions.initializeConfig(initialiseConfigArgs, initialiseConfigAccounts);
    tx.add(initializeIx);

    const sig = await sendTransactionWithLogs(env.provider.connection, tx, env.admin.publicKey, [env.admin, config]);
    console.log('InitializeConfig:', sig);
  }

  const [feeTierPk] = anchor.web3.PublicKey.findProgramAddressSync(
    [Buffer.from('fee_tier'), config.publicKey.toBuffer(), new anchor.BN(tickSize).toArrayLike(Buffer, 'le', 2)],
    WHIRLPOOL_PROGRAM_ID
  );

  {
    const initialiseFeeTierArgs: WhirlpoolInstructions.InitializeFeeTierArgs = {
      tickSpacing: tickSize,
      defaultFeeRate: 0,
    };

    const initialiseFeeTierAccounts: WhirlpoolInstructions.InitializeFeeTierAccounts = {
      config: config.publicKey,
      feeTier: feeTierPk,
      funder: env.admin.publicKey,
      feeAuthority: env.admin.publicKey,
      systemProgram: anchor.web3.SystemProgram.programId,
    };

    const tx = new Transaction();
    const initializeIx = WhirlpoolInstructions.initializeFeeTier(initialiseFeeTierArgs, initialiseFeeTierAccounts);
    tx.add(initializeIx);

    const sig = await sendTransactionWithLogs(env.provider.connection, tx, env.admin.publicKey, [env.admin]);
    console.log('InitializeFeeTier:', sig);
  }

  const tokens = orderMints(tokenMintA, tokenMintB);
  const orderedTokenMintA = tokens[0];
  const orderedTokenMintB = tokens[1];

  const [whirlpool, whirlpoolBump] = await getWhirlpool(
    WHIRLPOOL_PROGRAM_ID,
    config.publicKey,
    orderedTokenMintA,
    orderedTokenMintB,
    tickSize
  );

  {
    const tokenAVault = Keypair.generate();
    const tokenBVault = Keypair.generate();

    const tokenADecimals = await getMintDecimals(env, orderedTokenMintA);
    const tokenBDecimals = await getMintDecimals(env, orderedTokenMintB);
    // eslint-disable-next-line no-mixed-operators
    const initialisePoolArgs: WhirlpoolInstructions.InitializePoolArgs = {
      tickSpacing: tickSize,
      bumps: { whirlpoolBump },
      initialSqrtPrice: new anchor.BN(priceToSqrtX64(priceAinB, tokenADecimals, tokenBDecimals)),
    };

    const initializePoolAccounts: WhirlpoolInstructions.InitializePoolAccounts = {
      whirlpoolsConfig: config.publicKey,
      tokenMintA: orderedTokenMintA,
      tokenMintB: orderedTokenMintB,
      funder: env.admin.publicKey,
      whirlpool,
      tokenVaultA: tokenAVault.publicKey,
      tokenVaultB: tokenBVault.publicKey,
      feeTier: feeTierPk,
      tokenProgram: TOKEN_PROGRAM_ID,
      systemProgram: anchor.web3.SystemProgram.programId,
      rent: anchor.web3.SYSVAR_RENT_PUBKEY,
    };

    const tx = new Transaction();
    const initializeIx = WhirlpoolInstructions.initializePool(initialisePoolArgs, initializePoolAccounts);
    tx.add(initializeIx);

    const sig = await sendTransactionWithLogs(env.provider.connection, tx, env.admin.publicKey, [
      env.admin,
      tokenAVault,
      tokenBVault,
    ]);
    console.log('InitializePool:', sig);
  }

  {
    const tx = await initTickArrayForTicks(env.admin, whirlpool, range(-300, 300, 40), tickSize, WHIRLPOOL_PROGRAM_ID);

    const sig = await sendTransactionWithLogs(env.provider.connection, tx, env.admin.publicKey, [env.admin]);
    console.log('InitializeTickArray:', sig);
  }

  if (lowerRange && upperRange) {
    const { initTickIx: ix1 } = await kamino.initializeTickForOrcaPool(
      env.admin.publicKey,
      whirlpool,
      new Decimal(lowerRange!)
    );
    const { initTickIx: ix2 } = await kamino.initializeTickForOrcaPool(
      env.admin.publicKey,
      whirlpool,
      new Decimal(upperRange!)
    );

    const tx = new Transaction();
    if (ix1) {
      tx.add(ix1);
    }
    if (ix2) {
      tx.add(ix2);
    }
    const sig = await sendTransactionWithLogs(env.provider.connection, tx, env.admin.publicKey, [env.admin]);
    console.log('InitializeTickForOrcaPool:', sig);
  }

  const pool: DeployedPool = {
    pool: whirlpool,
    tokenMintA: orderedTokenMintA,
    tokenMintB: orderedTokenMintB,
    admin: env.admin.publicKey,
  };

  return pool;
}

async function getWhirlpool(
  programId: PublicKey,
  whirlpoolsConfigKey: PublicKey,
  tokenMintAKey: PublicKey,
  tokenMintBKey: PublicKey,
  tickSpacing: number
): Promise<[anchor.web3.PublicKey, number]> {
  return anchor.web3.PublicKey.findProgramAddress(
    [
      Buffer.from('whirlpool'),
      whirlpoolsConfigKey.toBuffer(),
      tokenMintAKey.toBuffer(),
      tokenMintBKey.toBuffer(),
      new anchor.BN(tickSpacing).toArrayLike(Buffer, 'le', 2),
    ],
    programId
  );
}

export async function initTickArrayForTicks(
  signer: Keypair,
  whirlpool: PublicKey,
  ticks: number[],
  tickSpacing: number,
  programId: PublicKey
): Promise<Transaction> {
  const startTicks = ticks.map((tick) => getStartTickIndex(tick, tickSpacing));
  const tx = new Transaction();
  const initializedArrayTicks: number[] = [];

  startTicks.forEach(async (startTick) => {
    if (initializedArrayTicks.includes(startTick)) {
      return;
    }
    initializedArrayTicks.push(startTick);
    const initIx = await initTickArrayInstruction(signer, whirlpool, startTick, programId);

    tx.add(initIx);
  });
  console.log('Initialized tick array for ticks:', initializedArrayTicks);
  return tx;
}

export async function initTickArrayInstruction(
  signer: Keypair,
  whirlpool: PublicKey,
  startTick: number,
  programId: PublicKey
): Promise<TransactionInstruction> {
  const [tickArrayPda] = await getTickArray(programId, whirlpool, startTick);

  const initTickArrayArgs: WhirlpoolInstructions.InitializeTickArrayArgs = {
    startTickIndex: startTick,
  };
  const initTickArrayAccounts: WhirlpoolInstructions.InitializeTickArrayAccounts = {
    whirlpool,
    funder: signer.publicKey,
    tickArray: tickArrayPda,
    systemProgram: anchor.web3.SystemProgram.programId,
  };
  return WhirlpoolInstructions.initializeTickArray(initTickArrayArgs, initTickArrayAccounts);
}

async function getTickArray(
  programId: PublicKey,
  whirlpoolAddress: PublicKey,
  startTick: number
): Promise<[anchor.web3.PublicKey, number]> {
  return anchor.web3.PublicKey.findProgramAddress(
    [Buffer.from('tick_array'), whirlpoolAddress.toBuffer(), Buffer.from(startTick.toString())],
    programId
  );
}

export async function getTickArrayPubkeysFromRangeOrca(
  connection: Connection,
  whirlpool: PublicKey,
  tickLowerIndex: number,
  tickUpperIndex: number
) {
  const whirlpoolState = await Whirlpool.fetch(connection, whirlpool);
  if (whirlpoolState === null) {
    throw new Error(`Raydium Pool ${whirlpool} doesn't exist`);
  }

  const startTickIndex = getStartTickIndex(tickLowerIndex, whirlpoolState.tickSpacing, 0);
  const endTickIndex = getStartTickIndex(tickUpperIndex, whirlpoolState.tickSpacing, 0);

  const [startTickIndexPk] = await anchor.web3.PublicKey.findProgramAddress(
    [Buffer.from('tick_array'), whirlpool.toBuffer(), Buffer.from(startTickIndex.toString())],
    WHIRLPOOL_PROGRAM_ID
  );
  const [endTickIndexPk] = await anchor.web3.PublicKey.findProgramAddress(
    [Buffer.from('tick_array'), whirlpool.toBuffer(), Buffer.from(endTickIndex.toString())],
    WHIRLPOOL_PROGRAM_ID
  );
  return [startTickIndexPk, endTickIndexPk];
}
