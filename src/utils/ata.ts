import {
  ASSOCIATED_TOKEN_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
  createAssociatedTokenAccountIdempotentInstruction as createAtaIx,
} from '@solana/spl-token';
import { ComputeBudgetProgram, Connection, PublicKey, SystemProgram, TransactionInstruction } from '@solana/web3.js';
import { SOL_MINTS } from '../leverage';
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
  mints: PublicKey[],
  tokenProgramId: PublicKey[]
) => {
  const requests = mints.map((x, index) => createAtaIfMissing(connection, user, x, tokenProgramId[index]));
  const result = await Promise.all(requests);

  const atas = result.map((res) => res.ata);
  const createAtasIxns = result.reduce((sum, item) => {
    sum = sum.concat(item.createIxns);
    return sum;
  }, [] as TransactionInstruction[]);

  const closeAtasIxns: TransactionInstruction[] = result.reduce((sum, item) => {
    sum = sum.concat(item.closeIxns);
    return sum;
  }, [] as TransactionInstruction[]);

  return {
    atas,
    createAtasIxns,
    closeAtasIxns,
  };
};

const createAtaIfMissing = async (
  connection: Connection,
  user: PublicKey,
  mint: PublicKey,
  tokenProgram: PublicKey = TOKEN_PROGRAM_ID
) => {
  const ata = getAssociatedTokenAddress(mint, user, true, tokenProgram);
  const doesAtaExist = Boolean(await getAtaByTokenMint(connection, user, mint));
  const createIxns = !doesAtaExist
    ? createAssociatedTokenAccountIdempotentInstruction(user, mint, user, tokenProgram)[1]
    : [];
  const closeIxns: TransactionInstruction[] = [];
  return {
    ata,
    createIxns,
    closeIxns,
  };
};

export const checkIfAccountExists = async (connection: Connection, account: PublicKey): Promise<boolean> => {
  const acc = await connection.getAccountInfo(account);
  return acc !== null;
};

const getAtaByTokenMint = async (
  connection: Connection,
  user: PublicKey,
  tokenMint: PublicKey,
  tokenProgram: PublicKey = TOKEN_PROGRAM_ID
): Promise<PublicKey | null> => {
  if (tokenMint.equals(SOL_MINTS[0])) {
    return user;
  }

  const ataAddress = getAssociatedTokenAddress(tokenMint, user, true, tokenProgram);
  if (await checkIfAccountExists(connection, ataAddress)) {
    return ataAddress;
  }

  return null;
};

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
  owner: PublicKey
): Promise<Decimal> {
  const tokenAta = await getAssociatedTokenAddress(mint, owner);
  const ataExists = await checkIfAccountExists(connection, tokenAta);

  if (!ataExists) {
    return new Decimal(0);
  } else {
    const tokenData = (await connection.getTokenAccountBalance(tokenAta)).value;
    return new Decimal(tokenData.uiAmountString!);
  }
}
