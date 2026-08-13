import Decimal from 'decimal.js';
import { address, Address } from '@solana/kit';

type CliValue = string | true;

export type ParsedArgs = Record<string, CliValue>;

export function parseArgs(argv: string[] = process.argv.slice(2)): ParsedArgs {
  const parsed: ParsedArgs = {};

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (!arg.startsWith('--')) {
      continue;
    }

    const eqIndex = arg.indexOf('=');
    if (eqIndex >= 0) {
      const key = arg.slice(2, eqIndex);
      parsed[key] = arg.slice(eqIndex + 1);
      continue;
    }

    const key = arg.slice(2);
    const next = argv[i + 1];
    if (next && !next.startsWith('--')) {
      parsed[key] = next;
      i++;
    } else {
      parsed[key] = true;
    }
  }

  return parsed;
}

export function hasFlag(args: ParsedArgs, name: string): boolean {
  return args[name] === true || args[name] === 'true';
}

export function getStringArg(args: ParsedArgs, name: string): string | undefined {
  const value = args[name];
  if (value === undefined || value === true) {
    return undefined;
  }
  return value;
}

export function requireStringArg(args: ParsedArgs, name: string): string {
  const value = getStringArg(args, name);
  if (!value) {
    throw new Error(`Missing required argument --${name}`);
  }
  return value;
}

export function getAddressArg(args: ParsedArgs, name: string): Address | undefined {
  const value = getStringArg(args, name);
  return value ? address(value) : undefined;
}

export function requireAddressArg(args: ParsedArgs, name: string): Address {
  return address(requireStringArg(args, name));
}

export function getDecimalArg(args: ParsedArgs, name: string): Decimal | undefined {
  const value = getStringArg(args, name);
  return value ? new Decimal(value) : undefined;
}

export function requireDecimalArg(args: ParsedArgs, name: string): Decimal {
  return new Decimal(requireStringArg(args, name));
}

export function getNumberArg(args: ParsedArgs, name: string, fallback: number): number {
  const value = getStringArg(args, name);
  return value ? Number(value) : fallback;
}

export function getAddressListArg(args: ParsedArgs, name: string): Address[] {
  const value = getStringArg(args, name);
  if (!value) {
    return [];
  }
  return value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)
    .map((item) => address(item));
}

export function resolveRpcUrl(args: ParsedArgs): string {
  const rpc = getStringArg(args, 'rpc') ?? process.env.RPC ?? process.env.RPC_ENDPOINT;
  if (!rpc) {
    throw new Error('Missing RPC URL. Pass --rpc or set RPC/RPC_ENDPOINT.');
  }
  return rpc;
}

export function resolveKeypairPath(args: ParsedArgs): string {
  const keypair = getStringArg(args, 'keypair') ?? process.env.KEYPAIR_FILE;
  if (!keypair) {
    throw new Error('Missing keypair path. Pass --keypair or set KEYPAIR_FILE.');
  }
  return keypair;
}

export function maybePrintHelp(args: ParsedArgs, usage: string): void {
  if (hasFlag(args, 'help') || hasFlag(args, 'h')) {
    console.log(usage.trim());
    process.exit(0);
  }
}
