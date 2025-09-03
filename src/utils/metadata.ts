import {
  getKVaultSharesMetadataPda,
  initializeSharesMetadata,
  InitializeSharesMetadataAccounts,
  InitializeSharesMetadataArgs,
  METADATA_PROGRAM_ID,
  updateSharesMetadata,
  UpdateSharesMetadataAccounts,
  UpdateSharesMetadataArgs,
} from '../lib';
import { Address, Instruction, TransactionSigner } from '@solana/kit';
import { SYSTEM_PROGRAM_ADDRESS } from '@solana-program/system';
import { SYSVAR_RENT_ADDRESS } from '@solana/sysvars';

export function resolveMetadata(
  kTokenMint: Address,
  extra: string,
  inputToken?: string,
  inputName?: string,
  inputSymbol?: string,
  inputUri?: string
): { name: string; symbol: string; uri: string } {
  let name;
  let symbol;
  if (inputToken) {
    const { name: resolvedName, symbol: resolvedSymbol } = resolveMetadataFromToken(inputToken, extra);
    name = inputName ?? resolvedName;
    symbol = inputSymbol ?? resolvedSymbol;
  } else {
    if (!inputSymbol) {
      throw Error('Symbol required');
    }
    if (!inputName) {
      throw Error('Name required');
    }
    name = inputName;
    symbol = inputSymbol;
  }
  const uri = inputUri ?? resolveMetadataUriFromMint(kTokenMint);

  return { name, symbol, uri };
}

export function resolveMetadataFromToken(token: string, extra: string): { name: string; symbol: string } {
  console.log('token', token);
  console.log('extra', extra);
  const name = `kVault ${token} ${extra}`;
  const symbol = `kV-${token.toUpperCase()}`;
  return { name, symbol };
}

export function resolveMetadataUriFromMint(mint: Address): string {
  return `https://api.kamino.finance/kvault-tokens/${mint}/metadata`;
}

export async function getInitializeKVaultSharesMetadataIx(
  vaultAdmin: TransactionSigner,
  vault: Address,
  sharesMint: Address,
  baseVaultAuthority: Address,
  name: string,
  symbol: string,
  uri: string
): Promise<Instruction> {
  const [sharesMintMetadata] = await getKVaultSharesMetadataPda(sharesMint);

  const args: InitializeSharesMetadataArgs = {
    name,
    symbol,
    uri,
  };

  const accounts: InitializeSharesMetadataAccounts = {
    vaultAdminAuthority: vaultAdmin,
    vaultState: vault,
    sharesMint,
    baseVaultAuthority,
    sharesMetadata: sharesMintMetadata,
    systemProgram: SYSTEM_PROGRAM_ADDRESS,
    rent: SYSVAR_RENT_ADDRESS,
    metadataProgram: METADATA_PROGRAM_ID,
  };

  const ix = initializeSharesMetadata(args, accounts);
  return ix;
}

export async function getUpdateSharesMetadataIx(
  vaultAdmin: TransactionSigner,
  vault: Address,
  sharesMint: Address,
  baseVaultAuthority: Address,
  name: string,
  symbol: string,
  uri: string
): Promise<Instruction> {
  const [sharesMintMetadata] = await getKVaultSharesMetadataPda(sharesMint);

  const args: UpdateSharesMetadataArgs = {
    name,
    symbol,
    uri,
  };

  const accounts: UpdateSharesMetadataAccounts = {
    vaultAdminAuthority: vaultAdmin,
    vaultState: vault,
    baseVaultAuthority,
    sharesMetadata: sharesMintMetadata,
    metadataProgram: METADATA_PROGRAM_ID,
  };

  const ix = updateSharesMetadata(args, accounts);
  return ix;
}
