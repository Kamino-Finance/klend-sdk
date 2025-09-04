import { maybeGetStakedPoolByMint } from './standardStakePool';
import { StakePool as StandardStakePool } from '@solana/spl-stake-pool';
import { Address, GetProgramAccountsApi, Rpc } from '@solana/kit';

// Expand this type to represent all supported stake pool implementations
export type GenericStakePool = StandardStakePool;
export enum StakePoolType {
  Standard,
}

export async function mapStakedSolMintToPool(
  rpc: Rpc<GetProgramAccountsApi>,
  mint: Address
): Promise<[GenericStakePool, Address, StakePoolType]> {
  // We cannot know which pool the mint corresponds to, so we fetch them program by program
  const maybeStandardPoolAndKey = await maybeGetStakedPoolByMint(rpc, mint);
  if (maybeStandardPoolAndKey) {
    return [...maybeStandardPoolAndKey, StakePoolType.Standard];
  }
  throw new Error(`Cannot map mint ${mint} to staked sol pool`);
}
