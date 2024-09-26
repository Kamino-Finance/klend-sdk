import { Kamino } from '@kamino-finance/kliquidity-sdk';
import { getMint } from '@solana/spl-token';
import { PublicKey } from '@solana/web3.js';

export async function isKtoken(mintKey: PublicKey, kamino: Kamino): Promise<boolean> {
  const [expectedMintAuthority] = PublicKey.findProgramAddressSync(
    [Buffer.from('authority'), mintKey.toBuffer()],
    kamino.getProgramID()
  );
  const mint = await getMint(kamino.getConnection(), mintKey);
  return mint.mintAuthority !== null && mint.mintAuthority.equals(expectedMintAuthority);
}
