import { PROGRAM_ID as RAYDIUM_PROGRAM_ID } from '@kamino-finance/kliquidity-sdk/dist/raydium_client/programId';
import { PoolState } from '@kamino-finance/kliquidity-sdk/dist/raydium_client/accounts';
import * as anchor from '@coral-xyz/anchor';
import { PublicKey, Connection, SystemProgram, Transaction, Keypair } from '@solana/web3.js';
import * as RaydiumInstructions from '@kamino-finance/kliquidity-sdk/dist/raydium_client/instructions';
import { SqrtPriceMath, i32ToBytes, TickUtils } from '@raydium-io/raydium-sdk';
import Decimal from 'decimal.js';
import { BN } from 'bn.js';
import { sendTransactionWithLogs } from '@kamino-finance/kliquidity-sdk';
import { TOKEN_PROGRAM_ID } from '@solana/spl-token';
import { accountExist, DeployedPool, orderMints } from './utils';
import { Env } from '../setup_utils';

export const OBSERVATION_STATE_LEN = 52121;
export const AMM_CONFIG_SEED = Buffer.from(anchor.utils.bytes.utf8.encode('amm_config'));
export const POOL_SEED = Buffer.from(anchor.utils.bytes.utf8.encode('pool'));
export const POOL_VAULT_SEED = Buffer.from(anchor.utils.bytes.utf8.encode('pool_vault'));

export async function initializeRaydiumPool(
  env: Env,
  tickSize: number,
  tokenMintA: PublicKey,
  tokenMintB: PublicKey,
  configAcc?: PublicKey,
  observationAcc?: PublicKey,
  initialPrice: number = 1.0
): Promise<DeployedPool> {
  let config;
  if (configAcc) {
    config = configAcc;
  } else {
    const [configPk] = await getAmmConfigAddress(0, RAYDIUM_PROGRAM_ID);
    if (!(await accountExist(env.provider.connection, configPk))) {
      await createAmmConfig(env, configPk, 0, tickSize, 100, 200, 400);
    }

    config = configPk;
  }

  let observation;
  if (observationAcc) {
    observation = observationAcc;
  } else {
    const observationPk = new Keypair();
    observation = observationPk.publicKey;
    {
      const createObvIx = SystemProgram.createAccount({
        fromPubkey: env.admin.publicKey,
        newAccountPubkey: observationPk.publicKey,
        lamports: await env.provider.connection.getMinimumBalanceForRentExemption(OBSERVATION_STATE_LEN),
        space: OBSERVATION_STATE_LEN,
        programId: RAYDIUM_PROGRAM_ID,
      });

      const tx = new Transaction();
      const { blockhash } = await env.provider.connection.getLatestBlockhash();
      tx.recentBlockhash = blockhash;
      tx.add(createObvIx);

      const txHash = await sendTransactionWithLogs(env.provider.connection, tx, env.admin.publicKey, [
        env.admin,
        observationPk,
      ]);
      console.log('Initialize Observer:', txHash);
    }
  }

  const sqrtPriceX64InitialPrice = SqrtPriceMath.priceToSqrtPriceX64(new Decimal(initialPrice), 6, 6);

  const tokens = orderMints(tokenMintA, tokenMintB);
  const orderedTokenMintA = tokens[0];
  const orderedTokenMintB = tokens[1];

  const [poolAddress] = await getPoolAddress(config, orderedTokenMintA, orderedTokenMintB, RAYDIUM_PROGRAM_ID);

  const [tokenAVault] = await getPoolVaultAddress(poolAddress, orderedTokenMintA, RAYDIUM_PROGRAM_ID);
  const [tokenBVault] = await getPoolVaultAddress(poolAddress, orderedTokenMintB, RAYDIUM_PROGRAM_ID);

  {
    const createPoolArgs: RaydiumInstructions.CreatePoolArgs = {
      sqrtPriceX64: sqrtPriceX64InitialPrice,
      openTime: new BN(1684953391), // not relevant, it has to be a timestamp < current timestamp
    };
    const createPoolAccounts: RaydiumInstructions.CreatePoolAccounts = {
      poolCreator: env.admin.publicKey,
      ammConfig: config,
      poolState: poolAddress,
      tokenMint0: orderedTokenMintA,
      tokenMint1: orderedTokenMintB,
      tokenVault0: tokenAVault,
      tokenVault1: tokenBVault,
      observationState: observation,
      tokenProgram: TOKEN_PROGRAM_ID,
      systemProgram: anchor.web3.SystemProgram.programId,
      rent: anchor.web3.SYSVAR_RENT_PUBKEY,
    };

    const tx = new Transaction();
    const initializeTx = RaydiumInstructions.createPool(createPoolArgs, createPoolAccounts);
    tx.add(initializeTx);

    const sig = await sendTransactionWithLogs(env.provider.connection, tx, env.admin.publicKey, [env.admin]);
    console.log('Initialize Raydium pool: ', sig);
  }

  const deployedPool: DeployedPool = {
    pool: poolAddress,
    tokenMintA: orderedTokenMintA,
    tokenMintB: orderedTokenMintB,
    admin: env.admin.publicKey,
  };
  return deployedPool;
}

export async function getAmmConfigAddress(index: number, programId: PublicKey): Promise<[PublicKey, number]> {
  const [address, bump] = await PublicKey.findProgramAddress([AMM_CONFIG_SEED, u16ToBytes(index)], programId);
  console.log('config address ', address.toString());
  return [address, bump];
}

export function u16ToBytes(num: number) {
  const arr = new ArrayBuffer(2);
  const view = new DataView(arr);
  view.setUint16(0, num, false);
  return new Uint8Array(arr);
}

async function createAmmConfig(
  env: Env,
  config: PublicKey,
  index: number,
  tickSpacing: number,
  tradeFeeRate: number,
  protocolFeeRate: number,
  fundFeeRate: number
) {
  const initConfigArgs: RaydiumInstructions.CreateAmmConfigArgs = {
    index,
    tickSpacing,
    tradeFeeRate,
    protocolFeeRate,
    fundFeeRate,
  };
  const initConfigAccounts: RaydiumInstructions.CreateAmmConfigAccounts = {
    owner: env.admin.publicKey,
    ammConfig: config,
    systemProgram: anchor.web3.SystemProgram.programId,
  };

  const tx = new Transaction();
  const initializeTx = RaydiumInstructions.createAmmConfig(initConfigArgs, initConfigAccounts);
  const { blockhash } = await env.provider.connection.getLatestBlockhash();
  tx.recentBlockhash = blockhash;
  tx.feePayer = env.admin.publicKey;
  tx.add(initializeTx);

  const sig = await sendTransactionWithLogs(env.provider.connection, tx, env.admin.publicKey, [env.admin]);
  console.log('InitializeConfig:', sig);
}

export async function getPoolAddress(
  ammConfig: PublicKey,
  tokenMint0: PublicKey,
  tokenMint1: PublicKey,
  programId: PublicKey
): Promise<[PublicKey, number]> {
  const [address, bump] = PublicKey.findProgramAddressSync(
    [POOL_SEED, ammConfig.toBuffer(), tokenMint0.toBuffer(), tokenMint1.toBuffer()],
    programId
  );
  return [address, bump];
}

export async function getPoolVaultAddress(
  pool: PublicKey,
  vaultTokenMint: PublicKey,
  programId: PublicKey
): Promise<[PublicKey, number]> {
  const [address, bump] = PublicKey.findProgramAddressSync(
    [POOL_VAULT_SEED, pool.toBuffer(), vaultTokenMint.toBuffer()],
    programId
  );
  return [address, bump];
}

export async function getTickArrayPubkeysFromRangeRaydium(
  connection: Connection,
  pool: PublicKey,
  tickLowerIndex: number,
  tickUpperIndex: number
) {
  const poolState = await PoolState.fetch(connection, pool);
  if (poolState === null) {
    throw new Error(`Error fetching ${poolState}`);
  }

  const startTickIndex = TickUtils.getTickArrayStartIndexByTick(tickLowerIndex, poolState.tickSpacing);
  const endTickIndex = TickUtils.getTickArrayStartIndexByTick(tickUpperIndex, poolState.tickSpacing);

  const [startTickIndexPk] = await anchor.web3.PublicKey.findProgramAddress(
    [Buffer.from('tick_array'), pool.toBuffer(), i32ToBytes(startTickIndex)],
    RAYDIUM_PROGRAM_ID
  );
  const [endTickIndexPk] = await anchor.web3.PublicKey.findProgramAddress(
    [Buffer.from('tick_array'), pool.toBuffer(), i32ToBytes(endTickIndex)],
    RAYDIUM_PROGRAM_ID
  );

  return [startTickIndexPk, endTickIndexPk];
}
