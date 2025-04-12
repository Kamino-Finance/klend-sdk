import { Connection, PublicKey, SystemProgram, SYSVAR_RENT_PUBKEY, TransactionInstruction } from '@solana/web3.js';
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

export function resolveMetadata(
  kTokenMint: PublicKey,
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
  const symbol = `kV${token.toUpperCase()}`;
  return { name, symbol };
}

export function resolveMetadataUriFromMint(mint: PublicKey): string {
  return `https://api.kamino.finance/kvault-tokens/${mint.toBase58()}/metadata`;
}

export async function getInitializeKVaultSharesMetadataIx(
  connection: Connection,
  vaultAdmin: PublicKey,
  vault: PublicKey,
  sharesMint: PublicKey,
  baseVaultAuthority: PublicKey,
  name: string,
  symbol: string,
  uri: string
): Promise<TransactionInstruction> {
  const [sharesMintMetadata] = getKVaultSharesMetadataPda(sharesMint);

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
    systemProgram: SystemProgram.programId,
    rent: SYSVAR_RENT_PUBKEY,
    metadataProgram: METADATA_PROGRAM_ID,
  };

  const ix = initializeSharesMetadata(args, accounts);
  return ix;
}

export async function getUpdateSharesMetadataIx(
  connection: Connection,
  vaultAdmin: PublicKey,
  vault: PublicKey,
  sharesMint: PublicKey,
  baseVaultAuthority: PublicKey,
  name: string,
  symbol: string,
  uri: string
): Promise<TransactionInstruction> {
  const [sharesMintMetadata] = getKVaultSharesMetadataPda(sharesMint);

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
