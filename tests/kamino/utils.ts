import { TextEncoder } from 'util';
import { Connection, Keypair, PublicKey, sendAndConfirmTransaction, Transaction } from '@solana/web3.js';
import * as anchor from '@coral-xyz/anchor';
import {
  StrategyConfigOptionKind,
  UpdateCollateralInfoModeKind,
} from '@hubbleprotocol/kamino-sdk/dist/kamino-client/types';
import * as KaminoInstructions from '@hubbleprotocol/kamino-sdk/dist/kamino-client/instructions';
import { getMint } from '@solana/spl-token';

import Decimal from 'decimal.js';
import {
  CollateralInfos,
  GlobalConfig,
  WhirlpoolStrategy,
} from '@hubbleprotocol/kamino-sdk/dist/kamino-client/accounts';
import { Dex, getUpdateStrategyConfigIx, sendTransactionWithLogs, TOKEN_PROGRAM_ID } from '@hubbleprotocol/kamino-sdk';
import { U16_MAX } from '@hubbleprotocol/scope-sdk';
import { CollateralToken, collateralTokenToNumber } from './token-utils';
import { Env } from '../setup_utils';

// Seconds
export const DEFAULT_MAX_PRICE_AGE = 60 * 3;

export async function accountExist(connection: anchor.web3.Connection, account: anchor.web3.PublicKey) {
  const info = await connection.getAccountInfo(account);
  return !(info === null || info.data.length === 0);
}

export function range(start: number, end: number, step: number): number[] {
  let doStep = step;
  if (end === start || doStep === 0) {
    return [start];
  }
  if (doStep < 0) {
    doStep = -doStep;
  }

  const stepNumOfDecimal = doStep.toString().split('.')[1]?.length || 0;
  const endNumOfDecimal = end.toString().split('.')[1]?.length || 0;
  const maxNumOfDecimal = Math.max(stepNumOfDecimal, endNumOfDecimal);
  const power = 10 ** maxNumOfDecimal;
  const diff = Math.abs(end - start);
  const count = Math.trunc(diff / doStep + 1);
  doStep = end - start > 0 ? doStep : -doStep;

  const intStart = Math.trunc(start * power);
  return Array.from(Array(count).keys()).map((x) => {
    const increment = Math.trunc(x * doStep * power);
    const value = intStart + increment;
    return Math.trunc(value) / power;
  });
}

export async function updateStrategyConfig(
  env: Env,
  strategy: PublicKey,
  mode: StrategyConfigOptionKind,
  amount: Decimal,
  newAccount: PublicKey = PublicKey.default
) {
  const { connection } = env.provider;
  const signer = env.admin;
  const strategyState = await WhirlpoolStrategy.fetch(connection, strategy);
  if (strategyState === null) {
    throw new Error(`strategy ${strategy} doesn't exist`);
  }

  const updateCapIx = await getUpdateStrategyConfigIx(
    signer.publicKey,
    strategyState.globalConfig,
    strategy,
    mode,
    amount,
    newAccount
  );

  const tx = new Transaction();
  tx.add(updateCapIx);

  const sig = await sendTransactionWithLogs(connection, tx, signer.publicKey, [signer]);
  console.log('Update Strategy Config ', mode.toJSON(), sig?.toString());
}

export function orderMints(mintX: PublicKey, mintY: PublicKey): [PublicKey, PublicKey] {
  let mintA;
  let mintB;
  if (Buffer.compare(mintX.toBuffer(), mintY.toBuffer()) < 0) {
    mintA = mintX;
    mintB = mintY;
  } else {
    mintA = mintY;
    mintB = mintX;
  }

  return [mintA, mintB];
}

export type DeployedPool = {
  pool: PublicKey;
  tokenMintA: PublicKey;
  tokenMintB: PublicKey;
  admin: PublicKey;
};

export function getCollInfoEncodedName(token: string): Uint8Array {
  const maxArray = new Uint8Array(32);
  const s: Uint8Array = new TextEncoder().encode(token);
  maxArray.set(s);
  return maxArray;
}

export async function updateCollateralInfo(
  connection: Connection,
  signer: Keypair,
  globalConfig: PublicKey,
  collateralToken: CollateralToken | number,
  mode: UpdateCollateralInfoModeKind,
  value: bigint | PublicKey | Uint16Array | Uint8Array | number[]
) {
  const config: GlobalConfig | null = await GlobalConfig.fetch(connection, globalConfig);
  if (config === null) {
    throw new Error('Global config not found');
  }

  let collateralNumber: number;
  if (typeof collateralToken === 'number') {
    collateralNumber = collateralToken;
  } else {
    const collInfos = await CollateralInfos.fetch(connection, new PublicKey(config.tokenInfos));
    if (collInfos === null) {
      throw new Error('CollateralInfos config not found');
    }

    collateralNumber = collateralTokenToNumber(collateralToken);
  }
  const argValue = toCollateralInfoValue(value);

  console.log(
    'UpdateCollateralInfo',
    mode.toJSON(),
    `for ${collateralToken} with value ${value} encoded as ${argValue}`
  );

  const args: KaminoInstructions.UpdateCollateralInfoArgs = {
    index: new anchor.BN(collateralNumber),
    mode: new anchor.BN(mode.discriminator),
    value: argValue,
  };

  const accounts: KaminoInstructions.UpdateCollateralInfoAccounts = {
    adminAuthority: config.adminAuthority,
    globalConfig,
    tokenInfos: config.tokenInfos,
  };

  const tx = new Transaction();
  const ix = KaminoInstructions.updateCollateralInfo(args, accounts);
  const { blockhash } = await connection.getLatestBlockhash();
  tx.recentBlockhash = blockhash;
  tx.feePayer = config.adminAuthority;
  tx.add(ix);

  const sig = await sendAndConfirmTransaction(connection, tx, [signer]);
  console.log(`Update Collateral Info txn: ${sig.toString()}`);
}

export function toCollateralInfoValue(value: bigint | PublicKey | Uint16Array | Uint8Array | number[]): number[] {
  let buffer: Buffer;
  if (typeof value === 'bigint') {
    buffer = Buffer.alloc(32);
    buffer.writeBigUInt64LE(value); // Because we send 32 bytes and a u64 has 8 bytes, we write it in LE
  } else if (value.constructor === Uint16Array) {
    buffer = Buffer.alloc(32);
    const val = u16ArrayToU8Array(value);
    for (let i = 0; i < val.length; i++) {
      buffer[i] = value[i];
    }
  } else if (value.constructor === Uint8Array) {
    buffer = Buffer.alloc(32);
    for (let i = 0; i < value.length; i++) {
      buffer[i] = value[i];
    }
  } else if (value.constructor.name === 'PublicKey') {
    buffer = (value as PublicKey).toBuffer(); // PublicKey, the previous if statement wasn't seeing value as an instance of PublicKey anymore (?)
  } else if (Array.isArray(value)) {
    // scope chains
    const padded = value.concat(Array(4 - value.length).fill(U16_MAX));
    buffer = Buffer.alloc(32);
    for (let i = 0; i < padded.length; i++) {
      buffer.writeUInt16LE(padded[i], i * 2);
    }
  } else {
    throw new Error(`Bad type ${value}`);
  }
  return [...buffer];
}

export function u16ArrayToU8Array(x: Uint16Array): Uint8Array {
  const arr: number[] = [];
  // eslint-disable-next-line no-restricted-syntax
  for (const v of x) {
    const buffer = Buffer.alloc(2);
    buffer.writeUInt16LE(v);
    const bytes = Array.from(buffer);
    arr.push(...(bytes as number[]));
  }

  const uint8array = new Uint8Array(arr.flat());
  return uint8array;
}

export function getCollInfoEncodedChain(token: number): Uint8Array {
  const u16MAX = 65535;
  const chain = [token, u16MAX, u16MAX, u16MAX];

  const encodedChain = u16ArrayToU8Array(Uint16Array.from(chain));
  return encodedChain;
}

export function isKToken(symbol: string): boolean {
  return symbol.startsWith('k');
}

export function getKTokenSymbols(symbol: string): [Dex, string, string] {
  if (!isKToken(symbol)) {
    throw new Error(`Not a kToken ${symbol} (no k). Expected format kSTSOL-SOL (Orca)`);
  }
  const dexRegex = /.+\((\w+)\)$/;
  const dexMatch = dexRegex.exec(symbol);
  if (dexMatch === null) {
    throw new Error(`Not a kToken ${symbol} (no dex). Expected format kSTSOL-SOL (Orca)`);
  }
  const dex = dexMatch[1].toUpperCase() as Dex;
  const pair = symbol
    .replace(/^k/, '')
    .replace(/\s\(\w+\)$/, '')
    .split('-');
  if (pair.length !== 2) {
    throw new Error(`Not a kToken ${symbol}. Expected format kSTSOL-SOL (Orca)`);
  }
  return [dex, pair[0], pair[1]];
}

export type AssetQuantityTuple = [string, string];

export async function getMintDecimals(env: Env, mint: PublicKey): Promise<number> {
  return (await getMint(env.provider.connection, mint, env.provider.connection.commitment, TOKEN_PROGRAM_ID)).decimals;
}
