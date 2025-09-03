import { Address, Instruction } from '@solana/kit';

export async function getAccountsFromIxs(ixs: Instruction[]): Promise<Address[]> {
  return [
    ...new Set<Address>(
      ixs
        .map((ix) => ix.accounts || [])
        .flat()
        .map((key) => key.address)
    ),
  ];
}
