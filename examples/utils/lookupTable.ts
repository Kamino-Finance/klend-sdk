import { Address, IInstruction } from '@solana/kit';

export async function getAccountsFromIxs(ixs: IInstruction[]): Promise<Address[]> {
  return [
    ...new Set<Address>(
      ixs
        .map((ix) => ix.accounts || [])
        .flat()
        .map((key) => key.address)
    ),
  ];
}
