import {
  ASSOCIATED_TOKEN_PROGRAM_ID,
  NATIVE_MINT,
  TOKEN_PROGRAM_ID,
  createAssociatedTokenAccountInstruction,
  createAssociatedTokenAccountIdempotentInstruction as createAtaIx,
  createCloseAccountInstruction,
  getAssociatedTokenAddressSync,
} from '@solana/spl-token';
import {
  AccountInfo,
  ComputeBudgetProgram,
  Connection,
  PublicKey,
  SystemProgram,
  TransactionInstruction,
} from '@solana/web3.js';
import Decimal from 'decimal.js';
import { collToLamportsDecimal, DECIMALS_SOL } from '@kamino-finance/kliquidity-sdk/dist';

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

export function getTransferWsolIxns(owner: PublicKey, ata: PublicKey, amountLamports: Decimal) {
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

export async function getTokenAccountBalance(connection: Connection, tokenAccount: PublicKey): Promise<number> {
  const tokenAccountBalance = await connection.getTokenAccountBalance(tokenAccount);

  return Number(tokenAccountBalance.value.amount).valueOf();
}

/// Get the balance of a token account in decimal format (tokens, not lamports)
export async function getTokenAccountBalanceDecimal(
  connection: Connection,
  mint: PublicKey,
  owner: PublicKey,
  tokenProgram: PublicKey = TOKEN_PROGRAM_ID
): Promise<Decimal> {
  const ata = getAssociatedTokenAddress(mint, owner, true, tokenProgram);
  const accInfo = await connection.getAccountInfo(ata);
  if (accInfo === null) {
    return new Decimal('0');
  }
  const { value } = await connection.getTokenAccountBalance(ata);
  return new Decimal(value.uiAmountString!);
}

export type CreateWsolAtaIxs = {
  wsolAta: PublicKey;
  createAtaIxs: TransactionInstruction[];
  closeAtaIxs: TransactionInstruction[];
};

/**
 * Creates a wSOL ata if missing and syncs the balance. If the ata exists and it has more or equal no wrapping happens
 * @param connection - Solana RPC connection (read)
 * @param amount min amount to have in the wSOL ata. If the ata exists and it has more or equal no wrapping happens
 * @param owner - owner of the ata
 * @returns wsolAta: the keypair of the ata, used to sign the initialization transaction; createAtaIxs: a list with ixs to initialize the ata and wrap SOL if needed; closeAtaIxs: a list with ixs to close the ata
 */
export const createWsolAtaIfMissing = async (
  connection: Connection,
  amount: Decimal,
  owner: PublicKey
): Promise<CreateWsolAtaIxs> => {
  const createIxns: TransactionInstruction[] = [];
  const closeIxns: TransactionInstruction[] = [];

  const wsolAta: PublicKey = getAssociatedTokenAddressSync(NATIVE_MINT, owner, true, TOKEN_PROGRAM_ID);

  const solDeposit = amount;
  const wsolAtaAccountInfo: AccountInfo<Buffer> | null = await connection.getAccountInfo(wsolAta);

  // This checks if we need to create it
  if (isWsolInfoInvalid(wsolAtaAccountInfo)) {
    createIxns.push(createAssociatedTokenAccountInstruction(owner, wsolAta, owner, NATIVE_MINT, TOKEN_PROGRAM_ID));
  }

  let wsolExistingBalanceLamports = new Decimal(0);
  try {
    if (wsolAtaAccountInfo != null) {
      const uiAmount = (await getTokenAccountBalanceDecimal(connection, NATIVE_MINT, owner)).toNumber();
      wsolExistingBalanceLamports = collToLamportsDecimal(new Decimal(uiAmount), DECIMALS_SOL);
    }
  } catch (err) {
    console.log('Err Token Balance', err);
  }

  if (solDeposit !== null && solDeposit.gt(wsolExistingBalanceLamports)) {
    createIxns.push(
      SystemProgram.transfer({
        fromPubkey: owner,
        toPubkey: wsolAta,
        lamports: BigInt(solDeposit.sub(wsolExistingBalanceLamports).floor().toString()),
      })
    );
  }

  if (createIxns.length > 0) {
    // Primitive way of wrapping SOL
    createIxns.push(
      new TransactionInstruction({
        keys: [
          {
            pubkey: wsolAta,
            isSigner: false,
            isWritable: true,
          },
        ],
        data: Buffer.from(new Uint8Array([17])),
        programId: TOKEN_PROGRAM_ID,
      })
    );
  }

  closeIxns.push(createCloseAccountInstruction(wsolAta, owner, owner, [], TOKEN_PROGRAM_ID));

  return {
    wsolAta,
    createAtaIxs: createIxns,
    closeAtaIxs: closeIxns,
  };
};

export const isWsolInfoInvalid = (wsolAtaAccountInfo: any): boolean => {
  const res =
    wsolAtaAccountInfo === null ||
    (wsolAtaAccountInfo !== null &&
      wsolAtaAccountInfo.data.length === 0 &&
      wsolAtaAccountInfo.owner.eq(PublicKey.default));

  return res;
};
