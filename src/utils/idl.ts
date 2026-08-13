import { Idl } from '@coral-xyz/anchor';
import rawIdl from '../idl/klend.json';
import rawKVaultIdl from '../idl/kvault.json';

export const idl: Idl = rawIdl as Idl;
export const kvaultIdl: Idl = rawKVaultIdl as Idl;
