import { Kamino } from '@kamino-finance/kliquidity-sdk';
import { Address, getAddressEncoder, getProgramDerivedAddress, isSome } from '@solana/kit';
import { fetchMint } from '@solana-program/token-2022';
import { Buffer } from 'buffer';

const addressEncoder = getAddressEncoder();

export async function isKtoken(mint: Address, kamino: Kamino): Promise<boolean> {
  const [expectedMintAuthority] = await getProgramDerivedAddress({
    seeds: [Buffer.from('authority'), addressEncoder.encode(mint)],
    programAddress: kamino.getProgramID(),
  });
  const mintState = await fetchMint(kamino.getConnection(), mint);
  return isSome(mintState.data.mintAuthority) && mintState.data.mintAuthority.value === expectedMintAuthority;
}
