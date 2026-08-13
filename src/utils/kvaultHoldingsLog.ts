import BN from 'bn.js';
import { Address, getAddressDecoder } from '@solana/kit';
import { Fraction } from '../classes/fraction';

export const KVAULT_HOLDINGS_LOG_LAYOUT = {
  maxReserves: 25,
  pubkeyBytes: 32,
  u64Bytes: 8,
  u128Bytes: 16,
  investedReserveBytes: 80,
  holdingsBytes: 2048,
} as const;

const {
  maxReserves: MAX_RESERVES,
  pubkeyBytes: PUBKEY_BYTES,
  u64Bytes: U64_BYTES,
  u128Bytes: U128_BYTES,
  investedReserveBytes: INVESTED_RESERVE_BYTES,
  holdingsBytes: HOLDINGS_BYTES,
} = KVAULT_HOLDINGS_LOG_LAYOUT;
const DEFAULT_PUBLIC_KEY = '11111111111111111111111111111111';

export type DecodedKvaultInvestedReserve = {
  index: number;
  reserve: Address;
  liquidityAmount: Fraction;
  ctokenAmount: BN;
  targetWeight: BN;
  ctokenCapInLiquidity: Fraction;
};

export type DecodedKvaultHoldings = {
  available: BN;
  invested: {
    total: Fraction;
    allocations: DecodedKvaultInvestedReserve[];
  };
  totalSum: Fraction;
};

function readBnLe(data: Buffer, offset: number, byteLength: number): BN {
  return new BN(data.subarray(offset, offset + byteLength), 'le');
}

function decodeFraction(data: Buffer, offset: number): Fraction {
  return new Fraction(readBnLe(data, offset, U128_BYTES));
}

function normalizeHoldingsLogData(encodedLog: string | Uint8Array): Buffer {
  if (typeof encodedLog !== 'string') {
    return Buffer.from(encodedLog);
  }

  const trimmed = encodedLog.trim();
  const programDataPrefix = 'Program data:';
  const encoded = trimmed.startsWith(programDataPrefix)
    ? trimmed.slice(programDataPrefix.length).trim().split(/\s+/)[0]
    : trimmed;

  return Buffer.from(encoded, 'base64');
}

export function decodeKvaultHoldingsLog(encodedLog: string | Uint8Array): DecodedKvaultHoldings {
  const data = normalizeHoldingsLogData(encodedLog);
  if (data.length !== HOLDINGS_BYTES) {
    throw new Error(`Invalid kvault holdings log length ${data.length}; expected ${HOLDINGS_BYTES}`);
  }

  const addressDecoder = getAddressDecoder();
  const available = readBnLe(data, 0, U64_BYTES);
  const investedOffset = U64_BYTES * 2;
  const allocations: DecodedKvaultInvestedReserve[] = [];

  for (let i = 0; i < MAX_RESERVES; i++) {
    const allocationOffset = investedOffset + i * INVESTED_RESERVE_BYTES;
    const reserve = addressDecoder.decode(data.subarray(allocationOffset, allocationOffset + PUBKEY_BYTES));
    if (reserve === DEFAULT_PUBLIC_KEY) {
      continue;
    }

    allocations.push({
      index: i,
      reserve,
      liquidityAmount: decodeFraction(data, allocationOffset + PUBKEY_BYTES),
      ctokenAmount: readBnLe(data, allocationOffset + 48, U64_BYTES),
      targetWeight: readBnLe(data, allocationOffset + 56, U64_BYTES),
      ctokenCapInLiquidity: decodeFraction(data, allocationOffset + 64),
    });
  }

  const investedTotalOffset = investedOffset + MAX_RESERVES * INVESTED_RESERVE_BYTES;
  const totalSumOffset = investedTotalOffset + U128_BYTES;

  return {
    available,
    invested: {
      total: decodeFraction(data, investedTotalOffset),
      allocations,
    },
    totalSum: decodeFraction(data, totalSumOffset),
  };
}

function formatFraction(fraction: Fraction): string {
  return fraction.toDecimal().toString();
}

export function formatKvaultHoldingsLog(encodedLog: string | Uint8Array): string {
  const holdings = decodeKvaultHoldingsLog(encodedLog);
  const allocationLines = holdings.invested.allocations.map(
    (allocation) =>
      `      InvestedReserve { index: ${allocation.index}, reserve: ${
        allocation.reserve
      }, liquidity_amount: ${formatFraction(
        allocation.liquidityAmount
      )}, ctoken_amount: ${allocation.ctokenAmount.toString()}, target_weight: ${allocation.targetWeight.toString()}, ctoken_cap_in_liquidity: ${formatFraction(
        allocation.ctokenCapInLiquidity
      )} }`
  );

  return [
    'Holdings {',
    `  available: ${holdings.available.toString()},`,
    '  invested: {',
    `    total: ${formatFraction(holdings.invested.total)},`,
    '    allocations: [',
    allocationLines.join(',\n'),
    '    ]',
    '  },',
    `  total_sum: ${formatFraction(holdings.totalSum)}`,
    '}',
  ].join('\n');
}

export function printKvaultHoldingsLog(
  encodedLog: string | Uint8Array,
  logger: (message: string) => void = console.log
): string {
  const formatted = formatKvaultHoldingsLog(encodedLog);
  logger(formatted);
  return formatted;
}
