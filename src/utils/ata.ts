import {
  ASSOCIATED_TOKEN_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
  createAssociatedTokenAccountIdempotentInstruction as createAtaIx,
} from '@solana/spl-token';
import { ComputeBudgetProgram, Connection, PublicKey, SystemProgram, TransactionInstruction } from '@solana/web3.js';
import Decimal from 'decimal.js';
import { AnchorProvider } from '@coral-xyz/anchor';

/**
 * Create an idempotent create ATA instruction
 * Overrides the create ATA ix to use the idempotent version as the spl-token library does not provide this ix yet
 * @param owner - owner of the ATA
 * @param mint - mint of the ATA
 * @param payer - payer of the transaction
 * @param tokenProgram - optional token program address - spl-token if not provided
 * @param ata - optional ata address - derived if not provided
 * @returns The ATA address public key and the transaction instruction
 */
export function createAssociatedTokenAccountIdempotentInstruction(
  owner: PublicKey,
  mint: PublicKey,
  payer: PublicKey = owner,
  tokenProgram: PublicKey = TOKEN_PROGRAM_ID,
  ata?: PublicKey
): [PublicKey, TransactionInstruction] {
  let ataAddress = ata;
  if (!ataAddress) {
    ataAddress = getAssociatedTokenAddress(mint, owner, true, tokenProgram, ASSOCIATED_TOKEN_PROGRAM_ID);
  }
  const createUserTokenAccountIx = createAtaIx(
    payer,
    ataAddress,
    owner,
    mint,
    tokenProgram,
    ASSOCIATED_TOKEN_PROGRAM_ID
  );
  return [ataAddress, createUserTokenAccountIx];
}

export function getAssociatedTokenAddress(
  mint: PublicKey,
  owner: PublicKey,
  allowOwnerOffCurve = true,
  programId = TOKEN_PROGRAM_ID,
  associatedTokenProgramId = ASSOCIATED_TOKEN_PROGRAM_ID
): PublicKey {
  if (!allowOwnerOffCurve && !PublicKey.isOnCurve(owner.toBuffer())) throw new Error('Token owner off curve');

  const [address] = PublicKey.findProgramAddressSync(
    [owner.toBuffer(), programId.toBuffer(), mint.toBuffer()],
    associatedTokenProgramId
  );

  return address;
}

export const getAtasWithCreateIxnsIfMissing = async (
  connection: Connection,
  user: PublicKey,
  mints: Array<{ mint: PublicKey; tokenProgram: PublicKey }>
): Promise<{ atas: PublicKey[]; createAtaIxs: TransactionInstruction[] }> => {
  const atas: Array<PublicKey> = mints.map((x) => getAssociatedTokenAddress(x.mint, user, true, x.tokenProgram));
  const accountInfos = await connection.getMultipleAccountsInfo(atas);
  const createAtaIxs: TransactionInstruction[] = [];
  for (let i = 0; i < atas.length; i++) {
    if (!accountInfos[i]) {
      const { mint, tokenProgram } = mints[i];
      const [ata, createIxn] = createAssociatedTokenAccountIdempotentInstruction(user, mint, user, tokenProgram);
      atas[i] = ata;
      createAtaIxs.push(createIxn);
    }
  }
  return {
    atas,
    createAtaIxs,
  };
};

export function createAtasIdempotent(
  user: PublicKey,
  mints: Array<{ mint: PublicKey; tokenProgram: PublicKey }>
): Array<{ ata: PublicKey; createAtaIx: TransactionInstruction }> {
  const res: Array<{ ata: PublicKey; createAtaIx: TransactionInstruction }> = [];
  for (const mint of mints) {
    const [ata, createAtaIx] = createAssociatedTokenAccountIdempotentInstruction(
      user,
      mint.mint,
      user,
      mint.tokenProgram
    );
    res.push({
      ata,
      createAtaIx,
    });
  }
  return res;
}

export function getDepositWsolIxns(owner: PublicKey, ata: PublicKey, amountLamports: Decimal) {
  const ixns: TransactionInstruction[] = [];

  ixns.push(
    SystemProgram.transfer({
      fromPubkey: owner,
      toPubkey: ata,
      lamports: amountLamports.toNumber(),
    })
  );

  ixns.push(
    new TransactionInstruction({
      keys: [
        {
          pubkey: ata,
          isSigner: false,
          isWritable: true,
        },
      ],
      data: Buffer.from(new Uint8Array([17])),
      programId: TOKEN_PROGRAM_ID,
    })
  );

  return ixns;
}

export function removeBudgetAndAtaIxns(ixns: TransactionInstruction[], mints: string[]): TransactionInstruction[] {
  return ixns.filter((ixn) => {
    const { programId, keys } = ixn;

    if (programId.equals(ComputeBudgetProgram.programId)) {
      return false;
    }

    if (programId.equals(ASSOCIATED_TOKEN_PROGRAM_ID)) {
      const mint = keys[3];

      return !mints.includes(mint.pubkey.toString());
    }

    return true;
  });
}

export async function getTokenAccountBalance(provider: AnchorProvider, tokenAccount: PublicKey): Promise<number> {
  const tokenAccountBalance = await provider.connection.getTokenAccountBalance(tokenAccount);

  return Number(tokenAccountBalance.value.amount).valueOf();
}

export async function getTokenAccountBalanceDecimal(
  connection: Connection,
  mint: PublicKey,
  owner: PublicKey,
  tokenProgram: PublicKey = TOKEN_PROGRAM_ID,
): Promise<Decimal> {
  const ata = getAssociatedTokenAddress(mint, owner, true, tokenProgram);
  const accInfo = await connection.getAccountInfo(ata);
  if (accInfo === null) {
    return new Decimal('0');
  }
  const { value } = await connection.getTokenAccountBalance(ata);
  return new Decimal(value.uiAmountString!);
}
